// utils/cloud.js — 云服务客户端（单例，D93）
//
// ## 为什么必须走这个入口
//   官方硬性要求：
//     · 客户端**只初始化一次**，四个模块（database / auth / storage / llm）复用同一个实例；
//     · 必须用**小程序专用子路径** `@tencent-ai/workbuddy-cloud-sdk/miniprogram`
//       和它导出的 `createMiniProgramWorkBuddyCloud`；
//     · **不要**从根入口 `createWorkBuddyCloud` 自己拼装 polyfill —— 少一步或顺序错了，
//       客户端能构造成功，但**第一次请求必失败**；
//     · **不要**直接对 `/.cloud/**` 手写 `wx.request` —— 那会绕过 publishableKey 注入与会话管理。
//
//   小程序没有 `location.origin`，SDK 的同源回退不存在，所以 `endpoint` **必须传**。

var config = require('./cloud-config');
var diagnostics = require('./workbuddy-cloud-diagnostics');
var sdk = require('@tencent-ai/workbuddy-cloud-sdk/miniprogram');

// 单例：整个小程序共用一个客户端
var cloud = sdk.createMiniProgramWorkBuddyCloud({
  endpoint: config.endpoint,
  publishableKey: config.publishableKey,
  // 诊断适配器：让失败的云请求在真机 vConsole 里可见（不改变任何请求语义）
  wx: diagnostics.createDiagnosticWx(wx)
});

module.exports = { cloud: cloud };
