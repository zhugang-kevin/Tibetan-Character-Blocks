#!/usr/bin/env node
// scripts/test-ad-runtime.js — D156 视频广告「运行链路」门禁
//
// ## 为什么不能只有 check-ads-config.js
//   check-ads-config 只查 6 个 ID 字符串。它查不出这些**静默失效**：
//     · <ad> 没挂 wx:if → 流量主没开通时页面多一块空白
//     · 奖励判据写成 resolve(true) → 中途关掉视频也发奖（官方明确违规）
//     · 广告换酥油灯/哈达/道具/学习得分 → 绕开虚拟支付，属违规套利
//     · onUnload 不 destroy() → 单例回调累积，重复发提示
//     · 入口浮在盘面上 → 真点自检 elementFromPoint 点空
//   本门禁把「配置 → 实例 → 展示 → 结算 → 卸载」整条链钉死。
//
// ## 用法
//   node scripts/test-ad-runtime.js
//   ADS_TEST_ROOT=<临时目录> node scripts/test-ad-runtime.js   # 变异测试用
//
// ## 口径
//   6 个广告位全空 = 未开通流量主，是**正常状态**，不判红；
//   但即便如此也要证明「不会创建实例、不会渲染入口」。
//
// ## 判据纪律
//   文字判据一律先过 stripComments()：本文件之外的解释性注释里必须写明
//   「不得用广告换酥油灯」，不剥注释就会自己把自己判红（本项目踩过两次）。

'use strict';
const path = require('path');
const fs = require('fs');

const ROOT = process.env.ADS_TEST_ROOT
  ? path.resolve(process.env.ADS_TEST_ROOT)
  : path.join(__dirname, '..');
const R = p => path.join(ROOT, p);
const read = p => fs.readFileSync(R(p), 'utf8');

let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✓ ' + m); };
const err = m => { fail++; console.log('  ✗ ' + m); };

// 🔴 假绿护栏：如果某个 Promise 永远不 settle（典型：abort()/destroy() 忘了收），
//    事件循环会直接空掉，Node 以 **exit 0** 退出 —— 门禁看起来"通过"，其实根本没跑完。
//    这条用 beforeExit 兜住：没走到汇总就退出 = 判红。
let COMPLETED = false;
process.on('beforeExit', function () {
  if (COMPLETED) return;
  console.error('');
  console.error('  ✗ 门禁没跑完就退出了：有 Promise 永远没有 settle。');
  console.error('    这不是「通过」—— 多半是 abort() / destroy() 没把等待中的观看收掉。');
  process.exitCode = 1;
});

// 剥掉 HTML / CSS / JS 注释，只看会渲染 / 会执行的部分
function stripComments(text) {
  text = text.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  return text.split('\n').map(l => {
    const i = l.indexOf('//'), u = l.indexOf('://');
    return (i === -1 || (u !== -1 && u < i)) ? l : l.slice(0, i);
  }).join('\n');
}

// 把 utils/ads.js 连同「被替换掉的 config/ads.js」一起重新加载。
// 这样能在不碰仓库文件的前提下，同时测「未配置」与「已配置」两种世界。
function loadAdsWith(cfg, wxObj) {
  const cfgPath = R('config/ads.js');
  const adsPath = R('utils/ads.js');
  const savedCfg = require.cache[cfgPath];
  const savedAds = require.cache[adsPath];
  const hadWx = Object.prototype.hasOwnProperty.call(global, 'wx');
  const savedWx = global.wx;
  delete require.cache[adsPath];
  require.cache[cfgPath] = {
    id: cfgPath, filename: cfgPath, loaded: true, exports: cfg, children: [], paths: []
  };
  if (wxObj === null) delete global.wx;
  else global.wx = wxObj;
  const ads = require(adsPath);
  return {
    ads: ads,
    restore: function () {
      delete require.cache[adsPath];
      if (savedCfg) require.cache[cfgPath] = savedCfg;
      else delete require.cache[cfgPath];
      if (savedAds) require.cache[adsPath] = savedAds;
      if (hadWx) global.wx = savedWx;
      else delete global.wx;
    }
  };
}

// 官方激励视频的最小替身：记录调用顺序 + 可手动触发 load/error/close
function fakeAd(opts) {
  opts = opts || {};
  const calls = [], h = {};
  let showCount = 0;
  const ad = {
    show: function () {
      calls.push('show'); showCount++;
      if (opts.hangShow) return new Promise(function () {});   // 永不 settle：模拟起播卡死
      if (opts.failFirstShow && showCount === 1) return Promise.reject(new Error('not loaded'));
      return Promise.resolve();
    },
    load: function () { calls.push('load'); return Promise.resolve(); },
    onLoad: function (f) { h.load = f; calls.push('onLoad'); },
    onError: function (f) { h.error = f; calls.push('onError'); },
    onClose: function (f) { h.close = f; calls.push('onClose'); },
    offLoad: function () { calls.push('offLoad'); delete h.load; },
    offError: function () { calls.push('offError'); delete h.error; },
    offClose: function () { calls.push('offClose'); delete h.close; },
    _calls: calls, _h: h
  };
  if (opts.noLoad) delete ad.load;
  return ad;
}

const VALID_ID = 'adunit-abc123def456';
const TYPES = ['banner', 'rewarded', 'interstitial', 'video', 'videoPatch', 'template'];
// 故意写死：把 utils/ads.js 的常量调大时，这条测试必须**翻红**，而不是跟着一起变绿。
const WATCH_TICK = 181000;
const LATE_TICK = 91000;      // > LATE_GRACE_MS(90s)：补发窗口必须已经关闭

async function main() {
  console.log('视频广告运行链路自检（D156）');
  console.log('');

  // ── A. 配置层：全空 = 未开通，必须完全静默 ────────────────────────────
  let cfg;
  try { cfg = require(R('config/ads.js')) || {}; }
  catch (e) { err('config/ads.js 读不出来：' + e.message); cfg = {}; }
  if (TYPES.every(t => Object.prototype.hasOwnProperty.call(cfg, t)))
    ok('config/ads.js 6 类广告位键齐全');
  else err('config/ads.js 缺广告位键');

  {
    const ad = fakeAd();
    let created = 0;
    const h = loadAdsWith({}, { createRewardedVideoAd: function () { created++; return ad; } });
    const emptyAll = TYPES.every(t => h.ads.unit(t) === '' && !h.ads.enabled(t));
    if (emptyAll) ok('未配置时 6 个 unit() 全为空 → 页面 wx:if 整块不渲染');
    else err('未配置时 unit() 返回了非空值');
    if (h.ads.createRewarded(function () {}) === null) ok('未配置时 createRewarded() 返回 null（不展示假入口）');
    else err('未配置时仍创建了激励视频控制器');
    if (created === 0) ok('未配置时 wx.createRewardedVideoAd 一次都没被调用');
    else err('未配置时创建了广告实例（会静默拉广告 / 报错）');
    h.restore();
  }
  {
    const h = loadAdsWith({}, null);   // H5 / 单元测试里没有 wx
    if (h.ads.createRewarded(function () {}) === null) ok('无 wx 全局时静默降级，不抛错');
    else err('无 wx 全局时抛错或创建了实例');
    h.restore();
  }
  {
    const h = loadAdsWith({ rewarded: VALID_ID }, {});  // 有 wx 但基础库不支持
    if (h.ads.createRewarded(function () {}) === null) ok('基础库不支持该 API 时静默降级');
    else err('基础库不支持时仍创建了实例');
    h.restore();
  }

  // ── B. 运行层：真实调用顺序 + 发奖判据 ───────────────────────────────
  {
    const ad = fakeAd();
    let created = 0, usedId = '';
    const h = loadAdsWith({ rewarded: VALID_ID }, {
      createRewardedVideoAd: function (o) { created++; usedId = o.adUnitId; return ad; }
    });
    let ready = null;
    const ctrl = h.ads.createRewarded(function (r) { ready = r; });
    if (ctrl && created === 1 && usedId === VALID_ID)
      ok('配置合法时按 unit(\'rewarded\') 创建且仅创建一个实例');
    else err('实例创建失败 / 数量不对 / ID 传错');
    if (ad._calls.slice(0, 3).every(c => /^off/.test(c)))
      ok('挂载监听前先 off*（官方：单例重复挂载会累积回调）');
    else err('未先摘旧监听：' + ad._calls.slice(0, 3).join(','));
    if (['onLoad', 'onError', 'onClose'].every(c => ad._calls.indexOf(c) > -1))
      ok('onLoad / onError / onClose 三个监听齐全');
    else err('监听缺失');

    if (ad._h.load) { ad._h.load(); }
    if (ready === true) ok('bindload → 入口才显示（未拉取成功不出现死按钮）');
    else err('拉取成功没有通知页面显示入口');
    if (ad._h.error) { ad._h.error(); }
    if (ready === false) ok('拉取失败 → 入口收起');
    else err('拉取失败没有通知页面收起入口');

    const p1 = ctrl.show(); ad._h.close({ isEnded: true });
    const r1 = await p1;
    if (r1 && r1.ok === true && r1.reason === 'ended')
      ok('完整看完 → {ok:true, reason:"ended"}');
    else err('完整看完的结果不对：' + JSON.stringify(r1));
    const p2 = ctrl.show(); ad._h.close({ isEnded: false });
    const r2 = await p2;
    if (r2 && r2.ok === false && r2.reason === 'skipped')
      ok('中途关掉 → reason="skipped"（与"拉不到"分开，页面才能说真话）');
    else err('中途关掉的结果不对：' + JSON.stringify(r2));
    const p3 = ctrl.show(); ad._h.close({});
    const r3 = await p3;
    if (r3 && r3.ok === false && r3.reason === 'skipped')
      ok('close 回调缺 isEnded → 按"没看完"处理，不发奖');
    else err('close 回调缺字段仍发了奖');
    const p4 = ctrl.show(); ad._h.error();
    const r4 = await p4;
    if (r4 && r4.ok === false && r4.reason === 'error')
      ok('拉取出错 → reason="error"（页面据此说"没加载出来"，不赖玩家）');
    else err('拉取出错的结果不对：' + JSON.stringify(r4));
    const p5 = ctrl.show(); const p6 = ctrl.show();
    const r6 = await p6;
    if (r6 && r6.reason === 'busy') { ad._h.close({ isEnded: true }); }
    const r5 = await p5;
    if (r5 && r5.ok === true && r6 && r6.reason === 'busy')
      ok('连点只结算一次（第二次 reason="busy"，静默不提示）');
    else err('连点会重复发奖');

    // 切后台：必须能把等待中的观看收掉，否则回到前台按钮变成"点了没反应"
    // 加超时竞速：万一 abort 没生效，这里给出明确的 TIMEOUT，而不是让整条门禁静默挂死
    const p7 = ctrl.show();
    ctrl.abort();
    const r7 = await Promise.race([
      p7,
      new Promise(function (res) { setTimeout(function () { res({ ok: null, reason: 'TIMEOUT' }); }, 60); })
    ]);
    if (r7 && r7.ok === false && r7.reason === 'aborted')
      ok('abort() 收掉等待中的观看（切后台不留悬挂）');
    else err('abort() 没生效：' + JSON.stringify(r7));
    const p8 = ctrl.show(); ad._h.close({ isEnded: true });
    const r8 = await p8;
    if (r8 && r8.ok === true) ok('abort 之后仍能重新拉起并正常结算');
    else err('abort 之后无法再观看');

    const before = ad._calls.length;
    ctrl.destroy();
    if (ad._calls.slice(before).filter(c => /^off/.test(c)).length === 3)
      ok('destroy() 摘掉三个监听（页面卸载必须调）');
    else err('destroy() 没有摘干净');
    const p9 = ctrl.show();
    ctrl.destroy();
    const r9 = await Promise.race([
      p9,
      new Promise(function (res) { setTimeout(function () { res({ ok: null, reason: 'TIMEOUT' }); }, 60); })
    ]);
    if (r9 && r9.reason === 'destroyed')
      ok('destroy() 也把等待中的观看收成 reason="destroyed"');
    else err('destroy() 没处理等待中的观看：' + JSON.stringify(r9));
    h.restore();
  }
  {
    const ad = fakeAd({ failFirstShow: true });
    const h = loadAdsWith({ rewarded: VALID_ID }, { createRewardedVideoAd: function () { return ad; } });
    const ctrl = h.ads.createRewarded(function () {});
    const p = ctrl.show();
    await new Promise(r => setTimeout(r, 30));      // 让 show() 失败 → load() → show() 的链跑完
    if (ad._calls.indexOf('load') > -1 && ad._calls.filter(c => c === 'show').length === 2)
      ok('show() 失败时 load() 重拉后再 show() 一次（官方推荐路径）');
    else err('show() 失败没有重拉：' + ad._calls.join(','));
    ad._h.close({ isEnded: true });
    const rr = await p;
    if (rr && rr.ok === true) ok('重拉成功后仍能正常结算');
    else err('重拉成功后结算丢失：' + JSON.stringify(rr));
    h.restore();
  }
  {
    const ad = fakeAd({ failFirstShow: true, noLoad: true });
    const h = loadAdsWith({ rewarded: VALID_ID }, { createRewardedVideoAd: function () { return ad; } });
    const ctrl = h.ads.createRewarded(function () {});
    const p = ctrl.show();
    const rf = await p;
    if (rf && rf.ok === false && rf.reason === 'failed')
      ok('show() 失败且无 load() → 收敛为 reason="failed"，不悬挂 Promise');
    else err('无法重拉时 Promise 悬挂 / 结果不对：' + JSON.stringify(rf));
    h.restore();
  }

  // 起播看门狗：show() 卡死时不能让按钮永远停在「正在准备…」
  {
    const { installFakeTimers } = require('./lib/mini-stub.js');
    const timers = installFakeTimers();
    try {
      const ad = fakeAd({ hangShow: true });
      const h = loadAdsWith({ rewarded: VALID_ID }, { createRewardedVideoAd: function () { return ad; } });
      const ctrl = h.ads.createRewarded(function () {});
      const p = ctrl.show();
      timers.tick(13000);
      const r = await Promise.race([
        p,
        new Promise(function (res) { setImmediate(function () { res({ ok: null, reason: 'HANG' }); }); })
      ]);
      if (r && r.ok === false && r.reason === 'timeout')
        ok('show() 卡住 12 秒 → reason="timeout"（按钮不会永远转圈）');
      else err('起播看门狗失效：' + JSON.stringify(r));
      h.restore();
    } finally {
      timers.restore();
    }
  }
  // 播放阶段看门狗：show() 已成功、但 onClose 永不来（组件被系统回收 / 回调丢失）
  {
    const { installFakeTimers } = require('./lib/mini-stub.js');
    const timers = installFakeTimers();
    try {
      const ad = fakeAd();
      const h = loadAdsWith({ rewarded: VALID_ID }, { createRewardedVideoAd: function () { return ad; } });
      const ctrl = h.ads.createRewarded(function () {});
      const p = ctrl.show();
      // 让 Promise.resolve().then(doShow).then(onStarted) 链走完（setImmediate 没被假定时器接管）
      await new Promise(function (res) { setImmediate(res); });
      timers.tick(WATCH_TICK);
      const r = await Promise.race([
        p,
        new Promise(function (res) { setImmediate(function () { res({ ok: null, reason: 'HANG' }); }); })
      ]);
      if (r && r.ok === false && r.reason === 'timeout')
        ok('show() 已起播但 onClose 永不来 → 播放看门狗收敛（按钮不永久转圈）');
      else err('播放阶段没有收口：' + JSON.stringify(r));
      h.restore();
    } finally {
      timers.restore();
    }
  }
  // 补发窗口：**超时收口 ≠ 观众没看**。
  //   组件丢一次 onClose，玩家可能真看完了；不能让奖励跟着回调一起消失。
  {
    const { installFakeTimers } = require('./lib/mini-stub.js');
    const timers = installFakeTimers();
    try {
      const ad = fakeAd();
      const h = loadAdsWith({ rewarded: VALID_ID }, { createRewardedVideoAd: function () { return ad; } });
      let late = 0, lateArg = null;
      const ctrl = h.ads.createRewarded(function () {}, function (r) { late++; lateArg = r; });
      // 让 show() 的 Promise 链跑到 armGuard(WATCH_TIMEOUT_MS) 之后再推进假时钟
      const started = function () { return new Promise(function (res) { setImmediate(res); }); };

      const p1 = ctrl.show();
      await started();
      timers.tick(WATCH_TICK);                       // 播放看门狗收口
      const r1 = await p1;
      if (r1 && r1.reason === 'timeout') ok('（前置）播放看门狗把按钮先放开，reason="timeout"');
      else err('前置失败：超时没有收口');
      ad._h.close({ isEnded: true });                 // 迟到的「看完了」
      if (late === 1 && lateArg && lateArg.ok === true && lateArg.reason === 'ended')
        ok('超时后迟到的 onClose(isEnded) → 补发一次（玩家不白看）');
      else err('迟到回调没有补发，玩家的观看被作废：late=' + late);
      ad._h.close({ isEnded: true });
      if (late === 1) ok('补发只发一次（重复 onClose 不重复发奖）');
      else err('补发重复触发：late=' + late);

      // 窗口过期：不能过一会儿突然发奖
      const p2 = ctrl.show();
      await started();
      timers.tick(WATCH_TICK);
      await p2;
      timers.tick(LATE_TICK);
      ad._h.close({ isEnded: true });
      if (late === 1) ok('补发窗口过期后迟到的 onClose 彻底作废（不会凭空发奖）');
      else err('补发窗口没有边界，过期回调仍会发奖：late=' + late);

      // 新一次观看必须关掉上一次的补发窗口
      const p3 = ctrl.show();
      await started();
      timers.tick(WATCH_TICK);
      await p3;
      const p4 = ctrl.show();                        // 新观看：清掉旧窗口
      await Promise.resolve(); await Promise.resolve();
      ad._h.close({ isEnded: true });
      const r4 = await p4;
      if (r4 && r4.ok === true && late === 1)
        ok('新一次观看会关掉上一次的补发窗口（旧 close 只能结算新观看，不会双发）');
      else err('新观看没有清窗口 / 旧 close 被当成补发：late=' + late + ' r4=' + JSON.stringify(r4));

      // abort / destroy 必须让窗口失效（人已经离开，不该再补）
      const p5 = ctrl.show();
      await started();
      timers.tick(WATCH_TICK);
      await p5;
      ctrl.abort();
      ad._h.close({ isEnded: true });
      if (late === 1) ok('abort() 关掉补发窗口（切后台后不再补发）');
      else err('abort() 没关补发窗口：late=' + late);

      const p6 = ctrl.show();
      await started();
      timers.tick(WATCH_TICK);
      await p6;
      ctrl.destroy();
      // destroy 已经把 onClose 摘掉：迟到回调理应根本进不来（比"进来了但不发"更彻底）
      const gone = typeof ad._h.close !== 'function';
      if (gone && late === 1) ok('destroy() 摘掉监听并关掉补发窗口（页面卸载后不可能再补发）');
      else err('destroy() 后仍可能补发：gone=' + gone + ' late=' + late);
      h.restore();
    } finally {
      timers.restore();
    }
  }
  // 两个控制器互不影响（_pending 必须是每控制器一份）
  {
    const adA = fakeAd(), adB = fakeAd();
    let n = 0;
    const h = loadAdsWith({ rewarded: VALID_ID }, {
      createRewardedVideoAd: function () { n++; return n === 1 ? adA : adB; }
    });
    const a = h.ads.createRewarded(function () {});
    const b = h.ads.createRewarded(function () {});
    const pa = a.show();                     // A 在等结算
    const pb = b.show();                     // B 不该被 A 拖成 busy
    await Promise.resolve(); await Promise.resolve();
    const bStarted = adB._calls.indexOf('show') > -1;
    adB._h.close({ isEnded: true });
    const rb = await pb;
    if (bStarted && rb && rb.ok === true)
      ok('两个控制器互不影响：A 等待中，B 仍能正常起播并结算');
    else err('控制器之间互相顶掉（_pending 又共享了）：' + JSON.stringify(rb));
    adA._h.close({ isEnded: true });
    const ra = await pa;
    if (ra && ra.ok === true) ok('A 的结算没有被 B 影响');
    else err('A 的结算丢失：' + JSON.stringify(ra));
    h.restore();
  }

  // ── C. 静态接线：页面必须「有条件地」渲染广告 ───────────────────────
  const adsJs = read('utils/ads.js');
  const adsCode = stripComments(adsJs);
  const resultWxml = stripComments(read('pages/result/result.wxml'));
  const resultJs = stripComments(read('pages/result/result.js'));
  const gameWxml = stripComments(read('pages/game/game.wxml'));
  const gameJs = stripComments(read('pages/game/game.js'));
  const gameWxss = read('pages/game/game.wxss');
  const resultWxss = read('pages/result/result.wxss');

  const okSettles = (adsCode.match(/settle\(true,/g) || []).length;
  // 判据拆成两行：`var ended = !!(res && res.isEnded)` + `if (ended) settle(true, 'ended')`。
  // 两行都必须原样在，且 settle(true) 全仓只能出现一次 —— 不能有第二条发奖后门。
  if (/var ended = !!\(res && res\.isEnded\);/.test(adsCode) &&
      /if \(ended\) settle\(true, 'ended'\);/.test(adsCode) && okSettles === 1)
    ok('唯一发奖判据 = res && res.isEnded（settle(true) 全仓仅此一处）');
  else err('发奖判据被改坏 / 出现第二个 settle(true) 后门（命中 ' + okSettles + ' 处）');
  if (['skipped', 'error', 'failed', 'busy', 'destroyed', 'aborted', 'timeout']
    .every(r => adsCode.indexOf("'" + r + "'") > -1))
    ok('失败原因分级齐全（skipped / error / failed / busy / destroyed / aborted / timeout），不是一律 false');
  else err('失败原因没有分级：页面只能对玩家说「没看完」');
  const pendingAt = adsCode.indexOf('var _pending = null;');
  const factoryAt = adsCode.indexOf('function createRewarded');
  if (pendingAt > -1 && factoryAt > -1 && pendingAt > factoryAt)
    ok('_pending 在控制器闭包里（不是模块级共享：多页面不会互相顶掉）');
  else err('_pending 又回到模块级：一个页面等待中，另一个页面会被判 busy');
  if (/armGuard\(SHOW_TIMEOUT_MS\)/.test(adsCode) &&
      /armGuard\(WATCH_TIMEOUT_MS\)/.test(adsCode) &&
      /var WATCH_TIMEOUT_MS = 180000;/.test(adsCode))
    ok('两段看门狗都在（起播 12s + 播放 180s）：少一段就会留一个永久转圈的按钮');
  else err('看门狗只剩一段：show() 卡住或 onClose 丢失时 _pending 会永久悬挂');
  // 补发窗口：超时只放开按钮，不等于观众没看；但窗口必须有上界，不能无限补
  if (/var LATE_GRACE_MS = 90000;/.test(adsCode) &&
      /if \(_late\) \{/.test(adsCode) &&
      /onLateReward\(outcome\(true, 'ended'\)\)/.test(adsCode))
    ok('补发窗口有上界、且只在窗口内补发（真看完的奖励不被一次丢失的回调作废）');
  else err('补发窗口缺失 / 无上界：onClose 丢一次就把玩家真看完的奖励作废了');
  // 只验「接线」；埋点是否存在由上面 needEv 单独验 —— 否则删埋点会在这里报成"没接补发"，误导排查
  if (/grantAdHint\(true\)/.test(gameJs) && /grantAdHint: function \(late\)/.test(gameJs))
    ok('页面把迟到补发接到同一发奖入口（次数是幂等闸门，不可能双发）');
  else err('页面没有接迟到补发：看门狗收口后玩家白看一次');
  if (/var settled = false;/.test(gameJs) && /if \(settled\) return;/.test(gameJs) &&
      /Promise\.resolve\(this\._rewarded\.show\(\)\)\.then\(done,/.test(gameJs) &&
      /reason: 'exception'/.test(gameJs))
    ok('异常两条路都归一且幂等：Promise reject / 同步抛错都结算一次，漏斗不断流');
  else err('show() 被 reject 时 done 不会跑 → 按钮永久「正在准备…」，且漏斗凭空断流');
  if (/if \(!enabled\('rewarded'\)\) return null;/.test(adsCode) &&
      /typeof wx === 'undefined'/.test(adsCode))
    ok('两道降级守卫齐全（未配置 / 无 wx）');
  else err('降级守卫缺失');

  // 红线：注释里必须写明「不得换酥油灯」，所以判据只看去注释后的可执行代码
  // ⚠️ star/score 必须整词匹配：上一版写 /star/ 时，变量名 `started` 就把它判红了
  //    （假红比假绿更致命 —— 它会让人学会绕开门禁）。
  const REDLINE = /酥油灯|哈达|道具|学习得分|积分|星级|金币|\bstar\b|\bscore\b/;
  const adBlock = gameJs.slice(gameJs.indexOf('onTapAdHint:'), gameJs.indexOf('onUnload:'));
  if (!REDLINE.test(adBlock) && !REDLINE.test(adsCode))
    ok('奖励不触碰任何虚拟商品 / 学习得分（广告套利红线）');
  else err('激励视频奖励里出现自家虚拟商品或学习得分');
  // 反向自测：合规文案不得被误判；注释剥离器本身必须有效
  if (!REDLINE.test('这一课暂时没有可提示的') &&
      !REDLINE.test('var started = 1;') &&          // 变量名不许被误判（实测踩过）
      stripComments('// 注释里写酥油灯不算').indexOf('酥油灯') === -1 &&
      stripComments('var x = "酥油灯";').indexOf('酥油灯') > -1)
    ok('红线判据反向自测：注释豁免 / 字符串命中 均成立');
  else err('红线判据或注释剥离器失效');

  const adTags = resultWxml.match(/<ad\b[^>]*>/g) || [];
  if (adTags.length >= 2 && adTags.every(t => /bindload=/.test(t) && /binderror=/.test(t)))
    ok('结算页 video + banner 两个 <ad> 都同时挂了 bindload / binderror');
  else err('<ad> 数量不足或事件绑定不全（video 与 banner 退路都要有）');
  if (adTags.every(t => !/wx:(if|elif)=/.test(t)))
    ok('失败态用 hidden 隐藏父容器，不用 wx:if 移除组件（官方 Bug&Tip 第 4 条）');
  else err('<ad> 被 wx:if 直接控制：出错后组件被移除，就再也收不到 bindload');
  if (/hidden="\{\{videoFailed\}\}"/.test(resultWxml) && /hidden="\{\{bannerFailed\}\}"/.test(resultWxml))
    ok('video / banner 失败态各自独立（video 挂了 banner 才真正兜底）');
  else err('失败态没有按位记录：一个挂了会把另一个也一起隐藏');
  if (/wx:if="\{\{adVideo \|\| adBanner\}\}"/.test(resultWxml) && /ad-type="video"/.test(resultWxml))
    ok('视频广告位存在，且整块由 adVideo / adBanner 双开关控制');
  else err('视频广告位或父容器开关缺失');
  // 位置：必须排在统计/收藏区**之前**，否则要下滑一两屏才看得到（实测 668~1108px），等于没广告
  const adAt = resultWxml.indexOf('class="ad-slot"');
  const lateAt = Math.min.apply(null, ['stat-v', 'chips', 'result-bar']
    .map(function (k) { return resultWxml.indexOf(k); })
    .filter(function (i) { return i > -1; }));
  if (adAt > -1 && lateAt > -1 && adAt < lateAt)
    ok('广告位在成绩区之后、统计/收藏区之前（首屏可见，不是"滑到底才看到"）');
  else err('广告位又被挪到内容末尾了：四档机型都要下滑一屏以上，等于没有广告');
  if (/onVideoError: function \(\) \{[\s\S]{0,90}videoFailed: true/.test(resultJs) &&
      !/onVideoError[\s\S]{0,200}adVideo: ''/.test(resultJs))
    ok('binderror 只隐藏父容器，不移除 <ad>（移除后收不到 bindload）');
  else err('binderror 处理写错：移除组件会永久失去广告');
  if (/onVideoLoad: function \(\)[\s\S]{0,140}videoFailed: false/.test(resultJs) &&
      /onBannerLoad: function \(\)[\s\S]{0,140}bannerFailed: false/.test(resultJs))
    ok('bindload 恢复对应位的显示');
  else err('bindload 没有恢复显示');

  if (/wx:if="\{\{adHintOn && adHintLeft > 0\}\}"/.test(gameWxml) && /bindtap="onTapAdHint"/.test(gameWxml))
    ok('激励入口只在「广告已拉取成功 + 本课还有次数」时出现');
  else err('激励入口缺条件守卫（会出现点了没反应的假按钮）');
  if (/\.hint-row\s*\{[\s\S]{0,180}?\}/.test(gameWxss) &&
      !/\.hint-row\s*\{[^}]*position:\s*(absolute|fixed)/.test(gameWxss))
    ok('入口在文档流里，不是浮层（不会挡住牌 / 不会让真点点空）');
  else err('入口用了绝对定位，会盖住盘面');
  if (/item\.hinted \? 'hinted' : ''/.test(gameWxml))
    ok('提示高亮挂在牌的 class 上（纯视觉）');
  else err('提示高亮未接进盘面渲染');

  if (/adHintLeft: 1/.test(gameJs) && !/adHintLeft: [2-9]/.test(gameJs))
    ok('每课上限 1 次提示（核心进度不绑广告）');
  else err('每课次数上限被改坏');
  if (/onTapAdHint: function/.test(gameJs) && /this\._rewarded\.show\(\)/.test(adBlock))
    ok('show() 只出现在 bindtap 回调里（官方：必须用户主动触发）');
  else err('show() 不在点击回调里 / 入口没接');
  // 「只有完整看完才扣次数」——发奖逻辑现在集中在 grantAdHint（正常看完 / 迟到补发共用），
  // 所以判据改成三条：① 扣次数只在这一处（全仓 1 次）② 失败分支先 return ③ 成功路径才调它。
  const decCount = (gameJs.match(/adHintLeft: Math\.max/g) || []).length;
  const failReturn = adBlock.indexOf('if (!ok)');
  const callGrant = adBlock.indexOf('grantAdHint(false)');
  const grantFn = gameJs.slice(gameJs.indexOf('grantAdHint: function'), gameJs.indexOf('onTapAdHint:'));
  if (decCount === 1 && /adHintLeft: Math\.max/.test(grantFn) &&
      failReturn > -1 && callGrant > failReturn)
    ok('只有完整看完才扣次数（唯一扣减点在发奖函数内；中途退出不消耗玩家机会）');
  else err('扣次数脱离了发奖判据（中途退出也会扣）：decCount=' + decCount);
  if (/findHintPair: function/.test(gameJs) && /match3\.swapMakesLine/.test(gameJs))
    ok('提示基于真实盘面找一手，不是写死的假高亮');
  else err('提示没有走盘面判定');
  if (/onUnload: function[\s\S]{0,600}_rewarded\.destroy\(\)/.test(gameJs))
    ok('onUnload 摘监听（页面级单例不累积）');
  else err('onUnload 没有 destroy()');
  if (/onHide: function[\s\S]{0,600}_rewarded\.abort/.test(gameJs))
    ok('onHide 调 abort()：切后台不留悬挂，回来还能再点');
  else err('onHide 没有 abort()：切后台后按钮会变成「点了没反应」');
  // 只截「原因 → 文案」这一段再判，不用固定字符窗口：
  // 上一版写 {0,90}，往分支里多加一个 reason 就把窗口撑爆 → **假红**（比假绿更致命）。
  const reasonMsg = gameJs.slice(gameJs.indexOf("if (reason === 'skipped')"),
                                 gameJs.indexOf('if (msg) wx.showToast'));
  if (/if \(reason === 'skipped'\) msg = '没看完，这次不发提示'/.test(reasonMsg) &&
      /msg = '广告暂时没加载出来，稍后再试'/.test(reasonMsg) &&
      ['error', 'failed', 'timeout', 'exception'].every(function (r) {
        return reasonMsg.indexOf("reason === '" + r + "'") > -1;
      }))
    ok('页面按原因给文案：没看完 / 没加载出来 / 超时 / 异常，不混为一谈（不赖玩家）');
  else err('页面把「没看完」和「拉不到」混为一谈，或漏了某个失败原因');

  const tiny = [];
  [['pages/game/game.wxss', gameWxss], ['pages/result/result.wxss', resultWxss]].forEach(function (pair) {
    let m; const re = /font-size:\s*(\d+(?:\.\d+)?)rpx/g;
    while ((m = re.exec(pair[1]))) if (parseFloat(m[1]) < 26) tiny.push(pair[0] + ' ' + m[1] + 'rpx');
  });
  if (!tiny.length) ok('新增广告样式字号全部 ≥ 26rpx（320pt 小屏可读）');
  else err('字号低于 26rpx：' + tiny.slice(0, 3).join('；'));

  // 触摸热区：44 CSS px 是通用下限。320pt 机型 1rpx≈0.4267px → 必须 ≥104rpx。
  // 原来 <text> + padding 10rpx 总高约 46rpx（≈23px），只有下限的一半。
  if (/\.hint-btn\s*\{[^}]*min-height:\s*104rpx/.test(gameWxss) &&
      /\.hint-btn\s*\{[^}]*display:\s*flex/.test(gameWxss))
    ok('激励入口热区 ≥ 104rpx（320pt 也有 44px，不是 23px 的"小字块"）');
  else err('激励入口热区不足 44px：小屏上会点不中');
  if (/hover-class="hint-btn-press"/.test(gameWxml) && /aria-role="button"/.test(gameWxml))
    ok('入口有按下反馈 + aria-role（可感知、可被读屏识别为按钮）');
  else err('入口缺按下反馈或 aria-role');

  // 可观测性：上线后必须能回答"按钮出现了吗 / 点了有没有成"
  const needEv = ['ad_hint_tap', 'ad_hint_grant', 'ad_hint_fail'];
  const missEv = needEv.filter(function (e) { return gameJs.indexOf("'" + e + "'") === -1; });
  if (!missEv.length) ok('激励漏斗三事件齐全（tap / grant / fail）');
  else err('激励漏斗缺事件：' + missEv.join('、') + ' —— 上线后查不出问题在哪');
  if (/ad_hint_fail', \{ r: reason \}\)/.test(gameJs))
    ok('失败事件只带原因枚举（r=reason）');
  else err('失败事件没带原因，或结构被改坏');
  if (/ad_slot_error', \{ slot: 'video' \}\)/.test(resultJs) &&
      /ad_slot_error', \{ slot: 'banner' \}\)/.test(resultJs))
    ok('结算页两个广告位失败都会上报（slot=video / banner）');
  else err('结算页广告位失败没有上报，出问题只能靠猜');
  // 隐私红线：埋点里不得夹带广告位 ID（那是可关联标识，不该出现在遥测里）
  const telBlocks = (gameJs + resultJs).match(/ad_(hint|slot)[\s\S]{0,120}?\);/g) || [];
  if (telBlocks.every(function (b) { return !/adunit|unit-id|adVideo|adBanner|unit\(/.test(b); }))
    ok('埋点不含广告位 ID / 广告单元（只记原因与位次）');
  else err('埋点里夹带了广告位 ID —— 遥测不应出现可关联标识');

  // ── D. 页面级行为：激励入口必须真的「看完才发、只发一次」 ──────────────
  //    为什么必须单列：utils/ads.js 只保证「Promise 语义对」。
  //    页面把 Promise 用错（先扣次数、忘了复位 busy、重复发奖、无解也拉广告），
  //    光看 utils/ads.js 一条都抓不到。
  //
  //    ⚠️ 页面走 R()（跟随 ADS_TEST_ROOT）：变异测试会把 utils/ data/ config/ pages/
  //       一起复制到临时根，所以页面逻辑本身也能被变异验证，而不是只验静态文本。
  {
    const { createMiniEnv, loadPage, installFakeTimers } = require('./lib/mini-stub.js');
    const GAME_PAGE = R('pages/game/game.js');
    const flush = function () { return new Promise(function (r) { setImmediate(r); }); };

    const timers = installFakeTimers();
    // ⚠️ 异步回调（.then/done）会在 __withWx 还原之后才跑，那时 global.wx 已经没了。
    //   真机上 wx 永远存在，所以这里给整段撑一个 stub，而不是给单个调用撑。
    const prevWx = global.wx;
    const sharedEnv = createMiniEnv();
    global.wx = sharedEnv.wx;
    // ⚠️ telemetry 经 utils/platform.js 缓存 wx adapter。先复位并在**当前桩**上预热一次，
    //    否则首个埋点可能落在 loadPage 临时挂的 env0 上，后面的存储断言读不到（假红）。
    try {
      require(R('utils/platform.js')).__setAdapter(null);
      require(R('utils/telemetry.js')).event('__warmup');
    } catch (e) {}
    // 页面里的 wx.showToast 会落到这个共享桩上 —— 用它验证「说的是真话」
    const toasts = function () {
      return sharedEnv.wx.__calls
        .filter(function (c) { return c.api === 'showToast'; })
        .map(function (c) { return (c.args[0] || {}).title || ''; });
    };
    const clearToasts = function () { sharedEnv.wx.__calls.length = 0; };
    // 遥测落在 wx storage 的 tel_buf_v1 里；用真桩读出来，验证异常不再「凭空断流」
    const telFailReasons = function () {
      const buf = sharedEnv.storage.get('tel_buf_v1');
      return (Array.isArray(buf) ? buf : [])
        .filter(function (x) { return x.type === 'event' && x.data && x.data.name === 'ad_hint_fail'; })
        .map(function (x) { return x.data.d && x.data.d.r; });
    };
    const clearTel = function () { sharedEnv.storage.set('tel_buf_v1', []); };
    try {
      // D1 未配置：页面根本不创建控制器 → 入口永远不出现
      const env0 = createMiniEnv();
      const p0 = loadPage(GAME_PAGE, env0);
      p0.__withWx(function () { p0.onLoad({ level: 1, seed: 20261107 }); });
      timers.tick(200);
      if (p0._rewarded === null && p0.data.adHintOn === false)
        ok('未配置：页面不创建激励控制器，入口恒不显示');
      else err('未配置却创建了控制器 / 入口被点亮');

      // 造一个「已配置且广告就绪」的页面
      const mk = function (showImpl) {
        const env = createMiniEnv();
        const p = loadPage(GAME_PAGE, env);
        p.__withWx(function () { p.onLoad({ level: 1, seed: 20261107 }); });
        timers.tick(200);
        p.data.adHintOn = true;
        p.data.adHintLeft = 1;
        let shown = 0, destroyed = 0;
        p._rewarded = {
          show: function () { shown++; return showImpl(); },
          destroy: function () { destroyed++; }
        };
        return { p: p, env: env, shown: function () { return shown; }, destroyed: function () { return destroyed; } };
      };

      // D2 完整看完：发一次、扣一次、恰好高亮两张牌
      const a = mk(function () { return Promise.resolve({ ok: true, reason: 'ended' }); });
      a.p.onTapAdHint();
      await flush(); await flush();
      const hinted = (a.p.data.pieces || []).filter(function (x) { return x.hinted; }).length;
      if (a.p.data.adHintLeft === 0 && Object.keys(a.p._hintUids).length === 2 && hinted === 2)
        ok('看完：扣 1 次、恰好高亮 2 张牌（不多不少）');
      else err('看完后的发奖状态不对：left=' + a.p.data.adHintLeft
        + ' uids=' + Object.keys(a.p._hintUids).length + ' hinted=' + hinted);
      if (a.p.data.adHintBusy === false && a.p._adBusy === false)
        ok('结算后 busy 与实例锁都复位（按钮不会卡在「正在准备…」）');
      else err('结算后 busy / 实例锁没复位');

      // D3 同一课再点：不再拉起广告
      const before = a.shown();
      a.p.onTapAdHint();
      await flush();
      if (a.shown() === before) ok('次数用完后不再拉起广告');
      else err('次数用完了还在拉广告');

      // D4 中途关掉：不扣次数、不高亮，且明确说「没看完」
      clearToasts();
      const b = mk(function () { return Promise.resolve({ ok: false, reason: 'skipped' }); });
      b.p.onTapAdHint();
      await flush(); await flush();
      if (b.p.data.adHintLeft === 1 && Object.keys(b.p._hintUids).length === 0)
        ok('没看完：不扣次数、不高亮（玩家的机会不白花）');
      else err('没看完却扣了次数 / 高亮了');
      if (toasts().some(function (t) { return t.indexOf('没看完') > -1; }))
        ok('中途关掉 → 明确告诉玩家「没看完」');
      else err('中途关掉没有给出准确提示：' + JSON.stringify(toasts()));

      // D4b 广告拉不到：不扣次数，而且**不能说「没看完」**（玩家连画面都没见到）
      clearToasts();
      const b2 = mk(function () { return Promise.resolve({ ok: false, reason: 'error' }); });
      b2.p.onTapAdHint();
      await flush(); await flush();
      const t2 = toasts();
      if (b2.p.data.adHintLeft === 1 &&
          t2.some(function (t) { return t.indexOf('没加载') > -1; }) &&
          !t2.some(function (t) { return t.indexOf('没看完') > -1; }))
        ok('拉取失败 → 说「没加载出来」而不是「没看完」，且不扣次数');
      else err('拉取失败的提示/次数不对：left=' + b2.p.data.adHintLeft + ' toasts=' + JSON.stringify(t2));

      // D5 盘面没有可提示的一手：不浪费一次观看
      const c = mk(function () { return Promise.resolve({ ok: true, reason: 'ended' }); });
      c.p.match3 = false;
      c.p.board.cells = c.p.board.cells.map(function (t, i) {
        return t ? Object.assign({}, t, { id: 'uniq_' + i }) : t;
      });
      c.p.onTapAdHint();
      await flush();
      if (c.shown() === 0 && c.p.data.adHintLeft === 1)
        ok('盘面无解 → 不拉起广告、不扣次数');
      else err('没有可提示的一手却拉了广告');

      // D6 忙碌中连点：只拉一次
      const d = mk(function () { return Promise.resolve({ ok: true, reason: 'ended' }); });
      d.p.data.adHintBusy = true;
      d.p.onTapAdHint();
      await flush();
      if (d.shown() === 0) ok('busy 期间不重复拉起');
      else err('busy 期间仍重复拉起');

      // D7 show() 同步抛错：兜住并复位，不冒泡、不卡死，且**必须进漏斗**
      clearTel();
      const e = mk(function () { throw new Error('boom'); });
      let threw = null;
      try { e.p.onTapAdHint(); } catch (err0) { threw = err0; }
      await flush();
      if (threw === null && e.p.data.adHintBusy === false && e.p._adBusy === false)
        ok('show() 同步抛错被兜住：不冒泡、busy 复位');
      else err('show() 抛错没有兜住 / busy 卡死');
      if (telFailReasons().indexOf('exception') > -1)
        ok('同步抛错进漏斗（r=exception）：上线后不会看到「有 tap、没有结局」的断流');
      else err('同步抛错没进埋点 —— 漏斗凭空少一截：' + JSON.stringify(telFailReasons()));

      // D7c show() 返回 rejected Promise：过去 done 根本不跑 → _adBusy 永久 true
      clearTel(); clearToasts();
      const g = mk(function () { return Promise.reject(new Error('boom')); });
      let unhandled = null;
      const onUnhandled = function (x) { unhandled = x; };
      process.on('unhandledRejection', onUnhandled);
      g.p.onTapAdHint();
      await flush(); await flush(); await flush();
      process.removeListener('unhandledRejection', onUnhandled);
      if (g.p._adBusy === false && g.p.data.adHintBusy === false && unhandled === null &&
          toasts().some(function (t) { return t.indexOf('没加载') > -1; }) &&
          telFailReasons().indexOf('exception') > -1)
        ok('show() Promise 被 reject：busy 复位、不冒泡、文案说真话、漏斗有结局');
      else err('show() 被 reject 时留下死按钮 / 未处理拒绝 / 漏斗断流：'
        + JSON.stringify({ busy: g.p._adBusy, dataBusy: g.p.data.adHintBusy,
          unhandled: unhandled && String(unhandled), toasts: toasts(), tel: telFailReasons() }));

      // D7b 切后台：必须 abort（否则回前台按钮变成「点了没反应」）
      let aborted = 0;
      const f = mk(function () { return Promise.resolve({ ok: true, reason: 'ended' }); });
      f.p._rewarded.abort = function () { aborted++; };
      let hideThrew = null;
      try { f.p.__withWx(function () { f.p.onHide(); }); } catch (err2) { hideThrew = err2; }
      if (hideThrew === null && aborted === 1)
        ok('onHide → abort() 调一次（切后台收掉等待中的观看）');
      else err('onHide 没有 abort：' + (hideThrew ? hideThrew.message : 'aborted=' + aborted));

      // D8 提示 3.2 秒后自动收
      timers.tick(3300);
      if (Object.keys(a.p._hintUids).length === 0 &&
          (a.p.data.pieces || []).every(function (x) { return !x.hinted; }))
        ok('提示 3.2 秒后自动收起（不会一直挂在盘面上）');
      else err('提示没有自动收起');

      // D9 卸载：真的调 destroy() 并清空
      let unloadThrew = null;
      try {
        // 只调 onUnload —— destroy 必须由它调，不能由测试代劳（否则断言等于自证）
        a.p.__withWx(function () { a.p.onUnload(); });
      } catch (err1) { unloadThrew = err1; }
      if (unloadThrew === null && a.destroyed() === 1 && a.p._rewarded === null)
        ok('页面卸载走完整 onUnload：destroy() 调用一次、引用置空');
      else err('onUnload 没走通 / destroy 次数不对：' + (unloadThrew ? unloadThrew.message : a.destroyed()));

      // D10 迟到补发：utils/ads.js 的 onLateReward 最终落到 grantAdHint(true)。
      //     这里直接调唯一发奖入口，验证它**真的发**且**只发一次**（次数是幂等闸门）。
      const lateCase = mk(function () { return Promise.resolve({ ok: false, reason: 'timeout' }); });
      clearToasts();
      const lateBefore = lateCase.p.data.adHintLeft;
      const lateR1 = lateCase.p.grantAdHint(true);
      const lateAfter = lateCase.p.data.adHintLeft;
      const lateR2 = lateCase.p.grantAdHint(true);
      const lateToast = toasts().filter(t => t.indexOf('补给你') > -1).length;
      if (lateR1 === true && lateAfter === lateBefore - 1 && lateR2 === false &&
          lateCase.p.data.adHintLeft === lateAfter && lateToast === 1)
        ok('迟到补发走同一入口：发一次、次数归零、再调不发；且明确告知玩家「提示补给你」');
      else err('迟到补发没发出去 / 会重复发 / 不告知玩家：r1=' + lateR1 + ' r2=' + lateR2 + ' toast=' + lateToast);
    } finally {
      timers.restore();
      global.wx = prevWx;
    }
  }

  // ── E. 隐私披露与代码一致 ─────────────────────────────────────────────
  //    这一节存在的理由：广告代码已上线，而隐私指引还写着「无广告 SDK / 不投放广告」，
  //    那是**向用户与监管的不实陈述**。属于「只改一半 = 制造新冲突」的典型。
  //    只查两份**当前对外**的隐私文档；DECISIONS 里的历史结论（D5）是留档，不算冲突。
  const priv = stripComments(read('docs/privacy-policy-draft.md'));
  const privForm = stripComments(read('docs/privacy-mp-form.md'));
  const FALSE_CLAIM = /不含广告 SDK|无广告 SDK|不投放广告/;
  if (!FALSE_CLAIM.test(priv)) ok('隐私指引不再声称「无广告 SDK / 不投放广告」');
  else err('隐私指引仍写「无广告 SDK / 不投放广告」—— 与 utils/ads.js 的事实冲突（提交即不实）');
  if (!FALSE_CLAIM.test(privForm)) ok('MP 隐私填表不再声称「无广告 SDK」');
  else err('MP 隐私填表仍写「无广告 SDK」—— 与实际不符');
  if (priv.indexOf('微信官方广告组件') > -1 && privForm.indexOf('微信官方广告组件') > -1)
    ok('两份隐私文档都写明「微信官方广告组件」（无第三方广告 SDK）');
  else err('隐私文档没有写明广告来自哪个组件');
  if (priv.indexOf('不获取、不存储') > -1)
    ok('隐私指引明确「不获取、不存储广告标识 / 画像」');
  else err('隐私指引缺少广告数据口径');
  // 「当前不展示」这类**状态断言**会随着填 ID 变成假话，而且没人会记得回来改。
  // 所以隐私文档只允许**条件句**（未配置→不展示 / 配置后→仅官方组件），不许写死当前状态。
  const STATE_CLAIM = /(当前|现在)[^。]{0,24}(ID 为空|ID 全空|实际不展示)|6 个广告位 ID 为空/;
  if (!STATE_CLAIM.test(priv) && !STATE_CLAIM.test(privForm) &&
      /未配置时不展示/.test(priv) && /配置后仅展示微信官方广告组件/.test(priv))
    ok('隐私文档只写条件句、不写死「当前不展示」（填了 ID 也不会变成假话）');
  else err('隐私文档写死了「当前不展示」—— 一旦填 ID，就是向用户的不实陈述');
  if (priv.indexOf('匿名的广告漏斗事件') > -1)
    ok('隐私指引披露了广告漏斗事件（不是偷偷埋点）');
  else err('隐私指引没有披露广告漏斗事件 —— 埋了但没说');

  // 发布清单：状态标着「有效」，里面若还写「全仓无广告组件」会直接误导发布
  const rel = stripComments(read('docs/release-and-monetization.md'));
  if (rel.indexOf('全仓无广告组件与流量主代码') === -1 && rel.indexOf('零广告 SDK（D5）') === -1)
    ok('发布清单不再声称「全仓无广告组件 / 零广告 SDK」');
  else err('发布清单仍声称「全仓无广告组件 / 零广告 SDK」—— 发布时会照着做错');
  if (rel.indexOf('D156') > -1 && /ID (全空|为空)时?[^。]{0,12}不展示/.test(rel))
    ok('发布清单写清「D156 已接线 + ID 为空时不展示」（条件句，不是状态断言）');
  else err('发布清单没有写清广告的真实接线状态');
  if (rel.indexOf('ads-readiness') > -1)
    ok('发布清单给出可执行的就绪核对命令（不是让人靠记忆判断）');
  else err('发布清单没说怎么核对就绪度 —— 上线时只能靠猜');

  console.log('');
  console.log('通过: ' + pass + ' | 失败: ' + fail);
  COMPLETED = true;
  if (fail) process.exit(1);
}

main().catch(function (e) {
  COMPLETED = true;
  console.error('  ✗ 门禁自身异常：' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
