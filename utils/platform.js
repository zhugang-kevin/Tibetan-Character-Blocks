// utils/platform.js — 平台适配层
//
// 存在理由（一句话）：
//   引擎（match3 / board / learning）必须与平台无关。现在 43 处 `wx.` 散在 9 个文件里，
//   接抖音/快手时要逐个改 → 必然把引擎改烂。收口后，每个平台只需实现一份 adapter。
//
// 铁律：
//   1. **只有本文件允许出现平台 API**（wx.* / tt.* / 快手 SDK）。
//   2. 引擎文件（utils/match3.js、utils/board.js、utils/learning.js）不许 require 本文件。
//   3. 页面与数据层通过本文件的接口访问平台能力，不直接调 wx.*。
//
// 迁移是渐进的：目前只迁了 storage（全项目地基、被全套测试覆盖）。
// 其余 login / pay / share / audio 保持占位，按 TODO 顺序迁，每迁一个跑一次测试。

'use strict';

var _adapter = null;

/** 微信小程序实现（当前唯一已支持平台） */
function wechatAdapter() {
  var api = (typeof wx !== 'undefined') ? wx : null;
  if (!api) throw new Error('platform: 无 wx 环境，且未注入 adapter');
  return {
    name: 'wechat',
    storage: {
      get: function (k) { return api.getStorageSync(k); },
      set: function (k, v) { api.setStorageSync(k, v); },
      remove: function (k) { api.removeStorageSync(k); }
    },
    audio: {
      create: function () { return api.createInnerAudioContext(); },
      // 音频文件是否存在（分包/语音资源探测）
      fileExists: function (p) {
        try { api.getFileSystemManager().accessSync(p + '.mp3'); return true; } catch (e) { return false; }
      }
    },
    network: { request: function (o) { return api.request(o); } },
    login: function (o) { return api.login(o); },
    // TODO(抖音/快手/H5)：
    //   login:  tt.login / 快手登录 / 无
    //   network: tt.request / 快手 / fetch
    //   audio:  各自 createInnerAudioContext（或 <audio>/WebAudio）
    //   pay:    微信虚拟支付 / 抖音钻石 / 快手支付 / 第三方（三套账户，不可共用）
    //   share:  小程序卡片 / 视频挂载 / 平台分享 / 链接
    pay: null,
    share: null
  };
}

function A() {
  if (!_adapter) _adapter = wechatAdapter();
  return _adapter;
}

/** storage：所有持久化都必须经过这里（不允许页面直接 wx.setStorageSync） */
var storage = {
  get: function (k) { return A().storage.get(k); },
  set: function (k, v) { A().storage.set(k, v); },
  remove: function (k) { A().storage.remove(k); }
};

var audio = {
  create: function () { return A().audio.create(); },
  fileExists: function (p) { return A().audio.fileExists(p); }
};
var network = { request: function (o) { return A().network.request(o); } };
var login = function (o) { return A().login(o); };

/** 测试/新平台注入：传 null 复位 */
function __setAdapter(a) { _adapter = a; }
function __reset() { _adapter = null; }
function __name() { return A().name; }

module.exports = {
  storage: storage,
  audio: audio,
  network: network,
  login: login,
  // 尚未迁移的接口先暴露"是否可用"，避免调用方盲目使用
  available: function () {
    var a = A();
    return { name: a.name, login: !!a.login, pay: !!a.pay, share: !!a.share, audio: !!a.audio, network: !!a.network };
  },
  __setAdapter: __setAdapter,
  __reset: __reset,
  __name: __name
};
