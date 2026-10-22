// package-service/pages/service/service.js — 帮助与客服（D167）
//
// 三件事都走**微信客服会话**（open-type="contact"），不接自建服务器：
//   · 反馈问题  session-from=feedback
//   · 唐卡咨询  session-from=thangka-<id> / thangka-custom
//   · 高端定制  session-from=bespoke
//
// 为什么不在页面里做表单提交：客服会在微信客服工作台里直接回复，
// 用户不用留手机号、我们也不用先建一套工单系统 —— 先能用，再谈完善。
//
// 合规口径（与本仓 test-religion-compliance 一致）：
//   · 唐卡只按「工艺画 / 装饰画」描述题材与尺寸，不写开光、加持、供奉、保佑
//   · 商品话术不承诺灵验，只描述画面与工艺

var GAME = '藏趣方块';

Page({
  data: {
    game: GAME,
    active: 'feedback',
    tabs: [
      { key: 'feedback', name: '反馈问题' },
      { key: 'thangka', name: '配饰与画' },
      { key: 'bespoke', name: '高端定制' }
    ],
    faq: [
      { q: '配对没反应 / 点不动', a: '先退出重进一次。还不行就在客服里说机型（例如 iPhone 14 / 小米 13），我们按机型查。' },
      { q: '音频没声音', a: '检查手机是否静音、微信是否允许媒体音量。仍然没声音请把机型发客服。' },
      { q: '进度丢了', a: '进度存在本机。换手机或清理微信缓存会丢，建议先截图留档再反馈。' },
      { q: '想换绑微信', a: '目前进度跟本机绑定，暂不支持换绑；有需求请在客服留言，我们会统计。' }
    ],
    thangkaNote: '藏文化配饰与装饰画，三档价位：纸品 5–19、配饰 9–39、装饰画 55–70。看中哪件、想放大看细节，点「咨询/购买」直接问客服。',
    thangkas: [
      { id: 'p1', tier: '纸品 · 5–19 元', name: '雪域日签 · 12 张一套', spec: '10×15cm · 双面卡纸', price: '12' },
      { id: 'p2', tier: '纸品 · 5–19 元', name: '藏式纹样贴纸 · 24 枚', spec: '单枚约 4cm', price: '9' },
      { id: 'p3', tier: '纸品 · 5–19 元', name: '藏地风景明信片 · 6 张', spec: '14.8×10cm', price: '15' },

      { id: 'a1', tier: '配饰 · 9–39 元', name: '藏式纹样挂件 · 吉祥结几何', spec: '合金烫金 · 直径 4cm', price: '29' },
      { id: 'a2', tier: '配饰 · 9–39 元', name: '藏式纹样书签 · 回形纹', spec: '黄铜蚀刻 · 12cm', price: '19' },
      { id: 'a3', tier: '配饰 · 9–39 元', name: '藏式织带手绳 · 五色', spec: '手工编织 · 可调', price: '39' },

      { id: 'd1', tier: '装饰画 · 55–70 元', name: '藏式装饰画 · 绿度母题材', spec: '30×40cm · 艺术印刷 · 卷轴装裱', price: '55' },
      { id: 'd2', tier: '装饰画 · 55–70 元', name: '藏式装饰画 · 白度母题材', spec: '40×60cm · 艺术印刷 · 卷轴装裱', price: '65' },
      { id: 'd3', tier: '装饰画 · 55–70 元', name: '藏式装饰画 · 药师佛题材', spec: '50×70cm · 艺术印刷 · 卷轴装裱', price: '70' }
    ],
    bespokeNote: '如果你要的是真正手绘的藏式装饰画、或指定画师与题材，我们有西藏那边的渠道，可以按需定制、从西藏直接发货。价格和周期差别很大，先留言说清需求。',
    disclaimer: '本品为藏文化装饰艺术品（唐卡风格印刷画），按画面、尺寸与装裱工艺销售；不含任何宗教服务、仪式或功效承诺。定制类商品一经开工不支持退换。'
  },

  onTab: function (e) {
    var key = e.currentTarget.dataset.key;
    if (key && key !== this.data.active) this.setData({ active: key });
  },

  onShareAppMessage: function () {
    return {
      title: GAME + ' · 帮助与客服',
      path: '/package-service/pages/service/service'
    };
  }
});
