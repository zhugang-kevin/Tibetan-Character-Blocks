// utils/resume.js — 三消「中途存档」的唯一编解码 / 校验（小程序与 H5 共用）
//
// ## 为什么单独一个纯模块
//   Q5 的要求是「退出保存**真实**盘面 / 随机源 / 目标 / 资源 / 版本，并能续玩」。
//   如果小程序与 H5 各写一份序列化，必然漂移（本项目已吃过「两端两套口径」的亏）。
//   所以：**快照结构与合法性只在这里定义一次**，两端只负责「存哪里」。
//
// ## 存什么（缺一不可）
//   v        版本号 —— 规则/字段变了，旧存档必须作废而不是硬读（避免读出一个坏局）
//   level    关卡号 —— 串关必须拒绝
//   seed     随机源 —— 续玩后的补池序列必须与退出前同源，否则「同一局」不成立
//   cols/rows 盘面形状 —— 与关卡配置不符必须拒绝
//   cells    当前盘面（含 special/frost/rope/crate 等牌属性）
//   pool     补池余量（资源）
//   nextUid  下一张牌的 uid（否则续玩后会撞号）
//   spent    已消张数（累计）
//   obj      目标 / 步数预算（目标模型）
//   left     剩余步数
//   cleared  已消张数（进度，与 spent 同源；分开存是为了显式校验）
//
// ## 铁律
//   **不伪造进度**：cleared 只来自真实消除；新局快照的 cleared 必须是 0。
//   校验不通过 → 调用方必须**丢弃存档、开新局**，不能「尽量恢复」。

'use strict';

var VERSION = 1;
var KEY = 'm3_resume_v1';

function num(v) {
  var n = Number(v);
  return isFinite(n) ? n : 0;
}

/** 从运行态取一份快照（纯函数，不改入参） */
function snapshot(src) {
  return {
    v: VERSION,
    level: num(src.level) | 0,
    seed: num(src.seed) >>> 0,
    // 随机源的**内部状态**（LCG 的 s）。只存 seed 会让补池序列从头开始，不是同一局。
    rngState: num(src.rngState) >>> 0,
    cols: num(src.cols) | 0,
    rows: num(src.rows) | 0,
    cells: src.cells,
    pool: src.pool || {},
    nextUid: num(src.nextUid) | 0,
    spent: num(src.spent) | 0,
    obj: { target: num(src.target) | 0, moves: num(src.moves) | 0 },
    left: num(src.left) | 0,
    cleared: num(src.cleared) | 0
  };
}

/**
 * 存档是否**可以安全恢复**。
 * @param {object} s 存档
 * @param {number} level 当前关卡
 * @param {number} slots 当前关卡格数（cols*rows）
 * @returns {boolean}
 */
function valid(s, level, slots) {
  if (!s || typeof s !== 'object') return false;
  if (s.v !== VERSION) return false;
  if ((num(s.level) | 0) !== (num(level) | 0)) return false;
  if (!Array.isArray(s.cells)) return false;
  if (s.cells.length !== (num(slots) | 0)) return false;
  if ((num(s.cols) | 0) * (num(s.rows) | 0) !== (num(slots) | 0)) return false;
  if (!s.obj || typeof s.obj !== 'object') return false;
  var target = num(s.obj.target) | 0;
  var moves = num(s.obj.moves) | 0;
  if (target <= 0 || moves <= 0) return false;
  var left = num(s.left) | 0;
  var cleared = num(s.cleared) | 0;
  if (left < 0 || left > moves) return false;     // 剩余步数不可能超过预算
  if (cleared < 0 || cleared > target) return false; // 达标即结算，不应超过目标
  // 每张非空牌必须有 id + uid（缺字段说明存档损坏/版本不兼容）
  for (var i = 0; i < s.cells.length; i++) {
    var t = s.cells[i];
    if (!t) continue;
    if (!t.id || t.uid == null) return false;
  }
  return true;
}

/** 稳定摘要（测试/日志用）：把会影响「同一局」的字段压成一行 */
function digest(s) {
  if (!s) return '';
  var ids = (s.cells || []).map(function (t) {
    if (!t) return '-';
    return t.id + ':' + t.uid
      + (t.special ? 'S' + t.special : '')
      + (t.frost ? 'F' : '')
      + (t.crate ? 'C' + t.crate : '')
      + (t.rope ? 'R' + t.rope : '');
  }).join(',');
  return [
    s.v, s.level, s.seed, s.rngState, s.cols, s.rows, s.nextUid, s.spent,
    s.obj && s.obj.target, s.obj && s.obj.moves, s.left, s.cleared, ids
  ].join('|');
}

module.exports = {
  VERSION: VERSION,
  KEY: KEY,
  snapshot: snapshot,
  valid: valid,
  digest: digest
};
