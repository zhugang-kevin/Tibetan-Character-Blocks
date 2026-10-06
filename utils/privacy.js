// utils/privacy.js — 用户隐私保护指引（2023-10-15 起强制）· 受保护接口的统一前置帮手
//
// 为什么要有这个文件：
//   微信自 2023-10 起要求：小程序使用「受保护接口」前，必须先在公众平台配置
//   《小程序用户隐私保护指引》，并在首次调用前让用户完成同意（wx.requirePrivacyAuthorize）。
//   本项目受影响的接口只有一类 —— **保存图片到相册**（wx.saveImageToPhotosAlbum，
//   证书 / 祝福卡 / 祝福签三处的「保存到相册」）。
//   未做前置授权时，它会直接失败（privacy permission is not authorized），
//   而旧版本的错误处理把它当成「相册权限没开」，提示用户去设置——指引是错的，
//   用户照做也解决不了。本模块把这件事收敛到一个地方。
//
// 三条硬规则：
//   ① **只在真正需要时打扰**：wx.getPrivacySetting 先问要不要授权，不需要就放行；
//   ② **同意后立刻继续原操作**（用户点了同意就该马上保存，不该让他再点一次按钮）；
//   ③ **拒绝时给正确指引**：重新弹出《用户隐私保护指引》让他读，而不是甩他去设置页。
//
// 纯 wx 依赖，无网络、无存储、不引入 Cloud API（遵守 D3 / D13）。

// 查询当前是否已经授权过。
// need = false：①平台未启用该机制 ②已在后台配过且用户同意 ③用户设备/基础库过旧 —— 一律放行。
function needAuthorization(cb) {
  if (typeof wx.getPrivacySetting !== 'function') return cb(false);
  try {
    wx.getPrivacySetting({
      success: function (res) { cb(!!(res && res.needAuthorization)); },
      fail: function () { cb(false); } // 查询失败按「不需要」处理，宁可少打扰也不阻断功能
    });
  } catch (e) { cb(false); }
}

// 打开《用户隐私保护指引》正文（官方弹层）。旧基础库静默忽略。
function openContract() {
  try {
    if (typeof wx.openPrivacyContract === 'function') wx.openPrivacyContract({});
  } catch (e) { /* 无此能力时不处理 */ }
}

// 受保护接口前的唯一前置入口。
// ensurePrivacy(function (ok) { if (ok) doProtectedThing(); });
//   ok = true  → 已具备资格，直接继续；
//   ok = false → 用户拒绝或机制不可用；机制不可用时**不阻断**（兼容旧设备）。
function ensurePrivacy(done) {
  if (typeof done !== 'function') return;
  if (typeof wx.requirePrivacyAuthorize !== 'function') return done(true); // 旧基础库：不阻断

  needAuthorization(function (need) {
    if (!need) return done(true);

    // 需要授权：先弹一个说明框（含「查看隐私指引」），用户确认后再请求官方授权弹层。
    // 直接用官方 requirePrivacyAuthorize 也可以，但先说明「为什么要点这一下」转化率明显更高。
    wx.showModal({
      title: '保存图片到相册',
      content: '保存前需要先阅读并同意《用户隐私保护指引》。本小程序不收集个人信息，图片也不会离开你的手机。',
      confirmText: '查看并同意',
      cancelText: '暂不保存',
      success: function (r) {
        if (!r.confirm) return done(false);
        openContract();
        try {
          wx.requirePrivacyAuthorize({
            success: function () { done(true); },
            fail: function () { done(false); }
          });
        } catch (e) { done(false); }
      },
      fail: function () { done(false); }
    });
  });
}

// 保存失败的兜底提示：区分「隐私未同意」与「相册权限未开」，给不同指引。
// 返回值表示「已处理」（调用方不必再 toast）。
function explainSaveFailure(err) {
  var msg = (err && err.errMsg) || '';
  if (msg.indexOf('privacy') > -1) {
    wx.showToast({ title: '需先同意《用户隐私保护指引》', icon: 'none' });
    return true;
  }
  if (msg.indexOf('auth deny') > -1 || msg.indexOf('authorize') > -1 || msg.indexOf('deny') > -1) {
    wx.showModal({
      title: '需要相册权限',
      content: '保存图片需要「保存到相册」权限，可在右上角菜单的设置里打开。',
      confirmText: '去设置',
      cancelText: '知道了',
      success: function (res) { if (res.confirm) { try { wx.openSetting(); } catch (e) { } } }
    });
    return true;
  }
  return false; // 其他错误交给调用方按原逻辑提示
}

module.exports = {
  ensurePrivacy: ensurePrivacy,
  needAuthorization: needAuthorization,
  openContract: openContract,
  explainSaveFailure: explainSaveFailure
};
