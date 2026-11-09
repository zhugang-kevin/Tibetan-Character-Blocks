#!/usr/bin/env node
/**
 * scripts/test-match3-150.js — 三消模式 · 150 关可通关性验证
 *
 * 为什么需要它（这是整个改造的判据）：
 *   三消的「有解」是**位置相关**的，不像配对消靠「偶数不变量」天然有解。
 *   所以"能不能玩"不能靠推理，只能**逐关模拟**：用最笨的贪心玩家（找到哪步走哪步），
 *   在「限步 + 目标」下能不能达标。贪心都能过，真人才有得玩。
 *
 * 同时钉住四条硬约束（就是本次改造的四项）：
 *   ① 通关条件 = 限步数 + 目标（不是清空盘面）
 *   ② 开局必须有合法交换
 *   ③ 不要求元素余量是 3 的倍数（目标模式允许剩余）
 *   ④ 死局能检测 + 洗牌能救回来
 *
 * 用法：node scripts/test-match3-150.js
 */
'use strict';

var L = require('../utils/learning.js');
var B = require('../utils/board.js');
var m3 = require('../utils/match3.js');

var PASS = 0, FAIL = 0, fails = [];
function chk(name, cond, detail) {
  if (cond) PASS++;
  else { FAIL++; fails.push(name + (detail ? '：' + detail : '')); }
}

// 找一个合法交换（最笨的：从上往下扫，找到第一个能成线的就换）
function firstMove(cells, cols, rows) {
  for (var i = 0; i < cells.length; i++) {
    if (!cells[i]) continue;
    var r = Math.floor(i / cols), c = i % cols;
    if (c + 1 < cols && cells[i + 1] && m3.swapMakesLine(cells, cols, rows, i, i + 1)) return [i, i + 1];
    if (r + 1 < rows && cells[i + cols] && m3.swapMakesLine(cells, cols, rows, i, i + cols)) return [i, i + cols];
  }
  return null;
}

function makeTile(id, uid) { return { id: id, uid: uid }; }

/**
 * 模拟一局：贪心玩家在「限步 + 目标」下能走多远
 * 返回 { cleared, movesUsed, reached, reshuffles, stuck }
 */
function playLevel(stage, rngSeed) {
  var seed = rngSeed || 20261020;
  var rand = function () {           // 确定性伪随机：同一个种子跑出同样结果
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  var board = B.createLevelMatch3({ cols: stage.cols, rows: stage.rows, elements: stage.elements }, makeTile, rand);

  // ② 开局必须有解（无解就洗）—— 必须带 pool：小盘死局靠池感知重洗才能救回
  var ep = m3.ensurePlayable(board.cells, board.cols, board.rows, rand, null, board.pool, makeTile);
  var reshuffles = ep.reshuffled ? 1 : 0;
  var cells = ep.cells;
  if (ep.pool) board.pool = ep.pool;
  if (ep.nextUid && ep.nextUid > board.nextUid) board.nextUid = ep.nextUid;

  var obj = m3.objectiveFor(board.total);
  var cleared = 0, movesUsed = 0, stuck = false;

  while (movesUsed < obj.moves && cleared < obj.target) {
    var mv = firstMove(cells, board.cols, board.rows);
    if (!mv) {
      // ④ 死局：池感知重洗再试（洗不动才判卡死）
      var sh = m3.reshuffle(cells, board.cols, board.rows, { rng: rand, pool: board.pool, create: makeTile });
      reshuffles++;
      if (!sh.ok) { stuck = true; break; }
      cells = sh.cells;
      if (sh.pool) board.pool = sh.pool;
      if (sh.nextUid && sh.nextUid > board.nextUid) board.nextUid = sh.nextUid;
      continue;                      // 洗牌不算一步
    }
    var swapped = m3.swapCells(cells, mv[0], mv[1]);
    var res = m3.resolve({
      cols: board.cols, rows: board.rows,
      cells: swapped,
      pool: board.pool,
      nextUid: board.nextUid,
      spent: board.spent
    }, { create: makeTile, rng: rand });
    cells = res.cells;
    board.pool = res.pool;
    board.nextUid = res.nextUid;
    board.spent = res.spent;
    cleared = board.spent;           // 累计消除张数 = board.spent（由 resolve 累加）
    movesUsed++;
  }

  return {
    cleared: cleared,
    target: obj.target,
    moves: obj.moves,
    movesUsed: movesUsed,
    reached: cleared >= obj.target,
    reshuffles: reshuffles,
    stuck: stuck,
    total: board.total
  };
}

console.log('');
console.log('==========================================');
console.log('  三消模式 · 150 关可通关性验证');
console.log('==========================================');

var totalCount = 0, startDead = 0, startLines = 0, reached = 0, stuckCount = 0, reshuffleCount = 0;
var worst = null;
var detailFail = [];

for (var lv = 1; lv <= 15; lv++) {
  for (var st = 1; st <= 10; st++) {
    var stage = L.buildStage(lv, st, { mode: 'match3' });
    if (!stage) continue;
    totalCount++;

    // 配比必须是 3 的倍数（这是三消的下限；余量允许不是）
    var countsOK = stage.elements.every(function (e) { return e[1] % 3 === 0; });
    if (!countsOK) detailFail.push('L' + lv + '-' + st + ' 配比不是 3 的倍数');

    // 开局：无现成三连 + 有合法交换
    var seed = 20261020 + lv * 100 + st;
    var rr = function () {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    var raw = B.createLevelMatch3({ cols: stage.cols, rows: stage.rows, elements: stage.elements }, function (id, u) { return { id: id, uid: u }; }, rr);
    if (m3.findLines(raw.cells, raw.cols, raw.rows).length > 0) startLines++;
    var ep = m3.ensurePlayable(raw.cells, raw.cols, raw.rows, rr, null, raw.pool,
      function (id, u) { return { id: id, uid: u }; });
    if (ep.reshuffled) reshuffleCount++;
    if (!m3.hasMove(ep.cells, raw.cols, raw.rows)) startDead++;

    var r = playLevel(stage, 20261020 + lv * 100 + st);
    if (r.reached) reached++;
    else detailFail.push('L' + lv + '-' + st + ' 未达标：' + r.cleared + '/' + r.target + '（用了 ' + r.movesUsed + '/' + r.moves + ' 步）');
    if (r.stuck) stuckCount++;
    if (!worst || (r.cleared / r.target) < (worst.cleared / worst.target)) {
      worst = { lv: lv, st: st, cleared: r.cleared, target: r.target, movesUsed: r.movesUsed, moves: r.moves };
    }
  }
}

chk('① 150 关全部生成了目标（限步 + 目标，不再以清空为条件）',
  totalCount === 150, '实际 ' + totalCount);
chk('① **每一关都能在限步内达标**（贪心玩家）', reached === totalCount,
  reached + '/' + totalCount + (detailFail.length ? ' ｜ 首例：' + detailFail[0] : ''));
chk('② 开局没有现成三连（不白送）', startLines === 0, startLines + ' 关开局已有三连');
chk('② 开局全部有合法交换（洗牌后）', startDead === 0, startDead + ' 关洗后仍无解');
chk('④ 死局时洗牌能救回（无卡死）', stuckCount === 0, stuckCount + ' 关卡死');

console.log('  关卡数            : ' + totalCount);
console.log('  限步内达标        : ' + reached + ' / ' + totalCount);
console.log('  开局需洗牌        : ' + reshuffleCount + ' 关（洗牌后全部可走）');
console.log('  最紧的一关        : L' + worst.lv + '-' + worst.st +
  ' 用 ' + worst.movesUsed + '/' + worst.moves + ' 步，消 ' + worst.cleared + '/' + worst.target);
console.log('  通过: ' + PASS + ' | 失败: ' + FAIL);
if (FAIL) {
  console.log('');
  fails.forEach(function (f) { console.log('   - ' + f); });
  console.log('');
  console.log('✗ 三消模式在 150 关上不成立 —— 不能切。');
} else {
  console.log('  ✓ 三消模式 150 关全部可通关（限步 + 目标），开局均有解，死局可洗回。');
}
console.log('==========================================');
process.exit(FAIL ? 1 : 0);
