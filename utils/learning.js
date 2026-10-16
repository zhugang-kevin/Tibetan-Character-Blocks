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
var affix = require('../data/affixes');

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
    return pickPhrases(pools.phrase || [], s, kinds, L.stages || 10);
  }

  // ③a 含 前加/上加/下加 的组合（含 combo / review / L8 的 prefix+base+vowel）：
  //    必须走**合法组合池**（D110-bis，禁止笛卡尔积）。按模板从权威穷举表取合法音节，
  //    再轮转取本关内容。L9 从 SYLLABLE_PATTERNS[3] 起步；复习级按 lv 偏移避免 L14/L15 重样。
  //    注意：L5/L6/L7 自带 pools.legal（穷举好的合法池），应走下方 ③c，此处不截胡。
  var hasAffix = L.parts.indexOf('prefix') > -1 || L.parts.indexOf('super') > -1 || L.parts.indexOf('sub') > -1;
  var useLegal = (!pools.legal || !pools.legal.length) && (hasAffix || L.parts.indexOf('combo') > -1 || L.parts.indexOf('review') > -1);
  if (useLegal) {
    var pats = (L.patterns && L.patterns.length) ? L.patterns : data.SYLLABLE_PATTERNS;
    var off = L.parts.indexOf('review') > -1 ? (lv - 14) * 3
      : (L.parts.indexOf('combo') > -1 ? 3 : 0);
    var pat = pats[((s - 1) + off) % pats.length];
    var legal = legalSyllablesForPattern(pat, pools);
    return pickRotation(legal, s, kinds);
  }

  // ③c 合法组合级（D110）：上加字 / 前加字 / 下加字 与基字的搭配**不是任意的**。
  //   权威资料给的是穷举表 —— 上加字 ར 只能跟 12 个基字、ལ 跟 10 个、ས 跟 11 个；
  //   前加字 ག/ད/བ/མ/འ 各 11/6/10/11/10 个；下加字 ྱ/ྲ/ླ/ྭ 各 7/12/4/3 个。
  //   ⚠️ 此前这里走「附加字池 × 基字池」的**笛卡尔积**，实际生成过
  //      རཁ གཁ ངྱ ཅྲ ཆླ 这类**藏文里根本不成立**的音节 —— 等于在教不存在的字。
  //      改用 data/affixes.js 里穷举好的合法组合池（每条都有出处，由门禁逐条核对）。
  if (pools.legal && pools.legal.length) {
    return pickRotation(pools.legal, s, kinds);
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

// —— 句池专用取法（2026-10-15）——
// ⚠️ 为什么不能直接用 pickRotation：它是在池上**滑动窗口**（按关号右移一位）。
//    当窗口 ≥ 池大小时（L12/L13：池只有 5 句、窗口要 kinds = 6），每一关取到的都是**整个池**，
//    集合完全相同 → **10 关内容一模一样**（实测指纹全同，L12/L13 共 18 关受影响）。
//    改用**组合取子集**：池 5 句取 3 句共有 C(5,3) = 10 种，正好铺满 10 关 —— 关关不同，
//    且**一句新藏文都不用造**（沿用仓库里已有出处/已由用户录过的句子）。
//    池比窗口大时（L10/L11：10 词对窗口 6）仍走滑动窗口，行为一字不变。
function comb(n, k) {
  if (k < 0 || k > n) return 0;
  var r = 1;
  for (var i = 0; i < k; i++) r = r * (n - i) / (i + 1);
  return Math.round(r);
}
// 字典序第 idx 个（0 基）组合的下标数组
function comboAt(n, k, idx) {
  var res = [], start = 0;
  for (var i = 0; i < k; i++) {
    for (var v = start; v <= n - (k - i); v++) {
      var cnt = comb(n - v - 1, k - i - 1);
      if (idx < cnt) { res.push(v); start = v + 1; break; }
      idx -= cnt;
    }
  }
  return res;
}
function pickPhrases(pool, s, n, stages) {
  var m = pool.length;
  if (!m) return [];
  if (n < m) return pickRotation(pool, s, n);   // 窗口 < 池：沿用滑动窗口（L10/L11 等）
  var need = Math.max(1, stages || 10);
  var k = m;                                     // 取「组合数 ≥ 关数」的最大子集大小
  while (k > 1 && comb(m, k) < need) k--;
  var total = comb(m, k);
  var idx = (Math.max(1, Math.floor(s) || 1) - 1) % total;
  return comboAt(m, k, idx).map(function (i) { return pool[i]; });
}

// 七位骨架组装（顺序不可换：前加字 → 上加字 → 基字 → 下加字 → 元音 → 后加字 → 再后加字）
function assemble(sel) {
  return (sel.prefix || '') + (sel.super || '') + (sel.base || '') +
    (sel.sub || '') + (sel.vowel || '') + (sel.suffix || '') + (sel.second || '');
}

// D110-bis：按模板从权威穷举表生成**合法**音节，杜绝「附加字 × 基字」笛卡尔积非法组合
// （L8 的 prefix+base、L9 的完整音节、L14/L15 复习，此前走 comboTitles 独立取值会产出 རཅུ / སངྱུ / ཅྲེ 这类藏文里不成立的音节）。
// pattern 为部件数组（如 ['prefix','base','vowel']）；pools 可带 base 限制（如 L8 仅 ཀཁགང）。
function legalSyllablesForPattern(pattern, pools) {
  var has = function (p) { return pattern.indexOf(p) > -1; };
  var baseRestrict = (pools.base && pools.base.length) ? new Set(pools.base) : null;
  var units;
  if (has('prefix')) units = affix.PREFIX_LEGAL.map(function (s) { return { prefix: s.charAt(0), base: s.slice(1) }; });
  else if (has('super')) units = affix.SUPER_LEGAL.map(function (s) { return { super: s.charAt(0), base: s.slice(1) }; });
  else if (has('sub')) units = affix.SUB_LEGAL.map(function (s) { return { base: s.charAt(0), sub: s.slice(1) }; });
  else units = (pools.base || data.CONSONANTS).map(function (b) { return { base: b }; });
  if (baseRestrict) units = units.filter(function (u) { return baseRestrict.has(u.base); });

  var out = [];
  units.forEach(function (u) {
    var subChoices = [null];
    if (has('sub')) {
      if (u.sub) subChoices = [u.sub];                                   // 已来自 SUB_LEGAL（base+sub 合法）
      else subChoices = affix.SUB_LEGAL.filter(function (x) { return x.charAt(0) === u.base; }).map(function (x) { return x.slice(1); });
    }
    subChoices.forEach(function (sub) {
      var u2 = Object.assign({}, u); if (sub) u2.sub = sub;
      var vowels = has('vowel') ? data.VOWELS : [null];
      vowels.forEach(function (v) {
        var u3 = Object.assign({}, u2); if (v) u3.vowel = v;
        var suffixes = has('suffix') ? affix.SUFFIXES : [null];
        suffixes.forEach(function (sx) {
          var u4 = Object.assign({}, u3); if (sx) u4.suffix = sx;
          if (has('second') && sx && pools.second && pools.second[sx]) u4.second = pools.second[sx];
          var syl = assemble(u4);
          if (syl && out.indexOf(syl) === -1) out.push(syl);
        });
      });
    });
  });
  return out;
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