#!/usr/bin/env node
/**
 * scripts/play-all-levels.js — 用 Playwright 逐关自检（1..10）
 * 每关：打开 ?auto=N → 等 DONE/STUCK → 记录 HUD 与日志。
 */
'use strict';
const PW = 'C:/Users/zhuga/AppData/Roaming/npm/node_modules/playwright';
const { chromium } = require(PW);

(async function () {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e && e.message || e)));
  const rows = [];

  for (let lv = 1; lv <= 10; lv++) {
    errors.length = 0;
    await page.goto('file:///I:/藏趣游戏/preview/play.html?auto=' + lv);
    let log = '';
    for (let i = 0; i < 70; i++) {
      await page.waitForTimeout(1000);
      log = await page.evaluate(() => (document.getElementById('auto-log') || {}).textContent || '');
      if (/DONE|STUCK|ABORT/.test(log)) break;
    }
    const hud = await page.evaluate(() => {
      const el = document.querySelector('.status-pairs');
      return el ? String(el.textContent || '').trim() : '';
    });
    const last = log.split(String.fromCharCode(10)).filter(Boolean).slice(-1)[0] || '';
    rows.push({ lv, hud, last, err: errors[0] || '' });
    console.log('  L' + lv + ' | ' + hud + ' | ' + last + (errors[0] ? ' | 异常:' + errors[0] : ''));
  }

  await browser.close();
  const bad = rows.filter(r => !/DONE/.test(r.last));
  console.log('');
  console.log('  ' + (rows.length - bad.length) + '/' + rows.length + ' 关完成');
  if (bad.length) {
    console.log('  未完成：' + bad.map(r => 'L' + r.lv + '(' + r.last.slice(0, 40) + ')').join(', '));
    process.exit(1);
  }
})().catch(e => { console.error('失败：' + (e && e.message || e)); process.exit(1); });
