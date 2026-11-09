#!/usr/bin/env node
/**
 * scripts/test-lesson-plan.js — Q4：150 课「课型 + 复习调度」的验收
 *
 * 钉死四件事：
 *   ① 课型：L1 引入 / L2–L10 拼读 / L11–L15 词汇（无空档）
 *   ② 复习：每 5 课一个复习课（150 课 → 30 个），回看 1/3/7 课前的同课型内容
 *   ③ 覆盖：L1 的 30 个辅音**不重不漏**（逐字校验，不是数数）
 *   ④ 自检对数据变坏**真的会红**（变异：把 L1 的某个辅音换成重复的）
 *
 * 用法：node scripts/test-lesson-plan.js
 */
'use strict';

const plan = require('./lib/lesson-plan.js');
const learning = require('../utils/learning');

let PASS = 0, FAIL = 0;
const fails = [];
function chk(name, cond, detail) {
  if (cond) { PASS++; console.log('  ✓ ' + name); }
  else { FAIL++; fails.push(name + (detail ? '：' + detail : '')); console.log('  ✗ ' + name + (detail ? ' → ' + detail : '')); }
}

console.log('\n==========================================');
console.log('  Q4 150 课 · 课型与复习调度');
console.log('==========================================\n');

const v = plan.verify();
chk('150 课全部建得出来', v.stages === 150, 'stages=' + v.stages);
chk('课型无空档（每级都有）', v.problems.filter(p => /没有课型/.test(p)).length === 0);
chk('L1 引入 30 辅音，不重不漏', v.consonants === 30 && v.problems.filter(p => /辅音|覆盖/.test(p)).length === 0,
  'consonants=' + v.consonants);
chk('每 5 课一个复习课（150 → 30）', v.reviewStages === 30, 'review=' + v.reviewStages);
chk('复习目标全部是「更早 + 同课型」', v.problems.filter(p => /复习目标/.test(p)).length === 0);
chk('整体自检通过（无 problems）', v.ok, v.problems.slice(0, 2).join('；'));

chk('课型映射：L1=intro', plan.kindOf(1) === 'intro');
chk('课型映射：L2–L10=phonics', [2, 5, 10].every(lv => plan.kindOf(lv) === 'phonics'));
chk('课型映射：L11–L15=vocab', [11, 15].every(lv => plan.kindOf(lv) === 'vocab'));

const t151 = plan.reviewTargets(1, 5);   // flat 5 → 回看 4、2（j=5-7<1 跳过）
chk('L1-5 回看 L1-4 / L1-2（7 课越界跳过）',
  t151.length === 2 && t151[0].stage === 4 && t151[1].stage === 2,
  JSON.stringify(t151));
const t61 = plan.reviewTargets(6, 1);    // flat 51 → 50 / 48 / 44，全部同课型
chk('L6-1 回看 3 课且同课型',
  t61.length === 3 && t61.every(t => t.kind === 'phonics'),
  JSON.stringify(t61));
chk('L1-1 没有更早的课 → 空', plan.reviewTargets(1, 1).length === 0);
chk('复习课标记：L1-5 / L2-5 / L15-10 是复习课',
  plan.isReviewStage(1, 5) && plan.isReviewStage(2, 5) && plan.isReviewStage(15, 10));
chk('非复习课标记：L1-1 / L1-4 不是', !plan.isReviewStage(1, 1) && !plan.isReviewStage(1, 4));

/* 变异：把 L1-1 的第二个辅音换成重复的第一个 → 自检必须红 */
{
  const orig = learning.buildStage;
  learning.buildStage = function (lv, st) {
    const s = orig(lv, st);
    if (lv === 1 && st === 1 && s && s.titles && s.titles.length >= 2) {
      s.titles = [s.titles[0], s.titles[0], s.titles[1]];
    }
    return s;
  };
  const bad = plan.verify();
  learning.buildStage = orig;
  chk('变异：L1 出现重复辅音 → 自检翻红',
    !bad.ok && bad.problems.some(p => /出现 2 次|覆盖数不是 30/.test(p)),
    bad.problems.slice(0, 2).join('；'));
}

console.log('\n  通过: ' + PASS + ' | 失败: ' + FAIL);
if (FAIL) {
  console.log('');
  fails.forEach(f => console.log('   - ' + f));
  console.log('\n✗ 课型/复习规则不成立 —— 不要按这套规则排课。');
} else {
  console.log('  ✓ 规则成立：30 辅音不重不漏、每 5 课复习、回看 1/3/7 且同课型。');
}
console.log('==========================================');
process.exit(FAIL ? 1 : 0);
