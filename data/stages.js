// data/stages.js — 藏文成长阶梯（12 阶段 × 每阶段 10 关，每阶段一张证书）
//
// 设计原则（对应「藏文成长阶梯 · 证书体系」方案）：
// - 每 10 关为一个阶段；通关该阶段最后一关，颁发一张「藏文成长证书」
// - 证书是「学习证明」，不是积分奖励：写的是这一阶段真的学会了什么
// - MVP 只开放第一阶段（第 1-10 关 · 简单基字），可颁发证书；
//   其余阶段在证书列表里占位（灰色未解锁），集齐 12 张即一套藏文入门档案
//
// 字段说明：
//   stage     阶段序号（1-12）
//   name      阶段名（出现在证书正中）
//   goal      学习目标（一句话）
//   plan      完整阶梯的规划目标（内容库扩充后证书文案自动生效）
//   from/to   该阶段覆盖的关卡区间（闭区间，各 10 关）
//   open      是否已开放；false 表示「敬请期待」，不参与颁发
//   certLines 证书上的成就行（支持占位符，运行时按真实数据替换）：
//               {letters} 已认识的藏文字母数   {icons} 已认识的文化元素数
//               {elements} 元素合计            {levels} 关卡数
//               {pairs} 该阶段总消除对数       {stage} 阶段序号
module.exports = [
  {
    stage: 1, name: '简单基字', goal: '认识藏文基字', plan: '认识 30 个辅音字母',
    from: 1, to: 10, open: true,
    certLines: [
      '已认识 {letters} 个藏文字母',
      '已认识 {icons} 个藏文化元素',
      '完成 {levels} 个学习单元'
    ]
  },
  {
    stage: 2, name: '简单基字组词', goal: '用基字拼简单词', plan: '用基字拼简单词',
    from: 11, to: 20, open: false, certLines: []
  },
  {
    stage: 3, name: '基字 + 元音', goal: '认识 4 个元音符号', plan: '认识 4 个元音符号',
    from: 21, to: 30, open: false, certLines: []
  },
  {
    stage: 4, name: '基字 + 元音组词', goal: '拼带元音的词', plan: '拼带元音的词',
    from: 31, to: 40, open: false, certLines: []
  },
  {
    stage: 5, name: '基字 + 上加字', goal: '认识上加字 ར ལ ས', plan: '认识上加字 ར ལ ས',
    from: 41, to: 50, open: false, certLines: []
  },
  {
    stage: 6, name: '基字 + 上加字组词', goal: '拼带上加字的词', plan: '拼带上加字的词',
    from: 51, to: 60, open: false, certLines: []
  },
  {
    stage: 7, name: '基字 + 下加字', goal: '认识下加字 ྱ ྲ ླ ྭ', plan: '认识下加字 ྱ ྲ ླ ྭ',
    from: 61, to: 70, open: false, certLines: []
  },
  {
    stage: 8, name: '下加字简单组词', goal: '拼带下加字的词', plan: '拼带下加字的词',
    from: 71, to: 80, open: false, certLines: []
  },
  {
    stage: 9, name: '稍难组词', goal: '多部件组合词', plan: '拼多部件组合词',
    from: 81, to: 90, open: false, certLines: []
  },
  {
    stage: 10, name: '简单造句', goal: '2-3 个词的短句', plan: '造 2-3 个词的短句',
    from: 91, to: 100, open: false, certLines: []
  },
  {
    stage: 11, name: '难度造句', goal: '完整句子', plan: '造完整句子',
    from: 101, to: 110, open: false, certLines: []
  },
  {
    stage: 12, name: '持续扩展', goal: '依次类推', plan: '持续扩展',
    from: 111, to: 120, open: false, certLines: []
  }
];
