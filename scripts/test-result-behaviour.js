#!/usr/bin/env node
/**
 * scripts/test-result-behaviour.js — 结算页行为测试
 *
 * 为什么单独一个文件、而且排在最前面：
 *   结算页是**写存档、发奖励、解锁下一关**的地方。
 *   「失败不写通关」目前只写在 `if (won) storage.completeLevel(level)` 这一行里，
 *   没有任何测试证明它 —— 写反了就是失败也解锁，而且不会有任何东西报警。
 *
 * 做法：用 spy 替换所有"发放类"副作用，直接数它们被调用的次数。
 *   不靠"页面上显示了什么"判断，因为显示可以骗人，**写入不会**。
 *
 * 覆盖（R04 / R05）：
 *   ① 失败（won=0）：所有达标奖励（通关/证书/印章/星级/积分/碎片）零次调用
 *   ② 成功（won=1）：每种奖励恰好调用一次
 *   ③ 缺参（旧入口/学习线）：默认按成功处理，每种奖励恰好一次（向后兼容）
 *   ④ 重复进入同一结算页：每种奖励总计恰好一次（幂等，绝不重复发放）
 *
 * 不覆盖：证书颁发细节、揭图、评分算法、真机。
 */
'use strict';

const path = require('path');
const { createMiniEnv, loadPage } = require('./lib/mini-stub.js');

const RESULT = path.join(__dirname, '..', 'pages', 'result', 'result.js');

let PASS = 0, FAIL = 0;
const fails = [];
function chk(name, cond, detail) {
  if (cond) PASS++;
  else { FAIL++; fails.push(name + (detail ? '：' + detail : '')); }
}

console.log('');
console.log('==========================================');
console.log('  结算页 · 行为测试（奖励发放精确计数）');
console.log('==========================================');

const storage = require('../utils/storage.js');
const certificate = require('../utils/certificate.js');
const platformMod = require('../utils/platform.js');

// ---- spy：只计数、仍调用原实现（部分返回值被结算页用到）----
const hits = {};
const originals = [];
function spy(obj, name) {
  const orig = obj[name];
  hits[name] = 0;
  originals.push({ obj, name, orig });
  obj[name] = function () {
    hits[name]++;
    return orig ? orig.apply(this, arguments) : undefined;
  };
}
const REWARD_FNS = [
  'completeLevel', 'addPoints', 'addFragment', 'recordStars', 'grantStamp'
];
REWARD_FNS.forEach(function (n) { spy(storage, n); });
spy(certificate, 'onLevelComplete');

function freshPage() {
  const env = createMiniEnv();
  global.wx = env.wx;
  platformMod.__reset();
  const page = loadPage(RESULT, env);
  return { env, page };
}
// 重置计数（每次用例前清空，避免跨用例累积）
function resetHits() {
  Object.keys(hits).forEach(function (k) { hits[k] = 0; });
}
// 校验：失败局不该有任何达标奖励写入
function assertNoReward(prefix) {
  REWARD_FNS.forEach(function (n) {
    chk(prefix + ' 失败局不调用 ' + n + '（R04：失败不发达标奖励）',
      hits[n] === 0, n + ' 被调用 ' + hits[n] + ' 次');
  });
  chk(prefix + ' 失败局不记录关卡成绩（onLevelComplete）',
    hits.onLevelComplete === 0, 'onLevelComplete=' + hits.onLevelComplete);
}
// 校验：成功局每种奖励恰好一次（grantStamp 仅第 1 关发拉萨印章，其余关卡不发）
function assertOneReward(prefix, lv) {
  ['completeLevel', 'addPoints', 'addFragment', 'recordStars'].forEach(function (n) {
    chk(prefix + ' ' + n + ' 恰好一次', hits[n] === 1, n + '=' + hits[n]);
  });
  chk(prefix + ' onLevelComplete 恰好一次', hits.onLevelComplete === 1,
    'onLevelComplete=' + hits.onLevelComplete);
  var expStamp = (lv === 1) ? 1 : 0;
  chk(prefix + ' grantStamp 次数符合关卡（第1关发印章，其余不发）',
    hits.grantStamp === expStamp, 'grantStamp=' + hits.grantStamp + ' expected=' + expStamp);
}

/* ---------- ① 失败（won=0）：绝对不能发任何达标奖励 ① ---------- */
resetHits();
{
  const { page } = freshPage();
  let threw = null;
  try { page.__withWx(function () { page.onLoad({ level: 1, won: '0', pairs: 3, score: 30 }); }); }
  catch (e) { threw = e; }
  chk('① 失败局结算页不崩', threw === null, threw ? String(threw.message) : '');
  assertNoReward('①');
}

/* ---------- ② 成功（won=1，第1关）：每种奖励写且只写一次（含拉萨印章）② ---------- */
resetHits();
{
  const { page } = freshPage();
  let threw = null;
  try { page.__withWx(function () { page.onLoad({ level: 1, won: '1', pairs: 9, score: 90 }); }); }
  catch (e) { threw = e; }
  chk('② 胜利局结算页不崩', threw === null, threw ? String(threw.message) : '');
  assertOneReward('②', 1);
}

/* ---------- ③ 缺参（旧入口/学习线，第3关）：默认按成功处理，保持兼容 ③ ---------- */
resetHits();
{
  const { page } = freshPage();
  let threw = null;
  try { page.__withWx(function () { page.onLoad({ level: 3, pairs: 6, score: 60 }); }); }
  catch (e) { threw = e; }
  chk('③ 缺 won 参数不崩（旧入口兼容）', threw === null, threw ? String(threw.message) : '');
  assertOneReward('③', 3);
}

/* ---------- ④ 重复进入同一结算页：幂等，每种奖励总计恰好一次 ④ ---------- */
resetHits();
{
  const { page } = freshPage();
  let threw = null;
  try {
    page.__withWx(function () { page.onLoad({ level: 4, won: '1', pairs: 9, score: 90 }); });
    // 模拟"用户返回后又进来"：同一个页面实例再调一次 onLoad（同一局指纹 → 应被幂等拦截）
    page.__withWx(function () { page.onLoad({ level: 4, won: '1', pairs: 9, score: 90 }); });
  } catch (e) { threw = e; }
  chk('④ 重复进入结算页不崩', threw === null, threw ? String(threw.message) : '');
  assertOneReward('④', 4);   // 关键：两次 onLoad 后，每种奖励仍恰好一次（R05：去重生效）
}

/* ---------- 还原 ---------- */
originals.forEach(function (o) { o.obj[o.name] = o.orig; });
global.wx = undefined;
platformMod.__reset();

/* ---------- 汇总 ---------- */
/* ⑤ Q4：学习线结算显示课型 / 复习建议（规则来自 utils/plan.js） */
{
  const a = freshPage();
  a.page.__withWx(function () {
    a.page.onLoad({ lv: 1, stage: 5, pairs: 6, score: 60, att: 6, miss: 0, steps: 3, budget: 8 });
  });
  chk('⑤ L1-5 课型=引入', a.page.data.lessonKindLabel === '引入', a.page.data.lessonKindLabel);
  chk('⑤ L1-5 复习建议含 L1-4 / L1-2',
    /L1-4/.test(a.page.data.lessonReviewText) && /L1-2/.test(a.page.data.lessonReviewText),
    a.page.data.lessonReviewText);

  const b = freshPage();
  b.page.__withWx(function () {
    b.page.onLoad({ lv: 11, stage: 1, pairs: 6, score: 60, att: 6, miss: 0 });
  });
  chk('⑤ L11-1 课型=词汇', b.page.data.lessonKindLabel === '词汇', b.page.data.lessonKindLabel);
  chk('⑤ L11-1 无更早同课型 → 复习建议为空', b.page.data.lessonReviewText === '', b.page.data.lessonReviewText);
}

console.log('  通过: ' + PASS + ' | 失败: ' + FAIL);
if (FAIL) {
  console.log('');
  fails.forEach(function (f) { console.log('   - ' + f); });
  console.log('');
  console.log('✗ 结算页的奖励发放有回归 —— 不要动 H5 或关卡。');
} else {
  console.log('  ✓ 失败零奖励 / 胜利恰好一次 / 缺参兼容 / 重复进入幂等 —— 奖励发放门闩成立。');
  console.log('  ⚠️ 未覆盖：证书颁发细节、揭图、评分算法、真机。');
}
console.log('==========================================');
process.exit(FAIL ? 1 : 0);
