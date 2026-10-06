// data/elements.js — 元素库（8个藏文字母 + 4个文化图标）
// D32 对比度：金 #B7950B→#8A6A12（白字 2.66→4.69）、绿 #1E8449→#176B3C（4.37→6.07）。
// 这两个色同时充当「牌面底」与「浅底卡片上的文字/图形墨」，改一处两端同时达标。
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
  icon_02: { type: 'icon', color: '#2471A3', title: '莲花', iconKey: 'lotus', char: '莲' },
  icon_03: { type: 'icon', color: '#5D6D7E', title: '雪山', iconKey: 'mountain', char: '雪' },
  icon_04: { type: 'icon', color: '#8A6A12', title: '经幡', iconKey: 'flags', char: '幡' }
};
