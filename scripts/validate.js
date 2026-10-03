#!/usr/bin/env node
/**
 * scripts/validate.js — 藏字方块 项目自检脚本
 * 用法: node scripts/validate.js
 * 检查项：JSON语法 / 页面完整性 / 关卡数据 / 文化卡覆盖 / 音效文件 / 禁用API / 事件绑定
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let errors = [];
let warnings = [];
let passed = 0;

function ok(msg) { passed++; console.log('  \x1b[32m✓\x1b[0m ' + msg); }
function err(msg) { errors.push(msg); console.log('  \x1b[31m✗\x1b[0m ' + msg); }
function warn(msg) { warnings.push(msg); console.log('  \x1b[33m!\x1b[0m ' + msg); }
function section(name) { console.log('\n[' + name + ']'); }

function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }
function exists(p) { return fs.existsSync(path.join(ROOT, p)); }

// ---------- 1. JSON 语法 ----------
section('1. JSON 配置文件语法');
const jsonFiles = ['app.json', 'sitemap.json', 'project.config.json',
  'pages/index/index.json', 'pages/game/game.json', 'pages/result/result.json'];
jsonFiles.forEach(f => {
  if (!exists(f)) { err(f + ' 不存在'); return; }
  try { JSON.parse(read(f)); ok(f + ' 语法正确'); }
  catch (e) { err(f + ' JSON 解析失败: ' + e.message); }
});

// ---------- 2. app.json 页面完整性 ----------
section('2. app.json 注册页面完整性');
try {
  const appJson = JSON.parse(read('app.json'));
  appJson.pages.forEach(page => {
    ['.js', '.wxml', '.json', '.wxss'].forEach(ext => {
      const f = page + ext;
      if (exists(f)) ok(f + ' 存在');
      else err(f + ' 缺失（app.json 已注册）');
    });
  });
  if (appJson.pages.length === 3) ok('页面数量 = 3（符合 MVP 规格）');
  else err('页面数量应为 3，实际 ' + appJson.pages.length);
} catch (e) { err('app.json 无法解析，跳过'); }

// ---------- 3. 关卡数据 ----------
section('3. 关卡数据（10关）');
const levelsSrc = read('data/levels.js');
const elementsSrc = read('data/elements.js');
const elementIds = [...elementsSrc.matchAll(/^\s{2}(letter_\d{2}|icon_\d{2}):/gm)].map(m => m[1]);
const levels = eval('(' + levelsSrc.replace(/^module\.exports\s*=\s*/, '').replace(/;\s*$/, '') + ')');
if (levels.length === 10) ok('共 10 关'); else err('应为 10 关，实际 ' + levels.length);
levels.forEach(l => {
  const total = l.elements.reduce((s, e) => s + e[1], 0);
  const grid = l.cols * l.rows;
  if (total !== grid) err('第' + l.level + '关: 总牌数 ' + total + ' ≠ 网格 ' + grid);
  const odd = l.elements.filter(e => e[1] % 2 !== 0);
  if (odd.length) err('第' + l.level + '关: 次数为奇数 ' + odd.map(e => e[0]).join(','));
  const unknown = l.elements.filter(e => !elementIds.includes(e[0]));
  if (unknown.length) err('第' + l.level + '关: 未知元素 ' + unknown.map(e => e[0]).join(','));
  if (total === grid && !odd.length && !unknown.length) ok('第' + l.level + '关: ' + l.cols + '×' + l.rows + ' ' + total + '张牌 OK');
});
if (elementIds.length === 12) ok('元素库 12 个（8字母+4图标）');
else err('元素库应为 12 个，实际 ' + elementIds.length);

// ---------- 4. 文化卡覆盖 ----------
section('4. 文化卡覆盖');
const cardsSrc = read('data/cards.js');
const cardIds = [...cardsSrc.matchAll(/id:\s*'(letter_\d{2}|icon_\d{2})'/g)].map(m => m[1]);
const missing = elementIds.filter(id => !cardIds.includes(id));
if (cardIds.length === 12) ok('文化卡 12 张'); else err('文化卡应为 12 张，实际 ' + cardIds.length);
if (missing.length) err('缺文化卡的元素: ' + missing.join(','));
else ok('每个元素都有对应文化卡');
const requiredFields = ['title', 'subtitle', 'description', 'funFact'];
const cardsArr = eval('(' + cardsSrc.replace(/^module\.exports\s*=\s*/, '').replace(/;\s*$/, '') + ')');
cardsArr.forEach(c => {
  const miss = requiredFields.filter(k => !c[k]);
  if (miss.length) err('文化卡 ' + c.id + ' 缺字段: ' + miss.join(','));
});
ok('文化卡字段完整性检查完成');

// ---------- 5. 音效文件 ----------
section('5. 音效文件');
['tap', 'match', 'mismatch', 'win'].forEach(s => {
  if (exists('audio/' + s + '.wav')) ok('audio/' + s + '.wav 存在');
  else err('audio/' + s + '.wav 缺失');
});

// ---------- 6. 禁用 API（规格红线） ----------
section('6. 禁用 API 检查');
const banned = ['wx.login', 'wx.getUserProfile', 'wx.requestPayment',
  'wx.requestSubscribeMessage', 'getUserInfo', 'cloud.init'];
const jsFiles = [];
(function walk(dir) {
  fs.readdirSync(dir).forEach(f => {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) { if (f !== 'node_modules' && f !== 'scripts') walk(full); }
    else if (f.endsWith('.js')) jsFiles.push(full);
  });
})(ROOT);
let bannedFound = 0;
jsFiles.forEach(f => {
  const src = fs.readFileSync(f, 'utf8');
  banned.forEach(api => {
    if (src.includes(api)) { err(path.relative(ROOT, f) + ' 使用了禁用 API: ' + api); bannedFound++; }
  });
});
if (!bannedFound) ok('未使用任何禁用 API（登录/支付/订阅/云初始化）');

// ---------- 7. WXML 事件绑定 ----------
section('7. WXML 事件绑定与 JS 方法对应');
[['pages/index/index', ['onTapLevel']],
 ['pages/game/game', ['onTapTile', 'onCloseCard', 'noop']],
 ['pages/result/result', ['goHome', 'openNameModal', 'closeNameModal', 'onNameInput', 'confirmGenerate', 'saveToAlbum', 'previewShare']]
].forEach(([page, handlers]) => {
  const wxml = read(page + '.wxml');
  const js = read(page + '.js');
  handlers.forEach(h => {
    if (!wxml.includes(h)) warn(page + '.wxml 未绑定 ' + h);
    else if (!js.includes(h + ':')) err(page + '.js 缺少方法 ' + h);
    else ok(page + ' → ' + h);
  });
});

// ---------- 8. 品牌规范 ----------
section('8. 品牌规范（藏字方块）');
try {
  const appJsonBrand = JSON.parse(read('app.json'));
  if (appJsonBrand.window.navigationBarTitleText === '藏字方块') ok('品牌名「藏字方块」已应用于导航栏');
  else err('导航栏标题应为「藏字方块」');
} catch (e) { err('无法读取 app.json 品牌名'); }
if (read('pages/index/index.wxml').includes('玩方块，认藏文')) ok('Slogan「玩方块，认藏文」已上首页');
else warn('首页缺少 Slogan');
if (read('pages/index/index.wxml').includes('logo-200.png')) ok('首页使用 Logo（200px 完整方块版）');
else warn('首页未引用 Logo');
const brandAssets = ['images/logo-144.png', 'images/logo-200.png', 'images/logo-80.png', 'images/logo-watermark.png', 'images/logo-master.png'];
brandAssets.forEach(f => { if (exists(f)) ok(f + ' 存在'); else err('品牌资产缺失: ' + f); });
// 品牌规范：文字不用纯黑
let pureBlack = 0;
(function scanWxss(dir) {
  fs.readdirSync(dir).forEach(f => {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) { if (f !== 'node_modules' && f !== 'scripts') scanWxss(full); }
    else if (f.endsWith('.wxss')) {
      const src = fs.readFileSync(full, 'utf8');
      if (/:\s*#000000\b/i.test(src) || /:\s*black\b/i.test(src)) {
        err(path.relative(ROOT, full) + ' 使用了纯黑（应改用 #2C3E50）');
        pureBlack++;
      }
    }
  });
})(ROOT);
if (!pureBlack) ok('无纯黑文字色（符合「用 #2C3E50 代替纯黑」规范）');
const resultWxml = read('pages/result/result.wxml');
if (resultWxml.indexOf('恭喜通关') === -1) ok('语气规范：未使用「恭喜通关」（品牌语气用「扎西德勒」）');
else warn('结算页仍使用「恭喜通关」，应改为「扎西德勒」');
const resultJs = read('pages/result/result.js');
if (resultJs.indexOf('恭喜') === -1) ok('语气规范：JS 文案无「恭喜」表述');
else warn('result.js 存在「恭喜」表述');
if (resultJs.includes('玩方块，认藏文')) ok('Slogan 已写入祝福卡');
else warn('祝福卡未包含 Slogan');
if (resultJs.includes('logo-watermark.png')) ok('祝福卡已包含半透明 Logo 水印');
else warn('祝福卡缺少 Logo 水印');

// ---------- 9. 关键能力 ----------
section('9. 关键能力');
if (read('utils/storage.js').includes("'progress'")) ok('进度存储 key = progress');
else warn('未找到 progress 存储约定');
if (read('app.js').includes('loadFontFace')) ok('已接入 wx.loadFontFace 藏文字体加载');
else warn('app.js 未接入 loadFontFace');
if (read('pages/result/result.js').includes('canvasToTempFilePath')) ok('祝福卡 Canvas 导出已接入');
else warn('祝福卡导出未接入');

// ---------- 汇总 ----------
console.log('\n========== 汇总 ==========');
console.log('通过: ' + passed + ' | 错误: ' + errors.length + ' | 警告: ' + warnings.length);
if (errors.length) { console.log('\x1b[31m存在错误，需修复后重试\x1b[0m'); process.exit(1); }
console.log('\x1b[32m全部自检通过 ✓\x1b[0m');
