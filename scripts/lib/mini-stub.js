// scripts/lib/mini-stub.js — 小程序页面行为测试的最小运行环境
//
// 目的：让 pages/*.js 能在 Node 里被 require 并真实调用，
// 从而抓到「语法检查抓不到」的运行时错误（例如 second is not defined）。
//
// 为什么用 Proxy：
//   wx.* 有 20+ 个接口，大部分在测试里只需"存在且不炸"。
//   Proxy 让任何未显式实现的接口都变成 no-op，避免每加一个 API 就要改桩。
//   少数有语义的接口（存储 / 窗口信息 / canIUse）显式实现。

'use strict';

function createMiniEnv() {
  const storage = new Map();

  const wxBase = {
    // ---- 有语义的少数接口 ----
    getStorageSync(k) { return storage.has(k) ? storage.get(k) : ''; },
    setStorageSync(k, v) { storage.set(k, v); },
    removeStorageSync(k) { storage.delete(k); },
    getWindowInfo() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 2, safeArea: { top: 0, bottom: 667 } }; },
    getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 2, platform: 'devtools', SDKVersion: '3.0.0' }; },
    getAppBaseInfo() { return { SDKVersion: '3.0.0', language: 'zh_CN' }; },
    canIUse() { return false; },
    createInnerAudioContext() {
      // 音频在测试里只需要"能创建、能调用"，不真的播
      const ctx = {
        src: '', loop: false, volume: 1, paused: true, currentTime: 0, duration: 1,
        play() { ctx.paused = false; }, pause() { ctx.paused = true; },
        stop() { ctx.paused = true; }, seek() {}, destroy() {},
        onEnded() {}, onError() {}, onCanplay() {}, onTimeUpdate() {},
        offEnded() {}, offError() {}
      };
      return ctx;
    },
    // ---- 记录型（断言用）----
    __calls: [],
  };

  // 未实现的接口 → no-op，并记录调用
  const wx = new Proxy(wxBase, {
    get(t, k) {
      if (k in t) {
        const v = t[k];
        if (typeof v === 'function' && !String(k).startsWith('__')) {
          // ⚠️ 必须**先调用真实实现再记录**。
          //    原来这里直接 return undefined —— 连 getStorageSync 都被吞掉，
          //    于是"存储永远读不到"，页面测试跑的是一个退化环境（38 条测试都没发现）。
          return function () {
            var ret = v.apply(t, arguments);
            t.__calls.push({ api: String(k), args: Array.prototype.slice.call(arguments) });
            return ret;
          };
        }
        return v;
      }
      // 未显式实现的一律 no-op
      return function () {
        t.__calls.push({ api: String(k), args: Array.prototype.slice.call(arguments) });
      };
    }
  });

  return { wx, storage };
}

/**
 * 载入一个页面，返回可调用的实例（带 setData 与 data）
 * @param {string} absPath 页面的绝对路径
 * @param {object} env     createMiniEnv() 的返回值
 */
function loadPage(absPath, env) {
  const prevWx = global.wx;
  const prevPage = global.Page;
  const prevApp = global.getApp;

  let captured = null;
  global.wx = env.wx;
  global.Page = function (opts) { captured = opts; };
  global.getApp = function () { return { globalData: {} }; };

  delete require.cache[require.resolve(absPath)];
  try {
    require(absPath);
  } finally {
    global.wx = prevWx;
    global.Page = prevPage;
    global.getApp = prevApp;
  }

  if (!captured) throw new Error('页面没有调用 Page()：' + absPath);

  // 造一个实例：方法绑定 this，data 可写，setData 合并
  const inst = Object.create(null);
  Object.keys(captured).forEach(function (k) {
    inst[k] = typeof captured[k] === 'function' ? captured[k] : captured[k];
  });
  inst.data = JSON.parse(JSON.stringify(captured.data || {}));
  inst.setData = function (d) {
    Object.keys(d || {}).forEach(function (k) { inst.data[k] = d[k]; });
  };
  // 页面方法内部会调到 global.wx——在调用期间临时挂上
  inst.__withWx = function (fn) {
    const prev = global.wx;
    global.wx = env.wx;
    try { return fn(); } finally { global.wx = prev; }
  };
  return inst;
}



/**
 * 可控时间（假定时器）
 * 为什么需要：页面的结算/跳转是异步的（D115 语音念完再跳），
 *   靠 sleep 等定时器既慢又不可靠（机器负载不同，断言时快时慢）。
 *   接管 setTimeout 后，tick(ms) 会把到期的回调**按时间顺序同步执行**，断言才稳。
 * 注意：只接管页面用到的 setTimeout / clearTimeout，不碰 setInterval。
 */
function installFakeTimers() {
  const realST = global.setTimeout;
  const realCT = global.clearTimeout;
  let now = 0;
  let seq = 0;
  const q = new Map();
  const errors = [];

  global.setTimeout = function (fn, ms) {
    const id = ++seq;
    q.set(id, { fn: fn, at: now + (Number(ms) || 0), seq: id });
    return id;
  };
  global.clearTimeout = function (id) { q.delete(id); };

  return {
    now: function () { return now; },
    errors: function () { return errors.slice(); },
    pending: function () { return q.size; },
    /** 推进虚拟时间，按到期顺序执行回调（含回调里新排的 timer） */
    tick: function (ms) {
      const target = now + (ms || 0);
      let guard = 0;
      while (guard++ < 10000) {
        let due = null;
        q.forEach(function (t, id) {
          if (t.at <= target && (!due || t.at < due.t.at || (t.at === due.t.at && t.seq < due.t.seq))) {
            due = { id: id, t: t };
          }
        });
        if (!due) break;
        q.delete(due.id);
        now = due.t.at;
        // ⚠️ 不能静默吞异常：回调抛错时，后面的逻辑（跳转/结算）就不会执行，
        //    断言只会看到"什么都没发生"，根本查不到原因。收集起来由上层打印。
        try { due.t.fn(); } catch (e) { errors.push(e); }
      }
      now = target;
      return this;
    },
    restore: function () { global.setTimeout = realST; global.clearTimeout = realCT; }
  };
}

module.exports = { createMiniEnv, loadPage, installFakeTimers };
