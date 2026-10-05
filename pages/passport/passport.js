// pages/passport/passport.js — 我的西藏文化护照（总档案）
//
// 护照是「总档案」，证书是护照里的「签证页」：
//   藏文成长证书（学习线） × 12 张 + 文化收藏册 + 地区印章 + 现实足迹 + 个人文化图谱
var certificate = require('../../utils/certificate');
var storage = require('../../utils/storage');
var collect = require('../../utils/collect');
var cardsData = require('../../data/cards');
var tracker = require('../../utils/tracker');

// 印记定义（v0 仅拉萨；后续扩展七地市）
var STAMPS = {
  lhasa: { name: '拉萨', desc: '通关第 1 关获得' }
};
var STAMP_TOTAL = 7;   // 规划：七地市印章

Page({
  data: {
    certs: [],           // 12 张证书的位置（已得高亮 / 未得灰色）
    owned: 0,
    certTotal: 12,
    nextStage: null,     // 下一个可争取的阶段
    stamps: [],
    stampOwned: 0,
    stampTotal: STAMP_TOTAL,
    cardsSeen: 0,
    cardsTotal: 0,
    bestCombo: 0,
    holder: '',
    levelsDone: 0,
    // 唐卡收藏（兑现 index 页「完整图收入文化护照」的承诺，2026-10-05 补齐）
    thangkaCells: [],
    fragCount: 0,
    thangkaDone: false
  },

  onShow: function () {
    this.refresh();
  },

  refresh: function () {
    var list = certificate.list();
    var p = storage.getProgress();
    var owned = 0;
    var next = null;
    list.forEach(function (it) {
      if (it.unlocked) owned++;
      else if (!next && it.open) next = it;
    });
    var stamps = p.stamps.map(function (id) {
      return { id: id, name: (STAMPS[id] || {}).name || id, desc: (STAMPS[id] || {}).desc || '' };
    });

    // 唐卡收藏：九宫格视图模型走与首页同一个纯函数（两端/两页同源）
    var tk = collect.thangkaGrid(p.fragments);

    this.setData({
      certs: list,
      owned: owned,
      nextStage: next,
      stamps: stamps,
      stampOwned: stamps.length,
      cardsSeen: p.seenCards.length,
      cardsTotal: cardsData.length,
      bestCombo: p.bestCombo,
      holder: p.holderName,
      levelsDone: p.completedLevels.length,
      thangkaCells: tk.cells,
      fragCount: tk.got,
      thangkaDone: !!(p.thangkaDone && tk.done)
    });
  },

  // 打开某阶段的证书页（未获得时进入「未解锁」说明页）
  openCert: function (e) {
    var stage = parseInt(e.currentTarget.dataset.stage, 10);
    if (!stage) return;
    tracker.track('cert_view');
    wx.navigateTo({ url: '/pages/cert/cert?stage=' + stage });
  },

  goHome: function () {
    wx.redirectTo({ url: '/pages/index/index' });
  },

  onShareAppMessage: function () {
    return {
      title: '我的西藏文化护照 · 已获得 ' + this.data.owned + ' 张藏文成长证书',
      path: '/pages/index/index'
    };
  }
});
