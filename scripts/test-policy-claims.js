#!/usr/bin/env node
/**
 * scripts/test-policy-claims.js — Q12：政策「原文」与「推论」不得混写
 *
 * 规则：
 *   ① `docs/policy-quotes-vs-inference.md` 必须同时具备三段结构：
 *      「原文要点」「推论，不是原文」「待法务核对原文」。
 *   ② 玩家可见内容（data/ 与 pages/）不得出现「几何化即合规」「一律违法」这类
 *      把推论当结论的表述（这些词只允许出现在"告诫"语境里）。
 *   ③ `docs/gameplay-match3-redesign.md` 的告诫句必须保留 —— 防"只改一半"。
 *
 * 用法：node scripts/test-policy-claims.js
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

console.log('\n==========================================');
console.log('  Q12 政策原文 vs 推论');
console.log('==========================================\n');

const docPath = path.join(ROOT, 'docs', 'policy-quotes-vs-inference.md');
const doc = fs.existsSync(docPath) ? fs.readFileSync(docPath, 'utf8') : '';
chk('分离文档存在', !!doc);
chk('文档写明依据文件「国宗发〔2017〕88 号」', doc.indexOf('国宗发〔2017〕88 号') > -1);
chk('文档有「原文要点」段', doc.indexOf('原文要点') > -1);
chk('文档有「推论，不是原文」段', doc.indexOf('推论，不是原文') > -1);
chk('文档把未核对项标为「待法务核对原文」', doc.indexOf('待法务核对原文') > -1);

const files = [];
walk(path.join(ROOT, 'data'), files);
walk(path.join(ROOT, 'pages'), files);
const FORBID = ['几何化即合规', '一律违法'];
const hits = [];
files.forEach(function (f) {
  const src = fs.readFileSync(f, 'utf8');
  FORBID.forEach(function (w) { if (src.indexOf(w) > -1) hits.push(path.relative(ROOT, f) + '：' + w); });
});
chk('玩家可见内容无「几何化即合规 / 一律违法」的结论化表述', hits.length === 0, hits.slice(0, 3).join('；'));

const g = path.join(ROOT, 'docs', 'gameplay-match3-redesign.md');
const gsrc = fs.existsSync(g) ? fs.readFileSync(g, 'utf8') : '';
chk('重设计文档保留「不能把…当原文结论」的告诫', /不能把.*当88号文原文结论/.test(gsrc));

console.log('\n  通过: ' + PASS + ' | 失败: ' + FAIL);
if (FAIL) {
  console.log('');
  fails.forEach(f => console.log('   - ' + f));
  console.log('\n✗ 原文与推论混写 —— 不要把推论当政策结论。');
} else {
  console.log('  ✓ 原文与推论已分离：推论标注清楚，未核对项不冒充原文。');
}
console.log('==========================================');
process.exit(FAIL ? 1 : 0);
