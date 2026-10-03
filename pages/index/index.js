// pages/index/index.js — 首页：关卡选择
var storage = require('../../utils/storage');

Page({
  data: {
    levels: []
  },

  onShow: function () {
    var p = storage.getProgress();
    var levels = [];
    for (var n = 1; n <= 10; n++) {
      levels.push({
        n: n,
        unlocked: n <= p.unlockedLevel,
        done: p.completedLevels.indexOf(n) > -1
      });
    }
    this.setData({ levels: levels });
  },

  onTapLevel: function (e) {
    var n = parseInt(e.currentTarget.dataset.n, 10);
    var item = this.data.levels[n - 1];
    if (!item.unlocked) {
      wx.showToast({ title: '先完成前面的关卡哦', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/game/game?level=' + n });
  }
});
