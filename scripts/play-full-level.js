#!/usr/bin/env node
/**
 * scripts/play-full-level.js — 用 jsdom **真的打完一整关**（不是断言，是跑完）
 *
 * 目的：回答两个只有"打到底"才能回答的问题
 *   ① 15 组（30 张）能不能全部消完 —— 盘面 25 格 + 补池 5 张，池会耗尽
 *   ② 消完之后**能不能正常结算**（能不能进结算页、会不会卡死）
 *
 * 为什么不用浏览器点：需要 30 次点击且要自己找配对，容易中途错点；
 *   jsdom 能直接读盘面、按 id 找配对，把"打完整局"变成可重复的脚本。
 *
 * 注意：这是**脚本跑通**，不等于**有人玩得好**。手感、节奏、视觉仍需真人。
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { JSDOM } = require('jsdom');

const HTML = path.join(__dirname, '..', 'preview', 'play.html');
const MAX_MS = 120000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async function main() {
  const html = fs.readFileSync(HTML, 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/play.html',
    // ⚠️ 不能静音：之前用空 VirtualConsole，页面抛错也看不到，只表现为「读到 0 张牌」。
    //    为此白查了三轮，错误必须打出来。
    virtualConsole: (function () {
      var vc = new (require('jsdom').VirtualConsole)();
      ['jsdomError', 'error', 'warn'].forEach(function (ev) {
        vc.on(ev, function () {
          var a = Array.prototype.slice.call(arguments).map(function (x) { return (x && x.stack) || String(x); });
          console.log('  [page] ' + ev + ': ' + a.join(' ').slice(0, 300));
        });
      });
      return vc;
    })(),
    // ⚠️ canvas 桩必须在这里：页面**在脚本加载时**就缓存了 measure context，
    //    等 load 之后再替换 prototype 已经晚了（实测仍报 setting 'font' of null）。
    beforeParse: function (win) {
      win.HTMLCanvasElement.prototype.getContext = function () {
        return {
          font: '10px sans-serif', fillStyle: '', strokeStyle: '', lineWidth: 1,
          measureText: function (t) { return { width: String(t || '').length * 6 }; },
          fillText: function () {}, strokeText: function () {},
          clearRect: function () {}, fillRect: function () {}, strokeRect: function () {},
          beginPath: function () {}, closePath: function () {},
          moveTo: function () {}, lineTo: function () {}, arc: function () {},
          save: function () {}, restore: function () {}, translate: function () {},
          scale: function () {}, rotate: function () {}, drawImage: function () {}
        };
      };
    }
  });
  const w = dom.window;

  await new Promise(resolve => {
    if (w.document.readyState === 'complete') return resolve();
    w.addEventListener('load', resolve);
  });
  await sleep(300);


  console.log('');
  console.log('==========================================');
  console.log('  真打一整关（jsdom 驱动）');
  console.log('==========================================');

  // 进第 1 关
  if (typeof w.startLevel !== 'function') {
    console.log('  ✗ 页面没有暴露 startLevel，无法驱动');
    process.exit(1);
  }
  w.startLevel(1);
  // ⚠️ 等够时间：startLevel 之后还要 renderBoard + 教程层，
  //    只等 200ms 会读到 0 张牌（实测）。这里等到盘面真的有牌为止。
  for (let k = 0; k < 40; k++) {
    await sleep(100);
    if (w.document.querySelectorAll('#board > div[data-uid]').length > 0) break;
  }
  await sleep(300);

  // state 是页面闭包里的变量，外部取不到 —— 改为从 DOM 读牌面（.tile[data-id]）
  function tiles() {
    // 牌元素是 #board 下的 div[data-uid]，**没有 class**（data-id 在子元素里）
    return Array.prototype.slice.call(w.document.querySelectorAll('#board > div[data-uid]'));
  }
  function hudText() {
    var el = w.document.querySelector('.status-pairs');
    return el ? String(el.textContent || '').trim() : '';
  }
  function parseHud(t) {
    var m = /(\d+)\s*\/\s*(\d+)/.exec(t);
    return m ? { matched: parseInt(m[1], 10), total: parseInt(m[2], 10) } : { matched: 0, total: 0 };
  }

  const t0 = Date.now();
  let guard = 0;
  let finished = false;

  while (guard++ < 400) {
    if (Date.now() - t0 > MAX_MS) { console.log('  ✗ 超时'); break; }

    const ts = tiles();
    const h = parseHud(hudText());
    if (h.total > 0 && h.matched >= h.total) { finished = true; break; }

    // 按 data-id 找一对
    const seen = {};
    let pair = null;
    for (let i = 0; i < ts.length; i++) {
      const idEl = ts[i].querySelector('[data-id]');
      const id = (idEl && idEl.getAttribute('data-id')) || ts[i].getAttribute('data-id') || '';
      if (!id) continue;
      if (seen[id] !== undefined) { pair = [seen[id], i]; break; }
      seen[id] = i;
    }
    if (!pair) break;                    // 盘面无配对 → 卡住

    ts[pair[0]].click();
    ts[pair[1]].click();

    // 等下落/补充收尾
    for (let k = 0; k < 30; k++) {
      await sleep(50);
      if (ts[pair[0]].classList.contains('removing') === false &&
          ts[pair[1]].classList.contains('removing') === false) break;
    }
    await sleep(120);
  }

  const fin = parseHud(hudText());
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const scoreEl = w.document.querySelector('.status-score');
  const scoreTxt = scoreEl ? String(scoreEl.textContent || '').trim() : '';

  console.log('  最终状态：' + hudText() + '，' + scoreTxt);
  console.log('  用时 ' + elapsed + ' 秒，循环 ' + guard + ' 次');

  let bad = 0;
  if (!finished) {
    console.log('  ✗ **卡住**：盘面上找不到可配对的牌，停在 ' + fin.matched + '/' + fin.total + ' 组');
    console.log('    → 这就是"补池耗尽后无法继续"的证据');
    bad++;
  } else if (fin.total > 0 && fin.matched >= fin.total) {
    console.log('  ✓ 全部 ' + fin.total + ' 组消完，没有卡住');
  } else {
    console.log('  ✗ 未完成，但也没判定为卡住（需要看具体盘面）');
    bad++;
  }

  // 结算：看页面是否切到了结算态
  const resultVisible = !!w.document.getElementById('result-mask') ||
    (w.document.body.className || '').indexOf('result') > -1 ||
    (w.document.querySelector('.result-panel') !== null);
  console.log('  结算界面出现：' + (resultVisible ? '是' : '否'));

  console.log(bad ? '  ✗ 整局跑不通 —— 这条比任何单测都重要' : '  ✓ 整局可以打完');
  console.log('==========================================');
  process.exit(bad ? 1 : 0);
})().catch(e => {
  console.error('✗ 运行失败：' + (e && e.stack || e));
  process.exit(1);
});
