#!/usr/bin/env node
/**
 * scripts/gen-q1-data.js — 生成 preview/q1-data.js（Q1 网页版题库）
 *
 * 唯一事实源与小程序识认页一致：
 *   data/learning.js 的 CONSONANTS + data/cards.js 的 letter.subtitle（取 · 前的拉丁转写）。
 * 只生成题库，不生成题目顺序（顺序由页面 seed 决定，便于复现）。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const cards = require(path.join(ROOT, 'data', 'cards.js'));
const learning = require(path.join(ROOT, 'data', 'learning.js'));

const map = {};
(cards || []).forEach(function (c) {
  if (!c || c.type !== 'letter' || !c.tibetan) return;
  const m = String(c.subtitle || '').split('·')[0].trim();
  if (m) map[c.tibetan] = m;
});

const data = learning.CONSONANTS
  .filter(function (t) { return !!map[t]; })
  .map(function (t) { return { tibetan: t, roman: map[t] }; });

if (data.length !== 30) {
  console.error('✗ 题库不是 30 条（实际 ' + data.length + '）；先查 data/cards.js 是否缺字母');
  process.exit(1);
}
const uniq = new Set(data.map(function (d) { return d.roman; }));
if (uniq.size !== 30) {
  console.error('✗ 拉丁转写有重复（' + uniq.size + '/30）；会破坏四选一唯一性');
  process.exit(1);
}

const out = '// 由 scripts/gen-q1-data.js 生成，勿手改\n' +
  'window.Q1_DATA = ' + JSON.stringify(data, null, 2) + ';\n';
fs.writeFileSync(path.join(ROOT, 'preview', 'q1-data.js'), out, 'utf8');
console.log('✓ preview/q1-data.js：' + data.length + ' 条（转写唯一 ' + uniq.size + '/30）');
