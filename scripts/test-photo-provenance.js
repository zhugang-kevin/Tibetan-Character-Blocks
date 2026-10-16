// scripts/test-photo-provenance.js — 场景图出处门禁（D129）
//
// ## 为什么单独成一个脚本
//   validate.js 是多人并发改动的共享门禁文件；本门禁是**图片版权/出处专用**的一条线，
//   做成独立脚本：① 不与并发改动互相覆盖；② 可以单独跑、单独接流水线。
//
// ## 它守的是什么（D129 审计出来的真相，不是拍脑袋）
//   旧台账 `docs/photo-attribution.json` 按「从素材站下载的图」设计，只要
//   sourceUrl / author / license。实测发现事实完全不是那样：
//     · home / game 是**我方 AI 生成**（_raw 有含中文 prompt 与生成时间戳的原始件，
//       提交 22ef8eb 明写「ImageGen 生成 + 管线加工」）→ 没有第三方版权，
//       真正的未闭环项是**生成工具的商用权**；
//     · bodhi / monastery **出处不可证**（无 _raw、源 PNG 未入 git、无生成记录）
//       → 已在 data/photo-assets.js 置空停用（页面有设计好的回退，可逆）。
//   ⚠️ 更严重的一条：`git ls-files assets-src/scene/` 为空 —— 源图与原始件**全都没进版本控制**，
//      证据随时会丢，台账文件是唯一被 git 跟踪的出处记录。
//
// ## 判定原则
//   · 已启用（enabled）的图必须有可核对的出处；
//   · 出处不可证（unknown）**若已停用**则不算红 —— 风险已被隔离，但必须写下回退说明；
//   · AI 生成图必须登记**生成工具**：商用权取决于工具条款（如 Midjourney 免费版不可商用）；
//   · 第三方素材图必须有许可证，且**禁止 NC / ND**（NC = 非商业不可用，ND = 禁止演绎，
//     而 prepare-assets.py --scene 会降饱和/压暗/裁剪，构成演绎）。

var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');

var pass = 0, fail = 0;
function ok(m) { pass++; console.log('  \u2713 ' + m); }
function err(m) { fail++; console.log('  \u2717 ' + m); }
function read(p) { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (e) { return ''; } }
function exists(p) { try { return fs.statSync(path.join(ROOT, p)).size > 0; } catch (e) { return false; } }

console.log('场景图出处门禁（D129 · 防"出处不明的图进商业产品"）');

var manifestSrc = read('data/photo-assets.js');
var ledgerSrc = read('docs/photo-attribution.json');
var manifest = null, ledger = null;

try {
  manifest = eval('(' + manifestSrc.replace(/^[\s\S]*?module\.exports\s*=\s*/, '').replace(/;\s*$/, '') + ')');
} catch (e) { manifest = null; }
try { ledger = JSON.parse(ledgerSrc); } catch (e) { ledger = null; }

var KINDS = { ai_generated: 'AI 生成', user_photo: '自拍/自购', stock: '第三方素材', unknown: '出处不明' };
var ALLOWED_LICENSE = (ledger && ledger.licensePolicy && ledger.licensePolicy.allowed) || [];

// 统一的判据函数（正向断言与反向自测共用同一把尺子）
function judge(slot, file) {
  var problems = [];
  if (!slot) return ['台账里没有这一项'];
  var kind = slot.kind || '';
  if (!KINDS[kind]) problems.push('kind 不合法：' + (kind || '空'));
  if (file && !exists(file)) problems.push('图片文件不存在：' + file);

  var enabled = slot.enabled !== false && !!file;

  if (kind === 'unknown') {
    if (enabled) problems.push('出处不可证却仍在启用（应置空停用）');
    else if (!slot.enabledNote) problems.push('已停用但没写下回退/还原说明（将来会被误当成"漏做"）');
  }
  if (kind === 'ai_generated' && enabled) {
    if (!slot.generatedAt) problems.push('缺生成时间');
    if (!slot.rawFile && !slot.commit) problems.push('缺生成证据（原始件路径或提交号）');
    if (!slot.generator) problems.push('缺生成工具 —— 商用权取决于工具条款（如 Midjourney 免费版不可商用）');
  }
  if (kind === 'stock' && enabled) {
    if (!slot.sourceUrl) problems.push('缺来源链接');
    if (!slot.author) problems.push('缺作者');
    if (!slot.license) problems.push('缺许可证');
    else {
      if (ALLOWED_LICENSE.length && ALLOWED_LICENSE.indexOf(slot.license) < 0)
        problems.push('许可证不在白名单：' + slot.license);
      if (/NC|ND/.test(slot.license)) problems.push('含 NC（非商业）或 ND（禁止演绎）—— 商业产品不可用');
    }
  }
  if (kind === 'user_photo' && enabled) {
    if (!slot.author) problems.push('缺拍摄者/权利人');
  }
  return problems;
}

// ---------- 1. 清单与台账对齐 ----------
console.log('[1. 清单与台账对齐]');
if (!manifest) err('读不出 data/photo-assets.js（页面用的场景图清单）');
else if (!ledger || !ledger.slots) err('读不出 docs/photo-attribution.json 的 slots（出处台账）');
else {
  var keys = Object.keys(manifest);
  ok('场景图清单可读（' + keys.length + ' 个键：' + keys.join('/') + '）');
  var enabledKeys = keys.filter(function (k) { return !!manifest[k]; });
  var missing = enabledKeys.filter(function (k) { return !ledger.slots[k]; });
  if (!missing.length) ok('已启用的图在台账里都有条目（' + enabledKeys.join('/') + '）');
  else err('已启用却没进台账：' + missing.join('、') + ' —— 出处无从核对');
}

// ---------- 2. 逐张判定 ----------
console.log('[2. 逐张出处判定]');
if (manifest && ledger && ledger.slots) {
  Object.keys(ledger.slots).forEach(function (k) {
    var slot = ledger.slots[k];
    var file = manifest[k] || '';
    var p = judge(slot, file);
    var tag = KINDS[slot.kind] || slot.kind || '?';
    if (!p.length) ok(k + '（' + tag + '）出处成立' + (file ? '' : ' · 已停用'));
    else err(k + '（' + tag + '）：' + p.join('；'));
  });
}

// ---------- 3. 宗教实景不得进变现页 ----------
console.log('[3. 宗教实景不得进变现页]');
var rules = (ledger && ledger.usageRules) || [];
var hasRule = rules.some(function (r) { return r.rule && r.rule.indexOf('宗教实景') > -1; });
if (hasRule) ok('台账已登记规则：宗教实景不得用于商城/商品页（88 号文 第 2 条）');
else err('台账缺「宗教实景不得进变现页」规则 —— 藏香开卖后，寺院/经幡背景 + 商品同屏即踩第 2 条');

// 若商城页存在，机械检查它没引用宗教实景
var shopFiles = ['pages/shop/shop.wxml', 'pages/shop/shop.js'];
var shopExists = shopFiles.filter(exists);
if (!shopExists.length) ok('商城页尚未开工（pages/shop 不存在）—— 规则已登记，开工时自动生效');
else {
  var bad = [];
  shopExists.forEach(function (f) {
    var s = read(f);
    ['monastery', 'scene/monastery', 'bodhi'].forEach(function (w) { if (s.indexOf(w) > -1) bad.push(f + '：' + w); });
  });
  if (!bad.length) ok('商城页未引用宗教实景（' + shopExists.join('、') + '）');
  else err('商城页引用了宗教实景：' + bad.join('；') + ' —— 88 号文 第 2 条');
}

// ---------- 4. 反向自测（假红才是门禁的死因）----------
console.log('[4. 反向自测]');
var goodStock = {
  kind: 'stock', sourceUrl: 'https://example.com/p.jpg', author: 'Someone',
  license: 'CC-BY-4.0', enabled: true
};
var goodStockProblems = judge(goodStock, 'images/scene/home.jpg');
if (!goodStockProblems.length) ok('合规的第三方素材（CC-BY-4.0 + 来源 + 作者）不被误判');
else err('反向自测失效：合规素材被误判 —— ' + goodStockProblems.join('；'));

var goodDis = { kind: 'unknown', enabled: false, enabledNote: '已停用，回退到 🌳' };
if (!judge(goodDis, '').length) ok('「出处不明但已停用 + 写了回退说明」不算红（风险已隔离）');
else err('反向自测失效：已停用的不可证图仍被判红 —— 会逼着人去删文件而不是停用');

var badStock = { kind: 'stock', sourceUrl: 'x', author: 'y', license: 'CC-BY-NC-4.0', enabled: true };
if (judge(badStock, 'images/scene/home.jpg').length) ok('NC 许可证必落网（商业产品不可用于非商业授权）');
else err('守卫失效：NC 许可证没被拦下');

var badEnabledUnknown = { kind: 'unknown', enabled: true };
if (judge(badEnabledUnknown, 'images/scene/home.jpg').length) ok('「出处不明却仍在启用」必落网');
else err('守卫失效：出处不明的图仍在启用却没被拦下');

console.log('');
console.log('通过: ' + pass + ' | 失败: ' + fail);
process.exit(fail === 0 ? 0 : 1);
