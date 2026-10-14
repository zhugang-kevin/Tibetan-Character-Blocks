// utils/gift-view.js — 礼物展示口径（D112）
//
// ## 为什么单独一个文件
//   同一件礼物在**两个地方**要给人看：送礼页（pages/gift）与收礼箱（文化护照）。
//   两处各写一份文案 = 迟早漂移（「点一盏酥油灯」在一处改了，另一处还是旧的）。
//   与 utils/tibetan-name.js 那种「单一事实源」的做法同源：文案也只准有一份。
//
// ## 为什么与 utils/payment.js#GIFTS 分开
//   payment 里是**官方道具口径**：productId 必须与 mp 后台逐字一致、价格单位是分。
//   这里是**给人看的口径**：图标、文化化名称、一句说明。
//   两者靠 productId 对应 —— 键不存在时给一个不撒谎的兜底（见 viewOf）。
var GIFT_VIEW = {
  tib_lamp_1: { icon: '🕯️', name: '点一盏酥油灯', desc: '为 TA 点一盏灯，照亮这一程' },
  tib_blessing_3: { icon: '📜', name: '送一句藏文祝福', desc: '挑一句藏文，随卡送到 TA 手上' },
  tib_khata_6: { icon: '🤍', name: '献一条哈达', desc: '最郑重的敬意，也是最轻的礼' },
  tib_name_99: { icon: '🔤', name: '为 TA 取一个藏族名字', desc: '按 TA 的名字取一个藏族名字，附词义' }
};
function viewOf(productId) {
  return GIFT_VIEW[productId] || { icon: '🎁', name: '一份祝福', desc: '' };
}
// 价格以「分」存储（与官方 goodsPrice 同口径），展示时转元。
// 990 分 = ¥9.9：末尾的 0 去掉，不显示成 ¥9.90（实付与后台一致，显示也要自然）。
function fmtPrice(cents) {
  var n = (cents || 0) / 100;
  return '¥' + (Math.round(n * 100) % 100 === 0 ? String(Math.round(n)) : String(n));
}
module.exports = {
  GIFT_VIEW: GIFT_VIEW,
  viewOf: viewOf,
  fmtPrice: fmtPrice
};
