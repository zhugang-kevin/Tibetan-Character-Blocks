// data/merchants.js — 权益中心 · 商家与「到店权益」（双轨制）
//
// 合规边界（详见 docs/privilege-system-v1.md）：
//   1. 平台只做三件事：发凭证、写记录、开发票。本数据**不含任何价格/金额/折扣字段**，
//      也不含结算口径 —— offer 是商家自己的店内让利文案，平台不是发行方、不是兑付方。
//   2. 券面不承载金额：凭证到店后「给什么」由商家自主决定（那是商家自己的店内促销）。
//   3. 全程无支付、无交易、无资金归集（防二清）。
//   4. **排除宗教活动场所与文物景区**（宗教场所不得商业联动），只对接周边经营主体。
//
// 字段：
//   id       唯一标识（同时是本地核销记录的键）
//   name     店名
//   city     城市 id（见 utils/benefits.js 的 CITIES）
//   track    'local' 本地生活 | 'tourist' 游客专属 | 'both' 通用
//   category 行业分类
//   offer    商家自主提供的到店权益（**平台不承诺金额，只转述商家的店内让利**）
//   kind     'gift' 赠礼 | 'combo' 专属组合 | 'priority' 优先权 | 'stamp' 联名印章
//   need     需通关的关卡数才能领取（0 = 新手即可领）

module.exports = [
  // ---------- 本地生活轨：高频、刚需、实惠 ----------
  {
    id: 'm_local_01',
    name: '光明港琼甜茶馆',
    city: 'lhasa',
    track: 'local',
    category: '甜茶馆',
    offer: '凭凭证赠藏式甜点一份（店内自制款）',
    kind: 'gift',
    need: 1
  },
  {
    id: 'm_local_02',
    name: '八廓老街藏面馆',
    city: 'lhasa',
    track: 'local',
    category: '藏餐',
    offer: '藏字方块专属组合（甜茶 + 藏面 + 小菜，店内定制款）',
    kind: 'combo',
    need: 1
  },
  {
    id: 'm_local_03',
    name: '雪域生活超市（江苏路店）',
    city: 'lhasa',
    track: 'local',
    category: '生活超市',
    offer: '凭凭证赠环保购物袋一只',
    kind: 'gift',
    need: 2
  },
  {
    id: 'm_local_04',
    name: '宗角禄康社区理发屋',
    city: 'lhasa',
    track: 'local',
    category: '生活服务',
    offer: '免排队，优先安排（视门店客流）',
    kind: 'priority',
    need: 1
  },
  {
    id: 'm_local_05',
    name: '尼洋河畔茶馆',
    city: 'nyingchi',
    track: 'local',
    category: '甜茶馆',
    offer: '凭凭证赠藏式甜点一份',
    kind: 'gift',
    need: 1
  },
  {
    id: 'm_local_06',
    name: '年楚河果蔬店',
    city: 'shigatse',
    track: 'local',
    category: '生活超市',
    offer: '凭凭证赠当季水果一份',
    kind: 'gift',
    need: 2
  },

  // ---------- 游客专属轨：体验、打卡、纪念感 ----------
  {
    id: 'm_tour_01',
    name: '玛吉阿米藏餐厅',
    city: 'lhasa',
    track: 'tourist',
    category: '藏餐',
    offer: '优先安排靠窗 / 露台座位（视门店客流）',
    kind: 'priority',
    need: 1
  },
  {
    id: 'm_tour_02',
    name: '雪域唐卡非遗体验馆',
    city: 'lhasa',
    track: 'tourist',
    category: '非遗体验',
    offer: '赠手绘藏纸书签一枚（可现场体验描金）',
    kind: 'gift',
    need: 2
  },
  {
    id: 'm_tour_03',
    name: '敏竹林藏香坊',
    city: 'lhasa',
    track: 'tourist',
    category: '非遗体验',
    offer: '赠藏香体验装一份',
    kind: 'gift',
    need: 2
  },
  {
    id: 'm_tour_04',
    name: '南迦巴瓦民宿',
    city: 'nyingchi',
    track: 'tourist',
    category: '民宿',
    offer: '提前入住 / 延迟退房（视房态，需提前告知）',
    kind: 'priority',
    need: 3
  },
  {
    id: 'm_tour_05',
    name: '珠峰脚下旅拍工作室',
    city: 'shigatse',
    track: 'tourist',
    category: '旅拍',
    offer: '赠精修电子照一张（现场拍摄后提供）',
    kind: 'gift',
    need: 3
  },
  {
    id: 'm_tour_06',
    name: '雅砻河谷甜茶馆',
    city: 'shannan',
    track: 'tourist',
    category: '甜茶馆',
    offer: '凭凭证赠甜茶一杯',
    kind: 'gift',
    need: 0
  },

  // ---------- 通用：本地人与游客都合适 ----------
  {
    id: 'm_both_01',
    name: '雪域文创集合店',
    city: 'lhasa',
    track: 'both',
    category: '文创商店',
    offer: '护照联名印章一枚（到店加盖，可集齐一套）',
    kind: 'stamp',
    need: 1
  },
  {
    id: 'm_both_02',
    name: '高原主题邮局',
    city: 'lhasa',
    track: 'both',
    category: '邮政文创',
    offer: '赠藏文寄语明信片一张（可现场寄出）',
    kind: 'gift',
    need: 0
  }
];
