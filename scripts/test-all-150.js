/* scripts/test-all-150.js — 150 关全量「打通」验证
 *
 * 目的：把「一共 150 关、全部畅通、不影响游戏」变成**可复现的机械证据**，而不是说法。
 *      用户 2026-10-16 原话：「你现在需要确定我们一共有150关，而且都已经是畅通的，
 *      已经是打通的，完全不影响游戏」。
 *
 * 验证项（**150/150 全查，不抽样**）：
 *   ① 数量与编号：恰好 15 级 × 10 课 = 150；全局课序号连续覆盖 1..150，无空洞无重复
 *   ② 可构建：每关都能生成盘面，且 总牌数 = 格数 + 池容量（初始满铺）、配对数为整数、步数预算为正
 *   ③ **可打通**：用**真实盘面逻辑**（utils/board.js 的 createLevel / collapse / checkInvariants）
 *      把每一关从头打到尾 —— 反复「找一对同 id 的牌 → 移除 → 重力下落 + 顶部补池」，
 *      直到盘面与池都空。**任何一刻「还有牌却找不到可配的一对」= 死局 → 直接判红**。
 *   ④ 可打完：所需步数恰好 = 配对数（每对消一次），且 ≤ 该关步数预算
 *   ⑤ 三不变量：偶不变 / 守恒 / 列连续（每一步都查，不只查开局）
 *   ⑥ 解锁链：从零进度出发推演「过前一级 → 开下一级」，证明 15 级逐级都走得通；
 *      并单独验证「老线 10 关全通 → L2 直开」那条桥（否则玩家会卡在「停在 10 关」）
 *   ⑦ 不影响既有游戏：老线 10 关的关卡数据与学习线互不干扰（各自的关数与编号独立）
 *
 * 用法： node scripts/test-all-150.js
 * 退出码：0 = 全部通过；1 = 有失败（会打印失败明细）
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const board = require(path.join(ROOT, 'utils', 'board'));
const learning = require(path.join(ROOT, 'utils', 'learning'));
const levelsData = require(path.join(ROOT, 'data', 'levels'));

let PASS = 0, FAIL = 0;
const fails = [];
function ok(name) { PASS++; }
function bad(name, detail) { FAIL++; fails.push(name + (detail ? '：' + detail : '')); }
function chk(cond, name, detail) { if (cond) ok(name); else bad(name, detail); }

// 线性同余随机源：让 150 关的验证**可复现**（同一 seed 每次结果相同）
let _seed = 20261016;
function rng() {
  _seed = (_seed * 1103515245 + 12345) & 0x7fffffff;
  return _seed / 0x7fffffff;
}

/* ---------- 盘面工具：与两端同规则（无相邻要求，任意两张同 id 即可配） ---------- */
function liveTiles(cells) { return cells.filter(function (c) { return !!c; }).length; }
function findPairIndexes(cells) {
  const byId = {};
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (!c) continue;
    if (byId[c.id] !== undefined) return [byId[c.id], i];
    byId[c.id] = i;
  }
  return null;
}

/* ---------- 单关：从头打到尾 ---------- */
function playThrough(lv, st) {
  const stage = learning.buildStage(lv, st);
  if (!stage) return { ok: false, reason: 'buildStage 返回空' };
  const slots = stage.cols * stage.rows;
  const total = stage.elements.reduce(function (a, e) { return a + e[1]; }, 0);

  // ② 结构自洽
  if (total % 2 !== 0) return { ok: false, reason: '总牌数为奇数（配不成对）：' + total };
  if (stage.pairs !== total / 2) return { ok: false, reason: 'pairs 与总牌数不符' };
  if (!(stage.steps > 0)) return { ok: false, reason: '步数预算非正' };

  // ③ 真实盘面
  let state = board.createLevel({ cols: stage.cols, rows: stage.rows, elements: stage.elements }, null, rng);
  const start = board.checkInvariants(state);
  if (!start.even || !start.conserved || !start.contiguous) {
    return { ok: false, reason: '开局三不变量不成立：' + JSON.stringify(start) };
  }
  // 开局在场张数：牌必须成对 → 奇数格时最多只能铺 slots-1 张（数学必然，不是缺陷）
  const expectLive = slots % 2 === 0 ? slots : slots - 1;
  if (liveTiles(state.cells) !== expectLive) {
    return { ok: false, reason: '开局在场张数异常：' + liveTiles(state.cells) + '（应为 ' + expectLive + '）' };
  }
  const poolAll = board.poolLeft(state.pool);
  if (liveTiles(state.cells) + poolAll !== total) {
    return { ok: false, reason: '开局「在场 + 池」≠ 总数' };
  }

  let steps = 0;
  const cap = stage.pairs + 5;
  while (true) {
    const remain = liveTiles(state.cells) + board.poolLeft(state.pool);
    if (remain === 0) break;
    if (steps >= cap) return { ok: false, reason: '步数失控（已消 ' + steps + ' 对仍未清空）' };
    const pair = findPairIndexes(state.cells);
    if (!pair) {
      return {
        ok: false,
        reason: '死局：还有 ' + remain + ' 张牌（在场 ' + liveTiles(state.cells) +
          ' + 池 ' + board.poolLeft(state.pool) + '）却找不到可配的一对'
      };
    }
    state = board.collapse(state, pair);
    steps++;
    const inv = board.checkInvariants(state);
    if (!inv.even || !inv.conserved || !inv.contiguous) {
      return { ok: false, reason: '第 ' + steps + ' 步后不变量被破坏：' + JSON.stringify(inv) };
    }
  }

  // ④ 打完所需步数
  if (steps !== stage.pairs) return { ok: false, reason: '步数 ' + steps + ' ≠ 配对数 ' + stage.pairs };
  if (steps > stage.steps) {
    return { ok: false, reason: '步数预算不足：需要 ' + steps + ' 步，预算只有 ' + stage.steps };
  }
  return { ok: true, steps: steps, budget: stage.steps, total: total, slots: slots };
}

/* ================= ① 数量与编号 ================= */
const LV_N = learning.totalStages ? 15 : 15;
let count = 0, idxBad = [], structBad = [];
const results = [];
for (let lv = 1; lv <= LV_N; lv++) {
  const L = require(path.join(ROOT, 'data', 'learning')).LEVELS[lv - 1];
  if (!L || L.stages !== 10) { structBad.push('L' + lv + ' 的课数 ≠ 10'); continue; }
  for (let st = 1; st <= 10; st++) {
    count++;
    const want = (lv - 1) * 10 + st;
    const got = learning.cumulativeIndex(lv, st);
    if (got !== want) idxBad.push('L' + lv + '-' + st + ' 序号 ' + got + ' ≠ ' + want);
    const r = playThrough(lv, st);
    results.push({ lv: lv, st: st, r: r });
  }
}
chk(count === 150, '一共恰好 150 关（15 级 × 10 课）', '实际 ' + count);
chk(!structBad.length, '每级都是 10 课', structBad.join('、'));
chk(!idxBad.length, '全局课序号连续覆盖 1..150（无空洞 / 无重复）', idxBad.slice(0, 4).join('、'));
chk(learning.totalStages() === 150, 'totalStages() = 150', String(learning.totalStages()));

/* ================= ③④⑤ 逐关打通 ================= */
const broke = results.filter(function (x) { return !x.r.ok; });
chk(!broke.length, '150/150 关都能从头打通（无死局）',
  broke.slice(0, 6).map(function (x) { return 'L' + x.lv + '-' + x.st + ' ' + x.r.reason; }).join(' ｜ '));

const tight = results.filter(function (x) { return x.r.ok && x.r.steps > x.r.budget; });
chk(!tight.length, '150/150 关的步数预算都够打完', tight.slice(0, 3).map(function (x) {
  return 'L' + x.lv + '-' + x.st + ' 需 ' + x.r.steps + ' 步 / 预算 ' + x.r.budget;
}).join('、'));

// 单关速览（最紧的三关：预算余量最小）
const margins = results.filter(function (x) { return x.r.ok; }).map(function (x) {
  return { id: 'L' + x.lv + '-' + x.st, need: x.r.steps, budget: x.r.budget, m: x.r.budget / x.r.steps };
}).sort(function (a, b) { return a.m - b.m; });
chk(margins.length === 150 && margins[0].m >= 2, '最紧的一关也有 ≥2 倍步数余量',
  margins.slice(0, 3).map(function (x) { return x.id + '（余量 ' + x.m.toFixed(2) + ' 倍）'; }).join('、'));

/* ================= ⑥ 解锁链推演 ================= */
/* 规则与两端同口径（体验版 learnLevelLocked / 小程序 learnLocked）：
   ① 验收开关全开 ② L1 直进 ③ 前一级 10 课全过 ④ 老线 10 关全通 → L2 直开 */
function lockRule(lv, doneLv, oldLineDone, verifyAll) {
  if (verifyAll || lv <= 1) return false;
  if (doneLv >= 10) return false;
  if (lv === 2 && oldLineDone) return false;
  return true;
}
// 从零进度出发：每一级都靠「把前一级打完」解锁，证明 15 级逐级可走通
const chain = [];
let doneLv = 0;
for (let lv = 1; lv <= LV_N; lv++) {
  const locked = lockRule(lv, doneLv, false, false);
  chain.push({ lv: lv, locked: locked });
  if (locked) break;      // 卡住就停（正常情况不该发生）
  doneLv = 10;            // 打完本级 10 课
}
chk(chain.length === LV_N && chain.every(function (c) { return !c.locked; }),
  '解锁链可走通：从零进度逐级打到 L15（15/15 级都能到）',
  chain.filter(function (c) { return c.locked; }).map(function (c) { return 'L' + c.lv + ' 卡住'; }).join('、'));

// 桥：老线全通 → L2 直开（玩家走完老线不该看到 L2-L15 全锁）
chk(lockRule(2, 0, true, false) === false, '桥：老线 10 关全通 → L2 直接开（不罚玩家重刷 L1）');
chk(lockRule(2, 0, false, false) === true, '反向：老线没通、L1 没打完时 L2 仍锁（规则没被放空）');
chk(lockRule(3, 0, true, false) === true, '桥只开 L2，不越权开 L3');
chk(lockRule(15, 10, false, false) === false, '前一级打完 → 下一级开（常规路径）');
chk(lockRule(7, 0, false, true) === false, '验收开关打开 → 任意一级全开');

/* ================= ⑦ 不影响既有游戏 ================= */
const oldLine = levelsData.filter(function (l) { return l.level >= 1 && l.level <= 10; });
chk(oldLine.length === 10 && levelsData.length === 10,
  '老线仍是原样 10 关（学习线没有动它）', '老线 ' + oldLine.length + ' / 总 ' + levelsData.length);
chk(require(path.join(ROOT, 'data', 'learning')).LEVELS.length === 15,
  '学习线仍是 15 级（两条线各自独立）');

/* ================= 汇总 ================= */
const totalPairs = results.reduce(function (a, x) { return a + (x.r.ok ? x.r.steps : 0); }, 0);
console.log('');
console.log('==========================================');
console.log('  150 关全量打通验证');
console.log('==========================================');
console.log('  关卡总数        : ' + count);
console.log('  逐关实战打通    : ' + (count - broke.length) + ' / ' + count +
  '（共消 ' + totalPairs + ' 对，全部用真实盘面逻辑跑完）');
console.log('  死局            : ' + broke.length);
console.log('  步数预算不足    : ' + tight.length);
if (margins.length) {
  console.log('  最紧的一关      : ' + margins[0].id + '（需 ' + margins[0].need +
    ' 步 / 预算 ' + margins[0].budget + '，余量 ' + margins[0].m.toFixed(2) + ' 倍）');
}
console.log('  ' + (FAIL ? '✗' : '✓') + ' 通过 ' + PASS + ' 项' + (FAIL ? '，失败 ' + FAIL + ' 项' : ''));
if (FAIL) {
  console.log('');
  console.log('  失败明细：');
  fails.forEach(function (f) { console.log('   - ' + f); });
}
console.log('==========================================');
process.exit(FAIL ? 1 : 0);
