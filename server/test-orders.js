'use strict';
// server/test-orders.js — 订单模块行为测试（D176）
//
// 只测**业务规则**，不测 HTTP：金额来源、库存、状态机、幂等。
// 这些是"收钱不出事"的底线，写错一条就会重复发货或超卖。

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const O = require('./orders');

const tmp = path.join(os.tmpdir(), 'orders-test-' + process.pid + '.db');
try { fs.unlinkSync(tmp); } catch (e) {}

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + ' —— ' + e.message); }
}

const db = O.open(tmp);

console.log('[1. 建单：金额只能来自服务端]');
t('正常建单，金额=单价×数量', () => {
  const r = O.createOrder(db, { itemId: 'g1', qty: 2, openid: 'u1' });
  assert.ok(r.ok);
  assert.strictEqual(r.amountFen, 4900 * 2);
  assert.strictEqual(r.amountYuan, '98.00');
});
t('前端夹带金额也不会被采信（只传 itemId/qty）', () => {
  const r = O.createOrder(db, { itemId: 'g2', qty: 1, openid: 'u1', amountFen: 1 });
  assert.strictEqual(r.amountFen, 5200, '金额被前端改小了');
});
t('未知商品被拒', () => {
  assert.strictEqual(O.createOrder(db, { itemId: 'nope', qty: 1 }).reason, 'unknown_item');
});
t('数量非法被拒（0 / 负数 / 小数 / 超 5）', () => {
  [0, -1, 1.5, 6].forEach(q => {
    assert.strictEqual(O.createOrder(db, { itemId: 'g1', qty: q }).reason, 'bad_qty', 'qty=' + q);
  });
});

console.log('[2. 库存：不能超卖]');
t('库存扣减正确', () => {
  const before = O.listStock(db).find(x => x.itemId === 'g3').stock;
  const r = O.createOrder(db, { itemId: 'g3', qty: 3 });
  assert.ok(r.ok);
  assert.strictEqual(O.listStock(db).find(x => x.itemId === 'g3').stock, before - 3);
});
t('库存不足直接拒，且不扣库存', () => {
  const before = O.listStock(db).find(x => x.itemId === 'g3').stock;
  // 单笔最多 5 件，先反复下单把库存压到 0
  let guard = 20;
  while (O.listStock(db).find(x => x.itemId === 'g3').stock > 0 && guard-- > 0) {
    O.createOrder(db, { itemId: 'g3', qty: 1 });
  }
  const left = O.listStock(db).find(x => x.itemId === 'g3').stock;
  assert.strictEqual(left, 0, '库存应为 0');
  const r = O.createOrder(db, { itemId: 'g3', qty: 1 });
  assert.strictEqual(r.reason, 'out_of_stock');
  assert.strictEqual(O.listStock(db).find(x => x.itemId === 'g3').stock, 0);
  assert.ok(before >= 0);
});

console.log('[3. 状态机：不能跳步、不能回退]');
const no = O.createOrder(db, { itemId: 'g4', qty: 1, openid: 'u2' }).outTradeNo;
t('未付款不能发货', () => {
  const r = O.markShipped(db, no, 'SF123', '顺丰');
  assert.strictEqual(r.reason, 'illegal_transition');
});
t('付款成功', () => assert.ok(O.markPaid(db, no).ok));
t('重复付款（回调重推）幂等', () => {
  const r = O.markPaid(db, no);
  assert.ok(r.ok);
  assert.ok(r.already || r.reason === 'illegal_transition');
  assert.strictEqual(O.getOrder(db, no).status, 'paid');
});
t('发货后单号落库', () => {
  assert.ok(O.markShipped(db, no, 'SF987654321', '顺丰').ok);
  const o = O.getOrder(db, no);
  assert.strictEqual(o.trackingNo, 'SF987654321');
  assert.strictEqual(o.carrier, '顺丰');
});
t('已发货不能回退成已付款', () => {
  const r = O.markPaid(db, no);
  assert.strictEqual(r.reason, 'illegal_transition');
});
t('签收 → 可申请退款', () => {
  assert.ok(O.markDone(db, no).ok);
  assert.ok(O.requestRefund(db, no, '尺寸不符').ok);
  assert.strictEqual(O.getOrder(db, no).status, 'refunding');
});
t('已退款是终态', () => {
  assert.ok(O.markRefunded(db, no).ok);
  assert.strictEqual(O.cancelOrder(db, no).reason, 'illegal_transition');
});

console.log('[4. 查询]');
t('按 openid 查单，按时间倒序', () => {
  const list = O.listByOpenid(db, 'u1');
  assert.ok(list.length >= 2);
  assert.ok(list[0].createdAt >= list[list.length - 1].createdAt);
});
t('不存在的单返回 null', () => assert.strictEqual(O.getOrder(db, 'NOPE'), null));

console.log('');
console.log(`通过 ${pass} / 失败 ${fail}`);
try { fs.unlinkSync(tmp); } catch (e) {}
process.exit(fail === 0 ? 0 : 1);
