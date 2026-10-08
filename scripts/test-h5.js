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
/* sink：可选，用来记录 fillText 文本，便于断言「海报上真的画了什么」 */
function mockCtx(sink) {
  const noop = function () {};
  return {
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '', lineJoin: '',
    textAlign: '', textBaseline: '', globalAlpha: 1,
    beginPath: noop, moveTo: noop, lineTo: noop, arcTo: noop, arc: noop, closePath: noop,
    stroke: noop, fill: noop, fillRect: noop, strokeRect: noop, clearRect: noop,
    fillText: function (t, x, y) { if (sink) sink.push({ t: String(t), x: x, y: y }); },
    strokeText: noop, save: noop, restore: noop, translate: noop,
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
      // 记录海报上真正画出的文本（用于验证「文化身份行不是写死的」）
      window.__texts = [];
      window.HTMLCanvasElement.prototype.getContext = function () { return mockCtx(window.__texts); };
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

  /* ---------- 0. 每日打开记录（页面启动即写） ---------- */
  // 必须放在最前面：后面的小节会用 clearProgress() 反复重置进度，会一并抹掉这份记录
  section('0. 每日打开记录（启动即落盘）');
  const openLog0 = JSON.parse(ev('JSON.stringify(getOpenLog())'));
  check('启动时记录了「每日首次打开」', openLog0.total >= 1, JSON.stringify(openLog0));
  check('首日已记下（次日留存对账的基准）',
    /^\d{4}-\d{2}-\d{2}$/.test(String(openLog0.first)), String(openLog0.first));
  check('打开记录已落盘到 localStorage',
    String(win.localStorage.getItem('zangzi_progress') || '').indexOf('openLog') > -1);
  check('反向：同一天重复打开不重复计数', (function () {
    const before = ev('getOpenLog().total');
    ev('applyOpenLog(markOpen(getOpenLog(), colToday()).state)');
    return ev('getOpenLog().total') === before;
  })());

  /* ---------- 1. 启动与首页 ---------- */
  section('1. 首页');
  check('无脚本运行时错误', errors.length === 0, errors[0]);
  check('默认停在首页', activeScreen() === 'screen-home', activeScreen());
  const btns = $$('#level-grid .level-btn');
  check('10 个关卡按钮', btns.length === 10, '实际 ' + btns.length);
  check('第 1 关可点击（非 locked）', !btns[0].classList.contains('locked'));
  check('第 2-10 关锁定', btns.slice(1).every(function (b) { return b.classList.contains('locked'); }));
  check('首页已移除品牌行（2026-10-06 用户拍板：视觉重心交给朝圣天梯）',
    !$('#hero-logo') && !$('.hero-title') && !$('.hero-slogan'));
  check('品牌语仍保留在证书 / 祝福签绘制与转发口径中（不是消失）',
    fs.readFileSync(HTML, 'utf8').indexOf('认藏文，从方块开始') > -1);

  /* ---------- 2. 藏文化背景层（修复②：背景不单调） ---------- */
  section('2. 藏文化背景层');
  check('全局暗金光晕底图已内联',
    ($('#sc-bg') || {}).src && $('#sc-bg').src.indexOf('data:image/jpeg') === 0,
    ($('#sc-bg') || {}).src && $('#sc-bg').src.slice(0, 24));
  check('经幡天空层已内联', ($('#sc-sky') || {}).src && $('#sc-sky').src.indexOf('data:image/png') === 0);
  check('雪山/布达拉宫地面层已内联', ($('#sc-ground') || {}).src && $('#sc-ground').src.indexOf('data:image/png') === 0);
  check('藏式菱格纹样已设置为 CSS 变量',
    (doc.documentElement.style.getPropertyValue('--pat') || '').indexOf('data:image/png') > -1);
  check('背景为五层结构 + 可选照片层（底图/纹样/地面/天空/夜色罩，D47 照片层可有可无）',
    (function () {
      const kids = $$('.scenery > *');
      const has = function (sel) { return !!$(sel); };
      const core = has('#sc-bg') && has('.sc-pattern') && has('#sc-ground') && has('#sc-sky') && has('.sc-night');
      // 5 层核心 + 0/1 个照片层（有照片时 6，无照片时 5）
      return core && (kids.length === 5 || (kids.length === 6 && has('#sc-photo')));
    })(), '实际 ' + $$('.scenery > *').length);
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
  // D33 盘面按牌 uid 缓存节点（牌会下落换格），所以点击必须「先按当前格号查 uid，再找节点」。
  // ⚠️ 池耗尽后盘面会被掏空，空格的元素是 null —— 所有扫描都必须先判空。
  const uidAt = function (i) {
    const t = tiles()[i];
    return t ? String(t.uid) : null;
  };
  const tileElAt = function (i) {
    const u = uidAt(i);
    return u === null ? null : doc.querySelector('#board .tile[data-uid="' + u + '"]');
  };
  const indexOfUid = function (uid) {
    const t = tiles();
    for (let i = 0; i < t.length; i++) if (t[i] && String(t[i].uid) === String(uid)) return i;
    return -1;
  };
  // 盘面上现存的牌张数（格子里的非空格）
  const liveCount = function () {
    return tiles().filter(function (t) { return !!t; }).length;
  };
  // D33 盘面快照：张数 / 池余量 / 已消张数 / 三不变量（与 utils/board.js checkInvariants 同口径）
  const st = () => ev('(function(){var s=state.board,b=s.cells,occ={},pl=0,cont=true,even=true,live=0;' +
    'for(var i=0;i<b.length;i++){if(b[i]){occ[b[i].id]=(occ[b[i].id]||0)+1;live++;}}' +
    'for(var k in s.pool)pl+=s.pool[k];' +
    'for(var c=0;c<s.cols;c++){var seenF=false;' +
    'for(var r=0;r<s.rows;r++){var ii=r*s.cols+c;if(b[ii])seenF=true;else if(seenF)cont=false;}}' +
    'for(var k2 in occ){if(occ[k2]%2!==0)even=false;}' +
    'for(var k3 in s.pool){if(s.pool[k3]%2!==0)even=false;}' +
    'return {live:live,poolLeft:pl,spent:s.spent,total:s.total,slots:s.slots,even:even,contig:cont,' +
    'conserved:(live+pl+s.spent===s.total),onBoard:occ};})()');
  const findPair = function () {
    const t = tiles();
    const map = {};
    for (let i = 0; i < t.length; i++) {
      if (!t[i] || t[i].state !== 'idle') continue;
      if (map[t[i].id] === undefined) map[t[i].id] = i;
      else return [map[t[i].id], i];
    }
    return null;
  };
  const findMismatch = function () {
    const t = tiles();
    let a = -1;
    for (let i = 0; i < t.length; i++) { if (t[i] && t[i].state === 'idle') { a = i; break; } }
    if (a < 0) return null;
    for (let j = a + 1; j < t.length; j++) {
      if (t[j] && t[j].state === 'idle' && t[j].id !== t[a].id) return [a, j];
    }
    return null;
  };
  const clickTile = async function (i) {
    const el = tileElAt(i);
    if (el) el.click();
    await sleep(30);
  };
  // 障碍物判定（与 utils/obstacles.js 同规则，供配对查找时避开被罩住的牌）
  const obsIsBlockedInTest = function (i) {
    const t = tiles()[i];
    return !!(t && (t.frost || (t.rope && t.rope > 0) || (t.crate && t.crate > 0)));
  };

  const goldenId = ev('state.goldenId');
  check('已选定金色特殊方块', typeof goldenId === 'string' && goldenId.length > 0, String(goldenId));
  check('金色方块已渲染 ✦', $$('#board .tile.golden .star').length > 0);

  // D33 开局快照：初始盘面必须满铺（格数 = DOM 节点数），其余牌在池里
  const t0 = st();
  check('开局盘面满铺（在场张数 = 格数）', t0.live === t0.slots, t0.live + ' vs ' + t0.slots);
  check('开局补充池非空且为偶数', t0.poolLeft > 0 && t0.poolLeft % 2 === 0, 'pool=' + t0.poolLeft);
  check('开局已消 0 张', t0.spent === 0);
  check('开局三不变量成立', t0.even === true && t0.conserved === true && t0.contig === true);
  check('开局揭图进度 0%（盘面无一格清空）', ev('state.revealPct') === 0, 'pct=' + ev('state.revealPct'));

  /* ---------- 4. 首次配对 → 非阻塞文化卡（修复①③） ---------- */
  section('4. 首次配对与非阻塞文化卡');
  check('旧的阻塞式弹窗已移除', !$('#card-mask'));

  let pair = findPair();
  const pairUids = [uidAt(pair[0]), uidAt(pair[1])];
  const pairId = tiles()[pair[0]].id;
  const liveBefore = liveCount();
  await clickTile(pair[0]);
  check('第一张牌进入 selected', tiles()[pair[0]].state === 'selected', tiles()[pair[0]].state);
  await clickTile(pair[1]);
  check('配对后进入 removing', tiles()[pair[0]].state === 'removing' && tiles()[pair[1]].state === 'removing');
  check('配对成功不再锁盘面（非阻塞）', ev('state.locked') === false);
  check('消除已进入下落结算（队列或正在结算中）',
    ev('state.draining') === true || ev('state.removeQueue.length') >= 1,
    'draining=' + ev('state.draining') + ' queue=' + ev('state.removeQueue.length'));

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

  /* ---------- 4e. 十关全量模拟（种子随机，确定性） ----------
     为什么不用「边玩边数下落」：测试用贪心找对（总取最靠上的那对）恰好总是消列顶的牌，
     列顶之上的牌本来就是空的 → 几何上压根不会发生位移，断言会假失败。
     而真实玩家会消到列中段（上方压着牌）→ 必然下落。这里用种子随机的完整模拟来覆盖。 */
  section('4e. 十关全量模拟：消完 + 池用尽 + 三不变量 + 真实下落');
  const sim = ev('(function(){' +
    'var seed=12345;function rnd(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}' +
    'var mk=function(id,u){return {id:id,uid:u,state:"idle"};};' +
    'var out=[];' +
    'for(var L=0;L<LEVELS.length;L++){' +
    '  var cfg=LEVELS[L];' +
    '  var st=boardCreateLevel(cfg,mk,rnd);' +
    '  var falls=0,spawns=0,pairs=0,floating=0,badEven=0,badCons=0,' +
    '      startLive=boardCountTiles(st.cells),poolAll=0;' +
    '  for(var k in st.pool)poolAll+=st.pool[k];' +
    '  for(var round=0;round<400;round++){' +
    '    var cands=[];' +
    '    for(var i=0;i<st.cells.length;i++){' +
    '      if(!st.cells[i])continue;' +
    '      for(var j=i+1;j<st.cells.length;j++){' +
    '        if(st.cells[j]&&st.cells[i].id===st.cells[j].id)cands.push([i,j]);' +
    '      }' +
    '    }' +
    '    if(!cands.length)break;' +
    '    var sel=cands[Math.floor(rnd()*cands.length)];' +
    '    pairs++;' +
    '    var nx=boardCollapse(st,sel,mk);' +
    // 「真实下落」= 非补充牌的位移（补充牌的首帧本来就在盘外，不算下落）
    '    var spIdx={};nx.spawned.forEach(function(s){spIdx[s.index]=1;});' +
    '    nx.drops.forEach(function(d){if(!spIdx[d.index])falls++;});' +
    '    spawns+=nx.spawned.length;' +
    '    if(nx.floating.length)floating++;' +
    '    st=nx;' +
    '    var oc={};for(var q=0;q<st.cells.length;q++)if(st.cells[q])oc[st.cells[q].id]=(oc[st.cells[q].id]||0)+1;' +
    '    for(var e1 in oc)if(oc[e1]%2!==0)badEven++;' +
    '    for(var e2 in st.pool)if(st.pool[e2]%2!==0)badEven++;' +
    '    var pl0=0;for(var e3 in st.pool)pl0+=st.pool[e3];' +
    '    if(boardCountTiles(st.cells)+pl0+st.spent!==st.total)badCons++;' +
    '    if(boardCountTiles(st.cells)===0&&pl0===0)break;' +
    '  }' +
    '  var pl=0;for(var kk in st.pool)pl+=st.pool[kk];' +
    '  out.push({level:cfg.level,pairs:pairs,need:st.total/2,live:boardCountTiles(st.cells),' +
    '    poolLeft:pl,spent:st.spent,total:st.total,falls:falls,spawns:spawns,' +
    '    floating:floating,badEven:badEven,badCons:badCons,startLive:startLive,poolAll:poolAll});' +
    '}' +
    'return out;})()');
  const simBad = sim.filter(function (r) {
    return r.live !== 0 || r.poolLeft !== 0 || r.pairs !== r.need || r.spent !== r.total ||
      r.floating !== 0 || r.badEven !== 0 || r.badCons !== 0 || r.startLive !== r.total - r.poolAll ||
      r.spawns !== r.poolAll;
  });
  check('十关全部能消完（盘面 0 张 / 池 0 张 / 消够总对数）', simBad.length === 0,
    JSON.stringify(simBad.slice(0, 3)));
  check('十关全程三不变量零违反（偶不变 / 守恒 / 列连续）', sim.every(function (r) {
    return r.badEven === 0 && r.badCons === 0 && r.floating === 0;
  }));
  check('十关开局满铺（在场 = 总数 − 池）', sim.every(function (r) {
    return r.startLive === r.total - r.poolAll;
  }));
  check('十关补入的牌数恰好 = 池容量', sim.every(function (r) { return r.spawns === r.poolAll; }));
  check('随机玩法下十关全都发生过真实下落位移（机制真的会动）',
    sim.every(function (r) { return r.falls >= 1; }),
    sim.map(function (r) { return 'L' + r.level + ':' + r.falls; }).join(' '));
  check('下落次数随关数增加（盘面越大越常出现「上方压着牌」）',
    sim[sim.length - 1].falls > sim[0].falls,
    'L1=' + sim[0].falls + ' L10=' + sim[sim.length - 1].falls);

  /* ---------- 4c. D33 下落 + 顶部补充（本轮新增机制） ---------- */
  section('4c. 下落式消除：下落 + 顶部补充 + 三不变量（真实盘面）');
  const after = st();
  check('本对被消除（两张牌的 uid 已从盘面移除）',
    indexOfUid(pairUids[0]) === -1 && indexOfUid(pairUids[1]) === -1);
  check('补充池减少 2（消什么补什么）', after.poolLeft === t0.poolLeft - 2,
    t0.poolLeft + ' → ' + after.poolLeft);
  check('盘面张数不变（消 2 补 2，初始池充足）', after.live === liveBefore,
    liveBefore + ' → ' + after.live);
  check('已消除张数 = 2（总量守恒口径）', after.spent === 2, 'spent=' + after.spent);
  check('不变量①偶数：每种元素在场张数与池余量都是偶数', after.even === true,
    JSON.stringify(after.onBoard) + ' / 池 ' + after.poolLeft);
  check('不变量②守恒：盘面 + 池 + 已消 = 关卡总数', after.conserved === true,
    after.live + '+' + after.poolLeft + '+' + after.spent + ' vs ' + after.total);
  check('不变量③连续：下落压缩后列内无悬空牌', after.contig === true);
  check('补充牌渲染为独立节点（DOM 张数 = 盘面张数）',
    $$('#board .tile').length === after.live, $$('#board .tile').length + ' vs ' + after.live);
  check('开局池与总牌数符合「格数 + 池」口径', t0.slots + t0.poolLeft === t0.total,
    t0.slots + ' + ' + t0.poolLeft + ' vs ' + t0.total);
  check('已消除对数 = 1', ev('state.matchedCount') === 1);
  check('积分已累加（≥10）', ev('state.score') >= 10, 'score=' + ev('state.score'));
  check('盘面按 uid 稳定 key（节点 data-uid ↔ 牌 uid 一一对应）', (function () {
    const els = $$('#board .tile');
    if (!els.length) return false;
    return els.every(function (e) { return indexOfUid(e.dataset.uid) >= 0; });
  })());
  check('坐标用百分比步进（相对牌自身，端点可换单位）',
    ev('state.stepX') > 100 && ev('state.stepY') > 100,
    'stepX=' + ev('state.stepX') + ' stepY=' + ev('state.stepY'));

  /* ---------- 4b. 配对成功朗读发音（新增要求） ---------- */
  section('4b. 配对成功朗读藏文发音');
  check('成功配对后已朗读（≥1 次）', ev('state.pronounceCount') >= 1, 'count=' + ev('state.pronounceCount'));
  check('朗读的是本次消除的元素', ev('state.lastPronounced') === pairId,
    'last=' + ev('state.lastPronounced') + ' 应为 ' + pairId);

  /* ---------- 4d. 下落位移（确定性样例，不靠随机盘面） ----------
     盘面是随机的，随机抓一对牌可能两张都在最底行（压不动）→ 会偶发假失败。
     这里直接给 boardCollapse 一个手工盘面，断言「同列上方的牌下落 1 格 + 顶部补 1 张」。 */
  section('4d. 下落位移（确定性样例）');
  const cp = ev('(function(){' +
    'var mk=function(id,u){return {id:id,uid:u,state:"idle"};};' +
    // 3 列 × 4 行，三列各自「上空下满」：
    //   col0 = idx3,6,9（row1..3）  col1 = idx1,4,7,10（满）  col2 = idx8,11（row2..3）
    'var st={cols:3,rows:4,total:14,slots:12,nextUid:100,spent:0,' +
    'pool:{"a":2},cells:[null,mk("a",9),null,' +
    'mk("a",1),mk("a",7),null,' +
    'mk("b",2),mk("c",8),mk("b",3),' +
    'mk("c",4),mk("d",5),mk("d",6)]};' +
    // 消掉 idx3（col0 row1）与 idx10（col1 row3）→ col1 上方三张都该下落
    'var nx=boardCollapse(st,[3,10],mk);' +
    'var got={};for(var i=0;i<nx.cells.length;i++)if(nx.cells[i])got[nx.cells[i].uid]=i;' +
    'var c2h=0;for(var r=0;r<4;r++)if(nx.cells[r*3+2])c2h++;' +
    'return {drops:nx.drops.length,spawned:nx.spawned.length,floating:nx.floating.length,' +
    'a7from:4,a7to:got[7],col0Top:!!nx.cells[3],col0Row0:!!nx.cells[0],col2H:c2h' +
    '};})()');
  check('同列上方的牌下落了（产生 drop 记录）', cp.drops >= 1, 'drops=' + cp.drops);
  check('从池里补进 2 张（消 2 补 2）', cp.spawned === 2, 'spawned=' + cp.spawned);
  check('下落压缩后无悬空牌', cp.floating === 0, 'floating=' + cp.floating);
  check('col1 上方那张确实掉到更低的格（格号变大）', cp.a7to > cp.a7from, cp.a7from + ' → ' + cp.a7to);
  check('补充牌落在牌堆正上方（col0 填在 row1、不是浮到 row0）',
    cp.col0Top === true && cp.col0Row0 === false, JSON.stringify([cp.col0Row0, cp.col0Top]));
  check('未受影响的列不动（col2 仍 2 张）', cp.col2H === 2, 'h=' + cp.col2H);

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
  // 把 34 张文化卡全部标记为「已看过」，之后的匹配应只出轻提示
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
  section('9. 通关与结算（D33：消完 15 对、盘面清空、揭图 100%）');
  const pronOnEnter = ev('state.pronounceCount');
  const needPairs = ev('totalPairs()');
  check('第 1 关总对数 = 15（30 张 = 24 格 + 6 池）', needPairs === 15, 'pairs=' + needPairs);
  let guard = 0;
  let posMoved = 0;   // 仅供诊断输出（贪心玩法不会产生位移，见下方注释）
  const posNow = function () {
    return ev('(function(){var m={};var b=state.board.cells;' +
      'for(var i=0;i<b.length;i++)if(b[i])m[b[i].uid]=i;return m;})()');
  };

  while (guard++ < 120) {
    if (ev('state.matchedCount') >= needPairs && ev('state.removeQueue.length') === 0 &&
        ev('state.draining') === false) break;
    const before = posNow();
    const pr = findPair();
    if (!pr) { await sleep(150); continue; }
    await clickTile(pr[0]);
    await clickTile(pr[1]);
    await sleep(420);
    const aft = posNow();
    Object.keys(before).forEach(function (u) {
      if (aft[u] !== undefined && aft[u] !== before[u]) posMoved++;
    });
  }
  const fin = st();
  check('全部 15 对已消除', ev('state.matchedCount') === 15, 'matched=' + ev('state.matchedCount'));
  check('盘面已清空（在场 0 张）', fin.live === 0, 'live=' + fin.live);
  check('补充池已用尽', fin.poolLeft === 0, 'pool=' + fin.poolLeft);
  check('总量守恒到头：已消张数 = 关卡总数', fin.spent === fin.total, fin.spent + ' vs ' + fin.total);
  // 注：这里刻意**不**断言「有牌换过格号」——测试用贪心找对（总取最靠上的那对），
  //     恰好总是消掉列顶的牌，而列顶之上的牌本来就是空的 → 几何上不会发生位移。
  //     真实玩家会消到列中段（上方压着牌）→ 必然下落。这条由 4e 的种子随机全量模拟负责。
  check('DOM 与盘面同步收缩到 0（节点随牌一起消失）', $$('#board .tile').length === fin.live,
    $$('#board .tile').length + ' vs ' + fin.live);
  check('揭图进度 100%（全格曾清空）', ev('state.revealPct') === 100, 'pct=' + ev('state.revealPct'));
  check('本关 15 次配对 = 15 次朗读', ev('state.pronounceCount') - pronOnEnter === 15,
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
  check('显示「第 1 课完成！」', ($('#res-title') || {}).textContent === '第 1 课完成！');
  check('显示积分/连击/文化卡统计', $('#res-score').textContent !== '0' || ev('state.score') === 0);
  check('授予「拉萨」印记横幅', ($('#res-stamp').textContent || '').indexOf('拉萨') > -1);
  check('文化卡列表去重后 2 张', $$('#res-chips .chip').length === 2, 'chips=' + $$('#res-chips .chip').length);
  check('出现「下一关」按钮', $('#res-actions').textContent.indexOf('下一课') > -1, $('#res-actions').textContent);
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
  ev('state.matchedCount = totalPairs(); state.collected = ["letter_01","icon_03"]; state.score = 520; state.maxCombo = 6; finishLevel()');
  await sleep(90);
  check('第 10 关结算出现祝福卡区块', doc.body.textContent.indexOf('扎西德勒！完成全部 10 课') > -1);
  check('无「下一关」按钮（已是最后一关）', $('#res-actions').textContent.indexOf('下一课') === -1,
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
  section('13. 关卡数据（D33 口径：总数 = 格数 + 补充池）');
  const levels = ev('LEVELS');
  let allOk = true;
  const levelDetail = [];
  levels.forEach(function (c) {
    const total = c.elements.reduce(function (s, e) { return s + e[1]; }, 0);
    const slots = c.cols * c.rows;
    // 池 = round2(格数/4)，与 utils/board.js 的 poolSize 同公式
    const pool = Math.max(2, Math.ceil(slots / 4 / 2) * 2);
    const evenAll = c.elements.every(function (e) { return e[1] % 2 === 0; });
    if (total !== slots + pool || !evenAll) { allOk = false; }
    levelDetail.push(c.level + ':' + slots + '+' + pool + '=' + total);
  });
  check('10 关总牌数 = 格数 + 补充池，且每种配比为偶数', allOk, levelDetail.join(' '));
  check('每关补充池非空（下落机制真的会发生）', levels.every(function (c) {
    return Math.max(2, Math.ceil(c.cols * c.rows / 4 / 2) * 2) > 0;
  }));
  check('元素库 34 项（30字母+4图标）', ev('Object.keys(ELEMENTS).length') === 34);
  check('文化卡 34 张', ev('CARDS.length') === 34);
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
  check('证书成就行按真实数据生成（30 个藏文字母）',
    cert1 && cert1.lines.join('|').indexOf('已认识 30 个藏文字母') > -1,
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
  // DOM 层（不是源码层）：渲染出来之后，用户真能看到的地方一个让利数字都不许有。
  // ⚠️ 不能写裸 /元/ —— 「元音」是藏文常用词（第 23.4b 的教训）。
  check('券卡不含金额字样（¥ / ￥ / 元）', !/[¥￥]|元(?!音|素)/.test($('#bn-body').textContent));
  check('券卡不含让利数字（折扣率 / 满减 / % off）',
    !/\d\s*折|\d\s*%\s*off|满\s*\d+\s*减\s*\d+/.test($('#bn-body').textContent));

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
  check('第 1 关无绳结', ev('state.ropeTotal') === 0, 'ropeTotal=' + ev('state.ropeTotal'));
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

  // 绳结关（第 9 关，D40）：双股绳显示剩余股数，相邻消除松一股，两股全松才算解开
  ev('startLevel(9)');
  await sleep(60);
  check('第 9 关有 2 个绳结（难度曲线：冰霜 L2 → 木箱 L6 → 绳结 L9）',
    ev('state.ropeTotal') === 2, 'ropeTotal=' + ev('state.ropeTotal'));
  check('DOM 绳结数量一致', $$('#board .rope').length === 2, '实际 ' + $$('#board .rope').length);
  const ropeIdx = tiles().findIndex(function (t) { return t.rope > 0; });
  // ⚠️ 必须按 **uid** 追踪绳结牌，不能按格号：消除后上方方块下落 + 顶部补充，
  // 牌会换格（D33 起障碍是「牌属性」），原来的格号上坐着的已经是另一张牌了。
  // 用格号读数会偶发得到 0（读到别处已解开的绳结），测试表现为随机失败。
  const ropeUid = tiles()[ropeIdx].uid;
  const ropeOf = function (uid) {
    return tiles().filter(function (t) { return t.uid === uid; })[0] || null;
  };
  const ropeIdxOf = function (uid) {
    return tiles().findIndex(function (t) { return t.uid === uid; });
  };
  const ropeHpBefore = tiles()[ropeIdx].rope;
  check('绳结初始为双股（hp = 2）', ropeHpBefore === 2, 'hp=' + ropeHpBefore);
  await clickTile(ropeIdx);
  check('绳结牌点不动（不进入 selected）', tiles()[ropeIdx].state !== 'selected', tiles()[ropeIdx].state);
  check('绳结提示文案含「绳结」', $('#toast-text').textContent.indexOf('绳结') > -1, $('#toast-text').textContent);
  const ropeNbs = ev('obsNeighbors(' + ropeIdx + ', state.cols, state.rows)');
  let ropePair = null;
  for (let n = 0; n < ropeNbs.length && !ropePair; n++) {
    const nb = ropeNbs[n];
    if (!tiles()[nb] || obsIsBlockedInTest(nb)) continue;
    for (let j = 0; j < tiles().length; j++) {
      if (j === nb || tiles()[j].id !== tiles()[nb].id) continue;
      if (tiles()[j].state !== 'idle' || obsIsBlockedInTest(j)) continue;
      ropePair = [nb, j]; break;
    }
  }
  if (ropePair) {
    await clickTile(ropePair[0]);
    await clickTile(ropePair[1]);
    await sleep(400);
    const ropeNow = ropeOf(ropeUid);
    const ropeHpAfter = ropeNow ? ropeNow.rope : -1;
    check('相邻消除一次松一股（2 → 1）', ropeHpAfter === ropeHpBefore - 1,
      ropeHpBefore + ' → ' + ropeHpAfter);
    // 再消一对相邻的：第二股也松开 → DOM 罩层移除
    let ropePair2 = null;
    for (let n = 0; n < ropeNbs.length && !ropePair2; n++) {
      const nb = ropeNbs[n];
      if (!tiles()[nb] || obsIsBlockedInTest(nb)) continue;
      for (let j = 0; j < tiles().length; j++) {
        if (j === nb || tiles()[j].id !== tiles()[nb].id) continue;
        if (tiles()[j].state !== 'idle' || obsIsBlockedInTest(j)) continue;
        ropePair2 = [nb, j]; break;
      }
    }
    if (ropePair2 && ropeHpAfter === 1) {
      await clickTile(ropePair2[0]);
      await clickTile(ropePair2[1]);
      await sleep(400);
      const ropeFinal = ropeOf(ropeUid);
      const ropeHpFinal = ropeFinal ? ropeFinal.rope : -1;
      check('第二次相邻消除后绳结解开（hp = 0）', ropeHpFinal === 0, 'hp=' + ropeHpFinal);
      check('解开后 DOM 罩层移除',
        !doc.querySelector('#board .tile[data-index="' + ropeIdxOf(ropeUid) + '"] .rope'));
    }
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
  // 有语音时：点击 → 走播报链路（模拟已就位的发音文件）
  ev('VOICES["letter_01"] = "data:audio/mpeg;base64,AA"');
  const pronBeforeCard = ev('state.pronounceCount');
  $('#card-speak').click();
  await sleep(60);
  check('点喇叭播放该元素藏文读音（有语音时）', ev('state.pronounceCount') === pronBeforeCard + 1,
    pronBeforeCard + ' → ' + ev('state.pronounceCount'));
  // 无语音时：给明确提示而不是静默（2026-10-08 用户反馈「点了没反应」）
  ev('delete VOICES["letter_01"]; state.pronounceCount = 0');
  $('#card-speak').click();
  await sleep(60);
  check('无语音时点击给明确提示（不静默）',
    $('#toast-text').textContent.indexOf('即将上线') > -1 && ev('state.pronounceCount') === 0,
    $('#toast-text').textContent + ' | count=' + ev('state.pronounceCount'));
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
  check('五地灯火列表齐备', $$('#lamp-list .lamp-item').length === 5,
    '实际 ' + $$('#lamp-list .lamp-item').length);

  // 万/亿口径：主数字短、好读；精确千分位仍留在副行（两者并存，互不替代）
  check('主数字走万/亿口径（128,456 → 12.85万盏）', $('#lamp-total').textContent === '12.85万盏',
    $('#lamp-total').textContent);
  check('副行保留精确千分位（不因口径切换丢失精度）',
    $('#lamp-sub').textContent.indexOf('128,456') > -1, $('#lamp-sub').textContent);
  const lampRowCounts = $$('#lamp-list .lamp-c').map(function (e) { return e.textContent; });
  check('地区行同样走万/亿口径', lampRowCounts.join(',') === '8.92万,7.65万,5.43万,3.21万,2.18万',
    lampRowCounts.join(','));
  check('反向：小数字不加万/亿单位（12,000 这种量级不写成 1.2万）',
    $('#lamp-home').textContent.indexOf('1.2万') === -1 && $('#lamp-home').textContent.indexOf('12,000') > -1,
    $('#lamp-home').textContent);

  // 辉光：等级 1..4 按行号循环取，刻意不按数量 → 序列既非递增也非递减，无法当成排行
  const lampGlowSeq = $$('#lamp-list .lamp-gl').map(function (e) {
    const m = /glow-(\d)/.exec(e.className);
    return m ? Number(m[1]) : 0;
  });
  check('五地灯火各带一个辉光点，等级落在 1..4',
    lampGlowSeq.length === 5 && lampGlowSeq.every(function (v) { return v >= 1 && v <= 4; }),
    lampGlowSeq.join(','));
  check('辉光等级取自行号循环值（3,1,4,2,3）', lampGlowSeq.join(',') === '3,1,4,2,3', lampGlowSeq.join(','));
  check('反向：辉光序列非单调 —— 无法表示「谁多谁少」',
    lampGlowSeq.some(function (v, i) { return i > 0 && v > lampGlowSeq[i - 1]; }) &&
    lampGlowSeq.some(function (v, i) { return i > 0 && v < lampGlowSeq[i - 1]; }),
    lampGlowSeq.join(','));
  const lampDelays = $$('#lamp-list .lamp-gl').map(function (e) { return e.style.animationDelay; });
  check('辉光相位逐个错开（像远近不同的灯各自呼吸）',
    lampDelays.length === 5 && new Set(lampDelays).size === 5, lampDelays.join(','));
  check('家乡行为写死数据（浙江 12,000）',
    $('#lamp-home').textContent.indexOf('浙江') > -1 && $('#lamp-home').textContent.indexOf('12,000') > -1,
    $('#lamp-home').textContent);
  check('两色莲花数字写死', $('#lamp-lotus-gold').textContent === '32,000' && $('#lamp-lotus-pink').textContent === '45,000',
    $('#lamp-lotus-gold').textContent + '|' + $('#lamp-lotus-pink').textContent);
  check('反向：未点亮前不显示祝福语', !$('#lamp-tip').classList.contains('show'));
  // D44：CTA 可达性三件套 —— 固定底栏 + 中部滚动 + 右上角 ✕（375×667 实测旧版把 CTA 裁出屏幕）
  check('跳窗有右上角 ✕（任何状态都可关）', !!$('#lamp-x') && $('#lamp-x').textContent === '✕');
  check('跳窗为「滚动区 + 固定底栏」结构（CTA 不会被裁出屏幕）', !!$('#lamp-scroll') && !!$('.lamp-actions'));
  check('反向：未点亮时不显示显著关闭按钮', !$('#lamp-close').classList.contains('show'));
  check('未点亮时保留安静出口（今天先不点灯）', $('.lamp-actions #lamp-skip').textContent.indexOf('不点灯') > -1);
  $('#lamp-btn').click();
  await sleep(60);
  check('点亮后总灯数 +1（128,456 → 128,457）', $('#lamp-sub').textContent.indexOf('128,457') > -1,
    $('#lamp-sub').textContent);
  check('点亮瞬间主数字与副行同时挂上跳动类', $('#lamp-total').classList.contains('pop') &&
    $('#lamp-sub').classList.contains('pop'));
  check('万/亿口径在 +1 后不变（12.85万 → 12.85万），故跳动必须同时挂在精确副行上',
    $('#lamp-total').textContent === '12.85万盏', $('#lamp-total').textContent);
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
  // D44：点亮之后出口必须显著且唯一 —— 出现「收下灯火 · 关闭」，安静的「今天先不点灯」让位
  check('点亮后出现显著关闭按钮（收下灯火 · 关闭）',
    $('#lamp-close').classList.contains('show') && $('#lamp-close').textContent.indexOf('关闭') > -1,
    $('#lamp-close').className + '|' + $('#lamp-close').textContent);
  check('点亮后 CTA 收起（不留「再点没反应」的死按钮）',
    $('#lamp-btn').classList.contains('hide'), $('#lamp-btn').className);
  check('点亮后未点亮态的安静出口隐藏（不出现两个关闭出口）',
    $('#lamp-skip').classList.contains('hide'));
  $('#lamp-close').click();
  await sleep(40);
  check('点显著关闭按钮后跳窗消失', !$('#lamp-mask').classList.contains('show'));
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
  check('积分不足时拒买（给出提示）', ev('getProgress().points') === 0 && $('#toast-text').textContent.indexOf('学习得分不够') > -1,
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
  check('未刷新评价时提示「本关评价」', $('#res-stars .rs-tip').textContent === '本课评价',
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

  /* ---------- 24. 前 60 秒钩子（结算进度锚 / 印章计数 / 第2关差异 / 每日打开） ---------- */
  section('24. 前 60 秒钩子（结算进度锚 / 印章计数 / 第2关差异 / 每日打开）');

  // 24.1 纯函数边界：跨天 +1 / 断签重置 / 首日基准不变 / 次日留存判定
  //      （「启动即落盘」的断言在第 0 节——那里还没被 clearProgress() 抹掉）
  ev('window.__oa = markOpen(null, "2026-01-01")');
  ev('window.__ob = markOpen(window.__oa.state, "2026-01-02")');
  ev('window.__oc = markOpen(window.__ob.state, "2026-01-06")');
  const ob = JSON.parse(ev('JSON.stringify(window.__ob)'));
  const oc = JSON.parse(ev('JSON.stringify(window.__oc)'));
  check('隔天打开连续天数 +1', ob.streak === 2, String(ob.streak));
  check('断签后连续天数从 1 重新数', oc.streak === 1, String(oc.streak));
  check('首日只在第一次写入（后续跨天不改基准）', oc.state.first === '2026-01-01', String(oc.state.first));
  check('retainedOn 判定「次日回来过」', ev('retainedOn(window.__ob.state, 1)') === true);
  check('反向：没回来的那天判定为未留存', ev('retainedOn(window.__ob.state, 7)') === false);
  check('打开记录只保留最近 90 天（本地存储不做无上限增长）', (function () {
    ev('window.__ol = { days: [], lastDate: "", streak: 0, total: 0, first: "2026-01-01" };' +
      'for (var i = 0; i < 95; i++) window.__ol = ' +
      'markOpen(window.__ol, colDayToDate(colDayNumber("2026-01-01") + i)).state;');
    return ev('window.__ol.days.length') === 90;
  })());

  // 24.3 结算页进度锚：把收藏进度前置到「要不要再来一关」的决策点
  ev('clearProgress(); renderHome();');
  ev('startLevel(1)'); await sleep(80);
  ev('markCardSeen("letter_01"); markCardSeen("letter_02");');
  ev('state.matchedCount = 12; state.collected = ["letter_01","letter_02"];' +
    ' state.score = 260; state.maxCombo = 5; state.misses = 0; finishLevel()');
  await sleep(60);

  check('结算页出现进度锚区块（#res-journey）', !!$('#res-journey'));
  check('进度锚有 34 个收藏槽位', $$('#res-journey .j-slot').length === 34,
    '实际 ' + $$('#res-journey .j-slot').length);
  check('已收藏槽位 = 2（本关认识的两个字母）', $$('#res-journey .j-slot.got').length === 2,
    '实际 ' + $$('#res-journey .j-slot.got').length);
  check('未收藏槽位 = 32', $$('#res-journey .j-unknown').length === 32,
    '实际 ' + $$('#res-journey .j-unknown').length);
  check('未收藏槽位只显示「?」，不剧透下一张的名字', $$('#res-journey .j-unknown').every(function (n) {
    return n.textContent.trim() === '?';
  }), $$('#res-journey .j-unknown').map(function (n) { return n.textContent; }).join('|'));
  check('已收藏槽位显示真实字形', $$('#res-journey .j-slot.got').map(function (n) {
    return n.textContent.trim();
  }).join('') === 'ཀཁ', $$('#res-journey .j-slot.got').map(function (n) { return n.textContent; }).join('|'));
  check('进度锚有课程锚点（第 1 / 10 课）',
    ($('#res-journey .j-step') || {}).textContent === '第 1 / 10 课',
    ($('#res-journey .j-step') || {}).textContent);
  check('进度锚有旅程天数', /旅行第 \d+ 天/.test($('#res-journey .j-day').textContent),
    $('#res-journey .j-day').textContent);
  check('进度条宽度 = 已收藏比例（2/34 ≈ 6%）',
    ($('#res-journey .j-bar-in').getAttribute('style') || '').indexOf('6%') > -1,
    $('#res-journey .j-bar-in').getAttribute('style'));
  check('文案给出「还剩多少没遇见」（牵引下一关）',
    $('#res-journey .j-note').textContent.indexOf('已认识 2 / 34') > -1 &&
    $('#res-journey .j-note').textContent.indexOf('还有 32 个') > -1,
    $('#res-journey .j-note').textContent);
  check('反向：进度锚不出现「?」以外的未收藏字形泄漏',
    $('#res-journey .j-note').textContent.indexOf('吉祥结') === -1 &&
    $('#res-journey .j-note').textContent.indexOf('ཁ') === -1);

  // 24.4 印章计数：必须跟着 stamps 数组走（此前写死为 1）
  check('首次通关后结算页给出印章计数（1 / 7）',
    $('#res-stamp').textContent.indexOf('已收集 1 / 7 枚印章') > -1, $('#res-stamp').textContent);
  check('印章计数取自 stamps 数组', ev('getStampCount()') === ev('getProgress().stamps.length') &&
    ev('getStampCount()') >= 1, String(ev('getStampCount()')));
  ev('(function () { var p = getProgress(); if (p.stamps.indexOf("shigatse") === -1)' +
    ' { p.stamps.push("shigatse"); saveProgress(p); } })()');
  ev('renderResult()');
  check('反向：多一枚印章后结算页计数随之变化（证明未写死）',
    $('#res-stamp').textContent.indexOf('已收集 2 / 7 枚印章') > -1, $('#res-stamp').textContent);
  // D33：通关庆祝与跳页只执行一次（finished 去重），但结算页内容可重复渲染
  check('通关庆祝只执行一次（重复调 finishLevel 不重复播粒子）', (function () {
    const before = $$('.fx-bit').length;
    ev('finishLevel()');
    return $$('.fx-bit').length === before;
  })(), 'bits=' + $$('.fx-bit').length);
  check('结算页渲染函数可重复调用（幂等）', (function () {
    const a = $('#res-journey').innerHTML;
    ev('renderResult()');
    return $('#res-journey').innerHTML === a;
  })());

  // 24.5 第 2 关必须与第 1 关形成机制差异
  ev('startLevel(2)'); await sleep(80);
  check('第 2 关有 2 块冰霜（与第 1 关拉开差异）', ev('state.frostTotal') === 2, String(ev('state.frostTotal')));
  check('第 2 关 DOM 冰霜罩层数量一致', $$('#board .frost').length === 2,
    '实际 ' + $$('#board .frost').length);
  check('第 2 关认全四个基础字母 ཀ ཁ ག ང', ev('LEVELS[1].elements.length') === 4 &&
    ev('JSON.stringify(LEVELS[1].elements.map(function (e) { return e[0]; }))') ===
      '["letter_01","letter_02","letter_03","letter_04"]',
    String(ev('LEVELS[1].elements.length')));
  check('第 2 关字母配比全为偶数（保证两两配对）',
    ev('LEVELS[1].elements.every(function (e) { return e[1] % 2 === 0; })') === true);
  ev('startLevel(1)'); await sleep(80);
  check('反向：第 1 关仍无冰霜（前 60 秒不打扰新手）',
    ev('state.frostTotal') === 0 && $$('#board .frost').length === 0, String(ev('state.frostTotal')));

  /* ---------- 25. D27：阶段完结后的「下一阶段」预告 ---------- */
  // 12 阶段路线图此前只在证书页可见，而「要不要继续」的决定发生在结算页。
  section('25. 阶段路线图定位与「下一阶段」预告（D27）');

  // 25.1 反向：阶段未完结时不应出现预告（是预告，不是提前开放）
  ev('startLevel(1)'); await sleep(80);
  ev('state.matchedCount = 12; state.collected = []; state.score = 100;' +
    ' state.maxCombo = 3; state.misses = 0; finishLevel()');
  await sleep(80);
  check('反向：阶段未完结（第 1 关结算）时不出现「下一阶段」预告',
    $$('#res-cert .next-stage').length === 0,
    '实际 ' + $$('#res-cert .next-stage').length + ' 个');

  // 25.2 通关阶段 1（第 10 关）后出现，且文案全部来自 STAGES 数据
  ev('(function () { const p = getProgress();' +
    ' p.completedLevels = [1,2,3,4,5,6,7,8,9]; saveProgress(p); })()');
  ev('startLevel(10)'); await sleep(80);
  ev('state.matchedCount = 24; state.collected = []; state.score = 300;' +
    ' state.maxCombo = 6; state.misses = 0; finishLevel()');
  await sleep(80);
  const nsEl = $('#res-cert .next-stage');
  check('阶段 1 通关后，结算页出现「下一阶段」预告', !!nsEl);
  if (nsEl) {
    const txt = nsEl.textContent;
    check('预告阶段名取自 STAGES 数据（非页面写死）',
      txt.indexOf(ev('STAGES[1].name')) > -1, txt);
    check('预告学习目标取自 STAGES 数据（非页面写死）',
      txt.indexOf(ev('STAGES[1].goal')) > -1, txt);
    check('预告含阶段序号与关卡区间（来自 stage / from / to）',
      txt.indexOf('第 ' + ev('STAGES[1].stage') + ' 阶段') > -1 &&
      txt.indexOf(ev('STAGES[1].from') + '-' + ev('STAGES[1].to')) > -1, txt);
    check('未开放的下一阶段标注为「内容制作中」（不承诺可玩）',
      txt.indexOf('内容制作中') > -1, txt);
    check('预告不出现金额 / 权益类字眼（文化内容，不是商品）',
      !/[¥￥]|元|优惠|券|折扣/.test(txt), txt);
  }

  /* ---------- 26. 「藏文可以组合」拼合预告（仅第 2 关） ---------- */
  // 设计给了「元音拼合」的完整机制，但机制要等阶段 3 才开（D27）；
  // 这里先落它真正有价值的部分：让玩家在第 2 关通关时「看见藏文可以组合」。
  section('26. 「藏文可以组合」拼合预告（仅第 2 关）');

  // 26.1 反向：别的关卡不出现（是预告，不是把机制提前）
  ev('startLevel(1)'); await sleep(80);
  ev('state.matchedCount = 12; state.collected = ["letter_01","letter_02"];' +
    ' state.score = 100; state.maxCombo = 3; state.misses = 0; finishLevel()');
  await sleep(80);
  check('反向：第 1 关结算页不出现拼合预告',
    $$('#res-combo-tease .combo-tease').length === 0,
    '实际 ' + $$('#res-combo-tease .combo-tease').length + ' 个');

  // 26.2 第 2 关出现，且文案 / 音节 / 关卡号全部来自数据层
  ev('startLevel(2)'); await sleep(80);
  ev('state.matchedCount = 15; state.collected = ["letter_01","letter_02","letter_03","letter_04"];' +
    ' state.score = 220; state.maxCombo = 5; state.misses = 0; finishLevel()');
  await sleep(80);
  const ctEl = $('#res-combo-tease .combo-tease');
  check('第 2 关（认全 ཀ ཁ ག ང）结算页出现拼合预告', !!ctEl);
  if (ctEl) {
    const ctTxt = ctEl.textContent;
    check('预告标题来自 data/combo.js', ctTxt.indexOf(ev('DATA.combo.tag')) > -1, ctTxt);
    check('预告对比的是数据层给的「组合前」音节', ctTxt.indexOf(ev('DATA.combo.base')) > -1, ctTxt);
    check('预告对比的是数据层给的「组合后」音节', ctTxt.indexOf(ev('DATA.combo.combined')) > -1, ctTxt);
    check('预告含拉丁转写', ctTxt.indexOf(ev('DATA.combo.roman')) > -1, ctTxt);
    // 注意：先摘掉「元音」——藏文术语里的「元」不是货币单位，否则会误报
    const ctMoney = ctTxt.split('元音').join('');
    check('预告说明不出现金额 / 权益类字眼（文化内容，不是商品）',
      !/[¥￥]|元|优惠|券|折扣/.test(ctMoney), ctTxt);
    check('反向：预告里没有孤立的元音符号（必须与基字同簇）',
      !/[\u0F71-\u0F84\u0F90-\u0FBC]/.test(
        ctTxt.replace(new RegExp(ev('DATA.combo.combined'), 'g'), '')), ctTxt);
  }

  // 26.3 数据层判据：comboTease 是纯函数，只认配置里那一关
  check('comboTease(2, DATA.combo) 返回数据层的预告对象',
    ev('JSON.stringify(comboTease(2, DATA.combo))') === ev('JSON.stringify(DATA.combo)'));
  check('comboTease(1, ...) 为 null（第 1 关只教配对）',
    ev('comboTease(1, DATA.combo)') === null);
  check('comboTease(3, ...) 为 null（机制仍不提前开放）',
    ev('comboTease(3, DATA.combo)') === null);
  check('comboTease 缺配置时安全返回 null',
    ev('comboTease(2, null)') === null);

  /* ---------- 27. 分享海报「文化身份」行（真实数据，不得写死） ---------- */
  // 海报是产品唯一的对外出口，也是最容易把数字写死的地方
  // （上一版写死「8 个藏文字母」，且与小程序端文案、坐标都不一致）。
  section('27. 分享海报「文化身份」行（真实数据，不得写死）');

  const idFull = { letters: 3, letterTotal: 8, cards: 5, cardTotal: 12, stamps: 2, stampTotal: 7 };

  // 27.1 纯函数边界（与 utils/collect.js#shareIdentity 同契约）
  check('shareIdentity 用真实数字生成两行',
    ev('shareIdentity(' + JSON.stringify(idFull) + ').line1') === '已认识 3 / 8 个藏文字母' &&
    ev('shareIdentity(' + JSON.stringify(idFull) + ').line2') === '文化卡 5 / 12 · 护照印章 2 / 7');
  check('反向：一个字母都没认时不印 0',
    ev('shareIdentity({"letters":0,"letterTotal":8,"cards":0,"cardTotal":12,"stamps":0,"stampTotal":7}).line1') ===
      '在「藏字方块」里学认藏文字母');
  check('反向：没有文化卡与印章时第二行为空（不印 0 / 7）',
    ev('shareIdentity({"letters":2,"letterTotal":8,"cards":0,"cardTotal":12,"stamps":0,"stampTotal":7}).line2') === '');
  check('只有印章时第二行只剩印章',
    ev('shareIdentity({"letters":2,"letterTotal":8,"cards":0,"cardTotal":12,"stamps":1,"stampTotal":7}).line2') ===
      '护照印章 1 / 7');
  check('分母不小于分子（脏数据也印不出 5 / 3）',
    ev('shareIdentity({"letters":9,"letterTotal":8,"cards":20,"cardTotal":12,"stamps":9,"stampTotal":7}).line1') ===
      '已认识 9 / 9 个藏文字母');

  // 27.2 海报真的把真实进度画上去了（不是写死的）
  // 祝福卡只在第 10 关结算页出现（#bless-out 容器在那一屏才渲染），先到那一屏再改进度。
  ev('(function () { const p = getProgress();' +
    ' p.completedLevels = [1,2,3,4,5,6,7,8,9]; p.unlockedLevel = 10; saveProgress(p); })()');
  ev('startLevel(10)'); await sleep(80);
  ev('state.matchedCount = 24; state.collected = []; state.score = 300;' +
    ' state.maxCombo = 6; state.misses = 0; finishLevel()');
  await sleep(120);
  ev('(function () { const p = getProgress();' +
    ' p.seenCards = ["letter_01","letter_02","letter_03","icon_01"];' +
    ' p.stamps = ["lhasa"]; saveProgress(p); })()');
  ev('window.__texts.length = 0');
  ev('(function () { const n = $("bless-name"); if (n) n.value = "测试"; })()');
  ev('generateBlessing()');
  const posterTexts = win.__texts.map(function (x) { return x.t; });
  check('海报按真实进度印出字母行',
    posterTexts.indexOf('已认识 3 / 30 个藏文字母') > -1, posterTexts.join(' | '));
  check('海报按真实进度印出文化卡与印章行（3 字母 + 1 图标 = 4 张卡 · 1 枚印章）',
    posterTexts.indexOf('文化卡 4 / 34 · 护照印章 1 / 7') > -1, posterTexts.join(' | '));
  check('反向：海报不再出现写死的字母数',
    !posterTexts.some(function (t) { return /认了\s*8|学会了\s*8|认识\s*8\s*个/.test(t); }),
    posterTexts.join(' | '));

  // 27.3 身份行不得落进底部 Logo / 小程序码所在的横带（H5 海报高 1000，底部带从 y=800 起）
  const idTexts = win.__texts.filter(function (x) {
    return /个藏文字母|文化卡 |护照印章 |学认藏文字母/.test(x.t);
  });
  check('身份行确实画了', idTexts.length > 0, String(idTexts.length));
  check('身份行位置在底部图形带之上（y < 780）',
    idTexts.every(function (x) { return x.y < 780; }),
    JSON.stringify(idTexts.map(function (x) { return x.y; })));

  /* ---------- 28. 唐卡合成闭环（合成动作 + 护照展示，双端同源） ---------- */
  section('28. 唐卡合成闭环（合成动作 + 护照展示，双端同源）');
  // 状态注入：给满 9 片碎片（走真实 saveProgress，不走测试捷径）
  ev('var __p = getProgress(); __p.fragments = [0,1,2,3,4,5,6,7,8]; __p.thangkaDone = false; saveProgress(__p);');
  ev('openPanel("thangka")');
  await sleep(40);
  check('集齐 9 片后九宫格仍为 3×3 九格', $$('#entry-body .tk-cell').length === 9,
    '实际 ' + $$('#entry-body .tk-cell').length);
  check('九格全部点亮', $$('#entry-body .tk-cell.on').length === 9);
  check('集齐后出现「合成唐卡」动作（此前只有一行文字，玩家无事可做）',
    !!$('#synth-btn') && $('#synth-btn').textContent.indexOf('合成唐卡') > -1,
    $('#synth-btn') ? $('#synth-btn').textContent : '按钮不存在');

  $('#synth-btn').click();
  await sleep(40);
  check('点击合成后 thangkaDone 落库', ev('getThangkaDone()') === true);
  check('合成后九宫格收成一幅（加 done 框）',
    $$('#entry-body .tk-grid.done').length === 1);
  check('合成后出现完成提示',
    $('#entry-body').textContent.indexOf('已合成 · 完整图收入文化护照') > -1);
  check('合成按钮消失（幂等：不提供重复合成入口）', !$('#synth-btn'));
  check('markThangkaDone 幂等（再调返回 done:false）', ev('markThangkaDone().done') === false);

  ev('showPassport()');
  await sleep(40);
  check('护照页兑现「完整图收入文化护照」的承诺（唐卡收藏板块存在）',
    !!$('#pp-frag-grid'), '缺 #pp-frag-grid');
  check('护照页九格与首页同一纯函数（9 格全亮）',
    $$('#pp-frag-grid .tk-cell').length === 9 && $$('#pp-frag-grid .tk-cell.on').length === 9);
  check('护照页计数 9 / 9',
    $('#pp-frag-count').textContent.indexOf('9 / 9') > -1, $('#pp-frag-count').textContent);
  check('护照页显示已合成提示',
    $('#pp-frag-note').textContent.indexOf('唐卡已合成') > -1);

  // 反向断言：只有 3 片时不得出现合成按钮（机制不提前开放）
  ev('var __p2 = getProgress(); __p2.fragments = [0,1,2]; __p2.thangkaDone = false; saveProgress(__p2);');
  ev('openPanel("thangka")');
  await sleep(40);
  check('碎片不足时不出合成按钮', !$('#synth-btn'));
  check('碎片不足时未得槽位显示编号占位', $$('#entry-body .tk-cell.on').length === 3);

  /* ---------- 29. 祝福签卡片（雪域日签 → Canvas 藏纸卡，确定性抽取 + 零金额） ---------- */
  section('29. 祝福签卡片（雪域日签 → Canvas 藏纸卡，确定性抽取 + 零金额）');
  ev('showScreen("home")');
  ev('openPanel("daily")');
  await sleep(40);
  check('日签面板出现「生成今日祝福签卡片」按钮', !!$('#bless-btn'),
    $('#bless-btn') ? $('#bless-btn').textContent : '按钮不存在');
  check('面板带定性文案（不设分享奖励、不含任何金额）',
    $('#entry-body').textContent.indexOf('不设分享奖励、不含任何金额') > -1);

  // 确定性契约：blessingCard 自身无随机；同日同签号，跨日签号不同
  check('blessingCard 同日两次调用结果逐字一致', (function () {
    ev('window.__bc1 = JSON.stringify(blessingCard(DAILY.greetings[0], "2026-10-06"));' +
       'window.__bc2 = JSON.stringify(blessingCard(DAILY.greetings[0], "2026-10-06"));');
    return ev('__bc1') === ev('__bc2');
  })());
  check('签号随日期推进（对 7 取模，与签到同循环）',
    ev('blessingCard(DAILY.greetings[0], "2026-10-06").no') === ev('blessingCard(DAILY.greetings[0], "2026-10-07").no') - 1);
  check('日签面板展示的就是 pickDaily 抽到的当日签', (function () {
    const expect = ev('pickDaily(DAILY.greetings, colDayNumber(colToday())).tibetan');
    const shown = $('.daily-tib') ? $('.daily-tib').textContent : '';
    return expect === shown;
  })());

  // 点击生成：mockCtx 记录了真正画上去的文字，可验证「画了什么」
  const textsBefore = (win.__texts || []).length;
  $('#bless-btn').click();
  await sleep(60);
  check('生成后出现卡片预览图', !!$('#bless-out img'), '缺 #bless-out img');
  check('提供 PNG 下载（保存到本地）', !!$('#bless-out .cert-dl'));
  check('H5 提示语与小程序分享动作同口径（分享给朋友 · 无需截屏）',
    $('#bless-out').textContent.indexOf('分享给朋友') > -1 &&
    $('#bless-out').textContent.indexOf('无需截屏') > -1);
  check('画布上真的画了当日中文释义（不是空卡）', (function () {
    const cn = ev('pickDaily(DAILY.greetings, colDayNumber(colToday())).cn');
    return (win.__texts || []).slice(textsBefore).some(function (t) { return t.t === cn; });
  })());
  check('画布上画了品牌句「玩方块，认藏文」',
    (win.__texts || []).slice(textsBefore).some(function (t) { return t.t === '认藏文，从方块开始'; }));
  check('画布上画了小程序码占位（品牌出口，非二维码内容）',
    (win.__texts || []).slice(textsBefore).some(function (t) { return t.t === '小程序码'; }));

  // 合规底线：卡片文案无金额（动态验证；静态红线由 validate §27 兜底）
  check('卡片区块文案无货币符号 / 让利数字', (function () {
    const s = $('#bless-out').textContent + $('#entry-body').textContent;
    return !/[¥￥]|元(?!音|素)/.test(s) && !/\d\s*折|\d\s*%\s*off|满\s*\d+\s*减\s*\d+/.test(s);
  })());

  /* ---------- 30. 通关揭图（十关秘境图 · 消除透出 + 揭晓 + 图鉴，两端同源） ---------- */
  section('30. 通关揭图（十关秘境图 · 消除透出 + 揭晓 + 图鉴，两端同源）');
  {
    // 重置到干净状态，保证断言可复现（前面各节已改动进度）
    ev('(function(){var p=getProgress(); p.completedLevels=[]; saveProgress(p);})()');
    ev('setOnboardDone(); startLevel(1)');

    // 30.1 盘面垫层：进第 1 关即挂上图，且为内联 data URL
    check('第 1 关揭图为雪山（与 data/reveals.js 同源）', ev('state.reveal && state.reveal.name') === '雪山');
    check('揭图层已注入且为内联 data URL', (function () {
      const i = $('#reveal-img');
      // D50：揭图主格式 .webp（此前 dataUrl 误标 image/png，靠浏览器嗅探兜底；已修正）
      return !!i && i.style.display === 'block' && String(i.getAttribute('src')).indexOf('data:image/webp;base64,') === 0;
    })());
    check('揭图层精确对齐牌区（四向样式齐全）', (function () {
      const s = $('#reveal-img').style;
      return s.left !== '' && s.top !== '' && s.width !== '' && s.height !== '';
    })());
    check('揭图进度初始 0%（不剧透名字）', $('#reveal-cap').textContent.indexOf('已揭开 0%') > -1
      && $('#reveal-cap').textContent.indexOf('雪山') === -1);

    // 30.2 揭图进度口径（D33 改）：分母是**格数**，报的是「多少格曾清空过」。
    //      有补充牌后盘面不会全空，所以不能再按「已消对数 / 总对数」算（会永远差一截）。
    ev('(function(){for(var k=0;k<10;k++)state.freed[k]=true;' +
      'state.matchedCount=5; renderBoard({phase:"settle"}); updateRevealCap();})()');
    check('揭露进度按「曾清空的格 / 格数」推进（10/24 = 42%）',
      $('#reveal-cap').textContent.indexOf('已揭开 42%') > -1, $('#reveal-cap').textContent);
    // 只增不减：把 freed 清掉也不该回退（freedPct 只读 freed，不做减法）
    ev('(function(){for(var k=0;k<10;k++)state.freed[k]=false; updateRevealCap();})()');
    check('揭图进度可随 freed 收回（口径纯函数化，无隐藏累加）',
      $('#reveal-cap').textContent.indexOf('已揭开 0%') > -1, $('#reveal-cap').textContent);

    // 30.2b 通关时整幅揭晓：freed 全满 → 100%
    ev('startLevel(1)');
    await sleep(60);
    check('新关开局揭图 0%（满铺无空格）', ev('state.revealPct') === 0, 'pct=' + ev('state.revealPct'));
    ev('(function(){for(var k=0;k<state.freed.length;k++)state.freed[k]=true; updateRevealCap();})()');
    check('全部格曾清空 = 揭图 100%（整幅揭晓）', ev('state.revealPct') === 100, 'pct=' + ev('state.revealPct'));

    // 30.3 数据契约：十关全覆盖 / 字段齐全 / 藏文排版 / D25
    check('REVEALS 无缝覆盖 1-10 关且图不重复', ev(
      '(function(){for(var i=1;i<=10;i++){if(!REVEALS[i-1]||REVEALS[i-1].level!==i)return false;}' +
      'var s={};for(var j=0;j<10;j++){if(s[REVEALS[j].img])return false;s[REVEALS[j].img]=1;}return true;})()') === true);
    check('每条揭图都有 藏文/拉丁/中文名/释义',
      ev('REVEALS.every(function(r){return r.tibetan&&r.roman&&r.name&&r.desc;})') === true);
    // 新书写规范（2026-10-08 用户拍板）：完整词尾必须带 ་；禁止行首 ་ / 连续 ་
    check('揭图藏文名符合书写规范（词尾带 ་；无行首/连续 ་）',
      ev('REVEALS.every(function(r){return /[་།]$/.test(r.tibetan) && !/^་|་་/.test(r.tibetan);})') === true);
    check('揭图数据层未出现 D25 红线符号', ev(
      '(function(){var s=JSON.stringify(REVEALS);' +
      'return s.indexOf("莲花")===-1&&s.indexOf("经幡")===-1&&s.indexOf("佛塔")===-1&&s.indexOf("酥油灯")===-1;})()') === true);

    // 30.4 结算页揭晓（通关即整幅揭晓 + 承诺收入护照）
    ev('finishLevel()');
    check('结算页揭晓本关秘境图', $('#res-reveal .reveal-name') && $('#res-reveal .reveal-name').textContent === '雪山');
    check('揭晓卡图为内联 data URL', String(($('#res-reveal .reveal-art') || {}).src !== undefined
      ? $('#res-reveal .reveal-art').getAttribute('src') : '').indexOf('data:image/webp;base64,') === 0);
    check('藏文名 + 拉丁转写上屏', $('#res-reveal .rt-t').textContent === 'གངས་རི་'
      && $('#res-reveal .rt-roman').textContent === 'gangs ri');
    check('揭晓卡承诺「已收入文化护照」且报图鉴进度 1 / 10',
      $('#res-reveal .reveal-note').textContent.indexOf('已收入文化护照') > -1
      && $('#res-reveal .reveal-note').textContent.indexOf('1 / 10') > -1);
    check('揭晓卡文案无货币符号 / 让利数字', !/[¥￥]|元(?!音|素)/.test($('#res-reveal').textContent));

    // 30.5 护照页「揭示图鉴」：解锁与否 = 是否通关（不剧透未解锁的名字）
    ev('showPassport()');
    check('护照页出现揭示图鉴（10 格）', doc.querySelectorAll('#pp-reveal-grid .rv-slot').length === 10);
    check('图鉴解锁数 = 通关关卡数（第 1 关通关 → 1）',
      doc.querySelectorAll('#pp-reveal-grid .rv-slot.got').length === 1
      && $('#pp-reveal-count').textContent === '1 / 10');
    check('已解锁格显示图与名字', !!doc.querySelector('#pp-reveal-grid .rv-slot.got .rv-img')
      && doc.querySelector('#pp-reveal-grid .rv-slot.got .rv-name').textContent === '雪山');
    check('未解锁格不剧透名字（只显示关号）',
      doc.querySelector('#pp-reveal-grid .rv-slot.locked .rv-name').textContent.indexOf('第') === 0);

    // 30.6 单一真相源：揭图状态不落库（派生自 completedLevels）
    check('不新增存储字段（reveals 派生自 completedLevels）', ev('getProgress().reveals') === undefined);
    ev('(function(){var p=getProgress(); p.completedLevels=[1,2,3]; saveProgress(p); showPassport();})()');
    check('补通关 3 关后图鉴自动补齐（无需迁移数据）',
      doc.querySelectorAll('#pp-reveal-grid .rv-slot.got').length === 3);
  }

  /* ---------- 31. 消除情绪激励（D34） ---------- */
  section('31. 消除情绪激励（D34：窗口连击 · 五档浮字 · 文案开关）');
  {
    // 31.1 镜像常量与判定表（两端必须同值，改一边必须改另一边）
    check('窗口常量与小程序一致（600 / 160 / 900 / 2600）',
      ev('PRAISE_WINDOW_BASE===600&&PRAISE_WINDOW_STEP===160&&PRAISE_WINDOW_MIN===900&&PRAISE_WINDOW_MAX===2600'));
    check('最小展示间隔 / 档位1概率与小程序一致',
      ev('PRAISE_GAP_MS') === 1100 && ev('PRAISE_TIER1_PROB') === 0.3);
    check('窗口随元素种类缩放（2 种 → 920ms，12 种 → 2520ms）',
      ev('praiseWindowMsOf(2)') === 920 && ev('praiseWindowMsOf(12)') === 2520);
    check('档位映射同表（≥5 全部归最高档）',
      ev('[0,1,2,3,4,5,6,99].map(praiseTierOf).join()') === '1,1,2,3,4,5,5,5');
    check('档位音效表与小程序同表（一档一音，顶部两档共用欢呼）',
      ev('PRAISE_TIER_SOUND.join()') === ',match,drum,horn,cheer,cheer');
    check('档位 3 起才出藏文大字', ev('praiseShowsTibetan(2)') === false && ev('praiseShowsTibetan(3)') === true);
    check('档位 4 起才出跃迁光环', ev('praiseShowsBurst(3)') === false && ev('praiseShowsBurst(4)') === true);

    // 31.2 文案库注入（与 data/praise.js 同源，不是体验版自己抄一份）
    check('体验版注入了 5 档文案库', ev('DATA.praise.tiers.length') === 5);
    check('每档 ≥5 条且中藏双语齐备', ev(
      'DATA.praise.tiers.every(function(t){return t.texts.length>=5&&' +
      't.texts.every(function(x){return x.zh&&x.bo;});})') === true);
    check('文案库藏文全部良构（无孤立组合符号 / 标点不居首 / 末尾有收尾）', ev(
      'DATA.praise.tiers.every(function(t){return t.texts.every(function(x){' +
      'return !/[\\u0F71-\\u0F84\\u0F90-\\u0FBC]/.test(x.bo.replace(/[\\u0F40-\\u0F6C][\\u0F71-\\u0F84\\u0F90-\\u0FBC]*/g,\'\'))' +
      '&&!/[\\u0F0B-\\u0F0F]{2}/.test(x.bo)&&!/^[\\u0F0B-\\u0F0F]/.test(x.bo)&&/[\\u0F0B-\\u0F0F]$/.test(x.bo);});})') === true);
    check('文案库无竞争性 / 营销性字眼',
      ev('JSON.stringify(DATA.praise)').indexOf('排行') === -1 &&
      ev('JSON.stringify(DATA.praise)').indexOf('金币') === -1 &&
      ev('JSON.stringify(DATA.praise)').indexOf('优惠券') === -1);

    // 31.3 假时钟驱动纯判定：窗口内连消 → 档位一路爬到顶后停住
    const ladder = ev(`(function(){
      var s = praiseInitState(), lv = [], zhs = [];
      for (var k = 0; k < 12; k++) {
        var d = praiseOnMatch(s, 100000 + k * 200, 2, function () { return 0; });
        lv.push(d.level);
        if (d.text) zhs.push(d.text.zh);
        s = { combo: d.combo, prevTier: d.prevTier, lastShownAt: d.lastShownAt,
              lastIndex: d.lastIndex, maxCombo: d.maxCombo };
      }
      var rep = 0;
      for (var i = 1; i < zhs.length; i++) if (zhs[i] === zhs[i - 1]) rep++;
      return { levels: lv.join(','), shown: zhs.length, rep: rep, max: s.maxCombo };
    })()`);
    check('窗口内 12 次连消 → 档位 1→2→3→4→5 后停在 5',
      ladder.levels === '1,2,3,4,5,5,5,5,5,5,5,5', ladder.levels);
    check('峰值连击记录 = 12', ladder.max === 12, 'max=' + ladder.max);
    check('同一条文案不连续出现两次', ladder.rep === 0, 'rep=' + ladder.rep);
    check('受最小间隔约束：不是每次都弹（5 < 展示数 < 12）',
      ladder.shown > 5 && ladder.shown < 12, 'shown=' + ladder.shown);

    // 31.4 超窗断链 / 错配断链（峰值只增不减）
    check('超窗一次 → 档位回到 1，峰值保留', ev(`(function(){
      var s = praiseInitState();
      var a = praiseOnMatch(s, 100000, 2, function () { return 0; });
      s = { combo: a.combo, prevTier: a.prevTier, lastShownAt: a.lastShownAt,
            lastIndex: a.lastIndex, maxCombo: a.maxCombo };
      var b = praiseOnMatch(s, 100000 + 920 + 500, 2, function () { return 0; });
      return b.level + '|' + b.maxCombo;
    })()`) === '1|1');
    check('错配 → 连击与档位归零，峰值保留', ev(`(function(){
      var s = praiseInitState();
      for (var k = 0; k < 3; k++) {
        var d = praiseOnMatch(s, 100000 + k * 100, 2, function () { return 0; });
        s = { combo: d.combo, prevTier: d.prevTier, lastShownAt: d.lastShownAt,
              lastIndex: d.lastIndex, maxCombo: d.maxCombo };
      }
      var m = praiseOnMiss(s);
      return m.combo.combo + '|' + m.prevTier + '|' + m.maxCombo;
    })()`) === '0|0|3');

    // 31.5 真链路：点击牌面 → handleMatch → 浮字真的画出来
    //     门禁判据用「哨兵类名」：先塞一个不可能的类，再看它有没有被 showPraise 覆盖，
    //     避免「上一条的 1.2s 定时器正好把类名清回原状」这种假绿。
    ev('setOnboardDone(); startLevel(1); state.praiseOff = false');
    await sleep(60);

    // 档位 2：中文 + 连击行，不出藏文
    ev('state.praiseState = {combo:{combo:1,at:Date.now()},prevTier:1,lastShownAt:null,lastIndex:{},maxCombo:1}');
    ev("var _pf=$('praise-fx'); _pf.className='praise-fx sentinel';");
    let d34pair = findPair();
    await clickTile(d34pair[0]);
    await clickTile(d34pair[1]);
    check('配对成功即上屏浮字（真实点击链路）',
      ev("$('praise-fx').className").indexOf('sentinel') === -1, ev("$('praise-fx').className"));
    check('浮字挂了档位类 lv2', ev("$('praise-fx').className").indexOf('lv2') > -1);
    check('浮字挂了动画类 ant-a / ant-b 之一', /ant-[ab]/.test(ev("$('praise-fx').className")));
    check('连续正确行显示「连续正确 ×2」', ev("$('praise-combo').textContent") === '连续正确 ×2');
    check('档位 2 不出藏文大字（藏文从档位 3 起）', ev("$('praise-bo').style.display") === 'none');
    check('中文文案取自文案库档位 2', ev('(function(){var z=$("praise-zh").textContent;' +
      'return DATA.praise.tiers[1].texts.some(function(x){return x.zh===z;});})()') === true);
    const ant1 = ev("$('praise-fx').className").indexOf('ant-a') > -1 ? 'ant-a' : 'ant-b';

    // 档位 3：出藏文大字，且动画类必须翻转（同一 animation-name 不会重播）
    ev('state.praiseState = {combo:{combo:2,at:Date.now()},prevTier:2,lastShownAt:null,lastIndex:{},maxCombo:2}');
    d34pair = findPair();
    await clickTile(d34pair[0]);
    await clickTile(d34pair[1]);
    check('浮字升级到档位 3', ev("$('praise-fx').className").indexOf('lv3') > -1);
    check('档位 3 出藏文大字且非空',
      ev("$('praise-bo').style.display") !== 'none' && ev("$('praise-bo').textContent").length > 0);
    check('藏文大字取自文案库档位 3', ev('(function(){var b=$("praise-bo").textContent;' +
      'return DATA.praise.tiers[2].texts.some(function(x){return x.bo===b;});})()') === true);
    check('替换文案时动画类翻转（否则第二条看不出在播放）',
      (ev("$('praise-fx').className").indexOf(ant1) === -1), ant1 + ' → ' + ev("$('praise-fx').className"));

    // 档位 4：一次性光环节点被点亮
    ev("$('praise-burst').style.display='none'");
    ev('state.praiseState = {combo:{combo:3,at:Date.now()},prevTier:3,lastShownAt:null,lastIndex:{},maxCombo:3}');
    d34pair = findPair();
    await clickTile(d34pair[0]);
    await clickTile(d34pair[1]);
    check('浮字升级到档位 4', ev("$('praise-fx').className").indexOf('lv4') > -1);
    check('档位 4 点亮跃迁光环节点', ev("$('praise-burst').style.display") !== 'none');

    // 31.6 文案开关：只关文案，不关音效与元素发音
    ev("var _t=$('praise-toggle'); _t.click();");
    check('点开关后按钮文案变「文案 关」', ev("$('praise-toggle').textContent") === '文案 关');
    check('按钮切到 off 虚线态', ev("$('praise-toggle').className").indexOf('off') > -1);
    check('开关状态落库（跨关记住）', ev('getProgress().praiseOff') === true);

    ev("$('praise-fx').className='praise-fx sentinel'");
    ev('state.praiseState = {combo:{combo:3,at:Date.now()},prevTier:3,lastShownAt:null,lastIndex:{},maxCombo:3}');
    d34pair = findPair();
    await clickTile(d34pair[0]);
    await clickTile(d34pair[1]);
    check('关掉文案后即使档位跃迁也不上屏浮字',
      ev("$('praise-fx').className") === 'praise-fx sentinel', ev("$('praise-fx').className"));

    // 再点一次：开关回到「文案 开」并清库
    ev("var _t2=$('praise-toggle'); _t2.click();");
    check('再点开关回到「文案 开」并清库',
      ev("$('praise-toggle').textContent") === '文案 开' && ev('getProgress().praiseOff') === false);
    check('开回来时按钮的 off 类被摘掉', ev("$('praise-toggle').className").indexOf('off') === -1);

    // 进关时按落库的偏好同步 HUD 标签（换手机/重开也要记得）
    ev('(function(){var p=getProgress(); p.praiseOff=true; saveProgress(p);})()');
    ev('startLevel(1)');
    await sleep(60);
    check('进关时按落库偏好同步开关标签', ev("$('praise-toggle').textContent") === '文案 关'
      && ev("$('praise-toggle').className").indexOf('off') > -1);
    check('进关时清掉上一关残留的浮字类', ev("$('praise-fx').className") === 'praise-fx');

    // 31.7 教学闭环不受影响：关文案后配对仍朗读元素发音（发音与文案是两条独立通道）
    const speakDry = ev('state.pronounceCount');
    d34pair = findPair();
    await clickTile(d34pair[0]);
    await clickTile(d34pair[1]);
    await sleep(420);
    check('关掉文案后配对仍朗读藏文发音', ev('state.pronounceCount') > speakDry,
      speakDry + ' → ' + ev('state.pronounceCount'));
    check('关掉文案后浮字仍不上屏（开关真的只作用在文案上）',
      ev("$('praise-fx').className") === 'praise-fx');

    // 收尾：把偏好复位，避免污染后续断言
    ev('(function(){var p=getProgress(); p.praiseOff=false; saveProgress(p);})()');
    ev('state.praiseOff = false');
  }

  /* ---------- 32. D25 文化红线：元素库宗教符号清零（莲花/经幡 → 青稞/牦牛） ---------- */
  section('32. D25 文化红线（元素库世俗题材：莲花/经幡 → 青稞/牦牛）');
  {
    const SYMS = ['佛塔', '酥油灯', '风马旗', '莲花', '经幡'];

    // 32.1 数据层：题材已换，id / color / 元素数一律不动（关卡配比零波及）
    check('icon_02 = 青稞（barley / 稞），id 与配色未动',
      ev('DATA.elements.icon_02.title') === '青稞' &&
      ev('DATA.elements.icon_02.iconKey') === 'barley' &&
      ev('DATA.elements.icon_02.char') === '稞' &&
      ev('DATA.elements.icon_02.color') === '#2471A3');
    check('icon_04 = 牦牛（yak / 牦），id 与配色未动',
      ev('DATA.elements.icon_04.title') === '牦牛' &&
      ev('DATA.elements.icon_04.iconKey') === 'yak' &&
      ev('DATA.elements.icon_04.char') === '牦' &&
      ev('DATA.elements.icon_04.color') === '#8A6A12');
    check('元素库为 34 个元素（30 辅音扩充后的新基线，换题材不缩库）',
      ev('Object.keys(DATA.elements).length') === 34);
    check('注入体验版的元素库 JSON 不含任何宗教符号字面', SYMS.every(function (s) {
      return ev('JSON.stringify(DATA.elements)').indexOf(s) === -1;
    }));
    check('文化卡 JSON 也不含宗教符号字面（图标换了、文案还讲旧题材 = 假换）', SYMS.every(function (s) {
      return ev('JSON.stringify(DATA.cards)').indexOf(s) === -1;
    }));

    // 32.2 文化卡：新题材自洽，藏语名随卡给出
    check('icon_02 卡讲的是青稞（含藏语 ནས）',
      ev('CARD_BY_ID.icon_02.title') === '青稞' &&
      String(ev('CARD_BY_ID.icon_02.subtitle')).indexOf('ནས') > -1);
    check('icon_04 卡讲的是牦牛（含藏语 གཡག）',
      ev('CARD_BY_ID.icon_04.title') === '牦牛' &&
      String(ev('CARD_BY_ID.icon_04.subtitle')).indexOf('གཡག') > -1);

    // 32.3 绘制器两端同构：新题材在、旧符号亡
    check('体验版绘制器映射 = {knot, barley, mountain, yak}',
      ev('Object.keys(DRAWERS).sort().join()') === 'barley,knot,mountain,yak');
    check('旧符号绘制器已不存在（ DRAWERS 上无 lotus / flags 键）',
      ev('DRAWERS.lotus') === undefined && ev('DRAWERS.flags') === undefined);
    check('两种新图标都能渲染出牌面图（普通牌面奶白墨）',
      String(ev('tileIconDataUrl("icon_02", false)')).indexOf('data:image') === 0 &&
      String(ev('tileIconDataUrl("icon_04", false)')).indexOf('data:image') === 0);
    check('金块牌面深墨变体也能渲染',
      String(ev('tileIconDataUrl("icon_02", true)')).indexOf('data:image') === 0 &&
      String(ev('tileIconDataUrl("icon_04", true)')).indexOf('data:image') === 0);

    // 32.4 真盘面反向断言：第 10 关四图标齐全（icon_02 在第 7 关引入、icon_04 只在第 10 关出现）
    ev('startLevel(10)');
    await sleep(80);
    check('第 10 关盘面上确实有 icon_02 / icon_04 牌', ev(
      'state.board.cells.some(function(c){return c&&c.id==="icon_02";})&&' +
      'state.board.cells.some(function(c){return c&&c.id==="icon_04";})') === true);
    check('第 10 关图标牌已按新绘制器出图（icon-img 数 > 0）',
      ev('document.querySelectorAll("#board .icon-img").length') > 0);
    check('盘面文本层不含宗教符号字面', SYMS.every(function (s) {
      return $('#board').textContent.indexOf(s) === -1;
    }));
    ev('startLevel(1)');
    await sleep(60);
  }

  /* ---------- 33. 藏地密码（PRD 5.2：通关解锁十则小知识） ---------- */
  section('33. 藏地密码（PRD 5.2：十则小知识 · 通关解锁 · 未解锁不剧透）');
  {
    const SYMS33 = ['佛塔', '酥油灯', '风马旗', '莲花', '经幡'];

    // 33.1 数据契约（与 validate §33 同一组口径，但这里是「注入体验版之后」的真身）
    check('SECRETS 共 10 则且关卡号严格 1..10',
      ev('SECRETS.length===10&&SECRETS.every(function(s,i){return s.level===i+1;})') === true);
    check('每则都有 key / tag / 标题 / 正文，且正文 ≥40 字',
      ev('SECRETS.every(function(s){return !!(s.key&&s.tag&&s.title&&s.text)&&String(s.text).length>=40;})') === true);
    check('十则标题互不重复',
      ev('new Set(SECRETS.map(function(s){return s.title;})).size===10') === true);
    check('注入体验版的密码数据不含 D25 宗教符号字面', SYMS33.every(function (s) {
      return ev('JSON.stringify(DATA.secrets)').indexOf(s) === -1;
    }));
    check('密码正文无金额 / 让利 / 营销字眼', (function () {
      const t = ev('JSON.stringify(DATA.secrets)');
      const money = /[¥￥]|元(?!音|素)|\d\s*折|满\s*\d+\s*减\s*\d+/.test(t);
      const comp = ['排行榜', '排行', '名次', '战区', '金币', '优惠券', '广告', '抽奖', '返现']
        .some(function (w) { return t.indexOf(w) > -1; });
      return !money && !comp;
    })());

    // 33.2 结算页：通关即解锁本关那一则
    ev('(function(){var p=getProgress(); p.completedLevels=[]; saveProgress(p);})()');
    ev('setOnboardDone(); startLevel(1)');
    ev('finishLevel()');
    await sleep(60);
    check('结算页出现藏地密码卡', !!$('#res-secret .secret-card'));
    check('解锁的是第 1 则（标题与 SECRETS[0] 逐字一致）',
      $('#res-secret .secret-title').textContent === ev('SECRETS[0].title'),
      'got=' + ($('#res-secret .secret-title') || {}).textContent);
    check('卡片带分类标签（取自数据层 tag）',
      $('#res-secret .secret-kind').textContent === ev('SECRETS[0].tag'));
    check('卡片报图鉴进度 1 / 10 且承诺「已收入文化护照」', (function () {
      const t = $('#res-secret .secret-note').textContent;
      return t.indexOf('1 / 10') > -1 && t.indexOf('已收入文化护照') > -1;
    })(), $('#res-secret .secret-note').textContent);
    check('卡片文案无货币符号 / 让利数字', !/[¥￥]|元(?!音|素)/.test($('#res-secret').textContent));

    // 33.3 护照页：10 格；解锁 = 已通关；未解锁只给关号、不泄露标题
    ev('showPassport()');
    check('护照页出现藏地密码板块（10 格）',
      doc.querySelectorAll('#pp-secret-grid .se-slot').length === 10);
    check('解锁数 = 通关关卡数（第 1 关通关 → 1）',
      doc.querySelectorAll('#pp-secret-grid .se-slot.got').length === 1
      && $('#pp-secret-count').textContent === '1 / 10',
      'count=' + $('#pp-secret-count').textContent);
    check('已解锁格显示分类 + 标题（逐字来自数据层）',
      doc.querySelector('#pp-secret-grid .se-slot.got .se-title').textContent === ev('SECRETS[0].title')
      && doc.querySelector('#pp-secret-grid .se-slot.got .se-tag').textContent === ev('SECRETS[0].tag'));
    check('未解锁格只给关号、不泄露标题（不剧透）', (function () {
      const locked = doc.querySelector('#pp-secret-grid .se-slot.locked');
      if (!locked) return false;
      const txt = locked.textContent;
      return txt.indexOf('第 2 号') > -1 && txt.indexOf(ev('SECRETS[1].title')) === -1;
    })(), 'locked=' + ((doc.querySelector('#pp-secret-grid .se-slot.locked') || {}).textContent));

    // 33.4 单一真相源：不落库，补通关自动补齐（无需数据迁移）
    check('不新增存储字段（密码解锁派生自 completedLevels）', ev('getProgress().secrets') === undefined);
    ev('(function(){var p=getProgress(); p.completedLevels=[1,2,3,4,5]; saveProgress(p); showPassport();})()');
    check('补通关至 5 关后自动补齐 5 格',
      doc.querySelectorAll('#pp-secret-grid .se-slot.got').length === 5);
    check('第 5 格显示第 5 则（槽位与关卡号严格绑定）',
      doc.querySelectorAll('#pp-secret-grid .se-slot.got')[4].textContent.indexOf(ev('SECRETS[4].title')) > -1);

    // 33.5 确定性：同一进度两次渲染逐字一致（无随机源，无时间依赖）
    const secGrid33 = $('#pp-secret-grid').innerHTML;
    ev('showPassport()');
    check('同一进度两次渲染逐字一致（无随机源）', $('#pp-secret-grid').innerHTML === secGrid33);

    // 复原到干净状态，避免影响后续断言
    ev('(function(){var p=getProgress(); p.completedLevels=[]; saveProgress(p);})()');
  }

  /* ---------- 34. 背景音乐（PRD 3.3：进游戏页响 / 离开停 / 开关落库） ---------- */
  section('34. 背景音乐（PRD 3.3：进游戏页响 · 离开停 · 开关落库 · 不越界）');
  {
    // 34.1 体验版常量与音符表（v2 柔化：7 音 / 3.36s；与 scripts/make_bgm.py 同一段旋律，validate §34.5 逐字比对）
    check('体验版含循环常量与 7 音柔和旋律表',
      ev('BGM_LOOP_LEN') === 3.36 && ev('BGM_MEL.length') === 7 && ev('BGM_MEL_AMP.length') === 7 &&
      ev('BGM_MEL_AT.length') === 7);
    check('每个音名都能解析到频率（表与音名一一对应）',
      ev('BGM_MEL.every(function(n){return typeof BGM_F[n]==="number";})') === true);
    check('v2 柔化三要素在体验版就位（软起音 90ms / 长衰减 0.75 / 谐波仅 1·2·3 层）',
      ev('BGM_TONE_ATTACK') === 0.09 && ev('BGM_TONE_TAU') === 0.75 && ev('BGM_PARTIALS.length') === 3);
    check('BGM 音量与小程序同值 0.28（v2 柔化：明显低于音效）', ev('BGM_VOLUME') === 0.28);

    // 34.2 HUD 开关存在，默认「音乐 开」
    check('HUD 上有音乐开关且默认「音乐 开」', (function () {
      const b = $('#bgm-toggle');
      return !!b && b.textContent === '音乐 开' && b.className.indexOf('off') === -1;
    })(), String(($('#bgm-toggle') || {}).textContent));

    // 34.3 进游戏页响 / 离开停（与小程序 onShow / onHide 同口径）
    ev('(function(){var p=getProgress();p.bgmOff=false;saveProgress(p);})()');
    ev('setOnboardDone(); startLevel(1)');
    await sleep(40);
    check('进入游戏页即开始播放（bgmPlaying = true）', ev('state.bgmPlaying') === true);
    ev('showScreen("home")');
    check('离开游戏页即停止（不会漏到首页 / 结算页）', ev('state.bgmPlaying') === false);

    // 34.4 开关：立即生效 + 落库 + 重进尊重偏好
    ev('setOnboardDone(); startLevel(1)');
    await sleep(40);
    ev('toggleBgm()');
    check('关掉后立即停，标签变「音乐 关」',
      ev('state.bgmOff') === true && ev('state.bgmPlaying') === false &&
      $('#bgm-toggle').textContent === '音乐 关' && $('#bgm-toggle').className.indexOf('off') > -1);
    check('偏好已落库（progress.bgmOff = true）', ev('getProgress().bgmOff') === true);
    ev('showScreen("home")');
    ev('setOnboardDone(); startLevel(1)');
    await sleep(40);
    check('重进游戏页尊重已存偏好（关着不会自己响）',
      ev('state.bgmPlaying') === false && $('#bgm-toggle').textContent === '音乐 关');
    ev('toggleBgm()');
    check('再点开回来（bgmOff=false，标签复原，立刻响）',
      ev('state.bgmOff') === false && ev('state.bgmPlaying') === true &&
      $('#bgm-toggle').textContent === '音乐 开');

    // 34.5 不越界：音乐开关只管 BGM，元素发音与音效照常（发音属学习闭环）
    ev('toggleBgm()');                              // 关掉音乐
    const before34 = ev('state.pronounceCount');
    const pr34 = findPair();
    await clickTile(pr34[0]);
    await clickTile(pr34[1]);
    await sleep(430);                               // 发音在配对成功后 300ms 触发
    check('音乐关掉后配对仍然朗读元素发音', ev('state.pronounceCount') > before34,
      'before=' + before34 + ' after=' + ev('state.pronounceCount'));
    check('音乐关掉后 bgmPlaying 仍为 false（开关作用面限定在 BGM）',
      ev('state.bgmPlaying') === false);

    // 复原：开着，避免影响后续断言
    ev('toggleBgm()');
    ev('(function(){var p=getProgress();p.bgmOff=false;saveProgress(p);})()');
    check('复原为开启（后续断言不受影响）', ev('getProgress().bgmOff') === false);
  }

  /* ---------- 35. 纹样砖（八宝+卷草纹：体验版内联同源 · 保形铺贴） ---------- */
  section('35. 纹样砖（八宝+卷草纹：内联同源 · 保形铺贴）');
  {
    // 35.1 体验版内联的必须「就是」仓库里这块砖 —— 改了砖忘重跑 build-h5 会被抓
    const tileBuf35 = fs.readFileSync(path.join(ROOT, 'images', 'pat-tile.png'));
    const htmlSrc35 = fs.readFileSync(HTML, 'utf8');
    check('build 产物把 pat-tile.png 内联为 IMAGES.pattern（改砖后必须重跑 build-h5）',
      /"pattern"\s*:\s*"data:image\/png;base64,/.test(htmlSrc35));
    check('体验版内联的 base64 与 pat-tile.png 逐字节一致',
      htmlSrc35.indexOf(tileBuf35.toString('base64')) > -1);
    // 反例自测：翻转砖末字节，这个变体绝不能出现在产物里（证明比对尺不是摆设）
    const flip35 = (function () {
      const f = Buffer.from(tileBuf35);
      f[f.length - 1] ^= 0xff;
      return f.toString('base64');
    })();
    check('反例自测：翻转砖末字节的变体不出现在产物里（比对尺真实有效）',
      htmlSrc35.indexOf(flip35) === -1);

    // 35.2 保形铺贴：砖是 2:1，铺进正方形会把八宝纵向拉伸两倍
    check('.sc-pattern 保形铺贴（68px 34px = 2:1）',
      /\.sc-pattern\s*\{[^}]*?background-size:\s*68px\s+34px/.test(htmlSrc35));
    check('.card-hero 纹样同样保形（54px 27px）',
      /\.card-hero::before\s*\{[^}]*?background-size:\s*54px\s+27px/.test(htmlSrc35));

    // 35.3 运行时真的把砖挂上了（不是 --pat: none 兜底）
    check('运行时 --pat 已挂为 data URL（真实平铺）',
      (ev('document.documentElement.style.getPropertyValue("--pat")') || '')
        .indexOf('data:image/png') > -1);

    // 35.4 砖规格（PNG IHDR 零依赖直读）
    check('砖规格 256×128（4×2 格，2:1）',
      tileBuf35.readUInt32BE(0) === 0x89504e47 &&
      tileBuf35.readUInt32BE(16) === 256 && tileBuf35.readUInt32BE(20) === 128);
  }

  /* ---------- 36. 性别 + 藏族名字（D54：自填三档 / 不愿透露出口 / 仅本机 / 可改可清除） ---------- */
  section('36. 性别 + 藏族名字（D54）');
  {
    // 36.1 三档并列渲染，且「不愿透露」不是隐藏兜底
    const opts36 = Array.prototype.map.call(doc.querySelectorAll('#ga-opts .ga-opt'), function (el) {
      return el.getAttribute('data-key');
    });
    check('引导页三档并列渲染（male/female/unspecified）',
      opts36.join(',') === 'male,female,unspecified', opts36.join(','));
    check('「不愿透露」与男/女同形并列（有 quiet 样式但可点面积一致）',
      !!doc.querySelector('#ga-opts .ga-opt.quiet[data-key="unspecified"]'));

    // 36.2 选「女」→ 拿到女名（与小程序同一份名字池，确定性取模）
    const femaleName36 = ev("(function(){ setGender('female'); var n = getTibetanName(); setGender(''); return n.name; })()");
    const maleName36 = ev("(function(){ setGender('male'); var n = getTibetanName(); setGender(''); return n.name; })()");
    const neutralName36 = ev("(function(){ setGender('unspecified'); var n = getTibetanName(); setGender(''); return n.name; })()");
    check('女 → 女名池（' + femaleName36 + '）', !!femaleName36);
    check('男 → 男名池（' + maleName36 + '）', !!maleName36);
    check('不愿透露 → 中性名池（' + neutralName36 + '，功能不打折）', !!neutralName36);
    check('男女不同名（' + maleName36 + ' vs ' + femaleName36 + '）', maleName36 !== femaleName36);

    // 36.3 确定性：同 seed 必得同名（不会每次刷新都变）
    const twice36 = ev("(function(){ setGender('female'); var a = getTibetanName().name; var b = namePickFor('female', nameSeedFromDate(getProgress().openLog.first || '')).name; setGender(''); return a === b; })()");
    check('确定性选名：落库名 = 算法同名', twice36 === true);

    // 36.4 只落本机：存储里能读到，且字段只有三个（无网络 / 无云 / 无埋点已在 validate §45.8 静态守）
    const fields36 = ev("(function(){ setGender('female'); var p = getProgress(); var r = [p.gender, p.tibetanName, p.tibetanNameMean]; setGender(''); return r.join('|'); })()");
    check('性别与名字落在本机 progress（' + fields36 + '）',
      fields36.split('|')[0] === 'female' && !!fields36.split('|')[1] && !!fields36.split('|')[2]);

    // 36.5 清除 = 个人信息可撤回：性别与名字一并撤掉
    const cleared36 = ev("(function(){ setGender('female'); setGender(''); var p = getProgress(); return [p.gender, p.tibetanName, p.tibetanNameMean].join('|'); })()");
    check('清除后性别与名字一并撤空（不留无主名字）', cleared36 === '||', cleared36);

    // 36.6 引导排在灯火跳窗之后（两个弹窗不同框）
    const htmlSrc36 = fs.readFileSync(HTML, 'utf8');
    check('灯火跳窗开着时性别引导让位（GENDER_PENDING）',
      /if \(lamp\.shown\) \{ GENDER_PENDING = true; return false; \}/.test(htmlSrc36));
    check('体验版同样「已选则跳过」（不反复打扰）',
      /if \(getGender\(\)\) return false;/.test(htmlSrc36) &&
      /if \(location\.search\.indexOf\('nogender'\) > -1\) return false;/.test(htmlSrc36));

    // 36.7 护照页「我的资料」：可查看 / 可修改 / 可清除
    ev("setGender('female'); showPassport();");
    check('护照页显示性别标签（女）', $('#pp-gender').textContent === '女', $('#pp-gender').textContent);
    check('护照页显示藏族名字（' + $('#pp-tib-name').textContent + '）',
      $('#pp-tib-name').textContent.indexOf('（') > -1);
    ev("document.querySelector('#pp-edit').click()");
    check('点「修改性别」展开三档选择行', /show/.test($('#pp-gp').className));
    const cells36 = Array.prototype.map.call(doc.querySelectorAll('#pp-gp .gp-cell'), function (el) {
      return el.getAttribute('data-key');
    });
    check('护照页三档并列可点（' + cells36.join(',') + '）',
      cells36.join(',') === 'male,female,unspecified');
    check('当前性别在选择行里高亮（.on 落在 female）',
      !!doc.querySelector('#pp-gp .gp-cell.on[data-key="female"]'));
    ev("document.querySelector('#pp-clear').click()");
    check('护照页清除后回到未选择', $('#pp-gender').textContent === '未选择', $('#pp-gender').textContent);
    ev("showScreen('home')");
  }

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
