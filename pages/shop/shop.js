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
    pageNote: '',
    pageSub: '',
    pendingCount: 0
  },

  onLoad: function () {
    // ## 只有定稿内容才上屏（D133）
    //   claims 里 status 为 pending / missing 的字段，**一律不渲染**：
    //   未核实的话（产地、执行标准号）不许出现在消费者能看到的页面上。
    //   你确认之后把 status 改成 verified/user，内容自动出现，**不需要改页面代码**。
    var withheld = [];
    var items = (goods.items || []).map(function (g) {
      var claims = g.claims || {};
      function isOpen(k) {
        var c = claims[k];
        return !!c && (c.status === 'pending' || c.status === 'missing');
      }
      var item = {
        id: g.id,
        // 形态没定稿就不在标题里写「线香」—— 只留品牌名
        name: isOpen('form') ? (g.baseName || g.name) : (g.baseName || '') + ' · ' + g.form,
        spec: g.spec,
        form: isOpen('form') ? '' : g.form,
        origin: isOpen('origin') ? '' : g.origin,
        standard: isOpen('standard') ? '' : g.standard,
        // 「家居香品」这个定性本身来自"按国标进销"，标准号没核实前不写
        category: isOpen('standard') ? '' : g.category,
        sellerNote: g.sellerNote,
        price: g.price,
        unit: g.unit,
        stock: g.stock,
      // 亮点：依赖项未定稿的直接不展示
      highlights: (g.highlights || []).filter(function (h) {
          if (!h.claim) return true;
          if (isOpen(h.claim)) {
            if (withheld.indexOf(h.claim) < 0) withheld.push(h.claim);
            return false;
          }
          return true;
        }).map(function (h) { return { text: h.text }; })
      };
      return item;
    });
    var canBuy = !!goods.purchaseUrl;
    var c0 = ((goods.items && goods.items[0] && goods.items[0].claims) || {});
    function openAt(k) { var c = c0[k]; return !!c && (c.status === 'pending' || c.status === 'missing'); }
    var coreOpen = openAt('origin') || openAt('standard');
    this.setData({
      items: items,
      shippingNote: goods.shippingNote || '',
      canBuy: canBuy,
      buyText: canBuy ? '立即购买' : '待配置微信小店链接',
      pendingCount: withheld.length,
      pageSub: coreOpen ? '商品信息核对中' : '家居香品 · 产自西藏',
      pageNote: canBuy
        ? '价格与规格以 data/shop-goods.js 为唯一来源'
        : '商品信息核对中 —— 核实完成前不开放购买（不卖没核对清楚的东西）'
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
