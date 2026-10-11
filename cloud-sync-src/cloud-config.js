// utils/cloud-config.js — 云服务公开配置（D93）
//
// ## 这两个值从哪来
//   来自 `workbuddy_cloud_service` 的 **activate 结果里的 `publicConfig`** —— **原样照抄**，
//   不是我猜的、也不是从别处推的。官方对这两个字段的定义：
//     · `endpoint`        —— 本应用的数据面网关地址。**必须从 publicConfig 取**，
//                            绝不能硬编码一个字面量、也不能从 location / 环境变量 / BFF 推。
//     · `publishableKey`  —— 标识**哪个应用**，本身**不带任何权限**；
//                            服务端靠精确 Origin 匹配来判定。可随前端代码发布。
//
// ## 为什么可以放在代码里
//   官方明确：这两个是「the only values safe to ship inside the app's front-end code」。
//   真正的密钥（环境 id、provider key）**永远不会**下发到前端。
//
// ## 小程序为什么用这个固定网关
//   微信的 request 合法域名**不接受通配符、且有数量上限**，按应用分配独立域名无法扩展
//   （每加一个应用都要人工改微信后台）。所以小程序类应用的 `endpoint` 是**环境级固定网关**，
//   **不是**应用自己的域名。发布流程会幂等地把这个域名按需登记到微信的合法域名里。
//
//   ⚠️ 因此：**不要**直接 curl / 浏览器访问这个网关，也不要用它的返回来判断它「对不对」——
//      它只转发带小程序凭证（publishableKey + 微信 Referer）的请求；
//      裸请求会落到一个通用页（「链接已失效」之类），**那是预期行为，不是网关坏了**。
//      调试请走小程序端日志（见 utils/workbuddy-cloud-diagnostics.js）。

module.exports = {
  endpoint: 'https://mp-api.app.workbuddy.host',
  publishableKey: 'wbpk_k5GNOD13SCij3w7Ki5cYlc_pJkq5xPA9iOGUIONHyEIiW173fpbsVfu',
  // 小程序不使用 oauthRelayBaseUrl（那是 web 端微信扫码登录用的）
};
