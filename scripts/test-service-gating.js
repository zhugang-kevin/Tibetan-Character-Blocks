#!/usr/bin/env node
/**
 * scripts/test-service-gating.js — Q18：客服「未开通」必须显式说明
 *
 * 规则：
 *   ① `config/service.js` 存在，且 `enabled` 是布尔值；
 *   ② 客服页读取该开关，并在未开通时**不渲染**客服按钮、显示说明；
 *   ③ 开关为 false 时页面仍有 `serviceNote`（不能出现"点了没反应"的假按钮）。
 *
 * 为什么：三个 tab 都在 ≠ 收发闭环。没绑定客服人员时 open-type="contact"
 *   点下去没有任何反应 —— 那比"写未开通"更伤人。
 *
 * 用法：node scripts/test-service-gating.js
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

const cfgPath = path.join(ROOT, 'config', 'service.js');
const jsPath = path.join(ROOT, 'package-service', 'pages', 'service', 'service.js');
const wxmlPath = path.join(ROOT, 'package-service', 'pages', 'service', 'service.wxml');

console.log('\n==========================================');
console.log('  Q18 客服 · 未开通必须明说');
console.log('==========================================\n');

chk('config/service.js 存在', fs.existsSync(cfgPath));
const cfg = fs.existsSync(cfgPath) ? require(cfgPath) : {};
chk('开关是布尔值', typeof cfg.enabled === 'boolean', typeof cfg.enabled);
chk('未开通时有说明文案', typeof cfg.note === 'string' && cfg.note.length >= 10, cfg.note);

const js = fs.existsSync(jsPath) ? fs.readFileSync(jsPath, 'utf8') : '';
chk('客服页读取了开关', /require\(['"].*config\/service['"]\)/.test(js));
chk('客服页把开关写进 data（serviceEnabled）', js.indexOf('serviceEnabled') > -1);
chk('客服页把说明写进 data（serviceNote）', js.indexOf('serviceNote') > -1);

const wxml = fs.existsSync(wxmlPath) ? fs.readFileSync(wxmlPath, 'utf8') : '';
const ifCount = (wxml.match(/wx:if="\{\{serviceEnabled\}\}"/g) || []).length;
chk('未开通时不渲染客服按钮（wx:if 包裹，≥2 处）', ifCount >= 2, 'count=' + ifCount);
chk('未开通时显示说明（serviceNote）', wxml.indexOf('{{serviceNote}}') > -1);
chk('页面没有裸的 open-type="contact"（必须被开关包住）',
  (wxml.match(/open-type="contact"/g) || []).length === ifCount,
  'contact=' + (wxml.match(/open-type="contact"/g) || []).length + ' / if=' + ifCount);

console.log('\n  通过: ' + PASS + ' | 失败: ' + FAIL);
if (FAIL) {
  console.log('');
  fails.forEach(f => console.log('   - ' + f));
  console.log('\n✗ 客服页可能出现"点了没反应"的假按钮。');
} else {
  console.log('  ✓ 客服页诚实：未开通只显示说明，开通后按钮自动出现。');
}
console.log('==========================================');
process.exit(FAIL ? 1 : 0);
