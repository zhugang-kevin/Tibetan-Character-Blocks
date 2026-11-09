#!/usr/bin/env node
/**
 * scripts/q1-report.js — Q1 识认率报告（读取 docs/q1-sample-sheet.csv）
 *
 * 口径与 utils/recognition.js 一致：30 题、≥80% 达标、n≥30 才报达标率。
 * 不做任何"填补"：缺字段的行不计入对应样本；n 不足会明确写"只报描述统计"。
 *
 * 用法：
 *   node scripts/q1-report.js docs/q1-sample-sheet.csv
 *   node scripts/q1-report.js docs/q1-sample-sheet.csv --json
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ITEMS = 30;
const PASS_RATE = 0.8;
const MIN_SAMPLE = 30;

function parseCsv(text) {
  const lines = String(text || '').split(/\r?\n/).filter(l => l.trim() !== '');
  if (!lines.length) return [];
  const head = splitLine(lines[0]);
  return lines.slice(1).map(line => {
    const cols = splitLine(line);
    const row = {};
    head.forEach((h, i) => { row[h.trim()] = (cols[i] == null ? '' : cols[i]).trim(); });
    return row;
  });
}

function splitLine(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { q = false; }
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function num(v) {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

function wilson(p, n, z) {
  if (!n) return [0, 0];
  const zz = (z == null ? 1.96 : z);
  const d = 1 + zz * zz / n;
  const c = p + zz * zz / (2 * n);
  const m = zz * Math.sqrt(p * (1 - p) / n + zz * zz / (4 * n * n));
  return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)];
}

function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function pct(x) { return (x * 100).toFixed(1) + '%'; }
function pp(x) { return (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + ' 个百分点'; }

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('用法：node scripts/q1-report.js docs/q1-sample-sheet.csv [--json]');
    process.exit(2);
  }
  if (!fs.existsSync(file)) {
    console.error('✗ 找不到文件：' + file);
    process.exit(2);
  }
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  const single = [];
  const paired = [];

  rows.forEach(r => {
    const preC = num(r.pre_correct), preI = num(r.pre_items);
    const postC = num(r.post_correct), postI = num(r.post_items);
    const hasPre = preC != null && preI != null && preI > 0;
    const hasPost = postC != null && postI != null && postI > 0;
    if (hasPost) {
      single.push({
        code: r.code, group: r.group || 'unknown',
        correct: postC, items: postI, rate: postC / postI,
        pass: postI >= ITEMS && postC / postI >= PASS_RATE
      });
    }
    if (hasPre && hasPost) {
      paired.push({
        code: r.code, group: r.group || 'unknown',
        pre: preC / preI, post: postC / postI, gain: postC / postI - preC / preI,
        lessons: num(r.lessons_done)
      });
    }
  });

  const passN = single.filter(s => s.pass).length;
  const passRate = single.length ? passN / single.length : 0;
  const ci = wilson(passRate, single.length);
  const pairedGain = mean(paired.map(p => p.gain));

  const byGroup = {};
  paired.forEach(p => {
    if (!byGroup[p.group]) byGroup[p.group] = [];
    byGroup[p.group].push(p);
  });

  const out = {
    file: path.basename(file),
    nSingle: single.length,
    nPaired: paired.length,
    single: {
      meanRate: mean(single.map(s => s.rate)),
      passRate,
      passCI: ci,
      passN
    },
    paired: {
      meanPre: mean(paired.map(p => p.pre)),
      meanPost: mean(paired.map(p => p.post)),
      gain: pairedGain
    },
    groups: Object.keys(byGroup).map(g => ({
      group: g, n: byGroup[g].length,
      pre: mean(byGroup[g].map(p => p.pre)),
      post: mean(byGroup[g].map(p => p.post)),
      gain: mean(byGroup[g].map(p => p.gain))
    })),
    enoughSample: single.length >= MIN_SAMPLE,
    enoughPaired: paired.length >= 20
  };

  if (process.argv.indexOf('--json') > -1) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  console.log('\n==========================================');
  console.log('  Q1 识认率报告（30 题 / ≥80% 达标 / n≥30）');
  console.log('==========================================');
  console.log('  文件          : ' + file);
  console.log('  单次样本 n    : ' + out.nSingle + (out.enoughSample ? '（够报）' : '（不足 30，只报描述统计）'));
  console.log('  配对样本 n    : ' + out.nPaired + (out.enoughPaired ? '（够做增益）' : '（<20，增益只作初步）'));
  console.log('  单次均值      : ' + pct(out.single.meanRate));
  console.log('  达标率        : ' + pct(out.single.passRate) +
    '（95% CI ' + pct(ci[0]) + ' – ' + pct(ci[1]) + '；达标 ' + passN + '/' + out.nSingle + '）');
  if (out.nPaired) {
    console.log('  前测均值      : ' + pct(out.paired.meanPre));
    console.log('  后测均值      : ' + pct(out.paired.meanPost));
    console.log('  平均增益      : ' + pp(out.paired.gain));
  }
  out.groups.forEach(g => {
    console.log('  · ' + g.group + ' n=' + g.n + '：前 ' + pct(g.pre) + ' → 后 ' + pct(g.post) + '（' + pp(g.gain) + '）');
  });

  if (!out.enoughSample) {
    console.log('\n  ⚠ n < 30：**不能**对外报"达标率"；只能写"初步观察"。');
  }
  if (out.nPaired && out.nPaired < 20) {
    console.log('  ⚠ 配对 n < 20：增益只能写"初步"，不能写"显著"。');
  }
  if (out.nPaired && ci[0] === 0 && ci[1] === 0) {
    console.log('  ⚠ 达标率置信区间不可算（样本为 0）。');
  }
  console.log('==========================================\n');
}

main();
