// pages/index/index.js — 首页：藤蔓地图 + 悬浮入口 + 底部大平层
// PRD 二章：弯曲向上的藤蔓地图、五地剪影随进度点亮、左右悬浮入口、底部平层
// 合规：全部本地实现（无登录 / 无支付 / 无广告 SDK / 无地图 / 不做全服排行榜后端）
var storage = require('../../utils/storage');
var certificate = require('../../utils/certificate');
var collect = require('../../utils/collect');
var regionsData = require('../../data/regions');
var dailyData = require('../../data/daily');

// 印记定义（v0 仅拉萨；后续扩展七地市）
var STAMPS = {
  lhasa: { name: '拉萨' }
};

var PANEL_TITLES = {
  journal: '雪域游记',
  lamp: '祈福长明灯',
  daily: '雪域日签',
  thangka: '唐卡拼图',
  box: '非遗盲盒',
  shop: '藏式道具铺',
  rank: '雪域排行榜',
  tree: '菩提树',
  winter: '冬游西藏',
  market: '八廓街集市'
};

// 藤蔓节点位置：由下往上蜿蜒（第 1 关在底、第 10 关在顶）
function nodePos(n) {
  var top = 88 - (n - 1) * 9.1;
  var base = n % 2 === 1 ? 32 : 68;
  var left = base + ((n * 7) % 9) - 4;
  return { top: Math.round(top * 10) / 10, left: left };
}

function todayStr() {
  var d = new Date();
  var m = d.getMonth() + 1;
  var day = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
}

Page({
  data: {
    levels: [],
    regions: [],
    stamps: [],
    bestCombo: 0,
    // 成长阶梯 · 证书
    certCount: 0,
    certTotal: 12,
    stage: null,
    lastCert: null,
    // 顶部资源条
    oil: 0,
    points: 0,
    fragCount: 0,
    canSignIn: true,
    // 面板
    panel: '',
    panelShow: false,
    panelTitle: '',
    panelFoot: '全部数据保存在本机 · 无需登录',
    journal: { letters: 0, cards: 0, done: 0, stars: 0 },
    signIn: { streak: 0, lastDate: '', totalDays: 0, oil: 0 },
    lampDays: [],
    daily: null,
    thangkaCells: [],
    boxText: '',
    shopItems: [],
    pot: 0,
    winterItems: []
  },

  onShow: function () {
    this.refresh();
  },

  refresh: function () {
    var p = storage.getProgress();
    var starsMap = storage.getStarsMap();
    var levels = [];
    var totalStars = 0;
    for (var n = 1; n <= 10; n++) {
      var st = starsMap[n] || 0;
      totalStars += st;
      var pos = nodePos(n);
      levels.push({
        n: n,
        unlocked: n <= p.unlockedLevel,
        done: p.completedLevels.indexOf(n) > -1,
        top: pos.top,
        left: pos.left,
        s1: st >= 1 ? 'on' : 'off',
        s2: st >= 2 ? 'on' : 'off',
        s3: st >= 3 ? 'on' : 'off'
      });
    }

    // 五地剪影：解锁到该地区任一关即点亮
    var regions = regionsData.map(function (r) {
      return {
        id: r.id,
        name: r.name,
        spot: r.spot,
        shape: r.shape,
        lit: p.unlockedLevel >= r.from,
        top: Math.round((88 - (r.from - 1) * 9.1) * 10) / 10,
        left: 0
      };
    });

    var stamps = p.stamps.map(function (id) {
      return { id: id, name: (STAMPS[id] || {}).name || id };
    });

    var slots = certificate.list();
    var stage = null;
    for (var i = 0; i < slots.length; i++) {
      if (slots[i].open && !slots[i].unlocked) { stage = slots[i]; break; }
    }
    var certs = p.certs || [];
    var signIn = storage.getSignIn();
    var today = todayStr();
    var frags = storage.getFragments();

    // 灯油 / 积分 / 唐卡碎片
    var today_daily = collect.pickDaily(dailyData.greetings, collect.dayNumber(today));

    this.setData({
      levels: levels,
      regions: regions,
      stamps: stamps,
      bestCombo: p.bestCombo,
      certCount: certs.length,
      stage: stage,
      lastCert: certs.length ? certs[certs.length - 1] : null,
      oil: (signIn && signIn.oil) || 0,
      points: storage.getPoints(),
      fragCount: frags.length,
      canSignIn: !signIn || signIn.lastDate !== today,
      signIn: signIn || { streak: 0, lastDate: '', totalDays: 0, oil: 0 },
      lampDays: this.buildLamp(signIn, today),
      daily: today_daily,
      journal: {
        letters: (p.seenCards || []).filter(function (id) { return id.indexOf('letter_') === 0; }).length,
        cards: (p.seenCards || []).length,
        done: (p.completedLevels || []).length,
        stars: totalStars
      },
      thangkaCells: this.buildThangka(frags),
      pot: storage.getPot(),
      winterItems: dailyData.winter.items
    });
  },

  // 7 天循环灯阵（第几天已点亮）
  buildLamp: function (signIn, today) {
    var day = signIn && signIn.totalDays ? ((signIn.totalDays - 1) % 7) + 1 : 0;
    var lit = signIn && signIn.lastDate === today ? day : day;
    return dailyData.signInRewards.map(function (r) {
      return { day: r.day, label: r.label, on: r.day <= lit };
    });
  },

  buildThangka: function (frags) {
    var out = [];
    for (var i = 0; i < collect.FRAGMENT_TOTAL; i++) {
      out.push({ i: i + 1, on: frags.indexOf(i) > -1 });
    }
    return out;
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

  // ---------- 悬浮入口面板 ----------
  openPanel: function (e) {
    var key = e.currentTarget.dataset.panel;
    if (key === 'market') {
      // 八廓街集市 = 藏文权益中心（已有页面，合规到店权益）
      this.setData({ panel: key, panelTitle: PANEL_TITLES[key], panelShow: true });
      return;
    }
    var extra = {};
    if (key === 'shop') extra.shopItems = this.buildShop();
    this.refresh();
    this.setData({ panel: key, panelTitle: PANEL_TITLES[key] || '', panelShow: true, shopItems: extra.shopItems || this.data.shopItems });
  },

  closePanel: function () {
    this.setData({ panelShow: false });
  },

  buildShop: function () {
    var inv = storage.getInventory();
    return dailyData.shop.map(function (it) {
      return { id: it.id, name: it.name, cost: it.cost, icon: it.icon, desc: it.desc, have: inv[it.id] || 0 };
    });
  },

  // 祈福长明灯：签到（跨天判定 + 7 天循环 + 奖励发放）
  doSignIn: function () {
    var today = todayStr();
    var signIn = storage.getSignIn();
    var res = collect.advanceSignIn(signIn, today);
    if (res.already) {
      wx.showToast({ title: '今天已经点亮过啦', icon: 'none' });
      return;
    }
    storage.applySignIn(res.state);
    var reward = dailyData.signInRewards[res.day - 1];
    if (reward.kind === 'points') storage.addPoints(reward.value);
    else if (reward.kind === 'item') storage.addItem(reward.value, 1);
    else if (reward.kind === 'oil') storage.addOil(reward.value);
    else if (reward.kind === 'card') storage.addPoints(reward.value * 20);   // 文化卡折算为积分（本地，不发券）
    this.refresh();
    wx.showToast({ title: '第 ' + res.day + ' 天 · ' + reward.label, icon: 'none' });
  },

  // 非遗盲盒：按日期确定性抽取小知识（不发放券、不含金额）
  openBox: function () {
    var text = collect.pickDaily(dailyData.trivia, collect.dayNumber(todayStr()) + 7);
    this.setData({ boxText: text });
  },

  // 藏式道具铺：积分兑换（不涉及支付）
  buyItem: function (e) {
    var id = e.currentTarget.dataset.id;
    var item = null;
    for (var i = 0; i < dailyData.shop.length; i++) {
      if (dailyData.shop[i].id === id) item = dailyData.shop[i];
    }
    if (!item) return;
    if (!storage.spendPoints(item.cost)) {
      wx.showToast({ title: '积分不够，先去闯关吧', icon: 'none' });
      return;
    }
    if (id === 'oil') storage.addOil(2);
    else storage.addItem(id, 1);
    this.refresh();
    this.setData({ shopItems: this.buildShop() });
    wx.showToast({ title: '已兑换 ' + item.name, icon: 'none' });
  },

  // 菩提树：浇水得积分（无广告）
  waterTree: function () {
    storage.waterPot(collect.waterReward());
    this.refresh();
    wx.showToast({ title: '菩提树 +' + collect.waterReward() + ' 积分', icon: 'none' });
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
