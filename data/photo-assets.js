// data/photo-assets.js — 真实场景照片清单（由 scripts/prepare-assets.py --scene 自动生成）
// 空字符串 = 该页不启用照片层（保持现有渐变底，零回归）。
module.exports = {
  home: '/images/scene/home.jpg',
  game: '/images/scene/game.jpg',
  // 2026-10-17（D129）出处已查证：四张**全部为我方 ImageGen 生成**（无第三方版权），
  //   证据写入 docs/photo-attribution.json（含生成工具 / 时间 / 提交号 / 水印处理）。
  //   ⚠️ monastery 是宗教实景：可作文化页装饰，**不得**用于商城页或商品页（88 号文 第 2 条，
  //   由 scripts/test-photo-provenance.js §3 机械检查）。
  bodhi: '/images/scene/bodhi.jpg',
  monastery: '/images/scene/monastery.jpg',
};