// data/regions.js — 七地剪影（首页藤蔓地图：随进度点亮）
// 未解锁地区在首页显示为灰色剪影；解锁后点亮。
//
// ⚠️ 为什么分两套解锁口径（2026-10-17）：
//   原来的 5 个地区靠老线 10 关发放（每区 2 关 = 1..10，**正好排满**）。
//   要做满「七地市」就还差昌都、那曲 —— 但**老线 10 关已经没有位置**，
//   而关卡是受指纹保护的资产（改它要走 --update --reason 流程）。
//   → 所以新增的两个地区**不改关卡**，改为按**学习线**进度解锁：
//     `learnFrom: 5` = 学完 L1–L5（第 50 课）解锁；`learnFrom: 10` = 学完 L1–L10。
//   两套口径并存：`from/to`（老线关卡）与 `learnFrom`（学习线级数）。
module.exports = [
  { id: 'lhasa', name: '拉萨', spot: '八廓街', from: 1, to: 2, shape: 'potala', color: '#B7950B' },
  { id: 'nyingchi', name: '林芝', spot: '雅鲁藏布', from: 3, to: 4, shape: 'forest', color: '#1E8449' },
  { id: 'shannan', name: '山南', spot: '雅砻河谷', from: 5, to: 6, shape: 'valley', color: '#2471A3' },
  { id: 'shigatse', name: '日喀则', spot: '扎什伦布', from: 7, to: 8, shape: 'monastery', color: '#C0392B' },
  { id: 'ngari', name: '阿里', spot: '冈仁波齐', from: 9, to: 10, shape: 'snow', color: '#5D6D7E' },
  // 学习线解锁（不占关卡）
  {
    id: 'chamdo', name: '昌都', spot: '强巴林寺', learnFrom: 5,
    desc: '藏东门户，强巴林寺的诵经声与澜沧江的晨雾',
    shape: 'monastery', color: '#8E44AD'
  },
  {
    id: 'nagqu', name: '那曲', spot: '萨普神山', learnFrom: 10,
    desc: '羌塘草原之上，萨普的雪峰终年不化',
    shape: 'snow', color: '#2E86C1'
  }
];
