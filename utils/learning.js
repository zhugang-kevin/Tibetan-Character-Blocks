// utils/learning.js — 学习体系关卡生成（15 级 × 150 关，纯函数 · 确定性）
//
// 输入：级别 lv（1..15）+ 关序 stage（1..stagesOf(lv)）；输出：一局的完整盘面配置 + 生字表。
// 输出的 elements 为 [[id, count]]，**与 data/levels.js 同形**，可直接喂给 utils/board.js
// 的 createLevel —— 棋盘逻辑（下落 / 补充 / 偶数不变量）一行不改，全部沿用。
//
// 三条守恒（与既有门禁 §31 同口径，由 scripts/validate.js §42 机械校验）：
//   ① 每种元素出现次数均为偶数（保证开局有对可配、零死局）
//   ② 总牌数 = 格数 + 补充池，补充池 = ceil(格数 / 4 / 2) × 2（与 utils/board.js 的 POOL_DIV 一致）
//   ③ 每种元素至少 2 张（开局就能看到它）
//
// 牌数 = 「教学内容量」：格子越多一局越长、认字重复越多
//   6×6 → 36 格 +10 池 = 46 张 / 23 对
//   5×5 → 25 格 + 8 池 = 33 张（见下方 evenize 处理）
//   4×4 → 16 格 + 4 池 = 20 张 / 10 对   ← 用户给的 L8 第 1 关样例正是「消除 10 个组合」
//   3×3 →  9 格 + 4 池 = 13 张（见下方 evenize 处理）
// 注意：奇数格数的盘面 + 池不为偶时，用 evenize 把总数调到偶数（溢出的一张给「本关主角」）。
//
// 步数预算 = ceil(对数 × 2.5)：无失误清干净需要对数次尝试，留 1.5 倍容错.
//   L8 第 1 关 10 对 × 2.5 = 25 步 —— 与用户给的样例完全吻合。
//
// 确定性：不含 Math.random。本关内容由 (lv, stage) 唯一决定（同 devices 同两块盘）。
var data = require('../data/learning');

// 组合 / 复习级用的完整池（各部件全集）
var FULL_POOLS = {
  prefix: data.PREFIXES, super: data.SUPERS, base: data.CONSONANTS,
  sub: data.SUBS, vowel: data.VOWELS, suffix: data.SUFFIXES, second: data.SECOND_SUFFIX
};

var STEP_MULT = 2.5;      // 步数预算倍数（10 对 → 25 步，与用户样例一致）

function num(v, d) {
  var n = typeof v === 'number' ? v : parseFloat(v);
  return (typeof n === 'number' && !isNaN(n) && isFinite(n)) ? n : d;
}

// 每盘最多几种元素（越少越好找对；级别越高内容越多）
var KIND_BY_LEVEL = [
  { from: 1, to: 1, kinds: 3 },
  { from: 2, to: 3, kinds: 4 },
  { from: 4, to: 7, kinds: 5 },
  { from: 8, to: 10, kinds: 6 },
  { from: 11, to: 15, kinds: 6 }
];
function kindsOf(lv) {
  for (var i = 0; i < KIND_BY_LEVEL.length; i++) {
    if (lv >= KIND_BY_LEVEL[i].from && lv <= KIND_BY_LEVEL[i].to) return KIND_BY_LEVEL[i].kinds;
  }
  return 6;
}

function poolAndTotal(cols, rows) {
  var cells = cols * rows;
  var pool = Math.max(2, Math.ceil(cells / 4 / 2) * 2);
  var total = cells + pool;
  return { cells: cells, pool: pool, total: total };
}

// 总数若为奇数，+1 到偶数（多加的一张给主角，保证仍满足「每种偶数」由下面的分配负责）
function evenize(n) { return n % 2 === 0 ? n : n + 1; }

// ---------------------------------------------------------------- 内容：本关生字表
// 返回本关要出现的「字串数组」（已按 (lv, stage) 确定性挑选），长度 ≤ kindsOf(lv)
function titlesFor(lv, stage) {
  var L = data.byLevel(lv);
  if (!L) return [];
  var pools = L.pools || {};
  var s = Math.max(1, Math.min(L.stages, Math.floor(num(stage, 1))));
  var kinds = kindsOf(lv);

  // ① L1：一关三个新辅音（第 n 关 = 第 3n-2 ~ 3n 个），另带已学字母复习
  if (L.perStage === 'three') {
    var b2 = pools.base || data.CONSONANTS;
    var out2 = [];
    for (var j = 0; j < 3; j++) out2.push(b2[((s - 1) * 3 + j) % b2.length]);
    // 复习：把上一关的主角带一个回来（级不烧：新 3 + 复习 1，符合 4 种上限）
    var rv = b2[((s - 1) * 3 - 1 + b2.length * 2) % b2.length];
    if (kinds > out2.length && out2.indexOf(rv) === -1) out2.push(rv);
    return out2.slice(0, kinds);
  }

  // ② 词 / 句：直接取池里的真词真句（curated）
  if (L.parts.indexOf('word') > -1) {
    return pickRotation(pools.word || [], s, kinds);
  }
  if (L.parts.indexOf('phrase') > -1) {
    return pickRotation(pools.phrase || [], s, kinds);
  }

  // ③a 组合 / 复习级：走**真实叠加模板**（3~4 部件），杜绝七位全叠的不成立音节
  if (L.parts.indexOf('combo') > -1 || L.parts.indexOf('review') > -1) {
    var pats = (L.patterns && L.patterns.length) ? L.patterns : data.SYLLABLE_PATTERNS;
    // 每关一套模板。L9（完整音节）从「前加字+基字+元音+后加字」这一档起步，
    // 避免第 1 关退回两部件的入门难度；复习级按 lv 偏移，让 L14 / L15 不重样。
    var off = L.parts.indexOf('review') > -1 ? (lv - 14) * 3 : 3;
    var pat = pats[((s - 1) + off) % pats.length];
    return comboTitles({ parts: pat, pools: FULL_POOLS }, s, kinds);
  }

  // ④ 拼合音节：每种组合 = 前加字 / 上加字 / 基字 / 下加字 / 元音 / 后加字 / 再后加字 的子集
  return comboTitles(L, s, kinds);
}

// 轮转取 n 个（从第 s 个开始，ring buffer），不足则整池
function pickRotation(pool, s, n) {
  if (!pool.length) return [];
  var out = [];
  for (var i = 0; i < n && i < pool.length; i++) out.push(pool[((s - 1) + i) % pool.length]);
  return out;
}

// 七位骨架组装（顺序不可换：前加字 → 上加字 → 基字 → 下加字 → 元音 → 后加字 → 再后加字）
function assemble(sel) {
  return (sel.prefix || '') + (sel.super || '') + (sel.base || '') +
    (sel.sub || '') + (sel.vowel || '') + (sel.suffix || '') + (sel.second || '');
}

function comboTitles(L, s, kinds) {
  var pools = L.pools || {};
  var parts = L.parts;
  var out = [];
  var seen = {};
  var guard = 0;
  for (var k = 0; k < kinds * 4 && out.length < kinds && guard < 200; guard++) {
    var sel = {};
    parts.forEach(function (p, pi) {
      if (p === 'second') {
        // 再后加字必须与前一个后加字相配（ག ང བ མ → ས；ན ར ལ → ད），否则不加
        var map = pools.second || {};
        if (sel.suffix && map[sel.suffix]) sel.second = map[sel.suffix];
        return;
      }
      var pool = pools[p] || [];
      if (!pool.length) return;
      var idx = (s - 1 + k + pi) % pool.length;
      sel[p] = pool[idx];
    });
    var title = assemble(sel);
    if (title && !seen[title]) { seen[title] = 1; out.push(title); }
    k++;
  }
  if (out.length < 2) {   // 兜底：任何情况下至少有 2 种内容（否则不成局）
    var bases = pools.base || data.CONSONANTS;
    out = [bases[(s - 1) % bases.length], bases[s % bases.length]];
  }
  return out;
}

// ---------------------------------------------------------------- 分配：每种几张
// 总数为 evenized 值；先给每种 2 张，再把余量按「主角优先」成对分下去（全偶数）
function distribute(titles, total) {
  var n = titles.length;
  var counts = [];
  for (var i = 0; i < n; i++) counts.push(2);
  var left = evenize(total) - 2 * n;
  var i2 = 0;
  while (left >= 2) {
    counts[i2 % n] += 2;
    left -= 2;
    i2++;
  }
  return counts;
}

// ---------------------------------------------------------------- 对外：生成一关
function buildStage(lv, stage) {
  var L = data.byLevel(lv);
  if (!L) return null;
  var s = Math.max(1, Math.min(L.stages, Math.floor(num(stage, 1))));
  var geo = poolAndTotal(L.cols, L.rows);
  var titles = titlesFor(lv, s);
  var counts = distribute(titles, geo.total);
  var total = counts.reduce(function (a, b) { return a + b; }, 0);
  // id：`lrn_{lv}_{stage}_{序号}` —— 不含藏文，便于日志 / 存储；显示字串在 tiles 里带上
  var elements = titles.map(function (t, i) { return ['lrn_' + lv + '_' + s + '_' + i, counts[i]]; });
  var tiles = {};
  titles.forEach(function (t, i) { tiles[elements[i][0]] = { type: 'letter', tibetan: t, color: colorOf(i), char: '' }; });
  var pairs = total / 2;
  return {
    lv: lv,
    stage: s,
    index: cumulativeIndex(lv, s),
    name: L.name,
    goal: L.goal,
    // ↓ utils/board.js 认的形状
    cols: L.cols,
    rows: L.rows,
    elements: elements,
    // ↑ 以上四项即 createLevel 所需
    tiles: tiles,
    titles: titles,
    total: total,
    pairs: pairs,
    steps: Math.ceil(pairs * STEP_MULT),
    cellPx: L.cellPx,
    curated: L.curated
  };
}

// 四张达标牌面色循环（与 data/elements.js 同色，不动 §30 对比度门禁）
var PALETTE = ['#C0392B', '#176B3C', '#2471A3', '#8A6A12'];
function colorOf(i) { return PALETTE[i % PALETTE.length]; }

// 全局序号（1..150）：方便存 progress 与证书判断
function cumulativeIndex(lv, stage) {
  var n = 0;
  for (var i = 1; i < lv; i++) n += stagesOf(i);
  return n + Math.max(1, Math.min(stagesOf(lv), Math.floor(num(stage, 1))));
}

function stagesOf(lv) {
  var L = data.byLevel(lv);
  return L ? L.stages : 0;
}

function buildLevel(lv) {
  var L = data.byLevel(lv);
  if (!L) return null;
  var out = [];
  for (var s = 1; s <= L.stages; s++) out.push(buildStage(lv, s));
  return {
    lv: lv, name: L.name, goal: L.goal, stages: L.stages,
    cols: L.cols, rows: L.rows, cellPx: L.cellPx,
    list: out
  };
}

module.exports = {
  STEP_MULT: STEP_MULT,
  PALETTE: PALETTE,
  kindsOf: kindsOf,
  stagesOf: stagesOf,
  cumulativeIndex: cumulativeIndex,
  titlesFor: titlesFor,
  distribute: distribute,
  buildStage: buildStage,
  buildLevel: buildLevel,
  totalStages: function () { return data.totalStages(); }
};
