// config/pay.js — 虚拟支付的小程序端配置（D136）
//
// ┌──────────────────────────────────────────────────────────────┐
// │ 这个文件是**故意提交进 git 的**，里面**没有任何密钥**。            │
// │ 为什么可以公开：offerId 会被放进每一次下单请求，本来就是前端可见的；  │
// │ 真正的密钥（AppKey / AppSecret）只在服务端环境变量里，永不进前端。   │
// └──────────────────────────────────────────────────────────────┘
//
// 开通虚拟支付后，只改下面三个值（其余一个字都别动）：
//   ① offerId       mp 后台 → 虚拟支付 → 基本配置 → OfferID
//   ② orderApi      你的服务端下单地址，必须 https、必须已 ICP 备案
//   ③ goodsPublished 后台「道具管理」4 个道具全部发布后才改成 true
//
// 改完之后跑一次自检（不联网、不花钱）：
//   node scripts/check-pay-config.js
//
// 三个值全空 = 未开通状态（正常）。此时 payment.isReady() 为 false，
// 打赏入口会隐藏，不会发任何请求，也不会假装能付。

module.exports = {
  // 形如 '1450001234' 的数字串（以 mp 后台显示为准，别加引号以外的字符）
  offerId: '',

  // 0 = 正式环境；1 = 沙箱环境（只在开发者工具里调试用，现网版本必须 0）
  env: 0,

  // 🔴 待填（已定死，无需再问域名）：本项目的后端域名就是 api.dorjea.cn（子域名，非根域）。
  //   正确值 = 'https://api.dorjea.cn/pay/order'
  //   硬要求（官方《网络》文档）：https、域名必须 ICP 备案、
  //   不能是 IP、不能是 localhost、不能是父域名（用子域名）、TLS ≥ 1.2
  // ⚠️ 不要单独填 orderApi：offerId/orderApi/goodsPublished 三件必须一起填，
  //    否则 check-pay-config.js 会判「半配置」红。等拿到 offerId 一起填。
  orderApi: '',

  // 4 个道具在后台全部「已发布」后才置 true（未发布下单会报 -15010 / -15014）
  goodsPublished: false
};
