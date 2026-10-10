// utils/tibetan-text.js — 藏文排版工具
//
// 藏文标点知识（本项目排版规范的基础）：
// - ་ tsheg (U+0F0B)：**不是标点，而是分隔符**。跟在每个音节（字）后面，
//   用来清晰隔开音节、避免连读混淆，功能类似英文单词间的空格。
//   书写形态是字与字之间略靠上的一个小点/小楔形。
//   → 断行只能发生在 tsheg 之后，绝不能把一个音节拆到两行。
// - ། shad (U+0F0D) 单垂符：分隔句子/短语，相当于顿号、逗号、分号、句号的综合；
//   藏文没有专门的问号与感叹号，这类句子也用它结尾。
//   → shad 必须紧跟前面的音节，绝不能出现在行首。
// - ༎ nyi-shad (U+0F0E) 双垂符：用于篇末或诗文句末。同样不能居行首。
// - ༏ tsheg-shad (U+0F0F) 四垂符：用于卷次或全书终结。同样不能居行首。
//
// 一句话：tsheg 切分「字」，shad 切分「句」。

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

// 组合符号（不能独立出现；必须挂在基字或同簇组合符号之后）
//   0F71..0F84 = 元音 / 变音；0F90..0FBC = 下加字；
//   0F35 / 0F37 / 0F39 / 0FC6 = 长音、下加环、下加元音等附标。
var COMBINING = /[\u0F71-\u0F84\u0F90-\u0FBC\u0F35\u0F37\u0F39\u0FC6]/;
// 可作簇首的字符：辅音 / 元音字母 / 藏文特殊符号（ཀ ཁ … ཨ，以及 ༀ ཾ 等）
var CLUSTER_HEAD = /[\u0F40-\u0F6C\u0F88-\u0F8C\u0F00-\u0F03\u0F7F]/;
var PUNCT_ALL = /[\u0F0B-\u0F0F]/;

/**
 * 句子级藏文良构检查（纯函数，不依赖 Canvas）。
 *
 * ⚠️ 只用于「成句的文案」（如赞美术语），**不要**拿去校验单个字母牌面：
 *    单个字母（如 ཀ）本来就没有 tsheg / shad 收尾，会被判为不完整。
 *
 * 检查三类会在真实渲染中「露馅」的错误：
 *   ① 孤立组合符号 → 渲染成 ◌ 虚圈（违反 docs/tibetan-typography.md「绝不拆音节」）
 *   ② tsheg / shad 居首或连续出现（shad 族永不居行首）
 *   ③ 末尾音节没有 tsheg / shad 收尾（说明音节被截断）
 *
 * @param {string} text
 * @returns {{ok: boolean, reasons: string[]}}
 */
function isWellFormedSentence(text) {
  var s = String(text == null ? '' : text);
  var reasons = [];
  if (!s) return { ok: false, reasons: ['空文本'] };

  for (var i = 0; i < s.length; i++) {
    if (!COMBINING.test(s[i])) continue;
    var prev = i > 0 ? s[i - 1] : '';
    if (!(i > 0 && (CLUSTER_HEAD.test(prev) || COMBINING.test(prev)))) {
      reasons.push('第 ' + i + ' 位（U+' +
        s.charCodeAt(i).toString(16).toUpperCase() + '）是孤立组合符号，会渲染成 ◌ 虚圈');
    }
  }

  for (var j = 0; j < s.length; j++) {
    if (!PUNCT_ALL.test(s[j])) continue;
    if (j === 0) reasons.push('首字符是 tsheg / shad（标点不得居首）');
    else if (PUNCT_ALL.test(s[j - 1])) reasons.push('第 ' + j + ' 位出现连续标点（' + s[j - 1] + s[j] + '）');
  }

  var last = s[s.length - 1];
  if (!PUNCT_ALL.test(last)) reasons.push('末尾音节没有 tsheg / shad 收尾，音节被截断');

  return { ok: reasons.length === 0, reasons: reasons };
}


// 补尾随 tsheg（D70 · 依据 docs/tibetan-orthography.md R1）
//   [TS]：「tsheg must invariably be put down at the end of each written syllable,
//          except before a shad」—— 即独立的音节/字母单位**应当以 ་ 收尾**。
//   ⚠️ 例外必须同时遵守（否则会写出错形）：
//     · 已以 ་（U+0F0B）/ ༌（U+0F0C）/ །（U+0F0D）/ ཿ（U+0F7F）收尾 → 不动
//       （R2：tsheg 不得紧接 shad；R5：visarga 后不得有 tsheg）
//     · 非藏文文本 → 不动
//   幂等：对已补过的文本再调用不会重复添加。
function withTseg(text) {
  var t = String(text == null ? '' : text);
  if (!t) return t;
  if (!/[\u0F00-\u0FFF]/.test(t)) return t;          // 不含藏文：不动
  if (/[\u0F0B\u0F0C\u0F0D\u0F7F]$/.test(t)) return t; // 已有收尾符：不动
  return t + '\u0F0B';
}

module.exports = {
  tokenize: tokenize,
  wrapTibetan: wrapTibetan,
  withTseg: withTseg,
  drawTibetanWrapped: drawTibetanWrapped,
  isWellFormedSentence: isWellFormedSentence,
  TSHEG: TSHEG,
  SHAD: SHAD
};
