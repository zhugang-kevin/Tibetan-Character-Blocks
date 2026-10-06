// utils/certificate.js — 藏文成长证书（成长阶梯的阶段证书）
//
// 证书体系三件事：
//   1) 门槛 —— 不只是「通关数」，还要质量：普通 / 银质 / 金质
//   2) 颁发 —— 通关某个阶段（每 10 关）的最后一关时颁发，只升不降（重玩提升正确率可升级）
//   3) 编号 —— ZWFK-YYYY-NNNN（ZWFK = 藏字方块拼音首字母），全球唯一、可展示
//
// 与「文化护照」的关系：护照是总档案，证书是护照里的「签证页」。
// 证书是藏文学习线，护照是整体文化线，两条线并行、互相支撑。
var stagesData = require('../data/stages');
var elementsData = require('../data/elements');
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

// ---------- 阶段查询 ----------
function stageOf(level) {
  for (var i = 0; i < stagesData.length; i++) {
    var s = stagesData[i];
    if (level >= s.from && level <= s.to) return s;
  }
  return null;
}

function stageByNo(n) {
  for (var i = 0; i < stagesData.length; i++) {
    if (stagesData[i].stage === n) return stagesData[i];
  }
  return null;
}

// 下一阶段（结算页「下一步」预告用）。
// 为什么需要它：12 阶段路线图一直只在证书页（pages/cert）可见，
// 而「要不要继续」的决策发生在结算页——多一层跳转就少一次钩子。
// 文案一律取自 data/stages.js（name / goal / from / to / open），
// 页面不写死任何阶段名，内容库扩充后自动生效。
function nextStage(stageNo) {
  var n = parseInt(stageNo, 10);
  if (!n || n < 1) return null;
  return stageByNo(n + 1);
}

function tierInfo(key) {
  return TIERS[key] || TIERS.bronze;
}

function tierRank(key) {
  return TIER_RANK[key] || 0;
}

// ---------- 阶段内容（证书上「真的学会了什么」的数据来源） ----------
// 按真实关卡数据统计，内容库扩充后证书文案自动跟随，不需要改模板
function stageContent(stage) {
  var seen = {};
  var letters = 0, icons = 0, pairs = 0;
  for (var n = stage.from; n <= stage.to; n++) {
    var cfg = levelsData[n - 1];
    if (!cfg) continue;
    for (var k = 0; k < cfg.elements.length; k++) {
      var pair = cfg.elements[k];
      pairs += pair[1] / 2;
      if (seen[pair[0]]) continue;
      seen[pair[0]] = true;
      var el = elementsData[pair[0]];
      if (el && el.type === 'letter') letters++;
      else icons++;
    }
  }
  return { letters: letters, icons: icons, elements: letters + icons, pairs: pairs };
}

// ---------- 正确率聚合（按「各关最佳正确率」平均，重玩可提升） ----------
function aggregate(stage) {
  var ls = storage.getLevelStats();
  var sum = 0, played = 0, clean = true, hints = 0;
  for (var n = stage.from; n <= stage.to; n++) {
    var s = ls[n];
    if (!s) continue;
    played++;
    sum += s.bestAcc || 0;
    if (!s.clean) clean = false;
  }
  var avg = played ? sum / played : 0;
  return { levels: played, avgAcc: avg, clean: clean, hints: hints };
}

function tierOf(agg) {
  if (agg.avgAcc >= TIERS.gold.minAccuracy && (!TIERS.gold.requireClean || agg.clean) && agg.hints === 0) {
    return TIERS.gold;
  }
  if (agg.avgAcc >= TIERS.silver.minAccuracy) return TIERS.silver;
  return TIERS.bronze;
}

function isStageComplete(stage) {
  var done = storage.getProgress().completedLevels;
  for (var n = stage.from; n <= stage.to; n++) {
    if (done.indexOf(n) === -1) return false;
  }
  return true;
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

function buildLines(stage, content) {
  var tpl = stage.certLines && stage.certLines.length ? stage.certLines : [
    '完成 {levels} 个关卡'
  ];
  var levels = stage.to - stage.from + 1;
  return tpl.map(function (t) {
    return t
      .replace(/\{letters\}/g, content.letters)
      .replace(/\{icons\}/g, content.icons)
      .replace(/\{elements\}/g, content.elements)
      .replace(/\{pairs\}/g, content.pairs)
      .replace(/\{levels\}/g, levels)
      .replace(/\{stage\}/g, stage.stage)
      .replace(/\{name\}/g, stage.name);
  });
}

// ---------- 颁发 ----------
function buildCert(stage, tier, agg, content, prev) {
  var date = new Date();
  var seq = (prev && prev.seq) || storage.nextCertSeq();
  return {
    stage: stage.stage,
    stageName: stage.name,
    stageGoal: stage.goal,
    from: stage.from,
    to: stage.to,
    tier: tier.key,
    tierLabel: tier.label,
    tierSeal: tier.seal,
    tierColor: tier.color,
    tierRule: tier.rule,
    acc: Math.round(agg.avgAcc * 100),
    clean: agg.clean,
    levels: stage.to - stage.from + 1,
    lines: buildLines(stage, content),
    seq: seq,
    no: certNo(seq, date),
    holder: storage.getHolderName() || '藏文学习者',
    date: formatDate(date)
  };
}

// 通关一关后调用：先记录本关成绩，再判断该阶段是否已通关并（升级）颁发证书
// r: { matches, attempts, misses, hints }
function onLevelComplete(level, r) {
  var stat = storage.recordLevelResult(level, r || {});
  var stage = stageOf(level);
  var out = {
    stage: stage,
    stat: stat,
    cert: null,
    isNew: false,
    upgraded: false,
    complete: false,
    accuracy: Math.round((r && r.attempts ? r.matches / r.attempts : 1) * 100),
    skill: null   // 距离金银质还差什么
  };
  if (!stage || !stage.open) return out;

  out.complete = isStageComplete(stage);
  if (!out.complete) {
    out.skill = nextTierHint(aggregate(stage));
    return out;
  }

  var agg = aggregate(stage);
  var tier = tierOf(agg);
  var prev = storage.findCert(stage.stage);
  if (prev && tierRank(tier.key) <= tierRank(prev.tier)) {
    out.cert = prev;
    return out;
  }
  var cert = buildCert(stage, tier, agg, stageContent(stage), prev);
  storage.saveCert(cert);
  out.cert = cert;
  out.isNew = !prev;
  out.upgraded = !!prev;
  return out;
}

// 距离更高一级证书还差什么（用于结算页/护照页的鼓励文案）
function nextTierHint(agg) {
  if (agg.levels === 0) return { text: '完成本阶段关卡即可获得证书', tier: 'bronze' };
  if (agg.avgAcc >= TIERS.gold.minAccuracy && agg.clean) return null;
  if (agg.avgAcc >= TIERS.silver.minAccuracy) {
    return { text: '保持零失误即可升为金质证书', tier: 'gold' };
  }
  return { text: '正确率提升到 80% 即可升为银质证书', tier: 'silver' };
}

// ---------- 12 张证书的列表（文化护照用） ----------
function list() {
  var certs = storage.getCerts();
  return stagesData.map(function (s) {
    var got = null;
    for (var i = 0; i < certs.length; i++) {
      if (certs[i].stage === s.stage) { got = certs[i]; break; }
    }
    var agg = s.open ? aggregate(s) : null;
    return {
      stage: s.stage,
      name: s.name,
      goal: s.goal,
      from: s.from,
      to: s.to,
      open: s.open,
      unlocked: !!got,
      cert: got,
      tier: got ? got.tier : null,
      tierLabel: got ? got.tierLabel : '',
      tierColor: got ? got.tierColor : '',
      // 未获得时显示阶段进度（x/10），产生「还差几关」的牵引
      progress: agg ? agg.levels : 0,
      total: s.to - s.from + 1,
      accuracy: agg ? Math.round(agg.avgAcc * 100) : 0
    };
  });
}

function ownedCount() {
  return storage.getCerts().length;
}

module.exports = {
  PREFIX: PREFIX,
  TIERS: TIERS,
  list: list,
  ownedCount: ownedCount,
  stageOf: stageOf,
  stageByNo: stageByNo,
  nextStage: nextStage,
  stageContent: stageContent,
  aggregate: aggregate,
  tierOf: tierOf,
  tierInfo: tierInfo,
  tierRank: tierRank,
  isStageComplete: isStageComplete,
  onLevelComplete: onLevelComplete,
  nextTierHint: nextTierHint,
  formatDate: formatDate,
  certNo: certNo,
  buildLines: buildLines
};
