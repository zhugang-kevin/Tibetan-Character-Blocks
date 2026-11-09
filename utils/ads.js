// utils/ads.js — 广告位统一入口（D156 · 2026-11-07）
//
// ┌──────────────────────────────────────────────────────────────────────┐
// │ 设计前提：**没有广告位 ID 就什么都不会发生**。                          │
// │   不创建实例、不调用 wx.*、不报错、不渲染任何占位。                     │
// │   空值 = 未开通流量主（正常状态），页面 wx:if 直接把入口整块收掉。      │
// └──────────────────────────────────────────────────────────────────────┘
//
// 官方依据（查询日期 2026-11-07）：
//   ·《激励视频广告》developers.weixin.qq.com/miniprogram/dev/framework/open-ability/ad/rewarded-video-ad.html
//      - wx.createRewardedVideoAd 返回单例，仅对当前页面有效，不允许跨页面使用
//      - 必须在**用户主动触发**后调用 show()；默认隐藏
//      - 只有 res && res.isEnded 为 true 才「可以向用户下发奖励」
//      - show() 失败时 load() 重新拉取后再 show()
//      - 多次注册 onLoad/onError/onClose 会产生多次回调 → 先 off* 再 on*
//   ·《ad 组件》developers.weixin.qq.com/miniprogram/dev/component/ad.html
//      - ad-type="video" 展示视频广告（基础库 2.8.0+）
//      - binderror 后建议隐藏父容器，不要移除组件（否则收不到 bindload）
//
// 🔴 变现红线（D138 ⑥）：不能用广告换酥油灯 / 哈达 / 道具 / 学习得分 ——
//    那是用广告换我们自己的虚拟商品，绕开虚拟支付，属违规套利。
//    激励视频只能换「游戏内一次提示」这类非卖品，且不得绑定核心进度。
//
// 注意：本文件被 pages/game、pages/result 引用，会进主包。保持精简（<3KB）。

var CFG = require('../config/ads.js');

// 与 scripts/check-ads-config.js 完全同一口径（后台复制，别手打）
var ID_RE = /^adunit-[0-9a-z]{6,40}$/i;

/** 取某个广告位的 ID；空 / 格式错 / 拿网址或 OfferID 冒充 → 一律返回 '' */
function unit(kind) {
  var v = String((CFG && CFG[kind]) || '').trim();
  return ID_RE.test(v) ? v : '';
}

function enabled(kind) { return !!unit(kind); }

// ─────────────────────────────────────────────────────────────────────
// 接线状态（**唯一事实源**）：配置里有键 ≠ 运行时有人消费。
//
//   已接入：banner（结算页横幅退路）、video（结算页视频）、rewarded（游戏页激励）
//   未接入：interstitial / videoPatch / template —— **没有任何页面在用**
//
// 为什么单独列出来：这三种填了**不会报错、不会渲染、也不会有收入**，
// 是最难发现的一种失败（看起来"广告已开"，实际一分钱没有）。
// scripts/check-ads-config.js 读这张表：填了未接线的类型 → 直接判红。
// ─────────────────────────────────────────────────────────────────────
var WIRED = {
  banner: true,
  video: true,
  rewarded: true,
  interstitial: false,
  videoPatch: false,
  template: false
};

// ⚠️ 等待中的结算**必须每个控制器各一份**（原来放在模块级，两个页面会互相顶掉：
//   A 页在等结算时，B 页调 show() 会直接拿到 busy，而且 A 的 Promise 永远等不到 onClose）。
//   现在下沉到 createRewarded 的闭包里。

// 两段看门狗 + 一个补发窗口（**缺一段就会留一个永远转圈的按钮**）：
//   ① 起播 12s：show() 卡住不返回（网络 / 激励组件异常）→ 收成 timeout。
//   ② 播放 180s：show() 已成功、但 onClose 永不来（组件被系统回收 / 回调丢失）→ 同样收口。
//      只靠 onClose 会把 _pending 永久挂着：回前台再点就是「点了没反应」。
//      180s 远大于官方 15/30 秒解锁时长，不会误杀正常观看；正常路径由 onClose 提前清掉计时器。
//   ③ 补发窗口 90s：超时收口**只是把按钮放开，不等于观众没看**。
//      组件丢一次 onClose，不该连带把玩家真看完的那次奖励作废 ——
//      窗口内迟到的 onClose（isEnded=true）仍然补发一次，之后彻底作废（见 openLate / onClose）。
var SHOW_TIMEOUT_MS = 12000;
var WATCH_TIMEOUT_MS = 180000;
var LATE_GRACE_MS = 90000;

// 结算结果：**必须能区分「没看完」和「广告根本没出来」**。
//   原来两种情况都返回 false，页面只能统一说「没看完」——
//   可玩家可能连广告画面都没见到，那是在说假话（本项目最忌讳的一类）。
//   ok=true 只有一个来源：res && res.isEnded。
//   reason: ended / skipped / error / failed / busy / destroyed / aborted / timeout
function outcome(ok, reason) {
  return { ok: !!ok, reason: reason || (ok ? 'ended' : 'failed') };
}

/**
 * 创建激励视频控制器。**只能在页面 onLoad 里调**、onUnload 里 destroy()。
 * 未配置 / 不支持时返回 null —— 调用方据此不渲染按钮（不出现点了没反应的假入口）。
 * @param {Function} onReady 广告拉取成功/失败回调；只有成功才显示入口
 * @param {Function} onLateReward 补发回调：超时收口之后才到的 onClose 且 res.isEnded
 *                               → 说明玩家确实看完了，奖励不该因为回调丢失而作废
 */
function createRewarded(onReady, onLateReward) {
  if (!enabled('rewarded')) return null;
  // H5 体验版 / 单元测试里没有 wx，静默降级（不能抛错把页面带崩）
  if (typeof wx === 'undefined' || typeof wx.createRewardedVideoAd !== 'function') return null;
  var ad;
  try {
    ad = wx.createRewardedVideoAd({ adUnitId: unit('rewarded') });
  } catch (e) { return null; }
  if (!ad) return null;

  var _pending = null;   // 本控制器自己的等待位（不与其他页面共享）
  var _late = null;      // 补发窗口：超时收口后仍在等一次迟到的 onClose

  // 排 / 重排看门狗。settle() 会清掉当前那个，所以同一时刻只会有一个计时器。
  // 已结算（onClose / onError 先到）时不再排 —— 否则会给一个已经结束的观看留个野计时器。
  var armGuard = function (ms) {
    if (!_pending) return;
    if (_pending.guard) { try { clearTimeout(_pending.guard); } catch (e) {} }
    var t = setTimeout(function () { settle(false, 'timeout'); }, ms);
    // Node（门禁/单测）里别让计时器拖住进程退出；小程序返回数字，没有 unref，直接跳过。
    if (t && typeof t.unref === 'function') { try { t.unref(); } catch (e) {} }
    _pending.guard = t;
  };

  var clearLate = function () {
    if (_late && _late.timer) { try { clearTimeout(_late.timer); } catch (e) {} }
    _late = null;
  };

  // 超时收口后开一个有限的补发窗口。窗口一到就彻底作废：
  // 不能让一个几天前的回调在玩家早就不看的时候突然发奖。
  var openLate = function () {
    clearLate();
    var t = setTimeout(function () { _late = null; }, LATE_GRACE_MS);
    if (t && typeof t.unref === 'function') { try { t.unref(); } catch (e) {} }
    _late = { timer: t };
  };

  var settle = function (ok, reason) {
    if (!_pending) return;
    var p = _pending; _pending = null;
    if (p.guard) { try { clearTimeout(p.guard); } catch (e) {} p.guard = null; }
    p.resolve(outcome(ok, reason));
    // 只有「看门狗超时」才开补发窗口：玩家可能真看完了，只是回调没回来。
    // skipped / error / failed / aborted / destroyed 都是明确结局，没有补发的余地。
    if (!ok && reason === 'timeout') openLate();
  };

  var onLoad = function () { if (onReady) onReady(true); };
  var onError = function () {
    if (onReady) onReady(false);
    if (_pending) settle(false, 'error');   // 拉取/播放出错：和「没看完」不是一回事
    else clearLate();                      // 补发窗口里出错 = 这次确实没成，别再补
  };
  var onClose = function (res) {
    // 🔴 唯一发奖判据：完整看完。中途关掉一律不发。
    var ended = !!(res && res.isEnded);
    if (_pending) {
      if (ended) settle(true, 'ended');
      else settle(false, 'skipped');
      return;
    }
    // 已经按超时收口了：迟到的 onClose 仍然算数，但**只补一次**。
    // 没有窗口就直接忽略 —— 否则一次陈旧回调会在下一次观看时凭空发奖。
    if (_late) {
      clearLate();
      if (ended && onLateReward) { try { onLateReward(outcome(true, 'ended')); } catch (e) {} }
    }
  };

  // 先摘旧监听：wx.createRewardedVideoAd 是单例，跨页面重复挂载会累积回调
  ['offLoad', 'offError', 'offClose'].forEach(function (fn) {
    if (typeof ad[fn] === 'function') { try { ad[fn](); } catch (e) {} }
  });
  if (typeof ad.onLoad === 'function') ad.onLoad(onLoad);
  if (typeof ad.onError === 'function') ad.onError(onError);
  if (typeof ad.onClose === 'function') ad.onClose(onClose);

  return {
    /**
     * 必须在 bindtap 回调里调用（官方要求用户主动触发）。
     * @returns {Promise<{ok:boolean, reason:string}>} ok 仅在完整看完时为 true
     */
    show: function () {
      return new Promise(function (resolve) {
        if (_pending) return resolve(outcome(false, 'busy'));
        // 新的一次观看开始 → 上一次的补发窗口作废（否则旧 close 会被算到这次头上）
        clearLate();
        _pending = { resolve: resolve, guard: null };
        armGuard(SHOW_TIMEOUT_MS);               // ① 起播
        var onStarted = function () { armGuard(WATCH_TIMEOUT_MS); };  // ② 播放
        var doShow = function () { return ad.show(); };
        // show() 返回 Promise；拉取失败 → load() 手动重拉 → 再 show() 一次
        Promise.resolve()
          .then(doShow)
          .then(onStarted, function () {
            if (typeof ad.load === 'function') {
              return Promise.resolve(ad.load()).then(doShow).then(onStarted);
            }
            throw new Error('ad load unavailable');
          })
          .catch(function () { settle(false, 'failed'); });
      });
    },
    /**
     * 中止等待中的观看（切后台 / 页面被覆盖时调）。
     * 不这么做的话 `_pending` 会一直挂着：回到前台再点，show() 直接返回 busy，
     * 玩家看到的就是一个「点了没反应」的按钮。
     */
    abort: function () { clearLate(); settle(false, 'aborted'); },
    /** 页面卸载时摘监听，把等待中的 Promise 收掉 */
    destroy: function () {
      clearLate();
      settle(false, 'destroyed');
      ['offLoad', 'offError', 'offClose'].forEach(function (fn) {
        if (typeof ad[fn] === 'function') { try { ad[fn](); } catch (e) {} }
      });
    }
  };
}

module.exports = {
  unit: unit,
  enabled: enabled,
  createRewarded: createRewarded,
  WIRED: WIRED,
  ID_RE: ID_RE
};
