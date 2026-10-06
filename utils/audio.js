// utils/audio.js — 音效管理
// 4个音效均为程序合成（sine 波 + 包络），免费可商用，无版权风险。
var cache = {};

function get(name) {
  if (!cache[name]) {
    var ctx = wx.createInnerAudioContext();
    ctx.src = '/audio/' + name + '.wav';
    ctx.obeyMuteSwitch = true;
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
// 真人录音放置于 audio/voice/{元素id}.mp3（letter_01..08 / icon_01..04）。
// 文件缺失时静默回退（onError 忽略），不阻塞游戏流程。
// 录音规格：单声道、128kbps、每条 0.5-1.5s。
//
// 单声部策略：同一时刻只允许一条发音在响。配对很快时（连击），
// 新发音会打断上一条，而不是叠在一起变成噪音。
var voiceCtx = {};
var activeVoice = null;

function pronounce(id) {
  try {
    if (!voiceCtx[id]) {
      var c = wx.createInnerAudioContext();
      c.src = '/audio/voice/' + id + '.mp3';
      c.obeyMuteSwitch = true;
      c.onError(function () { /* 无录音文件，静默 */ });
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

// 复用单声部发音通道播放指定语音文件（audio/voice/{name}.mp3）
// 新发音会打断旧发音；文件缺失时静默回退
function speak(name) {
  return pronounce(name);
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

module.exports = {
  play: play,
  pronounce: pronounce,
  speak: speak,
  tier: tier,
  TIER_SOUND: TIER_SOUND,
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
