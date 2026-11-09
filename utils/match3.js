// utils/match3.js — 三消引擎（P1 · 纯函数 · 不依赖 wx / DOM）
//
// 为什么要新开一个模块，而不是改 utils/board.js：
//   board.js 的地基是「配对不变量」（每种元素张数恒为偶数 → 永远有对可配 → 零死局），
//   并且 D33 明确**否决过自动连锁**（原话：配对判定比三消宽两个数量级，自动连锁会失控）。
//   用户 2026-10-20 要求改成真正的消消乐，这恰好推翻 D33 的前提：
//   **成线判定窄**，连锁才是设计要的爽点，而不是失控来源。
//   → 所以三消单独成模块，board.js 保留（配对消模式仍要它），两者并存、由开关选择。
//
// 与 board.js 共用的契约：
//   cells 是 cols×rows 的 row-major 一维数组，null = 空格；
//   列内「上空下满」连续排列（牌堆在列底），这条形态断言沿用 board.js。
//
// 核心循环（行业通行五步）：
//   交换 → 成线检测 → 消除 → 下落 → 补池 → 回到成线检测（连锁）
//
// 特效阶梯（用户要的「三个/四个不一样」）：
//   3 连   → 普通消除
//   4 连   → 笔锋（清整行或整列）
//   5 连   → 同字归一（清全场同色）
//   L/T 形 → 归入 5 连档（按「组内总数 ≥5 且非直线」判定为碎裂）
//
// 纯函数：输入不改，全部返回新对象。

'use strict';

// 可复现随机源（S01）：同一个 seed 必须产出同一个序列。
// 为什么不用 Math.random：同盘挑战要求两个人拿到**完全相同的盘面**，
//   否则成绩不可比。这里用 LCG（数值稳定、无平台差异），不用现成库。
function seededRng(seed) {
  var s = (seed >>> 0) || 1;
  function rng() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  }
  // Q5：可续。**只存 seed 不够** —— 续玩后序列会从头开始，和"没退出"不是同一条。
  //   把 LCG 的内部状态一起存取，续玩才是真正同一局（补池/洗牌序列一致）。
  rng.getState = function () { return s >>> 0; };
  rng.setState = function (v) { s = (Number(v) >>> 0) || 1; };
  return rng;
}

// 挑战 ID：由「关卡 + seed + 规则版本」派生。
//   规则版本不同 → 同一 seed 也可能行为不同 → 跨版本成绩不可比，所以必须并入。
function challengeIdFor(level, seed, rulesVersion) {
  var str = 'l' + level + '-s' + (seed >>> 0) + '-r' + (rulesVersion || 1);
  var h = 2166136261;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return 'c' + h.toString(36);
}

function idx(r, c, cols) { return r * cols + c; }

// 扫描所有成线（横 / 竖，长度 ≥ 3）。返回 [{ id, len, dir, cells: [i...] }]
// 同一条线上的格子按顺序给出；横竖交叉的格子会出现在两个组里（调用方去重）。
function findLines(cells, cols, rows) {
  var out = [];
  var r, c, i;
  // 横向
  for (r = 0; r < rows; r++) {
    c = 0;
    while (c < cols) {
      var t0 = cells[idx(r, c, cols)];
      if (!t0) { c++; continue; }
      var id = t0.id;
      var run = [idx(r, c, cols)];
      var cc = c + 1;
      while (cc < cols) {
        var t = cells[idx(r, cc, cols)];
        if (!t || t.id !== id) break;
        run.push(idx(r, cc, cols));
        cc++;
      }
      if (run.length >= 3) out.push({ id: id, len: run.length, dir: 'h', cells: run });
      c = cc;
    }
  }
  // 纵向
  for (c = 0; c < cols; c++) {
    r = 0;
    while (r < rows) {
      var v0 = cells[idx(r, c, cols)];
      if (!v0) { r++; continue; }
      var vid = v0.id;
      var vrun = [idx(r, c, cols)];
      var rr = r + 1;
      while (rr < rows) {
        var vt = cells[idx(rr, c, cols)];
        if (!vt || vt.id !== vid) break;
        vrun.push(idx(rr, c, cols));
        rr++;
      }
      if (vrun.length >= 3) out.push({ id: vid, len: vrun.length, dir: 'v', cells: vrun });
      r = rr;
    }
  }
  return out;
}

// 一条线该产出什么特效
//   len 3 → null（普通）
//   len 4 → 'stripe'（笔锋：清整行/整列）
//   len ≥5 → 'rainbow'（同字归一：清全场同色）
function specialFor(len) {
  if (len >= 5) return 'rainbow';
  if (len === 4) return 'stripe';
  return null;
}

// 交换两个**相邻**格（不校验是否有效，调用方先用 swapMakesLine 判断）
function swapCells(cells, a, b) {
  var out = cells.slice();
  var t = out[a]; out[a] = out[b]; out[b] = t;
  return out;
}

function adjacent(cols, rows, a, b) {
  if (a === b) return false;
  var ra = Math.floor(a / cols), ca = a % cols;
  var rb = Math.floor(b / cols), cb = b % cols;
  return (Math.abs(ra - rb) + Math.abs(ca - cb)) === 1;
}

// 这一对交换后是否会产生成线（三消的合法性判定：不能成线的交换不允许）
function swapMakesLine(cells, cols, rows, a, b) {
  if (!adjacent(cols, rows, a, b)) return false;
  if (!cells[a] || !cells[b]) return false;
  if (cells[a].id === cells[b].id) return false;   // 同色交换没有意义
  return findLines(swapCells(cells, a, b), cols, rows).length > 0;
}

// 是否还存在任何一步合法交换（死局检测）
//   blocked：可选。{ index: 1 } 形式的锁定格集合（冰霜/木箱）。
//   ⚠️ G04：锁定牌**玩家点不动**，所以它既不能当起点也不能当终点。
//   以前只按"能不能成线"判断 → 引擎说有步、玩家却点不了 → 卡局毁信任。
function hasMove(cells, cols, rows, blocked) {
  var blk = blocked || {};
  for (var i = 0; i < cells.length; i++) {
    if (!cells[i]) continue;
    if (blk[i]) continue;                       // 锁定的牌不能作为起点
    var r = Math.floor(i / cols), c = i % cols;
    // 只往右、往下探，避免重复
    if (c + 1 < cols && cells[i + 1] && !blk[i + 1] && swapMakesLine(cells, cols, rows, i, i + 1)) return true;
    if (r + 1 < rows && cells[i + cols] && !blk[i + cols] && swapMakesLine(cells, cols, rows, i, i + cols)) return true;
  }
  return false;
}

// 列内向下压缩：每列独立「从下往上堆」，返回 { cells, drops }
function compress(cells, cols, rows) {
  var out = cells.slice();
  var drops = [];
  for (var c = 0; c < cols; c++) {
    var stack = [];
    for (var r = rows - 1; r >= 0; r--) {
      var i = idx(r, c, cols);
      if (out[i]) stack.push({ tile: out[i], from: r });
    }
    for (var t = 0; t < rows; t++) out[idx(t, c, cols)] = null;
    for (var s = 0; s < stack.length; s++) {
      var to = rows - 1 - s;
      out[idx(to, c, cols)] = stack[s].tile;
      if (to !== stack[s].from) drops.push({ index: idx(to, c, cols), drop: to - stack[s].from });
    }
  }
  return { cells: out, drops: drops };
}

// 某格放 id 是否立刻形成三连（只查已填的左侧两格 / 下方两格 —— 与自底向上填表顺序一致）
function makesLineAt(cells, cols, rows, r, c, id) {
  var at = function (rr, cc) { var t = cells[rr * cols + cc]; return !!t && t.id === id; };
  if (c >= 2 && at(r, c - 1) && at(r, c - 2)) return true;
  if (r + 2 < rows && at(r + 1, c) && at(r + 2, c)) return true;
  return false;
}

// 池感知重洗（R06 核心修复）：
//   把「盘面 + 池」当成一个多重集重新铺盘。纯排列洗牌在 **3×3 小盘 + 5~6 种牌**时
//   数学上无解：9 格里每种只剩 1~2 张，永远凑不出 3 连。必须允许从池里补牌，
//   才能把 3 张同色重新摆上盘、造出一手合法交换。
// 返回 { cells, pool, ok, attempts }；pool 为重铺后仍剩下的余量。
function reshuffle(cells, cols, rows, opts) {
  opts = opts || {};
  var rand = opts.rng || Math.random;
  var blocked = opts.blocked || {};
  var create = opts.create || function (id, u) { return { id: id, uid: u }; };
  var slots = cols * rows;
  var k, i;
  var combined = {};
  var base = tally(cells);
  for (k in base) if (Object.prototype.hasOwnProperty.call(base, k)) combined[k] = base[k];
  var srcPool = opts.pool || {};
  for (k in srcPool) if (Object.prototype.hasOwnProperty.call(srcPool, k)) combined[k] = (combined[k] || 0) + srcPool[k];
  var ids = Object.keys(combined).filter(function (id) { return combined[id] > 0; });
  var alive = 0, poolN = 0;
  for (i = 0; i < cells.length; i++) if (cells[i]) alive++;
  for (k in srcPool) if (Object.prototype.hasOwnProperty.call(srcPool, k)) poolN += srcPool[k];
  var fillN = Math.min(alive + poolN, slots);
  if (fillN <= 0) return { cells: cells, pool: srcPool, ok: true, attempts: 0 };
  var uid = 1;
  for (i = 0; i < cells.length; i++) if (cells[i] && cells[i].uid >= uid) uid = cells[i].uid + 1;
  // 复用盘面原有牌对象，保住特效 / 障碍属性；只有池里补进来的才 create 新对象
  var bagBase = {};
  for (i = 0; i < cells.length; i++) {
    if (!cells[i]) continue;
    var bid = cells[i].id;
    if (!bagBase[bid]) bagBase[bid] = [];
    bagBase[bid].push(cells[i]);
  }

  for (var attempt = 0; attempt < 400; attempt++) {
    var left = {};
    for (k in combined) if (Object.prototype.hasOwnProperty.call(combined, k)) left[k] = combined[k];
    var bag = {};
    for (k in bagBase) if (Object.prototype.hasOwnProperty.call(bagBase, k)) bag[k] = bagBase[k].slice();
    var out = [];
    for (i = 0; i < slots; i++) out.push(null);
    var placed = 0, fail = false;
    for (var r = rows - 1; r >= 0 && !fail; r--) {
      for (var c = 0; c < cols; c++) {
        if (placed >= fillN) break;
        var rem = 0; for (k in left) rem += left[k];
        if (rem <= 0) break;
        var safe = [];
        for (var t = 0; t < ids.length; t++) {
          var id = ids[t];
          if (left[id] > 0 && !makesLineAt(out, cols, rows, r, c, id)) safe.push(id);
        }
        if (!safe.length) { fail = true; break; }
        var pick = safe[Math.floor(rand() * safe.length)];
        // 优先复用原牌对象（保 special/障碍）；池牌没有对象 → 新建
        var t2 = (bag[pick] && bag[pick].length) ? bag[pick].pop() : create(pick, uid++);
        out[r * cols + c] = t2;
        left[pick] -= 1; placed++;
      }
    }
    if (fail || placed <= 0) continue;
    if (findLines(out, cols, rows).length > 0) continue;
    if (!hasMove(out, cols, rows, blocked)) continue;
    var newPool = {};
    for (k in left) if (Object.prototype.hasOwnProperty.call(left, k) && left[k] > 0) newPool[k] = left[k];
    return { cells: out, pool: newPool, ok: true, attempts: attempt + 1, nextUid: uid };
  }
  return { cells: cells, pool: srcPool, ok: false, attempts: 400, nextUid: uid };
}

// 纯排列洗牌（不动池）：保留给只用盘面的调用方。blocked 现在会透传（R07）。
function shuffle(cells, cols, rows, rng, blocked) {
  var rand = rng || Math.random;
  var tiles = [];
  for (var i = 0; i < cells.length; i++) if (cells[i]) tiles.push(cells[i]);
  var out = cells.slice();
  for (var attempt = 0; attempt < 200; attempt++) {
    for (var k = tiles.length - 1; k > 0; k--) {
      var j = Math.floor(rand() * (k + 1));
      var t = tiles[k]; tiles[k] = tiles[j]; tiles[j] = t;
    }
    out = [];
    for (var n = 0; n < cells.length; n++) out.push(null);
    var p = 0;
    for (var c = 0; c < cols; c++) {
      for (var r = rows - 1; r >= 0; r--) {
        var gi = idx(r, c, cols);
        if (!cells[gi]) continue;
        if (p < tiles.length) out[gi] = tiles[p++];
      }
    }
    if (findLines(out, cols, rows).length === 0 && hasMove(out, cols, rows, blocked)) {
      return { cells: out, ok: true, attempts: attempt + 1 };
    }
  }
  return { cells: out, ok: false, attempts: 200 };
}

// 开局/中途的「可用性保证」：无现成三连 + 至少一手合法交换。
//   pool 有值 → 走池感知重洗（小盘死局必须靠它）；没有 pool → 退回纯排列（向后兼容）。
function ensurePlayable(cells, cols, rows, rng, blocked, pool, create) {
  if (findLines(cells, cols, rows).length === 0 && hasMove(cells, cols, rows, blocked)) {
    return { cells: cells, pool: pool, ok: true, reshuffled: false };
  }
  if (pool && typeof pool === 'object' && Object.keys(pool).length) {
    var rr = reshuffle(cells, cols, rows, { rng: rng, blocked: blocked, pool: pool, create: create });
    if (rr.ok) return { cells: rr.cells, pool: rr.pool, ok: true, reshuffled: true, nextUid: rr.nextUid };
  }
  var r = shuffle(cells, cols, rows, rng, blocked);
  return { cells: r.cells, pool: pool, ok: r.ok, reshuffled: true };
}

// 目标模型（2026-10-20）：三消不能用「清空盘面」当通关条件（见 docs 第八节）。
// 目标 = 消掉 target 张；步数 = 允许 moves 步。两者都由关卡总量派生，确定（不用随机）。
//   target: 总量的 60%（向上取整到 3 的倍数）—— 既要有推进感，又不能一局拖太长
//   moves : 理论上最少 ceil(target/3) 步；给 1.6 倍余量 + 固定底 3 步
function objectiveFor(total) {
  var target = Math.ceil(total * 0.6 / 3) * 3;
  if (target > total) target = total;
  var moves = Math.ceil(target / 3 * 1.6) + 3;
  return { target: target, moves: moves };
}

// 盘面上各元素张数
function tally(cells) {
  var out = {};
  for (var i = 0; i < cells.length; i++) {
    if (!cells[i]) continue;
    out[cells[i].id] = (out[cells[i].id] || 0) + 1;
  }
  return out;
}

// 特效展开：一次清除如果命中了**特效牌**，就把它自己的清除范围并进来（递归，防环）。
//   笔锋 stripe  → 清整行 + 整列（十字，比行业里的"单向"更强，因为我们的盘面小）
//   同字归一 rainbow → 清全场**同色**
// 返回扩展后的格号数组。纯函数：不改 cells。
function expandKills(cells, cols, rows, killMap) {
  var queue = Object.keys(killMap).map(Number);
  var all = {};
  var guard = 0;
  while (queue.length && guard++ < cells.length * 4) {
    var i = queue.shift();
    if (all[i]) continue;
    all[i] = 1;
    var t = cells[i];
    if (!t || !t.special) continue;
    var targets = [];
    var r = Math.floor(i / cols), c = i % cols;
    if (t.special === 'stripe') {
      for (var cc = 0; cc < cols; cc++) targets.push(r * cols + cc);
      for (var rr = 0; rr < rows; rr++) targets.push(rr * cols + c);
    } else if (t.special === 'rainbow') {
      for (var j = 0; j < cells.length; j++) {
        if (cells[j] && cells[j].id === t.id) targets.push(j);
      }
    }
    for (var k = 0; k < targets.length; k++) {
      if (cells[targets[k]] && !all[targets[k]]) queue.push(targets[k]);
    }
  }
  return Object.keys(all).map(Number);
}

// 一次「结算」：反复执行 找线 → 清除 → 下落 → 补池，直到没有新线（连锁）
//   state: { cells, cols, rows, pool, nextUid, spent }
//   pool:  { id: 剩余张数 }   —— 补池从这里扣，扣完就不再补（盘面自然收缩）
//   opts:  { create(id, uid), rng(), maxCascade }
// 返回 {
//   cells, pool, nextUid, spent,
//   rounds: [{ lines, removed, specials, spawned }],   // 每轮连锁的明细（播动画用）
//   cascades: 连锁轮数,
//   stuck: 结算后是否已无合法步（true 时调用方应洗牌/提示）
// }
function resolve(state, opts) {
  opts = opts || {};
  var cols = state.cols, rows = state.rows;
  var create = opts.create || function (id, u) { return { id: id, uid: u }; };
  var rand = opts.rng || Math.random;
  var maxCascade = opts.maxCascade || 12;

  var cells = state.cells.slice();
  var pool = {};
  var k;
  for (k in state.pool) if (Object.prototype.hasOwnProperty.call(state.pool, k)) pool[k] = state.pool[k];
  var nextUid = state.nextUid;
  var spent = state.spent || 0;
  var rounds = [];
  var cascades = 0;
  var poolIds = Object.keys(pool).filter(function (id) { return pool[id] > 0; });

  var guard = 0;
  while (guard++ < maxCascade) {
    var lines = findLines(cells, cols, rows);
    if (!lines.length) break;
    cascades++;

    // ① 汇总要清掉的格子（横竖交叉去重）+ 决定每条线产出的特效
    //   特效牌**留在原地不被消掉**，否则等于刚生出来就没了。
    var kill = {};
    var specials = [];
    var keep = {};                    // 要保留并升级成特效牌的格号
    lines.forEach(function (ln) {
      var sp = specialFor(ln.len);
      if (sp) {
        var at = ln.cells[Math.floor(ln.cells.length / 2)];   // 放在线的中段，玩家更容易看见
        specials.push({ id: ln.id, kind: sp, len: ln.len, dir: ln.dir, at: at });
        keep[at] = 1;
      }
      ln.cells.forEach(function (i) { kill[i] = 1; });
    });

    // ② 命中特效牌 → 展开清除范围（递归）。展开出来的格子同样计入本次消除。
    var removed = expandKills(cells, cols, rows, kill).filter(function (i) { return !keep[i]; });

    // ③ 清除 + 把被保留的格子升级成特效牌（保留原 id，这样它还能继续参与成线）
    removed.forEach(function (i) { cells[i] = null; });
    spent += removed.length;
    specials.forEach(function (sp) {
      var t = cells[sp.at];
      if (t) t.special = sp.kind;               // 升级现有牌，而不是另造一张
      else if (sp.at != null) {                 // 极端情况：该格已被清掉 → 直接放一张新的
        cells[sp.at] = create(sp.id, nextUid++);
        cells[sp.at].special = sp.kind;
      }
    });

    // ③ 下落
    var cmp = compress(cells, cols, rows);
    cells = cmp.cells;
    var drops = cmp.drops;

    // ④ 补池：从池里按「剩余最多」优先取，逐个补到每列顶部空位
    var spawned = [];
    for (var c = 0; c < cols; c++) {
      for (var r = 0; r < rows; r++) {
        var i2 = idx(r, c, cols);
        if (cells[i2]) continue;
        // 该列还有空位：从池里取一张
        var pick = null, bestLeft = -1;
        for (var pi = 0; pi < poolIds.length; pi++) {
          var id = poolIds[pi];
          if (pool[id] > bestLeft) { bestLeft = pool[id]; pick = id; }
        }
        if (!pick || bestLeft <= 0) break;      // 池空：盘面收缩，本列不再补
        var tile = create(pick, nextUid++);
        cells[i2] = tile;
        pool[pick] -= 1;
        spawned.push({ index: i2, id: pick, uid: tile.uid });
        drops.push({ index: i2, drop: r + 1 });
      }
    }

    // G02：每轮带一份**落定后的棋盘快照**，页面才能逐轮播放而不是直接跳到终局。
    //   用 slice() 而非深拷贝：牌是对象、位置才是播放需要的；改属性（special）在轮次内已完成。
    rounds.push({
      lines: lines, removed: removed, specials: specials, spawned: spawned, drops: drops,
      cellsAfter: cells.slice()
    });
    poolIds = poolIds.filter(function (id) { return pool[id] > 0; });
    // ⚠️ 这里**不能**因为「池空了」就 break。
    //   池空只影响**下一轮补不补**，不影响**这一轮消完之后盘面上已经形成的线**。
    //   实测踩过：池一空就 break → 最后一轮连锁被吞掉（cascades 恒为 1），
    //   而「连锁」正是这次改造的核心卖点。收敛交给 while 顶部的 findLines 判定。
  }

  // 死局检测：还有牌但没有任何合法交换
  var stuck = false;
  var left = tally(cells);
  var any = Object.keys(left).length > 0;
  if (any && !hasMove(cells, cols, rows)) stuck = true;

  return {
    cols: cols, rows: rows,
    cells: cells, pool: pool, nextUid: nextUid, spent: spent,
    rounds: rounds, cascades: cascades, stuck: stuck
  };
}

module.exports = {
  findLines: findLines,
  specialFor: specialFor,
  swapCells: swapCells,
  swapMakesLine: swapMakesLine,
  adjacent: adjacent,
  hasMove: hasMove,
  seededRng: seededRng,
  challengeIdFor: challengeIdFor,
  shuffle: shuffle,
  reshuffle: reshuffle,
  ensurePlayable: ensurePlayable,
  objectiveFor: objectiveFor,
  compress: compress,
  tally: tally,
  resolve: resolve
};
