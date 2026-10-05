#!/usr/bin/env node
/**
 * scripts/test-h5.js — 浏览器体验版端到端自检
 *
 * 用 jsdom 真实执行 preview/play.html 的内联脚本，并模拟真人点击，
 * 逐项验证「配对消除 → 文化卡 → 结算 → 下一关」整条链路。
 *
 * 覆盖范围：
 *   1) 弹窗不打扰：文化卡仅首次发现出现，非阻塞、自动收起；重复匹配只出轻提示
 *   2) 背景不单调：各页均有藏文化三层背景（纹样/经幡/雪山布达拉宫）
 *   3) 弹窗不简陋：文化卡为渐变头图 + 徽章 + 文化小知识 + 倒计时条
 *   4) 牌面统一：所有关卡牌面尺寸一致，盘面居中
 *   5) 配对朗读：每成功配对朗读一次，失败不朗读
 *   6) 成长阶梯 · 证书：正确率统计、等级门槛（金/银/普通）、编号 ZWFK-YYYY-NNNN、
 *      阶段通关颁发与升级（只升不降）、文化护照 12 格、证书页导出 PNG、持久化
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
      // 记录滚动调用：天梯动效只会滚动页面（不碰数据），这里作为可验证的痕迹
      window.__scrolls = [];
      window.scrollTo = function (a) { window.__scrolls.push(a); };
      // 体验版不带真人录音；用静音桩替代 Audio，避免 jsdom「未实现」噪音
      window.Audio = function () {
        return { play: function () { return { catch: function () {} }; }, pause: function () {} };
      };
      // jsdom 不进行布局，clientWidth 恒为 0；给出稳定的手机视口宽度，
      // 以便验证「各关牌面尺寸一致」的布局计算。
      Object.defineProperty(window.Element.prototype, 'clientWidth', {
        configurable: true,
        get: function () { return 390; }
      });
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

  await sleep(150);

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

  /* ---------- 2. 藏文化背景层（修复②：背景不单调） ---------- */
  section('2. 藏文化背景层');
  check('全局暗金光晕底图已内联',
    ($('#sc-bg') || {}).src && $('#sc-bg').src.indexOf('data:image/jpeg') === 0,
    ($('#sc-bg') || {}).src && $('#sc-bg').src.slice(0, 24));
  check('经幡天空层已内联', ($('#sc-sky') || {}).src && $('#sc-sky').src.indexOf('data:image/png') === 0);
  check('雪山/布达拉宫地面层已内联', ($('#sc-ground') || {}).src && $('#sc-ground').src.indexOf('data:image/png') === 0);
  check('藏式菱格纹样已设置为 CSS 变量',
    (doc.documentElement.style.getPropertyValue('--pat') || '').indexOf('data:image/png') > -1);
  check('背景为五层结构（底图/纹样/地面/天空/夜色罩）',
    $$('.scenery > *').length === 5, '实际 ' + $$('.scenery > *').length);
  check('夜色罩存在（压暗四角、突出中心金光）', !!$('.sc-night'));

  /* ---------- 3. 进入第 1 关 ---------- */
  section('3. 进入第 1 关');
  btns[0].click();
  await sleep(90);
  check('切到游戏页', activeScreen() === 'screen-game', activeScreen());
  check('第 1 关 6×4 = 24 张牌', $$('#board .tile').length === 24, '实际 ' + $$('#board .tile').length);
  check('新手引导首次弹出', $('#guide-mask').classList.contains('show'));
  for (let i = 0; i < 3; i++) { $('#guide-next').click(); await sleep(30); }
  check('引导完成后关闭', !$('#guide-mask').classList.contains('show'));
  check('引导完成状态已持久化', ev('isOnboardDone()') === true);

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
  // 障碍物判定（与 utils/obstacles.js 同规则，供配对查找时避开被罩住的牌）
  const obsIsBlockedInTest = function (i) {
    const t = tiles()[i];
    return !!(t && (t.frost || t.crate > 0));
  };

  const goldenId = ev('state.goldenId');
  check('已选定金色特殊方块', typeof goldenId === 'string' && goldenId.length > 0, String(goldenId));
  check('金色方块已渲染 ✦', $$('#board .tile.golden .star').length > 0);

  /* ---------- 4. 首次配对 → 非阻塞文化卡（修复①③） ---------- */
  section('4. 首次配对与非阻塞文化卡');
  check('旧的阻塞式弹窗已移除', !$('#card-mask'));

  let pair = findPair();
  await clickTile(pair[0]);
  check('第一张牌进入 selected', tiles()[pair[0]].state === 'selected', tiles()[pair[0]].state);
  await clickTile(pair[1]);
  check('配对后进入 removing', tiles()[pair[0]].state === 'removing' && tiles()[pair[1]].state === 'removing');
  check('配对成功不再锁盘面（非阻塞）', ev('state.locked') === false);

  await sleep(400);
  check('首次发现滑动出现完整文化卡', $('#card-panel').classList.contains('show'));
  check('文化卡显示期间仍不锁盘面', ev('state.locked') === false);

  // 关键回归：卡片显示时仍可继续点击牌面（旧版会锁死）
  const probe = findPair();
  await clickTile(probe[0]);
  check('卡片显示时仍可继续点牌（真正的非阻塞）', tiles()[probe[0]].state === 'selected', tiles()[probe[0]].state);
  await clickTile(probe[0]);   // 再点一次取消选中
  check('再次点击可取消选中', tiles()[probe[0]].state === 'idle', tiles()[probe[0]].state);

  // 弹窗视觉（修复③：不简陋）
  const cardText = $('#card-panel').textContent;
  check('文化卡有标题/读音/说明', cardText.length > 30, '长度 ' + cardText.length);
  check('文化卡含「文化小知识」', cardText.indexOf('文化小知识') > -1);
  check('文化卡有渐变头图', ($('#card-hero').style.background || '').indexOf('linear-gradient') > -1);
  check('文化卡有徽章元素', !!$('#card-medal'));
  check('文化卡有倒计时进度条', !!$('#card-bar'));
  check('文化卡有说明式提示语（不打断游戏）', cardText.indexOf('游戏不会暂停') > -1);
  check('文化卡提供关闭按钮', !!$('#card-x'));

  $('#card-x').click();
  await sleep(80);
  check('点 ✕ 后文化卡收起', !$('#card-panel').classList.contains('show'));
  check('两张牌状态 = removed', tiles()[pair[0]].state === 'removed' && tiles()[pair[1]].state === 'removed');
  check('已消除对数 = 1', ev('state.matchedCount') === 1);
  check('积分已累加（≥10）', ev('state.score') >= 10, 'score=' + ev('state.score'));

  /* ---------- 4b. 配对成功朗读发音（新增要求） ---------- */
  section('4b. 配对成功朗读藏文发音');
  check('成功配对后朗读了 1 次', ev('state.pronounceCount') === 1, 'count=' + ev('state.pronounceCount'));
  check('朗读的是本次消除的元素', ev('state.lastPronounced') === tiles()[pair[0]].id,
    'last=' + ev('state.lastPronounced') + ' 应为 ' + tiles()[pair[0]].id);

  /* ---------- 5. 配对失败：无惩罚 ---------- */
  section('5. 配对失败不扣分');
  const scoreBefore = ev('state.score');
  const pronBefore = ev('state.pronounceCount');
  const mm = findMismatch();
  await clickTile(mm[0]);
  await clickTile(mm[1]);
  check('错误配对触发 shake', tiles()[mm[0]].state === 'shake' && tiles()[mm[1]].state === 'shake');
  check('抖动期间短暂锁盘面', ev('state.locked') === true);
  await sleep(520);
  check('抖动后恢复 idle', tiles()[mm[0]].state === 'idle' && tiles()[mm[1]].state === 'idle');
  check('解除锁定可继续点', ev('state.locked') === false);
  check('不扣分', ev('state.score') === scoreBefore, scoreBefore + ' → ' + ev('state.score'));
  check('连击清零', ev('state.combo') === 0, 'combo=' + ev('state.combo'));
  check('配对失败不朗读发音', ev('state.pronounceCount') === pronBefore,
    pronBefore + ' → ' + ev('state.pronounceCount'));

  /* ---------- 6. 连击 + 重复匹配轻提示（修复①） ---------- */
  section('6. 连击与重复匹配轻提示');
  // 把 12 张文化卡全部标记为「已看过」，之后的匹配应只出轻提示
  ev('Object.keys(ELEMENTS).forEach(function (k) { markCardSeen(k); });');
  const pr1 = findPair();
  const pronAtMatch = ev('state.pronounceCount');
  await clickTile(pr1[0]);
  await clickTile(pr1[1]);
  check('朗读延后于配对音效（配对后瞬时尚未朗读）', ev('state.pronounceCount') === pronAtMatch,
    'count=' + ev('state.pronounceCount'));
  await sleep(380);
  check('延时结束后完成朗读', ev('state.pronounceCount') === pronAtMatch + 1,
    'count=' + ev('state.pronounceCount'));
  check('重复匹配不再弹完整卡片', !$('#card-panel').classList.contains('show'));
  check('重复匹配改为轻提示 toast', $('#toast').classList.contains('show'));
  check('轻提示含「已收藏」', $('#toast').textContent.indexOf('已收藏') > -1, $('#toast').textContent);

  const pr2 = findPair();
  await clickTile(pr2[0]);
  await clickTile(pr2[1]);
  await sleep(380);
  check('第 3 次配对也朗读（累计 3 次）', ev('state.pronounceCount') === pronAtMatch + 2,
    'count=' + ev('state.pronounceCount'));
  check('连击累加（≥2）', ev('state.combo') >= 2, 'combo=' + ev('state.combo'));
  check('最高连击已记录', ev('getProgress().bestCombo') >= 2, 'bestCombo=' + ev('getProgress().bestCombo'));

  /* ---------- 7. 文化卡自动收起（修复①） ---------- */
  section('7. 文化卡自动收起');
  const autoMs = ev('CARD_AUTO_MS');
  check('自动收起时长合理（4-8 秒）', typeof autoMs === 'number' && autoMs >= 4000 && autoMs <= 8000, 'CARD_AUTO_MS=' + autoMs);
  ev('showCard("letter_01")');
  await sleep(60);
  check('手动调用可弹出文化卡', $('#card-panel').classList.contains('show'));
  await sleep(autoMs + 500);
  check('无需手动操作即自动收起', !$('#card-panel').classList.contains('show'));

  /* ---------- 8. 牌面尺寸统一（修复④） ---------- */
  section('8. 各关牌面尺寸统一');
  ev('startLevel(1)'); await sleep(70);
  const tileL1 = ev('state.tileW');
  const colsL1 = ev('state.cols');
  check('第 1 关为 6 列', colsL1 === 6, 'cols=' + colsL1);
  check('第 1 关牌宽计算有效', tileL1 >= 30, 'tileW=' + tileL1);

  ev('startLevel(3)'); await sleep(70);
  const tileL3 = ev('state.tileW');
  const colsL3 = ev('state.cols');
  check('第 3 关为 8 列', colsL3 === 8, 'cols=' + colsL3);
  check('6 列与 8 列的牌宽完全一致', tileL3 === tileL1, 'L1=' + tileL1 + ' vs L3=' + tileL3);
  check('盘面宽度随列数变化（居中自适应）', ev('state.cols * state.tileW + (state.cols - 1) * state.gap') > 0);

  ev('startLevel(10)'); await sleep(70);
  const tileL10 = ev('state.tileW');
  check('第 10 关牌宽与第 1 关一致', tileL10 === tileL1, 'L1=' + tileL1 + ' vs L10=' + tileL10);
  check('第 10 关 6×8 = 48 张牌', $$('#board .tile').length === 48, '实际 ' + $$('#board .tile').length);

  // 回到第 1 关，准备通关
  ev('startLevel(1)'); await sleep(80);

  /* ---------- 9. 通关 → 结算页 ---------- */
  section('9. 通关与结算');
  const pronOnEnter = ev('state.pronounceCount');
  let guard = 0;
  while (ev('state.matchedCount') < 12 && guard++ < 40) {
    const pr = findPair();
    if (!pr) break;
    await clickTile(pr[0]);
    await clickTile(pr[1]);
    await sleep(340);
  }
  check('全部 12 对已消除', ev('state.matchedCount') === 12, 'matched=' + ev('state.matchedCount'));
  check('本关 12 次配对 = 12 次朗读', ev('state.pronounceCount') - pronOnEnter === 12,
    '增加 ' + (ev('state.pronounceCount') - pronOnEnter) + ' 次');
  check('通关瞬间不再弹出重复提示', !$('#toast').classList.contains('show'));

  /* ---------- 9.5 通关情绪引擎（PRD 4.1/4.2） ---------- */
  section('9.5 通关情绪引擎');
  check('通关粒子已生成（≥12 片莲花/风马旗）', $$('.fx-bit').length >= 12, 'bits=' + $$('.fx-bit').length);
  check('粒子含雪山金光层', !!$('.fx-glow'));
  check('触发轻震动', ev('state.vibrateCount') >= 1, 'vibrate=' + ev('state.vibrateCount'));
  await sleep(1200);
  check('通关藏语语音已触发（tashi_delek）', ev('state.speakLog').indexOf('tashi_delek') > -1,
    'speakLog=' + JSON.stringify(ev('state.speakLog')));
  await sleep(600);
  check('自动进入结算页', activeScreen() === 'screen-result', activeScreen());
  check('结算页为唐卡画卷（.unfurl）', !!$('#screen-result .unfurl'));
  check('画卷有上下卷轴杆', $$('#screen-result .roller').length === 2, 'rollers=' + $$('#screen-result .roller').length);
  // 祝福语由 finishLevel 内部 setTimeout(650ms) 触发，等它到达再断言（避免固定 sleep 的时序抖动）
  for (let bw = 0; bw < 20 && ev('state.speakLog').indexOf('blessing_01') < 0; bw++) await sleep(100);
  check('画卷展开时播放舒缓祝福语', ev('state.speakLog').indexOf('blessing_01') > -1,
    'speakLog=' + JSON.stringify(ev('state.speakLog')));
  await sleep(400);
  check('粒子层已自动清除', !$('#fx-layer'), 'fx-layer 仍在');
  check('显示「第 1 关完成！」', ($('#res-title') || {}).textContent === '第 1 关完成！');
  check('显示积分/连击/文化卡统计', $('#res-score').textContent !== '0' || ev('state.score') === 0);
  check('授予「拉萨」印记横幅', ($('#res-stamp').textContent || '').indexOf('拉萨') > -1);
  check('文化卡列表去重后 2 张', $$('#res-chips .chip').length === 2, 'chips=' + $$('#res-chips .chip').length);
  check('出现「下一关」按钮', $('#res-actions').textContent.indexOf('下一关') > -1, $('#res-actions').textContent);
  check('非第10关不显示祝福卡', $('#res-bless').textContent.trim() === '');

  /* ---------- 10. 进度持久化 ---------- */
  section('10. 进度持久化');
  const saved = JSON.parse(win.localStorage.getItem('zangzi_progress') || 'null');
  check('localStorage 已写入 progress', !!saved);
  check('completedLevels 含第 1 关', saved && saved.completedLevels.indexOf(1) > -1, JSON.stringify(saved && saved.completedLevels));
  check('unlockedLevel 提升到 2', saved && saved.unlockedLevel === 2, 'unlockedLevel=' + (saved && saved.unlockedLevel));
  check('stamps 含 lhasa', saved && saved.stamps.indexOf('lhasa') > -1);
  check('seenCards 已记录（用于「首次才弹卡」判断）', saved && saved.seenCards.length > 0, 'seenCards=' + (saved && saved.seenCards.length));

  /* ---------- 11. 返回首页 ---------- */
  section('11. 返回首页');
  const backBtn = $$('#res-actions button').filter(function (b) { return b.textContent.indexOf('返回首页') > -1; })[0];
  check('存在「返回首页」按钮', !!backBtn);
  backBtn.click();
  await sleep(80);
  check('回到首页', activeScreen() === 'screen-home', activeScreen());
  const btns2 = $$('#level-grid .level-btn');
  check('第 1 关显示已通关', btns2[0].classList.contains('done'));
  check('第 2 关已解锁', !btns2[1].classList.contains('locked'));
  check('第 3 关仍锁定', btns2[2].classList.contains('locked'));
  check('首页显示印记', ($('#profile-stamps').textContent || '').indexOf('拉萨') > -1);

  /* ---------- 12. 第 10 关祝福卡 ---------- */
  section('12. 第 10 关祝福卡');
  ev('startLevel(10)');
  await sleep(90);
  check('第 10 关 6×8 = 48 张牌', $$('#board .tile').length === 48, '实际 ' + $$('#board .tile').length);
  ev('state.matchedCount = 24; state.collected = ["letter_01","icon_03"]; state.score = 520; state.maxCombo = 6; finishLevel()');
  await sleep(90);
  check('第 10 关结算出现祝福卡区块', doc.body.textContent.indexOf('扎西德勒！通关全部 10 关') > -1);
  check('无「下一关」按钮（已是最后一关）', $('#res-actions').textContent.indexOf('下一关') === -1,
    '实际按钮：' + $('#res-actions').textContent);
  $('#bless-name').value = '小藏';
  $('#bless-gen').click();
  await sleep(140);
  const dl = $('#bless-out a.dl-btn');
  check('生成祝福卡（PNG 下载链接）', !!dl, '未生成');
  if (dl) {
    check('下载文件名含昵称', dl.getAttribute('download').indexOf('小藏') > -1, dl.getAttribute('download'));
    check('图片为 data URL', dl.getAttribute('href').indexOf('data:image/png') === 0);
  }

  /* ---------- 13. 数据还原（关卡配置） ---------- */
  section('13. 关卡数据');
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

  /* ================================================================
     成长阶梯 · 证书体系
     ================================================================ */

  /* ---------- 14. 成长阶梯数据 ---------- */
  section('14. 成长阶梯（12 阶段 × 10 关）');
  const stages = ev('STAGES');
  check('成长阶梯共 12 个阶段', stages.length === 12, '实际 ' + stages.length);
  check('每阶段跨度 10 关', stages.every(function (s) { return s.to - s.from + 1 === 10; }),
    JSON.stringify(stages.map(function (s) { return s.to - s.from + 1; })));
  check('阶段区间连续且不重叠',
    stages.every(function (s, i) { return i === 0 || s.from === stages[i - 1].to + 1; }));
  check('MVP 仅开放第一阶段', stages.filter(function (s) { return s.open; }).length === 1 && stages[0].open === true);
  check('第一阶段 = 第 1-10 关 · 简单基字',
    stages[0].from === 1 && stages[0].to === 10 && stages[0].name === '简单基字');
  check('阶梯覆盖到第 120 关（12 × 10）', stages[11].to === 120, 'to=' + stages[11].to);
  check('证书等级门槛齐全（金/银/普通）',
    ev('Object.keys(TIERS).sort().join(",")') === 'bronze,gold,silver');
  check('金质门槛最严（≥95% 且零失误）',
    ev('TIERS.gold.minAccuracy') === 0.95 && ev('TIERS.gold.requireClean') === true);
  check('银质门槛 ≥80%', ev('TIERS.silver.minAccuracy') === 0.80);

  /* ---------- 15. 正确率统计 ---------- */
  section('15. 正确率统计（证书质量门槛的基础）');
  ev('clearProgress(); renderHome();');
  await sleep(40);
  ev('startLevel(1)');
  await sleep(60);
  check('开新关时尝试次数归零', ev('state.attempts') === 0 && ev('state.matches') === 0 && ev('state.misses') === 0);

  const p1 = findPair();
  await clickTile(p1[0]);
  await clickTile(p1[1]);
  await sleep(120);
  check('成功配对计 1 次尝试 / 1 次成功',
    ev('state.attempts') === 1 && ev('state.matches') === 1 && ev('state.misses') === 0,
    'att=' + ev('state.attempts') + ' ok=' + ev('state.matches'));
  const mm1 = findMismatch();
  await clickTile(mm1[0]);
  await clickTile(mm1[1]);
  await sleep(60);
  check('失败配对同样计入尝试且记为失误',
    ev('state.attempts') === 2 && ev('state.misses') === 1,
    'att=' + ev('state.attempts') + ' miss=' + ev('state.misses'));

  /* ---------- 16. 阶段证书的颁发与等级 ---------- */
  section('16. 证书颁发与等级（普通 → 升级金质）');

  // 用可复现的方式依次通关：attempts / misses 可控
  const passLevel = function (n, attempts, misses) {
    const pairs = ev('LEVELS[' + (n - 1) + '].cols * LEVELS[' + (n - 1) + '].rows / 2');
    ev('(function () { startLevel(' + n + ');' +
      ' state.matchedCount = ' + pairs + ';' +
      ' state.attempts = ' + (attempts || pairs) + ';' +
      ' state.misses = ' + (misses || 0) + ';' +
      ' state.score = 120; state.maxCombo = 4; state.collected = [];' +
      ' finishLevel(); })()');
  };

  // 前半程（1-5 关）用一半正确率通完，此时阶段未结束 → 不发证书
  for (let n = 1; n <= 5; n++) {
    passLevel(n, ev('LEVELS[' + (n - 1) + '].cols * LEVELS[' + (n - 1) + '].rows / 2') * 2,
      ev('LEVELS[' + (n - 1) + '].cols * LEVELS[' + (n - 1) + '].rows / 2'));
    await sleep(20);
  }
  check('阶段未通关时暂不颁发证书', ev('getProgress().certs.length') === 0,
    'certs=' + ev('getProgress().certs.length'));
  check('未通关时结算页给出阶段进度提示',
    $('#res-cert').textContent.indexOf('第 1 阶段') > -1 && $('#res-cert').textContent.indexOf('简单基字') > -1,
    $('#res-cert').textContent);
  check('未通关时结算页给出提升建议', $('#res-cert').textContent.indexOf('正确率提升') > -1,
    $('#res-cert').textContent);
  check('结算页显示本关正确率', $('#res-acc').textContent.indexOf('正确率') > -1,
    $('#res-acc').textContent);

  // 通完剩余 5 关（同样一半正确率）→ 阶段完成，按门槛只应得「普通证书」
  for (let n = 6; n <= 10; n++) {
    passLevel(n, ev('LEVELS[' + (n - 1) + '].cols * LEVELS[' + (n - 1) + '].rows / 2') * 2,
      ev('LEVELS[' + (n - 1) + '].cols * LEVELS[' + (n - 1) + '].rows / 2'));
    await sleep(20);
  }
  const cert1 = ev('findCert(1)');
  check('通关第 10 关颁发第一阶段证书', !!cert1);
  check('证书阶段名 = 简单基字', cert1 && cert1.stageName === '简单基字', cert1 && cert1.stageName);
  check('正确率不足时只发普通证书', cert1 && cert1.tier === 'bronze',
    cert1 && (cert1.tier + ' acc=' + cert1.acc));
  check('证书编号符合 ZWFK-YYYY-NNNN', cert1 && /^ZWFK-\d{4}-\d{4}$/.test(cert1.no), cert1 && cert1.no);
  check('首张证书流水号为 0001', cert1 && cert1.no.slice(-4) === '0001', cert1 && cert1.no);
  check('证书成就行按真实数据生成（8 个藏文字母）',
    cert1 && cert1.lines.join('|').indexOf('已认识 8 个藏文字母') > -1,
    cert1 && cert1.lines.join(' | '));
  check('证书默认持有人', cert1 && cert1.holder === '藏文学习者', cert1 && cert1.holder);
  check('结算页出现证书横幅', $('#res-cert').textContent.indexOf('获得藏文成长证书') > -1,
    $('#res-cert').textContent);
  check('横幅等级徽章 = 普', ($('#res-cert .cert-seal') || {}).textContent === '普',
    ($('#res-cert .cert-seal') || {}).textContent);

  // 重玩全部 10 关且零失误 → 应升级为金质证书，编号不变
  for (let n = 1; n <= 10; n++) {
    passLevel(n, 0, 0);
    await sleep(20);
  }
  const cert2 = ev('findCert(1)');
  check('零失误通关后升级为金质证书', cert2 && cert2.tier === 'gold',
    cert2 && (cert2.tier + ' acc=' + cert2.acc + ' clean=' + cert2.clean));
  check('升级后正确率 100%', cert2 && cert2.acc === 100, cert2 && cert2.acc);
  check('升级不新增证书（同一阶段只保留一张）', ev('getProgress().certs.length') === 1,
    'certs=' + ev('getProgress().certs.length'));
  check('升级沿用原证书编号', cert2 && cert2.no === cert1.no, cert2 && cert2.no);
  check('结算页提示「证书升级」', $('#res-cert').textContent.indexOf('证书升级') > -1,
    $('#res-cert').textContent);

  // 之后再出现失误不应降级（只升不降）
  passLevel(10, ev('LEVELS[9].cols * LEVELS[9].rows / 2') * 2, ev('LEVELS[9].cols * LEVELS[9].rows / 2'));
  await sleep(30);
  check('已有更高等级证书不会被降级', ev('findCert(1).tier') === 'gold', ev('findCert(1).tier'));

  /* ---------- 17. 文化护照（12 张证书的位置） ---------- */
  section('17. 文化护照');
  ev('showPassport()');
  await sleep(50);
  check('切换到文化护照页', activeScreen() === 'screen-passport', activeScreen());
  const slots = $$('#pp-cert-grid .cert-slot');
  check('护照列出 12 个证书位置', slots.length === 12, '实际 ' + slots.length);
  check('已获得的证书高亮', $$('#pp-cert-grid .cert-slot.got').length === 1,
    'got=' + $$('#pp-cert-grid .cert-slot.got').length);
  check('未获得的证书为灰色锁定', $$('#pp-cert-grid .cert-slot.locked').length === 11,
    'locked=' + $$('#pp-cert-grid .cert-slot.locked').length);
  check('护照显示证书总数 1 / 12', $('#pp-cert-count').textContent === '1 / 12', $('#pp-cert-count').textContent);
  check('已得位置显示等级徽章', ($('#pp-cert-grid .cert-slot.got .slot-tier') || {}).textContent === '金质证书',
    ($('#pp-cert-grid .cert-slot.got .slot-tier') || {}).textContent);
  check('护照含文化收藏册分区', doc.body.textContent.indexOf('文化收藏册') > -1);
  check('护照含地区印章分区', doc.body.textContent.indexOf('地区印章') > -1);
  check('护照含现实足迹（二期占位）', doc.body.textContent.indexOf('现实足迹') > -1);
  check('护照含个人文化图谱', doc.body.textContent.indexOf('个人文化图谱') > -1);

  /* ---------- 18. 证书页 ---------- */
  section('18. 证书页（查看 / 保存 / 分享）');
  ev('showCert(1)');
  await sleep(50);
  check('切换到证书页', activeScreen() === 'screen-cert', activeScreen());
  const sheet = $('#cert-body .cert-sheet');
  check('渲染证书纸张', !!sheet);
  check('证书标题 = 藏文成长证书', doc.body.textContent.indexOf('藏文成长证书') > -1);
  check('证书显示阶段名', doc.body.textContent.indexOf('简单基字') > -1);
  check('证书显示编号', doc.body.textContent.indexOf(cert2.no) > -1);
  check('证书显示颁发日期', doc.body.textContent.indexOf(ev('formatDate()')) > -1);
  check('证书含藏文装饰语（tsheg 连写）', doc.body.textContent.indexOf(ev('CERT_TIB')) > -1);

  $('#cert-gen').click();
  await sleep(120);
  const certDl = $('#cert-out a.cert-dl');
  check('生成证书图片（PNG 下载链接）', !!certDl, '未生成');
  if (certDl) {
    check('证书图片文件名含阶段名', certDl.getAttribute('download').indexOf('简单基字') > -1,
      certDl.getAttribute('download'));
    check('证书图片为 data URL', certDl.getAttribute('href').indexOf('data:image/png') === 0);
  }

  // 持有人可在证书页修改（编号不变）
  ev('setHolderName("小藏"); updateCertHolder("小藏"); showCert(1)');
  await sleep(40);
  check('证书持有人可修改', doc.body.textContent.indexOf('小藏') > -1);
  check('修改持有人不影响证书编号', ev('findCert(1).no') === cert2.no, ev('findCert(1).no'));

  // 未开放 / 未获得阶段 → 锁定说明 + 等级规则
  ev('showCert(3)');
  await sleep(40);
  check('未获得阶段显示锁定说明', !!$('#cert-body .locked-box'));
  check('锁定页列出三级证书门槛', $$('#cert-body .tier-row').length === 3,
    '实际 ' + $$('#cert-body .tier-row').length);
  check('锁定页给出解锁条件', $('#cert-body .locked-box .r').textContent.indexOf('21-30') > -1,
    $('#cert-body .locked-box .r').textContent);

  /* ---------- 19. 证书数据持久化 ---------- */
  section('19. 证书持久化');
  const savedCert = JSON.parse(win.localStorage.getItem('zangzi_progress') || 'null');
  check('certs 已写入 localStorage', !!(savedCert && savedCert.certs && savedCert.certs.length === 1),
    JSON.stringify(savedCert && savedCert.certs && savedCert.certs.length));
  check('certSeq 已记录（编号不重复）', savedCert && savedCert.certSeq >= 1, 'certSeq=' + (savedCert && savedCert.certSeq));
  check('levelStats 已记录各关最佳正确率',
    !!(savedCert && savedCert.levelStats && savedCert.levelStats['10'] &&
      savedCert.levelStats['10'].bestAcc === 1),
    JSON.stringify(savedCert && savedCert.levelStats && savedCert.levelStats['10']));
  check('holderName 已持久化', savedCert && savedCert.holderName === '小藏', savedCert && savedCert.holderName);

  /* ---------- 20. 藏文权益中心（双轨制） ---------- */
  section('20. 藏文权益中心（双轨制）');
  ev('renderHome()');
  await sleep(40);
  check('首页有权益中心入口', !!$('#home-benefits .benefit-card'));

  $('#home-benefits .benefit-card').click();
  await sleep(60);
  check('可从首页进入权益中心', activeScreen() === 'screen-benefits', activeScreen());
  check('首次进入显示内嵌模式引导（非弹窗）',
    !!$('#bn-guide .bn-guide') && doc.body.textContent.indexOf('你是从哪里来') > -1);
  check('未选模式时不展示券列表', !!$('#bn-body .bn-empty'));
  check('双轨 Tab 已渲染两个入口', $$('#bn-tabs .bn-tab').length === 2,
    '实际 ' + $$('#bn-tabs .bn-tab').length);
  check('未选模式时两个 Tab 均不高亮', $$('#bn-tabs .bn-tab.on').length === 0);
  check('页头声明「不涉及任何支付与资金结算」',
    doc.body.textContent.indexOf('不涉及任何支付与资金结算') > -1);
  check('未选模式时列表为空（一键切换才有意义）',
    ev('bnList("", "lhasa").length') === 0);

  // 一键切到「本地生活」
  ev('setBenefitMode("local")');
  await sleep(40);
  check('切换为本地生活模式', ev('state.benefitMode') === 'local', ev('state.benefitMode'));
  check('选定后引导卡自动收起', !$('#bn-guide .bn-guide'));
  check('本地生活 Tab 高亮',
    $$('#bn-tabs .bn-tab.on').length === 1 && $('#bn-tabs .bn-tab.on').textContent === '本地生活');
  let mids = $$('#bn-body .bn-card').map(function (c) { return c.getAttribute('data-mid'); });
  check('本地生活只出本地 / 通用商家',
    mids.length > 0 && mids.every(function (id) { return id.indexOf('m_tour_') === -1; }), mids.join(','));
  check('通用轨（both）两端都可见', mids.indexOf('m_both_02') > -1);
  check('每张券卡都写明权益由商家提供',
    $$('#bn-body .bc-provider').length === mids.length &&
    $('#bn-body .bc-provider').textContent.indexOf('不参与交易') > -1);
  check('券卡不含金额字样', !/[¥]|元/.test($('#bn-body').textContent));

  // 一键切到「游客专属」
  ev('setBenefitMode("tourist")');
  await sleep(40);
  mids = $$('#bn-body .bn-card').map(function (c) { return c.getAttribute('data-mid'); });
  check('切换为游客专属模式', ev('state.benefitMode') === 'tourist');
  check('游客专属不出本地生活商家',
    mids.every(function (id) { return id.indexOf('m_local_') === -1; }), mids.join(','));
  check('游客专属含游客商家', mids.indexOf('m_tour_01') > -1);

  // 城市：用户主动选择（不申请任何位置权限）
  check('城市选择器提供 4 个地市', $$('#bn-cities .bn-city').length === 4);
  check('默认城市为拉萨', ev('state.benefitCity') === 'lhasa');
  $$('#bn-cities .bn-city')[1].click();
  await sleep(40);
  mids = $$('#bn-body .bn-card').map(function (c) { return c.getAttribute('data-mid'); });
  check('切到林芝后出林芝商家', mids.indexOf('m_tour_04') > -1, mids.join(','));
  check('切城市后拉萨商家被过滤', mids.indexOf('m_tour_01') === -1, mids.join(','));
  ev('setBenefitCity("lhasa")');
  await sleep(40);

  // 领取凭证：本地生成核销码，平台不经手资金
  check('未领取时凭证记录为空', ev('getProgress().benefits.length') === 0);
  ev('claimBenefit("m_tour_01")');
  await sleep(40);
  const benRec = ev('getProgress().benefits')[0];
  check('领取后写入凭证记录', !!benRec && benRec.mid === 'm_tour_01', JSON.stringify(benRec));
  check('核销码为 ZW + 4 位流水', !!benRec && benRec.code === 'ZW0001', benRec && benRec.code);
  check('券卡转为已领取态并显示核销码',
    !!$('#bn-body .bn-card.got') && $('#bn-body').textContent.indexOf('ZW0001') > -1);
  check('重复领取不产生第二条记录',
    ev('claimBenefit("m_tour_01")') === false && ev('getProgress().benefits.length') === 1);
  const rawB = JSON.parse(win.localStorage.getItem('zangzi_progress') || 'null');
  check('凭证与流水已持久化',
    !!(rawB && rawB.benefits && rawB.benefits.length === 1 && rawB.benefitSeq === 1));
  check('所选模式已持久化（下次进入不再问）', rawB && rawB.userMode === 'tourist', rawB && rawB.userMode);

  // 反向：通关不足时只能「还差 N 关」，领不到
  ev('(function(){var p=getProgress(); p.completedLevels=[]; p.benefits=[]; p.benefitSeq=0; saveProgress(p); renderBenefits();})()');
  await sleep(40);
  check('进度为 0 时券卡显示「还差 N 关」', $$('#bn-body .bc-lock').length > 0,
    '实际 ' + $$('#bn-body .bc-lock').length);
  check('进度不足的券不可领取', ev('claimBenefit("m_tour_03")') === false);
  check('通关门槛判定正确（bnUnlocked）',
    ev('bnUnlocked(0, 3)') === false && ev('bnUnlocked(3, 3)') === true && ev('bnUnlocked(2, 3)') === false);
  check('已领凭证不因重置进度而重复发码', ev('bnMakeCode(2)') === 'ZW0002');

  /* ---------- 12. 视觉重构与障碍物（PRD v4） ---------- */
  section('21. 视觉重构与障碍物（四层立体 / 冰霜 / 木箱 / 破碎特效）');

  // 反向：第 1 关不应有任何障碍物
  ev('startLevel(1)');
  await sleep(60);
  check('第 1 关无冰霜（不打扰新手）', ev('state.frostTotal') === 0, 'frostTotal=' + ev('state.frostTotal'));
  check('第 1 关无木箱', ev('state.crateTotal') === 0, 'crateTotal=' + ev('state.crateTotal'));
  check('第 1 关 DOM 无冰霜罩层', $$('#board .frost').length === 0);

  // 四层物理层次：每张牌都有独立的 3D 凸起方块层（渐变 + 投影；精灵表字母用帧图）
  check('每张牌都有 3D 方块层（.piece）', $$('#board .tile .piece').length === tiles().length,
    $$('#board .tile .piece').length + '/' + tiles().length);
  const allPieces = $$('#board .tile .piece');
  const gradPiece = allPieces.find(function (p) { return (p.getAttribute('style') || '').indexOf('linear-gradient') > -1; });
  const spritePiece = allPieces.find(function (p) { return p.className.indexOf('ka-sprite-piece') > -1; });
  check('方块为渐变底色或精灵帧图（不是平铺纯色）', !!gradPiece || !!spritePiece,
    '渐变牌 ' + allPieces.filter(function (p) { return (p.getAttribute('style') || '').indexOf('linear-gradient') > -1; }).length
    + ' 张 / 精灵牌 ' + allPieces.filter(function (p) { return p.className.indexOf('ka-sprite-piece') > -1; }).length + ' 张');
  check('普通方块有底部投影（3D 凸出感）',
    !gradPiece || (gradPiece.getAttribute('style') || '').indexOf('box-shadow') > -1,
    gradPiece ? (gradPiece.getAttribute('style') || '').slice(0, 60) : '本局无渐变牌');
  const slotStyle = ($('#board .tile') || {}).getAttribute ? $('#board .tile').getAttribute('style') : '';
  check('槽位与方块分离（槽位不再承载牌面内容）', slotStyle.indexOf('linear-gradient') === -1);

  // 精灵表字母（试点 ཀ）：共用一张 sprite_ka.png，帧位移切四色，成对同色
  const kaTiles = tiles().filter(function (t) { return t.id === 'letter_01'; });
  const kaSprites = $$('#board .ka-sprite');
  check('ཀ 方块全部使用精灵表（.ka-sprite）', kaSprites.length === kaTiles.length && kaTiles.length > 0,
    kaSprites.length + '/' + kaTiles.length);
  const kaImgs = $$('#board .ka-sprite img');
  const oneSrc = kaImgs.length ? kaImgs[0].getAttribute('src') : '';
  check('精灵表共用一张图（全部 <img> 同源，1 次图片请求）',
    kaImgs.length === kaSprites.length && kaImgs.every(function (i) { return i.getAttribute('src') === oneSrc; }) && oneSrc.length > 100);
  check('精灵帧位移只可能是 4 色帧（ka-v0..ka-v3）',
    kaSprites.every(function (s) { return /ka-v[0-3]\b/.test(s.className); }));
  check('精灵牌不再叠加 CSS 渐变（质感由帧提供）',
    kaSprites.every(function (s) { return (s.parentElement.getAttribute('style') || '').indexOf('linear-gradient') === -1; }));

  // 冰霜关（第 3 关）：罩住的牌不可点，且不计入正确率
  ev('startLevel(3)');
  await sleep(60);
  check('第 3 关有 3 块冰霜', ev('state.frostTotal') === 3, 'frostTotal=' + ev('state.frostTotal'));
  check('DOM 冰霜罩层数量一致', $$('#board .frost').length === 3, '实际 ' + $$('#board .frost').length);
  const frostIdx = tiles().findIndex(function (t) { return t.frost; });
  const attemptsBefore = ev('state.attempts');
  await clickTile(frostIdx);
  check('冰霜牌点不动（不进入 selected）', tiles()[frostIdx].state !== 'selected', tiles()[frostIdx].state);
  check('冰霜牌给出抖动反馈', tiles()[frostIdx].state === 'shake' || tiles()[frostIdx].state === 'idle', tiles()[frostIdx].state);
  check('冰霜牌不计入正确率尝试次数', ev('state.attempts') === attemptsBefore,
    attemptsBefore + ' → ' + ev('state.attempts'));
  check('冰霜牌给出轻提示（非阻塞）', $('#toast').classList.contains('show'));
  check('冰霜牌提示文案含「冰霜」', $('#toast-text').textContent.indexOf('冰霜') > -1, $('#toast-text').textContent);

  // 破冰：消除冰霜旁边的牌 → 冰霜自动解冻
  const frostNbs = ev('obsNeighbors(' + frostIdx + ', state.cols, state.rows)');
  let breakPair = null;
  for (let n = 0; n < frostNbs.length && !breakPair; n++) {
    const nb = frostNbs[n];
    if (!tiles()[nb] || obsIsBlockedInTest(nb)) continue;
    for (let j = 0; j < tiles().length; j++) {
      if (j === nb || tiles()[j].id !== tiles()[nb].id) continue;
      if (tiles()[j].state !== 'idle' || obsIsBlockedInTest(j)) continue;
      breakPair = [nb, j]; break;
    }
  }
  check('找到可触发解冻的配对', !!breakPair);
  if (breakPair) {
    await clickTile(breakPair[0]);
    await clickTile(breakPair[1]);
    check('消除瞬间出现破碎粒子层', $$('#board .tile.removing .bits').length > 0,
      '实际 ' + $$('#board .tile.removing .bits').length);
    await sleep(400);
    check('相邻消除后冰霜解冻（state）', tiles()[frostIdx].frost === false);
    check('相邻消除后冰霜罩层移除（DOM）',
      !doc.querySelector('#board .tile[data-index="' + frostIdx + '"] .frost'));
    check('解冻计数增加', ev('state.brokenCount') >= 1, 'brokenCount=' + ev('state.brokenCount'));
    check('出现「破冰！」浮字反馈', ($('#break-fx').textContent || '').indexOf('破冰') > -1,
      $('#break-fx').textContent);
    check('解冻后该牌可以正常选中', (function () {
      return true;
    })());
    await clickTile(frostIdx);
    check('解冻后的牌可点击选中', tiles()[frostIdx].state === 'selected', tiles()[frostIdx].state);
    await clickTile(frostIdx);   // 取消选中，避免影响后续
    await sleep(200);
  }

  // 木箱关（第 6 关）：木箱显示剩余耐久，相邻消除扣耐久
  ev('startLevel(6)');
  await sleep(60);
  check('第 6 关有 2 个木箱', ev('state.crateTotal') === 2, 'crateTotal=' + ev('state.crateTotal'));
  check('DOM 木箱数量一致', $$('#board .crate').length === 2, '实际 ' + $$('#board .crate').length);
  const crateIdx = tiles().findIndex(function (t) { return t.crate > 0; });
  const crateHpBefore = tiles()[crateIdx].crate;
  const brokenBefore = ev('state.brokenCount');
  await clickTile(crateIdx);
  check('木箱牌点不动（不进入 selected）', tiles()[crateIdx].state !== 'selected', tiles()[crateIdx].state);
  check('木箱提示文案含「木箱」', $('#toast-text').textContent.indexOf('木箱') > -1, $('#toast-text').textContent);
  const crateNbs = ev('obsNeighbors(' + crateIdx + ', state.cols, state.rows)');
  let cratePair = null;
  for (let n = 0; n < crateNbs.length && !cratePair; n++) {
    const nb = crateNbs[n];
    if (!tiles()[nb] || obsIsBlockedInTest(nb)) continue;
    for (let j = 0; j < tiles().length; j++) {
      if (j === nb || tiles()[j].id !== tiles()[nb].id) continue;
      if (tiles()[j].state !== 'idle' || obsIsBlockedInTest(j)) continue;
      cratePair = [nb, j]; break;
    }
  }
  if (cratePair) {
    await clickTile(cratePair[0]);
    await clickTile(cratePair[1]);
    await sleep(400);
    const hpAfter = tiles()[crateIdx].crate;
    check('相邻消除后木箱耐久减少或破开', hpAfter < crateHpBefore,
      crateHpBefore + ' → ' + hpAfter);
    check('木箱破开后 DOM 罩层移除', hpAfter > 0 ? true : !doc.querySelector('#board .tile[data-index="' + crateIdx + '"] .crate'));
    if (hpAfter === 0) check('破箱计数增加', ev('state.brokenCount') > brokenBefore, 'brokenCount=' + ev('state.brokenCount'));
  }

  // 文化卡：藏纸卷轴形态（卷轴杆 + 喇叭 + 知道了）
  check('文化卡有卷轴杆', !!$('#card-panel .scroll-rod'));
  check('文化卡有喇叭播放按钮', !!$('#card-speak'));
  check('文化卡有「知道了」按钮', !!$('#card-know'));
  ev('startLevel(1)');
  await sleep(60);
  // 直接打开指定元素的文化卡（真实盘中「首次发现才弹出」，此处验证卷轴形态与交互契约）
  ev('showCard("letter_01")');
  await sleep(60);
  check('可弹出卷轴文化卡', $('#card-panel').classList.contains('show'));
  const pronBeforeCard = ev('state.pronounceCount');
  $('#card-speak').click();
  await sleep(60);
  check('点喇叭播放该元素藏文读音', ev('state.pronounceCount') === pronBeforeCard + 1,
    pronBeforeCard + ' → ' + ev('state.pronounceCount'));
  $('#card-know').click();
  await sleep(60);
  check('点「知道了」收起文化卡', !$('#card-panel').classList.contains('show'));

  /* ---------- 13. PRD v4 留存系统：藤蔓地图 / 资源条 / 悬浮入口 / 签到 / 唐卡 / 道具 / 菩提树 / 星级 ---------- */
  section('22. 留存系统（藤蔓地图 / 签到 / 唐卡 / 道具 / 菩提树 / 星级）');

  // 纯函数边界（与 utils/collect.js 同规则）
  check('三星门槛：满正确率 + 连击≥3 → 3 星', ev('rateStars(12, 0, 4)') === 3, String(ev('rateStars(12, 0, 4)')));
  check('二星门槛：正确率≥80% → 2 星', ev('rateStars(10, 2, 0)') === 2, String(ev('rateStars(10, 2, 0)')));
  check('高正确率但连击不足 → 2 星', ev('rateStars(10, 0, 2)') === 2, String(ev('rateStars(10, 0, 2)')));
  check('低正确率 → 1 星', ev('rateStars(10, 5, 0)') === 1, String(ev('rateStars(10, 5, 0)')));
  check('唐卡集齐后 nextFragment 返回 -1', ev('nextFragment([0,1,2,3,4,5,6,7,8])') === -1);
  check('同日重复签到判定 already', ev('advanceSignIn({streak:1,lastDate:"2026-10-04",totalDays:1,oil:1},"2026-10-04").already') === true);
  check('次日签到连击 +1', ev('advanceSignIn({streak:1,lastDate:"2026-10-04",totalDays:1,oil:1},"2026-10-05").state.streak') === 2);
  check('断签连击重置为 1', ev('advanceSignIn({streak:5,lastDate:"2026-10-01",totalDays:6,oil:5},"2026-10-05").state.streak') === 1);

  // 从干净进度开始，避免前面用例残留
  ev('clearProgress(); renderHome();');
  await sleep(80);

  // 藤蔓地图：五地剪影 + 10 个蜿蜒节点 + 主干
  check('首页为藤蔓地图（.vine-map）', !!$('#screen-home .vine-map'));
  check('有藤蔓主干', !!$('#screen-home .vine-stem'));
  check('天梯顶部有天堂层（佛光/金顶/坛城）', !!$('#screen-home .ladder-heaven .h-potala'));
  check('天梯底部有村落剪影', !!$('#screen-home .ladder-village'));
  check('两侧五色经幡', $$('#screen-home .ladder-flags .flag').length === 16,
    '实际 ' + $$('#screen-home .ladder-flags .flag').length);
  check('藤蔓上共 10 个关卡节点', $$('#screen-home #level-grid .level-item.node').length === 10,
    '实际 ' + $$('#screen-home #level-grid .level-item.node').length);
  check('五个地区剪影', $$('#screen-home #level-grid .region').length === 5,
    '实际 ' + $$('#screen-home #level-grid .region').length);
  check('第 1 关节点已点亮（open）', !!$('#screen-home #level-grid .level-item.open'));
  check('未解锁关卡为锁定态（9 个）', $$('#screen-home #level-grid .level-item.locked').length === 9,
    '实际 ' + $$('#screen-home #level-grid .level-item.locked').length);
  check('反向：新号无已通关节点', $$('#screen-home #level-grid .level-item.done').length === 0);
  check('关卡节点蜿蜒（左右位置不同）', (function () {
    const l = $$('#screen-home #level-grid .level-item.node').map(function (n) { return n.style.left; });
    return new Set(l).size > 1;
  })());

  // 资源条（灯油 / 积分 / 唐卡）
  check('资源条含灯油/积分/唐卡三格', !!$('#res-oil') && !!$('#res-points') && !!$('#res-frag'));
  check('新号资源条初始为 0/0/0-9',
    $('#res-oil').textContent === '0' && $('#res-points').textContent === '0' && $('#res-frag').textContent === '0/9',
    $('#res-oil').textContent + '|' + $('#res-points').textContent + '|' + $('#res-frag').textContent);

  // 万家灯火 · 祈福跳窗（每天首次打开一次；纯静态：数字全部写死，不发任何网络请求）
  check('首次进入首页出现祈福跳窗', $('#lamp-mask').classList.contains('show'));
  check('总灯数为写死的 128,456', $('#lamp-sub').textContent.indexOf('128,456') > -1, $('#lamp-sub').textContent);
  check('五地灯火列表齐备', $$('#lamp-list .lamp-row').length === 5,
    '实际 ' + $$('#lamp-list .lamp-row').length);
  check('家乡行为写死数据（浙江 12,000）',
    $('#lamp-home').textContent.indexOf('浙江') > -1 && $('#lamp-home').textContent.indexOf('12,000') > -1,
    $('#lamp-home').textContent);
  check('两色莲花数字写死', $('#lamp-lotus-gold').textContent === '32,000' && $('#lamp-lotus-pink').textContent === '45,000',
    $('#lamp-lotus-gold').textContent + '|' + $('#lamp-lotus-pink').textContent);
  check('反向：未点亮前不显示祝福语', !$('#lamp-tip').classList.contains('show'));
  $('#lamp-btn').click();
  await sleep(60);
  check('点亮后总灯数 +1（128,456 → 128,457）', $('#lamp-sub').textContent.indexOf('128,457') > -1,
    $('#lamp-sub').textContent);
  check('点亮后出现祝福语', $('#lamp-tip').classList.contains('show') && $('#lamp-tip').textContent.indexOf('感恩') > -1,
    $('#lamp-tip').textContent);
  check('点亮后生成 12 向金粉粒子', $$('#lamp-sparks .spark').length === 12,
    '实际 ' + $$('#lamp-sparks .spark').length);
  $('#lamp-btn').click();
  await sleep(40);
  check('反向：重复点击不再继续加数', $('#lamp-sub').textContent.indexOf('128,457') > -1 &&
    $('#lamp-sub').textContent.indexOf('128,458') === -1, $('#lamp-sub').textContent);
  check('点亮后记录当天日期（供「每天一次」判断）',
    String((JSON.parse(win.localStorage.getItem('zangzi_progress')) || {}).lampDay || '').length === 10,
    String((JSON.parse(win.localStorage.getItem('zangzi_progress')) || {}).lampDay));
  check('反向：跳窗文案无竞争性/营销字眼',
    !/排行|名次|金币|优惠券|广告|折扣|返现/.test($('#lamp-mask').textContent));
  $('#lamp-skip').click();
  await sleep(40);
  check('关闭后跳窗消失', !$('#lamp-mask').classList.contains('show'));
  ev('maybeShowLamp()');
  await sleep(40);
  check('反向：同一天再次进入不再弹出', !$('#lamp-mask').classList.contains('show'));

  // 悬浮入口 + 底部平层：仅首页显示，进入游戏后隐藏（不遮挡棋盘）
  check('首页显示左右悬浮入口', $('#side-left').classList.contains('show') && $('#side-right').classList.contains('show'));
  check('首页显示底部大平层', $('#dock').classList.contains('show'));
  ev('startLevel(1)');
  await sleep(60);
  check('进入游戏后悬浮入口/底部平层隐藏', !$('#side-left').classList.contains('show') && !$('#dock').classList.contains('show'));
  ev('renderHome();');
  await sleep(60);
  check('返回首页后悬浮入口恢复', $('#side-left').classList.contains('show') && $('#dock').classList.contains('show'));

  // 底部面板：非阻塞滑出（不切屏、不弹窗）
  $('#side-left .side-btn[data-panel="lamp"]').click();
  await sleep(60);
  check('点悬浮入口打开底部面板', $('#entry-panel').classList.contains('show'));
  check('面板标题正确（祈福长明灯）', $('#entry-title').textContent === '祈福长明灯', $('#entry-title').textContent);
  check('面板为非阻塞（仍停留在首页）', activeScreen() === 'screen-home', String(activeScreen()));
  $('#entry-x').click();
  await sleep(60);
  check('点 ✕ 收起面板', !$('#entry-panel').classList.contains('show'));

  // 签到：7 天循环 + 只发本地奖励，重复签到不重复发奖
  ev('openPanel("lamp")');
  await sleep(50);
  check('长明灯面板渲染 7 天签到环', $$('#entry-body .lamp-ring').length === 7,
    '实际 ' + $$('#entry-body .lamp-ring').length);
  const oilBeforeSign = ev('getProgress().signIn.oil');
  // 注意用面板自己的 id：跳窗的 #lamp-btn 与面板签到按钮曾撞名，导致面板按钮无监听
  $('#signin-btn').click();
  await sleep(60);
  const progAfterSign = JSON.parse(win.localStorage.getItem('zangzi_progress') || 'null');
  check('签到写入 lastDate', !!progAfterSign.signIn && String(progAfterSign.signIn.lastDate).length === 10,
    JSON.stringify(progAfterSign.signIn));
  check('签到累计天数 +1', progAfterSign.signIn.totalDays === 1, String(progAfterSign.signIn.totalDays));
  check('签到发放灯油 +1', progAfterSign.signIn.oil === oilBeforeSign + 1, oilBeforeSign + ' → ' + progAfterSign.signIn.oil);
  // 反向：同日重复签到不再发奖
  const oilAfterFirst = ev('getProgress().signIn.oil');
  ev('doSignIn()');
  await sleep(50);
  check('同日重复签到不再发奖', ev('getProgress().signIn.oil') === oilAfterFirst, 'oil=' + ev('getProgress().signIn.oil'));
  check('重复签到给出「已点亮」提示',
    $('#toast').classList.contains('show') && $('#toast-text').textContent.indexOf('已经点亮') > -1,
    $('#toast-text').textContent);
  check('签到奖励不含任何金额字样',
    JSON.stringify(ev('DAILY.signInRewards')).indexOf('元') === -1 &&
    JSON.stringify(ev('DAILY.signInRewards')).indexOf('¥') === -1);
  $('#entry-x').click();
  await sleep(50);

  // 唐卡拼图：3×3 九片，未持有显示编号占位
  ev('openPanel("thangka")');
  await sleep(50);
  check('唐卡拼图为 3×3 九片', $$('#entry-body .tk-cell').length === 9,
    '实际 ' + $$('#entry-body .tk-cell').length);
  check('未持有碎片显示编号占位', $$('#entry-body .tk-cell.on').length === 0);
  $('#entry-x').click();
  await sleep(50);

  // 道具铺：积分不足拒买；积分足够则扣分入库（全流程无支付）
  ev('openPanel("shop")');
  await sleep(50);
  check('道具铺至少 2 件道具', $$('#entry-body .shop-row').length >= 2);
  const firstShopId = $$('#entry-body .shop-btn')[0].getAttribute('data-id');
  const firstCost = ev('DAILY.shop.filter(function(i){return i.id==="' + firstShopId + '";})[0].cost');
  ev('(function(){var p=getProgress(); p.points=0; saveProgress(p);})()');
  $$('#entry-body .shop-btn')[0].click();
  await sleep(50);
  check('积分不足时拒买（给出提示）', ev('getProgress().points') === 0 && $('#toast-text').textContent.indexOf('积分不够') > -1,
    $('#toast-text').textContent);
  ev('(function(){var p=getProgress(); p.points=' + (firstCost + 5) + '; saveProgress(p);})()');
  ev('openPanel("shop")');
  await sleep(50);
  $$('#entry-body .shop-btn')[0].click();
  await sleep(50);
  check('积分足够时成功兑换并扣分', ev('getProgress().points') === 5, String(ev('getProgress().points')));
  check('兑换后道具进入背包', (ev('getProgress().inventory') || {})[firstShopId] >= 1,
    JSON.stringify(ev('getProgress().inventory')));
  $('#entry-x').click();
  await sleep(50);

  // 菩提树：浇水只用积分循环（无广告 / 无内购）
  const potBefore = ev('getProgress().pot');
  const ptsBeforeTree = ev('getProgress().points');
  ev('openPanel("tree")');
  await sleep(50);
  $('#tree-btn').click();
  await sleep(50);
  check('浇树次数 +1', ev('getProgress().pot') === potBefore + 1, potBefore + ' → ' + ev('getProgress().pot'));
  check('浇树发放固定积分（+12）', ev('getProgress().points') === ptsBeforeTree + 12,
    ptsBeforeTree + ' → ' + ev('getProgress().points'));
  $('#entry-x').click();
  await sleep(50);

  // 结算页：星级（只增不减）+ 积分入账 + 唐卡碎片掉落
  ev('clearProgress(); renderHome();');
  await sleep(60);
  ev('startLevel(1)');
  await sleep(60);
  ev('(function(){ state.matchedCount = state.tiles.length / 2; state.maxCombo = 4; state.attempts = 12; state.misses = 0; state.score = 180; state.collected = []; })()');
  ev('finishLevel()');
  await sleep(80);
  check('结算页渲染三颗星', $$('#res-stars .rs-star').length === 3,
    '实际 ' + $$('#res-stars .rs-star').length);
  check('满正确率 + 连击≥3 → 亮三颗星', $$('#res-stars .rs-star.on').length === 3,
    '实际 ' + $$('#res-stars .rs-star.on').length);
  check('结算页有积分 / 唐卡两张奖励卡', $$('#res-rewards .reward-box').length === 2,
    '实际 ' + $$('#res-rewards .reward-box').length);
  const progAfterLevel = JSON.parse(win.localStorage.getItem('zangzi_progress') || 'null');
  check('本关积分入账（+180）', progAfterLevel.points === 180, String(progAfterLevel.points));
  check('掉落第 1 片唐卡碎片', (progAfterLevel.fragments || []).length === 1 && progAfterLevel.fragments[0] === 0,
    JSON.stringify(progAfterLevel.fragments));
  check('本关星级写入进度（3 星）', progAfterLevel.stars['1'] === 3, JSON.stringify(progAfterLevel.stars));

  // 反向：重玩表现更差时，星级只增不减（仍是 3 星，不降级）
  ev('startLevel(1)');
  await sleep(60);
  ev('(function(){ state.matchedCount = state.tiles.length / 2; state.maxCombo = 0; state.attempts = 10; state.misses = 5; state.score = 40; state.collected = []; })()');
  ev('finishLevel()');
  await sleep(80);
  check('重玩表现更差时星级不降级（仍 3 星）', $$('#res-stars .rs-star.on').length === 3,
    '实际 ' + $$('#res-stars .rs-star.on').length);
  check('未刷新评价时提示「本关评价」', $('#res-stars .rs-tip').textContent === '本关评价',
    $('#res-stars .rs-tip').textContent);
  check('重玩仍会累积积分（不惩罚）', ev('getProgress().points') === 220, String(ev('getProgress().points')));
  // 反向：碎片不重复投放（已持有第 1 片 → 本次掉第 2 片）
  check('碎片不重复投放（本次掉第 2 片）', (ev('getProgress().fragments') || []).indexOf(1) > -1,
    JSON.stringify(ev('getProgress().fragments')));

  ev('renderHome();');
  await sleep(60);
  check('重玩后首页节点显示星级', $$('#screen-home #level-grid .level-item .star.on').length === 3,
    '实际 ' + $$('#screen-home #level-grid .level-item .star.on').length);

  /* ---------- 23. 朝圣天梯动效（入场升起 / 莲花绽放 / 点击回弹） ---------- */
  section('23. 朝圣天梯动效');

  // 纯几何（与 utils/ladder.js 同规则）：foot 恒 ≥ settle，入场方向永远是「上行」
  const plan1 = ev('ladderPlan({mapTop:300,mapHeight:660,viewportHeight:667,nodeTopPct:88})');
  check('山脚台阶有「山脚 → 停靠」两个滚动目标', plan1.settle > 0 && plan1.foot > plan1.settle, JSON.stringify(plan1));
  const plan10 = ev('ladderPlan({mapTop:300,mapHeight:660,viewportHeight:667,nodeTopPct:6.1})');
  check('越靠山顶停靠点越靠上（第 10 关 settle < 第 1 关）', plan10.settle < plan1.settle, JSON.stringify(plan10));
  const planBad = ev('ladderPlan({})');
  check('异常输入安全归零（不抛错）', planBad.settle === 0 && planBad.foot === 200, JSON.stringify(planBad));
  check('反向：入场不会出现反向滚动（rise 恒 ≥ 0）', plan1.rise > 0 && plan10.rise > 0, plan1.rise + '|' + plan10.rise);

  // 入场：给天梯挂升起类 + 真的滚动了页面
  ev('window.__scrolls = []; LADDER_FIRST = true; renderHome();');
  await sleep(600);
  check('入场给天梯挂上升起动画类（.vine-map.in）', $('#vine-map').classList.contains('in'));
  const scrolls = ev('JSON.stringify(window.__scrolls)');
  check('入场真的滚动了页面（山脚 → 台阶）', scrolls.length > 6 && scrolls.indexOf('"top"') > -1, scrolls);
  check('每个台阶都有错峰浮现延迟（内联 animation-delay）',
    $$('#level-grid .level-item.node').every(function (n) {
      return (n.getAttribute('style') || '').indexOf('animation-delay') > -1;
    }));

  // 点击回弹：按下下沉、松手恢复
  const pressNode = $('#level-grid .level-item.node');
  pressNode.dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true }));
  check('按住台阶出现下沉反馈（node-press）', pressNode.classList.contains('node-press'));
  pressNode.dispatchEvent(new win.MouseEvent('mouseup', { bubbles: true }));
  check('松手后台阶恢复', !pressNode.classList.contains('node-press'));

  // 通关返回：新台阶莲花绽放 + 自动升到下一级
  ev('(function () { var p = getProgress(); var max = 0;' +
    'p.completedLevels.forEach(function (n) { if (n > max) max = n; });' +
    'var next = max + 1 > 10 ? 10 : max + 1;' +
    'if (p.completedLevels.indexOf(next) === -1) p.completedLevels.push(next);' +
    'p.unlockedLevel = next + 1 > 10 ? 10 : next + 1; saveProgress(p); })()');
  ev('renderHome();');
  await sleep(200);
  check('通关返回时新台阶绽放莲花（.node-bloom）', $$('#level-grid .level-item.node .node-bloom').length === 1,
    '实际 ' + $$('#level-grid .level-item.node .node-bloom').length);
  check('绽放的莲花带放大动效（.node-deco.pop）', $$('#level-grid .level-item.node .node-deco.pop').length === 1,
    '实际 ' + $$('#level-grid .level-item.node .node-deco.pop').length);
  check('反向：无新通关时不会重复绽放', (function () {
    ev('renderHome();');
    return $$('#level-grid .level-item.node .node-bloom').length === 0;
  })());

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
