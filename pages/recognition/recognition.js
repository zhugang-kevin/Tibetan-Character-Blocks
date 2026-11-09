// pages/recognition/recognition.js — Q1 无提示识认测验（D148）
//
// ## 这个页面为什么长这样
//   Q1 的原问题是「90 秒认出」没有可测口径，颜色配对成功不能算识认。
//   所以这里**故意什么都不给**：
//     · 只显示一个藏文字母，四个罗马音选项
//     · 不显示颜色、不显示配对、**不播发音**、没有提示按钮
//   玩家点完 30 题，用 `utils/recognition.js`（与门禁同一份）算分。
//
// ## 结果怎么用
//   个人结果只说明「这一次」；平台达标率要 **n ≥ 30** 才报（D148）。
//   事件 `recognition_end` 会进 /telemetry，服务端可直接聚合。
//
// ## 可测性
//   `?seed=N` 可复现题序（测试用）；不带 seed 用时间生成。

var learning = require('../../data/learning');
var cardsData = require('../../data/cards');
var R = require('../../utils/recognition.js');
var telemetry = require('../../utils/telemetry.js');

function seededRng(seed) {
  var s = (seed >>> 0) || 1;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function shuffle(arr, rng) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(rng() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function romanMap() {
  var map = {};
  (cardsData || []).forEach(function (c) {
    if (!c || c.type !== 'letter' || !c.tibetan) return;
    var m = String(c.subtitle || '').split('·')[0].trim();
    if (m) map[c.tibetan] = m;
  });
  return map;
}

Page({
  data: {
    phase: 'intro',          // intro | quiz | result
    idx: 0,
    total: R.ITEMS,
    letter: '',
    options: [],
    result: null,
    rule: '30 题 · 四选一 · 不显示颜色 / 不播发音 / 没有提示',
    note: '这不是配对练习：没有任何提示，选中你认得的读音。'
  },

  onLoad: function (query) {
    var seed = (parseInt(query && query.seed, 10) >>> 0) || ((Date.now() % 2147483647) >>> 0);
    this.seed = seed;
    this.questions = this.buildQuestions(seed);
    this.responses = [];
    this.setData({ total: this.questions.length });
  },

  buildQuestions: function (seed) {
    var rng = seededRng(seed);
    var map = romanMap();
    var all = Object.keys(map).map(function (k) { return map[k]; });
    var list = learning.CONSONANTS
      .filter(function (t) { return !!map[t]; })
      .map(function (t) { return { tibetan: t, roman: map[t] }; });
    list = shuffle(list, rng);

    return list.slice(0, R.ITEMS).map(function (q) {
      var opts = [q.roman];
      var guard = 0;
      while (opts.length < 4 && guard++ < 200) {
        var cand = all[Math.floor(rng() * all.length)];
        if (opts.indexOf(cand) < 0) opts.push(cand);
      }
      return { tibetan: q.tibetan, correct: q.roman, options: shuffle(opts, rng) };
    });
  },

  onStart: function () {
    this.responses = [];
    this.setData({ phase: 'quiz', idx: 0, result: null });
    this.showQuestion(0);
  },

  showQuestion: function (i) {
    var q = this.questions[i];
    this.setData({ idx: i, letter: q.tibetan, options: q.options });
  },

  onPick: function (e) {
    var i = Number(e.currentTarget.dataset.index);
    var q = this.questions[this.data.idx];
    if (!q || !q.options[i]) return;
    this.responses.push({
      id: q.tibetan,
      correct: q.correct,
      chosen: q.options[i],
      hintUsed: false            // 页面没有提示入口 —— 结构上就不可能有"提示题"
    });
    var next = this.data.idx + 1;
    if (next >= this.questions.length) { this.finish(); return; }
    this.showQuestion(next);
  },

  finish: function () {
    var s = R.scoreSession(this.responses);
    s.ratePct = Math.round(s.rate * 100);
    this.lastResult = s;
    this.setData({ phase: 'result', result: s });
    try {
      telemetry.event('recognition_end', {
        items: s.items, correct: s.correct, rate: s.rate, pass: s.pass, seed: this.seed
      });
      telemetry.flush();
    } catch (e) { /* 埋点失败不影响结果 */ }
  },

  onRestart: function () {
    this.seed = (Date.now() % 2147483647) >>> 0;
    this.questions = this.buildQuestions(this.seed);
    this.responses = [];
    this.setData({ phase: 'intro', idx: 0, letter: '', options: [], result: null, total: this.questions.length });
  },

  onBack: function () {
    wx.navigateBack();
  }
});
