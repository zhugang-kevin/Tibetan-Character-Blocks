#!/usr/bin/env node
/**
 * scripts/build-h5.js — 生成浏览器本地体验版（零安装）
 *
 * 作用：
 *   把 data/*.js 的数据与 images/*.png 的 Logo 资产注入 preview/template.html，
 *   产出单文件 preview/play.html，双击即可用浏览器试玩。
 *
 * 为什么要这样做：
 *   微信开发者工具未安装 / 无法使用时，仍能验证玩法与数值。
 *   数据来自同一份 data/ 目录，不会与小程序版本产生分歧。
 *
 * 用法：
 *   node scripts/build-h5.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE = path.join(ROOT, 'preview', 'template.html');
const OUT = path.join(ROOT, 'preview', 'play.html');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}
function dataUrl(rel) {
  const buf = fs.readFileSync(path.join(ROOT, rel));
  const mime = /\.jpe?g$/i.test(rel) ? 'image/jpeg' : 'image/png';
  return 'data:' + mime + ';base64,' + buf.toString('base64');
}

// ---------- 1. 注入数据（与小程序同源） ----------
const DATA = {
  elements: require(path.join(ROOT, 'data', 'elements')),
  cards: require(path.join(ROOT, 'data', 'cards')),
  levels: require(path.join(ROOT, 'data', 'levels')),
  stages: require(path.join(ROOT, 'data', 'stages')),
  merchants: require(path.join(ROOT, 'data', 'merchants')),
  // PRD v4 首页：五地剪影 + 悬浮入口内容池（日签 / 盲盒 / 道具铺 / 菩提树 / 冬游）
  regions: require(path.join(ROOT, 'data', 'regions')),
  daily: require(path.join(ROOT, 'data', 'daily'))
};

// ---------- 2. 注入品牌与背景资产 ----------
const IMAGES = {
  logo200: dataUrl('images/logo-200.png'),
  logo144: dataUrl('images/logo-144.png'),
  logo80: dataUrl('images/logo-80.png'),
  watermark: dataUrl('images/logo-watermark.png'),
  bgSky: dataUrl('images/bg-sky.png'),
  bgGround: dataUrl('images/bg-ground.png'),
  bgGlobal: dataUrl('images/bg-global-h5.jpg'),
  pattern: dataUrl('images/pat-tile.png'),
  // 精灵表字母（试点 ཀ）：全部该字母方块共用一张 2×2 四色帧图
  spriteKa: dataUrl('images/sprite_ka.png')
};

let html = fs.readFileSync(TEMPLATE, 'utf8');

if (html.indexOf('/*__DATA__*/') === -1 || html.indexOf('/*__IMAGES__*/') === -1) {
  console.error('✗ 模板缺少 /*__DATA__*/ 或 /*__IMAGES__*/ 占位符');
  process.exit(1);
}

html = html.replace('/*__DATA__*/', JSON.stringify(DATA));
html = html.replace('/*__IMAGES__*/', JSON.stringify(IMAGES));

// ---------- 3. 内联脚本语法自检 ----------
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) {
  console.error('✗ 未找到内联 <script> 块');
  process.exit(1);
}
try {
  // 只做语法解析，不执行
  new Function(m[1]);
} catch (e) {
  console.error('✗ 内联脚本语法错误：' + e.message);
  process.exit(1);
}

// ---------- 4. 数据一致性抽查 ----------
let bad = 0;
DATA.levels.forEach(function (cfg) {
  const total = cfg.elements.reduce(function (s, e) { return s + e[1]; }, 0);
  const even = cfg.elements.every(function (e) { return e[1] % 2 === 0; });
  if (total !== cfg.cols * cfg.rows || !even) {
    console.error('✗ 第 ' + cfg.level + ' 关牌数不符：total=' + total + ' grid=' + (cfg.cols * cfg.rows));
    bad++;
  }
});
if (bad) process.exit(1);

// ---------- 5. 成长阶梯一致性抽查（每阶段 10 关、区间连续、不重叠） ----------
const stages = DATA.stages;
let stageBad = 0;
if (stages.length !== 12) {
  console.error('✗ 成长阶梯应为 12 个阶段，实际 ' + stages.length);
  stageBad++;
}
stages.forEach(function (s, i) {
  const span = s.to - s.from + 1;
  if (span !== 10) { console.error('✗ 第 ' + s.stage + ' 阶段跨度应为 10 关，实际 ' + span); stageBad++; }
  if (i > 0 && s.from !== stages[i - 1].to + 1) {
    console.error('✗ 第 ' + s.stage + ' 阶段与上一阶段区间不连续（' + s.from + ' ≠ ' + (stages[i - 1].to + 1) + '）');
    stageBad++;
  }
  const levelsInRange = DATA.levels.filter(function (l) { return l.level >= s.from && l.level <= s.to; }).length;
  if (s.open && levelsInRange !== 10) {
    console.error('✗ 已开放阶段「' + s.name + '」应有 10 关数据，实际 ' + levelsInRange);
    stageBad++;
  }
});
if (stageBad) process.exit(1);

// ---------- 6. 权益中心一致性抽查（双轨标签合法 + 城市合法 + 无金额字段） ----------
const CITY_IDS = require(path.join(ROOT, 'utils', 'benefits')).CITIES.map(function (c) { return c.id; });
const TRACKS = ['local', 'tourist', 'both'];
const KINDS = ['gift', 'combo', 'priority', 'stamp'];
let merchantBad = 0;
const seenMid = {};
DATA.merchants.forEach(function (m) {
  if (seenMid[m.id]) { console.error('✗ 商家 id 重复：' + m.id); merchantBad++; }
  seenMid[m.id] = true;
  if (TRACKS.indexOf(m.track) === -1) { console.error('✗ ' + m.id + ' 轨标签非法：' + m.track); merchantBad++; }
  if (CITY_IDS.indexOf(m.city) === -1) { console.error('✗ ' + m.id + ' 城市非法：' + m.city); merchantBad++; }
  if (KINDS.indexOf(m.kind) === -1) { console.error('✗ ' + m.id + ' 权益类型非法：' + m.kind); merchantBad++; }
  if (!m.offer || m.need < 0) { console.error('✗ ' + m.id + ' 缺少 offer 或 need 非法'); merchantBad++; }
  // 券不承载金额：不得出现平台侧价格字段
  ['price', 'amount', 'discount', 'fee', 'rate', 'settle'].forEach(function (k) {
    if (Object.prototype.hasOwnProperty.call(m, k)) {
      console.error('✗ ' + m.id + ' 含金额/结算字段 ' + k + '（券不承载金额，见 docs/privilege-system-v1.md）');
      merchantBad++;
    }
  });
});
if (!DATA.merchants.some(function (m) { return m.need === 0; })) {
  console.error('✗ 至少要有 1 条 need=0 的权益，新用户才有的可领');
  merchantBad++;
}
if (merchantBad) process.exit(1);

// ---------- 7. 首页内容池一致性抽查（五地剪影 / 日签 / 盲盒 / 道具铺） ----------
let homeBad = 0;
if (!DATA.regions || DATA.regions.length !== 5) { console.error('✗ data/regions.js 应为 5 个地区剪影'); homeBad++; }
(DATA.regions || []).forEach(function (r) {
  if (!r.id || !r.name || !r.shape) { console.error('✗ 地区缺少 id/name/shape：' + JSON.stringify(r)); homeBad++; }
  if (!(r.from >= 1 && r.to <= DATA.levels.length && r.from <= r.to)) {
    console.error('✗ 地区 ' + r.id + ' 关卡区间非法：' + r.from + '-' + r.to); homeBad++;
  }
});
// 五地必须完整覆盖 1-10 关，不能有断档
const covered = {};
(DATA.regions || []).forEach(function (r) { for (let n = r.from; n <= r.to; n++) covered[n] = (covered[n] || 0) + 1; });
for (let n = 1; n <= DATA.levels.length; n++) {
  if (covered[n] !== 1) { console.error('✗ 第 ' + n + ' 关未被任何地区覆盖一次（实际 ' + (covered[n] || 0) + ' 次）'); homeBad++; }
}
const daily = DATA.daily || {};
if (!daily.greetings || daily.greetings.length < 7) { console.error('✗ data/daily.js 日签至少 7 条'); homeBad++; }
(daily.greetings || []).forEach(function (g) {
  if (!g.tibetan || !g.cn) { console.error('✗ 日签缺少藏文或中文：' + JSON.stringify(g)); homeBad++; }
});
if (!daily.trivia || daily.trivia.length < 6) { console.error('✗ data/daily.js 非遗小知识至少 6 条'); homeBad++; }
if (!daily.signInRewards || daily.signInRewards.length !== 7) { console.error('✗ 签到奖励应为 7 天循环'); homeBad++; }
(daily.signInRewards || []).forEach(function (r) {
  if (['points', 'item', 'oil', 'card'].indexOf(r.kind) === -1) { console.error('✗ 签到奖励类型非法：' + r.kind); homeBad++; }
});
if (!daily.shop || daily.shop.length < 2) { console.error('✗ 道具铺至少 2 件道具'); homeBad++; }
(daily.shop || []).forEach(function (it) {
  if (!it.id || !(it.cost > 0)) { console.error('✗ 道具缺少 id 或 cost 非法：' + JSON.stringify(it)); homeBad++; }
  // 道具用积分兑换：不得出现金额 / 结算字段
  ['price', 'amount', 'fee', 'settle'].forEach(function (k) {
    if (Object.prototype.hasOwnProperty.call(it, k)) { console.error('✗ 道具 ' + it.id + ' 含金额字段 ' + k); homeBad++; }
  });
});
if (!daily.tree || !daily.winter || !daily.winter.items || !daily.winter.items.length) {
  console.error('✗ data/daily.js 缺少菩提树 / 冬游西藏内容'); homeBad++;
}
if (homeBad) process.exit(1);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html, 'utf8');

const size = fs.statSync(OUT).size;
console.log('✓ 已生成 preview/play.html  (' + Math.round(size / 1024) + ' KB)');
console.log('  数据：' + Object.keys(DATA.elements).length + ' 个元素 / ' +
  DATA.cards.length + ' 张文化卡 / ' + DATA.levels.length + ' 关');
console.log('  阶梯：' + stages.length + ' 个阶段（已开放 ' +
  stages.filter(function (s) { return s.open; }).length + ' 个，每阶段 10 关一张证书）');
console.log('  资产：4 个 Logo + 4 个背景（全局底图/经幡/布达拉宫/纹样，已内联 base64）');
console.log('  牌数一致性：10 关全部通过');
console.log('  权益中心：' + DATA.merchants.length + ' 家商家（本地生活 ' +
  DATA.merchants.filter(function (m) { return m.track === 'local'; }).length + ' / 游客专属 ' +
  DATA.merchants.filter(function (m) { return m.track === 'tourist'; }).length + ' / 通用 ' +
  DATA.merchants.filter(function (m) { return m.track === 'both'; }).length + '）');
console.log('\n  双击 preview/play.html 即可在浏览器试玩。');
