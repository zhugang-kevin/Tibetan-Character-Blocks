/**
 * scripts/gen_voice_worksheet.js — 生成「藏文录音工作单」
 *
 * 为什么要有这个脚本（而不是手写清单）：
 *   手写藏文必然会出现Unicode 转写错误。本项目 D109 踩过最严重的坑：
 *   **手写 unicode 转义拼出了完全错的藏文**，脚本照样生成并写进清单，
 *   念出来是「A MA CHA BA DAR BA DAR」—— 完全不是六字真言。
 *   所以本脚本**只从 data/*.js 里读原文**，一个字符都不手写。
 *
 * 输出：docs/voice-worksheet.md（照着念即可，文件名即入库 id）
 * 用法：node scripts/gen_voice_worksheet.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const cards = require(path.join(ROOT, 'data', 'cards.js'));
const daily = require(path.join(ROOT, 'data', 'daily.js'));
const learning = require(path.join(ROOT, 'data', 'learning.js'));
const affixes = require(path.join(ROOT, 'data', 'affixes.js'));
const reveals = require(path.join(ROOT, 'data', 'reveals.js'));
const praise = require(path.join(ROOT, 'data', 'praise.js'));

const voices = require(path.join(ROOT, 'data', 'voices.js'));

function read(p) {
  return fs.readFileSync(path.join(ROOT, p), 'utf8');
}
const man = JSON.parse(read('scripts/tts-manifest.json'));
// 真人已签确台账（lha_sa / rgyal_mtshan）
const pron = JSON.parse(read('audio/voice/pronunciation_manifest.json'));
// 真人录音溯源台账（哪些文件是用户本人录的）。
// ⚠️ 没有它就没法回答「这条要不要重录」—— `tts-manifest.json` 是**历史 TTS 记录**，
//    真人覆盖同名文件后它不会变。曾经因此把 8 条已重录的辅音报成「请一并重录」。
let HUMAN_SET = {};
try {
  const prov = JSON.parse(read('audio/voice/voice-provenance.json'));
  (prov.human_recorded && prov.human_recorded.ids || []).forEach(k => { HUMAN_SET[k] = 1; });
} catch (e) {
  console.warn('⚠ 读不到 audio/voice/voice-provenance.json —— 状态列将无法区分「真人 / TTS」');
}
const HUMAN_TOTAL = Object.keys(HUMAN_SET).length;

const HAS = {};
voices.ids.concat(voices.extras).forEach(k => { HAS[k] = 1; });

function fmtDur(d) {
  if (!d) return '';
  return d.toFixed(2) + 's';
}

/** 取某 id 的藏文原文：**只从 data/*.js 取**（唯一真相源）。
 *  ⚠️ 绝不再从 tts-manifest.json 取正文 —— 那是「**当年** TTS 用哪段文本合成」的历史记录，
 *     真人录音覆盖同名文件后它不会变。拿它当「现在该念什么」，会把 D112 已修好的
 *     错音**再教一遍**：letter_01 现在教 ཀ，而 manifest 仍写着旧的 ཀཱ（长音）。
 *     这是实际发生过的缺陷，不是假想。 */
function textOf(id, card) {
  if (card && card.tibetan) return { text: card.tibetan };
  return null;
}

/** 状态列：**先问有没有音频，再问是谁录的**。
 *  「有音频」来自 data/voices.js（按目录实存生成，可信）；
 *  「谁录的」来自 voice-provenance.json（真人台账）。
 *  取不到台账时**不下结论**，如实报「来源未登记」——不猜。 */
const EXCLUDED = {};
try {
  const prov = JSON.parse(read('audio/voice/voice-provenance.json'));
  Object.keys(prov.excluded_by_user || {}).forEach(k => { EXCLUDED[k] = 1; });
} catch (e) { /* 前面已 warn 过 */ }
function statusOf(id, has) {
  if (!has) return '**待录**';
  if (EXCLUDED[id]) return '— 保留 TTS（D112 已剔除，**勿录**）';
  if (HUMAN_SET[id]) return '✅ 真人录音';
  return '⚠ TTS（真人待补）';
}

// ---------------------------------------------------------------- ① 30 辅音
// ⚠️ 只收 `letter_NN`：icon_01 原先混在本表末尾，于是「30 个辅音字母」的表里坐着第 31 行，
//    且它按 D112 是**已剔除、勿录**的，却被状态列标成「真人待补」——自相矛盾。
//    现在归位到 ② 图标表，本表恰好 30 行。
const letters = cards
  .filter(c => c && /^letter_\d+$/.test(c.id))
  .map(c => {
    const t = textOf(c.id, c);
    return {
      id: c.id, tibetan: t ? t.text : c.tibetan, subtitle: c.subtitle,
      has: !!HAS[c.id]
    };
  });

// ---------------------------------------------------------------- ② 8 图标
const icons = [];
for (let i = 0; i < cards.length; i++) {
  const c = cards[i];
  if (!c || c.type !== 'icon') continue;
  // 图标的藏文在 subtitle 里（「藏语：xxx」），tibetan 字段是空的
  const m = /^藏语：(.+)$/.exec(c.subtitle || '');
  icons.push({
    id: c.id, title: c.title,
    tibetan: m ? m[1] : '',
    has: !!HAS[c.id]
  });
}

// ---------------------------------------------------------------- ③ 情绪 / 祈福语音（7 条）
// ⚠️ 这里曾经是**两节**：③「情绪语音」正文取自 tts-manifest、④「每日祈福句」正文取自 daily.js。
//    但两节列的是**同一批 7 条**（tashi_delek / blessing_01 / greet_03~07）——
//    同一份清单里同一句话出现两个正文版本，而 manifest 那份是**历史 TTS 文本**
//    （D114 已按用户本人所念替换过 data/daily.js）。已合并为一节，正文一律取自 daily.js。
const greetings = (daily.greetings || []).map(g => ({
  id: g.voice, tibetan: g.tibetan, cn: g.cn, has: !!HAS[g.voice]
}));

// ---------------------------------------------------------------- ⑤ 四层附加字
const layers = [
  { key: 'super', name: '上加字（ར/ལ/ས）', list: affixes.SUPER_LEGAL,
    rule: affixes.SUPER_RULES.map(r => `${r.id}：${r.effect}`).join('\n') },
  { key: 'sub', name: '下加字（ྱ/ྲ/ླ/ྭ）', list: affixes.SUB_LEGAL,
    rule: affixes.SUB_RULES.map(r => `${r.id}（${r.sub}）：${r.effect}`).join('\n') },
  { key: 'prefix', name: '前加字（ག/ད/བ/མ/འ）', list: affixes.PREFIX_LEGAL,
    rule: affixes.PREFIX_RULES.map(r => `${r.id}：${r.effect}`).join('\n') }
];

// ---------------------------------------------------------------- ⑥ 学习词句池
const pool = {};
[['WORDS', learning.WORDS], ['WORDS_COMPLEX', learning.WORDS_COMPLEX],
 ['PHRASES', learning.PHRASES], ['PHRASES_COMPLEX', learning.PHRASES_COMPLEX]
].forEach(([k, arr]) => { pool[k] = arr || []; });
const poolUniq = [];
const seen = {};
Object.keys(pool).forEach(k => pool[k].forEach(w => {
  if (!seen[w]) { seen[w] = 1; poolUniq.push({ text: w, from: k }); }
}));

// ---------------------------------------------------------------- ⑦ 秘境图
const revealList = Array.isArray(reveals) ? reveals
  : (reveals.REVEALS || reveals.items || []);

// ---------------------------------------------------------------- ⑧ 藏文赞美
const boAudio = fs.existsSync(path.join(ROOT, 'package-praise', 'audio', 'voice'))
  ? fs.readdirSync(path.join(ROOT, 'package-praise', 'audio', 'voice'))
      .filter(f => f.endsWith('.mp3')).map(f => f.replace(/\.mp3$/, ''))
  : [];

// ---------------------------------------------------------------- 渲染
const L = [];
L.push('# 藏文录音工作单（全量）');
L.push('');
L.push('> **本文件由 `node scripts/gen_voice_worksheet.js` 从 `data/*.js` 生成，藏文零手写。**');
L.push('> 直接照着念即可，**文件名即入库 id**（必须完全一致）。');
L.push('>');
L.push('> 生成时间口径：`audio/voice/*.mp3` 与 `package-praise/audio/voice/*.mp3` 的实存情况。');
L.push('> 含义一栏的藏文**只从 `data/*.js` 取**（唯一真相源）；'
  + '「真人 / TTS」取自 `audio/voice/voice-provenance.json`。');
L.push('> ⚠️ 本表**不写**「哪条已通过人耳验证」—— 那是你的判断，脚本不代签。');
L.push('');

let totalNew = 0, totalHas = 0;

function table(rows, cols) {
  L.push('| ' + cols.map(c => c[0]).join(' | ') + ' |');
  L.push('| ' + cols.map(() => '---').join(' | ') + ' |');
  rows.forEach(r => L.push('| ' + cols.map(c => c[1](r)).join(' | ') + ' |'));
  L.push('');
}

// ① 辅音
const letterNew = letters.filter(l => !l.has);
const letterHas = letters.filter(l => l.has);
const letterHuman = letters.filter(l => HUMAN_SET[l.id]);
totalNew += letterNew.length; totalHas += letterHas.length;
L.push('## ① 30 个辅音字母（`letter_01` ~ `letter_30`）');
L.push('');
L.push(`**已有音频 ${letterHas.length} 条（其中真人录音 ${letterHuman.length} 条），待录 ${letterNew.length} 条。**`);
L.push('');
table(letters, [
  ['文件名', l => '`' + l.id + '.mp3`'],
  ['藏文（照念）', l => l.tibetan],
  ['Wylie / 读音', l => (l.subtitle || '').split('·').slice(0, 1).join('').trim() || '—'],
  ['状态', l => statusOf(l.id, l.has)]
]);
L.push('> ⚠ **念的是本音，不要拖长**：字母读本音（`ཀ` = ka），不是「字母 + `ཱ`」的长音。');
L.push('> 历史上曾有 8 条（`letter_01/06/09/12/14/19/25/27`）误用长音写法合成，'
  + '**已于 2026-10-15 由你本人重录修正**（证据见 `audio/voice/voice-provenance.json`）。');
L.push('> 本表正文一律取自 `data/cards.js` —— 不会再回退到历史 TTS 写法。');
L.push('');

// ② 图标
const iconNew = icons.filter(i => !i.has && !EXCLUDED[i.id]);   // 已剔除的不算「待录」
totalNew += iconNew.length;
L.push('## ② ' + icons.length + ' 个图标（`icon_01` ~ `icon_'
  + String(icons.length).padStart(2, '0') + '`）');
L.push('');
table(icons, [
  ['文件名', i => '`' + i.id + '.mp3`'],
  ['藏文（照念）', i => i.tibetan],
  ['名称', i => i.title],
  ['状态', i => statusOf(i.id, i.has)]
]);
L.push('> `icon_01`（吉祥结）：按 D112 你的确认「**不属于基字发音**」→ 保留 TTS 版，'
  + '**不按缺口处理**，不要因为「它还是 TTS」而去录它。');
L.push('');

// ③ 情绪 / 祈福语音（与 ④ 合并后的一节）
L.push('## ③ 情绪 / 祈福语音（`daily.greetings`，7 条）');
L.push('');
table(greetings, [
  ['文件名', g => '`' + g.id + '.mp3`'],
  ['藏文（照念）', g => g.tibetan],
  ['中文', g => g.cn],
  ['状态', g => statusOf(g.id, g.has)]
]);
L.push('');

// ④ 六字真言
// ⚠️ 六字真言是**唯一**正文仍取自 tts-manifest 的条目：它在 data/*.js 里没有定义，
//    manifest 的那条记录就是唯一的文本来源（gen_mantra_4x.py 也从那里读）。
const mantra = man.mantra;
// 六字真言是否已由真人录音替代 —— 同样问台账，不写死。
// （写死的后果已实际发生：mantra 换真人后，本表仍标「已有（TTS）·待重录」。）
const mantraHuman = !!HUMAN_SET['mantra'];
L.push('## ④ 六字真言（祈福灯专用，特殊处理）');
L.push('');
L.push('| 文件名 | 藏文（照念） | 用途 | 状态 |');
L.push('| --- | --- | --- | --- |');
L.push('| `mantra.mp3` | ' + (mantra ? mantra.text : '') + ' | 点灯瞬间播1 遍 | '
  + (mantraHuman ? '✅ 真人录音' : '⚠ 已有（TTS）') + ' |');
L.push('| `mantra_4x.mp3` | 同上 ×4 | **保留但已不再被引用**（D115 起跳窗只播单遍） | ⚠ 由**旧**单遍拼接 —— 单遍换真人后它已过期 |');
L.push('');
L.push(mantraHuman
  ? '> 已由真人录音替代原 TTS。4 遍版若仍需要，由 `scripts/gen_mantra_4x.py` 从单遍自动拼接，**不要单独录**。'
  : '**⚠ 只录单遍**（约 1.8 秒）。4 遍版由 `scripts/gen_mantra_4x.py` 自动拼接。\n'
    + '若录成 3 遍或 4 遍连诵，拼接后会变成 9~16 遍，违背 D109 的「4 遍」决定。');
L.push('');

// ⑤ 四层
L.push('## ⑤ 四层附加字（`data/affixes.js` 权威穷举表，**目前零音频**）');
L.push('');
layers.forEach(ly => {
  L.push('### ' + ly.name + ' — ' + ly.list.length + ' 个合法音节');
  L.push('');
  L.push('**读音规则**：');
  ly.rule.split('\n').forEach(r => L.push('- ' + r));
  L.push('');
  L.push('| 藏文（照念） | 建议文件名 |');
  L.push('| --- | --- |');
  ly.list.forEach(syl => L.push('| ' + syl + ' | `' + ly.key + '_' + syl + '.mp3` |'));
  L.push('');
  totalNew += ly.list.length;
});

// ⑥ 学习词句
L.push('## ⑥ 学习词句池（`data/learning.js` L10–L13）');
L.push('');
table(poolUniq, [
  ['藏文（照念）', p => p.text],
  ['来源层', p => ({ WORDS: 'L10 简单词', WORDS_COMPLEX: 'L11 复杂词', PHRASES: 'L12 短句', PHRASES_COMPLEX: 'L13 长句' })[p.from]],
  ['建议文件名', p => '`word_' + p.text.replace(/[^ༀ-࿿]/g, '') + '.mp3`']
]);
totalNew += poolUniq.length;
L.push('> 文件名规则：`word_` + 藏文（去掉 tsheg与标点）。若藏文含空格或特殊符号，'
  + '我会按实际编码后与你确认，不会自动替换。');
L.push('');

// ⑦ 秘境图
L.push('## ⑦ 十关秘境图名称（`data/reveals.js`）');
L.push('');
const revealRows = (Array.isArray(revealList) ? revealList : []).map((r, i) => ({
  idx: i + 1, tibetan: r.tibetan, roman: r.roman, title: r.title || r.name || ''
}));
table(revealRows, [
  ['#', r => r.idx],
  ['藏文（照念）', r => r.tibetan],
  ['Wylie', r => r.roman],
  ['建议文件名', r => '`reveal_' + String(r.idx).padStart(2, '0') + '.mp3`']
]);
totalNew += revealRows.length;
L.push('');

// ⑧ 已签确
L.push('## ⑧ 已由你签确（无需重录，仅补签范围）');
L.push('');
L.push('| 文件名 | 藏文 | 签确记录 |');
L.push('| --- | --- | --- |');
Object.keys(pron).forEach(k => {
  // 正文取自数据源；数据源里没有的（如 lha_sa）才回退 manifest —— 且只为显示，不参与判据
  const c = cards.find(x => x && x.id === k);
  const txt = (c && c.tibetan) || (man[k] ? man[k].text : '—');
  L.push('| `' + k + '.mp3` | ' + txt + ' | ' + (pron[k].native_note || '—') + ' |');
});
L.push('');

// ---------------------------------------------------------------- 统计
// 判据全部来自实存与台账，不再出现「全部 TTS，建议重录」这类**写死的结论**：
// 上一版就是靠写死的结论，把 30 条已是真人录音的辅音说成「多数元音长度不对」。
const greHave = greetings.filter(g => g.has).length;
const greHuman = greetings.filter(g => HUMAN_SET[g.id]).length;
const iconAll = icons.length;
const iconHave = icons.filter(i => i.has).length;
const iconHuman = icons.filter(i => HUMAN_SET[i.id]).length;
L.push('## 汇总');
L.push('');
L.push('| 类别 | 条数 | 现状 |');
L.push('| --- | --- | --- |');
L.push('| ① 30 辅音 | ' + letters.length + ' | 全部有音频，其中**真人录音 ' + letterHuman.length + '** |');
L.push('| ② ' + iconAll + ' 个图标 | ' + iconAll + ' | 有音频 ' + iconHave + '（真人 ' + iconHuman + '）；'
  + '**待录 ' + iconNew.length + '**' + (iconNew.length ? '（' + iconNew.map(i => '`' + i.id + '`').join('、') + '）' : '') + ' |');
L.push('| ③ 情绪 / 祈福语音 | ' + greetings.length + ' | 有音频 ' + greHave + '，其中**真人录音 ' + greHuman + '** |');
L.push('| ④ 六字真言 | 1 | ' + (mantraHuman
  ? '**真人录音**（`mantra_4x` 由脚本拼接，非独立录音）'
  : '仍是 TTS，**待重录（只录单遍）**') + ' |');
L.push('| ⑤ 四层附加字 | ' + layers.reduce((s, l) => s + l.list.length, 0) + ' | **零音频**（受主包预算约束，须先建分包） |');
L.push('| ⑥ 学习词句 | ' + poolUniq.length + ' | 无音频（不阻塞上线，缺音频时静默跳过） |');
L.push('| ⑦ 秘境图名 | ' + revealRows.length + ' | 无音频（同上） |');
L.push('| ⑧ 藏文赞美 Bo（分包） | ' + boAudio.length + ' | TTS，真人待补 |');
L.push('');
// 「还有多少要录」由**实存 + 台账**推出，不再写死「+1（六字真言）」：
// 写死的后果是 mantra 换真人后，这里还报「待录 1 条」，而正文一个待录项都没有。
const todoList = iconNew.map(i => '`' + i.id + '`')
  .concat(mantraHuman ? [] : ['六字真言（单遍）']);
L.push(todoList.length
  ? '**当前真正待录：' + todoList.length + ' 条** —— ' + todoList.join('、') + '。'
  : '**当前无待录项**：38 个元素的发音全部到位，六字真言亦已由真人录音替代。');
L.push('');
L.push('> 状态列判据：`data/voices.js`（**有没有**音频）× `audio/voice/voice-provenance.json`（**谁录的**）。');
L.push('> ⚠️ **「已有」不等于「已验证」**：除了 ⑧ 两条已签确，其余读音的「对不对」只有你能判，'
  + '本表不代判、也不写「已通过」。');
L.push('');
L.push('## 录音规范（务必先看）');
L.push('');
L.push('| 项目 | 要求 |');
L.push('| --- | --- |');
L.push('| 环境 | 安静房间，手机录音机即可 |');
L.push('| 距离 | 嘴离手机 15–20cm，保持一致 |');
L.push('| 手法 | **一条一录**，中间不连着念 |');
L.push('| 留白 | 前后各留 1 秒空白（供自动裁剪） |');
L.push('| 遍数 | **一条只念 1 遍**（念不准请重录那一条，不要叠加遍数） |');
L.push('| 辅音 | **只念本音**，不拖长、不带例词 |');
L.push('| 六字真言 | 只录**单遍**约 1.8s，气息连绵照平时念法 |');
L.push('| 导出 | MP3 / M4A / WAV 都行，统一转 16kHz 单声道 MP3 |');
L.push('| 命名 | **必须与「文件名」列完全一致**，含扩展名 |');
L.push('');
L.push('### 为什么「一条只念 1 遍」');
L.push('');
L.push('小程序**不录音、不做语音识别**，音频文件只会被**原样播放**给玩家听。');
L.push('所以「念三遍让系统听准」不成立——那只会让玩家听到三遍，'
  + '对一个音节则是**错误的教学示范**（玩家会以为藏语是三连音），'
  + '而这个按钮是**每次配对成功都播**的。');
L.push('');
L.push('念不准的正解是**重录那一条**。');
L.push('');

const out = path.join(ROOT, 'docs', 'voice-worksheet.md');
fs.writeFileSync(out, L.join('\n'), 'utf8');
console.log('已生成：%s', out);
console.log('30 辅音：真人 %d 条 / 待录 %d 条', letterHuman.length, letterNew.length);
console.log('图标：待录 %d 条（%s）', iconNew.length, iconNew.map(i => i.id).join(',') || '无');
console.log('真正待录合计 %d 条%s', todoList.length,
  todoList.length ? '（' + todoList.join('、') + '）' : ' —— 全部到位');
if (!HUMAN_TOTAL) console.warn('⚠ 真人台账为空 —— 状态列会全部显示为 TTS，请检查 voice-provenance.json');
