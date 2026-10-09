// utils/audio.js — 音效管理
// 7个音效均为程序合成（sine 波 + 包络），免费可商用，无版权风险。
//
// D52 体积腾挪（2026-10-08）：藏地密码讲解改为「播整段正文」后十条 mp3 +83KB，
// 主包顶到 2MB 上限；这里把 6 条合成音由未压缩 PCM WAV 转 MP3（172KB → 35KB）
// 一次腾出 133KB。见 scripts/compress_sfx.py。
//   · tap **保留 WAV**：只有 1.5KB 省不出空间，且是「点一下立刻响」的即时反馈，
//     MP3 编码器约 26ms 的前置延迟会把手感变钝 —— 收益为零、风险非零。
//   · 其余 6 条（match / mismatch / win / drum / horn / cheer）走 MP3：
//     单声道 / 22050Hz / 64kbps，合成音频谱极简，无可辨听感损失。
//   · 仍留 wav 兜底：万一有人重跑 make_praise_audio.py 只产出了 WAV，声音照响，
//     体积守卫会红，但玩家不会遭遇静音。
var SFX_MP3 = { match: 1, mismatch: 1, win: 1, drum: 1, horn: 1, cheer: 1 };
var cache = {};

function get(name) {
  if (!cache[name]) {
    var ctx = wx.createInnerAudioContext();
    ctx.src = '/audio/' + name + (SFX_MP3[name] ? '.mp3' : '.wav');
    ctx.obeyMuteSwitch = true;
    ctx.__triedWav = false;
    ctx.onError(function () {
      // mp3 缺失（例如重生成时只产出了 WAV）→ 退到同名 wav，只试一次
      if (SFX_MP3[name] && !ctx.__triedWav) {
        ctx.__triedWav = true;
        try { ctx.src = '/audio/' + name + '.wav'; ctx.play(); } catch (e) { /* 静默 */ }
      }
    });
    cache[name] = ctx;
  }
  return cache[name];
}

function play(name) {
  try {
    var ctx = get(name);
    ctx.stop();
    ctx.play();
  } catch (e) {
    // 音效失败不影响游戏
  }
}

// ---- 藏文发音（Gate 1 P0：每次配对成功都朗读该元素）----
// 发音音频放置于 audio/voice/{元素id}.mp3 或 .wav（双扩展名，mp3 优先；letter_01..30 / icon_01..04；
// 由 scripts/gen_voice.py 的 TTS 预生成或真人录音，规格 16kHz 单声道 16bit WAV）。
// 文件缺失时静默回退（onError 忽略），不阻塞游戏流程。
// 录音规格：单声道、128kbps、每条 0.5-1.5s。
//
// 单声部策略：同一时刻只允许一条发音在响。配对很快时（连击），
// 新发音会打断上一条，而不是叠在一起变成噪音。
var voiceCtx = {};
var activeVoice = null;

// ---------------------------------------------------------------- 有没有这条发音？
// 2026-10-09 用户反馈「《🔊 点击播放藏文读音》根本就没有办法播放」：
// 一部分是这个原因——有些元素的音频**压根不存在**，而 `pronounce` 过去一律返回 true，
// 于是 UI 永远显示「点击播放」，点了却是死寂：承诺了一个给不了的东西。
// data/voices.js 是构建期由 scripts/gen_voice_index.py 按 audio/voice/ 目录生成的清单，
// 有了它就能在**点之前**说实话（按钮显示「发音待录入」），而不是让用户对着黑洞点。
var VOICE_INDEX = require('../data/voices.js');
var VOICE_SET = {};
VOICE_INDEX.ids.concat(VOICE_INDEX.extras).forEach(function (k) { VOICE_SET[k] = 1; });

function hasVoice(id) {
  return !!VOICE_SET[id];
}

function pronounce(id) {
  // 没有音源就不要假装播了：直接返回 false，让调用方给出诚实的反馈。
  // （过去这里会照常建 ctx 并 return true ——  misses 要等异步 onError 才知道，UI 无从判断。）
  if (!id || !VOICE_SET[id]) return false;
  try {
    if (!voiceCtx[id]) {
      var c = wx.createInnerAudioContext();
      // 双扩展名（2026-10-08）：mp3 为主（中文播报 praise_*/secret_* 与压缩后的元素音），
      // 失败自动回退 .wav（天翼 TTS 原始产物）；两个都没有时静默，不影响游戏。
      c.__triedWav = false;
      c.src = '/audio/voice/' + id + '.mp3';
      c.obeyMuteSwitch = true;
      c.onError(function () {
        if (!c.__triedWav) {
          c.__triedWav = true;
          try { c.src = '/audio/voice/' + id + '.wav'; c.play(); } catch (e) { /* 静默 */ }
        }
      });
      voiceCtx[id] = c;
    }
    var v = voiceCtx[id];
    if (activeVoice && activeVoice !== v) {
      try { activeVoice.stop(); } catch (e) { /* 忽略 */ }
    }
    activeVoice = v;
    v.stop();
    v.play();
    return true;
  } catch (e) {
    return false;
  }
}

// 复用单声部发音通道播放指定语音文件（audio/voice/{name}.wav）
// 新发音会打断旧发音；文件缺失时静默回退
function speak(name) {
  return pronounce(name);
}

// 停止当前发音（离开页面 / 切后台时调用）。
// 为什么必须有：语音通道是模块级单例（activeVoice），元素发音约 0.5-1.5 秒、
// 结算祝福 2-3 秒——页面走了而语音还在响，是会把「离开」变成「追着播」的真实缺陷。
// 只停语音，不动 BGM（那是 bgmStop 的职责）。
function stopVoice() {
  try {
    if (activeVoice) { activeVoice.stop(); activeVoice = null; }
    return true;
  } catch (e) { return false; }
}

// ---- 档位音效：一档一音 ----
// 等级 1 复用既有的铜铃（match）；等级 2/3/4+ 依次是手鼓 / 法号 / 欢呼，
// 三条新音由 scripts/make_praise_audio.py 程序合成（与既有 4 条同规格、同响度口径，
// 零版权可商用）。规格与标定见 docs/DECISIONS.md D34。
//
// 「同一档内不换音」：等级 4 与 5 共用欢呼，不再往上升——
// 频次最高的档位如果每次都换音源，会变成噪音。档位由 utils/praise.js 判定。
var TIER_SOUND = ['', 'match', 'drum', 'horn', 'cheer', 'cheer'];

function tier(level) {
  var lv = Math.max(1, Math.min(TIER_SOUND.length - 1, Number(level) || 1));
  play(TIER_SOUND[lv]);
}

// ---- 背景音乐（PRD 3.3）----
// audio/bgm.wav：高原晨雾 v2（慢速 · 软起音 · 长衰减，2026-10-07 用户反馈「太狂躁」后重做），
// 两小节无缝循环，由 scripts/make_bgm.py 程序合成（零版权）。与音效**分开建 ctx**：
// loop 循环播放、音量压到 0.28，绝不参与 play() 的 stop/play 瞬时抢占。
// 偏好位 bgmOff 存 progress（与 praiseOff 同一条三处同步链路）。
// 体验版用 Web Audio 按同一份音符表复现（WAV 资产只在小程序包内）。
var BGM_VOLUME = 0.28;
var bgmCtx = null;

function bgmContext() {
  if (!bgmCtx) {
    bgmCtx = wx.createInnerAudioContext();
    bgmCtx.src = '/audio/bgm.wav';
    bgmCtx.loop = true;
    bgmCtx.volume = BGM_VOLUME;
    bgmCtx.obeyMuteSwitch = true;
    bgmCtx.onError(function () { /* 缺文件时静默，不影响游戏 */ });
  }
  return bgmCtx;
}

// 开始 / 恢复背景音乐。已开关偏好时调用方应先判断，本函数只管「响」。
function bgmStart() {
  try {
    bgmContext().play();
    return true;
  } catch (e) {
    return false;
  }
}

// 暂停（离开游戏页 / 用户关闭时用）。pause 保留进度，loop 音无所谓，但 pause 比 stop 温和。
function bgmStop() {
  try {
    if (bgmCtx) bgmCtx.pause();
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  play: play,
  pronounce: pronounce,
  hasVoice: hasVoice,
  speak: speak,
  stopVoice: stopVoice,
  tier: tier,
  TIER_SOUND: TIER_SOUND,
  BGM_VOLUME: BGM_VOLUME,
  bgmStart: bgmStart,
  bgmStop: bgmStop,
  // 语义化封装
  tap: function () { play('tap'); },
  match: function () { play('match'); },
  mismatch: function () { play('mismatch'); },
  win: function () { play('win'); },
  // 通关藏语语音：བཀྲ་ཤིས་བདེ་ལེགས（扎西德勒）
  tashiDelek: function () { return speak('tashi_delek'); },
  // 结算页舒缓祝福语（每日一句，MVP 固定 blessing_01）
  blessing: function () { return speak('blessing_01'); }
};
