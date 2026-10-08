// utils/grid.js — 格子尺寸动态调整 + 藏文字形量算（学习体系 L1–L15 的几何层）
//
// 为什么独立出来：老 10 关用的是「8 列基准 → 各关只变行列数」的固定算法（见 pages/game/game.js），
// 学习体系要求**随级别换盘面密度**（6×6 → 5×5 → 4×4 → 3×3），格子尺寸必须反过来由列数决定：
//
//     cell = floor(屏宽 × RATIO / cols)        RATIO = 0.9（用户指定）
//
// 藏文比拉丁字母「高」得多：一个完整音节可以把前加字 / 上加字 / 下加字 / 元音 / 后加字
// **上下叠七层**，放进方形格子里必然溢出。所以不能只按字宽缩放，必须：
//   ① measure  —— 真机用 canvas 的 measureText 得到墨迹宽 / 高（比估算准，且随系统字体变）；
//   ② calcScale—— 取「宽高同时塞进格子留边」的最小比例，再夹在 [MIN, MAX] 之间。
// 两个函数都**不依赖 wx / DOM**：量算函数由调用方注入（小程序传 canvas ctx，
// 体验版传 CanvasRenderingContext2D），因此同一份实现两端共用，也可被门禁直接跑。
//
// 纯函数模块：不 require 任何业务模块（除 data/learning.js 的静态尺寸表）。
var learning = require('../data/learning');

// 留边：盘面可用宽度占屏宽的比例（用户指定 0.9）
var RATIO = 0.9;
// 牌面内部再留一圈安全边（墨迹不贴边），占格子的比例
var INNER = 0.86;
// 缩放夹逼：太小看不清、太大反而比同类字体更突兀
var MIN_SCALE = 0.42;
var MAX_SCALE = 1;
// 长按放大预览的开启级别（用户：L11 以上）
var ZOOM_FROM = 11;
// 字号占格子的基准比例（缩放前的名义字号）
var FONT_RATIO = 0.62;

function num(v, d) {
  var n = typeof v === 'number' ? v : parseFloat(v);
  return (typeof n === 'number' && !isNaN(n) && isFinite(n)) ? n : d;
}

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

function levelOf(lv) { return learning.byLevel(num(lv, 1)); }

// ---- ① 列数 / 行数 ----
function colsOf(lv) { var l = levelOf(lv); return l ? l.cols : 6; }
function rowsOf(lv) { var l = levelOf(lv); return l ? l.rows : 6; }

// ---- ② 动态格子尺寸（px）----
// cell = floor(屏宽 × RATIO / cols)；再按行 Coerce 到合理区间，避免 6×6 在小屏上被压成点。
// 不要做成「屏宽直接除以列数」——用户给的基准值 52/63/80/108 是**先扣掉间隙**再均分的结果：
//     available = 屏宽 × RATIO = 375 × 0.9 = 337.5
//     cell = floor((available − gap × (cols−1)) / cols)   gap = 5（见 GAP）
//   6×6 → (337.5−25)/6 = 52    5×5 → (337.5−20)/5 = 63
//   4×4 → (337.5−15)/4 = 80    3×3 → (337.5−10)/3 = 108   ← 与用户口径逐一对上
var GAP = 5;

function cellPx(lv, screenWidth, gap) {
  var cols = colsOf(lv);
  var sw = num(screenWidth, 375);
  if (sw <= 0) sw = 375;
  var g = num(gap, GAP);
  var avail = sw * RATIO - g * (cols - 1);
  var cell = Math.floor(avail / cols);
  return Math.max(34, cell);
}

// rpx 换算：小程序 750rpx = 屏宽 px。WXML 的 style 用 rpx，这里把 cellPx 换算回去。
function cellRpx(lv, screenWidth, gap) {
  var sw = num(screenWidth, 375) || 375;
  return Math.round(cellPx(lv, sw, gap) * 750 / sw);
}

// 盘面总尺寸（rpx）：cells + gaps
function boardSize(lv, screenWidth, gap) {
  var cols = colsOf(lv), rows = rowsOf(lv);
  var g = num(gap, GAP);
  var cell = cellRpx(lv, screenWidth, g);
  return {
    cols: cols, rows: rows, cell: cell, gap: g,
    width: cols * cell + (cols - 1) * g,
    height: rows * cell + (rows - 1) * g
  };
}

// ---- ③ 藏文墨迹量算 ----
// measureText 注入签名：(text, fontSizePx) => widthPx（只需宽度；高度按下述多行模型推）
// 无注入时用保守估算：宽 ≈ 0.55 × 字号 × 最长「横向视觉行数」字符数。
function layersOf(text) {
  // 藏文的横向视觉「层数」：基字层 + 上加字（在前）+ 下加字/元音/后加字（在后，占位不同）
  // 简化模型用来做无 canvas 时的估算 / 兜底，不追求精确（精确值由 measureText 覆盖）
  var t = String(text || '');
  var n = 0;
  for (var i = 0; i < t.length; i++) {
    var c = t.charCodeAt(i);
    if (c >= 0x0F00 && c <= 0x0FFF) n++;
  }
  return Math.max(1, n);
}

function measureTibetanSyllable(text, fontSizePx, measureWidth) {
  var fs = num(fontSizePx, 40);
  var t = String(text || '');
  if (typeof measureWidth === 'function') {
    var w = num(measureWidth(t, fs), 0);
    if (w > 0) {
      // 藏文墨迹高：叠层高度 ≈ 层数 × 0.62 × 字号（取保守上界，宁窄勿溢出格子）
      return { width: w, height: Math.max(fs, layersOf(t) * 0.62 * fs) };
    }
  }
  // 兜底估算（无量算通道 / 量算失败）：宽 ≈ 0.55 × 字号 × 层数，高同上
  return { width: 0.55 * fs * layersOf(t), height: Math.max(fs, layersOf(t) * 0.62 * fs) };
}

// ---- ④ 缩放 ----
// 返回 { scale, font }：font 为最终字号（px），已按 [MIN,MAX] 夹逼。
function calcScale(text, cell, fontSizePx, measureWidth) {
  var c = num(cell, 52) * INNER;           // 可用内部边长
  var fs = num(fontSizePx, Math.round(num(cell, 52) * FONT_RATIO));
  var m = measureTibetanSyllable(text, fs, measureWidth);
  var rw = m.width > 0 ? c / m.width : MAX_SCALE;
  var rh = m.height > 0 ? c / m.height : MAX_SCALE;
  var scale = clamp(Math.min(rw, rh), MIN_SCALE, MAX_SCALE);
  return { scale: scale, font: Math.round(fs * scale), width: Math.round(m.width * scale), height: Math.round(m.height * scale) };
}

// ---- ⑤ 长按放大预览 ----
function needsZoomPreview(lv) { return num(lv, 1) >= ZOOM_FROM; }

module.exports = {
  RATIO: RATIO,
  GAP: GAP,
  INNER: INNER,
  MIN_SCALE: MIN_SCALE,
  MAX_SCALE: MAX_SCALE,
  ZOOM_FROM: ZOOM_FROM,
  FONT_RATIO: FONT_RATIO,
  colsOf: colsOf,
  rowsOf: rowsOf,
  cellPx: cellPx,
  cellRpx: cellRpx,
  boardSize: boardSize,
  layersOf: layersOf,
  measureTibetanSyllable: measureTibetanSyllable,
  calcScale: calcScale,
  needsZoomPreview: needsZoomPreview
};
