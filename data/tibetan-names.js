// data/tibetan-names.js — 藏族名字（中文音译 **+ 藏文写法**）男 / 女 / 中性三池
//
// 为什么存在（2026-10-09 用户点名）：
//   后期要给用户一个藏族名字，而藏族名字**分男女**（扎西是男名、卓玛是女名），
//   所以系统必须先有能力区分性别。本文件 = 名字的单一事实源。
//
// 红线与取舍（与 docs/DECISIONS.md 对齐）：
//   · **人名不是「可消除元素」**。D25 的红线管的是「莲花 / 经幡 / 佛塔 / 酥油灯不得娱乐化消除」，
//     人名属文化内容（与文化卡、藏地密码同源），不进元素库、不参与任何消除判定。
//     部分名字的词义带佛教色彩（卓玛=度母、多吉=金刚），这是名字本身的真实含义，如实标注。
//   · 不承载金额 / 让利 / 等级字段（validate 会对 data 层做机械扫描）。
//   · **藏文只允许出现在 bo 字段**，且每条都必须写 boSrc（出处），
//     由 validate §45.4 / §45.12 机械守住 —— 防止再悄悄长出新的、无出处的藏文文本源。
//
// 结构：{ name: 中文音译, bo: 藏文写法, boSrc: 藏文出处, mean: 词义 }。
//   池内顺序固定，选名走**确定性算法**（见 utils/tibetan-name.js），
//   同一个人每次拿到的名字一致，不会每次刷新都变。
//
// 藏文出处（查询日期 2026-10-15，两条独立来源互为佐证）：
//   · Wikipedia《Tibetan name》常见名对照表（藏文 / Wylie / 中文 / 英文）
//     https://en.wikipedia.org/wiki/Tibetan_name
//   · ICT 优先政治犯名单衍生藏汉名对照（含 Jigme / Wangdu / Karma / Choedron 等）
//     https://tibetanlanguage.school/?p=7432
//   · 未见于上述两表的条目，bo 一律留空并在 §45.12 报出，不许凭音拼字。
//
// ⚠️⚠️ **池是 append-only，只能在末尾追加** —— 不得重排、不得改名、不得删名。
//   原因：选名是 seed 对**池长**取模，池一变长同一个 seed 就落到别的位置，老用户会被换名字。
//   双重保险：① 名字落库即钉死（utils/storage.js#setGender 只在性别真的变了才重取）；
//            ② validate §45.10 持有一份**冻结基线**（写在 validate.js 里，改本文件改不掉它），
//               逐池做前缀比对 —— 重排 / 改名 / 删名会立刻红。
//   要改池的正确姿势：末尾追加 → 同步更新 scripts/validate.js 的 NAME_BASELINE
//                → 回 docs/DECISIONS.md 补一条记录。有意制造摩擦，避免随手重排。
module.exports = {
  male: [
    { name: '扎西', bo: 'བཀྲ་ཤིས་', boSrc: 'Wikipedia:Tibetan_name（bkra shis / Tashi / 扎西）', mean: '吉祥' },
    { name: '顿珠', bo: 'དོན་གྲུབ་', boSrc: 'Wikipedia:Tibetan_name（don grub / Dhondup / 顿珠）', mean: '事成' },
    { name: '多吉', bo: 'རྡོ་རྗེ་', boSrc: 'Wikipedia:Tibetan_name（rdo rje / Dorji / 多吉）', mean: '金刚' },
    { name: '平措', bo: 'ཕུན་ཚོགས་', boSrc: 'ICT 名单（Phuntsok / 平措）', mean: '圆满' },
    { name: '旺堆', bo: 'དབང་འདུས་', boSrc: 'ICT 名单（Wangdu / 旺堆）', mean: '福聚' },
    { name: '晋美', bo: 'འཇིགས་མེད་', boSrc: 'ICT 名单（Jigme / 晋美）', mean: '无畏' }
  ],
  female: [
    { name: '卓玛', bo: 'སྒྲོལ་མ་', boSrc: 'Wikipedia:Tibetan_name（sgrol ma / Dolma / 卓玛）', mean: '度母' },
    { name: '央金', bo: 'དབྱངས་ཅན་', boSrc: 'ICT 名单（Yangchen / 央金）', mean: '妙音' },
    { name: '德吉', bo: 'བདེ་སྐྱིད་', boSrc: 'Wikipedia:Tibetan_name（bde skyid / Diki / 德吉）', mean: '幸福' },
    { name: '拉姆', bo: 'ལྷ་མོ་', boSrc: 'Wikipedia:Tibetan_name（lha mo / Lhamo / 拉姆）', mean: '仙女' },
    { name: '梅朵', bo: 'མེ་ཏོག་', boSrc: 'Wikipedia:Tibetan_name（me tog / Medo / 梅朵）', mean: '花朵' },
    { name: '曲珍', bo: 'ཆོས་སྒྲོན་', boSrc: 'ICT 名单（Choedron / 曲珍）', mean: '法灯' }
  ],
  // 「不愿透露」走这一池：男女通用的日月星辰与长寿之意
  neutral: [
    { name: '达瓦', bo: 'ཟླ་བ་', boSrc: 'Wikipedia:Tibetan_name（zla wa / Dawa / 达娃）', mean: '月亮' },
    { name: '次仁', bo: 'ཚེ་རིང་', boSrc: 'Wikipedia:Tibetan_name（tshe ring / Tsering / 才仁·次仁）', mean: '长寿' },
    { name: '嘎玛', bo: 'སྐར་མ་', boSrc: 'ICT 名单（Karma / 噶玛·嘎玛）', mean: '星辰' }
  ]
};
