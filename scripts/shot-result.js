#!/usr/bin/env node
/**
 * scripts/shot-result.js — 用 Playwright 直连（进程内，无 daemon）跑完一局并截全页
 *
 * 为什么不用 agent-browser：它的 daemon 今天挂了两次（click 卡死 / open 卡死），
 * 且批量点击每次都有秒级往返开销。Playwright 在同一个进程里控制浏览器，稳定且快。
 */
'use strict';
const path = require('path');
const PW = 'C:/Users/zhuga/AppData/Roaming/npm/node_modules/playwright';
const { chromium } = require(PW);

(async function () {
  const out = path.join(__dirname, '..', 'docs', 'screenshots', '_shot_result_full3.png');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e && e.message || e)));

  await page.goto('file:///I:/藏趣游戏/preview/play.html?auto=1');
  // 等自检日志出现 DONE（最多 60 秒）
  let log = '';
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(1000);
    log = await page.evaluate(() => (document.getElementById('auto-log') || {}).textContent || '');
    if (/DONE|STUCK|ABORT/.test(log)) break;
  }
  // ⚠️ STUCK 之后结算页还要几秒才弹（上一张截到的是游戏页），这里多等 4 秒。
  await page.waitForTimeout(4000);
  // 隐藏自检日志层，别让它挡住结算页
  await page.evaluate(function () {
    var el = document.getElementById('auto-log');
    if (el) el.style.display = 'none';
  });
  await page.screenshot({ path: out, fullPage: true });
  console.log('  自检日志尾部：' + log.split(String.fromCharCode(10)).slice(-3).join(' | '));
  if (errors.length) console.log('  页面异常：' + errors.slice(0, 2).join(' | '));
  console.log('  截图：' + out);
  await browser.close();
})().catch(e => { console.error('失败：' + (e && e.message || e)); process.exit(1); });
