#!/usr/bin/env node
/**
 * scripts/test-reconcile.js — R13：订单 / 礼物对账的验收
 *
 * 覆盖五类异常与两类"正常"：
 *   正常：已付已发有礼物 / 自购（无收礼人）不进收礼箱
 *   异常：已付未发 / 已发无礼物 / 礼物无订单 / 重复入账 / 礼物先于发货
 *
 * 用法：node scripts/test-reconcile.js
 */
'use strict';

const { reconcile } = require('./lib/reconcile.js');

let PASS = 0, FAIL = 0;
const fails = [];
function chk(name, cond, detail) {
  if (cond) { PASS++; console.log('  ✓ ' + name); }
  else { FAIL++; fails.push(name + (detail ? '：' + detail : '')); console.log('  ✗ ' + name + (detail ? ' → ' + detail : '')); }
}
function types(r) { return r.anomalies.map(a => a.type).sort().join(','); }

const O = (id, opt) => Object.assign({ out_trade_no: id, status: 'PAID', delivered: 1, attach: JSON.stringify({ toUid: 'u1' }) }, opt || {});
const G = (id) => ({ out_trade_no: id });

console.log('\n==========================================');
console.log('  R13 订单 / 礼物对账');
console.log('==========================================\n');

let r = reconcile({ orders: [O('T1')], gifts: [G('T1')] });
chk('正常：已付已发有礼物 → 无异常', r.ok && r.anomalies.length === 0, types(r));

r = reconcile({ orders: [O('T2', { attach: '{}' })], gifts: [] });
chk('正常：自购（无收礼人）不进收礼箱 → 不算异常', r.ok, types(r));

r = reconcile({ orders: [O('T3', { delivered: 0 })], gifts: [] });
chk('异常：已支付未发货', types(r) === 'paid_undelivered', types(r));

r = reconcile({ orders: [O('T4')], gifts: [] });
chk('异常：已标已发但收礼箱没有礼物', types(r) === 'delivered_no_gift', types(r));

r = reconcile({ orders: [], gifts: [G('T5')] });
chk('异常：收礼箱有礼物但订单表没有', types(r) === 'gift_no_order', types(r));

r = reconcile({ orders: [O('T6')], gifts: [G('T6'), G('T6')] });
chk('异常：同一订单重复入账', types(r) === 'duplicate_gift', types(r));

r = reconcile({ orders: [O('T7', { delivered: 0 })], gifts: [G('T7')] });
chk('异常：礼物先于发货（事务外写入）',
  types(r) === 'gift_before_delivery,paid_undelivered', types(r));

r = reconcile({ orders: [{ out_trade_no: 'T8', status: 'PENDING', delivered: 0, attach: '{}' }], gifts: [] });
chk('正常：未支付订单不参与对账', r.ok, types(r));

r = reconcile({ orders: [], gifts: [] });
chk('空库 → 无异常', r.ok && r.counts.orders === 0 && r.counts.gifts === 0);

r = reconcile({ orders: [O('T9', { attach: '{bad json' })], gifts: [] });
chk('坏 attach 不炸（当无收礼人处理）', r.ok, types(r));

console.log('\n  通过: ' + PASS + ' | 失败: ' + FAIL);
if (FAIL) {
  console.log('');
  fails.forEach(f => console.log('   - ' + f));
  console.log('\n✗ 对账口径不成立 —— 上线后钱/礼对不上也发现不了。');
} else {
  console.log('  ✓ 对账口径成立：五类异常都能抓，自购与未支付不误报。');
}
console.log('==========================================');
process.exit(FAIL ? 1 : 0);
