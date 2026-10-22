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
      { key: 'thangka', name: '唐卡' },
      { key: 'bespoke', name: '高端定制' }
    ],
    faq: [
      { q: '配对没反应 / 点不动', a: '先退出重进一次。还不行就在客服里说机型（例如 iPhone 14 / 小米 13），我们按机型查。' },
      { q: '音频没声音', a: '检查手机是否静音、微信是否允许媒体音量。仍然没声音请把机型发客服。' },
      { q: '进度丢了', a: '进度存在本机。换手机或清理微信缓存会丢，建议先截图留档再反馈。' },
      { q: '想换绑微信', a: '目前进度跟本机绑定，暂不支持换绑；有需求请在客服留言，我们会统计。' }
    ],
    thangkaNote: '藏式装饰画（唐卡风格），批量生产的艺术印刷品，价格 50–70 元，按尺寸分档。看中哪件、想放大看细节，点「咨询/购买」直接问客服。',
    thangkas: [
      { id: 't1', name: '藏式装饰画 · 绿度母题材', size: '30×40cm', craft: '艺术印刷 · 卷轴装裱', price: '55' },
      { id: 't2', name: '藏式装饰画 · 白度母题材', size: '40×60cm', craft: '艺术印刷 · 卷轴装裱', price: '65' },
      { id: 't3', name: '藏式装饰画 · 药师佛题材', size: '50×70cm', craft: '艺术印刷 · 卷轴装裱', price: '70' }
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
