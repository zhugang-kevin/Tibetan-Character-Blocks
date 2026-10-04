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
  const moneyField = ['price', 'amount', 'discount', 'settle'].filter(k =>
    new RegExp('\\b' + k + '\\s*:').test(mchSrc));
  if (!moneyField.length) ok('商家数据无 price/amount/discount/settle 字段（平台不经手结算）');
  else err('data/merchants.js 含金额或结算字段：' + moneyField.join('、'));

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
  const moneyKey = ['price', 'amount', 'discount', 'settle', 'rmb', 'cny'].filter(k => new RegExp('\\b' + k + '\\s*:').test(dailySrc));
  if (!moneyKey.length) ok('data/daily.js 无 price/amount/discount/settle 字段（不经手结算）');
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

  // 17.4 首页结构（藤蔓地图 / 悬浮入口 / 底部平层 / 资源条 / 入口面板）
  const iw = read('pages/index/index.wxml');
  ['vine-map', 'vine-stem', 'region', 'side-rail', 'dock', 'entry-panel', 'res-bar'].forEach(cls => {
    if (iw.indexOf(cls) > -1) ok('index.wxml 含 ' + cls);
    else err('index.wxml 缺少 ' + cls);
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
    'doSignIn', 'buyItem', 'waterTree', 'rateStars', 'res-stars', 'res-rewards'].forEach(key => {
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

// ---------- 汇总 ----------
console.log('\n========== 汇总 ==========');
console.log('通过: ' + passed + ' | 错误: ' + errors.length + ' | 警告: ' + warnings.length);
if (errors.length) { console.log('\x1b[31m存在错误，需修复后重试\x1b[0m'); process.exit(1); }
console.log('\x1b[32m全部自检通过 ✓\x1b[0m');
