// scripts/test-religion-compliance.js — 宗教商业化红线门禁（D121/D122/D123/D124/D125 · 藏香变现）
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
//     · 第 7 条 场所**兴办的经济实体**应独立核算、照章纳税 —— 这是「向寺院办的藏香厂采购」
//       属于正当商事行为的依据（买断/代销 ✅，代场所销售并分成 ❌）
//   我们是**商业主体 + 非宗教主体设立的互联网平台** → 「寺庙出品 / 寺院监制 / 开光加持」
//   一律不可用。第 6 条「场所内可以经销」是**给宗教活动场所的许可，不是给商家的**。
//
// ## D125 新增 §7「制程宣称真实性」
//   用户（2026-10-16）最终改定：**工厂藏香（机制），不考虑作坊、不考虑手工**。
//   前两轮防的是「宗教背书串台」，这一轮防的是「**工艺叙事串台**」：
//   **非遗保护的是传统制作技艺** —— 机制量产货挂「国家级非遗 / 手工 / 古法手作」
//   = 引人误解的商业宣传（《反不正当竞争法》第 8 条 / 《广告法》第 4、28 条）。
//   ⚠️ GB/T 43430-2023 本身适用于机制香，**写标准号没问题，写「手工」才有问题**。
//   想拿回非遗叙事只有两条正路（见 data/incense.js 的 factory.howToGetIchBack）：
//   a) 选确为项目保护单位 / 生产性保护示范基地的厂，并把 factoryIchQualified 置 true；
//   b) 单独做一条手工线，与机制线分开上架、分开写文案。
//
// ## D124 新增 §6「货源与背书匹配」
//   用户（2026-10-16）把货源从「寺院体系」改成「**民间家庭作坊**」。
//   换货源**不是**让合规变严（其实变松了：完全脱离宗教主体），真正的风险是**背书串台** ——
//   货已经不是那家的了，文案还在写「Ⅷ-141」「尼木藏香地理标志」：那是虚假宣传，
//   而且恰好把第 2 条「以佛教道教名义进行商业宣传」重新请回来。
//   所以每条背书都标了 `scope`（general / mindrolling_only / gi_only），
//   §6 机械校验「货源类型 × 实际引用的背书」是否匹配。
//
// ## D123 新增 §5「销售主体与命名」
//   用户（2026-10-16）说「藏香我们自己有渠道 / 用自己的名字帮寺庙出售藏香」。
//   「**帮寺庙出售**」必须落成「**向藏香厂采购后以我方名义销售**」—— 差别不在措辞，
//   在**合同主体**与**钱的方向**。§5 把差别做成判据：模式只能是买断/代销、
//   合同相对方必须是工商注册的经营实体、品牌名不得冠以佛教道教名称、
//   产品必须写得出 GB/T 43430-2023（ICS 13.120 家用品安全）—— 这是定性证据，
//   没写标准号就会被按「佛教道教衍生商品」口径定性（第 5 条）。
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
// data/incense.js 里 compliance.mustNot / selling.mustNotSay / brand.rule 都是**禁词清单本体**，
//   扫描前必须先摘掉，否则「把禁词写进清单」会被判成「用了禁词」
//   （与 §59.10 / §64 同一族的误报；假红比假绿更伤门禁的可信度）。
function stripCompliance(s) {
  ['compliance: {', 'selling: {', 'brand: {'].forEach(function (key) {
    var i = s.indexOf(key);
    if (i < 0) return;
    var j = s.indexOf('\n  }', i);
    if (j >= 0) s = s.slice(0, i) + s.slice(j);
  });
  return s;
}

console.log('宗教商业化红线门禁（D121/D122/D123/D124/D125 · 国宗发〔2017〕88 号）');

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
      ['compliance', inc.compliance],
      ['standards', inc.standards], ['selling', inc.selling],
      ['brand', inc.brand], ['workshop', inc.workshop], ['factory', inc.factory]].forEach(function (n) {
      if (!(n[1] && n[1].source)) noSrc.push(n[0]);
    });
    ['honors', 'lineages', 'producers'].forEach(function (k) {
      (inc[k] || []).forEach(function (h, i) { if (!h.source) noSrc.push(k + '[' + i + ']'); });
    });
    if (!noSrc.length) ok('藏香事实源逐块写出处（origin/craft/people/compliance/standards/selling/brand + honors/lineages/producers）');
    else err('藏香事实源缺出处：' + noSrc.join('、') + ' —— 不许无出处的藏香文案');

    // 出处必须是可查的：带查询日期
    var weak = [];
    function chk(label, s) { if (!/查询日期/.test(s || '')) weak.push(label); }
    chk('origin', inc.origin && inc.origin.source);
    chk('craft', inc.craft && inc.craft.source);
    chk('people', inc.people && inc.people.source);
    chk('standards', inc.standards && inc.standards.source);
    chk('selling', inc.selling && inc.selling.source);
    chk('brand', inc.brand && inc.brand.source);
    chk('workshop', inc.workshop && inc.workshop.source);
    chk('factory', inc.factory && inc.factory.source);
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

// ---------- 5. 销售主体与命名 ----------
// D123（2026-10-16）：用户说「我们自己有渠道 / 用自己的名字帮寺庙出售藏香」。
//   渠道不用愁是好事；但「**帮寺庙出售**」这五个字必须落成「**向藏香厂采购后以我方名义销售**」——
//   差别不在措辞，在**合同主体**与**钱的方向**。这一节就是把差别做成判据。
console.log('[5. 销售主体与命名]');
var ALLOWED_MODELS = { buy_resell: '买断后自销', consignment: '代销（按结算价付货款）' };
// 第 2 条「严禁…公司企业冠以佛教、道教名称」
var NAME_BAN = ['寺', '庙', '佛', '僧', '菩萨', '活佛', '加持', '开光', '功德',
  '香火', '法门', '般若', '菩提', '舍利', '经幡', '转经'];
if (!inc) {
  err('销售主体与命名无法校验：data/incense.js 读不出来');
} else {
  var sl = inc.selling || {};
  // ① 钱的方向：只能买断自销 / 代销；分成、捐赠、替场所抽佣一律不可
  if (ALLOWED_MODELS[sl.model])
    ok('销售模式合规：' + ALLOWED_MODELS[sl.model] + '（资金只有一条：我们 → 供方货款）');
  else err('销售模式违规：' + (sl.model || '未填写')
    + ' —— 只能是 buy_resell（买断自销）或 consignment（代销）；'
    + '分成 / 捐赠 / 替场所抽佣 分别踩 88 号文第 1、2、5 条');
  // ② 合同相对方必须是工商注册的经营实体，不是宗教活动场所本身
  if (/企业|公司|香厂|经营实体/.test(sl.contractWith || ''))
    ok('合同相对方是工商注册的经营实体（不是宗教活动场所本身）');
  else err('合同相对方写的是「' + (sl.contractWith || '未填写')
    + '」—— 必须是工商注册的经营实体；'
    + '（第 7 条：场所兴办的经济实体独立核算、照章纳税 → 向它采购是正当商事行为）');
  // ③ 品牌 / 店铺 / 公司名不得冠以佛教、道教名称
  var bname = (inc.brand && inc.brand.name) || '';
  var bad = NAME_BAN.filter(function (w) { return bname.indexOf(w) > -1; });
  if (bname && !bad.length)
    ok('品牌/店铺名「' + bname + '」不含宗教词（第 2 条：企业不得冠以佛教、道教名称）');
  else err('品牌/店铺名违规：' + (bname || '未填写')
    + (bad.length ? '（含 ' + bad.join('、') + '）' : ''));
  // ④ 产品按国标定位：写得出标准号，才不会被按「宗教用品」定性
  if (/GB\/T 43430-2023/.test((inc.standards && inc.standards.national) || ''))
    ok('产品按 GB/T 43430-2023《藏香》国家标准进销（ICS 13.120 家用品安全）—— 这是定性证据');
  else err('缺所执行的国家标准号 —— 没有标准号，产品就会被按「佛教道教衍生商品」口径定性');
}

// ---------- 6. 货源与背书匹配 ----------
// D124（2026-10-16）：货源从「寺院体系」换成「民间家庭作坊」。
//   换货源的真正风险不是合规变严（其实是变松了），而是**背书串台**：
//   文案还在用「Ⅷ-141 敏珠林寺藏香制作技艺」「尼木藏香地理标志」，
//   但货已经不是那家的了 —— 那是虚假宣传，而且恰好把 88 号文第 2 条重新请回来。
console.log('[6. 货源与背书匹配]');
var PRODUCER_TYPES = {
  monastery_factory: '寺院体系藏香厂',
  household_workshop: '民间家庭作坊',
  factory: '规模化工厂（机制量产）',
  company: '香业公司'
};
if (!inc) {
  err('货源与背书匹配无法校验：data/incense.js 读不出来');
} else {
  var pt = (inc.selling && inc.selling.producerType) || '';
  if (PRODUCER_TYPES[pt]) ok('货源类型已登记：' + PRODUCER_TYPES[pt] + '（' + pt + '）');
  else err('货源类型未登记或不合法：' + (pt || '未填写')
    + ' —— 只能是 monastery_factory / household_workshop / factory / company');

  var byId = {};
  (inc.honors || []).forEach(function (h) { if (h.id) byId[h.id] = h; });
  var backed = (inc.selling && inc.selling.backedHonors) || [];
  var ghost = backed.filter(function (id) { return !byId[id]; });
  if (!backed.length) err('backedHonors 为空 —— 必须写明本货源实际引用了哪几条背书');
  else if (!ghost.length) ok('引用的背书都能在 honors 里查到：' + backed.join('、'));
  else err('引用了不存在的背书：' + ghost.join('、'));

  // 🔴 核心：背书 scope 必须与货源匹配
  //   general           → 任何货源可引用
  //   mindrolling_only  → 仅寺院体系藏香厂（monastery_factory）可引用
  //   gi_only           → 谁都不能引用（我们是经销商，专用标志的合法使用人是经核准的**生产者**）
  var wrong = backed.filter(function (id) {
    var h = byId[id];
    if (!h) return false;
    var sc = h.scope || '';
    if (sc === 'gi_only') return true;
    if (sc === 'mindrolling_only') return pt !== 'monastery_factory';
    return false;
  });
  if (!wrong.length) ok('背书与货源匹配（general 通用 / 寺院体系专属仅限该类货源 / 地理标志谁都不用）');
  else err('背书串台：' + pt + ' 引用了 '
    + wrong.map(function (id) { return byId[id].name + '（' + byId[id].scope + '）'; }).join('、')
    + ' —— 货不是那家的（或我们不是经核准的生产者），写它就是虚假宣传');

  // 作坊路线的专项留档（本轮已改走工厂，保留判据以便将来回退）
  if (pt === 'household_workshop') {
    var w = inc.workshop || {};
    var ok5 = (w.mustHave || []).length >= 5 && (w.cannotClaim || []).length > 0;
    if (ok5) ok('家庭作坊的三个硬坑已留档（执照/标识/检测/发票 + 不能宣称项 ' + (w.cannotClaim || []).length + ' 条）');
    else err('家庭作坊路线缺留档：workshop.mustHave 至少 5 条、cannotClaim 非空 —— 三无产品与发票会卡死上架');
  } else {
    ok('非作坊路线，跳过作坊专项（工厂路线由 §7 校验）');
  }
}

// ---------- 7. 制程宣称真实性（D125：工厂机制香不得挂「非遗 / 手工」）----------
//   前两轮防的是「宗教背书串台」；这一轮防的是「工艺叙事串台」。
//   非遗保护的是**传统制作技艺**；机制量产货挂「国家级非遗 / 手工 / 古法手作」=
//   引人误解的商业宣传（《反不正当竞争法》第 8 条 / 《广告法》第 4、28 条）。
console.log('[7. 制程宣称真实性]');
var CRAFT_TYPES = { machine: '机制量产', handmade: '手工制作', mixed: '部分工序手工' };
var HAND_WORDS = ['手工', '手作', '纯手工', '古法手工', '匠人手工', '古法手作'];
if (!inc) {
  err('制程宣称无法校验：data/incense.js 读不出来');
} else {
  var ct = (inc.selling && inc.selling.craftType) || '';
  if (CRAFT_TYPES[ct]) ok('制程类型已登记：' + CRAFT_TYPES[ct] + '（' + ct + '）');
  else err('制程类型未登记或不合法：' + (ct || '未填写') + ' —— 只能是 machine / handmade / mixed');

  var claims = (inc.selling && inc.selling.copyClaims) || [];
  var fake = [];
  claims.forEach(function (c) {
    HAND_WORDS.forEach(function (w) { if (c.indexOf(w) > -1) fake.push(c + '：' + w); });
  });
  if (ct === 'handmade' || ct === 'mixed') {
    ok('手工/混合制程，允许工艺类宣称（共 ' + claims.length + ' 条，已逐条过扫描）');
  } else if (!fake.length) {
    ok('机制香未宣称手工 / 古法（' + claims.length + ' 条商品宣称逐条扫过）');
  } else {
    err('机制香宣称了手工工艺：' + fake.join('；')
      + ' —— 非遗保护的是传统制作技艺，机制量产货写「手工」属引人误解的商业宣传');
  }

  // 想写「非遗」必须同时满足：工厂确有非遗资质 + 制程不是纯机制
  var bk = (inc.selling && inc.selling.backedHonors) || [];
  var qIch = inc.selling && inc.selling.factoryIchQualified === true;
  var useIch = bk.indexOf('ich2008') > -1;
  if (!useIch) ok('未引用非遗技艺类背书（机制香的默认正确姿势：只写国家标准号）');
  else if (qIch && (ct === 'handmade' || ct === 'mixed'))
    ok('引用非遗技艺类背书已通过校验（工厂确有资质 + 制程非纯机制）');
  else err('机制香引用了 ich2008（非遗制作技艺）—— 需同时满足 factoryIchQualified=true '
    + '且 craftType 为 handmade/mixed；否则就是拿技艺叙事给量产货背书');

  // 工厂路线的取舍必须留档（优势 + 风险 + 不能宣称 + 怎么把非遗拿回来）
  var f = inc.factory || {};
  if ((inc.selling && inc.selling.producerType) !== 'factory') {
    ok('非工厂路线，跳过工厂专项留档检查');
  } else if ((f.pros || []).length >= 3 && (f.risks || []).length >= 3
    && (f.mustHave || []).length >= 5 && (f.cannotClaim || []).length > 0 && f.howToGetIchBack) {
    ok('工厂路线取舍已留档（优势 ' + f.pros.length + ' / 风险 ' + f.risks.length
      + ' / 必备 ' + f.mustHave.length + ' / 不能宣称 ' + f.cannotClaim.length + ' / 含"怎么把非遗拿回来"）');
  } else {
    err('工厂路线缺留档：factory 需含 pros≥3 / risks≥3 / mustHave≥5 / cannotClaim≥1 / howToGetIchBack');
  }
}

// ---------- 8. 反例自测 ----------
console.log('[8. 反例自测]');
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
// 反向自测：合规的销售表述**不得**被误判（否则没人敢写「采购自…」，只好绕回模糊措辞）
var legal = '本店向敏珠林寺藏香厂采购后销售，产品执行 GB/T 43430-2023《藏香》国家标准。';
var legalHit = BANNED.filter(function (w) { return legal.indexOf(w) > -1; });
if (!legalHit.length && !BACKING.test(legal))
  ok('守卫自测：合规销售表述不被误判（「向…藏香厂采购后销售」必须写得出来）');
else err('反例自测失效：合规表述被误判（命中 ' + (legalHit.join('、') || BACKING.exec(legal)) + '）');
// 反向自测（D125）：机制香的合规宣称必须写得出来 —— 只写标准号 + 客观产地，不碰工艺叙事
var mech = ['执行 GB/T 43430-2023《藏香》国家标准', '产自西藏'];
var mechHit = [];
mech.forEach(function (c) {
  HAND_WORDS.forEach(function (w) { if (c.indexOf(w) > -1) mechHit.push(w); });
});
if (!mechHit.length) ok('守卫自测：机制香的合规宣称不被误判（标准号 + 客观产地必须写得出来）');
else err('反例自测失效：合规的机制香表述被误判（命中 ' + mechHit.join('、') + '）');

// ---------- 9. 方案留档 ----------
console.log('[9. 方案留档]');
if (exists('docs/incense-monetization.md')) ok('藏香变现方案已留档（docs/incense-monetization.md）');
else err('缺 docs/incense-monetization.md —— 卖点/价格锚点/合规边界必须可查');
if (exists('docs/incense-sourcing-checklist.md')) ok('采购与上架清单已留档（docs/incense-sourcing-checklist.md）');
else err('缺 docs/incense-sourcing-checklist.md —— 有渠道之后，结构/资质/类目/命名必须可查');
// D126：我曾把「包装标识 / 检测 / 发票」三件事说成硬要求，却没给出**手工香如何满足它们**的路径，
//   导致用户理解为「要求所有产品都有认证」。这份文档就是补上那段路 —— 留档不许再丢。
if (exists('docs/incense-handmade-compliance.md')) ok('手工香合规路径已留档（docs/incense-handmade-compliance.md：四步 + 成本 + 供方优先级）');
else err('缺 docs/incense-handmade-compliance.md —— 「手工香怎么合规」必须可查，否则会被误读成「要求认证」');

console.log('');
console.log('通过: ' + pass + ' | 失败: ' + fail);
process.exit(fail === 0 ? 0 : 1);
