// pages/result/result.js — 结算页 + 祝福卡生成
var cardsData = require('../../data/cards');
var elements = require('../../data/elements');
var storage = require('../../utils/storage');
var tracker = require('../../utils/tracker');
var tibText = require('../../utils/tibetan-text');
var certificate = require('../../utils/certificate');
var audio = require('../../utils/audio');

Page({
  data: {
    level: 1,
    pairs: 0,
    score: 0,
    combo: 0,
    collected: [],       // 本关收集到的文化卡（去重）
    isFinal: false,      // 是否第10关
    newStamp: false,     // 本局是否新获得护照印记
    showNameModal: false,
    nameInput: '',
    generating: false,
    imagePath: '',       // 祝福卡临时图片路径
    // ---- 成长阶梯 · 证书 ----
    accuracy: 100,       // 本关正确率（%）
    clean: true,         // 本关是否全程无失误
    stageName: '',       // 当前所属阶段名
    stageNo: 0,          // 当前阶段序号
    stageTo: 0,          // 本阶段最后一关
    cert: null,          // 本关新颁发 / 升级的证书
    certNew: false,
    certUpgraded: false,
    certTitle: '',       // 证书横幅文案（新得 / 升级 / 本阶段证书）
    ownedCerts: 0,       // 已获得证书总数
    skillHint: ''        // 距更高等级证书还差什么
  },

  onLoad: function (query) {
    var level = parseInt(query.level, 10) || 1;
    var pairs = parseInt(query.pairs, 10) || 0;
    var score = parseInt(query.score, 10) || 0;
    var combo = parseInt(query.combo, 10) || 0;
    var att = parseInt(query.att, 10) || 0;      // 配对尝试次数
    var miss = parseInt(query.miss, 10) || 0;    // 配对失败次数
    // 记录通关 + 解锁下一关
    storage.completeLevel(level);

    // 成长阶梯 · 证书：先记录本关成绩，再判断该阶段是否通关并（升级）颁发证书
    var certRes = certificate.onLevelComplete(level, {
      matches: pairs,
      attempts: att > 0 ? att : pairs,   // 兼容缺参：无失败配对视为满正确率
      misses: miss
    });
    if (certRes.isNew || certRes.upgraded) {
      tracker.track(certRes.isNew ? 'first_certificate' : 'certificate_upgraded');
    }

    // 文化护照印记 v0：首次通过第 1 关授予「拉萨印章」（Day1 形成习惯）
    var newStamp = false;
    if (level === 1 && storage.grantStamp('lhasa')) {
      newStamp = true;
      tracker.track('first_stamp');
    }

    var ids = (query.cards || '').split(',').filter(Boolean);
    if (ids.length) tracker.track('first_card');

    var collected = ids.map(function (id) {
      var el = elements[id] || {};
      var card = null;
      for (var k = 0; k < cardsData.length; k++) {
        if (cardsData[k].id === id) { card = cardsData[k]; break; }
      }
      return {
        id: id,
        label: el.type === 'letter' ? el.tibetan : (el.char || ''),
        name: card ? card.title : '',
        color: el.color || '#C0392B',
        isLetter: el.type === 'letter'
      };
    });

    this.setData({
      level: level,
      pairs: pairs,
      score: score,
      combo: combo,
      collected: collected,
      isFinal: level === 10,
      newStamp: newStamp,
      accuracy: certRes.accuracy,
      clean: miss === 0,
      stageNo: certRes.stage ? certRes.stage.stage : 0,
      stageName: certRes.stage ? certRes.stage.name : '',
      stageTo: certRes.stage ? certRes.stage.to : 0,
      cert: certRes.cert,
      certNew: certRes.isNew,
      certUpgraded: certRes.upgraded,
      certTitle: certRes.cert
        ? (certRes.isNew ? '获得藏文成长证书' : (certRes.upgraded ? '证书升级' : '本阶段证书'))
        : '',
      ownedCerts: certificate.ownedCount(),
      skillHint: certRes.skill ? certRes.skill.text : ''
    });

    // 舒缓祝福语（PRD 4.1）：画卷展开时读一句藏语祝福，缺失录音静默回退
    setTimeout(function () { audio.blessing(); }, 650);
  },

  goHome: function () {
    wx.redirectTo({ url: '/pages/index/index' });
  },

  // 查看本阶段证书（证书页支持保存 / 分享）
  openCert: function () {
    var n = (this.data.cert && this.data.cert.stage) || this.data.stageNo;
    if (!n) return;
    tracker.track('cert_view');
    wx.navigateTo({ url: '/pages/cert/cert?stage=' + n });
  },

  // 打开文化护照（总档案：12 张证书 + 印章 + 收藏）
  openPassport: function () {
    tracker.track('passport_view');
    wx.navigateTo({ url: '/pages/passport/passport' });
  },

  // 阻止冒泡占位（弹窗内容区 catchtap 用）
  noop: function () {},

  // 下一关（15分钟体验终点：玩家主动点击）
  goNext: function () {
    tracker.track('next_level_click');
    var next = Math.min(this.data.level + 1, 10);
    wx.redirectTo({ url: '/pages/game/game?level=' + next });
  },

  // ===== 祝福卡 =====
  // 昵称与证书持有人共用（storage.holderName），只让用户填一次
  openNameModal: function () {
    this.setData({ showNameModal: true, nameInput: storage.getHolderName() || '' });
  },

  closeNameModal: function () {
    this.setData({ showNameModal: false });
  },

  onNameInput: function (e) {
    this.setData({ nameInput: e.detail.value });
  },

  confirmGenerate: function () {
    var name = (this.data.nameInput || '').trim().slice(0, 10) || '朋友';
    storage.setHolderName(name);   // 同步为证书持有人
    this.setData({ showNameModal: false, generating: true });
    var that = this;
    // 等待弹窗关闭动画后再绘制
    setTimeout(function () {
      that.drawBlessingCard(name);
    }, 250);
  },

  // Canvas 2D 绘制祝福卡并导出图片（750×1050）
  // 品牌规范：藏文大字 + 扎西德勒 + 昵称 + Logo水印 + 底部 Logo/文案 + 小程序码
  drawBlessingCard: function (name) {
    var that = this;
    var W = 750, H = 1050;
    var canvas, ctx;
    try {
      canvas = wx.createOffscreenCanvas({ type: '2d', width: W, height: H });
      ctx = canvas.getContext('2d');
    } catch (e) {
      this.setData({ generating: false });
      wx.showToast({ title: '当前微信版本不支持生成图片', icon: 'none' });
      return;
    }

    var blessImgs = { logo: null, watermark: null, tashi: null };

    var finish = function () {
      wx.canvasToTempFilePath({
        canvas: canvas,
        x: 0, y: 0, width: W, height: H,
        destWidth: W, destHeight: H,
        success: function (res) {
          that.setData({ imagePath: res.tempFilePath, generating: false });
        },
        fail: function () {
          that.setData({ generating: false });
          wx.showToast({ title: '生成失败，请再试一次', icon: 'none' });
        }
      });
    };

    var paint = function () {
      // 背景：朱砂红 → 天然黄 柔和渐变
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#C0392B');
      g.addColorStop(1, '#B7950B');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // 内边框
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 3;
      roundRect(ctx, 32, 32, W - 64, H - 64, 24);
      ctx.stroke();

      // 半透明 Logo 水印（右上角，不抢主图）
      if (blessImgs.watermark) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.drawImage(blessImgs.watermark, W - 140, 70, 60, 60);
        ctx.restore();
      }

      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFFFFF';

      // 顶部藏文大字
      // 排版规范：断行只发生在 tsheg ( ་ ) 之后，shad ( ། ) 不落行首
      // 字体守卫：wx.loadFontFace 对 Canvas 2D 不保证生效，未加载成功时
      // Canvas 会画出"豆腐块"——此时回退到预渲染 PNG（images/tashi-delek.png），
      // 图片也缺失时再用系统字体链兜底（Windows/Android 自带喜马拉雅字体）
      var fontOk = !!(typeof getApp === 'function' &&
        getApp().globalData && getApp().globalData.fontLoaded);
      if (fontOk) {
        ctx.font = '500 92px "Noto Serif Tibetan", serif';
        tibText.drawTibetanWrapped(ctx, 'བཀྲ་ཤིས་བདེ་ལེགས', W / 2, 240, W - 160, 130);
      } else if (blessImgs.tashi) {
        ctx.drawImage(blessImgs.tashi, W / 2 - 300, 150, 600, 197);
      } else {
        ctx.font = '500 92px "Noto Serif Tibetan", "Microsoft Himalaya", serif';
        tibText.drawTibetanWrapped(ctx, 'བཀྲ་ཤིས་བདེ་ལེགས', W / 2, 240, W - 160, 130);
      }

      // 分隔线
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.moveTo(W / 2 - 130, 310);
      ctx.lineTo(W / 2 + 130, 310);
      ctx.stroke();

      // 中文祝福
      ctx.font = '700 76px sans-serif';
      ctx.fillText('扎西德勒', W / 2, 430);

      // 昵称
      ctx.font = '40px sans-serif';
      ctx.fillText('—— 致 ' + name + ' ——', W / 2, 530);

      // 底部小字
      ctx.font = '28px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillText('我在「藏字方块」中认了8个藏文字母', W / 2, 870);
      ctx.font = '600 34px sans-serif';
      ctx.fillText('玩方块，认藏文', W / 2, 930);

      // 底部左侧：藏字方块 Logo
      if (blessImgs.logo) {
        ctx.drawImage(blessImgs.logo, 70, H - 195, 100, 100);
      }

      // 右下角小程序码占位框（发布后可替换为真实小程序码图片）
      var bs = 130;
      var bx = W - 190, by = H - 200;
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      roundRect(ctx, bx, by, bs, bs, 16);
      ctx.fill();
      ctx.fillStyle = '#C0392B';
      ctx.font = '24px sans-serif';
      ctx.fillText('小程序码', bx + bs / 2, by + bs / 2 + 8);

      finish();
    };

    // 加载品牌 Logo（打包在项目内的本地图片）
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
    Promise.all([
      loadImg('/images/logo-80.png').then(function (img) { blessImgs.logo = img; }),
      loadImg('/images/logo-watermark.png').then(function (img) { blessImgs.watermark = img; }),
      loadImg('/images/tashi-delek.png').then(function (img) { blessImgs.tashi = img; })
    ]).then(paint);
  },

  // 保存到相册
  saveToAlbum: function () {
    var that = this;
    if (!this.data.imagePath) return;
    wx.saveImageToPhotosAlbum({
      filePath: this.data.imagePath,
      success: function () {
        wx.showToast({ title: '已保存到相册', icon: 'success' });
      },
      fail: function (e) {
        if (e.errMsg && e.errMsg.indexOf('auth') > -1) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中允许保存图片到相册',
            confirmText: '去设置',
            success: function (res) {
              if (res.confirm) wx.openSetting();
            }
          });
        } else {
          wx.showToast({ title: '保存失败，请再试一次', icon: 'none' });
        }
      }
    });
  },

  // 分享：打开图片预览，长按即可转发给朋友
  previewShare: function () {
    if (!this.data.imagePath) return;
    wx.previewImage({ urls: [this.data.imagePath] });
  },

  // 好友分享（右上角菜单 / 按钮 open-type="share"）
  onShareAppMessage: function () {
    return {
      title: '藏字方块，玩方块，认藏文',
      path: '/pages/index/index',
      imageUrl: this.data.imagePath || undefined
    };
  }
});

// 兼容辅助：圆角矩形路径
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
