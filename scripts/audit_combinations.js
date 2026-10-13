// scripts/audit_combinations.js
// 逐层审核：上加字 / 下加字 / 前加字 / 后加字 / 再后加字 + 组合字词 + 组合句子
//
// 每个藏文音节被拆成 前加 / 上加 / 基 / 下加 / 元音 / 后加 / 再后加 七位，
// 逐位对照 data/affixes.js 的权威穷举表核对。这套判据与门禁 §59.23 同源，
// 但这里更进一步：把"组合字词 / 组合句子 / 生成器产出"也逐音节拆开验，
// 专门抓 D110 同级的那类 bug —— 附加字与基字用笛卡尔积拼出藏文里不成立的音节。
//
// 退出码：发现任何"语法附加字非法组合"即非 0（可作家门禁）。

const affix = require('../data/affixes');
const learning = require('../data/learning');
const daily = require('../data/daily');
const reveals = require('../data/reveals');
const praise = require('../data/praise');
const cardsMod = require('../data/cards');
const gen = require('../utils/learning');

const cards = Array.isArray(cardsMod) ? cardsMod : (cardsMod.cards || cardsMod.data || []);
const dailyArr = Array.isArray(daily) ? daily : (daily.data || []);
const revealsArr = Array.isArray(reveals) ? reveals : (reveals.data || []);
const praiseArr = Array.isArray(praise) ? praise : (praise.data || []);

const SUBGRAM = new Set(['ྱ', 'ྲ', 'ླ', 'ྭ']);           // 四个语法下加字（下标形）
const PREFIXES = new Set(['ག', 'ད', 'བ', 'མ', 'འ']);
const SUPERS = new Set(['ར', 'ལ', 'ས']);

function cp(c) { return c.codePointAt(0); }
function isSubjoined(c) { const x = cp(c); return x >= 0x0F90 && x <= 0x0FBF; }
function isVowel(c) { const x = cp(c); return x >= 0x0F71 && x <= 0x0F87; }
function isConsonant(c) { const x = cp(c); return x >= 0x0F40 && x <= 0x0F69; }

function strip(s) { return String(s).replace(/[^ཀ-࿟་]/g, ''); }
// 仅当字符串含藏文统一码区块（U+0F00–U+0FFF）字符时才做藏文解析；
// 像 cards.js 里 'ka · 嘎（不送气·高调）' 这类拼音/汉字说明应跳过。
function hasTibetan(s) { return /[ཀ-࿟]/.test(s); }

// 把一个音节拆成结构
function parse(syl) {
  const raw = strip(syl);
  const chars = Array.from(raw);
  const r = { prefix: null, sup: null, base: null, sub: null, vowel: null, suffix: null, second: null, stacks: [], leftover: null };
  if (!chars.length) return r;
  let i = 0;
  const first = chars[0];
  let baseIdx = -1;

  // ---- 开头：判断 前加 / 上加 / 基字 ----
  if (PREFIXES.has(first) && chars.length > 1 && isConsonant(chars[1]) && !isSubjoined(chars[1])) {
    if (SUPERS.has(chars[1]) && chars.length > 2 && isConsonant(chars[2]) && !isSubjoined(chars[2])) {
      // 前加字 + 上加字 + 基字
      if (affix.PREFIX_LEGAL.indexOf(first + chars[2]) !== -1 && affix.SUPER_LEGAL.indexOf(chars[1] + chars[2]) !== -1) {
        r.prefix = first; r.sup = chars[1]; baseIdx = 2;
      } else { baseIdx = 0; }
    } else {
      if (affix.PREFIX_LEGAL.indexOf(first + chars[1]) !== -1) { r.prefix = first; baseIdx = 1; }
      else { baseIdx = 0; }
    }
  } else if (SUPERS.has(first) && chars.length > 1 && isConsonant(chars[1]) && !isSubjoined(chars[1]) && affix.SUPER_LEGAL.indexOf(first + chars[1]) !== -1) {
    r.sup = first; baseIdx = 1;
  } else {
    baseIdx = 0;
  }
  if (baseIdx >= 0 && baseIdx < chars.length) { r.base = chars[baseIdx]; i = baseIdx + 1; }

  // ---- 基字之后：下加(簇) / 元音 / 后加 / 再后加 ----
  while (i < chars.length && isSubjoined(chars[i])) {
    if (SUBGRAM.has(chars[i])) { if (!r.sub) r.sub = chars[i]; else r.stacks.push(chars[i]); }
    else r.stacks.push(chars[i]);   // 非语法下加字的下标辅音 = 辅音簇（真词固有）
    i++;
  }
  // 元音（含 འ+元音 组合，如 འི / འུ，可紧接在另一元音符号之后）
  if (i < chars.length && isVowel(chars[i])) { r.vowel = (r.vowel || '') + chars[i]; i++; }
  if (i < chars.length && chars[i] === 'འ' && i + 1 < chars.length && isVowel(chars[i + 1])) { r.vowel = (r.vowel || '') + chars[i] + chars[i + 1]; i += 2; }
  // 后加 / 再后加：འ 若后接元音已并入元音，不在此作辅音处理
  function isPlainConsonant(k) { return k < chars.length && !(chars[k] === 'འ' && k + 1 < chars.length && isVowel(chars[k + 1])) && isConsonant(chars[k]) && !isSubjoined(chars[k]); }
  if (isPlainConsonant(i)) { r.suffix = chars[i]; i++; }
  if (isPlainConsonant(i)) { r.second = chars[i]; i++; }
  if (i < chars.length) r.leftover = chars.slice(i).join('');
  return r;
}

function validate(r) {
  const issues = [];
  if (!r.base) issues.push('缺基字');
  if (r.prefix && affix.PREFIX_LEGAL.indexOf(r.prefix + r.base) === -1) issues.push('非法前加字组合 ' + r.prefix + r.base);
  if (r.sup && affix.SUPER_LEGAL.indexOf(r.sup + r.base) === -1) issues.push('非法上加字组合 ' + r.sup + r.base);
  // 仅当没有辅音簇时，ྱ/ྲ/ླ/ྭ 才是"语法下加字"，需查 SUB_LEGAL；
  // 有簇（如 རྒྱལ = ར+ྒ+ྱ+ལ）时 ྱ 是簇的一部分，不在此判，交人工签确。
  if (r.sub && r.stacks.length === 0 && affix.SUB_LEGAL.indexOf(r.base + r.sub) === -1) issues.push('非法下加字组合 ' + r.base + r.sub);
  if (r.suffix && affix.SUFFIXES.indexOf(r.suffix) === -1) issues.push('非法后加字 ' + r.suffix);
  if (r.second) {
    const exp = affix.SECOND_SUFFIX[r.suffix];
    if (exp !== r.second) issues.push('非法再后加字 ' + r.suffix + r.second + ' 应为' + (exp || '无'));
  }
  if (r.leftover) issues.push('残余未解析 ' + r.leftover);
  return issues;
}

function splitSyl(text) { return String(text).split('་').map(s => s.trim()).filter(Boolean); }
function collectSyllables(strings) {
  const out = [];
  strings.forEach(s => { if (!s) return; splitSyl(s).forEach(sy => { if (sy) out.push(sy); }); });
  return out;
}

let fail = 0;
const report = [];
function section(t) { report.push('\n=== ' + t + ' ==='); }
function ok(m) { report.push('  ✓ ' + m); }
function bad(m) { report.push('  ✗ ' + m); fail++; }
function info(m) { report.push('  · ' + m); }

// ① 四层 + 再后加（构造正确性的复检）
section('① 上加字 / 下加字 / 前加字（穷举合法性）');
ok('上加字 ' + affix.SUPER_LEGAL.length + ' 条 · 下加字 ' + affix.SUB_LEGAL.length + ' 条 · 前加字 ' + affix.PREFIX_LEGAL.length + ' 条');
let badLayer = 0;
affix.SUPER_LEGAL.concat(affix.SUB_LEGAL, affix.PREFIX_LEGAL).forEach(s => {
  const v = validate(parse(s));
  if (v.length) { badLayer++; bad('层内非法: ' + s + ' -> ' + v.join(',')); }
});
if (!badLayer) ok('四层逐条与权威穷举一致，无非法组合');

section('④⑤ 后加字 + 再后加字');
ok('后加字 ' + affix.SUFFIXES.length + ' 个');
const secondCombos = Object.keys(affix.SECOND_SUFFIX).map(k => k + affix.SECOND_SUFFIX[k]);
ok('再后加字 ' + secondCombos.length + ' 条: ' + secondCombos.join(' '));
let bad2 = 0;
Object.keys(affix.SECOND_SUFFIX).forEach(k => { if (affix.SUFFIXES.indexOf(k) === -1) { bad2++; bad('再后加字基 ' + k + ' 不在后加字表'); } });
if (!bad2) ok('再后加字严格挂在合法后加字之后');

// ⑥ 组合字词
section('⑥ 组合字词（人工挑选真词）');
const wordStrings = learning.WORDS.concat(learning.WORDS_COMPLEX,
  revealsArr.map(d => d.tibetan), praiseArr.map(d => d.bo),
  cards.map(d => d.subtitle).filter(Boolean)).filter(hasTibetan);
const wordSyl = collectSyllables(wordStrings);
let wordBad = 0; const wordStacks = [];
wordSyl.forEach(sy => {
  const r = parse(sy); const v = validate(r);
  if (r.stacks.length) wordStacks.push(sy + '[' + r.stacks.join('') + ']');
  if (v.length) { wordBad++; bad('字词非法音节 ' + sy + ' -> ' + v.join(',')); }
});
if (!wordBad) ok('字词 ' + wordSyl.length + ' 个音节，语法附加字全部合法');
if (wordStacks.length) info('含辅音簇(非语法下加字·真词固有音节·待人工签确): ' + [...new Set(wordStacks)].join(' '));

// ⑦ 组合句子（仅取权威三源：learning.PHRASES / PHRASES_COMPLEX / daily 祈福句；
//    不扫 cards.funFact 里的「字母罗列」与说明性引文，避免把 ཐ ད ན 这类列表当句子）
section('⑦ 组合句子');
const sentStrings = learning.PHRASES.concat(learning.PHRASES_COMPLEX, dailyArr.map(d => d.tibetan)).filter(hasTibetan);
const sentSyl = collectSyllables(sentStrings);
let sentBad = 0; const sentStacks = [];
sentSyl.forEach(sy => {
  const r = parse(sy); const v = validate(r);
  if (r.stacks.length) sentStacks.push(sy + '[' + r.stacks.join('') + ']');
  if (v.length) { sentBad++; bad('句子非法音节 ' + sy + ' -> ' + v.join(',')); }
});
if (!sentBad) ok('句子 ' + sentSyl.length + ' 个音节，语法附加字全部合法');
if (sentStacks.length) info('含辅音簇(真句固有·待人工签确): ' + [...new Set(sentStacks)].join(' '));

// ⑧ 生成器回归（L8/L9/L14/L15）
section('⑧ 生成器回归 L8 / L9 / L14 / L15');
[8, 9, 14, 15].forEach(lv => {
  let lvBad = 0; const samples = [];
  for (let s = 1; s <= 10; s++) {
    const st = gen.buildStage(lv, s);
    if (!st) continue;
    st.titles.forEach(t => {
      splitSyl(t).forEach(sy => {
        const v = validate(parse(sy));
        if (v.length) { lvBad++; if (samples.length < 15) samples.push('L' + lv + '·' + s + ' "' + t + '" :: ' + v.join(',')); }
      });
    });
  }
  if (lvBad) { bad('L' + lv + ' 生成出 ' + lvBad + ' 个非法音节（与 L5/L6/L7 同类笛卡尔积 bug）'); samples.forEach(x => bad('   ' + x)); }
  else ok('L' + lv + ' 150 关生成音节全部合法');
});

report.push('\n========================');
report.push(fail === 0 ? '✓ 全部层 + 组合字词 + 组合句子：语法附加字合法' : ('✗ 发现 ' + fail + ' 处非法（需修复）'));

function runAudit() { return { fail: fail, lines: report }; }

if (require.main === module) {
  console.log(report.join('\n'));
  process.exit(fail === 0 ? 0 : 1);
}

module.exports = { runAudit: runAudit, parse: parse, validate: validate };
