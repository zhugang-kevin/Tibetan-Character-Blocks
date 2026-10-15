// utils/scene-voice.js — 场景祝福语音（D115）
//
// 为什么单独一个模块：五个场景触发点分散在 pages/game/game.js 的五处
// （连击 / 通关 / 稀有 / 目标 / 错配），若把「该播哪句、要不要播」的判断
// 写进页面，会立刻退化成第二套praise 逻辑——而 D34 已经踩过一次
// 「频次最高的档位如果每次都换音源就会变成噪音」的坑。
//
// 三条硬约束（都是踩过才知道的）：
//   ① **绝不抢元素发音的通道**。每次配对成功都会在 300ms 后朗读该元素
//      （game.js 的 voiceTimer），那是学习闭环，优先级最高。
//      本模块在元素发音窗口内一律让路，否则玩家听到的是祝福语而不是辅音。
//   ② **频次必须有上限**。连击可能连续 8、9 次；错配可能连着 5 次。
//      没有闸门 = 每秒播一次藏语 = 玩家会主动关掉声音。
//   ③ **语音期间压低 BGM**（复用 audio.duckBgm），与元素发音同一套处理。
//
// 诚实边界：本模块只决定「播不播、播哪句」。**「念得对不对」无法由代码判断**，
// 全部音频为用户本人真人录音（见 docs/DECISIONS.md D112 / D114）。

// 五场景 → 语音 id 的唯一映射表。别处一律引用这里，不要各自硬编码字符串。
var SCENE_VOICE = {
  combo: 'greet_03',   // 连续消除
  clear: 'greet_04',   // 完成挑战
  rare: 'greet_05',    // 稀有奖励
  goal: 'greet_06',    // 目标达成
  comfort: 'greet_07'  // 温柔鼓励
};

// 各场景的最短间隔（毫秒）。判据是「这句话念完要多久」+「人耳对重复的忍耐」：
// 一句1.0~1.6s，连续听到同一句超过 3 次就变成噪音而不是安慰。
var SCENE_COOLDOWN = {
  combo: 9000,     // 连击最频繁 → 闸门最紧
  rare: 20000,     // 稀有卡本身不密，但同关可能连出
  comfort: 15000,  // 错配连着发生时不能句句安慰
  goal: 0,         // 每关至多一次（下面 ONCE_PER_LEVEL 兜住）
  clear: 0         // 同上
};

// 天然每关只会发生一次、**但仍可能被重复调用**的场景。
// 为什么不能只靠冷却=0：finishLevel 有 `if (this.finished) return` 守卫，
//   但守卫在**业务层**、不在音频层 —— 任何新增调用点都可能绕过它。
//   行为测试实测到：冷却=0 时连续 trigger('clear') 会播两次。
//   所以这里显式声明「一次性场景」，由 state 记住已播过。
var ONCE_PER_LEVEL = { goal: 1, clear: 1 };

// 连击门槛：连到第几对才值得给一句。连击 2~3 连是最常见的，
// 那时播祝福等于给日常操作加噪声——「值得庆祝」要真的值得。
var COMBO_THRESHOLD = 4;

// 各场景**让位延迟**（毫秒）：判据是「这一场景在等谁」。
//   · 连击 / 稀有 / 目标 / 鼓励 都发生在**盘面仍在交互**时 —— 每次配对成功都会在
//     300ms 后朗读该元素（game.js 的 voiceTimer），那是学习闭环，优先级最高。
//     必须让开它，否则玩家听到的是祝福语、**辅音被吃掉**。
//   · 完成挑战 / 通关 不一样：关卡已结束，此后不会再有元素发音。
//     但**不能靠缩短延迟来抢在跳页前念完** —— 一句最短也要 1.0s，
//     finishLevel 在 1200ms 就 redirectTo 结算页，算式 350+delay+1000 > 1200 恒成立。
//     所以正确做法是**推迟跳转**（见 game.js 的 NAV_HOLD_MS），而不是把祝福塞进
//     跳转前的几百毫秒里 —— 后者只会让祝福被腰斩。
var SCENE_YIELD_MS = {
  combo: 1200,
  rare: 1200,
  goal: 1200,
  comfort: 1200,
  clear: 350
};

// 通关/完成挑战时，跳结算页要多等多久才不腰斩语音（毫秒）。
// 判据（由scripts/test-scene-voice.js 第5 节机检，不靠手算）：
//   触发 350 + 让位 350 + 最长句子 1600 + 收尾余量 300 = 2600ms。
//   我第一版写 2200ms，被行为测试当场判红—— 那会把最长的那句念掉半截。
var NAV_HOLD_MS = 2600;

function createState(nowMs) {
  return {
    lastAt: {},          // scene -> 上次播的时刻
    comboPeak: 0,        // 本关连击峰值（跨场景共享，供 combo 场景判重复）
    played: {}// 一次性场景（ONCE_PER_LEVEL）已播标记
  };
}

/**
 * 场景语音总入口。返回 true = 已安排播放；false = 本次刻意不播。
 * @param {string} scene  SCENE_VOICE 的键
 * @param {object} st     createState() 的返回值
 * @param {function} play 播放函数（注入，便于测试与 H5 复用）
 * @param {number} nowMs  当前时刻
 * @param {object} opt附加条件 { combo: 连击数, force: 首次发现类事件 }
 */
function shouldPlay(scene, st, nowMs, opt) {
  opt = opt || {};
  if (!SCENE_VOICE[scene]) return false;
  // 一次性场景：每关至多播一次（不能只靠业务层守卫，行为测试已证明会重复）
  if (ONCE_PER_LEVEL[scene] && st.played && st.played[scene]) return false;
  // 连击：不到门槛不播；同一关里峰值已经播过就不重复播
  if (scene === 'combo') {
    var c = Number(opt.combo) || 0;
    if (c < COMBO_THRESHOLD) return false;
    if (c <= st.comboPeak) return false;
  }
  var cd = SCENE_COOLDOWN[scene] || 0;
  if (cd > 0 && st.lastAt[scene] && (nowMs - st.lastAt[scene]) < cd) return false;
  return true;
}

/**
 * 安排播放。会先把状态写下去再返回，保证同一次事件不会重复触发。
 * @returns {string|null} 实际播放的语音 id；null = 本次不播
 */
function trigger(scene, st, play, nowMs, opt) {
  if (!shouldPlay(scene, st, nowMs, opt)) return null;
  st.lastAt[scene] = nowMs;
  if (scene === 'combo') st.comboPeak = Number(opt && opt.combo) || 0;
  if (ONCE_PER_LEVEL[scene]) { if (!st.played) st.played = {}; st.played[scene] = true; }
  var id = SCENE_VOICE[scene];
  try {
    play(id);
  } catch (e) {
    // 播放失败不得影响游戏（与 audio.js 既有降级策略一致）
  }
  return id;
}

module.exports = {
  SCENE_VOICE: SCENE_VOICE,
  SCENE_COOLDOWN: SCENE_COOLDOWN,
  SCENE_YIELD_MS: SCENE_YIELD_MS,
  ONCE_PER_LEVEL: ONCE_PER_LEVEL,
  NAV_HOLD_MS: NAV_HOLD_MS,
  COMBO_THRESHOLD: COMBO_THRESHOLD,
  createState: createState,
  shouldPlay: shouldPlay,
  trigger: trigger
};