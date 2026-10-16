// utils/certificate.js — 藏文成长证书（成长阶梯的阶段证书）
//
// 证书体系三件事：
//   1) 门槛 —— 不只是「通关数」，还要质量：普通 / 银质 / 金质
//   2) 颁发 —— 通关某个阶段（每 10 关）的最后一关时颁发，只升不降（重玩提升正确率可升级）
//   3) 编号 —— ZWFK-YYYY-NNNN（ZWFK = 藏字方块拼音首字母），全球唯一、可展示
//
// 与「文化护照」的关系：护照是总档案，证书是护照里的「签证页」。
// 证书是藏文学习线，护照是整体文化线，两条线并行、互相支撑。
var levelsData = require('../data/levels');
var storage = require('./storage');
var PREFIX = 'ZWFK';
// 证书等级：质量门槛（正确率为该阶段各关「最佳正确率」的平均值）
// D32 对比度：tierColor 同时用作宣纸米卡上的「档名文字」与「白字档位标签的底」，
//   金 #B7950B（2.66 / 2.87 双向不达标）→ #8A6A12（4.69 / 5.06）
//   银 #7F8C8D（3.22 / 3.48）→ #5D6D7E（4.92 / 5.31）
var TIERS = {
  gold: {
    key: 'gold', label: '金质证书', seal: '金', color: '#8A6A12',
    minAccuracy: 0.95, requireClean: true,
    rule: '完成 10 关 · 正确率 ≥ 95% · 全程无失误'
  },
  silver: {
    key: 'silver', label: '银质证书', seal: '银', color: '#5D6D7E',
    minAccuracy: 0.80, requireClean: false,
    rule: '完成 10 关 · 正确率 ≥ 80%'
  },
  bronze: {
    key: 'bronze', label: '普通证书', seal: '普', color: '#C0392B',
    minAccuracy: 0, requireClean: false,
    rule: '完成 10 关'
  }
};
var TIER_RANK = { bronze: 1, silver: 2, gold: 3 };
function tierInfo(key) {
  return TIERS[key] || TIERS.bronze;
}
function tierRank(key) {
  return TIER_RANK[key] || 0;
}
// ---------- 文案 ----------
function formatDate(d) {
  var dt = d || new Date();
  return dt.getFullYear() + '年' + (dt.getMonth() + 1) + '月' + dt.getDate() + '日';
}
function pad4(n) {
  var s = String(n);
  while (s.length < 4) s = '0' + s;
  return s;
}
function certNo(seq, date) {
  var y = (date || new Date()).getFullYear();
  return PREFIX + '-' + y + '-' + pad4(seq);
}
// 通关一关后调用：**只记录本关成绩**。
// ⚠️ 2026-10-15（D119）起**不再颁发「藏文成长证书」** —— 那套 12 阶段旧体系已撤除：
//   它与「藏文拼读证书」**颗粒度完全相同**（都是每 10 课一张），
//   且进度读的是老 10 关线的 completedLevels、只有阶段 1 开放 —— 11 张永远拿不到。
//   学习线的证书走 issueLearningCert（同一份 storage.saveCert 列表，编号全球唯一）。
//   这里保留的仍是必需的：记录成绩（护照页输入）+ 算正确率（结算页显示）。
// r: { matches, attempts, misses, hints }
function onLevelComplete(level, r) {
  var stat = storage.recordLevelResult(level, r || {});
  return {
    stage: null,
    stat: stat,
    cert: null,
    isNew: false,
    upgraded: false,
    complete: false,
    accuracy: Math.round((r && r.attempts ? r.matches / r.attempts : 1) * 100),
    skill: null
  };
}
// ============================================================
// D51 学习体系证书：15 级各一张 + 集齐解锁终极「藏文拼读宗师」
//
// 与既有「12 阶段证书」的关系：**并存**，不是替换。
//   阶段证书 key = stage（1..12），学习证书用 `key: 'lv'+lv`（1..15）区分，
//   两者共用同一个 storage.saveCert 列表与同一个流水号（编号全球唯一）；
//   list() 按 stage 过滤 → 不受影响；ownedCount() 会把两套都算进去。
//
// 颁发口径：某级的 10 关全部通关（调用方在每关结算时把结果喂进来）→ 颁发该级证书；
//   质量门槛沿用三档（金 ≥95% 且零失误 / 银 ≥80% / 普 完成即给），与既有口径一致。
//   重習提升正确率可升级，**只升不降**（与既有 buildCert 的取口径相同）。
// ============================================================
var learningData = require('../data/learning');
function lvKey(lv) { return 'lv' + lv; }
function findLvCert(lv) {
  var all = storage.getCerts();
  for (var i = 0; i < all.length; i++) if (all[i].key === lvKey(lv)) return all[i];
  return null;
}
function lvTier(acc, clean) {
  if (acc >= TIERS.gold.minAccuracy && clean) return TIERS.gold;
  if (acc >= TIERS.silver.minAccuracy) return TIERS.silver;
  return TIERS.bronze;
}
// 构造学习证书对象（纯：只按传入的成绩构造，不落盘）
function buildLearningCert(lv, agg, prev) {
  var L = learningData.byLevel(lv);
  if (!L) return null;
  var tier = lvTier(agg.acc, agg.clean);
  var date = new Date();
  var seq = (prev && prev.seq) || storage.nextCertSeq();
  return {
    key: lvKey(lv),
    kind: 'learning',              // 与阶段证书区分（阶段证书无本字段）
    lv: lv,
    name: L.name,
    goal: L.goal,
    stages: L.stages,
    lines: learningData.ULTIMATE.lines && lv === 15 ? learningData.ULTIMATE.lines : [
      '完成 ' + L.stages + ' 个学习关卡',
      '正确率 ' + Math.round(agg.acc * 100) + '%'
    ],
    tier: tier.key,
    tierLabel: tier.label,
    tierSeal: tier.seal,
    tierColor: tier.color,
    tierRule: tier.rule,
    acc: Math.round(agg.acc * 100),
    clean: !!agg.clean,
    seq: seq,
    no: certNo(seq, date),
    holder: storage.getHolderName() || '藏文学习者',
    date: formatDate(date)
  };
}
// 某级全部通关后调用：agg = { acc: 0..1, clean: true/false }
// 未达更好成绩则原样返回旧证书（只升不降）
function issueLearningCert(lv, agg) {
  var a = agg || { acc: 1, clean: false };
  var prev = findLvCert(lv);
  var next = buildLearningCert(lv, { acc: a.acc, clean: !!a.clean }, prev);
  if (!next) return null;
  if (prev && tierRank(prev.tier) >= tierRank(next.tier)) {
    return { cert: prev, isNew: false, upgraded: false };
  }
  storage.saveCert(next);
  return { cert: next, isNew: !prev, upgraded: !!prev };
}
// 15 张学习证书的列表（护照 / 证书墙用）+ 终极证书状态
function learningList() {
  var rows = learningData.LEVELS.map(function (L) {
    var got = findLvCert(L.lv);
    return {
      lv: L.lv, key: lvKey(L.lv), name: L.name, goal: L.goal,
      stages: L.stages, cols: L.cols, rows: L.rows,
      unlocked: !!got, cert: got, tier: got ? got.tier : null,
      tierLabel: got ? got.tierLabel : '', tierColor: got ? got.tierColor : '',
      accuracy: got ? got.acc : 0
    };
  });
  var owned = rows.filter(function (r) { return r.unlocked; }).length;
  return {
    rows: rows,
    owned: owned,
    total: rows.length,                        // 15
    ultimate: {
      unlocked: owned >= rows.length,
      name: learningData.ULTIMATE.name,
      goal: learningData.ULTIMATE.goal,
      lines: learningData.ULTIMATE.lines,
      need: Math.max(0, rows.length - owned)   // 还差几张
    }
  };
}
module.exports = {
  PREFIX: PREFIX,
  TIERS: TIERS,

  tierInfo: tierInfo,
  tierRank: tierRank,

  onLevelComplete: onLevelComplete,

  formatDate: formatDate,
  certNo: certNo,

  // D51 学习体系证书
  lvKey: lvKey,
  findLvCert: findLvCert,
  buildLearningCert: buildLearningCert,
  issueLearningCert: issueLearningCert,
  learningList: learningList
};