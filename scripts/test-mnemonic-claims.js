#!/usr/bin/env node
/**
 * scripts/test-mnemonic-claims.js — Q2：字形联想不得伪装成"字源"
 *
 * 规则（2026-10-23）：
 *   ① 玩家可见内容（data/ 与 pages/）**不得**出现「象形」「字源是」「正坐着的人」这类
 *      把助记比喻说成文字起源的表述。
 *   ② 产品愿景文档必须明确写出「助记联想，不是字源」，且给出禁止句式。
 *
 * 为什么需要它：Q2 的原问题就是「像正坐的人」被当成真实字源。
 *   助记本身可以留，但**必须标注性质**；否则就是在教伪知识。
 *
 * 用法：node scripts/test-mnemonic-claims.js
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

function walk(dir, out) {
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  ents.forEach(function (e) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|wxml|json)$/.test(e.name)) out.push(p);
  });
}

const files = [];
walk(path.join(ROOT, 'data'), files);
walk(path.join(ROOT, 'pages'), files);

// 伪字源句式（只在玩家可见的数据/页面里扫；文档里的"禁止…"说明不算）
const FORBID = ['象形', '字源是', '正坐着的人'];
const hits = [];
files.forEach(function (f) {
  let src = '';
  try { src = fs.readFileSync(f, 'utf8'); } catch (e) { return; }
  FORBID.forEach(function (w) {
    if (src.indexOf(w) > -1) hits.push(path.relative(ROOT, f) + '：' + w);
  });
});

console.log('\n==========================================');
console.log('  Q2 字形联想 · 不得伪装字源');
console.log('==========================================\n');
chk('玩家可见内容无伪字源句式（象形/字源是/正坐着的人）', hits.length === 0, hits.slice(0, 3).join('；'));
chk('扫描覆盖 data/ 与 pages/', files.length > 10, 'files=' + files.length);

const doc = path.join(ROOT, 'docs', 'PRODUCT-VISION-19Q.md');
const src = fs.existsSync(doc) ? fs.readFileSync(doc, 'utf8') : '';
chk('愿景文档明确写「助记联想」', src.indexOf('助记联想') > -1);
chk('愿景文档明确写「不是字源」', src.indexOf('不是字源') > -1);
chk('愿景文档给出「助记（非字源）」标注要求', src.indexOf('助记（非字源）') > -1);
chk('愿景文档明确禁止「由人形演化」的说法', /禁止把.*正坐着的人/.test(src));

console.log('\n  通过: ' + PASS + ' | 失败: ' + FAIL);
if (FAIL) {
  console.log('');
  fails.forEach(f => console.log('   - ' + f));
  console.log('\n✗ 存在伪字源表述 —— 改掉再发。');
} else {
  console.log('  ✓ 助记与字源已分开：可助记，但不教伪字源。');
}
console.log('==========================================');
process.exit(FAIL ? 1 : 0);
