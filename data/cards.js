// data/cards.js — 34 张文化卡（30 辅音字母 + 4 文化图标）
// 30 辅音扩充（2026-10-07 用户拍板）：letter_09..letter_30 为本轮新增，
// 文案口径与 letter_01..08 一致：subtitle = 拉丁转写 · 中文读音提示（含送气/浊音标注），
// description 一句话、funFact 一条趣味知识；藏文相关表述均为公开的语言学常识，无宗教题材。
module.exports = [
  {
    id: 'letter_01',
    type: 'letter',
    tibetan: 'ཀ',
    title: 'ཀ',
    subtitle: 'ka · 嘎（不送气）',
    description: '藏文第一个辅音字母，发音时声带不振动，不送气。',
    funFact: '藏文字母由吞弥·桑布扎于公元7世纪创制，共有30个辅音字母。'
  },
  {
    id: 'letter_02',
    type: 'letter',
    tibetan: 'ཁ',
    title: 'ཁ',
    subtitle: 'kha · 卡（送气）',
    description: '藏文第二个辅音字母，发音时送气，与「ཀ」形成送气与不送气的对立。',
    funFact: '藏文中送气与不送气的区别会改变词义，这一点和汉语拼音类似。'
  },
  {
    id: 'letter_03',
    type: 'letter',
    tibetan: 'ག',
    title: 'ག',
    subtitle: 'ga · 嘎（浊音）',
    description: '藏文第三个辅音字母，发音时声带振动，是浊音。',
    funFact: '藏文中有清音、浊音、送气音三套对立，比汉语普通话更复杂。'
  },
  {
    id: 'letter_04',
    type: 'letter',
    tibetan: 'ང',
    title: 'ང',
    subtitle: 'nga · 昂（鼻音）',
    description: '藏文第四个辅音字母，是一个鼻音，和汉语「昂」的声母相近。',
    funFact: '「ང」可以出现在音节末尾，很多词都以它收尾，带着低沉的鼻音余韵。'
  },
  {
    id: 'letter_05',
    type: 'letter',
    tibetan: 'ཅ',
    title: 'ཅ',
    subtitle: 'ca · 夹',
    description: '藏文第五个辅音字母，发音接近汉语「夹」的声母，不送气。',
    funFact: '藏文字母按发音部位排列，前几个字母都是舌根音。'
  },
  {
    id: 'letter_06',
    type: 'letter',
    tibetan: 'ཆ',
    title: 'ཆ',
    subtitle: 'cha · 恰',
    description: '藏文第六个辅音字母，是「ཅ」的送气版本。',
    funFact: '「ཆ」和「ཅ」的区别只在送气与否，在藏语中是不同的字母。'
  },
  {
    id: 'letter_07',
    type: 'letter',
    tibetan: 'ཇ',
    title: 'ཇ',
    subtitle: 'ja · 加（浊音）',
    description: '藏文第七个辅音字母，是浊音，发音时声带振动。',
    funFact: '藏文书写时，辅音字母底部在同一水平线上，形成整齐的「悬挂」效果。'
  },
  {
    id: 'letter_08',
    type: 'letter',
    tibetan: 'ཉ',
    title: 'ཉ',
    subtitle: 'nya · 尼亚',
    description: '藏文第八个辅音字母，是一个舌面鼻音。',
    funFact: '「ཉ」在藏文中常出现在词首，例如「ཉི་མ」意为「太阳」。'
  },
  {
    id: 'letter_09',
    type: 'letter',
    tibetan: 'ཏ',
    title: 'ཏ',
    subtitle: 'ta · 达（不送气）',
    description: '藏文第九个辅音字母，舌尖抵上齿龈发出，不送气。',
    funFact: '「ཏ」与「ཐ ད ན」同列，都由舌尖发出，排列方式与「ཀ」那一列完全平行。'
  },
  {
    id: 'letter_10',
    type: 'letter',
    tibetan: 'ཐ',
    title: 'ཐ',
    subtitle: 'tha · 塔（送气）',
    description: '藏文第十个辅音字母，是「ཏ」的送气版本。',
    funFact: '三十个辅音里每隔四位就重复一次「不送气—送气—浊音—鼻音」的节奏，像一首循环口诀。'
  },
  {
    id: 'letter_11',
    type: 'letter',
    tibetan: 'ད',
    title: 'ད',
    subtitle: 'da · 达（浊音）',
    description: '藏文第十一个辅音字母，发音时声带振动，是浊音。',
    funFact: '「བོད」（西藏）的收尾字母就是「ད」，它在这里不单独发音，只给前面的音节收尾。'
  },
  {
    id: 'letter_12',
    type: 'letter',
    tibetan: 'ན',
    title: 'ན',
    subtitle: 'na · 纳（鼻音）',
    description: '藏文第十二个辅音字母，是舌尖鼻音，发音部位与「ཏ」相同。',
    funFact: '「ན」是藏文十个后加字之一，带它的音节会多出一个鼻音尾巴。'
  },
  {
    id: 'letter_13',
    type: 'letter',
    tibetan: 'པ',
    title: 'པ',
    subtitle: 'pa · 巴（不送气）',
    description: '藏文第十三个辅音字母，由双唇发出，不送气。',
    funFact: '印刷体的「པ」顶部有个小弯钩，手写体里常被简写成一个小圈加一竖。'
  },
  {
    id: 'letter_14',
    type: 'letter',
    tibetan: 'ཕ',
    title: 'ཕ',
    subtitle: 'pha · 帕（送气）',
    description: '藏文第十四个辅音字母，是「པ」的送气版本。',
    funFact: '「ཕ」与「པ」的送气对立，和汉语拼音里 b 与 p 的区别类似。'
  },
  {
    id: 'letter_15',
    type: 'letter',
    tibetan: 'བ',
    title: 'བ',
    subtitle: 'ba · 巴（浊音）',
    description: '藏文第十五个辅音字母，是浊音，正好排在三十个辅音的正中间。',
    funFact: '「བ」既能当基字，也能当前加字和后加字，是构词能力最强的字母之一。'
  },
  {
    id: 'letter_16',
    type: 'letter',
    tibetan: 'མ',
    title: 'མ',
    subtitle: 'ma · 玛（鼻音）',
    description: '藏文第十六个辅音字母，是双唇鼻音。',
    funFact: '「མེ」是火、「མི」是人——词典里「མ」打头的词要排好几页。'
  },
  {
    id: 'letter_17',
    type: 'letter',
    tibetan: 'ཙ',
    title: 'ཙ',
    subtitle: 'tsa · 杂（不送气）',
    description: '藏文第十七个辅音字母，由舌尖前部发出，不送气。',
    funFact: '从「ཙ」开始，字母表从塞音过渡，这一列的排列又一次复刻了「ཀ」列的节奏。'
  },
  {
    id: 'letter_18',
    type: 'letter',
    tibetan: 'ཚ',
    title: 'ཚ',
    subtitle: 'tsha · 擦（送气）',
    description: '藏文第十八个辅音字母，是「ཙ」的送气版本。',
    funFact: '「ཚོང」（买卖）以「ཚ」打头，八廓街的商铺招牌上经常能见到它。'
  },
  {
    id: 'letter_19',
    type: 'letter',
    tibetan: 'ཛ',
    title: 'ཛ',
    subtitle: 'dza · 杂（浊音）',
    description: '藏文第十九个辅音字母，是浊音，与「ཙ ཚ」构成三兄弟。',
    funFact: '「ཙ ཚ ཛ」的不送气、送气、浊音三对立，与「ཀ ཁ ག」一模一样。'
  },
  {
    id: 'letter_20',
    type: 'letter',
    tibetan: 'ཝ',
    title: 'ཝ',
    subtitle: 'wa · 哇',
    description: '藏文第二十个辅音字母，是一个半元音，发音像汉语的「哇」。',
    funFact: '「ཝ」是三十个辅音里出场最少的字母之一，主要在拼写外来词时露面。'
  },
  {
    id: 'letter_21',
    type: 'letter',
    tibetan: 'ཞ',
    title: 'ཞ',
    subtitle: 'zha · 霞（浊音）',
    description: '藏文第二十一个辅音字母，在拉萨话里听感接近「霞」。',
    funFact: '「ཞ」与后面的「ཤ」听起来很像，但拼写时是两个完全不同的字母，不能混用。'
  },
  {
    id: 'letter_22',
    type: 'letter',
    tibetan: 'ཟ',
    title: 'ཟ',
    subtitle: 'za · 萨（浊音）',
    description: '藏文第二十二个辅音字母，是浊音。',
    funFact: '「ཟ」就是「吃」——「ཟ་བ」意为食物，这个字每天都要说上好几遍。'
  },
  {
    id: 'letter_23',
    type: 'letter',
    tibetan: 'འ',
    title: 'འ',
    subtitle: 'a · 阿（元音载体，不单独发音）',
    description: '藏文第二十三个辅音字母，本身不发出声音，专门用来承载元音符号。',
    funFact: '「འ」是三十个辅音里唯一不发音的——元音符号 ི ུ 都要靠它「托住」才能安家。'
  },
  {
    id: 'letter_24',
    type: 'letter',
    tibetan: 'ཡ',
    title: 'ཡ',
    subtitle: 'ya · 亚',
    description: '藏文第二十四个辅音字母，发音像汉语的「亚」的声母。',
    funFact: '「ཡི」是藏文里最常见的虚词之一，相当于汉语的「的」。'
  },
  {
    id: 'letter_25',
    type: 'letter',
    tibetan: 'ར',
    title: 'ར',
    subtitle: 'ra · 热（卷舌）',
    description: '藏文第二十五个辅音字母，发音时舌尖轻卷，接近「热」的声母。',
    funFact: '「མར」（酥油）的收尾就是「ར」——它是十个后加字里最常露面的一员。'
  },
  {
    id: 'letter_26',
    type: 'letter',
    tibetan: 'ལ',
    title: 'ལ',
    subtitle: 'la · 拉',
    description: '藏文第二十六个辅音字母，发音与汉语「拉」的声母相同。',
    funFact: '「ལ」既能当基字也能当后加字，藏文十个后加字里它排在第九。'
  },
  {
    id: 'letter_27',
    type: 'letter',
    tibetan: 'ཤ',
    title: 'ཤ',
    subtitle: 'sha · 夏（清音）',
    description: '藏文第二十七个辅音字母，发音像汉语「夏」的声母。',
    funFact: '「ཤམ་བྷ་ལ」（香巴拉）以「ཤ」开头——传说中高原深处的理想之地。'
  },
  {
    id: 'letter_28',
    type: 'letter',
    tibetan: 'ས',
    title: 'ས',
    subtitle: 'sa · 萨（清音）',
    description: '藏文第二十八个辅音字母，是清擦音，与「ཟ」的浊音相对。',
    funFact: '「ས」是藏文里最忙的后加字——大量音节都以它轻轻收尾。'
  },
  {
    id: 'letter_29',
    type: 'letter',
    tibetan: 'ཧ',
    title: 'ཧ',
    subtitle: 'ha · 哈',
    description: '藏文第二十九个辅音字母，是喉部发出的清擦音。',
    funFact: '笑出声的「哈哈」用藏文写出来就是「ཧ་ཧ」——三十个辅音里它最接近笑声。'
  },
  {
    id: 'letter_30',
    type: 'letter',
    tibetan: 'ཨ',
    title: 'ཨ',
    subtitle: 'a · 阿（零声母）',
    description: '藏文第三十个辅音字母，本身只是元音的「座驾」，以它开头的音节直接读元音。',
    funFact: '「ཨ」排在字母表末位，专给元音开路——每个以元音起头的音节都由它打头。'
  },
  {
    id: 'icon_01',
    type: 'icon',
    tibetan: '',
    title: '吉祥结',
    subtitle: '藏语：དཔལ་བེའུ',
    description: '藏传佛教八吉祥之一，象征佛陀的无限智慧与慈悲。',
    funFact: '吉祥结没有起点也没有终点，代表佛法循环不息。'
  },
  {
    id: 'icon_02',
    type: 'icon',
    tibetan: '',
    title: '青稞',
    subtitle: '藏语：ནས',
    description: '高原上的主粮作物，耐寒耐旱，籽粒可炒熟磨成糌粑，也可酿青稞酒。',
    funFact: '青稞是大麦的一支，在海拔四千米以上依然能结实成熟。'
  },
  {
    id: 'icon_03',
    type: 'icon',
    tibetan: '',
    title: '雪山',
    subtitle: '藏语：གངས་རི',
    description: '西藏最典型的地貌象征，代表高原的纯净与崇高。',
    funFact: '藏语中「གངས་རི」直译就是「雪的山」，冈仁波齐是其中最神圣的一座。'
  },
  {
    id: 'icon_04',
    type: 'icon',
    tibetan: '',
    title: '牦牛',
    subtitle: '藏语：གཡག',
    description: '被称作「高原之舟」，驮运、乳食、毛帐都离不开它，是高原生活的老伙伴。',
    funFact: '牦牛的长毛一直垂到腿边，像一条厚厚的裙子，风雪里也冻不着。'
  }
];
