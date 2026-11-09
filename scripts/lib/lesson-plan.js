// scripts/lib/lesson-plan.js — Q4 的**覆盖校验**（纯规则在 utils/plan.js）
//
// 为什么不在这里重复写 kindOf/reviewTargets：玩家端结算页也要显示课型与复习建议，
// 两套实现必然漂移。规则只有一份（utils/plan.js），这里只做 data 层覆盖校验。

'use strict';

var learning = require('../../utils/learning');
var plan = require('../../utils/plan.js');

var STAGES_PER_LEVEL = plan.STAGES_PER_LEVEL;
var TOTAL_LEVELS = plan.TOTAL_LEVELS;
var KIND_LABEL = plan.KIND_LABEL;
var kindOf = plan.kindOf;
var flatIndex = plan.flatIndex;
var fromFlat = plan.fromFlat;
var isReviewStage = plan.isReviewStage;
var reviewTargets = plan.reviewTargets;

function coverageL1() {
  var seen = {};
  for (var st = 1; st <= STAGES_PER_LEVEL; st++) {
    var s = learning.buildStage(1, st);
    if (!s || !s.titles) return { ok: false, seen: {}, reason: 'L1-' + st + ' 建不出来' };
    s.titles.forEach(function (t) { seen[t] = (seen[t] || 0) + 1; });
  }
  return { ok: true, seen: seen };
}

function verify() {
  var problems = [];
  var stages = 0;
  var reviewStages = 0;

  for (var lv = 1; lv <= TOTAL_LEVELS; lv++) {
    var kind = kindOf(lv);
    if (!kind) problems.push('L' + lv + ' 没有课型');
    for (var st = 1; st <= STAGES_PER_LEVEL; st++) {
      var s = learning.buildStage(lv, st);
      if (!s) { problems.push('L' + lv + '-' + st + ' 建不出来'); continue; }
      stages++;
      if (isReviewStage(lv, st)) reviewStages++;

      reviewTargets(lv, st).forEach(function (t) {
        if (flatIndex(t.lv, t.stage) >= flatIndex(lv, st)) problems.push('L' + lv + '-' + st + ' 的复习目标不在更早');
        if (kindOf(t.lv) !== kind) problems.push('L' + lv + '-' + st + ' 的复习目标课型不符');
      });
    }
  }

  var cov = coverageL1();
  var uniq = cov.seen ? Object.keys(cov.seen).length : 0;
  if (!cov.ok) problems.push(cov.reason || 'L1 覆盖算不出来');
  if (uniq !== 30) problems.push('L1 辅音覆盖数不是 30（实际 ' + uniq + '）');
  Object.keys(cov.seen || {}).forEach(function (t) {
    if (cov.seen[t] !== 1) problems.push('辅音 ' + t + ' 出现 ' + cov.seen[t] + ' 次（应恰好 1 次）');
  });

  return {
    ok: problems.length === 0,
    problems: problems,
    stages: stages,
    reviewStages: reviewStages,
    consonants: uniq
  };
}

module.exports = {
  STAGES_PER_LEVEL: STAGES_PER_LEVEL,
  TOTAL_LEVELS: TOTAL_LEVELS,
  REVIEW_EVERY: plan.REVIEW_EVERY,
  REVIEW_BACKOFF: plan.REVIEW_BACKOFF,
  KIND_LABEL: KIND_LABEL,
  kindOf: kindOf,
  flatIndex: flatIndex,
  fromFlat: fromFlat,
  isReviewStage: isReviewStage,
  reviewTargets: reviewTargets,
  coverageL1: coverageL1,
  verify: verify
};
