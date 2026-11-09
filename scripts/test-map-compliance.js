#!/usr/bin/env node
/**
 * scripts/test-map-compliance.js — Q13：游记不得变成"地图"
 *
 * 背景：境内发布地图必须使用自然资源部审核的标准地图；手绘简化轮廓**不能自动规避**。
 *   本项目当前的设计是「游记 = 文字 + 照片 + 路线示意」，**没有地图**（pages/index/index.js 明确写了"无地图"）。
 *   这个门禁做两件事：
 *     ① 锁死现状：不得出现 `<map>` 组件、不得引入省界/国界类地理数据或地图素材；
 *     ② 给出升级路径：一旦真的要加地图，必须换成标准地图并登记来源，不能悄悄手绘。
 *
 * 用法：node scripts/test-map-compliance.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let PASS = 0, FAIL = 0;
const fails = [];
function chk(name, cond, detail) {
  if (cond) { PASS++; console.log('  ✓ ' + name); }
  else { FAIL++; fails.push(name + (detail ? '：' + detail : '')); console.log('  ✗ ' + name + (detail ? ' → ' + detail : '')); }
}

function walk(dir, out, exts) {
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  ents.forEach(function (e) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out, exts);
    else if (exts.test(e.name)) out.push(p);
  });
}

console.log('\n==========================================');
console.log('  Q13 游记 · 地图合规');
console.log('==========================================\n');

const pages = [];
walk(path.join(ROOT, 'pages'), pages, /\.(wxml|js|json)$/);
const mapTags = [];
pages.forEach(function (f) {
  const src = fs.readFileSync(f, 'utf8');
  if (/<map[\s>]/.test(src)) mapTags.push(path.relative(ROOT, f));
});
chk('页面未使用 <map> 地图组件', mapTags.length === 0, mapTags.join('、'));

const idx = fs.readFileSync(path.join(ROOT, 'pages', 'index', 'index.js'), 'utf8');
chk('首页源码明确声明「无地图」', idx.indexOf('无地图') > -1);

// 地理数据/素材：省界、国界、geojson、china-map 等
const assets = [];
walk(path.join(ROOT, 'images'), assets, /\.(png|jpg|jpeg|webp|svg|json|geojson)$/);
const geoHits = assets.filter(function (f) {
  const b = path.basename(f).toLowerCase();
  return /geojson|china[-_]?map|province|省界|国界|ditu/.test(b);
}).map(function (f) { return path.relative(ROOT, f); });
chk('未引入省界/国界/geojson 等地理数据或素材', geoHits.length === 0, geoHits.slice(0, 3).join('、'));

// 升级路径必须写清：真要加地图 → 标准地图 + 来源登记
const dec = fs.readFileSync(path.join(ROOT, 'docs', 'DECISIONS.md'), 'utf8');
chk('决策台账写清「境内地图须用自然资源部标准地图」的口径',
  dec.indexOf('自然资源部') > -1 || dec.indexOf('标准地图') > -1);

console.log('\n  通过: ' + PASS + ' | 失败: ' + FAIL);
if (FAIL) {
  console.log('');
  fails.forEach(f => console.log('   - ' + f));
  console.log('\n✗ 地图合规不成立 —— 手绘轮廓不能自动规避标准地图要求。');
} else {
  console.log('  ✓ 游记保持「非地图」：无 map 组件、无省界/国界数据；加地图需走标准地图。');
}
console.log('==========================================');
process.exit(FAIL ? 1 : 0);
