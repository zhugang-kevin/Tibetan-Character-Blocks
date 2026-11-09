// utils/recognition.js — Q1：无提示识认测试的评分口径（页面与门禁共用）
//
// ## 为什么在 utils
//   玩家端的测验页要用它算分，门禁也要用它验证口径 —— 必须是**同一份实现**，
//   否则"页面算 80% 达标、门禁算 79% 不达标"这种漂移迟早出现。
//   （scripts/lib/recognition.js 只是 require 本文件的薄壳。）
//
// ## 口径（D148）
//   · 30 题（30 个辅音各一次，随机顺序）
//   · **无提示**：不显示颜色、不显示配对、不播发音
//   · 单轮正确率 ≥ 80%（24/30）才算达标
//   · 有效题 < 30 → 不达标（不能用 3/3 冒充 100%）
//   · 样本：n ≥ 30 才报"达标率"；不足只报描述统计

'use strict';

var ITEMS = 30;
var PASS_RATE = 0.8;
var MIN_SAMPLE = 30;

function eq(a, b) { return String(a) === String(b); }

function scoreSession(responses) {
  var all = Array.isArray(responses) ? responses : [];
  var valid = all.filter(function (r) { return r && r.hintUsed !== true; });
  var correct = valid.filter(function (r) { return eq(r.chosen, r.correct); }).length;
  var rate = valid.length ? correct / valid.length : 0;
  return {
    items: valid.length,
    correct: correct,
    rate: rate,
    enoughItems: valid.length >= ITEMS,
    pass: valid.length >= ITEMS && rate >= PASS_RATE
  };
}

function summarize(sessions) {
  var arr = (Array.isArray(sessions) ? sessions : []).filter(function (s) {
    return s && typeof s.rate === 'number';
  });
  var n = arr.length;
  var mean = n ? arr.reduce(function (a, s) { return a + s.rate; }, 0) / n : 0;
  var pass = arr.filter(function (s) { return s.items >= ITEMS && s.rate >= PASS_RATE; }).length;
  return {
    n: n,
    meanRate: mean,
    passRate: n ? pass / n : 0,
    enoughSample: n >= MIN_SAMPLE
  };
}

module.exports = {
  ITEMS: ITEMS,
  PASS_RATE: PASS_RATE,
  MIN_SAMPLE: MIN_SAMPLE,
  scoreSession: scoreSession,
  summarize: summarize
};
