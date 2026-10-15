// data/goods.js — 虚拟支付道具表的**唯一事实源**（D113b）
//
// ## 它防的是什么
//   在抽出本文件之前，同一张道具表**被抄了三份**：
//     ① utils/payment.js#GIFTS（前端下单）
//     ② server/index.js#GIFTS（服务端算签名 / 校验 / 发货）
//     ③ preview/template.html#GIFTS_VIEW（体验版展示价）
//   三处各自的字面量。任一处改了另外两处没跟上，症状是：
//     · ①② 不一致 → 官方 **-15013**（goodsPrice 与后台不一致，直接失败）
//     · ①③ 不一致 → **页面显示价 ≠ 实付价**，这是投诉级问题
//   所以现在**只剩这一份**，其余三处全部 require 它。
//
// ## 与 mp 后台的对应（上线前必须逐字核对）
//   productId 必须与「mp 后台 → 虚拟支付 → 道具配置」里的**道具 ID 逐字一致**，
//   价格必须是**分**（100 = ¥1）。改名 / 改价都要同步：本文件 ←→ mp 后台。
//   申报表见 docs/virtual-payment-go-live.md（逐条可复制）。
//
// ## 为什么这里没有「名称/图标/说明」
//   那些是**给人看的口径**，放在 utils/gift-view.js（小程序）与 template.html（体验版镜像），
//   与本文件靠 productId 对应。官方口径与展示口径分开，改文案不会碰到价格。
module.exports = {
  // 单位：**分**。与官方 goodsPrice 同口径（否则 -15013）。
  list: [
    { productId: 'tib_lamp_1',     price: 100, give: 'lamp' },
    { productId: 'tib_blessing_3', price: 300, give: 'blessing' },
    { productId: 'tib_khata_6',    price: 600, give: 'khata' },
    { productId: 'tib_name_99',    price: 990, give: 'name' }
  ]
};
