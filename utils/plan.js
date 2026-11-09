// utils/plan.js — Q4：150 课的课型 / 复习调度规则（**唯一实现**）
//
// 玩家端（结算页）与门禁（scripts/lib/lesson-plan.js）都 require 本文件，
// 避免"页面显示拼读、门禁算词汇"这种漂移。
//
// ## 规则（D149）
//   课型：L1 引入 / L2–L10 拼读 / L11–L15 词汇
//   复习：每 5 课一个复习课；每课回看 1 / 3 / 7 课前的**同课型**内容（只往回看）
//   覆盖：L1 的 30 辅音不重不漏（覆盖校验在门禁里，需要 buildStage）
//
// ⚠️ 本文件**只描述规则**，不改变任何关卡的盘面内容（不动指纹）。

'use strict';

var STAGES_PER_LEVEL = 10;
var TOTAL_LEVELS = 15;
var REVIEW_EVERY = 5;
var REVIEW_BACKOFF = [1, 3, 7];

var KIND_LABEL = {
  intro: '引入',
  phonics: '拼读',
  vocab: '词汇'
};

function kindOf(lv) {
  var n = Number(lv) || 0;
  if (n === 1) return 'intro';
  if (n >= 2 && n <= 10) return 'phonics';
  if (n >= 11 && n <= TOTAL_LEVELS) return 'vocab';
  return '';
}

function flatIndex(lv, stage) {
  return (Math.max(1, Math.min(TOTAL_LEVELS, Number(lv) || 1)) - 1) * STAGES_PER_LEVEL
    + Math.max(1, Math.min(STAGES_PER_LEVEL, Number(stage) || 1));
}

function fromFlat(i) {
  var n = Number(i) || 0;
  if (n < 1 || n > TOTAL_LEVELS * STAGES_PER_LEVEL) return null;
  return { lv: Math.floor((n - 1) / STAGES_PER_LEVEL) + 1, stage: ((n - 1) % STAGES_PER_LEVEL) + 1 };
}

function isReviewStage(lv, stage) {
  return flatIndex(lv, stage) % REVIEW_EVERY === 0;
}

function reviewTargets(lv, stage) {
  var i = flatIndex(lv, stage);
  var kind = kindOf(lv);
  var out = [];
  REVIEW_BACKOFF.forEach(function (back) {
    var j = i - back;
    if (j < 1) return;
    var t = fromFlat(j);
    if (t && kindOf(t.lv) === kind) out.push({ lv: t.lv, stage: t.stage, kind: kind });
  });
  return out;
}

/** 结算页用的一行摘要 */
function summary(lv, stage) {
  var k = kindOf(lv);
  var list = reviewTargets(lv, stage);
  return {
    kind: k,
    label: KIND_LABEL[k] || '',
    review: list,
    reviewText: list.length
      ? ('复习建议 ' + list.map(function (t) { return 'L' + t.lv + '-' + t.stage; }).join(' / '))
      : ''
  };
}

module.exports = {
  STAGES_PER_LEVEL: STAGES_PER_LEVEL,
  TOTAL_LEVELS: TOTAL_LEVELS,
  REVIEW_EVERY: REVIEW_EVERY,
  REVIEW_BACKOFF: REVIEW_BACKOFF,
  KIND_LABEL: KIND_LABEL,
  kindOf: kindOf,
  flatIndex: flatIndex,
  fromFlat: fromFlat,
  isReviewStage: isReviewStage,
  reviewTargets: reviewTargets,
  summary: summary
};
