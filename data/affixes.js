// data/affixes.js — 藏文四层拼读规则（上加字 / 下加字 / 前加字 / 后加字）权威穷举表
// 出处编号见 SRC；完整核对表与逐条引文见 docs/D110-藏文四层拼读规则核对表.md（文档不计包体）。
// 声调：á = 高平 55（清声母字），à = 低升 12（源自浊声母字）。
var SRC = {
  S1: '维基百科「藏文」·书写方法（四层字母集合与连接顺序）',
  S2: '百度百科「藏文前加字」（5 个前加字各自可接基字的穷举 + 13 条规则）',
  S3: '美篇《入学藏文基础上加字》教材（ར་མགོ་12 / ལ་མགོ་10 / ས་མགོ་11 逐字穷举）',
  S4: '中文百科全书 / 360 百科「藏文上加字」（4 类音变规则 + 拼读示例）',
  S5: '搜狗百科 / 百度百科「藏文下加字」（ྱ ྲ ླ ྭ 四类音变 + 拼音口诀）',
  S6: '百度百科「藏语」·后加字（10 条读音规则 + 35 声母表）',
  S7: '维基百科「标准藏语」（浊音清化 + 后加字 ས/ད/ན/ལ 元音音变与变调）',
  S8: '有道 / 百度百科「藏文后加字」（8 条读音规则）',
  S9: 'Perekhvalskaya《Lhasa Tibetan》(2025) 讲义（上加字/前加字不发音、对鼻音表高调）',
  S10: 'THL / Rangjung Yeshe Wiki「Wylie · Standard Tibetan Stacks」—— 下加字 ཝ（ཝ་ཟུར）实际成词栈全集：ཀྭ ཁྭ གྭ ཅྭ ཉྭ ཏྭ དྭ ཙྭ ཚྭ ཞྭ ཟྭ རྭ ཤྭ སྭ ཧྭ（证明 ྭ 不止 ཀཁག 三条，且全部真实成立）',
  S11: 'Rigpa Wiki / Tibetan Buddhist Encyclopedia「Tibetan Grammar - Formation of the Tibetan Syllable」—— 上加字逐基字穷举（ར: ཀགངཇཉཏདནབམཙ + ཀྱ/གྱ/མྱ 等；ལ/ས 同理）独立二重保险',
  S12: '古典文法《性入法》（Rtags kyi ’jug pa，通称 Rtags ’jug，吞弥·桑布扎 Thonmi Sambhota 著）—— ར་མགོ་/ལ་མགོ་/ས་མགོ་/ཡ་བཏགས/ར་བཏགས/ལ་བཏགས/ཝ་ཟུར/སྔོན་འཇུག་ 各节逐字穷举，藏文拼写法最权威原始出处'
};
// ---------------------------------------------------------------- ① 上加字（3 个）
// 上加字只能是 ར ལ ས（S1）；各自能接哪些基字有穷举表（S3），不是任意组合。
var SUPERS = ['ར', 'ལ', 'ས'];
var SUPER_OK = {
  'ར': 'ཀཅཏཔཙགཇདབཛངཉནམ',   // ར་མགོ་བཅུ་བཞི 14 个（古典《性入法》ར་མགོ་节 + 维基百科 Tibetan script：第一列 ཀཅཏཔཙ 示例 རྐ/རྟ/རྤ/རྩ 直接证明 ཅ པ 在内；原 12 个漏了 ཅ པ，已更正）
  'ལ': 'ཀགངཅཇཏདཔབཧ',     // ལ་མགོ་བཅུ 10 个
  'ས': 'ཀགངཉཏདནཔབམཙ'    // ས་མགོ་བཅུ་གཅིག 11 个
};
var SUPER_RULES = [
  { id: 'SP1', bases: 'ཀཅཏཔཙ', effect: '上加字不发音，基字保持高平不送气，读音 = 基字本音', src: ['S4', 'S9'] },
  { id: 'SP2', bases: 'གཇདབཛ', effect: '使基字声母由送气变不送气并升高平调；上加字 ལ 另带对应部位鼻冠音', src: ['S4', 'S6'] },
  { id: 'SP3', bases: 'ངཉནམ', effect: '使音节由低升调变高平调（鼻音基字）', src: ['S4', 'S9'] },
  { id: 'SP4', bases: 'ཧ', effect: '上加字 ལ 加在 ཧ 上拼出边擦音 lh（仅 ལྷ 一例）', src: ['S4'] }
];
// 上加字不发音；拉萨音按基字所在列统一变读（á=55）。འ 不在上加字基字集合内，故不列。
var SUPER_READ = {
  // 第一列 ཀཅཏཔཙ：不变，= 基字本音（རྐ=ka རྩ=ca རྟ=ta རྤ=pa སྩ=tsa）
  'ཀ': 'ká', 'ཅ': 'cá', 'ཏ': 'tá', 'པ': 'pá', 'ཙ': 'tsá',
  // 第三列 གཇདབཛ：送气→不送气并浊化（རྒ=ga རྗ=ja རྡ=da རྦ=ba རྫ=dza）
  'ག': 'gá', 'ཇ': 'já', 'ད': 'dá', 'བ': 'bá', 'ཛ': 'dzá',
  // 鼻音 ངཉནམ：低升→高平（རྔ=nga རྙ=nya རྣ=na རྨ=ma）
  'ང': 'ngá', 'ཉ': 'nyá', 'ན': 'ná', 'མ': 'má',
  // ལ + ཧ 特例：边擦音 lh
  'ཧ': 'lhā'
};
var NASAL_OF = { 'ག': 'ŋ', 'ཇ': 'ɲ', 'ད': 'n', 'བ': 'm', 'ཛ': 'n' };
// ---------------------------------------------------------------- ② 下加字（4 个）
var SUBS = ['ྱ', 'ྲ', 'ླ', 'ྭ'];
var SUB_OK = {
  'ྱ': 'ཀཁགཔཕབམ',        // 腭化（S5）
  'ྲ': 'ཀཁགཏཐདཔཕབཧསམ',  // 卷舌化（S5）
  // ⚠️ སླ / རླ **不是**下加字：S5 明确它们相当于「ལ + 上加字 ས / ར」，属上加字层。字形同、结构不同。
  'ླ': 'ཀགབཟ',
  // ྭ（ཝ་ཟུར）对现代拉萨音发音已无影响（= 基字本音）。古典《性入法》ཝ་འཇུག་节允许接很广的基字；
  // 此处取 THL「Standard Tibetan Stacks」实际成词的 15 个栈（S10），全部真实成立、无假阳性。
  'ྭ': 'ཀཁགཅཉཏདཙཚཞཟརཤསཧ'
};
var SUB_RULES = [
  { id: 'SB1', sub: 'ྱ', effect: '基字腭化：ཀྱ ཁྱ གྱ 的 k/kʰ→c/cʰ；པྱ ཕྱ བྱ མྱ 的 p/pʰ→tɕ/tɕʰ', src: ['S5', 'S6'] },
  { id: 'SB2', sub: 'ྲ', effect: '基字卷舌化：ཀྲ ཏྲ པྲ→ʈʂ；ཁྲ ཐྲ ཕྲ→ʈʂʰ；གྲ དྲ བྲ→ʈʂʰ（低升）；ཧྲ→ʂ', src: ['S5', 'S6'] },
  { id: 'SB3', sub: 'ྲ', effect: 'སྲ 与 ས 同音、མྲ 与 མ 同音（下加字在发音上不起作用）', src: ['S5'] },
  { id: 'SB4', sub: 'ླ', effect: '边音化 / 鼻音化：ཀླ གླ བླ→l（高调）；ཟླ→ntʰ（低升）', src: ['S5'] },
  { id: 'SB5', sub: 'ྭ', effect: '圆唇化，对现代拉萨音发音已无影响（= 基字本音，如 ཀྭ=ཀ、གྭ=ག；完整可用栈见 SUB_OK.ྭ 的 15 个，源自 THL Standard Tibetan Stacks）', src: ['S5', 'S6', 'S10'] }
];
var SUB_READ = {
  'ཀྱ': 'gyā', 'ཁྱ': 'kyā', 'གྱ': 'kyà',
  'པྱ': 'jiā', 'ཕྱ': 'qiā', 'བྱ': 'qià', 'མྱ': 'nyà',
  'ཀྲ': 'zhā', 'ཏྲ': 'zhā', 'པྲ': 'zhā',
  'ཁྲ': 'chā', 'ཐྲ': 'chā', 'ཕྲ': 'chā',
  'གྲ': 'chà', 'དྲ': 'chà', 'བྲ': 'chà',
  'ཧྲ': 'shā', 'སྲ': 'sà', 'མྲ': 'mà',
  'ཀླ': 'lā', 'གླ': 'lā', 'བླ': 'lā', 'ཟླ': 'ndà',
  // ྭ（ཝ་ཟུར）发音 = 基字本音（拉萨音已无影响）；下列取 THL 实际成词栈（S10）
  'ཀྭ': 'ká', 'ཁྭ': 'khá', 'གྭ': 'gà',
  'ཅྭ': 'cá', 'ཉྭ': 'nyá', 'ཏྭ': 'tá', 'དྭ': 'dá', 'ཙྭ': 'tsá',
  'ཚྭ': 'tshá', 'ཞྭ': 'zhá', 'ཟྭ': 'zá', 'རྭ': 'rá', 'ཤྭ': 'shá', 'སྭ': 'sá', 'ཧྭ': 'há'
};
// ---------------------------------------------------------------- ③ 前加字（5 个）
var PREFIXES = ['ག', 'ད', 'བ', 'མ', 'འ'];
var PREFIX_OK = {
  'ག': 'ཅཙཉཡཏདནཤསཞཟ',   // 11（S2 规则 1）
  'ད': 'ཀགངཔབམ',          // 6（S2 规则 2）
  'བ': 'ཀགཅཙཏདཤསཞཟ',     // 10（S2 规则 3）
  'མ': 'ཁགངཆཇཉཐདནཚཛ',    // 11（S2 规则 4）
  'འ': 'ཁགཆཇཐདཕབཚཛ'     // 10（S2 规则 5）
};
var PREFIX_RULES = [
  { id: 'PF1', prefixes: 'གདབམའ', bases: 'ཀཁཅཆཏཐཔཕཙཚཤསཞཟ', effect: '前加字不发音，也不影响基字发音', src: ['S2'] },
  { id: 'PF2', prefixes: 'གདབ', bases: 'གཇདབཛ', effect: '前加字不发音，但使基字声母由送气变不送气', src: ['S2', 'S6'] },
  { id: 'PF3', prefixes: 'མའ', bases: 'གཇདབཛ', effect: '增加对应部位的鼻冠音', src: ['S2', 'S6'] },
  { id: 'PF4', prefixes: 'གདབ', bases: 'ངཉནམཡ', effect: '使低升调的鼻音与半元音 ཡ 变高平调', src: ['S2', 'S6'] },
  { id: 'PF5', prefixes: 'ད', bases: 'བ', effect: '基字 བ 前加 ད 变半元音或零声母：དབའ=wá、དབྱ=yá、དབྲ=rá', src: ['S2', 'S6'] }
];
// ---------------------------------------------------------------- ④ 后加字（10 + 再后加字 2）
var SUFFIXES = ['ག', 'ང', 'ད', 'ན', 'བ', 'མ', 'འ', 'ར', 'ལ', 'ས'];
// ས 接在 ག ང བ མ 后；ད 接在 ན ར ལ 后（S6 规则 9-10，与既有 learning.js 一致）
var SECOND_SUFFIX = { 'ག': 'ས', 'ང': 'ས', 'བ': 'ས', 'མ': 'ས', 'ན': 'ད', 'ར': 'ད', 'ལ': 'ད' };
var SUFFIX_RULES = [
  { id: 'SF1', suffix: 'ར', effect: '延长元音（a→aː / o→oː / u→uː / e→eː / i→iː）', src: ['S6', 'S8'] },
  { id: 'SF2', suffix: 'ལ', effect: '改变元音（a→ɛ / o→ø / u→y / e→eː / i→iː），对声调无影响', src: ['S6', 'S8'] },
  { id: 'SF3', suffix: 'འ', effect: 'འི འུ འེ འོ 与前面元音构成长元音或复元音；འ 本身是占位符', src: ['S6'] },
  { id: 'SF4', suffix: 'ད', effect: '使元音鼻化（a→ɛ̃ / o→ø̃ / u→ỹ / e→ẽ / i→ĩ）', src: ['S6'] },
  { id: 'SF5', suffix: 'ང', effect: '形成韵尾 ŋ（发 -ng 音）', src: ['S6', 'S8'] },
  { id: 'SF6', suffix: 'མ', effect: '形成韵尾 m（发 -m 音）', src: ['S6', 'S8'] },
  { id: 'SF7', suffix: 'ག', effect: '形成韵尾 q 并触发变调（高平 f→h、低升 v→w）；本身一般不发音', src: ['S6'] },
  { id: 'SF8', suffix: 'བ', effect: '形成韵尾 p 并触发变调；后音节词尾 བ 与前音节合并成长元音/复元音', src: ['S6'] },
  { id: 'SF9', suffix: 'ས', effect: '形成韵尾 ʔ 并触发变调（高平 f→h、低升 v→w）', src: ['S6'] },
  { id: 'SF10', suffix: 'ད', effect: '形成韵尾 ʔ 并触发变调（高平 f→h、低升 v→w）', src: ['S6'] }
];
// 维基「标准藏语」口径（S7）—— 与 S6 逐条可互校的第二重保险
var SUFFIX_SOUND_CHANGE = {
  note: '以 ས ད ན ལ 为第一后加字时元音音变：a→ɛ、o→ø、u→y；ས ད 不发音；ན 与元音合成鼻化元音',
  src: ['S7']
};
var SUFFIX_TONE_CHANGE = {
  note: '以 -ག -གས -བ -བས -ད -ས -ངས -མས 为后加字时：原高平调变降调，原低平调变低升降调 132',
  src: ['S7']
};
// ---------------------------------------------------------------- 组合展开
// ⚠️ 书写顺序有讲究：上加字 / 前加字在基字**之前**，下加字在基字**之后**。
//    （早期版本把下加字也拼成「附加字+基字」，字形顺序不成立；现由 audit_affix_reading.py 校验）
function expand(map, order, after) {
  var out = [];
  (order || Object.keys(map)).forEach(function (k) {
    (map[k] || '').split('').forEach(function (b) {
      out.push(after ? (b + k) : (k + b));
    });
  });
  return out;
}
var SUPER_LEGAL = expand(SUPER_OK, SUPERS);       // 14 + 10 + 11 = 35
var SUB_LEGAL = expand(SUB_OK, SUBS, true);       // 7 + 12 + 4 + 15 = 38
var PREFIX_LEGAL = expand(PREFIX_OK, PREFIXES);   // 11 + 6 + 10 + 11 + 10 = 48
module.exports = {
  SCHEMA: 1,
  SRC: SRC,
  SUPERS: SUPERS,
  SUPER_OK: SUPER_OK,
  SUPER_RULES: SUPER_RULES,
  SUPER_READ: SUPER_READ,
  NASAL_OF: NASAL_OF,
  SUBS: SUBS,
  SUB_OK: SUB_OK,
  SUB_RULES: SUB_RULES,
  SUB_READ: SUB_READ,
  PREFIXES: PREFIXES,
  PREFIX_OK: PREFIX_OK,
  PREFIX_RULES: PREFIX_RULES,
  SUFFIXES: SUFFIXES,
  SECOND_SUFFIX: SECOND_SUFFIX,
  SUFFIX_RULES: SUFFIX_RULES,
  SUFFIX_SOUND_CHANGE: SUFFIX_SOUND_CHANGE,
  SUFFIX_TONE_CHANGE: SUFFIX_TONE_CHANGE,
  SUPER_LEGAL: SUPER_LEGAL,
  SUB_LEGAL: SUB_LEGAL,
  PREFIX_LEGAL: PREFIX_LEGAL,
  // 反查：该组合是否在权威穷举表内（门禁与运行时共用同一判据，避免两套口径）
  isLegal: function (layer, syl) {
    var list = layer === 'super' ? SUPER_LEGAL
      : layer === 'sub' ? SUB_LEGAL
        : layer === 'prefix' ? PREFIX_LEGAL : null;
    return !!list && list.indexOf(syl) > -1;
  }
};