// pages/passport/passport.js — 我的西藏文化护照（总档案）
//
// 护照是「总档案」，证书是护照里的「签证页」：
//   藏文成长证书（学习线） × 12 张 + 文化收藏册 + 地区印章 + 现实足迹 + 个人文化图谱
var certificate = require('../../utils/certificate');
var storage = require('../../utils/storage');
var syncModule = require('../../utils/sync');   // D94 进度云同步（走自有服务端）
var collect = require('../../utils/collect');
var cardsData = require('../../data/cards');
var revealsData = require('../../data/reveals');
var secretsData = require('../../data/secrets');
var tracker = require('../../utils/tracker');
// D54 性别 + 藏族名字：三档取值与选名算法（与 utils/storage.js 同一份）
var tibetanName = require('../../utils/tibetan-name.js');
// D113 礼物展示口径（与送礼页同一份，避免两处文案漂移）
var giftView = require('../../utils/gift-view');
var blessingsData = require('../../data/blessings');

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
    // D111 学习体系证书：15 级各一张 + 集齐解锁终极「藏文拼读宗师」
    learnCerts: [],
    learnOwned: 0,
    learnTotal: 15,
    learnUltimate: null,
    nextStage: null,     // 下一个可争取的阶段
    stamps: [],
    stampOwned: 0,
    stampTotal: STAMP_TOTAL,
    cardsSeen: 0,
    cardsTotal: 0,
    bestCombo: 0,
    holder: '',
    // D94 进度云同步
    syncBusy: false,
    syncDone: false,
    syncTip: '换手机后进度会丢。点右侧按钮可备份到云端。',
    levelsDone: 0,
    // D113 收到的祝福（A 端收礼箱）：进页面拉一次，不做后台轮询
    gifts: [],
    giftCount: 0,
    // D113 入账：别人为你点亮的酥油灯盏数（只属于本人，不排名、不公示）
    lampCount: 0,
    // D113 完善：献给您的哈达条数（同 lampCount 口径：只说「我有几条」）
    khataCount: 0,
    inboxBusy: false,
    inboxTip: '',
    // D54 我的资料：性别 + 藏族名字（可查看 / 可修改 / 可清除）
    gender: '',
    genderLabel: '未选择',
    genderOptions: [],
    tibetanName: '',
    tibetanNameBo: '',
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

  // D101：卸载后关掉存活标记 —— 云同步的 .then 回调会在页面卸载后 setData
  onUnload: function () {
    this._alive = false;
  },

  onShow: function () {
    this._alive = true;
    this.showShare();
    this.refresh();
    this.loadInbox();
  },

  // ---------- D113 收到的祝福（A 端收礼箱）----------
  // 只有用户自己点才联网（与云同步同一条合规口径）：进页面自动拉一次，
  //   但**不做**后台轮询、不做订阅推送 —— 省掉「订阅消息」这条合规重路。
  // 去重：服务端幂等靠主键（同一单号只有一件礼物），客户端再按 id 入账一次，
  //   于是「重复拉取 / 断线重连 / 回调重推」都不会重复计数。
  loadInbox: function () {
    var that = this;
    // 先把**本地已入账**的渲染出来：断网 / 还没开通云端同步时，
    // 「收到的祝福」照样看得到 —— 服务端那份只用来补新的，不是唯一来源。
    this.renderInbox();
    if (!syncModule.isReady()) {
      this.setData({ inboxTip: this.data.giftCount ? '' : '收礼箱要等云端同步开通后才能收到新的' });
      return;
    }
    if (this.data.inboxBusy) return;
    this.setData({ inboxBusy: true, inboxTip: '' });
    syncModule.inbox().then(function (r) {
      that.setData({ inboxBusy: false });
      if (!r.ok) {
        that.setData({ inboxTip: syncModule.userMessage(r) });
        return;
      }
      var list = r.gifts || [];
      // ① 按 id 去重入账（只返回这次真正新增的）—— 重复拉取 / 重连都不会重复发奖
      // ② 每盏酥油灯真的点亮一盏（+1），哈达 / 祝福卡 / 名字卡留在收礼箱里常驻
      var fresh = storage.saveReceivedGifts(list);
      var lamps = 0;
      var khatas = 0;
      fresh.forEach(function (g) {
        if (g.productId === 'tib_lamp_1') lamps++;
        if (g.productId === 'tib_khata_6') khatas++;
      });
      for (var i = 0; i < lamps; i++) storage.addLamp();
      for (var k = 0; k < khatas; k++) storage.addKhata();
      that.renderInbox(fresh.length);
      if (fresh.length) tracker.track('gift_received');
    });
  },
  // 用**本地**已入账的礼物渲染收礼箱（离线可见）；newCount = 本次新收到的份数
  renderInbox: function (newCount) {
    var that = this;
    var mine = storage.getReceivedGifts().slice().sort(function (a, b) {
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
    var seen = storage.getSeenGifts();
    var seenSet = {};
    seen.forEach(function (id) { seenSet[String(id)] = 1; });
    // 「新」只标**这一轮**还没看过的：标完就记为已看，下次进来不再闪红点
    var freshIds = [];
    this.setData({
      gifts: mine.map(function (g) {
        var id = String(g.id || '');
        var isNew = !seenSet[id];
        if (isNew) freshIds.push(id);
        return that.renderGiftFrom({ id: g.id, productId: g.productId, extra: g.extra || {}, isNew: isNew });
      }),
      giftCount: mine.length,
      lampCount: storage.getLamps(),
      khataCount: storage.getKhatas(),
      inboxTip: newCount ? ('新收到 ' + newCount + ' 份祝福')
        : (mine.length ? '' : '还没有人送你祝福 —— 把你的卡片分享给朋友吧')
    });
    if (freshIds.length) storage.markGiftsSeen(freshIds);
  },
  // 一件礼物 → 展示模型（文案口径全部来自 utils/gift-view.js 与 data/blessings.js）
  renderGiftFrom: function (g) {
    var v = giftView.viewOf(g.productId);
    var extra = g.extra || {};
    var blessing = null;
    if (extra.blessingId) {
      for (var i = 0; i < blessingsData.list.length; i++) {
        if (blessingsData.list[i].id === extra.blessingId) {
          blessing = { bo: blessingsData.list[i].bo, zh: blessingsData.list[i].zh };
          break;
        }
      }
    }
    return {
      id: g.id,
      icon: v.icon,
      name: v.name,
      isNew: !!g.isNew,
      // D113 完善：哈达要有**形态** —— 收到的是一条哈达，不该只剩一行文字
      isKhata: g.productId === 'tib_khata_6',
      blessing: blessing,
      tibetanName: extra.tibetanName || '',
      tibetanBo: extra.tibetanBo || '',
      tibetanMean: extra.tibetanMean || '',
      fromName: extra.fromName || '一位朋友'
    };
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

    // D111 学习体系证书（15 级各一张 + 终极）
    var learnList = certificate.learningList();
    this.setData({
      certs: list,      owned: owned,
      nextStage: next,
      learnCerts: learnList.rows,
      learnOwned: learnList.owned,
      learnTotal: learnList.total,
      learnUltimate: learnList.ultimate,
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
      tibetanNameBo: nm.bo || '',
      tibetanNameMean: nm.mean,
      // D113 收到的祝福（列表由 loadInbox 单独填，避免每次 refresh 把已读状态冲掉）
      giftCount: storage.getReceivedGifts().length,
      lampCount: storage.getLamps(),
      khataCount: storage.getKhatas()
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
  // D111：点学习证书格 → 证书页按 ?learn=lv 渲染（未获得时只提示，不开空页）
  openLearnCert: function (e) {
    var lv = parseInt(e.currentTarget.dataset.lv, 10) || 0;
    if (!lv) return;
    if (!certificate.findLvCert(lv)) {
      wx.showToast({ title: '完成该级全部 10 课即颁发', icon: 'none' });
      return;
    }
    tracker.track('cert_view');
    wx.navigateTo({ url: '/pages/cert/cert?learn=' + lv });
  },
  openCert: function (e) {
    var stage = parseInt(e.currentTarget.dataset.stage, 10);
    if (!stage) return;
    tracker.track('cert_view');
    wx.navigateTo({ url: '/pages/cert/cert?stage=' + stage });
  },

  goHome: function () {
    wx.redirectTo({ url: '/pages/index/index' });
  },


  // ---- D94 进度云同步（只有用户自己点才联网）----
  onSyncTap: function () {
    var that = this;
    if (this.data.syncBusy) return;
    if (!syncModule.isReady()) {
      wx.showToast({ title: syncModule.userMessage({ reason: 'unconfigured' }), icon: 'none' });
      return;
    }
    this.setData({ syncBusy: true });
    syncModule.save({
      // D113：顺带把匿名收礼地址绑到本 openid 上 —— 别人往这个 uid 送的礼，
      //   服务端才知道该投递给谁。只传匿名 uid，不传 openid（服务端用 code 自己换）。
      uid: storage.ensureUid(),
      doneStages: this.data.levelsDone + '',
      lamps: 0,
      cards: this.data.cardsSeen || 0,
      ownerName: this.data.holder || ''
    }).then(function (r) {
      that.setData({ syncBusy: false, syncDone: !!r.ok });
      if (r.ok) {
        that.setData({ syncTip: '已备份。换手机后可用同一微信取回。' });
        wx.showToast({ title: '已备份', icon: 'success' });
      } else {
        wx.showToast({ title: syncModule.userMessage(r), icon: 'none' });
      }
    });
  },

  onShareAppMessage: function () {
    return {
      title: '我的西藏文化护照 · 已获得 ' + this.data.owned + ' 张藏文成长证书',
      path: '/pages/index/index'
    };
  },

  // D86：分享到朋友圈 —— 官方要求 onShareAppMessage 与 onShareTimeline **同时实现**，
  //   缺任一个朋友圈分享都不可用。注意朋友圈打开是「单页模式」（场景值 1154）：
  //   无登录态、不能跳转、**禁用支付** —— 卡片只负责让人看到，再点「前往小程序」回来。
  onShareTimeline: function () {
    return {
      title: '藏字方块 · 认藏文，从方块开始',
      query: 'from=timeline',
      imageUrl: '/images/logo-144.png'
    };
  },

  // D86：开启分享菜单（含朋友圈入口）—— 不调用则右上角「···」里没有分享按钮
  showShare: function () {
    if (wx.showShareMenu) wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
  }
});