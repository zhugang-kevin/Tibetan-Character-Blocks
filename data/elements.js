// data/elements.js — 元素库（30个藏文字母 + 4个文化图标）
// D32 对比度：金 #B7950B→#8A6A12（白字 2.66→4.69）、绿 #1E8449→#176B3C（4.37→6.07）。
// 这两个色同时充当「牌面底」与「浅底卡片上的文字/图形墨」，改一处两端同时达标。
// D25 文化红线（2026-10-06 拍板）：宗教符号只作装饰，不得成为可消除牌面。
//   icon_02 / icon_04 原为「莲花」「经幡」——已换成世俗题材「青稞」「牦牛」；
//   **id 与 color 一律不动**（关卡配比 / 文化卡键 / 精灵映射零波及），只换 title + iconKey + char。
//   佛塔 / 酥油灯 / 风马旗从来不在元素库；由 scripts/validate.js §17.7 硬性把关。
//
// 30 辅音扩充（2026-10-07 用户拍板，certificate-system.md「二期扩展清单」第 1 项落地）：
//   letter_01..letter_30 = 藏文三十个辅音字母，按传统顺序（ཀ 列 → ཨ）排列。
//   颜色只在四张达标牌面色（红/绿/蓝/金）里循环，不引入新色 —— §30 对比度门禁零波及。
module.exports = {
  // 藏文字母（30 个辅音，传统顺序）
  letter_01: { type: 'letter', tibetan: 'ཀ', color: '#C0392B' },
  letter_02: { type: 'letter', tibetan: 'ཁ', color: '#176B3C' },
  letter_03: { type: 'letter', tibetan: 'ག', color: '#2471A3' },
  letter_04: { type: 'letter', tibetan: 'ང', color: '#8A6A12' },
  letter_05: { type: 'letter', tibetan: 'ཅ', color: '#C0392B' },
  letter_06: { type: 'letter', tibetan: 'ཆ', color: '#176B3C' },
  letter_07: { type: 'letter', tibetan: 'ཇ', color: '#2471A3' },
  letter_08: { type: 'letter', tibetan: 'ཉ', color: '#8A6A12' },
  letter_09: { type: 'letter', tibetan: 'ཏ', color: '#C0392B' },
  letter_10: { type: 'letter', tibetan: 'ཐ', color: '#176B3C' },
  letter_11: { type: 'letter', tibetan: 'ད', color: '#2471A3' },
  letter_12: { type: 'letter', tibetan: 'ན', color: '#8A6A12' },
  letter_13: { type: 'letter', tibetan: 'པ', color: '#C0392B' },
  letter_14: { type: 'letter', tibetan: 'ཕ', color: '#176B3C' },
  letter_15: { type: 'letter', tibetan: 'བ', color: '#2471A3' },
  letter_16: { type: 'letter', tibetan: 'མ', color: '#8A6A12' },
  letter_17: { type: 'letter', tibetan: 'ཙ', color: '#C0392B' },
  letter_18: { type: 'letter', tibetan: 'ཚ', color: '#176B3C' },
  letter_19: { type: 'letter', tibetan: 'ཛ', color: '#2471A3' },
  letter_20: { type: 'letter', tibetan: 'ཝ', color: '#8A6A12' },
  letter_21: { type: 'letter', tibetan: 'ཞ', color: '#C0392B' },
  letter_22: { type: 'letter', tibetan: 'ཟ', color: '#176B3C' },
  letter_23: { type: 'letter', tibetan: 'འ', color: '#2471A3' },
  letter_24: { type: 'letter', tibetan: 'ཡ', color: '#8A6A12' },
  letter_25: { type: 'letter', tibetan: 'ར', color: '#C0392B' },
  letter_26: { type: 'letter', tibetan: 'ལ', color: '#176B3C' },
  letter_27: { type: 'letter', tibetan: 'ཤ', color: '#2471A3' },
  letter_28: { type: 'letter', tibetan: 'ས', color: '#8A6A12' },
  letter_29: { type: 'letter', tibetan: 'ཧ', color: '#C0392B' },
  letter_30: { type: 'letter', tibetan: 'ཨ', color: '#176B3C' },

  // 文化图标（简笔线条风格）
  icon_01: { type: 'icon', color: '#C0392B', title: '吉祥结', iconKey: 'knot', char: '吉' },
  icon_02: { type: 'icon', color: '#2471A3', title: '青稞', iconKey: 'barley', char: '稞' },
  icon_03: { type: 'icon', color: '#5D6D7E', title: '雪山', iconKey: 'mountain', char: '雪' },
  icon_04: { type: 'icon', color: '#8A6A12', title: '牦牛', iconKey: 'yak', char: '牦' }
};
