// pages/cert/cert.js — 藏文拼读证书（学习线 · 查看 / 保存 / 分享）
//
// 证书是「学习证明」：写的是这一阶段真的学会了什么，而不是积分奖励。
// 未获得时展示该阶段的进度与门槛规则（还差几关 / 还差多少正确率）。
var certificate = require('../../utils/certificate');
// D111 学习体系证书（15 级各一张）：级名 / 关数从数据来，页面不写死
var learningData = require('../../data/learning');
var learning = require('../../utils/learning');
var storage = require('../../utils/storage');
var tracker = require('../../utils/tracker');
var tibText = require('../../utils/tibetan-text');
// 用户隐私保护指引（utils/privacy.js）：保存相册是受保护接口，必须先过授权关卡
var privacy = require('../../utils/privacy');
// 证书顶部的藏文装饰语：བོད་ཡིག་སློབ་སྦྱོང（藏文学习）
var CERT_TIB = 'བོད་ཡིག་སློབ་སྦྱོང་';
Page({
  data: {
    stage: 1,
    stageInfo: null,
    // D111：?learn=lv 时渲染学习体系证书（与阶段证书并存，不同形状）
    learnMode: false,
    learnLv: 0,
    cert: null,
    progress: 0,
    total: 10,
    tiers: [],
    showNameModal: false,
    nameInput: '',
    generating: false,
    imagePath: ''
  },
  // D101：卸载后关掉存活标记，让在飞的定时器回调退出
  onUnload: function () {
    this._alive = false;
  },
  onLoad: function (query) {
    this._alive = true;   // D101：供定时器回调判断页面是否还在
    // D111：学习体系证书（?learn=lv）—— 级号非法或未拿到该级证书时回首页，
    //   不渲染空证书（与阶段证书同一纪律）。
    var learnLv = parseInt(query.learn, 10) || 0;
    if (learnLv > 0) {
      if (!learningData.byLevel(learnLv) || !certificate.findLvCert(learnLv)) {
        wx.redirectTo({ url: '/pages/index/index' });
        return;
      }
      this.setData({ learnMode: true, learnLv: learnLv });
      this.refresh();
      tracker.track('cert_view');
      return;
    }
    // ⚠️ 旧的 `?stage=N`（12 阶段「藏文成长证书」）已于 2026-10-15 撤除（D119：两块证书墙合并成一块）。
    //   这条分支当时**漏掉了** —— 它仍会渲染一个已经不存在于任何入口的阶梯证书。
    //   现在没有第二种证书形态，统一回首页。
    //   （注意：这里**不能再引用 stageByNo / data/stages** —— 那套 API 已删除，
    //     留着会是一个永远取到 undefined 的孤儿判断。）
    wx.redirectTo({ url: '/pages/index/index' });
  },
  onShow: function () {
    this.showShare();
    this.refresh();
  },
  refresh: function () {
    // 只有一种证书形态了：学习线（旧 12 阶段体系已撤除，见 onLoad）
    this.refreshLearn();
  },
  // D111 学习体系证书刷新：把学习证书整形成与阶段证书同形的视图模型
  //   （stage = 级号、stageName = 级名），复用同一套渲染与 Canvas 导出。
  refreshLearn: function () {
    var lv = this.data.learnLv;
    var L = learningData.byLevel(lv);
    var cert = certificate.findLvCert(lv);
    this.setData({
      cert: cert ? Object.assign({}, cert, { stage: cert.lv, stageName: cert.name }) : null,
      stageInfo: L ? { name: L.name, goal: L.goal } : null,
      progress: storage.getLearnLevelDone(lv),
      total: learning.stagesOf(lv) || 10,
      tiers: [certificate.TIERS.gold, certificate.TIERS.silver, certificate.TIERS.bronze]
    });
  },
  // ---------- 持有人（与祝福卡昵称共用） ----------
  openNameModal: function () {
    var cert = this.data.cert;
    this.setData({
      showNameModal: true,
      nameInput: (cert && cert.holder !== '藏文学习者') ? cert.holder : storage.getHolderName()
    });
  },
  closeNameModal: function () {
    this.setData({ showNameModal: false });
  },
  onNameInput: function (e) {
    this.setData({ nameInput: e.detail.value });
  },
  confirmName: function () {
    var name = (this.data.nameInput || '').trim().slice(0, 10) || '藏文学习者';
    storage.setHolderName(name);
    var cert = this.data.cert;
    if (cert) {
      cert.holder = name;
      storage.saveCert(cert);   // 证书持有人可随时修改（编号不变）
    }
    this.setData({ showNameModal: false, imagePath: '' });
    this.refresh();
  },
  noop: function () {},
  // ---------- 生成证书图片（Canvas 2D 导出 PNG） ----------
  generate: function () {
    var cert = this.data.cert;
    if (!cert) return;
    var that = this;
    this.setData({ generating: true });
    this.drawCert(cert);
    // drawCert 内部异步加载 Logo；此处仅切换按钮态
    setTimeout(function () { if (that._alive) that.setData({ generating: false }); }, 100);
  },
  drawCert: function (cert) {
    var that = this;
    var W = 750, H = 1120;
    var canvas, ctx;
    try {
      canvas = wx.createOffscreenCanvas({ type: '2d', width: W, height: H });
      ctx = canvas.getContext('2d');
    } catch (e) {
      wx.showToast({ title: '当前微信版本不支持生成图片', icon: 'none' });
      return;
    }
    var imgs = { logo: null };
    var finish = function () {
      wx.canvasToTempFilePath({
        canvas: canvas,
        x: 0, y: 0, width: W, height: H,
        destWidth: W, destHeight: H,
        success: function (res) { that.setData({ imagePath: res.tempFilePath }); },
        fail: function () { wx.showToast({ title: '生成失败，请再试一次', icon: 'none' }); }
      });
    };
    var paint = function () {
      var accent = cert.tierColor || '#C0392B';
      // 底：宣纸米色
      ctx.fillStyle = '#FDF6E3';
      ctx.fillRect(0, 0, W, H);
      // 双描边（外粗内细）
      ctx.strokeStyle = accent;
      ctx.lineWidth = 6;
      roundRect(ctx, 24, 24, W - 48, H - 48, 28);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(183, 149, 11, 0.55)';
      ctx.lineWidth = 2;
      roundRect(ctx, 46, 46, W - 92, H - 92, 20);
      ctx.stroke();
      // 四角装饰
      ctx.fillStyle = accent;
      ctx.font = '28px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('✦', 66, 100);
      ctx.textAlign = 'right';
      ctx.fillText('✦', W - 66, 100);
      ctx.textAlign = 'left';
      ctx.fillText('✦', 66, H - 70);
      ctx.textAlign = 'right';
      ctx.fillText('✦', W - 66, H - 70);
      // 藏文装饰语（tsheg 断行，shad 类符号不落行首）
      ctx.textAlign = 'center';
      ctx.fillStyle = '#C0392B';
      ctx.font = '500 54px "Noto Serif Tibetan", "Microsoft Himalaya", serif';
      tibText.drawTibetanWrapped(ctx, CERT_TIB, W / 2, 148, W - 260, 68);
      // 主标题
      ctx.fillStyle = '#2C3E50';
      ctx.font = '700 46px "PingFang SC","Microsoft YaHei",sans-serif';
      // ⚠️ 这里原本**写死**「藏文成长证书」（12 阶段旧体系的名字）。
      //   D119 撤除旧体系后，全站只剩学习线一种证书 —— 结果玩家保存下来的图上
      //   印着一个已经不存在的体系名（页面 WXML 标题改了、图上没改，属于内容自相冲突）。
      ctx.fillText('藏文拼读证书', W / 2, 268);
      // 分隔线
      ctx.strokeStyle = 'rgba(183, 149, 11, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 150, 300);
      ctx.lineTo(W / 2 + 150, 300);
      ctx.stroke();
      // 阶段
      ctx.fillStyle = '#6E6759';
      ctx.font = '400 28px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillText('第 ' + cert.stage + ' 阶段', W / 2, 352);
      // 阶段名
      ctx.fillStyle = accent;
      ctx.font = '700 76px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillText(cert.stageName, W / 2, 442);
      // 等级徽章
      var bw = 250, bh = 60, bx = (W - bw) / 2, by = 470;
      ctx.fillStyle = accent;
      roundRect(ctx, bx, by, bw, bh, 30);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '700 30px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillText(cert.tierLabel, W / 2, by + 40);
      // 成就行
      ctx.fillStyle = '#2C3E50';
      ctx.font = '500 30px "PingFang SC","Microsoft YaHei",sans-serif';
      var lines = cert.lines || [];
      for (var i = 0; i < lines.length; i++) {
        ctx.fillText('✦  ' + lines[i], W / 2, 606 + i * 54);
      }
      // 证书信息（左标签 / 右值）
      var metaY = 806;
      var rows = [
        ['证书编号', cert.no],
        ['持 有 人', cert.holder],
        ['颁发日期', cert.date],
        ['学习表现', '正确率 ' + cert.acc + '%' + (cert.clean ? ' · 零失误' : '')]
      ];
      ctx.font = '400 26px "PingFang SC","Microsoft YaHei",sans-serif';
      for (var r = 0; r < rows.length; r++) {
        var y = metaY + r * 46;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#6E6759';
        ctx.fillText(rows[r][0], 120, y);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#2C3E50';
        ctx.fillText(rows[r][1], W - 120, y);
        ctx.strokeStyle = 'rgba(214, 202, 176, 0.9)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(120, y + 14);
        ctx.lineTo(W - 120, y + 14);
        ctx.stroke();
      }
      // 底部品牌：Logo + 小程序码占位
      if (imgs.logo) ctx.drawImage(imgs.logo, 96, H - 186, 96, 96);
      var cs = 116, cx = W - 212, cy = H - 196;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      roundRect(ctx, cx, cy, cs, cs, 14);
      ctx.fill();
      ctx.strokeStyle = 'rgba(183, 149, 11, 0.6)';
      ctx.lineWidth = 2;
      roundRect(ctx, cx, cy, cs, cs, 14);
      ctx.stroke();
      ctx.fillStyle = '#C0392B';
      ctx.font = '22px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('小程序码', cx + cs / 2, cy + cs / 2 + 8);
      ctx.fillStyle = '#8A6A12';
      ctx.font = '700 28px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillText('认藏文，从方块开始', W / 2, H - 62);
      finish();
    };
    var loadImg = function (src) {
      return new Promise(function (resolve) {
        try {
          var img = canvas.createImage();
          img.onload = function () { resolve(img); };
          img.onerror = function () { resolve(null); };
          img.src = src;
        } catch (e) { resolve(null); }
      });
    };
    loadImg('/images/logo-80.png').then(function (img) {
      imgs.logo = img;
      paint();
    });
  },
  // 保存到相册（受保护接口：先走 utils/privacy.js 的统一前置，同意后立即继续保存）
  saveToAlbum: function () {
    var that = this;
    if (!this.data.imagePath) return;
    privacy.ensurePrivacy(function (ok) {
      if (!ok) return;
      wx.saveImageToPhotosAlbum({
        filePath: that.data.imagePath,
        success: function () { wx.showToast({ title: '已保存到相册', icon: 'success' }); },
        fail: function (e) {
          if (privacy.explainSaveFailure(e)) return;
          wx.showToast({ title: '保存失败，请再试一次', icon: 'none' });
        }
      });
    });
  },
  previewShare: function () {
    if (!this.data.imagePath) return;
    wx.previewImage({ urls: [this.data.imagePath] });
  },
  goPassport: function () {
    wx.navigateTo({ url: '/pages/passport/passport' });
  },
  goHome: function () {
    wx.redirectTo({ url: '/pages/index/index' });
  },
  onShareAppMessage: function () {
    var cert = this.data.cert;
    return {
      // 全站只剩学习线一种证书（D119），不再有 learnMode 分支
      title: cert
        ? ('我拿到了「L' + cert.stage + ' · ' + cert.stageName + '」' + cert.tierLabel + ' · 藏文拼读证书')
        : '藏字方块，认藏文，从方块开始',
      path: '/pages/index/index',
      imageUrl: this.data.imagePath || undefined
    };
  },
  // D86：分享到朋友圈 —— 官方要求 onShareAppMessage 与 onShareTimeline **同时实现**，
  //   缺任一个朋友圈分享都不可用。注意朋友圈打开是「单页模式」（场景值 1154）：
  //   无登录态、不能跳转、**禁用支付** —— 卡片只负责让人看到，再点「前往小程序」回来。
  onShareTimeline: function () {
    return {
      title: '藏字方块 · 认藏文，从方块开始',
      query: 'from=timeline',
      imageUrl: '/images/logo-144.png'
    };
  },
  // D86：开启分享菜单（含朋友圈入口）—— 不调用则右上角「···」里没有分享按钮
  showShare: function () {
    if (wx.showShareMenu) wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
  }
});
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}