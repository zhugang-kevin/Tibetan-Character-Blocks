// pages/result/result.js — 结算页 + 祝福卡生成
var cardsData = require('../../data/cards');
var elements = require('../../data/elements');
var storage = require('../../utils/storage');
var tracker = require('../../utils/tracker');
var tibText = require('../../utils/tibetan-text');
var certificate = require('../../utils/certificate');
var audio = require('../../utils/audio');
var collect = require('../../utils/collect');
// 用户隐私保护指引（utils/privacy.js）：保存相册是受保护接口，必须先过授权关卡
var privacy = require('../../utils/privacy');

// 「藏文可以组合」预告的数据源（纯展示；由页面注入 utils/collect.js 的纯判据函数，
// 这样「哪一关讲解拼合」只写在数据文件里，页面不内联关卡号）
var comboData = require('../../data/combo');

// 秘境揭图（D31）：通关即整幅揭晓，结算页是揭晓的高光时刻
var revealsData = require('../../data/reveals');

// 藏地密码：完成即解锁一则藏地小知识（解锁状态 = completedLevels，不新增存储字段）
var secretsData = require('../../data/secrets');

// 祝福卡（750×1050）中段文案的基线位置。
// ⚠️ 必须留在底部「Logo（y=855）」与「小程序码（y=850）」之**上**：
//    中文按 1em/字估算，一长行会横跨到两侧的 Logo / 小程序码上（上一版就是这样重叠的）。
//    H5 镜像（preview/template.html）用同一组数值，validate 第 24 节机械校验「不得落进底部区」。
var POSTER_IDENTITY_Y1 = 660;
var POSTER_IDENTITY_Y2 = 702;
var POSTER_SLOGAN_Y = 780;

// 收藏进度槽位的固定顺序（字母在前、文化元素在后），与 data/elements.js 的声明顺序一致。
// 结算页与体验版镜像共用同一份构造口径。
var CARD_ORDER = Object.keys(elements).map(function (id) {
  var el = elements[id];
  return {
    id: id,
    label: el.type === 'letter' ? el.tibetan : (el.char || ''),
    isLetter: el.type === 'letter',
    color: el.color
  };
});

Page({
  data: {
    level: 1,
    pairs: 0,
    score: 0,
    combo: 0,
    collected: [],       // 本课收集到的文化卡（去重）
    isFinal: false,      // 是否第10关
    newStamp: false,     // 本局是否新获得护照印记
    showNameModal: false,
    nameInput: '',
    generating: false,
    imagePath: '',       // 祝福卡临时图片路径
    // ---- 前 60 秒钩子：结算决策点上的进度锚 ----
    totalLevels: 10,     // 关卡总数
    journeyDay: 1,       // 你是第几天打开它
    cardSlots: [],       // 12 个收藏槽位（未收藏的只画「?」，不剧透名字）
    cardGot: 0,
    cardTotal: 0,
    cardLeft: 0,
    cardPercent: 0,
    stampCount: 0,       // 已获印章数（此前写死为 1）
    stampTotal: 7,       // 规划中的印章总数（七地市）
    // ---- 成长阶梯 · 证书 ----
    accuracy: 100,       // 本课正确率（%）
    clean: true,         // 本关是否全程无失误
    stageName: '',       // 当前所属阶段名
    stageNo: 0,          // 当前阶段序号
    stageTo: 0,          // 本阶段最后一关
    cert: null,          // 本关新颁发 / 升级的证书
    certNew: false,
    certUpgraded: false,
    certTitle: '',       // 证书横幅文案（新得 / 升级 / 本阶段证书）
    ownedCerts: 0,       // 已获得证书总数
    skillHint: '',       // 距更高等级证书还差什么
    // ---- 阶段完结后的「下一步」预告（D27：12 阶段路线图的下一站） ----
    nextStageNo: 0,      // 下一阶段序号（0 = 没有下一阶段）
    nextStageName: '',   // 下一阶段名（取自 data/stages.js）
    nextStageGoal: '',   // 下一阶段学习目标（取自 data/stages.js）
    nextStageRange: '',  // 下一阶段关卡区间，如 "11-30"
    nextStageOpen: false,// 是否已开放（false = 内容制作中）
    // ---- 「藏文可以组合」拼合预告 ----
    // 只在第 2 关的结算页出现：该关通关即认全 ཀ ཁ ག ང，此刻讲拼合最有落点。
    // 纯展示，不参与任何消除判定；文案与关卡号都取自 data/combo.js。
    comboTease: null,
    // ---- PRD v4 留存系统：星级 / 积分 / 唐卡碎片 ----
    stars: 0,            // 本关星级（1-3）
    starList: [],        // 三颗星的亮/灭（供 wxml 渲染）
    starsImproved: false,// 是否刷新了该关的最优星数
    pointsGained: 0,     // 本课学习得分
    fragmentNew: 0,      // 本关新得的唐卡碎片编号（1-9，0 = 无）
    fragmentCount: 0,    // 已收集碎片总数
    fragmentDone: false, // 是否已拼成一幅完整唐卡
    // ---- 秘境揭图（D31）：本关揭晓的图 + 图鉴进度 ----
    reveal: null,        // { name, tibetan, roman, img, desc }
    revealGot: 0,        // 已揭晓图数（= 已完成关卡数，不新增存储字段）
    revealTotal: 10,
    // ---- 藏地密码：本关解锁的一则小知识 + 图鉴进度 ----
    secret: null,        // { tag, title, text }
    secretGot: 0,
    secretTotal: 10
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

    // PRD v4 留存：星级（按正确率与连击，只增不减）+ 积分 + 唐卡碎片掉落
    var stars = collect.rateStars(att > 0 ? att : pairs, miss, combo);
    var starRes = storage.recordStars(level, stars);
    storage.addPoints(score);
    var fragRes = storage.addFragment(collect.nextFragment(storage.getFragments()));
    var fragList = storage.getFragments();
    if (fragRes.added) tracker.track('first_fragment');

    var ids = (query.cards || '').split(',').filter(Boolean);
    if (ids.length) tracker.track('first_card');

    // 前 60 秒钩子：在「要不要再来一关」的决策点上，把收藏进度摆出来。
    // 此前这份进度只在文化护照页可见，用户要先跳一层才看得到。
    var cp = collect.cardProgress(CARD_ORDER, storage.getSeenCards());
    var openLog = storage.getOpenLog();

    // D27：本阶段完结（有证书）时，把 12 阶段路线图的下一站摆到同一个决策点上。
    // 文案全部来自 data/stages.js，页面不写死阶段名——内容库扩充后自动生效。
    var stageNo = certRes.stage ? certRes.stage.stage : 0;
    var ns = certificate.nextStage(stageNo);

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
      stageNo: stageNo,
      stageName: certRes.stage ? certRes.stage.name : '',
      stageTo: certRes.stage ? certRes.stage.to : 0,
      cert: certRes.cert,
      certNew: certRes.isNew,
      certUpgraded: certRes.upgraded,
      certTitle: certRes.cert
        ? (certRes.isNew ? '获得藏文成长证书' : (certRes.upgraded ? '证书升级' : '本阶段证书'))
        : '',
      ownedCerts: certificate.ownedCount(),
      skillHint: certRes.skill ? certRes.skill.text : '',
      // D27：下一阶段预告（仅在 cert 存在时上屏，见 result.wxml）
      nextStageNo: ns ? ns.stage : 0,
      nextStageName: ns ? ns.name : '',
      nextStageGoal: ns ? ns.goal : '',
      nextStageRange: ns ? (ns.from + '-' + ns.to) : '',
      nextStageOpen: ns ? !!ns.open : false,
      // 「藏文可以组合」预告：只在第 2 关（关卡号来自数据文件），页面不内联
      comboTease: collect.comboTease(level, comboData),
      // PRD v4：星级 / 积分 / 唐卡碎片
      stars: starRes.stars,
      starList: [1, 2, 3].map(function (i) { return starRes.stars >= i ? 'on' : 'off'; }),
      starsImproved: starRes.improved,
      pointsGained: score,
      fragmentNew: fragRes.added ? storage.getFragments().slice(-1)[0] + 1 : 0,
      fragmentCount: fragList.length,
      fragmentDone: collect.fragmentComplete(fragList),
      // 秘境揭图（D31）：completeLevel 已落库，此处揭晓本关的图 + 报图鉴进度
      reveal: (function () {
        var rv = revealsData[level - 1];
        return rv ? { name: rv.name, tibetan: rv.tibetan, roman: rv.roman, img: rv.img, desc: rv.desc } : null;
      })(),
      revealGot: storage.getProgress().completedLevels.filter(function (n) { return n >= 1 && n <= 10; }).length,
      // 藏地密码：本关解锁一则小知识（completeLevel 已落库，解锁判定与揭示图鉴同源）
      secret: (function () {
        var s = collect.secretOf(secretsData, level);
        return s ? { tag: s.tag, title: s.title, text: s.text } : null;
      })(),
      secretGot: collect.secretProgress(secretsData, storage.getProgress().completedLevels).got,
      secretTotal: secretsData.length,
      // 前 60 秒钩子：关卡锚 + 旅程天数 + 收藏进度
      totalLevels: storage.MAX_LEVEL,
      journeyDay: openLog.total || 1,
      cardSlots: cp.slots,
      cardGot: cp.got,
      cardTotal: cp.total,
      cardLeft: cp.left,
      cardPercent: cp.total ? Math.round(cp.got * 100 / cp.total) : 0,
      stampCount: storage.getStampCount()
    });

    // 舒缓祝福语（PRD 4.1）：画卷展开时读一句藏语祝福，缺失录音静默回退。
    // 定时器必须可取消：用户在 650ms 内返回时不能再出声（onUnload 清理），
    // 录音就绪后这句话有 2-3 秒，离开页面也要立刻停（onUnload / onHide 停语音）。
    var that = this;
    this.blessTimer = setTimeout(function () { audio.blessing(); }, 650);
  },

  // 离开结算页：撤掉未播放的定时器 + 立刻停掉正在播的祝福语音。
  // 语音通道是全局单声道（utils/audio.js 的 activeVoice），不清理会播到别的页面去。
  onUnload: function () {
    if (this.blessTimer) { clearTimeout(this.blessTimer); this.blessTimer = null; }
    audio.stopVoice();
  },

  // 切到后台（锁屏 / 离开小程序）：同样不该继续播
  onHide: function () {
    if (this.blessTimer) { clearTimeout(this.blessTimer); this.blessTimer = null; }
    audio.stopVoice();
  },

  // 藏地密码「听讲解」：播放预生成的中文讲解（audio/voice/secret_NN.mp3，与当前关卡同号）
  speakSecret: function () {
    var n = parseInt(this.data.level, 10) || 0;
    if (n < 1 || n > 10) return;
    var name = 'secret_' + (n < 10 ? '0' + n : '' + n);
    if (audio.speak(name)) tracker.track('secret_pronounce');
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

    // 文化身份两行文案：全部来自真实进度（绝不写死数字，见 utils/collect.js#shareIdentity）
    var seenAll = storage.getSeenCards();
    var letterTotal = 0;
    Object.keys(elements).forEach(function (id) {
      if (elements[id] && elements[id].type === 'letter') letterTotal++;
    });
    var gotLetters = 0;
    seenAll.forEach(function (id) {
      if (elements[id] && elements[id].type === 'letter') gotLetters++;
    });
    var identity = collect.shareIdentity({
      letters: gotLetters,
      letterTotal: letterTotal,
      cards: seenAll.length,
      cardTotal: cardsData.length,
      stamps: storage.getStampCount(),
      stampTotal: this.data.stampTotal
    });

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
        tibText.drawTibetanWrapped(ctx, 'བཀྲ་ཤིས་བདེ་ལེགས་', W / 2, 240, W - 160, 130);
      } else if (blessImgs.tashi) {
        ctx.drawImage(blessImgs.tashi, W / 2 - 300, 150, 600, 197);
      } else {
        ctx.font = '500 92px "Noto Serif Tibetan", "Microsoft Himalaya", serif';
        tibText.drawTibetanWrapped(ctx, 'བཀྲ་ཤིས་བདེ་ལེགས་', W / 2, 240, W - 160, 130);
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

      // 文化身份：分享出去的不是优惠券，是真实进度（数字全部来自 storage）
      ctx.font = '600 30px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fillText(identity.line1, W / 2, POSTER_IDENTITY_Y1);
      if (identity.line2) {
        ctx.font = '400 26px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(identity.line2, W / 2, POSTER_IDENTITY_Y2);
      }

      // 品牌 slogan
      ctx.font = '700 34px sans-serif';
      ctx.fillStyle = '#FFF3D6';
      ctx.fillText('认藏文，从方块开始', W / 2, POSTER_SLOGAN_Y);

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

  // 保存到相册（受保护接口：先走 utils/privacy.js 的统一前置，同意后立即继续保存）
  saveToAlbum: function () {
    var that = this;
    if (!this.data.imagePath) return;
    privacy.ensurePrivacy(function (ok) {
      if (!ok) return;                     // 用户未同意：提示已在 ensurePrivacy 内给出
      wx.saveImageToPhotosAlbum({
        filePath: that.data.imagePath,
        success: function () {
          wx.showToast({ title: '已保存到相册', icon: 'success' });
        },
        fail: function (e) {
          // 隐私未同意 / 相册权限未开由 privacy 模块给正确指引；其余按原逻辑兜底
          if (privacy.explainSaveFailure(e)) return;
          wx.showToast({ title: '保存失败，请再试一次', icon: 'none' });
        }
      });
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
      title: '藏字方块，认藏文，从方块开始',
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
