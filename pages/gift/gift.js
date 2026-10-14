// pages/gift/gift.js — 送一份祝福给朋友（D113 · B 端：送礼的人）
//
// ## 这个页面为什么**只能从分享卡片进来**
//   小程序**没有关系链** —— 拿不到「谁是谁的朋友」。所以「送祝福给谁」这个信息
//   只有一个来源：A 把卡片分享出来时带上的匿名 uid（?to=zc_xxxx）。
//   没有 to 就没有收礼人 → 页面直接说明「这份心意要跟着朋友的卡片一起来」，
//   **不做**「随便选个人送」的兜底（那等于凭空造关系链，也会变成诱导入口）。
//
// ## 三条不可越的红线（D89，违反其一即不可上线）
//   R1. **A 不分钱**：A 收到的是灯火 / 祝福卡 / 哈达 / 名字，是文化回响，不是钱。
//   R2. **不做排行榜**：D6 已拍板；且小程序本来就取不到关系链。
//   R3. **不出现「充值 / 道具 / 装备 / 返现 / 提现」话术**：这里是「心意」，不是消费。
//      （本页所有可见文案里没有这四个词，validate §64 机械校验。）
//
// ## 支付为什么必须走「弱确认 → 查单」
//   官方明确：「不要把前端 success 当最终成功，必须以后端状态为准」。
//   所以 wx.requestVirtualPayment 的 success 只把状态推进到「确认中」，
//   再由本页轮询服务端查单（最多 6 次 × 1.2s），拿到后端 PAID 才说「已送出」。
//   查不到也不谎称失败 —— 显示「已送出，正在确认」，让用户放心离开。
var payment = require('../../utils/payment');
var storage = require('../../utils/storage');
var tracker = require('../../utils/tracker');
var blessingsData = require('../../data/blessings');
var tibetanName = require('../../utils/tibetan-name');
// 展示文案（图标 / 文化化名称 / 一句说明 / 价格格式化）走 utils/gift-view.js ——
//   送礼页与文化护照的收礼箱**共用同一份**，避免两处文案漂移。
var giftView = require('../../utils/gift-view');
// 查单轮询：最多 6 次 × 1200ms ≈ 7.2 秒。
// 为什么是这个数：回调正常情况下 1-2 秒内到；给到 7 秒能覆盖绝大多数网络抖动，
// 又不至于让用户在页面上干等（等太久的体验比「稍后自己看到」更差）。
var CONFIRM_MAX = 6;
var CONFIRM_GAP = 1200;

Page({
  data: {
    // ---- 收礼人 ----
    toUid: '',           // 匿名 uid（来自分享卡片 ?to=）
    toShort: '',         // 只显示后 4 位（不暴露完整 id，也不让人误会是账号）
    noRecipient: false,  // 没有 to 参数 → 说明「要跟着卡片一起来」
    isSelf: false,       // to === 自己的 uid（自己点开了自己的分享卡）
    // ---- 成绩对比（挑战卡带来的）----
    chSteps: 0,          // TA 用了几步（0 = 不是从挑战卡进来的）
    mySteps: 0,          // 我用了几步
    beatText: '',        // 「你比 TA 少用 3 步」/「TA 用了 12 步」
    // ---- 礼物 ----
    gifts: [],
    picked: '',
    pickedName: '',
    pickedPrice: '',
    // ---- 藏文祝福（¥3 专用）----
    blessingList: [],
    blessingId: '',
    // ---- 藏族名字（¥9.9 专用）----
    toName: '',          // TA 的名字（中文）
    gender: '',
    genderOptions: [],
    namePicked: null,    // { name, mean }
    // ---- 署名 ----
    fromName: '',
    // ---- 支付通道 ----
    ready: false,        // payment.isReady()
    missingText: '',
    // ---- 状态机 ----
    state: 'idle',       // idle | paying | confirming | done | failed | pending
    errText: '',
    orderNo: '',
    // ---- 合规提示（下单页可见，D89 防御设计）----
    notice: '虚拟祝福一经送出不支持退款，送出前请确认心意'
  },
  onLoad: function (query) {
    query = query || {};
    var to = String(query.to || '');
    var mine = storage.ensureUid();
    var short = to ? to.slice(-4) : '';
    var chSteps = parseInt(query.ch, 10) || 0;
    var mySteps = parseInt(query.steps, 10) || 0;
    var beatText = '';
    if (chSteps > 0 && mySteps > 0) {
      var diff = mySteps - chSteps;
      beatText = diff < 0 ? ('你比 TA 少用 ' + (-diff) + ' 步')
        : (diff > 0 ? ('你比 TA 多用 ' + diff + ' 步') : '你和 TA 打了个平手');
    } else if (chSteps > 0) {
      beatText = 'TA 用了 ' + chSteps + ' 步';
    }
    var gifts = payment.GIFTS.map(function (g) {
      var v = giftView.viewOf(g.productId);
      return {
        productId: g.productId,
        icon: v.icon,
        name: v.name,
        desc: v.desc,
        priceText: giftView.fmtPrice(g.price)
      };
    });
    var cfg = payment.configState();
    this.setData({
      toUid: to,
      toShort: short,
      noRecipient: !to,
      isSelf: !!to && to === mine,
      chSteps: chSteps,
      mySteps: mySteps,
      beatText: beatText,
      gifts: gifts,
      blessingList: blessingsData.list.map(function (b) {
        return { id: b.id, bo: b.bo, zh: b.zh, mean: b.mean, note: b.note };
      }),
      genderOptions: tibetanName.GENDERS.map(function (g) {
        return { key: g.key, label: g.label };
      }),
      fromName: storage.getHolderName() || '',
      ready: cfg.ready,
      missingText: cfg.missing.join(' / ')
    });
    if (to && to !== mine) tracker.track('gift_page_open');
  },
  onUnload: function () {
    if (this.confirmTimer) { clearTimeout(this.confirmTimer); this.confirmTimer = null; }
  },
  onHide: function () {
    if (this.confirmTimer) { clearTimeout(this.confirmTimer); this.confirmTimer = null; }
  },
  // 选礼物
  pickGift: function (e) {
    var id = e.currentTarget.dataset.id;
    var g = null;
    for (var i = 0; i < this.data.gifts.length; i++) {
      if (this.data.gifts[i].productId === id) { g = this.data.gifts[i]; break; }
    }
    if (!g) return;
    this.setData({
      picked: id,
      pickedName: g.name,
      pickedPrice: g.priceText,
      errText: '',
      state: this.data.state === 'done' ? 'idle' : this.data.state
    });
  },
  // 选祝福语（¥3）
  pickBlessing: function (e) {
    this.setData({ blessingId: e.currentTarget.dataset.id });
  },
  // 填 TA 的名字（¥9.9）
  onToNameInput: function (e) {
    this.setData({ toName: e.detail.value, namePicked: null });
  },
  // 选性别（¥9.9；三档，含「不愿透露」，与 D54 同口径）
  pickGender: function (e) {
    this.setData({ gender: e.currentTarget.dataset.key, namePicked: null });
  },
  // 生成藏族名字（确定性：同一个名字 + 同一性别 → 永远是同一个结果）
  makeName: function () {
    var d = this.data;
    var nm = (d.toName || '').trim().slice(0, 10);
    if (!nm) { wx.showToast({ title: '先写上 TA 的名字', icon: 'none' }); return; }
    if (!d.gender) { wx.showToast({ title: '先选一个称呼', icon: 'none' }); return; }
    var picked = tibetanName.pickFor(d.gender, tibetanName.seedFromText(nm));
    this.setData({ namePicked: picked ? { name: picked.name, mean: picked.mean } : null });
  },
  // 署名
  onFromNameInput: function (e) {
    var v = e.detail.value;
    if (v) storage.setHolderName(v.slice(0, 10));   // 与祝福卡共用，只让用户填一次
    this.setData({ fromName: v });
  },
  // 送出
  submit: function () {
    var d = this.data;
    if (!d.ready) {
      wx.showToast({ title: '祝福通道还没开通', icon: 'none' });
      return;
    }
    if (d.noRecipient || d.isSelf) return;
    if (!d.picked) { wx.showToast({ title: '先选一份心意', icon: 'none' }); return; }
    if (d.state === 'paying' || d.state === 'confirming') return;   // 防连点重复下单
    // ¥3 必须选一句；¥9.9 必须先生成名字 —— 少了内容，送到对方手上就是空的
    if (d.picked === 'tib_blessing_3' && !d.blessingId) {
      wx.showToast({ title: '挑一句藏文祝福', icon: 'none' });
      return;
    }
    if (d.picked === 'tib_name_99' && !d.namePicked) {
      wx.showToast({ title: '先为 TA 取一个名字', icon: 'none' });
      return;
    }
    var that = this;
    this.setData({ state: 'paying', errText: '' });
    payment.pay(d.picked, {
      toUid: d.toUid,
      scene: d.chSteps > 0 ? 'challenge' : 'share',
      extra: {
        blessingId: d.blessingId,
        toName: (d.toName || '').trim().slice(0, 10),
        gender: d.gender,
        tibetanName: d.namePicked ? d.namePicked.name : '',
        tibetanMean: d.namePicked ? d.namePicked.mean : '',
        fromName: (d.fromName || '').trim().slice(0, 10)
      }
    }).then(function (r) {
      if (!r.ok) {
        tracker.track('gift_pay_fail');
        that.setData({ state: 'failed', errText: that.errOf(r) });
        return;
      }
      tracker.track('gift_pay_sent');
      // R3：success 只是弱确认 —— 推进到「确认中」，由查单给最终结论
      that.setData({ state: 'confirming', orderNo: r.outTradeNo });
      that.confirm(r.outTradeNo, 0);
    });
  },
  // 轮询查单（以后端状态为准，不把前端 success 当成功）
  confirm: function (outTradeNo, n) {
    var that = this;
    this.confirmTimer = setTimeout(function () {
      that.confirmTimer = null;
      payment.queryOrder(outTradeNo).then(function (r) {
        if (r && r.ok && r.status === 'PAID') {
          that.setData({ state: 'done' });
          return;
        }
        if (n + 1 >= CONFIRM_MAX) {
          // 没查到也不能说失败：钱可能已经付了，只是回调还没到。
          // 告诉用户「已送出，正在确认」，TA 那边一会儿就能看到。
          that.setData({ state: 'pending' });
          return;
        }
        that.confirm(outTradeNo, n + 1);
      });
    }, CONFIRM_GAP);
  },
  // 失败原因 → 人话（payment.ERR 已按官方错误码逐条映射）
  errOf: function (r) {
    if (r.reason === 'unconfigured') return '祝福通道还没开通（' + (r.missing || []).join('/') + '）';
    if (r.reason === 'api_unavailable') return '当前微信版本不支持虚拟支付，请升级微信';
    if (r.reason === 'login_failed') return '登录失败，请稍后再试';
    if (r.reason === 'network') return '网络不太好，请稍后再试';
    if (r.reason === 'order_failed') return '下单失败' + (r.detail ? '（' + r.detail + '）' : '');
    if (r.reason === 'pay_failed') {
      return r.message + (r.retryable ? '，请稍后再试' : '');
    }
    return '没能送出，请稍后再试';
  },
  // 失败后重试（换新单号，payment.makeOutTradeNo 保证不重复）
  retry: function () {
    this.setData({ state: 'idle', errText: '', orderNo: '' });
  },
  goHome: function () {
    wx.redirectTo({ url: '/pages/index/index' });
  },
  // 分享：把 A 的卡片继续传下去（不设「分享后可得」，纯自愿 —— D89 诱导分享红线）
  onShareAppMessage: function () {
    var d = this.data;
    return {
      title: d.pickedName ? ('我给朋友送了「' + d.pickedName + '」') : '藏字方块 · 认藏文，从方块开始',
      path: d.toUid ? ('/pages/gift/gift?to=' + d.toUid) : '/pages/index/index'
    };
  }
});
