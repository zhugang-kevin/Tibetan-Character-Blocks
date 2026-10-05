// utils/lamp.js — 「万家灯火」祈福跳窗的纯逻辑
// 只做三件事：判断是否当天首次打开、点亮后总数 +1、数字千分位格式化。
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

// 千分位：128456 → "128,456"
function formatCount(n) {
  var num = typeof n === 'number' && isFinite(n) ? Math.round(n) : 0;
  var s = String(num);
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
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
  fill: fill
};
