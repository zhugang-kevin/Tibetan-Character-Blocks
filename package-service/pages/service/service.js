// package-service/pages/service/service.js — 帮助与客服（D177，虚拟支付路线）
//
// ## 为什么砍掉实物橱窗
//   用户定调：**走虚拟支付**。官方原文明确「虚拟商品 + 实物商品混合 → 整体认定为虚拟支付」，
//   且「仅含虚拟类目时平台会关闭安卓端普通微信支付」。
//   所以**不能同时挂实物橱窗**，否则两头都不成立。
//   实物配饰的选品与定价保留在 docs/decor-selection-and-pricing.md，等执照增项后再开。
//
// ## 这个页面现在只做三件事
//   ① 反馈问题（微信客服会话）
//   ② 虚拟礼物（跳收礼页，1 / 3 / 6 / 9.9）
//   ③ 联系我们（另一个客服来源标记）
//
// ## 合规口径
//   只写"祝福、纪念、收藏"，不写任何功效、灵验、宗教服务。

var GAME = '藏趣方块';
var GIFT_PAGE = '/pages/gift/gift';
// Q18：客服开关。未绑定客服人员时，页面必须显式写"未开通"，不能给假按钮。
var serviceCfg = require('../../../config/service');

Page({
  data: {
    game: GAME,
    active: 'feedback',
    // Q18：未开通时按钮不渲染，改显示 serviceNote（见 wxml）
    serviceEnabled: !!serviceCfg.enabled,
    serviceNote: serviceCfg.note,
    tabs: [
      { key: 'feedback', name: '反馈问题' },
      { key: 'gift', name: '虚拟礼物' },
      { key: 'contact', name: '联系我们' }
    ],

    faq: [
      { q: '配对没反应 / 点不动', a: '先退出重进一次。还不行就在客服里说机型（例如 iPhone 14 / 小米 13），我们按机型查。' },
      { q: '音频没声音', a: '检查手机是否静音、微信是否允许媒体音量。仍然没声音请把机型发客服。' },
      { q: '进度丢了', a: '进度存在本机。换手机或清理微信缓存会丢，建议先截图留档再反馈。' },
      { q: '想换绑微信', a: '目前进度跟本机绑定，暂不支持换绑；有需求请在客服留言，我们会统计。' }
    ],

    gifts: [
      { id: 'lamp', name: '酥油灯', price: '1', note: '点一盏，留个念想' },
      { id: 'khata', name: '哈达', price: '3', note: '最直接的祝福' },
      { id: 'card', name: '祝福卡', price: '6', note: '写一句话送给 TA' },
      { id: 'name', name: '藏族名字', price: '9.9', note: '按你的名字取一个' }
    ],

    giftNote: '这些都是小程序内的虚拟礼物，送出后对方在收礼页看到，不产生任何实物寄送。价格单位是元。',
    giftTip: '虚拟礼物一经送出不支持退款——送出前请确认心意。',
    contactNote: '游戏问题、礼物问题、合作与内容建议，都可以直接找我们。工作时间内会逐条回。',
    disclaimer: '本小程序不销售实物商品；礼物为虚拟内容，不涉及物流与寄送。'
  },

  onTab: function (e) {
    var key = e.currentTarget.dataset.key;
    if (key && key !== this.data.active) this.setData({ active: key });
  },

  onGoGift: function () {
    wx.navigateTo({
      url: GIFT_PAGE,
      fail: function () {
        wx.showToast({ title: '收礼页暂时打不开', icon: 'none' });
      }
    });
  },

  onShareAppMessage: function () {
    return {
      title: GAME + ' · 帮助与客服',
      path: '/package-service/pages/service/service'
    };
  }
});
