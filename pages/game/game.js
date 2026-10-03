// pages/game/game.js — 游戏页：配对消除
// P0 冲刺：连击系统 / 金色特殊方块 / 藏文发音 / 新手引导 / 15分钟埋点
var levelsData = require('../../data/levels');
var elements = require('../../data/elements');
var cardsData = require('../../data/cards');
var audio = require('../../utils/audio');
var icons = require('../../utils/icons');
var storage = require('../../utils/storage');
var tracker = require('../../utils/tracker');

// 新手引导 3 步文案（P0：15分钟体验表前置引导）
var GUIDE = [
  { title: '如何消除', text: '点击两张相同的藏文字母或文化图标，它们就会一起消失。' },
  { title: '连击', text: '连续不断错地消除可以触发连击 ×N，分数更高，声音更亮。' },
  { title: '文化卡', text: '每次消除会弹出文化卡，牌面上的金色 ✦ 字母是特殊方块，双倍积分。' }
];

Page({
  data: {
    level: 1,
    cols: 6,
    rows: 4,
    tiles: [],
    glyphSize: 70,       // 藏文字母字号（rpx），随列数自适应
    iconPaths: {},       // iconId -> 临时图片路径
    matchedPairs: 0,
    totalPairs: 0,
    showCard: false,
    card: null,
    cardColor: '#C0392B',
    locked: false,       // 弹窗/动画期间锁定点击
    score: 0,            // 本局积分（金色×2，连击加成）
    combo: 0,            // 当前连击数
    comboFx: '',         // 连击浮层文案（×2 起显示）
    guideStep: 0,        // 新手引导步骤 0=关闭 1-3
    guide: GUIDE[0]
  },

  firstIndex: -1,       // 当前已选中的第一张牌
  pendingRemove: [],    // 待移除的两张牌下标
  matchedCount: 0,      // 已消除对数（逻辑值）
  comboVal: 0,          // 连击（逻辑值，与 data.combo 同步）
  goldenSeen: false,    // 是否已见过特殊方块（埋点幂等）
  comboTimer: null,

  onLoad: function (query) {
    var level = parseInt(query.level, 10) || 1;
    var cfg = levelsData[level - 1];
    if (!cfg) {
      wx.redirectTo({ url: '/pages/index/index' });
      return;
    }
    // 特殊方块：每局随机指定 1 种元素为金色（成对出现，消除双倍积分）
    var goldenId = cfg.elements[Math.floor(Math.random() * cfg.elements.length)][0];
    var tiles = this.buildBoard(cfg, goldenId);
    wx.setNavigationBarTitle({ title: '第 ' + level + ' 关' });
    this.setData({
      level: level,
      cols: cfg.cols,
      rows: cfg.rows,
      tiles: tiles,
      totalPairs: tiles.length / 2,
      // 盘面宽约 686rpx，字号约为格子宽的 60%
      glyphSize: Math.round(686 / cfg.cols * 0.6)
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

  // 新手引导：下一步 / 完成
  guideNext: function () {
    var s = this.data.guideStep + 1;
    if (s > GUIDE.length) {
      storage.setOnboardDone();
      this.setData({ guideStep: 0 });
    } else {
      this.setData({ guideStep: s, guide: GUIDE[s - 1] });
    }
  },

  // 生成打乱后的牌面
  buildBoard: function (cfg, goldenId) {
    var pool = [];
    cfg.elements.forEach(function (pair) {
      for (var k = 0; k < pair[1]; k++) pool.push(pair[0]);
    });
    // Fisher-Yates 洗牌
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
    return pool.map(function (id, idx) {
      var el = elements[id];
      return {
        uid: idx,
        id: id,
        type: el.type,
        tibetan: el.tibetan || '',
        color: el.color,
        fallbackText: el.char || '',
        golden: id === goldenId,   // 金色特殊方块（同元素全部实例）
        state: 'idle' // idle | selected | removing | removed | shake
      };
    });
  },

  onTapTile: function (e) {
    if (this.data.locked) return;
    var idx = e.currentTarget.dataset.index;
    var tile = this.data.tiles[idx];
    if (!tile || tile.state === 'removed' || tile.state === 'removing') return;

    // 再次点击已选中的牌 → 取消选中
    if (this.firstIndex === idx) {
      this.firstIndex = -1;
      this.setData({ ['tiles[' + idx + '].state']: 'idle' });
      return;
    }

    audio.tap();

    // 埋点：第一次遇到特殊方块 / 第一次听到藏文发音
    if (tile.golden && !this.goldenSeen) {
      this.goldenSeen = true;
      tracker.track('first_special');
    }
    if (tile.type === 'letter' && this.firstIndex === -1) {
      if (audio.pronounce(tile.id)) tracker.track('first_pronunciation');
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

    if (a.id === b.id) {
      this.handleMatch(first, second);
    } else {
      this.handleMismatch(first, second);
    }
  },

  // 配对成功：缩小淡出 + 铜铃声（连击变调）+ 弹文化卡
  handleMatch: function (i, j) {
    var that = this;
    this.matchedCount++;
    tracker.track('first_match');

    // 连击：连续消除递增，失误清零
    this.comboVal++;
    if (this.comboVal >= 2) tracker.track('first_combo');
    storage.recordCombo(this.comboVal);

    // 积分：基础 10 分；金色特殊方块 ×2；连击每级 +2
    var golden = this.data.tiles[i].golden;
    var gain = 10 * (golden ? 2 : 1) + 2 * (this.comboVal - 1);
    var score = this.data.score + gain;

    this.setData({
      ['tiles[' + i + '].state']: 'removing',
      ['tiles[' + j + '].state']: 'removing',
      matchedPairs: this.matchedCount,
      score: score,
      combo: this.comboVal,
      comboFx: this.comboVal >= 2 ? ('连击 ×' + this.comboVal) : '',
      locked: true
    });
    // 连击浮层 1.4s 后淡出
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
    var card = null;
    for (var k = 0; k < cardsData.length; k++) {
      if (cardsData[k].id === id) { card = cardsData[k]; break; }
    }
    setTimeout(function () {
      that.pendingRemove = [i, j];
      that.setData({
        showCard: true,
        card: card,
        cardColor: elements[id].color
      });
    }, 300);
  },

  // 配对失败：抖动 + 轻声提示，无惩罚（连击清零）
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

  // 文化卡「知道了」
  onCloseCard: function () {
    var that = this;
    var pr = this.pendingRemove;
    this.setData({
      showCard: false,
      ['tiles[' + pr[0] + '].state']: 'removed',
      ['tiles[' + pr[1] + '].state']: 'removed',
      locked: false
    });
    this.pendingRemove = [];

    if (this.matchedCount === this.data.totalPairs) {
      // 通关：铜铃 + 法号音，稍作停顿进入结算页
      audio.win();
      setTimeout(function () {
        wx.redirectTo({
          url: '/pages/result/result?level=' + that.data.level +
            '&pairs=' + that.data.totalPairs +
            '&cards=' + that.collectedIds().join(',') +
            '&score=' + that.data.score +
            '&combo=' + that.comboVal
        });
      }, 900);
    }
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

  onUnload: function () {}
});
