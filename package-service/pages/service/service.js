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
    thangkaNote: '全部是能直接戴、直接送的成品（含绳，不是需要自己拼的配件）。49–70 元区间。看中哪件、想看细节大图，点「咨询/购买」直接问客服。',
    thangkas: [
      { id: 'g1', tier: '入门 · 49–55 元', name: '迷你唐卡擦擦吊坠 · 绿度母', spec: '成品 · 2×2cm · 含编绳', price: '49' },
      { id: 'g2', tier: '入门 · 49–55 元', name: '迷你唐卡擦擦吊坠 · 白度母', spec: '成品 · 2×2cm · 含编绳', price: '52' },
      { id: 'g3', tier: '入门 · 49–55 元', name: '迷你唐卡擦擦吊坠 · 药师佛', spec: '成品 · 2×2cm · 含编绳', price: '55' },

      { id: 'g4', tier: '主推 · 59–65 元', name: '唐卡吊坠 · 双面彩绘', spec: '成品 · 3×3cm · 含编绳', price: '59' },
      { id: 'g5', tier: '主推 · 59–65 元', name: '唐卡吊坠 · 双面彩绘（加大）', spec: '成品 · 3.5×3.5cm · 含编绳', price: '62' },
      { id: 'g6', tier: '主推 · 59–65 元', name: '唐卡车挂 · 迷你成品', spec: '成品 · 5×7cm · 含挂绳', price: '65' },

      { id: 'g7', tier: '精选 · 68–70 元', name: '唐卡吊坠礼盒 · 坠+绳+绒袋', spec: '成品 · 3×3cm · 礼盒装', price: '68' },
      { id: 'g8', tier: '精选 · 68–70 元', name: '唐卡双坠组合 · 两枚一套', spec: '成品 · 2×2cm ×2 · 绒袋', price: '70' },
      { id: 'g9', tier: '精选 · 68–70 元', name: '唐卡小挂 · 加厚装裱款', spec: '成品 · 4×6cm · 含挂绳', price: '70' }
    ],
    bespokeNote: '嘎乌盒、装裱好的大幅装饰画、以及真正手绘的唐卡，成本决定了它们不可能做到 70 元以内（嘎乌盒保本就要 60 起），所以放在这里按需求报价：题材、尺寸、预算、到手时间四项说清，我们从西藏渠道给你准信。',
    disclaimer: '本品为藏文化配饰与装饰艺术品，按材质、工艺与尺寸销售；不含任何宗教服务、仪式或功效承诺。贴身类配饰因卫生原因拆封后不支持退换，定制类开工后不支持退换。'
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
