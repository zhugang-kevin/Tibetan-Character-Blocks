// pages/index/index.js — 首页：关卡选择 + 文化护照入口
var storage = require('../../utils/storage');
var certificate = require('../../utils/certificate');

// 印记定义（v0 仅拉萨；后续扩展七地市）
var STAMPS = {
  lhasa: { name: '拉萨' }
};

Page({
  data: {
    levels: [],
    stamps: [],
    bestCombo: 0,
    // 成长阶梯 · 证书
    certCount: 0,
    certTotal: 12,
    stage: null,        // 当前正在攻的阶段（已开放但未完成）
    lastCert: null      // 最近获得的一张证书
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

    var slots = certificate.list();
    var stage = null;
    for (var i = 0; i < slots.length; i++) {
      if (slots[i].open && !slots[i].unlocked) { stage = slots[i]; break; }
    }
    var certs = p.certs || [];

    this.setData({
      levels: levels,
      stamps: stamps,
      bestCombo: p.bestCombo,
      certCount: certs.length,
      stage: stage,
      lastCert: certs.length ? certs[certs.length - 1] : null
    });
  },

  onTapLevel: function (e) {
    var n = parseInt(e.currentTarget.dataset.n, 10);
    var item = this.data.levels[n - 1];
    if (!item.unlocked) {
      wx.showToast({ title: '先完成前面的关卡哦', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/game/game?level=' + n });
  },

  // 打开文化护照（12 张证书 + 印章 + 收藏 + 图谱）
  openPassport: function () {
    wx.navigateTo({ url: '/pages/passport/passport' });
  },

  // 打开权益中心（双轨制到店权益，凭通关进度领取）
  openBenefits: function () {
    wx.navigateTo({ url: '/pages/benefits/benefits' });
  }
});
