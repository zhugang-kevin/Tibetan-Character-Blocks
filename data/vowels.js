// data/vowels.js — 藏文四个元音符号的发音参考（藏文读音补齐，2026-10-15）
//
// 与 data/cards.js（30 辅音字母 + 8 文化图标）平行：那里是「字母 / 图标」发音卡，
// 这里是「元音符号」发音卡。元音符号（ི ུ ེ ོ）不能独立成字，必须依附基字，
// 因此每条都给出「示范音节」（基字 ཀ + 元音符号）作为可听示例。
//
// 纯文字参考不依赖音频文件，音频（vowel_*.mp3）按计划由
// docs/藏文读音音频分包方案.md 在 praiseVoice 分包内生成；
// 未生成前 pronounce(id) / VOICES[id] 自然为「待录入」，UI 如实显示，绝不假装能播。
//
// id 形如 vowel_01..04；sign 是四个元音符号本身；demo 是示范音节（基字 ཀ 起头）。
module.exports = [
  {
    id: 'vowel_01',
    type: 'vowel',
    sign: 'ི',
    wylie: 'i',
    ipa: 'i',
    cn: '依',
    demo: 'ཀི',
    demoWylie: 'ki',
    title: 'ི',
    subtitle: 'i · 依（元音符号，标在基字右上方，使音节读 /i/）',
    description: '藏文四个元音符号之一，写在基字右上方，使音节读作 /i/。例如 ཀ 加 ི 变成 ཀི（ki）。',
    funFact: '藏文元音符号本身不能单独出现，必须「骑」在辅音上——单独写 ི 是不成立的。'
  },
  {
    id: 'vowel_02',
    type: 'vowel',
    sign: 'ུ',
    wylie: 'u',
    ipa: 'u',
    cn: '乌',
    demo: 'ཀུ',
    demoWylie: 'ku',
    title: 'ུ',
    subtitle: 'u · 乌（元音符号，标在基字右上方，使音节读 /u/）',
    description: '藏文四个元音符号之一，写在基字右上方，使音节读作 /u/。例如 ཀ 加 ུ 变成 ཀུ（ku）。',
    funFact: '藏文的元音符号都写在辅音的「右上方」，和拉丁字母把变音符号放上方是同一个思路。'
  },
  {
    id: 'vowel_03',
    type: 'vowel',
    sign: 'ེ',
    wylie: 'e',
    ipa: 'e',
    cn: '诶',
    demo: 'ཀེ',
    demoWylie: 'ke',
    title: 'ེ',
    subtitle: 'e · 诶（元音符号，标在基字右上方，使音节读 /e/）',
    description: '藏文四个元音符号之一，写在基字右上方，使音节读作 /e/。例如 ཀ 加 ེ 变成 ཀེ（ke）。',
    funFact: '拉萨话里 ེ 的实际音接近汉语「诶」，但比普通话的 e 更靠后、更紧。'
  },
  {
    id: 'vowel_04',
    type: 'vowel',
    sign: 'ོ',
    wylie: 'o',
    ipa: 'o',
    cn: '喔',
    demo: 'ཀོ',
    demoWylie: 'ko',
    title: 'ོ',
    subtitle: 'o · 喔（元音符号，标在基字右上方，使音节读 /o/）',
    description: '藏文四个元音符号之一，写在基字右上方，使音节读作 /o/。例如 ཀ 加 ོ 变成 ཀོ（ko）。',
    funFact: '藏文不写「半元音 + 元音」的拼法，ོ 直接把 /o/ 标在辅音上，干净利落。'
  }
];
