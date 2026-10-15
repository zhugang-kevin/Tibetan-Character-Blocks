// scripts/test-scene-voice.js — D115 场景语音**行为**测试
//
// 为什么单独一个文件：validate.js 是静态机检（读源码字符串），
//   它能守住「映射表没漂移、接线没断」，但**守不住频次闸门的行为**——
//   「连击 9 秒内不重复播」「连 3 连不播」这类逻辑，改错了静态正则照样全绿。
//   这个文件直接 require 真实模块、喂真实时间戳，验证**实际会不会播**。
//
// 判据立场：只测「该不该播」这个决策，不测音频是否真的响了（那是播放器的事）。
//   另外必须包含**反例自测** —— 证明这些断言真的会红，否则它们就是装饰。

const sv = require('../utils/scene-voice.js');

let passed = 0, failed = 0;
const fails = [];

function check(name, cond, info) {
  if (cond) { passed++; console.log('  \x1b[32m✓\x1b[0m ' + name); }
  else {
    failed++; fails.push(name);
    console.log('  \x1b[31m✗\x1b[0m ' + name + (info ? '  → ' + info : ''));
  }
}
function section(n) { console.log('\n[' + n + ']'); }

// 收集「实际播了哪些 id」的替身
function recorder() {
  const log = [];
  return { log, fn: function (id) { log.push(id); } };
}

section('1. 五个场景的映射与 id');
{
  const MAP = [
    ['combo', 'greet_03'], ['clear', 'greet_04'], ['rare', 'greet_05'],
    ['goal', 'greet_06'], ['comfort', 'greet_07']
  ];
  MAP.forEach(function (m) {
    check(m[0] + ' → ' + m[1], sv.SCENE_VOICE[m[0]] === m[1],
      '实际 ' + sv.SCENE_VOICE[m[0]]);
  });
  const ids = Object.keys(sv.SCENE_VOICE).map(function (k) { return sv.SCENE_VOICE[k]; });
  check('五条互不相同（映射未退化）', new Set(ids).size === 5, ids.join(','));
  check('未知场景不播（防传错场景名）',
    sv.shouldPlay('not_a_scene', sv.createState(0), 0, {}) === false);
}

section('2. 连续消除：连击门槛与「新高才播」');
{
  // 连 1~3 连不播（连 2~3 连是最常见操作，那时播祝福等于给日常加噪声）
  [1, 2, 3].forEach(function (c) {
    const st = sv.createState(0);
    check('连 ' + c + ' 连不播', sv.shouldPlay('combo', st, 1000, { combo: c }) === false);
  });
  // 连 4 连播一次
  let st = sv.createState(0); const r4 = recorder();
  sv.trigger('combo', st, r4.fn, 1000, { combo: 4 });
  check('连 4 连播 greet_03', r4.log.length === 1 && r4.log[0] === 'greet_03',
    JSON.stringify(r4.log));

  // 同一次连击不该重复播（5 连已播过 4 连，就不该再播 5……除非超过冷却）
  st = sv.createState(0);
  const r = recorder();
  sv.trigger('combo', st, r.fn, 1000, { combo: 4 });
  sv.trigger('combo', st, r.fn, 1100, { combo: 4 });
  check('同一连击数不重复播', r.log.length === 1, JSON.stringify(r.log));

  // 冷却内的新高也不播（连击可能一路 4→5→6 连着来）
  st = sv.createState(0);
  const r2 = recorder();
  sv.trigger('combo', st, r2.fn, 1000, { combo: 4 });
  sv.trigger('combo', st, r2.fn, 2000, { combo: 5 });   // 距上次 1s < 9s
  sv.trigger('combo', st, r2.fn, 3000, { combo: 6 });   // 距上次 2s < 9s
  check('连击冷却 9s 内不播（连 4→5→6 只播一次）', r2.log.length === 1, JSON.stringify(r2.log));
  // 冷却外可以再播
  sv.trigger('combo', st, r2.fn, 11000, { combo: 7 });  // 距上次 10s > 9s
  check('冷却满后可以再播', r2.log.length === 2, JSON.stringify(r2.log));
}

section('3. 温柔鼓励：连错不句句安慰');
{
  const st = sv.createState(0);
  const r = recorder();
  sv.trigger('comfort', st, r.fn, 1000, {});
  sv.trigger('comfort', st, r.fn, 2000, {});
  sv.trigger('comfort', st, r.fn, 3000, {});
  check('连错 3 次只播 1 次（冷却 15s）', r.log.length === 1, JSON.stringify(r.log));
  sv.trigger('comfort', st, r.fn, 17000, {});
  check('冷却满后错配可再播', r.log.length === 2, JSON.stringify(r.log));
  check('错配播的是 greet_07', r.log[0] === 'greet_07', r.log[0]);
}

section('4. 稀有奖励 / 目标达成 / 完成挑战：各只播一次');
{
  // 稀有：本关反复发现新元素（同关最多几种），冷却 20s
  let st = sv.createState(0); let r = recorder();
  sv.trigger('rare', st, r.fn, 1000, {});
  sv.trigger('rare', st, r.fn, 5000, {});
  check('稀有冷却 20s 内不播', r.log.length === 1, JSON.stringify(r.log));
  check('稀有播的是 greet_05', r.log[0] === 'greet_05', r.log[0]);

  // 目标达成：每关**只播一次**，且不需要冷却（剩余步数会多次落到 ≤3）
  st = sv.createState(0); r = recorder();
  sv.trigger('goal', st, r.fn, 1000, {});
  sv.trigger('goal', st, r.fn, 1100, {});
  sv.trigger('goal', st, r.fn, 20000, {});   // 就算过了很久也不该再播
  check('目标达成每关只播一次（无冷却也不重复）', r.log.length === 1, JSON.stringify(r.log));
  check('目标播的是 greet_06', r.log[0] === 'greet_06', r.log[0]);

  // 完成挑战：每关至多一次
  st = sv.createState(0); r = recorder();
  sv.trigger('clear', st, r.fn, 1000, {});
  sv.trigger('clear', st, r.fn, 2000, {});
  check('完成挑战只播一次', r.log.length === 1, JSON.stringify(r.log));
  check('完成播的是 greet_04', r.log[0] === 'greet_04', r.log[0]);
}

section('5. 让位延迟与跳转时机：语音不许被腰斩');
{
  // ⚠️ 这一节最初写错过一次：我以为「缩短让位延迟就能赶在跳页前念完」，
  //   但一句最短 1.0s、finishLevel 在 1200ms 就跳页 —— 算式350+delay+1000 > 1200
  //   恒成立，缩短延迟只会让祝福**被腰斩成半句**（听起来像卡住/破音）。
  //   正确解法是推迟跳转（NAV_HOLD_MS）。这里同时守住两端，避免再退回错误解法。
  const CALL_AT = 350, MAX_SENTENCE = 1600, TAIL = 300;
  const y = sv.SCENE_YIELD_MS;
  check('盘面交互中的四个场景让位 1200ms（避开 300ms 的元素发音）',
    y.combo === 1200 && y.rare === 1200 && y.goal === 1200 && y.comfort === 1200);
  check('完成挑战让位 350ms（关卡已结束，不必再等元素发音）', y.clear === 350, String(y.clear));
  const nav = sv.NAV_HOLD_MS;
  check('跳转推迟到语音念完（≥ 起播 + 最长句 + 收尾余量）',
    nav >= CALL_AT + y.clear + MAX_SENTENCE + TAIL,
    'NAV_HOLD_MS=' + nav + ' 需 ≥' + (CALL_AT + y.clear + MAX_SENTENCE + TAIL));
  check('五个场景都定义了让位延迟',
    ['combo', 'clear', 'rare', 'goal', 'comfort'].every(function (k) {
      return typeof y[k] === 'number' && y[k] > 0;
    }));
}

section('6. 反例自测：断言真的会红吗');
{
  // 目的：证明上面这些断言**有鉴别力**，不是恒真的装饰。
  // 做法：故意破坏被测条件，确认对应断言转为 false。
  const origCd = sv.SCENE_COOLDOWN.combo;

  // ① 冷却真的在拦：把 combo 冷却调到 0 → 连击会连着播
  sv.SCENE_COOLDOWN.combo = 0;
  const st = sv.createState(0); const r = recorder();
  sv.trigger('combo', st, r.fn, 1000, { combo: 4 });
  sv.trigger('combo', st, r.fn, 1500, { combo: 5 });
  const broke = r.log.length === 2;
  sv.SCENE_COOLDOWN.combo = origCd;
  check('冷却调到 0 后连击确实会连着播（反例成立）', broke, JSON.stringify(r.log));

  // 恢复后必须又只播一次 —— 双向有效，不是单向误判
  const st2 = sv.createState(0); const r2 = recorder();
  sv.trigger('combo', st2, r2.fn, 1000, { combo: 4 });
  sv.trigger('combo', st2, r2.fn, 1500, { combo: 5 });
  check('冷却复原后连击又只播一次（闸门双向有效）', r2.log.length === 1, JSON.stringify(r2.log));

  // ② 一次性场景真的在拦：清掉 played 标记 → clear 应该又能播
  const st3 = sv.createState(0); const r3 = recorder();
  sv.trigger('clear', st3, r3.fn, 1000, {});
  sv.trigger('clear', st3, r3.fn, 2000, {});
  const onceHeld = r3.log.length === 1;
  delete st3.played.clear;
  sv.trigger('clear', st3, r3.fn, 3000, {});
  check('清掉 played 标记后 clear 能再播（反例成立）', onceHeld && r3.log.length === 2,
    JSON.stringify(r3.log));

  // ③ 连击门槛真的有鉴别力：低于门槛必不播，高于必播
  const st4 = sv.createState(0);
  const lowBlocked = !sv.shouldPlay('combo', st4, 1000, { combo: sv.COMBO_THRESHOLD - 1 });
  const st5 = sv.createState(0);
  const highPass = sv.shouldPlay('combo', st5, 1000, { combo: sv.COMBO_THRESHOLD });
  check('连击门槛双向有效：低一档不播、正好到门槛播', lowBlocked && highPass);

  // ④ 状态隔离：新的一关闸门必须是干净的
  const fresh = sv.createState(0);
  const r4 = recorder();
  sv.trigger('combo', fresh, r4.fn, 1000, { combo: 6 });
  check('新的一关（createState）闸门是干净的', r4.log.length === 1, JSON.stringify(r4.log));
}

console.log('\n通过: ' + passed + ' | 失败: ' + failed);
if (failed) {
  console.log('\x1b[31m失败项\x1b[0m');
  fails.forEach(function (f) { console.log('  - ' + f); });
  console.log('\x1b[31m场景语音行为测试未通过\x1b[0m');
  process.exit(1);
}
console.log('\x1b[32m场景语音行为测试全部通过 ✓（含反例自测）\x1b[0m');
