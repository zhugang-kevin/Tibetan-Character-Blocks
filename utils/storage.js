// utils/storage.js — 本地进度存储
var KEY = 'progress';
var MAX_LEVEL = 10;

function getProgress() {
  var p = wx.getStorageSync(KEY);
  return {
    unlockedLevel: (p && p.unlockedLevel) || 1,
    completedLevels: (p && p.completedLevels) || []
  };
}

// 通关第 n 关：记录完成 + 解锁下一关
function completeLevel(n) {
  var p = getProgress();
  if (p.completedLevels.indexOf(n) === -1) {
    p.completedLevels.push(n);
  }
  p.unlockedLevel = Math.max(p.unlockedLevel, Math.min(n + 1, MAX_LEVEL));
  wx.setStorageSync(KEY, p);
  return p;
}

module.exports = {
  getProgress: getProgress,
  completeLevel: completeLevel
};
