// app.js — 藏趣方块
var collect = require('./utils/collect');
var storage = require('./utils/storage');
App({
  globalData: {
    fontLoaded: false
  },
  // === 自检：全局错误捕获（2026-10-21）===
  // 之前 app.js 只有 onLaunch —— 线上崩了你根本不知道。
  // 这两个钩子是小程序唯一能拿到全局异常的入口。
  // ⚠️ 只上报"哪里崩了"（页面 + 消息 + 栈顶），不采集用户身份。
  onError: function (msg) {
    try { require('./utils/telemetry').error(new Error(String(msg)), 'app.onError'); } catch (e) {}
  },
  onUnhandledRejection: function (res) {
    try {
      var reason = (res && res.reason) || 'unhandled rejection';
      require('./utils/telemetry').error(reason, 'app.onUnhandledRejection');
    } catch (e) {}
  },
  // 切后台 = 最自然的批量上报时机（用户可能就此离开，不 flush 就永远丢了）
  onHide: function () {
    try { require('./utils/telemetry').flush(); } catch (e) {}
  },
  onLaunch: function () {
    this.recordDailyOpen();
    this.loadTibetanFont();
    this.preloadTemplePacks();
  },
  // 2026-11-05：寺庙揭图在 package-temples-1/2（各约 0.96MB，共 50 座）。
  // 开局就后台预下载 —— 否则第一关通关时图还没到，揭图层会是空白。
  // wx.loadSubpackage 重复调用是幂等的（已下载会立即回调 success），所以游戏页也会再调一次。
  preloadTemplePacks: function () {
    try {
      if (!wx.loadSubpackage) return;
      wx.loadSubpackage({ name: 'temples1' });
      wx.loadSubpackage({ name: 'temples2' });
    } catch (e) { /* 分包下载失败不影响主流程，揭图会缺图但游戏可玩 */ }
  },
  // 记录「每天首次打开」：首日 / 打开天数 / 连续天数，只落本地。
  // 用途：内测期与微信「小程序数据助手」的次日、7 日留存曲线对照，
  // 判断「前 60 秒」到底有没有把人留下来。不上传、不请求任何网络接口。
  recordDailyOpen: function () {
    try {
      var next = collect.markOpen(storage.getOpenLog(), collect.todayKey());
      storage.applyOpenLog(next.state);
    } catch (e) { /* 存储异常不影响启动 */ }
  },
  // 注入进度同步配置（D94）：只需服务端地址，不需要任何密钥
  injectSyncConfig: function (cfg) {
    try { require('./utils/sync').injectConfig(cfg || {}); } catch (e) { /* 不影响启动 */ }
  },
  // 注入虚拟支付配置（D90）
  //   ⚠️ 官方红线：**签名只能在服务端算**（AppKey / session_key 绝不能出现在前端）。
  //   所以这里**只有 offerId 和服务端下单地址**，没有任何密钥。
  //   ⚠️ offerId 与 orderApi 不写死在代码里（不进 git）；上线前从这里注入。
  //   未注入时 payment.isReady() === false → UI 隐藏打赏入口、不发任何请求。
  injectPaymentConfig: function (cfg) {
    try {
      require('./utils/payment').injectConfig(cfg || {});
    } catch (e) { /* 支付模块异常不影响启动 */ }
  },
  // 加载藏文字体 Noto Serif Tibetan
  // 注意：TTF 文件必须托管在 HTTPS 服务器上。
  // 请把 TIBETAN_FONT_URL 替换为你自己的字体文件地址
  // （例如微信云开发静态托管 / 自己的服务器 / 对象存储）。
  // 字体下载地址：https://fonts.google.com/noto/specimen/Noto+Serif+Tibetan
  // 加载失败时，藏文字母将回退到系统字体（多数安卓机型可正常显示）。
  loadTibetanFont: function () {
    var TIBETAN_FONT_URL = 'https://your-server.com/fonts/NotoSerifTibetan-Regular.ttf'; // TODO: 替换
    var that = this;
    if (!wx.loadFontFace) return;
    // 尚未配置真实字体地址时直接跳过，避免本地体验时控制台报错。
    // 此时藏文回退到系统字体：Windows / Android 自带藏文字体可正常显示；
    // 部分 iOS 机型可能显示为方块，配置 HTTPS 字体地址后即解决。
    if (TIBETAN_FONT_URL.indexOf('your-server.com') > -1) {
      console.info('[字体] 未配置 TIBETAN_FONT_URL，藏文使用系统字体渲染');
      return;
    }
    wx.loadFontFace({
      global: true,
      family: 'Noto Serif Tibetan',
      source: 'url("' + TIBETAN_FONT_URL + '")',
      success: function () {
        that.globalData.fontLoaded = true;
      },
      fail: function () {
        // 静默失败，回退系统字体
      }
    });
  }
});