#!/usr/bin/env node
/**
 * scripts/test-page-behaviour.js — 小程序页行为测试（真实 require + 真实调用）
 *
 * 存在的理由（一句话）：
 *   `pages/game/game.js` 里 `handleMatch(first, second)` 的 `second` **从未定义**，
 *   学习线每次成功配对都会抛 ReferenceError —— 而 `node --check` 查不出未定义变量，
 *   H5 测试测的是另一份实现，所以这个 bug 躺了很久。
 *   这个文件就是补那个洞：**真的把页面载起来、真的点两张牌**。
 *
 * 覆盖：配对成功 / 错配 / 三消非法交换 / 三消合法交换 / 胜负分离 / HUD
 * 不覆盖：渲染（WXML）、动画时序、音频听感、真机
 */
'use strict';

const path = require('path');
const { createMiniEnv, loadPage, installFakeTimers } = require('./lib/mini-stub.js');

let PASS = 0, FAIL = 0;
const fails = [];
function chk(name, cond, detail) {
  if (cond) PASS++;
  else { FAIL++; fails.push(name + (detail ? '：' + detail : '')); }
}

const PAGE = path.join(__dirname, '..', 'pages', 'game', 'game.js');

function tap(page, index) {
  return page.onTapTile({ currentTarget: { dataset: { index: index } } });
}

/** 找一对能配对的牌（学习线：同 id 任意两张） */
function findPair(page) {
  const cells = page.board.cells;
  const seen = {};
  for (let i = 0; i < cells.length; i++) {
    const t = cells[i];
    if (!t) continue;
    if (seen[t.id] !== undefined) return [seen[t.id], i];
    seen[t.id] = i;
  }
  return null;
}

/** 找一个能成线的相邻交换（三消） */
function findMove(page) {
  const m3 = require('../utils/match3.js');
  const cells = page.board.cells, cols = page.board.cols, rows = page.board.rows;
  for (let i = 0; i < cells.length; i++) {
    if (!cells[i]) continue;
    const r = Math.floor(i / cols), c = i % cols;
    if (c + 1 < cols && cells[i + 1] && m3.swapMakesLine(cells, cols, rows, i, i + 1)) return [i, i + 1];
    if (r + 1 < rows && cells[i + cols] && m3.swapMakesLine(cells, cols, rows, i, i + cols)) return [i, i + cols];
  }
  return null;
}

console.log('');
console.log('==========================================');
console.log('  小程序页 · 行为测试');
console.log('==========================================');

/* ================= 一、学习线（配对）：这是 second 崩溃的地方 ================= */
const envA = createMiniEnv();
const learn = loadPage(PAGE, envA);
learn.__withWx(function () { learn.onLoad({ lv: 1, stage: 1 }); });

chk('① 学习线能载入并建关', !!learn.board && !!learn.board.cells && learn.learnCfg);
chk('① 学习线不进入三消分支', learn.match3 === false);

const pair = findPair(learn);
chk('① 能找到一个可配对的牌对', !!pair);

let threw = null;
try {
  learn.__withWx(function () { tap(learn, pair[0]); tap(learn, pair[1]); });
} catch (e) { threw = e; }
// 这一条就是 second 崩溃的回归测试：修复前这里必然 throw
chk('② 配对成功不抛异常（second 未定义的回归测试）', threw === null,
  threw ? String(threw && threw.message) : '');
chk('② 配对计数 +1', learn.matchedCount === 1, 'matchedCount=' + learn.matchedCount);
chk('② 该元素进了收藏册', Object.keys(learn.collected || {}).length >= 1);

/* ================= 二、错配：不该计数 ================= */
const envB = createMiniEnv();
const learn2 = loadPage(PAGE, envB);
learn2.__withWx(function () { learn2.onLoad({ lv: 1, stage: 1 }); });
const cells2 = learn2.board.cells;
let ia = -1, ib = -1;
for (let i = 0; i < cells2.length; i++) {
  if (!cells2[i]) continue;
  for (let j = i + 1; j < cells2.length; j++) {
    if (cells2[j] && cells2[j].id !== cells2[i].id) { ia = i; ib = j; break; }
  }
  if (ia >= 0) break;
}
let threw2 = null;
try { learn2.__withWx(function () { tap(learn2, ia); tap(learn2, ib); }); } catch (e) { threw2 = e; }
chk('③ 错配不抛异常', threw2 === null, threw2 ? String(threw2.message) : '');
chk('③ 错配不增加配对计数', learn2.matchedCount === 0, 'matchedCount=' + learn2.matchedCount);

/* ================= 三、老线（三消）：非法 / 合法交换 ================= */
const envC = createMiniEnv();
const m3p = loadPage(PAGE, envC);
m3p.__withWx(function () { m3p.onLoad({ level: 1, seed: 20261021 }); });

chk('④ 老线进入三消分支', m3p.match3 === true);
chk('④ 建关后 HUD 初值已写（目标 / 步数）',
  typeof m3p.data.m3target === 'number' && m3p.data.m3target > 0 &&
  typeof m3p.data.stepsLeft === 'number' && m3p.data.stepsLeft > 0,
  JSON.stringify({ t: m3p.data.m3target, s: m3p.data.stepsLeft }));
chk('④ 开局无现成三连', (function () {
  const m3 = require('../utils/match3.js');
  return m3.findLines(m3p.board.cells, m3p.board.cols, m3p.board.rows).length === 0;
})());

// 非法交换：选两个不相邻的牌
const stepsBefore = m3p.m3left;
let threw3 = null;
try { m3p.__withWx(function () { tap(m3p, 0); tap(m3p, m3p.board.cells.length - 1); }); } catch (e) { threw3 = e; }
chk('⑤ 非法交换不抛异常', threw3 === null, threw3 ? String(threw3.message) : '');
chk('⑤ 非法交换**不扣步**', m3p.m3left === stepsBefore, 'left=' + m3p.m3left + ' before=' + stepsBefore);

// 合法交换
const mv = findMove(m3p);
chk('⑥ 盘面存在合法交换', !!mv, mv ? mv.join(',') : 'none');
if (mv) {
  const leftBefore = m3p.m3left;
  let threw4 = null;
  try { m3p.__withWx(function () { tap(m3p, mv[0]); tap(m3p, mv[1]); }); } catch (e) { threw4 = e; }
  chk('⑥ 合法交换不抛异常', threw4 === null, threw4 ? String(threw4.message) : '');
  chk('⑥ 合法交换扣 1 步', m3p.m3left === leftBefore - 1, 'left=' + m3p.m3left);
  chk('⑥ 已消张数 > 0', m3p.m3cleared > 0, 'cleared=' + m3p.m3cleared);
  chk('⑥ 得分增加', (m3p.data.score || 0) > 0, 'score=' + m3p.data.score);
}

/* ================= 四、胜负分离：未达标不得写通关 ================= */
chk('⑦ 有独立的胜负标志位（m3won 未设置时不等于 true）',
  m3p.m3won !== true, 'm3won=' + m3p.m3won);
chk('⑦ 结算口径已从"对"切换（m3target 存在即为三消）',
  typeof m3p.data.m3target === 'number');

/* ================= 五、退出重开：连锁回调不得继续结算 ================= */
const envD = createMiniEnv();
const ex = loadPage(PAGE, envD);
ex.__withWx(function () { ex.onLoad({ level: 1, seed: 777 }); });
const mvD = findMove(ex);
if (mvD) {
  // 触发一次连锁播放（会排 setTimeout）
  ex.__withWx(function () { tap(ex, mvD[0]); tap(ex, mvD[1]); });
}
chk('⑧ 播放期间确实排了 timer', !!ex.m3Timer, 'm3Timer=' + ex.m3Timer);

// 模拟离开页面
ex.__withWx(function () { ex.onUnload(); });
chk('⑧ onUnload 置中止标志', ex.m3aborted === true);
chk('⑧ onUnload 清掉播放 timer', !ex.m3Timer, 'm3Timer=' + ex.m3Timer);

// 把结算前的关键状态记下来，稍后确认"没有继续跑"
const spentBefore = ex.board.spent;
const clearedBefore = ex.m3cleared;
const finishedBefore = ex.finished;

// 模拟"回调已经排到队列里"的情况：手动调用一次（若守卫失效就会继续结算）
if (ex.afterPlay) { try { ex.afterPlay(); } catch (e) {} }
await0(60);
function await0(ms) {
  // 同步等待不可行；这里只看"立刻"的状态，异步残留由 timer 清理保证
}
chk('⑧ 离开后不再结算（spent 未继续增长）', ex.board.spent === spentBefore,
  'before=' + spentBefore + ' after=' + ex.board.spent);
chk('⑧ 离开后不会误判通关', ex.finished === finishedBefore,
  'before=' + finishedBefore + ' after=' + ex.finished);

/* ================= 六、重开：新一局状态必须干净 ================= */
const envE = createMiniEnv();
const re = loadPage(PAGE, envE);
re.__withWx(function () { re.onLoad({ level: 1, seed: 777 }); });
re.__withWx(function () { re.onUnload(); });
re.__withWx(function () { re.onLoad({ level: 1, seed: 777 }); });
chk('⑨ 重开后中止标志被复位', re.m3aborted === false, 'm3aborted=' + re.m3aborted);
chk('⑨ 重开后 finished 复位', re.finished !== true, 'finished=' + re.finished);
chk('⑨ 重开后步数恢复正常（不是 0）', re.m3left > 0, 'm3left=' + re.m3left);

/* ================= 七、胜负结算：真跑异步跳转，看 URL ================= */
// 用虚拟时间：把"语音念完再跳页"的等待同步推过去，不 sleep、不赌机器速度
const ft = installFakeTimers();
const envF = createMiniEnv();
const wl = loadPage(PAGE, envF);
wl.__withWx(function () { wl.onLoad({ level: 1, seed: 999 }); });

// 把剩余步数压到 1：下一步之后必然进入结算（未达标）
wl.m3left = 1;
const mvW = findMove(wl);
chk('⑩ 压到 1 步后仍有合法交换可走', !!mvW);
if (mvW) {
  wl.__withWx(function () { tap(wl, mvW[0]); tap(wl, mvW[1]); });
  // ⚠️ 定时器回调在 __withWx **之外**执行，此时 global.wx 已被还原成 undefined
  //    → 回调里的 wx.showToast 会抛 TypeError，后续跳转就不会发生。
  //    这在真实小程序里不存在（wx 是全局的），所以是**测试桩的问题**，必须在这里补挂。
  global.wx = envF.wx;
  ft.tick(6000);                    // 播放 + D115 的跳页延迟
  global.wx = undefined;
  if (ft.errors().length) {
    console.log('  ⚠️ tick 内抛出 ' + ft.errors().length + ' 个异常，首例：');
    console.log('     ' + String(ft.errors()[0] && ft.errors()[0].message || ft.errors()[0]));
  }
}

const redirects = envF.wx.__calls.filter(function (c) { return c.api === 'redirectTo'; });
chk('⑩ 结算确实触发了页面跳转（不是静默结束）', redirects.length > 0, 'redirects=' + redirects.length);

const url = redirects.length ? String(redirects[redirects.length - 1].args[0].url || '') : '';
chk('⑩ 未达标时 URL 带 won=0（不能冒充通关）', /won=0/.test(url), url);
chk('⑩ URL 带 seed（战报可复现同一盘面）', /seed=999/.test(url), url);
chk('⑩ URL 带挑战 ID（战报要绑定）', /cid=/.test(url), url);
chk('⑩ 未达标不写通关（finished 与 won 一致）',
  wl.m3won !== true, 'm3won=' + wl.m3won);
ft.restore();

/* ================= 八、死局洗牌：用模块级 stub 逼出无解分支 ================= */
// 为什么不给生产代码加 forcedCells：生产路径不该为测试开洞（可由用户输入间接触发的洞 = 风险）。
// 这里直接替换 match3.hasMove：
//   第 1 次调用（页面判断"有没有解"）→ false，逼进洗牌分支；
//   第 2 次起（shuffle 内部自检）→ 真实实现，才能洗出合法盘面。
// ⚠️ 如果一直返回 false，shuffle 内部也永远失败 → 洗不出来 → 测的是"洗牌失败"而不是"洗牌成功"。
const m3mod = require('../utils/match3.js');
const origHasMove = m3mod.hasMove;
const origShuffle = m3mod.shuffle;

const ft2 = installFakeTimers();
const envG = createMiniEnv();
const shp = loadPage(PAGE, envG);
shp.__withWx(function () { shp.onLoad({ level: 1, seed: 555 }); });

const mvS = findMove(shp);
const before = shp.board.cells.map(function (t) { return t ? t.id : '.'; }).join('');
let calls = 0;
m3mod.hasMove = function () {
  calls++;
  if (calls === 1) return false;              // 只骗第一次：页面以为无解
  return origHasMove.apply(null, arguments);  // 之后真实
};

if (mvS) {
  shp.__withWx(function () { tap(shp, mvS[0]); tap(shp, mvS[1]); });
  global.wx = envG.wx;
  ft2.tick(6000);
  global.wx = undefined;
}
m3mod.hasMove = origHasMove;

// ⚠️ 不能用「hasMove 被调用次数」判断：shuffle 内部用的是**模块内直接引用**，
//    不走 module.exports，所以 stub 拦不到它（calls 只会是 1）。
//    正确的判据是**盘面被重排了** —— 那就是洗牌真的执行过。
const after = shp.board.cells.map(function (t) { return t ? t.id : '.'; }).join('');
chk('⑪ 无解时确实触发了重排（盘面与操作前不同）', after !== before,
  'before=' + before.slice(0, 18) + ' after=' + after.slice(0, 18));
chk('⑪ 洗牌后存在玩家可操作的合法交换',
  origHasMove.call(null, shp.board.cells, shp.board.cols, shp.board.rows) === true,
  'board=' + shp.board.cells.map(function (t) { return t ? t.id : '.'; }).join('').slice(0, 24));
chk('⑪ 洗牌后盘面无现成三连（不能靠白送消除脱困）',
  m3mod.findLines(shp.board.cells, shp.board.cols, shp.board.rows).length === 0,
  'lines=' + m3mod.findLines(shp.board.cells, shp.board.cols, shp.board.rows).length);
ft2.restore();

/* ================= 九、自检链路：打一局 → 缓冲里真的有记录 ================= */
// 之前只证明了"没崩"，没证明"记上了"。这一组补的就是这一条。
// ⚠️ 坑：utils/platform.js 会**缓存 adapter**（第一次调用时绑定当时的 global.wx），
//    不重置就会读到上一个用例的存储 → 断言永远看不到新事件。
const platformMod = require('../utils/platform.js');
const tel = require('../utils/telemetry.js');

const envH = createMiniEnv();
global.wx = envH.wx;
platformMod.__reset();          // 让适配层重新绑定到本用例的 wx
tel.clear();                    // 清空缓冲，避免前面用例污染

const tp = loadPage(PAGE, envH);
tp.__withWx(function () { tp.onLoad({ level: 1, seed: 4321 }); });

let buf = tel.dump();
chk('⑫ 开局写入了 level_start',
  buf.some(function (b) { return b.type === 'event' && b.data && b.data.name === 'level_start'; }),
  'buf=' + buf.map(function (b) { return b.data && b.data.name; }).join(','));

const startRow = buf.filter(function (b) { return b.data && b.data.name === 'level_start'; })[0];
chk('⑫ level_start 带了关卡与种子（能复现是哪一局）',
  !!startRow && startRow.data.d && startRow.data.d.level === 1 && startRow.data.d.seed === 4321,
  startRow ? JSON.stringify(startRow.data.d) : 'none');
chk('⑫ 每条记录都带 sess 与 ver（否则数据无法归因）',
  buf.length > 0 && !!buf[0].sess && !!buf[0].ver, JSON.stringify({ sess: buf[0] && buf[0].sess, ver: buf[0] && buf[0].ver }));

// 未结算就离开 → 应写 level_abort
tp.__withWx(function () { tp.onUnload(); });
buf = tel.dump();
chk('⑫ 中途退出写入了 level_abort',
  buf.some(function (b) { return b.data && b.data.name === 'level_abort'; }),
  'buf=' + buf.map(function (b) { return b.data && b.data.name; }).join(','));

const abortRow = buf.filter(function (b) { return b.data && b.data.name === 'level_abort'; })[0];
chk('⑫ level_abort 记录了「玩到第几步」（used 字段存在）',
  !!abortRow && typeof abortRow.data.d.used === 'number',
  abortRow ? JSON.stringify(abortRow.data.d) : 'none');

global.wx = undefined;
platformMod.__reset();

/* ================= 十、胜利路径：之前只测了失败，从没测过达标 ================= */
// 复核发现：⑩ 只覆盖"步数耗尽 → won=0"，**达标 → won=1 从没测过**。
// 只测失败分支，等于只验证了"失败不会误判成胜利"，没验证"胜利会被判成胜利"。
const ft3 = installFakeTimers();
const envI = createMiniEnv();
global.wx = envI.wx;
require('../utils/platform.js').__reset();

const wp = loadPage(PAGE, envI);
wp.__withWx(function () { wp.onLoad({ level: 1, seed: 2468 }); });

// 把目标压到 3：一次三消即可达标。**只改测试里的运行时对象，不改生产代码**。
wp.m3obj.target = 3;
const mvI = findMove(wp);
chk('⑬ 达标测试的前置：存在合法交换', !!mvI);
if (mvI) {
  wp.__withWx(function () { tap(wp, mvI[0]); tap(wp, mvI[1]); });
  ft3.tick(6000);
}

const redsI = envI.wx.__calls.filter(function (c) { return c.api === 'redirectTo'; });
const urlI = redsI.length ? String(redsI[redsI.length - 1].args[0].url || '') : '';
chk('⑬ 达标时 URL 带 won=1（胜利要判成胜利）', /won=1/.test(urlI), urlI);
chk('⑬ 达标时 m3won === true', wp.m3won === true, 'm3won=' + wp.m3won);
chk('⑬ 达标时已消张数 ≥ 目标', wp.m3cleared >= 3, 'cleared=' + wp.m3cleared);
ft3.restore();
global.wx = undefined;
require('../utils/platform.js').__reset();

/* ================= ⑭ Q5 中途存档：真实续玩 ================= */
{
  const R = require('../utils/resume.js');
  const envR = createMiniEnv();
  require('../utils/platform.js').__reset();

  const pA = loadPage(PAGE, envR);
  pA.__withWx(function () { pA.onLoad({ level: 1, seed: 20261023 }); });
  chk('⑭ 建关进入三消', pA.match3 === true);
  chk('⑭ 新局不伪造进度（cleared=0）', pA.m3cleared === 0, 'cleared=' + pA.m3cleared);
  chk('⑭ 新局不写存档（还没玩）', !envR.storage.has(R.KEY));

  // 模拟「玩了一手并结算完」：直接改真实字段后存档（换手流程已由 H5 行为测试覆盖）
  pA.__withWx(function () {
    pA.m3cleared = 6;
    pA.m3left = pA.m3obj.moves - 1;
    pA.board.spent = 6;
    pA.saveResume();
  });
  const saved = envR.storage.get(R.KEY);
  chk('⑭ 走一手后写入本机存档', !!saved);
  chk('⑭ 存档合法（版本/关卡/形状/步数）', !!saved && R.valid(saved, 1, saved.cells.length));

  // 同一存储、**新的页面实例** → 续玩
  const pB = loadPage(PAGE, envR);
  pB.__withWx(function () { pB.onLoad({ level: 1 }); });
  chk('⑭ 续玩：已消张数与存档一致', pB.m3cleared === 6, 'cleared=' + pB.m3cleared);
  chk('⑭ 续玩：剩余步数与存档一致', pB.m3left === pA.m3obj.moves - 1, 'left=' + pB.m3left);
  chk('⑭ 续玩：目标与存档一致', !!pB.m3obj && pB.m3obj.target === saved.obj.target);
  const snapB = R.snapshot({
    level: pB.data.level || 1, seed: pB.m3seed,
    rngState: (pB.m3rng && pB.m3rng.getState) ? pB.m3rng.getState() : 0,
    cols: pB.board.cols, rows: pB.board.rows, cells: pB.board.cells,
    pool: pB.board.pool, nextUid: pB.board.nextUid, spent: pB.board.spent,
    target: pB.m3obj.target, moves: pB.m3obj.moves, left: pB.m3left, cleared: pB.m3cleared
  });
  chk('⑭ 续玩：盘面/补池 digest 与存档完全相同', R.digest(snapB) === R.digest(saved));

  // 负例：串关存档必须拒绝并清掉
  const pC = loadPage(PAGE, envR);
  pC.__withWx(function () { pC.onLoad({ level: 2 }); });
  chk('⑭ 串关：不恢复（cleared=0）', pC.m3cleared === 0, 'cleared=' + pC.m3cleared);
  chk('⑭ 串关：旧档被清掉', !envR.storage.has(R.KEY));

  global.wx = undefined;
  require('../utils/platform.js').__reset();
}

/* ================= ⑮ 结算跳过：不必干等 2.2s ================= */
{
  const envS = createMiniEnv();
  global.wx = envS.wx;
  require('../utils/platform.js').__reset();
  const pS = loadPage(PAGE, envS);
  pS.__withWx(function () { pS.onLoad({ level: 1, seed: 4242 }); });
  pS._alive = true;
  pS.__withWx(function () { pS.finishLevel(); });
  chk('⑮ 结算等待中出现跳过按钮（resultPending）', pS.data.resultPending === true, String(pS.data.resultPending));
  const before = envS.wx.__calls.filter(function (c) { return c.api === 'redirectTo'; }).length;
  pS.__withWx(function () { pS.skipToResult(); });
  const after = envS.wx.__calls.filter(function (c) { return c.api === 'redirectTo'; }).length;
  chk('⑮ 点击跳过后立刻 redirectTo（不再等 2.2s）', after > before, before + '→' + after);
  chk('⑮ 跳过后按钮收起', pS.data.resultPending === false);
  global.wx = undefined;
  require('../utils/platform.js').__reset();
}

/* ================= ⑯ 双轨配色：学习线墨牌 / 游戏线彩色 ================= */
{
  const envL = createMiniEnv();
  global.wx = envL.wx;
  require('../utils/platform.js').__reset();
  const pL = loadPage(PAGE, envL);
  pL.__withWx(function () { pL.onLoad({ lv: 1, stage: 1 }); });
  const colorsL = new Set(pL.board.cells.filter(Boolean).map(function (t) { return t.color; }));
  chk('⑯ 学习线牌色统一（颜色不再编码字母）', colorsL.size === 1,
    Array.from(colorsL).join(','));

  const envG = createMiniEnv();
  global.wx = envG.wx;
  require('../utils/platform.js').__reset();
  const pG = loadPage(PAGE, envG);
  pG.__withWx(function () { pG.onLoad({ level: 1, seed: 7 }); });
  const colorsG = new Set(pG.board.cells.filter(Boolean).map(function (t) { return t.color; }));
  chk('⑯ 纯游戏线仍保留彩色牌（≥2 种颜色）', colorsG.size >= 2,
    Array.from(colorsG).join(','));

  global.wx = undefined;
  require('../utils/platform.js').__reset();
}

/* ================= ⑰ 首页双入口（D152） ================= */
{
  const fs = require('fs');
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages', 'index', 'index.wxml'), 'utf8');
  chk('⑰ 首页有双入口「练习模式 · 10 课」', wxml.indexOf('练习模式 · 10 课') > -1);
  chk('⑰ 首页有双入口「学藏文 · 150 课」', wxml.indexOf('学藏文 · 150 课') > -1);
  chk('⑰ 页脚不再写「天梯 10 课」（量词/口径会误导）', wxml.indexOf('天梯 10 课') === -1);
}

/* ================= ⑱ 练习模式按钮：滚到天梯顶部（D152） ================= */
{
  const env = createMiniEnv();
  global.wx = env.wx;
  const calls = [];
  env.wx.pageScrollTo = function (o) { calls.push(o); };
  env.wx.createSelectorQuery = function () {
    const q = {
      select() { return q; },
      boundingClientRect() { return q; },
      selectViewport() { return q; },
      scrollOffset() { return q; },
      exec(cb) { cb([{ top: 300 }, { scrollTop: 500 }]); }
    };
    return q;
  };
  const p = loadPage(path.join(__dirname, '..', 'pages', 'index', 'index.js'), env);
  p.__withWx(function () { p.scrollToLadder(); });
  chk('⑱ 练习模式滚到天梯顶部（不是页面最顶）',
    calls.length === 1 && calls[0].scrollTop === 790, JSON.stringify(calls));
  global.wx = undefined;
}

/* ================= 汇总 ================= */
console.log('  通过: ' + PASS + ' | 失败: ' + FAIL);
if (FAIL) {
  console.log('');
  fails.forEach(function (f) { console.log('   - ' + f); });
  console.log('');
  console.log('✗ 小程序页行为有回归 —— 不要继续加功能。');
} else {
  console.log('  覆盖：配对成功 / 错配 / 非法交换 / 合法交换 / HUD / 胜负标志 ✓');
  console.log('  未覆盖：WXML 渲染、动画时序、音频听感、真机、支付、分享落地。');
}
console.log('==========================================');
process.exit(FAIL ? 1 : 0);
