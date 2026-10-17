// data/shop-goods.js — 实物商品（藏香）**唯一事实源**（D132）
//
// ## 为什么单独一个文件，不塞进 data/goods.js
//   data/goods.js 是**虚拟道具**（酥油灯/祝福/哈达/名字），走米大师虚拟支付；
//   本文件是**实物商品**，走微信小店 / 线下发货。两条链路的交付方式、对账、资质都不同。
//
// ## 铁律（同 §64.11 的纪律）
//   **价格只准写在这里。** 页面 / 文案 / 分享语**一律读本文件**，不许各自写死数字 ——
//   否则改价时必然只改一处、另一处静默漂移（同类事故已发生四次：D101/D111/D113/D113e）。
//
// ## 合规口径（D131 用户拍板：走量，不写非遗）
//   ✅ 能写：执行 GB/T 43430-2023《藏香》国家标准 · 产自西藏 · 家居香品 · 规格
//   ❌ 不能写：非遗 / 手工 / 古法；任何宗教词（开光/加持/供佛/礼佛…）；任何功效宣称
//   （由 scripts/test-religion-compliance.js 逐条机械扫描本文件）
//
// ## 成本字段说明
//   cost 只用于**内部核算**（scripts/incense-pricing.js 读它算毛利），
//   **不下发到页面渲染** —— 页面只展示 price。

module.exports = {
  currency: 'CNY',
  updatedAt: '2026-10-17',
  // 微信小店商品链接：**待你开通后填入**（留空 = 页面按钮显示"待配置"，不许假装能买）
  purchaseUrl: '',
  // 运费口径（D131 用户明确：售价 15 元**不含运费**）
  shippingNote: '售价不含运费',
  items: [
    {
      id: 'incense_stick_10',
      baseName: '藏香',            // 形态未定稿时页面只显示这个（不硬凑「· 线香」）
      name: '藏香 · 线香',
      spec: '一捆 10 根',
      form: '线香',
      origin: '产自西藏',
      standard: '执行 GB/T 43430-2023《藏香》国家标准',
      category: '家居香品',
      sellerNote: '本店向藏香厂采购后销售（经销商）',
      price: 15,          // 售价（元 / 捆）
      cost: 13,           // 成本（元 / 捆）—— 仅内部核算，不下发页面
      unit: '捆',
      stock: 100,         // 本次拿货量（D131 用户：拿 100 捆）
      moq: 100,
      // 亮点卡片：每条**只依赖一条** claim（门禁 §13 会查 claim key 是否存在）。
      // 依赖项还没定稿的那条自动不上屏 —— 未核实的话不上屏，定了自动出现。
      highlights: [
        { text: '家居香品', claim: 'standard' },
        { text: '产自西藏', claim: 'origin' },
        { text: '一捆 10 根', claim: 'spec' }
      ],
      source: '价格/规格/成本/拿货量：用户 2026-10-17 提供；'
        + '标准号：GB/T 43430-2023《藏香》（全国标准信息公共服务平台 std.samr.gov.cn）'
        + '｜查询日期 2026-10-17',

      // ## 内容定稿台账（D133）
      //   每一句会印在商品页上的话，都要在这里有一个状态。
      //   status 四态（门禁 §13 逐条校验）：
      //     'verified' 已核实 —— 必须给 source（出处）+ verifiedAt（日期）
      //     'user'     用户提供 —— 必须给 decidedAt
      //     'pending'  待核实 —— 必须写 need（缺什么才能核实）
      //     'missing'  还没有 —— 必须写 need
      //   🔴 铁律：只要还有 pending/missing，`purchaseUrl` 就必须留空（门禁会拦）——
      //      不许带着未核实的内容开通收银台。详见 docs/monetization-feasibility-2026-10-17.md §4
      claims: {
        spec: {
          status: 'user', decidedAt: '2026-10-17', by: '用户口述',
          value: '一捆 10 根'
        },
        price: {
          status: 'user', decidedAt: '2026-10-17', by: '用户口述',
          value: '¥15 / 捆（不含运费）'
        },
        cost: {
          status: 'user', decidedAt: '2026-10-17', by: '用户口述',
          value: '¥13 / 捆'
        },
        origin: {
          status: 'pending',
          need: '包装上的厂名+厂址（或产地证明）照片',
          risk: '写错即虚假宣传（《广告法》第 4 / 28 条）'
        },
        standard: {
          status: 'pending',
          need: '包装上印的执行标准号照片（必须与本字段逐字一致）',
          risk: '标准本身已核实现行（GB/T 43430-2023，2023-11-27 发布 / 2024-03-01 实施，ICS 13.120）；'
            + '但「这批货是否执行该标准」只能看包装 —— 不一致即虚假',
          verifiedFact: {
            source: 'https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=96B7C581744DFB029D3B751C805A1701',
            verifiedAt: '2026-10-17'
          }
        },
        form: {
          status: 'pending',
          need: '实物近照（确认是否有竹签：有签 = 签香，无签 = 线香）'
        },
        image: {
          status: 'missing',
          need: '实拍主图 ≥3 张（微信小店要求；且详情规格与实物偏差 ≤10%）'
        }
      }
    }
  ]
};
