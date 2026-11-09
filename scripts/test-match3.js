#!/usr/bin/env node
/**
 * scripts/test-match3.js — 三消引擎单元验证（P1）
 *
 * 为什么单独一个测试文件：
 *   三消是**新地基**，而 utils/match3.js 目前还没接进页面（接入要同时改 150 关校验与关卡指纹，
 *   是一次原子变更）。在接入之前，先把引擎本身证明对：
 *   成线识别、特效阶梯、交换合法性、下落、**连锁**、死局检测。
 *
 * 关键一条：**连锁必须被真的触发**（不是"代码里有 while 循环"）。
 *   构造一个盘面：消掉横行后，补池补进来的牌与上方同色 → 自动成线 → 第二轮消除。
 *
 * 纯逻辑，不需要 jsdom。
 */
'use strict';

var m3 = require('../utils/match3.js');

var PASS = 0, FAIL = 0, fails = [];
function chk(name, cond, detail) {
  if (cond) { PASS++; }
  else { FAIL++; fails.push(name + (detail ? '：' + detail : '')); }
}

// 构造盘面：'A B C' 形式按行给出，'.' = 空
function build(cols, rows, rowsText) {
  var cells = [];
  rowsText.forEach(function (line) {
    line.split(' ').forEach(function (ch) {
      cells.push(ch === '.' ? null : { id: ch, uid: cells.length + 1 });
    });
  });
  return cells;
}

console.log('');
console.log('==========================================');
console.log('  三消引擎 · 单元验证（P1）');
console.log('==========================================');

/* ---------- ① 成线识别 ---------- */
var b3 = build(5, 3, ['A A A B C', '. . . . .', '. . . . .']);
var l3 = m3.findLines(b3, 5, 3);
chk('① 横向 3 连能被识别', l3.length === 1 && l3[0].len === 3 && l3[0].dir === 'h',
  JSON.stringify(l3.map(function (l) { return l.len + l.dir; })));

var b4 = build(5, 3, ['A A A A B', '. . . . .', '. . . . .']);
chk('① 横向 4 连能被识别为一条（不是拆成两条）',
  m3.findLines(b4, 5, 3).length === 1 && m3.findLines(b4, 5, 3)[0].len === 4);

var b5 = build(5, 3, ['A A A A A', '. . . . .', '. . . . .']);
chk('① 横向 5 连能被识别', m3.findLines(b5, 5, 3)[0].len === 5);

var bv = build(3, 4, ['A . .', 'A . .', 'A . .', 'B . .']);
chk('① 纵向 3 连能被识别（dir=v）', m3.findLines(bv, 3, 4)[0].dir === 'v');

var b2 = build(4, 2, ['A A B B', '. . . .']);
chk('① 两个不算线（三消的下限是 3）', m3.findLines(b2, 4, 2).length === 0);

/* ---------- ② 特效阶梯（用户要的「三个/四个不一样」） ---------- */
chk('② 3 连 → 无特效', m3.specialFor(3) === null);
chk('② 4 连 → 笔锋（stripe）', m3.specialFor(4) === 'stripe');
chk('② 5 连 → 同字归一（rainbow）', m3.specialFor(5) === 'rainbow');
chk('② 6 连也归到 rainbow（不能漏档）', m3.specialFor(6) === 'rainbow');

/* ---------- ③ 交换合法性 ---------- */
var sw = build(3, 2, ['A B A', '. . B']);
chk('③ 不相邻的两格不能交换', m3.swapMakesLine(sw, 3, 2, 0, 2) === false);
chk('③ 同色交换无意义，判定为不合法', m3.swapMakesLine(
  build(3, 2, ['A A B', '. . .']), 3, 2, 0, 1) === false);
// r0 = A A B，把下方那个 A 换上来 → r0 变成 A A A
var sw2 = build(3, 2, ['A A B', '. . A']);
chk('③ 交换后能成线的才合法', m3.swapMakesLine(sw2, 3, 2, 2, 5) === true,
  '2=' + (sw2[2] && sw2[2].id) + ' 5=' + (sw2[5] && sw2[5].id));

/* ---------- ④ 下落（列内压缩，不得悬空） ---------- */
var drop = m3.compress(build(2, 4, ['A .', '. .', 'B .', 'C .']), 2, 4);
chk('④ 下落之后列内连续（无悬空）', (function () {
  for (var c = 0; c < 2; c++) {
    var seen = false;
    for (var r = 0; r < 4; r++) {
      var t = drop.cells[r * 2 + c];
      if (t) seen = true;
      else if (seen) return false;
    }
  }
  return true;
})());
chk('④ 下落顺序保序（A 仍在 B 上方）',
  drop.cells[2].id === 'A' && drop.cells[4].id === 'B' && drop.cells[6].id === 'C',
  [2, 4, 6].map(function (i) { return drop.cells[i] ? drop.cells[i].id : 'null'; }).join(','));

/* ---------- ⑤ 死局检测 ---------- */
// 一个格子错开排布、任何交换都成不了线的盘面
// 拉丁方排布：任意相邻交换都凑不出三个相连
var dead = build(3, 3, ['A B C', 'B C A', 'C A B']);
chk('⑤ 无解盘面能被识别为死局', m3.hasMove(dead, 3, 3) === false);

var alive = build(4, 2, ['A A C B', '. . A C']);   // 把下面的 A 换上来 → A A A
chk('⑤ 有解盘面能被识别为可走', m3.hasMove(alive, 4, 2) === true);

/* ---------- ⑥ 连锁：这是整个改造成败的关键 ---------- */
// 盘面：第 1 行是 B B B（会被消）
//       第 0 行两侧是 A，第 2 行两侧是 A → 消掉后上下 A 落到相邻，再补池补 A → 形成 A A A
// ⚠️ 构造时必须检查**横竖都不能有第二处线**：
//   最初写成 A A B / B B B / A A B，第 3 列也是 B B B，第一轮一次消掉 5 张，
//   连锁根本轮不上。改成中间列不构成竖线。
var cas = build(3, 3, ['A A C', 'B B B', 'A A C']);
var res = m3.resolve({
  cols: 3, rows: 3,
  cells: cas,
  pool: { A: 3 },          // 只给 A，补池确定性
  nextUid: 100,
  spent: 0
}, { create: function (id, u) { return { id: id, uid: u }; } });

chk('⑥ 第一轮消掉了 B B B', res.rounds.length >= 1 && res.rounds[0].removed.length === 3,
  res.rounds.length ? String(res.rounds[0].removed.length) : 'no rounds');
chk('⑥ **连锁被真的触发**（轮数 ≥ 2，不是只有一轮）', res.cascades >= 2, 'cascades=' + res.cascades);
chk('⑥ 连锁确实是「补池补进来的牌组成新线」',
  res.rounds.length >= 2 && res.rounds[1].lines.length > 0,
  res.rounds.length >= 2 ? JSON.stringify(res.rounds[1].lines.map(function (l) { return l.id + l.len; })) : 'no round 2');
chk('⑥ 池被正确扣减（A 从 3 扣到 0）', res.pool.A === 0, JSON.stringify(res.pool));
chk('⑥ 总量守恒：在场 + 池 + 已消 = 初始总张数', (function () {
  var onBoard = m3.tally(res.cells);
  var n = 0;
  for (var k in onBoard) n += onBoard[k];
  var left = 0;
  for (var k2 in res.pool) left += res.pool[k2];
  // 总量 = 初始盘面 9 张 + 池里 3 张 = 12（补池是把池里的牌搬上盘，不是凭空生成）
  return n + left + res.spent === 12;
})(), 'spent=' + res.spent);

/* ---------- ⑦ 4 连会产出条纹特效标记 ---------- */
var four = build(5, 3, ['A A A A B', '. . . . .', '. . . . .']);
var r4 = m3.resolve({
  cols: 5, rows: 3, cells: four, pool: {}, nextUid: 50, spent: 0
}, { create: function (id, u) { return { id: id, uid: u }; } });
chk('⑦ 4 连那一轮产出了 stripe 特效', (function () {
  if (!r4.rounds.length) return false;
  var sp = r4.rounds[0].specials || [];
  for (var i = 0; i < sp.length; i++) if (sp[i].kind === 'stripe') return true;
  return false;
})(), JSON.stringify(r4.rounds[0] && r4.rounds[0].specials));

/* ---------- ⑧ 特效真的会生成、真的会触发 ---------- */
// 8a：4 连 → 应该留下**一张带 special 标记的牌**（不能被顺手消掉）
var fourB = build(5, 3, ['A A A A B', '. . . . .', '. . . . .']);
var r8 = m3.resolve({ cols: 5, rows: 3, cells: fourB, pool: {}, nextUid: 77, spent: 0 },
  { create: function (id, u) { return { id: id, uid: u }; } });
chk('⑧ 4 连之后盘面上留下了笔锋牌（special=stripe）', (function () {
  for (var i = 0; i < r8.cells.length; i++) {
    if (r8.cells[i] && r8.cells[i].special === 'stripe') return true;
  }
  return false;
})(), JSON.stringify(r8.cells.filter(function (t) { return t && t.special; }).map(function (t) { return t.id + ':' + t.special; })));

// 8b：笔锋牌被命中 → 清整行 + 整列
// ⚠️ 盘面必须**铺满**，否则扩出来的行/列没有牌可清，测不到实际效果。
var stripe = build(3, 3, ['A B C', 'A C B', 'A B C']);
stripe[0].special = 'stripe';            // 第 0 列是竖直 3 连（A A A），把顶端那张升级成笔锋
var r8b = m3.resolve({ cols: 3, rows: 3, cells: stripe, pool: {}, nextUid: 90, spent: 0 },
  { create: function (id, u) { return { id: id, uid: u }; } });
// 命中后应扩成「整行 3 + 整列 3 − 重叠 1 = 5」
chk('⑧ 笔锋牌被命中后清除范围扩展（整行+整列 = 5 格）',
  r8b.rounds.length > 0 && r8b.rounds[0].removed.length === 5,
  r8b.rounds.length ? String(r8b.rounds[0].removed.length) : 'no round');

// 8c：5 连 → 同字归一牌
var fiveB = build(5, 3, ['B B B B B', '. . . . .', '. . . . .']);
var r8c = m3.resolve({ cols: 5, rows: 3, cells: fiveB, pool: {}, nextUid: 99, spent: 0 },
  { create: function (id, u) { return { id: id, uid: u }; } });
chk('⑧ 5 连之后盘面上留下了同字归一牌（special=rainbow）', (function () {
  for (var i = 0; i < r8c.cells.length; i++) {
    if (r8c.cells[i] && r8c.cells[i].special === 'rainbow') return true;
  }
  return false;
})());

// 8d：同字归一牌被命中 → 清掉全场同色
var rainbow = build(3, 3, ['C C C', 'C . .', 'C . .']);
rainbow[0].special = 'rainbow';          // 把第一张 C 升级成归一牌（必须在已有的牌上）
var r8d = m3.resolve({ cols: 3, rows: 3, cells: rainbow, pool: {}, nextUid: 120, spent: 0 },
  { create: function (id, u) { return { id: id, uid: u }; } });
chk('⑧ 同字归一牌被命中后清掉全场同色（5 张 C 全清）',
  r8d.rounds.length > 0 && r8d.rounds[0].removed.length === 5,
  r8d.rounds.length ? String(r8d.rounds[0].removed.length) : 'no round');

/* ---------- ⑨ S01：同 seed 必须复现同一盘面 ---------- */
var B2 = require('../utils/board.js');
function boardIds(seed) {
  var cfg = { cols: 6, rows: 6, elements: [['a', 15], ['b', 15], ['c', 15]] };
  var b = B2.createLevelMatch3(cfg, function (id, u) { return { id: id, uid: u }; }, m3.seededRng(seed));
  var ep = m3.ensurePlayable(b.cells, b.cols, b.rows, m3.seededRng(seed + 1));
  return ep.cells.map(function (t) { return t ? t.id : '.'; }).join('');
}
var s1 = boardIds(20261020), s2 = boardIds(20261020), s3 = boardIds(20261021);
chk('⑨ 同一 seed 生成的盘面完全相同', s1 === s2, s1.slice(0, 24) + ' vs ' + s2.slice(0, 24));
chk('⑨ 不同 seed 生成不同盘面（否则 seed 没起作用）', s1 !== s3);
chk('⑨ challengeId 随关卡/seed/规则版本变化', (function () {
  var a = m3.challengeIdFor(3, 20261020, 1);
  var b = m3.challengeIdFor(3, 20261020, 2);
  var c = m3.challengeIdFor(4, 20261020, 1);
  return a !== b && a !== c;
})());

/* ---------- 汇总 ---------- *//* ---------- 汇总 ---------- */
console.log('  通过: ' + PASS + ' | 失败: ' + FAIL);
if (FAIL) {
  console.log('');
  fails.forEach(function (f) { console.log('   - ' + f); });
  console.log('');
  console.log('✗ 三消引擎有问题 —— 不要接入页面。');
} else {
  console.log('  引擎契约成立：成线识别 / 特效阶梯 / 交换合法性 / 下落 / 连锁 / 死局 全部通过 ✓');
}
console.log('==========================================');
process.exit(FAIL ? 1 : 0);
