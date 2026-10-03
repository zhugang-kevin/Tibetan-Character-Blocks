// pages/index/index.js — 首页：关卡选择
var storage = require('../../utils/storage');

// 印记定义（v0 仅拉萨；后续扩展七地市）
var STAMPS = {
  lhasa: { name: '拉萨' }
};

Page({
  data: {
    levels: [],
    stamps: [],
    bestCombo: 0
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
    var stamps = p.stamps.map(function (id) {
      return { id: id, name: (STAMPS[id] || {}).name || id };
    });
    this.setData({ levels: levels, stamps: stamps, bestCombo: p.bestCombo });
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
