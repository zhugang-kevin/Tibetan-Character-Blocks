// utils/board.js — 盘面模型纯函数（下落式补充 · D33）
//
// 为什么要这个模块：
//   原盘面是「一次铺满、消完即结束」的静态网格，整局中途没有变化。D33 加入「下落 + 顶部补充」，
//   让盘面在整局中持续移动。规则全部收在这里，页面与体验版镜像共用同一套实现（同一契约）。
//
// 三条不变量（validate §31 与 test-h5 逐条机械断言）：
//   ① **偶数不变量**：任一时刻「盘面上某元素的张数」与「池中该元素的余量」都是偶数。
//      消除 = −2（同 id），补充 = +2（同 id）→ 不变量恒成立 → 盘面永远有对可配，**零死局**。
//      这就是本项目不需要「死局检测 / 洗牌」的原因。
//   ② **总量守恒**：盘面张数 + 池余量 + 已消除张数 = 关卡配比总数（= 教学内容量，整局不变）。
//   ③ **零自动连锁**：本模块只在玩家点击后调用，**不做任何「检测到同类就自动消」**。
//      原因见 docs/DECISIONS.md D33：配对判定（同类即消）比三消（三连成线）宽两个数量级，
//      自动连锁在配对盘面上的期望触发量会超过盘面本身（第 1 关 18.2 对 > 盘面共 12 对）。
//
// 盘面形态：cells 是 cols×rows 的 row-major 一维数组，空格为 null；
//   列内始终「上空下满」连续排列（牌永远堆在列的底部）——由 collapse 的落点规则保证，
//   见 collapse 里 refillColumns 的注释。这条形态断言同样由门禁机械校验。
//
// 纯函数，不依赖 wx / DOM。

// 补充池 = 格数 / 4（向上取到偶数）。太少则「补充」看不出效果，太多则一局被拉长。
var POOL_DIV = 4;

function sum(o) {
  var s = 0;
  for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) s += o[k];
  return s;
}

function poolSize(cols, rows) {
  var slots = cols * rows;
  return Math.max(2, Math.ceil(slots / POOL_DIV / 2) * 2);
}

// 依据关卡配比规划「初始盘面给几张 / 池里留几张」，两端都是偶数。
// 确定性：不随机。每步给「池余地最大」的元素 +2；同余地取「已给最少」的；再同取配比靠前的。
function planCounts(cfg) {
  var ids = cfg.elements.map(function (e) { return e[0]; });
  var quota = {};
  var total = 0;
  cfg.elements.forEach(function (e) { quota[e[0]] = e[1]; total += e[1]; });

  var slots = cfg.cols * cfg.rows;
  var give = {};
  ids.forEach(function (id) { give[id] = 0; });

  // ① 保底：每种元素至少给 2 张（开局就能看到该元素，且它在开局就有对可配）
  var baseBudget = Math.min(slots, 2 * ids.length);
  var byQuota = ids.slice().sort(function (a, b) {
    return (quota[b] - quota[a]) || (ids.indexOf(a) - ids.indexOf(b));
  });
  byQuota.forEach(function (id) {
    if (quota[id] < 2) return;
    if (sum(give) + 2 > baseBudget) return;
    give[id] = 2;
  });

  // ② 轮转补齐到「正好铺满 cols×rows」——初始盘面必须是满的，
  //    这样开局没有空洞，秘境揭图从 0% 起步（空一格才透出一格）
  var guard = 0;
  while (sum(give) + 2 <= slots && guard++ < 100000) {
    var best = null;
    ids.forEach(function (id) {
      var room = quota[id] - give[id];
      if (room < 2) return;
      if (best === null) { best = id; return; }
      var bRoom = quota[best] - give[best];
      if (room > bRoom || (room === bRoom && give[id] < give[best])) best = id;
    });
    if (best === null) break;
    give[best] += 2;
  }

  var pool = {};
  ids.forEach(function (id) { pool[id] = quota[id] - give[id]; });
  return { ids: ids, quota: quota, total: total, slots: slots, give: give, pool: pool };
}

// 构造开局盘面：按 give 出牌 → 洗牌 → 铺满 cells（长度恰好 = cols×rows）
//   create(id, uid) → 该格的牌对象（页面传入带显示字段；测试传最小实现）
//   rng()           → [0,1)，可注入以便断言
function createLevel(cfg, create, rng) {
  var plan = planCounts(cfg);
  var rand = rng || Math.random;
  var bag = [];
  plan.ids.forEach(function (id) {
    for (var k = 0; k < plan.give[id]; k++) bag.push(id);
  });
  for (var i = bag.length - 1; i > 0; i--) {
    var j = Math.floor(rand() * (i + 1));
    var tmp = bag[i]; bag[i] = bag[j]; bag[j] = tmp;
  }
  var make = create || function (id, u) { return { id: id, uid: u }; };
  var uid = 1;
  var cells = bag.map(function (id) { return make(id, uid++); });
  while (cells.length < plan.slots) cells.push(null);

  return {
    cols: cfg.cols,
    rows: cfg.rows,
    total: plan.total,
    slots: plan.slots,
    pool: plan.pool,
    cells: cells,
    nextUid: uid,
    spent: 0,
    plan: plan
  };
}

function poolLeft(pool) {
  return sum(pool || {});
}

// 池余量 ≥ 2 的元素 id（一次性必须成对取，否则破坏偶数不变量）
function poolIds(pool) {
  var out = [];
  for (var k in pool) {
    if (Object.prototype.hasOwnProperty.call(pool, k) && pool[k] >= 2) out.push(k);
  }
  return out;
}

function columnHeight(cells, cols, rows, c) {
  var n = 0;
  for (var r = 0; r < rows; r++) if (cells[r * cols + c]) n++;
  return n;
}

// 补充落哪几列：先落「本次被消掉牌的那几列」（保序、去重），不够再按「最矮的列优先」补齐。
// 返回的是「有空位的列」的优先级顺序（调用方据此决定每列放几张）。
function refillColumns(cells, cols, rows, removedIndexes, n) {
  var out = [];
  var used = {};
  var cols0 = [];
  (removedIndexes || []).forEach(function (i) {
    var c = i % cols;
    if (cols0.indexOf(c) === -1) cols0.push(c);
  });
  cols0.sort(function (a, b) { return a - b; });
  cols0.forEach(function (c) {
    if (out.length >= n) return;
    if (columnHeight(cells, cols, rows, c) >= rows) return;   // 该列已满，没有空位
    out.push(c); used[c] = 1;
  });
  while (out.length < n) {
    var best = -1;
    var bestH = Infinity;
    for (var c2 = 0; c2 < cols; c2++) {
      if (used[c2]) continue;
      var hh = columnHeight(cells, cols, rows, c2);
      if (hh >= rows) continue;          // 该列已满，没有空位
      if (hh < bestH) { bestH = hh; best = c2; }
    }
    if (best < 0) break;
    out.push(best); used[best] = 1;
  }
  return out;
}

// 规划「这 n 张补充牌分别落在哪个格号」——必须**先整体规划再落子**。
// 为什么不能边落边算：一对牌偶尔会竖着落在同一列（同行配对是任意两张同 id，
// 没有相邻要求）。此时「被消的列」只有 1 个，若按「take=2 但只有 1 列可用」硬落，
// 只会落 1 张、池里却少 1 张 → 池余量变奇数 → **偶不变被打破 → 盘面出现零死局**。
// 正确做法：只有 1 列可用时就在同一列叠两张（下→上），保证「成对取、成对落」。
function planRefillCells(cells, cols, rows, removedIndexes, n) {
  var order = refillColumns(cells, cols, rows, removedIndexes, cols);
  var out = [];
  var perCol = {};
  var guard = 0;
  // 第一轮：每列放 1 张（尽量分开放，不「贴脸送对」）；
  // 第二轮：若只有一列有空位，就回到该列叠第 2 张。
  while (out.length < n && guard++ < cols * 2 + 4) {
    var progressed = false;
    for (var oi = 0; oi < order.length && out.length < n; oi++) {
      var c = order[oi];
      var used = perCol[c] || 0;
      if (used >= 2) continue;
      var row = rows - columnHeight(cells, cols, rows, c) - 1;
      if (row < 0) continue;
      var gi = row * cols + c;
      out.push(gi);
      perCol[c] = used + 1;
      cells[gi] = { id: '__pending__', uid: -1 };   // 占位，仅供高度计算
      progressed = true;
    }
    if (!progressed) break;
  }
  // 清掉占位（调用方会写入真牌）
  out.forEach(function (gi) { cells[gi] = null; });
  return out;
}

// 一次消除后的结算：列内向下压缩 + 顶部从池补充
//   state          createLevel / 上一次 collapse 的返回值
//   removedIndexes 本次被消除的格号（长度 2）
//   opts.create    同 createLevel；opts.rng 同
// 返回 { cells, pool, nextUid, spent, drops, spawned, removed, floating }
//   drops:   [{ index, drop }]     该格的新内容从上方 drop 格处落下来（播放下落动画用）
//   spawned: [{ index, id, uid }]  该格是池中新补入的牌（额外播淡入）
//   floating: 防御性检查——「该格有牌、但它同列上方还有空格」的格号列表（正常恒为空）
function collapse(state, removedIndexes, opts) {
  opts = opts || {};
  var cols = state.cols;
  var rows = state.rows;
  var cells = state.cells.slice();
  var create = opts.create || function (id, u) { return { id: id, uid: u }; };
  var rand = opts.rng || Math.random;
  var nextUid = state.nextUid;
  var pool = {};
  for (var k in state.pool) if (Object.prototype.hasOwnProperty.call(state.pool, k)) pool[k] = state.pool[k];

  var removed = (removedIndexes || []).slice();
  removed.forEach(function (i) { cells[i] = null; });

  var drops = [];

  // ① 列内向下压缩：每列独立「从下往上堆」，牌之间的相对顺序不变
  for (var c = 0; c < cols; c++) {
    var stack = [];
    for (var r = rows - 1; r >= 0; r--) {
      var idx = r * cols + c;
      if (cells[idx]) stack.push({ tile: cells[idx], from: r });
    }
    for (var t = 0; t < rows; t++) cells[t * cols + c] = null;
    for (var s = 0; s < stack.length; s++) {
      var to = rows - 1 - s;
      cells[to * cols + c] = stack[s].tile;
      if (to !== stack[s].from) drops.push({ index: to * cols + c, drop: to - stack[s].from });
    }
  }

  // ② 从池补充：本次消掉几张就补几张（池不足则不补，盘面自行收缩 → 最终清空通关）
  //    ⚠️ 必须「整对取、整对落」：池里每种元素的余量恒为偶数，一次只取 2 张同 id 才能维持；
  //       落点先整体规划（planRefillCells），单列可用时同列叠两张。
  var spawned = [];
  var landings = planRefillCells(cells, cols, rows, removed, removed.length);
  if (landings.length === removed.length) {
    var ids = poolIds(pool);
    if (ids.length) {
      var pickId = ids[Math.floor(rand() * ids.length)];
      for (var h = 0; h < landings.length; h++) {
        var gi = landings[h];
        var tile = create(pickId, nextUid++);
        cells[gi] = tile;
        pool[pickId] -= 1;
        drops.push({ index: gi, drop: Math.floor(gi / cols) + 1 });
        spawned.push({ index: gi, id: pickId, uid: tile.uid });
      }
    }
  }
  // landings 不足（理论上不会发生：刚空出 2 格）：本回合不补，池保持偶数、盘面自行收缩

  // ③ 防御性检查：列内不得出现悬空牌。
  //    重力向下 → 合法形态是「上空下满」，即从列顶往下扫应当先见空格再见牌；
  //    一旦「先见牌、再见空格」，说明有牌悬在空格之上。正常流程恒为空。
  var floating = [];
  for (var cc = 0; cc < cols; cc++) {
    var seenFilled = false;
    for (var rr = 0; rr < rows; rr++) {
      var ii = rr * cols + cc;
      if (cells[ii]) seenFilled = true;
      else if (seenFilled) floating.push(ii);
    }
  }

  return {
    cols: cols,
    rows: rows,
    total: state.total,
    slots: state.slots,
    cells: cells,
    pool: pool,
    nextUid: nextUid,
    spent: (state.spent || 0) + removed.length,
    drops: drops,
    spawned: spawned,
    removed: removed,
    floating: floating
  };
}

function countTiles(cells) {
  var n = 0;
  for (var i = 0; i < cells.length; i++) if (cells[i]) n++;
  return n;
}

// 盘面上各元素张数
function tally(cells) {
  var out = {};
  for (var i = 0; i < cells.length; i++) {
    var t = cells[i];
    if (!t) continue;
    out[t.id] = (out[t.id] || 0) + 1;
  }
  return out;
}

// 只读诊断：当前盘面是否还存在可配对（任意两张同 id）。偶数不变量成立时恒为 true。
// ⚠️ 这只是诊断，**不触发任何消除**（自动连锁已在 D33 明确否决）。
function hasPair(cells) {
  var seen = {};
  for (var i = 0; i < cells.length; i++) {
    var t = cells[i];
    if (!t) continue;
    if (seen[t.id]) return true;
    seen[t.id] = 1;
  }
  return false;
}

// 门禁用：偶数不变量 + 总量守恒 + 列内连续（无悬空）
function checkInvariants(state) {
  var onBoard = tally(state.cells);
  var keys = {};
  Object.keys(onBoard).forEach(function (k) { keys[k] = 1; });
  Object.keys(state.pool || {}).forEach(function (k) { keys[k] = 1; });
  var evenOK = true;
  Object.keys(keys).forEach(function (k) {
    if ((onBoard[k] || 0) % 2 !== 0) evenOK = false;
    if (((state.pool || {})[k] || 0) % 2 !== 0) evenOK = false;
  });
  var contig = true;
  for (var c = 0; c < state.cols; c++) {
    var seenFilled = false;
    for (var r = 0; r < state.rows; r++) {
      var i = r * state.cols + c;
      if (state.cells[i]) seenFilled = true;
      else if (seenFilled) contig = false;
    }
  }
  return {
    even: evenOK,
    conserved: countTiles(state.cells) + poolLeft(state.pool) + (state.spent || 0) === state.total,
    contiguous: contig,
    onBoard: onBoard,
    onBoardCount: countTiles(state.cells),
    poolLeft: poolLeft(state.pool)
  };
}

module.exports = {
  POOL_DIV: POOL_DIV,
  poolSize: poolSize,
  planCounts: planCounts,
  createLevel: createLevel,
  collapse: collapse,
  poolLeft: poolLeft,
  poolIds: poolIds,
  columnHeight: columnHeight,
  refillColumns: refillColumns,
  planRefillCells: planRefillCells,
  countTiles: countTiles,
  tally: tally,
  hasPair: hasPair,
  checkInvariants: checkInvariants
};
