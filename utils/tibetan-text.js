// utils/tibetan-text.js — 藏文排版工具
//
// 藏文标点知识（本项目排版规范的基础）：
// - ་ tsheg (U+0F0B)：音节分隔符，跟在每个音节后面，类似英文单词间的空格。
//   断行只能发生在 tsheg 之后 —— 绝不能把一个音节拆到两行。
// - ། shad (U+0F0D)：句读符，功能类似逗号/句号。
//   shad 必须紧跟前面的音节，绝不能出现在行首。
// - ༎ nyi-shad (U+0F0E) 双垂符：篇末/诗文句末；༈ 四垂符：卷次终结。同样不能居行首。

var TSHEG = '\u0F0B';
var SHAD = '\u0F0D';
var NYI_SHAD = '\u0F0E';
var SHAD4 = '\u0F0F';

/**
 * 把藏文文本按 tsheg 切分为"不可拆分单元"。
 * 音节（含结尾 tsheg）是原子；shad/nyi-shad/四垂符附着在前一音节之后，
 * 保证它们永远不出现在行首。标点后紧跟的空格也归入前一单元。
 * 返回：['བཀྲ་', 'ཤིས་', 'བདེ་', 'ལེགས', ...]
 */
function tokenize(text) {
  var PUNCT = {};
  PUNCT[TSHEG] = PUNCT[SHAD] = PUNCT[NYI_SHAD] = PUNCT[SHAD4] = true;
  var units = [];
  var cur = '';
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    var next = text[i + 1];
    cur += ch;
    if (PUNCT[ch] && !(next && PUNCT[next])) {
      // 在 tsheg/标点处收束一个单元；若后面还跟标点则继续吸收
      units.push(cur);
      cur = '';
    }
  }
  if (cur) units.push(cur);
  return units;
}

/**
 * 按 Canvas 上下文度量做藏文自动换行。
 * 规则：
 *   1. 只在 tsheg 之后断行（音节完整性优先于填满行宽）；
 *   2. shad 类标点永不居行首（tokenize 已保证）；
 *   3. 单个音节超宽时（极端情况，如超大字号）退化为整单元独占一行。
 * @param {Object} ctx Canvas 2D 上下文（需已设置 font）
 * @param {string} text 藏文文本
 * @param {number} maxWidth 行最大宽度（px）
 * @returns {string[]} 行数组
 */
function wrapTibetan(ctx, text, maxWidth) {
  var units = tokenize(text);
  var lines = [];
  var line = '';
  for (var i = 0; i < units.length; i++) {
    var candidate = line + units[i];
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = units[i];
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * 在 Canvas 上绘制自动换行的藏文文本（水平居中）。
 * @param {Object} ctx Canvas 2D 上下文
 * @param {string} text 藏文文本
 * @param {number} cx 水平中心 x
 * @param {number} topY 首行基线 y（后续行累加 lineHeight）
 * @param {number} maxWidth 行最大宽度
 * @param {number} lineHeight 行高
 * @returns {number} 实际绘制的行数
 */
function drawTibetanWrapped(ctx, text, cx, topY, maxWidth, lineHeight) {
  var lines = wrapTibetan(ctx, text, maxWidth);
  for (var i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], cx, topY + i * lineHeight);
  }
  return lines.length;
}

module.exports = {
  tokenize: tokenize,
  wrapTibetan: wrapTibetan,
  drawTibetanWrapped: drawTibetanWrapped,
  TSHEG: TSHEG,
  SHAD: SHAD
};
