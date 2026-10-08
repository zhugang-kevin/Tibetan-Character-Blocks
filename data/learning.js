// data/learning.js — 藏文学习体系（15 级 / 150 关）· 数据层
//
// 与既有 data/levels.js（10 关盘面配置）的关系：
//   data/levels.js   是**盘面维度**（每关格子数与元素配比），继续作为老那条线存在，零改动；
//   data/learning.js 是**课程维度**（15 级 × 150 关的学习体系 + 格子尺寸 + 证书）。
//   两者互不 require；由 utils/learning.js 把「关卡」翻译成与前者同形的
//   { cols, rows, elements: [[id, count]] } 交给 utils/board.js 复用（棋盘逻辑一行不改）。
//
// 三张表（全部写死在这里，运行时只读）：
//   ① SIZE       —— 级别 → 行列数 + 设计稿牌面尺寸（用户指定）
//   ② （内容池）   —— 辅音 / 元音 / 后加字 / 再后加字 / 前加字 / 上加字 / 下加字 / 词 / 句
//   ③ LEVELS     —— 级别元信息（名称、目标、关数、部件组合、内容是否已人工审校）
//
// 关数口径：**15 级 × 每级 10 关 = 150 关**（2026-10-08 用户拍板）。
//   L1 的「30」= 三十个辅音，不是三十关：每关 3 个新字母 × 10 关正好走完 30 个辅音；
//   这样既满足「L1 覆盖 30 个辅音」，又与「合计 150 关」自洽（原字面口径 30+14×10=170 与 150 冲突）。
// 尺寸口径：**真实尺寸运行时算**（cell = 屏宽 × 0.9 / 列数），SIZE 里的 px 只是设计基准值，
//   用于门禁核对不跑偏 —— 实现见 utils/grid.js。

// ---------------------------------------------------------------- ① 格子尺寸表
// 用户指定：6×6≈52px / 5×5≈63px / 4×4≈80px / 3×3≈108px（375pt 屏宽基准）
var SIZE = [
  { from: 1, to: 2, cols: 6, rows: 6, cellPx: 52 },
  { from: 3, to: 5, cols: 5, rows: 5, cellPx: 63 },
  { from: 6, to: 10, cols: 4, rows: 4, cellPx: 80 },
  { from: 11, to: 15, cols: 3, rows: 3, cellPx: 108 }
];

// ---------------------------------------------------------------- ② 教学部件池
// 藏文音节骨架（Unicode 书写顺序）：
//   前加字 + 上加字 + **基字** + 下加字 + 元音 + 后加字 + 再后加字
//   例：བཀི = 前加字 བ + 基字 ཀ + 元音 ི（用户给的 L8 第 1 关样例）
var CONSONANTS = ['ཀ', 'ཁ', 'ག', 'ང', 'ཅ', 'ཆ', 'ཇ', 'ཉ', 'ཏ', 'ཐ', 'ད', 'ན', 'པ', 'ཕ', 'བ', 'མ',
  'ཙ', 'ཚ', 'ཛ', 'ཝ', 'ཞ', 'ཟ', 'འ', 'ཡ', 'ར', 'ལ', 'ཤ', 'ས', 'ཧ', 'ཨ'];
var VOWELS = ['ི', 'ུ', 'ེ', 'ོ'];                 // ི ུ ེ ོ（基字自带 a，不标符号）
var SUFFIXES = ['ག', 'ང', 'ད', 'ན', 'བ', 'མ', 'འ', 'ར', 'ལ', 'ས'];
// 再后加字受「前一个后加字」约束（传统拼读规则，不是任意组合）：
//   ག ང བ མ 之后接 ས；ན ར ལ 之后接 ད。其余后加字不再带第二后加字。
var SECOND_SUFFIX = { ག: 'ས', ང: 'ས', བ: 'ས', མ: 'ས', ན: 'ད', ར: 'ད', ལ: 'ད' };
var PREFIXES = ['ག', 'ད', 'བ', 'མ', 'འ'];
var SUPERS = ['ར', 'ལ', 'ས'];
var SUBS = ['ྱ', 'ྲ', 'ླ', 'ྭ'];                       // 下加字（下标形）

// 词 / 句（人工挑选的高频真词，celebrates 2~4 音节；句子控制在 4~8 字）
var WORDS = ['བཀྲ་ཤིས', 'བདེ་ལེགས', 'གངས་རི', 'ཉི་མ', 'ཟླ་བ', 'མཚོ', 'ཆུ', 'མེ', 'རི', 'མི'];
var WORDS_COMPLEX = ['བཀྲ་ཤིས་བདེ་ལེགས', 'ལྷ་ས', 'བོད་པ', 'གངས་རི', 'ཉི་མ', 'ཟླ་བ', 'མཚོ', 'མིང', 'ཆུ', 'མེ'];
var PHRASES = ['ང་བོད་པ་ཡིན', 'ངའི་མིང་ལ་བཀྲ་ཤིས་རེད', 'ང་ལྷ་ས་ནས་ཡིན', 'བཀྲ་ཤིས་བདེ་ལེགས', 'ང་བཀྲ་ཤིས་རེད'];
var PHRASES_COMPLEX = ['ང་བོད་པ་ཡིན', 'ངའི་མིང་ལ་བཀྲ་ཤིས་རེད', 'ང་ལྷ་ས་ནས་ཡིན', 'བཀྲ་ཤིས་བདེ་ལེགས', 'གངས་རི་མཐོ་པོ་རེད'];

// ---------------------------------------------------------------- ③ 课程：级别 → 部件组合
// 部件顺序固定为「前加字 → 上加字 → 基字 → 下加字 → 元音 → 后加字 → 再后加字」的子集。
//
// ⚠️ 叠加深度限制（2026-10-08 用户拍板）：**不允许七位一次叠满**。
//    七个位置全占会生成 གལགྭིམ 这类藏文里不成立的组合（看着像、念不出）。
//    真正常用的完整音节只有 3~4 个部件 → L9 / L14 / L15 一律走下面这七套**真实组合模板**，
//    每关只用一套模板，保证拼读成立且字形好看。
var SYLLABLE_PATTERNS = [
  ['base', 'vowel'],                       // ཀི
  ['base', 'vowel', 'suffix'],             // ཀིང
  ['prefix', 'base', 'vowel'],             // བཀི（用户 L8 样例）
  ['prefix', 'base', 'vowel', 'suffix'],   // བཀིང
  ['super', 'base', 'vowel'],              // རྐི
  ['super', 'base', 'sub', 'vowel'],       // རྐྱི
  ['base', 'sub', 'vowel']                 // ཀྱི
];

var CURRICULUM = {
  // L1：每关 3 个新辅音（第 n 关 = 第 3n-2 ~ 3n 个）+ 已学复习，10 关走完 30 个辅音
  1: { parts: ['base'], pools: { base: CONSONANTS }, perStage: 'three' },
  2: { parts: ['base', 'vowel'], pools: { base: CONSONANTS, vowel: VOWELS } },
  3: { parts: ['base', 'suffix'], pools: { base: CONSONANTS, suffix: SUFFIXES } },
  4: { parts: ['base', 'suffix', 'second'], pools: { base: CONSONANTS, suffix: SUFFIXES, second: SECOND_SUFFIX } },
  5: { parts: ['prefix', 'base'], pools: { prefix: PREFIXES, base: CONSONANTS } },
  6: { parts: ['super', 'base'], pools: { super: SUPERS, base: CONSONANTS } },
  7: { parts: ['base', 'sub'], pools: { base: CONSONANTS, sub: SUBS } },
  // L8 = 用户点名的样例：前加字（ག ད བ མ འ）+ 基字（ཀ ཁ ག ང）+ 元音（ི ུ ེ ོ）
  8: { parts: ['prefix', 'base', 'vowel'], pools: { prefix: PREFIXES, base: ['ཀ', 'ཁ', 'ག', 'ང'], vowel: VOWELS } },
  9: { parts: ['combo'], patterns: SYLLABLE_PATTERNS, pools: { prefix: PREFIXES, super: SUPERS, base: CONSONANTS, sub: SUBS, vowel: VOWELS, suffix: SUFFIXES } },
  10: { parts: ['word'], pools: { word: WORDS } },
  11: { parts: ['word'], pools: { word: WORDS_COMPLEX } },
  12: { parts: ['phrase'], pools: { phrase: PHRASES } },
  13: { parts: ['phrase'], pools: { phrase: PHRASES_COMPLEX } },
  // L14 / L15 无专属内容池 → 用同一套真实组合模板按级确定性拼合（复习 / 挑战）
  14: { parts: ['review'], patterns: SYLLABLE_PATTERNS },
  15: { parts: ['review'], patterns: SYLLABLE_PATTERNS }
};

// ---------------------------------------------------------------- ④ 级别元信息
var META = [
  { lv: 1, name: '辅音三十', goal: '认识藏文三十个辅音字母' },
  { lv: 2, name: '元音符号', goal: '认识 ི ུ ེ ོ 四个元音符号' },
  { lv: 3, name: '后加字', goal: '认识十个后加字' },
  { lv: 4, name: '再后加字', goal: '认识再后加字 ས / ད 的组合规则' },
  { lv: 5, name: '前加字', goal: '认识 ག ད བ མ འ 五个前加字' },
  { lv: 6, name: '上加字', goal: '认识 ར ལ ས 三个上加字' },
  { lv: 7, name: '下加字', goal: '认识 ྱ ྲ ླ ྭ 四个下加字' },
  { lv: 8, name: '前加字组合', goal: '前加字 + 基字 + 元音的组合拼读' },
  { lv: 9, name: '完整音节', goal: '七位音节骨架的完整拼读' },
  { lv: 10, name: '简单组词', goal: '用学过的音节拼简单词' },
  { lv: 11, name: '复杂组词', goal: '拼读多字复合词' },
  { lv: 12, name: '简单造句', goal: '读短句' },
  { lv: 13, name: '复杂造句', goal: '读完整句子' },
  { lv: 14, name: '综合拼读', goal: '全部件综合复习' },
  { lv: 15, name: '大师挑战', goal: '藏文拼读通级挑战' }
];

function sizeOf(lv) {
  for (var i = 0; i < SIZE.length; i++) if (lv >= SIZE[i].from && lv <= SIZE[i].to) return SIZE[i];
  return SIZE[SIZE.length - 1];
}

var LEVELS = META.map(function (m) {
  var s = sizeOf(m.lv);
  var cur = CURRICULUM[m.lv] || { parts: ['base'], pools: { base: CONSONANTS } };
  return {
    lv: m.lv,
    name: m.name,
    goal: m.goal,
    stages: 10,                            // 每级 10 关 → 15 × 10 = **150 关**
    cols: s.cols,
    rows: s.rows,
    cellPx: s.cellPx,
    parts: cur.parts,
    // 叠加模板（受限于真实藏文组合，见 SYLLABLE_PATTERNS 注释）
    patterns: cur.patterns || [],
    pools: cur.pools || {},
    perStage: cur.perStage || '',
    // curated=false 表示该级无专属内容池，由生成器按已学部件确定性拼合
    curated: cur.parts.join(',') !== 'review'
  };
});

// 终极证书：集齐 15 张级别证书后解锁
var ULTIMATE = {
  key: 'ultimate',
  name: '藏文拼读宗师',
  goal: '集齐十五级证书 · 通读完整个藏文拼读体系',
  // ⚠️ 去游戏化守卫（§37）：**不得出现量词「关」**，证书文案一律用「课」
  lines: ['完成全部 15 级 · 150 课', '掌握辅音 / 元音 / 前后加字 / 上下加字全部部件']
};

module.exports = {
  SYLLABLE_PATTERNS: SYLLABLE_PATTERNS,
  SIZE: SIZE,
  LEVELS: LEVELS,
  CURRICULUM: CURRICULUM,
  ULTIMATE: ULTIMATE,
  CONSONANTS: CONSONANTS,
  VOWELS: VOWELS,
  SUFFIXES: SUFFIXES,
  SECOND_SUFFIX: SECOND_SUFFIX,
  PREFIXES: PREFIXES,
  SUPERS: SUPERS,
  SUBS: SUBS,
  WORDS: WORDS,
  WORDS_COMPLEX: WORDS_COMPLEX,
  PHRASES: PHRASES,
  PHRASES_COMPLEX: PHRASES_COMPLEX,
  sizeOf: sizeOf,
  byLevel: function (lv) {
    for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].lv === lv) return LEVELS[i];
    return null;
  },
  totalStages: function () {
    return LEVELS.reduce(function (n, l) { return n + l.stages; }, 0);
  }
};
