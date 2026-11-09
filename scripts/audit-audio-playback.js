#!/usr/bin/env node
/**
 * scripts/audit-audio-playback.js — 音频“能播”审计（不是听感）
 *
 * 能证明：文件能解码、play() 成功、currentTime 真的推进（不是静音/坏文件）。
 * 不能证明：真机扬声器、BGM duck、蓝牙、静音键 —— 那些必须人耳。
 *
 * 做法：起一个本地静态服务器（避免 file:// 音频 CORS），用 Chromium 逐个 play。
 * 需要 Playwright（仅本机审计用，不进 CI）。
 *
 * 用法：node scripts/audit-audio-playback.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..');
const PORT = 8123;

function collect() {
  const out = [];
  const addDir = (rel, filter) => {
    const dir = path.join(ROOT, rel);
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(function (f) {
      if (filter && !filter.test(f)) return;
      out.push(path.join(rel, f).replace(/\\/g, '/'));
    });
  };
  addDir('audio/voice', /\.(mp3|wav)$/i);
  addDir('audio', /\.(mp3|wav)$/i);
  addDir('package-praise/audio/voice', /\.(mp3|wav)$/i);
  return out;
}

function mime(f) {
  return /\.wav$/i.test(f) ? 'audio/wav' : 'audio/mpeg';
}

function serve() {
  return new Promise(function (resolve) {
    const srv = http.createServer(function (req, res) {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
      const fp = path.join(ROOT, rel);
      if (fp.indexOf(ROOT) !== 0 || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'Content-Type': mime(fp), 'Cache-Control': 'no-store' });
      fs.createReadStream(fp).pipe(res);
    });
    srv.listen(PORT, '127.0.0.1', function () { resolve(srv); });
  });
}

(async function () {
  const files = collect();
  if (!files.length) { console.error('没有找到音频文件'); process.exit(2); }

  const srv = await serve();
  const browser = await chromium.launch({
    executablePath: 'C:/Users/zhuga/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe',
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio']
  });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:' + PORT + '/preview/q1.html', { waitUntil: 'domcontentloaded' });

  const results = [];
  for (const rel of files) {
    const r = await page.evaluate(function (url) {
      return new Promise(function (resolve) {
        const a = document.createElement('audio');
        a.preload = 'auto';
        a.src = url;
        let done = false;
        const finish = function (ok, note) {
          if (done) return; done = true;
          const out = {
            ok: ok, note: note || '',
            duration: isFinite(a.duration) ? Math.round(a.duration * 1000) : null,
            currentTime: Math.round(a.currentTime * 1000),
            paused: a.paused, error: a.error ? (a.error.code + ':' + a.error.message) : null
          };
          try { a.pause(); } catch (e) {}
          resolve(out);
        };
        a.addEventListener('error', function () { finish(false, 'error'); });
        const p = a.play();
        if (p && p.catch) p.catch(function (e) { finish(false, String(e && e.message || e)); });
        // 1200ms：实测 blessing_01 / greet_03 解码启动会超过 420ms（不是坏文件，
        //   2.2s 时已播到 duration）。给足启动时间，避免假红。
        setTimeout(function () {
          finish(a.currentTime > 0.03 || a.ended, a.currentTime > 0.03 || a.ended ? 'playing' : 'no-clock');
        }, 1200);
      });
    }, 'http://127.0.0.1:' + PORT + '/' + rel.split('/').map(encodeURIComponent).join('/'));
    results.push({ file: rel, ...r });
    if (!r.ok) console.log('  ✗ ' + rel + '  ' + JSON.stringify(r));
  }

  const ok = results.filter(function (x) { return x.ok; }).length;
  const fail = results.length - ok;
  console.log('\n音频播放审计（Chromium）');
  console.log('  文件数 : ' + results.length);
  console.log('  能播   : ' + ok);
  console.log('  不能播 : ' + fail);
  console.log('  说明   : 只证明解码 + play 时钟推进；真机听感仍需人耳。');
  if (fail) {
    console.log('  失败项：');
    results.filter(function (x) { return !x.ok; }).forEach(function (x) {
      console.log('   - ' + x.file + '  ' + (x.error || x.note));
    });
  }
  await browser.close();
  srv.close();
  process.exit(fail ? 1 : 0);
})().catch(function (e) {
  console.error('✗ 审计异常：', e && e.stack || e);
  process.exit(1);
});
