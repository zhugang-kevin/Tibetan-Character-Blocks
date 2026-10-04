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
  levels: require(path.join(ROOT, 'data', 'levels'))
};

// ---------- 2. 注入品牌资产 ----------
const IMAGES = {
  logo200: dataUrl('images/logo-200.png'),
  logo144: dataUrl('images/logo-144.png'),
  logo80: dataUrl('images/logo-80.png'),
  watermark: dataUrl('images/logo-watermark.png')
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

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html, 'utf8');

const size = fs.statSync(OUT).size;
console.log('✓ 已生成 preview/play.html  (' + Math.round(size / 1024) + ' KB)');
console.log('  数据：' + Object.keys(DATA.elements).length + ' 个元素 / ' +
  DATA.cards.length + ' 张文化卡 / ' + DATA.levels.length + ' 关');
console.log('  资产：4 个 Logo（已内联为 base64）');
console.log('  牌数一致性：10 关全部通过');
console.log('\n  双击 preview/play.html 即可在浏览器试玩。');
