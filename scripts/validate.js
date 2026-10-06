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

// ---------- 金额 / 折扣 / 结算 字段守卫（第 16 与第 19 节共用） ----------
// 用「词干 + 可选后缀」匹配，而不是精确字段名。
// 背景：上一版写的是 /\bdiscount\s*:/ —— 它挡得住 `discount:`，
// 却**挡不住 `discountRate: 0.9` 与 `maxDiscount: 50`**，
// 而外部方案「所有优惠券统一用百分比折扣」要加的正是这两个字段（2026-10-05 查实并加固）。
// ⚠️ 不要用 'off' 作词干：项目自有字段就叫 `offer`，会被误伤。
const MONEY_STEMS = ['price', 'amount', 'fee', 'discount', 'settle', 'reward',
  'coin', 'coupon', 'voucher', 'commission', 'rebate'];
// ⚠️ data/daily.js 有合法的 `reward:` 字段（签到奖励），所以它用更窄的一组词干
const SETTLE_STEMS = ['price', 'amount', 'discount', 'settle', 'rmb', 'cny'];
function moneyFieldHit(src, stems) {
  return (stems || MONEY_STEMS).filter(k =>
    new RegExp(k + '[A-Za-z]*\\s*:', 'i').test(src));
}
// 具体让利数字：9折 / 8.5 折 / 满100减20 / 10% off
// （平台不是发行方、不是兑付方，券面写出来就等于平台承诺）
const OFFER_DIGIT_PAT = /\d\s*折|\d\s*%\s*off|满\s*\d+\s*减\s*\d+/i;
// 货币符号 / 金额单位。⚠️ 不能用裸 /元/ —— 「元音」「元素」会误伤（23.4b 的教训）
const MONEY_UNIT_PAT = /[¥￥]|元(?!音|素)/;

// ---------- 1. JSON 语法 ----------
section('1. JSON 配置文件语法');
const jsonFiles = ['app.json', 'sitemap.json', 'project.config.json',
  'pages/index/index.json', 'pages/game/game.json', 'pages/result/result.json',
  'pages/cert/cert.json', 'pages/passport/passport.json',
  'pages/benefits/benefits.json'];
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
  if (appJson.pages.length === 6) ok('页面数量 = 6（关卡 / 结算 / 证书 / 护照 / 权益中心）');
  else err('页面数量应为 6，实际 ' + appJson.pages.length);
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
  'wx.requestSubscribeMessage', 'getUserInfo', 'cloud.init',
  // 位置权限：教育/内容类目拿不到，且「按位置推商家」是高危驳回点 → 一律用城市主动选择
  'wx.getLocation', 'wx.getFuzzyLocation', 'wx.chooseLocation'];
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
[['pages/index/index', ['onTapLevel', 'openPassport', 'openBenefits', 'openPanel', 'closePanel', 'doSignIn', 'openBox', 'buyItem', 'waterTree']],
 ['pages/game/game', ['onTapTile', 'dismissCard', 'guideNext', 'speakCard']],
 ['pages/result/result', ['goHome', 'openNameModal', 'closeNameModal', 'onNameInput', 'confirmGenerate', 'saveToAlbum', 'previewShare', 'openCert', 'openPassport']],
 ['pages/cert/cert', ['openNameModal', 'closeNameModal', 'onNameInput', 'confirmName', 'generate', 'saveToAlbum', 'previewShare', 'goPassport', 'goHome']],
 ['pages/passport/passport', ['openCert', 'goHome']],
 ['pages/benefits/benefits', ['onSwitchMode', 'onPickCity', 'onClaim', 'goHome']]
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
// 品牌行已从首页移除（2026-10-06 用户拍板：首页视觉重心交给朝圣天梯）。
// 品牌语的法定载体改为：转发卡（onShareAppMessage）+ 证书绘制 + 祝福签绘制。
const brandWxml = read('pages/index/index.wxml');
const brandJs = read('pages/index/index.js');
if (brandJs.includes('玩方块，认藏文')) ok('Slogan「玩方块，认藏文」保留在首页转发卡（onShareAppMessage）');
else err('品牌语丢失：首页转发卡应含 Slogan「玩方块，认藏文」');
if (brandWxml.includes('logo-200.png')) ok('首页使用 Logo（200px 完整方块版）');
else ok('首页品牌行已按拍板移除（Logo 保留在证书 / 护照等载体）');
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
if (read('pages/result/result.js').includes('drawTibetanWrapped') && exists('utils/tibetan-text.js'))
  ok('藏文 Canvas 断行走 tsheg 规则（utils/tibetan-text.js）');
else warn('祝福卡藏文未使用 tsheg 断行工具（藏文排版规范风险）');

// ---------- 10. P0 冲刺（Gate 1） ----------
section('10. P0 冲刺（连击/特殊方块/发音/引导/埋点/印记）');
if (exists('utils/tracker.js')) ok('埋点模块 utils/tracker.js 存在');
else err('缺少 15 分钟埋点模块');
var gameJs = read('pages/game/game.js');
[['combo', '连击'], ['golden', '特殊方块'], ['pronounce', '发音'], ['guideStep', '新手引导'], ['tracker.track', '埋点接入']]
  .forEach(function (p) {
    if (gameJs.indexOf(p[0]) > -1) ok('game.js 已接入' + p[1]);
    else err('game.js 未接入' + p[1]);
  });
if (gameJs.indexOf('audio.combo(') > -1) ok('连击变调音效已接入');
else warn('连击音效未变调（可接受但建议）');
if (read('utils/storage.js').indexOf('grantStamp') > -1) ok('护照印记存储已接入');
else err('存储层缺少印记能力');
var resultJs2 = read('pages/result/result.js');
if (resultJs2.indexOf('goNext') > -1 && resultJs2.indexOf('next_level_click') > -1) ok('结算页「下一关」+ 埋点已接入');
else err('结算页缺少下一关入口或埋点');
if (resultJs2.indexOf('grantStamp') > -1) ok('通关授予印记逻辑已接入');
else warn('结算页未授予印记');
if (read('pages/index/index.js').indexOf('bestCombo') > -1) ok('首页展示最高连击/印记');
else warn('首页未展示档案数据');
if (exists('audio/voice')) ok('audio/voice 录音目录就绪（README 已说明规格）');
else warn('缺少 audio/voice 录音目录');
if (gameJs.indexOf('first_combination') === -1) warn('字块组合埋点为 V2 玩法占位，暂未接入（符合预期）');

// ---------- 11. 本地体验版（零安装，浏览器） ----------
section('11. 本地体验版（浏览器）');
if (exists('preview/template.html')) ok('preview/template.html 存在');
else err('缺少浏览器体验版模板 preview/template.html');
if (exists('preview/play.html')) ok('preview/play.html 已生成（双击即可玩）');
else warn('preview/play.html 未生成，运行 node scripts/build-h5.js');
if (exists('scripts/build-h5.js')) ok('构建脚本 scripts/build-h5.js 存在');
else err('缺少 scripts/build-h5.js');
if (exists('scripts/test-h5.js')) ok('端到端测试脚本 scripts/test-h5.js 存在');
else warn('缺少 scripts/test-h5.js');
if (exists('preview/play.html')) {
  var play = read('preview/play.html');
  if (play.indexOf('__DATA__') === -1) ok('体验版数据已注入（无残留占位符）');
  else err('preview/play.html 仍含未替换的 __DATA__ 占位符');
  if (play.indexOf('base64') > -1) ok('品牌 Logo 已内联为 base64（离线可用）');
  else warn('体验版未内联 Logo 图片');
  // 与小程序同源：元素/关卡文案必须一致
  var srcElements = read('data/elements.js');
  var missingGlyphs = ['ཀ', 'ཁ', 'ག', 'ང', 'ཅ', 'ཆ', 'ཇ', 'ཉ'].filter(function (g) {
    return srcElements.indexOf(g) > -1 && play.indexOf(g) === -1;
  });
  if (!missingGlyphs.length) ok('8 个藏文字母在体验版中完整');
  else err('体验版缺少藏文字母: ' + missingGlyphs.join(' '));
}

// ---------- 12. 体验修复（弹窗/背景/卡片/牌面尺寸） ----------
section('12. 体验修复（弹窗不打扰 / 背景不单调 / 卡片不简陋 / 牌面统一）');

// 12.1 非阻塞弹窗
var gameWxml = read('pages/game/game.wxml');
var gameWxss = read('pages/game/game.wxss');
if (gameWxml.indexOf('card-sheet') > -1 && gameWxml.indexOf('card-sheet') > -1) ok('文化卡改为底部滑出卡片（card-sheet）');
else err('文化卡未使用底部滑出卡片结构');
if (gameWxml.indexOf('catchtouchmove') === -1 && gameWxml.indexOf('card-mask') === -1)
  ok('已移除阻塞式遮罩（不再抢焦点、不暂停游戏）');
else err('仍存在阻塞式遮罩（card-mask / catchtouchmove）');
if (gameJs.indexOf('showToastTip') > -1) ok('重复匹配走轻提示 showToastTip');
else err('缺少重复匹配轻提示方法 showToastTip');
if (gameJs.indexOf('.showToast(') === -1) ok('无对未定义方法 showToast 的调用（命名一致性）');
else err('game.js 调用了未定义的 showToast（应为 showToastTip）');
if (gameJs.indexOf('this.pendingRemove = [') > -1) ok('配对成功后写入 pendingRemove（保证牌面落定 removed）');
else err('pendingRemove 未被赋值，牌面无法转为 removed');
if (gameJs.indexOf('isCardSeen') > -1 && gameJs.indexOf('markCardSeen') > -1) ok('文化卡「仅首次发现弹出」逻辑已接入');
else err('缺少「仅首次弹出」逻辑');
if (gameJs.indexOf('CARD_AUTO_MS') > -1) ok('文化卡自动收起已实现');
else warn('文化卡未实现自动收起');

// 12.2 藏文化背景层（首页/游戏/结算三页一致）
// 纹样层为 WXSS 平铺背景（base64）；经幡天空层与雪山地面层为 <image>
var sceneryImgs = ['bg-ground.png', 'bg-sky.png'];
[['pages/index/index', '首页'], ['pages/game/game', '游戏页'], ['pages/result/result', '结算页'],
 ['pages/cert/cert', '证书页'], ['pages/passport/passport', '护照页'],
 ['pages/benefits/benefits', '权益中心']].forEach(function (p) {
  var wxml = read(p[0] + '.wxml');
  var wxss = read(p[0] + '.wxss');
  var missImg = sceneryImgs.filter(function (s) { return wxml.indexOf(s) === -1; });
  var patBlock = /\.sc-pattern\s*\{[\s\S]*?\}/.exec(wxss);
  var patOk = !!patBlock && /background-image:\s*url\('data:image\/png;base64,/.test(patBlock[0]) &&
    /background-repeat:\s*repeat/.test(patBlock[0]);
  var hasLayer = wxss.indexOf('.scenery') > -1 && wxss.indexOf('.sc-sky') > -1 && wxss.indexOf('.sc-ground') > -1;
  if (!missImg.length && patOk && hasLayer) ok(p[1] + '背景层完整（平铺菱格纹/经幡/雪山布达拉宫）');
  else err(p[1] + '背景层不完整（缺图: ' + missImg.join(',') + '，纹样平铺: ' + patOk + '，层样式: ' + hasLayer + '）');
});
sceneryImgs.concat(['pat-tile.png']).forEach(function (s) {
  if (exists('images/' + s)) ok('背景资产 images/' + s + ' 存在');
  else err('背景资产缺失: images/' + s);
});

// 12.3 文化卡视觉（不简陋）
[['.card-hero', '渐变头图'], ['.card-medal', '元素徽章'], ['.card-progress', '倒计时进度条'],
 ['.card-fact', '文化小知识区块'], ['.card-desc', '说明文本']].forEach(function (p) {
  if (gameWxss.indexOf(p[0]) > -1) ok('文化卡含' + p[1] + '（' + p[0] + '）');
  else err('文化卡缺少' + p[1] + '（' + p[0] + '）');
});

// 12.4 样式资源健康：不得存在损坏的内联图片（base64 前缀被重复）
var badDataUrl = 0;
(function scanBadUrl(dir) {
  fs.readdirSync(dir).forEach(function (f) {
    var full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) { if (f !== 'node_modules' && f !== 'scripts' && f !== 'preview') scanBadUrl(full); }
    else if (f.endsWith('.wxss') || f.endsWith('.html')) {
      var src = fs.readFileSync(full, 'utf8');
      if (src.indexOf('base64,data:image') > -1) {
        err(path.relative(ROOT, full) + ' 含损坏的 data URL（base64 前缀重复）');
        badDataUrl++;
      }
    }
  });
})(ROOT);
if (!badDataUrl) ok('无损坏的内联 data URL');

// 12.5 牌面尺寸统一（源与体验版保持一致）
if (/REF_COLS/.test(gameJs) && gameJs.indexOf('cfg.cols >= REF_COLS ?') === -1)
  ok('game.js 牌面尺寸以固定基准计算（各关一致）');
else err('game.js 牌面尺寸仍随列数变化（各关不一致）');
var tpl = exists('preview/template.html') ? read('preview/template.html') : '';
if (tpl.indexOf('REF_COLS') > -1 && tpl.indexOf('state.cols >= REF_COLS ?') === -1)
  ok('体验版牌面尺寸同样固定（源与体验版一致）');
else warn('体验版牌面尺寸计算与源不一致');
if (tpl.indexOf('id="board-wrap"') > -1) ok('体验版盘面容器 id 正确（布局生效）');
else err('体验版缺少 id="board-wrap"，盘面布局不会生效');

// ---------- 13. 朗读与藏文排版规则 ----------
section('13. 配对朗读与藏文排版规则');

// 13.1 每次配对成功朗读发音
var matchBody = (gameJs.split('handleMatch: function')[1] || '').split('finalizeMatch: function')[0];
if (matchBody.indexOf('audio.pronounce(') > -1) ok('配对成功路径（handleMatch）中调用了发音朗读');
else err('handleMatch 未调用 audio.pronounce —— 配对后不朗读发音');
if (matchBody.indexOf("track('first_pronunciation')") > -1) ok('首次发音已接入埋点（first_pronunciation）');
else warn('首次发音埋点缺失');
if (read('utils/audio.js').indexOf('activeVoice') > -1) ok('发音为单声部（新发音打断旧发音，避免连击叠音）');
else err('发音未做单声部处理，连击时会叠音');
if (gameJs.indexOf('voiceTimer') > -1 && gameJs.indexOf('clearTimeout(this.voiceTimer)') > -1)
  ok('发音定时器已管理（避免离页后朗读）');
else warn('发音定时器未管理');
// 旧行为：点击即预览发音 —— 已移除，发音只与「成功配对」绑定
if (gameJs.indexOf('tile.type === \'letter\' && this.firstIndex === -1') === -1)
  ok('已移除「点击预览发音」，发音只发生在配对成功时');
else err('仍保留点击预览发音，会与配对朗读重复');

// 13.2 录音清单覆盖
if (exists('audio/voice/README.txt')) {
  var voiceDoc = read('audio/voice/README.txt');
  if (voiceDoc.indexOf('letter_01') > -1 && voiceDoc.indexOf('icon_') > -1)
    ok('录音清单说明覆盖 8 个字母 + 4 个图标（letter_/icon_ 命名与元素 ID 一致）');
  else warn('录音清单未说明图标发音命名（icon_01.mp3 ~ icon_04.mp3）');
} else warn('缺少 audio/voice/README.txt');

// 13.3 藏文排版规范：tsheg 断行 / shad 不居行首，且符号正确
var tibSrc = read('utils/tibetan-text.js');
if (tibSrc.indexOf('U+0F0F') > -1 && tibSrc.indexOf('\u0F08') === -1)
  ok('四垂符标注正确（U+0F0F ༏，非 U+0F08 ༈）');
else err('四垂符字符标注错误（应写 U+0F0F ༏，而不是 U+0F08 ༈）');
if (tibSrc.indexOf('tsheg') > -1 && /分隔符/.test(tibSrc))
  ok('文档已说明 tsheg 是「分隔符」而非标点');
else warn('tsheg 的「分隔符」性质未在代码注释中说明');
var typoDoc = exists('docs/tibetan-typography.md') ? read('docs/tibetan-typography.md') : '';
if (typoDoc.indexOf('\u0F08') === -1 && typoDoc.indexOf('U+0F0F') > -1)
  ok('排版规范文档符号正确（含 U+0F0F ༏，无错误字符 ༈）');
else err('docs/tibetan-typography.md 符号有误（不应出现 ༈ U+0F08）');
if (typoDoc.indexOf('tsheg 切分「字」') > -1 || typoDoc.indexOf('tsheg 切分字') > -1)
  ok('排版规范文档含「tsheg 切分字，shad 切分句」结论');
else warn('排版规范文档缺少一句话结论');
if (exists('scripts/test-tibetan.js')) ok('藏文排版测试脚本 scripts/test-tibetan.js 存在（可复现）');
else err('缺少 scripts/test-tibetan.js，排版规则无法复现验证');

// 13.4 体验版需镜像朗读调用（保持源与体验版一致）
if (tpl.indexOf('pronounce') > -1 && tpl.indexOf('pronounceCount') > -1)
  ok('体验版镜像了配对朗读逻辑（含可测计数）');
else err('体验版未镜像配对朗读逻辑');

// ---------- 14. 成长阶梯与证书体系 ----------
section('14. 成长阶梯与证书体系（12 阶段 · 每 10 关一张证书）');

// 14.1 阶梯数据完整性
var stagesSrc = read('data/stages.js');
var stagesArr = eval('(' + stagesSrc.replace(/^module\.exports\s*=\s*/, '').replace(/;\s*$/, '') + ')');
if (stagesArr.length === 12) ok('成长阶梯 12 个阶段');
else err('成长阶梯应为 12 个阶段，实际 ' + stagesArr.length);
var stageBad = 0;
stagesArr.forEach(function (s, i) {
  if (s.to - s.from + 1 !== 10) { err('第 ' + s.stage + ' 阶段跨度不是 10 关'); stageBad++; }
  if (i > 0 && s.from !== stagesArr[i - 1].to + 1) { err('第 ' + s.stage + ' 阶段与上一阶段区间不连续'); stageBad++; }
  if (!s.name || !s.goal) { err('第 ' + s.stage + ' 阶段缺少 name / goal'); stageBad++; }
});
if (!stageBad) ok('每阶段 10 关、区间连续不重叠、名称与目标完整');
if (stagesArr[0].from === 1 && stagesArr[11].to === 120) ok('阶梯覆盖第 1-120 关');
else err('阶梯应覆盖第 1-120 关（实际 ' + stagesArr[0].from + '-' + stagesArr[11].to + '）');
var openStages = stagesArr.filter(function (s) { return s.open; });
if (openStages.length === 1 && openStages[0].stage === 1)
  ok('MVP 仅开放第一阶段（其余为「敬请期待」占位）');
else warn('已开放阶段数量 = ' + openStages.length + '（MVP 预期为 1）');
if (stagesArr[0].certLines && stagesArr[0].certLines.length)
  ok('第一阶段证书成就行已定义（占位符按真实数据替换）');
else err('第一阶段缺少 certLines 证书文案');
openStages.forEach(function (s) {
  var covered = levels.filter(function (l) { return l.level >= s.from && l.level <= s.to; }).length;
  if (covered === s.to - s.from + 1) ok('「' + s.name + '」在 data/levels.js 中有对应 ' + covered + ' 关数据');
  else err('「' + s.name + '」缺少关卡数据（应 10 关，实际 ' + covered + '）');
});

// 14.2 证书模块
if (exists('utils/certificate.js')) ok('证书模块 utils/certificate.js 存在');
else err('缺少 utils/certificate.js');
var certSrc = exists('utils/certificate.js') ? read('utils/certificate.js') : '';
['onLevelComplete', 'tierOf', 'certNo', 'list', 'stageContent', 'aggregate'].forEach(function (f) {
  if (certSrc.indexOf(f) > -1) ok('certificate.js 提供 ' + f + '()');
  else err('certificate.js 缺少 ' + f + '()');
});
if (certSrc.indexOf("'ZWFK'") > -1) ok('证书编号前缀 ZWFK（藏字方块拼音首字母）');
else err('证书编号前缀缺失');
if (certSrc.indexOf('minAccuracy: 0.95') > -1 && certSrc.indexOf('minAccuracy: 0.80') > -1)
  ok('等级门槛：金 ≥95% / 银 ≥80% / 普通（完成 10 关）');
else err('等级门槛不符合设计（应为金 95% / 银 80%）');
if (certSrc.indexOf('requireClean') > -1) ok('金质证书额外要求「全程无失误」');
else warn('金质证书缺少零失误条件');
if (certSrc.indexOf('stageContent') > -1 && certSrc.indexOf('elementsData') > -1)
  ok('证书成就行按真实关卡数据统计（内容扩充后自动跟随）');
else warn('证书成就行为硬编码，内容扩充后不会自动更新');

// 14.3 存储层
var stSrc = read('utils/storage.js');
['levelStats', 'certs', 'certSeq', 'holderName', 'recordLevelResult', 'saveCert', 'findCert', 'nextCertSeq']
  .forEach(function (k) {
    if (stSrc.indexOf(k) > -1) ok('存储层支持 ' + k);
    else err('存储层缺少 ' + k);
  });

// 14.4 正确率采集与颁发接入
if (/this\.attempts\+\+/.test(gameJs) && /this\.misses\+\+/.test(gameJs))
  ok('game.js 采集配对尝试/失败次数（正确率来源）');
else err('game.js 未采集正确率数据');
if (gameJs.indexOf("'&att=' + that.attempts") > -1 && gameJs.indexOf("'&miss=' + that.misses") > -1)
  ok('结算参数携带 att / miss（正确率随关卡传递）');
else err('结算未传递正确率参数');
if (resultJs2.indexOf('onLevelComplete') > -1) ok('结算页调用证书颁发 onLevelComplete');
else err('结算页未接入证书颁发');
if (resultJs2.indexOf('openCert') > -1 && resultJs2.indexOf('pages/cert/cert') > -1)
  ok('结算页提供「查看证书」入口');
else err('结算页缺少证书入口');
if (read('pages/result/result.wxml').indexOf('cert-banner') > -1)
  ok('结算页展示证书横幅（新得 / 升级）');
else warn('结算页未展示证书横幅');

// 14.5 证书页
var certWxml = read('pages/cert/cert.wxml');
var certPageJs = read('pages/cert/cert.js');
['cert.no', 'cert.holder', 'cert.date', 'cert.lines', 'cert.tierLabel'].forEach(function (k) {
  if (certWxml.indexOf(k) > -1) ok('证书页展示 ' + k);
  else err('证书页缺少 ' + k);
});
if (certWxml.indexOf('藏文成长证书') > -1) ok('证书页标题 = 藏文成长证书');
else err('证书页标题缺失');
if (certPageJs.indexOf('canvasToTempFilePath') > -1) ok('证书页可导出图片（保存 / 分享）');
else err('证书页未导出图片，无法保存分享');
if (certPageJs.indexOf('saveImageToPhotosAlbum') > -1) ok('证书页支持保存到相册');
else warn('证书页不支持保存到相册');
if (certWxml.indexOf('locked-box') > -1 && certWxml.indexOf('tier-box') > -1)
  ok('未获得时展示锁定说明 + 三级门槛规则');
else warn('证书页缺少未获得状态说明');

// 14.6 文化护照
var ppWxml = read('pages/passport/passport.wxml');
['cert-grid', '文化收藏册', '地区印章', '现实足迹', '个人文化图谱'].forEach(function (k) {
  if (ppWxml.indexOf(k) > -1) ok('文化护照含「' + k + '」');
  else err('文化护照缺少「' + k + '」');
});
if (ppWxml.indexOf('wx:for="{{certs}}"') > -1) ok('护照按 12 个证书位渲染（已得高亮 / 未得灰色）');
else err('护照未渲染 12 个证书位');
if (read('pages/index/index.wxml').indexOf('openPassport') > -1)
  ok('首页提供文化护照入口（含证书数 / 阶段进度）');
else warn('首页缺少护照入口');

// 14.7 体验版镜像
if (tpl.indexOf('STAGES') > -1 && tpl.indexOf('certList') > -1 && tpl.indexOf('onLevelComplete') > -1)
  ok('体验版镜像了成长阶梯与证书体系');
else err('体验版未镜像证书体系');
if (tpl.indexOf('screen-passport') > -1 && tpl.indexOf('screen-cert') > -1)
  ok('体验版含文化护照页与证书页');
else err('体验版缺少护照页 / 证书页');
if (tpl.indexOf('ZWFK') > -1) ok('体验版证书编号规则与源一致');
else err('体验版证书编号规则缺失');
if (tpl.indexOf('this.attempts') === -1 && tpl.indexOf('state.attempts++') > -1)
  ok('体验版同样采集正确率（state.attempts）');
else err('体验版未采集正确率');

// ---------- 15. 通关情绪引擎（PRD 4.1 / 4.2） ----------
section('15. 通关情绪引擎（粒子 / 震动 / 藏语语音 / 唐卡画卷 / 藏纸质感）');
(function () {
  var gj = read('pages/game/game.js');
  var gw = read('pages/game/game.wxml');
  var gs = read('pages/game/game.wxss');
  var rj = read('pages/result/result.js');
  var rw = read('pages/result/result.wxml');
  var rs = read('pages/result/result.wxss');
  var aj = read('utils/audio.js');
  var tpl = read('preview/template.html');

  // 15.1 游戏页：粒子 + 震动 + 藏语语音
  if (gj.indexOf('celebrate') > -1 && gw.indexOf('fx-layer') > -1 && gw.indexOf('fx-bit') > -1)
    ok('游戏页有通关粒子层（fx-layer / fx-bit）');
  else err('游戏页缺通关粒子层（game.js celebrate / game.wxml fx-layer）');
  if (gj.indexOf('vibrateShort') > -1) ok('通关触发轻震动（wx.vibrateShort）');
  else err('game.js 未调用 wx.vibrateShort');
  if (gs.indexOf('@keyframes fxPop') > -1 && gs.indexOf('fx-glow') > -1)
    ok('粒子动画样式齐全（fxPop / fxGlow）');
  else err('game.wxss 缺粒子动画（fxPop / fxGlow）');
  if (gj.indexOf('celebrate();') > -1 && gj.indexOf('tashiDelek') > -1)
    ok('通关链路调用 celebrate() + 朗读 tashi_delek');
  else err('finalizeMatch 未接 celebrate() / tashiDelek');

  // 15.2 语音通道
  if (aj.indexOf('function speak') > -1 && aj.indexOf('tashiDelek') > -1 && aj.indexOf('blessing') > -1)
    ok('audio.js 提供 speak / tashiDelek / blessing 通道');
  else err('audio.js 缺 speak / tashiDelek / blessing');
  var voiceReadme = read('audio/voice/README.txt');
  if (voiceReadme.indexOf('tashi_delek.mp3') > -1 && voiceReadme.indexOf('blessing_01.mp3') > -1)
    ok('录音清单含情绪语音（tashi_delek.mp3 / blessing_01.mp3）');
  else err('voice README 缺 tashi_delek.mp3 / blessing_01.mp3 条目');

  // 15.3 结算页：唐卡画卷展开
  if (rw.indexOf('unfurl') > -1 && rw.indexOf('roller-top') > -1 && rw.indexOf('roller-bottom') > -1)
    ok('结算页为唐卡画卷结构（.unfurl + 上下卷轴杆）');
  else err('result.wxml 缺画卷结构（unfurl / roller）');
  if (rs.indexOf('@keyframes unfurl') > -1) ok('画卷展开动画已定义（unfurl）');
  else err('result.wxss 缺 @keyframes unfurl');
  if (rj.indexOf('audio.blessing()') > -1) ok('结算页进入时播放舒缓祝福语');
  else err('result.js 未调用 audio.blessing()');

  // 15.4 Canvas 藏文字体守卫（PRD 八：Canvas 绘制藏文需降级方案）
  if (rj.indexOf('fontLoaded') > -1 && rj.indexOf('tashi-delek.png') > -1)
    ok('祝福卡藏文有字体守卫（fontLoaded → 预渲染 PNG 回退）');
  else err('result.js 缺 Canvas 藏文字体守卫（fontLoaded / tashi-delek.png）');
  if (exists('images/tashi-delek.png')) ok('预渲染藏文回退图 images/tashi-delek.png 存在');
  else err('缺少 images/tashi-delek.png（Canvas 藏文回退图）');
  if (read('pages/cert/cert.js').indexOf('Microsoft Himalaya') > -1)
    ok('证书页藏文字体链含系统喜马拉雅字体兜底');
  else err('cert.js 藏文字体链未含 Microsoft Himalaya 兜底');

  // 15.5 藏纸颗粒质感（PRD 1.2）
  var appCss = read('app.wxss');
  var grainPages = ['pages/index/index', 'pages/game/game', 'pages/result/result'];
  var allGrain = grainPages.every(function (p) { return read(p + '.wxml').indexOf('class="grain"') > -1; });
  if (appCss.indexOf('.grain') > -1 && appCss.indexOf('background-repeat: repeat') > -1 && allGrain)
    ok('藏纸颗粒噪点层已应用到首页/游戏/结算三页');
  else err('颗粒质感层不完整（app.wxss .grain 或页面 class="grain"）');

  // 15.6 体验版镜像一致性
  if (tpl.indexOf('fx-bit') > -1 && tpl.indexOf('unfurl') > -1 && tpl.indexOf('celebrate') > -1 &&
      tpl.indexOf('tashi_delek') > -1 && tpl.indexOf('blessing_01') > -1)
    ok('体验版已镜像情绪引擎（celebrate / 语音 / 画卷）');
  else err('preview/template.html 未镜像情绪引擎');
})();

// ---------- 16. 权益中心（双轨制）合规自检 ----------
section('16. 权益中心（双轨制）');
(function () {
  const mchSrc = read('data/merchants.js');
  const benSrc = read('utils/benefits.js');
  const bw = read('pages/benefits/benefits.wxml');
  const bj = read('pages/benefits/benefits.js');
  const iw = read('pages/index/index.wxml');
  const tpl = read('preview/template.html');

  let merchants = [];
  try { merchants = require(path.join(ROOT, 'data', 'merchants')); }
  catch (e) { err('data/merchants.js 无法加载: ' + e.message); }

  // 16.1 双轨标签
  const tracks = {};
  merchants.forEach(m => { tracks[m.track] = (tracks[m.track] || 0) + 1; });
  if (tracks.local > 0 && tracks.tourist > 0 && tracks.both > 0)
    ok('双轨标签齐全（本地生活 ' + tracks.local + ' / 游客专属 ' + tracks.tourist + ' / 通用 ' + tracks.both + '）');
  else err('双轨标签不全（需同时有 local / tourist / both）');
  if (merchants.some(m => m.need === 0)) ok('存在 need=0 的权益（新用户即可领取，闭环不空转）');
  else err('缺少 need=0 的权益，新用户无券可领');

  // 16.2 券不承载金额（最关键的一条定性）
  const moneyHit = ['¥', '元'].filter(sym => mchSrc.indexOf(sym) > -1);
  if (!moneyHit.length) ok('商家数据不含任何金额字样（¥/元）—— 券不承载金额');
  else err('data/merchants.js 出现金额字样：' + moneyHit.join('、') + '（券不得承载金额）');
  const moneyField = moneyFieldHit(mchSrc);
  if (!moneyField.length) ok('商家数据无金额 / 折扣 / 结算字段（含 discountRate、maxDiscount 等变体）');
  else err('data/merchants.js 含金额或结算字段：' + moneyField.join('、'));

  // 16.2b 券面不得出现具体让利数字（折扣率 / 满减 / % off）
  // 平台不是发行方、不是兑付方：写出来就等于平台承诺，商家的店内促销由商家自己印。
  const offerDigit = mchSrc.match(OFFER_DIGIT_PAT);
  if (!offerDigit) ok('券面不含任何具体让利数字（折扣率 / 满减 / % off）');
  else err('data/merchants.js 出现具体让利数字：' + offerDigit[0]);

  // 16.2c 反例自测：上面的守卫必须真的拦得住这些写法
  // （否则只是「碰巧现在干净」——尤其是 discountRate / maxDiscount 这两个漏网写法）
  const MONEY_NEG = [
    "id: 'x', discountRate: 0.9",
    "id: 'x', maxDiscount: 50",
    "id: 'x', price: 100",
    "id: 'x', commission: 0.1",
    "id: 'x', settle: 'monthly'",
    "offer: '凭凭证享 9 折'",
    "offer: '满100减20'",
    "offer: '10% off'",
    "offer: '立减 5 元'"
  ];
  const slipped = MONEY_NEG.filter(s =>
    !moneyFieldHit(s).length && !OFFER_DIGIT_PAT.test(s) && !/元/.test(s) && s.indexOf('¥') === -1);
  if (!slipped.length)
    ok('反例自测通过：' + MONEY_NEG.length + ' 种写法全部被拦（含 discountRate / maxDiscount）');
  else err('门禁有缺口，以下写法能溜进来：' + slipped.join(' | '));

  // 16.3 宗教场所与文物景区不得商业联动
  const sacred = ['布达拉宫', '大昭寺', '小昭寺', '扎什伦布寺', '哲蚌寺', '色拉寺', '甘丹寺', '寺庙', '寺院', '景区'];
  const mchText = merchants.map(m => m.name + m.category + m.offer).join('|');
  const sacredHit = sacred.filter(s => mchText.indexOf(s) > -1);
  if (!sacredHit.length) ok('未把宗教活动场所 / 文物景区列入商业权益');
  else err('data/merchants.js 出现宗教场所或景区字样：' + sacredHit.join('、'));

  // 16.4 定性声明必须出现在券卡上
  if (benSrc.indexOf('PROVIDER_NOTE') > -1 && benSrc.indexOf('不参与交易') > -1)
    ok('权益定性声明已定义（由商家提供并兑现 · 平台不参与交易）');
  else err('utils/benefits.js 缺 PROVIDER_NOTE 定性声明');
  if (bw.indexOf('providerNote') > -1) ok('每张权益卡都展示定性声明');
  else err('benefits.wxml 未展示 providerNote');
  if (benSrc.indexOf('不涉及任何支付与资金结算') > -1)
    ok('页面级声明含「不涉及任何支付与资金结算」');
  else err('缺少页面级合规声明');

  // 16.5 双轨前端：Tab 一键切换 + 城市主动选择（不用定位）
  if (bw.indexOf('onSwitchMode') > -1 && bw.indexOf("mode === 'local'") > -1 && bw.indexOf("mode === 'tourist'") > -1)
    ok('前端双轨 Tab 可一键切换（本地生活 / 游客专属）');
  else err('benefits.wxml 缺双轨 Tab 切换');
  if (bw.indexOf('onPickCity') > -1 && benSrc.indexOf('CITIES') > -1)
    ok('城市由用户主动选择（不申请任何位置权限）');
  else err('缺少城市主动选择（不得用定位）');
  if (bj.indexOf('onSwitchMode') > -1 && bj.indexOf('onPickCity') > -1 && bj.indexOf('onClaim') > -1)
    ok('权益页方法齐全（切换模式 / 选城市 / 领取凭证）');
  else err('benefits.js 方法不全');

  // 16.6 首次进入用内嵌引导而非弹窗（沿用「不打断用户」约束）
  if (bw.indexOf('bn-guide') > -1 && bw.indexOf('你是从哪里来') > -1)
    ok('首次进入用内嵌引导卡（不弹窗、不打断）');
  else err('缺少内嵌模式引导');
  if (bw.indexOf('showModal') === -1 && bj.indexOf('showModal') === -1)
    ok('权益中心未使用阻塞式弹窗');
  else err('权益中心使用了 showModal（与「不弹窗」约束冲突）');

  // 16.7 入口与镜像
  if (iw.indexOf('openBenefits') > -1) ok('首页已接入权益中心入口');
  else err('index.wxml 缺权益中心入口');
  if (tpl.indexOf('screen-benefits') > -1 && tpl.indexOf('renderBenefits') > -1 &&
      tpl.indexOf('BENEFIT_PROVIDER') > -1 && tpl.indexOf('claimBenefit') > -1)
    ok('体验版已镜像权益中心（双轨 Tab / 领取 / 定性声明）');
  else err('preview/template.html 未镜像权益中心');

  // 16.8 存储层
  const st = read('utils/storage.js');
  if (st.indexOf('userMode') > -1 && st.indexOf('benefits') > -1 && st.indexOf('benefitSeq') > -1)
    ok('进度存储已扩展（userMode / benefits / benefitSeq）');
  else err('utils/storage.js 缺权益字段');
})();

// ---------- 17. PRD v4 留存系统（藤蔓地图 / 签到 / 唐卡 / 道具 / 菩提树） ----------
section('17. 留存系统与首页重构（PRD v4）');

(function () {
  // 17.1 首页数据：五地剪影区间无缝覆盖 1-10 关
  const regSrc = exists('data/regions.js') ? read('data/regions.js') : '';
  const regions = regSrc ? eval('(' + regSrc.replace(/^module\.exports\s*=\s*/, '').replace(/;\s*$/, '') + ')') : [];
  if (regions.length === 5) ok('data/regions.js 五个地区剪影');
  else err('data/regions.js 应为 5 个地区，实际 ' + regions.length);
  const cover = {};
  let overlap = 0;
  regions.forEach(r => { for (let n = r.from; n <= r.to; n++) { cover[n] = (cover[n] || 0) + 1; if (cover[n] > 1) overlap++; } });
  const gap = [];
  for (let n = 1; n <= 10; n++) if (!cover[n]) gap.push(n);
  if (!overlap && !gap.length) ok('地区区间无缝覆盖第 1-10 关（不重叠、无缺口）');
  else err('地区区间覆盖有误（重叠 ' + overlap + ' / 缺口 ' + gap.join(',') + '）');
  const SHAPES = ['potala', 'forest', 'valley', 'monastery', 'snow'];
  const badShape = regions.filter(r => SHAPES.indexOf(r.shape) === -1);
  if (!badShape.length) ok('地区剪影形状均在样式表定义内（' + SHAPES.join('/') + '）');
  else err('存在未定义剪影形状：' + badShape.map(r => r.shape).join('、'));

  // 17.2 daily 数据合规：不含金额 / 结算字段（签到、盲盒、道具只用本地点数）
  const dailySrc = exists('data/daily.js') ? read('data/daily.js') : '';
  const daily = dailySrc ? eval('(' + dailySrc.replace(/^module\.exports\s*=\s*/, '').replace(/;\s*$/, '') + ')') : {};
  if (/[¥￥元]/.test(dailySrc)) err('data/daily.js 含金额字样（¥/￥/元）—— 奖励须为本地积分/道具');
  else ok('data/daily.js 不含任何金额字样（签到/盲盒/道具不承载金额）');
  const moneyKey = moneyFieldHit(dailySrc, SETTLE_STEMS);
  if (!moneyKey.length) ok('data/daily.js 无 price/amount/discount/settle 字段（不经手结算，含变体）');
  else err('data/daily.js 含结算字段：' + moneyKey.join('、'));
  if ((daily.signInRewards || []).length === 7) ok('祈福长明灯为 7 天循环签到');
  else err('签到奖励应为 7 天，实际 ' + (daily.signInRewards || []).length);
  const KINDS = ['points', 'card', 'item', 'oil'];
  const badKind = (daily.signInRewards || []).filter(r => KINDS.indexOf(r.kind) === -1);
  if (!badKind.length) ok('签到奖励类型均为本地奖励（points/card/item/oil）');
  else err('签到奖励存在非法类型：' + badKind.map(r => r.kind).join('、'));
  if ((daily.trivia || []).length >= 6) ok('非遗盲盒小知识 ≥ 6 条（只装文化知识）');
  else err('非遗盲盒小知识不足 6 条');
  if ((daily.shop || []).length >= 2 && (daily.shop || []).every(it => typeof it.cost === 'number' && it.cost > 0))
    ok('道具铺道具以积分标价（cost 为正数，非金额）');
  else err('道具铺道具缺少积分 cost');
  if (daily.tree && daily.tree.water > 0) ok('菩提树浇水奖励为本地积分（无广告施肥）');
  else err('data/daily.js 缺菩提树配置');
  if (daily.winter && (daily.winter.items || []).length) ok('冬游西藏为静态文化专题（不涉及地图/下单）');
  else err('data/daily.js 缺冬游西藏内容');

  // 17.3 collect 纯逻辑模块（页面只做绑定，规则集中在 utils/）
  const colSrc = exists('utils/collect.js') ? read('utils/collect.js') : '';
  ['rateStars', 'advanceSignIn', 'nextFragment', 'fragmentComplete', 'pickDaily', 'waterReward'].forEach(fn => {
    if (colSrc.indexOf(fn) > -1) ok('utils/collect.js 提供 ' + fn + '()');
    else err('utils/collect.js 缺少 ' + fn + '()');
  });
  if (/FRAGMENT_TOTAL\s*=\s*9/.test(colSrc)) ok('唐卡碎片总数 = 9（3×3 一幅）');
  else err('唐卡碎片总数应为 9');
  if (/CYCLE_DAYS\s*=\s*7/.test(colSrc)) ok('签到循环 = 7 天');
  else err('签到循环应为 7 天');
  if (colSrc.indexOf('require(') === -1) ok('utils/collect.js 为纯函数模块（不依赖 wx / DOM）');
  else err('utils/collect.js 不应依赖其他模块');

  // 17.4 首页结构（朝圣天梯地图 / 悬浮入口 / 底部平层 / 资源条 / 入口面板）
  const iw = read('pages/index/index.wxml');
  ['vine-map', 'vine-stem', 'region', 'side-rail', 'dock', 'entry-panel', 'res-bar',
   'ladder-heaven', 'ladder-village', 'ladder-flags', 'node-deco'].forEach(cls => {
    if (iw.indexOf(cls) > -1) ok('index.wxml 含 ' + cls);
    else err('index.wxml 缺少 ' + cls);
  });
  // 文化红线：宗教符号只作装饰，不得成为可消除对象（不在 game 页元素表内）
  // 硬约束：佛塔 / 酥油灯 一旦进入元素库即判错；
  // 待决：莲花 / 经幡 目前仍是 icon_02 / icon_04 的可消除牌面 → 记警告（见 docs/DECISIONS.md D25）
  const elsSrc = read('data/elements.js');
  ['佛塔', '酥油灯'].forEach(sym => {
    if (elsSrc.indexOf(sym) === -1) ok('宗教符号「' + sym + '」不作为消除元素');
    else err('data/elements.js 出现宗教符号「' + sym + '」（违反文化红线）');
  });
  ['莲花', '经幡'].forEach(sym => {
    if (elsSrc.indexOf(sym) === -1) ok('宗教符号「' + sym + '」已不作为消除元素');
    else warn('牌面仍含「' + sym + '」：与「不作娱乐化消除对象」红线冲突，待拍板（DECISIONS.md D25）');
  });
  if (iw.indexOf('wx:if="{{canSignIn}}"') > -1 && iw.indexOf('side-dot') > -1)
    ok('签到红点仅在未签到时显示（canSignIn 控制）');
  else err('侧栏红点未受 canSignIn 控制');
  const ij = read('pages/index/index.js');
  ['openPanel', 'closePanel', 'doSignIn', 'openBox', 'buyItem', 'waterTree'].forEach(fn => {
    if (ij.indexOf(fn + ':') > -1) ok('index.js 提供 ' + fn + '()');
    else err('index.js 缺少 ' + fn + '()');
  });
  if (ij.indexOf('collect.advanceSignIn') > -1 && ij.indexOf('res.state') > -1)
    ok('签到走纯函数 advanceSignIn 且持久化 res.state');
  else err('签到未复用纯函数 advanceSignIn（或未持久化 state）');
  if (ij.indexOf('showModal') === -1) ok('首页入口面板不使用阻塞式弹窗');
  else err('首页使用了 showModal（与「不打扰」约束冲突）');

  // 17.5 结算页星级 / 积分 / 碎片（只增不减）
  const rw = read('pages/result/result.wxml');
  const rj = read('pages/result/result.js');
  if (rw.indexOf('result-stars') > -1 && rw.indexOf('starList') > -1) ok('结算页展示本关星级（starList）');
  else err('结算页缺少星级展示');
  if (rw.indexOf('reward-row') > -1 && rw.indexOf('fragmentNew') > -1) ok('结算页展示积分入账 + 唐卡碎片掉落');
  else err('结算页缺少奖励展示');
  if (rj.indexOf('collect.rateStars') > -1 && rj.indexOf('recordStars') > -1) ok('结算页星级只增不减（recordStars）');
  else err('结算页未记录星级');
  if (rj.indexOf('addFragment') > -1 && rj.indexOf('nextFragment') > -1) ok('结算页确定性掉落唐卡碎片（不重复）');
  else err('结算页未掉落碎片');

  // 17.6 体验版镜像（源与镜像必须一致，否则体验版测不了）
  const tplHtml = read('preview/template.html');
  ['vine-map', 'side-rail', 'entry-panel', 'renderVine', 'refreshHomeV4', 'openPanel',
    'doSignIn', 'buyItem', 'waterTree', 'rateStars', 'res-stars', 'res-rewards',
    'ladder-heaven', 'ladder-village', 'ladder-flags'].forEach(key => {
    if (tplHtml.indexOf(key) > -1) ok('体验版已镜像 ' + key);
    else err('preview/template.html 未镜像 ' + key);
  });
  if (tplHtml.indexOf('function advanceSignIn') > -1 && tplHtml.indexOf('res.state') > -1)
    ok('体验版 advanceSignIn 契约与 utils/collect.js 一致（返回 state）');
  else err('体验版 advanceSignIn 返回值与源不一致');

  // 17.7 存储层扩展（进度字段只增不减）
  const stSrc = read('utils/storage.js');
  ['addPoints', 'spendPoints', 'recordStars', 'applySignIn', 'addOil', 'addFragment', 'addItem', 'waterPot']
    .forEach(fn => {
      if (new RegExp('function ' + fn + '\\s*\\(').test(stSrc)) ok('storage.js 提供 ' + fn + '()');
      else err('utils/storage.js 缺少 ' + fn + '()');
    });
})();

// ---------- 18. 全局视觉底盘（暗金光晕底图 + 金色棋盘底盘） ----------
(function () {
  section('18. 全局视觉底盘');

  const PAGES = ['index', 'game', 'result', 'cert', 'passport', 'benefits'];

  // 18.1 底图资产存在（小程序全尺寸 + H5 压缩版）
  ['images/bg-global.jpg', 'images/bg-global-h5.jpg'].forEach(f => {
    if (exists(f)) ok('底图资产存在：' + f);
    else err('缺少底图资产：' + f);
  });

  // 18.2 六个页面统一六层背景（底图/纹样/颗粒/地面/天空/夜色罩）
  const LAYERS = ['sc-bg', 'sc-pattern', 'grain', 'sc-ground', 'sc-sky', 'sc-night'];
  PAGES.forEach(p => {
    const wxml = read('pages/' + p + '/' + p + '.wxml');
    const missing = LAYERS.filter(k => wxml.indexOf('class="' + k + '"') === -1);
    if (missing.length === 0) ok('页面 ' + p + ' 背景六层齐全');
    else err('页面 ' + p + ' 背景层缺失：' + missing.join('/'));
  });

  // 18.3 底图引用必须走 images/bg-global.jpg（禁止回退纯色）
  PAGES.forEach(p => {
    const wxml = read('pages/' + p + '/' + p + '.wxml');
    if (wxml.indexOf('src="/images/bg-global.jpg"') > -1) ok('页面 ' + p + ' 已挂载全局底图');
    else err('页面 ' + p + ' 未挂载 /images/bg-global.jpg');
  });

  // 18.4 禁止纯白页面底：page 背景不得为 #FFFFFF / #FFF
  const appWxss = read('app.wxss');
  if (/page\s*\{[^}]*background:\s*#(FFF|FFFFFF)/i.test(appWxss)) err('app.wxss 的 page 背景是纯白（违反底线）');
  else ok('app.wxss 的 page 背景非纯白');

  // 18.5 棋盘底盘 = 金色渐变 + 厚重外阴影（multiplier 检查关键 token）
  const gameWxss = read('pages/game/game.wxss');
  const panelM = gameWxss.match(/\.board-panel\s*\{([^}]*)\}/);
  if (!panelM) err('未找到 .board-panel 规则');
  else {
    const body = panelM[1];
    if (/linear-gradient\(\s*15[0-9]deg/.test(body)) ok('棋盘底盘为金色斜向渐变');
    else err('棋盘底盘缺少金色渐变');
    const shadows = (body.match(/rgba\(0,\s*0,\s*0/g) || []).length;
    if (shadows >= 2) ok('棋盘底盘有多层厚重外阴影（' + shadows + ' 层暗影）');
    else err('棋盘底盘外阴影层数不足（' + shadows + '）');
    if (/inset/.test(body)) ok('棋盘底盘含内阴影（浮雕高光）');
    else err('棋盘底盘缺少内阴影');
  }

  // 18.6 底盘与格子之间有明确分隔：内圈凹槽必须有内阴影
  const outlineM = gameWxss.match(/\.board-outline\s*\{([^}]*)\}/);
  if (outlineM && /inset/.test(outlineM[1])) ok('底盘内圈为下沉凹槽（inset 阴影，形成分隔）');
  else err('底盘内圈缺少下沉内阴影');

  // 18.7 体验版必须镜像底图与金色底盘
  const tpl = read('preview/template.html');
  ['sc-bg', 'sc-night', 'bgGlobal'].forEach(k => {
    if (tpl.indexOf(k) > -1) ok('体验版已镜像 ' + k);
    else err('preview/template.html 未镜像 ' + k);
  });
  if (/#screen-game \.board-panel[\s\S]{0,320}linear-gradient\(158deg/.test(tpl))
    ok('体验版棋盘底盘已同步金色渐变');
  else err('体验版棋盘底盘未同步金色渐变');

  // 18.8 镜像构建脚本必须内联全局底图
  const buildSrc = read('scripts/build-h5.js');
  if (buildSrc.indexOf('bg-global-h5.jpg') > -1 && buildSrc.indexOf('bgGlobal') > -1)
    ok('build-h5.js 已内联全局底图（bg-global-h5.jpg）');
  else err('build-h5.js 未内联全局底图');
})();

// ---------- 19. 万家灯火祈福跳窗（纯静态：无网络 / 无竞争字眼 / 每天一次） ----------
(function () {
  section('19. 万家灯火祈福跳窗');

  // 19.1 数据与逻辑层文件
  ['data/lamp.js', 'utils/lamp.js'].forEach(f => {
    if (exists(f)) ok('存在 ' + f);
    else err('缺少 ' + f);
  });

  // 19.2 纯逻辑行为（真跑一遍，不靠肉眼）
  const lamp = require(path.join(ROOT, 'utils', 'lamp'));
  if (lamp.isFirstOpenToday('2026-10-04', '2026-10-05')) ok('跨天视为当天首次打开');
  else err('isFirstOpenToday 跨天判断错误');
  if (!lamp.isFirstOpenToday('2026-10-05', '2026-10-05')) ok('同一天不再重复展示');
  else err('isFirstOpenToday 同一天应返回 false');
  if (lamp.lightOne(128456) === 128457) ok('点亮一盏灯：总数 128456 → 128457');
  else err('lightOne 增量错误：' + lamp.lightOne(128456));
  if (lamp.formatCount(128456) === '128,456') ok('数字千分位格式化正确');
  else err('formatCount 结果错误：' + lamp.formatCount(128456));
  if (lamp.fill('今日全国共点亮 {total} 盏灯', { total: '128,456' }) === '今日全国共点亮 128,456 盏灯')
    ok('文案占位符代入正确（数字不写死在文案里）');
  else err('fill 占位符代入错误');

  // 19.3 数据合规：固定数据齐备 + 无营销/竞争字段
  const lampData = require(path.join(ROOT, 'data', 'lamp'));
  if (lampData.provinces.length === 5) ok('五地灯火数据齐备');
  else err('data/lamp.js 应为 5 个地区，实际 ' + lampData.provinces.length);
  ['price', 'amount', 'fee', 'discount', 'settle', 'reward', 'coin'].forEach(k => {
    if (!Object.prototype.hasOwnProperty.call(lampData, k)) ok('data/lamp.js 无字段 ' + k + '（不承载交易/奖励）');
    else err('data/lamp.js 含交易/奖励字段 ' + k);
  });

  // 19.4 文化红线：文案不得出现竞争性或营销字眼（逐文件机械扫描）
  //      index.wxml 只扫祈福跳窗区块（首页其它面板的既有标题不在此约束内）
  const BAN_WORDS = ['排行', '名次', '战区', '金币', '优惠券', '折扣', '抽奖', '返现', '广告'];
  const iwAll = read('pages/index/index.wxml');
  const lampBlock = iwAll.slice(iwAll.indexOf('lamp-mask'));
  [['data/lamp.js', read('data/lamp.js')], ['pages/index/index.wxml（跳窗区块）', lampBlock]].forEach(pair => {
    const hit = BAN_WORDS.filter(w => pair[1].indexOf(w) > -1);
    if (!hit.length) ok(pair[0] + ' 无竞争性/营销字眼');
    else err(pair[0] + ' 出现禁用字眼：' + hit.join('、'));
  });

  // 19.5 纯静态：祈福跳窗相关代码不得出现网络请求与云能力
  // 注：这里刻意写成「网络请求接口 / 云函数」的措辞，避免禁用 API 字面量污染源码扫描
  const lampJs = read('utils/lamp.js') + read('data/lamp.js');
  ['wx.request', 'wx.cloud', 'callFunction', 'wx.login', 'getUserInfo', 'getLocation'].forEach(api => {
    if (lampJs.indexOf(api) === -1) ok('祈福跳窗数据/逻辑层未使用 ' + api);
    else err('祈福跳窗代码出现 ' + api + '（本版必须纯静态）');
  });

  // 19.6 首页结构：跳窗节点与按钮齐备 + 事件已绑定
  const iw2 = read('pages/index/index.wxml');
  ['lamp-mask', 'lamp-card', 'lamp-flame', 'lamp-list', 'lamp-btn', 'onLightLamp', 'closeLampWindow']
    .forEach(cls => {
      if (iw2.indexOf(cls) > -1) ok('index.wxml 含 ' + cls);
      else err('index.wxml 缺少 ' + cls);
    });
  const ij2 = read('pages/index/index.js');
  ['buildLampView:', 'onLightLamp:', 'closeLampWindow:'].forEach(fn => {
    if (ij2.indexOf(fn) > -1) ok('index.js 提供 ' + fn);
    else err('index.js 缺少 ' + fn);
  });
  if (ij2.indexOf('vibrateShort') > -1) ok('点亮后触发微震动（vibrateShort）');
  else err('点亮后未触发微震动');
  if (ij2.indexOf('storage.markLampDay') > -1 && ij2.indexOf('isFirstOpenToday') > -1)
    ok('每天首次打开的判断与记录走纯函数 + 存储');
  else err('跳窗未受「每天首次打开」控制');
  if (read('pages/index/index.wxss').indexOf('sparkFly') > -1) ok('点亮后有金粉爆炸粒子动效');
  else err('缺少金粉爆炸粒子动效');

  // 19.7 存储层：lampDay 字段（只作为展示记录，不承载任何权益）
  const stSrc2 = read('utils/storage.js');
  ['function getLampDay', 'function markLampDay', 'lampDay:'].forEach(k => {
    if (stSrc2.indexOf(k) > -1) ok('storage.js 含 ' + k);
    else err('storage.js 缺少 ' + k);
  });

  // 19.8 体验版镜像 + 构建注入
  const tpl2 = read('preview/template.html');
  ['lamp-mask', 'lamp-btn', 'renderLamp', 'lightLamp', 'maybeShowLamp', 'sparkFly'].forEach(k => {
    if (tpl2.indexOf(k) > -1) ok('体验版已镜像 ' + k);
    else err('preview/template.html 未镜像 ' + k);
  });
  if (read('scripts/build-h5.js').indexOf("'lamp'") > -1) ok('build-h5.js 已注入 data/lamp.js');
  else err('build-h5.js 未注入 data/lamp.js');
})();

// ---------- 20. 朝圣天梯动效（入场升起 / 台阶错峰 / 莲花绽放 / 点击回弹） ----------
(function () {
  section('20. 朝圣天梯动效');

  // 20.1 纯几何模块：只做坐标换算，不碰 wx / DOM / 网络
  const ladSrc = exists('utils/ladder.js') ? read('utils/ladder.js') : '';
  if (ladSrc) ok('utils/ladder.js 存在');
  else err('缺少 utils/ladder.js（天梯动效几何应集中在纯函数模块）');
  if (ladSrc && ladSrc.indexOf('require(') === -1) ok('utils/ladder.js 为纯函数模块（不依赖其他模块）');
  else err('utils/ladder.js 不应 require 任何模块');
  ['wx.request', 'wx.cloud', 'callFunction', 'wx.login', 'getUserInfo', 'getLocation'].forEach(api => {
    if (ladSrc.indexOf(api) === -1) ok('天梯动效未使用 ' + api);
    else err('utils/ladder.js 出现 ' + api + '（动效必须纯本地）');
  });

  if (ladSrc) {
    const lad = require(path.join(ROOT, 'utils', 'ladder'));
    // 第 1 关在山脚：仍要先多露一段山脚，再升上去（方向恒为上行）
    const p1 = lad.buildPlan({ mapTop: 300, mapHeight: 660, viewportHeight: 667, nodeTopPct: 88 });
    if (p1.settle > 0 && p1.foot > p1.settle && p1.rise > 0) ok('山脚台阶：山脚 → 停靠 两段目标齐备');
    else err('山脚台阶动效计划异常：' + JSON.stringify(p1));
    // 第 10 关在山顶：停靠点必须更靠上
    const p10 = lad.buildPlan({ mapTop: 300, mapHeight: 660, viewportHeight: 667, nodeTopPct: 6.1 });
    if (p10.settle < p1.settle) ok('越靠山顶停靠点越靠上（第 10 关 settle < 第 1 关）');
    else err('停靠点未随关卡上升：' + JSON.stringify(p10));
    // 越界保护：不给负数滚动值
    const pNeg = lad.buildPlan({ mapTop: -500, mapHeight: 100, viewportHeight: 900, nodeTopPct: 0 });
    if (pNeg.settle === 0 && pNeg.foot === 200) ok('越界时滚动目标归零（不出现负值）');
    else err('越界保护失效：' + JSON.stringify(pNeg));
    // 异常输入不抛错
    let badOk = true;
    try {
      const b = lad.buildPlan({});
      badOk = b.settle === 0 && typeof b.foot === 'number';
    } catch (e) { badOk = false; }
    if (badOk) ok('异常/空输入安全回落默认值（不抛错）');
    else err('异常输入导致 buildPlan 抛错或返回非法值');
  }

  // 20.2 首页结构：入场类名 / 错峰延迟 / 点击回弹 / 莲花绽放
  const iw3 = read('pages/index/index.wxml');
  ['ladderIn', 'hover-class="node-press"', 'animation-delay', 'node-bloom', 'onTapLevel'].forEach(k => {
    if (iw3.indexOf(k) > -1) ok('index.wxml 含 ' + k);
    else err('index.wxml 缺少 ' + k);
  });
  const is3 = read('pages/index/index.wxss');
  ['@keyframes ladderRise', '@keyframes nodeRise', '@keyframes bloomRing', '@keyframes lotusBloom', '.node-press']
    .forEach(k => {
      if (is3.indexOf(k) > -1) ok('index.wxss 含 ' + k);
      else err('index.wxss 缺少 ' + k);
    });
  const ij3 = read('pages/index/index.js');
  ['runLadderMotion:', 'bloomAndClimb:', 'releaseLadderIn:', 'ladder.buildPlan', 'pageScrollTo']
    .forEach(k => {
      if (ij3.indexOf(k) > -1) ok('index.js 含 ' + k);
      else err('index.js 缺少 ' + k);
    });
  if (ij3.indexOf('_booted') > -1 && ij3.indexOf('_doneList') > -1)
    ok('通关识别走本机内存记忆（不落盘、不联网）');
  else err('index.js 未实现「刚通关」识别');

  // 20.3 体验版镜像
  const tpl3 = read('preview/template.html');
  ['ladderPlan', 'ladderMotion', 'ladderEnter', 'ladderPressBind',
    '@keyframes ladderRise', '@keyframes nodeRise', '@keyframes lotusBloom', 'node-press'].forEach(k => {
    if (tpl3.indexOf(k) > -1) ok('体验版已镜像 ' + k);
    else err('preview/template.html 未镜像 ' + k);
  });
})();

// ---------- 21. 前 60 秒钩子（结算页进度锚 / 印章计数 / 第2关差异化 / 每日打开） ----------
// 背景：两份外部可行性评估都指向同一件事——「不懂藏文的人玩完第一关，
// 会不会想再来一关」。这一节把该命题变成机械断言。
section('21. 前 60 秒钩子（结算页进度锚 / 印章计数 / 第2关差异化 / 每日打开）');
(() => {
  const collect = require(path.join(ROOT, 'utils', 'collect'));

  // 21.1 cardProgress 纯函数真跑
  const ORDER = [
    { id: 'letter_01', label: 'ཀ', isLetter: true, color: '#C0392B' },
    { id: 'letter_02', label: 'ཁ', isLetter: true, color: '#1E8449' },
    { id: 'icon_01', label: '吉', isLetter: false, color: '#C0392B' }
  ];
  const cp0 = collect.cardProgress(ORDER, []);
  if (cp0.got === 0 && cp0.total === 3 && cp0.left === 3) ok('cardProgress 空收藏：0/3');
  else err('cardProgress 空收藏计数错误 got=' + cp0.got + ' total=' + cp0.total + ' left=' + cp0.left);
  if (cp0.slots.every(s => s.label === '')) ok('未收藏槽位不带 label（不剧透「下一张」，悬念才成立）');
  else err('未收藏槽位泄漏了 label，「下一张是什么」的悬念失效');
  const cp1 = collect.cardProgress(ORDER, ['letter_01', '不存在的id']);
  if (cp1.got === 1 && cp1.slots[0].got && !cp1.slots[1].got) ok('cardProgress 只认库内 id，逐槽位标记正确');
  else err('cardProgress 逐槽位标记错误');
  if (cp1.slots[0].label === 'ཀ' && cp1.slots[1].label === '') ok('已收藏槽位带 label、未收藏槽位不带');
  else err('cardProgress 的 label 归属错误');
  if (collect.cardProgress(ORDER, ['letter_01', 'letter_02', 'icon_01']).left === 0)
    ok('集齐后 left = 0（页面可切换为「已全部收藏」）');
  else err('集齐后 left 应为 0');
  if (collect.cardProgress(null, null).total === 0) ok('cardProgress 对空输入安全回落（不抛错）');
  else err('cardProgress 空输入未安全回落');

  // 21.2 markOpen 纯函数真跑：同天幂等 / 跨天 +1 / 断签重置 / first 只写一次 / 90 天上限
  const m1 = collect.markOpen(null, '2026-01-01');
  if (m1.isNewDay && m1.streak === 1 && m1.state.first === '2026-01-01' && m1.state.total === 1)
    ok('首次打开：isNewDay + streak=1 + 记下首日');
  else err('首次打开记录错误 ' + JSON.stringify(m1));
  const m2 = collect.markOpen(m1.state, '2026-01-01');
  if (!m2.isNewDay && m2.state.total === 1) ok('同一天再次打开：幂等，不重复计数');
  else err('同一天重复打开被重复计数 total=' + m2.state.total);
  const m3 = collect.markOpen(m1.state, '2026-01-02');
  if (m3.streak === 2 && m3.state.first === '2026-01-01') ok('隔天打开：streak=2，首日基准不变');
  else err('隔天打开 streak 错误 ' + m3.streak);
  const m4 = collect.markOpen(m3.state, '2026-01-06');
  if (m4.streak === 1) ok('断签：连续天数从 1 重新数（不做惩罚性清零展示）');
  else err('断签后 streak 应为 1，实际 ' + m4.streak);
  let ol = { days: [], lastDate: '', streak: 0, total: 0, first: '2026-01-01' };
  for (let i = 0; i < 95; i++) ol = collect.markOpen(ol, collect.dayToDate(collect.dayNumber('2026-01-01') + i)).state;
  if (ol.days.length === collect.OPEN_KEEP_DAYS) ok('打开记录只保留最近 ' + collect.OPEN_KEEP_DAYS + ' 天（本地存储不做无上限增长）');
  else err('打开记录未裁剪，实际 ' + ol.days.length + ' 天');
  if (collect.retainedOn(m3.state, 1)) ok('retainedOn 能识别「次日回来过」');
  else err('retainedOn 判定错误');
  if (!collect.retainedOn(m3.state, 7)) ok('反向：没回来的那天判定为未留存');
  else err('retainedOn 误报留存');
  if (collect.todayKey(new Date(2026, 0, 5)) === '2026-01-05') ok('todayKey 补零正确');
  else err('todayKey 补零错误：' + collect.todayKey(new Date(2026, 0, 5)));

  // 21.3 storage 接口齐备（漏了会静默丢字段——lampDay 踩过一次）
  const ss = read('utils/storage.js');
  ['getOpenLog', 'applyOpenLog', 'getSeenCards', 'getStampCount', 'openLog'].forEach(k => {
    if (ss.indexOf(k) > -1) ok('storage.js 含 ' + k);
    else err('storage.js 缺少 ' + k);
  });

  // 21.4 小程序端：结算页进度锚 + 印章计数不再写死
  const rw = read('pages/result/result.wxml');
  ['j-slots', 'cardSlots', 'cardGot', 'cardTotal', 'journeyDay', 'stampCount', 'stampTotal']
    .forEach(k => {
      if (rw.indexOf(k) > -1) ok('result.wxml 含 ' + k);
      else err('result.wxml 缺少 ' + k);
    });
  if (rw.indexOf('已收集 1 枚印章') === -1) ok('result.wxml 印章数不再写死（改为 stamps 计数）');
  else err('result.wxml 印章数仍是写死的「已收集 1 枚印章」');
  const rj = read('pages/result/result.js');
  ['collect.cardProgress', 'CARD_ORDER', 'storage.getStampCount', 'storage.getOpenLog'].forEach(k => {
    if (rj.indexOf(k) > -1) ok('result.js 含 ' + k);
    else err('result.js 缺少 ' + k);
  });
  const appSrc = read('app.js');
  if (appSrc.indexOf('recordDailyOpen') > -1 && appSrc.indexOf('collect.markOpen') > -1)
    ok('app.js 启动时记录每日打开');
  else err('app.js 未记录每日打开');

  // 21.5 第 2 关必须与第 1 关形成差异（否则新手认为「跟上一关一模一样」）
  const l1 = levels.filter(l => l.level === 1)[0];
  const l2 = levels.filter(l => l.level === 2)[0];
  if (!l1.obstacles || (!l1.obstacles.frost && !l1.obstacles.crate))
    ok('第 1 关仍无冰霜与木箱（前 60 秒不打扰新手）');
  else err('第 1 关出现了障碍物，会打扰新手');
  if (l2.obstacles && l2.obstacles.frost > 0)
    ok('第 2 关已与第 1 关形成机制差异（首次出现冰霜 ' + l2.obstacles.frost + ' 块）');
  else err('第 2 关与第 1 关没有任何机制差异（新手会觉得「一模一样」）');
  if (l2.obstacles.frost <= l2.cols * l2.rows * 0.25) ok('第 2 关遮挡比例在 D23 的 25% 上限内');
  else err('第 2 关遮挡比例超过 D23 的 25% 上限');

  // 21.6 体验版镜像一致性
  const tpl2 = read('preview/template.html');
  ['function cardProgress', 'CARD_ORDER', 'function markOpen', 'res-journey',
    'getSeenCards()', 'OPEN_KEEP_DAYS'].forEach(k => {
      if (tpl2.indexOf(k) > -1) ok('体验版已镜像 ' + k);
      else err('preview/template.html 未镜像 ' + k);
    });
  if (tpl2.indexOf('openLog: (p && p.openLog)') > -1)
    ok('体验版 getProgress 白名单已含 openLog（漏了会静默丢字段）');
  else err('体验版 getProgress 白名单缺 openLog');

  // 21.7 纯本地：进度锚与每日打开不留任何网络与云能力
  const hookSrc = read('utils/collect.js') + read('app.js') + read('pages/result/result.js');
  ['wx.request', 'wx.cloud', 'callFunction', 'wx.login', 'getUserInfo', 'getLocation'].forEach(api => {
    if (hookSrc.indexOf(api) === -1) ok('进度锚/每日打开相关代码未使用 ' + api);
    else err('进度锚/每日打开相关代码出现 ' + api);
  });
})();

// ---------- 22. 阶段路线图定位与「下一阶段」预告（D27） ----------
// 背景：外部报告主张把「拼合消除 / 连锁消除」——即 12 阶段路线图的第 3~9 阶段
// （元音 / 上加字 / 下加字 / 组词 / 造句）——提前进第 1 关的盘面。
// 拍板结论：采纳其命名与定位（配对入门 · 拼合进阶 · 成句高阶），不采纳其排期。
// 这一节把该边界变成机械断言：阶段 1 之外不得开放；结算页只做「预告」不做「开放」；
// 预告文案一律取自 data/stages.js，页面不得内联阶段名。
section('22. 阶段路线图定位与「下一阶段」预告（D27）');
(() => {
  const cert = require(path.join(ROOT, 'utils', 'certificate'));
  const stages = require(path.join(ROOT, 'data', 'stages'));

  // 22.1 路线图数据完整性（预告文案的唯一数据源）
  if (stages.length === 12) ok('成长阶梯 12 个阶段');
  else err('成长阶梯应为 12 个阶段，实际 ' + stages.length);

  const seqBad = stages.filter((s, i) => s.stage !== i + 1).map(s => s.stage);
  if (!seqBad.length) ok('阶段序号与声明顺序一致（1-12）');
  else err('阶段序号错位：' + seqBad.join(','));

  const spanBad = stages.filter(s => s.to - s.from !== 9).map(s => s.stage);
  if (!spanBad.length) ok('每阶段 10 关（from..to 闭区间）');
  else err('阶段关卡跨度不是 10：' + spanBad.join(','));

  const gapBad = stages.filter((s, i) => i > 0 && s.from !== stages[i - 1].to + 1).map(s => s.stage);
  if (!gapBad.length) ok('阶段区间无缝衔接（无空洞、无重叠）');
  else err('阶段区间不连续：' + gapBad.join(','));

  const noDesc = stages.filter(s => !s.name || !s.goal).map(s => s.stage);
  if (!noDesc.length) ok('每个阶段都有 name 与 goal（预告文案数据源完整）');
  else err('阶段缺少 name/goal：' + noDesc.join(','));

  // 22.2 MVP 边界：阶段 1 之外一律不得开放
  // 这是 D27 的硬约束——开放阶段 3/5/7 等于把元音/上加/下加做成可消除牌面，
  // 会同时打破「配对同质判定」「偶数配比」「可解性保证」三条不变式。
  const openList = stages.filter(s => s.open).map(s => s.stage);
  if (openList.length === 1 && openList[0] === 1)
    ok('只有阶段 1 开放（拼合 / 组词机制不得提前进 MVP 盘面 · D27）');
  else err('已开放阶段应为 [1]，实际 [' + openList.join(',') +
    '] —— 开放前须先解决 D27 列出的机制风险（同质判定 / 偶数配比 / 可解性 / 藏文审校）');

  // 22.3 nextStage 纯函数真跑
  const n1 = cert.nextStage(1);
  if (n1 && n1.stage === 2 && n1.name === stages[1].name && n1.goal === stages[1].goal)
    ok('nextStage(1) 返回数据里的第 2 阶段（name/goal 来自 data/stages.js）');
  else err('nextStage(1) 结果不正确：' + JSON.stringify(n1));
  if (cert.nextStage(12) === null) ok('nextStage(12) 为 null（路线图尽头不再预告）');
  else err('nextStage(12) 应为 null');
  if (cert.nextStage(0) === null && cert.nextStage(null) === null &&
    cert.nextStage(undefined) === null && cert.nextStage('abc') === null)
    ok('nextStage 对空 / 非法输入安全回落为 null');
  else err('nextStage 对空 / 非法输入未安全回落');
  if (cert.nextStage('2') && cert.nextStage('2').stage === 3)
    ok('nextStage 容忍字符串入参（页面 query 传参场景）');
  else err('nextStage 未容忍字符串入参');

  const certSrc = read('utils/certificate.js');
  if (!/wx\.(setStorage|getStorage|request|showToast|navigateTo)|document\.|window\.|https?:\/\//.test(certSrc))
    ok('certificate.js 仍为纯函数模块（无 wx / DOM / 网络调用）');
  else err('certificate.js 出现 wx / DOM / 网络调用，不再是纯函数模块');

  // 22.4 文案不写死：结算页不得内联任何阶段名
  const rwxml = read('pages/result/result.wxml');
  const rjs = read('pages/result/result.js');
  ['nextStageNo', 'nextStageName', 'nextStageGoal'].forEach(k => {
    if (rwxml.indexOf(k) > -1) ok('result.wxml 绑定了 ' + k);
    else err('result.wxml 未绑定 ' + k);
  });
  ['nextStageName', 'nextStageGoal', 'certificate.nextStage'].forEach(k => {
    if (rjs.indexOf(k) > -1) ok('result.js 含 ' + k);
    else err('result.js 缺少 ' + k);
  });
  const hardLocal = stages.filter(s => rwxml.indexOf(s.name) > -1 || rjs.indexOf(s.name) > -1)
    .map(s => s.name);
  if (!hardLocal.length) ok('结算页未内联任何阶段名（文案全部取自 data/stages.js）');
  else err('结算页写死了阶段名：' + hardLocal.join(' / ') + '（内容库扩充后不会自动更新）');

  // 22.5 上屏时机：只在阶段完结（有证书）时出现——是「预告」，不是「开放」
  const cond = rwxml.match(/wx:if="\{\{([^}]*)\}\}"\s+class="next-stage"/);
  if (cond && cond[1].indexOf('cert') > -1 && cond[1].indexOf('nextStageNo') > -1)
    ok('「下一阶段」预告仅在阶段完结（cert）时上屏');
  else err('「下一阶段」预告的上屏条件不正确：' + (cond ? cond[1] : '未匹配到 next-stage 区块'));

  // 22.6 双向镜像：体验版同源同口径
  const tpl = read('preview/template.html');
  ['nextStage(', '.next-stage', 'ns-goal', 'ns-note'].forEach(k => {
    if (tpl.indexOf(k) > -1) ok('体验版已镜像 ' + k);
    else err('preview/template.html 未镜像 ' + k);
  });
  const hardTpl = stages.filter(s => tpl.indexOf(s.name) > -1).map(s => s.name);
  if (!hardTpl.length) ok('体验版未内联任何阶段名（与小程序同一份数据源）');
  else err('体验版写死了阶段名：' + hardTpl.join(' / '));

  // 22.7 定位已登记（定位是产品决策，必须有台账可查）
  const dec = read('docs/DECISIONS.md');
  if (dec.indexOf('**D27**') > -1 && dec.indexOf('配对入门 · 拼合进阶 · 成句高阶') > -1)
    ok('D27 定位「配对入门 · 拼合进阶 · 成句高阶」已登记在决策台账');
  else err('docs/DECISIONS.md 缺少 D27 定位登记');

  // 22.8 全站 WXSS 花括号配平
  // 背景：本轮发现 5 个样式文件共 20 处「规则被关两次」的游离右花括号
  // （形如单独一行 `}}`）。项目无 @media，这些是解析器直接丢弃的游离字符，
  // 不改变渲染，但会掩盖真正的括号错误——配平后把它锁成硬约束。
  ['app.wxss', 'pages/index/index.wxss', 'pages/game/game.wxss',
    'pages/result/result.wxss', 'pages/cert/cert.wxss',
    'pages/passport/passport.wxss', 'pages/benefits/benefits.wxss'].forEach(f => {
    if (!exists(f)) { err(f + ' 不存在'); return; }
    const src = read(f);
    const open = (src.match(/\{/g) || []).length;
    const close = (src.match(/\}/g) || []).length;
    if (open === close) ok(f + ' 花括号配平（' + open + ' 对）');
    else err(f + ' 花括号不配平：{ ' + open + ' 个，} ' + close + ' 个（差 ' + (close - open) + '）');
  });
})();

// ---------- 23. 「藏文可以组合」拼合预告（仅第 2 关） ----------
section('23. 拼合预告（第 2 关 · 只讲概念，不提前开放机制）');
{
  // 23.1 数据文件齐备
  if (!exists('data/combo.js')) {
    err('data/combo.js 不存在（拼合预告的数据源）');
  } else {
    const combo = require(path.join(ROOT, 'data', 'combo'));
    const fields = ['level', 'tag', 'base', 'combined', 'roman', 'hint', 'note'];
    const miss = fields.filter(f => combo[f] === undefined || combo[f] === '');
    if (!miss.length) ok('data/combo.js 字段齐全（' + fields.join('/') + '）');
    else err('data/combo.js 缺字段：' + miss.join(','));

    // 23.2 只在第 2 关展示——该关通关即认全 ཀ ཁ ག ང
    if (combo.level === 2) ok('拼合预告挂在第 2 关（认全四个基础字母那一刻）');
    else err('拼合预告应在第 2 关展示，实际 level=' + combo.level);

    // 23.3 排版铁律：绝不裸渲染元音符号
    // 藏文元音（U+0F71..U+0F84）与下加字（U+0F90..U+0FBC）是组合符号，
    // 单独出现会落成 ◌ི 虚圈，违反 docs/tibetan-typography.md 的「绝不拆音节」。
    const VOWEL = /[\u0F71-\u0F84\u0F90-\u0FBC]/;
    const strip = t => String(t).split(combo.combined).join('');
    const naked = ['tag', 'base', 'roman', 'hint', 'note'].filter(f => VOWEL.test(strip(combo[f])));
    if (!naked.length) ok('预告文案不含孤立元音符号（元音只以「与基字同簇」的形态出现）');
    else err('预告文案出现裸元音符号（会渲染成 ◌ 虚圈）：' + naked.join(','));

    // 23.4 组合后的音节确实比组合前多一个元音（真的在讲「组合」）
    if (combo.combined.length > combo.base.length && VOWEL.test(combo.combined))
      ok('组合后音节 = 基字 + 元音（' + combo.base + ' → ' + combo.combined + '）');
    else err('combined 不是 base 加上元音符号：' + combo.base + ' / ' + combo.combined);

    // 23.4b 合规：预告只是文化内容，不承载任何金额 / 权益
    // 注意排除「元音」——藏文术语里的「元」不是货币单位。
    const MONEY = /[¥￥]|优惠|券|折扣/;
    const money = ['tag', 'base', 'combined', 'roman', 'hint', 'note']
      .filter(f => MONEY.test(combo[f]) || /元(?!音)/.test(combo[f]));
    if (!money.length) ok('预告文案无金额 / 权益类字眼（文化内容，不是商品）');
    else err('预告文案出现金额 / 权益类字眼：' + money.join(','));

    // 23.5 纯函数真跑（配置由调用方注入，collect 保持零依赖）
    const collect = require(path.join(ROOT, 'utils', 'collect'));
    if (collect.comboTease(2, combo) === combo) ok('collect.comboTease(2, combo) 返回数据层的对象');
    else err('collect.comboTease(2, combo) 结果不正确');
    if (collect.comboTease(1, combo) === null && collect.comboTease(3, combo) === null)
      ok('comboTease 只认自己那一关（第 1/3 关返回 null，机制不提前开放）');
    else err('comboTease 在非目标关卡也返回了对象');
    if (collect.comboTease(2, null) === null)
      ok('comboTease 缺配置时安全返回 null（不会误触发预告）');
    else err('comboTease 在缺配置时应返回 null');

    // 23.6 第 1 关不受影响：拼合预告不改前 60 秒的难度
    const lv = require(path.join(ROOT, 'data', 'levels'));
    const l1 = lv.filter(l => l.level === 1)[0];
    if (l1.elements.length === 2 && (!l1.obstacles || !l1.obstacles.frost))
      ok('第 1 关保持 2 个字母 + 无冰霜（前 60 秒不被动过）');
    else err('第 1 关被改动了：elements=' + l1.elements.length);

    // 23.7 第 2 关对齐设计：四个基础字母 + 配比全偶数
    const l2 = lv.filter(l => l.level === 2)[0];
    const ids2 = l2.elements.map(e => e[0]);
    if (JSON.stringify(ids2) === JSON.stringify(['letter_01', 'letter_02', 'letter_03', 'letter_04']))
      ok('第 2 关认全四个基础字母 ཀ ཁ ག ང');
    else err('第 2 关元素应为 letter_01..04，实际 ' + ids2.join(','));
    if (l2.elements.every(e => e[1] % 2 === 0)) ok('第 2 关字母配比全为偶数（两两配对不变式成立）');
    else err('第 2 关出现奇数配比，配对不变式被打破');
  }

  // 23.8 小程序源码上屏位置正确
  const resWxml = read('pages/result/result.wxml');
  if (/<view wx:if="\{\{comboTease\}\}" class="combo-tease">/.test(resWxml))
    ok('结算页 wxml 用 comboTease 做显示条件');
  else err('结算页 wxml 未按 comboTease 条件渲染拼合预告');
  if (read('pages/result/result.wxss').indexOf('.combo-tease') > -1)
    ok('结算页 wxss 有 .combo-tease 样式');
  else err('结算页 wxss 缺少 .combo-tease 样式');
  if (/comboTease:\s*collect\.comboTease\(level,\s*comboData\)/.test(read('pages/result/result.js')))
    ok('结算页 js 通过纯函数取预告（页面不内联关卡号）');
  else err('结算页 js 未通过 collect.comboTease 取值');
  if (read('pages/result/result.js').indexOf("require('../../data/combo')") > -1)
    ok('结算页 js 从 data/combo.js 注入配置（关卡号只写在数据里）');
  else err('结算页 js 未 require data/combo.js');

  // 23.9 体验版镜像一致性（含数据注入）
  const tpl23 = read('preview/template.html');
  [['function comboTease', '镜像纯函数'], ['id="res-combo-tease"', '结算页容器'],
    ['class="combo-tease"', '镜像结构与样式'], ['.ct-glyph', '镜像字形样式']].forEach(pair => {
    if (tpl23.indexOf(pair[0]) > -1) ok('体验版镜像含 ' + pair[1] + '（' + pair[0] + '）');
    else err('体验版镜像缺 ' + pair[1] + '（' + pair[0] + '）');
  });
  if (read('scripts/build-h5.js').indexOf("'data', 'combo'") > -1)
    ok('build-h5 注入了 data/combo.js');
  else err('build-h5 未注入 data/combo.js');
}

// ---------- 24. 分享海报「文化身份」行（真实数据，不得写死） ----------
section('24. 分享海报「文化身份」行（真实数据，不得写死）');
{
  // 24.1 纯函数真跑（含边界）
  const collect24 = require(path.join(ROOT, 'utils', 'collect'));
  const full = collect24.shareIdentity({ letters: 3, letterTotal: 8, cards: 5, cardTotal: 12, stamps: 2, stampTotal: 7 });
  if (full.line1 === '已认识 3 / 8 个藏文字母' && full.line2 === '文化卡 5 / 12 · 护照印章 2 / 7')
    ok('shareIdentity 用真实数字生成两行');
  else err('shareIdentity 结果不正确：' + JSON.stringify(full));

  const zero = collect24.shareIdentity({ letters: 0, letterTotal: 8, cards: 0, cardTotal: 12, stamps: 0, stampTotal: 7 });
  if (zero.line1.indexOf('0') === -1 && zero.line2 === '')
    ok('零进度时不印任何 0（字母行不含数字，第二行为空）');
  else err('零进度时印出了假数字：' + JSON.stringify(zero));

  const dirty = collect24.shareIdentity({ letters: 9, letterTotal: 8, cards: 20, cardTotal: 12, stamps: 9, stampTotal: 7 });
  if (dirty.line1 === '已认识 9 / 9 个藏文字母')
    ok('分母自动抬到不小于分子（脏数据也印不出 5 / 3）');
  else err('脏数据下分母未抬升：' + dirty.line1);

  const noArgs = collect24.shareIdentity();
  if (noArgs.line2 === '' && String(noArgs.line1).length > 0) ok('缺参数时安全降级（不抛错、不印 0）');
  else err('shareIdentity 缺参数时行为异常：' + JSON.stringify(noArgs));

  // 24.2 小程序端：文案来自纯函数，且不再有写死的身份行
  const res24 = read('pages/result/result.js');
  if (/collect\.shareIdentity\(/.test(res24)) ok('结算页调用 collect.shareIdentity 取文案');
  else err('结算页未调用 collect.shareIdentity');
  const hardA = res24.match(/认了\s*\d+\s*个藏文字母|学会了\s*\d+\s*个藏文字母/);
  if (!hardA) ok('结算页不再出现写死的身份行');
  else err('结算页仍有写死的身份行：' + hardA[0]);

  // 24.3 位置守卫：身份行必须留在底部 Logo / 小程序码之上
  //     中文按 1em/字估算，长行会横跨到两侧图形上（上一版就是重叠的）。
  const pickY = (src, key) => {
    const m = src.match(new RegExp('POSTER_' + key + '\\s*=\\s*(\\d+)'));
    return m ? Number(m[1]) : NaN;
  };
  const tpl24 = read('preview/template.html');
  const y1 = pickY(res24, 'IDENTITY_Y1'), y2 = pickY(res24, 'IDENTITY_Y2');
  const h1 = pickY(tpl24, 'IDENTITY_Y1'), h2 = pickY(tpl24, 'IDENTITY_Y2');
  if (y1 >= 600 && y2 > y1 && y2 < 855)
    ok('结算页海报身份行留在底部 Logo（y=855）之上：' + y1 + ' / ' + y2);
  else err('结算页海报身份行位置越界（应在 600 与底部 Logo 之间）：' + y1 + ' / ' + y2);
  if (h1 >= 600 && h2 > h1 && h2 < 810)
    ok('体验版海报身份行留在底部 Logo（y=810）之上：' + h1 + ' / ' + h2);
  else err('体验版海报身份行位置越界：' + h1 + ' / ' + h2);
  if (h1 === y1 && h2 === y2) ok('两端海报身份行基线一致（' + y1 + ' / ' + y2 + '）');
  else err('两端海报身份行基线不一致：小程序 ' + y1 + '/' + y2 + '，体验版 ' + h1 + '/' + h2);

  // 24.4 体验版镜像：同契约的纯函数 + 真实进度输入 + 无写死文案
  ['function shareIdentity', 'function posterIdentityInput', 'POSTER_IDENTITY_Y1', 'POSTER_IDENTITY_Y2']
    .forEach(k => {
      if (tpl24.indexOf(k) > -1) ok('体验版镜像含 ' + k);
      else err('体验版镜像缺 ' + k);
    });
  if (tpl24.indexOf('shareIdentity(posterIdentityInput())') > -1)
    ok('体验版海报用真实进度生成身份行');
  else err('体验版海报未接入 shareIdentity(posterIdentityInput())');
  const hardB = tpl24.match(/认了\s*\d+\s*个藏文字母|学会了\s*\d+\s*个藏文字母/);
  if (!hardB) ok('体验版海报不再出现写死的身份行');
  else err('体验版海报仍有写死的身份行：' + hardB[0]);

  // 24.5 两端文案口径一致（模板分别住在 utils/collect.js 与体验版镜像里）
  const col24 = read('utils/collect.js');
  if (col24.indexOf('个藏文字母') > -1 && col24.indexOf('护照印章') > -1)
    ok('小程序端身份行文案模板在 utils/collect.js');
  else err('utils/collect.js 缺身份行文案模板');
  if (tpl24.indexOf('个藏文字母') > -1 && tpl24.indexOf('护照印章') > -1)
    ok('体验版身份行文案与小程序同一口径（个藏文字母 / 护照印章）');
  else err('体验版身份行文案口径与小程序不一致');
}

// ---------- 25. 权益中心「页面层」文案守卫（数据层之外的第二道锁） ----------
// 背景：外部方案主张「所有优惠权益统一用百分比折扣」。本项目两条都不接受——
//   · 不接受固定金额：平台不是发行方、不是兑付方（docs/privilege-system-v1.md §2.4）；
//   · 也不接受折扣数字：平台一旦印出可计算的让利，就成了替商家承诺价格的一方，
//     PROVIDER_NOTE 那句「不参与交易、不收取任何款项」立刻自相矛盾。
// §16.2 只锁 data/merchants.js 一个文件；若页面自行拼券面文案，那道锁就被绕过。
// 本节把同一把尺子量到页面层（小程序 4 文件 + 体验版权益中心区块），并加跨层同源断言。
section('25. 权益中心页面层文案守卫（数据层之外的第二道锁）');
{
  // 货币符号 / 金额单位守卫已上移为共用件 MONEY_UNIT_PAT（第 25 与第 26 节共用）

  // 体验版镜像：只取权益中心区块（注释锚点 → bn-home 绑定），避免扫到无关页面
  const tpl25 = read('preview/template.html');
  const bnA = tpl25.indexOf('藏文权益中心（双轨制，对应 pages/benefits）');
  const bnB = tpl25.indexOf("$('bn-home')");
  const bnBlock = (bnA > -1 && bnB > bnA) ? tpl25.slice(bnA, bnB) : '';
  if (bnBlock) ok('体验版权益中心区块已定位（' + bnBlock.length + ' 字符）');
  else err('体验版权益中心区块定位失败 —— 镜像结构被改动，本节断言会静默失效');

  const bnSrcs = [
    ['pages/benefits/benefits.wxml', read('pages/benefits/benefits.wxml')],
    ['pages/benefits/benefits.js', read('pages/benefits/benefits.js')],
    ['pages/benefits/benefits.wxss', read('pages/benefits/benefits.wxss')],
    ['utils/benefits.js', read('utils/benefits.js')],
    ['preview/template.html（权益中心区块）', bnBlock]
  ];

  // 25.1 页面层不得出现任何让利数字（折扣率 / 满减 / % off）
  bnSrcs.forEach(pair => {
    const hit = pair[1].match(OFFER_DIGIT_PAT);
    if (!hit) ok(pair[0] + ' 无让利数字（折扣率 / 满减 / % off）');
    else err(pair[0] + ' 出现让利数字：' + hit[0]);
  });

  // 25.2 页面层不得出现货币符号与金额单位
  bnSrcs.forEach(pair => {
    const hit = pair[1].match(MONEY_UNIT_PAT);
    if (!hit) ok(pair[0] + ' 无货币符号与金额单位');
    else err(pair[0] + ' 出现金额字样：' + hit[0]);
  });

  // 25.3 反例自测：上面两把尺子必须真的拦得住（否则只是「碰巧现在干净」）
  const BN_NEG = ['券面 9 折', '满100减20', '立减 5 元', '只要 ¥9', '10% off 折扣'];
  const bnSlipped = BN_NEG.filter(s => !OFFER_DIGIT_PAT.test(s) && !MONEY_UNIT_PAT.test(s));
  if (!bnSlipped.length) ok('反例自测通过：' + BN_NEG.length + ' 种页面层写法全部被拦');
  else err('页面层守卫有缺口，以下写法能溜进来：' + bnSlipped.join(' | '));

  // 25.4 跨层同源：券面 offer 必须逐字来自 data/merchants.js
  //      页面一旦自行拼文案（例如给 offer 追加「（9 折）」），§16.2 的数据层守卫就被绕过
  const ubn25 = require(path.join(ROOT, 'utils', 'benefits'));
  const mch25 = require(path.join(ROOT, 'data', 'merchants'));
  const cards25 = ubn25.decorate(mch25, 99, {});
  const rewritten = cards25.filter((c, i) => c.offer !== mch25[i].offer);
  if (!rewritten.length)
    ok('券面权益文案逐字来自 data/merchants.js（' + cards25.length + ' 家，页面不自行拼接）');
  else err('券面文案被页面层改写过：' + rewritten.map(c => c.id).join('、'));

  // 25.5 卡片视图模型不得新增金额 / 折扣字段（尤其 discountRate / maxDiscount）
  const CARD_KEYS = Object.keys(cards25[0] || {});
  const badKeys = CARD_KEYS.filter(k => moneyFieldHit(k + ': 1', SETTLE_STEMS).length);
  if (!badKeys.length)
    ok('卡片视图模型 ' + CARD_KEYS.length + ' 个字段无金额 / 折扣字段（' + CARD_KEYS.join('、') + '）');
  else err('卡片视图模型含金额 / 折扣字段：' + badKeys.join('、'));

  // 25.6 定性声明必须仍在（删掉它，前面那些措辞就只是文案而不是立场）
  const bnWxml = read('pages/benefits/benefits.wxml');
  const bnJs = read('pages/benefits/benefits.js');
  const ubnSrc = read('utils/benefits.js');
  [['不参与交易、不收取任何款项', 'PROVIDER_NOTE'],
   ['不涉及任何支付与资金结算', 'PAGE_NOTE']].forEach(t => {
    if (ubnSrc.indexOf(t[0]) > -1) ok('utils/benefits.js 的 ' + t[1] + ' 仍含「' + t[0] + '」');
    else err('utils/benefits.js 的 ' + t[1] + ' 丢失定性声明「' + t[0] + '」');
  });
  if (bnWxml.indexOf('{{item.providerNote}}') > -1 && bnWxml.indexOf('{{disclaimer}}') > -1)
    ok('券卡与页脚都渲染定性声明（providerNote / disclaimer）');
  else err('权益中心未渲染定性声明（providerNote / disclaimer）');
  if (bnJs.indexOf('benefits.PAGE_NOTE') > -1)
    ok('页脚声明由 utils/benefits.js 统一提供（页面不各写一份）');
  else err('页脚声明未走 utils/benefits.js');

  // 25.7 体验版镜像同一口径 + 券面逐字使用 m.offer
  if (bnBlock.indexOf(ubn25.PROVIDER_NOTE) > -1 && bnBlock.indexOf(ubn25.PAGE_NOTE) > -1)
    ok('两端券面与页脚声明同一口径（镜像与 utils/benefits.js 逐字一致）');
  else err('两端定性声明口径不一致');
  if (bnBlock.indexOf("bc-offer\">' + m.offer") > -1)
    ok('体验版券面逐字使用 m.offer（镜像不另拼文案）');
  else err('体验版券面未逐字使用 m.offer —— 镜像可能自行拼文案');
}

// ---------- 26. 唐卡合成闭环（补齐「合成」动作 + 兑现护照承诺） ----------
// 背景（2026-10-05 实测）：碎片掉落 / 3×3 拼图 / 非遗盲盒都已在线上跑，
// 但 fragmentComplete() 只返回 true/false —— 集齐 9 片后**没有"合成"这个动作**；
// 且 index.wxml 承诺「完整图收入文化护照」，护照页里「唐卡」出现 0 次（空头承诺）。
// 同时 fragmentCell() 一直是死代码：两端各自内联九宫格数学。
// 本节把这条已存在的链路补完，并锁住「承诺 → 兑现」这条跨文件契约。
section('26. 唐卡合成闭环（补齐「合成」动作 + 兑现护照承诺）');
{
  const col26 = read('utils/collect.js');
  const sto26 = read('utils/storage.js');
  const iw26 = read('pages/index/index.wxml');
  const ij26 = read('pages/index/index.js');
  const pw26 = read('pages/passport/passport.wxml');
  const pj26 = read('pages/passport/passport.js');
  const tpl26 = read('preview/template.html');

  // 26.1 纯函数层：thangkaGrid 统一九宫格口径（fragmentCell 不再是死代码）
  if (col26.indexOf('function thangkaGrid') > -1 && col26.indexOf('fragmentCell(i)') > -1)
    ok('collect.thangkaGrid 统一九宫格口径（内部走 fragmentCell，不再内联数学）');
  else err('utils/collect.js 缺 thangkaGrid 或未复用 fragmentCell');
  if (col26.indexOf('thangkaGrid: thangkaGrid') > -1) ok('collect.js 导出 thangkaGrid');
  else err('utils/collect.js 未导出 thangkaGrid');

  // 26.2 存储层：thangkaDone 字段 + 幂等的合成动作
  if (sto26.indexOf('thangkaDone: !!(p && p.thangkaDone)') > -1)
    ok('storage getProgress 白名单含 thangkaDone');
  else err('storage getProgress 白名单缺 thangkaDone（H5 镜像也要同步，否则字段静默丢失）');
  if (sto26.indexOf('function markThangkaDone') > -1 && sto26.indexOf('if (p.thangkaDone) return') > -1)
    ok('markThangkaDone 幂等（重复点击不产生第二条记录）');
  else err('storage 缺 markThangkaDone 或缺幂等分支');
  if (sto26.indexOf('getThangkaDone: getThangkaDone') > -1 && sto26.indexOf('markThangkaDone: markThangkaDone') > -1)
    ok('storage 导出 markThangkaDone / getThangkaDone');
  else err('storage 未导出 markThangkaDone / getThangkaDone');

  // 26.3 首页：合成动作真实存在（不再是纯文字提示）
  if (ij26.indexOf('synthesizeThangka:') > -1 && ij26.indexOf('storage.markThangkaDone()') > -1)
    ok('首页提供 synthesizeThangka 动作并落 storage.markThangkaDone');
  else err('首页缺 synthesizeThangka 或未落 markThangkaDone');
  if (ij26.indexOf('collect.thangkaGrid(') > -1)
    ok('首页九宫格改走 collect.thangkaGrid（不再内联）');
  else err('首页仍在内联九宫格数学');
  ['bindtap="synthesizeThangka"', "tk-grid {{thangkaDone ? 'done' : ''}}", 'tk-frame-note']
    .forEach(k => {
      if (iw26.indexOf(k) > -1) ok('index.wxml 含 ' + k);
      else err('index.wxml 缺 ' + k);
    });

  // 26.4 「承诺 → 兑现」跨文件契约：首页说了要去护照看，护照就必须真的有
  const promised = iw26.indexOf('完整图收入文化护照') > -1;
  const delivered = pw26.indexOf('唐卡收藏') > -1 && pw26.indexOf('tk-grid') > -1;
  if (promised && delivered)
    ok('跨文件契约成立：index.wxml 承诺「完整图收入文化护照」→ 护照页真有「唐卡收藏」板块');
  else if (promised && !delivered)
    err('空头承诺：index.wxml 承诺「完整图收入文化护照」，但 passport.wxml 无「唐卡收藏」板块（玩家集齐后会被引向死路）');
  else if (!promised && delivered)
    ok('护照页有唐卡收藏板块（首页已不再承诺，二者一致）');
  else
    ok('两端都未提唐卡护照展示（一致，闭环未承诺）');
  if (pj26.indexOf("require('../../utils/collect')") > -1 && pj26.indexOf('collect.thangkaGrid(') > -1)
    ok('护照页九宫格与首页同一纯函数（collect.thangkaGrid）');
  else err('护照页未走 collect.thangkaGrid（又各写一份）');
  if (pj26.indexOf('p.thangkaDone') > -1) ok('护照页读取 thangkaDone 状态');
  else err('护照页未读取 thangkaDone');

  // 26.5 样式单源：tk-* 上移 app.wxss，两页共用（不允许再各写一份）
  const appWxss26 = read('app.wxss');
  if (appWxss26.indexOf('.tk-grid') > -1 && appWxss26.indexOf('.tk-grid.done') > -1)
    ok('tk-* 样式在 app.wxss（首页面板与护照板块共用）');
  else err('app.wxss 缺 .tk-grid / .tk-grid.done');
  if (read('pages/index/index.wxss').indexOf('.tk-cell {') > -1)
    err('index.wxss 仍重复定义 .tk-cell（应上移 app.wxss 单源）');
  else ok('index.wxss 不再重复定义 tk-* 样式');

  // 26.6 体验版镜像同源
  ['function fragmentCell', 'function thangkaGrid', 'function markThangkaDone',
   'function getThangkaDone', 'thangkaDone: !!(p && p.thangkaDone)',
   'pp-frag-grid', 'pp-frag-count'].forEach(k => {
    if (tpl26.indexOf(k) > -1) ok('体验版镜像含 ' + k);
    else err('体验版镜像缺 ' + k);
  });
  if (tpl26.indexOf('thangkaGrid(p.fragments)') > -1 && tpl26.indexOf('fragmentCell(i)') > -1)
    ok('体验版护照页与首页共用 thangkaGrid / fragmentCell（同源）');
  else err('体验版未走 thangkaGrid / fragmentCell');

  // 26.7 新增文案不含金额 / 让利数字（合成按钮与完成提示）
  ['合成唐卡 · 收入文化护照', '已合成 · 完整图收入文化护照', '唐卡已合成 · 你的第一幅完整唐卡']
    .forEach(t => {
      const bad = OFFER_DIGIT_PAT.test(t) || MONEY_UNIT_PAT.test(t);
      if (!bad) ok('文案「' + t + '」无金额 / 让利数字');
      else err('文案「' + t + '」出现金额 / 让利字样');
    });
}

// ---------- 27. 祝福签卡片（雪域日签 → 可保存的藏纸卡，纯本地零资产） ----------
// 背景：数字权益提案六项中唯一本轮落地的「祝福签卡片化」。三条红线必须机械锁死：
//   ① 抽取仍走 pickDaily（确定性，同一天同一签）——改成随机 = 可"刷"，且与日签面板口径分裂；
//   ② 卡片不承载奖励 / 金额 / 让利数字，明确「不设分享奖励」（微信《滥用分享行为》▶2）；
//   ③ 两端同源：视图模型 collect.blessingCard 一份，镜像逐字复刻，绘制布局同一套坐标。
section('27. 祝福签卡片（确定性抽取 + 零金额 + 两端同源）');
{
  const col27 = read('utils/collect.js');
  const ij27 = read('pages/index/index.js');
  const iw27 = read('pages/index/index.wxml');
  const tpl27 = read('preview/template.html');

  // 27.1 纯函数层：blessingCard 存在、导出、且自身不持池子不做随机
  if (col27.indexOf('function blessingCard') > -1)
    ok('collect.blessingCard 纯函数存在（视图模型单源）');
  else err('utils/collect.js 缺 blessingCard');
  if (col27.indexOf('blessingCard: blessingCard') > -1) ok('collect.js 导出 blessingCard');
  else err('utils/collect.js 未导出 blessingCard');
  const cardBody = col27.slice(col27.indexOf('function blessingCard'), col27.indexOf('function cardProgress') > -1 ? col27.indexOf('function cardProgress') : undefined);
  if (cardBody.indexOf('Math.random') === -1)
    ok('blessingCard 自身无随机（抽取权在调用方的 pickDaily）');
  else err('blessingCard 内出现 Math.random —— 抽取必须走 pickDaily，防"刷"');

  // 27.2 首页：输入来自 this.data.daily（它由 pickDaily 产出），链路确定性
  if (ij27.indexOf('collect.blessingCard(this.data.daily') > -1)
    ok('首页祝福签输入 = this.data.daily（pickDaily 确定性抽取的当日签）');
  else err('首页未走 collect.blessingCard(this.data.daily, ...) —— 可能另起随机源');
  if (ij27.indexOf('makeBlessingCard: function') > -1 && ij27.indexOf('saveBlessingCard: function') > -1)
    ok('首页提供 makeBlessingCard（Canvas 绘制）与 saveBlessingCard（存相册）');
  else err('首页缺 makeBlessingCard / saveBlessingCard');
  if (ij27.indexOf("require('../../utils/tibetan-text')") > -1)
    ok('首页绘制走 tibetan-text（tsheg 断行 / shad 不落行首）');
  else err('首页未引入 tibetan-text —— 藏文断行规范失守');

  // 27.3 页面层：生成按钮 + 预览 + 保存 + 定性文案
  ['bindtap="makeBlessingCard"', 'bindtap="saveBlessingCard"', '{{blessingImage}}',
   '生成今日祝福签卡片', '保存到相册'].forEach(k => {
    if (iw27.indexOf(k) > -1) ok('index.wxml 含 ' + k);
    else err('index.wxml 缺 ' + k);
  });
  const BLESS_NOTE = '不设分享奖励、不含任何金额';
  if (iw27.indexOf(BLESS_NOTE) > -1) ok('小程序端定性文案在场：' + BLESS_NOTE);
  else err('index.wxml 缺定性文案「' + BLESS_NOTE + '」');

  // 27.4 卡片承载的全部文案无金额 / 让利数字（逐条量尺）
  ['生成今日祝福签卡片', '保存到相册', '雪域日签 · 第 ' + 'n 签', '小程序码', '玩方块，认藏文']
    .forEach(t => {
      const bad = OFFER_DIGIT_PAT.test(t) || MONEY_UNIT_PAT.test(t);
      if (!bad) ok('祝福签文案「' + t + '」无金额 / 让利数字');
      else err('祝福签文案「' + t + '」出现金额 / 让利字样');
    });

  // 27.5 体验版镜像同源：纯函数 + 绘制 + 面板按钮 + 定性文案逐字一致
  ['function blessingCard', 'function drawBlessingCard', "id=\"bless-btn\"",
   '生成今日祝福签卡片', BLESS_NOTE].forEach(k => {
    if (tpl27.indexOf(k) > -1) ok('体验版镜像含 ' + k);
    else err('体验版镜像缺 ' + k);
  });
  if (tpl27.indexOf('blessingCard(g, colToday())') > -1)
    ok('体验版祝福签输入 = 当日签（pickDaily 产出，与小程序同源）');
  else err('体验版祝福签输入与小程序口径不一致');

  // 27.6 反例自测：第 27 节的尺子必须真的拦得住
  const BLESS_NEG = ['分享得 9 折卡', '卡片满100减20', '送 ¥5 优惠券'];
  const blessSlipped = BLESS_NEG.filter(s => !OFFER_DIGIT_PAT.test(s) && !MONEY_UNIT_PAT.test(s));
  if (!blessSlipped.length) ok('反例自测通过：' + BLESS_NEG.length + ' 种卡片写法全部被拦');
  else err('祝福签守卫有缺口，以下写法能溜进来：' + blessSlipped.join(' | '));

  // 27.7 无网络：卡片生成全程不触网（D3 纯本地 / D13 无后端）
  if (ij27.indexOf('wx.request') === -1) ok('index.js 无 wx.request（卡片纯本地绘制）');
  else err('index.js 出现 wx.request —— 违反纯本地红线');
}

// ---------- 28. 微信生态分享守卫（分享不带激励 + 首页分享卡补全） ----------
// 背景：外部报告主张「一键分享到各大平台 = 裂变」。事实核验：微信小程序无法跨 App 直分享
//（所谓 uni.share = 在抖音/快手各建一套小程序，D29 已否决）；合法增量只有微信生态内两条：
//   ① onShareAppMessage 自定义转发卡（此前结算/护照/证书三页有、最该被分享的首页反而没有）；
//   ② 生成物图片走 wx.showShareImageMenu 官方面板（免截屏直发好友）。
// 铁律：分享只带内容，不带任何激励（微信《滥用分享行为》▶2：被分享者仅需访问、分享者即获利 = 违规，
// 处罚链 3 日整改 → 分享封禁 → 下架 → 封号）。本节机械锁死「分享文案不得含激励字样」。
section('28. 微信生态分享守卫（分享不带激励 + 首页分享卡补全）');
{
  const ij28 = read('pages/index/index.js');
  const iw28 = read('pages/index/index.wxml');
  const tpl28 = read('preview/template.html');

  // 28.1 首页分享卡补全（此前 result/passport/cert 有、index 没有）
  if (ij28.indexOf('onShareAppMessage: function') > -1)
    ok('首页补齐 onShareAppMessage 自定义转发卡');
  else err('首页缺 onShareAppMessage（最该被分享的页面反而是空白）');
  if (ij28.indexOf('showShareImageMenu') > -1 && ij28.indexOf('shareBlessingCard: function') > -1)
    ok('祝福签卡可走官方图片分享面板（wx.showShareImageMenu，免截屏）');
  else err('首页缺 shareBlessingCard / wx.showShareImageMenu');
  if (iw28.indexOf('bindtap="shareBlessingCard"') > -1) ok('index.wxml 含「分享给朋友」按钮');
  else err('index.wxml 缺「分享给朋友」按钮');

  // 28.2 激励字样扫描：全项目所有 onShareAppMessage 函数体（含注释）不得承诺回报
  const SHARE_REWARD_PAT = /分享[^'"\n]{0,10}(得|解锁|抽奖|返|赚)|返现|积分翻倍|奖励/;
  const sharePages = ['pages/index/index.js', 'pages/result/result.js', 'pages/passport/passport.js', 'pages/cert/cert.js'];
  sharePages.forEach(f => {
    const src = read(f);
    const i = src.indexOf('onShareAppMessage');
    if (i === -1) { ok(f + ' 无分享函数（本轮不要求）'); return; }
    const block = src.slice(i, i + 420);
    const hitR = block.match(SHARE_REWARD_PAT);
    const hitM = block.match(OFFER_DIGIT_PAT) || block.match(MONEY_UNIT_PAT);
    if (!hitR && !hitM) ok(f + ' 分享文案只带内容不带激励');
    else err(f + ' 分享文案出现激励/金额字样：' + (hitR || hitM)[0]);
  });

  // 28.3 反例自测：激励扫描必须真的拦得住
  const SHARE_NEG = ['分享得 9 折卡', '分享解锁限定头像框', '分享抽奖赢积分翻倍'];
  const slipped28 = SHARE_NEG.filter(s => !SHARE_REWARD_PAT.test(s) && !OFFER_DIGIT_PAT.test(s));
  if (!slipped28.length) ok('反例自测通过：' + SHARE_NEG.length + ' 种分享激励写法全部被拦');
  else err('分享激励守卫有缺口，以下写法能溜进来：' + slipped28.join(' | '));

  // 28.4 体验版镜像：分享口径同步（H5 无原生分享，提示语与小程序动作一致）
  if (tpl28.indexOf('分享给朋友') > -1)
    ok('体验版提示语与小程序分享动作同口径（分享给朋友 · 无需截屏）');
  else err('体验版缺分享口径提示（两端文案不同步）');
}

// ---------- 29. 通关揭图（十关秘境图 · 程序绘制 · 零金额 · 两端同构） ----------
// 背景：D31「通关揭图」试点。三条红线机械锁死：
//   ① D25 待拍板 → 揭图**不得新增** 莲花 / 经幡（吉祥八宝只取另外 7 个 + 3 个自然/生活题）；
//   ② 图与文案不承载金额 / 让利（和 data/daily.js 同一把尺）；
//   ③ **不新增存储字段**：解锁与否 = completedLevels（避免第二真相源，也就没有「三处同步」的坑）。
section('29. 通关揭图（十关秘境图 · 零金额 · 不新增存储字段 · 两端同构）');
{
  const rvRaw29 = read('data/reveals.js');
  const gw29 = read('pages/game/game.wxml');
  const gj29 = read('pages/game/game.js');
  const gx29 = read('pages/game/game.wxss');
  const rw29 = read('pages/result/result.wxml');
  const rj29 = read('pages/result/result.js');
  const pw29 = read('pages/passport/passport.wxml');
  const pj29 = read('pages/passport/passport.js');
  const tpl29 = read('preview/template.html');
  const bh29 = read('scripts/build-h5.js');

  // 29.1 数据层：十关全覆盖、一一对应、无重复图
  let rvList29 = null;
  try { rvList29 = require(path.join(ROOT, 'data', 'reveals.js')); } catch (e) { /* 走下面 err */ }
  if (Array.isArray(rvList29) && rvList29.length === 10)
    ok('data/reveals.js 共 10 条（每关一张）');
  else err('data/reveals.js 应为 10 条，实际 ' + (rvList29 && rvList29.length));
  if (Array.isArray(rvList29)) {
    const lv29 = rvList29.map(r => r.level);
    const seqOk = lv29.every((n, i) => n === i + 1);
    if (seqOk) ok('揭图关卡区间无缝覆盖 1-10 关（顺序一致，无跳号）');
    else err('揭图关卡序号必须严格为 1..10，实际 ' + JSON.stringify(lv29));
    const imgs29 = rvList29.map(r => r.img);
    if (new Set(imgs29).size === 10) ok('十张揭图路径互不重复');
    else err('揭图路径有重复：' + JSON.stringify(imgs29));
    const noTib = rvList29.filter(r => !r.tibetan || !r.roman || !r.name || !r.desc);
    if (!noTib.length) ok('每条揭图都有 藏文名 + 拉丁转写 + 中文名 + 释义');
    else err('揭图缺字段：' + noTib.map(r => r.level).join(','));
    // 藏文排版铁律：音节后跟 tsheg，末音节不带 tsheg（不得出现行首 tsheg / 双 tsheg）
    const badTib = rvList29.filter(r => /་\s*་|^་|་\s*$/.test(r.tibetan || ''));
    if (!badTib.length) ok('揭图藏文名符合 tsheg 规范（无行首/行尾/连续 tsheg）');
    else err('揭图藏文名 tsheg 用法可疑：' + badTib.map(r => r.name).join('/'));
  }

  // 29.2 图片资产：存在 + 单张体积预算（主包 2MB 硬约束）
  let rvBytes29 = 0;
  for (let i = 1; i <= 10; i++) {
    const nn = String(i).padStart(2, '0');
    const rel = 'images/reveal_' + nn + '.png';
    if (!exists(rel)) { err('缺少揭示图 ' + rel); continue; }
    const b = fs.statSync(path.join(ROOT, rel)).size;
    rvBytes29 += b;
    if (b > 45 * 1024) err(rel + ' 超出单张 45KB 预算（' + Math.round(b / 1024) + 'KB）');
  }
  if (rvBytes29 > 0 && rvBytes29 <= 450 * 1024)
    ok('十张揭示图合计 ' + Math.round(rvBytes29 / 1024) + 'KB（≤450KB 预算，主包安全）');
  else if (rvBytes29 > 450 * 1024)
    err('十张揭示图合计 ' + Math.round(rvBytes29 / 1024) + 'KB 超预算（450KB）');
  if (exists('scripts/make_reveals.py')) ok('scripts/make_reveals.py 存在（揭示图可零美术成本复现）');
  else err('缺 scripts/make_reveals.py（揭示图必须可由脚本复现，不靠手绘资产）');

  // 29.3 D25 红线：揭图不得新增 莲花 / 经幡（等拍板；这两个符号只能出现在既有 4 个可消除牌面里）
  //      只扫「非注释行」：文件头注释里要写清楚这条红线本身，不能自己绊倒自己。
  const rvCode29 = rvRaw29.split('\n').filter(l => l.trim().indexOf('//') !== 0).join('\n');
  const D25_PAT29 = /莲花|lotus|经幡|风马旗|佛塔|酥油灯/g;
  const hit25 = rvCode29.match(D25_PAT29) || [];
  if (!hit25.length) ok('data/reveals.js 数据层未出现 D25 待拍板符号（莲花/经幡/佛塔/酥油灯）');
  else err('data/reveals.js 出现 D25 待拍板符号：' + hit25.join('/'));
  // 元素库不得被顺手扩充（ religious symbols 只能以「装饰纹样」存在，不能变成可消除牌面）
  const elCount29 = (read('data/elements.js').match(/type:\s*'(letter|icon)'/g) || []).length;
  if (elCount29 === 12) ok('元素库仍为 12 个元素（揭图没有顺手进元素库）');
  else err('元素库元素数变了（' + elCount29 + ' ≠ 12）：新增元素需另行拍板，不得随揭图夹带');

  // 29.4 金额守卫：图鉴文案不承载金额 / 让利 / 结算字段
  if (!moneyFieldHit(rvRaw29).length && !OFFER_DIGIT_PAT.test(rvRaw29) && !MONEY_UNIT_PAT.test(rvRaw29))
    ok('data/reveals.js 无金额字段 / 让利数字 / 货币符号');
  else err('data/reveals.js 出现金额 / 让利 / 结算字样（图鉴只能是「图 + 名 + 释义」）');
  // 反例自测：这把尺必须真的拦得住
  const RV_NEG29 = ['{ price: 9.9 }', '满100减20', '奖励 5 元'];
  const slipped29 = RV_NEG29.filter(s => !moneyFieldHit(s).length && !OFFER_DIGIT_PAT.test(s) && !MONEY_UNIT_PAT.test(s));
  if (!slipped29.length) ok('反例自测通过：' + RV_NEG29.length + ' 种金额写法全部被拦');
  else err('揭图金额守卫有缺口：' + slipped29.join(' | '));

  // 29.5 游戏页：揭图垫层 + 进度文案（只报百分比，不剧透名字）
  [['class="reveal-img"', '揭图层 <image>'], ['class="board-wrap"', '牌区精确对齐容器'], ['reveal-cap', '揭图进度文案']]
    .forEach(([k, label]) => {
      if (gw29.indexOf(k) > -1) ok('game.wxml 含 ' + label);
      else err('game.wxml 缺 ' + label);
    });
  if (gj29.indexOf("require('../../data/reveals')") > -1) ok('game.js 引入 data/reveals（同源数据）');
  else err('game.js 未引入 data/reveals');
  if (gj29.indexOf('revealPct: Math.round(this.matchedCount * 100 / this.data.totalPairs)') > -1)
    ok('game.js 揭图进度按「已配对数 / 总对数」实时推进');
  else err('game.js 缺 revealPct 计算（揭图不会随消除推进）');
  if (gj29.indexOf('boardH: boardH') > -1 && gj29.indexOf('cfg.rows * tileH + (cfg.rows - 1) * gap') > -1)
    ok('game.js 计算 boardH（揭图层与牌区精确对齐）');
  else err('game.js 缺 boardH 计算（揭图层会错位）');
  if (gx29.indexOf('.reveal-img') > -1 && gx29.indexOf('position: absolute') > -1)
    ok('game.wxss 揭图层为绝对定位（垫在牌层之下）');
  else err('game.wxss 缺 .reveal-img 绝对定位');
  if (gx29.indexOf('.board') > -1 && /z-index:\s*1/.test(gx29.match(/\.board\s*\{[^}]*\}/)[0]))
    ok('game.wxss .board 提升 z-index（牌层盖住揭图层）');
  else err('game.wxss .board 未提升 z-index（揭图会盖住牌面）');
  if (!/秘境图[^\n'"]{0,8}(元|¥|折)/.test(gw29)) ok('揭图进度文案无金额字样');
  else err('揭图进度文案出现金额字样');

  // 29.6 结算页揭晓 + 护照图鉴（跨文件契约：结算页说「已收入护照」，护照就必须真有）
  if (rj29.indexOf("require('../../data/reveals')") > -1) ok('result.js 引入 data/reveals');
  else err('result.js 未引入 data/reveals');
  ['reveal-card', 'reveal-art', 'reveal-tib', '已收入文化护照'].forEach(k => {
    if (rw29.indexOf(k) > -1) ok('result.wxml 含 ' + k);
    else err('result.wxml 缺 ' + k);
  });
  const promised29 = rw29.indexOf('已收入文化护照') > -1;
  const delivered29 = pw29.indexOf('揭示图鉴') > -1 && pw29.indexOf('rv-grid') > -1;
  if (promised29 && delivered29)
    ok('跨文件契约成立：结算页「已收入文化护照」→ 护照页真有「揭示图鉴」板块');
  else if (promised29 && !delivered29)
    err('空头承诺：结算页说「已收入文化护照」，但 passport.wxml 无「揭示图鉴」板块');
  else ok('两端未承诺揭图收入护照（一致）');
  if (pj29.indexOf('p.completedLevels.indexOf(r.level) > -1') > -1)
    ok('护照页图鉴解锁判定走 completedLevels（不新增存储字段）');
  else err('护照页图鉴解锁判定未走 completedLevels');

  // 29.7 存储层负向断言：揭图状态**不落库**（与 D31 决策一致，防止将来出现两份真相）
  if (read('utils/storage.js').indexOf('reveals') === -1)
    ok('utils/storage.js 未新增 reveals 字段（揭图状态 = 通关状态，单一真相源）');
  else err('utils/storage.js 出现 reveals 字段：揭图状态应派生自 completedLevels，不要落第二份');

  // 29.8 体验版镜像同构（H5 必须有同一套揭图能力）
  ['id="reveal-img"', 'function syncRevealBox', 'function updateRevealCap',
   'id="res-reveal"', 'id="pp-reveal-grid"', 'const REVEALS = DATA.reveals',
   'state.reveal = REVEALS[level - 1]'].forEach(k => {
    if (tpl29.indexOf(k) > -1) ok('体验版镜像含 ' + k);
    else err('体验版镜像缺 ' + k);
  });
  if (bh29.indexOf("require(path.join(ROOT, 'data', 'reveals'))") > -1)
    ok('build-h5.js 注入 data/reveals（与小程序同源）');
  else err('build-h5.js 未注入 data/reveals');
  if (bh29.indexOf("IMAGES['reveal' + nn] = dataUrl('images/reveal_' + nn + '.png')") > -1)
    ok('build-h5.js 内联十张揭示图（体验版保持单文件）');
  else err('build-h5.js 未内联揭示图（体验版会引用到不存在的相对路径）');
  if (bh29.indexOf('r.img = IMAGES[key]') > -1)
    ok('build-h5.js 把揭图路径换写为 data URL（/images/... 是小程序路径）');
  else err('build-h5.js 未换写揭图路径（H5 会拿到小程序路径而裂图）');
}


console.log('通过: ' + passed + ' | 错误: ' + errors.length + ' | 警告: ' + warnings.length);
if (errors.length) { console.log('\x1b[31m存在错误，需修复后重试\x1b[0m'); process.exit(1); }
console.log('\x1b[32m全部自检通过 ✓\x1b[0m');
