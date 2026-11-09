#!/usr/bin/env node
/**
 * scripts/test-h5-match3.js — 体验版三消镜像 · 验收规格
 *
 * 2026-10-22：镜像三消已接通（建关 → 交换 → MATCH3.resolve 连锁 → 达标/耗尽结算）。
 *   本脚本是**静态**验收（查接线点）；真实交互另由 scripts/test-h5-match3-behaviour.js
 *   （18 条 jsdom 行为断言）实测。二者都过，才算「两端一致」。
 *
 * 为什么用静态检查而不是立刻跑行为测试：
 *   体验版现在**根本没有**三消入口，跑行为测试只会在第一步抛错、看不出缺哪一块。
 *   静态检查能逐条指出缺什么，每一条都是一个可执行的动作。
 *
 * 用法：node scripts/test-h5-match3.js
 */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var TPL = path.join(ROOT, 'preview', 'template.html');
var BUILD = path.join(ROOT, 'scripts', 'build-h5.js');

function read(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; }
}

var tpl = read(TPL);
var build = read(BUILD);

console.log('');
console.log('==========================================');
console.log('  体验版三消镜像 · 验收规格（预期红）');
console.log('==========================================');

var PASS = 0, MISS = 0;
var todo = [];

function need(name, cond, action) {
  if (cond) {
    PASS++;
    console.log('  ✓ ' + name);
  } else {
    MISS++;
    console.log('  ✗ ' + name);
    if (action) todo.push(action);
  }
}

/* ---------- 前置：把引擎带进 H5 ---------- */
// 体验版不 require utils（构建只内联 data/*），所以必须由 build-h5.js 注入。
need('build-h5.js 已把 utils/match3.js 内联进产物',
  /match3/i.test(build) && /require\(/.test(build),
  '改 scripts/build-h5.js：像内联 data/* 那样，把 utils/match3.js 注入成 const MATCH3 = {...}');

need('模板里能拿到三消引擎（MATCH3 或 match3）',
  /MATCH3|match3/.test(tpl),
  '在 template.html 里接住构建注入的 MATCH3（不要手抄一份引擎，会与 utils/match3.js 漂移）');

/* ---------- 四个改动点 ---------- */
need('① 建关分流：老线用 createLevelMatch3',
  /createLevelMatch3/.test(tpl),
  'template.html 建关处：老线走 createLevelMatch3；学习线保持原 createLevel');

need('① 开局保证：调用 ensurePlayable（无三连 + 有解）',
  /ensurePlayable/.test(tpl),
  '建关后调用 ensurePlayable，不满足就重洗');

need('① 目标模型：调用 objectiveFor（限步 + 目标）',
  /objectiveFor/.test(tpl),
  '用 objectiveFor(total) 得到 target/moves，替代"清空即通关"');

need('② 输入：三消要求相邻 + 能成线（swapMakesLine）',
  /swapMakesLine/.test(tpl),
  'onTapTile 第 2 张牌时：先判相邻，再判 swapMakesLine，不合法只提示、不扣步');

need('③ 结算：走 resolve（连锁）',
  /\.resolve\(|resolve\(/.test(tpl),
  '合法交换后调用 MATCH3.resolve(...)，消费返回的 cells/pool/spent/rounds');

need('④ 死局：无解时洗牌（shuffle / hasMove）',
  /shuffle/.test(tpl) && /hasMove/.test(tpl),
  '每次结算后 hasMove；无解则 shuffle 重排并提示');

/* ---------- 视觉与反馈 ---------- */
need('特效牌在体验版有视觉标记（stripe / rainbow）',
  /stripe/.test(tpl) && /rainbow/.test(tpl),
  '给 special 牌加角标（≡ / ✧），与小程序端保持一致');

need('体验版有「连锁 ×N」这类即时反馈',
  /连锁|链/.test(tpl),
  '连锁 ≥2 轮时给出明确反馈（小程序端已实现，体验版需对齐）');

/* ---------- 结算接线（R02 的真正缺口） ---------- */
// ⚠️ 2026-10-22 修正：原判据是「test-h5.js 的 startLevel 全换成 startLearn」。
//   实测该判据**不成立**：学习线与老线语义不同（L10 学习关 6×6=36 格 vs 老线 6×8=48 格；
//   结算写 learnDone 而非 completedLevels；学习关无祝福卡），把 33 处 startLevel 机械换成
//   startLearn 会让 694 条断言大面积翻红（已实测）。故改为验证真正的缺口：
//   onTapSwap 在「达标 / 步数耗尽」时是否调用 finishLevel，并先置 m3Won（胜负分流）。
var swapBody = (tpl.match(/function onTapSwap[\s\S]*?\nfunction /) || [''])[0];
need('三消结算已接线：达标/步数耗尽 → finishLevel（won/lost 分流）',
  /state\.m3Won\s*=\s*true[\s\S]{0,240}?finishLevel\(\)/.test(swapBody) &&
  /state\.m3Won\s*=\s*false[\s\S]{0,240}?finishLevel\(\)/.test(swapBody),
  'onTapSwap 的达标/耗尽分支必须调用 finishLevel，并先置 state.m3Won');

/* ---------- 与现有测试的关系（信息，不再作为门禁） ---------- */
var h5src = read(path.join(ROOT, 'scripts', 'test-h5.js'));
var nLevel = (h5src.match(/startLevel\(/g) || []).length;
var nLearn = (h5src.match(/startLearn\(/g) || []).length;
console.log('  · test-h5.js 入口：startLevel=' + nLevel + ' / startLearn=' + nLearn +
  '（保留 694 条配对断言；学习线另有专门小节覆盖，不做机械替换）');

/* ---------- 汇总 ---------- */
console.log('');
console.log('  已满足: ' + PASS + ' | 待完成: ' + MISS);
console.log('');

if (MISS) {
  console.log('  还差这些（每一条都是一个可执行动作）：');
  todo.forEach(function (t, i) { console.log('   ' + (i + 1) + '. ' + t); });
  console.log('');
  console.log('  ✗ 体验版镜像未完成 —— 小程序端已是三消，体验版仍是配对（两端分叉）。');
  console.log('    这不是"项目坏了"，是"这一块还没做"。');
} else {
  console.log('  ✓ 体验版三消镜像已就位 —— 端点行为与小程序端一致。');
  console.log('    下一步：node scripts/build-h5.js && node scripts/test-h5.js 跑行为回归。');
}
console.log('==========================================');
process.exit(MISS ? 1 : 0);
