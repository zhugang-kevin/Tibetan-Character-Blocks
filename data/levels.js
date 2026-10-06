// data/levels.js — 10关配置（30 辅音扩充版，2026-10-07）
// elements: [元素ID, 出现次数]，每种次数均为偶数（保证可两两配对）
// obstacles（可选）: { frost: 冰霜数量, rope: 绳结数量, ropeHp: 绳股数, crate: 木箱数量, crateHp: 木箱耐久 }
//   冰霜：相邻消除一次破冰；绳结：相邻消除一次松一股（默认 2 股），全松开才解开；
//   木箱：相邻消除一次扣 1 点耐久，归零破开
//   障碍物难度曲线 = 冰霜(L2) → 木箱(L6) → 绳结(L9)，逐关只加一种新机制
//   遮挡位置由 utils/obstacles.js 确定性生成，不超过总格数 25%
//
// ⚠️ D33 起：**总牌数 ≠ 格数**，这是刻意的。
//   初始盘面按 `utils/board.js` 的 planCounts 铺满 cols×rows 格，
//   其余牌进入「补充池」（池 = 格数 / 4 向上取到偶数）。
//   消除一对 → 上方方块下落 → 顶部从池里补一对同元素的牌。
//   池空后不再补充，盘面自行收缩到空 → 通关（揭图整幅揭晓）。
//   因此：**每关的消除对数 = 总牌数 / 2**，比格数/2 多约 25%，一局更长、认字重复更多。
//   三条守恒由 scripts/validate.js §31 与 scripts/build-h5.js 机械校验：
//     ① 每种元素出现次数为偶数   ② 盘面+池 = 总数   ③ 总数 = 格数 + round2(格数/4)
//
// 30 辅音配比原则（certificate-system.md「二期扩展清单」第 2 项）：
//   每关 2~4 个新字母 + 2~6 个已学字母复习，30 个辅音在 10 关内全部出场：
//     新字母引入：L1-4 各 2 个（第一个字母组 ཀ ཁ ག ང ཅ ཆ ཇ ཉ）
//                 L5-8 各 3 个（ཏ ཐ ད ན པ ཕ བ མ ཙ ཚ ཛ ཝ）
//                 L9 引 4 个（ཞ ཟ འ ཡ）、L10 引 6 个（ར ལ ཤ ས ཧ ཨ）压轴
//   单关元素种类 ≤ 10（≤ 15 的理论上限，保证单种密度不低于 4 张 / 2 对）。
//   第 1 关保持 2 种元素零障碍不变（D26 前 60 秒原则）；图标从 L4 起穿插出现。
module.exports = [
  // 第1关：6×4 网格（24 格 / 30 张牌），2 种元素，快速上手
  { level: 1, cols: 6, rows: 4, elements: [['letter_01', 16], ['letter_02', 14]] },
  // 第2关：6×5 网格（30 格 / 38 张牌），**认全第一个字母组 ཀ ཁ ག ང**，并**首次出现冰霜**
  //   —— 第 1 关（2 种元素、无机制）与第 2 关之间必须有「新东西」，
  //   否则新手会认为「跟上一关一模一样」。2 块冰霜占 30 格的 6.7%，远低于 D23 的 25% 上限。
  //   字母配比 10/10/10/8：新出现的 ང 给最少，玩家不需要在一个新字母上烧太多注意力。
  { level: 2, cols: 6, rows: 5, elements: [['letter_01', 10], ['letter_02', 10], ['letter_03', 10], ['letter_04', 8]], obstacles: { frost: 2 } },
  // 第3关：8×4 网格（32 格 / 40 张牌），引入 ཅ ཆ，冰霜增至 3 块
  { level: 3, cols: 8, rows: 4, elements: [['letter_01', 8], ['letter_02', 8], ['letter_03', 6], ['letter_04', 6], ['letter_05', 6], ['letter_06', 6]], obstacles: { frost: 3 } },
  // 第4关：8×4 网格（32 格 / 40 张牌），引入 ཇ ཉ 与吉祥结图标（icon_01）
  { level: 4, cols: 8, rows: 4, elements: [['letter_02', 6], ['letter_03', 6], ['letter_05', 6], ['letter_06', 4], ['letter_07', 6], ['letter_08', 6], ['icon_01', 6]] },
  // 第5关：8×5 网格（40 格 / 50 张牌），引入舌尖音组 ཏ ཐ ད，冰霜增多
  { level: 5, cols: 8, rows: 5, elements: [['letter_03', 8], ['letter_04', 6], ['letter_07', 8], ['letter_08', 6], ['letter_09', 6], ['letter_10', 8], ['letter_11', 8]], obstacles: { frost: 5 } },
  // 第6关：6×8 网格（48 格 / 60 张牌），引入 ན པ ཕ，首次出现藏式木箱
  { level: 6, cols: 6, rows: 8, elements: [['letter_07', 8], ['letter_08', 8], ['letter_09', 6], ['letter_10', 6], ['letter_11', 6], ['letter_12', 10], ['letter_13', 8], ['letter_14', 8]], obstacles: { frost: 4, crate: 2, crateHp: 1 } },
  // 第7关：6×8 网格（48 格 / 60 张牌），引入 བ མ ཙ 与青稞图标（icon_02）
  { level: 7, cols: 6, rows: 8, elements: [['letter_09', 6], ['letter_10', 6], ['letter_11', 6], ['letter_12', 6], ['letter_13', 6], ['letter_14', 6], ['letter_15', 6], ['letter_16', 6], ['letter_17', 6], ['icon_02', 6]], obstacles: { frost: 6 } },
  // 第8关：6×8 网格（48 格 / 60 张牌），引入 ཚ ཛ ཝ，木箱需破两次
  { level: 8, cols: 6, rows: 8, elements: [['letter_12', 6], ['letter_13', 6], ['letter_14', 6], ['letter_15', 6], ['letter_16', 6], ['letter_17', 6], ['letter_18', 6], ['letter_19', 6], ['letter_20', 6], ['icon_01', 6]], obstacles: { frost: 6, crate: 3, crateHp: 2 } },
  // 第9关：6×8 网格（48 格 / 60 张牌），引入 ཞ ཟ འ ཡ + 雪山图标（icon_03），首次出现绳结
  { level: 9, cols: 6, rows: 8, elements: [['letter_17', 6], ['letter_18', 6], ['letter_19', 6], ['letter_20', 6], ['letter_21', 6], ['letter_22', 6], ['letter_23', 6], ['letter_24', 6], ['icon_02', 6], ['icon_03', 6]], obstacles: { frost: 6, crate: 2, crateHp: 2, rope: 2 } },
  // 第10关（最终关）：6×8 网格（48 格 / 60 张牌），压轴引入最后六个字母 ར ལ ཤ ས ཧ ཨ + 全部 4 个图标
  //   10 种元素 × 最少 4 张 → 单种元素密度全关最低，找对最难；补充池 12 张也是全关最多
  { level: 10, cols: 6, rows: 8, elements: [['letter_25', 8], ['letter_26', 8], ['letter_27', 8], ['letter_28', 8], ['letter_29', 6], ['letter_30', 6], ['icon_01', 4], ['icon_02', 4], ['icon_03', 4], ['icon_04', 4]], obstacles: { frost: 8, crate: 2, crateHp: 2, rope: 2 } }
];
