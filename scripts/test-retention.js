#!/usr/bin/env node
/**
 * scripts/test-retention.js — R16：D1 / D7 留存口径验收
 *
 * 钉死三条：
 *   ① D1 = 首日次日也打开；D7 = 首日第 7 天也打开（首日算第 0 天）
 *   ② 观察期不足 → null（不可测），**不能算流失**
 *   ③ 队列汇总的分母 = 可测人数，不是全体
 *
 * 用法：node scripts/test-retention.js
 */
'use strict';

const R = require('./lib/retention.js');

let PASS = 0, FAIL = 0;
const fails = [];
function chk(name, cond, detail) {
  if (cond) { PASS++; console.log('  ✓ ' + name); }
  else { FAIL++; fails.push(name + (detail ? '：' + detail : '')); console.log('  ✗ ' + name + (detail ? ' → ' + detail : '')); }
}
const S = (days) => ({ days: days });

console.log('\n==========================================');
console.log('  R16 留存口径（D1 / D7）');
console.log('==========================================\n');

let r = R.retention(S(['2026-10-01', '2026-10-02', '2026-10-08']));
chk('D1/D7 都留存', r.d1 === true && r.d7 === true, JSON.stringify(r));

r = R.retention(S(['2026-10-01', '2026-10-02']));
chk('只到第 2 天：D1=true、D7=null（还没到观察期）',
  r.d1 === true && r.d7 === null, JSON.stringify(r));

r = R.retention(S(['2026-10-01', '2026-10-03', '2026-10-09']));
chk('次日没来、第 7 天也没来：D1=false、D7=false',
  r.d1 === false && r.d7 === false, JSON.stringify(r));

r = R.retention(S(['2026-10-01']));
chk('只有首日：D1/D7 都是 null（不可测，不是流失）',
  r.d1 === null && r.d7 === null, JSON.stringify(r));

r = R.retention(S([]));
chk('空记录：全 null', r.d1 === null && r.d7 === null);

const c = R.cohort([
  S(['2026-10-01', '2026-10-02', '2026-10-08']),
  S(['2026-10-01', '2026-10-02']),
  S(['2026-10-01', '2026-10-03', '2026-10-09']),
  S(['2026-10-01'])
]);
chk('队列：n=4', c.n === 4);
chk('D1 分母=3（可测），留存=2 → 66.7%',
  c.d1.measurable === 3 && c.d1.retained === 2 && Math.abs(c.d1.rate - 2 / 3) < 1e-9,
  JSON.stringify(c.d1));
chk('D7 分母=2（可测），留存=1 → 50%',
  c.d7.measurable === 2 && c.d7.retained === 1 && Math.abs(c.d7.rate - 0.5) < 1e-9,
  JSON.stringify(c.d7));
chk('不可测用户没有被算成流失', c.d1.measurable < c.n && c.d7.measurable < c.n);

console.log('\n  通过: ' + PASS + ' | 失败: ' + FAIL);
if (FAIL) {
  console.log('');
  fails.forEach(f => console.log('   - ' + f));
  console.log('\n✗ 留存口径不成立 —— 不要拿它对外报数。');
} else {
  console.log('  ✓ 口径成立：null 不等于流失，分母只算可测。');
}
console.log('==========================================');
process.exit(FAIL ? 1 : 0);
