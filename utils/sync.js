// utils/sync.js — 进度云同步（D94，走**我们自己的服务端**）
//
// 为什么不用云 SDK：SDK 小程序产物 **507KB**，主包只剩 6KB 余量 → 硬塞会超微信 2048KB 硬上限，
//   上传必失败（docs/cloud-sync-blocker.md）。而微信云开发是**假免费**（官方原文：发布后 15 天到期）、
//   Supabase Free 会 **7 天无流量暂停**。→ 用已有的那台服务器（为支付而建）：零增量、不停不到期。
//   （含全部出处：docs/data-storage-best-choice.md）
//
// 身份与隔离：**只传 code，不传 openid** —— 服务端 code2Session 换 openid，客户端无法伪造。
// 合规：只由用户自己点击才联网，不做静默登录、不上传联系方式。
var CONFIG = {
  // 服务端地址。与支付共用同一台服务器（见 server/README.md）。上线前注入。
  api: ''
};
function injectConfig(cfg) {
  cfg = cfg || {};
  if (cfg.api) CONFIG.api = cfg.api;
}
function isReady() { return !!CONFIG.api; }
function request(path, data) {
  return new Promise(function (resolve) {
    if (!isReady()) return resolve({ ok: false, reason: 'unconfigured' });
    wx.request({
      url: CONFIG.api.replace(/\/$/, '') + path,
      method: 'POST',
      data: data,
      success: function (res) {
        var d = res && res.data;
        if (res.statusCode === 200 && d && d.ok) return resolve({ ok: true, data: d });
        resolve({ ok: false, reason: 'server', message: (d && d.msg) || ('HTTP ' + res.statusCode) });
      },
      fail: function () { resolve({ ok: false, reason: 'network' }); }
    });
  });
}
// 取一次性 code（服务端据此换 openid；openid 不出现在前端）
function getCode() {
  return new Promise(function (resolve) {
    wx.login({
      success: function (r) { resolve(r && r.code ? r.code : ''); },
      fail: function () { resolve(''); }
    });
  });
}
/** 把本地进度存到云端（D113：同时把收礼人匿名 uid 绑定到本 openid 上） */
function save(local) {
  return getCode().then(function (code) {
    if (!code) return { ok: false, reason: 'login_failed' };
    return request('/sync/save', {
      code: code,
      // uid 绑定：服务端据此知道「这个 openid 的人收礼地址是哪个 uid」。
      // 只传匿名 uid，不传 openid（openid 由服务端用 code 换，客户端无法伪造）。
      uid: String(local.uid || ''),
      doneStages: String(local.doneStages || ''),
      lamps: local.lamps | 0,
      cards: local.cards | 0,
      ownerName: String(local.ownerName || '')
    });
  }).catch(function () { return { ok: false, reason: 'network' }; });
}
/**
 * D113 收礼箱：取「别人送给本机 uid」的礼物列表。
 * 服务端用 code 换 openid → 反查该 openid 绑定的所有 uid → 返回这些 uid 的礼物。
 * 前端按礼物 id 去重后入账（progress.seenGifts），所以重复拉取不会重复发奖。
 */
function inbox() {
  return getCode().then(function (code) {
    if (!code) return { ok: false, reason: 'login_failed' };
    return request('/gift/inbox', { code: code }).then(function (r) {
      if (!r.ok) return r;
      return { ok: true, gifts: (r.data && r.data.gifts) || [] };
    });
  }).catch(function () { return { ok: false, reason: 'network' }; });
}
/** 从云端取回进度（换手机后用它恢复） */
function load() {
  return getCode().then(function (code) {
    if (!code) return { ok: false, reason: 'login_failed' };
    return request('/sync/load', { code: code }).then(function (r) {
      if (!r.ok) return r;
      return { ok: true, progress: r.data.progress || null };
    });
  }).catch(function () { return { ok: false, reason: 'network' }; });
}
// 给用户看的话术（不泄露内部细节）
var MESSAGES = {
  unconfigured: '云端同步还没开通',
  network: '网络不太好，稍后再试',
  login_failed: '登录失败，请重试',
  server: '同步失败，请稍后再试'
};
function userMessage(r) { return MESSAGES[(r && r.reason)] || MESSAGES.server; }
module.exports = {
  CONFIG: CONFIG, injectConfig: injectConfig, isReady: isReady,
  save: save, load: load, inbox: inbox, userMessage: userMessage, getCode: getCode
};