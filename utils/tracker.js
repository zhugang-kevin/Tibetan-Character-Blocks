// utils/tracker.js — 15分钟核心体验埋点（Gate 1 测试用，仅本地存储）
//
// 节点表对应《4.1 方案》15分钟体验表：
//   first_letter_seen      0:20 第一次看到藏文字母
//   first_pronunciation    1:00 第一次听到藏文发音
//   first_match            0:20 第一次成功消除
//   first_card             2:00 第一次获得文化卡
//   first_combo            4:00 第一次连击
//   first_special          6:00 第一次遇到特殊方块
//   first_combination      8:00 第一次完成藏文字块组合（V2 玩法占位）
//   first_stamp           10:00 解锁第一个文化护照印记
//   next_level_click      15:00 玩家主动点击"下一关"
//
// 时间基准：首次 track 时记为 0 秒（startedAt），之后记录相对秒数。
// Gate 1 测试后可通过 tracker.report() 导出（开发工具 Storage 面板查看
// 'milestones'，或结算页调试模式读取）。

var KEY = 'milestones';

function load() {
  // 与 utils/storage.js 同一口径：读失败 / 脏数据一律当成「还没有埋点数据」，
  // 埋点是诊断用的，绝不能因为它抛异常影响游戏主流程。
  var d = null;
  try {
    var v = wx.getStorageSync(KEY);
    d = (v && typeof v === 'object' && !Array.isArray(v)) ? v : null;
  } catch (e) { d = null; }
  return (d && d.startedAt && d.events) ? d : { startedAt: 0, events: {} };
}

function save(d) {
  try { wx.setStorageSync(KEY, d); } catch (e) { /* 存储满不影响游戏 */ }
}

/**
 * 记录里程碑（幂等：同一 id 只记录第一次到达的秒数）
 */
function track(id) {
  var d = load();
  if (!d.startedAt) d.startedAt = Date.now();
  if (!d.events[id]) {
    d.events[id] = Math.round((Date.now() - d.startedAt) / 1000);
    save(d);
  }
}

/** 已记录的事件表 { id: 秒 } */
function report() {
  return load().events;
}

/** 测试结束重置（下一轮 Gate 1 测试用） */
function reset() {
  try { wx.removeStorageSync(KEY); } catch (e) {}
}

module.exports = {
  track: track,
  report: report,
  reset: reset
};
