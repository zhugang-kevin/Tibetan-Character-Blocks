#!/usr/bin/env node
/**
 * scripts/test-h5-match3-behaviour.js — 体验版三消「行为」验证（不是数 token）
 *
 * 背景：test-h5-match3.js 是**静态**规格（查关键字）。静态过 ≠ 玩得动。
 *   本脚本真正在 jsdom 里加载 preview/play.html?m3=1，执行真实交互，验证：
 *     ① 建关：M3_ON 生效、目标/步数 > 0、盘面格数正确
 *     ② 合法相邻交换 → MATCH3.resolve 生效：已消张数上升、步数恰好 -1
 *     ③ 非法（不相邻）点击 → 不扣步
 *     ④ 达标 → 触发 finishLevel，m3Won=true（赢的分流）
 *     ⑤ 步数耗尽未达标 → 触发 finishLevel，m3Won=false（输的分流）
 *     ⑥ 真实 finishLevel → 切到结算屏（不 override，验证整条链）
 *
 * 用法：node scripts/test-h5-match3-behaviour.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

let JSDOM;
try { JSDOM = require('jsdom').JSDOM; }
catch (e) {
  console.error('✗ 未找到 jsdom（NODE_PATH 指向 workspace/node_modules）');
  process.exit(2);
}

const ROOT = path.join(__dirname, '..');
const HTML = path.join(ROOT, 'preview', 'play.html');
if (!fs.existsSync(HTML)) { console.error('✗ 缺 preview/play.html，先跑 node scripts/build-h5.js'); process.exit(2); }

let PASS = 0, FAIL = 0;
const fails = [];
function chk(name, cond, detail) {
  if (cond) { PASS++; console.log('  ✓ ' + name); }
  else { FAIL++; fails.push(name + (detail ? '：' + detail : '')); console.log('  ✗ ' + name + (detail ? ' → ' + detail : '')); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* 无头 canvas 桩（逻辑验证足够） */
function mockCtx() {
  const noop = function () {};
  const base = {
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '', lineJoin: '',
    textAlign: '', textBaseline: '', globalAlpha: 1,
    fillText: noop, strokeText: noop,
    measureText: (s) => ({ width: String(s).length * 10 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) })
  };
  return new Proxy(base, { get: (t, p) => (p in t ? t[p] : noop) });
}

async function boot(urlSuffix) {
  const dom = new JSDOM(fs.readFileSync(HTML, 'utf8'), {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/play.html' + (urlSuffix || ''),
    beforeParse: function (window) {
      window.HTMLCanvasElement.prototype.getContext = function () { return mockCtx(); };
      window.HTMLCanvasElement.prototype.toDataURL = function () { return 'data:image/png;base64,STUB'; };
      window.confirm = function () { return true; };
      window.scrollTo = function () {};
      window.Audio = function () { return { play: () => ({ catch: function () {} }), pause: function () {} }; };
      Object.defineProperty(window.Element.prototype, 'clientWidth', { configurable: true, get: () => 390 });
    }
  });
  const win = dom.window;
  await sleep(160);
  return { dom, win, ev: (code) => win.eval(code) };
}

/* 在页内找一个「相邻且换后成线」的横向交换，返回左格索引，找不到 -1 */
function findLegalSwap(ev) {
  // 2026-11-06：返回 {a,b}（两个下标），不再只返回 a。
  //   原因：原来只找**横向**交换，盘面可能「横向无解、纵向有解」→ 返回 -1 → 用例偶发红（CI 实测一次）。
  //   纵向的第二个下标是 a+cols，不是 a+1，所以必须把这一对一起返回。
  return ev(`(function(){
    var b = state.board; if(!b||!b.cells) return null;
    for (var i=0;i<b.cells.length;i++){
      var c=i%b.cols;
      if (c+1<b.cols && b.cells[i] && b.cells[i+1] &&
          MATCH3.swapMakesLine(b.cells,b.cols,b.rows,i,i+1)) return {a:i,b:i+1};
    }
    for (var j=0;j<b.cells.length;j++){
      if (j+b.cols<b.cells.length && b.cells[j] && b.cells[j+b.cols] &&
          MATCH3.swapMakesLine(b.cells,b.cols,b.rows,j,j+b.cols)) return {a:j,b:j+b.cols};
    }
    return null;
  })()`);
}

(async function main() {
  console.log('\n==========================================');
  console.log('  体验版三消 · 行为验证（真实交互）');
  console.log('==========================================');

  /* ---------- 场景 A：建关 + 交换 + 结算分流 ---------- */
  console.log('\n[A] 建关 / 交换 / 胜负分流');
  let A = await boot('?m3=1');
  A.ev('setOnboardDone(); startLevel(1)');
  chk('M3_ON 生效（?m3=1）', A.ev('M3_ON') === true);
  chk('目标是正数（objectiveFor 生效）', A.ev('state.m3Target') > 0, 'target=' + A.ev('state.m3Target'));
  chk('步数是正数（限步生效）', A.ev('state.stepsBudget') > 0, 'moves=' + A.ev('state.stepsBudget'));
  chk('盘面格数 = cols×rows', A.ev('state.board.cells.length') === A.ev('state.board.cols * state.board.rows'),
    A.ev('state.board.cells.length') + ' vs ' + A.ev('state.board.cols * state.board.rows'));

  // 实玩发现的真 bug：三消分支没更新 HUD 关号（开始第 10 关仍显示「第 1 课」）
  const hudMid = () => A.ev("document.getElementById('status-mid').textContent");
  chk('HUD 关号 = 第 1 课', hudMid() === '第 1 课', hudMid());
  A.ev('startLevel(10)');
  chk('HUD 关号跟着关卡走（第 10 课）', hudMid() === '第 10 课', hudMid());
  A.ev('startLevel(1)');   // 恢复，后面的交换用例仍在第 1 关

  // ② 合法交换
  const i1 = findLegalSwap(A.ev);
  chk('盘面存在「相邻且成线」的合法交换（ensurePlayable 生效）', !!i1, JSON.stringify(i1));
  if (i1) {
    const steps0 = A.ev('state.stepsLeft');
    const cleared0 = A.ev('state.m3Cleared');
    A.ev('onTapTile(' + i1.a + '); onTapTile(' + i1.b + ')');
    chk('合法交换后已消张数上升（resolve 生效）', A.ev('state.m3Cleared') > cleared0,
      cleared0 + ' → ' + A.ev('state.m3Cleared'));
    chk('合法交换恰好扣 1 步', A.ev('state.stepsLeft') === steps0 - 1,
      steps0 + ' → ' + A.ev('state.stepsLeft'));
  }

  // ③ 非法（不相邻）不扣步
  {
    const s0 = A.ev('state.stepsLeft');
    A.ev('state.firstUid=null; state.firstIdx=null; state.locked=false;');
    A.ev('onTapTile(0); onTapTile(' + (A.ev('state.board.cells.length') - 1) + ')');
    chk('非法（不相邻）点击不扣步', A.ev('state.stepsLeft') === s0, s0 + ' → ' + A.ev('state.stepsLeft'));
    A.ev('state.firstUid=null; state.firstIdx=null;');
  }

  // ④ 达标 → finishLevel + m3Won=true（用计数桩，不真跳页）
  {
    // 2026-11-06：上一步的交换可能触发连锁把牌打光（实测偶发只剩 1~3 张），
    //   这时「找不到合法交换」是正常的，不是产品死局。用例自己重开一局保证满盘。
    A.ev('startLevel(1)');
    A.ev('window.__fc=0; window.__origF=finishLevel; finishLevel=function(){ window.__fc++; };');
    A.ev('state.m3Target = 999; state.m3Cleared = 998; state.stepsLeft = 50; state.m3Won = null;');
    const i = findLegalSwap(A.ev);
    chk('（达标用例）仍有合法交换', !!i, JSON.stringify(i));
    if (i) {
      A.ev('onTapTile(' + i.a + '); onTapTile(' + i.b + ')');
      chk('达标 → 调用 finishLevel', A.ev('window.__fc') >= 1, 'calls=' + A.ev('window.__fc'));
      chk('达标 → m3Won === true（赢的分流）', A.ev('state.m3Won') === true, String(A.ev('state.m3Won')));
    }
    A.ev('finishLevel = window.__origF;');
  }

  // ⑤ 步数耗尽未达标 → finishLevel + m3Won=false
  {
    A.ev('startLevel(1)');   // 同上：保证满盘才有合法交换
    A.ev('window.__fc=0; window.__origF=finishLevel; finishLevel=function(){ window.__fc++; };');
    A.ev('state.m3Target = 999; state.m3Cleared = 0; state.stepsLeft = 1; state.m3Won = null;');
    const i = findLegalSwap(A.ev);
    chk('（耗尽用例）仍有合法交换', !!i, JSON.stringify(i));
    if (i) {
      A.ev('onTapTile(' + i.a + '); onTapTile(' + i.b + ')');
      chk('步数耗尽 → 调用 finishLevel', A.ev('window.__fc') >= 1, 'calls=' + A.ev('window.__fc'));
      chk('步数耗尽 → m3Won === false（输的分流）', A.ev('state.m3Won') === false, String(A.ev('state.m3Won')));
    }
    A.ev('finishLevel = window.__origF;');
  }
  A.dom.window.close();

  /* ---------- 场景 B：真实 finishLevel → 结算屏 ---------- */
  console.log('\n[B] 真实结算：达标后切入结算屏');
  const B = await boot('?m3=1');
  B.ev('setOnboardDone(); startLevel(1)');
  B.ev('state.m3Target = 999; state.m3Cleared = 998; state.stepsLeft = 50;');
  const bi = findLegalSwap(B.ev);
  chk('（真实结算）存在合法交换', !!bi, JSON.stringify(bi));
  if (bi) {
    B.ev('onTapTile(' + bi.a + '); onTapTile(' + bi.b + ')');
    chk('达标后 state.finished 置真', B.ev('state.finished') === true);
    await sleep(2600);   // NAV_HOLD_MS(2200) + 余量
    const active = B.ev(`(function(){var s=document.querySelectorAll('.screen');for(var i=0;i<s.length;i++){if(s[i].classList.contains('active'))return s[i].id;}return null;})()`);
    chk('真实结算后切到结算屏', active === 'screen-result', 'active=' + active);
    const title = B.ev('document.getElementById("res-title").textContent');
    chk('结算标题显示本课完成（不是空白）', /课完成/.test(String(title)), String(title));
  }
  B.dom.window.close();

  /* ---------- 场景 C：跳过等待（实玩：最后一对后不该干等 2.6s） ---------- */
  console.log('\n[C] 跳过等待');
  const C = await boot('?m3=1');
  C.ev('setOnboardDone(); startLevel(1)');
  C.ev('state.m3Target = 999; state.m3Cleared = 998; state.stepsLeft = 50;');
  const ci = findLegalSwap(C.ev);
  chk('（跳过）存在合法交换', !!ci, JSON.stringify(ci));
  if (ci) {
    C.ev('onTapTile(' + ci.a + '); onTapTile(' + ci.b + ')');
    chk('（跳过）达标后出现「跳过等待」', C.ev('(document.getElementById("res-skip")||{}).style.display') === 'block');
    C.ev('document.getElementById("res-skip").click()');
    await sleep(80);
    const activeC = C.ev(`(function(){var s=document.querySelectorAll('.screen');for(var i=0;i<s.length;i++){if(s[i].classList.contains('active'))return s[i].id;}return null;})()`);
    chk('（跳过）点击后立刻进结算（不等 2.6s）', activeC === 'screen-result', 'active=' + activeC);
    chk('（跳过）按钮已收起', C.ev('(document.getElementById("res-skip")||{}).style.display') !== 'block');
  }
  C.dom.window.close();

  /* ---------- 汇总 ---------- */
  console.log('\n  通过: ' + PASS + ' | 失败: ' + FAIL);
  if (FAIL) {
    console.log('');
    fails.forEach(f => console.log('   - ' + f));
    console.log('\n✗ 体验版三消行为未打通 —— 不要声称「两端一致」。');
  } else {
    console.log('  ✓ 体验版三消可玩：建关 → 交换 → 消除/连锁 → 达标/耗尽 → 结算（胜负分流）。');
  }
  console.log('==========================================');
  process.exit(FAIL ? 1 : 0);
})().catch(function (e) {
  console.error('✗ 异常中断：', e && e.stack || e);
  process.exit(1);
});
