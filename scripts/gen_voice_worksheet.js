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

const HAS = {};
voices.ids.concat(voices.extras).forEach(k => { HAS[k] = 1; });

function fmtDur(d) {
  if (!d) return '';
  return d.toFixed(2) + 's';
}

/** 取某id 的藏文原文：优先 manifest（记录了当年用的写法），否则 cards */
function textOf(id, card) {
  const m = man[id];
  if (m && m.text) return { text: m.text, src: 'tts-manifest', form: m.form || '' };
  if (card && card.tibetan) return { text: card.tibetan, src: 'cards.js', form: '' };
  return null;
}

// ---------------------------------------------------------------- ① 30 辅音
const letters = [];
for (let i = 0; i <= 30; i++) {
  const c = cards[i];
  if (!c) continue;
  const t = textOf(c.id, c);
  letters.push({
    id: c.id, tibetan: t ? t.text : c.tibetan, subtitle: c.subtitle,
    has: !!HAS[c.id], manifestForm: t ? t.form : '', dur: man[c.id] ? man[c.id].dur : null
  });
}

// ---------------------------------------------------------------- ② 4 图标
const icons = [];
for (let i = 0; i < cards.length; i++) {
  const c = cards[i];
  if (!c || c.type !== 'icon' || c.id === 'icon_01') continue;   // icon_01 与辅音同表展示
  // 图标的藏文在 subtitle 里（「藏语：xxx」），tibetan 字段是空的
  const m = /^藏语：(.+)$/.exec(c.subtitle || '');
  icons.push({
    id: c.id, title: c.title,
    tibetan: m ? m[1] : (man[c.id] ? man[c.id].text : ''),
    has: !!HAS[c.id], dur: man[c.id] ? man[c.id].dur : null
  });
}

// ---------------------------------------------------------------- ③ 情绪语音
const emotions = [];
['tashi_delek', 'blessing_01'].concat(
  [3, 4, 5, 6, 7].map(i => 'greet_0' + i)).forEach(id => {
    const m = man[id];
    emotions.push({
      id, tibetan: m ? m.text : '', has: !!HAS[id], dur: m ? m.dur : null
    });
  });

// ---------------------------------------------------------------- ④ 祈福句（7 句 greetings）
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
totalNew += letterNew.length; totalHas += letterHas.length;
L.push('## ① 30 个辅音字母（`letter_01` ~ `letter_30`）');
L.push('');
L.push(`**已有音频 ${letterHas.length} 条（多数元音长度不对，见备注），需重录 ${letterNew.length} 条。**`);
L.push('');
table(letters, [
  ['文件名', l => '`' + l.id + '.mp3`'],
  ['藏文（照念）', l => l.tibetan],
  ['Wylie / 读音', l => (l.subtitle || '').split('·').slice(0, 1).join('').trim() || '—'],
  ['状态', l => l.has ? '⚠ 已有' + (l.manifestForm === 'alt' ? '（长音 `ཱ`）' : '') : '**待录**'],
  ['现时长', l => fmtDur(l.dur) || '—']
]);
L.push('> ⚠ **「已有」不代表正确**：`letter_01/06/09/12/14/19/25/27` 当年用「字母+`ཱ`」'
  + '合成，念的是**长音**，与UI 教的裸辅音不符 → 这 8 条**请一并重录**，念本音、不拖长。');
L.push('');

// ② 图标
const iconNew = icons.filter(i => !i.has);
totalNew += iconNew.length;
L.push('## ② ' + (icons.length + 1) + ' 个图标（`icon_01` ~ `icon_' + String(icons.length + 1).padStart(2, '0') + '`）');
L.push('');
table(icons, [
  ['文件名', i => '`' + i.id + '.mp3`'],
  ['藏文（照念）', i => i.tibetan],
  ['名称', i => i.title],
  ['状态', i => i.has ? '⚠ 已有' : '**待录**'],
  ['现时长', i => fmtDur(i.dur) || '—']
]);
L.push('');

// ③ 情绪语音
L.push('## ③ 情绪 / 祝福语音');
L.push('');
table(emotions, [
  ['文件名', e => '`' + e.id + '.mp3`'],
  ['藏文（照念）', e => e.tibetan],
  ['状态', e => e.has ? '⚠ 已有（TTS）' : '**待录**'],
  ['现时长', e => fmtDur(e.dur) || '—']
]);
L.push('');

// ④ 祈福句
L.push('## ④ 每日祈福句（`daily.greetings`，跳窗用）');
L.push('');
table(greetings, [
  ['文件名', g => '`' + g.id + '.mp3`'],
  ['藏文（照念）', g => g.tibetan],
  ['中文', g => g.cn],
  ['状态', g => g.has ? '⚠ 已有（TTS）' : '**待录**']
]);
L.push('');

// ⑤ 六字真言
const mantra = man.mantra;
L.push('## ⑤ 六字真言（祈福灯专用，特殊处理）');
L.push('');
L.push('| 文件名 | 藏文（照念） | 用途 | 状态 |');
L.push('| --- | --- | --- | --- |');
L.push('| `mantra.mp3` | ' + (mantra ? mantra.text : '') + ' | 点灯瞬间播1 遍 | ⚠ 已有（TTS） |');
L.push('| `mantra_4x.mp3` | 同上 ×4 | 每日跳窗播 4 遍 | ⚠ 由单遍拼接 |');
L.push('');
L.push('**⚠ 只录单遍**（约 1.8 秒）。4 遍版由 `scripts/gen_mantra_4x.py` 自动拼接。');
L.push('若录成 3 遍或 4 遍连诵，拼接后会变成 9~16 遍，违背 D109 的「4 遍」决定。');
L.push('');

// ⑥ 四层
L.push('## ⑥ 四层附加字（`data/affixes.js` 权威穷举表，**目前零音频**）');
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

// ⑦ 学习词句
L.push('## ⑦ 学习词句池（`data/learning.js` L10–L13）');
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

// ⑧ 秘境图
L.push('## ⑧ 十关秘境图名称（`data/reveals.js`）');
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

// ⑨ 已签确
L.push('## ⑨ 已由你签确（无需重录，仅补签范围）');
L.push('');
L.push('| 文件名 | 藏文 | 签确记录 |');
L.push('| --- | --- | --- |');
Object.keys(pron).forEach(k => L.push('| `' + k + '.mp3` | ' +
  (man[k] ? man[k].text : '—') + ' | ' + (pron[k].native_note || '—') + ' |'));
L.push('');

// ---------------------------------------------------------------- 统计
L.push('## 汇总');
L.push('');
L.push('| 类别 | 条数 |');
L.push('| --- | --- |');
L.push('| 30 辅音（有音频 / 需重录） | ' + letterHas.length + ' / ' + letterNew.length + ' |');
L.push('| 4 图标（需重录） | ' + iconNew.length + ' |');
L.push('| 情绪语音 | ' + emotions.length + '（全部 TTS，建议重录） |');
L.push('| 每日祈福句 | ' + greetings.length + '（全部 TTS，建议重录） |');
L.push('| 六字真言 | 1（单遍） |');
L.push('| 四层附加字 | ' + layers.reduce((s, l) => s + l.list.length, 0) + ' |');
L.push('| 学习词句 | ' + poolUniq.length + ' |');
L.push('| 秘境图名 | ' + revealRows.length + ' |');
L.push('| 藏文赞美 Bo（分包，已有音频） | ' + boAudio.length + '（建议重录） |');
L.push('');
L.push('**需重录合计约 ' + (totalNew + emotions.length + greetings.length + 1 + boAudio.length)
  + ' 条；已有但需人耳复核约 ' + letterHas.length + ' 条。**');
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
console.log('需重录约 %d 条；已有待复核 %d 条',
  totalNew + emotions.length + greetings.length + 1 + boAudio.length, letterHas.length);
