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
//
// ⚠️ 名字池是 **append-only**（只能在末尾追加，不得重排 / 改名 / 删名）。
//    理由：`pickFor` 用 seed 对池长取模，池一变长，同一个 seed 就会落到不同位置 ——
//    老用户会被「换名字」。所以：池只增不改 + 名字**存下来就钉死**（见 utils/storage.js#setGender
//    的「只在性别真的变了才重取」）。validate §45.10 持有一份冻结基线做前缀比对，
//    想改池必须同步改基线并回 docs/DECISIONS.md 补记录 —— 有意制造摩擦，避免随手重排。
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
// 返回值带 index：**下标要跟着名字一起落库**（storage 的 tibetanNameIndex），
// 日后池扩容（append-only）时凭下标就能确认「这个人的名字没被挤走」。
function pickFor(gender, seed) {
  var pool = poolOf(gender);
  if (!pool || !pool.length) return null;
  var n = Number(seed);
  if (!isFinite(n) || n < 0) n = 0;
  var i = Math.floor(n) % pool.length;
  return { name: pool[i].name, mean: pool[i].mean, index: i, gender: normalizeGender(gender) };
}

// 反查下标：老数据（D54 首版）只存了名字没存下标，用它补一个。
// 找不到（池里已无此名）返回 -1 —— 名字仍照常显示，只是无从定位，绝不因找不到就改名。
function indexOfName(gender, name) {
  var pool = poolOf(gender);
  for (var i = 0; i < pool.length; i++) {
    if (pool[i].name === name) return i;
  }
  return -1;
}

// 诊断用（**不用于改名**）：已存的名字是否还坐在它当年的位置上。
// 池被重排 / 删名时这里会报 pool-shifted —— 由守卫与测试发现，而不是偷偷换掉用户的名字。
function resolveStored(gender, name, index) {
  var pool = poolOf(gender);
  if (!pool || !pool.length) return { ok: false, reason: 'empty-pool' };
  var i = Number(index);
  if (!(i >= 0 && i < pool.length)) return { ok: false, reason: 'index-out-of-range' };
  if (pool[i].name !== name) return { ok: false, reason: 'pool-shifted' };
  return { ok: true, reason: '' };
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
  indexOfName: indexOfName,
  resolveStored: resolveStored,
  seedFromDate: seedFromDate
};
