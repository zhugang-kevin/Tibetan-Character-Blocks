// app.js — 藏字方块
App({
  globalData: {
    fontLoaded: false
  },
  onLaunch: function () {
    this.loadTibetanFont();
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
