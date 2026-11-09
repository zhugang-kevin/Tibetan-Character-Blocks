#!/usr/bin/env node
/**
 * scripts/test-recognition.js — Q1：无提示识认测试的评分口径验收
 *
 * 钉死四条（都是"假绿"最容易钻的空子）：
 *   ① 30 题里 ≥24 题（80%）才算达标
 *   ② 用了提示的题**不计入分母**（否则"跟着提示找对"会被算成识认）
 *   ③ 题数不足 30 → 一律不达标（不能用 3/3 冒充 100%）
 *   ④ 人数不足 30 → 只报描述统计，不宣称"达标率"
 *
 * 用法：node scripts/test-recognition.js
 */
'use strict';

const R = require('./lib/recognition.js');

let PASS = 0, FAIL = 0;
const fails = [];
function chk(name, cond, detail) {
  if (cond) { PASS++; console.log('  ✓ ' + name); }
  else { FAIL++; fails.push(name + (detail ? '：' + detail : '')); console.log('  ✗ ' + name + (detail ? ' → ' + detail : '')); }
}

function mk(n, correctN, hintN) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: 'c' + i,
      correct: 'x',
      chosen: i < correctN ? 'x' : 'y',
      hintUsed: i < (hintN || 0)
    });
  }
  return out;
}

console.log('\n==========================================');
console.log('  Q1 无提示识认 · 评分口径');
console.log('==========================================\n');

let s = R.scoreSession(mk(30, 30));
chk('30/30 → 达标（rate=1）', s.pass === true && s.rate === 1, JSON.stringify(s));

s = R.scoreSession(mk(30, 24));
chk('24/30 → 达标（恰好 80%）', s.pass === true && Math.abs(s.rate - 0.8) < 1e-9, JSON.stringify(s));

s = R.scoreSession(mk(30, 23));
chk('23/30 → 不达标（低于 80%）', s.pass === false, JSON.stringify(s));

s = R.scoreSession(mk(30, 30, 6));
chk('用了 6 次提示 → 只剩 24 题，题数不足不达标', s.items === 24 && s.pass === false, JSON.stringify(s));

s = R.scoreSession(mk(3, 3));
chk('只做了 3 题（3/3）也不能算达标', s.pass === false && s.enoughItems === false, JSON.stringify(s));

s = R.scoreSession([]);
chk('空答卷 → rate=0、不达标', s.rate === 0 && s.pass === false, JSON.stringify(s));

const sum29 = R.summarize(Array.from({ length: 29 }, () => ({ items: 30, rate: 0.9 })));
chk('n=29 → 样本不足（只报描述统计）', sum29.enoughSample === false && sum29.n === 29, JSON.stringify(sum29));

const sum30 = R.summarize(Array.from({ length: 30 }, (_, i) => ({ items: 30, rate: i < 15 ? 0.9 : 0.5 })));
chk('n=30 → 样本足够，达标率=50%', sum30.enoughSample === true && Math.abs(sum30.passRate - 0.5) < 1e-9, JSON.stringify(sum30));

const sumBad = R.summarize([{ items: 10, rate: 1 }, { items: 30, rate: 0.9 }]);
chk('题数不足的场次不计入达标率', Math.abs(sumBad.passRate - 0.5) < 1e-9, JSON.stringify(sumBad));

console.log('\n  通过: ' + PASS + ' | 失败: ' + FAIL);
if (FAIL) {
  console.log('');
  fails.forEach(f => console.log('   - ' + f));
  console.log('\n✗ 评分口径不成立 —— 不要拿它对外宣称识认率。');
} else {
  console.log('  ✓ 口径成立：无提示、≥80%、题数与人数的下限都拦得住。');
}
console.log('==========================================');
process.exit(FAIL ? 1 : 0);
