// scripts/test-religion-compliance.js — 宗教商业化红线门禁（D119 · 藏香变现）
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
//   一律不可用。第 6 条「场所内可以经销」是**给寺庙的许可，不是给商家的**。
//
// ## 那卖点换成什么（见 docs/incense-monetization.md）
//   国家级非物质文化遗产（2008）+ 国家地理标志保护产品（2014）+ 藏文同源（吞弥·桑布扎）
//   + 189 户手工制香户的消费帮扶叙事。这四层公开可查、官方授予，比写不进文案的
//   「某寺出品」硬得多。

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

console.log('宗教商业化红线门禁（D119 · 国宗发〔2017〕88 号）');

// 1. 宗教商业化禁词（16 个）
console.log('[1. 禁词扫描]');
var BANNED = ['开光', '加持', '高僧', '活佛', '功德', '消灾', '辟邪', '头香',
  '供佛', '礼佛', '佛前', '寺出品', '寺院监制', '寺庙监制', '寺院出品', '寺庙出品'];
var FILES = ['data/goods.js', 'utils/payment.js', 'pages/gift/gift.wxml',
  'pages/benefits/benefits.js', 'data/merchants.js'];
var hits = [];
FILES.forEach(function (f) {
  var src = strip(read(f));
  BANNED.forEach(function (w) { if (src.indexOf(w) > -1) hits.push(f + ':' + w); });
});
if (!hits.length) ok('变现与商家文案无宗教商业化禁词（' + BANNED.length + ' 词 × ' + FILES.length + ' 文件）');
else err('出现宗教商业化禁词（第 2 条 明令禁止）：' + hits.join('、'));

// 2. 宗教主体背书句式（比单词表更严：抓「XX寺 + 出品/监制/秘制/古方」结构）
console.log('[2. 宗教主体背书句式]');
var joined = FILES.map(function (f) { return strip(read(f)); }).join('\n');
var m = joined.match(/[\u4e00-\u9fa5]{1,8}寺[^。；\n]{0,6}(出品|监制|制作|秘制|古方|配方)/g) || [];
if (!m.length) ok('没有「某寺出品 / 寺院监制」这类宗教主体背书句式');
else err('出现宗教主体背书句式：' + m.join('、') + ' —— 属于「以佛教道教名义进行商业宣传」');

// 3. 反例自测：把「某某寺出品」塞回去，上面两条必须都翻红
console.log('[3. 反例自测]');
var fake = '本品为色拉寺出品，高僧加持';
var fakeHit = BANNED.filter(function (w) { return fake.indexOf(w) > -1; });
if (fakeHit.length) ok('守卫自测：「色拉寺出品 / 高僧加持」必落网（命中 ' + fakeHit.join('、') + '）');
else err('反例自测失效：宗教禁词没被拦下');
if (/[\u4e00-\u9fa5]{1,8}寺[^。；\n]{0,6}(出品|监制|制作|秘制|古方|配方)/.test(fake))
  ok('守卫自测：「某寺 + 出品」句式结构必落网');
else err('反例自测失效：宗教背书句式没被拦下');

// 4. 藏香卖点必须落在「非遗 / 地理标志 / 藏文同源」上，且要有出处可查
console.log('[4. 卖点留档]');
if (exists('docs/incense-monetization.md')) ok('藏香变现方案已留档（docs/incense-monetization.md）');
else err('缺 docs/incense-monetization.md —— 卖点/价格锚点/合规边界必须可查，不许只在对话里说过');

console.log('');
console.log('通过: ' + pass + ' | 失败: ' + fail);
process.exit(fail === 0 ? 0 : 1);
