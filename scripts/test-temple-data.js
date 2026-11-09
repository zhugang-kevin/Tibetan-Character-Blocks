/**
 * 寺庙数据完整性门禁（2026-10-24）
 *
 * 守的是这条规矩：**没有 source 的条目不得上线。**
 *
 * 分两级：
 *   ❌ 错误（阻断）：字段缺失、level 重复、name 重复、verified:true 但 source 为空
 *   ⚠️ 警告（不阻断）：verified:false（未核验）、img 为空（缺图片）
 *
 * 为什么要分两级：
 *   30 条数据现在全是"待核验"状态，如果直接报错会卡住整个 CI。
 *   但一旦有人把 verified 改成 true 却忘了填 source，必须立刻拦下 —— 那就是编造。
 */
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var B1 = require(path.join(ROOT, 'data/temples.js'));
var B2 = require(path.join(ROOT, 'data/temples-batch2.js'));
// 2026-10-25：合并两批一起查重 —— 重名必须跨批也拦得住
var list = (B1.list || []).concat(B2.list || []);

var errors = [];
var warns = [];          // 保留：只装「逐条说明」类待办
// 2026-11-05：待办改成**按条目归类的覆盖统计**。
//   之前每个缺字段都单独 push 一条，168 座刷出 400 条待办 —— 数字大到没人看，
//   真出问题时反而看不见。现在按「哪一类缺多少座」报，缺口一目了然。
var unverified = [];     // 未核验（source 待补）
var noImage = [];        // 无图片
var noTibetan = [];      // 缺藏文名
var noSect = [];         // 缺教派

if (!list.length) errors.push('数据为空');

var seenLevel = {};
var seenName = {};

list.forEach(function (t, i) {
  var tag = 'level ' + t.level + '（' + (t.name || '无名称') + '）';

  // 硬必填（名录里一定有）
  ['level', 'name', 'county', 'founded'].forEach(function (k) {
    if (t[k] === undefined || t[k] === null || t[k] === '') {
      errors.push(tag + ' 缺字段 ' + k);
    }
  });
  // 软必填（第二批从文保名录抄的，藏文名和教派名录里没有）—— 只进覆盖统计，不逐条刷屏
  if (!t.tibetan) noTibetan.push(t.name);
  if (!t.sect) noSect.push(t.name);

  // level 唯一
  if (seenLevel[t.level]) errors.push(tag + ' level 重复（另见 ' + seenLevel[t.level] + '）');
  else seenLevel[t.level] = t.name;

  // name 唯一 —— 用户明确要求「每关寺庙不能重复」
  if (seenName[t.name]) errors.push(tag + ' 寺庙名重复（另见 ' + seenName[t.name] + '）');
  else seenName[t.name] = t.name;

  // 核心规矩：verified 必须是布尔
  if (typeof t.verified !== 'boolean') {
    errors.push(tag + ' verified 必须是 true/false，不是 ' + typeof t.verified);
  }

  // 核心规矩：声明已核验就必须有来源和日期
  if (t.verified === true) {
    if (!t.source) errors.push(tag + ' verified:true 但 source 为空 —— 这是编造，不允许');
    if (!t.queriedAt) errors.push(tag + ' verified:true 但 queriedAt 为空');
  } else {
    unverified.push(t.name);
  }

  // 图片
  if (!t.img) noImage.push(t.name);
  else if (!t.imgCredit) errors.push(tag + ' 有图片但缺 imgCredit（版权署名）');
});

// ─── 输出 ─────────────────────────────────────
console.log('寺庙条目: ' + list.length + ' / 150');

if (errors.length) {
  console.log('');
  console.log('✗ 错误 ' + errors.length + ' 条：');
  errors.slice(0, 20).forEach(function (e) { console.log('  · ' + e); });
}
if (warns.length) {
  console.log('');
  console.log('⚠️ 逐条待办 ' + warns.length + ' 条（不阻断）');
  warns.slice(0, 10).forEach(function (w) { console.log('  · ' + w); });
}

// 覆盖统计：一眼看出「哪一类缺多少座」
var incomplete = list.filter(function (t) { return !t.verified || !t.img; }).length;
var pending = unverified.length + noImage.length + noTibetan.length + noSect.length;
console.log('');
console.log('📊 覆盖率（共 ' + list.length + ' 座）');
console.log('  · 已核验（有来源）: ' + (list.length - unverified.length) + ' 座');
console.log('  · 有图片: ' + (list.length - noImage.length) + ' 座');
console.log('  · 有藏文名: ' + (list.length - noTibetan.length) + ' 座');
console.log('  · 有教派: ' + (list.length - noSect.length) + ' 座');
console.log('  · 信息完整（已核验且有图）: ' + (list.length - incomplete) + ' 座');

console.log('');
console.log('硬校验通过: ' + (list.length - errors.length) + ' / ' + list.length +
            ' | 错误: ' + errors.length + ' | 待办: ' + pending);
process.exit(errors.length ? 1 : 0);
