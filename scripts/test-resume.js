#!/usr/bin/env node
/**
 * scripts/test-resume.js — Q5 中途存档的单元验证
 *
 * 验证 utils/resume.js 的四件事：
 *   ① 快照能无损往返（JSON 序列化后 digest 不变）
 *   ② 牌属性 / 补池 / 随机源 / 目标 / 步数 全部保留（资源与版本）
 *   ③ 非法存档**必须拒绝**（版本/关卡/形状/步数越界/伪造进度/坏牌）
 *   ④ 新局快照 cleared=0 —— 不伪造 30% 进度
 *
 * 用法：node scripts/test-resume.js
 */
'use strict';

const R = require('../utils/resume.js');

let PASS = 0, FAIL = 0;
const fails = [];
function chk(name, cond, detail) {
  if (cond) { PASS++; console.log('  ✓ ' + name); }
  else { FAIL++; fails.push(name + (detail ? '：' + detail : '')); console.log('  ✗ ' + name + (detail ? ' → ' + detail : '')); }
}

const cells = [
  { id: 'a', uid: 1, state: 'idle' },
  { id: 'b', uid: 2, special: 'stripe', state: 'idle' },
  { id: 'a', uid: 3, frost: true, state: 'idle' },
  { id: 'c', uid: 4, crate: 2, state: 'idle' },
  { id: 'c', uid: 5, rope: 1, state: 'idle' },
  null, null, null, null, null, null, null
];
const src = {
  level: 3, seed: 20261023, rngState: 987654321, cols: 4, rows: 3,
  cells, pool: { a: 4, b: 2, c: 6 }, nextUid: 6, spent: 9,
  target: 12, moves: 10, left: 7, cleared: 9
};

console.log('\n==========================================');
console.log('  Q5 中途存档 · 单元验证');
console.log('==========================================\n');

/* ① 新建快照：不伪造进度 */
{
  const fresh = R.snapshot({ level: 1, seed: 1, cols: 3, rows: 3, cells: [], pool: {}, nextUid: 1, spent: 0, target: 9, moves: 8, left: 8, cleared: 0 });
  chk('新局快照 cleared=0（不伪造 30% 进度）', fresh.cleared === 0, 'cleared=' + fresh.cleared);
  chk('新局快照 spent=0', fresh.spent === 0, 'spent=' + fresh.spent);
  chk('新局快照版本号为 ' + R.VERSION, fresh.v === R.VERSION, 'v=' + fresh.v);
}

/* ② 往返无损 */
{
  const snap = R.snapshot(src);
  const round = JSON.parse(JSON.stringify(snap));
  chk('JSON 往返后仍合法', R.valid(round, 3, 12) === true);
  chk('JSON 往返后 digest 完全一致（盘面/资源/目标/步数不丢）',
    R.digest(round) === R.digest(snap), R.digest(snap));
  chk('随机源保留（seed）', round.seed === 20261023, 'seed=' + round.seed);
  chk('随机源内部状态保留（rngState）', round.rngState === 987654321, 'rngState=' + round.rngState);
  chk('补池余量保留（pool）', JSON.stringify(round.pool) === JSON.stringify({ a: 4, b: 2, c: 6 }));
  chk('特效牌保留（stripe）', R.digest(round).indexOf('Sstripe') > -1, R.digest(round));
  chk('冰霜/木箱/绳索保留', /F/.test(R.digest(round)) && /C2/.test(R.digest(round)) && /R1/.test(R.digest(round)));
  chk('目标/步数保留', round.obj.target === 12 && round.obj.moves === 10 && round.left === 7);
}

/* ③ 非法存档必须拒绝 */
{
  const base = R.snapshot(src);
  const bad = (patch) => Object.assign(JSON.parse(JSON.stringify(base)), patch);

  chk('拒绝：版本不符', R.valid(bad({ v: 999 }), 3, 12) === false);
  chk('拒绝：关卡不符（串关）', R.valid(bad({ level: 4 }), 3, 12) === false);
  chk('拒绝：形状不符（cols×rows≠slots）', R.valid(bad({ cols: 5 }), 3, 12) === false);
  chk('拒绝：格数不符', R.valid(bad({ cells: base.cells.slice(0, 6) }), 3, 12) === false);
  chk('拒绝：剩余步数超过预算', R.valid(bad({ left: 11 }), 3, 12) === false);
  chk('拒绝：伪造进度（cleared > target）', R.valid(bad({ cleared: 99, obj: { target: 12, moves: 10 } }), 3, 12) === false);
  chk('拒绝：目标为 0', R.valid(bad({ obj: { target: 0, moves: 10 } }), 3, 12) === false);
  chk('拒绝：坏牌（缺 uid）', (function () {
    const c = base.cells.slice(); c[0] = { id: 'a' }; return R.valid(bad({ cells: c }), 3, 12) === false;
  })());
  chk('拒绝：null / 非对象', R.valid(null, 3, 12) === false && R.valid('x', 3, 12) === false);
}

/* ④ 纯函数：不改入参 */
{
  const before = R.digest(R.snapshot(src));
  const s2 = R.snapshot(src);
  R.valid(s2, 3, 12);
  R.digest(s2);
  chk('snapshot/valid/digest 不改入参', R.digest(R.snapshot(src)) === before && R.digest(s2) === before);
}

/* ⑤ seededRng 可续：存取内部状态后，下一次取值必须与未中断的序列一致 */
{
  const m3 = require('../utils/match3.js');
  const a = m3.seededRng(42);
  a(); a();
  const st = a.getState();
  const b = m3.seededRng(1);
  b.setState(st);
  chk('seededRng 存取状态：续上的下一次取值与原序列一致', a() === b(), 'state=' + st);
}

console.log('\n  通过: ' + PASS + ' | 失败: ' + FAIL);
if (FAIL) {
  console.log('');
  fails.forEach(f => console.log('   - ' + f));
  console.log('\n✗ 存档契约不成立 —— 不要接续玩。');
} else {
  console.log('  ✓ 存档契约成立：可无损往返、非法存档全拒、新局不伪造进度。');
}
console.log('==========================================');
process.exit(FAIL ? 1 : 0);
