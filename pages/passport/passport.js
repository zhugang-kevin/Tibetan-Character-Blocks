// pages/passport/passport.js — 我的西藏文化护照（总档案）
//
// 护照是「总档案」，证书是护照里的「签证页」：
//   藏文成长证书（学习线） × 12 张 + 文化收藏册 + 地区印章 + 现实足迹 + 个人文化图谱
var certificate = require('../../utils/certificate');
var storage = require('../../utils/storage');
var collect = require('../../utils/collect');
var cardsData = require('../../data/cards');
var revealsData = require('../../data/reveals');
var secretsData = require('../../data/secrets');
var tracker = require('../../utils/tracker');
// D54 性别 + 藏族名字：三档取值与选名算法（与 utils/storage.js 同一份）
var tibetanName = require('../../utils/tibetan-name.js');

// 印记定义（v0 仅拉萨；后续扩展七地市）
var STAMPS = {
  lhasa: { name: '拉萨', desc: '完成第 1 课获得' }
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
    // D54 我的资料：性别 + 藏族名字（可查看 / 可修改 / 可清除）
    gender: '',
    genderLabel: '未选择',
    genderOptions: [],
    tibetanName: '',
    tibetanNameMean: '',
    profileEdit: false,
    // 唐卡收藏（兑现 index 页「完整图收入文化护照」的承诺，2026-10-05 补齐）
    thangkaCells: [],
    fragCount: 0,
    thangkaDone: false,
    // 揭示图鉴（D31）：解锁与否 = 是否通关该关（不新增存储字段，避免第二真相源）
    revealSlots: [],
    revealGot: 0,
    revealTotal: 10,
    // 藏地密码：解锁与否 = 是否通关该关（同样不新增存储字段）
    secretSlots: [],
    secretGot: 0,
    secretTotal: 10
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

    // 揭示图鉴（D31）：完成即揭晓，图与名都来自 data/reveals.js
    var revealSlots = revealsData.map(function (r) {
      return {
        level: r.level,
        name: r.name,
        img: r.img,
        unlocked: p.completedLevels.indexOf(r.level) > -1
      };
    });

    // 藏地密码：与揭示图鉴同一口径（解锁 = 已完成该关），槽位由纯函数生成
    var secP = collect.secretProgress(secretsData, p.completedLevels);

    // 我的资料（D54）：性别与名字都从 progress 读，不另开真相源
    var g = storage.getGender();
    var nm = storage.getTibetanName();

    this.setData({
      certs: list,      owned: owned,
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
      thangkaDone: !!(p.thangkaDone && tk.done),
      revealSlots: revealSlots,
      revealGot: revealSlots.filter(function (s) { return s.unlocked; }).length,
      revealTotal: revealsData.length,
      secretSlots: secP.slots,
      secretGot: secP.got,
      secretTotal: secP.total,
      gender: g,
      genderLabel: g ? tibetanName.labelOf(g) : '未选择',
      genderOptions: tibetanName.GENDERS.map(function (x) { return { key: x.key, label: x.label }; }),
      tibetanName: nm.name,
      tibetanNameMean: nm.mean
    });
  },

  // ---------- D54 我的资料：可查看 / 可修改 / 可清除 ----------
  toggleProfileEdit: function () {
    this.setData({ profileEdit: !this.data.profileEdit });
  },

  pickGender: function (e) {
    var key = (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.key) || '';
    if (!key) return;
    storage.setGender(key);      // 写库时同步按新性别重取名字
    this.refresh();
    // 改完收起选择行：结果已经在上面那一行里了，不留一排常驻按钮
    this.setData({ profileEdit: false });
  },

  // 清除 = 个人信息可撤回：性别回到未选择，名字一并撤掉（下次进首页会重新引导）
  clearGender: function () {
    storage.setGender('');
    this.setData({ profileEdit: false });
    this.refresh();
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
