// scripts/incense-pricing.js — 藏香定价/毛利计算器（D129）
//
// ## 为什么做成脚本而不是让我"到时候帮你算"
//   定价的三个输入（含税出厂价 / MOQ / 是否一件代发）**只有厂家能给**，我不替你编。
//   与其每次口头算一遍，不如把算式固化成脚本：你拿到报价，一条命令出结果，
//   而且算式是公开的、可复查的 —— 不会出现"我算错了你还看不出来"。
//
// ## 用法
//   正算（给目标毛利率 → 出建议零售价）：
//     node scripts/incense-pricing.js --cost=8.5 --moq=300 --freight=280 --pack=1.2 --margin=0.55
//   反算（给零售价 → 出实际毛利率）：
//     node scripts/incense-pricing.js --cost=8.5 --moq=300 --freight=280 --pack=1.2 --price=29.9
//
//   参数（元）：
//     --cost     含税出厂价（元/盒）          必填
//     --moq      起订量（盒）                  必填
//     --freight  运费总额（元，整批）          默认 0
//     --pack     包装/贴标（元/盒）            默认 0
//     --ship     一件代发费（元/单，0 = 不自发货）默认 0
//     --margin   目标毛利率（0-1）             默认 0.5
//     --price    给定零售价（元/盒）           给了这个就反算毛利率
//     --fee1     平台技术服务费率              默认 0.01（微信小店新商家前 100 万口径，**以后台为准**）
//     --fee2     支付费率                      默认 0.006
//
// ## 口径说明（不粉饰）
//   · 平台费率是两个**默认假设**，会变；以你微信小店后台显示为准。
//   · 送检、拍摄、详情页设计等一次性投入**未计入**单盒成本（属开办费，摊薄方式由你定）。
//   · 退货/损耗未计入 —— 建议按 3%-8% 自己另留安全垫。

var args = {};
process.argv.slice(2).forEach(function (a) {
  var m = /^--([a-z0-9]+)=(.*)$/.exec(a);
  if (m) args[m[1]] = m[2];
});

function num(k, d) {
  var v = parseFloat(args[k]);
  return isNaN(v) ? d : v;
}
function yuan(n) { return '¥' + n.toFixed(2); }

var cost = num('cost', NaN);
var moq = num('moq', NaN);
if (isNaN(cost) || isNaN(moq)) {
  console.log('藏香定价/毛利计算器（D129）');
  console.log('');
  console.log('必填两个参数（**只有厂家能给**，我不替你编）：');
  console.log('  --cost   含税出厂价（元/盒）');
  console.log('  --moq    起订量（盒）');
  console.log('');
  console.log('例：node scripts/incense-pricing.js --cost=8.5 --moq=300 --freight=280 --pack=1.2 --margin=0.55');
  console.log('    node scripts/incense-pricing.js --cost=8.5 --moq=300 --freight=280 --pack=1.2 --price=29.9');
  console.log('');
  console.log('⚠️ 平台费率默认 1% + 0.6%（微信小店新商家口径），**以你后台显示为准**；');
  console.log('   送检/拍摄/详情页等开办费未计入单盒成本，退货损耗请另留 3%-8% 安全垫。');
  process.exit(1);
}

var freight = num('freight', 0);
var pack = num('pack', 0);
var ship = num('ship', 0);
var fee1 = num('fee1', 0.01);
var fee2 = num('fee2', 0.006);
var margin = num('margin', 0.5);
var givenPrice = num('price', NaN);

// 单盒完全成本 = 出厂价 + 包装 + 摊薄运费 + 代发费
var unitCost = cost + pack + (moq > 0 ? freight / moq : 0) + ship;
// 首批总投入
var totalIn = unitCost * moq;

console.log('藏香定价/毛利计算器（D129 · 算式公开可复查）');
console.log('');
console.log('【输入】');
console.log('  含税出厂价        ' + yuan(cost) + '/盒');
console.log('  包装/贴标         ' + yuan(pack) + '/盒');
console.log('  运费（整批）      ' + yuan(freight) + '  → 摊薄 ' + yuan(moq > 0 ? freight / moq : 0) + '/盒');
console.log('  一件代发          ' + (ship > 0 ? yuan(ship) + '/单' : '无（自发货）'));
console.log('  起订量 MOQ        ' + moq + ' 盒');
console.log('  平台费率          ' + (fee1 * 100).toFixed(2) + '% + ' + (fee2 * 100).toFixed(2) + '%（默认假设，以后台为准）');
console.log('');
console.log('【单盒成本拆解】');
console.log('  出厂价            ' + yuan(cost));
console.log('  包装/贴标         ' + yuan(pack));
console.log('  运费摊薄          ' + yuan(moq > 0 ? freight / moq : 0));
console.log('  代发费            ' + yuan(ship));
console.log('  ─────────────────────────');
console.log('  单盒完全成本      ' + yuan(unitCost));
console.log('  首批总投入        ' + yuan(totalIn) + '（' + moq + ' 盒）');
console.log('');

var rate = fee1 + fee2;

function profitAt(price) {
  var platform = price * rate;
  var gross = price - unitCost - platform;
  return { price: price, platform: platform, gross: gross, m: price > 0 ? gross / price : 0 };
}

if (!isNaN(givenPrice)) {
  var r = profitAt(givenPrice);
  console.log('【反算：零售价 ' + yuan(givenPrice) + '】');
  console.log('  平台扣费          ' + yuan(r.platform));
  console.log('  单盒毛利          ' + yuan(r.gross));
  console.log('  毛利率            ' + (r.m * 100).toFixed(1) + '%');
  console.log('  售完全部 ' + moq + ' 盒 → 毛利 ' + yuan(r.gross * moq) + '（未扣开办费与退货）');
  console.log('');
  if (r.m < 0.3) console.log('  ⚠️ 毛利率 < 30%：机制线锚点 10-30 元/盒，这个价位很薄，建议上调售价或压进货价。');
  else if (r.m > 0.75) console.log('  ⚠️ 毛利率 > 75%：偏高，在这个价格带可能被比价打穿，确认你的差异化撑不撑得住。');
  else console.log('  ✓ 毛利率落在 30%-75% 的常规区间。');
} else {
  // 目标毛利率 m = (price - unitCost - price*rate) / price
  // → price*(1 - rate - m) = unitCost → price = unitCost / (1 - rate - m)
  var denom = 1 - rate - margin;
  if (denom <= 0) {
    console.log('✗ 算不出来：目标毛利率 ' + (margin * 100).toFixed(0) + '% + 平台费率 '
      + (rate * 100).toFixed(2) + '% ≥ 100%，数学上无解 —— 要么降目标，要么降进货成本。');
    process.exit(1);
  }
  var price = unitCost / denom;
  var r = profitAt(price);
  console.log('【正算：目标毛利率 ' + (margin * 100).toFixed(0) + '%】');
  console.log('  建议零售价        ' + yuan(price) + '（整到好价点：' + yuan(Math.ceil(price) - 0.1) + ' 或 ' + yuan(Math.ceil(price)) + '）');
  console.log('  其中平台扣费      ' + yuan(r.platform));
  console.log('  单盒毛利          ' + yuan(r.gross));
  console.log('  实际毛利率        ' + (r.m * 100).toFixed(1) + '%');
  console.log('  售完全部 ' + moq + ' 盒 → 毛利 ' + yuan(r.gross * moq));
  console.log('');
  console.log('  ⚠️ 对照市场锚点：机制香普遍 10-30 元/盒，手工 30-200 元/盒。');
  if (price > 30) console.log('     → 你的建议价 ' + yuan(price) + ' 高于机制线锚点，需要"非遗/手工/帮扶"叙事才撑得住（而机制线不能挂非遗手工）。');
  if (price < 10) console.log('     → 你的建议价 ' + yuan(price) + ' 低于机制线锚点下限，走量可以，但注意别打成价格战。');
}

console.log('');
console.log('不算在内的（如实）：送检费 / 拍摄与详情页 / 退货损耗（建议另留 3%-8%）/ 开办费。');
