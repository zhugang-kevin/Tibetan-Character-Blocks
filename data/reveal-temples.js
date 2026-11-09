/**
 * 关卡通关揭图 · 接入寺庙图鉴（2026-11-05）
 *
 * 原来的 data/reveals.js 只有 10 张（雪山/青稞/牦牛等自然题材），
 * 150 关里后 140 关没有揭图。
 *
 * 本模块把寺庙数据接进来：
 *   · 第 1–150 关 → 依次对应「可展示」的寺庙（有图 + 有署名）
 *   · 不够 150 张时**循环复用**，并在 revealId 上标注复用了第几张
 *   · 一张都没有时返回 null（保持老行为，game.js 会走 `reveal.img = ''` 分支）
 *
 * 🔴 分包限制（重要）：
 *   寺庙图在 package-temples-1/2/3，**分包没加载前访问不到**。
 *   所以在 game.js 侧调用前，要先 `wx.loadSubpackage()`（见 loadTemplePackages）。
 *   本模块只负责「给数据」，不负责「加载分包」。
 */

var TEMPLES = require('./temples.js');
var TEMPLES2 = require('./temples-batch2.js');
var EXTRA5 = require('./temples-extra5.js');

/**
 * 🔴 2026-11-05 决定（用户选 A）：只用「可信」的 50 条。
 *
 * 之前的 image-only 第三批（67 条）全部退出揭图池 —— 那批是从 Commons 分类树
 * 抓来的，混进了照片标题（"Interior of Shalu Monastery"）、人名
 * （"Sakya Lotsawa Jampai Dorje"）、佛塔名，**不是可靠的寺院条目**。
 *
 * 现在的口径：verified === true（政府文保名录 + 有图 + 有署名）
 *             + 补录 4 座（拉卜楞/塔尔/隆务/类乌齐，大寺，有 CC 图）
 * 150 关循环复用这 50 座，宁可变重复，也不给用户看错的名字。
 *
 * 第三批数据已移到 assets-src/temple-data/，不在包内，也不在这里 require。
 */
function all() {
  return [].concat(
    TEMPLES.list || [],
    TEMPLES2.list || [],
    EXTRA5.list || []
  );
}

/**
 * 可展示的（揭图池）：只有两类能进
 *
 *   ① `verified === true`      政府文保名录核过 + 有图 + 有署名（46 条）
 *   ② `atlas === true` 的补录   大寺，有 CC 图，虽无西藏名录覆盖（4 条）
 *
 * 其余一律不进 —— 包括 `atlas: false`（雍布拉康是宫殿不是寺院）、
 * 以及所有没有显式 atlas 标记的 image-only 条目。
 *
 * 🔴 照片标题过滤保留作第二道防线：
 *   爬虫曾把 Commons 的文件页收成条目（'Interior of Shalu Monastery' 等），
 *   即使将来重新引入 image-only 数据，这些也不会显示在通关揭图上。
 */
var PHOTO_TITLE = /^(Interior|Exterior|Detail|Details|View|Views|History|Images|Old|Statue|Painting|Thangka|Portrait|Pilgrims|Monks|Debating|Prayer|\d+(st|nd|rd|th)\b|The\s|Sand\s|Prayer\s)/i;

function isPhotoTitle(name) {
  if (!name) return true;              // 没名字也排除
  if (PHOTO_TITLE.test(name)) return true;
  if (/\b(hall|stupa|tomb|interior|mandala|terrace|display)\b/i.test(name)) return true;
  return false;
}

function trusted(t) {
  if (!t.img || !t.imgCredit) return false;
  if (t.atlas === false) return false;
  if (t.verified === true) return true;
  return t.sourceLevel === 'image-only' && t.atlas === true;
}

function displayable() {
  return all().filter(function (t) {
    if (!trusted(t)) return false;
    var n = t.name || t.nameEn || '';
    return !isPhotoTitle(n);
  });
}

function _cache() {
  if (!_cache.list) {
    _cache.list = displayable();
    // 按 level 升序，保证顺序稳定（同一关每次都是同一座寺）
    _cache.list.sort(function (a, b) { return (a.level || 0) - (b.level || 0); });
  }
  return _cache.list;
}

/**
 * 取第 N 关的揭图
 * @param {number} level 1–150
 * @returns {object|null} { img, name, tibetan, sub, desc, sourceLevel, reused }
 */
function revealFor(level) {
  var list = _cache();
  if (!list.length) return null;
  var i = (level - 1) % list.length;
  var t = list[i];
  var reused = level - 1 >= list.length;

  // sub：只显示确定的信息，不编造
  var subParts = [];
  if (t.county) subParts.push(t.county);
  if (t.sect) subParts.push(t.sect);
  if (t.founded) subParts.push(t.founded);

  return {
    img: t.img,
    name: t.name || t.nameEn || '',
    tibetan: t.tibetan || '',
    sub: subParts.join(' · '),
    desc: t.sourceLevel === 'image-only'
      ? '（本条目仅有图片收录，文献信息待补）'
      : subParts.join(' · '),
    // CC BY / CC BY-SA 要求署名 —— 结果页必须显示这一行
    credit: t.imgCredit || '',
    // 🔴 界面按这个字段决定显示密度：verified 显示年代/地址，image-only 不显示
    sourceLevel: t.sourceLevel || (t.verified ? 'verified' : 'unknown'),
    reused: reused,
    templeLevel: t.level
  };
}

/** 池大小（揭图图鉴总数 = 50），给结果页显示 X / N */
function poolSize() {
  return _cache().length;
}

/** 统计，给门禁/调试用 */
function stats() {
  var a = all();
  var d = displayable();
  return {
    total: a.length,
    displayable: d.length,
    verified: a.filter(function (t) { return t.verified === true; }).length,
    imageOnly: a.filter(function (t) { return t.sourceLevel === 'image-only'; }).length,
    withTibetan: a.filter(function (t) { return !!t.tibetan; }).length,
    coveredLevels: Math.min(d.length, 150),
    willReuse: d.length < 150
  };
}

module.exports = {
  revealFor: revealFor,
  displayable: displayable,
  poolSize: poolSize,
  stats: stats
};
