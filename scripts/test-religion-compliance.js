// scripts/test-religion-compliance.js — 宗教商业化红线门禁（D121/D122 · 藏香变现）
//
// ## 为什么单独成一个脚本，而不是塞进 scripts/validate.js
//   validate.js 是多人并发改动的共享门禁文件；本门禁是**变现专用**的一条线，
//   做成独立脚本：① 不与并发改动互相覆盖；② 可以单独跑、单独接流水线。
//
// ## 它守的是什么（依据，不是拍脑袋）
//   国家宗教局等 **12 部门**《关于进一步治理佛教道教商业化问题的若干意见》
//   **国宗发〔2017〕88 号**（2017-11-03，中国政府网 gov.cn / 国家宗教事务局 sara.gov.cn 可查）：
//     · 第 2 条 **「禁止以佛教道教名义进行商业宣传」**；严禁公司企业冠以佛教、道教名称
//     · 第 5 条 **非宗教活动场所/团体/院校和个人设立的互联网宗教信息平台**
//        不得售卖佛教道教衍生商品、不得接受宗教性捐赠
//     · 第 1 条 严禁商业资本介入；不得承包经营场所、不得以分红提成等方式获取收益
//   我们是**商业主体 + 非宗教主体设立的互联网平台** → 「寺庙出品 / 寺院监制 / 开光加持」
//   一律不可用。第 6 条「场所内可以经销」是**给宗教活动场所的许可，不是给商家的**。
//
// ## 那卖点换成什么（见 docs/incense-monetization.md）
//   走「非遗」通道，不走「宗教」通道：
//     国家级非遗 2008（藏香制作技艺）+ 2021 第五批 Ⅷ-141（敏珠林寺藏香制作技艺，
//     **保护单位是西藏扎囊县文化局，政府文化部门**）+ 国家地理标志 2014（尼木藏香）
//     + 传承谱系 + 帮扶当地制香群众。文案主语是「非遗项目」，寺名只作产地与源流的
//     客观陈述。这四层公开可查、官方授予，比写不进文案的「某寺出品」硬得多。

var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');

var pass = 0, fail = 0;
function ok(m) { pass++; console.log('  \u2713 ' + m); }
function err(m) { fail++; console.log('  \u2717 ' + m); }

function read(p) {
  try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (e) { return ''; }
}
function exists(p) { return fs.existsSync(path.join(ROOT, p)); }
// 判据必须先剥注释：解释「为什么禁这些词」的说明文字自己会把自己判红
function strip(s) { return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''); }
// data/incense.js 里 compliance.mustNot 是**禁词清单本体**，扫描前必须先摘掉，
//   否则「把禁词写进清单」会被判成「用了禁词」（与 §59.10 / §64 同一族的误报）。
function stripCompliance(s) {
  var i = s.indexOf('compliance: {');
  if (i < 0) return s;
  var j = s.indexOf('\n  }', i);
  return j < 0 ? s : s.slice(0, i) + s.slice(j);
}

console.log('宗教商业化红线门禁（D121/D122 · 国宗发〔2017〕88 号）');

// ---------- 1. 宗教商业化禁词 ----------
console.log('[1. 禁词扫描（16 词 x 6 文件）]');
var BANNED = ['开光', '加持', '高僧', '活佛', '功德', '消灾', '辟邪', '头香',
  '供佛', '礼佛', '佛前', '寺出品', '寺院监制', '寺庙监制', '寺院出品', '寺庙出品'];
var FILES = ['data/goods.js', 'utils/payment.js', 'pages/gift/gift.wxml',
  'pages/benefits/benefits.js', 'data/merchants.js', 'data/incense.js'];
var hits = [];
FILES.forEach(function (f) {
  var src = strip(stripCompliance(read(f)));
  BANNED.forEach(function (w) { if (src.indexOf(w) > -1) hits.push(f + ':' + w); });
});
if (!hits.length) ok('变现、商家与藏香文案无宗教商业化禁词');
else err('出现宗教商业化禁词（第 2 条 明令禁止）：' + hits.join('、'));

// ---------- 2. 宗教主体背书句式 ----------
// ⚠️ 结构正则只收**营销背书**词（出品/监制/秘制/独家/授权/特供/专供），
//    不含「制作 / 古方 / 配方」—— 否则会误伤官方非遗项目名
//    「藏香制作技艺（敏珠林寺藏香制作技艺）」（寺 + 藏香制作）。误伤官方名录名是假红。
console.log('[2. 宗教主体背书句式]');
var joined = FILES.map(function (f) { return strip(stripCompliance(read(f))); }).join('\n');
var BACKING = /([\u4e00-\u9fa5]{1,8}寺)[^。；\n]{0,6}(出品|监制|秘制|独家|授权|特供|专供)/g;
var m = joined.match(BACKING) || [];
if (!m.length) ok('没有「某寺出品 / 寺院监制」这类宗教主体背书句式');
else err('出现宗教主体背书句式：' + m.join('、') + ' —— 属于「以佛教道教名义进行商业宣传」');

// ---------- 3. 功效宣称（藏香不能当药卖）----------
console.log('[3. 功效宣称]');
var EFFICACY = ['治病', '治疗', '疗效', '安神', '助眠', '净化空气', '提高免疫力',
  '免疫力', '驱除污浊', '醒脑', '通经', '预防'];
var eff = [];
EFFICACY.forEach(function (w) { if (joined.indexOf(w) > -1) eff.push(w); });
if (!eff.length) ok('藏香文案无功效宣称（不当药卖，不给自己找《广告法》的麻烦）');
else err('出现功效宣称：' + eff.join('、') + ' —— 非药品不得宣称疗效');

// ---------- 4. 藏香事实源：出处必填 ----------
console.log('[4. 藏香事实源出处]');
if (exists('data/incense.js')) {
  var inc = null;
  try { inc = require(path.join(ROOT, 'data', 'incense.js')); } catch (e) { inc = null; }
  if (!inc) {
    err('data/incense.js 读不出来 —— 藏香事实源必须可 require');
  } else {
    var noSrc = [];
    [['origin', inc.origin], ['craft', inc.craft], ['people', inc.people],
      ['compliance', inc.compliance]].forEach(function (n) {
      if (!(n[1] && n[1].source)) noSrc.push(n[0]);
    });
    ['honors', 'lineages', 'producers'].forEach(function (k) {
      (inc[k] || []).forEach(function (h, i) { if (!h.source) noSrc.push(k + '[' + i + ']'); });
    });
    if (!noSrc.length) ok('藏香事实源逐块写出处（origin/craft/people/compliance + honors/lineages/producers）');
    else err('藏香事实源缺出处：' + noSrc.join('、') + ' —— 不许无出处的藏香文案');

    // 出处必须是可查的：带查询日期
    var weak = [];
    function chk(label, s) { if (!/查询日期/.test(s || '')) weak.push(label); }
    chk('origin', inc.origin && inc.origin.source);
    chk('craft', inc.craft && inc.craft.source);
    chk('people', inc.people && inc.people.source);
    ['honors', 'lineages', 'producers'].forEach(function (k) {
      (inc[k] || []).forEach(function (h, i) { chk(k + '[' + i + ']', h.source); });
    });
    if (!weak.length) ok('每条出处都带查询日期（不是「常见说法」这类无从核对的口头背书）');
    else err('出处缺查询日期：' + weak.join('、'));

    // 合规通道的支点：走非遗，主体是政府文化部门
    var h141 = (inc.honors || []).filter(function (h) { return h.code === 'Ⅷ-141'; })[0];
    if (h141 && /文化局|文物局/.test(h141.keeper || ''))
      ok('非遗通道成立：Ⅷ-141 保护单位是政府文化部门（不是宗教团体）—— 这是合规支点');
    else err('Ⅷ-141 保护单位不是政府文化部门 —— 非遗通道支点没了，卖点会滑回宗教背书');
  }
} else {
  err('缺 data/incense.js —— 藏香事实源必须先有，文案才不是编的');
}

// ---------- 5. 反例自测 ----------
console.log('[5. 反例自测]');
var fake = '本品为色拉寺出品，高僧加持，可安神助眠';
var fakeHit = BANNED.filter(function (w) { return fake.indexOf(w) > -1; });
if (fakeHit.length) ok('守卫自测：「色拉寺出品 / 高僧加持」必落网（命中 ' + fakeHit.join('、') + '）');
else err('反例自测失效：宗教禁词没被拦下');
if (BACKING.test(fake)) ok('守卫自测：「某寺 + 出品」句式结构必落网');
else err('反例自测失效：宗教背书句式没被拦下');
// 反向自测：官方非遗项目名**不得**被误判（假红比假绿更伤门禁的可信度）
var official = '藏香制作技艺（敏珠林寺藏香制作技艺）· 国家级非物质文化遗产 VIII-141';
if (!BACKING.test(official)) ok('守卫自测：官方非遗项目名不被误判（假红才是门禁的死因）');
else err('反例自测失效：官方非遗项目名「敏珠林寺藏香制作技艺」被误判成宗教背书');

// ---------- 6. 方案留档 ----------
console.log('[6. 方案留档]');
if (exists('docs/incense-monetization.md')) ok('藏香变现方案已留档（docs/incense-monetization.md）');
else err('缺 docs/incense-monetization.md —— 卖点/价格锚点/合规边界必须可查');

console.log('');
console.log('通过: ' + pass + ' | 失败: ' + fail);
process.exit(fail === 0 ? 0 : 1);
