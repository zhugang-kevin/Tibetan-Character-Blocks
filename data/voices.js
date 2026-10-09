// data/voices.js — **哪些元素真的有藏文发音**（由 scripts/gen_voice_index.py 生成，勿手改）
//
// 生成依据只有一个：audio/voice/ 目录里到底有哪些文件。录音放进去后重跑脚本即可，
// 不需要改代码；scripts/validate.js 会校对「表 vs 目录」是否一致（漂移即报错）。
//
// 为什么要在构建期算这张表：小程序没有列目录的 API，运行时只能「先播了再说」，
// 而 file missing 要等 onError 才知道 —— UI 便无法提前告诉用户「这个还没录」。
// 有了这张表，喇叭按钮可以在**点之前**就说实话（见 utils/audio.js 的 hasVoice）。
//
// ⚠️ 由脚本生成，手改会在下次重跑时被覆盖（且会被 §48 守卫判为漂移）。
module.exports = {
  // 有音频的元素 id（30 字母 + 4 图标里已到位的那些）
  ids: [
    'letter_01',
    'letter_02',
    'letter_05',
    'letter_06',
    'letter_07',
    'letter_08',
    'letter_09',
    'letter_10',
    'letter_11',
    'letter_12',
    'letter_14',
    'letter_15',
    'letter_17',
    'letter_18',
    'letter_19',
    'letter_22',
    'letter_25',
    'letter_26',
    'letter_27',
    'letter_28',
    'letter_29',
    'letter_30',
    'icon_01',
    'icon_02',
    'icon_03',
  ],
  // 还没有发音的元素 id —— UI 必须据此显示「发音待录入」而不是假装能播
  missing: [
    'letter_03',
    'letter_04',
    'letter_13',
    'letter_16',
    'letter_20',
    'letter_21',
    'letter_23',
    'letter_24',
    'icon_04',
  ],
  // 非元素类语音（情绪 / 中文讲解），键到 id 不存在时才查这里
  extras: [
    'blessing_01',
    'mantra',
    'praise_2',
    'praise_3',
    'praise_4',
    'praise_5',
    'secret_01',
    'secret_02',
    'secret_03',
    'secret_04',
    'secret_05',
    'secret_06',
    'secret_07',
    'secret_08',
    'secret_09',
    'secret_10',
    'tashi_delek',
  ]
};
