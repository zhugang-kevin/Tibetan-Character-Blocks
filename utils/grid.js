// utils/grid.js — 格子尺寸动态调整 + 藏文字形量算（学习体系 L1–L15 的几何层）
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

// D77 纵向重心补偿（逐字实测表，见 docs）：墨顶 3 值、墨底 8 值
var OPT_TOP = -0.680, OPT_TOP_HI = -0.850, OPT_TOP_WA = -0.705;
var OPT_TOP_HI_SET = '\u0F59\u0F5A\u0F5B';
var OPT_TOP_WA_SET = '\u0F5D';                          // ཝ
var OPT_BOTS = [                                          // [墨底, 该值的字母们]
  [0.465, '\u0F40\u0F42\u0F49\u0F4F\u0F51\u0F53\u0F5E\u0F64\u0F67'],
  [0.245, '\u0F41'],
  [0.085, '\u0F5D'],
  [-0.015, '\u0F50'],
  [-0.035, '\u0F47\u0F5B'],
  [-0.065, '\u0F44\u0F5F\u0F60\u0F62'],
  [-0.095, '\u0F54\u0F55\u0F56\u0F58\u0F61\u0F63\u0F66\u0F68'],
  [-0.120, '\u0F45\u0F46\u0F59\u0F5A']               // ཅ ཆ ཙ ཚ
];
// D78 下加字覆盖基字墨底（实测）：ྱ .260 ／ ྲ .175 ／ ླ .280 ／ ྷ .460
var OPT_SUBS = [[0x0FB1, 0.260], [0x0FB2, 0.175], [0x0FB3, 0.280], [0x0FB7, 0.460]];
// D78b ུ 抬墨底（实测）：无下加字→.225；有下加字→.505；取 max
var OPT_U_PLAIN = 0.225, OPT_U_SUB = 0.505;
var OPT_ABOVE = '\u0F72\u0F7A\u0F7C\u0F71\u0F7B\u0F7D';   // ི ེ ོ ཱ ཻ ཽ（会把墨顶再抬 0.19em）
var OPT_ABOVE_LIFT = 0.38;   // 曾误用 0.19（那是格子相对坐标；基线相对实测为 0.380）
                             //    ཀ −0.680 → ཀི −1.060，抬升 **0.380**。
var OPT_BASE_OFF = 0.0535;   // 格子中心相对基线（由 ཀ 反推并验证）

// 返回「把墨心移回格子中心」所需位移（em，正 = 向下）
function opticalShift(text) {
  var t = String(text || ''), i, j;
  var top = 0, bot = 0, seen = false, above = false, sub = false;
  for (i = 0; i < t.length; i++) {
    var c = t[i];
    if (OPT_ABOVE.indexOf(c) > -1) above = true;
    if (OPT_TOP_HI_SET.indexOf(c) > -1) { top = Math.min(top, OPT_TOP_HI); seen = true; }
    else if (OPT_TOP_WA_SET.indexOf(c) > -1) { top = Math.min(top, OPT_TOP_WA); seen = true; }
    else if (/[ཀ-ཨ]/.test(c)) { top = Math.min(top, OPT_TOP); seen = true; }
    for (j = 0; j < OPT_BOTS.length; j++) {
      if (OPT_BOTS[j][1].indexOf(c) > -1) { bot = Math.max(bot, OPT_BOTS[j][0]); seen = true; }
    }
    // D78：下加字覆盖基字的墨底（实测：连写时基字不再用带降部字形）
    for (j = 0; j < OPT_SUBS.length; j++) {
      if (c.charCodeAt(0) === OPT_SUBS[j][0]) { bot = OPT_SUBS[j][1]; sub = true; seen = true; }
    }
  }
  if (!seen) return 0;
  if (sub) {   // 下加字的墨底优先于基字（实测：连写时基字降部被替换）
    for (j = 0; j < OPT_SUBS.length; j++) {
      if (t.indexOf(String.fromCharCode(OPT_SUBS[j][0])) > -1) { bot = OPT_SUBS[j][1]; break; }
    }
  }
  // D78b：下加元音 ུ 把墨底抬下来（与上面的规则取 max，不叠加）
  if (t.indexOf('\u0F74') > -1) bot = Math.max(bot, sub ? OPT_U_SUB : OPT_U_PLAIN);
  if (above) top -= OPT_ABOVE_LIFT;
  return Math.round(-((top + bot) / 2 + OPT_BASE_OFF) * 1000) / 1000;
}
// D79 行高模型（实测）：行距 1.000em（=CSS line-height:1）、单行墨高 1.15em。
// 旧值 0.62 把多行块高低估 38% → 判「装得下」而实际被裁切（L12 实测需 150px/格子 109px）。
var INK_LINE_PITCH = 1.0;    // 行距（em），实测 = line-height:1
var INK_ONE_LINE = 1.15;     // 单行墨迹高（em），实测

function layersOf(text) {
  // 藏文的横向视觉「层数」：基字层 + 上加字（在前）+ 下加字/元音/后加字（在后，占位不同）
  var t = String(text || '');
  var n = 0;
  for (var i = 0; i < t.length; i++) {
    var c = t.charCodeAt(i);
    if (c < 0x0F00 || c > 0x0FFF) continue;
    // 分隔/标点类：tsheg(U+0F0B)、tsheg bstar(U+0F0C)、shad(U+0F0D)、nyis shad(U+0F0E)
    if (c === 0x0F0B || c === 0x0F0C || c === 0x0F0D || c === 0x0F0E) continue;
    n++;
  }
  // 纯分隔符文本（理论上不会出现）也要保证 ≥1，避免除零
  return Math.max(1, n);
}

function measureTibetanSyllable(text, fontSizePx, measureWidth) {
  var fs = num(fontSizePx, 40);
  var t = String(text || '');
  if (typeof measureWidth === 'function') {
    var w = num(measureWidth(t, fs), 0);
    if (w > 0) {
      // D79：单行墨迹高按实测 1.15em（旧值 层数×0.62 与实测不符）
      return { width: w, height: INK_ONE_LINE * fs };
    }
  }
  // 兜底估算：宽 ≈ 0.55×字号×层数 + 0.284×字号×分隔符数（0.284 为真字体实测，见 docs）
  var seps = 0;
  for (var k = 0; k < t.length; k++) {
    var cc = t.charCodeAt(k);
    if (cc === 0x0F0B || cc === 0x0F0C || cc === 0x0F0D || cc === 0x0F0E) seps++;
  }
  return { width: (0.55 * layersOf(t) + 0.284 * seps) * fs,
           height: INK_ONE_LINE * fs };
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
var FIT_TOL = 0.5;   // px：允许的亚像素误差

function measureLines(lines, font, measureWidth) {
  var width = 0, height = 0;
  for (var i = 0; i < lines.length; i++) {
    var m = measureTibetanSyllable(lines[i], font, measureWidth);
    if (m.width > width) width = m.width;
    height += INK_LINE_PITCH * font;   // D79 实测行距（见下方常量）
  }
  return { width: width, height: height };
}

function layoutTile(text, cell, fontSizePx, measureWidth) {
  var c = num(cell, 52);
  var base = num(fontSizePx, Math.round(c * FONT_RATIO));
  var avail = c * INNER;
  var w = wrapTibetanTile(text, c, base, measureWidth);
  var lines = w.lines;
  var font = Math.round(base);
  var m = measureLines(w.lines, font, measureWidth);
  var fits = m.width <= avail + FIT_TOL && m.height <= avail + FIT_TOL;
  // D79：下限 0.28→0.12（旧下限够不到多行牌面所需的 ~15px，会误判「装不下」）
  // ⚠️ D80 关键修复：**每换一个候选字号都要重新断行**。
  //    旧写法只 measureLines(w.lines, f) —— 用的是**基准字号下的断行结果**，
  //    行数被永久锁死。而字号越小、每行放得下的音节越多、行数越少：
  //      ངའི་མིང་ལ་བཀྲ་ཤིས་རེད 在 68px 下 6 行、25px 下 5 行、**18px 下 3 行**、
  //      15px 下 2 行。旧写法因此在 18px 时仍按「6 行」算高度（6.15em×18=111px>94）→
  //      误判装不下，一路缩到 15px 才停下 —— **白白牺牲 3px 字号**，
  //      并让 L12/L13 触发「字号过小」门禁。修复后 18px / 3 行即可装下。
  for (var s = 0.99; !fits && s >= 0.12; s -= 0.01) {
    var f = Math.max(8, Math.round(base * s));
    if (f === font) continue;
    var w2 = wrapTibetanTile(text, c, f, measureWidth);      // ← 重新断行
    var mm = measureLines(w2.lines, f, measureWidth);
    if (mm.width <= avail + FIT_TOL && mm.height <= avail + FIT_TOL) {
      font = f; m = mm; lines = w2.lines; fits = true;
    }
  }
  // ---- D71：填充率下限（视觉一致性）----
  var FILL_TARGET = 0.82, UP_LIMIT = 1.60;
  if (fits) {
    for (var up = 1.02; up <= UP_LIMIT; up += 0.02) {
      var f2 = Math.round(base * up);
      if (f2 <= font) continue;
      var w3 = wrapTibetanTile(text, c, f2, measureWidth);   // 放大同样要重新断行
      var m2 = measureLines(w3.lines, f2, measureWidth);
      var fill2 = Math.max(m2.width, m2.height) / avail;
      if (m2.width > avail + FIT_TOL || m2.height > avail + FIT_TOL) break;
      font = f2; m = m2; lines = w3.lines;
      if (fill2 >= FILL_TARGET) break;
    }
  }
  return {
    lines: lines,
    font: font,
    scale: Math.round(font / base * 100) / 100,
    width: Math.round(m.width),
    height: Math.round(m.height),
    avail: Math.round(avail),
    fill: Math.round(Math.max(m.width, m.height) / avail * 100) / 100,
    opticalShift: opticalShift(text),
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
  opticalShift: opticalShift,
  layoutTile: layoutTile,
  needsZoomPreview: needsZoomPreview
};
