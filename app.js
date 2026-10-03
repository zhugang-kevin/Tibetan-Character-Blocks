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
