// scripts/test-religion-compliance.js — 宗教商业化红线门禁（D121–D127 · 藏香变现）
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
// ## D127 新增 §9「路线口径一致性」+ §11「文档与路线一致」
//   §9 守"路线只有一个真相"：route.final 必须等于 selling.producerType，
//     历史末条必须落在最终路线上，最新决策必须登记进 DECISIONS.md。
//   §11 守"文档不许教违规写法" —— 实测抓到三个真缺陷：
//     · docs/incense-sourcing-checklist.md §8 的"可直接用"示例文案写的还是
//       「藏香 · 非遗制作技艺」+ Ⅷ-141，而路线早已是工厂机制香 →
//       门禁守住了 data/incense.js，却守不住**文档**，而文档更会被照抄。
//     · 同一文档 §9 标题写「5 件事」，实际有 6 条。
//     · docs/incense-monetization.md §3「四层官方背书」整张表是手工/尼木线的，
//       机制线照抄即违规。
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

console.log('宗教商业化红线门禁（D121–D127 · 国宗发〔2017〕88 号）');

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
      ['brand', inc.brand], ['workshop', inc.workshop],
      ['factory', inc.factory], ['route', inc.route]].forEach(function (n) {
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
    chk('route', inc.route && inc.route.source);
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
// 机制线的路线禁用语扫描器：§11 用它扫**文档里的示例文案**（§7 用的同一批禁用词，一把尺子量两处）
function routeHits(text, craftType) {
  var h = [];
  if (craftType === 'machine') {
    HAND_WORDS.forEach(function (w) { if (text.indexOf(w) > -1) h.push(w); });
    ['非遗', 'Ⅷ-141', '地理标志'].forEach(function (w) { if (text.indexOf(w) > -1) h.push(w); });
  }
  return h;
}
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

  // 「找有资质的厂家」必须能落到**可逐条问出口的条目**，否则只是一句空话
  var vr = (inc.selling && inc.selling.vendorRequirements) || [];
  if (pt !== 'factory') ok('非工厂路线，跳过厂家验收口径检查');
  else if (vr.length >= 6) ok('厂家准入验收项已登记 ' + vr.length + ' 条（照着问，答得上来就能合作）');
  else err('缺厂家准入验收项：selling.vendorRequirements 至少 6 条 —— '
    + '「找有资质的厂家」必须可问可核');

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

// ---------- 9. 路线口径一致性 ----------
// D127：四次转向后发现一类真缺陷 —— **换了路线，文档和注释没跟着换**（曾出现
//   「本仓库货源改为民间家庭作坊」的文案残留在已经是工厂路线的事实源里）。
//   这一节把「路线只有一个真相」钉死：改了一处忘了另一处，门禁直接红。
console.log('[9. 路线口径一致性]');
if (!inc) {
  err('路线口径无法校验：data/incense.js 读不出来');
} else {
  var rf = inc.route && inc.route.final;
  var pt2 = inc.selling && inc.selling.producerType;
  // ① 决策记录与实际货源字段必须一致（两处真相，一个都不许单独改）
  if (rf && rf === pt2) ok('路线口径一致：route.final = ' + rf + ' = selling.producerType');
  else err('路线口径不一致：route.final=' + (rf || '未填写')
    + ' 但 selling.producerType=' + (pt2 || '未填写') + ' —— 换路线必须两处一起改');
  // ② 转向历史的最后一条必须落在最终路线上
  var hist = (inc.route && inc.route.history) || [];
  var last = hist[hist.length - 1];
  if (last && last.route === rf) ok('转向历史最后一条与最终路线一致（' + (last.d || '?') + ' → ' + last.route + '）');
  else err('转向历史最后一条（' + (last ? last.route : '空')
    + '）与最终路线（' + (rf || '未填写') + '）不一致 —— 历史留痕要能读得懂');
  // ③ 最新一条决策必须落进 DECISIONS.md（不许只在代码里改、文档不写）
  var dec = strip(read('docs/DECISIONS.md'));
  var lastD = last && last.d;
  if (lastD && dec.indexOf('**' + lastD + '**') > -1)
    ok('最新决策 ' + lastD + ' 已登记进 docs/DECISIONS.md');
  else err('最新决策 ' + (lastD || '?') + ' 未登记进 docs/DECISIONS.md —— 文档是唯一事实源，不许只在代码里改');
}

// ---------- 10. 方案留档 ----------
console.log('[10. 方案留档]');
if (exists('docs/incense-monetization.md')) ok('藏香变现方案已留档（docs/incense-monetization.md）');
else err('缺 docs/incense-monetization.md —— 卖点/价格锚点/合规边界必须可查');
if (exists('docs/incense-sourcing-checklist.md')) ok('采购与上架清单已留档（docs/incense-sourcing-checklist.md）');
else err('缺 docs/incense-sourcing-checklist.md —— 有渠道之后，结构/资质/类目/命名必须可查');
// D126：我曾把「包装标识 / 检测 / 发票」三件事说成硬要求，却没给出**手工香如何满足它们**的路径，
//   导致用户理解为「要求所有产品都有认证」。这份文档就是补上那段路 —— 留档不许再丢。
if (exists('docs/incense-handmade-compliance.md')) ok('手工香合规路径已留档（docs/incense-handmade-compliance.md：四步 + 成本 + 供方优先级）');
else err('缺 docs/incense-handmade-compliance.md —— 「手工香怎么合规」必须可查，否则会被误读成「要求认证」');
// D127：路线最终定为「有资质的厂家」→ 厂家准入验收表必须留档，让"找厂家"变成可执行的六问
if (exists('docs/incense-factory-vendor-checklist.md')) ok('厂家准入验收表已留档（docs/incense-factory-vendor-checklist.md）');
else err('缺 docs/incense-factory-vendor-checklist.md —— 「找有资质的厂家」必须落成可逐条核对的验收表');

// ---------- 11. 文档与路线一致（防"只改一半"）----------
// D127 教训的延伸：门禁守住了 data/incense.js，却守不住**文档**。
//   实测缺陷（本轮抓到并修掉的真缺陷）：
//     · docs/incense-sourcing-checklist.md §8 的"可直接用"示例文案，写的还是
//       「藏香 · 非遗制作技艺」+ Ⅷ-141 —— 而路线早已是工厂机制香 →
//       **文档在教人写违规文案**，而且写法比数据文件更"权威"（用户会照抄）。
//     · §9 标题写「需要你拍板的 5 件事」，实际有 6 条（D127 加了"工厂七问"）。
//     · docs/incense-monetization.md §3 的"四层官方背书"表整张是手工/尼木线的，
//       机制线照抄就违规。
//   这一节把「文档必须与路线同口径」也变成机械判定。
console.log('[11. 文档与路线一致（防"只改一半"）]');
var CK = 'docs/incense-sourcing-checklist.md';
var MON = 'docs/incense-monetization.md';
var ck = read(CK);
if (!ck) {
  err('读不到 ' + CK + ' —— 文档与路线一致性无法校验');
} else {
  // ① §9 标题声明的条数必须等于实际条目数（加删条目忘改标题 = 文档自相矛盾）
  var m9 = ck.match(/## 9\.\s*需要你拍板的\s*(\d+)\s*件事([\s\S]*?)\n---/);
  if (!m9) {
    err(CK + ' §9 标题格式变了（门禁 §11① 依赖「## 9. 需要你拍板的 N 件事」这一格式，改了请同步改门禁）');
  } else {
    var declared = parseInt(m9[1], 10);
    var actual = (m9[2].match(/^\d+\.\s/gm) || []).length;
    if (declared === actual) ok('§9 标题声明「' + declared + ' 件事」与实际条目数一致');
    else err('§9 标题写「' + declared + ' 件事」，实际有 ' + actual + ' 条 —— 加删条目必须同步改标题');
  }
  // ② 默认示例文案（§8.1）必须与当前路线同口径
  var m81 = ck.match(/### 8\.1[\s\S]*?(?=### 8\.2)/);
  if (!m81) {
    err('§8.1 默认示例文案不见了（门禁 §11② 依赖「### 8.1 … ### 8.2」小标题结构）');
  } else {
    var fence = m81[0].match(/```([\s\S]*?)```/);
    if (!fence) {
      err('§8.1 里找不到代码块示例文案（示例必须以 ``` 围栏写出，门禁才能提取）');
    } else {
      var sample = fence[1];
      var ctDoc = inc && inc.selling && inc.selling.craftType;
      var bad = routeHits(sample, ctDoc);
      if (bad.length) {
        err('§8.1 默认示例文案含当前路线（' + (CRAFT_TYPES[ctDoc] || ctDoc || '?') + '）的禁用语：'
          + bad.join('、') + ' —— 文档在教违规写法（比数据文件更危险，用户会照抄）');
      } else {
        ok('§8.1 默认示例文案与当前路线（' + (CRAFT_TYPES[ctDoc] || ctDoc || '?') + '）同口径，未含非遗/手工类宣称');
      }
      if (sample.indexOf('GB/T 43430-2023') > -1) {
        ok('§8.1 示例文案写出了 GB/T 43430-2023（机制线的定性依据）');
      } else {
        err('§8.1 示例文案没写 GB/T 43430-2023 —— 商品页缺标准号就丢了"家居香品"的定性依据');
      }
    }
  }
  // ③ §8.2 的非遗句式必须带前置条件闸门，否则会被当成"随便能用"的模板
  var m82 = ck.match(/### 8\.2[\s\S]*?(?=\n---)/);
  if (!m82) {
    err('§8.2 非遗句式小节不见了（门禁 §11③ 依赖该小标题）');
  } else if (m82[0].indexOf('factoryIchQualified') > -1) {
    ok('§8.2 非遗句式带前置条件闸门（引用 factoryIchQualified，与门禁 §7 同源）');
  } else {
    err('§8.2 非遗句式没有前置条件闸门 —— 会被当成"随便能用"的模板，机制线照抄即虚假宣传');
  }
  // ④ 反向自测：带闸门的非遗变体（§8.2）里合法出现"非遗"字样，**不应**被 §11② 的扫描波及。
  //    反过来说：§8.2 必须能被扫描器命中 —— 这才证明 §11② 的"只扫 §8.1"是**刻意限定作用域**，
  //    而不是漏扫（假红才是门禁的死因，而漏扫会让门禁变成装饰）。
  var f82 = m82 && m82[0].match(/```([\s\S]*?)```/);
  var ctRev = inc && inc.selling && inc.selling.craftType;
  if (f82 && routeHits(f82[1], ctRev).length) {
    ok('反向自测：§8.2 非遗变体确实会被扫描器命中 —— 证明 §11② 是按闸门限定作用域，不是漏扫');
  } else {
    err('反向自测失效：§8.2 非遗变体没被扫描器命中（样本没了或扫描器坏了）'
      + ' —— 无法证明 §11② 的作用域是有意限定的');
  }
}
// ④ 市场文档的背书表必须按路线分列（否则机制线照抄手工线的非遗/手工背书）
var mon = read(MON);
if (!mon) {
  err('读不到 ' + MON);
} else {
  if (mon.indexOf('机制线（当前路线）') > -1) {
    ok('市场文档 §3 背书表已按路线分列（含「机制线（当前路线）」判定列）');
  } else {
    err(MON + ' §3 背书表没有机制线判定列 —— 机制线会照抄手工线的非遗/手工背书');
  }
  if (mon.indexOf('仅供手工') > -1) {
    ok('市场文档的文案示例已显式限定为手工/尼木线（机制线指向清单 §8.1）');
  } else {
    err(MON + ' 的文案示例没标注适用路线 —— 会被机制线照抄（「牛角手工挤香」是手工叙事）');
  }
}

console.log('');
console.log('通过: ' + pass + ' | 失败: ' + fail);
process.exit(fail === 0 ? 0 : 1);
