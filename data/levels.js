// data/levels.js — 10关配置
// elements: [元素ID, 出现次数]，每种次数均为偶数（保证可两两配对）
// obstacles（可选）: { frost: 冰霜数量, crate: 木箱数量, crateHp: 木箱耐久 }
//   冰霜：相邻消除一次破冰；木箱：相邻消除一次扣 1 点耐久，归零破开
//   遮挡位置由 utils/obstacles.js 确定性生成，不超过总格数 20%
module.exports = [
  // 第1关：6×4 网格，24张牌，快速上手
  { level: 1, cols: 6, rows: 4, elements: [['letter_01', 12], ['letter_02', 12]] },
  // 第2关：6×5 网格，30张牌，新增第 3 个字母 ག，并**首次出现冰霜**
  //   —— 第 1 关（2 种元素、无机制）与第 2 关之间必须有「新东西」，
  //   否则新手会认为「跟上一关一模一样」。2 块冰霜占 30 格的 6.7%，远低于 D23 的 25% 上限。
  { level: 2, cols: 6, rows: 5, elements: [['letter_01', 10], ['letter_02', 10], ['letter_03', 10]], obstacles: { frost: 2 } },
  // 第3关：8×4 网格，32张牌，冰霜增至 3 块
  { level: 3, cols: 8, rows: 4, elements: [['letter_01', 8], ['letter_02', 8], ['letter_03', 8], ['letter_04', 8]], obstacles: { frost: 3 } },
  // 第4关：8×4 网格，32张牌，引入吉祥结图标
  { level: 4, cols: 8, rows: 4, elements: [['letter_01', 6], ['letter_02', 6], ['letter_03', 6], ['letter_04', 6], ['icon_01', 8]] },
  // 第5关：8×5 网格，40张牌，冰霜增多
  { level: 5, cols: 8, rows: 5, elements: [['letter_01', 8], ['letter_02', 8], ['letter_03', 8], ['letter_04', 8], ['letter_05', 8]], obstacles: { frost: 5 } },
  // 第6关：6×8 网格，48张牌，首次出现藏式木箱
  { level: 6, cols: 6, rows: 8, elements: [['letter_01', 8], ['letter_02', 8], ['letter_03', 8], ['letter_04', 8], ['letter_05', 8], ['letter_06', 8]], obstacles: { frost: 4, crate: 2, crateHp: 1 } },
  // 第7关：6×8 网格，48张牌，引入莲花图标
  { level: 7, cols: 6, rows: 8, elements: [['letter_01', 6], ['letter_02', 6], ['letter_03', 6], ['letter_04', 6], ['letter_05', 6], ['letter_06', 6], ['icon_01', 6], ['icon_02', 6]], obstacles: { frost: 6 } },
  // 第8关：6×8 网格，48张牌，7个字母，木箱需破两次
  { level: 8, cols: 6, rows: 8, elements: [['letter_01', 6], ['letter_02', 6], ['letter_03', 6], ['letter_04', 6], ['letter_05', 8], ['letter_06', 8], ['letter_07', 8]], obstacles: { frost: 6, crate: 3, crateHp: 2 } },
  // 第9关：6×8 网格，48张牌，全部8个字母 + 2个图标
  { level: 9, cols: 6, rows: 8, elements: [['letter_01', 4], ['letter_02', 4], ['letter_03', 4], ['letter_04', 4], ['letter_05', 4], ['letter_06', 4], ['letter_07', 4], ['letter_08', 4], ['icon_01', 8], ['icon_02', 8]], obstacles: { frost: 6, crate: 2, crateHp: 2 } },
  // 第10关（最终关）：6×8 网格，48张牌，全部8个字母 + 4个图标
  { level: 10, cols: 6, rows: 8, elements: [['letter_01', 4], ['letter_02', 4], ['letter_03', 4], ['letter_04', 4], ['letter_05', 4], ['letter_06', 4], ['letter_07', 4], ['letter_08', 4], ['icon_01', 4], ['icon_02', 4], ['icon_03', 4], ['icon_04', 4]], obstacles: { frost: 8, crate: 4, crateHp: 2 } }
];
