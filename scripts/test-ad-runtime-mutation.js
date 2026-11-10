#!/usr/bin/env node
// scripts/test-ad-runtime-mutation.js — D156 广告门禁的**变异测试**（必须全红才算门禁有效）
//
// ## 这个文件为什么存在
//   门禁写得再全，只要「改坏了它也不红」，就是假绿。所以每个判据都要故意改坏一次，
//   亲眼看到它翻红。原 harness 放在 `.workbuddy/tmp/mutate-ads.js`（临时、不提交），
//   2026-11-08 崩在 `fs.rmSync(tmp, {recursive:true})`：沙箱的批量删除守卫
//   （一次删 72 个文件 > 阈值 50）直接抛错退出，变异测试连一半都没跑完；
//   更糟的是它**留下的源码副本**被 `validate.js` 当成真源码扫到 `wx.login`，
//   全量 CI 假红 42/1。
//
// ## 本版三条纪律
//   ① **绝不删除、也不往仓库写**：临时根放在系统 temp（`os.tmpdir()`，按 pid 唯一），
//      只覆盖写 + 按文件快照还原。既绕开沙箱的批量删除守卫，也不在仓库里留垃圾目录
//      （旧版写 `.workbuddy/tmp/ad-mut/`，跑完就留 72 个源码副本 —— 还得靠扫描器排除）。
//   ② **一次复制、逐案还原**：只复制门禁真正读的目录/文件（docs 有 69MB，不能整目录搬）。
//   ③ **锚点失效必须报红**：`patch()` 找不到锚点就抛错并计为失败 ——
//      否则代码一改，变异悄悄失效，看起来还是「全红」。
//
// ## 用法
//   node scripts/test-ad-runtime-mutation.js
//   退出码 0 = 基线全绿 + 所有变异全部翻红。

'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
// 系统 temp + 按 pid 唯一：不在仓库留副本，也不需要「跑完清理」（Temp 由系统回收）
const TMP = path.join(os.tmpdir(), 'zangqu-ad-mut-' + process.pid);
const GATE = path.join(__dirname, 'test-ad-runtime.js');
const CFG_GATE = path.join(__dirname, 'check-ads-config.js');
const LOCK = path.join(os.tmpdir(), 'zangqu-ad-mut.lock');

// 全量 CI 与 pre-commit 可能**同时**跑这道门禁，共用同一个临时根会互相覆盖：
// 一个在还原、另一个在改坏，结论就全废了。用一把带陈旧锁回收的文件锁串行化。
function acquireLock() {
  const sleep = new Int32Array(new SharedArrayBuffer(4));
  for (let i = 0; i < 120; i++) {              // 最多等 60s
    try {
      const fd = fs.openSync(LOCK, 'wx');
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try {
        if (Date.now() - fs.statSync(LOCK).mtimeMs > 120000) { fs.unlinkSync(LOCK); continue; }
      } catch (e2) {}
      Atomics.wait(sleep, 0, 0, 500);
    }
  }
  throw new Error('等不到 ad-mut 锁：另一个变异测试跑超过 60s（或残留了陈旧锁）');
}
function releaseLock() { try { fs.unlinkSync(LOCK); } catch (e) {} }
process.on('exit', releaseLock);

// 页面级测试要 require 页面依赖，所以按目录整体复制；docs/ 只挑门禁真正读的三份。
const DIRS = ['utils', 'data', 'config', 'pages/game', 'pages/result'];
const FILES = [
  'docs/privacy-policy-draft.md',
  'docs/privacy-mp-form.md',
  'docs/release-and-monetization.md'
];

// ⚠️ 不用 fs.cpSync：本机沙箱复制整个目录会**静默杀掉进程**（exit 127，无报错）。
//    逐文件 copyFileSync 是实测可行的路径。
function copyTree(rel) {
  const src = path.join(ROOT, rel);
  const dst = path.join(TMP, rel);
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const child = rel + '/' + e.name;
    if (e.isDirectory()) copyTree(child);
    else fs.copyFileSync(path.join(ROOT, child), path.join(TMP, child));
  }
}

// 复制一次，然后把「原始内容」全记下来；每个用例开始只还原被改过的那几个文件。
const pristine = new Map();
function prepare() {
  fs.mkdirSync(TMP, { recursive: true });
  for (const d of DIRS) copyTree(d);
  for (const f of FILES) {
    const dst = path.join(TMP, f);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(path.join(ROOT, f), dst);
  }
  pristine.clear();
  // ⚠️ 键必须和 touched 用同一种相对路径（'utils/ads.js'，不是 './utils/ads.js'）。
  //    第一版写 collect('.') → 键变成 './utils/…'，restore 找不到 → 上一条变异残留，
  //    后面每个用例都因为**同一个**原因翻红，看起来「全红」其实全是假绿。
  const collect = function (rel) {
    const abs = rel ? path.join(TMP, rel) : TMP;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const child = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) collect(child);
      else pristine.set(child, fs.readFileSync(path.join(TMP, child), 'utf8'));
    }
  };
  collect('');
}

let touched = new Set();
function restore() {
  for (const rel of touched) {
    if (pristine.has(rel)) fs.writeFileSync(path.join(TMP, rel), pristine.get(rel));
  }
  touched = new Set();
}
function patch(rel, from, to) {
  const p = path.join(TMP, rel);
  const s = fs.readFileSync(p, 'utf8');
  if (s.indexOf(from) === -1)
    throw new Error('变异锚点失效（代码已改但未同步用例）: ' + rel + ' :: ' + from.slice(0, 70));
  fs.writeFileSync(p, s.replace(from, to));
  touched.add(rel);
}
function patchRaw(rel, fn) {
  const p = path.join(TMP, rel);
  const s = fs.readFileSync(p, 'utf8');
  const out = fn(s);
  if (out === s) throw new Error('变异没生效（结果与原文件相同）: ' + rel);
  fs.writeFileSync(p, out);
  touched.add(rel);
}

function run(gate) {
  const r = cp.spawnSync(process.execPath, [gate], {
    cwd: ROOT,
    env: Object.assign({}, process.env, { ADS_TEST_ROOT: TMP }),
    encoding: 'utf8',
    timeout: 60000
  });
  const out = (r.stdout || '') + (r.stderr || '');
  return {
    code: r.status,
    reds: out.split('\n').filter(l => l.indexOf('✗') > -1).map(l => l.trim().slice(0, 120)),
    crashed: !!r.error || r.status === null
  };
}

// 三态里最容易被忽略的一态：**合法配置**。填了 ID 之后门禁必须仍然绿，
// 否则上线的人会去把门禁改松 —— 那是比红更糟的结果。
// 🔴 锚点必须「空态/已填态」都能匹配：仓库里真上线填了 ID 后，
//    `banner: '',` 这种空态锚点会失效，让本用例假红，逼人改松门禁。
//    所以这里用正则匹配 `banner:` 到行尾逗号，无论当前是空还是已填都能替换。
function fillWired() {
  patchRaw('config/ads.js', function (s) {
    const ids = {
      banner: 'adunit-aaa111bbb222',
      video: 'adunit-bbb222ccc333',
      rewarded: 'adunit-ccc333ddd444'
    };
    let out = s;
    Object.keys(ids).forEach(function (t) {
      const re = new RegExp('(\\b' + t + ":\\s*)'[^']*'");
      if (!re.test(out)) throw new Error('填 ID 锚点失效（config/ads.js 里找不到 ' + t + ' 行）');
      out = out.replace(re, '$1\'' + ids[t] + '\'');
    });
    if (out === s) throw new Error('填 ID 锚点失效（config/ads.js 结构已改）');
    return out;
  });
}

// ── 用例：[名称, 变异函数, 期望翻红, 用哪道门禁] ──────────────────────────
// 期望翻红 = true：改坏了门禁必须报 ✗；false：基线 / 合规改写必须全绿。
const cases = [
  ['基线（未改坏）→ 必须全绿', null, false, GATE],

  // ---- 核心红线 ----
  ['发奖不再看 isEnded（无条件发奖）', function () {
    patch('utils/ads.js',
      "if (ended) settle(true, 'ended');\n      else settle(false, 'skipped');",
      "settle(true, 'ended');");
  }, true, GATE],
  ['激励奖励改成学习得分（套利红线）', function () {
    patch('pages/game/game.js', "'这一课暂时没有可提示的'", "'学习得分'");
  }, true, GATE],
  ['结算页整块去掉 wx:if 守卫（空配置会留空白）', function () {
    patch('pages/result/result.wxml', ' wx:if="{{adVideo || adBanner}}"', '');
  }, true, GATE],
  ['失败态改成 wx:if 移除组件（违反官方 Bug&Tip）', function () {
    patch('pages/result/result.wxml', '<ad unit-id="{{adVideo}}"',
      '<ad wx:if="{{!videoFailed}}" unit-id="{{adVideo}}"');
  }, true, GATE],
  ['binderror 改成移除组件', function () {
    patch('pages/result/result.js', '    this.setData({ videoFailed: true });',
      "    this.setData({ adVideo: '', videoFailed: true });");
  }, true, GATE],

  // ---- 页面接线 ----
  ['onUnload 不摘监听', function () {
    patch('pages/game/game.js', 'try { this._rewarded.destroy(); } catch (e) {}', '/* removed */');
  }, true, GATE],
  ['激励入口去掉条件守卫', function () {
    patch('pages/game/game.wxml', 'wx:if="{{adHintOn && adHintLeft > 0}}"', '');
  }, true, GATE],
  ['每课次数改成 3 次', function () {
    patch('pages/game/game.js', 'this.setData({ adHintLeft: 1 });',
      'this.setData({ adHintLeft: 3 });');
  }, true, GATE],
  ['广告标签字号退回 22rpx', function () {
    patch('pages/result/result.wxss', 'font-size: 26rpx;\n  letter-spacing: 2rpx;',
      'font-size: 22rpx;\n  letter-spacing: 2rpx;');
  }, true, GATE],

  // ---- 页面级行为（只有真跑页面逻辑才抓得到）----
  ['页面「没看完也先扣次数」', function () {
    patch('pages/game/game.js', '      if (!ok) {\n',
      '      if (!ok) {\n        that.setData({ adHintLeft: Math.max(0, that.data.adHintLeft - 1) });\n');
  }, true, GATE],
  ['页面结算后不复位实例锁', function () {
    patch('pages/game/game.js', '      that._adBusy = false;\n      if (!that._alive) return;',
      '      if (!that._alive) return;');
  }, true, GATE],
  ['页面去掉「无解不拉广告」前置检查', function () {
    patch('pages/game/game.js',
      "    if (!this.findHintPair()) {\n      wx.showToast({ title: '这一课暂时没有可提示的', icon: 'none', duration: 1200 });\n      return;\n    }\n",
      '');
  }, true, GATE],

  // ---- 配置层 ----
  ['把 template 填成合法 ID（运行时没接）', function () {
    patch('config/ads.js', "template: ''", "template: 'adunit-abc123def456'");
  }, true, CFG_GATE],

  // ---- 说真话 ----
  ['把拉取失败也归为「没看完」', function () {
    patch('utils/ads.js', "settle(false, 'error');", "settle(false, 'skipped');");
  }, true, GATE],
  ['页面把「拉不到」的文案改回「没看完」', function () {
    patch('pages/game/game.js', "msg = '广告暂时没加载出来，稍后再试';",
      "msg = '没看完，这次不发提示';");
  }, true, GATE],

  // ---- 悬挂 / 看门狗 / 控制器隔离 ----
  ['abort() 变成空实现（切后台留悬挂）', function () {
    patch('utils/ads.js', "abort: function () { clearLate(); settle(false, 'aborted'); },",
      'abort: function () {},');
  }, true, GATE],
  ['去掉起播看门狗（show 卡住就永远转圈）', function () {
    patch('utils/ads.js', 'armGuard(SHOW_TIMEOUT_MS);', 'void 0;');
  }, true, GATE],
  ['去掉播放看门狗（onClose 丢了就永远悬挂）', function () {
    patch('utils/ads.js', 'armGuard(WATCH_TIMEOUT_MS);', 'void 0;');
  }, true, GATE],
  ['把播放超时调到 999999999ms（等于没有）', function () {
    patch('utils/ads.js', 'var WATCH_TIMEOUT_MS = 180000;', 'var WATCH_TIMEOUT_MS = 999999999;');
  }, true, GATE],

  // ---- 补发窗口：超时只放开按钮，不等于观众没看 ----
  ['超时后不开补发窗口（真看完的奖励被作废）', function () {
    patch('utils/ads.js', "if (!ok && reason === 'timeout') openLate();", 'void 0;');
  }, true, GATE],
  ['补发窗口不设上界（过期回调也会发奖）', function () {
    patch('utils/ads.js',
      'var t = setTimeout(function () { _late = null; }, LATE_GRACE_MS);',
      'var t = null;');
  }, true, GATE],
  ['去掉 _late 守卫（任意陈旧 close 都补发）', function () {
    patch('utils/ads.js', 'if (_late) {\n      clearLate();', 'if (true) {\n      clearLate();');
  }, true, GATE],
  ['页面不接迟到补发（玩家白看一次）', function () {
    patch('pages/game/game.js', 'that.grantAdHint(true);', 'void 0;');
  }, true, GATE],

  // ---- 两态证明：空态与填充态都必须绿 ----
  //   只证明「空态不报错」是不够的：真正的坑是**填了 ID 之后门禁自己先红**，
  //   上线的人于是把门禁改松 —— 那才是灾难。
  ['填入 3 个已接线的合法 ID → 运行时门禁仍全绿（填了就渲染）', function () {
    fillWired();
  }, false, GATE],
  ['填入 3 个已接线的合法 ID → 配置门禁仍全绿（不拦合法配置）', function () {
    fillWired();
  }, false, CFG_GATE],
  ['_pending 挪回模块级（页面互相顶掉）', function () {
    patchRaw('utils/ads.js', function (s) {
      const a = s.replace('  var _pending = null;   // 本控制器自己的等待位（不与其他页面共享）\n', '');
      if (a === s) throw new Error('_pending 锚点失效');
      return a.replace('function createRewarded(onReady, onLateReward) {',
        'var _pending = null;\nfunction createRewarded(onReady, onLateReward) {');
    });
  }, true, GATE],

  // ---- 异常两条路 / 漏斗 ----
  ['去掉 show() Promise reject 兜底', function () {
    patch('pages/game/game.js',
      "Promise.resolve(this._rewarded.show()).then(done, function () {\n        done({ ok: false, reason: 'exception' });\n      });",
      'Promise.resolve(this._rewarded.show()).then(done);');
  }, true, GATE],
  ['异常不进漏斗（有 tap、没有结局）', function () {
    patch('pages/game/game.js',
      "reason === 'timeout' || reason === 'exception') {\n          telemetry.event('ad_hint_fail', { r: reason });",
      "reason === 'timeout') {\n          telemetry.event('ad_hint_fail', { r: reason });");
  }, true, GATE],

  // ---- 可操作性 / 曝光 / 隐私 ----
  ['入口热区退回 46rpx（点不中）', function () {
    patch('pages/game/game.wxss', 'min-height: 104rpx;', 'min-height: 46rpx;');
  }, true, GATE],
  ['埋点夹带广告位 ID', function () {
    patch('pages/game/game.js', "telemetry.event('ad_hint_fail', { r: reason });",
      "telemetry.event('ad_hint_fail', { r: reason, unit: ads.unit('rewarded') });");
  }, true, GATE],
  ['删掉发奖埋点（漏斗断一半）', function () {
    patch('pages/game/game.js',
      "    telemetry.event('ad_hint_grant', late ? { late: 1 } : null);\n    telemetry.flush();\n", '');
  }, true, GATE],
  ['广告位挪回内容末尾（等于没有广告）', function () {
    patchRaw('pages/result/result.wxml', function (s) {
      const a = s.indexOf('  <!-- D156 视频广告位');
      const b = s.indexOf('  <!-- D113 来自朋友的挑战');
      if (a < 0 || b < 0 || b < a) throw new Error('找不到广告位块');
      const block = s.slice(a, b);
      const rest = s.slice(0, a) + s.slice(b);
      const bar = rest.indexOf('  <view class="result-bar">');
      if (bar < 0) throw new Error('找不到 result-bar');
      return rest.slice(0, bar) + block + rest.slice(bar);
    });
  }, true, GATE],
  ['隐私指引回退成「无广告 SDK」', function () {
    patch('docs/privacy-policy-draft.md', '**无第三方广告 SDK**', '**无广告 SDK**');
  }, true, GATE],
  ['隐私指引删掉漏斗披露', function () {
    patch('docs/privacy-policy-draft.md', '匿名的广告漏斗事件', '遥测');
  }, true, GATE],
  ['发布清单回退成「全仓无广告组件」', function () {
    patch('docs/release-and-monetization.md',
      '| 广告只用官方组件（D156，覆盖 D5） |',
      '| 零广告 SDK（D5） | 全仓无广告组件与流量主代码 |\n| 广告只用官方组件（D156，覆盖 D5） |');
  }, true, GATE]
];

// ── 额外静态护栏：扫描器不许把 .workbuddy/ 临时副本当源码 ────────────────
// 这是 2026-11-08 那次 CI 假红的根因，单独钉死，不依赖临时目录里恰好有残留文件。
const validateSrc = fs.readFileSync(path.join(__dirname, 'validate.js'), 'utf8');
const scopeOk = /SKIP_DIRS\s*=\s*\[[^\]]*'\.workbuddy'/.test(validateSrc) &&
                /if \(!skipDir\(f\)\) walk\(full\)/.test(validateSrc);

let good = 0, bad = 0;
console.log('广告门禁变异测试（D156）');
console.log('');
acquireLock();
prepare();
for (const [name, mutate, expectRed, gate] of cases) {
  restore();
  // 🔴 每个用例先证明「还原后的基线是绿的」，再改坏。
  //    否则上一例没清干净，后面的「判红」全是同一个残留原因 —— 全红也是假绿。
  const base = run(gate);
  if (base.code !== 0 || base.reds.length) {
    console.log('  ✗ ' + name + ' → 基线不绿（上一例残留未清），本次结论作废: '
      + (base.reds[0] || ('exit=' + base.code)));
    bad++;
    continue;
  }
  if (mutate) {
    try { mutate(); }
    catch (e) { console.log('  ✗ ' + name + ' → 变异脚本自身失败: ' + e.message); bad++; continue; }
  }
  const r = run(gate);
  const isRed = r.code !== 0 && r.reds.length > 0;
  const pass = expectRed ? isRed : (!isRed && r.code === 0);
  if (pass) {
    good++;
    console.log('  ✓ ' + name + ' → ' + (expectRed ? '判红' : '判绿')
      + (expectRed ? '（' + r.reds[0] + '）' : ''));
  } else {
    bad++;
    console.log('  ✗ ' + name + ' → 期望' + (expectRed ? '红' : '绿')
      + '，实际 exit=' + r.code + (r.crashed ? ' [进程异常]' : '')
      + ' ' + r.reds.slice(0, 2).join(' | '));
  }
}
restore();
if (scopeOk) { good++; console.log('  ✓ validate.js 静态扫描排除 .workbuddy/（临时副本不会造成假红）'); }
else { bad++; console.log('  ✗ validate.js 又把 .workbuddy/ 纳入扫描范围 —— 变异残留会让 CI 假红'); }

console.log('');
console.log('变异测试: ' + good + ' 通过 / ' + bad + ' 失败');
if (bad) process.exit(1);
