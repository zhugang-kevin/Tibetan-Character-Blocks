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
// D33 下落式盘面：总牌数 = 格数 + 补充池（池 = round2(格数/4)，且恒为偶数）。
// 口径变更的原因：盘面初始满铺 cols×rows，其余牌进池供下落补位。
// 偶不变：每种元素配比偶数 + 池余量偶数 → 盘面上任何时刻都至少有一对可消（零死局）。
const boardMod = require(path.join(ROOT, 'utils/board.js'));
const sumObj = o => Object.keys(o).reduce((s, k) => s + o[k], 0);
levels.forEach(l => {
  const total = l.elements.reduce((s, e) => s + e[1], 0);
  const slots = l.cols * l.rows;
  const plan = boardMod.planCounts(l);
  const pool = boardMod.poolLeft(plan.pool);
  const give = sumObj(plan.give);
  if (total !== slots + pool) err('第' + l.level + '关: 总牌数 ' + total + ' ≠ 格数 ' + slots + ' + 补充池 ' + pool);
  if (pool % 2 !== 0) err('第' + l.level + '关: 补充池 ' + pool + ' 为奇数（会打破偶不变）');
  if (give !== slots) err('第' + l.level + '关: 初始铺牌 ' + give + ' ≠ 格数 ' + slots);
  const odd = l.elements.filter(e => e[1] % 2 !== 0).map(e => e[0]);
  if (odd.length) err('第' + l.level + '关: 次数为奇数 ' + odd.join(','));
  const oddPool = Object.keys(plan.pool).filter(k => plan.pool[k] % 2 !== 0);
  if (oddPool.length) err('第' + l.level + '关: 池余量为奇数 ' + oddPool.join(','));
  const unknown = l.elements.filter(e => !elementIds.includes(e[0]));
  if (unknown.length) err('第' + l.level + '关: 未知元素 ' + unknown.map(e => e[0]).join(','));
  if (total === slots + pool && give === slots && !odd.length && !oddPool.length && !unknown.length) {
    ok('第' + l.level + '关: ' + l.cols + '×' + l.rows + ' 格 ' + slots + ' 张 + 池 ' + pool +
      ' = ' + total + ' 张 OK');
  }
});
if (elementIds.length === 34) ok('元素库 34 个（30字母+4图标）');
else err('元素库应为 34 个，实际 ' + elementIds.length);

// 30 辅音基线（2026-10-07 用户拍板扩充）：字母不重不漏、颜色只在达标四色内循环、
// 三十个字母全部被至少一关使用（不得出现「有卡无盘」的死内容）
{
  const el30 = eval('(' + read('data/elements.js').replace(/^module\.exports\s*=\s*/, '').replace(/;\s*$/, '') + ')');
  const letterIds30 = Object.keys(el30).filter(id => /^letter_\d{2}$/.test(id)).sort();
  const lettersOk30 = letterIds30.length === 30 && letterIds30.every((id, i) => id === 'letter_' + String(i + 1).padStart(2, '0'));
  if (lettersOk30) ok('元素库含 letter_01..letter_30 连续 30 个辅音');
  else err('字母编号应连续覆盖 letter_01..letter_30，实际 ' + letterIds30.length + ' 个');
  const glyphs30 = letterIds30.map(id => el30[id].tibetan);
  if (new Set(glyphs30).size === 30) ok('三十个藏文字形互不重复');
  else err('藏文字形有重复：' + glyphs30.join(' '));
  const TILE_INKS30 = ['#C0392B', '#176B3C', '#2471A3', '#8A6A12'];
  const badInk30 = letterIds30.filter(id => TILE_INKS30.indexOf(el30[id].color) === -1);
  if (!badInk30.length) ok('30 个字母颜色全部取自四张达标牌面色（§30 零波及）');
  else err('字母用了牌面四色之外的墨（对比度门禁未覆盖）: ' + badInk30.join(','));
  const usedInLevels30 = new Set([].concat(...levels.map(l => l.elements.map(e => e[0]))));
  const idle30 = letterIds30.filter(id => !usedInLevels30.has(id));
  if (!idle30.length) ok('三十个辅音全部在至少一关出场');
  else err('有卡无盘（字母从未在任何关卡出现）: ' + idle30.join(','));
  const kindsMax30 = Math.max(...levels.map(l => l.elements.length));
  if (kindsMax30 <= 15) ok('单关元素种类上限内（最多 ' + kindsMax30 + ' 种 ≤ 15）');
  else err('有关超过 15 种元素（60 张牌按每种 4 张已放不下）: ' + kindsMax30);
}

// ---------- 4. 文化卡覆盖 ----------
section('4. 文化卡覆盖');
const cardsSrc = read('data/cards.js');
const cardIds = [...cardsSrc.matchAll(/id:\s*'(letter_\d{2}|icon_\d{2})'/g)].map(m => m[1]);
const missing = elementIds.filter(id => !cardIds.includes(id));
if (cardIds.length === 34) ok('文化卡 34 张（30字母+4图标）'); else err('文化卡应为 34 张，实际 ' + cardIds.length);
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
// D52：6 条程序合成音由 WAV 转 MP3（scripts/compress_sfx.py，172KB → 35KB，
// 给「讲解播整段」腾包体）；tap 保留 WAV（1.5KB + 零延迟）。
// 扩展名**只从 utils/audio.js 的 SFX_MP3 读**，避免两处口径漂移。
{
  const auSrc = read('utils/audio.js');
  const mp3Set = new Set(((/var SFX_MP3 = \{([^}]*)\}/.exec(auSrc) || [])[1] || '')
    .split(',').map(s => s.trim().split(':')[0]).filter(Boolean));
  ['tap', 'match', 'mismatch', 'win', 'drum', 'horn', 'cheer'].forEach(s => {
    const ext = mp3Set.has(s) ? 'mp3' : 'wav';
    if (exists('audio/' + s + '.' + ext)) ok('audio/' + s + '.' + ext + ' 存在');
    else err('audio/' + s + '.' + ext + ' 缺失（扩展名由 utils/audio.js 的 SFX_MP3 决定）');
    // 反面：转过的音效不得把 WAV 留在包里（否则 133KB 的腾挪白做）
    if (mp3Set.has(s) && exists('audio/' + s + '.wav'))
      err('audio/' + s + '.wav 仍在包内 —— 已转 MP3，源 WAV 必须删除（scripts/compress_sfx.py）');
  });
  if (exists('scripts/compress_sfx.py')) ok('音效压缩脚本 scripts/compress_sfx.py 存在（WAV→MP3 可复现）');
  else err('缺 scripts/compress_sfx.py（音效压缩不可复现）');
}

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
if (brandJs.includes('认藏文，从方块开始')) ok('Slogan「认藏文，从方块开始」保留在首页转发卡（onShareAppMessage）');
else err('品牌语丢失：首页转发卡应含 Slogan「认藏文，从方块开始」');
if (brandWxml.includes('logo-200.png')) ok('首页使用 Logo（200px 完整方块版）');
else ok('首页品牌行已按拍板移除（Logo 保留在证书 / 护照等载体）');
const brandAssets = ['images/logo-144.png', 'images/logo-200.png', 'images/logo-80.png', 'images/logo-watermark.png', 'preview/assets/logo-master.png'];
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
if (resultJs.includes('认藏文，从方块开始')) ok('Slogan 已写入祝福卡');
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
if (gameJs.indexOf('audio.tier(') > -1) ok('档位音效（D34 一档一音）已接入');
else err('game.js 未接入档位音效 audio.tier');
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
// D33：消除结算改成「排队（按 uid）+ 逐对下落」，不再有 pendingRemove。
// 断言换成「消除对进队列 + 由 collapse 真结算 + 队列排空才判通关」这条链。
if (gameJs.indexOf('this.removeQueue.push([a.uid, b.uid])') > -1 &&
    gameJs.indexOf('board.collapse(that.board, pair') > -1) {
  ok('配对成功后进消除队列（按 uid），并由 utils/board.js 的 collapse 真结算（下落 + 补充）');
} else err('消除队列 / collapse 结算链缺失（下落机制不会生效）');
if (gameJs.indexOf('!that.removeQueue.length') > -1)
  ok('通关判定等队列排空（连点时最后一对不会提前触发结算）');
else err('通关判定未等队列排空，连点可能提前进结算');
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
  if (!missImg.length && patOk && hasLayer) ok(p[1] + '背景层完整（平铺八宝卷草纹/经幡/雪山布达拉宫）');
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
  // D45：语音改为 .wav（TTS 预生成产物），命名口径以 README 为准
  if (voiceReadme.indexOf('tashi_delek.wav') > -1 && voiceReadme.indexOf('blessing_01.wav') > -1)
    ok('录音清单含情绪语音（tashi_delek.wav / blessing_01.wav）');
  else err('voice README 缺 tashi_delek.wav / blessing_01.wav 条目');

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
  // 文化红线（D25 已拍板，2026-10-06）：宗教符号只作装饰，不得成为可消除牌面。
  // 佛塔 / 酥油灯 / 风马旗 / 莲花 / 经幡 一律不得进入元素库 —— 统一由 §17.8 按「去注释源码」硬性把关。
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

  // 17.8 D25 文化红线（2026-10-06 拍板定案，由警告升级为硬错误）
  //   宗教符号只作装饰、不得娱乐化消除：佛塔 / 酥油灯 / 风马旗 / 莲花 / 经幡 一律不得进入元素库。
  //   icon_02 / icon_04 已由两个宗教题材换成「青稞 / 牦牛」——**id 与 color 不动**（关卡配比 / 文化卡键 /
  //   精灵映射零波及），只换 title + iconKey + char + 绘制器。
  //   扫描用去注释源码：允许在注释里说明历史（写明「原为宗教题材」不会误伤），真正出现在字段里才判错。
  const elsRaw = read('data/elements.js');
  const elsJs = elsRaw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  ['佛塔', '酥油灯', '风马旗', '莲花', '经幡'].forEach(sym => {
    if (elsJs.indexOf(sym) === -1) ok('元素库不含宗教符号「' + sym + '」（D25）');
    else err('data/elements.js 出现宗教符号「' + sym + '」（D25 文化红线，§17.8）');
  });
  const iconKeys = [];
  elsRaw.replace(/iconKey:\s*'([a-z]+)'/g, (m, k) => { iconKeys.push(k); return m; });
  const WANT_KEYS = ['knot', 'barley', 'mountain', 'yak'];
  if (iconKeys.length === 4 && WANT_KEYS.every(k => iconKeys.indexOf(k) > -1))
    ok('iconKey 集合恰为 {knot, barley, mountain, yak}（世俗题材，D25）');
  else err('iconKey 集合异常：[' + iconKeys.join(', ') + ']（应为 ' + WANT_KEYS.join(' / ') + '）');
  if (elsJs.indexOf("'莲花'") === -1 && elsJs.indexOf("'经幡'") === -1)
    ok('icon_02 / icon_04 的 title 与 char 已不含宗教符号字面');
  else err('icon_02 / icon_04 仍是宗教题材（D25）');

  // 两端绘制器：新题材必须存在，旧符号绘制器必须彻底消失（标识符级扫描，注释里的历史说明不误伤）
  const icoSrc = read('utils/icons.js');
  [['drawBarley', icoSrc], ['drawYak', icoSrc],
   ['barley: drawBarley', icoSrc], ['yak: drawYak', icoSrc],
   ['drawBarley', tplHtml], ['drawYak', tplHtml],
   ['barley: drawBarley', tplHtml], ['yak: drawYak', tplHtml]].forEach(pair => {
    if (pair[1].indexOf(pair[0]) > -1) ok('绘制器就位：' + pair[0]);
    else err('缺少绘制器 ' + pair[0] + '（D25 两端必须同构）');
  });
  [['drawLotus', icoSrc], ['drawFlags', icoSrc],
   ['lotus: drawLotus', tplHtml], ['flags: drawFlags', tplHtml]].forEach(pair => {
    if (pair[1].indexOf(pair[0]) === -1) ok('旧符号绘制器已移除：' + pair[0]);
    else err('仍保留旧宗教符号绘制器 ' + pair[0] + '（D25）');
  });

  // 文化卡与元素库 title 一致（换题材后最容易漏的一处：图标换成青稞、卡还在讲莲花）
  const cardsRaw = read('data/cards.js');
  const cardTitle = {};
  cardsRaw.replace(/id:\s*'(icon_0\d)'[\s\S]*?title:\s*'([^']+)'/g, (m, id, t) => { cardTitle[id] = t; return m; });
  const elTitle = {};
  elsRaw.replace(/(icon_0\d):[\s\S]{0,120}?title:\s*'([^']+)'/g, (m, id, t) => { elTitle[id] = t; return m; });
  ['icon_01', 'icon_02', 'icon_03', 'icon_04'].forEach(id => {
    if (cardTitle[id] && elTitle[id] && cardTitle[id] === elTitle[id])
      ok('文化卡标题与元素一致：' + id + ' = 「' + cardTitle[id] + '」');
    else err('文化卡 title 与元素 title 不一致：' + id +
      '（card=' + cardTitle[id] + ' / el=' + elTitle[id] + '）');
  });
})();

// ---------- 18. 全局视觉底盘（暗金光晕底图 + 金色棋盘底盘） ----------
(function () {
  section('18. 全局视觉底盘');

  const PAGES = ['index', 'game', 'result', 'cert', 'passport', 'benefits'];

  // 18.1 底图资产存在（小程序全尺寸 + H5 压缩版）
  ['images/bg-global.jpg', 'preview/assets/bg-global-h5.jpg'].forEach(f => {
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
  if (buildSrc.indexOf('preview/assets/bg-global-h5.jpg') > -1 && buildSrc.indexOf('bgGlobal') > -1)
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

  // 19.9 万/亿口径：主数字短、好读；精确千分位仍留在副行（两个函数并存，互不替代）
  const WAN_TABLE = [[999, '999'], [9999, '9,999'], [10000, '1万'], [12000, '1.2万'],
    [21800, '2.18万'], [32100, '3.21万'], [45000, '4.5万'], [54300, '5.43万'],
    [76540, '7.65万'], [89201, '8.92万'], [128456, '12.85万'],
    [99999999, '1亿'], [100000000, '1亿'], [1284567800, '12.85亿'], [0, '0']];
  WAN_TABLE.forEach(pair => {
    const got = lamp.formatWan(pair[0]);
    if (got === pair[1]) ok('formatWan(' + pair[0] + ') = ' + got);
    else err('formatWan(' + pair[0] + ') 应为 ' + pair[1] + '，实际 ' + got);
  });
  if (lamp.formatWan(128456) === '12.85万' && lamp.formatCount(128456) === '128,456')
    ok('万/亿口径与千分位并存（主数字短、副行精确，没有二选一）');
  else err('formatWan 与 formatCount 未并存');
  if (lamp.formatWan(NaN) === '0' && lamp.formatWan(undefined) === '0' && lamp.formatWan('x') === '0')
    ok('formatWan 对非数字入参降级为 0');
  else err('formatWan 未处理非数字入参');
  if (lamp.formatWan(99999999) === '1亿')
    ok('反向：99,999,999 两位四舍五入顶到 10000万 时进位为 1亿（不留 10000万）');
  else err('formatWan 进位边界错误：' + lamp.formatWan(99999999));

  // 19.10 主数字节点 + 点亮跳动（+1 的反馈必须落在会变的那个数上）
  const iws9 = read('pages/index/index.wxss');
  const iwm9 = read('pages/index/index.wxml');
  const ijs9 = read('pages/index/index.js');
  const tpl9 = read('preview/template.html');
  [['lamp-total', iwm9], ['lampTotalPop', iwm9], ['lampTotalPop: true', ijs9], ['lamp.formatWan(', ijs9],
  ['@keyframes lampPop', iws9], ['.lamp-total.pop', iws9], ['lamp-unit', iws9],
  ['lampWan(', tpl9], ['id="lamp-total"', tpl9], ['@keyframes lampPop', tpl9],
  ["classList.add('pop')", tpl9], ['.lamp-total.pop', tpl9]].forEach(pair => {
    if (pair[1].indexOf(pair[0]) > -1) ok('跳动/主数字已接入：' + pair[0]);
    else err('缺少 ' + pair[0]);
  });
  if (ijs9.indexOf('lamp.formatWan(next)') > -1 && ijs9.indexOf("lamp.formatCount(next)") > -1)
    ok('点亮后主数字走万/亿、副行仍走千分位（+1 在副行可见）');
  else err('点亮后未同时更新两种口径');

  // 19.11 辉光分级：纯装饰。机械证明它不是数量的单调函数（否则等于用亮度做了排行）
  const glow = lamp.GLOW_ORDER;
  if (Array.isArray(glow) && glow.length >= 4) ok('辉光等级表存在：' + glow.join(','));
  else err('缺少 GLOW_ORDER');
  const glowInc = glow.some((v, i) => i > 0 && v > glow[i - 1]);
  const glowDec = glow.some((v, i) => i > 0 && v < glow[i - 1]);
  if (glowInc && glowDec)
    ok('反向：辉光序列既非递增也非递减 —— 不可能是数量的单调函数（不标示高低与位次）');
  else err('辉光序列单调：等于用亮度做了排行，违反 data/lamp.js 的合规声明');
  if (glow.every(v => v >= 1 && v <= 4) && Math.max.apply(null, glow) === 4 && Math.min.apply(null, glow) === 1)
    ok('辉光等级恰好覆盖 1..4 四档');
  else err('辉光等级未落在 1..4');
  const cnts19 = lampData.provinces.map(p => p.count);
  const cntDesc = cnts19.every((v, i) => i === 0 || v <= cnts19[i - 1]);
  if (cntDesc && glowInc && glowDec)
    ok('灯火数递减而辉光非单调 ⇒ 辉光与数量不构成单调关系（这是本条的证明）');
  else err('无法证明辉光与数量非单调');
  if ([0, 1, 2, 3, 4].map(i => lamp.glowLevel(i)).join(',') === glow.slice(0, 4).join(',') + ',' + glow[0])
    ok('glowLevel 按行号循环取值（0..4 → ' + [0, 1, 2, 3, 4].map(i => lamp.glowLevel(i)).join(',') + '）');
  else err('glowLevel 取值不符');
  if ([lamp.glowLevel(-1), lamp.glowLevel(9), lamp.glowLevel(NaN)].every(v => v >= 1 && v <= 4))
    ok('glowLevel 对越界/非数字入参仍落在 1..4');
  else err('glowLevel 越界处理错误');
  ['glow-1', 'glow-2', 'glow-3', 'glow-4'].forEach(c => {
    if (iws9.indexOf('.' + c + ' {') > -1 && tpl9.indexOf('.' + c + ' {') > -1) ok('两端都定义了 .' + c);
    else err('缺少 .' + c);
  });
  if (iws9.indexOf('.glow-5') === -1 && tpl9.indexOf('.glow-5') === -1) ok('两端都没有第 5 档辉光（恰好 4 档）');
  else err('出现了第 5 档辉光');
  if (tpl9.indexOf('[3, 1, 4, 2, 3]') > -1)
    ok('体验版辉光等级表与小程序逐字一致（[3, 1, 4, 2, 3]）');
  else err('体验版辉光等级表与小程序不一致');

  // 19.12 类名撞名：.lamp-row 曾同时是「长明灯签到环容器」与「跳窗灯火行」，
  //       后定义的规则会给签到环额外加上金色下边框（真实存在的视觉缺陷）→ 跳窗行改名 .lamp-item
  const occ = (s, sub) => s.split(sub).length - 1;
  if (occ(iws9, '.lamp-row {') === 1) ok('index.wxss 的 .lamp-row 只剩「长明灯签到环」一处（撞名已解）');
  else err('.lamp-row 在 index.wxss 出现 ' + occ(iws9, '.lamp-row {') + ' 次（应为 1）');
  if (occ(tpl9, '.lamp-row {') === 1) ok('体验版 .lamp-row 同样只剩一处');
  else err('体验版 .lamp-row 出现 ' + occ(tpl9, '.lamp-row {') + ' 次（应为 1）');
  [['index.wxss', iws9], ['体验版', tpl9]].forEach(pair => {
    if (occ(pair[1], '.lamp-item {') === 1) ok(pair[0] + ' 定义了 .lamp-item（跳窗灯火行）');
    else err(pair[0] + ' 缺少 .lamp-item');
  });
  if (iwm9.indexOf('class="lamp-item"') > -1 && tpl9.indexOf('class="lamp-item"') > -1)
    ok('两端跳窗灯火行都用 .lamp-item');
  else err('跳窗灯火行未统一为 .lamp-item');

  // 19.13 跳窗出口与可达性（D44，2026-10-07 用户实测反馈：CTA 被裁出屏幕、点灯后找不到关闭）
  //   三件套：① 中部可滚动（内容再长不裁切）② 固定底栏（CTA/关闭永远在屏内）③ 右上角 ✕ + 点亮后显著关闭按钮
  const lampHas = (t, k) => t.indexOf(k) > -1;
  const reach = [['lamp-scroll', '中部滚动区'], ['lamp-actions', '固定底栏'], ['lamp-x', '右上角 ✕'], ['lamp-close', '点亮后关闭按钮']];
  reach.forEach(([k, n]) => {
    if (lampHas(iw2, k) && lampHas(iws9, '.' + k.slice(0)) && lampHas(tpl9, k)) ok('两端齐备：' + n + '（' + k + '）');
    else if (lampHas(iw2, k) && lampHas(tpl9, k)) ok('两端结构齐备：' + n + '（' + k + '）');
    else err('跳窗缺少 ' + n + '（' + k + '）：' + [["index.wxml", iw2], ["index.wxss", iws9], ["体验版", tpl9]]
      .filter(p => !lampHas(p[1], k)).map(p => p[0]).join(' / '));
  });
  if (lampHas(iws9, '.lamp-scroll') && /\.lamp-scroll\s*\{[^}]*flex:/.test(iws9) && /\.lamp-scroll\s*\{[^}]*min-height:\s*0/.test(iws9))
    ok('index.wxss 的 .lamp-scroll 为弹性滚动区（flex + min-height: 0）');
  else err('index.wxss 的 .lamp-scroll 不是弹性滚动区（内容仍会被裁切）');
  const footPin = /\.lamp-actions\s*\{[^}]*flex:\s*0\s+0\s+auto/;
  if (footPin.test(iws9) && footPin.test(tpl9)) ok('两端 .lamp-actions 不被压缩（CTA 永远在屏内）');
  else err('.lamp-actions 缺少 flex: 0 0 auto（会被滚动区压扁）：' +
    [['index.wxss', iws9], ['体验版', tpl9]].filter(p => !footPin.test(p[1])).map(p => p[0]).join(' / '));
  // 点亮后 CTA 收起（不留死按钮）：小程序 wx:if="{{!lampLit}}"；体验版 .lamp-btn.hide
  if (/wx:if="\{\{!lampLit\}\}"\s+class="lamp-btn"/.test(iw2)) ok('小程序点亮后收起 CTA（wx:if="{{!lampLit}}"）');
  else err('小程序点亮后未收起 CTA（会留下「再点没反应」的死按钮）');
  if (lampHas(tpl9, '.lamp-btn.hide') && /lamp-btn'\)\.classList\.add\('hide'\)/.test(tpl9))
    ok('体验版点亮后收起 CTA（.lamp-btn.hide + classList.add）');
  else err('体验版点亮后未收起 CTA');
  const closeBind = (iw2.match(/bindtap="closeLampWindow"/g) || []).length;
  if (closeBind >= 3) ok('小程序跳窗有三个关闭出口（✕ / 显著关闭 / 未点亮文字链），共 ' + closeBind + ' 处绑定');
  else err('小程序跳窗关闭出口不足（应为 ✕ + 关闭按钮 + 文字链，实际 ' + closeBind + ' 处）');
  ['lamp-x', 'lamp-close'].forEach(id => {
    if (new RegExp("\\$\\('" + id + "'\\)\\.addEventListener\\('click'").test(tpl9)) ok('体验版已绑定 #' + id + ' 点击');
    else err('体验版未绑定 #' + id + ' 点击');
  });
  if (lampHas(tpl9, '.lamp-close.show') && lampHas(tpl9, '.lamp-skip.hide'))
    ok('体验版有「点亮后显示关闭 / 隐藏文字链」的样式开关');
  else err('体验版缺少点亮后的显隐样式（.lamp-close.show / .lamp-skip.hide）');
  // 反例自测：把关键样式类从样例文本里抽掉，同一套判定必须能报错
  const probeTpl = tpl9.replace('.lamp-close.show', '.lamp-close');
  if (!lampHas(probeTpl, '.lamp-close.show') && lampHas(tpl9, '.lamp-close.show'))
    ok('守卫自测：显隐样式缺失可被检出');
  else err('守卫自测失败（显隐样式判定逻辑有问题）');
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
  ['生成今日祝福签卡片', '保存到相册', '雪域日签 · 第 ' + 'n 签', '小程序码', '认藏文，从方块开始']
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

  // 28.2 激励字样扫描：全项目所有分享函数体（含注释）不得承诺回报。
  // 两个入口都扫：好友转发 onShareAppMessage + 朋友圈 onShareTimeline（D41 后新增的增长入口）。
  const SHARE_REWARD_PAT = /分享[^'"\n]{0,10}(得|解锁|抽奖|返|赚)|返现|积分翻倍|奖励/;
  const sharePages = ['pages/index/index.js', 'pages/result/result.js', 'pages/passport/passport.js', 'pages/cert/cert.js'];
  sharePages.forEach(f => {
    const src = read(f);
    ['onShareAppMessage', 'onShareTimeline'].forEach(fn => {
      const i = src.indexOf(fn);
      if (i === -1) return;                                  // 该页没做这个入口，不要求
      const block = src.slice(i, i + 420);
      const hitR = block.match(SHARE_REWARD_PAT);
      const hitM = block.match(OFFER_DIGIT_PAT) || block.match(MONEY_UNIT_PAT);
      if (!hitR && !hitM) ok(f + ' 的 ' + fn + ' 只带内容不带激励');
      else err(f + ' 的 ' + fn + ' 出现激励/金额字样：' + (hitR || hitM)[0]);
    });
  });
  // 朋友圈入口存在性（增长补口：无推荐流入口的小程序，朋友圈是唯一零成本曝光面）
  if (read('pages/index/index.js').indexOf('onShareTimeline') > -1)
    ok('首页补朋友圈分享入口 onShareTimeline');
  else err('首页缺 onShareTimeline（朋友圈曝光为零）');

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
//   ① D25 已拍板（2026-10-06）→ 揭图**不得新增**宗教符号（吉祥八宝只取另外 7 个 + 3 个自然/生活题）；
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
    // 藏文书写规范（2026-10-08 用户拍板修订）：**完整词尾必须带一个 ་**（展示态）；
    //   仍禁止：行首 ་、连续 ་་。依据：用户原话「每一个完整藏文字符后面都应该有 ་」。
    const badTib = rvList29.filter(r => {
      const t = (r.tibetan || '').trim();
      if (!t) return true;
      if (!/[་།]$/.test(t)) return true;     // 词尾必须带 ་ 或 །
      if (/^་|་་/.test(t)) return true;       // 禁止行首 ་ / 连续 ་
      return false;
    });
    if (!badTib.length) ok('揭图藏文名符合书写规范（词尾带 ་；无行首/连续 ་）');
    else err('揭图藏文名不符合书写规范（词尾应带 ་）：' + badTib.map(r => r.name).join('/'));
  }

  // 29.2 图片资产：存在 + 单张体积预算（主包 2MB 硬约束）
  let rvBytes29 = 0;
  for (let i = 1; i <= 10; i++) {
    const nn = String(i).padStart(2, '0');
    // 2026-10-08 起主格式 .webp（AI 写实画作）；.jpg/.png 兼容
    const rel = ['images/reveal_' + nn + '.webp', 'images/reveal_' + nn + '.jpg', 'images/reveal_' + nn + '.png']
      .find(f => exists(f));
    if (!rel) { err('缺少揭示图 images/reveal_' + nn + '.(webp|jpg|png)'); continue; }
    const b = fs.statSync(path.join(ROOT, rel)).size;
    rvBytes29 += b;
    if (b > 33 * 1024) err(rel + ' 超出单张 33KB 预算（' + Math.round(b / 1024) + 'KB）');
  }
  if (rvBytes29 > 0 && rvBytes29 <= 340 * 1024)
    ok('十张揭示图合计 ' + Math.round(rvBytes29 / 1024) + 'KB（≤340KB 预算，主包安全）');
  else if (rvBytes29 > 450 * 1024)
    err('十张揭示图合计 ' + Math.round(rvBytes29 / 1024) + 'KB 超预算（450KB）');
  if (exists('scripts/make_reveals.py')) ok('scripts/make_reveals.py 存在（揭示图可零美术成本复现）');
  else err('缺 scripts/make_reveals.py（揭示图必须可由脚本复现，不靠手绘资产）');

  // 29.3 D25 红线（2026-10-06 已拍板定案）：揭图不得新增宗教符号。
  //      只扫「非注释行」：文件头注释里要写清楚这条红线本身，不能自己绊倒自己。
  const rvCode29 = rvRaw29.split('\n').filter(l => l.trim().indexOf('//') !== 0).join('\n');
  const D25_PAT29 = /莲花|lotus|经幡|风马旗|佛塔|酥油灯/g;
  const hit25 = rvCode29.match(D25_PAT29) || [];
  if (!hit25.length) ok('data/reveals.js 数据层未出现 D25 红线符号（莲花/经幡/佛塔/酥油灯）');
  else err('data/reveals.js 出现 D25 红线符号：' + hit25.join('/'));
  // 元素库不得被顺手扩充（ religious symbols 只能以「装饰纹样」存在，不能变成可消除牌面）
  const elCount29 = (read('data/elements.js').match(/type:\s*'(letter|icon)'/g) || []).length;
  if (elCount29 === 34) ok('元素库为 34 个元素（30 辅音扩充 2026-10-07 拍板后的新基线；揭图不得再夹带）');
  else err('元素库元素数变了（' + elCount29 + ' ≠ 34）：再增删元素需另行拍板，不得随任何特性夹带');

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
  // 揭图口径变更（D33）：分母不再是「总对数」，而是「格数」——
  // 有补充牌后盘面不会全空，改成「多少格曾清空过」，通关时同样是整幅揭晓（只增不减）。
  if (gj29.indexOf('freedPct: function ()') > -1 &&
      gj29.indexOf('Math.round(n * 100 / this.board.slots)') > -1 &&
      gj29.indexOf('revealPct: that.freedPct()') > -1)
    ok('game.js 揭图进度按「曾清空的格数 / 格数」实时推进（只增不减）');
  else err('game.js 缺 freedPct 计算（揭图不会随消除推进，或分母仍写死总对数）');
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
  if (bh29.indexOf("'.webp', '.jpg', '.png'") > -1 && bh29.indexOf("reveal_' + nn") > -1)
    ok('build-h5.js 内联十张揭示图（多扩展名解析，体验版保持单文件）');
  else err('build-h5.js 未内联揭示图（体验版会引用到不存在的相对路径）');
  if (bh29.indexOf('r.img = IMAGES[key]') > -1)
    ok('build-h5.js 把揭图路径换写为 data URL（/images/... 是小程序路径）');
  else err('build-h5.js 未换写揭图路径（H5 会拿到小程序路径而裂图）');
}


// ================= 30. 文字对比度（D32 · WCAG AA） =================
// 背景：外部报告提出「所有文字对比度 ≥ 4.5:1」。实测发现三类真问题并已修：
//   ① 牌面 3D 渐变把 shade(c,1.42) 高光铺满顶部 58%，白字被冲掉（四色 1.48~3.26）；
//   ② 图标按 el.color 画在**同色**牌面上（1.41~1.75，几乎不可见）；金块浅金牌面配奶白字形（1.00）；
//   ③ 13 个灰调/金/绿墨色在浅卡上只有 2.13~3.76（126 处声明）。
// 本节用 sRGB 相对亮度把对比度**算出来**，不信任字面量。
section('30. 文字对比度（WCAG AA · 牌面渐变采样 + 墨色回归锁）');
{
  // --- 30.0 对比度函数（sRGB 相对亮度，与 WCAG 定义一致） ---
  const lin30 = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum30 = rgb => 0.2126 * lin30(rgb[0]) + 0.7152 * lin30(rgb[1]) + 0.0722 * lin30(rgb[2]);
  const hex30 = h => { const s = h.replace('#', ''); const f = s.length === 3 ? s.split('').map(x => x + x).join('') : s;
    return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)]; };
  const ratio30 = (a, b) => { const la = lum30(a), lb = lum30(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
  const shade30 = (hex, f) => { const n = parseInt(hex.slice(1), 16);
    return [16, 8, 0].map(s => Math.min(255, Math.round(((n >> s) & 255) * f))); };
  const clamp30 = v => Math.round(v * 100) / 100;
  const WHITE30 = hex30('#FFFFFF'), CREAM30 = hex30('#FDF6E3'), CARD30 = hex30('#FCF6E8'), DARK30 = hex30('#0B1E36');
  const AA30 = 4.5;

  // --- 30.1 牌面渐变：按 stops 采样，字形/图标占位区(y10%~90%)内最差对比度 ≥ 4.5 ---
  const gj30 = read('pages/game/game.js');
  const tpl30 = read('preview/template.html');
  const el30 = read('data/elements.js');
  // 新 stops：0% 1.39 → 8% 1.02 → 14% 起平色 → 58% → 100% 0.68（与 pieceStyle 同参数）
  const STOPS30 = [[0.00, 1.39], [0.08, 1.02], [0.14, 1.00], [0.58, 1.00], [1.00, 0.68]];
  const faceAt30 = (hex, y) => {
    for (let i = 0; i < STOPS30.length - 1; i++) {
      const [y0, k0] = STOPS30[i], [y1, k1] = STOPS30[i + 1];
      if (y >= y0 && y <= y1) {
        const t = y1 > y0 ? (y - y0) / (y1 - y0) : 0;
        const a = shade30(hex, k0), b = shade30(hex, k1);
        return [0, 1, 2].map(j => Math.round(a[j] * (1 - t) + b[j] * t));
      }
    }
    return shade30(hex, STOPS30[STOPS30.length - 1][1]);
  };
  // 顶部窄倒角必须真的收进字形区之外：14% 处应已是平色
  if (gj30.indexOf('shade(color, 1.39)') > -1 && gj30.indexOf("' 8%, ' + color + ' 14%, '") > -1)
    ok('pieceStyle 高光收进顶部 14%（小程序）');
  else err('pieceStyle 高光带仍压住字形占位区（应 1.39 → 1.02 → 14% 平色）');
  if (tpl30.indexOf('shade(color, 1.39)') > -1 && tpl30.indexOf("' 8%, ' + color + ' 14%, '") > -1)
    ok('pieceStyle 高光收进顶部 14%（体验版）');
  else err('体验版 pieceStyle 未同步窄倒角 stops');

  // 元素四色：奶白字形/图标在「平色段」上的对比度（金/绿已压暗）
  // 30 辅音扩充后：颜色在四张达标牌面色里循环，逐元素全量采样（不再是 8 字母抽样）
  const EL30 = {};
  {
    const elSrc30 = eval('(' + read('data/elements.js').replace(/^module\.exports\s*=\s*/, '').replace(/;\s*$/, '') + ')');
    Object.keys(elSrc30).forEach(id => { EL30[id] = elSrc30[id].color; });
  }
  Object.keys(EL30).forEach(id => {
    const c = EL30[id];
    const worst = Math.min(...[0.10, 0.14, 0.30, 0.50, 0.70, 0.90].map(y => ratio30(hex30('#FFF6DC'), faceAt30(c, y))));
    if (worst >= AA30) ok('元素 ' + id + ' ' + c + ' 奶白字形/图标 最差 ' + clamp30(worst) + ':1');
    else err('元素 ' + id + ' ' + c + ' 奶白字形/图标 对比度不足：' + clamp30(worst) + ':1（需 ≥4.5）');
  });
  // 元素本色必须就是这四个（防止有人把金/绿改回去）
  [['#8A6A12', '金'], ['#176B3C', '绿'], ['#C0392B', '红'], ['#2471A3', '蓝'], ['#5D6D7E', '灰']].forEach(([c, n]) => {
    if (el30.indexOf("'" + c + "'") > -1) ok('元素库含' + n + '墨 ' + c);
    else err('元素库丢了' + n + '墨 ' + c + '（对比度体系依赖它）');
  });
  [['#B7950B', 'data/elements.js'], ['#1E8449', 'data/elements.js']].forEach(([c, f]) => {
    // 只扫非注释行：说明文字里会提到旧墨（「金 #B7950B→#8A6A12」），不算数
    const code30 = read(f).split('\n').filter(l => l.trim().indexOf('//') !== 0).join('\n');
    if (code30.indexOf(c) > -1) err(f + ' 代码行仍出现旧墨 ' + c + '（金字/绿字会掉回 2.66 / 4.37）');
    else ok(f + ' 代码行已清除旧墨 ' + c);
  });

  // --- 30.2 图标三墨变体（普通牌奶白 / 金块深墨 / 卡片本色） ---
  const ic30 = read('utils/icons.js');
  [['TILE_LITE_INK', '#FFF6DC'], ['TILE_GOLD_INK', '#6B4406']].forEach(([k, v]) => {
    if (ic30.indexOf(k + " = '" + v + "'") > -1) ok('icons.js ' + k + ' = ' + v);
    else err('icons.js 缺 ' + k + '（图标三墨变体是修「同色图标隐形」的关键）');
  });
  ["['', null]", "['|lite', TILE_LITE_INK]", "['|gold', TILE_GOLD_INK]"].forEach(k => {
    if (ic30.indexOf(k) > -1) ok('icons.js 渲染变体 ' + k);
    else err('icons.js 未渲染变体 ' + k);
  });
  const gw30 = read('pages/game/game.wxml');
  if (gw30.indexOf("iconPaths[item.id + '|lite']") > -1 && gw30.indexOf("iconPaths[item.id + '|gold']") > -1)
    ok('game.wxml 牌面图标按 golden 选 |lite / |gold 变体');
  else err('game.wxml 牌面图标仍引用无变体的 iconPaths[item.id]（会渲染同色隐形图标）');
  if (tpl30.indexOf('function tileIconDataUrl') > -1 && tpl30.indexOf('tileIconDataUrl(t.id, t.golden)') > -1)
    ok('体验版 tileIconDataUrl 按 golden 选墨');
  else err('体验版未实现 tileIconDataUrl（牌面图标仍是同色）');

  // --- 30.3 金块牌面：浅金三段上的深墨 ≥ 4.5 ---
  const gx30 = read('pages/game/game.wxss');
  ['#FFF6D8', '#FFE9A8', '#E8C465'].forEach(bg => {
    const r = ratio30(hex30('#6B4406'), hex30(bg));
    if (r >= AA30) ok('金块深墨 #6B4406 on ' + bg + ' = ' + clamp30(r) + ':1');
    else err('金块深墨 #6B4406 on ' + bg + ' = ' + clamp30(r) + ':1（不足）');
  });
  ['.tile.golden .glyph', '.tile.golden .glyph-fallback'].forEach(k => {
    if (gx30.indexOf(k) > -1 && gx30.indexOf('color: #6B4406') > -1) ok('game.wxss ' + k + ' 用深墨');
    else err('game.wxss 缺 ' + k + ' 深墨规则（金块上奶白字 = 1.00）');
  });
  if (tpl30.indexOf('#6B4406; text-shadow') > -1) ok('体验版金块深墨规则已同步');
  else err('体验版缺金块深墨规则');

  // --- 30.4 浅卡墨色回归锁：13 个旧墨不得再以 color: 形式出现 ---
  const OLD_INKS = { '#8A8375': 3.76, '#9A9384': 3.05, '#A79F8D': 2.63, '#A79E8B': 2.66, '#B9B1A0': 2.13,
                     '#B9AE94': 2.20, '#C4BCA6': 1.89, '#B3AB99': 2.28, '#A9A192': 2.56, '#A69C88': 2.72,
                     '#8D8577': 3.65, '#7F8C8D': 3.22 };
  const cssFiles30 = ['pages/index/index.wxss', 'pages/game/game.wxss', 'pages/result/result.wxss',
    'pages/cert/cert.wxss', 'pages/passport/passport.wxss', 'pages/benefits/benefits.wxss',
    'app.wxss', 'preview/template.html'];
  const colorDecl30 = cssFiles30.map(read).join('\n');
  Object.keys(OLD_INKS).forEach(ink => {
    const re = new RegExp('(?<![-\\w])color\\s*:\\s*' + ink, 'i');
    if (re.test(colorDecl30)) err('仍有 color: ' + ink + '（浅卡上仅 ' + OLD_INKS[ink] + ':1，应改 #6E6759 / #5D6D7E）');
    else ok('已无 color: ' + ink);
  });
  if (/(?<![-\w])color\s*:\s*#B7950B/i.test(colorDecl30))
    err('仍有 color: #B7950B（浅卡金字 2.87，应改 #8A6A12）');
  else ok('已无 color: #B7950B');
  if (/(?<![-\w])color\s*:\s*#1E8449/i.test(colorDecl30))
    err('仍有 color: #1E8449（米卡上 4.37，应改 #176B3C）');
  else ok('已无 color: #1E8449');
  // 合并后的新墨必须真的达标
  [['#6E6759', WHITE30], ['#6E6759', CREAM30], ['#8A6A12', CREAM30], ['#176B3C', CREAM30], ['#5D6D7E', CREAM30]]
    .forEach(([ink, bg]) => {
      const r = ratio30(hex30(ink), bg);
      if (r >= AA30) ok('新墨 ' + ink + ' on 米/白卡 = ' + clamp30(r) + ':1');
      else err('新墨 ' + ink + ' 对比度不足 ' + clamp30(r) + ':1');
    });

  // --- 30.5 证书档位色（同一色既当文字又当白字标签的底） ---
  const cert30 = read('utils/certificate.js');
  if (cert30.indexOf("color: '#8A6A12'") > -1) ok('证书金档 #8A6A12');
  else err('证书金档未改为 #8A6A12（宣纸米底 2.66 / 白字落金底 2.87）');
  if (cert30.indexOf("color: '#5D6D7E'") > -1) ok('证书银档 #5D6D7E');
  else err('证书银档未改为 #5D6D7E（3.22 / 3.48）');
  if (tpl30.indexOf("color: '#8A6A12', minAccuracy: 0.95") > -1) ok('体验版证书金档已同步');
  else err('体验版证书金档未同步');
  [['#8A6A12', CREAM30], ['#FFFFFF', hex30('#8A6A12')], ['#5D6D7E', CREAM30], ['#FFFFFF', hex30('#5D6D7E')]]
    .forEach(([a, b]) => {
      const r = ratio30(hex30(a), b);
      if (r >= AA30) ok('证书档位 ' + a + '×' + '#RGB' + ' = ' + clamp30(r) + ':1');
      else err('证书档位对比度不足 ' + clamp30(r) + ':1');
    });

  // --- 30.6 证书藏文不得再用半透明红墨（20px 非大字，需 4.5） ---
  const cx30 = read('pages/cert/cert.wxss');
  if (cx30.indexOf('rgba(192, 57, 43, 0.78)') > -1) err('.sheet-tib 仍用半透明红墨（3.54）');
  else ok('.sheet-tib 已改实色达标红');
  if (cx30.indexOf('color: #C0392B') > -1) ok('证书藏文 #C0392B on 米底 ' + clamp30(ratio30(hex30('#C0392B'), CREAM30)) + ':1');
  else err('证书藏文缺 #C0392B');

  // --- 30.7 中调金底必须压暗：白/奶白字才可达标（同块 color×background 抽查） ---
  const pairs30 = [
    ['pages/game/game.wxss', 'color: #FFFFFF;\n  background: #B7950B;', 'game.wxss .fact-label 金底未压暗'],
    ['pages/result/result.wxss', 'color: #FFFFFF;\n  background: #B7950B;', 'result.wxss .reveal-tag 金底未压暗'],
    ['pages/benefits/benefits.wxss', 'background: #B7950B;\n  border-color: #B7950B;', 'benefits.wxss .bn-city.on 金底未压暗'],
    ['preview/template.html', 'color: #fff; background: #B7950B;', 'template.html 仍有白字配中调金底'],
  ];
  pairs30.forEach(([f, k, msg]) => {
    if (read(f).indexOf(k) > -1) err(msg + '（白字 on #B7950B = 2.87）');
    else ok(msg.replace('未压暗', '已压暗').replace('仍有白字配中调金底', '白字金底已全部压暗'));
  });
  [['#FFFFFF', '#8A6A12'], ['#FFF6DC', '#8A6A12'], ['#FFFBF0', '#8A6A12'], ['#FFD98A', '#7A4E24']].forEach(([a, b]) => {
    const r = ratio30(hex30(a), hex30(b));
    if (r >= AA30) ok('浅字 on 深金 ' + b + ' = ' + clamp30(r) + ':1');
    else err('浅字 on 深金 ' + b + ' 不足 ' + clamp30(r) + ':1');
  });
  // 木箱数字底
  [['pages/game/game.wxss'], ['preview/template.html']].forEach(([f]) => {
    if (read(f).indexOf('#9A6531 0%') > -1) err((f === 'pages/game/game.wxss' ? 'game.wxss' : 'template.html') + ' 木箱最亮停靠点仍为 #9A6531（金字 3.63）');
    else ok((f === 'pages/game/game.wxss' ? 'game.wxss' : 'template.html') + ' 木箱底已压暗（金字 ≥4.5）');
  });

  // --- 30.8 体验版 CSS 变量（H5 的文字墨走 var()，字面量扫描抓不到） ---
  const root30 = tpl30.slice(tpl30.indexOf(':root {'), tpl30.indexOf('}', tpl30.indexOf(':root {')));
  [['--muted', '#6E6759', '次级文字'], ['--green', '#176B3C', '绿色文字'], ['--gold', '#8A6A12', '金色文字']]
    .forEach(([k, v, d]) => {
      if (root30.indexOf(k + ': ' + v) > -1) ok('体验版 ' + k + ' = ' + v + '（' + d + '）');
      else err('体验版变量 ' + k + ' 未设为 ' + v + '（' + d + '会掉回旧墨）');
    });
  if (tpl30.indexOf('var(--gold, #B7950B)') > -1) err('体验版仍用 var(--gold, #B7950B) 回退（--gold 未定义时会掉回旧墨）');
  else ok('体验版已清除 var(--gold, #B7950B) 回退');

  // --- 30.9 负向自测：对比度函数本身必须能判错 ---
  if (clamp30(ratio30(hex30('#FFFFFF'), hex30('#B7950B'))) === 2.87) ok('自测：白字 on 旧金底 = 2.87（与实测一致）');
  else err('对比度函数失准：白字 on #B7950B 应为 2.87');
  if (clamp30(ratio30(hex30('#FFF6DC'), hex30('#C0392B'))) === 5.04) ok('自测：奶白 on 红 = 5.04');
  else err('对比度函数失准：奶白 on #C0392B 应为 5.04');
  if (clamp30(ratio30(hex30('#FFF6DC'), hex30('#0D2137'))) === 15.09) ok('自测：奶白 on 暗底 = 15.09');
  else err('对比度函数失准：奶白 on #0D2137 应为 15.09');
  if (clamp30(ratio30(hex30('#2C3E50'), hex30('#0B1E36'))) < AA30) ok('自测：#2C3E50 on 暗底被正确判为不达标（这是 page 继承基色，属已知豁免）');
  else err('对比度函数失准：#2C3E50 on 暗底应 < 4.5');
}

// ================================================================
section('31. 下落式盘面模型（D33：下落 + 顶部补充 + 三条不变量）');
// 这一节是**行为断言**，不是字符串断言：直接把 utils/board.js 跑起来，
// 用种子随机的完整通关模拟验证「能消完 / 池能用光 / 三条不变量恒成立 / 真的会下落」。
// 之所以必须真跑：本轮 4e 模拟就抓出了一个真 bug —— 一对牌竖着落在同一列时，
// 旧实现只能补 1 张（池却少 1 张）→ 池余量变奇数 → 偶不变破 → 盘面卡死（真死局）。
{
  const B = boardMod;
  const mk = (id, uid) => ({ id: id, uid: uid, state: 'idle' });
  // 线性同余种子随机：确定性，才能「同一版本必然同一结果」
  const seeded = (s0) => { let s = s0 >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

  // --- 31.1 池公式与规划 ---
  const poolOk = levels.every(l => {
    const slots = l.cols * l.rows;
    return B.poolSize(l.cols, l.rows) === Math.max(2, Math.ceil(slots / 4 / 2) * 2);
  });
  if (poolOk) ok('补充池公式 = round2(格数/4) 且下限 2（十关一致）');
  else err('补充池公式与 utils/board.js 不一致');

  // --- 31.2 开局：满铺、无一格悬空、三不变量成立 ---
  const lv1 = levels[0];
  const st0 = B.createLevel(lv1, mk, seeded(7));
  const inv0 = B.checkInvariants(st0);
  if (B.countTiles(st0.cells) === st0.slots) ok('开局满铺：在场张数 = 格数 ' + st0.slots);
  else err('开局未满铺：' + B.countTiles(st0.cells) + ' ≠ ' + st0.slots);
  if (st0.cells.length === st0.slots) ok('cells 长度 = 格数（row-major 一维数组）');
  else err('cells 长度 ' + st0.cells.length + ' ≠ 格数 ' + st0.slots);
  if (inv0.even && inv0.conserved && inv0.contiguous) ok('开局三不变量成立（偶 / 守恒 / 列连续）');
  else err('开局三不变量不成立：' + JSON.stringify(inv0));
  if (B.hasPair(st0.cells)) ok('开局盘面就存在可配对（玩家不必先洗牌）');
  else err('开局无可配对 —— 会出现开局死局');

  // --- 31.3 十关种子随机完整模拟 ---
  const simBadAll = [];
  const simNoFall = [];
  const simRow = [];
  levels.forEach(l => {
    const rnd = seeded(1000 + l.level * 37);
    let st = B.createLevel(l, mk, rnd);
    const startLive = B.countTiles(st.cells);
    const poolAll = B.poolLeft(st.pool);
    let falls = 0, spawns = 0, pairs = 0, bad = 0, deadLock = false;
    for (let round = 0; round < 500; round++) {
      const cands = [];
      for (let i = 0; i < st.cells.length; i++) {
        if (!st.cells[i]) continue;
        for (let j = i + 1; j < st.cells.length; j++) {
          if (st.cells[j] && st.cells[i].id === st.cells[j].id) cands.push([i, j]);
        }
      }
      if (!cands.length) {
        const pl = B.poolLeft(st.pool);
        // 无对可配 + 盘面还有牌 = 真死局（偶不变成立的实现里不该出现）
        if (B.countTiles(st.cells) > 0) deadLock = true;
        break;
      }
      const sel = cands[Math.floor(rnd() * cands.length)];
      pairs++;
      const nx = B.collapse(st, sel, { create: mk, rng: rnd });
      const spIdx = {};
      nx.spawned.forEach(s => { spIdx[s.index] = 1; });
      nx.drops.forEach(d => { if (!spIdx[d.index]) falls++; });   // 补充牌不算「下落」
      spawns += nx.spawned.length;
      st = nx;
      const inv = B.checkInvariants(st);
      if (!inv.even || !inv.conserved || !inv.contiguous) bad++;
      if (inv.onBoardCount === 0 && inv.poolLeft === 0) break;
    }
    const poolLeft = B.poolLeft(st.pool);
    const live = B.countTiles(st.cells);
    simRow.push('L' + l.level + ':' + pairs + '/' + (st.total / 2) + ' fall' + falls);
    if (live !== 0 || poolLeft !== 0 || pairs !== st.total / 2 || st.spent !== st.total ||
        bad !== 0 || deadLock || startLive !== st.total - poolAll || spawns !== poolAll) {
      simBadAll.push(JSON.stringify({
        level: l.level, pairs: pairs, need: st.total / 2, live: live, poolLeft: poolLeft,
        spent: st.spent, total: st.total, bad: bad, deadLock: deadLock,
        startLive: startLive, poolAll: poolAll, spawns: spawns
      }));
    }
    if (falls < 1) simNoFall.push('L' + l.level);
  });
  if (!simBadAll.length) ok('十关随机模拟：全部消完 + 池用尽 + 全程零死局 + 三不变量零违反');
  else err('十关模拟异常：' + simBadAll.slice(0, 3).join(' | '));
  if (!simNoFall.length) ok('十关都真的会下落（随机玩法下每关都有非补充牌的位移）');
  else err('下列关卡全程零下落：' + simNoFall.join(','));
  ok('模拟明细（对数/总对数 下落次数）：' + simRow.join(' '));

  // --- 31.4 偶不变为什么能杜绝死局：反例自测 ---
  // 构造「一对牌竖着落在同一列」的场景：这是旧实现唯一会补 1 张的路径。
  const sameCol = {
    cols: 2, rows: 3, total: 6, slots: 6, nextUid: 90, spent: 0, pool: { a: 2 },
    cells: [mk('a', 1), mk('b', 2), mk('a', 3), mk('b', 4), null, null]
  };
  const sc = B.collapse(sameCol, [0, 2], { create: mk, rng: () => 0 });
  const scInv = B.checkInvariants(sc);
  if (sc.spawned.length === 2) ok('反例自测：同列被消 2 张时仍补满 2 张（同列叠放，不半途而废）');
  else err('反例自测失败：同列消 2 张只补了 ' + sc.spawned.length + ' 张（池会变奇数 → 死局）');
  if (scInv.even && scInv.conserved && scInv.contiguous) ok('反例自测：该情形下三不变量仍成立');
  else err('反例自测失败：同列补充破坏了不变量 ' + JSON.stringify(scInv));
  // 反向：如果只补 1 张，池会变奇数 —— 用「人为只补 1 张」的盘面验证检测器抓得住
  const poisoned = {
    cols: 2, rows: 3, total: 6, slots: 6, nextUid: 90, spent: 0, pool: { a: 1 },
    cells: [mk('a', 1), mk('b', 2), null, mk('b', 4), null, null]
  };
  if (B.checkInvariants(poisoned).even === false) ok('反例自测：人为把池改成奇数 1 → 不变量检测器判错（尺子是准的）');
  else err('不变量检测器失准：池为奇数时未判错');
  // 反向：人为造一张悬空牌 → 列连续检测器必须抓得住
  const floating = {
    cols: 2, rows: 3, total: 6, slots: 6, nextUid: 90, spent: 0, pool: { a: 0 },
    cells: [mk('a', 1), null, null, mk('b', 4), null, null]
  };
  if (B.checkInvariants(floating).contiguous === false) ok('反例自测：人为造悬空牌 → 列连续检测器判错');
  else err('列连续检测器失准：悬空牌未被发现');
  // 反向：总量守恒检测器
  const leaky = {
    cols: 2, rows: 3, total: 99, slots: 6, nextUid: 90, spent: 0, pool: { a: 0 },
    cells: [mk('a', 1), null, null, mk('b', 4), null, null]
  };
  if (B.checkInvariants(leaky).conserved === false) ok('反例自测：人为改总数 → 守恒检测器判错');
  else err('守恒检测器失准：总数对不上时未判错');

  // --- 31.5 两端同构：体验版必须镜像同一套契约 ---
  const tpl31 = read('preview/template.html');
  const gj31 = read('pages/game/game.js');
  const gw31 = read('pages/game/game.wxml');
  const gx31 = read('pages/game/game.wxss');
  [
    ['boardCollapse', '体验版镜像 boardCollapse（下落结算）'],
    ['boardPlanRefillCells', '体验版镜像 boardPlanRefillCells（整对落子规划）'],
    ['boardColumnHeight', '体验版镜像 boardColumnHeight'],
  ].forEach(([k, m]) => {
    if (tpl31.indexOf('function ' + k + '(') > -1) ok(m);
    else err(m + ' 缺失（两端契约会漂移）');
  });
  if (!/pool\[pickId\]\s*-=\s*1;/.test(tpl31) || /take\s*-=\s*1/.test(tpl31) === false) {
    ok('体验版已移除「take 可能为奇数」的旧补牌写法');
  } else {
    err('体验版仍保留「take 为奇数就减 1」的旧写法（会漏补一张 → 池余量变奇数）');
  }
  if (tpl31.indexOf('boardCountTiles') > -1) ok('体验版镜像 boardCountTiles');
  else err('体验版缺 boardCountTiles');

  // 盘面渲染：绝对定位 + 按 uid 稳定 key + 双帧下落
  if (gx31.indexOf('position: absolute') > -1 && /\.board\s*\{[\s\S]*?position:\s*relative/.test(gx31))
    ok('game.wxss 盘面改绝对定位（父层 relative + 牌 absolute）');
  else err('game.wxss 盘面仍非绝对定位（CSS grid 自动流无法做下落动画）');
  if (gx31.indexOf('transition: transform') > -1) ok('game.wxss .tile 用 transform 过渡播放下落');
  else err('game.wxss .tile 缺 transform 过渡（下落会跳变）');
  if (gw31.indexOf('wx:key="uid"') > -1) ok('game.wxml 用 wx:key="uid"（牌换格要复用同一节点）');
  else err('game.wxml 未按 uid 稳定 key（下落时节点会重建，动画丢失）');
  if (/\.tile\.shake\s+\.piece/.test(gx31) && /\.tile\.shake\s+\.piece/.test(tpl31))
    ok('抖动动画作用在内层 .piece（.tile 的 transform 已被定位占用）');
  else err('抖动动画写在了 .tile 上（会让牌瞬移到盘面左上角）');
  if (/\.tile\s+fresh|\.tile\.fresh/.test(gx31) && /\.tile\.fresh/.test(tpl31))
    ok('两端都有 .tile.fresh（补充牌的首帧盘外 + 透明）');
  else err('缺 .tile.fresh（补充牌会凭空出现在盘内，看不到「掉下来」）');
  if (/\.board-wrap\s*\{[\s\S]*?overflow:\s*hidden/.test(gx31) && /#board\s*\{[^}]*overflow:\s*hidden/.test(tpl31))
    ok('两端牌区都裁切溢出（补充牌在盘外时不可见）');
  else err('牌区未裁切溢出（补充牌会飘在盘面之外）');

  // 队列/选中态按 uid 记：这两处按格号记都会出错（排队期间盘面会变）
  if (gj31.indexOf('this.removeQueue.push([a.uid, b.uid])') > -1)
    ok('game.js 消除队列存 uid（格号在排队期间会过期）');
  else err('game.js 消除队列仍存格号（前面的下落会让格号失效 → 消错牌）');
  if (gj31.indexOf('firstUid') > -1 && tpl31.indexOf('state.firstUid') > -1)
    ok('两端选中态按 uid 记（牌换格后选中框跟着走）');
  else err('选中态按格号记（牌换格后选中框会留在另一张牌上）');
  if (gj31.indexOf('this.indexOfUid(') > -1 && /function indexOfUid\(/.test(tpl31))
    ok('两端都有「uid → 当前格号」反查');
  else err('缺 uid → 格号反查（结算时无法定位牌）');
  // 揭图口径与通关去重
  if (gj31.indexOf('freedPct: function ()') > -1 && tpl31.indexOf('function freedPct()') > -1)
    ok('两端都有 freedPct（揭图按「曾清空的格」算）');
  else err('缺 freedPct');
  if (gj31.indexOf('finished') > -1 && tpl31.indexOf('state.finished') > -1)
    ok('两端通关只结算一次（finished 去重）');
  else err('通关结算未去重（连点会重复播粒子并重复跳页）');
  if (tpl31.indexOf('function renderResult()') > -1)
    ok('体验版把结算内容与庆祝拆开（庆祝一次、内容可重绘）');
  else err('体验版未拆开 finishLevel / renderResult');

  // --- 31.6 体验版内联脚本语法 + 与小程序同一套盘面常量 ---
  try {
    // 与 build-h5 同一套抽取方式（非贪婪匹配内联块），并且**必须先填占位符**：
    // 模板里是 `const DATA = /*__DATA__*/;`，不替换就是 `const DATA = ;` → 语法报错。
    // ⚠️ 占位符清单必须与 build-h5.js 的替换清单保持一致（新增占位符时两处都要加）。
    const filled31 = tpl31.replace('/*__DATA__*/', 'null').replace('/*__IMAGES__*/', 'null')
      .replace('/*__VOICES__*/', 'null').replace('/*__ICON_ART__*/', 'null')
      .replace('/*__PHOTO__*/', 'null');
    const m31 = filled31.match(/<script>([\s\S]*?)<\/script>/);
    if (!m31) throw new Error('未找到内联 <script> 块');
    new Function(m31[1]);
    ok('体验版内联脚本语法通过（board 镜像可加载）');
  } catch (ex) {
    err('体验版内联脚本语法错误：' + ex.message);
  }
  const lv31 = read('data/levels.js');
  if (lv31.indexOf('round2(slots/4)') > -1 || lv31.indexOf('POOL_DIV') > -1 || lv31.indexOf('补充池') > -1)
    ok('data/levels.js 标注了「总数 = 格数 + 补充池」口径');
  else warn('data/levels.js 未标注新口径（后人容易误改回「总数 = 格数」）');
  if (read('scripts/build-h5.js').indexOf('slots + pool') > -1)
    ok('build-h5 一致性校验已改口径（总数 = 格数 + 池）');
  else err('build-h5 仍在用「总数 = 格数」校验');
}


// ================================================================
section('32. 消除情绪激励（D34：时间窗口连击 · 五档赞美 · 两端同源）');
{
  const praise32 = require(path.join(ROOT, 'utils', 'praise'));
  const library32 = require(path.join(ROOT, 'data', 'praise'));
  const tib32 = require(path.join(ROOT, 'utils', 'tibetan-text'));
  const { checkPraiseLibrary } = require(path.join(ROOT, 'scripts', 'lib', 'praise-guard'));
  const gw32 = read('pages/game/game.wxml');
  const gx32 = read('pages/game/game.wxss');
  const gj32 = read('pages/game/game.js');
  const au32 = read('utils/audio.js');
  const st32 = read('utils/storage.js');
  const tpl32 = read('preview/template.html');
  const b532 = read('scripts/build-h5.js');

  // --- 32.1 文案库：用与 build-h5 同一把尺子（scripts/lib/praise-guard.js） ---
  const libRes32 = checkPraiseLibrary(library32, { isWellFormedSentence: tib32.isWellFormedSentence });
  if (libRes32.bad === 0) ok('文案库过守卫：5 档 / 每档 ≥5 条 / 中藏双语齐备 / 字段白名单 / 无重复');
  else libRes32.errors.forEach(m => err(m));
  const total32 = (library32.tiers || []).reduce((n, t) => n + t.texts.length, 0);
  ok('文案库共 ' + total32 + ' 条（' + library32.tiers.length + ' 档 × ' +
    library32.tiers.map(t => t.texts.length).join('/') + '）');
  (library32.tiers || []).forEach(t => {
    const wfAll = t.texts.every(x => tib32.isWellFormedSentence(x.bo).ok);
    if (wfAll) ok('第 ' + t.level + ' 档（' + t.name + '）' + t.texts.length + ' 条藏文全部良构（无孤立组合符号 / 标点合法 / 末尾有收尾）');
    else err('第 ' + t.level + ' 档存在藏文不良构条目');
  });
  if (library32.pendingNativeReview === true) warn('文案库藏文待母语者校对（pendingNativeReview=true，Gate 2 前置项）');
  else ok('文案库已标记母语者校对完成');

  // --- 32.2 反例自测：这把尺子必须真的拦得住（喂坏数据要判错） ---
  const clone32 = () => JSON.parse(JSON.stringify(library32));
  {
    const c = clone32(); c.tiers.pop();
    if (checkPraiseLibrary(c, { isWellFormedSentence: tib32.isWellFormedSentence }).bad > 0)
      ok('反例自测：删掉一档 → 守卫判错（档位数是真的在查）');
    else err('守卫漏判：只有 4 个档位却通过');
  }
  {
    const c = clone32(); c.tiers[2].texts[0].bo = '\u0F72';
    if (checkPraiseLibrary(c, { isWellFormedSentence: tib32.isWellFormedSentence }).bad > 0)
      ok('反例自测：藏文换成孤立元音 ི → 守卫判错（排版良构是真的在查）');
    else err('守卫漏判：孤立组合符号（会渲染成 ◌ 虚圈）却通过');
  }
  {
    const c = clone32(); c.tiers[0].texts[0].zh = '排行榜第一';
    if (checkPraiseLibrary(c, { isWellFormedSentence: tib32.isWellFormedSentence }).bad > 0)
      ok('反例自测：中文塞入「排行榜」→ 守卫判错（违禁字眼是真的在查）');
    else err('守卫漏判：竞争性字眼却通过');
  }
  {
    const c = clone32(); c.tiers[1].texts[0].price = 9;
    if (checkPraiseLibrary(c, { isWellFormedSentence: tib32.isWellFormedSentence }).bad > 0)
      ok('反例自测：文案夹带 price 字段 → 守卫判错（字段白名单是真的在查）');
    else err('守卫漏判：文案夹带金额字段却通过');
  }
  {
    const c = clone32();
    const bare = ['\u0F0Bཀ', 'ཀ\u0F0D\u0F0D', 'ཀ'];
    if (bare.every(s => !tib32.isWellFormedSentence(s).ok))
      ok('反例自测：tsheg 居首 / shad 连续 / 末尾缺收尾 均被判不良构');
    else err('良构守卫对 tsheg / shad / 收尾 的判定失准');
  }
  if (tib32.isWellFormedSentence('ཡག་པོ།').ok && tib32.isWellFormedSentence('བཀྲ་ཤིས་བདེ་ལེགས།').ok)
    ok('正例自测：ཡག་པོ། / བཀྲ་ཤིས་བདེ་ལེགས། 判为良构（不是一律报错）');
  else err('良构守卫误判正常藏文句');

  // --- 32.3 连击窗口数学（窗口随元素种类缩放，边界含端点） ---
  const W32 = praise32.windowMsOf;
  if (praise32.WINDOW_MIN === 900 && praise32.WINDOW_MAX === 2600) ok('窗口上下界 900 / 2600 ms（单种元素不会过短、12 种不会过长）');
  else err('窗口上下界被改动：' + praise32.WINDOW_MIN + ' / ' + praise32.WINDOW_MAX);
  [[0, 900], [1, 900], [2, 920], [4, 1240], [5, 1400], [6, 1560], [7, 1720], [8, 1880], [10, 2200], [12, 2520], [99, 2600]]
    .forEach(([n, want]) => {
      const got = W32(n);
      if (got === want) ok('窗口：' + n + ' 种元素 → ' + got + ' ms');
      else err('窗口：' + n + ' 种元素应为 ' + want + ' ms，实际 ' + got);
    });
  let mono32 = true;
  for (let n = 1; n <= 20; n++) if (W32(n) < W32(n - 1)) mono32 = false;
  if (mono32) ok('窗口随元素种类单调不减（越难找给的时间越长）');
  else err('窗口出现收缩：某一关会比上一关更难连击');

  // --- 32.4 时间窗口连击：端点算相连、超窗断链、时间倒流断链 ---
  const w1 = W32(4);
  const c1 = praise32.nextCombo({ combo: 0, at: null }, 1000, w1);
  if (c1.combo === 1 && c1.at === 1000) ok('本局首次消除 → 连击 1');
  else err('本局首次消除连击应为 1');
  if (praise32.nextCombo(c1, 1000 + w1, w1).combo === 2) ok('距上次恰好 = 窗口（' + w1 + ' ms）仍算相连 → 连击 2');
  else err('窗口端点判定错误：恰好等于窗口应算相连');
  if (praise32.nextCombo(c1, 1000 + w1 + 1, w1).combo === 1) ok('超出窗口 1 ms → 断链回连击 1');
  else err('超窗未断链（阶梯会退化成「永远是最高档」）');
  if (praise32.nextCombo(c1, 999, w1).combo === 1) ok('时间倒流（now < at）→ 按断链处理，不会算出负数连击');
  else err('时间倒流未断链');
  if (praise32.nextCombo(c1, 1000, w1).combo === 2) ok('同一毫秒内连消两次仍算相连（Δ=0 ≤ 窗口）');
  else err('Δ=0 的边界判定错误');

  // --- 32.5 档位映射与视听档位 ---
  [[0, 1], [1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 5], [99, 5]].forEach(([n, want]) => {
    if (praise32.tierOf(n) === want) ok('连击 ' + n + ' → 档位 ' + want);
    else err('连击 ' + n + ' 应为档位 ' + want + '，实际 ' + praise32.tierOf(n));
  });
  [3, 4, 5].forEach(lv => {
    if (praise32.showsTibetan(lv)) ok('档位 ' + lv + ' 显示藏文大字');
    else err('档位 ' + lv + ' 应显示藏文大字');
  });
  [1, 2].forEach(lv => {
    if (!praise32.showsTibetan(lv)) ok('档位 ' + lv + ' 只出中文（藏文大字从档位 3 起）');
    else err('档位 ' + lv + ' 不应显示藏文大字');
  });
  [4, 5].forEach(lv => {
    if (praise32.showsBurst(lv)) ok('档位 ' + lv + ' 有跃迁光环');
    else err('档位 ' + lv + ' 应有跃迁光环');
  });
  [1, 2, 3].forEach(lv => {
    if (!praise32.showsBurst(lv)) ok('档位 ' + lv + ' 无光环（不喧宾夺主，也不盖住揭图层）');
    else err('档位 ' + lv + ' 不应有光环');
  });
  const WANT_SOUND32 = { 1: 'match', 2: 'drum', 3: 'horn', 4: 'cheer', 5: 'cheer' };
  Object.keys(WANT_SOUND32).forEach(lv => {
    if (praise32.audioFor(Number(lv)) === WANT_SOUND32[lv]) ok('档位 ' + lv + ' 音效 = ' + WANT_SOUND32[lv]);
    else err('档位 ' + lv + ' 音效应为 ' + WANT_SOUND32[lv] + '，实际 ' + praise32.audioFor(Number(lv)));
  });

  // --- 32.6 抽取：同一条文案不连续出现两次 ---
  let bump32 = 0;
  for (let lv = 1; lv <= 5; lv++) {
    for (let r = 0; r < 1; r += 0.01) {
      if (praise32.pickIndex(lv, 0, () => r) === 0) bump32++;
      if (praise32.pickIndex(lv, 4, () => r) === 4) bump32++;
    }
  }
  if (bump32 === 0) ok('抽取永不返回上一条（5 档 × 100 个 rand 采样 × 首/末位两种 lastIndex）');
  else err('同一条文案会连续出现 ' + bump32 + ' 次（「不连续重复」规则失效）');
  let consec32 = 0;
  for (let lv = 1; lv <= 5; lv++) {
    let last = -1;
    for (let k = 0; k < 200; k++) {
      const i = praise32.pickIndex(lv, last, Math.random);
      if (i === last) consec32++;
      last = i;
    }
  }
  if (consec32 === 0) ok('1000 次真实随机抽取中零连续重复（5 档 × 200 次）');
  else err('随机抽取出现连续重复 ' + consec32 + ' 次');

  // --- 32.7 频率控制（阶梯往上跳 = 稀有事件，值得打断） ---
  const GAP32 = praise32.PRAISE_GAP_MS;
  if (praise32.shouldShow(3, 2, 10, () => 0.99)) ok('档位跃迁强制展示（间隔只有 10 ms 也照弹）');
  else err('档位跃迁未强制展示，阶梯爬升的爽感会被间隔闸门吃掉');
  if (!praise32.shouldShow(2, 2, GAP32 - 1, () => 0.99)) ok('同档且间隔不足 ' + GAP32 + ' ms → 丢弃（文字不会互相覆盖）');
  else err('最小间隔未生效');
  if (praise32.shouldShow(2, 2, GAP32, () => 0.99)) ok('间隔刚好达标 → 展示');
  else err('间隔达标却未展示');
  if (praise32.shouldShow(1, 1, GAP32, () => 0.29)) ok('档位 1 概率闸门命中（rand 0.29 < 0.30）');
  else err('档位 1 概率闸门失准');
  if (!praise32.shouldShow(1, 1, GAP32, () => 0.3)) ok('档位 1 概率闸门落空（rand 0.30 ≥ 0.30）');
  else err('档位 1 概率闸门端点错误');
  if (!praise32.shouldShow(1, 0, GAP32, () => 0.99)) ok('档位 1 不算「跃迁」（否则每次孤立消除都弹）');
  else err('档位 1 被误判为跃迁');
  if (praise32.shouldShow(1, 0, null, () => 0.0)) ok('首次展示不受最小间隔限制（since 为 null）');
  else err('首次展示被最小间隔错误拦下');

  // --- 32.8 onMatch / onMiss 端到端（注入假时钟，不依赖真实时间） ---
  let S32 = praise32.initState();
  const types32 = 2, win32 = W32(types32);
  let tt = 100000;
  const lvSeq32 = [];
  for (let k = 0; k < 5; k++) {
    const d = praise32.onMatch(S32, tt, types32, () => 0.0);
    lvSeq32.push(d.level);
    S32 = { combo: d.combo, prevTier: d.prevTier, lastShownAt: d.lastShownAt,
            lastIndex: d.lastIndex, maxCombo: d.maxCombo };
    tt += Math.floor(win32 / 2);
  }
  if (lvSeq32.join(',') === '1,2,3,4,5') ok('半窗内连续 5 次消除 → 档位依次 1→2→3→4→5（阶梯真的在爬）');
  else err('档位阶梯不符：' + lvSeq32.join(','));
  if (S32.maxCombo === 5) ok('最高连击记录累计到 5');
  else err('maxCombo 应为 5，实际 ' + S32.maxCombo);
  const slow32 = praise32.onMatch(S32, tt + win32 + 500, types32, () => 0.0);
  if (slow32.level === 1 && slow32.maxCombo === 5) ok('超窗一次 → 档位回到 1，但最高连击仍记 5（只增不减）');
  else err('超窗后档位/最高连击口径错误：level=' + slow32.level + ' maxCombo=' + slow32.maxCombo);
  const M32 = praise32.onMiss(S32);
  if (M32.combo.combo === 0 && M32.prevTier === 0) ok('错配 → 连击与档位同时归零');
  else err('错配未把连击/档位归零');
  if (M32.maxCombo === 5) ok('错配不清空最高连击（只增不减）');
  else err('错配把最高连击也清了');
  const after32 = praise32.onMatch(M32, tt, types32, () => 0.0);
  if (after32.level === 1) ok('错配后下一次消除从档位 1 重新起步');
  else err('错配后未回到档位 1，实际 ' + after32.level);

  // --- 32.9 两端同源：常量 / 音效表 / 迁移标记 ---
  [['WINDOW_BASE', 600], ['WINDOW_STEP', 160], ['WINDOW_MIN', 900], ['WINDOW_MAX', 2600],
   ['PRAISE_GAP_MS', 1100], ['TIER1_PROB', 0.3]].forEach(([k, v]) => {
    if (praise32[k] === v) ok('utils/praise.js ' + k + ' = ' + v);
    else err('utils/praise.js ' + k + ' 被改动：' + praise32[k]);
  });
  [['PRAISE_WINDOW_BASE', '600'], ['PRAISE_WINDOW_STEP', '160'], ['PRAISE_WINDOW_MIN', '900'],
   ['PRAISE_WINDOW_MAX', '2600'], ['PRAISE_GAP_MS', '1100'], ['PRAISE_TIER1_PROB', '0\\.3']].forEach(([k, v]) => {
    if (new RegExp(k + '\\s*=\\s*' + v + '\\s*;').test(tpl32)) ok('体验版镜像 ' + k + ' = ' + v.replace('\\', ''));
    else err('体验版镜像 ' + k + ' 未对齐 ' + v.replace('\\', '') + '（两端判定会漂移）');
  });
  const soundOf = (src, name) => {
    const m = src.match(new RegExp(name + '\\s*=\\s*(\\[[^\\]]*\\])'));
    return m ? m[1].replace(/\s|'/g, '') : null;
  };
  const tsAudio32 = soundOf(au32, 'TIER_SOUND');
  const tsPraise32 = soundOf(read('utils/praise.js'), 'TIER_SOUND');
  const tsTpl32 = soundOf(tpl32, 'PRAISE_TIER_SOUND');
  if (tsAudio32 && tsAudio32 === tsPraise32 && tsAudio32 === tsTpl32) ok('档位音效表三处逐字一致：' + tsAudio32);
  else err('档位音效表不一致：audio=' + tsAudio32 + ' praise=' + tsPraise32 + ' 体验版=' + tsTpl32);
  [['utils/storage.js', st32], ['preview/template.html', tpl32]].forEach(([f, src]) => {
    if (src.indexOf("COMBO_MODEL = 'window'") > -1 && src.indexOf('comboModel') > -1)
      ok(f + ' 含连击单位迁移契约（COMBO_MODEL / comboModel）');
    else err(f + ' 缺连击单位迁移契约（旧记录会以「每关连击」的旧口径冒充新口径）');
  });
  // D52：档位三音已随其余合成音转 MP3（WAV 不再入包）
  ['audio/drum.mp3', 'audio/horn.mp3', 'audio/cheer.mp3'].forEach(f => {
    if (exists(f)) ok('档位音效资产 ' + f + ' 存在');
    else err('缺少档位音效资产 ' + f);
  });
  if (exists('scripts/make_praise_audio.py')) ok('音效合成脚本 scripts/make_praise_audio.py 存在（三条新音可复现）');
  else err('缺少档位音效合成脚本，新音不可复现');

  // --- 32.10 页面接线（小程序端） ---
  if (gw32.indexOf('class="praise-fx') > -1 && gw32.indexOf('class="praise-burst"') > -1)
    ok('game.wxml 含浮字节点与跃迁光环节点');
  else err('game.wxml 缺浮字 / 光环节点');
  if (gw32.indexOf('status-praise') > -1 && gw32.indexOf('onTogglePraise') > -1)
    ok('game.wxml 含 HUD 文案开关（无设置页，开关落在状态条）');
  else err('game.wxml 缺文案开关');
  if (gw32.indexOf('class="break-fx"') > -1 && gw32.indexOf('class="praise-fx') > -1)
    ok('浮字与破冰/破箱浮字是独立节点（互不打断）');
  else err('浮字与破冰浮字共用了节点');
  if (gw32.indexOf('praiseBurst && praiseAnt') > -1)
    ok('跃迁光环靠 praiseAnt 重新挂载重播动画');
  else err('跃迁光环未挂在 praiseAnt 上（动画不会重播）');
  if (gj32.indexOf('praise.onMatch(') > -1 && gj32.indexOf("require('../../utils/praise')") > -1)
    ok('game.js 引用 utils/praise 并走 onMatch 一站式判定');
  else err('game.js 未走 utils/praise 判定（判定会与体验版漂移）');
  if (gj32.indexOf('praise.onMiss(') > -1) ok('game.js 错配时走 onMiss 断链');
  else err('game.js 错配未断链');
  if (gj32.indexOf('maxCombo') > -1) ok('game.js 把峰值连击（maxCombo）带入结算页，而非最后一次连击');
  else err('game.js 未带峰值连击（结算页「最高连击」会是错的）');
  if (gj32.indexOf('comboVal') === -1) ok('旧的 comboVal 单值实现已清除');
  else err('仍残留旧的 comboVal 实现（两套连击口径并存）');
  ['praisePopA', 'praisePopB'].forEach(k => {
    if (gx32.indexOf('@keyframes ' + k) > -1 && tpl32.indexOf('@keyframes ' + k) > -1) ok('两端都有 @keyframes ' + k);
    else err('缺少 @keyframes ' + k + '（替换文案时第二条看不出在播放）');
  });
  // ⚠️ keyframes 体里还有嵌套的 `}`（每个百分比各一层），所以不能用惰性正则截取——
  //    必须做花括号配平扫描，否则 A 与 B 会被截在不同深度，永远「不相等」。
  const kfBody32 = (src, name) => {
    const i = src.indexOf('@keyframes ' + name);
    if (i < 0) return null;
    const a = src.indexOf('{', i);
    if (a < 0) return null;
    let depth = 0, j = a;
    for (; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') { depth--; if (depth === 0) break; }
    }
    return src.slice(a + 1, j).replace(/\s+/g, '');
  };
  [['pages/game/game.wxss', gx32], ['preview/template.html', tpl32]].forEach(([f, src]) => {
    const ba = kfBody32(src, 'praisePopA');
    const bb = kfBody32(src, 'praisePopB');
    if (ba && bb && ba === bb) ok(f + ' 的 praisePopA / praisePopB 内容逐字一致（只有名字不同）');
    else err(f + ' 的 praisePopA / praisePopB 内容不一致（重播会跳变）');
  });
  if (gx32.indexOf('.praise-fx.lv4') > -1 && gx32.indexOf('.praise-fx.lv5') > -1)
    ok('game.wxss 有档位放大规则（等级越高越大越亮）');
  else err('game.wxss 缺档位放大规则');

  // --- 32.11 页面接线（体验版镜像） ---
  ['praise-fx', 'praise-combo', 'praise-bo', 'praise-zh', 'praise-burst', 'praise-toggle'].forEach(id => {
    if (tpl32.indexOf('id="' + id + '"') > -1) ok('体验版含 #' + id);
    else err('体验版缺 #' + id);
  });
  if (tpl32.indexOf("$('praise-toggle').addEventListener('click', togglePraise)") > -1)
    ok('体验版文案开关已绑定 togglePraise');
  else err('体验版文案开关未绑定（点了没反应）');
  if (tpl32.indexOf('id="praise-fx"') < tpl32.indexOf('class="board-wrap"'))
    ok('体验版浮字挂在盘面容器之外（.board-wrap 的 overflow:hidden 会裁掉它）');
  else err('体验版浮字被放进 .board-wrap（会被裁掉）');
  if (tpl32.indexOf('function praiseOnMatch') > -1 && tpl32.indexOf('praiseOnMiss') > -1)
    ok('体验版镜像了 praiseOnMatch / praiseOnMiss');
  else err('体验版未镜像 praise 判定');
  if (tpl32.indexOf('combo-fx') === -1 && gw32.indexOf('combo-fx') === -1 && gj32.indexOf('audio.combo(') === -1)
    ok('旧的 combo-fx / audio.combo 实现已全部清除（不会两套并存）');
  else err('仍残留旧的 combo-fx / audio.combo 实现');
  if (b532.indexOf('scripts/lib/praise-guard') > -1 || b532.indexOf("'praise-guard'") > -1)
    ok('build-h5 引用了共享守卫（与本节同一把尺子）');
  else err('build-h5 未引用共享守卫（会出现两把尺子）');

  // --- 32.12 浮字墨色对比度（D32 铁律：只落暗底的元素才提亮） ---
  const lin32 = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum32 = rgb => 0.2126 * lin32(rgb[0]) + 0.7152 * lin32(rgb[1]) + 0.0722 * lin32(rgb[2]);
  const hex32 = h => { const s = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16)); };
  const ratio32 = (a, b) => { const la = lum32(hex32(a)), lb = lum32(hex32(b));
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
  const rr32 = v => Math.round(v * 100) / 100;
  [['#FFD98A', '#0B1E36', '藏文大字 / 连击行'], ['#F5E9CF', '#0B1E36', '中文文案'],
   ['#B9C7D6', '#213A5C', 'HUD 开关（状态条最亮停靠点）'], ['#B9C7D6', '#12243E', 'HUD 开关（状态条最暗停靠点）']]
    .forEach(([a, b, d]) => {
      const r = ratio32(a, b);
      if (r >= 4.5) ok('浮字墨 ' + a + '（' + d + '）on ' + b + ' = ' + rr32(r) + ':1');
      else err('浮字墨 ' + a + '（' + d + '）on ' + b + ' 只有 ' + rr32(r) + ':1（需 ≥4.5）');
    });
  if (rr32(ratio32('#FFD98A', '#0B1E36')) === 12.4 && rr32(ratio32('#F5E9CF', '#0B1E36')) === 13.92)
    ok('两支提亮墨与代码注释里写的 12.40 / 13.92 逐字吻合');
  else warn('浮字墨对比度与注释不符，请同步更新 game.wxss / template.html 的注释');

  // --- 32.13 教学闭环不受影响：关文案不关发音 ---
  // 用「同一行不得同时出现 praiseOff 与 pronounce」这种可机械判定的写法，
  // 代替脆弱的跨行正则（正则看不出「哪一行被哪个条件包住」）。
  const offLines32 = gj32.split('\n').filter(l => l.indexOf('praiseOff') > -1);
  const leak32 = offLines32.filter(l => l.indexOf('pronounce') > -1);
  if (leak32.length === 0 && gj32.indexOf('audio.pronounce(') > -1)
    ok('「文案开关」不影响元素发音（发音属学习闭环，不受开关控制）');
  else err('文案开关疑似连带关掉了元素发音' + (leak32.length ? '：' + leak32[0].trim() : ''));
  if (offLines32.some(l => l.indexOf('showPraise') > -1))
    ok('praiseOff 只闸在 showPraise 上（开关的作用面被限定在浮字）');
  else err('未找到「praiseOff 闸住 showPraise」的接线，开关可能没生效');
}

// ---------- 33. 藏地密码（PRD 5.2：十则小知识 · 通关解锁 · 不新增存储字段） ----------
// 背景：PRD 5.2 原为「藏地密码语音故事」。因 audio/voice/ 的 12 条录音尚未录（#19），
// 语音版无法交付，本轮以**纯文字版**落地：每通关一关解锁一则藏地小知识，
// 结算页呈现 + 护照「藏地密码」板块收藏。
// 四条红线机械锁死：
//   ① 一关一则、关卡号严格 1..10（不跳号 / 不重复 / 正文不是占位一句话）；
//   ② 解锁状态派生自 completedLevels，**不新增存储字段**（与 D31 揭图同一口径）；
//   ③ 正文不踩 D25 宗教符号 / 竞争性营销字眼 / 金额字眼；
//   ④ 两端同构：小程序 pages/* 与体验版 preview/template.html 同名函数、同一判定。
section('33. 藏地密码（PRD 5.2：十则小知识 · 通关解锁 · 不新增存储字段）');
{
  const rj33 = read('pages/result/result.js');
  const rw33 = read('pages/result/result.wxml');
  const rx33 = read('pages/result/result.wxss');
  const pj33 = read('pages/passport/passport.js');
  const pw33 = read('pages/passport/passport.wxml');
  const px33 = read('pages/passport/passport.wxss');
  const tpl33 = read('preview/template.html');
  const bh33 = read('scripts/build-h5.js');

  // --- 33.1 数据层：十关全覆盖、一一对应、字段齐备 ---
  let secList33 = null;
  try { secList33 = require(path.join(ROOT, 'data', 'secrets.js')); } catch (e) { /* 走下面 err */ }
  if (Array.isArray(secList33) && secList33.length === 10)
    ok('data/secrets.js 共 10 则（每关一则）');
  else err('data/secrets.js 应为 10 则，实际 ' + (secList33 && secList33.length));
  if (Array.isArray(secList33)) {
    const lv33 = secList33.map(s => s.level);
    if (lv33.every((n, i) => n === i + 1)) ok('密码关卡区间无缝覆盖 1-10 关（顺序一致，无跳号）');
    else err('密码关卡序号必须严格为 1..10，实际 ' + JSON.stringify(lv33));
    if (new Set(lv33).size === 10) ok('十则关卡号互不重复');
    else err('密码关卡号有重复：' + JSON.stringify(lv33));
    const miss33 = secList33.filter(s => !s.tag || !s.title || !s.text || !s.key);
    if (!miss33.length) ok('每则都有 key + tag + 标题 + 正文');
    else err('密码缺字段：' + miss33.map(s => s.level).join(','));
    const short33 = secList33.filter(s => String(s.text).length < 40);
    if (!short33.length) ok('每则正文 ≥40 字（不是一句话占位）');
    else err('密码正文过短（<40 字）：' + short33.map(s => s.level).join(','));
    if (new Set(secList33.map(s => s.key)).size === 10) ok('十则 key 互不重复');
    else err('密码 key 有重复');
    if (new Set(secList33.map(s => s.title)).size === 10) ok('十则标题互不重复');
    else err('密码标题有重复');
  }

  // --- 33.2 内容红线（扫「解析后的数据」，不扫源文件文本）---
  // ⚠️ 为什么不扫源文件：文件头注释里必须写明「本文件不得出现酥油灯」这类红线说明，
  //    扫文本会自己绊倒自己（与 §17.8「去注释源码」同一教训）。
  const secJson33 = JSON.stringify(secList33 || []);
  // 注意用**非全局**正则：带 /g 的 RegExp.test 会保留 lastIndex，跨次调用结果漂移。
  const D25_RE33 = /佛塔|酥油灯|风马旗|莲花|经幡/;
  const COMP_RE33 = /排行榜|排行|名次|战区|金币|优惠券|广告|抽奖|返现/;
  const MONEY_RE33 = /[¥￥]|元(?!音|素)/;
  const hitD25_33 = secJson33.match(new RegExp(D25_RE33.source, 'g')) || [];
  if (!hitD25_33.length) ok('正文未出现 D25 红线符号（佛塔 / 酥油灯 / 风马旗 / 莲花 / 经幡）');
  else err('正文出现 D25 红线符号：' + hitD25_33.join('/'));
  const hitComp33 = secJson33.match(new RegExp(COMP_RE33.source, 'g')) || [];
  if (!hitComp33.length) ok('正文无竞争性 / 营销字眼（排行 / 名次 / 金币 / 优惠券 / 广告 / 抽奖…）');
  else err('正文出现竞争性 / 营销字眼：' + hitComp33.join('/'));
  if (!MONEY_RE33.test(secJson33) && !OFFER_DIGIT_PAT.test(secJson33))
    ok('正文无金额字段 / 让利数字 / 货币符号');
  else err('正文出现金额 / 让利字样（¥ / 元 / 折 / 满N减N）');
  // 反例自测：这把尺必须真的拦得住
  const NEG33 = ['拉萨的佛塔', '酥油灯', '排行榜第一', '金币 ×10', '满100减20', '奖励 5 元', '立减 8 折'];
  const slip33 = NEG33.filter(s =>
    !D25_RE33.test(s) && !COMP_RE33.test(s) && !MONEY_RE33.test(s) && !OFFER_DIGIT_PAT.test(s));
  if (!slip33.length) ok('反例自测通过：' + NEG33.length + ' 种违禁写法全部被拦');
  else err('密码内容守卫有缺口：' + slip33.join(' | '));
  // 正向：合法的「元音」不得被误伤（元(?!音|素) 的负向断言）
  if (!MONEY_RE33.test('4 个元音符号') && !MONEY_RE33.test('文化元素')) ok('正向：「元音 / 元素」不被误判为金额（负向断言生效）');
  else err('金额正则误伤「元音 / 元素」');

  // --- 33.3 解锁口径：派生自 completedLevels，存储层不得出现第二真相源 ---
  const st33 = read('utils/storage.js');
  if (st33.indexOf('secret') === -1)
    ok('utils/storage.js 未新增 secret 字段（解锁 = 通关状态，单一真相源）');
  else err('utils/storage.js 出现 secret 字段：密码解锁应派生自 completedLevels，不要落第二份');
  const h5gp33 = (read('preview/template.html').match(/function getProgress\(\)[\s\S]*?\n\}/) || [''])[0];
  if (h5gp33 && h5gp33.indexOf('secret') === -1)
    ok('体验版 getProgress 白名单未新增 secret（两端字段表一致）');
  else err('体验版 getProgress 新增了 secret 字段，或函数体提取失败');

  // --- 33.4 纯函数层：两端同名 + 行为等价 ---
  const cl33 = read('utils/collect.js');
  [['function secretOf', 'secretOf 定义'], ['function secretProgress', 'secretProgress 定义'],
   ['secretOf: secretOf', 'secretOf 导出'], ['secretProgress: secretProgress', 'secretProgress 导出']]
    .forEach(([k, label]) => {
      if (cl33.indexOf(k) > -1) ok('utils/collect.js 含 ' + label);
      else err('utils/collect.js 缺 ' + label);
    });
  ['function secretOf', 'function secretProgress'].forEach(k => {
    if (tpl33.indexOf(k) > -1) ok('体验版镜像含 ' + k + '（两端判定同源）');
    else err('体验版镜像缺 ' + k + '（两端判定会漂移）');
  });
  const collect33 = require(path.join(ROOT, 'utils', 'collect'));
  const sp33a = collect33.secretProgress(secList33 || [], []);
  if (sp33a.got === 0 && sp33a.total === 10 &&
      sp33a.slots.every(s => s.title === '' && s.tag === '' && s.got === false))
    ok('未通关时 10 个槽位全部不给标题（不剧透，与 cardProgress 空 label 同一用意）');
  else err('未通关时槽位泄露了标题或计数错误：got=' + sp33a.got);
  const sp33b = collect33.secretProgress(secList33 || [], [1, 3]);
  if (sp33b.got === 2 && !!sp33b.slots[0].title && sp33b.slots[1].title === '' && !!sp33b.slots[2].title)
    ok('通关 1 / 3 关 → 恰解锁第 1、3 则（槽位与关卡号严格绑定）');
  else err('解锁映射错误：got=' + sp33b.got + ' 槽位1=' + sp33b.slots[0].title + ' 槽位2=' + sp33b.slots[1].title);
  const so33 = collect33.secretOf(secList33 || [], 7);
  if (so33 && so33.level === 7 && collect33.secretOf(secList33 || [], 99) === null)
    ok('secretOf 按关卡号取条，越界返回 null');
  else err('secretOf 取条 / 越界行为不符');

  // --- 33.5 小程序页面接线 ---
  if (rj33.indexOf("require('../../data/secrets')") > -1) ok('result.js 引入 data/secrets（同源数据）');
  else err('result.js 未引入 data/secrets');
  if (rj33.indexOf('collect.secretOf(secretsData, level)') > -1)
    ok('result.js 用 collect.secretOf 取本关密码（页面不内联关卡规则）');
  else err('result.js 未走 collect.secretOf');
  if (rj33.indexOf('collect.secretProgress(secretsData, storage.getProgress().completedLevels)') > -1)
    ok('result.js 的图鉴计数也走 completedLevels');
  else err('result.js 图鉴计数未走 completedLevels');
  ['secret-card', 'secret-title', 'secret-text', '已收入文化护照 · 藏地密码'].forEach(k => {
    if (rw33.indexOf(k) > -1) ok('result.wxml 含 ' + k);
    else err('result.wxml 缺 ' + k);
  });
  if (rx33.indexOf('.secret-card') > -1 && rx33.indexOf('.secret-text') > -1)
    ok('result.wxss 含 .secret-* 样式');
  else err('result.wxss 缺 .secret-* 样式');
  if (pj33.indexOf("require('../../data/secrets')") > -1 &&
      pj33.indexOf('collect.secretProgress(secretsData, p.completedLevels)') > -1)
    ok('passport.js 走 collect.secretProgress 且解锁判定 = completedLevels');
  else err('passport.js 未走 secretProgress / completedLevels');
  ['se-grid', 'secretSlots', '藏地密码'].forEach(k => {
    if (pw33.indexOf(k) > -1) ok('passport.wxml 含 ' + k);
    else err('passport.wxml 缺 ' + k);
  });
  if (px33.indexOf('.se-grid') > -1 && px33.indexOf('.se-slot.got') > -1)
    ok('passport.wxss 含 .se-* 样式');
  else err('passport.wxss 缺 .se-* 样式');

  // --- 33.6 跨文件契约：结算页承诺「已收入文化护照」→ 护照必须真有该板块 ---
  const promised33 = rw33.indexOf('已收入文化护照 · 藏地密码') > -1;
  const delivered33 = pw33.indexOf('藏地密码') > -1 && pw33.indexOf('se-grid') > -1;
  if (promised33 && delivered33)
    ok('跨文件契约成立：结算页「已收入文化护照 · 藏地密码」→ 护照页真有「藏地密码」板块');
  else err('空头承诺 / 板块缺失：结算页承诺=' + promised33 + ' 护照板块=' + delivered33);

  // --- 33.7 体验版镜像 + build-h5 注入 ---
  ['id="res-secret"', 'id="pp-secret-grid"', 'const SECRETS = DATA.secrets',
   'secretProgress(SECRETS, getProgress().completedLevels)'].forEach(k => {
    if (tpl33.indexOf(k) > -1) ok('体验版镜像含 ' + k);
    else err('体验版镜像缺 ' + k);
  });
  if (bh33.indexOf("secrets: require(path.join(ROOT, 'data', 'secrets'))") > -1)
    ok('build-h5.js 注入 data/secrets（与小程序同源）');
  else err('build-h5.js 未注入 data/secrets');
  if (bh33.indexOf('藏地密码数据抽查') > -1)
    ok('build-h5.js 带藏地密码数据抽查（与本节同一组红线）');
  else err('build-h5.js 缺藏地密码数据抽查（会出现两把尺子）');
}

// ---------- 34. 背景音乐（PRD 3.3：程序合成 · 无缝循环 · 开关三处同步） ----------
// 四条红线机械锁死：
//   ① 资产是**程序合成**的（有脚本能复现），体积进预算（≤150KB，主包 2MB 硬约束）；
//   ② 真无缝：循环点首尾采样跳变 ≪ 峰值（否则每 2.8s「咔」一下）；
//   ③ 开关偏好 bgmOff 走「storage 白名单 + 体验版 getProgress + 页面」三处同步；
//   ④ 两端音符表逐字一致（小程序 WAV ↔ 体验版 Web Audio 是同一段旋律）。
section('34. 背景音乐（PRD 3.3：程序合成 · 无缝循环 · 开关三处同步 · 两端同表）');
{
  const au34 = read('utils/audio.js');
  const st34 = read('utils/storage.js');
  const gw34 = read('pages/game/game.wxml');
  const gj34 = read('pages/game/game.js');
  const gx34 = read('pages/game/game.wxss');
  const tpl34 = read('preview/template.html');
  const wavPath = 'audio/bgm.wav';

  // --- 34.1 资产：存在 + 体积 + WAV 规格 + 可复现脚本 ---
  if (exists(wavPath)) {
    const wav = fs.readFileSync(path.join(ROOT, wavPath));
    const bytes = wav.length;
    if (bytes <= 150 * 1024) ok('audio/bgm.wav 体积 ' + Math.round(bytes / 1024) + 'KB（≤150KB 预算）');
    else err('audio/bgm.wav 超预算：' + Math.round(bytes / 1024) + 'KB > 150KB');
    const riff = wav.toString('ascii', 0, 4), wave = wav.toString('ascii', 8, 12);
    const ch = wav.readUInt16LE(22), rate = wav.readUInt32LE(24), bits = wav.readUInt16LE(34);
    if (riff === 'RIFF' && wave === 'WAVE') ok('audio/bgm.wav 是合法 RIFF/WAVE 容器');
    else err('audio/bgm.wav 不是合法 WAV（RIFF=' + riff + ' WAVE=' + wave + '）');
    if (ch === 1 && rate === 16000 && bits === 16)
      ok('BGM 规格：单声道 / 16000Hz / 16-bit（2026-10-08 起 16kHz——内容最高约 2.6kHz，无听感损失，主包省 ~38KB）');
    else err('BGM 规格不符：channels=' + ch + ' rate=' + rate + ' bits=' + bits + '（应为 1/16000/16）');
    // data 块长度 → 时长
    const di = wav.indexOf(Buffer.from('data'));
    const dataLen = di > -1 ? wav.readUInt32LE(di + 4) : 0;
    const secs = dataLen / (rate * ch * (bits / 8));
    if (secs >= 2.0 && secs <= 6.0) ok('循环长度 ' + secs.toFixed(2) + 's（2-6s：太短会听腻、太长进不了包）');
    else err('循环长度 ' + secs.toFixed(2) + 's 不在 2-6s 区间');
    // 无缝：循环点首尾采样跳变必须 ≪ 峰值
    if (dataLen > 4) {
      const first = wav.readInt16LE(di + 8);
      const last = wav.readInt16LE(di + 8 + dataLen - 2);
      let peak = 0;
      for (let i = di + 8; i < di + 8 + dataLen; i += 2) {
        const v = Math.abs(wav.readInt16LE(i));
        if (v > peak) peak = v;
      }
      const jump = Math.abs(first - last);
      if (jump < peak * 0.1)
        ok('循环点连续：首尾采样跳变 ' + jump + ' ≪ 峰值 ' + peak + '（一循环不会「咔」）');
      else err('循环点不连续：跳变 ' + jump + ' 对峰值 ' + peak + ' 偏大，循环处会有爆点');
      if (peak > 0 && peak < 20000) ok('峰值 ' + peak + '（留足余量，手机小喇叭不削波）');
      else err('峰值 ' + peak + ' 过高 / 为 0，可能削波或文件为空');
    }
  } else err('缺少 ' + wavPath + '（背景音乐资产）');
  if (exists('scripts/make_bgm.py')) ok('scripts/make_bgm.py 存在（BGM 可零成本复现）');
  else err('缺 scripts/make_bgm.py（BGM 必须可由脚本复现，不引入来路不明的音源）');

  // --- 34.2 utils/audio.js：独立 ctx + 音量 + 导出 ---
  [['bgmStart', 'bgmStart'], ['bgmStop', 'bgmStop'], ['bgmStart: bgmStart', '导出 bgmStart'],
   ['bgmStop: bgmStop', '导出 bgmStop'], ['BGM_VOLUME: BGM_VOLUME', '导出 BGM_VOLUME']]
    .forEach(([k, label]) => {
      if (au34.indexOf(k) > -1) ok('utils/audio.js 含 ' + label);
      else err('utils/audio.js 缺 ' + label);
    });
  if (au34.indexOf("src = '/audio/bgm.wav'") > -1 && au34.indexOf('loop = true') > -1)
    ok('BGM 走独立 InnerAudioContext 且 loop = true');
  else err('BGM 未挂 loop 或未用独立 ctx（会与音效互相 stop）');
  if (/BGM_VOLUME\s*=\s*0\.28\s*;/.test(au34) && au34.indexOf('volume = BGM_VOLUME') > -1)
    ok('BGM 音量压到 0.28（v2 柔化：明显低于音效，不与配对提示抢注意力）');
  else err('BGM 音量未压低或 BGM_VOLUME 被改动');
  // BGM 不得混进 play() 的瞬时通道（否则每次消除都会把 BGM 掐掉重放）
  const playFn34 = (au34.match(/function play\(name\)[\s\S]*?\n\}/) || [''])[0];
  if (playFn34.indexOf('bgm') === -1) ok('BGM 未混进 play() 的瞬时通道（消除音效不会掐断音乐）');
  else err('BGM 混进了 play()，每次音效都会影响背景音乐');

  // --- 34.3 偏好三处同步：storage 白名单 + 体验版 getProgress + 页面 ---
  if (st34.indexOf('bgmOff: !!(p && p.bgmOff)') > -1) ok('utils/storage.js getProgress 白名单含 bgmOff');
  else err('utils/storage.js getProgress 白名单缺 bgmOff（字段会静默丢失）');
  if (st34.indexOf('function getBgmOff') > -1 && st34.indexOf('function setBgmOff') > -1)
    ok('utils/storage.js 提供 getBgmOff / setBgmOff');
  else err('utils/storage.js 缺 getBgmOff / setBgmOff（开关无法持久化）');
  if (tpl34.indexOf('bgmOff: !!(p && p.bgmOff)') > -1)
    ok('体验版 getProgress 同步含 bgmOff（两端字段表一致）');
  else err('体验版 getProgress 缺 bgmOff（两端字段表漂移）');

  // --- 34.4 小程序页面接线 ---
  if (gw34.indexOf('status-bgm') > -1 && gw34.indexOf('bindtap="onToggleBgm"') > -1)
    ok('game.wxml 含 HUD 音乐开关（onToggleBgm）');
  else err('game.wxml 缺 HUD 音乐开关');
  if (gj34.indexOf('onToggleBgm: function') > -1 && gj34.indexOf('storage.setBgmOff(') > -1)
    ok('game.js 开关落库（storage.setBgmOff）');
  else err('game.js 开关未落库');
  if (gj34.indexOf('onShow: function') > -1 && gj34.indexOf('onHide: function') > -1 &&
      gj34.indexOf('audio.bgmStart()') > -1 && gj34.indexOf('audio.bgmStop()') > -1)
    ok('game.js 随页面生命周期启停（onShow 响 / onHide 停 / onUnload 停）');
  else err('game.js 未按生命周期启停 BGM（会漏到别的页面或一直响）');
  if (/onUnload:\s*function\s*\(\)\s*\{\s*[\r\n]+\s*audio\.bgmStop\(\);/.test(gj34))
    ok('onUnload 第一件事就是停 BGM');
  else err('onUnload 未停 BGM');
  // 「音乐开关」不得连带关掉元素发音（与 praiseOff 同一条铁律）
  const bgmOffLines34 = gj34.split('\n').filter(l => l.indexOf('onToggleBgm') > -1 || l.indexOf('bgmOff') > -1);
  if (!bgmOffLines34.some(l => l.indexOf('pronounce') > -1))
    ok('音乐开关不影响元素发音与音效（只管 BGM）');
  else err('音乐开关疑似连带关掉了发音');
  if (gx34.indexOf('.status-bgm') > -1) ok('game.wxss 有 .status-bgm 样式');
  else err('game.wxss 缺 .status-bgm 样式');

  // --- 34.5 体验版镜像：开关 + 常量 + 与 Python 同一张音符表 ---
  ['id="bgm-toggle"', 'function bgmStart', 'function bgmStop', 'function toggleBgm',
   "addEventListener('click', toggleBgm)", 'function showScreen', 'bgmOffPreference'].forEach(k => {
    if (tpl34.indexOf(k) > -1) ok('体验版镜像含 ' + k);
    else err('体验版镜像缺 ' + k);
  });
  if (tpl34.indexOf("if (name === 'game' && !bgmOffPreference()) bgmStart();") > -1)
    ok('体验版 BGM 也只跟游戏页（进响出停，与小程序 onShow/onHide 同口径）');
  else err('体验版 BGM 未绑到游戏页（会漏到首页 / 结算页）');
  // 常量两端同值
  const pySrc34 = read('scripts/make_bgm.py');
  [['LOOP_LEN', 3.36, 'BGM_LOOP_LEN'], ['BEAT', 0.42, 'BGM_BEAT'],
   ['TONE_ATTACK', 0.09, 'BGM_TONE_ATTACK'], ['TONE_TAU', 0.75, 'BGM_TONE_TAU']].forEach(([pk, val, hk]) => {
    // ⚠️ 不要用 \s*$ 收尾：make_bgm.py 的值后面跟着行内注释（`LOOP_LEN = 2.8      # …`）
    const py = new RegExp('(?:^|\\n)' + pk + '\\s*=\\s*' + String(val).replace('.', '\\.') + '\\b').test(pySrc34);
    const h5 = new RegExp(hk + '\\s*=\\s*' + String(val).replace('.', '\\.')).test(tpl34);
    if (py && h5) ok('循环常量两端同值：' + pk + ' = ' + val + '（' + hk + '）');
    else err('循环常量两端不一致：' + pk + ' 在 py=' + py + ' / 体验版=' + h5);
  });
  // 旋律音符表：把两端写法归一化后逐字比对（这是「两端是同一段旋律」的唯一机械证明）
  const normTokens = s => s.replace(/[\s'"]/g, '').split(',').filter(Boolean);
  const pyMel = (pySrc34.match(/MELODY\s*=\s*\[([\s\S]*?)\]/) || [])[1];
  const h5Mel = (tpl34.match(/BGM_MEL\s*=\s*\[([\s\S]*?)\]/) || [])[1];
  if (pyMel && h5Mel && normTokens(pyMel).join() === normTokens(h5Mel).join())
    ok('旋律音符表两端逐字一致（' + normTokens(h5Mel).length + ' 个柔和旋律音：' + normTokens(h5Mel).join(' ') + '）');
  else err('旋律音符表两端不一致：py=' + (pyMel && normTokens(pyMel).join(' ')) + ' / h5=' + (h5Mel && normTokens(h5Mel).join(' ')));
  // v2 柔化核心：疏（音数）、软（起音）、长（衰减）三张表也必须两端同值
  const pyAt = (pySrc34.match(/MELODY_AT\s*=\s*\[([\s\S]*?)\]/) || [])[1];
  const h5At = (tpl34.match(/BGM_MEL_AT\s*=\s*\[([\s\S]*?)\]/) || [])[1];
  if (pyAt && h5At && normTokens(pyAt).join() === normTokens(h5At).join())
    ok('旋律起拍表两端一致（' + normTokens(h5At).length + ' 个位置：疏而不均）');
  else err('旋律起拍表两端不一致：py=' + (pyAt && normTokens(pyAt).join(' ')) + ' / h5=' + (h5At && normTokens(h5At).join(' ')));
  const normParts = s => s.replace(/[\s\(\)\[\]'"]/g, '');
  const pyParts = (pySrc34.match(/PARTIALS\s*=\s*\[([\s\S]*?)\]\n/) || [])[1];
  const h5Parts = (tpl34.match(/BGM_PARTIALS\s*=\s*(\[[\s\S]*?\]);/) || [])[1];
  if (pyParts && h5Parts && normParts(pyParts) === normParts(h5Parts))
    ok('谐波配比两端一致（' + normParts(h5Parts) + '：接近纯正弦的「软」）');
  else err('谐波配比两端不一致：py=' + (pyParts && normParts(pyParts)) + ' / h5=' + (h5Parts && normParts(h5Parts)));
  const pyAmp = (pySrc34.match(/MELODY_AMP\s*=\s*\[([\s\S]*?)\]/) || [])[1];
  const h5Amp = (tpl34.match(/BGM_MEL_AMP\s*=\s*\[([\s\S]*?)\]/) || [])[1];
  if (pyAmp && h5Amp && normTokens(pyAmp).join() === normTokens(h5Amp).join())
    ok('旋律力度表两端一致（16 个值逐字相同）');
  else err('旋律力度表两端不一致：py=' + (pyAmp && normTokens(pyAmp).join(' ')) + ' / h5=' + (h5Amp && normTokens(h5Amp).join(' ')));
  // 反例自测：把一端改一个音，比对必须失败
  if (h5Mel && normTokens(pyMel.replace(/D4/, 'E4', 1)).join() !== normTokens(h5Mel).join())
    ok('反例自测：任一端改一个音，逐字比对即失败（这把尺是真的在比内容）');
  else err('音符表比对尺失效：改了一个音仍判相等');
  if (/BGM_VOLUME\s*=\s*0\.28/.test(tpl34)) ok('体验版 BGM_VOLUME = 0.28（与 audio.js 同值）');
  else err('体验版 BGM_VOLUME 与小程序不一致');
  // v2 反向锁：v1 的「忙碌弹拨」特征不得回流（16 音 / 四谐波 / 4ms 硬起音）
  if (normTokens(pyMel).length <= 8) ok('旋律密度 ≤ 8 音/循环（v1 是 16，密度是「狂躁感」的第一来源）');
  else err('旋律又变密了（' + normTokens(pyMel).length + ' 音/循环）：柔化不可回退');
  const partialNums = (pyParts.match(/\((\d),/g) || []).map(m => Number(m[1]));
  if (partialNums.length && Math.max.apply(null, partialNums) <= 3)
    ok('谐波只留 1/2/3 层（v1 的 4 层高次谐波是「亮/刺」的来源）');
  else err('谐波层数回退（出现第 4 层及以上高次谐波）');
  const pyAttack = parseFloat((pySrc34.match(/TONE_ATTACK\s*=\s*([0-9.]+)/) || [])[1] || '0');
  if (pyAttack >= 0.09) ok('起音 ' + pyAttack + 's ≥ 0.09s（软起音；v1 的 4ms 硬起音是「打点感」的来源）');
  else err('起音又变硬了（' + pyAttack + 's < 0.09s）：狂躁感回流');
  // 合成脚本必须写明回绕（无缝循环的实现手段），否则后人删掉就退化
  if (pySrc34.indexOf('% total') > -1 && pySrc34.indexOf('回绕') > -1)
    ok('make_bgm.py 用回绕写入实现无缝循环（音符尾巴接回开头）');
  else err('make_bgm.py 缺回绕实现（直接截断会在循环点留爆点）');
}

// ---------- 35. 纹样砖完整性（八宝 + 卷草纹：base64 六页同源 · 砖规格 · 保形 · 无缝自证在案） ----------
// 纹样砖以 base64 内联在每页 .sc-pattern（WXSS 平铺背景只能 base64）。历史上「改了砖忘了同步某页」
// 不会被任何门禁发现 —— 本节把这变成硬错误。改砖流程：重跑 make_astamangala.py → node scripts/inject-pattern.js
// → 重跑 build-h5.js（体验版自动跟随）。
(function () {
  section('35. 纹样砖完整性（八宝+卷草纹）');

  const TILE = 'images/pat-tile.png';
  const PAGES35 = ['index', 'game', 'result', 'cert', 'passport', 'benefits'];

  if (!exists(TILE)) { err('缺少纹样砖：' + TILE); return; }
  const tileBuf = fs.readFileSync(path.join(ROOT, TILE));

  // 35.1 砖规格：PNG IHDR 直接读宽高（零依赖），尺寸与体积双预算
  const isPng = tileBuf.length > 24 && tileBuf.readUInt32BE(0) === 0x89504e47;
  const w35 = isPng ? tileBuf.readUInt32BE(16) : 0;
  const h35 = isPng ? tileBuf.readUInt32BE(20) : 0;
  if (isPng && w35 === 256 && h35 === 128) ok('砖规格 256×128（4×2 格，2:1）');
  else err('砖规格异常：' + w35 + '×' + h35 + '（应为 256×128）');
  if (tileBuf.length <= 20000) ok('砖体积 ' + tileBuf.length + 'B ≤ 20000B（卷草并入前为 21233B）');
  else err('砖体积超预算：' + tileBuf.length + 'B > 20000B');

  // 35.2 六页 .sc-pattern 的 base64 必须与砖逐字节一致
  const RE35 = /\.sc-pattern\s*\{[^}]*?background-image:\s*url\('data:image\/png;base64,([A-Za-z0-9+/=]+)'\)/;
  const embedded = [];
  PAGES35.forEach(function (name) {
    const m = RE35.exec(read('pages/' + name + '/' + name + '.wxss'));
    const buf = m ? Buffer.from(m[1], 'base64') : null;
    if (buf && buf.length === tileBuf.length && buf.equals(tileBuf)) {
      ok(name + '.wxss 的 .sc-pattern 与 pat-tile.png 逐字节一致');
      embedded.push(m[1]);
    } else {
      err(name + '.wxss 的 .sc-pattern 与 pat-tile.png 不一致（重跑 node scripts/inject-pattern.js）');
    }
  });

  // 35.2b 反例自测：翻转砖的一个字节，比对必须失败（证明这把尺不是摆设）
  if (embedded.length === PAGES35.length) {
    const flip = Buffer.from(tileBuf);
    flip[flip.length - 1] ^= 0xff;
    if (!flip.equals(tileBuf) && !Buffer.from(embedded[0], 'base64').equals(flip))
      ok('反例自测：翻转砖末字节后逐字节比对必失败（比对尺真实有效）');
    else err('砖比对尺失效：翻转字节后仍判相等');
  }

  // 35.3 砖是 2:1，铺进正方形 background-size 会把八宝纵向拉伸两倍 —— 必须保形
  PAGES35.forEach(function (name) {
    const src = read('pages/' + name + '/' + name + '.wxss');
    if (/\.sc-pattern\s*\{[^}]*?background-size:\s*60rpx\s+30rpx/.test(src))
      ok(name + '.wxss 保形铺贴（60rpx 30rpx = 2:1）');
    else err(name + '.wxss 的 background-size 未保形（应为 60rpx 30rpx）');
  });
  const tpl35 = read('preview/template.html');
  if (/\.sc-pattern\s*\{[^}]*?background-size:\s*68px\s+34px/.test(tpl35))
    ok('体验版 .sc-pattern 保形铺贴（68px 34px = 2:1）');
  else err('体验版 .sc-pattern 未保形（应为 68px 34px）');

  // 35.4 注入工具必须存在且覆盖全部六页（以后加页面漏掉一页就会被抓）
  const inj = read('scripts/inject-pattern.js');
  const missed = PAGES35.filter(function (n) { return inj.indexOf("'" + n + "'") === -1; });
  if (!missed.length) ok('inject-pattern.js 覆盖全部 ' + PAGES35.length + ' 页');
  else err('inject-pattern.js 缺页：' + missed.join('/'));

  // 35.5 体验版链路：build-h5 内联 → 模板走 var(--pat)
  if (read('scripts/build-h5.js').indexOf("dataUrl('images/pat-tile.png')") > -1)
    ok('build-h5.js 内联 pat-tile.png（体验版自动跟随新砖）');
  else err('build-h5.js 未内联 pat-tile.png');
  if (/\.sc-pattern\s*\{[^}]*?background-image:\s*var\(--pat\)/.test(tpl35))
    ok('体验版 .sc-pattern 走 var(--pat)');
  else err('体验版 .sc-pattern 未走 var(--pat)');

  // 35.6 无缝自证必须在案：边带周期性判据 + BOX 面积平均 + 3×3 画布裁正中
  const py35 = read('scripts/make_astamangala.py');
  if (py35.indexOf('edge-band periodicity') > -1 && py35.indexOf('chdiff') > -1)
    ok('make_astamangala.py 自带「边带周期性」无缝自证（预乘色比较）');
  else err('make_astamangala.py 缺无缝自证（改纹样后无法证明绕边续接）');
  if (py35.indexOf('Image.BOX') > -1)
    ok('降采样用 BOX 面积平均（4x 超采样的正确滤波，且逐位周期）');
  else err('降采样未用 BOX（LANCZOS 负瓣会让边带不严格周期）');
  if (py35.indexOf('3 * W * S') > -1 && py35.indexOf('img.crop((CX, CY') > -1)
    ok('3×3 画布 + 裁正中一块（消除 PIL 边缘单边取窗的假接缝）');
  else err('缺 3×3 画布 + 裁正中（边缘列会不周期）');
})();

// ---------- 36. 绳结障碍（D40：金刚结的世俗皮肤 · 双股绳 · 两端同构） ----------
// PRD 3.1 的「金刚结锁链」按 D25 宗教符号红线换世俗皮肤 = 绳结。机制复用多段破坏
// （同木箱），难度曲线 = 冰霜(L2) → 木箱(L6) → 绳结(L9)。行为断言直接跑纯函数，不做字符串表演。
(function () {
  section('36. 绳结障碍（D40）');
  const obs = require(path.join(ROOT, 'utils', 'obstacles'));
  const levels = require(path.join(ROOT, 'data', 'levels'));

  // 36.1 行为：布点数量与默认股数
  const plan = obs.planOverlays({ cols: 4, rows: 4, obstacles: { rope: 2 } },
    new Array(16).fill('letter_01'));
  const ropes = plan.filter(p => p.kind === 'rope');
  if (ropes.length === 2) ok('planOverlays 按配置布 2 个绳结');
  else err('绳结布点数量不对：' + ropes.length);
  if (ropes.length && ropes.every(p => p.hp === 2))
    ok('绳结默认 2 股（双股绳：相邻消除两次才解开）');
  else err('绳结股数应为 2，实际 ' + JSON.stringify(ropes.map(p => p.hp)));
  if (plan.filter(p => p.kind === 'frost').length === 0) ok('未配置冰霜就不会布冰霜');
  else err('未配置的障碍物出现在布点计划里');

  // 36.2 行为：三种障碍同屏时布点不重叠（share 一个 used 表）
  const mixed = obs.planOverlays({ cols: 6, rows: 6, obstacles: { frost: 3, rope: 3, crate: 3 } },
    new Array(36).fill('letter_01'));
  const idxs36 = mixed.map(p => p.index);
  if (new Set(idxs36).size === idxs36.length) ok('冰霜/绳结/木箱同屏布点零重叠（' + mixed.length + ' 处）');
  else err('障碍物布点出现重叠：' + idxs36.join(','));

  // 36.2b 行为：配置的障碍物数量必须足额布出（撞位静默缺额是真实踩过的坑：
  // 第 9 关 frost 的 34 号位撞掉 rope 的 34 号位 → 配 2 实布 1，test-h5 抓到后才修）
  levels.filter(l => l.obstacles).forEach(l => {
    const o = l.obstacles;
    const ids = new Array(l.cols * l.rows).fill(l.elements[0][0]);
    const p = obs.planOverlays({ cols: l.cols, rows: l.rows, obstacles: o }, ids);
    ['frost', 'rope', 'crate'].forEach(k => {
      if (!o[k]) return;
      const got = p.filter(x => x.kind === k).length;
      if (got === o[k]) ok('第 ' + l.level + ' 关 ' + k + ' 配 ' + o[k] + ' 实布 ' + got + '（足额）');
      else err('第 ' + l.level + ' 关 ' + k + ' 配 ' + o[k] + ' 实布 ' + got + '（撞位缺额）');
    });
  });

  // 36.3 行为：isBlocked 覆盖绳结（缠住阻挡 / 松开放行 / 空牌安全）
  if (obs.isBlocked({ rope: 2 }) && !obs.isBlocked({ rope: 0 }) && !obs.isBlocked(null))
    ok('isBlocked：绳结 > 0 阻挡，松开后放行，空牌安全');
  else err('isBlocked 未覆盖绳结');

  // 36.4 行为：相邻消除一次松一股，两次全解开；且纯函数不改动入参
  const grid = [];
  for (let i = 0; i < 9; i++) grid.push({ id: 'a', rope: 0, crate: 0, state: 'idle' });
  grid[4].rope = 2; // 中心格被缠住；消除 1（上中）会波及 0/2/4，消除 7（下中）波及 4/6/8
  const r1 = obs.resolveMatch(grid, [1], 3, 3);
  const c1 = r1.changed.filter(c => c.index === 4 && c.kind === 'rope');
  if (c1.length === 1 && c1[0].hp === 1 && c1[0].broken === false)
    ok('第一次相邻消除：松一股（2 → 1，未破）');
  else err('第一次消除后绳结状态不对：' + JSON.stringify(r1.changed));
  const r2 = obs.resolveMatch(r1.tiles, [7], 3, 3);
  const c2 = r2.changed.filter(c => c.index === 4 && c.kind === 'rope');
  if (c2.length === 1 && c2[0].hp === 0 && c2[0].broken === true)
    ok('第二次相邻消除：解开（1 → 0，broken）');
  else err('第二次消除后绳结状态不对：' + JSON.stringify(r2.changed));
  if (grid[4].rope === 2) ok('resolveMatch 是纯函数（入参盘面未被改动）');
  else err('resolveMatch 改动了入参盘面（违反纯函数约定）');

  // 36.5 关卡曲线：绳结必须在木箱之后登场，且各关总遮挡不破 D23 的 25%
  const firstRope = Math.min.apply(null, levels.filter(l => l.obstacles && l.obstacles.rope).map(l => l.level));
  const firstCrate = Math.min.apply(null, levels.filter(l => l.obstacles && l.obstacles.crate).map(l => l.level));
  if (isFinite(firstRope) && isFinite(firstCrate) && firstRope > firstCrate)
    ok('绳结在木箱之后登场（难度曲线：冰霜 L2 → 木箱 L6 → 绳结 L' + firstRope + '）');
  else err('绳结登场顺序不对（应晚于木箱）');
  levels.filter(l => l.obstacles && l.obstacles.rope).forEach(l => {
    const o = l.obstacles;
    const tot = (o.frost || 0) + (o.rope || 0) + (o.crate || 0);
    const cap = Math.floor(l.cols * l.rows * 0.25);
    if (tot <= cap) ok('第 ' + l.level + ' 关总遮挡 ' + tot + ' ≤ 25% 上限（' + cap + '）');
    else err('第 ' + l.level + ' 关总遮挡 ' + tot + ' 超过 25% 上限（' + cap + '）');
  });
  const l1c = levels.filter(l => l.level === 1)[0];
  if (!l1c.obstacles || !l1c.obstacles.rope) ok('第 1 关无绳结（D26 前 60 秒不打扰新手）');
  else err('第 1 关出现了绳结');

  // 36.6 两端同构 + 页面接线（字符串层：两端逐个关键点都要在）
  const tpl36 = read('preview/template.html');
  [['utils/obstacles.js', "take(cfgObs.rope, 'rope', cfgObs.ropeHp || 2)"],
    ['utils/obstacles.js', 'kind: \'rope\', hp: t.rope'],
    ['preview/template.html', "take(o.rope, 'rope', o.ropeHp || 2)"],
    ['preview/template.html', "kind: 'rope', hp: t.rope"],
    ['pages/game/game.wxml', 'item.rope > 0'],
    ['pages/game/game.wxss', '.rope {'],
    ['pages/game/game.wxss', '.rope-num {'],
    ['preview/template.html', '#board .rope {'],
    ['pages/game/game.js', "'绳结解开！'"],
    ['preview/template.html', "'绳结解开！'"]
  ].forEach(p => {
    if (read(p[0]).indexOf(p[1]) > -1) ok(p[0] + ' 含 ' + p[1].slice(0, 30));
    else err(p[0] + ' 缺少 ' + p[1]);
  });
  if (/tileSig[\s\S]{0,200}t\.rope \|\| 0/.test(tpl36))
    ok('体验版内容指纹含 rope（罩层变化才会重绘，漏了会显示旧股数）');
  else err('体验版 tileSig 未含 rope');

  // 36.7 D25 合规：障碍物的对外名字必须是世俗的「绳结」，宗教名不得进代码与文案
  const secular = ['pages/game/game.js', 'pages/game/game.wxml', 'pages/game/game.wxss',
    'data/levels.js', 'utils/obstacles.js', 'preview/template.html'].map(read).join('\n');
  ['金刚结', '锁链'].forEach(w => {
    if (secular.indexOf(w) === -1) ok('代码与文案无宗教名「' + w + '」（世俗皮肤 = 绳结）');
    else err('宗教名「' + w + '」出现在代码里（D25：只许世俗皮肤）');
  });
})();

// ---------- 37. 去游戏化守卫（教育/文化类目提审前置，2026-10-07 落地） ----------
// 依据 business-model-v2.md §3.1 与 release-and-monetization.md §三：
// 「类目与内容不符」是最高频驳回原因，游戏化措辞（积分/连击/通关/关卡…）不得出现在
// 用户可见文案里。口径：扫描 pages/**(wxml/js/wxss) + data/*.js + 体验版模板，
// 注释一律剥掉（HTML <!-- --> / CSS与JS /* */ / JS 行注释，带 :// 守卫）——
// 只看会渲染出来的字。品牌语新基线 =「认藏文，从方块开始」。
section('37. 去游戏化守卫（教育类目 · 文案红线）');
{
  function stripCopyComments(text) {
    text = text.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    return text.split('\n').map(l => {
      const i = l.indexOf('//'); const u = l.indexOf('://');
      return (i === -1 || (u !== -1 && u < i)) ? l : l.slice(0, i);
    }).join('\n');
  }
  function walkPages(dir, out) {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = dir + '/' + e.name;
      if (e.isDirectory()) walkPages(rel, out);
      else if (/\.(wxml|js|wxss)$/.test(e.name)) out.push(rel);
    }
    return out;
  }
  const copyFiles37 = walkPages('pages', [])
    .concat(fs.readdirSync(path.join(ROOT, 'data')).filter(f => f.endsWith('.js')).map(f => 'data/' + f))
    .concat(['preview/template.html']);
  // 「排行」类词与 §33 藏地密码禁令同尺：D6 已拍板不做排行榜（替代 = 本地「我的成绩」），
  // 且「排行榜」字眼本身就会被 §33/§25 判违禁——两个尺子必须一致，不能一个禁一个用。
  const FORBIDDEN37 = ['积分', '连击', '通关', '关卡', '玩方块', '如何消除', '闯关', '排行榜', '排行'];
  let hit37 = null;
  copyFiles37.forEach(f => {
    const s = stripCopyComments(read(f));
    FORBIDDEN37.forEach(w => {
      if (s.indexOf(w) > -1 && !hit37) {
        const line = s.split('\n').findIndex(l => l.indexOf(w) > -1) + 1;
        hit37 = f + ':' + line + ' 含「' + w + '」';
      }
    });
  });
  if (!hit37) ok('用户可见文案无游戏化措辞（' + FORBIDDEN37.join('/') + '，' + copyFiles37.length + ' 个文件）');
  else err('游戏化措辞回流（教育类目红线）：' + hit37);
  // 反例自测：守卫必须证明自己拦得住，而不是「碰巧现在干净」
  if (stripCopyComments('x = "积分"').indexOf('积分') > -1 && stripCopyComments('// 注释里的积分不算').indexOf('积分') === -1)
    ok('守卫自测：字符串命中 / 注释豁免 均成立');
  else err('去游戏化守卫自测失败（注释剥离或命中逻辑坏了）');

  // 37.2 量词「关」单字漏网（2026-10-07 实测抓到 15 处：'第 ' + level + ' 关完成！' 这类
  // 拼接形态不落在任何单词表里，躲过了首轮扫描）。逐个「关」出现判定：
  //   · 后面跟 键/闭/注/怀/于/系/联/税/机/头/卡/切/照/掉/灯/门/节/口 → 合法词（关于/关闭/关键…）
  //   · 出现在「文案 关 / 音乐 关」开关语境 → 合法（不是量词）
  //   · 其余一律判违规（第 N 关 / 每一关 / 还差 N 关 …）
  const LEGIT_GUAN = /关(键|闭|注|怀|于|系|联|税|机|头|卡|切|照|掉|灯|门|节|口)/;
  function findStrayGuan(text) {
    const lines = text.split('\n');
    for (let li = 0; li < lines.length; li++) {
      const l = lines[li];
      if (/文案 关|音乐 关|文案关|音乐关/.test(l)) continue;   // 开关语境整行豁免
      let idx = -1;
      while ((idx = l.indexOf('关', idx + 1)) !== -1) {
        if (!LEGIT_GUAN.test(l.slice(idx))) {
          return 'line ' + (li + 1) + ': …' + l.slice(Math.max(0, idx - 16), idx + 16).trim() + '…';
        }
      }
    }
    return null;
  }
  let strayGuan = null;
  copyFiles37.forEach(f => { const hit = findStrayGuan(stripCopyComments(read(f))); if (hit && !strayGuan) strayGuan = f + ' ' + hit; });
  if (!strayGuan) ok('无量词「关」残留（第 N 关 / 每一关 等拼接形态全部清零）');
  else err('量词「关」残留（去游戏化漏网）：' + strayGuan);
  if (findStrayGuan('x = "第 3 关完成！"') && !findStrayGuan('a ? "文案 关" : "文案 开"'))
    ok('守卫自测：拼接「关」可检出 / 开关语境正确豁免');
  else err('量词「关」判定自测失败');
  // 新品牌语基线
  const slogan37 = read('pages/index/index.js');
  if (slogan37.indexOf('认藏文，从方块开始') > -1) ok('新品牌语「认藏文，从方块开始」在首页转发卡');
  else err('首页转发卡缺少新品牌语「认藏文，从方块开始」');
}

// ---------- 38. 生产上线守卫（包体 / 隐私 / 工程配置，2026-10-07） ----------
// 这一节守的是「能跑但上线会炸」的三类问题 —— 门禁在此之前一条都没覆盖过：
//   ① 主包 2MB 硬上限：packOptions.ignore 为空时，20MB 的 preview/docs/scripts 一起进包，上传必失败；
//   ② 用户隐私保护指引：saveImageToPhotosAlbum 是受保护接口，未过 wx.requirePrivacyAuthorize 会直接失败；
//   ③ 工程配置：lazyCodeLoading 未开 = 首屏多下载用不上的代码。
section('38. 生产上线守卫（主包体积 / 隐私授权 / 工程配置）');
{
  // --- 38.1 打包白名单 ---
  const pcRaw = read('project.config.json');
  let pc = null;
  try { pc = JSON.parse(pcRaw); } catch (e) { /* 下面据此报错 */ }
  if (!pc) err('project.config.json 不是合法 JSON');
  else {
    const ignores = (((pc.packOptions || {}).ignore) || []).map(i => i.value);
    ['preview', 'docs', 'scripts', 'node_modules', '.workbuddy', 'README.md'].forEach(dir => {
      if (ignores.indexOf(dir) > -1) ok('packOptions.ignore 排除 ' + dir + '（不进主包）');
      else err('packOptions.ignore 未排除 ' + dir + ' —— 20MB 开发资产会撑爆 2MB 主包上限');
    });
    // 反例自测：把 ignore 抽干，同一套判定必须立刻报错（证明不是「碰巧现在写了」）
    const drained = ignores.filter(v => v === 'docs');
    if (drained.indexOf('preview') === -1) ok('守卫自测：ignore 抽干后 preview 立刻被判定为缺失');
    else err('守卫自测失败（ignore 判定逻辑有问题）');
  }

  // --- 38.2 主包体积预算（按 ignore 规则实测，不信估数）---
  {
    const KB = 1024, LIMIT_KB = 1843; // 2MB 上限留 10% 余量给编译产物
    // ⚠️ 必须与 project.config.json 的 packOptions.ignore 保持一致（D46 起 assets-src 为原材料投放区）
    const skipDir = new Set(['preview', 'docs', 'scripts', 'node_modules', '.workbuddy', '.git', 'assets-src']);
    let totalK = 0;
    (function walk(rel) {
      for (const e of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
        if (skipDir.has(e.name)) continue;
        const relPath = rel ? rel + '/' + e.name : e.name;
        if (e.isDirectory()) walk(relPath);
        else if (/\.(md|py)$/.test(e.name)) continue;         // 由 ignore 的 suffix 规则排除
        else totalK += fs.statSync(path.join(ROOT, relPath)).size / KB;
      }
    })('');
    totalK = Math.round(totalK);
    if (totalK <= LIMIT_KB) ok('主包体积 ' + totalK + 'KB ≤ ' + LIMIT_KB + 'KB（2MB 上限留 10% 余量）');
    else err('主包体积超预算：' + totalK + 'KB > ' + LIMIT_KB + 'KB（压缩资产或改 packOptions.ignore）');
  }

  // --- 38.3 隐私授权接线 ---
  if (exists('utils/privacy.js')) {
    const pv = read('utils/privacy.js');
    [['function ensurePrivacy', '统一前置入口'], ['requirePrivacyAuthorize', '官方授权调用'],
     ['getPrivacySetting', '先问要不要授权'], ['explainSaveFailure', '失败区分隐私/相册权限']]
      .forEach(([a, n]) => {
        if (pv.indexOf(a) > -1) ok('utils/privacy.js 含 ' + n + '（' + a + '）');
        else err('utils/privacy.js 缺 ' + n + '（' + a + '）');
      });
  } else err('缺少 utils/privacy.js（受保护接口的统一前置）');

  const pageJs = jsFiles.map(f => path.relative(ROOT, f).replace(/\\/g, '/'))
    .filter(f => f.indexOf('pages/') === 0 && f.indexOf('.js') > -1);
  const albumFiles = pageJs.filter(f => read(f).indexOf('saveImageToPhotosAlbum') > -1);
  if (albumFiles.length === 3) ok('相册保存点 3 处（证书 / 祝福卡 / 祝福签）');
  else err('相册保存点数量变了（应为 3 处），实际 ' + albumFiles.length + '：新增点必须补隐私前置');
  albumFiles.forEach(f => {
    const src = read(f);
    if (src.indexOf("require('../../utils/privacy')") > -1) ok(f + ' 已引入 privacy 模块');
    else err(f + ' 用了 saveImageToPhotosAlbum 却没过隐私前置（上线会被拒）');
    if (src.indexOf('privacy.ensurePrivacy(') > -1) ok(f + ' 走 ensurePrivacy 前置');
    else err(f + ' 未调用 ensurePrivacy');
    if (src.indexOf('privacy.explainSaveFailure(') > -1) ok(f + ' 失败报文走 explainSaveFailure');
    else err(f + ' 未用 explainSaveFailure（会把隐私未同意误报成相册权限）');
  });

  // --- 38.4 工程配置 ---
  const appJsonRaw = read('app.json');
  let appJson = null;
  try { appJson = JSON.parse(appJsonRaw); } catch (e) { err('app.json 不是合法 JSON'); }
  if (appJson) {
    if (appJson.lazyCodeLoading === 'requiredComponents') ok('app.json 开启 lazyCodeLoading（按需注入）');
    else err('app.json 未开启 lazyCodeLoading: "requiredComponents"（首屏会多下无用代码）');
    if (!appJson.permission) ok('app.json 未声明任何授权 scope（零权限，符合红线）');
    else err('app.json 声明了 permission —— 位置/隐私类授权需另行拍板');
  }
  // getSystemInfoSync 已不再维护：允许作为回退，但必须同时有 getWindowInfo 首选路径
  const codeJs = jsFiles.map(f => path.relative(ROOT, f).replace(/\\/g, '/'))
    .filter(f => (f.indexOf('pages/') === 0 || f.indexOf('utils/') === 0) && f.indexOf('.js') > -1);
  codeJs.forEach(f => {
    const src = read(f);
    if (src.indexOf('getSystemInfoSync') > -1 && src.indexOf('getWindowInfo') === -1)
      err(f + ' 仍只用已弃用的 getSystemInfoSync（应优先 getWindowInfo）');
  });
  ok('getSystemInfoSync 使用点已配 getWindowInfo 首选路径');

  // --- 38.5 存储健壮性（裸调 wx.getStorageSync 会在脏数据/存储不可用时整页崩）---
  {
    const st = read('utils/storage.js');
    const reads = (st.match(/wx\.getStorageSync\(/g) || []).length;
    const writes = (st.match(/wx\.setStorageSync\(/g) || []).length;
    if (reads === 1 && writes === 1) ok('storage.js 的读/写各只有一处，且都收在安全包装里');
    else err('storage.js 出现裸存储调用（读 ' + reads + ' / 写 ' + writes + '）：应全部走 rawRead/rawWrite');
    ['function rawRead', 'function rawWrite'].forEach(fn => {
      if (st.indexOf(fn) > -1) ok('storage.js 含 ' + fn + '（try/catch + 脏数据兜底）');
      else err('storage.js 缺 ' + fn);
    });
    if (st.indexOf('Array.isArray(v)') > -1) ok('storage.js 拒绝非对象脏数据（避免 indexOf 崩溃）');
    else err('storage.js 未校验脏数据类型（字符串/数组会让后续调用抛错）');
  }
  // 反例自测：脏数据必须被挡在函数内，而不是冒到调用方
  {
    const probe = (function (v) {
      try { return (!v || typeof v !== 'object' || Array.isArray(v)) ? null : v; }
      catch (e) { return null; }
    })('corrupted-string');
    if (probe === null) ok('守卫自测：字符串/数组型脏数据被判为「无进度」');
    else err('守卫自测失败（脏数据没被拦住）');
  }

  // --- 38.6 资产引用完整性：代码里引用的每个 /images 与 /audio 文件都必须真的在 ---
  // 少一张图 = 运行时白块 / 分享卡缺图；少一个音频 = 静默（可接受），但图必须齐。
  {
    const refFiles = jsFiles.map(f => path.relative(ROOT, f).replace(/\\/g, '/'))
      .concat(['app.json']);
    const missingAssets = [];
    const seenAsset = {};
    refFiles.forEach(f => {
      const src = read(f);
      const refs = src.match(/\/images\/[A-Za-z0-9_\-]+\.(png|jpg|jpeg|webp|gif)/g) || [];
      refs.forEach(r => {
        const rel = r.slice(1); // 去掉开头的 /
        if (seenAsset[rel]) return;
        seenAsset[rel] = true;
        if (!exists(rel)) missingAssets.push(f + ' → ' + r);
      });
    });
    if (!missingAssets.length) ok('全部图片引用都能在磁盘找到（' + Object.keys(seenAsset).length + ' 个唯一引用）');
    else err('存在悬空图片引用：' + missingAssets.join(' | '));
    // 反例自测：编一个不存在的引用，必须被同一套判定抓出
    if (!exists('images/__gate_probe__.png')) ok('守卫自测：不存在的图片引用可被检出');
    else err('守卫自测失败（悬空引用判定逻辑有问题）');
  }

  // --- 38.7 语音生命周期：全局单声道语音必须在离开页面时停下 ---
  // 元素发音 0.5-1.5s、结算祝福 2-3s；语音通道是模块级单例，
  // 不清理 = 用户离开页面后声音还追着他播（游戏页 / 结算页两个出口都要清）。
  {
    const aud = read('utils/audio.js');
    if (aud.indexOf('function stopVoice') > -1 && /module\.exports[\s\S]*stopVoice:\s*stopVoice/.test(aud))
      ok('utils/audio.js 提供 stopVoice（语音通道的停止出口）');
    else err('utils/audio.js 缺 stopVoice —— 语音没有停止出口');
    const res = read('pages/result/result.js');
    if (/onUnload:\s*function[\s\S]{0,200}stopVoice\(\)/.test(res) && /onHide:\s*function[\s\S]{0,200}stopVoice\(\)/.test(res))
      ok('结算页 onUnload / onHide 都停语音（祝福语不追着用户走）');
    else err('结算页缺语音清理（祝福语 2-3 秒，离开页面必须停）');
    if (res.indexOf('blessTimer') > -1 && /clearTimeout\(this\.blessTimer\)/.test(res))
      ok('结算页祝福语定时器可取消（650ms 内返回不再出声）');
    else err('结算页祝福语定时器未命名，无法取消');
    const gj = read('pages/game/game.js');
    if (/onUnload:\s*function[\s\S]{0,160}stopVoice\(\)/.test(gj))
      ok('游戏页 onUnload 停语音（元素发音 / 扎西德勒不跨页）');
    else err('游戏页 onUnload 未停语音');
  }

  // --- 38.8 静态引用完整性：wxml 绑定 / require 路径 / wx:for key ---
  // 这三类错误在开发者工具里是「点一下才炸」或者「悄悄变慢」，
  // 上线前必须一次性全量核对，不能靠手点。
  {
    const pageNames = ['index', 'game', 'result', 'cert', 'passport', 'benefits'];
    let bindTotal = 0, bindMissing = [];
    let keyTotal = 0, keyMissing = [];
    pageNames.forEach(p => {
      const wxml = read('pages/' + p + '/' + p + '.wxml');
      const js = read('pages/' + p + '/' + p + '.js');
      const handlers = new Set();
      const re = /(?:bind|catch)(?::)?(?:tap|change|longpress|input|confirm|scroll|load|error|animationend|submit)="([A-Za-z_$][\w$]*)"/g;
      let m;
      while ((m = re.exec(wxml)) !== null) handlers.add(m[1]);
      handlers.forEach(h => {
        bindTotal++;
        if (!new RegExp('\\b' + h + '\\s*:\\s*function').test(js) && !new RegExp('\\b' + h + '\\s*\\(').test(js))
          bindMissing.push(p + ' → ' + h);
      });
      const fre = /wx:for="\{\{[^}]+\}\}"/g;
      while ((m = fre.exec(wxml)) !== null) {
        keyTotal++;
        if (wxml.slice(m.index, m.index + 320).indexOf('wx:key') === -1)
          keyMissing.push(p + ':' + (wxml.slice(0, m.index).split('\n').length));
      }
    });
    if (!bindMissing.length) ok('wxml 事件绑定全部有对应处理函数（' + bindTotal + ' 个）');
    else err('wxml 绑定了不存在的处理函数：' + bindMissing.join(' | '));
    if (!keyMissing.length) ok('wx:for 列表全部带 wx:key（' + keyTotal + ' 处）');
    else err('wx:for 缺 wx:key（渲染性能与状态错乱风险）：' + keyMissing.join(' | '));

    // require 路径全部可解析
    const reqFiles = jsFiles.map(f => path.relative(ROOT, f).replace(/\\/g, '/'))
      .filter(f => f.indexOf('pages/') === 0 || f.indexOf('utils/') === 0).concat(['app.js']);
    const badReq = [];
    let reqTotal = 0;
    reqFiles.forEach(f => {
      const src = read(f);
      const re = /require\(['"](\.[^'"]+)['"]\)/g; let m;
      while ((m = re.exec(src)) !== null) {
        reqTotal++;
        const target = path.resolve(ROOT, path.dirname(f), m[1]);
        if (!fs.existsSync(target) && !fs.existsSync(target + '.js') && !fs.existsSync(path.join(target, 'index.js')))
          badReq.push(f + ' → ' + m[1]);
      }
    });
    if (!badReq.length) ok('require 路径全部可解析（' + reqTotal + ' 条）');
    else err('存在无法解析的 require：' + badReq.join(' | '));
  }

  // --- 38.9 零网络证明：无后端是 D3/D13 的硬拍板，必须机械可证 ---
  {
    const netPat = /wx\.(request|downloadFile|uploadFile|connectSocket|createUDPSocket|createTCPSocket)\s*\(/;
    const offenders = [];
    jsFiles.forEach(f => {
      const rel = path.relative(ROOT, f).replace(/\\/g, '/');
      if (rel.indexOf('pages/') !== 0 && rel.indexOf('utils/') !== 0 && rel !== 'app.js') return;
      if (netPat.test(read(rel))) offenders.push(rel);
    });
    if (!offenders.length) ok('全项目零网络调用（无 wx.request / downloadFile / uploadFile / socket）');
    else err('出现网络调用（违 D3 / D13）：' + offenders.join(' | '));
    // 反例自测：探针字符串必须被同一正则命中
    if (netPat.test('wx.request({url:""})')) ok('守卫自测：wx.request 可被检出');
    else err('守卫自测失败（网络调用判定逻辑有问题）');
  }

  // --- 38.10 语音注入链三处同步（模板声明 / build-h5 注入 / validate 语法检查）---
  // 2026-10-07 实测踩坑：加了 /*__VOICES__*/ 占位符但漏改 validate 的替换表 →
  // 语法检查把 `const VOICES = /*__VOICES__*/;` 当成 `const VOICES = ;` 误报。
  {
    const tplV = read('preview/template.html');
    const bldV = read('scripts/build-h5.js');
    const valV = read('scripts/validate.js');
    const trio = [
      [tplV.indexOf('const VOICES = /*__VOICES__*/') > -1, '模板声明 const VOICES = /*__VOICES__*/'],
      [bldV.indexOf("replace('/*__VOICES__*/'") > -1, 'build-h5 注入替换'],
      [valV.indexOf("replace('/*__VOICES__*/'") > -1, 'validate 占位符替换表'],
      [tplV.indexOf('const ICON_ART = /*__ICON_ART__*/') > -1 && bldV.indexOf("replace('/*__ICON_ART__*/'") > -1 && valV.indexOf("replace('/*__ICON_ART__*/'") > -1, '图标注入链（模板+build-h5+validate）'],
      [tplV.indexOf('const PHOTO = /*__PHOTO__*/') > -1 && bldV.indexOf("replace('/*__PHOTO__*/'") > -1 && valV.indexOf("replace('/*__PHOTO__*/'") > -1, '场景照片注入链（模板+build-h5+validate）']
    ];
    const missingV = trio.filter(t => !t[0]).map(t => t[1]);
    if (!missingV.length) ok('语音注入链三处同步（模板 / build-h5 / validate）');
    else err('语音注入链漂移，缺：' + missingV.join(' / '));
    // 体验版语音播放必须走注入表（相对路径在单文件体验版里必然 404）
    if (/if \(VOICES\[id\]\) playVoice\(VOICES\[id\]\)/.test(tplV) && /if \(VOICES\[name\]\) playVoice\(VOICES\[name\]\)/.test(tplV))
      ok('体验版 pronounce / speak 走 VOICES 注入表（不再依赖相对路径）');
    else err('体验版语音未走注入表（会 404 静默）');
  }

  // --- 38.11 TTS 预生成流水线（D45）：脚本在、零依赖、密钥不入库、文本来自单一真相源 ---
  {
    if (exists('scripts/gen_voice.py')) ok('scripts/gen_voice.py 存在（发音可批量预生成）');
    else err('缺 scripts/gen_voice.py（34 条发音没有批量生成路径）');
    const gv = read('scripts/gen_voice.py');
    if (gv.indexOf('data/cards.js') > -1 || gv.indexOf("'cards.js'") > -1)
      ok('gen_voice.py 的发音文本来自 data/cards.js（单一真相源，不另起一份词表）');
    else err('gen_voice.py 未从 data/cards.js 取文本（会出现第二份词表）');
    if (!/^\s*(import|from)\s+(requests|httpx|aiohttp|pydub|numpy)/m.test(gv) && gv.indexOf('urllib.request') > -1)
      ok('gen_voice.py 只用标准库（urllib），不引入第三方依赖');
    else err('gen_voice.py 引入了非标准库依赖（应为零安装可跑）');
    // 自测：D45 起主通道是 WS（天翼），自测用的是本地假 WS 服务（FakeWS），不再用 HTTPServer
    if (gv.indexOf('--self-test') > -1 && (gv.indexOf('FakeWS') > -1 || gv.indexOf('HTTPServer') > -1))
      ok('gen_voice.py 带本地假接口自测（不联网验证整条流水线）');
    else err('gen_voice.py 缺自测路径（流水线无法离线验证）');
    // 签名算法必须与官方《签名认证方式》一致（HMAC-SHA256 两段式 + teleai-cloud-auth-v1 前缀）
    if (gv.indexOf('teleai-cloud-auth-v1') > -1 && gv.indexOf('hmac.new') > -1 && gv.indexOf('CanonicalRequest') > -1)
      ok('gen_voice.py 内置天翼签名算法（auth-v1 前缀 / HMAC-SHA256 两段式）');
    else err('gen_voice.py 缺天翼签名实现（WS 通道会 401）');
    if (gv.indexOf('openapi.teleagi.cn') > -1) ok('gen_voice.py 默认指向天翼 WS 网关（openapi.teleagi.cn）');
    else err('gen_voice.py 未指向天翼网关');
    if (exists('scripts/tts-config.example.json')) {
      let cfgOk = false;
      try {
        const c = JSON.parse(read('scripts/tts-config.example.json'));
        // 两种形态任一即可：teleai-ws（appId/appKey/endpoint）或 custom-http（url/responseMode）
        cfgOk = !!(c.provider === 'teleai-ws' && c.appId && c.appKey && c.endpoint) ||
                !!(c.url && c.responseMode);
      } catch (e) { }
      if (cfgOk) ok('tts-config.example.json 是合法配置模板（teleai-ws 或 custom-http 形态）');
      else err('tts-config.example.json 不是合法模板');
    } else err('缺 scripts/tts-config.example.json（用户不知道要填什么）');
    const gi = exists('.gitignore') ? read('.gitignore') : '';
    if (gi.indexOf('scripts/tts-config.json') > -1) ok('.gitignore 已屏蔽 tts-config.json（密钥不入库）');
    else err('.gitignore 未屏蔽 scripts/tts-config.json（鉴权信息可能被提交）');
    if (exists('audio/voice/README.txt') && read('audio/voice/README.txt').indexOf('gen_voice.py') > -1)
      ok('audio/voice/README.txt 写明 TTS 预生成路径');
    else err('audio/voice/README.txt 未提及生成脚本（录音者/用户找不到路径）');
  }

  // --- 38.12 真实图片资产管线（D46）：规格书 / 加工脚本 / 清单 / 投放区隔离 ---
  {
    if (exists('docs/asset-spec-images.md')) {
      const spec = read('docs/asset-spec-images.md');
      const specOk = spec.indexOf('圆形徽章') > -1 && spec.indexOf('透明') > -1 &&
                     spec.indexOf('#C0392B') > -1 && spec.indexOf('≤30KB') > -1;
      if (specOk) ok('docs/asset-spec-images.md 在案（含徽章构图 / 透明要求 / 色板 / 体积上限）');
      else err('图片规格书缺关键章节（构图/透明/色板/预算）');
    } else err('缺 docs/asset-spec-images.md（真实图片的生产指令）');
    if (exists('scripts/prepare-assets.py')) {
      const pa = read('scripts/prepare-assets.py');
      if (pa.indexOf('ImageDraw') > -1 && pa.indexOf('BUDGET') > -1 && pa.indexOf('icon-assets.js') > -1)
        ok('prepare-assets.py 在案（蒙版 / 预算表 / 清单写入）');
      else err('prepare-assets.py 缺关键能力（蒙版/预算/清单）');
    } else err('缺 scripts/prepare-assets.py（生成图无法一键加工接入）');
    if (exists('data/icon-assets.js')) {
      let manifestOk = false, n = 0;
      try {
        // eslint-disable-next-line no-eval
        const m = eval('(' + read('data/icon-assets.js').replace(/^[\s\S]*?module\.exports\s*=\s*/, '').replace(/;\s*$/, '') + ')');
        manifestOk = m && typeof m === 'object' && !Array.isArray(m);
        n = Object.keys(m || {}).length;
      } catch (e) { }
      if (manifestOk) ok('data/icon-assets.js 是合法清单（当前 ' + n + ' 项真实图标；0 项 = 全走程序线稿）');
      else err('data/icon-assets.js 不是合法清单');
    } else err('缺 data/icon-assets.js（真实图标没有接入清单）');
    const pc2 = JSON.parse(read('project.config.json'));
    const ign2 = ((pc2.packOptions || {}).ignore || []).map(i => i.value);
    if (ign2.indexOf('assets-src') > -1) ok('assets-src 已排除出主包（原材料不占 2MB 预算）');
    else err('packOptions 未排除 assets-src（大图会进包）');
    const gi2 = read('.gitignore');
    if (gi2.indexOf('assets-src/*/') > -1) ok('.gitignore 已屏蔽 assets-src 子目录（大图不入库）');
    else err('.gitignore 未屏蔽 assets-src');
    // 两端接入点：清单命中时优先真实图，未命中回退线稿
    const ic = read('utils/icons.js');
    if (ic.indexOf("require('../data/icon-assets')") > -1 && ic.indexOf('iconArt[ids[r]]') > -1)
      ok('小程序 icons.js 真实图优先 + 线稿回退');
    else err('小程序 icons.js 未接真实图优先逻辑');
    const tp2 = read('preview/template.html');
    if (tp2.indexOf('const ICON_ART = /*__ICON_ART__*/') > -1 && tp2.indexOf('if (ICON_ART[id])') > -1)
      ok('体验版 iconDataUrl 真实图优先');
    else err('体验版未接真实图优先逻辑');
  }

  // --- 38.13 场景照片层链路（D47）：清单 / 照片存在性 / 两端插槽 / 加工能力 / 规格书 ---
  {
    let manifest = null;
    if (exists('data/photo-assets.js')) {
      try {
        // eslint-disable-next-line no-eval
        manifest = eval('(' + read('data/photo-assets.js').replace(/^[\s\S]*?module\.exports\s*=\s*/, '').replace(/;\s*$/, '') + ')');
      } catch (e) { manifest = null; }
    }
    if (manifest && typeof manifest === 'object' && !Array.isArray(manifest)) {
      const keys = Object.keys(manifest);
      const badKeys = keys.filter(k => ['home', 'game'].indexOf(k) === -1);
      if (!badKeys.length) ok('data/photo-assets.js 合法（键 ⊆ {home, game}，当前 ' + keys.filter(k => manifest[k]).length + ' 张启用）');
      else err('photo-assets.js 出现未知键：' + badKeys.join(','));
      // 清单启用的照片必须真的存在
      const missing = keys.filter(k => manifest[k] && !exists(manifest[k].replace(/^\//, '')));
      if (!missing.length) ok('清单启用的照片文件都存在（启用项 ' + keys.filter(k => manifest[k]).length + '）');
      else err('清单启用了不存在的照片：' + missing.map(k => k + '→' + manifest[k]).join(' / '));
    } else err('缺 data/photo-assets.js 或不是合法清单');
    // 反例自测：不存在的路径必须会被上面同一套 exists 判定抓出
    if (!exists('images/scene/__probe_missing__.jpg')) ok('守卫自测：清单空/缺图可被检出');
    else err('守卫自测失败（照片存在性判定有问题）');
    // 两端插槽
    const iwv = read('pages/index/index.wxml');
    const gwv = read('pages/game/game.wxml');
    const ixv = read('pages/index/index.wxss');
    const gxv = read('pages/game/game.wxss');
    if (/wx:if="\{\{scenePhoto\}\}"[^>]*class="sc-photo"/.test(iwv) && /wx:if="\{\{scenePhoto\}\}"[^>]*class="sc-photo"/.test(gwv))
      ok('小程序两端都有场景照片插槽（wx:if scenePhoto）');
    else err('小程序缺场景照片插槽（首页/游戏页）');
    if (ixv.indexOf('.sc-photo {') > -1 && gxv.indexOf('.sc-photo {') > -1)
      ok('两端 .sc-photo 样式在案');
    else err('.sc-photo 样式缺失');
    const ijv = read('pages/index/index.js');
    const gjv = read('pages/game/game.js');
    if (ijv.indexOf("photoAssets.home") > -1 && gjv.indexOf('photoAssets.game') > -1)
      ok('两端 JS 从清单取照片（空则不渲染）');
    else err('页面 JS 未接照片清单');
    // 体验版：常量 + 节点 + 无照片时移除
    const tpV3 = read('preview/template.html');
    if (tpV3.indexOf('const PHOTO = /*__PHOTO__*/') > -1 && tpV3.indexOf('id="sc-photo"') > -1 &&
        tpV3.indexOf('sp.parentNode.removeChild(sp)') > -1 &&
        tpV3.indexOf('id="sc-game-photo"') > -1 && tpV3.indexOf('PHOTO.game') > -1)
      ok('体验版照片层：首页+游戏页节点 / 常量 / 无照片回退全在');
    else err('体验版照片层接线不全（首页/游戏页）');
    // 加工脚本与规格书
    const pav = read('scripts/prepare-assets.py');
    if (pav.indexOf('def do_scene') > -1 && pav.indexOf("'scene':") > -1 && pav.indexOf('photo-assets.js') > -1)
      ok('prepare-assets.py 支持 --scene（降饱和/压暗/清单写入）');
    else err('prepare-assets.py 缺场景照片加工能力');
    if (exists('docs/asset-spec-images.md') && read('docs/asset-spec-images.md').indexOf('G 组') > -1 &&
        read('docs/asset-spec-images.md').indexOf('色罩') > -1)
      ok('规格书含 G 组照片指令与色罩规范');
    else err('规格书缺 G 组（照片指令）或色罩规范');
  }
}

// ---------- 39. 中文播报与藏文书写细则（D48，2026-10-08 用户反馈） ----------
// 三件事：① 激励鼓励中文播报（很好/非常好/你好厉害/你简直就是无敌）
//         ② 藏地密码「听讲解」中文播报（10 条精简版）
//         ③ 藏文书写细则：完整词尾必须带 ་（用户拍板，例：གངས་རི → གངས་རི་）
section('39. 中文播报与藏文书写细则');
{
  // 39.1 生成脚本（可复现、离线预生成、带体积口径）
  if (exists('scripts/gen_chinese_voice.py')) {
    const g = read('scripts/gen_chinese_voice.py');
    // D52：讲解词表不再写死在本脚本里（那正是「只播第一句」的根因），
    //      改由 load_secrets() 从 data/secrets.js 读全文 —— 听到 = 看到。
    [['edge-tts', '合成引擎（微软 Edge TTS，免费无 Key）'], ['libmp3lame', 'ffmpeg 压缩到目标码率'],
     ["'praise_2'", '激励词表（praise_2..5）'], ['load_secrets', '讲解正文单一事实源（D52）'],
     ["os.path.join(ROOT, 'data', 'secrets.js')", '从 data/secrets.js 取全文'],
     ["'secret_%02d' % lv", '按关卡号生成 secret_NN'], ['LIMIT', '单条体积上限']]
      .forEach(([k, label]) => {
        if (g.indexOf(k) > -1) ok('gen_chinese_voice.py 含 ' + label);
        else err('gen_chinese_voice.py 缺 ' + label + '（' + k + '）');
      });
  } else err('缺 scripts/gen_chinese_voice.py（中文播报无法复现）');

  // 39.2 资产条件校验：存在即查体积（未生成时跳过，不阻塞）
  const praiseKeys = ['praise_2', 'praise_3', 'praise_4', 'praise_5'];
  const haveP = praiseKeys.filter(k => exists('audio/voice/' + k + '.mp3'));
  if (haveP.length === praiseKeys.length) {
    const overP = haveP.filter(k => fs.statSync(path.join(ROOT, 'audio/voice/' + k + '.mp3')).size > 8 * 1024);
    if (!overP.length) ok('激励语音 4 条就位且 ≤8KB/条');
    else err('激励语音超限：' + overP.join(','));
  } else if (haveP.length) err('激励语音不完整（' + haveP.length + '/4）');
  else ok('（激励语音尚未生成，跳过——生成命令见 scripts/gen_chinese_voice.py）');

  const secretKeys = Array.from({ length: 10 }, (_, i) => 'secret_' + String(i + 1).padStart(2, '0'));
  const haveS = secretKeys.filter(k => exists('audio/voice/' + k + '.mp3'));
  if (haveS.length === secretKeys.length) {
    // D52：讲解改为播整段正文（约 130 字 @10kbps ≈ 26KB），单条上限随之放宽到 32KB
    const overS = haveS.filter(k => fs.statSync(path.join(ROOT, 'audio/voice/' + k + '.mp3')).size > 32 * 1024);
    if (!overS.length) ok('藏地密码讲解 10 条就位且 ≤32KB/条（播整段）');
    else err('讲解语音超限：' + overS.join(','));
  } else if (haveS.length) err('讲解语音不完整（' + haveS.length + '/10）');
  else ok('（讲解语音尚未生成，跳过）');

  // 39.3 接线：激励播报两端 + 听讲解两端 + 双扩展名回退 + 卡片触摸暂停
  if (read('pages/game/game.js').indexOf("audio.speak('praise_'") > -1) ok('小程序激励播报接线（档位 ≥2，与文案同门控）');
  else err('小程序缺激励播报接线');
  const tpl39 = read('preview/template.html');
  if (tpl39.indexOf("speak('praise_'") > -1) ok('体验版激励播报接线');
  else err('体验版缺激励播报接线');
  if (read('pages/result/result.wxml').indexOf('bindtap="speakSecret"') > -1 &&
      read('pages/result/result.js').indexOf("'secret_'") > -1)
    ok('小程序藏地密码「听讲解」接线');
  else err('小程序缺「听讲解」接线');
  if (tpl39.indexOf('speakSecretListen') > -1 && tpl39.indexOf('听讲解') > -1)
    ok('体验版「听讲解」接线');
  else err('体验版缺「听讲解」接线');
  const au39 = read('utils/audio.js');
  if (au39.indexOf("'.mp3'") > -1 && au39.indexOf("'.wav'") > -1 && au39.indexOf('__triedWav') > -1)
    ok('发音双扩展名回退（mp3 主 / wav 备）');
  else err('发音未接双扩展名回退');
  if (read('pages/game/game.wxml').indexOf('bindtouchstart="holdCard"') > -1 &&
      read('pages/game/game.js').indexOf('holdCard: function') > -1 &&
      tpl39.indexOf("$('card-panel').addEventListener('pointerdown'") > -1)
    ok('文化卡触摸暂停自动收起（两端）');
  else err('文化卡缺触摸暂停（点按钮前卡片会先消失）');

  // 39.4 书写细则守卫：展示层单词词尾必须带 ་（含反例自测）
  const cardsSrc39 = read('data/cards.js');
  const subtitles39 = [...cardsSrc39.matchAll(/藏语：([\u0F00-\u0FFF]+)/g)].map(m => m[1]);
  const badSub39 = subtitles39.filter(w => !/[་།]$/.test(w) || /^་|་་/.test(w));
  if (subtitles39.length && !badSub39.length)
    ok('文化卡藏语名全部符合书写规范（' + subtitles39.length + ' 条，词尾带 ་）');
  else err('文化卡藏语名不合书写规范：' + (badSub39.join(' ') || '（一条都没扫到？！）'));
  if (/[་།]$/.test('གངས་རི་') && !/[་།]$/.test('གངས་རི'))
    ok('守卫自测：缺尾 ་ 可被检出（གངས་རི 判错 / གངས་རི་ 判对）');
  else err('守卫自测失败（尾 ་ 判定有问题）');
  // 每日祝福的独立藏文值同样检查
  const daily39 = read('data/daily.js');
  const gr39 = [...daily39.matchAll(/tibetan:\s*'([^']*)'/g)].map(m => m[1]);
  const badD39 = gr39.filter(w => w && !/[་།]$/.test(w.trim()) || /^་|་་/.test(w));
  if (gr39.length && !badD39.length) ok('雪域日签藏文值全部带尾 ་（' + gr39.length + ' 条）');
  else err('日签藏文值不合规范：' + badD39.join(' / '));
}

// ---------- 40. 首屏可达性（结算页固定底栏 / 首页压缩） ----------
// 实测背景（2026-10-08，430×932 体验版）：结算页主按钮原在折线下 622px（普通关）/ 972px（第 10 关），
// 玩完一关要继续得先滑一屏；首页 1158px（1.24 屏）。本节把「主操作必须首屏可达」钉成回归锁。
(function () {
  section('40. 首屏可达性（结算页固定底栏 / 首页压缩）');

  const rw40 = read('pages/result/result.wxml');
  const rwx40 = read('pages/result/result.wxss');
  const iwx40 = read('pages/index/index.wxss');
  const t40 = read('preview/template.html');

  // 40.1 结算页：主操作搬进固定底栏（三个按钮都必须在 .result-bar 内）
  const bar40 = rw40.match(/<view class="result-bar">([\s\S]*?)<\/view><!-- 昵称输入弹窗/);
  const barAny = rw40.match(/<view class="result-bar">([\s\S]*?)<\/view>\s*<!-- 昵称输入弹窗/);
  const inner40 = (barAny || bar40) ? (barAny || bar40)[1] : null;
  if (inner40) {
    const hasNext40 = inner40.indexOf('class="next-btn"') > -1;
    const links40 = inner40.match(/<view class="bar-links">([\s\S]*?)<\/view>/);
    const hasLinks40 = !!links40 && links40[1].indexOf('passport-btn') > -1 && links40[1].indexOf('home-btn') > -1;
    if (hasNext40 && hasLinks40) ok('结算页主操作已在固定底栏内（下一课 + 文化护照/返回首页）');
    else err('结算页底栏结构不完整（next-btn: ' + hasNext40 + ' / links: ' + hasLinks40 + '）');
  } else err('结算页缺 .result-bar 固定底栏（主按钮会重新沉到折线以下）');

  // 40.2 底栏必须是 fixed（static 会随内容滚走）——含反例自测
  const barRule40 = (rwx40.match(/\.result-bar\s*\{[\s\S]*?\}/) || [''])[0];
  if (/position:\s*fixed/.test(barRule40) && /z-index:\s*\d+/.test(barRule40)) ok('底栏 position: fixed + z-index 在案');
  else err('底栏不是 fixed（或缺 z-index）：主按钮首屏可达性会被擦掉');
  if (/safe-area-inset-bottom/.test(barRule40)) ok('底栏补了安全区（全面屏 Home Indicator）');
  else err('底栏缺 env(safe-area-inset-bottom)');
  if (!/position:\s*fixed/.test('position: static')) ok('守卫自测：把 fixed 改成 static 可被检出');
  else err('守卫自测失败');

  // 40.3 内容必须为底栏让位（否则最后一块内容被底栏永久盖住）
  const hasBar40 = rw40.indexOf('class="page has-bar"') > -1;
  const padRule40 = (rwx40.match(/\.page\.has-bar\s*\{[\s\S]*?\}/) || [''])[0];
  if (hasBar40 && /padding-bottom:\s*calc\(/.test(padRule40) && /safe-area-inset-bottom/.test(padRule40))
    ok('结算页内容为底栏让位（.page.has-bar 含安全区）');
  else err('结算页未给底栏让位（.page.has-bar / padding-bottom: calc(...safe-area...) 缺失）');

  // 40.4 体验版同构：.result-bar 固定 + #res-actions 就是底栏容器
  const tBarRule40 = (t40.match(/\.result-bar\s*\{[\s\S]*?\}/) || [''])[0];
  if (/position:\s*fixed/.test(tBarRule40) && t40.indexOf('<div class="result-bar" id="res-actions"></div>') > -1)
    ok('体验版同构：底栏 fixed 且 #res-actions 即底栏容器');
  else err('体验版底栏未同构（#res-actions 不在 .result-bar 内）');
  const tRes40 = (t40.match(/#screen-result\s*\{[\s\S]*?\}/) || [''])[0];
  if (/padding-bottom:\s*calc\(/.test(tRes40) && /safe-area-inset-bottom/.test(tRes40))
    ok('体验版结算页为底栏让位');
  else err('体验版结算页未给底栏让位');

  // 40.5 首页压缩：两端天梯高度同步（1080rpx / 620px），别只改一端
  const rpxH40 = (iwx40.match(/\.vine-map\s*\{[\s\S]*?height:\s*(\d+)rpx/) || [])[1];
  const pxH40 = (t40.match(/\.vine-map\s*\{[^}]*height:\s*(\d+)px/) || [])[1];
  if (rpxH40 === '1080' && pxH40 === '620') ok('首页天梯高度两端同步压缩（1080rpx / 620px）');
  else err('首页天梯高度两端不一致或未压缩（rpx=' + rpxH40 + ' / px=' + pxH40 + '）');
  if (/#screen-home\s*\{[^}]*padding-top/.test(t40)) ok('体验版首页内边距已收档');
  else warn('体验版首页内边距未收档（非阻塞）');
})();

// ============================== 41. 灯火跳窗改版（D50，2026-10-08 用户点名 6 条） ==============================
// ① 释迦牟尼底图 + 色罩  ② 鎏金酥油灯（参照实拍）  ③ 点亮前火焰静态
// ④ 点亮后火焰写实多层动态  ⑤ 点灯播报《嗡 嘛 呢 叭 咪 吽》  ⑥ 致谢 / 关闭按钮文案
section('41. 灯火跳窗改版（释迦牟尼底图 / 真实酥油灯 / 静→动火焰 / 燃灯播报）');
{
  const iw41 = read('pages/index/index.wxml');
  const iwx41 = read('pages/index/index.wxss');
  const ijs41 = read('pages/index/index.js');
  const lamp41 = read('data/lamp.js');
  const t41 = read('preview/template.html');

  // 41.1 资产齐备 + 体积口径（与 make_lamp_assets.py 的预算一致）
  [['images/buddha-bg.jpg', 50], ['images/lamp.webp', 58], ['images/flame.webp', 14]].forEach(pair => {
    if (!exists(pair[0])) { err('缺少 ' + pair[0] + '（D50 灯火跳窗资产）'); return; }
    const kb = fs.statSync(path.join(ROOT, pair[0])).size / 1024;
    if (kb <= pair[1]) ok(pair[0] + ' 体积 ' + Math.round(kb) + 'KB ≤ ' + pair[1] + 'KB');
    else err(pair[0] + ' 超预算：' + Math.round(kb) + 'KB > ' + pair[1] + 'KB');
  });
  if (exists('scripts/make_lamp_assets.py')) ok('scripts/make_lamp_assets.py 存在（灯火资产可零成本复现）');
  else err('缺 scripts/make_lamp_assets.py（D50 资产必须可复现）');

  // 41.2 小程序端：底图 + 色罩挂在**佛龛层**（D53 起不再是卡片级绝对铺满，而是
  //      .lamp-shrine 内的等比块；WXSS 不支持本地路径 background-image，必须用 <image>）
  if (iw41.indexOf('<image class="lamp-buddha" src="/images/buddha-bg.jpg"') > -1)
    ok('跳窗挂载释迦牟尼底图（<image> 组件，mode=widthFix 等比）');
  else err('跳窗未挂载 /images/buddha-bg.jpg（WXSS background-image 不支持本地路径）');
  [['.lamp-buddha', iwx41], ['.lamp-veil', iwx41], ['.lamp-veil', t41]].forEach(pair => {
    if (pair[1].indexOf(pair[0] + ' {') > -1 || pair[1].indexOf(pair[0] + '{') > -1)
      ok('样式齐备：' + pair[0] + (pair[1] === iwx41 ? '（小程序）' : '（体验版）'));
    else err('缺少样式 ' + pair[0] + '（' + (pair[1] === iwx41 ? 'index.wxss' : 'template.html') + '）');
  });
  if (/\.lamp-veil\s*\{[\s\S]*?linear-gradient/.test(iwx41)) ok('色罩为渐变夜色罩（压艳保证可读）');
  else err('.lamp-veil 缺少渐变色罩');

  // 41.3 真实酥油灯 + 写实火苗：两端结构齐备
  [['<image class="lamp-img"', iw41], ['<image class="flame-img fi-outer"', iw41], ['<image class="flame-img fi-core"', iw41],
   ['id="lamp-img"', t41], ['id="fi-outer"', t41], ['id="fi-core"', t41]].forEach(pair => {
    if (pair[1].indexOf(pair[0]) > -1) ok('灯火图结构齐备：' + pair[0]);
    else err('缺少灯火图结构：' + pair[0]);
  });
  if (ijs41.indexOf('lampImg') === -1 && read('scripts/build-h5.js').indexOf("lampImg: dataUrl('images/lamp.webp')") > -1)
    ok('体验版注入 lampImg/flameImg/buddhaBg（build-h5.js）');
  else err('build-h5.js 未注入 D50 灯火资产');
  if (t41.indexOf("$('lamp-buddha').src = IMAGES.buddhaBg") > -1 && t41.indexOf("$('lamp-img').src = IMAGES.lampImg") > -1)
    ok('体验版 renderLamp 挂载灯火三图');
  else err('体验版 renderLamp 未挂载灯火三图');

  // 41.4 静→动火焰（用户要求 3/4）：未点亮态 .flame-img 规则块不得含 animation；动画只挂 .lit 之下
  const flameBlock41 = (iwx41.match(/\.flame-img\s*\{[\s\S]*?\}/) || [''])[0];
  if (flameBlock41 && flameBlock41.indexOf('animation') === -1)
    ok('未点亮态火苗完全静态（.flame-img 无 animation）');
  else err('未点亮态火苗带动画（违反「点灯之前火焰是静态的」）');
  [['.lit .fi-outer', 'flameSway'], ['.lit .fi-core', 'flameDance'], ['.lit .flame-halo', 'haloBreathe']].forEach(pair => {
    const re = new RegExp(pair[0].replace(/\./g, '\\.') + '\\s*\\{[^}]*animation:[^;]*' + pair[1]);
    if (re.test(iwx41)) ok('点亮后动态火焰：' + pair[0] + ' → ' + pair[1]);
    else err('点亮后火焰动画缺失：' + pair[0] + '（' + pair[1] + '）');
  });
  [['flameSway', iwx41], ['flameDance', iwx41], ['flameSway', t41], ['flameDance', t41]].forEach(pair => {
    if (pair[1].indexOf('@keyframes ' + pair[0]) > -1) ok('@keyframes 齐备：' + pair[0]);
    else err('缺少 @keyframes ' + pair[0]);
  });
  if (t41.indexOf("classList.add('lit')") > -1 && t41.indexOf("id=\"lamp-flame\"") > -1)
    ok('体验版点亮后挂 .lit');
  else err('体验版点亮后未挂 .lit');

  // 41.5 燃灯播报《嗡 嘛 呢 叭 咪 吽》（用户要求 5）：mp3 资产 + 两端接线
  if (exists('audio/voice/mantra.mp3')) {
    const mk = fs.statSync(path.join(ROOT, 'audio/voice/mantra.mp3')).size / 1024;
    if (mk <= 18) ok('audio/voice/mantra.mp3 体积 ' + mk.toFixed(1) + 'KB ≤ 18KB');
    else err('mantra.mp3 超预算：' + mk.toFixed(1) + 'KB > 18KB');
  } else err('缺少 audio/voice/mantra.mp3（燃灯播报）');
  if (ijs41.indexOf("audio.speak('mantra')") > -1) ok('小程序 onLightLamp 播报 mantra');
  else err('小程序 onLightLamp 未播报 mantra');
  if (t41.indexOf("speak('mantra')") > -1) ok('体验版 lightLamp 播报 mantra');
  else err('体验版 lightLamp 未播报 mantra');

  // 41.6 按钮文案（用户要求 6）：文案在 data/lamp.js 单一来源，两端取用
  if (lamp41.indexOf("thanksText: '感谢您为世界和平祈福'") > -1 && lamp41.indexOf("closeText: '点击关闭'") > -1)
    ok('data/lamp.js 含用户点名文案（感谢您为世界和平祈福 / 点击关闭）');
  else err('data/lamp.js 缺 thanksText/closeText 点名文案');
  if (iw41.indexOf('{{lampThanksText}}') > -1 && iw41.indexOf('{{lampCloseText}}') > -1)
    ok('小程序底栏按钮走数据绑定（lampThanksText / lampCloseText）');
  else err('小程序底栏按钮未走数据绑定');
  if (ijs41.indexOf('lampData.thanksText') > -1 && ijs41.indexOf('lampData.closeText') > -1)
    ok('buildLampView 注入 thanks/close 文案');
  else err('buildLampView 未注入 thanks/close 文案');
  if (t41.indexOf("$('lamp-thanks').textContent = LAMP.thanksText") > -1 &&
      t41.indexOf("$('lamp-close').textContent = LAMP.closeText") > -1)
    ok('体验版按钮文案同源（LAMP.thanksText / closeText）');
  else err('体验版按钮文案未同源');
  // 反例自测：文案若回退成旧「收下灯火 · 关闭」必须立刻报错
  if (iw41.indexOf('收下灯火 · 关闭') === -1 && t41.indexOf('收下灯火 · 关闭') === -1)
    ok('旧文案「收下灯火 · 关闭」已按用户要求退场');
  else err('底栏仍残留旧文案「收下灯火 · 关闭」');
}

// ============================== 42. 藏文学习体系与关卡生成（D51） ==============================
// 15 级 × 每级 10 关 = 150 关；格子按级别动态（6×6→5×5→4×4→3×3，cell = 屏宽×0.9/列数）
// 验收口径（用户指定）：① 各级关数 ② 动态格子尺寸 ③ 自动证书 ④ L11 起长按放大预览
section('42. 藏文学习体系与关卡生成（15 级 × 150 关 · 动态格子 · 证书）');
{
  let learning = null, grid = null, certif = null, learnData = null;
  try {
    learning = require(path.join(ROOT, 'utils', 'learning'));
    grid = require(path.join(ROOT, 'utils', 'grid'));
    certif = require(path.join(ROOT, 'utils', 'certificate'));
    learnData = require(path.join(ROOT, 'data', 'learning'));
  } catch (e) {
    err('学习体系模块加载失败：' + e.message);
  }

  if (learning && grid && learnData) {
    // 42.1 结构：15 级 / 合计 150 关 / 每级 10 关
    const lv = learnData.LEVELS;
    if (lv.length === 15) ok('学习体系共 15 级');
    else err('学习体系应为 15 级，实际 ' + lv.length);
    if (learning.totalStages() === 150) ok('关卡总数 150（15 级 × 10 关）');
    else err('关卡总数应为 150，实际 ' + learning.totalStages());
    if (lv.every(l => l.stages === 10)) ok('每级均为 10 关');
    else err('存在非 10 关的级别：' + lv.map(l => l.lv + ':' + l.stages).join(' '));
    // L1 覆盖 30 个辅音（用户指定：L1 = 三十个辅音）
    const l1 = new Set();
    for (let s = 1; s <= learning.stagesOf(1); s++) learning.buildStage(1, s).titles.forEach(t => l1.add(t));
    if (l1.size === 30 && learnData.CONSONANTS.every(c => l1.has(c)))
      ok('L1 十关完整覆盖 30 个辅音（每关 3 个新字母）');
    else err('L1 覆盖辅音不全：' + l1.size + ' 个');

    // 42.2 动态格子尺寸：行列表 + 弹性公式 + 用户给的基准值（52/63/80/108，±1px）
    const EXPECT = [[1, 6, 52], [2, 6, 52], [3, 5, 63], [5, 5, 63], [6, 4, 80], [10, 4, 80], [11, 3, 108], [15, 3, 108]];
    EXPECT.forEach(pair => {
      const c = grid.colsOf(pair[0]);
      const px = grid.cellPx(pair[0], 375);
      if (c === pair[1] && Math.abs(px - pair[2]) <= 1) ok('L' + pair[0] + ' 网格 ' + c + '×' + c + ' · 牌面 ' + px + 'px（基准 ' + pair[2] + '）');
      else err('L' + pair[0] + ' 尺寸不达标：cols=' + c + ' cell=' + px + 'px（期望 ' + pair[1] + '× / ' + pair[2] + '）');
    });
    if (Math.abs(grid.cellPx(6, 430) - grid.cellPx(6, 375)) > 0) ok('格子随屏宽弹性变化（375 → 430：' + grid.cellPx(6, 375) + ' → ' + grid.cellPx(6, 430) + 'px）');
    else err('格子尺寸未按屏宽弹性变化');
    if (Math.abs(grid.RATIO - 0.9) < 1e-9) ok('采用用户指定口径：cell = 屏宽 × 0.9 / cols');
    else err('RATIO 应为 0.9，实际 ' + grid.RATIO);

    // 42.3 生成器三条守恒（每种偶数 / 每种 ≥2 / 总数偶数）—— 全部 150 关跑一遍
    let odd = 0, tooFew = 0, totalOdd = 0, emptyTitle = 0;
    for (let L = 1; L <= 15; L++) {
      for (let s = 1; s <= learning.stagesOf(L); s++) {
        const st = learning.buildStage(L, s);
        if (st.total % 2) totalOdd++;
        st.elements.forEach(e => { if (e[1] % 2) odd++; if (e[1] < 2) tooFew++; });
        if (!st.titles.length || st.titles.some(t => !t)) emptyTitle++;
      }
    }
    if (!odd && !tooFew && !totalOdd && !emptyTitle)
      ok('全部 150 关通过守恒校验（每种偶数 / 每种 ≥2 张 / 总数偶数 / 内容非空）');
    else err('守恒违规：奇数种数=' + odd + ' 少于2张=' + tooFew + ' 总数奇数=' + totalOdd + ' 空内容=' + emptyTitle);

    // 42.4 用户样例校核：L8 第 1 关 = 4×4 / 消除 10 个组合 / 25 步
    const ex = learning.buildStage(8, 1);
    if (ex.cols === 4 && ex.rows === 4) ok('L8 第 1 关为 4×4（与用户样例一致）');
    else err('L8 第 1 关网格为 ' + ex.cols + '×' + ex.rows + '（应为 4×4）');
    if (ex.pairs === 10) ok('L8 第 1 关需消除 10 个组合（与用户样例一致）');
    else err('L8 第 1 关对数应为 10，实际 ' + ex.pairs);
    if (ex.steps === 25) ok('L8 第 1 关步数预算 25（与用户样例一致）');
    else err('L8 第 1 关步数应为 25，实际 ' + ex.steps);
    // 前加字 + 基字 + 元音 的部件组合（用户点名：ག ད བ མ འ + ཀ ཁ ག ང + ི ུ ེ ོ）
    if (ex.titles.every(t => /^[གདབམའ][ཀཁགང][ིེོུ]$/.test(t)))
      ok('L8 第 1 关字形全部为「前加字 + 基字 + 元音」组合：' + ex.titles.join(' '));
    else err('L8 第 1 关字形不符合样例：' + ex.titles.join(' '));

    // 42.5 叠加深度限制（用户拍板：禁止七位全叠 → 只出 3~4 部件的真实组合）
    // 只查**音节级**的关（L1–L9 / L14–L15 复习）：词句关（L10–L13）本身是长串，按 tsheg 分词后逐段查
    const SYLL_LV = [1, 2, 3, 4, 5, 6, 7, 8, 9, 14, 15];
    let deep = 0;
    SYLL_LV.forEach(L => {
      for (let s = 1; s <= learning.stagesOf(L); s++) {
        learning.buildStage(L, s).titles.forEach(t => { if (t.length > 5) deep++; });
      }
    });
    if (!deep) ok('无「七位全叠」的不成立音节（音节级关卡单字 ≤ 5 码位）');
    else err('存在过深叠加的字：' + deep + ' 个');
    let deepWord = 0;
    [10, 11, 12, 13].forEach(L => {
      for (let s = 1; s <= learning.stagesOf(L); s++) {
        learning.buildStage(L, s).titles.forEach(t => {
          String(t).split('་').forEach(seg => { if (seg.length > 5) deepWord++; });
        });
      }
    });
    if (!deepWord) ok('词句关的每一段同样是真实音节（无越界叠字）');
    else err('词句关存在越界叠字：' + deepWord + ' 段');

    // 42.6 字形量算与缩放：measureTibetanSyllable / calcScale 必须能把复合字塞进格子
    const wide = grid.measureTibetanSyllable('བཀི', 50);
    if (wide.width > 0 && wide.height > 0) ok('measureTibetanSyllable 返回墨迹宽高合理（' + Math.round(wide.width) + '×' + Math.round(wide.height) + '）');
    else err('measureTibetanSyllable 返回值异常');
    const fit = grid.calcScale('རྐྱི', 80, 50);
    const inner = 80 * grid.INNER;
    if (fit.scale <= 1 && fit.scale >= grid.MIN_SCALE && fit.width <= inner + 1 && fit.height <= inner + 1)
      ok('calcScale 把 རྐྱི 缩到格内（scale=' + fit.scale.toFixed(2) + '，' + fit.width + '×' + fit.height + ' ≤ ' + Math.round(inner) + '）');
    else err('calcScale 未把复合字缩到格内：' + JSON.stringify(fit));
    // 注入式量算（真机 canvas 通道）：注入值必须被采信
    // 注入 500px 的超宽量算值 → 缩放必须显著小于不注入时的估算（且被 MIN_SCALE 夹住）
    const plain = grid.calcScale('ཀ', 80, 50);
    const inj = grid.calcScale('ཀ', 80, 50, () => 500);
    if (inj.scale < plain.scale && inj.scale === grid.MIN_SCALE)
      ok('支持注入 canvas measureText 通道（宽 500 → 缩到下限 scale=' + inj.scale.toFixed(2) + '，未注入时 ' + plain.scale.toFixed(2) + '）');
    else err('注入量算通道未被采信：' + JSON.stringify(inj) + ' / plain ' + JSON.stringify(plain));

    // 42.7 长按放大预览：L11 起开启
    if (grid.needsZoomPreview(11) && !grid.needsZoomPreview(10)) ok('长按放大预览自 L11 起启用（L10 不开）');
    else err('长按放大预览的级别阈值错误');
    const gw = read('pages/game/game.wxml');
    const gj = read('pages/game/game.js');
    if (gw.indexOf('bindlongpress="onTileLongPress"') > -1 && gw.indexOf('class="zoom-mask"') > -1)
      ok('游戏页 wiring 齐备：tile 长按 + 放大预览层');
    else err('游戏页缺少长按 / 放大预览 wiring');
    if (/zoomable:\s*false/.test(gj) && gj.indexOf('closeZoom') > -1) ok('放大预览有开关守卫与收起入口（zoomable / closeZoom）');
    else err('放大预览缺少 zoomable 守卫或 closeZoom');

    // 42.8 两端：学习模式入口（?lv=N&stage=M），老 ?level=N 不变
    if (gj.indexOf("parseInt(query.lv, 10)") > -1 && gj.indexOf('learning.buildStage') > -1)
      ok('游戏页支持学习模式入口（?lv=N&stage=M）');
    else err('游戏页未支持学习模式入口');
    if (gj.indexOf('grid.boardSize(') > -1 && gj.indexOf('grid.cellPx(') > -1)
      ok('游戏页按 grid 模块计算牌面尺寸（动态格子落地）');
    else err('游戏页未用 grid 模块计算牌面尺寸');
    // 反例自测：计算式被改成常量 tree 必须立刻报错
    if (/var tileW = Math\.floor/.test(gj) && /grid\.boardSize/.test(gj)) ok('守卫自测：牌面尺寸仍为运行时计算（非写死常量）');
    else err('守卫自测失败：牌面尺寸被写死');

    // 42.9 证书体系：15 张级别证书 + 终极「藏文拼读宗师」
    if (typeof certif.learningList === 'function' && typeof certif.issueLearningCert === 'function')
      ok('证书模块导出学习证书接口（learningList / issueLearningCert）');
    else err('证书模块缺少学习证书接口');
    const hurt = certif.buildLearningCert(3, { acc: 0.96, clean: true }, null);
    if (hurt && hurt.tier === 'gold' && hurt.lv === 3 && hurt.key === 'lv3')
      ok('学习证书按正确率自动定档（96% 零失误 → 金质）');
    else err('学习证书定档错误：' + JSON.stringify(hurt));
    const hurt2 = certif.buildLearningCert(3, { acc: 0.5, clean: false }, null);
    if (hurt2 && hurt2.tier === 'bronze') ok('学习证书低正确率落普通档（50% → 普通）');
    else err('学习证书低档判断错误：' + hurt2 && hurt2.tier);
    if (learnData.ULTIMATE.name === '藏文拼读宗师') ok('终极证书名 = 藏文拼读宗师');
    else err('终极证书名错误：' + learnData.ULTIMATE.name);
    if (typeof certif.learningList().ultimate.unlocked === 'boolean')
      ok('终极证书解锁状态可查询（集齐 15 张才解锁）');
    else err('终极证书状态缺失');
  }
}

// ---------- 43. 藏地密码「播整段」讲解（D52，2026-10-08 用户反馈） ----------// 真实缺陷：中文播报只念第一句，屏幕上却显示三段正文 —— 听到的比看到的短一大截。
// 根因：scripts/gen_chinese_voice.py 里另写了一份「一句话精简版」词表，
//       于是 data/secrets.js 改了正文、mp3 不跟着变（两份文本必然漂移）。
// 正解：**单一事实源** —— 讲解文本只在 data/secrets.js 写一次，生成脚本按关卡号取全文。
// 代价：十条合计 196KB → 279KB（+83KB），由音效 WAV→MP3 腾挪（scripts/compress_sfx.py，-133KB）。
section('43. 藏地密码讲解「播整段」');
{
  // --- 43.1 单一事实源：生成脚本不得再内置讲解文本 ---
  const gcv = exists('scripts/gen_chinese_voice.py') ? read('scripts/gen_chinese_voice.py') : '';
  if (!gcv) err('缺 scripts/gen_chinese_voice.py（讲解语音不可复现）');
  else {
    if (!/SECRETS\s*=\s*\{/.test(gcv)) ok('gen_chinese_voice.py 已无内置讲解词表（杜绝第二份文本）');
    else err('gen_chinese_voice.py 仍在脚本里写死讲解文本 —— 这正是「只播第一句」的根因');
    [['def load_secrets', '讲解正文读取函数'], ["os.path.join(ROOT, 'data', 'secrets.js')", '从 data/secrets.js 取全文'],
     ["len(text) < 80", '正文过短即硬失败（宁可不生成，也不播半截）'],
     ['len(out) != 10', '则数不足即硬失败'], ['raise SystemExit', '失败是显式报错而非静默降级']]
      .forEach(([k, label]) => {
        if (gcv.indexOf(k) > -1) ok('gen_chinese_voice.py 含 ' + label);
        else err('gen_chinese_voice.py 缺 ' + label + '（' + k + '）');
      });
  }

  // --- 43.2 正文长度：十条都必须是「整段」（与 Python 侧同一口径） ---
  let secList43 = null;
  try { secList43 = require(path.join(ROOT, 'data', 'secrets.js')); } catch (e) { /* 走下面 err */ }
  if (secList43 && secList43.length === 10) {
    const short43 = secList43.filter(s => (s.title + '。' + s.text).length < 80);
    if (!short43.length) ok('十条讲解正文均为整段（≥80 字，最短 ' +
      Math.min(...secList43.map(s => (s.title + '。' + s.text).length)) + ' 字）');
    else err('讲解正文过短（疑似只截了一句）：' +
      short43.map(s => 'L' + s.level + '=' + (s.title + '。' + s.text).length).join(','));
  } else err('data/secrets.js 无法解析为 10 则');

  // --- 43.3 反证：mp3 时长必须真的覆盖整段 ---
  // 读 MP3 的 Xing/Info 头里的**帧数**换算时长（不依赖 ffmpeg、不猜码率）：
  //   duration = frames × samplesPerFrame / sampleRate，samplesPerFrame = 1152(MPEG1) / 576(MPEG2)
  // 判定用「语速」而不是绝对秒数：整段 ≈ 4.1–4.8 字/秒；若只念了第一句，
  // 用整段字数去除那段时长，语速会飙到 12+ 字/秒 —— 一眼可辨。
  function mp3Duration(rel) {
    const b = fs.readFileSync(path.join(ROOT, rel));
    const SR = { 1: [44100, 48000, 32000], 2: [22050, 24000, 16000], 25: [11025, 12000, 8000] };
    let i = 0;
    if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {
      const sz = ((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f);
      i = 10 + sz;
    }
    for (; i < b.length - 200; i++) {
      if (b[i] !== 0xFF || (b[i + 1] & 0xE0) !== 0xE0) continue;
      if (((b[i + 1] >> 1) & 3) !== 1) continue;                    // 只认 Layer III
      const vb = (b[i + 1] >> 3) & 3;
      const ver = vb === 3 ? 1 : vb === 2 ? 2 : vb === 0 ? 25 : 0;
      if (!ver) continue;
      const sr = SR[ver][(b[i + 2] >> 2) & 3];
      if (!sr) continue;
      const at = b.slice(i + 4, i + 200).toString('latin1').search(/Xing|Info/);
      if (at < 0) return null;
      const p = i + 4 + at + 4;                                     // 4B tag → 4B flags → 4B frames
      if (!(b.readUInt32BE(p) & 1)) return null;                    // 无帧数字段
      return b.readUInt32BE(p + 4) * (ver === 1 ? 1152 : 576) / sr;
    }
    return null;
  }

  const keys43 = Array.from({ length: 10 }, (_, i) => 'secret_' + String(i + 1).padStart(2, '0'));
  const miss43 = keys43.filter(k => !exists('audio/voice/' + k + '.mp3'));
  if (miss43.length) {
    ok('（讲解语音未生成，跳过时长反证：' + miss43.length + '/10 缺失）');
  } else if (secList43 && secList43.length === 10) {
    const rows = secList43.map(s => {
      const k = 'secret_' + String(s.level).padStart(2, '0');
      const n = (s.title + '。' + s.text).length;
      const d = mp3Duration('audio/voice/' + k + '.mp3');
      return { k, n, d, rate: d ? n / d : null };
    });
    const bad = rows.filter(r => r.d === null);
    if (!bad.length) ok('十条讲解 mp3 均能读出时长（Xing 帧数换算，不依赖 ffmpeg）');
    else err('时长解析失败（无 Xing/Info 帧数）：' + bad.map(r => r.k).join(','));

    const slow = rows.filter(r => r.d && r.rate < 3.5);      // 念得过快 = 少念了内容
    const fast = rows.filter(r => r.d && r.rate > 6.0);      // 念得过慢 = 异常拉长
    if (!slow.length && !fast.length)
      ok('十条讲解语速均落在 3.5–6.0 字/秒（实测 ' +
        Math.min(...rows.map(r => r.rate)).toFixed(2) + '–' +
        Math.max(...rows.map(r => r.rate)).toFixed(2) + '）→ 播的是整段');
    else err('讲解语速异常（疑似截句/拉长）：' +
      slow.concat(fast).map(r => r.k + '=' + (r.rate || 0).toFixed(2) + '字/秒').join(','));

    const shortDur = rows.filter(r => r.d && r.d < 20);
    if (!shortDur.length) ok('十条讲解时长均 ≥20s（实测 ' +
      Math.min(...rows.map(r => r.d)).toFixed(1) + '–' + Math.max(...rows.map(r => r.d)).toFixed(1) + 's，与整段相称）');
    else err('讲解时长过短（疑似只念了第一句）：' +
      shortDur.map(r => r.k + '=' + r.d.toFixed(1) + 's').join(','));

    // 反例自测：把「只念第一句」的假设代入同一套判定，必须立刻报错
    const firstSent = secList43.map(s => (s.title + '。' + s.text.split('。')[0] + '。').length);
    const wouldPass = rows.filter((r, i) => r.d && (firstSent[i] / r.d) >= 3.5 && (firstSent[i] / r.d) <= 6.0);
    if (!wouldPass.length) ok('守卫自测：若只念第一句，语速判定必然报错（反例全部落网）');
    else err('守卫自测失败：「只念第一句」也能蒙混过关 —— ' + wouldPass.map(r => r.k).join(','));
  }

  // --- 43.4 包体腾挪的落点：音效已转 MP3，主包回到预算内 ---
  if (exists('scripts/compress_sfx.py')) ok('音效压缩脚本 scripts/compress_sfx.py 存在（腾挪可复现）');
  else err('缺 scripts/compress_sfx.py（讲解整段化后主包会超 2MB）');
  const stillWav = ['match', 'mismatch', 'win', 'drum', 'horn', 'cheer'].filter(s => exists('audio/' + s + '.wav'));
  if (!stillWav.length) ok('6 条合成音已无 WAV 残留（172KB → 35KB，腾出 133KB）');
  else err('WAV 残留会让腾挪白做：' + stillWav.map(s => s + '.wav').join(','));
  if (exists('audio/tap.wav')) ok('tap.wav 保留（1.5KB + 零延迟，转 MP3 得不偿失）');
  else err('audio/tap.wav 缺失（点击反馈音效）');
}

// ---------- 44. 祈福之光跳窗 D53 改版（2026-10-09 用户点名四条） ----------
// ① 更名：万家灯火 → 祈福之光（候选：世界和平之光 / 和平灯火 / 为世界和平祈福）
// ② 灯体压艳（原「特别艳丽」与暗底不协调）→ 饱和 .42 / 亮度 .60 / 对比 .90 + 深棕金罩 28%
// ③ 灯体缩到 50%（300×424 → 150×212rpx）
// ④ 灯座与佛陀座基「同一个基础」+ 主数字横穿灯腰（下半部不高于第一个数据 / 上部高于它）
section('44. 祈福之光跳窗 D53（更名 / 压艳 / 50% 缩放 / 底座同基 + 数字穿灯腰）');
{
  const lamp44 = read('data/lamp.js');
  const iwx44 = read('pages/index/index.wxss');
  const iw44 = read('pages/index/index.wxml');
  const t44 = read('preview/template.html');
  const gen44 = read('scripts/make_lamp_assets.py');

  // --- 44.1 更名（单一来源 data/lamp.js，两端取用） ---
  if (lamp44.indexOf("title: '祈福之光'") > -1) ok('跳窗名 = 祈福之光（data/lamp.js 单一来源）');
  else err('跳窗名不是「祈福之光」');
  if (/title:\s*'[^']*万家灯火/.test(lamp44)) err('data/lamp.js 仍残留「万家灯火」标题');
  else ok('旧名「万家灯火」已从标题退场');

  // --- 44.2 压艳参数（生成器内的契约常量，四档里用户选 B 中压） ---
  const mute44 = [['LAMP_SAT = 0.42', '饱和 .42'], ['LAMP_BRI = 0.60', '亮度 .60'],
    ['LAMP_CON = 0.90', '对比 .90'], ['LAMP_TINT_A = 0.28', '深棕金罩 28%']];
  mute44.forEach(pair => {
    if (gen44.indexOf(pair[0]) > -1) ok('灯体压艳：' + pair[1]);
    else err('make_lamp_assets.py 缺压艳参数 ' + pair[0]);
  });
  // 罩色必须乘灯体自身 alpha，否则整张透明区会镀一层棕雾（RGBA 合成踩坑）
  if (gen44.indexOf('putalpha(img.split()[3].point') > -1) ok('罩色按灯体 alpha 蒙版施加（不会给透明区镀雾）');
  else err('压艳罩色未乘灯体 alpha —— 透明区会蒙上棕雾');

  // --- 44.3 底座同基（供桌线契约：生成器 92% ↔ CSS bottom:8%） ---
  if (gen44.indexOf('BASE_LINE = 0.92') > -1 && gen44.indexOf('CROP_TO = 0.90') > -1)
    ok('make_lamp_assets.py 含底座线契约（BASE_LINE=0.92 / CROP_TO=0.90）');
  else err('make_lamp_assets.py 缺底座线契约常量');
  if (Math.round((1 - 0.92) * 100) !== 8) err('底座线换算自检失败（1-0.92 应为 8%）');
  const lampCss44 = (iwx44.match(/\.lamp-img\s*\{[\s\S]*?\}/) || [''])[0];
  const lampCssH5 = (t44.match(/\.lamp-img\s*\{[\s\S]*?\}/) || [''])[0];
  if (/bottom:\s*8%/.test(lampCss44)) ok('小程序灯座 bottom:8% ↔ 佛陀座基 92%（同一条供桌线）');
  else err('小程序 .lamp-img 未挂 bottom:8%（与底图 92% 座基脱钩）');
  if (/bottom:\s*8%/.test(lampCssH5)) ok('体验版灯座 bottom:8%（两端同线）');
  else err('体验版 .lamp-img 未挂 bottom:8%');

  // --- 44.4 主数字横穿灯腰（用真实底图尺寸算几何，不靠目测） ---
  function jpegSize(rel) {
    const b = fs.readFileSync(path.join(ROOT, rel));
    let i = 2;
    while (i < b.length - 9) {
      if (b[i] !== 0xFF) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xC0 || m === 0xC1 || m === 0xC2 || m === 0xC3)
        return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      i += 2 + b.readUInt16BE(i + 2);
    }
    return null;
  }
  const dim44 = jpegSize('images/buddha-bg.jpg');
  if (!dim44) err('无法解析 buddha-bg.jpg 尺寸（SOF 缺失）');
  else {
    const shrineH = 620 * dim44.h / dim44.w;              // 佛龛层高（rpx @620 卡宽）
    const lampTop = 100 - 8 - 212 / shrineH * 100;        // 灯顶（% 佛龛层高）
    const lampBase = 100 - 8;                             // 灯座线 = 佛陀座基
    const numCenter = 70 + 38 / shrineH * 100;            // 主数字行中心（行高 ≈76rpx）
    const waistMid = (lampTop + lampBase) / 2;
    if (numCenter > lampTop && numCenter < lampBase)
      ok('主数字落在灯体区间内（灯顶 ' + lampTop.toFixed(1) + '% < 数字中心 ' +
        numCenter.toFixed(1) + '% < 灯座 ' + lampBase.toFixed(1) + '%）→ 上下半部被数字一分为二');
    else err('主数字未穿过灯腰：数字中心 ' + numCenter.toFixed(1) + '%，灯体 ' +
      lampTop.toFixed(1) + '%~' + lampBase.toFixed(1) + '%');
    if (Math.abs(numCenter - waistMid) <= 4)
      ok('主数字贴近灯腰正中（偏差 ' + Math.abs(numCenter - waistMid).toFixed(1) + '% ≤ 4%）');
    else err('主数字偏离灯腰正中 ' + Math.abs(numCenter - waistMid).toFixed(1) + '%（>4%）');
  }

  // --- 44.5 50% 缩放（两端等比：H5 px = rpx / 2） ---
  if (/width:\s*150rpx/.test(lampCss44) && /height:\s*212rpx/.test(lampCss44))
    ok('小程序灯体 150×212rpx（= 300×424 的 50%）');
  else err('小程序灯体不是 150×212rpx');
  if (/width:\s*75px/.test(lampCssH5) && /height:\s*106px/.test(lampCssH5))
    ok('体验版灯体 75×106px（与小程序 1px=2rpx 严格等比）');
  else err('体验版灯体与小程序不等比（应为 75×106px）');

  // --- 44.6 佛龛层结构：底图/色罩/灯/标题同层，灯先于文字（文字压在灯腰上） ---
  const shrine44 = (iw44.match(/<view class="lamp-shrine">[\s\S]*?<\/view>\s*<view class="lamp-sec">/) || [''])[0];
  const shrineH5 = (t44.match(/<div class="lamp-shrine">[\s\S]*?<\/div>\s*<div class="lamp-sec">/) || [''])[0];
  [['小程序', shrine44, 'lamp-buddha', 'lamp-flame', 'lamp-title', 'lamp-total'],
   ['体验版', shrineH5, 'lamp-buddha', 'lamp-flame', 'lamp-title', 'lamp-total']]
    .forEach(pair => {
      const src = pair[1];
      if (!src) { err(pair[0] + '缺佛龛层 .lamp-shrine（底图/灯/标题必须同层）'); return; }
      const idx = pair.slice(2).map(k => src.indexOf(k));
      if (idx.every(v => v > -1) && idx[0] < idx[1] && idx[1] < idx[2] && idx[2] < idx[3])
        ok(pair[0] + '佛龛层结构齐备且灯先于文字绘制（底图→灯→标题→主数字）');
      else err(pair[0] + '佛龛层结构/顺序不对：' + pair.slice(2).join(','));
    });
  if (iwx44.indexOf('.lamp-shrine') > -1 && t44.indexOf('.lamp-shrine') > -1)
    ok('佛龛层样式两端齐备（百分比定位，随屏宽等比）');
  else err('缺 .lamp-shrine 样式');
  // 反例：底图若还是「卡片级绝对铺满」（position:absolute + height:100%），共线契约必被破坏
  const buddhaCss44 = (iwx44.match(/\.lamp-buddha\s*\{[\s\S]*?\}/) || [''])[0];
  if (buddhaCss44.indexOf('height: 100%') === -1)
    ok('底图为等比块（widthFix），不再绝对铺满卡片（共线契约成立的前提）');
  else err('.lamp-buddha 仍是 height:100% 绝对铺满 —— 佛龛层高度不再由底图决定');
}

// ---------- 45. 性别 + 藏族名字 D54（2026-10-09 用户点名「系统必须能区分男女」） ----------
// 用户原话：后期要给用户藏族名字，而藏族名字分男女 —— 所以一开始就要把性别这层做对。
// 四条硬规矩（任何一条破了都会变成合规事故，故全部做成机械守卫）：
//   ① 只能用户自填（不调任何获取个人资料的接口，微信也不再返回性别）
//   ② 必须有「不愿透露」出口，且是并列选项不是隐藏入口
//   ③ 只落本机（不上传 / 不同步 / 不进埋点）
//   ④ 可查看 / 可修改 / 可清除
section('45. 性别 + 藏族名字 D54（自填三档 / 不愿透露出口 / 仅本机 / 可改可清除）');
{
  const names45 = read('data/tibetan-names.js');
  const util45 = read('utils/tibetan-name.js');
  const store45 = read('utils/storage.js');
  const ijs45 = read('pages/index/index.js');
  const iw45 = read('pages/index/index.wxml');
  const pjs45 = read('pages/passport/passport.js');
  const pw45 = read('pages/passport/passport.wxml');
  const t45 = read('preview/template.html');
  const bh45 = read('scripts/build-h5.js');

  // --- 45.1 不调任何「获取个人资料」接口（微信小程序自 2022 年起也不再返回真实性别） ---
  // 与 §6 同一份名单，这里再点一次名：本功能的取值必须 100% 来自页面上的显式点选。
  const PROFILE_APIS = ['wx.getUserProfile', 'wx.getUserInfo', 'wx.authorize'];
  [['utils/tibetan-name.js', util45], ['utils/storage.js', store45],
   ['pages/index/index.js', ijs45], ['pages/passport/passport.js', pjs45]]
    .forEach(p => {
      const hit = PROFILE_APIS.filter(a => p[1].indexOf(a) > -1);
      if (!hit.length) ok(p[0] + ' 未调用任何个人资料接口（性别纯自填）');
      else err(p[0] + ' 出现个人资料接口：' + hit.join(','));
    });
  // 反例自测：把禁用接口字面量塞进扫描器，必须立刻落网（证明这条守卫不是空转）
  const selfHit45 = PROFILE_APIS.filter(a => ('wx.getUserProfile();').indexOf(a) > -1);
  if (selfHit45.length === 1) ok('守卫自测：含禁用接口的源码必被拦下（反例落网）');
  else err('§45.1 守卫自测失效（反例未落网）—— 扫描器形同虚设');

  // --- 45.2 三档取值：男 / 女 / 不愿透露（不设第四档，避免多收不必要的个人信息） ---
  ['male', 'female', 'unspecified'].forEach(k => {
    if (util45.indexOf("key: '" + k + "'") > -1) ok('性别档位齐备：' + k);
    else err('utils/tibetan-name.js 缺少性别档位 ' + k);
  });
  const keys45 = (util45.match(/key:\s*'([a-z]+)'/g) || []).map(s => s.match(/'([a-z]+)'/)[1]);
  if (keys45.length === 3) ok('性别取值恰好三档（' + keys45.join(' / ') + '，不多收）');
  else err('性别档位数量不是 3：' + keys45.length);
  // 「不愿透露」必须是并列选项（同一组按钮里渲染出来），不能只是代码分支里的兜底
  if (iw45.indexOf("item.key === 'unspecified' ? 'quiet' : ''") > -1 &&
      iw45.indexOf('genderOptions') > -1)
    ok('「不愿透露」与男/女同屏并列渲染（不是隐藏兜底）');
  else err('「不愿透露」未与男/女并列渲染');

  // --- 45.3 名字池分男女，且「不愿透露」走中性池（功能不打折） ---
  const maleCount45 = (names45.match(/\{ name: '/g) || []).length;
  ['male', 'female', 'neutral'].forEach(k => {
    if (new RegExp('\\b' + k + ':\\s*\\[').test(names45)) ok('名字池存在：' + k);
    else err('data/tibetan-names.js 缺少名字池 ' + k);
  });
  if (util45.indexOf("if (k === 'male') return NAMES.male;") > -1 &&
      util45.indexOf("if (k === 'female') return NAMES.female;") > -1 &&
      util45.indexOf('return NAMES.neutral;') > -1)
    ok('选名按性别分流（男→男名池 / 女→女名池 / 其余→中性池）');
  else err('选名未按性别分流');
  // 男女名池不得有交集（扎西不能同时出现在两池里）
  const grab45 = k => {
    const m = names45.match(new RegExp(k + ':\\s*\\[([\\s\\S]*?)\\]'));
    return m ? (m[1].match(/name:\s*'([^']+)'/g) || []).map(s => s.match(/'([^']+)'/)[1]) : [];
  };
  const m45 = grab45('male'), f45 = grab45('female'), n45 = grab45('neutral');
  const overlap45 = m45.filter(x => f45.indexOf(x) > -1);
  if (!overlap45.length && m45.length && f45.length)
    ok('男女名池无交集（' + m45.length + ' 男名 / ' + f45.length + ' 女名 / ' + n45.length + ' 中性名）');
  else err('男女名池存在重名：' + overlap45.join(','));

  // --- 45.4 只出中文音译，不写藏文（藏文写法待母语审校，见 data/tibetan-names.js 文件头） ---
  // 藏文码位 U+0F00–U+0FFF
  if (!/[\u0F00-\u0FFF]/.test(names45))
    ok('名字只出中文音译（无藏文码位 U+0F00–U+0FFF）');
  else err('data/tibetan-names.js 含藏文码位 —— 母语审校前不得开新的藏文文本源');
  // 反例自测：喂一个藏文码位进去必须落网
  if (/[\u0F00-\u0FFF]/.test('བཀྲ་ཤིས')) ok('守卫自测：藏文码位必被拦下（反例落网）');
  else err('§45.4 守卫自测失效（藏文反例未落网）');

  // --- 45.5 确定性选名：同 seed 必得同名（不会每次刷新都变） ---
  if (/Math\.floor\(n\)\s*%\s*pool\.length/.test(util45))
    ok('选名走确定性取模（同 seed 必得同名）');
  else err('选名不是确定性算法（每次刷新会变名字）');
  const tib45 = require(path.join(ROOT, 'utils', 'tibetan-name.js'));
  const a45 = tib45.pickFor('female', 7), b45 = tib45.pickFor('female', 7);
  if (a45 && b45 && a45.name === b45.name) ok('确定性实测：female/seed7 两次均为 ' + a45.name);
  else err('确定性选名实测不一致');
  if (a45 && tib45.pickFor('male', 7) && a45.name !== tib45.pickFor('male', 7).name)
    ok('男女不同名：同 seed 下 女=' + a45.name + ' / 男=' + tib45.pickFor('male', 7).name);
  else err('同 seed 下男女拿到同一个名字 —— 性别没起作用');
  if (tib45.normalizeGender('外星人') === '' && tib45.normalizeGender('male') === 'male')
    ok('归一化：脏值归为未选择，男/女原样通过');
  else err('normalizeGender 行为不对');
  // 反例自测：若某人把取模改成随机，确定性断言必然挂 —— 这里用「池外 seed」验证不越界
  const wrap45 = tib45.pickFor('neutral', 3 * 1000 + 1);
  if (wrap45 && n45.indexOf(wrap45.name) > -1) ok('大 seed 仍落在池内（取模不越界）');
  else err('大 seed 取模越界');

  // --- 45.6 两端字段同源（小程序 storage ↔ 体验版 getProgress 白名单逐字段比对） ---
  const FN45 = ['gender', 'tibetanName', 'tibetanNameMean'];
  FN45.forEach(f => {
    const inStore = new RegExp('^\\s*' + f + ':', 'm').test(store45);
    const inH5 = new RegExp('^\\s*' + f + ':', 'm').test(t45);
    if (inStore && inH5) ok('两端 storage 字段齐备：' + f);
    else err('字段缺一端：' + f + '（小程序=' + inStore + ' 体验版=' + inH5 + '）');
  });
  if (bh45.indexOf("tibetanNames: require(path.join(ROOT, 'data', 'tibetan-names'))") > -1)
    ok('体验版名字池由构建注入（data/tibetan-names.js 单一来源，不另写一份）');
  else err('build-h5.js 未注入 tibetanNames —— 体验版会另起一份名字池');

  // --- 45.7 可查看 / 可修改 / 可清除（护照页「我的资料」） ---
  if (pw45.indexOf('我的资料') > -1 && pjs45.indexOf('pickGender') > -1 &&
      pjs45.indexOf('clearGender') > -1)
    ok('护照页「我的资料」可修改性别（pickGender + clearGender）');
  else err('护照页缺「我的资料」的查看/修改/清除');
  if (/storage\.setGender\(''\)/.test(pjs45))
    ok('清除 = setGender(\'\')：性别与名字一并撤掉（个人信息可撤回）');
  else err('清除路径不是 setGender(\'\')');
  // 清除必须连名字一起撤（只清性别不清名字 = 留了个无主名字）
  if (/p\.tibetanName = '';/.test(store45) && /p\.tibetanNameMean = '';/.test(store45))
    ok('清性别同时清空名字（不留无主名字）');
  else err('清性别未同步清名字');

  // --- 45.8 只落本机：写入路径必须经过 save(p)（无网络 / 无云 / 无埋点） ---
  const setG45 = (store45.match(/function setGender[\s\S]*?\n}/) || [''])[0];
  if (setG45.indexOf('save(p)') > -1 && !/wx\.request|wx\.cloud|tracker/.test(setG45))
    ok('性别只写本机 storage（setGender 内无请求 / 无云 / 无埋点）');
  else err('setGender 走了网络 / 云 / 埋点');

  // --- 45.9 首次引导：只在还没选过时出现，且排在灯火跳窗之后（两个弹窗不同框） ---
  if (/genderAskShow/.test(iw45) && /onPickGender/.test(ijs45))
    ok('首页有首次性别引导（选完即写库）');
  else err('首页缺首次性别引导');
  if (/if \(lampFirst\) this\._pendingGender = !storage\.getGender\(\);/.test(ijs45) &&
      /if \(this\._pendingGender\)[\s\S]{0,160}maybeAskGender\(\);/.test(ijs45))
    ok('性别引导排在灯火跳窗之后（跳窗关闭后才弹出）');
  else err('性别引导未排在灯火跳窗之后 —— 两个弹窗会叠层');
  if (/if \(storage\.getGender\(\)\) return false;/.test(ijs45))
    ok('选过之后不再打扰（maybeAskGender 先查已选）');
  else err('maybeAskGender 未做「已选则跳过」判断');
  // 体验版同契约
  if (/if \(lamp\.shown\) \{ GENDER_PENDING = true; return false; \}/.test(t45) &&
      /lampFlushGender\(\);/.test(t45))
    ok('体验版同契约：性别引导排在灯火跳窗之后');
  else err('体验版性别引导未让位给灯火跳窗');
  if (/if \(getGender\(\)\) return false;/.test(t45))
    ok('体验版同样「已选则跳过」');
  else err('体验版 maybeAskGender 未做已选跳过');
}

console.log('通过: ' + passed + ' | 错误: ' + errors.length + ' | 警告: ' + warnings.length);
if (errors.length) { console.log('\x1b[31m存在错误，需修复后重试\x1b[0m'); process.exit(1); }
console.log('\x1b[32m全部自检通过 ✓\x1b[0m');
