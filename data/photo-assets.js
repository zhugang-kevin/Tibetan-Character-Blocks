// data/photo-assets.js — 真实场景照片清单（由 scripts/prepare-assets.py --scene 自动生成/更新）
//
// 用途（用户 2026-10-07 反馈「背景好假」）：把页面底图从程序渐变换成**真实照片**，
//   照片之上仍保留既有的六层结构与**夜色色罩（.sc-night）**——照片被压暗、去艳，
//   不会抢内容；文字/卡片的可读性由色罩与面板保证（D32 对比度门禁不受影响）。
//
// 键 = 页面；值 = 小程序内路径。空值 = 该页不启用照片层（保持现有渐变底，零回归）。
//   home → 首页（藤蔓地图/五地剪影之上）
//   game → 游戏页（盘面背后）
//
// 生产流程：按 docs/asset-spec-images.md「G 组」生成照片 → 放进 assets-src/scene/ →
//   python scripts/prepare-assets.py --scene（自动降饱和/压暗/压缩/命名 + 重写本文件）
module.exports = {
  home: '',
  game: ''
};
