/**
 * 寺庙中英名对照（2026-10-25）
 *
 * 用途：Commons 的分类名是英文/藏文转写，我们数据里是中文，
 *       中间必须有一张对照表才能把图对上。
 *
 * 覆盖原则：
 *   **只写我能确认的**。不确定的留空并标 note，不硬凑。
 *   已从 crawl 目录里实际观察到这些分类名存在（见 .workbuddy/tmp/commons-catalog.json）。
 *
 * 格式：'中文名': 'Commons 分类名（不含 Category: 前缀）'
 */

var MAP = {
  // ── 拉萨 ──
  '大昭寺': 'Jokhang',
  '小昭寺': 'Ramoche Temple',
  '色拉寺': 'Sera Monastery',
  '哲蚌寺': 'Drepung Monastery',
  '甘丹寺': 'Ganden Monastery',
  '楚布寺': 'Tsurphu Monastery',
  '热振寺': 'Reting monastery',
  '直贡梯寺': 'Drigung Monastery',
  '帕邦喀': 'Yerpa',
  '乃琼寺': 'Nechung Monastery',

  // ── 日喀则 ──
  '扎什伦布寺': 'Tashilhunpo Monastery',
  '萨迦寺': 'Sakya Monastery',
  '白居寺': 'Palcho Monastery',
  '绒布寺': 'Rongbuk Monastery',
  '夏鲁寺': 'Shalu Monastery',
  '俄尔寺': 'Ngor Monastery',

  // ── 山南 ──
  '桑耶寺': 'Samye',
  '昌珠寺': 'Tradruk Temple',
  '敏珠林寺': 'Mindroling',
  '多吉扎寺': 'Dorje Drak Monastery',
  '扎塘寺': 'Narthang',           // ⚠️ 待确认：Narthang 通常指纳塘寺
  '雍布拉康': 'Yumbulagang',

  // ── 昌都 / 那曲 / 阿里 ──
  '强巴林寺': 'Galden Jampaling Monastery',
  '类乌齐寺': 'Riwoche Monastery',
  '孜珠寺': 'Zizhu Monastery',    // ⚠️ 待确认
  '孝登寺': 'Xiaodeng Monastery', // ⚠️ 待确认
  '托林寺': 'Tholing Monastery',
  '科迦寺': 'Khachoe Monastery',  // ⚠️ 待确认

  // ── 青海 / 甘肃 ──
  '塔尔寺': 'Kumbum Monastery',
  '拉卜楞寺': 'Labrang Monastery',
  '隆务寺': 'Rongwo Monastery'
};

/**
 * 判断一个 Commons 分类名是不是「地区级」（不是某座具体寺庙）
 * 这些不能当寺庙条目用。
 */
function isRegionCategory(cat) {
  if (!cat) return true;
  var c = cat;
  // 明确的地区词
  if (/in\s+Tibet$/i.test(c)) return true;
  if (/in\s+.*Prefecture/i.test(c)) return true;
  if (/in\s+.*Province/i.test(c)) return true;
  if (/in\s+.*Autonomous/i.test(c)) return true;
  if (/in\s+.*prefecture-level/i.test(c)) return true;
  if (/in\s+.*City$/i.test(c)) return true;
  if (/^Monasteries\s+in\b/i.test(c)) return true;
  if (/^Tibetan\s+Buddhist\s+(monasteries|temples)\s+in\b/i.test(c)) return true;
  if (/^Buddhist\s+monasteries\s+in\b/i.test(c)) return true;
  // 主题级（不是具体寺）
  if (/^(Destroyed|Monastic libraries|History of)/i.test(c)) return true;
  return false;
}

/** 反查：英文分类名 → 中文寺名 */
function toChinese(commonsCat) {
  var hit = null;
  Object.keys(MAP).forEach(function (zh) {
    if (MAP[zh].toLowerCase() === String(commonsCat).toLowerCase()) hit = zh;
  });
  return hit;
}

module.exports = {
  map: MAP,
  isRegionCategory: isRegionCategory,
  toChinese: toChinese
};
