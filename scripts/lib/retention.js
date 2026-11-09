// scripts/lib/retention.js — R16：D1 / D7 留存的纯函数口径
//
// ## 为什么要有它
//   R16 的原问题是「没有真实玩家证据」。真实玩家拿不到，但**指标口径**必须先定死，
//   否则将来拿到数据也会各算各的（"7 日留存"到底按自然日还是按 24h？）。
//
// ## 口径（与 utils/collect.js 的 openLog 对齐）
//   openLog = { days: ['YYYY-MM-DD', ...], first, lastDate, streak, total }
//   · D1 = 首次打开日的**次日**也打开过
//   · D7 = 首次打开日的**第 7 天**也打开过（首日算第 0 天）
//   · 观察窗口不足（今天还没到 首日+1 / +7）→ 该项为 `null`（不可测），不能算"未留存"
//   · 只统计**可测**的用户；分母 = 可测人数，不是全体
//
// ## 铁律
//   null ≠ false。把"还没到观察期"算成"流失"是最常见的假数据来源。

'use strict';

function dayNumber(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return NaN;
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000);
}

function maxDay(days) {
  var mx = NaN;
  (days || []).forEach(function (d) {
    var n = dayNumber(d);
    if (isFinite(n) && (!isFinite(mx) || n > mx)) mx = n;
  });
  return mx;
}

/**
 * 单个用户的 D1 / D7。
 * @param {{days:string[]}} state openLog
 * @returns {{d1:(boolean|null), d7:(boolean|null), first:string, span:number}}
 */
function retention(state) {
  var days = (state && state.days) || [];
  var first = days.length ? days[0] : '';
  var f = dayNumber(first);
  if (!isFinite(f)) return { d1: null, d7: null, first: '', span: 0 };
  var set = {};
  days.forEach(function (d) { set[d] = 1; });
  var last = maxDay(days);
  var span = isFinite(last) ? (last - f) : 0;

  function at(n) {
    var target = f + n;
    var key = new Date(target * 86400000).toISOString().slice(0, 10);
    if (set[key]) return true;
    return span >= n ? false : null;   // 观察期不够 → 不可测
  }
  return { d1: at(1), d7: at(7), first: first, span: span };
}

/**
 * 队列汇总：只统计可测用户。
 * @param {{days:string[]}[]} states
 */
function cohort(states) {
  var arr = Array.isArray(states) ? states : [];
  var d1Meas = 0, d1Ret = 0, d7Meas = 0, d7Ret = 0;
  arr.forEach(function (s) {
    var r = retention(s);
    if (r.d1 !== null) { d1Meas++; if (r.d1) d1Ret++; }
    if (r.d7 !== null) { d7Meas++; if (r.d7) d7Ret++; }
  });
  return {
    n: arr.length,
    d1: { measurable: d1Meas, retained: d1Ret, rate: d1Meas ? d1Ret / d1Meas : null },
    d7: { measurable: d7Meas, retained: d7Ret, rate: d7Meas ? d7Ret / d7Meas : null }
  };
}

module.exports = { dayNumber: dayNumber, retention: retention, cohort: cohort };
