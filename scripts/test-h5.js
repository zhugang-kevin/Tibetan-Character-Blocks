#!/usr/bin/env node
/**
 * scripts/test-h5.js — 浏览器体验版端到端自检
 *
 * 用 jsdom 真实执行 preview/play.html 的内联脚本，并模拟真人点击，
 * 逐项验证「配对消除 → 文化卡 → 结算 → 下一关」整条链路。
 *
 * 需要：jsdom（安装在与本脚本同级 script 的 node_modules 或 NODE_PATH 中）
 * 用法：node scripts/test-h5.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

let JSDOM;
try {
  JSDOM = require('jsdom').JSDOM;
} catch (e) {
  console.error('✗ 未找到 jsdom。请先安装：');
  console.error('  cd C:/Users/zhuga/.workbuddy/binaries/node/workspace && npm install jsdom');
  process.exit(2);
}

const ROOT = path.resolve(__dirname, '..');
const HTML = path.join(ROOT, 'preview', 'play.html');

if (!fs.existsSync(HTML)) {
  console.error('✗ 未找到 preview/play.html，请先运行 node scripts/build-h5.js');
  process.exit(1);
}

const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (extra ? ' → ' + extra : '')); console.error('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}
function section(t) { console.log('\n[' + t + ']'); }

/* 无头环境下的最小 canvas 2D 桩：只做逻辑验证，不校验像素 */
function mockCtx() {
  const noop = function () {};
  return {
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '', lineJoin: '',
    textAlign: '', textBaseline: '', globalAlpha: 1,
    beginPath: noop, moveTo: noop, lineTo: noop, arcTo: noop, arc: noop, closePath: noop,
    stroke: noop, fill: noop, fillRect: noop, strokeRect: noop, clearRect: noop,
    fillText: noop, strokeText: noop, save: noop, restore: noop, translate: noop,
    rotate: noop, scale: noop, quadraticCurveTo: noop, bezierCurveTo: noop,
    setLineDash: noop, drawImage: noop, putImageData: noop,
    measureText: function (s) { return { width: String(s).length * 10 }; },
    createLinearGradient: function () { return { addColorStop: noop }; },
    getImageData: function (x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; }
  };
}

(async function main() {
  const errors = [];

  const dom = new JSDOM(fs.readFileSync(HTML, 'utf8'), {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/play.html',
    beforeParse: function (window) {
      window.HTMLCanvasElement.prototype.getContext = function () { return mockCtx(); };
      window.HTMLCanvasElement.prototype.toDataURL = function () { return 'data:image/png;base64,STUB'; };
      window.confirm = function () { return true; };
      window.addEventListener('error', function (e) {
        errors.push(String((e && e.error && e.error.stack) || (e && e.message) || e));
      });
    }
  });

  const win = dom.window;
  const doc = win.document;
  const ev = function (code) { return win.eval(code); };
  const $ = function (sel) { return doc.querySelector(sel); };
  const $$ = function (sel) { return Array.prototype.slice.call(doc.querySelectorAll(sel)); };
  const activeScreen = function () {
    const s = $$('.screen').filter(function (n) { return n.classList.contains('active'); })[0];
    return s ? s.id : null;
  };

  await sleep(120);

  /* ---------- 1. 启动与首页 ---------- */
  section('1. 首页');
  check('无脚本运行时错误', errors.length === 0, errors[0]);
  check('默认停在首页', activeScreen() === 'screen-home', activeScreen());
  const btns = $$('#level-grid .level-btn');
  check('10 个关卡按钮', btns.length === 10, '实际 ' + btns.length);
  check('第 1 关可点击（非 locked）', !btns[0].classList.contains('locked'));
  check('第 2-10 关锁定', btns.slice(1).every(function (b) { return b.classList.contains('locked'); }));
  check('Logo 已加载（base64 内联）', ($('#hero-logo') || {}).src && $('#hero-logo').src.indexOf('data:image/png') === 0);
  check('slogan 显示「玩方块，认藏文」', doc.body.textContent.indexOf('玩方块，认藏文') > -1);

  /* ---------- 2. 进入第 1 关 ---------- */
  section('2. 进入第 1 关');
  btns[0].click();
  await sleep(80);
  check('切到游戏页', activeScreen() === 'screen-game', activeScreen());
  check('第 1 关 6×4 = 24 张牌', $$('#board .tile').length === 24, '实际 ' + $$('#board .tile').length);
  check('新手引导首次弹出', $('#guide-mask').classList.contains('show'));
  // 关掉 3 步引导
  for (let i = 0; i < 3; i++) { $('#guide-next').click(); await sleep(30); }
  check('引导完成后关闭', !$('#guide-mask').classList.contains('show'));
  check('引导完成状态已持久化', ev("isOnboardDone()") === true);

  /* ---------- 3. 配对成功 → 文化卡 ---------- */
  section('3. 配对成功与文化卡');
  const tiles = function () { return ev('state.tiles'); };
  const findPair = function () {
    const t = tiles();
    const map = {};
    for (let i = 0; i < t.length; i++) {
      if (t[i].state !== 'idle') continue;
      if (map[t[i].id] === undefined) map[t[i].id] = i;
      else return [map[t[i].id], i];
    }
    return null;
  };
  const findMismatch = function () {
    const t = tiles();
    let a = -1;
    for (let i = 0; i < t.length; i++) { if (t[i].state === 'idle') { a = i; break; } }
    for (let j = a + 1; j < t.length; j++) { if (t[j].state === 'idle' && t[j].id !== t[a].id) return [a, j]; }
    return null;
  };
  const clickTile = async function (i) {
    const el = doc.querySelector('#board .tile[data-index="' + i + '"]');
    el.click();
    await sleep(30);
  };

  const goldenId = ev('state.goldenId');
  check('已选定金色特殊方块', typeof goldenId === 'string' && goldenId.length > 0, String(goldenId));
  check('金色方块已渲染 ✦', $$('#board .tile.golden .star').length > 0);

  let pair = findPair();
  await clickTile(pair[0]);
  check('第一张牌进入 selected', tiles()[pair[0]].state === 'selected', tiles()[pair[0]].state);
  await clickTile(pair[1]);
  check('配对后进入 removing', tiles()[pair[0]].state === 'removing' && tiles()[pair[1]].state === 'removing');
  await sleep(360);
  check('文化卡弹窗已出现', $('#card-mask').classList.contains('show'));
  const cardText = $('#card-sheet').textContent;
  check('文化卡有标题/读音/说明', cardText.length > 30, '长度 ' + cardText.length);
  check('文化卡含「冷知识」', cardText.indexOf('冷知识') > -1);
  check('文化卡含「知道了」按钮', !!$('#card-ok'));
  check('弹窗期间锁定点击', ev('state.locked') === true);

  $('#card-ok').click();
  await sleep(60);
  check('「知道了」后弹窗关闭', !$('#card-mask').classList.contains('show'));
  check('两张牌状态 = removed', tiles()[pair[0]].state === 'removed' && tiles()[pair[1]].state === 'removed');
  check('已消除对数 = 1', ev('state.matchedCount') === 1);
  check('积分已累加（≥10）', ev('state.score') >= 10, 'score=' + ev('state.score'));
  check('解除锁定可继续点', ev('state.locked') === false);

  /* ---------- 4. 配对失败：无惩罚 ---------- */
  section('4. 配对失败不扣分');
  const scoreBefore = ev('state.score');
  const comboBefore = ev('state.combo');
  const mm = findMismatch();
  await clickTile(mm[0]);
  await clickTile(mm[1]);
  check('错误配对触发 shake', tiles()[mm[0]].state === 'shake' && tiles()[mm[1]].state === 'shake');
  await sleep(520);
  check('抖动后恢复 idle', tiles()[mm[0]].state === 'idle' && tiles()[mm[1]].state === 'idle');
  check('不扣分', ev('state.score') === scoreBefore, scoreBefore + ' → ' + ev('state.score'));
  check('连击清零', ev('state.combo') === 0, comboBefore + ' → ' + ev('state.combo'));

  /* ---------- 5. 连击 ---------- */
  section('5. 连击系统');
  for (let k = 0; k < 2; k++) {
    const pr = findPair();
    await clickTile(pr[0]);
    await clickTile(pr[1]);
    await sleep(330);
    $('#card-ok').click();
    await sleep(60);
  }
  check('连击累加（≥2）', ev('state.combo') >= 2, 'combo=' + ev('state.combo'));
  check('最高连击已记录', ev('getProgress().bestCombo') >= 2, 'bestCombo=' + ev('getProgress().bestCombo'));

  /* ---------- 6. 通关 → 结算页 ---------- */
  section('6. 通关与结算');
  let guard = 0;
  while (ev('state.matchedCount') < 12 && guard++ < 30) {
    const pr = findPair();
    if (!pr) break;
    await clickTile(pr[0]);
    await clickTile(pr[1]);
    await sleep(330);
    if ($('#card-mask').classList.contains('show')) { $('#card-ok').click(); await sleep(60); }
  }
  check('全部 12 对已消除', ev('state.matchedCount') === 12, 'matched=' + ev('state.matchedCount'));
  await sleep(1000);
  check('自动进入结算页', activeScreen() === 'screen-result', activeScreen());
  check('显示「第 1 关完成！」', ($('#res-title') || {}).textContent === '第 1 关完成！');
  check('显示积分/连击/文化卡统计', $('#res-score').textContent !== '0' || ev('state.score') === 0);
  check('授予「拉萨」印记横幅', ($('#res-stamp').textContent || '').indexOf('拉萨') > -1);
  check('文化卡列表去重后 2 张', ($('#res-chips').textContent || '').length > 0 && $$('#res-chips .chip').length === 2, 'chips=' + $$('#res-chips .chip').length);
  check('出现「下一关」按钮', $('#res-actions').textContent.indexOf('下一关') > -1, $('#res-actions').textContent);
  check('非第10关不显示祝福卡', $('#res-bless').textContent.trim() === '');

  /* ---------- 7. 进度持久化 ---------- */
  section('7. 进度持久化');
  const saved = JSON.parse(win.localStorage.getItem('zangzi_progress') || 'null');
  check('localStorage 已写入 progress', !!saved);
  check('completedLevels 含第 1 关', saved && saved.completedLevels.indexOf(1) > -1, JSON.stringify(saved && saved.completedLevels));
  check('unlockedLevel 提升到 2', saved && saved.unlockedLevel === 2, 'unlockedLevel=' + (saved && saved.unlockedLevel));
  check('stamps 含 lhasa', saved && saved.stamps.indexOf('lhasa') > -1);

  /* ---------- 8. 返回首页 ---------- */
  section('8. 返回首页');
  const backBtn = $$('#res-actions button').filter(function (b) { return b.textContent.indexOf('返回首页') > -1; })[0];
  check('存在「返回首页」按钮', !!backBtn);
  backBtn.click();
  await sleep(60);
  check('回到首页', activeScreen() === 'screen-home', activeScreen());
  const btns2 = $$('#level-grid .level-btn');
  check('第 1 关显示已通关', btns2[0].classList.contains('done'));
  check('第 2 关已解锁', !btns2[1].classList.contains('locked'));
  check('第 3 关仍锁定', btns2[2].classList.contains('locked'));
  check('首页显示印记', ($('#profile-stamps').textContent || '').indexOf('拉萨') > -1);

  /* ---------- 9. 第 10 关祝福卡 ---------- */
  section('9. 第 10 关祝福卡');
  ev('startLevel(10)');
  await sleep(80);
  check('第 10 关 6×8 = 48 张牌', $$('#board .tile').length === 48, '实际 ' + $$('#board .tile').length);
  ev('state.matchedCount = 12; state.collected = ["letter_01","icon_03"]; state.score = 520; state.maxCombo = 6; finishLevel()');
  await sleep(80);
  check('第 10 关结算出现祝福卡区块', doc.body.textContent.indexOf('扎西德勒！通关全部 10 关') > -1);
  check('无「下一关」按钮（已是最后一关）', $('#res-actions').textContent.indexOf('下一关') === -1,
    '实际按钮：' + $('#res-actions').textContent);
  $('#bless-name').value = '小藏';
  $('#bless-gen').click();
  await sleep(120);
  const dl = $('#bless-out a.dl-btn');
  check('生成祝福卡（PNG 下载链接）', !!dl, '未生成');
  if (dl) {
    check('下载文件名含昵称', dl.getAttribute('download').indexOf('小藏') > -1, dl.getAttribute('download'));
    check('图片为 data URL', dl.getAttribute('href').indexOf('data:image/png') === 0);
  }

  /* ---------- 10. 数据还原（关卡配置） ---------- */
  section('10. 关卡数据');
  const levels = ev('LEVELS');
  let allOk = true;
  levels.forEach(function (c) {
    const total = c.elements.reduce(function (s, e) { return s + e[1]; }, 0);
    if (total !== c.cols * c.rows) { allOk = false; }
    if (!c.elements.every(function (e) { return e[1] % 2 === 0; })) { allOk = false; }
  });
  check('10 关牌数 = 网格数 且每种为偶数', allOk);
  check('元素库 12 项', ev('Object.keys(ELEMENTS).length') === 12);
  check('文化卡 12 张', ev('CARDS.length') === 12);
  check('藏文排序正确（ཀ ཁ ག ང ཅ ཆ ཇ ཉ）',
    ev('["letter_01","letter_02","letter_03","letter_04","letter_05","letter_06","letter_07","letter_08"].map(function(k){return ELEMENTS[k].tibetan}).join("")')
    === 'ཀཁགངཅཆཇཉ');

  /* ---------- 汇总 ---------- */
  check('全程无脚本运行时错误', errors.length === 0, errors[0]);

  console.log('\n==========================================');
  console.log('  通过: ' + pass + ' | 失败: ' + fail);
  if (fail) {
    console.log('  失败项：');
    failures.forEach(function (f) { console.log('   - ' + f); });
  } else {
    console.log('  浏览器体验版端到端验证全部通过 ✓');
  }
  console.log('==========================================');

  dom.window.close();
  process.exit(fail ? 1 : 0);
})().catch(function (e) {
  console.error('✗ 测试异常中断：', e && e.stack || e);
  process.exit(1);
});
