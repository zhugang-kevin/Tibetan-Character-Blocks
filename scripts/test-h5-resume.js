#!/usr/bin/env node
/**
 * scripts/test-h5-resume.js — Q5「退出保存真实盘面并续玩」的行为验证（H5 端）
 *
 * 不是查关键字，而是真的跑两遍页面：
 *   ① 第一遍：?m3=1 建关 → 走一手合法交换 → 读出 localStorage 里的存档
 *   ② 第二遍：**新实例**预载这份存档 → startLevel(1) → 断言盘面 / 补池 / 目标 / 步数 / 已消
 *      与存档**逐项一致**（digest 完全相同），而不是"重新开了一局"
 *   ③ 负例：存档关卡不符 → 必须**拒绝恢复**并清档（不能串关、不能硬读坏档）
 *
 * 用法：node scripts/test-h5-resume.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const R = require('../utils/resume.js');

let JSDOM;
try { JSDOM = require('jsdom').JSDOM; }
catch (e) { console.error('✗ 未找到 jsdom（NODE_PATH 指向 workspace/node_modules）'); process.exit(2); }

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

async function boot(preload) {
  const dom = new JSDOM(fs.readFileSync(HTML, 'utf8'), {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/play.html?m3=1',
    beforeParse: function (window) {
      window.HTMLCanvasElement.prototype.getContext = function () { return mockCtx(); };
      window.HTMLCanvasElement.prototype.toDataURL = function () { return 'data:image/png;base64,STUB'; };
      window.confirm = function () { return true; };
      window.scrollTo = function () {};
      window.Audio = function () { return { play: () => ({ catch: function () {} }), pause: function () {} }; };
      Object.defineProperty(window.Element.prototype, 'clientWidth', { configurable: true, get: () => 390 });
      if (preload) {
        try { window.localStorage.setItem(R.KEY, JSON.stringify(preload)); } catch (e) {}
      }
    }
  });
  await sleep(170);
  const win = dom.window;
  return { dom, win, ev: (code) => win.eval(code) };
}

function findLegalSwap(ev) {
  return ev(`(function(){
    var b = state.board; if(!b||!b.cells) return -1;
    for (var i=0;i<b.cells.length;i++){
      var c=i%b.cols;
      if (c+1<b.cols && b.cells[i] && b.cells[i+1] &&
          MATCH3.swapMakesLine(b.cells,b.cols,b.rows,i,i+1)) return i;
    }
    return -1;
  })()`);
}

function digestOf(ev) {
  return ev(`RESUME.digest(RESUME.snapshot({
    level: state.level, seed: 0,
    rngState: (state.m3rng && state.m3rng.getState) ? state.m3rng.getState() : 0,
    cols: state.board.cols, rows: state.board.rows,
    cells: state.board.cells, pool: state.board.pool,
    nextUid: state.board.nextUid, spent: state.board.spent,
    target: state.m3Target, moves: state.stepsBudget,
    left: state.stepsLeft, cleared: state.m3Cleared
  }))`);
}

(async function main() {
  console.log('\n==========================================');
  console.log('  Q5 中途存档 · H5 行为验证（真实两遍加载）');
  console.log('==========================================');

  /* ① 第一遍：玩一手，读出存档 */
  console.log('\n[A] 玩一手 → 落档');
  const A = await boot(null);
  let saved = null;
  let beforeMoves = 0;
  let i1 = -1;

  // 🔴 2026-11-05 修偶发红（实测连续两次跑一红一绿）：
  //   根因不是「读太早」，而是**这一手直接通关**了 ——
  //   目标 24 张，一次连锁消了 28 张 → finishLevel 会清掉存档（结算即清档，Q5 设计如此），
  //   所以读不到存档。测试必须避免「第一手就赢」的盘面。
  //   做法：最多试 6 局，每局换一个合法交换；只要这手没通关、且读到了存档就停。
  for (let attempt = 1; attempt <= 6 && !saved; attempt++) {
    A.ev('setOnboardDone(); startLevel(1)');
    await sleep(60);
    i1 = findLegalSwap(A.ev);
    if (i1 < 0) continue;
    if (attempt === 1) {
      chk('建关后有合法交换', i1 >= 0, 'i=' + i1);
      chk('新局不伪造进度（cleared=0）', A.ev('state.m3Cleared') === 0);
    }
    beforeMoves = A.ev('state.stepsBudget');
    A.ev('onTapTile(' + i1 + '); onTapTile(' + (i1 + 1) + ')');
    // 交换是异步结算（动画 / 连锁 / 补牌），落档发生在结算里 → 轮询到出现为止
    for (let t = 0; t < 40 && !saved; t++) {
      saved = JSON.parse(A.win.localStorage.getItem(R.KEY) || 'null');
      if (!saved) await sleep(50);
    }
    // 这手把关卡打通了 → 存档按设计被清掉，换一局重来
    if (!saved && A.ev('state.finished')) { await sleep(120); continue; }
  }
  chk('走一手后写入了存档', !!saved);
  if (!saved) { console.log('✗ 6 局都没拿到存档（每次都被一手通关清档），无法继续'); process.exit(1); }
  chk('存档合法（RESUME.valid）', !!saved && R.valid(saved, 1, saved.cells.length), saved && ('v=' + saved.v + ' lv=' + saved.level));
  chk('存档记录真实已消张数', !!saved && saved.cleared > 0, saved && ('cleared=' + saved.cleared));
  chk('存档记录真实剩余步数（预算-1）', !!saved && saved.left === beforeMoves - 1, saved && (saved.left + '/' + beforeMoves));
  chk('存档保留随机源/补池/目标', !!saved && saved.pool && saved.obj && saved.obj.target > 0 && saved.obj.moves > 0);
  A.dom.window.close();

  /* ② 第二遍：新实例预载 → 必须恢复成同一局 */
  console.log('\n[B] 新实例预载 → 续玩');
  const B = await boot(saved);
  B.ev('setOnboardDone(); startLevel(1)');
  chk('恢复的是同一关', B.ev('state.level') === 1);
  chk('已消张数与存档一致', B.ev('state.m3Cleared') === saved.cleared, B.ev('state.m3Cleared') + ' vs ' + saved.cleared);
  chk('剩余步数与存档一致', B.ev('state.stepsLeft') === saved.left, B.ev('state.stepsLeft') + ' vs ' + saved.left);
  chk('目标与存档一致', B.ev('state.m3Target') === saved.obj.target);
  chk('步数预算与存档一致', B.ev('state.stepsBudget') === saved.obj.moves);
  chk('盘面/补池/资源 digest 与存档**完全相同**（不是重开一局）', digestOf(B.ev) === R.digest(saved));
  B.dom.window.close();

  /* ③ 负例：关卡不符 → 拒绝恢复并清档 */
  console.log('\n[C] 负例：串关存档必须拒绝');
  const wrong = JSON.parse(JSON.stringify(saved));
  wrong.level = 2;
  const C = await boot(wrong);
  C.ev('setOnboardDone(); startLevel(1)');
  chk('关卡不符 → 不恢复（cleared=0）', C.ev('state.m3Cleared') === 0, 'cleared=' + C.ev('state.m3Cleared'));
  chk('关卡不符 → 旧档被清掉', C.win.localStorage.getItem(R.KEY) === null);
  C.dom.window.close();

  console.log('\n  通过: ' + PASS + ' | 失败: ' + FAIL);
  if (FAIL) {
    console.log('');
    fails.forEach(f => console.log('   - ' + f));
    console.log('\n✗ 续玩不成立 —— 不要声称「退出可续」。');
  } else {
    console.log('  ✓ 退出可续：真实盘面/随机源/目标/资源/版本全部落档，重启后逐项一致。');
  }
  console.log('==========================================');
  process.exit(FAIL ? 1 : 0);
})().catch(function (e) {
  console.error('✗ 异常中断：', e && e.stack || e);
  process.exit(1);
});
