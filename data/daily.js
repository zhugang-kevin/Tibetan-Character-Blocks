// data/daily.js — 首页悬浮入口的内容池（全部本地、无支付、无广告、无金额）
// 合规：非遗盲盒只抽「文化小知识」，不含任何优惠券 / 金额 / 结算字段（validate 会机械校验）
module.exports = {
  // 雪域日签：藏语祝福 + 中文翻译 + 小知识（7 天一循环）
  // D114：7 条全部换成用户本人录音所念的文本（原文本只有 tashi_delek 与之相同）。
  //   硬规则 R1/R2 要求每条以 tsheg 结尾，故 6 条补了尾随 ་（不是照抄截图）。
  //   roman 为学习者读音（非严格 Wylie），与既有字段风格一致。
  greetings: [
    { tibetan: 'བཀྲ་ཤིས་བདེ་ལེགས་', voice: 'tashi_delek', roman: 'tashi delek', cn: '扎西德勒，吉祥如意', tip: '藏地最常用的问候，见面与道别都能用。' },
    { tibetan: 'བསོད་ནམས་ཤོག་', voice: 'blessing_01', roman: 'bsod nams shog', cn: '愿吉祥相随', tip: '祝福句的通用收尾——ཤོག表示「愿……成就」，加在前一句之后就成一句祝愿。' },
    { tibetan: 'དགེ་སློང་འཕེལ་བའི་ཤོག་', voice: 'greet_03', roman: 'de long \'pel wa\'i shog', cn: '愿美好与福泽不断增长', tip: 'འཕེལ་བ་是「增长、累积」，常用于祝你一天比一天好。' },
    { tibetan: 'བདེ་སྐྱིད་བདེ་བའི་ཤོག་', voice: 'greet_04', roman: 'de kyi de wa\'i shog', cn: '愿幸福与安乐降临', tip: 'བདེ་སྐྱིད་是「幸福」，དེ་བའི་是「那个……的」，合起来即「愿那份幸福降临」。' },
    { tibetan: 'བཀྲ་ཤིས་དབང་ལེགས་ཕུན་སུམ་ཚོགས་', voice: 'greet_05', roman: 'tashi dbang legs phun sum tsogs', cn: '吉祥圆满，福乐丰盛', tip: '四个吉祥词连缀（吉祥·威德·善·圆满），是藏语祝福里最隆重的一句。' },
    { tibetan: 'སམོད་རང་བརྒྱུད་བདེ་ཤོག་', voice: 'greet_06', roman: 'smod rang rgyud de shog', cn: '愿心中所愿顺利成就', tip: 'བརྒྱུད་བདེ་直译是「愿愿成真」，是许愿时最该说的一句。' },
    { tibetan: 'ཞི་བདེ་ཡོང་བའི་ཤོག་', voice: 'greet_07', roman: 'zhi de yong wa\'i shog', cn: '愿祥和与安宁相伴', tip: '短而轻，适合在结束时说一句收尾祝愿。' }
  ],
  // 祈福长明灯：7 天循环签到奖励（纯本地点数/道具，无金额、无券）
  signInRewards: [
    { day: 1, label: '50 学习得分', kind: 'points', value: 50 },
    { day: 2, label: '1 张文化卡', kind: 'card', value: 1 },
    { day: 3, label: '1 个提示道具', kind: 'item', value: 'hint' },
    { day: 4, label: '灯油 +2（主题装饰）', kind: 'oil', value: 2 },
    { day: 5, label: '下一课双倍练习', kind: 'points', value: 100 },
    { day: 6, label: '2 张文化卡', kind: 'card', value: 2 },
    { day: 7, label: '稀有文化卡 + 120 学习得分', kind: 'points', value: 120 }
  ],
  // 非遗盲盒：只抽文化小知识（不承载金额）
  trivia: [
    '唐卡的金色多用真金研磨，所以千年不褪色。',
    '藏纸用狼毒草根纤维做，虫不蛀、鼠不咬，古经书得以保存千年。',
    '风马旗五色有次序：蓝（天）白（云）红（火）绿（水）黄（地）。',
    '藏式木碗常配碗盖，是为了在高原上给茶保温、防尘。',
    '藏文书法用竹笔，笔尖斜切，横细竖粗。',
    '吉祥结（盘长）没有起点也没有终点，寓意回环不息。',
    '酥油灯用酥油点燃，灯芯多为草茎，火光稳而不烈。',
    '藏历一年分四季，却有「六季」的说法：春、下春、夏、秋、初冬、冬。'
  ],
  // 藏式道具铺：用学习得分兑换（不涉及任何支付）
  shop: [
    { id: 'hint', name: '提示', cost: 40, icon: '🔍', desc: '在课程里点出一对可配对的牌' },
    { id: 'shuffle', name: '洗牌', cost: 60, icon: '🌀', desc: '重排剩余牌，打散死局' },
    { id: 'oil', name: '灯油', cost: 30, icon: '🪔', desc: '给长明灯添油，连签更亮' }
  ],
  // 菩提树：浇水得积分（不做广告施肥）
  tree: { name: '菩提树', desc: '每天浇一次水，收获灯油与学习得分', water: 12 },
};