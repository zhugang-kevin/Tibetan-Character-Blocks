// utils/benefits.js — 权益中心纯逻辑（无页面依赖，可单测）
//
// 设计要点（详见 docs/privilege-system-v1.md）：
//   · 双轨制：本地生活 / 游客专属，按商家 track 打标过滤，前端一键切换。
//   · 不用定位：城市由用户**主动选择**（位置接口在内容/教育类目拿不到，且属高危驳回点）。
//   · 券不承载金额：只发「到店权益凭证」，offer 是商家自述，平台不承诺金额、不兑付。
//   · 平台零资金流：本模块不含任何支付/结算/分账逻辑。

var merchants = require('../data/merchants');

var CITIES = [
  { id: 'lhasa', name: '拉萨' },
  { id: 'nyingchi', name: '林芝' },
  { id: 'shigatse', name: '日喀则' },
  { id: 'shannan', name: '山南' }
];

var MODES = [
  { id: 'local', name: '本地生活', desc: '日常刚需 · 高频实惠' },
  { id: 'tourist', name: '游客专属', desc: '体验打卡 · 纪念感' }
];

var KIND_LABELS = {
  gift: '赠礼',
  combo: '专属组合',
  priority: '优先权',
  stamp: '联名印章'
};

// 必须在券卡上出现的定性声明：权益是商家给的，平台不碰钱
var PROVIDER_NOTE = '由商家自主提供并兑现 · 藏字方块不参与交易、不收取任何款项';
var PAGE_NOTE = '本页只发放「到店权益凭证」，不涉及任何支付与资金结算';

var DEFAULT_CITY = 'lhasa';

// ---------- 模式 ----------

// 只有一个合法值：'local' / 'tourist'；其余（含空）一律归零，页面据此显示引导
function normalizeMode(v) {
  return (v === 'local' || v === 'tourist') ? v : '';
}

function modeName(id) {
  for (var i = 0; i < MODES.length; i++) {
    if (MODES[i].id === id) return MODES[i].name;
  }
  return '';
}

function cityName(id) {
  for (var i = 0; i < CITIES.length; i++) {
    if (CITIES[i].id === id) return CITIES[i].name;
  }
  return '';
}

function normalizeCity(v) {
  for (var i = 0; i < CITIES.length; i++) {
    if (CITIES[i].id === v) return v;
  }
  return DEFAULT_CITY;
}

// ---------- 查询 ----------

function findById(id) {
  for (var i = 0; i < merchants.length; i++) {
    if (merchants[i].id === id) return merchants[i];
  }
  return null;
}

// 某模式下的商家：track 命中本轨，或为 both（通用）
function inTrack(m, mode) {
  return m.track === mode || m.track === 'both';
}

// 模式未选定时返回空数组 —— 「一键切换」才有意义，避免默认塞一堆不相关的券
function listFor(mode, cityId) {
  var m = normalizeMode(mode);
  if (!m) return [];
  var city = normalizeCity(cityId);
  return merchants.filter(function (x) {
    return inTrack(x, m) && x.city === city;
  }).sort(function (a, b) {
    if (a.need !== b.need) return a.need - b.need;
    return a.id < b.id ? -1 : 1;
  });
}

// 通关门槛：need ≤ 已通关关数 才可领（把「玩游戏」和「拿权益」连起来）
function isUnlocked(doneCount, m) {
  return (doneCount || 0) >= (m && m.need ? m.need : 0);
}

function canClaim(doneCount, m, claimedIds) {
  if (!m) return false;
  if ((claimedIds || []).indexOf(m.id) > -1) return false;
  return isUnlocked(doneCount, m);
}

// ---------- 凭证与核销记录 ----------

// 核销码必须可复算（测试要能断言），所以不用随机数
function makeCode(seq) {
  var n = ((seq || 1) % 10000 + 10000) % 10000;
  var s = String(n);
  while (s.length < 4) s = '0' + s;
  return 'ZW' + s;
}

function newRecord(merchant, seq, at) {
  return {
    mid: merchant.id,
    name: merchant.name,
    city: merchant.city,
    code: makeCode(seq),
    at: at || 0,
    status: 'claimed'   // claimed → used / expired（状态锁定后不可逆）
  };
}

function claimedIds(records) {
  return (records || []).map(function (r) { return r.mid; });
}

function findRecord(records, mid) {
  var list = records || [];
  for (var i = 0; i < list.length; i++) {
    if (list[i].mid === mid) return list[i];
  }
  return null;
}

// ---------- 视图模型（页面与体验版共用同一套计算） ----------

// 把商家 + 用户进度合成卡片数据；claimedMap: { mid: record }
function decorate(list, doneCount, claimedMap) {
  return list.map(function (m) {
    var rec = (claimedMap || {})[m.id];
    return {
      id: m.id,
      name: m.name,
      city: m.city,
      cityName: cityName(m.city),
      category: m.category,
      offer: m.offer,
      kind: m.kind,
      kindLabel: KIND_LABELS[m.kind] || '到店权益',
      need: m.need,
      providerNote: PROVIDER_NOTE,
      unlocked: isUnlocked(doneCount, m),
      claimed: !!rec,
      code: rec ? rec.code : '',
      shortBy: Math.max(0, m.need - (doneCount || 0))
    };
  });
}

function summary(list, doneCount, claimedMap) {
  var claimable = 0, got = 0;
  list.forEach(function (m) {
    var rec = (claimedMap || {})[m.id];
    if (rec) got++;
    else if (isUnlocked(doneCount, m)) claimable++;
  });
  return { total: list.length, claimable: claimable, claimed: got };
}

module.exports = {
  CITIES: CITIES,
  MODES: MODES,
  KIND_LABELS: KIND_LABELS,
  PROVIDER_NOTE: PROVIDER_NOTE,
  PAGE_NOTE: PAGE_NOTE,
  DEFAULT_CITY: DEFAULT_CITY,
  normalizeMode: normalizeMode,
  normalizeCity: normalizeCity,
  modeName: modeName,
  cityName: cityName,
  findById: findById,
  inTrack: inTrack,
  listFor: listFor,
  isUnlocked: isUnlocked,
  canClaim: canClaim,
  makeCode: makeCode,
  newRecord: newRecord,
  claimedIds: claimedIds,
  findRecord: findRecord,
  decorate: decorate,
  summary: summary
};
