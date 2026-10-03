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

module.exports = {
  play: play,
  // 语义化封装
  tap: function () { play('tap'); },
  match: function () { play('match'); },
  mismatch: function () { play('mismatch'); },
  win: function () { play('win'); }
};
