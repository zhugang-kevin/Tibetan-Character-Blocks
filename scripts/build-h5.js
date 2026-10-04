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
  return 'data:image/png;base64,' + buf.toString('base64');
}

// ---------- 1. 注入数据（与小程序同源） ----------
const DATA = {
  elements: require(path.join(ROOT, 'data', 'elements')),
  cards: require(path.join(ROOT, 'data', 'cards')),
  levels: require(path.join(ROOT, 'data', 'levels')),
  stages: require(path.join(ROOT, 'data', 'stages')),
  merchants: require(path.join(ROOT, 'data', 'merchants'))
};

// ---------- 2. 注入品牌与背景资产 ----------
const IMAGES = {
  logo200: dataUrl('images/logo-200.png'),
  logo144: dataUrl('images/logo-144.png'),
  logo80: dataUrl('images/logo-80.png'),
  watermark: dataUrl('images/logo-watermark.png'),
  bgSky: dataUrl('images/bg-sky.png'),
  bgGround: dataUrl('images/bg-ground.png'),
  pattern: dataUrl('images/pat-tile.png')
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

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html, 'utf8');

const size = fs.statSync(OUT).size;
console.log('✓ 已生成 preview/play.html  (' + Math.round(size / 1024) + ' KB)');
console.log('  数据：' + Object.keys(DATA.elements).length + ' 个元素 / ' +
  DATA.cards.length + ' 张文化卡 / ' + DATA.levels.length + ' 关');
console.log('  阶梯：' + stages.length + ' 个阶段（已开放 ' +
  stages.filter(function (s) { return s.open; }).length + ' 个，每阶段 10 关一张证书）');
console.log('  资产：4 个 Logo + 3 个背景（经幡/布达拉宫/纹样，已内联 base64）');
console.log('  牌数一致性：10 关全部通过');
console.log('  权益中心：' + DATA.merchants.length + ' 家商家（本地生活 ' +
  DATA.merchants.filter(function (m) { return m.track === 'local'; }).length + ' / 游客专属 ' +
  DATA.merchants.filter(function (m) { return m.track === 'tourist'; }).length + ' / 通用 ' +
  DATA.merchants.filter(function (m) { return m.track === 'both'; }).length + '）');
console.log('\n  双击 preview/play.html 即可在浏览器试玩。');
