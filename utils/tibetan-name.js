// utils/tibetan-name.js — 性别取值与藏族名字（纯函数，两端共用）
//
// 合规设计（2026-10-09 用户点名「系统必须能区分男女」，见 docs/DECISIONS.md D54）：
//   ① **只能用户自填**：「头像昵称 / 性别」类接口在 validate §6 禁用名单里，且微信自 2022 年起
//      不再返回真实性别——本模块不调用任何 wx.* 接口，取值全部来自页面上的显式选择。
//   ② **必须有「不愿透露」出口**：PIPL 最小必要 + 可跳过。选它走中性名字池，功能不打折。
//   ③ **只落本机**：写进 storage（与 holderName 同一份 progress），不上传、不同步、不进埋点。
//   ④ **可查看 / 可修改 / 可清除**：护照页「我的资料」随时改，改完立即重取名字。
//
// 名字只出中文音译（藏文写法待母语审校，见 data/tibetan-names.js 文件头）。
var NAMES = require('../data/tibetan-names.js');

// 三档取值。'' = 还没选（首次引导会出现）；不设第四档，避免收集不必要的个人信息。
var GENDERS = [
  { key: 'male', label: '男' },
  { key: 'female', label: '女' },
  { key: 'unspecified', label: '不愿透露' }
];

// 归一化：任何不认识的值一律当作「未选择」（脏数据 / 旧版本 / 手改存储都不会把页面带崩）
function normalizeGender(v) {
  for (var i = 0; i < GENDERS.length; i++) {
    if (GENDERS[i].key === v) return v;
  }
  return '';
}

function isChosen(v) {
  return normalizeGender(v) !== '';
}

function labelOf(v) {
  var k = normalizeGender(v);
  for (var i = 0; i < GENDERS.length; i++) {
    if (GENDERS[i].key === k) return GENDERS[i].label;
  }
  return '未选择';
}

// 名字池：男 → male，女 → female，其余（含「不愿透露」）→ neutral
function poolOf(v) {
  var k = normalizeGender(v);
  if (k === 'male') return NAMES.male;
  if (k === 'female') return NAMES.female;
  return NAMES.neutral;
}

// 确定性取名字：同一个 seed 永远拿到同一个名字（不会每次刷新都变）。
// seed 由调用方给（本项目用「首次打开日期」），非数字 / 负数一律按 0 处理。
function pickFor(gender, seed) {
  var pool = poolOf(gender);
  if (!pool || !pool.length) return null;
  var n = Number(seed);
  if (!isFinite(n) || n < 0) n = 0;
  var i = Math.floor(n) % pool.length;
  return { name: pool[i].name, mean: pool[i].mean, gender: normalizeGender(gender) };
}

// 由日期串生成稳定 seed（'2026-10-09' → 各位数字之和）。同一天装的都是同一个名字，
// 不同日期装的人会散到池里的不同位置——够随机，也可复现。
function seedFromDate(dayStr) {
  var s = String(dayStr || '');
  var sum = 0;
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c >= 48 && c <= 57) sum += (c - 48);
    else sum += c;
  }
  return sum;
}

module.exports = {
  GENDERS: GENDERS,
  normalizeGender: normalizeGender,
  isChosen: isChosen,
  labelOf: labelOf,
  poolOf: poolOf,
  pickFor: pickFor,
  seedFromDate: seedFromDate
};
