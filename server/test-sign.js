// server/test-sign.js — 签名算法回归测试（D91）
//
// ## 为什么要有它
//   支付签名算错 = 100% 支付失败（-15005/-15006），而且是**上线后才暴露**。
//   所以必须有一个**不依赖任何凭证**的测试：用固定输入 + 固定期望值，
//   把算法钉死；将来任何人改动 sign.js，只要算法错了这里立刻红。
//
// ## 期望值从哪来
//   用**独立实现**（Python hashlib/hmac）按官方公式复算得到，两次结果逐字符一致：
//     官方公式：paySig   = to_hex(hmac_sha256(appKey, 'requestVirtualPayment&' + signData))
//               signature = to_hex(hmac_sha256(sessionKey, signData))
//   来源：腾讯云官方文档《Signature and Verification》
//
// 用法：node server/test-sign.js

'use strict';
const assert = require('assert');
const sign = require('./sign');

const KEY = 'TEST_APPKEY_123';
const SK = 'TEST_SESSIONKEY_456';
// 与官方文档示例**同构**的 signData（键顺序一致）
const EXPECTED_SIGN_DATA = '{"offerId":"123","buyQuantity":1,"env":0,"currencyType":"CNY",' +
  '"productId":"testproductId","goodsPrice":10,"outTradeNo":"xxxxxx","attach":"testdata"}';
// 由独立实现（Python hmac/hashlib）复算得到
const EXPECTED_PAY_SIG = '3e7c275bdf9cf5302e1928076df06120a92e21330274aa269978ad723dd52ced';
const EXPECTED_SIGNATURE = '0fa632fbe405cc2a38f44485546928f74bf07e3191a7db88be25d2e17823b557';

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('  ✓ ' + name); pass++; }
  catch (e) { console.log('  ✗ ' + name + ' —— ' + e.message); fail++; }
}

console.log('虚拟支付签名回归测试');

t('signData 键顺序与官方示例逐字一致', () => {
  const sd = sign.buildSignData({
    offerId: '123', env: 0, productId: 'testproductId',
    goodsPrice: 10, outTradeNo: 'xxxxxx', attach: 'testdata'
  });
  assert.strictEqual(sd, EXPECTED_SIGN_DATA);
});

t('paySig 与独立实现一致（官方公式）', () => {
  assert.strictEqual(sign.calcPaySig(EXPECTED_SIGN_DATA, KEY), EXPECTED_PAY_SIG);
});

t('signature 与独立实现一致（官方公式）', () => {
  assert.strictEqual(sign.calcSignature(EXPECTED_SIGN_DATA, SK), EXPECTED_SIGNATURE);
});

t('uri 带参数会被剥掉（官方点名过的坑）', () => {
  // /xpay/query_order?a=1 与 /xpay/query_order 必须算出同一个签名
  const a = sign.calcApiPaySig('/xpay/query_order?a=1', '{"a":1}', KEY);
  const b = sign.calcApiPaySig('/xpay/query_order', '{"a":1}', KEY);
  assert.strictEqual(a, b);
});

t('回调验签：正确签名通过', () => {
  const ev = 'xpay_goods_deliver_notify', pl = '{"OutTradeNo":"x"}';
  const gs = sign.hmacSha256Hex(KEY, ev + '&' + pl);
  assert.strictEqual(sign.verifyPayEventSig(ev, pl, KEY, gs), true);
});

t('回调验签：错误签名被拒', () => {
  assert.strictEqual(sign.verifyPayEventSig('ev', 'pl', KEY, 'deadbeef'), false);
});

t('回调验签：payload 被篡改即被拒', () => {
  const ev = 'xpay_goods_deliver_notify', pl = '{"OutTradeNo":"x"}';
  const gs = sign.hmacSha256Hex(KEY, ev + '&' + pl);
  assert.strictEqual(sign.verifyPayEventSig(ev, pl + ' ', KEY, gs), false);
});

t('回调验签：缺签名不误放行', () => {
  assert.strictEqual(sign.verifyPayEventSig('ev', 'pl', KEY, ''), false);
});

console.log('');
console.log('通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
