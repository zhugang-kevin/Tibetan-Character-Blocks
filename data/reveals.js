// data/reveals.js — 「通关揭图」十关秘境图（D31）
//
// 每关棋盘下方垫一张秘境图（2026-10-08 起为 AI 写实画作，经 prepare-assets.py --reveals
// 加工为 640×640 WebP（≤33KB/张）；早期的程序绘制版（make_reveals.py）保留可复现）：
//   · 消除越多透出越多（牌面盖在图上，格子清空即露出一格）
//   · 通关整幅揭晓，结算页揭晓 + 护照「揭示图鉴」收藏
//
// 红线（不可突破）：
//   · 本文件只是「图 + 名 + 释义」，不承载金额 / 让利 / 结算字段（validate 会机械扫描）
//   · 揭图状态**不新增存储字段**：解锁与否 = completedLevels 是否含该关（避免第二真相源）
//   · 回避宗教符号（D25 已拍板 2026-10-06）：吉祥八宝只取另外 7 个，按传统顺序排列，
//     前三关补自然/生活题（雪山 / 青稞 / 牦牛），它们已在元素库中出现，无新增宗教符号
module.exports = [
  {
    level: 1, key: 'snow_mountain', name: '雪山',
    tibetan: 'གངས་རི་', roman: 'gangs ri',
    img: '/images/reveal_01.webp',
    desc: '终年不化的雪峰，是高原的坐标，也是许多神山的名字来源。'
  },
  {
    level: 2, key: 'barley', name: '青稞',
    tibetan: 'ནས་', roman: 'nas',
    img: '/images/reveal_02.webp',
    desc: '高原的主粮，炒熟磨粉就是糌粑，是藏地最日常的味道。'
  },
  {
    level: 3, key: 'yak', name: '牦牛',
    tibetan: 'གཡག་', roman: 'g.yag',
    img: '/images/reveal_03.webp',
    desc: '被称为「高原之舟」，驮运、毛皮、酥油都来自它。'
  },
  {
    level: 4, key: 'parasol', name: '宝伞',
    tibetan: 'གདུགས་', roman: 'gdugs',
    img: '/images/reveal_04.webp',
    desc: '吉祥八宝之一，伞盖张开，象征遮蔽苦难、护佑众生。'
  },
  {
    level: 5, key: 'golden_fish', name: '金鱼',
    tibetan: 'གསེར་ཉ་', roman: 'gser nya',
    img: '/images/reveal_05.webp',
    desc: '吉祥八宝之一，成对游动，象征自在与丰足。'
  },
  {
    level: 6, key: 'vase', name: '宝瓶',
    tibetan: 'བུམ་པ་', roman: 'bum pa',
    img: '/images/reveal_06.webp',
    desc: '吉祥八宝之一，瓶腹圆满，象征福慧具足、取用不尽。'
  },
  {
    level: 7, key: 'conch', name: '海螺',
    tibetan: 'དུང་དཀར་', roman: 'dung dkar',
    img: '/images/reveal_07.webp',
    desc: '吉祥八宝之一，右旋白螺，象征名声远播。'
  },
  {
    level: 8, key: 'endless_knot', name: '吉祥结',
    tibetan: 'དཔལ་བེའུ་', roman: 'dpal be\'u',
    img: '/images/reveal_08.webp',
    desc: '吉祥八宝之一，线条无始无终，象征绵长与和合。'
  },
  {
    level: 9, key: 'banner', name: '胜利幢',
    tibetan: 'རྒྱལ་མཚན་', roman: 'rgyal mtshan',
    img: '/images/reveal_09.webp',
    desc: '吉祥八宝之一，幢顶层层收拢，象征战胜障碍。'
  },
  {
    level: 10, key: 'wheel', name: '法轮',
    tibetan: 'ཆོས་ཀྱི་འཁོར་ལོ་', roman: 'chos kyi \'khor lo',
    img: '/images/reveal_10.webp',
    desc: '吉祥八宝之一，八根辐条与轮毂的结构，象征真理运转不息。'
  }
];
