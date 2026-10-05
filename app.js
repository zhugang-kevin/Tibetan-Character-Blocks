// app.js — 藏字方块
var collect = require('./utils/collect');
var storage = require('./utils/storage');

App({
  globalData: {
    fontLoaded: false
  },
  onLaunch: function () {
    this.recordDailyOpen();
    this.loadTibetanFont();
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
