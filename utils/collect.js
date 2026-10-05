// utils/collect.js — 收集与留存系统的纯逻辑（不依赖 wx / DOM，页面与体验版镜像共用）
//
// 覆盖 PRD 五、六章的可本地实现部分：
//   唐卡碎片收集（9 片拼一幅）· 7 天循环签到（祈福长明灯）· 星级评价 · 积分与道具
// 合规约束：全部本地计算，无登录、无支付、无广告 SDK、无排行榜后端、不发放任何带金额的券。
var FRAGMENT_TOTAL = 9;
var CYCLE_DAYS = 7;

// 星级评价：按正确率与连击给星（0-3），只增不减由 storage 负责
function rateStars(attempts, misses, combo) {
  var tries = Math.max(1, attempts || 0);
  var acc = Math.max(0, tries - (misses || 0)) / tries;
  var stars = 1;
  if (acc >= 0.8) stars = 2;
  if (acc >= 0.95 && (combo || 0) >= 3) stars = 3;
  return stars;
}

// 日期工具：'YYYY-MM-DD' → 序号（本地时区，跨天判定用）
function dayNumber(dateStr) {
  var parts = String(dateStr).split('-');
  return Math.floor(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])) / 86400000);
}

// 签到序列推进（纯函数）：返回下一份签到状态 + 本次奖励索引
// signIn = { streak, lastDate, totalDays, oil }
function advanceSignIn(signIn, today) {
  var state = signIn && typeof signIn === 'object' ? signIn : {};
  var streak = state.streak || 0;
  var lastDate = state.lastDate || '';
  var totalDays = state.totalDays || 0;
  if (lastDate === today) {
    return { already: true, state: { streak: streak, lastDate: lastDate, totalDays: totalDays, oil: state.oil || 0 }, day: totalDays ? ((totalDays - 1) % CYCLE_DAYS) + 1 : 1 };
  }
  var diff = lastDate ? dayNumber(today) - dayNumber(lastDate) : null;
  streak = diff === 1 ? streak + 1 : 1;          // 断签即重新计数（不做惩罚性清零展示）
  totalDays += 1;
  var day = ((totalDays - 1) % CYCLE_DAYS) + 1;  // 7 天循环内的第几天
  return { already: false, state: { streak: streak, lastDate: today, totalDays: totalDays, oil: (state.oil || 0) + 1 }, day: day };
}

// 唐卡碎片：从未持有的碎片中取第 n 片（确定性，便于测试）
// 已有碎片数组 → 下一片编号（0-8），集齐返回 -1
function nextFragment(owned) {
  var have = owned || [];
  for (var i = 0; i < FRAGMENT_TOTAL; i++) {
    if (have.indexOf(i) === -1) return i;
  }
  return -1;
}

function fragmentComplete(owned) {
  return (owned || []).length >= FRAGMENT_TOTAL;
}

// 碎片落的盘面位（3×3 拼图），返回行列供样式定位
function fragmentCell(index) {
  return { row: Math.floor(index / 3), col: index % 3 };
}

// 非遗盲盒 / 日签：按日序确定性抽取（同一天抽到同一条，避免"刷"）
function pickDaily(pool, seed) {
  if (!pool || !pool.length) return null;
  var n = Math.abs(Math.floor(seed || 0));
  return pool[n % pool.length];
}

// 菩提树浇水：每次浇水给固定积分（无广告，仅靠游戏积分循环）
function waterReward() { return 12; }

// ---------- 文化收藏：槽位与进度（页面与体验版共用同一份口径） ----------
// order = [{ id, label, isLetter, color }]，seen = 已收藏的元素 id 数组。
// 关键设计：**未收藏的槽位不带 label**（页面只画「?」）——不剧透名字，
// 悬念本身就是「我还想看看下一张文化卡是什么」的动力。
function cardProgress(order, seen) {
  var have = seen || [];
  var list = order || [];
  var slots = [];
  var got = 0;
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    var has = have.indexOf(e.id) > -1;
    if (has) got++;
    slots.push({
      id: e.id,
      no: i + 1,
      label: has ? e.label : '',
      isLetter: !!e.isLetter,
      color: e.color || '#C0392B',
      got: has
    });
  }
  return { slots: slots, got: got, total: list.length, left: list.length - got };
}

// ---------- 每日打开记录（本地留存粗指标，内测期对账用） ----------
// 只落本地，不上传、不请求网络。state = { days, lastDate, streak, total, first }
function todayKey(d) {
  var dt = d || new Date();
  var m = dt.getMonth() + 1;
  var day = dt.getDate();
  return dt.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
}

function dayToDate(n) {
  return new Date(Number(n) * 86400000).toISOString().slice(0, 10);
}

var OPEN_KEEP_DAYS = 90;   // 只留最近 90 天，避免本地存储无上限增长

function markOpen(state, today) {
  var st = state && typeof state === 'object' ? state : {};
  var days = st.days || [];
  var lastDate = st.lastDate || '';
  var streak = st.streak || 0;
  var first = st.first || today;   // 首日只在第一次写入，供留存对账做基准
  if (lastDate === today) {
    return {
      isNewDay: false,
      streak: streak,
      state: { days: days, lastDate: lastDate, streak: streak, total: days.length, first: first }
    };
  }
  if (days.indexOf(today) === -1) days = days.concat([today]);
  if (days.length > OPEN_KEEP_DAYS) days = days.slice(days.length - OPEN_KEEP_DAYS);
  // 连续天数：隔天 +1，断签从 1 重新数（不做惩罚性清零展示）
  streak = lastDate ? (dayNumber(today) - dayNumber(lastDate) === 1 ? streak + 1 : 1) : 1;
  return {
    isNewDay: true,
    streak: streak,
    state: { days: days, lastDate: today, streak: streak, total: days.length, first: first }
  };
}

// 首日之后的第 n 天是否回来过（n = 1 即次日留存）。内测期由测试用户自查上报，
// 与微信「小程序数据助手」的留存曲线对照使用。
function retainedOn(state, n) {
  var st = state && typeof state === 'object' ? state : {};
  if (!st.first) return false;
  return (st.days || []).indexOf(dayToDate(dayNumber(st.first) + (n || 1))) > -1;
}

// 「藏文可以组合」预告：只在配置指定的那一关出现（当前 = 第 2 关，认全 ཀ ཁ ག ང 那一刻）。
// 纯判据函数——配置由调用方注入（本模块保持零依赖，便于被体验版镜像逐字复用），
// 页面不必自己内联「哪一关该讲解拼合」这条规则（将来挪关卡只改 data/combo.js）。
function comboTease(level, cfg) {
  if (!cfg) return null;
  if (Number(level) !== Number(cfg.level)) return null;
  return cfg;
}

module.exports = {
  FRAGMENT_TOTAL: FRAGMENT_TOTAL,
  CYCLE_DAYS: CYCLE_DAYS,
  OPEN_KEEP_DAYS: OPEN_KEEP_DAYS,
  rateStars: rateStars,
  dayNumber: dayNumber,
  dayToDate: dayToDate,
  todayKey: todayKey,
  advanceSignIn: advanceSignIn,
  nextFragment: nextFragment,
  fragmentComplete: fragmentComplete,
  fragmentCell: fragmentCell,
  pickDaily: pickDaily,
  waterReward: waterReward,
  cardProgress: cardProgress,
  markOpen: markOpen,
  retainedOn: retainedOn,
  comboTease: comboTease
};
