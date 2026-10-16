// pages/shop/shop.js — 藏香商城页（D132）
//
// ## 铁律
//   ① **价格只读 data/shop-goods.js**，本页不写死任何数字（同 §64.11 的纪律：
//      价格漂移已发生过四次：D101/D111/D113/D113e）。
//   ② **cost（成本）不下发页面** —— 它只用于 scripts/incense-pricing.js 内部核算。
//   ③ 文案口径（D131 用户拍板：走量，不写非遗）：
//      只写 标准号 + 产地 + 品类 + 经销商身份；**不写** 非遗 / 手工 / 古法 / 任何宗教词 / 功效。
//   ④ 微信小店未开通前 `purchaseUrl` 为空 → 按钮显示"待配置"，**不假装能买**（不卖空气的延伸）。

var goods = require('../../data/shop-goods');

Page({
  data: {
    items: [],
    shippingNote: '',
    canBuy: false,
    buyText: '',
    pageNote: ''
  },

  onLoad: function () {
    var items = (goods.items || []).map(function (g) {
      // 显式白名单下发：cost 不在其中（成本不下发页面）
      return {
        id: g.id,
        name: g.name,
        spec: g.spec,
        form: g.form,
        origin: g.origin,
        standard: g.standard,
        category: g.category,
        sellerNote: g.sellerNote,
        price: g.price,
        unit: g.unit,
        stock: g.stock,
        highlights: g.highlights || []
      };
    });
    var canBuy = !!goods.purchaseUrl;
    this.setData({
      items: items,
      shippingNote: goods.shippingNote || '',
      canBuy: canBuy,
      buyText: canBuy ? '立即购买' : '待配置微信小店链接',
      pageNote: canBuy
        ? '价格与规格以 data/shop-goods.js 为唯一来源'
        : '微信小店开通后填入 purchaseUrl 即可下单 —— 未开通前不开放购买（不卖空气）'
    });
  },

  onBuy: function () {
    if (!goods.purchaseUrl) {
      wx.showToast({ title: '微信小店开通后即可下单', icon: 'none' });
      return;
    }
    var self = this;
    wx.setClipboardData({
      data: goods.purchaseUrl,
      success: function () {
        wx.showModal({
          title: '商品链接已复制',
          content: '请在微信中打开链接完成购买。',
          showCancel: false,
          confirmText: '知道了',
          success: function () { self.setData({}); }
        });
      }
    });
  },

  onShareAppMessage: function () {
    var g = (goods.items || [])[0];
    return {
      title: g ? (g.name + ' · ' + g.spec + ' · ' + g.standard) : '藏香',
      path: '/pages/shop/shop'
    };
  }
});
