// data/elements.js — 元素库（8个藏文字母 + 4个文化图标）
// D32 对比度：金 #B7950B→#8A6A12（白字 2.66→4.69）、绿 #1E8449→#176B3C（4.37→6.07）。
// 这两个色同时充当「牌面底」与「浅底卡片上的文字/图形墨」，改一处两端同时达标。
// D25 文化红线（2026-10-06 拍板）：宗教符号只作装饰，不得成为可消除牌面。
//   icon_02 / icon_04 原为「莲花」「经幡」——已换成世俗题材「青稞」「牦牛」；
//   **id 与 color 一律不动**（关卡配比 / 文化卡键 / 精灵映射零波及），只换 title + iconKey + char。
//   佛塔 / 酥油灯 / 风马旗从来不在元素库；由 scripts/validate.js §17.7 硬性把关。
module.exports = {
  // 藏文字母
  letter_01: { type: 'letter', tibetan: 'ཀ', color: '#C0392B' },
  letter_02: { type: 'letter', tibetan: 'ཁ', color: '#176B3C' },
  letter_03: { type: 'letter', tibetan: 'ག', color: '#2471A3' },
  letter_04: { type: 'letter', tibetan: 'ང', color: '#8A6A12' },
  letter_05: { type: 'letter', tibetan: 'ཅ', color: '#C0392B' },
  letter_06: { type: 'letter', tibetan: 'ཆ', color: '#176B3C' },
  letter_07: { type: 'letter', tibetan: 'ཇ', color: '#2471A3' },
  letter_08: { type: 'letter', tibetan: 'ཉ', color: '#8A6A12' },

  // 文化图标（简笔线条风格）
  icon_01: { type: 'icon', color: '#C0392B', title: '吉祥结', iconKey: 'knot', char: '吉' },
  icon_02: { type: 'icon', color: '#2471A3', title: '青稞', iconKey: 'barley', char: '稞' },
  icon_03: { type: 'icon', color: '#5D6D7E', title: '雪山', iconKey: 'mountain', char: '雪' },
  icon_04: { type: 'icon', color: '#8A6A12', title: '牦牛', iconKey: 'yak', char: '牦' }
};
