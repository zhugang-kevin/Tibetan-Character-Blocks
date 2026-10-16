#!/usr/bin/env node
/**
 * scripts/test-game-journey.js — 「游戏全程」端到端旅程验证
 *
 * 目的（用户 2026-10-16）：
 *   「这个游戏必须是完整、完善、完美的，后期其他的修改不能够影响**游戏的全程**、
 *     全部完善、完美的体验。」
 *
 *   关卡本身已由 test-all-150.js（逐关打通）+ test-level-guard.js（指纹/隔离）看住；
 *   本脚本看的是**玩家从头到尾走一遍会不会卡住** —— 也就是「全程」：
 *     冷启动 → 老线 10 关能进能出 → 衔接学习线 → 15 级都能进 → 打一盘能结算
 *     → 十课集齐能拿证书 → 证书/护照屏能打开 → 每个屏都能回家
 *   任何一环断了（入口点不进去、打完没有出口、屏是空白的），玩家体验就断了。
 *
 * 与 test-h5.js 的分工：
 *   test-h5.js      逐项契约（弹窗 / 背景 / 牌面 / 朗读 / 统计…）——**广度**
 *   test-game-journey.js  玩家走一遍的**路径**是否通畅 —— **连贯性**
 *
 * 需要：jsdom
 * 用法：node scripts/test-game-journey.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

let JSDOM;
try {
  JSDOM = require('jsdom').JSDOM;
} catch (e) {
  console.error('✗ 未找到 jsdom。请先安装：');
  console.error('  cd C:/Users/zhuga/.workbuddy/binaries/node/workspace && npm install jsdom');
  process.exit(2);
}

const ROOT = path.resolve(__dirname, '..');
const HTML = path.join(ROOT, 'preview', 'play.html');
if (!fs.existsSync(HTML)) {
  console.error('✗ 未找到 preview/play.html，请先运行 node scripts/build-h5.js');
  process.exit(1);
}

let PASS = 0, FAIL = 0;
const fails = [];
function check(name, cond, detail) {
  if (cond) PASS++;
  else { FAIL++; fails.push(name + (detail ? '：' + detail : '')); }
}
const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

function mockCtx(sink) {
  const noop = function () {};
  return {
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '', lineJoin: '',
    textAlign: '', textBaseline: '', globalAlpha: 1,
    beginPath: noop, moveTo: noop, lineTo: noop, arcTo: noop, arc: noop, closePath: noop,
    stroke: noop, fill: noop, fillRect: noop, strokeRect: noop, clearRect: noop,
    fillText: function (t) { if (sink) sink.push(String(t)); },
    strokeText: noop, save: noop, restore: noop, translate: noop,
    rotate: noop, scale: noop, quadraticCurveTo: noop, bezierCurveTo: noop,
    setLineDash: noop, drawImage: noop, putImageData: noop,
    measureText: function (s) { return { width: String(s).length * 10 }; },
    createLinearGradient: function () { return { addColorStop: noop }; },
    getImageData: function (x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; }
  };
}

(async function main() {
  const errors = [];
  const dom = new JSDOM(fs.readFileSync(HTML, 'utf8'), {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/play.html',
    beforeParse: function (window) {
      window.__texts = [];
      window.HTMLCanvasElement.prototype.getContext = function () { return mockCtx(window.__texts); };
      window.HTMLCanvasElement.prototype.toDataURL = function () { return 'data:image/png;base64,STUB'; };
      window.confirm = function () { return true; };
      window.scrollTo = function () {};
      window.Audio = function () {
        return { play: function () { return { catch: function () {} }; }, pause: function () {} };
      };
      Object.defineProperty(window.Element.prototype, 'clientWidth', {
        configurable: true, get: function () { return 390; }
      });
      window.addEventListener('error', function (e) {
        errors.push(String((e && e.error && e.error.stack) || (e && e.message) || e));
      });
    }
  });

  const win = dom.window;
  const doc = win.document;
  const ev = function (code) { return win.eval(code); };
  const $ = function (sel) { return doc.querySelector(sel); };
  const $$ = function (sel) { return Array.prototype.slice.call(doc.querySelectorAll(sel)); };
  const activeScreen = function () {
    const s = $$('.screen').filter(function (n) { return n.classList.contains('active'); })[0];
    return s ? s.id : null;
  };
  const showScreen = function (id) { return ev('showScreen(' + JSON.stringify(id) + ')'); };
  const reset = function () { ev('clearProgress(); renderHome();'); };

  console.log('');
  console.log('==========================================');
  console.log('  游戏全程 · 端到端旅程验证');
  console.log('==========================================');

  await sleep(260);

  /* ---------- ① 冷启动：首页必须一次给全 ---------- */
  reset();
  await sleep(150);
  check('① 冷启动落在首页', activeScreen() === 'screen-home', String(activeScreen()));
  const rungs = $$('#level-grid .level-btn');
  check('① 首页天梯有 10 节', rungs.length === 10, '实际 ' + rungs.length);
  const cells150 = $$('#al-grid .al-cell');
  check('① 首页 150 课全景图有 150 格', cells150.length === 150, '实际 ' + cells150.length);
  check('① 首页写明「全部课程 · 150 课」',
    ($('#home-alllevels') || {}).textContent.indexOf('150 课') > -1);
  check('① 首页有进关卡的入口（点天梯第 1 节能进）', !!rungs[0], '第 1 节节点缺失');

  /* ---------- ② 老线 10 关：逐关「进得去、回得来」 ---------- */
  // 先钉住「零进度只有第 1 节可点」—— 那是**刻意的**解锁规则（不是缺陷），
  // 一起写进旅程判据，免得以后有人把锁定当成 bug 拆掉、或反过来把解锁写成全开。
  reset();
  await sleep(90);
  const lockedAtZero = $$('#level-grid .level-btn').filter(function (b) {
    return b.classList.contains('locked');
  }).length;
  check('② 零进度时天梯 10 节里只有第 1 节可点（其余 9 节明确锁着）', lockedAtZero === 9,
    '锁住 ' + lockedAtZero + ' 节');

  const oldEnterFail = [];
  for (let n = 1; n <= 10; n++) {
    // 模拟「已推进到第 n 关」的玩家（真实旅程里就是这样一关关过来的）
    ev('(function(){var p=getProgress();p.unlockedLevel=' + n + ';saveProgress(p);})()');
    ev('renderHome()');
    await sleep(70);
    const el = $$('#level-grid .level-btn')[n - 1];
    if (!el) { oldEnterFail.push('第 ' + n + ' 关节点不存在'); continue; }
    el.click();
    await sleep(120);
    if (activeScreen() !== 'screen-game' || ev('state.level') !== n) {
      oldEnterFail.push('第 ' + n + ' 关没进去（screen=' + activeScreen() + ' level=' + ev('state.level') + '）');
      continue;
    }
    // 出口用真实的 #game-back（此前我误写成 #game-home → 假红）
    const back = $('#game-back');
    if (!back) { oldEnterFail.push('第 ' + n + ' 关没有返回出口'); continue; }
    back.click();
    await sleep(120);
    if (activeScreen() !== 'screen-home') oldEnterFail.push('第 ' + n + ' 关返回后没回到首页');
  }
  check('② 老线 10 关逐关「进得去、回得来」', !oldEnterFail.length, oldEnterFail.slice(0, 3).join('；'));

  /* ---------- ③ 老线全通 → 衔接学习线（那条桥要走得通） ---------- */
  ev('(function(){var p=getProgress();p.completedLevels=[1,2,3,4,5,6,7,8,9,10];saveProgress(p);})()');
  ev('renderHome()');
  await sleep(140);
  const head = $('#home-stage-head');
  check('③ 老线全通后首页抬头给出「继续学习」', !!head && /继续学习/.test(head.textContent),
    head ? JSON.stringify(head.textContent.slice(0, 40)) : '抬头节点不存在');
  if (head) {
    head.click();
    await sleep(160);
    check('③ 点抬头真的进到学习线（全局第 11 课）',
      activeScreen() === 'screen-game' && ev('state.level') === 11,
      activeScreen() + ' level=' + ev('state.level'));
    const back2 = $('#game-home') || $('#btn-back');
    if (back2) { back2.click(); await sleep(110); }
  }

  /* ---------- ④ 学习线 15 级：每级第 1 课都要能进 ---------- */
  const lvFail = [];
  for (let lv = 1; lv <= 15; lv++) {
    showScreen('screen-home');
    await sleep(50);
    ev('startLearn(' + lv + ', 1)');
    await sleep(110);
    if (activeScreen() !== 'screen-game') { lvFail.push('L' + lv + ' 进不去'); continue; }
    const wantIdx = (lv - 1) * 10 + 1;
    if (ev('state.level') !== wantIdx) lvFail.push('L' + lv + ' 课号错（' + ev('state.level') + '≠' + wantIdx + '）');
  }
  check('④ 学习线 15 级每级第 1 课都能进（共 15 次）', !lvFail.length, lvFail.join('、'));

  /* ---------- ⑤ 打一盘：能打通、能结算、结算屏有出口 ---------- */
  // ⚠️ 两个坑（本轮都踩到了，都会造成**假红**）：
  //   ① DOM 顺序 ≠ 盘面格号 —— 牌会下落换格，必须**按 uid** 找节点（data-uid）。
  //   ② 别自己去猜 state 字段；页面自己有一份 state.tiles（含 uid / state）。
  const tiles = function () { return ev('state.tiles'); };
  const uidAt = function (i) { const t = tiles()[i]; return t ? String(t.uid) : null; };
  const tileElAt = function (i) {
    const u = uidAt(i);
    return u === null ? null : doc.querySelector('#board .tile[data-uid="' + u + '"]');
  };
  showScreen('screen-home');
  await sleep(50);
  ev('startLearn(1, 1)');
  await sleep(140);
  let played = 0, stuck = null;
  for (let step = 0; step < 400; step++) {
    const t = tiles();
    const map = {};
    let pair = null;
    for (let i = 0; i < t.length; i++) {
      if (!t[i] || t[i].state !== 'idle') continue;
      if (map[t[i].id] === undefined) map[t[i].id] = i;
      else { pair = [map[t[i].id], i]; break; }
    }
    if (!pair) {
      // 可能已通关（盘面空）或真卡住
      // 总对数用页面真实的 totalPairs()（state.pairs 不存在 —— 我此前误写 → 假红）
      if (ev('state.matchedCount') >= ev('totalPairs()') || !t.some(Boolean)) break;
      stuck = '第 ' + step + ' 步找不到可配的一对（还有牌）';
      break;
    }
    const a = tileElAt(pair[0]), b = tileElAt(pair[1]);
    if (!a || !b) break;
    a.click(); await sleep(30);
    b.click();
    // ⚠️ 必须等「消除 → 下落 → 补池」**结算完**再找下一对。
    //   这是本轮踩到的坑：只等 26ms 会读到动画中间态 → 盘面与 DOM 失步 →
    //   只配上 1 对就再也配不上（假红）。test-h5 的经验值是 400ms 级，
    //   这里改成轮询 state.draining，既准又快。
    for (let w = 0; w < 40 && ev('state.draining'); w++) await sleep(40);
    await sleep(70);
    played++;
    if (played >= 200) break;
  }
  check('⑤ 学习线第 1 课能一路配对打完（无卡死）', !stuck, String(stuck));
  const matched = ev('state.matchedCount');
  const pairsTotal = ev('totalPairs()');
  check('⑤ 打完时「已配对 = 总对数」', matched === pairsTotal, matched + ' / ' + pairsTotal);

  // ⑤b 真实结算屏：打完之后必须真的到结算屏，且底栏有可点的出口。
  //   结算是在最后一对消除 + 下落结算之后才触发的，需要**等**（轮询，不猜固定时长）。
  for (let w = 0; w < 60 && activeScreen() !== 'screen-result'; w++) await sleep(50);
  check('⑤ 打完自动进入结算屏', activeScreen() === 'screen-result', String(activeScreen()));
  const resBtns = $$('#res-actions button');
  check('⑤ 结算屏底栏有出口按钮（不是空底栏）', resBtns.length > 0, '按钮数 ' + resBtns.length);

  /* ---------- ⑥ 证书链路：十课集齐 → 发证 → 证书屏 / 护照能打开 ---------- */
  ev('(function(){var p=getProgress();for(var i=1;i<=10;i++){p.learnDone["1-"+i]=true;}saveProgress(p);})()');
  await sleep(80);
  const certRes = ev('issueLearnCert(1, {accuracy: 1, clean: true})');
  check('⑥ 十课集齐后能颁发学习证书', !!certRes && !!certRes.cert,
    JSON.stringify(certRes && certRes.cert ? 'ok' : certRes));
  check('⑥ 证书能在护照里查到（1 / 15）', ev('learnCertList().owned') === 1,
    String(ev('learnCertList().owned')));
  // 证书屏：能打开、有内容、能回家
  ev('showLearnCert(1)');
  await sleep(180);
  check('⑥ 证书屏能打开', activeScreen() === 'screen-cert', String(activeScreen()));
  const certBody = $('#cert-body');
  check('⑥ 证书屏不是空白（有渲染内容）', !!certBody && certBody.textContent.trim().length > 10,
    certBody ? String(certBody.textContent.trim().length) : '无 #cert-body');
  const certHome = $('#cert-home');
  check('⑥ 证书屏有回首页的出口', !!certHome);
  if (certHome) { certHome.click(); await sleep(120); check('⑥ 从证书屏真的回得去', activeScreen() === 'screen-home', String(activeScreen())); }

  // 护照屏
  ev('showPassport()');
  await sleep(160);
  check('⑥ 护照屏能打开', activeScreen() === 'screen-passport', String(activeScreen()));
  const ppHome = $('#pp-home') || $('.pp-home');
  check('⑥ 护照屏有回首页的出口', !!ppHome);
  if (ppHome) { ppHome.click(); await sleep(110); }

  /* ---------- ⑦ 无死路：每个主要屏都能回到首页 ---------- */
  // ⚠️ screen-result 不在这里查：它的底栏由**真实结算流程**渲染（renderResult），
  //   直接 showScreen('screen-result') 天然是空底栏 —— 那是我自己造出来的假红。
  //   它的出口已在 ⑤b 的真实流程里查过。
  const SCREENS = ['screen-home', 'screen-game', 'screen-cert', 'screen-passport', 'screen-benefits'];
  // 各屏**真实**的出口控件（此前我写的 #game-home / .btn-home 并不存在 → 假红）
  const EXIT_SEL = {
    'screen-game': ['#game-back'],
    'screen-cert': ['#cert-home'],
    'screen-passport': ['#pp-home', '.pp-home'],
    'screen-benefits': ['#bn-home']
  };
  const deadEnds = [];
  for (let i = 0; i < SCREENS.length; i++) {
    const id = SCREENS[i];
    const sec = doc.getElementById(id);
    if (!sec) { deadEnds.push(id + ' 不存在'); continue; }
    if (id === 'screen-home') continue;          // 首页就是家，不需要「回家的路」
    showScreen(id);
    await sleep(70);
    const sels = EXIT_SEL[id] || [];
    const hit = sels.some(function (sel) { return sec.querySelector(sel) || doc.querySelector(sel); });
    if (!hit) deadEnds.push(id + ' 没有返回出口（查过 ' + sels.join(' / ') + '）');
  }
  check('⑦ 每个主要屏都有回家的路（无死路）', !deadEnds.length, deadEnds.join('、'));
  // 收尾：回到首页
  showScreen('screen-home');
  await sleep(80);

  /* ---------- ⑧ 全程不出现已撤除体系的名字（玩家可见） ---------- */
  // 走一遍主要屏，收集屏内文本
  const seenText = [];
  for (let i = 0; i < SCREENS.length; i++) {
    showScreen(SCREENS[i]);
    await sleep(50);
    const sec = doc.getElementById(SCREENS[i]);
    if (sec) seenText.push(sec.textContent || '');
  }
  const allText = seenText.join('\n') + '\n' + (win.__texts || []).join('\n');
  check('⑧ 全程玩家可见处没有「藏文成长证书」（旧体系名）',
    allText.indexOf('藏文成长证书') === -1,
    (allText.match(/.{0,12}藏文成长证书.{0,12}/) || [''])[0]);
  check('⑧ 全程玩家可见处没有「12 阶段」这类旧表述', allText.indexOf('12 阶段') === -1);

  /* ---------- ⑨ 运行期无未捕获错误 ---------- */
  check('⑨ 整段旅程没有未捕获的运行时错误', !errors.length, errors.slice(0, 2).join(' | ').slice(0, 200));

  /* ---------- 汇总 ---------- */
  console.log('  通过: ' + PASS + ' | 失败: ' + FAIL);
  if (FAIL) {
    console.log('');
    fails.forEach(function (f) { console.log('   - ' + f); });
    console.log('');
    console.log('✗ 全程旅程有断点 —— 玩家会在这些地方卡住。');
  } else {
    console.log('  游戏全程通畅：冷启动 → 老线 10 关 → 衔接 → 学习线 15 级 → 打完结算 → 拿证书 → 回家 ✓');
  }
  console.log('==========================================');
  process.exit(FAIL ? 1 : 0);
})().catch(function (e) {
  console.error('✗ 旅程验证异常中断：', e && e.stack || e);
  process.exit(1);
});
