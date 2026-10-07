// data/icon-assets.js — 真实图片图标清单（由 scripts/prepare-assets.py 自动生成/更新）
//
// 键 = 元素 id（icon_01..icon_04）；值 = 小程序内路径（如 '/images/icons/icon_01.png'）。
// 规则（D46，2026-10-07 用户反馈「线稿认不出」后引入）：
//   · 清单里有的元素 → 直接用真实图片，**三个墨色变体（id / |lite / |gold）共用同一张**：
//     因为新图是「自带暖色底 + 深棕描边环」的徽章，在任何牌面底色上都自带对比，不再依赖描边换色；
//   · 清单里没有的 → 回退到 utils/icons.js 的程序线稿（旧行为，保证二者可共存、渐进替换）。
//
// 生产流程：按 docs/asset-spec-images.md 生成图片 → 放进 assets-src/icons/ →
//   python scripts/prepare-assets.py --icons（自动蒙版/压缩/命名 + 重写本文件）
module.exports = {};
