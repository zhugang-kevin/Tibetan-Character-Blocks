// scripts/lib/reconcile.js — R13：订单 / 礼物对账（纯函数）
//
// ## 为什么要有它
//   R13 的原问题是「模拟成功 ≠ 真实回款」。真实回款需要商户号（外部），
//   但**对账本身**是代码能做的：把 orders 与 gifts 两张表对一遍，找出四类异常。
//   上线后每天跑一次，就能在用户投诉前发现「钱收了、礼没到」。
//
// ## 四类异常
//   paid_undelivered    已支付但未标已发（回调丢失 / 发货失败）
//   delivered_no_gift   已标已发、但收礼箱没有对应礼物（有收礼人时才是异常）
//   gift_no_order       收礼箱里有礼物，但订单表里没有（脏数据 / 串库）
//   duplicate_gift      同一个订单号在收礼箱里出现多次（幂等被绕过）
//   gift_before_delivery 礼物已入账、订单却还没标已发（事务外的写入）
//
// ## 口径
//   · 「没有收礼人」的订单（自购）**不进收礼箱是正常的**，不算 delivered_no_gift。
//   · 只看 `status === 'PAID'` 的订单；PENDING/CLOSED 不参与。

'use strict';

function parseRecipient(order) {
  try {
    var a = JSON.parse((order && order.attach) || '{}');
    return String(a.toUid || '');
  } catch (e) { return ''; }
}

/**
 * @param {{orders:object[], gifts:object[]}} data
 * @returns {{ok:boolean, anomalies:object[], counts:object}}
 */
function reconcile(data) {
  var orders = (data && data.orders) || [];
  var gifts = (data && data.gifts) || [];
  var anomalies = [];

  var byOrder = {};
  orders.forEach(function (o) { if (o && o.out_trade_no) byOrder[o.out_trade_no] = o; });

  var giftCount = {};
  gifts.forEach(function (g) {
    if (!g || !g.out_trade_no) return;
    giftCount[g.out_trade_no] = (giftCount[g.out_trade_no] || 0) + 1;
  });

  orders.forEach(function (o) {
    if (!o || !o.out_trade_no) return;
    if (o.status !== 'PAID') return;
    var hasGift = !!giftCount[o.out_trade_no];
    if (!o.delivered) {
      anomalies.push({ type: 'paid_undelivered', order: o.out_trade_no });
      // 订单还没标已发，礼物却已入账 → 事务外的写入（R12 之前可能出现）
      if (hasGift) anomalies.push({ type: 'gift_before_delivery', order: o.out_trade_no });
      return;
    }
    var toUid = parseRecipient(o);
    if (!hasGift && toUid) {
      anomalies.push({ type: 'delivered_no_gift', order: o.out_trade_no, toUid: toUid });
    }
  });

  gifts.forEach(function (g) {
    if (!g || !g.out_trade_no) return;
    if (!byOrder[g.out_trade_no]) {
      anomalies.push({ type: 'gift_no_order', order: g.out_trade_no });
    }
  });

  Object.keys(giftCount).forEach(function (k) {
    if (giftCount[k] > 1) {
      anomalies.push({ type: 'duplicate_gift', order: k, count: giftCount[k] });
    }
  });

  return {
    ok: anomalies.length === 0,
    anomalies: anomalies,
    counts: { orders: orders.length, gifts: gifts.length }
  };
}

module.exports = { reconcile: reconcile, parseRecipient: parseRecipient };
