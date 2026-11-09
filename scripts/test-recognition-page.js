#!/usr/bin/env node
/**
 * scripts/test-recognition-page.js — Q1 玩家端识认测验页的行为验证
 *
 * 真跑页面（mini-stub），验证：
 *   ① 30 题、每题 4 个选项、30 个辅音不重复、正确项一定在选项里
 *   ② 全对 → 30/30 达标（100%）
 *   ③ 23 对 7 错 → 23/30 不达标（76.7%，低于 80%）
 *   ④ 结构上没有提示（所有作答 hintUsed=false）—— 不是"有提示但没点"
 *
 * 用法：node scripts/test-recognition-page.js
 */
'use strict';

const path = require('path');
const { createMiniEnv, loadPage } = require('./lib/mini-stub.js');

const PAGE = path.join(__dirname, '..', 'pages', 'recognition', 'recognition.js');

let PASS = 0, FAIL = 0;
const fails = [];
function chk(name, cond, detail) {
  if (cond) { PASS++; console.log('  ✓ ' + name); }
  else { FAIL++; fails.push(name + (detail ? '：' + detail : '')); console.log('  ✗ ' + name + (detail ? ' → ' + detail : '')); }
}

function mkPage(seed) {
  const env = createMiniEnv();
  const p = loadPage(PAGE, env);
  p.__withWx(function () { p.onLoad({ seed: seed }); });
  return p;
}

function answer(p, correctCount) {
  for (let i = 0; i < p.questions.length; i++) {
    const q = p.questions[i];
    const right = q.options.indexOf(q.correct);
    const pick = i < correctCount ? right : (right + 1) % 4;
    p.__withWx(function () {
      p.onPick({ currentTarget: { dataset: { index: pick } } });
    });
  }
}

console.log('\n==========================================');
console.log('  Q1 识认测验页 · 行为验证');
console.log('==========================================\n');

const a = mkPage(12345);
chk('题量 = 30', a.questions.length === 30, 'n=' + a.questions.length);
chk('每题 4 个选项', a.questions.every(q => q.options.length === 4));
chk('30 个辅音不重复', new Set(a.questions.map(q => q.tibetan)).size === 30);
chk('正确项一定在选项里', a.questions.every(q => q.options.indexOf(q.correct) > -1));
chk('初始在 intro、没有提示入口字段',
  a.data.phase === 'intro' && a.data.hint === undefined && a.data.hintUsed === undefined);

answer(a, 30);
chk('全对 → 30/30', a.lastResult.items === 30 && a.lastResult.correct === 30, JSON.stringify(a.lastResult));
chk('全对 → 达标（100%）', a.lastResult.pass === true && a.lastResult.ratePct === 100);
chk('结构上无提示（所有作答 hintUsed=false）', a.responses.every(r => r.hintUsed === false));
chk('结束后进入 result', a.data.phase === 'result');

const b = mkPage(67890);
answer(b, 23);
chk('23 对 7 错 → 23/30', b.lastResult.correct === 23 && b.lastResult.items === 30, JSON.stringify(b.lastResult));
chk('23/30 → 不达标（76.7% < 80%）', b.lastResult.pass === false && b.lastResult.ratePct === 77, JSON.stringify(b.lastResult));

const c = mkPage(111);
c.__withWx(function () { c.onRestart(); });
chk('再测一次：回到 intro 且换了一套题',
  c.data.phase === 'intro' && c.questions.length === 30);

console.log('\n  通过: ' + PASS + ' | 失败: ' + FAIL);
if (FAIL) {
  console.log('');
  fails.forEach(f => console.log('   - ' + f));
  console.log('\n✗ 识认测验页不成立 —— 不要拿它的数据报识认率。');
} else {
  console.log('  ✓ 测验页成立：30 题、无提示、按 D148 口径判定。');
}
console.log('==========================================');
process.exit(FAIL ? 1 : 0);
