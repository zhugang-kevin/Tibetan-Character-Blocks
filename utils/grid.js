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

// ---- ④′ 牌面排版：D59 —— 词 / 句级内容按 tsheg 断行后再缩放 ----
// 为什么必须加这一层（2026-10-09 实测出来的真缺陷）：
//   D51 的 calcScale 是「单行整体缩放」，而缩放被 MIN_SCALE=0.42 夹住。
//   单词（2~3 音节）在 L10 起就已经放不下：
//     L10 「བཀྲ་ཤིས」 → 81×91px，而可用只有 69px（L10 是 4×4 小格）
//   句子（4~8 音节）差得更远：
//     L12 「ངའི་མིང་ལ་བཀྲ་ཤིས་རེད」 → 330×372px，可用 94px（**超 3.5 倍**）
//   全量复算：**150 关里 130 处溢出**。根因是 D51 只考虑过「复合音节」（བཀི 这种，
//   3~4 层），从没把「词 / 句」当牌面内容验证过 —— 排版规则与内容池是脱节的。
//
// 做法：藏文的词界就是 tsheg，所以**按 tsheg 断行**天然不会切断音节。
// 逐行贪心装箱 → 再按「行数」缩放，直到装得下；仍然装不下就如实报告 fits=false，
// 交由调用方决定（不要静默画出一个溢出的牌面）。
//
// ⚠️ 与 utils/tibetan-text.js 的关系：那边是「有 canvas 时按真实 measureText 断行」
// （证书/首页/结算页用）；这边是**无 canvas 的牌面兜底**，用同一个 0.55×层数 模型。
function splitSyllables(text) {
  var t = String(text || '');
  // 末尾的 ། 属于前一个音节，不能自成一行
  var out = [];
  var parts = t.split('་');
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    if (!p) continue;
    if (i < parts.length - 1) p += '་';
    out.push(p);
  }
  return out.length ? out : [t];
}

// 逐行贪心装箱：每行以 tsheg 为单位，能放就放，放不下换行。
function wrapTibetanTile(text, cell, fontSizePx, measureWidth) {
  var avail = num(cell, 52) * INNER;
  var fs = num(fontSizePx, Math.round(num(cell, 52) * FONT_RATIO));
  var units = splitSyllables(text);
  var lines = [];
  var cur = '';
  for (var i = 0; i < units.length; i++) {
    var trial = cur + units[i];
    var w = measureTibetanSyllable(trial, fs, measureWidth).width;
    if (cur && w > avail) {          // 已经有一行且塞不下 → 换行
      lines.push(cur);
      cur = units[i];
    } else {
      cur = trial;
    }
  }
  if (cur) lines.push(cur);
  return { lines: lines, font: fs, avail: avail };
}

// 牌面最终排版：先断行，再按行数缩放到装得下。
// ⚠️ 这里必须拿**取整后的字号**去判定，不能用 base*scale（浮点）：
//    早先版本循环里用 50*0.84 = 42.00000000000001 判定通过，落地字号却是 round(42)，
//    两边在边界上差 1e-14 就把「刚好放得下」判成放不下（108 处假溢出）。教训：
//    **判定用的必须是最终渲染用的那个数**，否则浮点会替你做决定。
var FIT_TOL = 0.5;   // px：允许的亚像素误差

function measureLines(lines, font, measureWidth) {
  var width = 0, height = 0;
  for (var i = 0; i < lines.length; i++) {
    var m = measureTibetanSyllable(lines[i], font, measureWidth);
    if (m.width > width) width = m.width;
    height += 0.62 * font;          // 行高模型与 measureTibetanSyllary 同源
  }
  return { width: width, height: height };
}

function layoutTile(text, cell, fontSizePx, measureWidth) {
  var c = num(cell, 52);
  var base = num(fontSizePx, Math.round(c * FONT_RATIO));
  var avail = c * INNER;
  var w = wrapTibetanTile(text, c, base, measureWidth);
  var font = Math.round(base);
  var m = measureLines(w.lines, font, measureWidth);
  var fits = m.width <= avail + FIT_TOL && m.height <= avail + FIT_TOL;
  for (var s = 0.99; !fits && s >= 0.28; s -= 0.01) {
    var f = Math.max(8, Math.round(base * s));
    if (f === font) continue;
    var mm = measureLines(w.lines, f, measureWidth);
    if (mm.width <= avail + FIT_TOL && mm.height <= avail + FIT_TOL) {
      font = f; m = mm; fits = true;
    }
  }
  return {
    lines: w.lines,
    font: font,
    scale: Math.round(font / base * 100) / 100,
    width: Math.round(m.width),
    height: Math.round(m.height),
    avail: Math.round(avail),
    fits: fits
  };
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
  splitSyllables: splitSyllables,
  wrapTibetanTile: wrapTibetanTile,
  layoutTile: layoutTile,
  needsZoomPreview: needsZoomPreview
};
