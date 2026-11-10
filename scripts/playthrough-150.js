#!/usr/bin/env node
/**
 * scripts/playthrough-150.js — 真·浏览器把「学习线 150 课」一节一节打穿并录屏
 *
 * 复用已验证的 playthrough-record.js 的真实鼠标点击循环（用真实坐标点牌、元素遮挡检测），
 * 只是把外层从「老线 10 关」换成「学习线 15 级 × 10 课 = 150 课」：
 *   每课 startLearn(lv, stage) → 真实点击配对 → 打到结算页（#screen-result 出现）→ 下一课。
 *
 * 产出：
 *   ① REC_DIR/gameplay-150.mp4  （连续录屏，4x 加速，可看全程）
 *   ② SHOT_DIR/REC-L{lv}-{st}-win.png  （150 张「第N课完成」结算截图，逐课硬证据）
 *   ③ progress JSON（每课 moves/ms/status，支持中途被杀后续跑）
 *
 * 依赖：playwright-core（NODE_PATH 注入）+ 系统 Chrome。用法：node scripts/playthrough-150.js
 */
'use strict';

var path = require('path');
var fs = require('fs');
var cp = require('child_process');
var pw = require('playwright-core');

var ROOT = path.resolve(__dirname, '..');
var URL_BASE = 'file:///' + ROOT.replace(/\\/g, '/') + '/preview/play.html?debug=1';
var REC_DIR = path.join(ROOT, '.workbuddy', 'tmp', 'rec');
var SHOT_DIR = path.join(ROOT, '.workbuddy', 'tmp', 'playthrough');
var PROGRESS = path.join(ROOT, '.workbuddy', 'tmp', 'play150-progress.json');

if (!fs.existsSync(REC_DIR)) fs.mkdirSync(REC_DIR, { recursive: true });
if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// 已完成的课（支持续跑）
var done = {};
try { (JSON.parse(fs.readFileSync(PROGRESS, 'utf8')) || []).forEach(function (d) { done[d.lv + '-' + d.st] = d; }); } catch (e) {}
function saveProgress(arr) { fs.writeFileSync(PROGRESS, JSON.stringify(arr, null, 0)); }
var progress = Object.keys(done).map(function (k) { return done[k]; });

var LV_N = 15, ST_N = 10;

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

  console.log('\n=== 打开体验版镜像（开始录屏 150 课）===');
  await page.goto(URL_BASE, { waitUntil: 'load' });
  await page.waitForTimeout(900);
  await page.evaluate(function () {
    try { localStorage.clear(); } catch (e) {}
    try { setOnboardDone(); } catch (e) {}
    window.__pick = function () {
      var b = state.board; if (!b || !b.cells) return null;
      var cs = b.cells, cols = state.cols, blocked = [];
      cs.forEach(function (t, i) { if (t && typeof obsBlocked === 'function' && obsBlocked(t)) blocked.push(i); });
      var by = {};
      cs.forEach(function (t, i) {
        if (!t || (typeof obsBlocked === 'function' && obsBlocked(t)) || t.state === 'removing' || t.state === 'removed') return;
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
    window.__dismissGuide = function () {
      var gm = document.getElementById('guide-mask');
      if (gm) gm.classList.remove('show');
    };
  });

  var total = 0, completed = 0, failed = 0;
  var tBegin = Date.now();

  for (var lv = 1; lv <= LV_N; lv++) {
    for (var st = 1; st <= ST_N; st++) {
      var key = lv + '-' + st;
      if (done[key]) { console.log('  (跳过已完成的 L' + lv + '-' + st + ')'); continue; }
      total++;

      var entry = { lv: lv, st: st, status: 'pending' };
      console.log('\n=== L' + lv + '-' + st + '（第 ' + ((lv - 1) * 10 + st) + '/150 课）：真实点击 ===');
      await page.evaluate(function (args) {
        try { showScreen('game'); } catch (e) {}
        window.__dismissGuide();
        startLearn(args.l, args.s);
      }, { l: lv, s: st });
      await page.waitForTimeout(450);
      await page.evaluate(function () { window.__dismissGuide(); });
      await page.waitForTimeout(200);

      var t0 = Date.now();
      var moves = 0, deadlock = false, clickMiss = 0, occluded = 0, guard = 0;
      var lastMatched = 0;
      var cardSeen = 0, cardCoverPct = 0;

      while (guard++ < 200) {
        var cur = await page.evaluate(function () {
          var active = document.querySelector('.screen.active');
          return { screen: active ? active.id : '', matched: state.matchedCount, locked: !!state.locked };
        });
        if (cur.screen === 'screen-result') break;

        await page.evaluate(function () { return window.__stable(); });

        // 文化卡（每课最多一张）
        var card = await page.evaluate(function () {
          var cp = document.getElementById('card-panel');
          if (!cp || !cp.classList.contains('show')) return null;
          var bd = document.getElementById('board').getBoundingClientRect();
          var cr = cp.getBoundingClientRect();
          var overlap = Math.max(0, bd.bottom - Math.max(cr.top, bd.top));
          return { covered: Math.round(overlap / bd.height * 100) };
        });
        if (card) {
          cardSeen++;
          cardCoverPct = Math.max(cardCoverPct, card.covered);
          await page.waitForTimeout(320);
          await page.evaluate(function () { return window.__stable(); });
          await page.click('#card-know').catch(function () {});
          await page.waitForTimeout(280);
          await page.evaluate(function () { return window.__stable(); });
        }

        var pick = await page.evaluate(function () { return window.__pick(); });
        if (!pick) {
          // 没可配对了：等结算页（通关后延迟 ~1.2s 才切）
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
        if (occl.length) occluded += occl.length;

        await page.mouse.click(pts[0].x, pts[0].y);
        await page.waitForTimeout(80);
        await page.mouse.click(pts[1].x, pts[1].y);
        moves++;

        var settled = false;
        await page.waitForTimeout(180);
        for (var w = 0; w < 30; w++) {
          await page.waitForTimeout(80);
          var s = await page.evaluate(function () {
            var active = document.querySelector('.screen.active');
            return { screen: active ? active.id : '', matched: state.matchedCount, locked: !!state.locked };
          });
          if (s.screen === 'screen-result') { settled = true; break; }
          if (s.matched > lastMatched && !s.locked) { lastMatched = s.matched; settled = true; break; }
        }
        if (!settled) { var again = await page.evaluate(function () { return state.matchedCount; }); if (again === lastMatched) clickMiss++; if (clickMiss > 6) break; }
      }

      // 确认进入结算页
      var onResult = await page.evaluate(function () {
        var a = document.querySelector('.screen.active');
        return a && a.id === 'screen-result';
      });
      if (!onResult && !deadlock) {
        // 再等一下（延迟切屏）
        for (var r2 = 0; r2 < 20 && !onResult; r2++) {
          await page.waitForTimeout(150);
          onResult = await page.evaluate(function () { var a = document.querySelector('.screen.active'); return a && a.id === 'screen-result'; });
        }
      }

      var cost = Date.now() - t0;
      await page.waitForTimeout(900);

      var rv = await page.evaluate(function () {
        var title = (document.getElementById('res-title') || {}).textContent || '';
        var sub = (document.getElementById('res-sub') || {}).textContent || '';
        return { title: title.trim(), sub: sub.trim() };
      });

      if (onResult) {
        await page.screenshot({ path: path.join(SHOT_DIR, 'REC-L' + lv + '-' + st + '-win.png') });
        entry.status = 'ok'; entry.moves = moves; entry.ms = cost; entry.title = rv.title;
        completed++;
        console.log('    ✓ L' + lv + '-' + st + '：' + moves + ' 对 / ' + Math.round(cost / 1000) + 's；「' + rv.title + '」');
      } else {
        entry.status = 'FAIL'; entry.moves = moves; entry.ms = cost; entry.reason = deadlock ? 'deadlock/未进入结算页' : '未进入结算页';
        failed++;
        console.log('    ✗ L' + lv + '-' + st + '：未完成（moves=' + moves + '，reason=' + entry.reason + '）');
        // 重试一次
        console.log('    → 重试 L' + lv + '-' + st + ' ...');
        await page.evaluate(function (args) { try { showScreen('game'); } catch (e) {} window.__dismissGuide(); startLearn(args.l, args.s); }, { l: lv, s: st });
        await page.waitForTimeout(600);
        // 简单重试：再走一遍同样循环（guard 上限低些）
        var r2moves = 0, r2ok = false, g2 = 0;
        while (g2++ < 200) {
          var c2 = await page.evaluate(function () { var a = document.querySelector('.screen.active'); return a ? a.id : ''; });
          if (c2 === 'screen-result') { r2ok = true; break; }
          await page.evaluate(function () { return window.__stable(); });
          var p2 = await page.evaluate(function () { return window.__pick(); });
          if (!p2) { for (var q = 0; q < 30; q++) { await page.waitForTimeout(100); var sc = await page.evaluate(function () { var a = document.querySelector('.screen.active'); return a ? a.id : ''; }); if (sc === 'screen-result') { r2ok = true; break; } } break; }
          var p2pts = await page.evaluate(function (ids) { var out = []; ids.forEach(function (i) { var t = state.board.cells[i]; var el = t && document.querySelector('#board [data-uid="' + t.uid + '"]'); if (!el) { out.push(null); return; } var r = el.getBoundingClientRect(); out.push({ x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }); }); return out; }, p2);
          if (!p2pts[0] || !p2pts[1] || p2pts[0].w < 20) break;
          await page.mouse.click(p2pts[0].x, p2pts[0].y); await page.waitForTimeout(80); await page.mouse.click(p2pts[1].x, p2pts[1].y); r2moves++;
          await page.waitForTimeout(220);
        }
        if (r2ok) {
          await page.waitForTimeout(900);
          await page.screenshot({ path: path.join(SHOT_DIR, 'REC-L' + lv + '-' + st + '-win.png') });
          entry.status = 'ok(retry)'; entry.moves = r2moves; entry.title = (await page.evaluate(function () { return ((document.getElementById('res-title') || {}).textContent || '').trim(); }));
          completed++; failed--;
          console.log('    ✓ 重试成功 L' + lv + '-' + st + '：' + r2moves + ' 对');
        }
      }

      done[key] = entry;
      progress.push(entry);
      saveProgress(progress);
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
  var mp4 = path.join(REC_DIR, 'gameplay-150.mp4');
  console.log('    源: ' + webm);
  try {
    cp.execFileSync('ffmpeg', ['-y', '-i', webm, '-vf', 'setpts=0.25*PTS', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '26', '-movflags', '+faststart', mp4], { stdio: 'inherit' });
    console.log('    → mp4(4x): ' + mp4);
  } catch (e) {
    console.log('    ! ffmpeg 转码失败，保留 webm: ' + e.message.split('\n')[0]);
    mp4 = webm;
  }

  console.log('\n=== 150 课通关结果 ===');
  console.log('  尝试: ' + total + ' 课');
  console.log('  完成: ' + completed + ' 课');
  console.log('  失败: ' + failed + ' 课');
  console.log('  总耗时: ' + Math.round((Date.now() - tBegin) / 1000) + 's');
  console.log('  控制台报错: ' + (consoleErrors.length ? consoleErrors.length + ' 条' : '0 条'));
  if (consoleErrors.length) consoleErrors.slice(0, 10).forEach(function (e) { console.log('    - ' + e.slice(0, 160)); });
  console.log('PLAY150_DONE');
  process.exit(0);
})().catch(function (e) { console.error('FATAL', e); process.exit(1); });
