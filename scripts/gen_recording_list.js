/* scripts/gen_recording_list.js — 生成「学习线录音清单」给录制方用
 *
 * 为什么要有这个脚本（而不是手写一份 md）：
 *   录音清单必须与**当前关卡内容**严格对应。手写一份就会随内容改动而失真，
 *   失真的后果很隐蔽 —— 录了一条永远不会被播放的音（或漏录一条永远静默的音）。
 *   所以清单由代码从 data/learning.js + data/learn-audio.js 现算现出。
 *
 * 用法： node scripts/gen_recording_list.js
 * 产物： docs/录音清单-学习线.md
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const learning = require(path.join(ROOT, 'utils', 'learning'));
const elements = require(path.join(ROOT, 'data', 'elements'));
const learnAudio = require(path.join(ROOT, 'data', 'learn-audio'));
const levels = require(path.join(ROOT, 'data', 'learning')).LEVELS;
// ⚠️ 键的归一化：data/learn-audio.js 用**带 tsheg 的显示形**作键（ཀུ་），
//   而 buildStage().titles 给的是**不带 tsheg 的原形**（ཀུ）——
//   两端运行时都会过 withTseg 归一化，所以运行没问题；但生成器必须自己做这一步，
//   否则查表全落空、清单会静默变成 0 条（本轮实测踩到过）。
const tibText = require(path.join(ROOT, 'utils', 'tibetan-text'));
const tg = function (t) { return tibText.withTseg(t); };

const MAP = learnAudio.map || {};
const hasElementVoice = new Set();
Object.keys(elements).forEach(function (k) {
  const t = elements[k] && elements[k].tibetan;
  if (t) hasElementVoice.add(t);
});

// 逐关扫出「去重后的待录牌面」（L1 的辅音已在 ELEMENTS 里、有真人录音）
const rows = [];
const seenId = {};
for (let lv = 1; lv <= 15; lv++) {
  for (let st = 1; st <= 10; st++) {
    const stage = learning.buildStage(lv, st);
    (stage.titles || []).forEach(function (t) {
      if (hasElementVoice.has(t)) return;
      const id = MAP[tg(t)];                 // 归一化后再查（见上方注释）
      if (!id || seenId[id]) return;
      seenId[id] = true;
      rows.push({ lv: lv, st: st, id: id, tib: tg(t) });
    });
  }
}

const byLv = {};
rows.forEach(function (r) { (byLv[r.lv] = byLv[r.lv] || []).push(r); });

const BATCHES = [
  { name: '第 1 批', lvs: [2, 3], why: '最划算 —— 26 条就能让「元音 / 后加字」整级出声' },
  { name: '第 2 批', lvs: [4, 5, 6, 7], why: '四层附加字（再后加 / 前加 / 上加 / 下加）' },
  { name: '第 3 批', lvs: [8, 9], why: '组合与完整音节' },
  { name: '第 4 批', lvs: [10, 11], why: '组词（含真实词）' },
  { name: '第 5 批', lvs: [12, 13], why: '造句（条数少，但需要成句朗读的节奏）' },
  { name: '第 6 批', lvs: [14, 15], why: '综合复习（多为前面已录音节的复用，先看有没有重叠）' }
];

const L = [];
L.push('# 学习线录音清单');
L.push('');
L.push('> 由 `node scripts/gen_recording_list.js` 从当前关卡内容生成 · 对应 `data/learn-audio.js`');
L.push('> 待录 **' + rows.length + ' 条**');
L.push('');
L.push('## 这份清单解决什么');
L.push('');
L.push('学习线共 150 关、每关 14~46 张牌，但**去掉跨关重复后只有 236 种不同牌面**；');
L.push('其中 **L1 的 30 个辅音本来就有真人录音**（`letter_01`…），配对成功即朗读 ✓。');
L.push('**剩下 ' + rows.length + ' 种在整条学习线里听不到声音** —— 这一批就是唯一还静默的部分。');
L.push('');
L.push('> 口径：**没音源就静默，不假装出声、不拿别的音顶**（两端一致）。');
L.push('');
L.push('## 怎么用（三步，代码侧一行都不用改）');
L.push('');
L.push('1. 按下面的「音频 id」命名录好的文件，放进 `audio/voice/`（`.mp3` 或 `.wav` 都认）');
L.push('   例：`audio/voice/learn_001.mp3`');
L.push('2. 跑 `python scripts/gen_voice_index.py` 刷新 `data/voices.js`');
L.push('3. 跑 `node scripts/validate.js` —— 「录音索引覆盖」门禁会复核；绿了即生效');
L.push('');
L.push('两端的 `tib2Id()` 会按**藏文文本**自动接上新录音。');
L.push('（学习关的牌面 id 是合成的 `lrn_{lv}_{st}_{i}`，同一句在不同关里 id 不同，所以录音只能按文本索引。）');
L.push('');
L.push('## 建议批次（按教学顺序，越前越先教）');
L.push('');
L.push('| 批次 | 级别 | 内容 | 条数 | 说明 |');
L.push('|---|---|---|---|---|');
BATCHES.forEach(function (b) {
  const n = b.lvs.reduce(function (a, l) { return a + ((byLv[l] || []).length); }, 0);
  const names = b.lvs.map(function (l) { return 'L' + l + ' ' + ((levels[l - 1] || {}).name || ''); }).join(' / ');
  L.push('| ' + b.name + ' | ' + b.lvs.join('、') + ' | ' + names + ' | ' + n + ' | ' + b.why + ' |');
});
L.push('');
Object.keys(byLv).forEach(function (lv) {
  const rs = byLv[lv];
  L.push('## L' + lv + ' ' + ((levels[lv - 1] || {}).name || '') + '（' + rs.length + ' 条）');
  L.push('');
  L.push('> ' + ((levels[lv - 1] || {}).goal || ''));
  L.push('');
  L.push('| # | 藏文 | 音频 id | 首次出现在 |');
  L.push('|---|---|---|---|');
  rs.forEach(function (r, i) {
    L.push('| ' + (i + 1) + ' | `' + r.tib + '` | `' + r.id + '` | L' + r.lv + ' 第 ' + r.st + ' 课 |');
  });
  L.push('');
});

const out = path.join(ROOT, 'docs', '录音清单-学习线.md');
fs.writeFileSync(out, L.join('\n') + '\n', 'utf8');
console.log('✓ 已生成 ' + path.relative(ROOT, out) + '（待录 ' + rows.length + ' 条）');
