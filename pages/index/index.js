// pages/index/index.js — 首页：藤蔓地图 + 悬浮入口 + 底部大平层
// PRD 二章：弯曲向上的藤蔓地图、五地剪影随进度点亮、左右悬浮入口、底部平层
// 合规：全部本地实现（无登录 / 无支付 / 无广告 SDK / 无地图 / 不做全服排行榜后端）
var storage = require('../../utils/storage');
var certificate = require('../../utils/certificate');
var collect = require('../../utils/collect');
var tibText = require('../../utils/tibetan-text');
var ladder = require('../../utils/ladder');
var lamp = require('../../utils/lamp');
var regionsData = require('../../data/regions');
var dailyData = require('../../data/daily');
var lampData = require('../../data/lamp');

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

// 圆角矩形路径（证书同款画法：外粗内细双框）
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
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
    blessingImage: '',
    thangkaCells: [],
    thangkaDone: false,
    boxText: '',
    shopItems: [],
    pot: 0,
    winterItems: [],
    // 万家灯火祈福跳窗（每次进入首页前展示，每天仅一次；纯本地，无任何网络请求）
    lampShow: false,
    lampLit: false,
    lampTotal: lampData.total,
    lampTotalText: lamp.formatCount(lampData.total),
    lampProvinces: [],
    lampHome: { name: '', countText: '' },
    lampLotus: { goldText: '', pinkText: '' },
    lampTitle: lampData.title,
    lampSub: lamp.fill(lampData.subTemplate, { total: lamp.formatCount(lampData.total) }),
    lampHomeText: '',
    lampOnceNote: lampData.onceNote,
    lampButtonText: lampData.buttonText,
    lampTip: lampData.tip,
    // 朝圣天梯入场动效（纯视觉类名，不含任何数据）
    ladderIn: false
  },

  onShow: function () {
    this.refresh();
  },

  refresh: function () {
    var p = storage.getProgress();
    var starsMap = storage.getStarsMap();

    // 天梯动效的调度依据（全部为本机记忆，不落盘、不联网）：
    //   firstBoot —— 本次启动第一次进首页 → 播「从山脚升上来」的入场
    //   bloomN    —— 刚从关卡页通关返回，识别出最新通关的那一关 → 台阶莲花绽放 + 自动升到下一级
    var doneList = (p.completedLevels || []).slice();
    var firstBoot = this._booted !== true;
    this._booted = true;
    var cleared = [];
    if (!firstBoot) {
      var prevDone = this._doneList || [];
      cleared = doneList.filter(function (n) { return prevDone.indexOf(n) === -1; });
    }
    this._doneList = doneList;
    var bloomN = cleared.length ? cleared[cleared.length - 1] : 0;

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
        delay: n * 55,          // 台阶依次浮现的错峰延迟（ms）
        bloom: n === bloomN,    // 本关刚通关：绽放莲花 + 金色光环
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

    // 灯火跳窗会盖住天梯 —— 若今天首次打开，入场动效推迟到关闭跳窗之后再播
    var lampFirst = lamp.isFirstOpenToday(storage.getLampDay(), today);
    var intro = firstBoot && !lampFirst;

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
      thangkaDone: storage.getThangkaDone(),
      pot: storage.getPot(),
      winterItems: dailyData.winter.items,
      ladderIn: intro
    });

    // 万家灯火：每天首次打开时，先与远方的灯火同明一次（纯本地判断）
    if (lampFirst) {
      this.setData(this.buildLampView());
      // 跳窗盖住天梯：入场/绽放推迟到 closeLampWindow（见下）
      this._pendingIntro = firstBoot ? p.unlockedLevel : 0;
      this._pendingBloom = bloomN;
    } else if (intro) {
      // 本次启动第一眼：天梯从山脚升起，缓缓停到当前台阶
      this.runLadderMotion({ to: p.unlockedLevel, fromFoot: true });
      this.releaseLadderIn();
    } else if (bloomN) {
      // 通关返回：台阶莲花绽放，画面自动升到下一级
      this.bloomAndClimb(bloomN);
    }
  },

  // 天梯入场 / 上行动效：先落在山脚（人间），再缓缓升到目标台阶。
  // 纯视觉：只读布局几何并调用 scrollTo，不涉及任何数据、网络或云能力。
  runLadderMotion: function (opts) {
    var o = opts || {};
    var node = this.data.levels[(o.to || 1) - 1];
    if (!node || !wx.createSelectorQuery) return;
    wx.createSelectorQuery()
      .select('.vine-map').boundingClientRect()
      .selectViewport().scrollOffset()
      .exec(function (res) {
        var rect = res && res[0];
        var off = res && res[1];
        if (!rect || !rect.height) return;
        var vh = 667;
        try { vh = wx.getSystemInfoSync().windowHeight || 667; } catch (e) { /* 取不到时用默认视口高 */ }
        var plan = ladder.buildPlan({
          mapTop: rect.top + ((off && off.scrollTop) || 0),
          mapHeight: rect.height,
          viewportHeight: vh,
          nodeTopPct: node.top
        });
        if (o.fromFoot && plan.rise > 0) {
          wx.pageScrollTo({ scrollTop: plan.foot, duration: 0 });
          setTimeout(function () {
            wx.pageScrollTo({ scrollTop: plan.settle, duration: 760 });
          }, 320);
        } else {
          wx.pageScrollTo({ scrollTop: plan.settle, duration: 700 });
        }
      });
  },

  // 入场动画播完后撤掉动画类：animation-fill 会让 transform 常驻，挡住后面的点击缩放反馈
  releaseLadderIn: function () {
    var self = this;
    setTimeout(function () { self.setData({ ladderIn: false }); }, 2000);
  },

  // 通关返回：当前台阶绽放莲花（.bloom）+ 自动升到下一级台阶
  bloomAndClimb: function (doneN) {
    var self = this;
    this.setData({ ladderIn: true });
    this.runLadderMotion({ to: Math.min(doneN + 1, 10) });
    setTimeout(function () {
      var patch = { ladderIn: false };
      patch['levels[' + (doneN - 1) + '].bloom'] = false;
      self.setData(patch);
    }, 2400);
  },

  // 万家灯火祈福跳窗：文案里的数字全部来自 data/lamp.js 的固定数据（含千分位）
  buildLampView: function () {
    var provinces = lampData.provinces.map(function (x) {
      return { name: x.name, countText: lamp.formatCount(x.count) };
    });
    return {
      lampShow: true,
      lampLit: false,
      lampTotal: lampData.total,
      lampTotalText: lamp.formatCount(lampData.total),
      lampSub: lamp.fill(lampData.subTemplate, { total: lamp.formatCount(lampData.total) }),
      lampProvinces: provinces,
      lampHome: { name: lampData.home.name, countText: lamp.formatCount(lampData.home.count) },
      lampHomeText: lamp.fill(lampData.homeTemplate, {
        name: lampData.home.name,
        count: lamp.formatCount(lampData.home.count)
      }),
      lampLotus: {
        goldText: lamp.formatCount(lampData.lotus.gold),
        pinkText: lamp.formatCount(lampData.lotus.pink)
      }
    };
  },

  // 点亮我的一盏灯：只做视觉变化（总数 +1）+ 微震动 + 一句祝福，不发送任何请求
  onLightLamp: function () {
    if (this.data.lampLit) return;
    var next = lamp.lightOne(this.data.lampTotal);
    this.setData({
      lampLit: true,
      lampTotal: next,
      lampTotalText: lamp.formatCount(next),
      lampSub: lamp.fill(lampData.subTemplate, { total: lamp.formatCount(next) })
    });
    try {
      if (wx.vibrateShort) wx.vibrateShort({ type: 'medium' });
    } catch (err) { /* 部分机型不支持震动，静默降级 */ }
    storage.markLampDay(todayStr());
  },

  closeLampWindow: function () {
    this.setData({ lampShow: false });
    storage.markLampDay(todayStr());
    // 跳窗让位：补播天梯动效（入场升起 或 通关绽放）
    var intro = this._pendingIntro || 0;
    var bloom = this._pendingBloom || 0;
    this._pendingIntro = 0;
    this._pendingBloom = 0;
    if (intro) {
      this.setData({ ladderIn: true });
      this.runLadderMotion({ to: intro, fromFoot: true });
      this.releaseLadderIn();
    } else if (bloom) {
      this.bloomAndClimb(bloom);
    }
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
    // 九宫格数学统一走纯函数（此前两端各写一份，fragmentCell 一直是死代码）
    return collect.thangkaGrid(frags).cells;
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

  // ---------- 祝福签卡片：把今日日签画成一张藏纸卡（Canvas 2D 离屏导出，纯本地） ----------
  // 内容只来自 data/daily.js 的当日签（collect.pickDaily 确定性抽取，不做随机）；
  // 不承载任何奖励、不含金额、不设分享激励（微信《滥用分享行为》▶2 红线）。
  makeBlessingCard: function () {
    var card = collect.blessingCard(this.data.daily, todayStr());
    if (!card) {
      wx.showToast({ title: '日签还没准备好，稍后再试', icon: 'none' });
      return;
    }
    var that = this;
    var W = 750, H = 1000;
    var canvas, ctx;
    try {
      canvas = wx.createOffscreenCanvas({ type: '2d', width: W, height: H });
      ctx = canvas.getContext('2d');
    } catch (e) {
      wx.showToast({ title: '当前微信版本不支持生成图片', icon: 'none' });
      return;
    }

    // 藏纸底 + 金色双框（与成长证书同一套视觉语言）
    ctx.fillStyle = '#FDF6E3';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#B7950B';
    ctx.lineWidth = 6;
    roundRectPath(ctx, 24, 24, W - 48, H - 48, 28);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(183, 149, 11, 0.55)';
    ctx.lineWidth = 2;
    roundRectPath(ctx, 46, 46, W - 92, H - 92, 20);
    ctx.stroke();

    ctx.textAlign = 'center';

    // 抬头：雪域日签 · 第 n 签 · 日期
    ctx.fillStyle = '#8A8375';
    ctx.font = '400 26px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('雪域日签 · 第 ' + card.no + ' 签 · ' + card.dateText, W / 2, 130);

    // 藏文大字（tsheg 断行、shad 家族不落行首）；行数由绘制函数返回，供下方排版
    ctx.fillStyle = '#C0392B';
    ctx.font = '500 60px "Noto Serif Tibetan", "Microsoft Himalaya", serif';
    var tibLines = tibText.drawTibetanWrapped(ctx, card.tibetan, W / 2, 226, W - 200, 84);
    var y = 226 + Math.max(1, tibLines) * 84 + 26;

    // 拉丁转写（有才印）+ 中文释义
    if (card.roman) {
      ctx.fillStyle = '#8A8375';
      ctx.font = 'italic 30px Georgia, serif';
      ctx.fillText(card.roman, W / 2, y);
      y += 62;
    }
    ctx.fillStyle = '#2C3E50';
    ctx.font = '700 44px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText(card.cn, W / 2, y);
    y += 54;

    // 小知识（每行 20 字，最多 3 行）
    if (card.tip) {
      ctx.fillStyle = '#8A8375';
      ctx.font = '400 28px "PingFang SC","Microsoft YaHei",sans-serif';
      var tipMax = Math.min(3, Math.ceil(card.tip.length / 20));
      for (var i = 0; i < tipMax; i++) {
        ctx.fillText(card.tip.slice(i * 20, i * 20 + 20), W / 2, y + i * 42);
      }
      y += tipMax * 42 + 20;
    }

    // 分隔线（不越过下方小程序码区域）
    var sepY = Math.max(y, 760);
    ctx.strokeStyle = 'rgba(183, 149, 11, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 130, sepY);
    ctx.lineTo(W / 2 + 130, sepY);
    ctx.stroke();

    // 小程序码占位（与证书同款：先占位，后续接 getWXACodeUnlimited 换真码）
    var cs = 116, cx = W - 212, cy = H - 196;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    roundRectPath(ctx, cx, cy, cs, cs, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(183, 149, 11, 0.6)';
    ctx.lineWidth = 2;
    roundRectPath(ctx, cx, cy, cs, cs, 14);
    ctx.stroke();
    ctx.fillStyle = '#C0392B';
    ctx.font = '22px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('小程序码', cx + cs / 2, cy + cs / 2 + 8);

    // 品牌
    ctx.fillStyle = '#B7950B';
    ctx.font = '700 28px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('玩方块，认藏文', W / 2, H - 62);

    wx.canvasToTempFilePath({
      canvas: canvas,
      x: 0, y: 0, width: W, height: H,
      destWidth: W, destHeight: H,
      success: function (res) {
        that.setData({ blessingImage: res.tempFilePath });
        wx.showToast({ title: '卡片已生成', icon: 'success' });
      },
      fail: function () { wx.showToast({ title: '生成失败，请再试一次', icon: 'none' }); }
    });
  },

  // 保存祝福签卡片到相册（权限拒绝时只做 toast 指引：首页遵循「不打扰」约束，不弹阻塞式弹窗）
  saveBlessingCard: function () {
    if (!this.data.blessingImage) return;
    wx.saveImageToPhotosAlbum({
      filePath: this.data.blessingImage,
      success: function () { wx.showToast({ title: '已保存到相册', icon: 'success' }); },
      fail: function (e) {
        if (e.errMsg && e.errMsg.indexOf('auth') > -1) {
          wx.showToast({ title: '需要相册权限：请在右上角设置中允许', icon: 'none' });
        } else {
          wx.showToast({ title: '保存失败，请再试一次', icon: 'none' });
        }
      }
    });
  },

  // 唐卡合成：集齐 9 片后的「合成」动作（此前只有一行文字提示，玩家集齐后无事可做）
  // 幂等：重复点击不产生第二条记录；合成后完整图在文化护照页「唐卡收藏」板块展示
  synthesizeThangka: function () {
    var res = storage.markThangkaDone();
    if (!res.done) {
      wx.showToast({ title: '还差 ' + (9 - storage.getFragments().length) + ' 片，先集齐再合成', icon: 'none' });
      return;
    }
    this.setData({ thangkaDone: true });
    wx.vibrateShort({ type: 'medium' });
    wx.showToast({ title: '唐卡已合成 · 收入文化护照', icon: 'none' });
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
