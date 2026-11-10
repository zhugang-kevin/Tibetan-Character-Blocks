#!/usr/bin/env node
/**
 * scripts/playthrough-record.js — 真·浏览器录屏：把"打游戏 + 所有功能"的整个过程录成视频
 *
 * 通关循环逻辑 100% 复用已验证的 playthrough-all.js（那版真实点完 10 关、揭图全部加载成功），
 * 本脚本只在其外层包上：Chrome 录屏(recordVideo) + 每关 board/result 截图 + 功能巡览截图。
 *
 * 依赖：playwright-core（NODE_PATH 注入）+ 系统 Chrome。用法：node scripts/playthrough-record.js
 */
'use strict';

var path = require('path');
var fs = require('fs');
var cp = require('child_process');
var pw = require('playwright-core');

var ROOT = path.resolve(__dirname, '..');
var URL_PLAY = 'file:///' + ROOT.replace(/\\/g, '/') + '/preview/play.html?debug=1';
var REC_DIR = path.join(ROOT, '.workbuddy', 'tmp', 'rec');
var SHOT_DIR = path.join(ROOT, '.workbuddy', 'tmp', 'playthrough');

if (!fs.existsSync(REC_DIR)) fs.mkdirSync(REC_DIR, { recursive: true });
if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

(async function main() {
  var browser = await pw.chromium.launch({ channel: 'chrome', headless: true });
  var context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    recordVideo: { dir: REC_DIR, size: { width: 390, height: 844 } }
  });
  var page = await context.newPage();
  var consoleErrors = [];
  page.on('console', function (m) { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', function (e) { consoleErrors.push('pageerror: ' + e.message); });

  console.log('\n=== 打开体验版镜像（开始录屏）===');
  await page.goto(URL_PLAY, { waitUntil: 'load' });
  await page.waitForTimeout(900);
  await page.evaluate(function () {
    localStorage.clear();
    try { setOnboardDone(); } catch (e) {}
    window.__pick = function () {
      var b = state.board; if (!b || !b.cells) return null;
      var cs = b.cells, cols = b.cols, blocked = [];
      cs.forEach(function (t, i) { if (t && obsBlocked(t)) blocked.push(i); });
      var by = {};
      cs.forEach(function (t, i) {
        if (!t || obsBlocked(t) || t.state === 'removing' || t.state === 'removed') return;
        (by[t.id] = by[t.id] || []).push(i);
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
  });

  var results = [];
  for (var lv = 1; lv <= 10; lv++) {
    console.log('\n=== 第 ' + lv + ' 关：真实点击 ===');
    await page.evaluate(function (l) { startLevel(l); }, lv);
    await page.waitForTimeout(700);
    await page.evaluate(function () {
      var gm = document.getElementById('guide-mask');
      if (gm) gm.classList.remove('show');
    });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(SHOT_DIR, 'REC-L' + lv + '-board.png') });

    var t0 = Date.now();
    var moves = 0, deadlock = false, clickMiss = 0, occluded = 0, guard = 0;
    var cardCoverPct = 0, cardSeen = 0;
    var lastMatched = 0;

    while (guard++ < 300) {
      var cur = await page.evaluate(function () {
        var active = document.querySelector('.screen.active');
        return { screen: active ? active.id : '', matched: state.matchedCount, locked: !!state.locked };
      });
      if (cur.screen === 'screen-result') break;

      await page.evaluate(function () { return window.__stable(); });

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
        await page.waitForTimeout(380);
        await page.evaluate(function () { return window.__stable(); });
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
        var entered = false;
        for (var q = 0; q < 40; q++) {
          await page.waitForTimeout(100);
          var sc = await page.evaluate(function () { var a = document.querySelector('.screen.active'); return a ? a.id : ''; });
          if (sc === 'screen-result') { entered = true; break; }
        }
        if (!entered) deadlock = true;
        break;
      }

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
      if (occl.length) { occluded += occl.length; }

      await page.mouse.click(pts[0].x, pts[0].y);
      await page.waitForTimeout(120);
      await page.mouse.click(pts[1].x, pts[1].y);
      moves++;

      var settled = false;
      await page.waitForTimeout(260);
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
        var again = await page.evaluate(function () { return state.matchedCount; });
        if (again === lastMatched) clickMiss++;
        if (clickMiss > 6) break;
      }
    }

    var cost = Date.now() - t0;
    await page.waitForTimeout(1900);
    await page.screenshot({ path: path.join(SHOT_DIR, 'REC-L' + lv + '-result.png') });
    var rv = await page.evaluate(function () {
      var card = document.querySelector('#res-reveal');
      var img = card ? card.querySelector('.reveal-art') : null;
      var name = card ? (card.querySelector('.reveal-name') || {}).textContent : '';
      var credit = card ? (card.querySelector('.reveal-credit') || {}).textContent : '';
      return { name: (name || '').trim(), loaded: !!(img && img.naturalWidth > 0), credit: (credit || '').trim() };
    });
    console.log('    → 第 ' + lv + ' 关：' + moves + ' 对 / ' + Math.round(cost / 1000) + 's；揭图「' + rv.name + '」' + (rv.loaded ? '已加载' : '未加载') + (rv.credit ? '；CC:' + rv.credit.slice(0, 30) : ''));
    results.push({ lv: lv, moves: moves, ms: cost, name: rv.name, loaded: rv.loaded });
  }

  // ---------- 功能巡览：逐一打开并截图 ----------
  var tour = [
    { fn: 'showPassport()', name: '护照图鉴', shot: 'FEAT-passport.png' },
    { fn: 'startLearn()', name: '学习线(150课)', shot: 'FEAT-learn.png' },
    { fn: 'showLearnCert()', name: '学习证书', shot: 'FEAT-learncert.png' },
    { fn: 'showGift()', name: '送祝福(D113)', shot: 'FEAT-gift.png' },
    { fn: 'showLampWindow()', name: '万家灯火', shot: 'FEAT-lamp.png' },
    { fn: 'showGenderAsk()', name: '性别+藏名(D54)', shot: 'FEAT-gender.png' },
    { fn: 'showPraise()', name: '语音赞诵', shot: 'FEAT-praise.png' }
  ];
  console.log('\n=== 功能巡览（其余功能逐一打开）===');
  for (var i = 0; i < tour.length; i++) {
    try {
      await page.evaluate(new Function('return ' + tour[i].fn));
      await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(SHOT_DIR, tour[i].shot) });
      console.log('    ✓ ' + tour[i].name + ' 打开并截图');
    } catch (e) {
      console.log('    ✗ ' + tour[i].name + ' 打开失败: ' + e.message.split('\n')[0]);
    }
  }

  console.log('\n=== 关闭浏览器，写出视频 ===');
  await context.close();
  await browser.close();

  var webms = fs.readdirSync(REC_DIR).filter(function (f) { return /\.webm$/.test(f); })
    .map(function (f) { return { f: f, t: fs.statSync(path.join(REC_DIR, f)).mtimeMs }; })
    .sort(function (a, b) { return b.t - a.t; });
  if (!webms.length) { console.log('✗ 未生成视频文件'); process.exit(3); }
  var webm = path.join(REC_DIR, webms[0].f);
  var mp4 = path.join(REC_DIR, 'gameplay-record.mp4');
  console.log('    源: ' + webm);
  try {
    cp.execFileSync('ffmpeg', ['-y', '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], { stdio: 'inherit' });
    console.log('    → mp4: ' + mp4);
  } catch (e) {
    console.log('    ! ffmpeg 转码失败，保留 webm: ' + e.message.split('\n')[0]);
    mp4 = webm;
  }

  console.log('\n=== 控制台报错统计 ===');
  console.log(consoleErrors.length ? consoleErrors.join('\n') : '  0 个 console 报错');
  console.log('REC_DONE');
  process.exit(0);
})().catch(function (e) { console.error('FATAL', e); process.exit(1); });
