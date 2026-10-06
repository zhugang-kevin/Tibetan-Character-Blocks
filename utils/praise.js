// utils/praise.js — 消除情绪激励（即时赞美）的纯逻辑
//
// 为什么要有这一层：页面与体验版镜像要跑**同一套**「连击 → 档位 → 文案 → 频率」判定，
// 判定全部收在这里，两端只负责把结果画出来 / 播出来。纯函数，不依赖 wx / DOM。
//
// ── 连击为什么要带「时间窗口」（这是本模块存在的核心理由）──────────────────
// 本项目的配对判定是「任意两张同 id」（无相邻要求），比三消宽两个数量级
// （见 docs/DECISIONS.md D33）。因此「连续成功消除」几乎不发生中断：
//   实测（scripts 里的 10 关种子化模拟）：正确率 90% 时连击率 87%，最高档占 56%；
//   正确率 100% 时最高档占 84%。→ 纯按连击数分级，最高档会变成默认态，阶梯没有梯度。
// 所以连击必须再加一个「时间」断链条件：距上次成功消除 ≤ 窗口才算连着，超时归零。
//
// ── 窗口为什么按「元素种类数」缩放 ────────────────────────────────────────
// 窗口必须**短于**「找一对」的典型耗时，否则照样不断链。
// 而找一对的耗时主要取决于盘面上有多少种元素（种类越多越难找）：
//   第 1 关 2 种（很好找）→ 第 10 关 12 种（难找）。
// 标定过程（scripts 里的窗口扫描）：固定窗口无法同时服务两端——
//   800ms 时第 10 关永不连击（阶梯消失），2500ms 时第 1 关 57% 冲顶（阶梯退化）。
// 改用 windowMs = clamp(600 + 160 × 种类数, 900, 2600) 后，10 关的档位分布几乎一致：
//   等级1 ≈ 55% / 等级2 ≈ 25% / 等级3 ≈ 11% / 等级4 ≈ 4% / 等级5 ≈ 4%。
//
// ⚠️ WINDOW_BASE / WINDOW_STEP 是**唯一的调参旋钮**：系数按体感取的初值，
//    上线后应当用真实点按间隔校准（敏感性表见 D34）。
var data = require('../data/praise');

var WINDOW_BASE = 600;
var WINDOW_STEP = 160;
var WINDOW_MIN = 900;
var WINDOW_MAX = 2600;

// 两条赞美之间的最小展示间隔（与浮字动画时长对齐，避免文字互相覆盖）
var PRAISE_GAP_MS = 1100;
// 等级 1（孤立消除）的展示概率——它是最高频档，全量展示会退化成「每次都弹」
var TIER1_PROB = 0.3;

// 档位 → 音效名（新音手鼓 / 法号 / 欢呼由 scripts/make_praise_audio.py 程序合成）
// 同一档内不换音：级别 5 与 4 共用「欢呼」，只是不再往上升。
var TIER_SOUND = ['', 'match', 'drum', 'horn', 'cheer', 'cheer'];

function windowMsOf(types) {
  var n = Math.max(0, Number(types) || 0);
  return Math.max(WINDOW_MIN, Math.min(WINDOW_MAX, WINDOW_BASE + WINDOW_STEP * n));
}

// 时间窗口连击：距上次成功消除 ≤ 窗口才累加，否则从 1 重新开始。
// prev = { combo, at }；at 为 null 表示「本局还没有过成功消除」。
function nextCombo(prev, now, windowMs) {
  var p = prev || {};
  var at = p.at == null ? null : p.at;
  var win = windowMs == null ? WINDOW_MIN : windowMs;
  var chained = at != null && (now - at) >= 0 && (now - at) <= win;
  return { combo: chained ? (p.combo || 0) + 1 : 1, at: now };
}

// 错配 / 开局：链条断掉
function reset() {
  return { combo: 0, at: null };
}

// 档位 1..5（≥5 全部归到最高档）
function tierOf(combo) {
  var n = Number(combo) || 0;
  if (n <= 1) return 1;
  if (n >= 5) return 5;
  return n;
}

function tierAt(level) {
  var lv = tierOf(level);
  for (var i = 0; i < data.tiers.length; i++) {
    if (data.tiers[i].level === lv) return data.tiers[i];
  }
  return data.tiers[data.tiers.length - 1];
}

function tierCount() {
  return data.tiers.length;
}

// 抽取：同一条文案不连续出现两次（在同一档内保证）。
// rand 可注入，便于门禁做确定性断言。
function pickIndex(level, lastIndex, rand) {
  var n = tierAt(level).texts.length;
  if (n <= 1) return 0;
  var r = (rand || Math.random)();
  r = Math.max(0, Math.min(0.999999, r));
  var i = Math.floor(r * n);
  if (i === lastIndex) i = (i + 1) % n;
  return i;
}

function pick(level, lastIndex, rand) {
  var lv = tierOf(level);
  var i = pickIndex(lv, lastIndex, rand);
  var e = tierAt(lv).texts[i];
  return { level: lv, index: i, zh: e.zh, bo: e.bo };
}

// 频率控制：这一条要不要展示？
//   规则 ①「档位跃迁」强制执行（等级 2 起）——阶梯往上跳是稀有事件，值得打断；
//   规则 ② 其余情况先过最小间隔（距上次展示 < PRAISE_GAP_MS 就丢弃）；
//   规则 ③ 等级 1 再过一道概率闸门（它是最高频档）。
// 注意：等级 1 不算跃迁（否则每次孤立消除都会弹，退化成「每次都弹」）。
function shouldShow(level, prevTier, sinceMs, rand) {
  var lv = tierOf(level);
  var escalated = lv > 1 && lv > (Number(prevTier) || 0);
  if (escalated) return true;
  if (sinceMs != null && sinceMs < PRAISE_GAP_MS) return false;
  if (lv === 1) return (rand || Math.random)() < TIER1_PROB;
  return true;
}

// 等级 3 起显示藏文大字；等级 4 起加档位跃迁的强调视觉
function showsTibetan(level) { return tierOf(level) >= 3; }
function showsBurst(level) { return tierOf(level) >= 4; }
function audioFor(level) { return TIER_SOUND[tierOf(level)] || 'match'; }

function initState() {
  return { combo: reset(), prevTier: 0, lastShownAt: null, lastIndex: {}, maxCombo: 0 };
}

// 一站式决策：喂一次「成功消除」，返回新的状态 + 该不该展示 + 展示什么。
// 两端（小程序页 / H5 镜像）共用这一个函数，避免判定逻辑漂移。
function onMatch(state, now, types, rand) {
  var s = state || initState();
  var comboState = nextCombo(s.combo, now, windowMsOf(types));
  var level = tierOf(comboState.combo);
  var since = s.lastShownAt == null ? null : now - s.lastShownAt;
  var show = shouldShow(level, s.prevTier, since, rand);

  var out = {
    combo: comboState,
    level: level,
    maxCombo: Math.max(s.maxCombo || 0, comboState.combo),
    tibetan: showsTibetan(level),
    burst: showsBurst(level),
    sound: audioFor(level),
    show: show,
    text: null,
    prevTier: level,
    lastShownAt: s.lastShownAt == null ? null : s.lastShownAt,
    lastIndex: s.lastIndex || {}
  };
  if (show) {
    var p = pick(level, out.lastIndex[level], rand);
    out.text = p;
    var li = {};
    for (var k in out.lastIndex) if (Object.prototype.hasOwnProperty.call(out.lastIndex, k)) li[k] = out.lastIndex[k];
    li[level] = p.index;
    out.lastIndex = li;
    out.lastShownAt = now;
  }
  return out;
}

// 错配 / 开局重置：连击清零、档位归零（下一次消除从等级 1 重新起步）
function onMiss(state) {
  var s = state || initState();
  return {
    combo: reset(),
    prevTier: 0,
    lastShownAt: s.lastShownAt == null ? null : s.lastShownAt,
    lastIndex: s.lastIndex || {},
    maxCombo: s.maxCombo || 0
  };
}

module.exports = {
  WINDOW_BASE: WINDOW_BASE,
  WINDOW_STEP: WINDOW_STEP,
  WINDOW_MIN: WINDOW_MIN,
  WINDOW_MAX: WINDOW_MAX,
  PRAISE_GAP_MS: PRAISE_GAP_MS,
  TIER1_PROB: TIER1_PROB,
  windowMsOf: windowMsOf,
  nextCombo: nextCombo,
  reset: reset,
  tierOf: tierOf,
  tierAt: tierAt,
  tierCount: tierCount,
  pickIndex: pickIndex,
  pick: pick,
  shouldShow: shouldShow,
  showsTibetan: showsTibetan,
  showsBurst: showsBurst,
  audioFor: audioFor,
  initState: initState,
  onMatch: onMatch,
  onMiss: onMiss
};
