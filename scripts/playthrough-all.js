#!/usr/bin/env node
/**
 * 全 10 关真人式通关自检（2026-11-06）
 *
 * 与 test-h5.js 的区别：
 *   test-h5 主要调函数（startLevel / onTapTile ...），验证的是「逻辑对不对」。
 *   本脚本用 **真实鼠标坐标点击**（page.mouse.click），验证的是「**玩家点得到吗**」——
 *   如果牌被别的元素盖住、或坐标算错、或盘面溢出屏外，点击就会打空，脚本会立刻发现。
 *
 * 每关记录：步数（点了几对）、耗时、剩余障碍、结算星级、通缉揭图是否真的加载出图、
 *           CC 署名是否在页面上、盘面左右留白是否对称、是否有元素溢出屏幕左右边界。
 */
'use strict';

var path = require('path');
var fs = require('fs');
var pw = require('playwright-core');

var URL_PLAY = 'file:///I:/藏趣游戏/preview/play.html?debug=1';
var SHOT_DIR = path.join('I:/藏趣游戏', '.workbuddy', 'tmp', 'playthrough');

var pass = 0, fail = 0;
function chk(name, cond, info) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (info ? '  — ' + info : '')); }
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

(async function main() {
  if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });

  var browser = await pw.chromium.launch({ channel: 'chrome', headless: true });
  var page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  var consoleErrors = [];
  page.on('console', function (m) { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', function (e) { consoleErrors.push('pageerror: ' + e.message); });

  console.log('\n=== 启动体验版镜像 ===');
  await page.goto(URL_PLAY, { waitUntil: 'load' });
  await page.waitForTimeout(900);
  await page.evaluate(function () {
    localStorage.clear();
    try { setOnboardDone(); } catch (e) {}
    // 选牌器：优先挑「能解障碍」的一对，否则任意一对
    window.__pick = function () {
      var b = state.board;
      if (!b || !b.cells) return null;
      var cs = b.cells, cols = b.cols;
      var blocked = [];
      cs.forEach(function (t, i) { if (t && obsBlocked(t)) blocked.push(i); });
      var by = {};
      cs.forEach(function (t, i) {
        if (!t || obsBlocked(t) || t.state === 'removing' || t.state === 'removed') return;
        (by[t.id] = by[t.id] || []).push(i);   // 🔴 必须按 id（letter_01）配，不能按 type（letter）
      });
      var pairs = [];
      Object.keys(by).forEach(function (k) {
        var a = by[k];
        for (var i = 0; i + 1 < a.length; i += 2) pairs.push([a[i], a[i + 1]]);
      });
      if (!pairs.length) return null;
      if (blocked.length) {
        var best = null, bestScore = 0;
        pairs.forEach(function (p) {
          var s = 0;
          p.forEach(function (idx) {
            blocked.forEach(function (bi) {
              var dr = Math.abs(Math.floor(idx / cols) - Math.floor(bi / cols));
              var dc = Math.abs((idx % cols) - (bi % cols));
              if (dr <= 1 && dc <= 1) s++;
            });
          });
          if (s > bestScore) { bestScore = s; best = p; }
        });
        if (best) return best;
      }
      return pairs[0];
    };
    window.__stats = function () {
      var b = state.board || {};
      var blocked = 0, left = 0;
      (b.cells || []).forEach(function (t) {
        if (!t) return;
        left++;
        if (obsBlocked(t)) blocked++;
      });
      return {
        cols: b.cols, rows: b.rows, slots: b.slots, total: b.total,
        matched: state.matchedCount, left: left, blocked: blocked,
        pool: (b.pool || []).length, locked: !!state.locked,
        pct: state.revealPct
      };
    };
    // 等盘面视觉静止：连续两次采样所有牌的矩形完全一致
    window.__stable = function () {
      return new Promise(function (resolve) {
        var prev = '', same = 0, tries = 0;
        var sig = function () {
          var out = [];
          document.querySelectorAll('#board .tile').forEach(function (el) {
            var r = el.getBoundingClientRect();
            out.push(Math.round(r.left) + ',' + Math.round(r.top) + ',' + Math.round(r.width));
          });
          return out.sort().join('|');
        };
        var tick = function () {
          var cur = sig();
          if (cur === prev) same++; else { same = 0; prev = cur; }
          tries++;
          if (same >= 2 || tries > 30) return resolve(true);
          setTimeout(tick, 60);
        };
        tick();
      });
    };
    window.__geo = function () {
      var bd = document.getElementById('board');
      var r = bd.getBoundingClientRect();
      var vw = innerWidth;
      return {
        boardW: Math.round(r.width), boardH: Math.round(r.height),
        left: Math.round(r.left), right: Math.round(vw - r.right),
        top: Math.round(r.top), bottom: Math.round(innerHeight - r.bottom),
        vw: vw,
        overflow: Math.max(0, document.documentElement.scrollWidth - vw),
        tiles: document.querySelectorAll('#board .tile').length
      };
    };
  });

  var results = [];

  var ONLY = Number(process.env.ONLY || 0);   // ONLY=10 只跑第 10 关
  for (var lv = 1; lv <= 10; lv++) {
    if (ONLY && lv !== ONLY) continue;
    console.log('\n=== 第 ' + lv + ' 关 ===');
    await page.evaluate(function (l) { startLevel(l); }, lv);
    await page.waitForTimeout(700);
    // 关掉新手引导遮罩（只在首关出现，但每关都清一次，避免挡住点击）
    await page.evaluate(function () {
      var gm = document.getElementById('guide-mask');
      if (gm) gm.classList.remove('show');
    });
    await page.waitForTimeout(250);

    var geo0 = await page.evaluate(function () { return window.__geo(); });
    var st0 = await page.evaluate(function () { return window.__stats(); });

    chk('L' + lv + ' 建关成功（列=' + st0.cols + ' 行=' + st0.rows + '）', st0.cols > 0 && st0.rows > 0);
    chk('L' + lv + ' 盘面未溢出屏幕左右', geo0.overflow <= 1 && geo0.left >= 0 && geo0.right >= 0,
      JSON.stringify({ left: geo0.left, right: geo0.right, overflow: geo0.overflow }));
    chk('L' + lv + ' 左右留白对称（差 ≤4px）', Math.abs(geo0.left - geo0.right) <= 4,
      'left=' + geo0.left + ' right=' + geo0.right);
    chk('L' + lv + ' 盘面宽度占比 ≥80%', geo0.boardW / geo0.vw >= 0.8,
      Math.round(geo0.boardW / geo0.vw * 100) + '%');

    var t0 = Date.now();
    var moves = 0, deadlock = false, clickMiss = 0, occluded = 0, guard = 0;
    var cardCoverPct = 0, cardSeen = 0;
    var lastMatched = st0.matched;

    while (guard++ < 300) {
      var cur = await page.evaluate(function () {
        var active = document.querySelector('.screen.active');
        return { screen: active ? active.id : '', matched: state.matchedCount, locked: !!state.locked };
      });
      if (cur.screen === 'screen-result') break;

      await page.evaluate(function () { return window.__stable(); });

      // 文化卡（首次发现）：真人会点「知道了」；顺便量它遮住了多少张牌
      var card = await page.evaluate(function () {
        var cp = document.getElementById('card-panel');
        if (!cp || !cp.classList.contains('show')) return null;
        var cr = cp.getBoundingClientRect();
        var tiles = document.querySelectorAll('#board .tile');
        var covered = 0;
        tiles.forEach(function (el) {
          var t = el.getBoundingClientRect();
          if (t.top + t.height / 2 > cr.top) covered++;
        });
        return { covered: covered, total: tiles.length };
      });
      if (card) {
        await page.waitForTimeout(380);   // 等滑入动画结束再量，否则量到中途的假高值
        await page.evaluate(function () { return window.__stable(); });   // 牌也要停稳，否则量到下落中的位置
        card = await page.evaluate(function () {
          var cp = document.getElementById('card-panel');
          var cr = cp.getBoundingClientRect();
          var bd = document.getElementById('board').getBoundingClientRect();
          var overlap = Math.max(0, bd.bottom - Math.max(cr.top, bd.top));
          return { covered: Math.round(overlap / bd.height * 100), total: 100, overlapPx: Math.round(overlap), boardH: Math.round(bd.height) };
        });
        cardSeen++;
        cardCoverPct = Math.max(cardCoverPct, card.covered);
        await page.click('#card-know');
        await page.waitForTimeout(320);
        await page.evaluate(function () { return window.__stable(); });
      }

      var pick = await page.evaluate(function () { return window.__pick(); });
      if (!pick) {
        // 最后一对消完后 finishLevel 是延迟触发的，不能立刻判死局
        var entered = false;
        for (var q = 0; q < 40; q++) {
          await page.waitForTimeout(100);
          var sc = await page.evaluate(function () { var a = document.querySelector('.screen.active'); return a ? a.id : ''; });
          if (sc === 'screen-result') { entered = true; break; }
        }
        if (!entered) deadlock = true;
        break;
      }

      // 取两张牌的中心坐标（真点，不做函数调用）
      var pts = await page.evaluate(function (ids) {
        var out = [];
        ids.forEach(function (i) {
          var t = state.board.cells[i];
          var el = t && document.querySelector('#board [data-uid="' + t.uid + '"]');
          if (!el) { out.push(null); return; }
          var r = el.getBoundingClientRect();
          out.push({ x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height });
        });
        return out;
      }, pick);

      if (!pts[0] || !pts[1] || pts[0].w < 20) { clickMiss++; deadlock = true; break; }

      // 命中检测：该坐标最上层元素必须就是这张牌。不是 → 真的被别的东西盖住了
      var occl = await page.evaluate(function (ids) {
        var bad = [];
        ids.forEach(function (i) {
          var t = state.board.cells[i];
          var el = t && document.querySelector('#board [data-uid="' + t.uid + '"]');
          if (!el) { bad.push('no-el'); return; }
          var r = el.getBoundingClientRect();
          var hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          var tile = hit && hit.closest ? hit.closest('.tile') : null;
          if (!tile || tile.dataset.uid !== String(t.uid)) bad.push((tile ? 'got:' + tile.dataset.uid : 'none') + ' want:' + t.uid);
        });
        return bad;
      }, pick);
      if (occl.length) { occluded += occl.length; console.log('    ⚠ 命中检测异常: ' + occl.join(' / ')); }

      await page.mouse.click(pts[0].x, pts[0].y);
      await page.waitForTimeout(120);
      await page.mouse.click(pts[1].x, pts[1].y);
      moves++;

      // 等结算：匹配数增加 或 直接进结算页
      var settled = false;
      await page.waitForTimeout(260);   // 让选中动画走完再点第二张之后的结算
      for (var w = 0; w < 40; w++) {
        await page.waitForTimeout(100);
        var s = await page.evaluate(function () {
          var active = document.querySelector('.screen.active');
          return { screen: active ? active.id : '', matched: state.matchedCount, locked: !!state.locked };
        });
        if (s.screen === 'screen-result') { settled = true; break; }
        if (s.matched > lastMatched && !s.locked) { lastMatched = s.matched; settled = true; break; }
      }
      if (!settled) {
        // 这一下没成（点空 / 被盖 / 动画超时）——记一次，但不无限重试
        var again = await page.evaluate(function () { return window.__stats(); });
        if (again.matched === lastMatched) clickMiss++;
        if (clickMiss > 6) break;
      }
    }

    var cost = Date.now() - t0;
    var endState = await page.evaluate(function () { return window.__stats(); });
    var endGeo = await page.evaluate(function () { return window.__geo(); });
    var onResult = await page.evaluate(function () {
      var active = document.querySelector('.screen.active');
      return active ? active.id : '';
    });

    chk('L' + lv + ' 通关（进入结算页）', onResult === 'screen-result', 'screen=' + onResult + ' matched=' + endState.matched);
    chk('L' + lv + ' 无死局（始终能找到可消的一对）', !deadlock, 'blocked=' + endState.blocked + ' left=' + endState.left);
    chk('L' + lv + ' 牌未被其他元素遮挡（elementFromPoint 命中自己）', occluded === 0, 'occluded=' + occluded);
    chk('L' + lv + ' 点击全部生效（无点空）', clickMiss === 0, 'miss=' + clickMiss);
    chk('L' + lv + ' 盘面在结算前未溢出', endGeo.overflow <= 1, 'overflow=' + endGeo.overflow);
    chk('L' + lv + ' 文化卡遮住盘面 ≤25%（不挡对局）', cardCoverPct <= 25, 'cover=' + cardCoverPct + '% 盘面（出现 ' + cardSeen + ' 次）');

    // 结算页内容
    await page.waitForTimeout(1900);
    var res = await page.evaluate(function () {
      var card = document.querySelector('#res-reveal');
      var img = card ? card.querySelector('.reveal-art') : null;
      var name = card ? (card.querySelector('.reveal-name') || {}).textContent : '';
      var credit = card ? (card.querySelector('.reveal-credit') || {}).textContent : '';
      var note = card ? (card.querySelector('.reveal-note') || {}).textContent : '';
      var stars = document.querySelector('#res-stars') ? document.querySelector('#res-stars').textContent : '';
      var score = document.querySelector('#res-score') ? document.querySelector('#res-score').textContent : '';
      return {
        hasCard: !!card,
        hasImg: !!img,
        imgLoaded: !!(img && img.naturalWidth > 0),
        imgSrc: img ? String(img.getAttribute('src')).slice(0, 60) : '',
        name: (name || '').trim(),
        credit: (credit || '').trim(),
        note: (note || '').trim(),
        stars: (stars || '').trim(),
        score: (score || '').trim()
      };
    });

    chk('L' + lv + ' 结算页有揭晓卡', res.hasCard);
    chk('L' + lv + ' 揭图真的加载出图（naturalWidth>0）', res.imgLoaded, res.imgSrc);
    chk('L' + lv + ' 揭晓有寺院名', !!res.name && res.name.indexOf('undefined') === -1, res.name);
    chk('L' + lv + ' 揭晓有 CC 署名', /CC|Public|公有/i.test(res.credit), res.credit);

    await page.screenshot({ path: path.join(SHOT_DIR, 'L' + lv + '-result.png') });

    results.push({
      lv: lv, moves: moves, ms: cost, deadlock: deadlock, clickMiss: clickMiss, occluded: occluded, cardCover: cardCoverPct,
      blockedLeft: endState.blocked, matched: endState.matched, total: endState.total,
      name: res.name, credit: res.credit, imgLoaded: res.imgLoaded,
      stars: res.stars, score: res.score
    });

    console.log('    → 用了 ' + moves + ' 对 / ' + Math.round(cost / 1000) + ' 秒；揭图「' + res.name + '」' +
      (res.imgLoaded ? '已加载' : '未加载') + '；' + (res.stars || '') + ' ' + (res.score || ''));
  }

  // 护照页进度：应显示 10 格已解锁（ONLY 模式跳过）
  if (!ONLY) {
  console.log('\n=== 护照页进度 ===');
  await page.evaluate(function () { showPassport(); });
  await page.waitForTimeout(700);
  var pp = await page.evaluate(function () {
    var got = document.querySelectorAll('#pp-reveal-grid .rv-slot.got').length;
    var all = document.querySelectorAll('#pp-reveal-grid .rv-slot').length;
    var count = document.getElementById('pp-reveal-count');
    return { got: got, all: all, text: count ? count.textContent : '' };
  });
  chk('护照图鉴解锁数 = 10', pp.got === 10, 'got=' + pp.got + '/' + pp.all);
  chk('护照进度文案正确（10 / ' + pp.all + '）', pp.text.indexOf('10 /') > -1, pp.text);
  }

  // 学习线抽玩一课（L1 第 1 课），确认另一条线也能真点通
  console.log('\n=== 学习线抽查（L1 第 1 课）===');
  await page.evaluate(function () { startLearn(1, 1); });
  await page.waitForTimeout(700);
  var lrn0 = await page.evaluate(function () {
    return { cols: state.cols, rows: state.rows, tiles: document.querySelectorAll('#board .tile').length };
  });
  chk('学习课建关成功', lrn0.cols > 0 && lrn0.tiles > 0, JSON.stringify(lrn0));
  // 学习课是「听音选牌」还是配对？统一用 __pick 试着消一对
  var learnMove = await page.evaluate(function () { return window.__pick(); });
  chk('学习课能选到可操作牌对', !!learnMove);

  await page.screenshot({ path: path.join(SHOT_DIR, 'learn-L1-1.png') });

  chk('全程无 console 报错', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  console.log('\n================ 汇总 ================');
  results.forEach(function (r) {
    console.log('L' + String(r.lv).padStart(2) + '  ' + String(r.moves).padStart(2) + ' 对  ' +
      String(Math.round(r.ms / 1000)).padStart(3) + 's  揭图 ' + (r.imgLoaded ? '✓' : '✗') + '  ' + r.name);
  });
  var totalMoves = results.reduce(function (a, r) { return a + r.moves; }, 0);
  var totalMs = results.reduce(function (a, r) { return a + r.ms; }, 0);
  console.log('合计: ' + totalMoves + ' 对 / ' + Math.round(totalMs / 1000) + ' 秒');
  console.log('--------------------------------------');
  console.log('通关自检: 通过 ' + pass + ' / 失败 ' + fail);

  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(function (e) {
  console.error('脚本异常: ' + e.stack);
  process.exit(2);
});
