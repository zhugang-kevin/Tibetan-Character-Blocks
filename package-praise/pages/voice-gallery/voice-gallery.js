// package-praise/pages/voice-gallery/voice-gallery.js
// 「藏文赞美发音」画廊：列出 25 条 praise.bo，逐条可点播。
// 用途：① 母语者 / 用户听审发音；② 进入即预热分包。
// 音频位于分包 package-praise/audio/voice/praise_bo_{level}_{idx}.mp3，
// 尚未生成时点击会静默（utils/audio.speakPraiseBo 已做诚实回退，绝不假装能播）。
var audio = require('../../../utils/audio.js');
var praise = require('../../../data/praise.js');

var list = [];
praise.tiers.forEach(function (t) {
  t.texts.forEach(function (d, i) {
    list.push({
      level: t.level,
      idx: i,
      zh: d.zh,
      bo: d.bo,
      key: 'praise_bo_' + t.level + '_' + i
    });
  });
});

Page({
  data: { items: list, playing: '' },
  onLoad: function () {
    // 预热分包，确保音频在点击时已落地
    try {
      if (wx.loadSubpackage) {
        wx.loadSubpackage({ name: 'praiseVoice', success: function () {}, fail: function () {} });
      }
    } catch (e) { /* 老基础库无此 API，忽略 */ }
  },
  play: function (e) {
    var ds = e.currentTarget.dataset;
    var key = ds.key;
    var level = Number(ds.level);
    var idx = Number(ds.idx);
    this.setData({ playing: key });
    audio.speakPraiseBo(level, idx);
    var that = this;
    setTimeout(function () {
      if (that.data.playing === key) that.setData({ playing: '' });
    }, 1700);
  }
});
