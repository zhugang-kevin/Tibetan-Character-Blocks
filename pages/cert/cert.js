// pages/cert/cert.js — 藏文成长证书（查看 / 保存 / 分享）
//
// 证书是「学习证明」：写的是这一阶段真的学会了什么，而不是积分奖励。
// 未获得时展示该阶段的进度与门槛规则（还差几关 / 还差多少正确率）。
var certificate = require('../../utils/certificate');
var storage = require('../../utils/storage');
var tracker = require('../../utils/tracker');
var tibText = require('../../utils/tibetan-text');

// 证书顶部的藏文装饰语：བོད་ཡིག་སློབ་སྦྱོང（藏文学习）
var CERT_TIB = 'བོད་ཡིག་སློབ་སྦྱོང';

Page({
  data: {
    stage: 1,
    stageInfo: null,
    cert: null,
    progress: 0,
    total: 10,
    tiers: [],
    showNameModal: false,
    nameInput: '',
    generating: false,
    imagePath: ''
  },

  onLoad: function (query) {
    var stage = parseInt(query.stage, 10) || 1;
    // 阶段号非法（越界 / 被手改）时直接回首页，避免渲染空证书
    if (!certificate.stageByNo(stage)) {
      wx.redirectTo({ url: '/pages/index/index' });
      return;
    }
    this.setData({ stage: stage });
    this.refresh();
    tracker.track('cert_view');
  },

  onShow: function () {
    this.refresh();
  },

  refresh: function () {
    var stage = this.data.stage;
    var info = certificate.stageByNo(stage);
    var cert = storage.findCert(stage);
    var slots = certificate.list();
    var slot = null;
    for (var i = 0; i < slots.length; i++) {
      if (slots[i].stage === stage) { slot = slots[i]; break; }
    }
    this.setData({
      stageInfo: info,
      cert: cert,
      progress: slot ? slot.progress : 0,
      total: slot ? slot.total : 10,
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
    setTimeout(function () { that.setData({ generating: false }); }, 100);
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
      ctx.fillStyle = 'rgba(192, 57, 43, 0.75)';
      ctx.font = '500 54px "Noto Serif Tibetan", "Microsoft Himalaya", serif';
      tibText.drawTibetanWrapped(ctx, CERT_TIB, W / 2, 148, W - 260, 68);

      // 主标题
      ctx.fillStyle = '#2C3E50';
      ctx.font = '700 46px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillText('藏文成长证书', W / 2, 268);

      // 分隔线
      ctx.strokeStyle = 'rgba(183, 149, 11, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 150, 300);
      ctx.lineTo(W / 2 + 150, 300);
      ctx.stroke();

      // 阶段
      ctx.fillStyle = '#8A8375';
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
        ctx.fillStyle = '#8A8375';
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

      ctx.fillStyle = '#B7950B';
      ctx.font = '700 28px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillText('玩方块，认藏文', W / 2, H - 62);

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

  saveToAlbum: function () {
    if (!this.data.imagePath) return;
    wx.saveImageToPhotosAlbum({
      filePath: this.data.imagePath,
      success: function () { wx.showToast({ title: '已保存到相册', icon: 'success' }); },
      fail: function (e) {
        if (e.errMsg && e.errMsg.indexOf('auth') > -1) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中允许保存图片到相册',
            confirmText: '去设置',
            success: function (res) { if (res.confirm) wx.openSetting(); }
          });
        } else {
          wx.showToast({ title: '保存失败，请再试一次', icon: 'none' });
        }
      }
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
      title: cert
        ? ('我拿到了「' + cert.stageName + '」' + cert.tierLabel + ' · 藏文成长证书')
        : '藏字方块，玩方块，认藏文',
      path: '/pages/index/index',
      imageUrl: this.data.imagePath || undefined
    };
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
