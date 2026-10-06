// pages/benefits/benefits.js — 藏文权益中心（双轨制）
//
// 只做三件事：发凭证、显示记录、跳转。**没有支付、没有交易、没有定位**。
// 双轨制：本地生活 / 游客专属，按商家 track 打标过滤，前端一键切换。
var storage = require('../../utils/storage');
var benefits = require('../../utils/benefits');

var DISCLAIMER = benefits.PAGE_NOTE +
  '。权益由商家自主提供并在店内兑现，平台不承诺金额、不发代金券或预付卡；' +
  '凭证绑定本人微信，请到店出示核销码。';

Page({
  data: {
    mode: '',
    city: benefits.DEFAULT_CITY,
    cities: benefits.CITIES,
    modes: benefits.MODES,
    list: [],
    total: 0,
    claimable: 0,
    claimedCount: 0,
    doneCount: 0,
    pageNote: benefits.PAGE_NOTE,
    disclaimer: DISCLAIMER
  },

  onShow: function () {
    this.refresh();
  },

  refresh: function () {
    var p = storage.getProgress();
    var mode = benefits.normalizeMode(p.userMode);
    var city = benefits.normalizeCity(p.city);
    var doneCount = (p.completedLevels || []).length;

    var claimedMap = {};
    for (var i = 0; i < p.benefits.length; i++) {
      claimedMap[p.benefits[i].mid] = p.benefits[i];
    }

    var raw = benefits.listFor(mode, city);
    var cards = benefits.decorate(raw, doneCount, claimedMap);
    var sum = benefits.summary(raw, doneCount, claimedMap);

    this.setData({
      mode: mode,
      city: city,
      doneCount: doneCount,
      list: cards,
      total: sum.total,
      claimable: sum.claimable,
      claimedCount: sum.claimed
    });
  },

  // 双轨切换：本地生活 ↔ 游客专属
  onSwitchMode: function (e) {
    var mode = benefits.normalizeMode(e.currentTarget.dataset.mode);
    if (!mode) return;
    storage.setUserMode(mode);
    this.refresh();
    wx.showToast({ title: '已切换到' + benefits.modeName(mode), icon: 'none' });
  },

  // 城市由用户主动选择（不需要任何位置权限）
  onPickCity: function (e) {
    storage.setCity(e.currentTarget.dataset.city);
    this.refresh();
  },

  // 领取「到店权益凭证」：本地生成核销码，平台不经手任何资金
  onClaim: function (e) {
    var mid = e.currentTarget.dataset.mid;
    var m = benefits.findById(mid);
    if (!m) return;

    var p = storage.getProgress();
    var doneCount = (p.completedLevels || []).length;

    if (storage.hasBenefit(mid)) {
      wx.showToast({ title: '已领取，请到店出示核销码', icon: 'none' });
      return;
    }
    if (!benefits.isUnlocked(doneCount, m)) {
      wx.showToast({ title: '还差 ' + (m.need - doneCount) + ' 课，完成后即可领取', icon: 'none' });
      return;
    }

    var rec = benefits.newRecord(m, storage.nextBenefitSeq(), Date.now());
    storage.addBenefit(rec);
    this.refresh();
    wx.showToast({ title: '已领取 · 到店出示 ' + rec.code, icon: 'none' });
  },

  goHome: function () {
    wx.navigateBack({ delta: 1 });
  }
});
