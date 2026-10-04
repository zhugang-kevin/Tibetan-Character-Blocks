// utils/storage.js — 本地进度存储（L0 设备身份层）
//
// 4.1 方案对应：
// - Gate 1 测试期仅本地存储；云同步（L1）在 Gate 3 合规路线明确后接入
// - stamps（文化护照印记）/ bestCombo / levelStats / certs 等为展示与成就型数据，
//   客户端主导；未来涉及权益/付费的数据一律迁移到服务器权威（见 plan-4.1-review.md）
var KEY = 'progress';
var MAX_LEVEL = 10;

function getProgress() {
  var p = wx.getStorageSync(KEY);
  return {
    unlockedLevel: (p && p.unlockedLevel) || 1,
    completedLevels: (p && p.completedLevels) || [],
    stamps: (p && p.stamps) || [],
    bestCombo: (p && p.bestCombo) || 0,
    seenCards: (p && p.seenCards) || [],
    onboardDone: !!(p && p.onboardDone),
    // 证书体系（藏文成长阶梯）：最佳正确率 / 证书 / 编号流水 / 持有人
    levelStats: (p && p.levelStats) || {},
    certs: (p && p.certs) || [],
    certSeq: (p && p.certSeq) || 0,
    holderName: (p && p.holderName) || '',
    // 权益中心（双轨制）：模式 / 城市 / 已领凭证 / 核销码流水
    userMode: (p && p.userMode) || '',
    city: (p && p.city) || '',
    benefits: (p && p.benefits) || [],
    benefitSeq: (p && p.benefitSeq) || 0
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

// 文化卡是否已展示过完整版（首次消除弹出，之后只出轻提示）
function isCardSeen(id) {
  return getProgress().seenCards.indexOf(id) > -1;
}

function markCardSeen(id) {
  var p = getProgress();
  if (p.seenCards.indexOf(id) === -1) {
    p.seenCards.push(id);
    save(p);
  }
}

function isOnboardDone() {
  return getProgress().onboardDone;
}

function setOnboardDone() {
  var p = getProgress();
  p.onboardDone = true;
  save(p);
}

// ---------- 证书体系：单关最佳正确率（只增不减，鼓励重玩提升） ----------
// r: { matches, attempts, misses }
function recordLevelResult(level, r) {
  var p = getProgress();
  var attempts = r && r.attempts ? r.attempts : 0;
  var matches = r && r.matches ? r.matches : 0;
  var misses = r && r.misses ? r.misses : 0;
  // 一关之内全部一次配对成功 = 100%；没有失败配对 = 无失误通关
  var acc = attempts > 0 ? matches / attempts : 1;
  if (acc > 1) acc = 1;
  if (acc < 0) acc = 0;

  var s = p.levelStats[level] || { bestAcc: 0, clean: false, plays: 0, lastAcc: 0 };
  s.plays = (s.plays || 0) + 1;
  s.lastAcc = acc;
  if (acc > s.bestAcc) s.bestAcc = acc;
  if (misses === 0) s.clean = true;   // 至少达成过一次零失误
  p.levelStats[level] = s;
  save(p);
  return s;
}

function getLevelStats() {
  return getProgress().levelStats;
}

// ---------- 证书体系：颁发 / 查询 ----------
// 写入一张证书（或覆盖升级）。返回落库后的证书对象。
function saveCert(cert) {
  var p = getProgress();
  var found = false;
  for (var i = 0; i < p.certs.length; i++) {
    if (p.certs[i].stage === cert.stage) { p.certs[i] = cert; found = true; break; }
  }
  if (!found) p.certs.push(cert);
  save(p);
  return cert;
}

function getCerts() {
  return getProgress().certs;
}

function findCert(stage) {
  var list = getProgress().certs;
  for (var i = 0; i < list.length; i++) {
    if (list[i].stage === stage) return list[i];
  }
  return null;
}

// 取下一个证书编号流水号（ZWFK-YYYY-0001 的最后一段）
function nextCertSeq() {
  var p = getProgress();
  p.certSeq = (p.certSeq || 0) + 1;
  save(p);
  return p.certSeq;
}

function getCertSeq() {
  return getProgress().certSeq || 0;
}

// 证书持有人（与祝福卡昵称共用，避免让用户填两次）
function setHolderName(name) {
  var p = getProgress();
  p.holderName = (name || '').slice(0, 10);
  save(p);
  return p.holderName;
}

function getHolderName() {
  return getProgress().holderName || '';
}

// ---------- 权益中心：模式 / 城市 / 凭证 ----------
// 模式只有 'local' / 'tourist' 两个合法值（见 utils/benefits.js）
function setUserMode(mode) {
  var p = getProgress();
  p.userMode = (mode === 'local' || mode === 'tourist') ? mode : '';
  save(p);
  return p.userMode;
}

function getUserMode() {
  return getProgress().userMode || '';
}

// 城市由用户主动选择（不申请定位权限）
function setCity(id) {
  var p = getProgress();
  p.city = id || '';
  save(p);
  return p.city;
}

function getCity() {
  return getProgress().city || '';
}

// 记录一张已领取的到店权益凭证（同一商家不重复发码）
function addBenefit(record) {
  var p = getProgress();
  var found = false;
  for (var i = 0; i < p.benefits.length; i++) {
    if (p.benefits[i].mid === record.mid) { found = true; break; }
  }
  if (!found) p.benefits.push(record);
  save(p);
  return record;
}

function getBenefits() {
  return getProgress().benefits;
}

function hasBenefit(mid) {
  var list = getProgress().benefits;
  for (var i = 0; i < list.length; i++) {
    if (list[i].mid === mid) return true;
  }
  return false;
}

function nextBenefitSeq() {
  var p = getProgress();
  p.benefitSeq = (p.benefitSeq || 0) + 1;
  save(p);
  return p.benefitSeq;
}

module.exports = {
  MAX_LEVEL: MAX_LEVEL,
  getProgress: getProgress,
  completeLevel: completeLevel,
  recordCombo: recordCombo,
  grantStamp: grantStamp,
  isCardSeen: isCardSeen,
  markCardSeen: markCardSeen,
  isOnboardDone: isOnboardDone,
  setOnboardDone: setOnboardDone,
  recordLevelResult: recordLevelResult,
  getLevelStats: getLevelStats,
  saveCert: saveCert,
  getCerts: getCerts,
  findCert: findCert,
  nextCertSeq: nextCertSeq,
  getCertSeq: getCertSeq,
  setHolderName: setHolderName,
  getHolderName: getHolderName,
  setUserMode: setUserMode,
  getUserMode: getUserMode,
  setCity: setCity,
  getCity: getCity,
  addBenefit: addBenefit,
  getBenefits: getBenefits,
  hasBenefit: hasBenefit,
  nextBenefitSeq: nextBenefitSeq
};
