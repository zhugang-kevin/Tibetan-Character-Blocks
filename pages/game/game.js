// pages/game/game.js — 游戏页：配对消除
var levelsData = require('../../data/levels');
var elements = require('../../data/elements');
var cardsData = require('../../data/cards');
var audio = require('../../utils/audio');
var icons = require('../../utils/icons');

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
    locked: false        // 弹窗/动画期间锁定点击
  },

  firstIndex: -1,       // 当前已选中的第一张牌
  pendingRemove: [],    // 待移除的两张牌下标
  matchedCount: 0,      // 已消除对数（逻辑值）

  onLoad: function (query) {
    var level = parseInt(query.level, 10) || 1;
    var cfg = levelsData[level - 1];
    if (!cfg) {
      wx.redirectTo({ url: '/pages/index/index' });
      return;
    }
    var tiles = this.buildBoard(cfg);
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
    var that = this;
    icons.renderIcons(cfg.elements.map(function (e) { return e[0]; }))
      .then(function (map) {
        if (Object.keys(map).length) {
          that.setData({ iconPaths: map });
        }
      });
  },

  // 生成打乱后的牌面
  buildBoard: function (cfg) {
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

  // 配对成功：缩小淡出 + 铜铃声 + 弹文化卡
  handleMatch: function (i, j) {
    var that = this;
    this.matchedCount++;
    this.setData({
      ['tiles[' + i + '].state']: 'removing',
      ['tiles[' + j + '].state']: 'removing',
      matchedPairs: this.matchedCount,
      locked: true
    });
    audio.match();
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

  // 配对失败：抖动 + 轻声提示，无惩罚
  handleMismatch: function (i, j) {
    var that = this;
    audio.mismatch();
    this.setData({
      ['tiles[' + i + '].state']: 'shake',
      ['tiles[' + j + '].state']: 'shake',
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
            '&cards=' + that.collectedIds().join(',')
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
