#!/usr/bin/env node
/**
 * scripts/play-visible.js — 可看的真跑：每课存截图 + 生成索引页
 *
 * 为什么要有它：只报「通过 10/10」无法证明过程，也看不出结算页对不对。
 * 每课两张图（进入后 / 结算页），配一个索引页，谁都能自己翻。
 *
 * 用法：node scripts/play-visible.js 1 1 3     # L1 的 1..3 课
 *       node scripts/play-visible.js 1 15      # 指定 level 范围，全部 10 课
 *       node scripts/play-visible.js           # 1..15 全量
 * 每课独立超时 45s，超时记 FAIL 继续下一课（整批不会挂死）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const PW = 'C:/Users/zhuga/AppData/Roaming/npm/node_modules/playwright';
const { chromium } = require(PW);

const OUT = path.join(__dirname, '..', 'docs', 'play-150');
const SHOT = path.join(OUT, 'shots');

function arg(n, d) {
  const rest = process.argv.slice(2).filter(function (x) { return x.indexOf('--') !== 0; });
  const v = rest[n - 2];
  return v ? parseInt(v, 10) : d;
}

(async function () {
  const lvFrom = arg(2, 1), lvTo = arg(3, 15);
  fs.mkdirSync(SHOT, { recursive: true });

  // --show：打开可见浏览器窗口，人能亲眼看着它一关一关打（默认无头，快）
  //   node scripts/play-visible.js --show 1 3
  const SHOW = process.argv.indexOf('--show') > -1;
  const browser = await chromium.launch({
    headless: !SHOW,
    slowMo: SHOW ? 120 : 0          // 可见模式下每步放慢，肉眼跟得上
  });
  if (SHOW) console.log('  可见模式：浏览器窗口已打开，正在逐关打…');
  const rows = [];

  for (let lv = lvFrom; lv <= lvTo; lv++) {
    for (let st = 1; st <= 10; st++) {
      const tag = 'L' + lv + '-' + st;
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      let status = 'FAIL', note = '', shotOk = false;
      const t0 = Date.now();
      try {
        await page.goto('file:///I:/藏趣游戏/preview/play.html?auto=' + lv + '-' + st, { timeout: 15000 });
        let log = '';
        for (let i = 0; i < 45; i++) {
          await page.waitForTimeout(1000);
          log = await page.evaluate(function () {
            var el = document.getElementById('auto-log');
            return el ? String(el.textContent || '') : '';
          });
          if (/DONE/.test(log)) { status = 'PASS'; break; }
          if (/ABORT/.test(log)) { status = 'TIMEOUT'; break; }
          if (Date.now() - t0 > 45000) { status = 'TIMEOUT'; break; }
        }
        note = log.split(String.fromCharCode(10)).filter(Boolean).slice(-1)[0] || '(无日志)';
        // 藏掉自检日志层再截图，拍结算页真实样子
        await page.evaluate(function () {
          var el = document.getElementById('auto-log');
          if (el) el.style.display = 'none';
        });
        const file = path.join(SHOT, tag + '.png');
        await page.screenshot({ path: file, fullPage: true });
        shotOk = fs.existsSync(file);
      } catch (e) {
        status = 'ERROR';
        note = String(e && e.message || e).slice(0, 90);
      }
      await ctx.close();
      rows.push({ tag: tag, status: status, note: note, shot: shotOk, ms: Date.now() - t0 });
      process.stdout.write(status === 'PASS' ? '.' : (status === 'TIMEOUT' ? 'T' : 'X'));
    }
    process.stdout.write(' [L' + lv + ']' + String.fromCharCode(10));
  }
  await browser.close();

  // 索引页：一屏看完，点开看大图
  const pass = rows.filter(function (r) { return r.status === 'PASS'; }).length;
  const html = [
    '<!doctype html><html lang="zh"><meta charset="utf-8">',
    '<title>150 课真跑证据</title>',
    '<style>',
    'body{background:#141018;color:#e8e0d0;font:14px/1.6 -apple-system,sans-serif;padding:24px}',
    'h1{font-size:20px;margin:0 0 6px}',
    '.sum{color:#C9BFA8;margin-bottom:18px}',
    '.b{display:inline-block;padding:1px 8px;border-radius:10px;font-size:12px;margin-left:6px}',
    '.p{background:#1e4d2b;color:#8fe0a8}.f{background:#5a1f22;color:#ffa6ab}',
    '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}',
    '.c{background:#1d1826;border:1px solid #2e2740;border-radius:10px;overflow:hidden}',
    '.c img{width:100%;display:block}',
    '.c .t{padding:6px 8px;font-size:12px;color:#C9BFA8}',
    '</style><body>',
    '<h1>150 课真跑证据</h1>',
    '<div class="sum">共 ' + rows.length + ' 课，通过 ' + pass + '，失败 ' + (rows.length - pass) +
      '<span class="b ' + (pass === rows.length ? 'p' : 'f') + '">' +
      (pass === rows.length ? '全过' : '有失败') + '</span></div>',
    '<div class="grid">'
  ].concat(rows.map(function (r) {
    return '<div class="c"><a href="shots/' + r.tag + '.png" target="_blank">' +
      '<img loading="lazy" src="shots/' + r.tag + '.png" alt="' + r.tag + '"></a>' +
      '<div class="t">' + r.tag + ' ' +
      '<span class="b ' + (r.status === 'PASS' ? 'p' : 'f') + '">' + r.status + '</span>' +
      '<br>' + (r.note || '').replace(/</g, '&lt;').slice(0, 40) + '</div></div>';
  })).concat(['</div></body></html>']).join(String.fromCharCode(10));

  fs.writeFileSync(path.join(OUT, 'index.html'), html, 'utf8');
  fs.writeFileSync(path.join(OUT, 'report.txt'),
    rows.map(function (r) { return r.tag + ' ' + r.status + ' ' + r.note; }).join(String.fromCharCode(10)), 'utf8');

  console.log('');
  console.log('  ' + pass + '/' + rows.length + ' 通过（含截图）');
  console.log('  索引页：docs/play-150/index.html');
  process.exit(0);
})().catch(function (e) { console.error('失败：' + (e && e.message || e)); process.exit(1); });
