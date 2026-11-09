// utils/ladder.js — 朝圣天梯的入场动效几何（纯计算模块）
// 约束：本模块不 require 任何东西、不碰 wx / DOM、不发任何网络请求。
// 首页只需要把「地图的绝对位置 + 视口高度 + 当前台阶在地图内的百分比」交给它，
// 它给出两次 pageScrollTo 的目标像素：
//   foot   —— 山脚位置（多露一段「人间」，作为入场的第一帧）
//   settle —— 当前台阶位置（缓缓上行后停靠，落在视口偏下的位置，抬头就是天堂）
// 设计要点：foot 恒 ≥ settle，因此入场方向永远是「从山脚向山顶上行」，不会反向抖动。
var RISE_PX = 200;      // 先多露出的山脚像素，形成「上行」的位移量
var SETTLE_RATIO = 0.58; // 矮屏回退：台阶停靠在视口高度的 58% 处
var MARGIN = 0;         // 地图能整张放下时，顶部不留白（避免标题被切半行）
function num(v, d) {
  var n = typeof v === 'number' ? v : parseFloat(v);
  return (typeof n === 'number' && !isNaN(n) && isFinite(n)) ? n : d;
}
function clampTop(v) {
  var n = Math.round(v);
  return n < 0 ? 0 : n;
}
function buildPlan(input) {
  var o = input || {};
  var mapTop = num(o.mapTop, 0);
  var mapH = num(o.mapHeight, 0);
  var vh = num(o.viewportHeight, 667);
  var pct = num(o.nodeTopPct, 88);
  // 台阶在文档中的绝对纵坐标
  var nodeAbs = mapTop + mapH * (pct / 100);
  // 实玩修复（2026-10-23）：地图能整张放进视口（620 + 32 ≤ 视口）时，停在**地图顶部**，
  //   否则首屏会把地图上半段推出视口，看起来像被截断。
  //   矮屏（如 iPhone SE 568）放不下，回退到「当前台阶在 58%」。
  var topAligned = clampTop(mapTop - MARGIN);
  var nodeCentered = clampTop(nodeAbs - vh * SETTLE_RATIO);
  var settle = (mapH + MARGIN * 2 <= vh) ? topAligned : nodeCentered;
  var foot = clampTop(settle + RISE_PX);
  return { foot: foot, settle: settle, rise: foot - settle };
}
module.exports = {
  buildPlan: buildPlan,
  RISE_PX: RISE_PX,
  SETTLE_RATIO: SETTLE_RATIO,
  MARGIN: MARGIN
};