/* scripts/test-content-consistency.js — 跨内容一致性门禁
 *
 * 目的（用户 2026-10-16）：「我们确保我们的项目内容不会相互冲突」
 *   —— 口号无用，做成机械判据。冲突分三类，各有各的判法：
 *
 *   A. **术语冲突**：同一件事在两处叫不同名字 / 说了已经不存在的东西。
 *      典型：证书页 WXML 标题已改「藏文拼读证书」，但**画在证书图片上的字**、
 *      分享文案、导航栏标题、图片 alt 还写着已撤除的「藏文成长证书」。
 *      判据必须**扫玩家可见的字符串**（含 canvas fillText / alt / json 标题），
 *      并**先过 stripComments()** —— 解释性注释里出现旧名是正常的（记录历史）。
 *
 *   B. **数量冲突**：同一总量在不同页面说法不一。
 *      典型：首页写着「共 10 课」，而实际是学习线 150 课 + 天梯 10 课。
 *
 *   C. **悬空引用**：页面调用了一个已经不存在的 API（撤除体系时最容易漏）。
 *      判据：`certificate.X` 之类的调用，X 必须真的在该模块的 exports 里。
 *
 *   D. **两端分叉**：小程序与体验版对同一件事给出不同答案（证书名 / 解锁规则条款）。
 *
 * 反面教训（都是真实踩过的）：
 *   · 只改 WXML 标题、忘了 canvas 里写死的字 → 玩家保存的图上仍是旧名
 *   · 只改小程序、忘了体验版镜像 → 两端分叉
 *   所以本门禁刻意做成**跨文件、跨端、扫玩家可见串**。
 *
 * 用法：node scripts/test-content-consistency.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let PASS = 0, FAIL = 0;
const fails = [];
function chk(cond, name, detail) {
  if (cond) PASS++;
  else { FAIL++; fails.push(name + (detail ? '：' + detail : '')); }
}
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }

// 去注释后再判：注释里提旧体系名是**记录历史**，不是冲突
function stripComments(src) {
  return String(src)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/* ================= A. 术语冲突：已撤除体系的名字不得出现在玩家可见处 ================= */
const RETIRED = [
  { term: '藏文成长证书', why: '12 阶段旧体系的名字（D119 已撤除；现行只有「藏文拼读证书」）' },
  { term: '第', pat: /第\s*\{\{[^}]*\}\}\s*阶段/, why: '旧体系的「阶段」表述（现行只有学习线的「级」）' }
];
const PLAYER_FACING = [
  'pages/index/index.js', 'pages/index/index.wxml',
  'pages/game/game.js', 'pages/game/game.wxml',
  'pages/result/result.js', 'pages/result/result.wxml',
  'pages/cert/cert.js', 'pages/cert/cert.wxml', 'pages/cert/cert.json',
  'pages/passport/passport.js', 'pages/passport/passport.wxml',
  'preview/template.html'
];
let termHits = [];
PLAYER_FACING.forEach(function (rel) {
  if (!exists(rel)) return;
  const clean = stripComments(read(rel));
  RETIRED.forEach(function (r) {
    if (r.pat) {
      if (r.pat.test(clean)) termHits.push(rel + ' 出现旧体系表述 ' + String(r.pat));
      return;
    }
    if (clean.indexOf(r.term) > -1) termHits.push(rel + ' 仍写着「' + r.term + '」（' + r.why + '）');
  });
});
chk(!termHits.length, '玩家可见处不再出现已撤除体系的名字（含 canvas / alt / json 标题）',
  termHits.slice(0, 6).join(' ｜ '));

/* ================= D. 两端分叉：证书名必须一致 ================= */
const mpCert = exists('pages/cert/cert.js') ? stripComments(read('pages/cert/cert.js')) : '';
const h5Tpl = exists('preview/template.html') ? stripComments(read('preview/template.html')) : '';
chk(mpCert.indexOf("fillText('藏文拼读证书'") > -1,
  '小程序：证书画布上写的是「藏文拼读证书」',
  '没找到 canvas 标题绘制');
chk(h5Tpl.indexOf("fillText('藏文拼读证书'") > -1,
  '体验版：证书画布上写的是「藏文拼读证书」',
  '没找到 canvas 标题绘制');
const mpJson = exists('pages/cert/cert.json') ? read('pages/cert/cert.json') : '';
chk(mpJson.indexOf('藏文拼读证书') > -1, '小程序：证书页导航栏标题 = 藏文拼读证书', mpJson.slice(0, 60));
const mpShare = mpCert.indexOf('藏文拼读证书') > -1;
const ppShare = exists('pages/passport/passport.js') ? stripComments(read('pages/passport/passport.js')) : '';
chk(mpShare && ppShare.indexOf('张藏文拼读证书') > -1,
  '两端分享文案里的证书名一致（都是「藏文拼读证书」）');

/* ================= B. 数量冲突：总量说法必须一致 ================= */
const COUNT_FILES = [
  'pages/index/index.wxml', 'preview/template.html', 'pages/game/game.wxml',
  'pages/result/result.wxml'
];
let countBad = [];
COUNT_FILES.forEach(function (rel) {
  if (!exists(rel)) return;
  const clean = stripComments(read(rel));
  // 误导写法：「共 10 课」会把整个学习线说没了
  if (/共\s*10\s*课/.test(clean)) countBad.push(rel + ' 写着「共 10 课」（实际 150 课）');
  if (/共\s*12\s*张/.test(clean)) countBad.push(rel + ' 写着「共 12 张」（现行 15 级证书）');
});
chk(!countBad.length, '总量说法不再误导（没有「共 10 课 / 共 12 张」这类旧口径）', countBad.join('、'));

// 学习线总量：两端都必须能说出 150
function mentions150(rel) {
  if (!exists(rel)) return false;
  const clean = stripComments(read(rel));
  return /150/.test(clean);
}
chk(mentions150('pages/index/index.wxml') && mentions150('pages/index/index.js'),
  '小程序首页能说出 150 课（150 课全景图）');
chk(mentions150('preview/template.html'), '体验版首页能说出 150 课');

/* ================= C. 悬空引用：调用的 API 必须真的存在 ================= */
const certMod = require(path.join(ROOT, 'utils', 'certificate'));
const certExports = Object.keys(certMod);
let dangling = [];
PLAYER_FACING.forEach(function (rel) {
  if (!exists(rel)) return;
  const clean = stripComments(read(rel));
  const re = /certificate\.([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(clean)) !== null) {
    if (certExports.indexOf(m[1]) === -1) dangling.push(rel + ' → certificate.' + m[1] + '()');
  }
});
chk(!dangling.length, '页面不再调用已删除的证书 API（无悬空引用）', dangling.slice(0, 6).join('、'));

/* ================= 解锁规则：两端条款齐备且同义 ================= */
const mpIdx = exists('pages/index/index.js') ? stripComments(read('pages/index/index.js')) : '';
const mpRule = mpIdx.indexOf('function learnLocked') > -1;
const h5Rule = h5Tpl.indexOf('function learnLevelLocked') > -1;
chk(mpRule && h5Rule, '两端的解锁规则都只由一处函数给出（learnLocked / learnLevelLocked）',
  '小程序 ' + mpRule + ' / 体验版 ' + h5Rule);
// 逐条比对**实际标识符**（两端命名不同：小程序 storage.getLearnLevelDone / 体验版 learnLevelDone）
const RULE_CLAUSES = [
  { name: '④ 老线全通 → L2 直开的桥', mp: /function learnOldLineDone/, h5: /function learnOldLineDone/ },
  { name: '② L1 直进', mp: /lv\s*<=\s*1/, h5: /lv\s*<=\s*1/ },
  { name: '③ 读「前一级已完成课数」', mp: /getLearnLevelDone\(/, h5: /learnLevelDone\(/ },
  { name: '① 验收开关全开', mp: /learnVerifyOn\(/, h5: /verifyUnlock/ }
];
RULE_CLAUSES.forEach(function (c) {
  const inMp = c.mp.test(mpIdx), inH5 = c.h5.test(h5Tpl);
  chk(inMp && inH5, '解锁规则两端同款：' + c.name, '小程序 ' + inMp + ' / 体验版 ' + inH5);
});

/* ================= 自证：判据不是空转 ================= */
{
  const fake = "ctx.fillText('藏文成长证书', W / 2, 268);";
  chk(stripComments(fake).indexOf('藏文成长证书') > -1,
    '自证：玩家可见串里的旧名会被抓到（注释里的不会）');
  chk(stripComments("// 旧名藏文成长证书已撤除").indexOf('藏文成长证书') === -1,
    '自证：注释里的旧名不会被误报（记录历史是允许的）');
}

/* ================= 汇总 ================= */
console.log('');
console.log('==========================================');
console.log('  跨内容一致性门禁');
console.log('==========================================');
console.log('  扫描的玩家可见文件 : ' + PLAYER_FACING.filter(exists).length + ' 个');
console.log('  旧体系名残留       : ' + termHits.length);
console.log('  数量口径误导       : ' + countBad.length);
console.log('  悬空证书 API 引用  : ' + dangling.length);
console.log('  ' + (FAIL ? '✗' : '✓') + ' 通过 ' + PASS + ' 项' + (FAIL ? '，失败 ' + FAIL + ' 项' : ''));
if (FAIL) {
  console.log('');
  fails.forEach(function (f) { console.log('   - ' + f); });
}
console.log('==========================================');
process.exit(FAIL ? 1 : 0);
