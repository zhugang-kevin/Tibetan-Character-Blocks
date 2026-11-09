#!/usr/bin/env node
/**
 * scripts/play-150.js — 用 Playwright 真跑 150 课（?auto=lv-stage 页面内自检）
 * 每课：打开 → 等 DONE/STUCK → 记录。单课上限 40 秒。
 * 结果写 docs/screenshots/../play-150-report.txt，同时打到 stdout。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const PW = 'C:/Users/zhuga/AppData/Roaming/npm/node_modules/playwright';
const { chromium } = require(PW);

const REPORT = path.join(__dirname, '..', 'docs', 'play-150-report.txt');

(async function () {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const rows = [];
  const t0 = Date.now();

  for (let lv = 1; lv <= 15; lv++) {
    for (let st = 1; st <= 10; st++) {
      await page.goto('file:///I:/藏趣游戏/preview/play.html?auto=' + lv + '-' + st);
      let log = '';
      for (let i = 0; i < 40; i++) {
        await page.waitForTimeout(1000);
        log = await page.evaluate(() => (document.getElementById('auto-log') || {}).textContent || '');
        if (/DONE|STUCK|ABORT/.test(log)) break;
      }
      const last = log.split(String.fromCharCode(10)).filter(Boolean).slice(-1)[0] || 'NO-LOG';
      const ok = /DONE/.test(last);
      rows.push({ tag: 'L' + lv + '-' + st, ok, last });
      process.stdout.write((ok ? '.' : 'X'));
    }
    const done = rows.filter(r => r.ok).length;
    process.stdout.write(' [L' + lv + ' ' + done + '/' + rows.length + ']' + String.fromCharCode(10));
  }

  await browser.close();
  const bad = rows.filter(r => !r.ok);
  const lines = [
    '150 课真跑报告 ' + new Date().toISOString(),
    '通过 ' + (rows.length - bad.length) + ' / ' + rows.length +
      '，用时 ' + ((Date.now() - t0) / 60000).toFixed(1) + ' 分钟',
    ''
  ].concat(bad.map(r => '✗ ' + r.tag + '  ' + r.last));
  fs.writeFileSync(REPORT, lines.join(String.fromCharCode(10)), 'utf8');
  console.log('');
  console.log('  ' + (rows.length - bad.length) + '/' + rows.length + ' 课完成');
  if (bad.length) console.log('  失败：' + bad.map(r => r.tag).slice(0, 20).join(', '));
  console.log('  报告：' + REPORT);
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error('失败：' + (e && e.message || e)); process.exit(1); });
