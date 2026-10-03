// utils/storage.js — 本地进度存储（L0 设备身份层）
//
// 4.1 方案对应：
// - Gate 1 测试期仅本地存储；云同步（L1）在 Gate 3 合规路线明确后接入
// - stamps（文化护照印记）/ bestCombo 等为展示型数据，客户端主导；
//   未来涉及权益/付费的数据一律迁移到服务器权威（见 plan-4.1-review.md）
var KEY = 'progress';
var MAX_LEVEL = 10;

function getProgress() {
  var p = wx.getStorageSync(KEY);
  return {
    unlockedLevel: (p && p.unlockedLevel) || 1,
    completedLevels: (p && p.completedLevels) || [],
    stamps: (p && p.stamps) || [],
    bestCombo: (p && p.bestCombo) || 0,
    onboardDone: !!(p && p.onboardDone)
  };
}

function save(p) {
  wx.setStorageSync(KEY, p);
}

// 通关第 n 关：记录完成 + 解锁下一关
function completeLevel(n) {
  var p = getProgress();
  if (p.completedLevels.indexOf(n) === -1) {
    p.completedLevels.push(n);
  }
  p.unlockedLevel = Math.max(p.unlockedLevel, Math.min(n + 1, MAX_LEVEL));
  save(p);
  return p;
}

// 记录最高连击，返回是否刷新纪录
function recordCombo(n) {
  var p = getProgress();
  if (n > p.bestCombo) {
    p.bestCombo = n;
    save(p);
    return true;
  }
  return false;
}

// 授予印记（v0：'lhasa' 拉萨印章）。返回是否为新获得。
function grantStamp(id) {
  var p = getProgress();
  if (p.stamps.indexOf(id) > -1) return false;
  p.stamps.push(id);
  save(p);
  return true;
}

function isOnboardDone() {
  return getProgress().onboardDone;
}

function setOnboardDone() {
  var p = getProgress();
  p.onboardDone = true;
  save(p);
}

module.exports = {
  getProgress: getProgress,
  completeLevel: completeLevel,
  recordCombo: recordCombo,
  grantStamp: grantStamp,
  isOnboardDone: isOnboardDone,
  setOnboardDone: setOnboardDone
};
