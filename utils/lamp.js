// utils/lamp.js — 「万家灯火」祈福跳窗的纯逻辑
// 只做四件事：判断是否当天首次打开、点亮后总数 +1、数字千分位、万/亿口径。
// 全部为纯函数：不读存储、不发请求、不碰任何小程序 API（便于门禁直接断言）。
// 存储读写由页面通过 utils/storage 完成，保持「逻辑与存储分离」的项目约定。

// 每天只提醒一次：上次点亮的日期 != 今天 → 视为当天首次打开
function isFirstOpenToday(lastDay, today) {
  return String(lastDay || '') !== String(today || '');
}

// 点亮一盏灯：只在数值上 +1（视觉数字变化，不代表任何真实统计）
function lightOne(total) {
  var n = typeof total === 'number' && isFinite(total) ? total : 0;
  return n + 1;
}

// 千分位：128456 → "128,456"（精确保留，用于副行）
function formatCount(n) {
  var num = typeof n === 'number' && isFinite(n) ? Math.round(n) : 0;
  var s = String(num);
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// 保留两位并去掉无意义的尾随零：1.20 → "1.2"；12.8456 → "12.85"；1.00 → "1"
function trim2(x) {
  var s = x.toFixed(2).replace(/\.?0+$/, '');
  return s === '' ? '0' : s;
}

// 万/亿口径：主数字读起来短，副行仍保留精确千分位（两个函数并存，互不替代）
//   9999 → "9,999"（不足一万不加单位，避免 0.99万 这种更难读的形式）
//   10000 → "1万"；12000 → "1.2万"；128456 → "12.85万"
//   100000000 → "1亿"；1284567800 → "12.85亿"
// 边界：99,999,999 两位四舍五入会顶到 10000万 → 进位成 "1亿"（不留 10000万）
function formatWan(n) {
  var num = typeof n === 'number' && isFinite(n) ? Math.round(n) : 0;
  var sign = num < 0 ? '-' : '';
  var abs = Math.abs(num);
  if (abs >= 1e8) return sign + trim2(abs / 1e8) + '亿';
  if (abs >= 1e4) {
    var wan = trim2(abs / 1e4);
    if (Number(wan) >= 1e4) return sign + trim2(abs / 1e8) + '亿';
    return sign + wan + '万';
  }
  return sign + formatCount(abs);
}

// 地区行的辉光等级：纯装饰，按「行的位置」循环取 1..4，**刻意不按数量排**
// 数据层已声明「只作平和的地域灯火展示，不标示高低与位次」，
// 因此辉光绝不能是数量的单调函数（否则等于用亮度做了个排行榜）。
// 序列 3,1,4,2,3 —— 既非递增也非递减，门禁 §19.9 会机械证明这一点。
var GLOW_ORDER = [3, 1, 4, 2, 3];

function glowLevel(index) {
  var i = typeof index === 'number' && isFinite(index) ? Math.abs(Math.floor(index)) : 0;
  return GLOW_ORDER[i % GLOW_ORDER.length];
}

// 模板占位符代入：{a} → obj.a（文案里不写死数字，避免扩充时变假话）
function fill(tpl, obj) {
  return String(tpl || '').replace(/\{(\w+)\}/g, function (m, k) {
    return obj && obj[k] !== undefined ? String(obj[k]) : '';
  });
}

module.exports = {
  isFirstOpenToday: isFirstOpenToday,
  lightOne: lightOne,
  formatCount: formatCount,
  formatWan: formatWan,
  GLOW_ORDER: GLOW_ORDER,
  glowLevel: glowLevel,
  fill: fill
};
