// pages/game/game.js — 游戏页：配对消除
// P0 冲刺：连击系统 / 金色特殊方块 / 藏文发音 / 新手引导 / 15分钟埋点
// 体验优化：文化卡仅首次发现弹出（非阻塞、自动收起），重复匹配只出轻提示；
//           牌面尺寸全关卡统一（以 8 列为基准），盘面居中。
// PRD v4 视觉重构：四层物理层次（夜色背景 → 青金石蓝底盘 → 凹陷槽位 → 3D 凸起方块）、
//           冰霜/木箱障碍物、消除破碎成金粉与风马旗碎片。
var levelsData = require('../../data/levels');
var elements = require('../../data/elements');
var cardsData = require('../../data/cards');
var audio = require('../../utils/audio');
var icons = require('../../utils/icons');
var storage = require('../../utils/storage');
var tracker = require('../../utils/tracker');
var obstacles = require('../../utils/obstacles');

var GUIDE = [
  { title: '如何消除', text: '点击两张相同的藏文字母或文化图标，它们就会一起消失。' },
  { title: '听发音', text: '每消除成功一次，都会读出这个字的藏文发音——边玩边听，记得更牢。连击不断，声音还会越清亮。' },
  { title: '冰霜与木箱', text: '带 ❄ 的牌先碰不得，消除它旁边的牌即可解冻；藏式木箱上的金色数字是剩余耐久，消除它旁边的牌会一点点敲开它。金色 ✦ 是特殊方块，双倍积分。' }
];

// 统一牌面尺寸：以 8 列为基准（所有关卡牌一样大，只变数量）
var REF_COLS = 8;
var PAGE_PAD = 20;     // 页面左右留白（rpx）
var PANEL_PAD = 18;    // 底盘内边距（rpx）
var OUTLINE_PAD = 12;  // 凹槽内边距（rpx）
var AVAIL_W = 750 - PAGE_PAD * 2 - PANEL_PAD * 2 - OUTLINE_PAD * 2 - 6;
var CARD_AUTO_MS = 5200;
var TOAST_MS = 1700;

// 破碎粒子的六个方向 × 颜色（金粉 + 五色风马旗）
var BIT_SLOTS = ['d0 gold', 'd1 r', 'd2 g', 'd3 b', 'd4 y', 'd5 w'];

function findCard(id) {
  for (var k = 0; k < cardsData.length; k++) {
    if (cardsData[k].id === id) return cardsData[k];
  }
  return null;
}

// 颜色加深/提亮（用于卡片头图渐变与 3D 方块的高光/投影）
function shade(hex, f) {
  var n = parseInt(hex.slice(1), 16);
  var r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  var g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  var b = Math.min(255, Math.round((n & 255) * f));
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

// 3D 方块内联样式：顶部提亮 → 本色 → 底部加深，配 0 偏移投影与顶部内高光
function pieceStyle(color) {
  return 'background-image: linear-gradient(180deg, ' + shade(color, 1.42) + ' 0%, ' + color + ' 58%, ' + shade(color, 0.68) + ' 100%);' +
    ' box-shadow: 0 6rpx 0 ' + shade(color, 0.46) + ', 0 10rpx 18rpx rgba(0, 0, 0, 0.46), inset 0 3rpx 8rpx rgba(255, 255, 255, 0.42);';
}

Page({
  data: {
    level: 1,
    cols: 6,
    rows: 4,
    tiles: [],
    tileW: 73,           // 统一牌宽（rpx）
    tileH: 88,           // 统一牌高（rpx）
    glyphSize: 45,       // 藏文字号（rpx）
    boardW: 498,         // 盘面宽（rpx，随列数变化，居中）
    gap: 12,
    iconPaths: {},
    matchedPairs: 0,
    totalPairs: 0,
    showCard: false,
    card: null,
    cardColor: '#C0392B',
    cardColorDark: '#8F2B20',
    cardBarRun: false,   // 进度条动画开关（每次弹出重新触发）
    toastShow: false,
    toastIsIcon: false,
    toastGlyph: '',
    toastIcon: '',
    toastText: '',
    toastColor: '#C0392B',
    locked: false,       // 仅失配抖动期间锁定
    // 通关情绪反馈：粒子参数数组 + 层开关
    fxOn: false,
    fx: [],
    score: 0,
    combo: 0,
    comboFx: '',
    guideStep: 0,
    guide: GUIDE[0],
    bitSlots: BIT_SLOTS,   // 破碎粒子方向/颜色类名
    brokenFx: ''           // 破冰/破箱浮层文字
  },

  firstIndex: -1,
  pendingRemove: [],
  matchedCount: 0,
  comboVal: 0,
  goldenSeen: false,
  comboTimer: null,
  cardTimer: null,
  toastTimer: null,
  barTimer: null,
  voiceTimer: null,
  // 正确率统计（证书质量门槛用）：attempts = 配对尝试次数，misses = 失败次数
  attempts: 0,
  matches: 0,
  misses: 0,

  onLoad: function (query) {
    var level = parseInt(query.level, 10) || 1;
    var cfg = levelsData[level - 1];
    if (!cfg) {
      wx.redirectTo({ url: '/pages/index/index' });
      return;
    }
    var goldenId = cfg.elements[Math.floor(Math.random() * cfg.elements.length)][0];
    var tiles = this.buildBoard(cfg, goldenId);
    wx.setNavigationBarTitle({ title: '第 ' + level + ' 关' });

    // 正确率统计清零（本关重新计数）
    this.attempts = 0;
    this.matches = 0;
    this.misses = 0;

    // 统一牌面尺寸：tile 由 8 列基准算出，各关只变列数与行数
    // 间距取固定值（不随列数变化），保证每一关的牌大小完全一致
    var gap = 8;
    var tileW = Math.floor((AVAIL_W - gap * (REF_COLS - 1)) / REF_COLS);
    var tileH = Math.round(tileW * 1.2);
    var boardW = cfg.cols * tileW + (cfg.cols - 1) * gap;

    this.setData({
      level: level,
      cols: cfg.cols,
      rows: cfg.rows,
      tiles: tiles,
      totalPairs: tiles.length / 2,
      tileW: tileW,
      tileH: tileH,
      glyphSize: Math.round(tileW * 0.62),
      boardW: boardW,
      gap: gap
    });
    tracker.track('first_letter_seen');
    if (!storage.isOnboardDone()) {
      this.setData({ guideStep: 1, guide: GUIDE[0] });
    }
    var that = this;
    icons.renderIcons(cfg.elements.map(function (e) { return e[0]; }))
      .then(function (map) {
        if (Object.keys(map).length) {
          that.setData({ iconPaths: map });
        }
      });
  },

  guideNext: function () {
    var s = this.data.guideStep + 1;
    if (s > GUIDE.length) {
      storage.setOnboardDone();
      this.setData({ guideStep: 0 });
    } else {
      this.setData({ guideStep: s, guide: GUIDE[s - 1] });
    }
  },

  buildBoard: function (cfg, goldenId) {
    var pool = [];
    cfg.elements.forEach(function (pair) {
      for (var k = 0; k < pair[1]; k++) pool.push(pair[0]);
    });
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
    var tiles = pool.map(function (id, idx) {
      var el = elements[id];
      return {
        uid: idx,
        id: id,
        type: el.type,
        tibetan: el.tibetan || '',
        color: el.color,
        fallbackText: el.char || '',
        golden: id === goldenId,
        pieceStyle: pieceStyle(el.color),
        frost: false,
        crate: 0,
        blocked: false,
        shatter: false,
        state: 'idle' // idle | selected | removing | removed | shake
      };
    });
    // 障碍物：确定性布点（冰霜 / 藏式木箱），保证每种元素至少留 2 张可点的牌
    obstacles.planOverlays(cfg, pool).forEach(function (o) {
      var t = tiles[o.index];
      if (!t) return;
      if (o.kind === 'frost') t.frost = true;
      else t.crate = o.hp;
      t.blocked = true;
    });
    return tiles;
  },

  onTapTile: function (e) {
    if (this.data.locked) return;
    var idx = e.currentTarget.dataset.index;
    var tile = this.data.tiles[idx];
    if (!tile || tile.state === 'removed' || tile.state === 'removing') return;

    // 障碍物：冰霜/木箱罩住的牌不能直接点（不计入正确率、不惩罚）
    if (obstacles.isBlocked(tile)) {
      this.showBlockedTip(tile);
      return;
    }

    if (this.firstIndex === idx) {
      this.firstIndex = -1;
      this.setData({ ['tiles[' + idx + '].state']: 'idle' });
      return;
    }

    audio.tap();

    if (tile.golden && !this.goldenSeen) {
      this.goldenSeen = true;
      tracker.track('first_special');
    }

    if (this.firstIndex === -1) {
      this.firstIndex = idx;
      this.setData({ ['tiles[' + idx + '].state']: 'selected' });
      return;
    }

    var first = this.firstIndex;
    var second = idx;
    this.firstIndex = -1;
    var a = this.data.tiles[first];
    var b = this.data.tiles[second];

    // 一次配对尝试（成功或失败都算）——正确率 = matches / attempts
    this.attempts++;

    if (a.id === b.id) {
      this.matches++;
      this.handleMatch(first, second);
    } else {
      this.misses++;
      this.handleMismatch(first, second);
    }
  },

  // 配对成功：消除立即生效、不锁盘面；首次发现弹完整文化卡，重复只出轻提示
  handleMatch: function (i, j) {
    var that = this;
    this.matchedCount++;
    tracker.track('first_match');

    this.comboVal++;
    if (this.comboVal >= 2) tracker.track('first_combo');
    storage.recordCombo(this.comboVal);

    var golden = this.data.tiles[i].golden;
    var gain = 10 * (golden ? 2 : 1) + 2 * (this.comboVal - 1);

    this.pendingRemove = [i, j];

    this.setData({
      ['tiles[' + i + '].state']: 'removing',
      ['tiles[' + i + '].shatter']: true,
      ['tiles[' + j + '].state']: 'removing',
      ['tiles[' + j + '].shatter']: true,
      matchedPairs: this.matchedCount,
      score: this.data.score + gain,
      combo: this.comboVal,
      comboFx: this.comboVal >= 2 ? ('连击 ×' + this.comboVal) : ''
    });

    // 轻微震动 + 铜铃（PRD 3.2：消除=铃音 + 机身轻震）
    try {
      if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    } catch (err) { /* 部分机型不支持，忽略 */ }

    // 障碍物结算：相邻冰霜解冻、相邻木箱扣耐久（破开后在原格浮字提示）
    var settled = obstacles.resolveMatch(this.data.tiles, [i, j], this.data.cols, this.data.rows);
    if (settled.changed.length) {
      var patch = {};
      var brokeLabels = [];
      settled.changed.forEach(function (c) {
        if (c.kind === 'frost') {
          patch['tiles[' + c.index + '].frost'] = false;
          patch['tiles[' + c.index + '].blocked'] = false;
        } else {
          patch['tiles[' + c.index + '].crate'] = c.hp;
          patch['tiles[' + c.index + '].blocked'] = c.hp > 0;
        }
        if (c.broken) brokeLabels.push(c.kind === 'frost' ? '破冰！' : '木箱破开！');
      });
      this.setData(patch);
      if (brokeLabels.length) this.showBreakFx(brokeLabels[0]);
      tracker.track('obstacle_broken');
    }
    if (this.comboTimer) clearTimeout(this.comboTimer);
    this.comboTimer = setTimeout(function () {
      that.setData({ comboFx: '' });
    }, 1400);

    if (this.comboVal >= 2) {
      audio.combo(this.comboVal);
    } else {
      audio.match();
    }

    var id = this.data.tiles[i].id;
    var firstTime = !storage.isCardSeen(id);
    if (firstTime) storage.markCardSeen(id);

    // 每次配对成功都朗读该元素发音（学习闭环：看得见 → 听得见）
    // 延后 300ms 让配对音效先响，避免人声与铃声糊在一起；连击时新发音打断旧发音
    if (this.voiceTimer) clearTimeout(this.voiceTimer);
    this.voiceTimer = setTimeout(function () {
      if (audio.pronounce(id)) tracker.track('first_pronunciation');
    }, 300);

    setTimeout(function () { that.finalizeMatch(); }, 240);
    setTimeout(function () {
      // 通关瞬间不再弹卡/提示，直接进结算（结算页会展示本关收集的文化卡）
      if (that.matchedCount === that.data.totalPairs) return;
      if (firstTime) that.showCard(id); else that.showToastTip(id);
    }, 320);
  },

  // 消除落定：牌面转 removed；最后一对则进入结算
  finalizeMatch: function () {
    var that = this;
    var pr = this.pendingRemove;
    this.pendingRemove = [];
    if (pr.length === 2) {
      this.setData({
        ['tiles[' + pr[0] + '].state']: 'removed',
        ['tiles[' + pr[0] + '].shatter']: false,
        ['tiles[' + pr[1] + '].state']: 'removed',
        ['tiles[' + pr[1] + '].shatter']: false
      });
    }
    if (this.matchedCount === this.data.totalPairs) {
      this.dismissCard();
      this.hideToast();
      audio.win();
      this.celebrate();
      // 藏语语音延后：先让铜铃与粒子起势，再读 བཀྲ་ཤིས་བདེ་ལེགས
      this.tashiTimer = setTimeout(function () { audio.tashiDelek(); }, 350);
      setTimeout(function () {
        wx.redirectTo({
          url: '/pages/result/result?level=' + that.data.level +
            '&pairs=' + that.data.totalPairs +
            '&cards=' + that.collectedIds().join(',') +
            '&score=' + that.data.score +
            '&combo=' + that.comboVal +
            // 正确率（证书质量门槛）：attempts = 尝试次数，misses = 失败次数
            '&att=' + that.attempts +
            '&miss=' + that.misses
        });
      }, 1500);
    }
  },

  // ---- 通关情绪反馈（PRD 4.2）：金色莲花 + 风马旗碎片粒子 + 雪山金光 + 震动 ----
  // 纯 CSS 动画 + wx.vibrateShort，零依赖；粒子由 JS 生成随机参数后交 WXSS 播放
  celebrate: function () {
    var that = this;
    var flagColors = ['#C0392B', '#1E8449', '#2471A3', '#B7950B', '#FFFFFF'];
    var fx = [];
    for (var i = 0; i < 18; i++) {
      var isFlag = i % 3 === 2;   // 每 3 片有 1 片风马旗
      fx.push({
        left: (8 + Math.random() * 84) + '%',
        top: (40 + Math.random() * 42) + '%',
        size: (14 + Math.floor(Math.random() * 3) * 6) + 'rpx',
        color: isFlag ? flagColors[i % 5] : (i % 2 ? '#B7950B' : '#C0392B'),
        kind: isFlag ? 'flag' : 'lotus',
        alt: i % 2 ? ' alt' : '',
        delay: Math.floor(Math.random() * 260)
      });
    }
    this.setData({ fx: fx, fxOn: true });
    try {
      if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    } catch (e) { /* 部分机型不支持，忽略 */ }
    if (this.fxTimer) clearTimeout(this.fxTimer);
    this.fxTimer = setTimeout(function () {
      that.setData({ fxOn: false, fx: [] });
    }, 1700);
    tracker.track('first_celebration');
  },

  // 配对失败：抖动 + 轻声提示，无惩罚（连击清零）——唯一需要短暂锁盘面的场景
  handleMismatch: function (i, j) {
    var that = this;
    audio.mismatch();
    this.comboVal = 0;
    this.setData({
      ['tiles[' + i + '].state']: 'shake',
      ['tiles[' + j + '].state']: 'shake',
      combo: 0,
      comboFx: '',
      locked: true
    });
    setTimeout(function () {
      that.setData({
        ['tiles[' + i + '].state']: 'idle',
        ['tiles[' + j + '].state']: 'idle',
        locked: false
      });
    }, 450);
  },

  // ---------- 文化卡（首次发现：非阻塞 + 自动收起） ----------
  showCard: function (id) {
    var that = this;
    var card = findCard(id);
    if (!card) return;
    this.hideToast();
    this.setData({
      showCard: true,
      card: card,
      cardColor: elements[id].color,
      cardColorDark: shade(elements[id].color, 0.76),
      cardBarRun: false
    });
    // 重置进度条动画（下一拍重新触发，保证每次弹出都从头走）
    if (this.barTimer) clearTimeout(this.barTimer);
    this.barTimer = setTimeout(function () {
      that.setData({ cardBarRun: true });
    }, 40);
    if (this.cardTimer) clearTimeout(this.cardTimer);
    this.cardTimer = setTimeout(function () {
      that.setData({ showCard: false });
    }, CARD_AUTO_MS);
  },

  dismissCard: function () {
    if (this.cardTimer) { clearTimeout(this.cardTimer); this.cardTimer = null; }
    if (this.barTimer) { clearTimeout(this.barTimer); this.barTimer = null; }
    this.setData({ showCard: false, cardBarRun: false });
  },

  // ---------- 重复匹配轻提示（非阻塞） ----------
  showToastTip: function (id) {
    var that = this;
    var card = findCard(id);
    if (!card) return;
    this.setData({
      toastShow: true,
      toastIsIcon: card.type === 'icon',
      toastGlyph: card.type === 'icon' ? '' : card.title,
      toastIcon: this.data.iconPaths[id] || '',
      toastText: (card.subtitle || card.title) + ' · 已收藏',
      toastColor: elements[id].color
    });
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(function () {
      that.setData({ toastShow: false });
    }, TOAST_MS);
  },

  hideToast: function () {
    if (this.toastTimer) { clearTimeout(this.toastTimer); this.toastTimer = null; }
    if (this.data.toastShow) this.setData({ toastShow: false });
  },

  // ---------- 障碍物提示（冰霜/木箱，非阻塞，不计入正确率） ----------
  showBlockedTip: function (tile) {
    var that = this;
    this.setData({
      ['tiles[' + this.data.tiles.indexOf(tile) + '].state']: 'shake',
      toastShow: true,
      toastIsIcon: false,
      toastGlyph: tile.frost ? '❄' : '📦',
      toastIcon: '',
      toastText: tile.frost ? '这块被冰霜罩住了 · 先消除旁边的牌' : ('藏式木箱还剩 ' + tile.crate + ' 次 · 消除旁边的牌来敲开'),
      toastColor: tile.frost ? '#2471A3' : '#8A5A2B'
    });
    var idx = this.data.tiles.indexOf(tile);
    setTimeout(function () {
      that.setData({ ['tiles[' + idx + '].state']: 'idle' });
    }, 420);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(function () {
      that.setData({ toastShow: false });
    }, TOAST_MS);
  },

  // 破冰/破箱浮字（复用 combo-fx 的观感，独立节点避免互相打断）
  showBreakFx: function (label) {
    var that = this;
    this.setData({ brokenFx: label });
    if (this.breakTimer) clearTimeout(this.breakTimer);
    this.breakTimer = setTimeout(function () { that.setData({ brokenFx: '' }); }, 1100);
  },

  // 文化卡喇叭：播放该元素的藏文发音（PRD 4.3「点击播放」）
  speakCard: function () {
    if (!this.data.card) return;
    if (audio.pronounce(this.data.card.id)) tracker.track('card_pronounce');
  },

  collectedIds: function () {
    var seen = {};
    var out = [];
    this.data.tiles.forEach(function (t) {
      if (t.state !== 'removed') return;
      if (!seen[t.id]) { seen[t.id] = true; out.push(t.id); }
    });
    return out;
  },

  noop: function () {},

  onUnload: function () {
    if (this.cardTimer) clearTimeout(this.cardTimer);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    if (this.comboTimer) clearTimeout(this.comboTimer);
    if (this.barTimer) clearTimeout(this.barTimer);
    if (this.voiceTimer) clearTimeout(this.voiceTimer);
    if (this.fxTimer) clearTimeout(this.fxTimer);
    if (this.tashiTimer) clearTimeout(this.tashiTimer);
    if (this.breakTimer) clearTimeout(this.breakTimer);
  }
});
