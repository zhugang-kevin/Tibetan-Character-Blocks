// server/sign.js — 虚拟支付双签名 + 回调验签（D91）
//
// ## 算法出处（**官方，非博客**）
//   ① 支付双签名 —— 腾讯云官方文档《Signature and Verification》
//      https://www.tencentcloud.com/document/product/1219/69337
//        支付签名：paySig = to_hex(hmac_sha256(appKey, uri + '&' + signData))
//        用户态签名：signature = to_hex(hmac_sha256(sessionKey, signData))
//        回调验签：pay_event_sig = to_hex(hmac_sha256(app_key, event + '&' + payload))
//   ② 与微信开放社区《小程序虚拟支付接入指引》的公式**逐字一致**（两个独立官方来源交叉验证）
//
// ## 三个极易错的地方（都是官方/实战文档点名的坑）
//   P1. **uri 不能带参数**。`/xpay/query_order?a=1` 与 `/xpay/query_order` 算出来是两个结果。
//   P2. **signData 必须与前端发出去的字符串一字不差**（含空格与换行）。
//       所以官方建议：**由服务端生成 signData，原样下发给前端透传**，绝不各自拼装。
//   P3. **键顺序不能乱**，且 AppKey 必须与 env 匹配（沙箱环境配现网 key 是常见错误）。
//       同理 —— **sessionKey 必须是 wx.login 换来的最新那份**，用旧的 signature 直接失败（错误码 -15007）。
//
// ⚠️ 上线前必做：把官方示例里的 uri/postBody/appKey 拿来跑一遍，
//    **确认本实现的输出与官方示例完全一致**，再往下接业务。不一致就是算法或编码问题。

'use strict';
const crypto = require('crypto');

// 客户端下单场景，uri 固定为这个常量（官方规定，不带任何参数）
const URI_REQUEST_VIRTUAL_PAYMENT = 'requestVirtualPayment';

function hmacSha256Hex(key, msg) {
  return crypto.createHmac('sha256', key).update(msg, 'utf8').digest('hex');
}

/**
 * 支付签名 paySig —— key 是 AppKey（env 决定用现网还是沙箱）
 * @param {string} signData 与前端发送的字符串**完全一致**
 * @param {string} appKey   env=0 → 现网 AppKey；env=1 → 沙箱 AppKey
 */
function calcPaySig(signData, appKey) {
  return hmacSha256Hex(appKey, URI_REQUEST_VIRTUAL_PAYMENT + '&' + signData);
}

/** 用户态签名 signature —— key 是 sessionKey（必须是 wx.login 换来的最新一份） */
function calcSignature(signData, sessionKey) {
  return hmacSha256Hex(sessionKey, signData);
}

/**
 * 服务端 API 签名（query_order 等 /xpay/* 接口）
 * ⚠️ uri 不带问号参数（坑 P1）；postBody 必须与真正发出的 HTTP body 完全一致。
 */
function calcApiPaySig(uri, postBody, appKey) {
  const cleanUri = String(uri).split('?')[0];   // 强制去掉参数
  return hmacSha256Hex(appKey, cleanUri + '&' + postBody);
}
function calcApiSignature(postBody, sessionKey) {
  return hmacSha256Hex(sessionKey, postBody);
}

/**
 * 发货回调验签。官方公式：pay_event_sig = hmac_sha256(appKey, event + '&' + payload)
 * @param {string} event   推送事件类型（如 xpay_goods_deliver_notify）
 * @param {string} payload 推送的原始 payload 字符串（**原样**，不要重新序列化）
 * @param {string} appKey  虚拟支付密钥
 * @returns {boolean}
 */
function verifyPayEventSig(event, payload, appKey, receivedSig) {
  const expect = hmacSha256Hex(appKey, event + '&' + payload);
  // 定长比较，避免时序侧信道
  const a = Buffer.from(expect, 'utf8');
  const b = Buffer.from(String(receivedSig || ''), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * 组装 signData。**由服务端生成、原样下发**（坑 P2）——
 * 前端只负责透传，绝不自己拼装。
 * 键顺序即下面这个顺序，不要改（坑 P3）。
 */
function buildSignData(o) {
  return JSON.stringify({
    offerId: o.offerId,
    buyQuantity: o.buyQuantity || 1,
    env: o.env,                          // 0 正式 / 1 沙箱
    currencyType: 'CNY',
    productId: o.productId,
    goodsPrice: o.goodsPrice,            // 单位：分，必须与 mp 后台道具价格一致（否则 -15013）
    outTradeNo: o.outTradeNo,
    attach: o.attach                     // 透传数据，发货通知会原样带回
  });
}

module.exports = {
  URI_REQUEST_VIRTUAL_PAYMENT,
  hmacSha256Hex,
  calcPaySig,
  calcSignature,
  calcApiPaySig,
  calcApiSignature,
  verifyPayEventSig,
  buildSignData
};
