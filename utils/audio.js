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

// ---- 藏文发音（Gate 1 P0：第一次听到藏文发音）----
// 真人录音放置于 audio/voice/{元素id}.mp3（如 letter_01.mp3）。
// 文件缺失时静默回退（onError 忽略），不阻塞游戏流程。
// 录音规格：单声道、128kbps、每条 0.5-1.5s，8 个字母各一条。
var voiceCtx = {};

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
    v.stop();
    v.play();
    return true;
  } catch (e) {
    return false;
  }
}

// ---- 连击音效：复用铜铃声，播放速率随连击数升高 ----
// playbackRate 支持范围约 0.5-2.0，部分机型不支持时自动忽略
function combo(n) {
  try {
    var ctx = get('match');
    var rate = Math.min(2, 1 + 0.1 * Math.max(0, n - 1));
    try { ctx.playbackRate = rate; } catch (e) { /* 不支持则原速 */ }
    ctx.stop();
    ctx.play();
  } catch (e) {
    // 音效失败不影响游戏
  }
}

module.exports = {
  play: play,
  pronounce: pronounce,
  combo: combo,
  // 语义化封装
  tap: function () { play('tap'); },
  match: function () { play('match'); },
  mismatch: function () { play('mismatch'); },
  win: function () { play('win'); }
};
