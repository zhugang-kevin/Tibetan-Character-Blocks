// config/ads.js — 流量主广告位配置（D138）
//
// ┌────────────────────────────────────────────────────────────────────┐
// │ 没有广告位 ID 就什么都不会发生：不创建实例、不拉广告、不报错。          │
// │ 空值 = 未开通流量主（正常状态）。                                     │
// └────────────────────────────────────────────────────────────────────┘
//
// 从哪拿：mp 后台 → 推广 → 流量主 → 广告位管理 → 新建广告位 → 复制 ID。
// 形如 `adunit-04a286aaed8abcde`（官方示例就是这个格式）。
//
// 🔴 **一个 ID 只能用于一种类型**。官方《广告预加载接口》原文：
//    「广告单元 ID 和广告单元所属广告位类型需要匹配成功，否则会导致无法正常使用」
//    把 banner 的 ID 填到 rewarded 里 → 激励视频永远拉不到。
//
// 类型对照（官方《创建广告单元》的枚举）：
//   SLOT_ID_WEAPP_BANNER        → banner
//   SLOT_ID_WEAPP_REWARD_VIDEO  → rewarded        （激励视频，必填 15/30 秒解锁时长）
//   SLOT_ID_WEAPP_INTERSTITIAL  → interstitial    （插屏，点击关闭才消失）
//   SLOT_ID_WEAPP_VIDEO_FEEDS   → video
//   SLOT_ID_WEAPP_VIDEO_BEGIN   → videoPatch      （视频前贴）
//   SLOT_ID_WEAPP_TEMPLATE      → template        （原生模板广告）
//   封面广告（cover）**无需创建 ID**，在后台开关即可，所以这里没有它。

module.exports = {
  // ── ✅ 已接线（页面真的在用）────────────────────────────────────────
  // 🔴🔴 TODO（拿到 ID 后填这里）：开通流量主 → mp 后台「推广 → 流量主 → 广告位管理」→ 复制 adunit- 开头的 ID，
  //     替换下面三行的空字符串。**只能填这三类**（banner / video / rewarded），未接线的三类永远别填。
  banner: '',        // 🔴 TODO：填后台复制的 banner ID（结算页横幅，video 没配时的退路）
  video: '',         // 🔴 TODO：填后台复制的 video ID（结算页 <ad ad-type="video">）
  rewarded: '',      // 🔴 TODO：填后台复制的 rewarded ID（游戏页激励「看一段·得一次提示」；后台建时必选 15/30 秒解锁时长）

  // ── ⬜ 未接线（运行时没有任何消费者）────────────────────────────────
  //   填了不会报错、不会渲染、**也不会有收入** —— check-ads-config.js 会直接判红。
  //   要用必须先接运行时（见 `utils/ads.js` 的 WIRED 表与 D156），
  //   不要以为填个 ID 就自动生效。
  interstitial: '',  // 插屏：官方限制「不能一进小程序就弹、不能用在首页」，暂不接
  videoPatch: '',    // 视频前贴
  template: ''       // 原生模板（<ad-custom>）
};
