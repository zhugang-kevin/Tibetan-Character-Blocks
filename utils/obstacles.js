// utils/obstacles.js — 障碍物纯函数（冰霜 / 绳结 / 藏式木箱）
// 设计要点（与 PRD 3.1 对应，并保证关卡始终可推进）：
//   冰霜：罩住的牌不能直接点；相邻方块被消除一次即破冰。
//   绳结（D40：宗教符号红线下选用的世俗皮肤）：双股绳缠住的牌不能直接点；相邻方块每消除一次
//     松一股，两股都松开才算解开（hp 固定 2）。与木箱同为多段破坏，但视觉与文案
//     走「绳索」而不是「容器」，避免与木箱在同屏时读感重复。
//   木箱：罩住的牌不能直接点；相邻方块被消除一次扣 1 点耐久，耐久归零后破开。
// 放置规则：位置确定性（便于测试），不超过总格数 20%，且任意元素至少保留
//   2 张无遮挡的牌，避免出现"无解"盘面。
// 纯函数，不依赖 wx / DOM，页面与体验版镜像共用同一套规则。

function neighbors(index, cols, rows) {
  var row = Math.floor(index / cols);
  var col = index % cols;
  var out = [];
  if (col > 0) out.push(index - 1);
  if (col < cols - 1) out.push(index + 1);
  if (row > 0) out.push(index - cols);
  if (row < rows - 1) out.push(index + cols);
  return out;
}

// 把 n 个遮挡均匀铺在 total 格上（确定性：无随机，便于断言）
function spread(total, n, offset) {
  var out = [];
  for (var i = 0; i < n; i++) {
    var idx = Math.floor((i + 1) * total / (n + 1)) + (offset || 0);
    if (idx >= total) idx = idx % total;
    if (out.indexOf(idx) === -1) out.push(idx);
  }
  return out;
}

// 依据关卡配置生成遮挡计划：[{ index, kind, hp }]
// cfg.obstacles = { frost: 2, rope: 2, ropeHp: 2, crate: 2, crateHp: 2 }
function planOverlays(cfg, tileIds) {
  var cfgObs = cfg.obstacles || {};
  var total = cfg.cols * cfg.rows;
  var plan = [];
  var used = {};

  // 每种元素允许被遮挡的上限：总数 - 2（至少留 2 张可点）
  var quota = {};
  (tileIds || []).forEach(function (id) {
    if (quota[id] === undefined) quota[id] = 0;
    quota[id] += 1;
  });
  Object.keys(quota).forEach(function (id) {
    quota[id] = Math.max(0, quota[id] - 2);
  });

  var budget = Math.floor(total * 0.25); // 总遮挡上限 25%（保证至少 3/4 的牌可直接操作）
  function take(count, kind, hpFirst) {
    // 三种障碍各用不同 spread 偏移：确定性布点且互不错开成同一批格位
    var off = kind === 'frost' ? 0 : (kind === 'rope' ? 2 : 1);
    var placed = 0;
    function place(idxs) {
      idxs.forEach(function (idx) {
        if (placed >= count) return;
        if (plan.length >= budget) return;
        if (used[idx]) return;
        var id = (tileIds || [])[idx];
        if (id !== undefined && quota[id] <= 0) return; // 该元素可点的牌不足 2 张
        used[idx] = true;
        if (id !== undefined) quota[id] -= 1;
        plan.push({ index: idx, kind: kind, hp: kind === 'frost' ? 0 : (hpFirst || 1) });
        placed += 1;
      });
    }
    place(spread(total, count, off));
    // ⚠️ 足额补偿：与先放的同屏障碍撞位时，上面的候选会被静默跳过，配置数量就会缺额
    //（实测：第 9 关 frost 的 34 号位撞掉 rope 的 34 号位 → 配 2 实布 1）。
    // 从加长候选里补足；已足额的关卡走的还是原候选，布点不变。
    if (placed < count) place(spread(total, Math.min(total, count * 4 + 2), off));
  }

  if (cfgObs.frost) take(cfgObs.frost, 'frost', 0);
  if (cfgObs.rope) take(cfgObs.rope, 'rope', cfgObs.ropeHp || 2);
  if (cfgObs.crate) take(cfgObs.crate, 'crate', cfgObs.crateHp || 1);
  return plan;
}

// 牌是否被遮挡（不可直接点选）
function isBlocked(tile) {
  if (!tile) return false;
  if (tile.frost) return true;
  if (tile.rope > 0) return true;
  return !!(tile.crate && tile.crate > 0);
}

// 一次成功消除后结算遮挡：相邻冰霜破冰、相邻绳结松一股、相邻木箱扣耐久
// 返回 { tiles, changed:[{index,kind,hp,broken}] }（tiles 为新状态副本）
function resolveMatch(tiles, matchedIndexes, cols, rows) {
  var next = tiles.map(function (t) {
    var c = {};
    for (var k in t) if (Object.prototype.hasOwnProperty.call(t, k)) c[k] = t[k];
    return c;
  });
  var changed = [];
  var seen = {};
  (matchedIndexes || []).forEach(function (mi) {
    neighbors(mi, cols, rows).forEach(function (ni) {
      if (seen[ni]) return;
      var t = next[ni];
      if (!t || t.state === 'removed' || t.state === 'removing') return;
      if (t.frost) {
        t.frost = false;
        seen[ni] = true;
        changed.push({ index: ni, kind: 'frost', hp: 0, broken: true });
      } else if (t.rope > 0) {
        t.rope -= 1;
        seen[ni] = true;
        changed.push({ index: ni, kind: 'rope', hp: t.rope, broken: t.rope === 0 });
      } else if (t.crate > 0) {
        t.crate -= 1;
        seen[ni] = true;
        changed.push({ index: ni, kind: 'crate', hp: t.crate, broken: t.crate === 0 });
      }
    });
  });
  return { tiles: next, changed: changed };
}

module.exports = {
  neighbors: neighbors,
  planOverlays: planOverlays,
  isBlocked: isBlocked,
  resolveMatch: resolveMatch
};
