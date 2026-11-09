/**
 * 西藏及涉藏地区寺庙名录（第一批 30 座）
 *
 * 🔴 重要说明（必读）：
 *   1. 本文件的 name / county / sect / founded 字段目前**全部来自模型知识**，
 *      尚未逐条核对官方来源 → `verified: false`
 *   2. **source 字段故意留空** —— 我不编造 URL。
 *      核验方式：按 `searchHint` 里的关键词，到以下站点查证后填入真实 URL 和 queriedAt
 *        · 中国佛教协会官网（chinabuddhism.com.cn）
 *        · 西藏自治区民族宗教事务委员会
 *        · 西藏自治区旅游发展厅
 *        · 各县/市政府门户网站
 *        · 维基百科（中文）+ Wikimedia Commons（图片许可）
 *   3. **没有 source 的条目不得上线** —— 由 scripts/test-temple-data.js 强制
 *   4. 图片字段 img 留空，等拿到 CC 协议或授权素材后填
 *
 * 为什么先做这张表：
 *   现有 data/reveals.js 只有 10 条「雪山/湖泊」风景，不是寺庙。
 *   用户要求「150 关对应 150 座不同寺庙」，这是产品最大的内容缺口。
 */

var TEMPLES = [
  // ─── 拉萨市 ───────────────────────────────
  { level: 1,  name: '大昭寺',         tibetan: 'ཇོ་ཁང་',        county: '拉萨市城关区', sect: '格鲁派',       founded: '647 年',  searchHint: '大昭寺 建寺年代 全国重点文物保护单位', verified: true, source: 'http://www.zhanang.gov.cn/zjlz/lzly/jzcs/201901/t20190125_15178.html', queriedAt: '2026-10-24', img: '/package-temples-1/001_大昭寺.webp', imgCredit: 'onwardtibet.org / CC BY-SA 2.0' },
  { level: 2,  name: '小昭寺',         tibetan: 'ར་མོ་ཆེ་',      county: '拉萨市城关区', sect: '格鲁派',       founded: '641 年',  searchHint: '小昭寺 文成公主 建寺', verified: true, source: 'http://www.zhanang.gov.cn/zjlz/lzly/jzcs/201901/t20190125_15178.html', queriedAt: '2026-10-24', img: '/package-temples-1/new_小昭寺.webp', imgCredit: 'Antoine Taveneaux / CC BY-SA 3.0' },
  { level: 3,  name: '色拉寺',         tibetan: 'སེ་ར་དགོན་',    county: '拉萨市城关区', sect: '格鲁派',       founded: '1419 年', searchHint: '色拉寺 绛钦却杰 建寺', verified: true, source: 'http://www.zhanang.gov.cn/zjlz/lzly/jzcs/201901/t20190125_15178.html', queriedAt: '2026-10-24', img: '/package-temples-2/003_色拉寺.webp', imgCredit: 'JL Cogburn / CC BY-SA 2.0' },
  { level: 4,  name: '哲蚌寺',         tibetan: 'འབྲས་སྤུངས་',   county: '拉萨市城关区', sect: '格鲁派',       founded: '1416 年', searchHint: '哲蚌寺 绛央却杰 建寺', verified: true, source: 'http://www.zhanang.gov.cn/zjlz/lzly/jzcs/201901/t20190125_15178.html', queriedAt: '2026-10-24', img: '/package-temples-1/004_哲蚌寺.webp', imgCredit: 'JL Cogburn / CC BY-SA 2.0' },
  { level: 5,  name: '甘丹寺',         tibetan: 'དགའ་ལྡན་',      county: '拉萨市达孜区', sect: '格鲁派',       founded: '1409 年', searchHint: '甘丹寺 宗喀巴 建寺', verified: true, source: 'http://www.zhanang.gov.cn/zjlz/lzly/jzcs/201901/t20190125_15178.html', queriedAt: '2026-10-24', img: '/package-temples-2/new_甘丹寺.webp', imgCredit: 'Jan Reurink / CC BY 2.0' },
  { level: 6,  name: '楚布寺',         tibetan: 'མཚུར་ཕུ་',      county: '拉萨市堆龙德庆区古荣乡那嘎村', sect: '噶玛噶举派', founded: '1187 年', searchHint: '楚布寺 噶玛巴 建寺', verified: true, source: 'https://wlj.lasa.gov.cn/lsslyfzj/tjxx/201909/3ad2d7b6c0514169a69321c67ab0ca24.shtml', queriedAt: '2026-10-25', img: '/package-temples-2/new_楚布寺.webp', imgCredit: 'John Hill / CC BY-SA 3.0' },
  { level: 7,  name: '热振寺',         tibetan: 'རྭ་སྒྲེང་',     county: '拉萨市林周县唐古乡唐古村', sect: '噶当派',       founded: '1056 年', searchHint: '热振寺 仲敦巴 建寺', verified: true, source: 'https://wlj.lasa.gov.cn/lsslyfzj/tjxx/201909/3ad2d7b6c0514169a69321c67ab0ca24.shtml', queriedAt: '2026-10-25', img: '/package-temples-1/new_热振寺.webp', imgCredit: 'Antoine Taveneaux / CC BY-SA 3.0' },
  { level: 8,  name: '直贡梯寺',       tibetan: 'འབྲི་གུང་',     county: '拉萨市墨竹工卡县门巴乡仁多岗村', sect: '直贡噶举派', founded: '1172 年', searchHint: '直贡梯寺 直贡噶举 建寺', verified: true, source: 'https://wlj.lasa.gov.cn/lsslyfzj/tjxx/201909/3ad2d7b6c0514169a69321c67ab0ca24.shtml', queriedAt: '2026-10-25', img: '/package-temples-2/008_直贡梯寺.webp', imgCredit: 'en:User:Alberrosidus / CC BY-SA 3.0' },
  { level: 9,  name: '乃琼寺',         tibetan: 'གནས་ཆུང་',      county: '拉萨市堆龙德庆区', sect: '格鲁派',   founded: '待核', searchHint: '乃琼寺 乃琼护法', verified: false, source: '', queriedAt: '', img: '', imgCredit: '' },
  { level: 10, name: '帕邦喀',         tibetan: 'ཕ་བོང་ཁ་',      county: '拉萨市城关区娘热乡吉索村', sect: '格鲁派',       founded: '唐代', searchHint: '帕邦喀 松赞干布 宫殿', verified: true, source: 'https://wlj.lasa.gov.cn/lsslyfzj/tjxx/201909/3ad2d7b6c0514169a69321c67ab0ca24.shtml', queriedAt: '2026-10-25', img: '/package-temples-1/new_帕邦喀.webp', imgCredit: 'John Hill / CC BY-SA 3.0' },

  // ─── 日喀则市 ─────────────────────────────
  { level: 11, name: '扎什伦布寺',     tibetan: 'བཀྲ་ཤིས་ལྷུན་པོ་', county: '日喀则市桑珠孜区', sect: '格鲁派', founded: '1447 年', searchHint: '扎什伦布寺 根敦珠巴 建寺', verified: true, source: 'http://www.zhanang.gov.cn/zjlz/lzly/jzcs/201901/t20190125_15178.html', queriedAt: '2026-10-24', img: '/package-temples-1/011_扎什伦布寺.webp', imgCredit: 'Hiroki Ogawa / CC BY 3.0' },
  { level: 12, name: '萨迦寺',         tibetan: 'ས་སྐྱ་',        county: '日喀则市萨迦县', sect: '萨迦派',     founded: '1073 年', searchHint: '萨迦寺 昆·贡却杰布 建寺', verified: true, source: 'http://www.zhanang.gov.cn/zjlz/lzly/jzcs/201901/t20190125_15178.html', queriedAt: '2026-10-24', img: '/package-temples-2/012_萨迦寺.webp', imgCredit: 'Luca Galuzzi (Lucag) / CC BY-SA 2.5' },
  { level: 13, name: '白居寺',         tibetan: 'དཔལ་ཁོར་ཆོས་དེ་', county: '日喀则市江孜县', sect: '萨迦/噶举/格鲁共处', founded: '1418 年', searchHint: '白居寺 江孜 十万佛塔', verified: true, source: 'http://www.zhanang.gov.cn/zjlz/lzly/jzcs/201901/t20190125_15178.html', queriedAt: '2026-10-24', img: '/package-temples-2/013_白居寺.webp', imgCredit: 'en:user:Alberrosidus / CC BY-SA 3.0' },
  { level: 14, name: '绒布寺',         tibetan: 'རོང་བུ་',      county: '日喀则市定日县扎西宗乡曲宗村', sect: '宁玛派',     founded: '1901 年', searchHint: '绒布寺 珠峰 世界最高寺院', verified: true, source: 'https://zh.m.wikisource.org/wiki/西藏自治区人民政府关于公布第七批自治区级文物保护单位的通知', queriedAt: '2026-10-25', img: '/package-temples-2/014_绒布寺.webp', imgCredit: 'Original uploader was Csearl at en.wikipedia / CC BY-SA 3.0' },
  { level: 15, name: '夏鲁寺',         tibetan: 'ཞ་ལུ་',         county: '日喀则市桑珠孜区', sect: '夏鲁派', founded: '1087 年', searchHint: '夏鲁寺 布顿 建寺', verified: true, source: 'http://www.zhanang.gov.cn/zjlz/lzly/jzcs/201901/t20190125_15178.html', queriedAt: '2026-10-24', img: '/package-temples-1/015_夏鲁寺.webp', imgCredit: 'Luca Galuzzi (Lucag) / CC BY-SA 2.5' },
  { level: 16, name: '俄尔寺',         tibetan: 'ངོར་',          county: '日喀则市桑珠孜区曲美乡', sect: '萨迦派',     founded: '明代', searchHint: '俄尔寺 萨迦 俄尔钦', verified: true, source: 'http://www.xizang.gov.cn/zwgk/xxgk_424/zxxxgk/201902/W020230605613079147222.pdf', queriedAt: '2026-10-25', img: '/package-temples-1/016_俄尔寺.webp', imgCredit: 'Tibetan, Central Tibet, Tsang (Ngor Monastery), Sakya order  / Public domain' },

  // ─── 山南市 ───────────────────────────────
  { level: 17, name: '桑耶寺',         tibetan: 'བསམ་ཡས་',       county: '山南市扎囊县', sect: '宁玛派',       founded: '779 年',  searchHint: '桑耶寺 赤松德赞 西藏第一座寺院', verified: true, source: 'http://www.zhanang.gov.cn/zjlz/lzly/jzcs/201901/t20190125_15178.html', queriedAt: '2026-10-24', img: '/package-temples-1/017_桑耶寺.webp', imgCredit: 'Gerd Eichmann / CC BY-SA 4.0' },
  { level: 18, name: '昌珠寺',         tibetan: 'ཁྲ་འབྲུག་',     county: '山南市乃东区', sect: '格鲁派',       founded: '7 世纪', searchHint: '昌珠寺 松赞干布 珍珠唐卡', verified: true, source: 'http://www.zhanang.gov.cn/zjlz/lzly/jzcs/201901/t20190125_15178.html', queriedAt: '2026-10-24', img: '/package-temples-1/018_昌珠寺.webp', imgCredit: 'Laika ac from UK / CC BY-SA 2.0' },
  { level: 19, name: '敏珠林寺',       tibetan: 'སྨིན་གྲོལ་གླིང་', county: '山南市扎囊县扎其乡敏竹林村', sect: '宁玛派',   founded: '10 世纪末', searchHint: '敏珠林寺 德达林巴 建寺', verified: true, source: 'https://www.xzxw.com/lyrw/2015-03/21/content_1159149.html', queriedAt: '2026-10-25', img: '/package-temples-1/019_敏珠林寺.webp', imgCredit: 'jt Guan / CC BY 3.0' },
  { level: 20, name: '多吉扎寺',       tibetan: 'རྡོ་རྗེ་བྲག་',  county: '山南市贡嘎县昌果乡昌果村', sect: '宁玛派',       founded: '1666 年', searchHint: '多吉扎寺 宁玛派 北传', verified: true, source: 'https://zh.m.wikisource.org/wiki/西藏自治区人民政府关于公布第七批自治区级文物保护单位的通知', queriedAt: '2026-10-25', img: '/package-temples-1/020_多吉扎寺.webp', imgCredit: 'Soap Boy 1 / CC BY-SA 4.0' },
  { level: 21, name: '扎塘寺',         tibetan: 'གྲ་ཐང་',       county: '山南市扎囊县', sect: '萨迦派',       founded: '1081 年', searchHint: '扎塘寺 壁画 建寺', verified: true, source: 'http://www.zhanang.gov.cn/zjlz/lzly/jzcs/201901/t20190125_15178.html', queriedAt: '2026-10-24', img: '/package-temples-2/new_扎塘寺.webp', imgCredit: 'himalayanart.org / Public domain' },

  // ─── 林芝市 / 昌都市 / 那曲市 ─────────────
  { level: 22, name: '强巴林寺',       tibetan: 'བྱམས་པ་གླིང་', county: '昌都市卡若区城关镇中路居委会', sect: '格鲁派',     founded: '1437 年始建、1444 年建成', searchHint: '强巴林寺 昌都 喜饶桑布', verified: true, source: 'https://www.changdu.gov.cn/cdrmzf/c100655/202005/07021629f1df4f8f9da0b49847d0c99e.shtml', queriedAt: '2026-10-25', img: '/package-temples-2/022_强巴林寺.webp', imgCredit: 'www.treasuryoflives.org / Public domain' },
  { level: 23, name: '类乌齐寺',       tibetan: 'རི་བོ་ཆེ་',     county: '昌都市类乌齐县', sect: '达隆噶举派', founded: '1276 年', searchHint: '类乌齐寺 达隆噶举 建寺', verified: false, source: '', queriedAt: '', img: '/package-temples-1/new_类乌齐寺.webp', imgCredit: 'Gruschke / CC BY-SA 3.0' },
  { level: 24, name: '孜珠寺',         tibetan: 'རྫི་ཁྲོ་',      county: '昌都市丁青县', sect: '苯教',         founded: '待核', searchHint: '孜珠寺 苯教 丁青', verified: false, source: '', queriedAt: '', img: '', imgCredit: '' },
  { level: 25, name: '孝登寺',         tibetan: 'ཞོལ་གདན་',     county: '那曲市色尼区那曲镇', sect: '格鲁派',       founded: '清代', searchHint: '孝登寺 那曲', verified: true, source: 'http://www.xizang.gov.cn/zwgk/xxgk_424/zxxxgk/201902/W020230605613079147222.pdf', queriedAt: '2026-10-25', img: '', imgCredit: '' },

  // ─── 阿里地区 ─────────────────────────────
  { level: 26, name: '托林寺',         tibetan: 'མཐོ་ལྡིང་',     county: '阿里地区札达县', sect: '噶当派/格鲁派', founded: '996 年', searchHint: '托林寺 益西沃 仁钦桑布', verified: true, source: 'http://www.zhanang.gov.cn/zjlz/lzly/jzcs/201901/t20190125_15178.html', queriedAt: '2026-10-24', img: '/package-temples-2/026_托林寺.webp', imgCredit: 'Dieter Schuh / CC BY-SA 3.0' },
  { level: 27, name: '科迦寺',         tibetan: 'ཁོ་ཅར་',        county: '阿里地区普兰县', sect: '萨迦派',     founded: '996 年', searchHint: '科迦寺 普兰 建寺', verified: true, source: 'http://www.zhanang.gov.cn/zjlz/lzly/jzcs/201901/t20190125_15178.html', queriedAt: '2026-10-24', img: '/package-temples-2/027_科迦寺.webp', imgCredit: 'Tajima, Shiichi, 1869-1924 / Public domain' },

  // ─── 青海 / 甘肃（涉藏地区，占位待扩容）───
  { level: 28, name: '塔尔寺',         tibetan: 'སྐུ་འབུམ་',     county: '青海省西宁市湟中区', sect: '格鲁派', founded: '1379 年', searchHint: '塔尔寺 宗喀巴 诞生地', verified: false, source: '', queriedAt: '', img: '/package-temples-1/new_塔尔寺.webp', imgCredit: 'Gombojab Tsybikov / Public domain' },
  { level: 29, name: '拉卜楞寺',       tibetan: 'བླ་བྲང་བཀྲ་ཤིས་འཁྱིལ་', county: '甘肃省甘南州夏河县', sect: '格鲁派', founded: '1709 年', searchHint: '拉卜楞寺 嘉木样 建寺', verified: false, source: '', queriedAt: '', img: '/package-temples-1/new_拉卜楞寺.webp', imgCredit: 'SFT HQ / CC BY 2.0' },
  { level: 30, name: '隆务寺',         tibetan: 'རོང་བོ་',      county: '青海省黄南州同仁市', sect: '格鲁派', founded: '待核', searchHint: '隆务寺 同仁 建寺', verified: false, source: '', queriedAt: '', img: '/package-temples-2/new_隆务寺.webp', imgCredit: 'gill_penney / CC BY 2.0' }
];

module.exports = {
  pendingVerification: true,
  note: '全部条目 verified 均为 false，source 为空。核验后逐条填 source + queriedAt + verified:true。',
  total: TEMPLES.length,
  list: TEMPLES
};
