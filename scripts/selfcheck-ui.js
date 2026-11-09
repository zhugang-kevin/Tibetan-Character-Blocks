/**
 * UI 自检（2026-11-05）
 *
 * 目的：**不用等人扫码，先把浏览器能暴露的问题全部暴露出来。**
 * 覆盖：首页 / 学习面板 / 老线对局 / 结算揭晓 / 护照图鉴 / 权益 / 礼物 / 证书 / 学习课
 * 检查：console 报错、破图、横向溢出、违禁词、揭图是否正确（图 + 名 + 署名 + N/50）
 *
 * 跑法：
 *   export NODE_PATH=C:/Users/zhuga/.workbuddy/binaries/node/workspace/node_modules
 *   node scripts/selfcheck-ui.js
 * 产物：.workbuddy/tmp/selfcheck/*.png
 *
 * ⚠️ 边界：这是浏览器镜像（preview/play.html），**不是真机**。
 *    分包 <image> 跨包路径、真机手感、震动/音效 仍然只能真机验。
 */
var path = require('path');
var fs = require('fs');
var pw = require('playwright-core');

var ROOT = path.join(__dirname, '..');
var OUT = path.join(ROOT, '.workbuddy', 'tmp', 'selfcheck');
fs.mkdirSync(OUT, { recursive: true });

var BANNED = ['游戏', '消除', '闯关', '挑战', '掉落', '竞技', '排行', 'PK'];
var results = [];
function rec(name, ok, detail) {
  results.push({ name: name, ok: !!ok, detail: detail || '' });
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (detail ? '  —— ' + detail : ''));
}

(async function () {
  var browser = await pw.chromium.launch({ channel: 'chrome', headless: true });
  var ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  var page = await ctx.newPage();

  var consoleErrors = [], pageErrors = [], failedReq = [];
  page.on('console', function (m) { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)); });
  page.on('pageerror', function (e) { pageErrors.push(String(e.message).slice(0, 160)); });
  page.on('requestfailed', function (r) { failedReq.push(r.url().slice(0, 60) + ' ' + (r.failure() && r.failure().errorText)); });

  var url = 'file:///' + path.join(ROOT, 'preview', 'play.html').replace(/\\/g, '/') + '?debug=1';
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(900);

  async function shot(name) {
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(OUT, name + '.png') });
  }

  // 通用体检：横向溢出 / 破图 / 违禁词
  async function inspect(label) {
    var m = await page.evaluate(function (BANNED) {
      var de = document.documentElement;
      var overflow = Math.max(0, de.scrollWidth - de.clientWidth);
      var broken = [];
      Array.prototype.forEach.call(document.images, function (img) {
        if (!img.getAttribute('src')) return;
        var st = getComputedStyle(img);
        if (st.display === 'none' || st.visibility === 'hidden') return;
        if (img.naturalWidth === 0) broken.push((img.id || img.className) + '|' + String(img.src).slice(0, 40));
      });
      // 🔴 只拼「可见元素里的文本节点」。
      //    第一版用 document.body.innerText，把内联 <script> 的源码也算进去了 ——
      //    注释里有「完成挑战」四个字，于是每一屏都误报违禁词。实测踩过，别再犯。
      var txt = [];
      var skip = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1 };
      Array.prototype.forEach.call(document.querySelectorAll('body *'), function (el) {
        if (skip[el.tagName]) return;
        var st = getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden') return;
        for (var i = 0; i < el.childNodes.length; i++) {
          var n = el.childNodes[i];
          if (n.nodeType === 3) txt.push(n.nodeValue);
        }
      });
      var joined = txt.join(' ');
      var hits = BANNED.filter(function (w) { return joined.indexOf(w) > -1; });
      // 2026-11-05：实测在证书页抓到「Lundefined · 得到「」证书」——
      // 调用方漏传参数，undefined 直接印在玩家脸上。这类错必须由自检兜住。
      var LEAK = ['undefined', 'NaN', '[object Object]'];
      var leaks = LEAK.filter(function (w) { return joined.indexOf(w) > -1; });
      return { overflow: overflow, broken: broken, banned: hits, leaks: leaks };
    }, BANNED);
    rec('[' + label + '] 无横向溢出', m.overflow <= 1, 'overflow=' + m.overflow + 'px');
    rec('[' + label + '] 无破图', m.broken.length === 0, m.broken.slice(0, 3).join(' | '));
    rec('[' + label + '] 无违禁词（可见文本）', m.banned.length === 0, m.banned.join('/'));
    rec('[' + label + '] 无 undefined/NaN 泄漏', m.leaks.length === 0, m.leaks.join('/'));
    return m;
  }

  // ---------- 1. 首页 ----------
  console.log('== 首页 ==');
  await shot('01-home');
  await inspect('首页');

  // ---------- 2. 学习面板 ----------
  console.log('== 学习面板 ==');
  var panelOk = await page.evaluate(function () {
    try {
      openPanel('learn');
      return document.getElementById('entry-body').innerText.length > 20;
    } catch (e) { return 'ERR:' + e.message; }
  });
  rec('学习面板能打开且有内容', panelOk === true, String(panelOk));
  await shot('02-learn-panel');
  await inspect('学习面板');
  await page.evaluate(function () { try { closePanel(); } catch (e) {} });

  // ---------- 3. 老线对局（第 1 关） ----------
  console.log('== 老线对局 ==');
  await page.evaluate(function () { startLevel(1); });
  await page.waitForTimeout(700);
  await shot('03-game');
  var gm = await page.evaluate(function () {
    var d = window.__dbg;
    return {
      pct: d.state.revealPct,
      revealImg: d.state.reveal ? String(d.state.reveal.img).slice(0, 22) : '(无)',
      revealName: d.state.reveal ? d.state.reveal.name : '(无)',
      imgDisplayed: (function () {
        var i = document.getElementById('reveal-img');
        return i ? getComputedStyle(i).display : 'missing';
      })(),
      tiles: document.querySelectorAll('.tile').length,
      capText: (document.getElementById('reveal-cap') || {}).textContent || ''
    };
  });
  rec('老线开局挂上揭图（data URL）', /^data:image\/webp/.test(gm.revealImg), gm.revealImg);
  rec('揭图层可见（display:block）', gm.imgDisplayed === 'block', gm.imgDisplayed);
  rec('开局揭图进度 0% 且不剧透名字', gm.pct === 0 && gm.capText.indexOf(gm.revealName) === -1, 'pct=' + gm.pct + ' cap=' + gm.capText);
  rec('盘面有牌', gm.tiles > 0, 'tiles=' + gm.tiles);
  await inspect('对局');

  // ---------- 4. 结算揭晓 ----------
  console.log('== 结算揭晓 ==');
  await page.evaluate(function () {
    // ⚠️ 不要先设 state.finished —— finishLevel 第一行就是 `if (state.finished) return`，
    //    第一版这么写过，结果它直接 return，结算页什么都没渲染，白报了 6 条「红」。
    finishLevel();
  });
  await page.waitForTimeout(3400);   // NAV_HOLD_MS=2600 + 语音余量
  await shot('04-result');
  var rs = await page.evaluate(function () {
    var q = function (s) { return document.querySelector(s); };
    var card = q('#res-reveal .reveal-card');
    var art = q('#res-reveal .reveal-art');
    var credit = q('#res-reveal .reveal-credit');
    var note = q('#res-reveal .reveal-note');
    return {
      hasCard: !!card,
      name: (q('#res-reveal .reveal-name') || {}).textContent || '',
      artSrc: art ? String(art.getAttribute('src')).slice(0, 22) : '(无图)',
      credit: credit ? credit.textContent : '(无署名)',
      note: note ? note.textContent : '(无进度)',
      tib: (q('#res-reveal .rt-t') || {}).textContent || '',
      romanRow: !!q('#res-reveal .rt-roman')
    };
  });
  rec('结算页出现揭晓卡', rs.hasCard, rs.name);
  rec('揭晓图是内联 data URL（不是坏路径）', /^data:image\/webp/.test(rs.artSrc), rs.artSrc);
  rec('揭晓卡显示 CC 署名', /CC|Public/i.test(rs.credit), rs.credit.slice(0, 50));
  rec('图鉴进度显示 1 / 50', rs.note.indexOf('1 / 50') > -1, rs.note);
  rec('藏文名上屏', rs.tib.length > 0, rs.tib);
  rec('无转写时不渲染空行', rs.romanRow === false, 'romanRow=' + rs.romanRow);
  await inspect('结算');

  // ---------- 5. 护照图鉴 ----------
  console.log('== 护照 ==');
  await page.evaluate(function () { showPassport(); });
  await page.waitForTimeout(700);
  await shot('05-passport');
  var pp = await page.evaluate(function () {
    var q = function (s) { return document.querySelectorAll(s); };
    return {
      slots: q('#pp-reveal-grid .rv-slot').length,
      got: q('#pp-reveal-grid .rv-slot.got').length,
      count: (document.getElementById('pp-reveal-count') || {}).textContent || '',
      firstName: (document.querySelector('#pp-reveal-grid .rv-slot.got .rv-name') || {}).textContent || '',
      attr: (document.querySelector('.section-sub') || {}).textContent || ''
    };
  });
  rec('图鉴 50 格', pp.slots === 50, 'slots=' + pp.slots);
  rec('通关 1 关 → 解锁 1 格', pp.got === 1, 'got=' + pp.got + ' count=' + pp.count);
  rec('解锁格显示寺院名', pp.firstName.length > 0, pp.firstName);
  await inspect('护照');

  // ---------- 6. 权益 / 礼物 / 证书 ----------
  console.log('== 权益 / 礼物 / 证书 ==');
  await page.evaluate(function () { showBenefits(); });
  await shot('06-benefits');
  await inspect('权益');
  await page.evaluate(function () { showGift(); });
  await shot('07-gift');
  await inspect('礼物');
  await page.evaluate(function () { showLearnCert(); });
  await page.waitForTimeout(600);
  await shot('08-cert');
  await inspect('证书');

  // ---------- 7. 学习课（不该显示揭图） ----------
  console.log('== 学习课 ==');
  await page.evaluate(function () { startLearn(1, 1); });
  await page.waitForTimeout(800);
  await shot('09-learn-game');
  var lg = await page.evaluate(function () {
    var d = window.__dbg;
    return {
      reveal: d.state.reveal ? String(d.state.reveal.img || '') : '(null)',
      learnTitle: (document.querySelector('.hud-title') || {}).textContent || document.title,
      tiles: document.querySelectorAll('.tile').length
    };
  });
  rec('学习课不显示寺庙揭图（授权 + 一致性）', lg.reveal === '(null)' || lg.reveal === '', 'reveal=' + lg.reveal);
  rec('学习课有牌', lg.tiles > 0, 'tiles=' + lg.tiles);
  await inspect('学习课');

  // ---------- 8. 窄屏 320 ----------
  console.log('== 窄屏 320 ==');
  await page.setViewportSize({ width: 320, height: 640 });
  await page.evaluate(function () { showScreen('home'); });
  await page.waitForTimeout(600);
  await shot('10-narrow-home');
  var narrow = await inspect('窄屏首页');
  await page.evaluate(function () { startLevel(2); });
  await page.waitForTimeout(700);
  await shot('11-narrow-game');
  await inspect('窄屏对局');

  // ---------- 8.5 多机型：左右边必须齐平，不能有元素出界 ----------
  console.log('== 多机型左右边 ==');
  var DEVICES = [{ w: 320, h: 640 }, { w: 360, h: 740 }, { w: 390, h: 844 }, { w: 430, h: 932 }];
  for (var di = 0; di < DEVICES.length; di++) {
    var d = DEVICES[di];
    var tag = d.w + '×' + d.h;
    await page.setViewportSize({ width: d.w, height: d.h });
    await page.evaluate(function () { showScreen('home'); });
    await page.waitForTimeout(420);
    var home = await page.evaluate(function () {
      var vw = innerWidth, bad = [];
      var skip = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1 };
      document.querySelectorAll('#screen-home *').forEach(function (el) {
        if (skip[el.tagName]) return;
        var st = getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return;
        var r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return;
        if (r.left < -1.5 || r.right > vw + 1.5) {
          bad.push((el.id || el.className || el.tagName) + ' [' + Math.round(r.left) + ',' + Math.round(r.right) + ']');
        }
      });
      return { overflow: Math.max(0, document.documentElement.scrollWidth - vw), bad: bad.slice(0, 3) };
    });
    rec('[' + tag + '] 首页无元素左右出界', home.overflow <= 1 && home.bad.length === 0, 'overflow=' + home.overflow + ' ' + home.bad.join(' | '));

    await page.evaluate(function () { startLevel(10); });
    await page.waitForTimeout(760);
    await page.evaluate(function () { var gm = document.getElementById('guide-mask'); if (gm) gm.classList.remove('show'); });
    var g = await page.evaluate(function () {
      var bd = document.getElementById('board').getBoundingClientRect();
      var vw = innerWidth;
      return {
        overflow: Math.max(0, document.documentElement.scrollWidth - vw),
        left: Math.round(bd.left), right: Math.round(vw - bd.right),
        pct: Math.round(bd.width / vw * 100)
      };
    });
    rec('[' + tag + '] 对局盘面左右对称且不出界', g.overflow <= 1 && Math.abs(g.left - g.right) <= 4, JSON.stringify(g));
    rec('[' + tag + '] 对局盘面宽度 ≥78%', g.pct >= 78, g.pct + '%');
  }

  // ---------- 9. 汇总 ----------
  console.log('');
  console.log('== 控制台 ==');
  rec('无 console.error', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  rec('无未捕获异常', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  rec('无失败请求', failedReq.length === 0, failedReq.slice(0, 3).join(' | '));

  await browser.close();

  var bad = results.filter(function (r) { return !r.ok; });
  console.log('');
  console.log('--------------------------------------------------');
  console.log('  通过: ' + (results.length - bad.length) + ' | 失败: ' + bad.length);
  console.log('  截图: ' + OUT);
  console.log('--------------------------------------------------');
  if (bad.length) {
    bad.forEach(function (b) { console.log('  ✗ ' + b.name + '  —— ' + b.detail); });
    process.exit(1);
  }
})().catch(function (e) {
  console.error('自检脚本异常：' + e.message);
  process.exit(2);
});
