'use strict';
// server/orders.js — 实物订单（D176）
//
// ## 为什么单独一个文件
//   server/index.js 正被另一条线改着，我不碰它。这里做成**自包含模块**：
//   自带表结构、自带价格表、自带状态机；index.js 只要加三行挂上去即可。
//
// ## 三条铁律（对应 docs/ecommerce-compliance-runbook.md）
//   ① **金额只在服务端算**：前端只传 itemId + qty，价格从 PRODUCTS 取，绝不信任前端金额。
//   ② **状态机单向**：created → paid → shipped → done；跳步或回退一律拒（避免"没付就发"）。
//   ③ **幂等**：同一 outTradeNo 重复标记已付只生效一次（支付回调会重推）。
//
// ## 价格单位
//   全部用**分**（4900 = ¥49）。与虚拟支付保持同一口径，避免再出"元/分"事故。

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
const DB_PATH = process.env.ORDERS_DB || path.join(DB_DIR, 'orders.db');

// ── 商品表（服务端唯一事实源；前端橱窗只是展示）────────────────────
// 与 package-service 的展示一致，但**金额以这里为准**。
const PRODUCTS = {
  g1: { name: '迷你唐卡擦擦吊坠 · 绿度母', priceFen: 4900, stock: 10 },
  g2: { name: '迷你唐卡擦擦吊坠 · 白度母', priceFen: 5200, stock: 10 },
  g3: { name: '迷你唐卡擦擦吊坠 · 药师佛', priceFen: 5500, stock: 10 },
  g4: { name: '唐卡吊坠 · 双面彩绘', priceFen: 5900, stock: 10 },
  g5: { name: '唐卡吊坠 · 双面彩绘（加大）', priceFen: 6200, stock: 10 },
  g6: { name: '唐卡车挂 · 迷你成品', priceFen: 6500, stock: 10 },
  g7: { name: '唐卡吊坠礼盒 · 坠+绳+绒袋', priceFen: 6800, stock: 10 },
  g8: { name: '唐卡双坠组合 · 两枚一套', priceFen: 7000, stock: 10 },
  g9: { name: '唐卡小挂 · 加厚装裱款', priceFen: 7000, stock: 10 }
};

// 允许的状态迁移（单向，不可回退）
const NEXT = {
  created: ['paid', 'canceled'],
  paid: ['shipped', 'refunding'],
  shipped: ['done', 'refunding'],
  done: ['refunding'],
  refunding: ['refunded'],
  canceled: [],
  refunded: []
};

function open(dbPath) {
  const db = new DatabaseSync(dbPath || DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      out_trade_no TEXT PRIMARY KEY,
      item_id      TEXT NOT NULL,
      item_name    TEXT NOT NULL,
      qty          INTEGER NOT NULL,
      amount_fen   INTEGER NOT NULL,
      openid       TEXT,
      status       TEXT NOT NULL,
      tracking_no  TEXT,
      carrier      TEXT,
      aftersale    TEXT,
      created_at   INTEGER NOT NULL,
      paid_at      INTEGER,
      shipped_at   INTEGER
    );
    CREATE TABLE IF NOT EXISTS order_stock (
      item_id TEXT PRIMARY KEY,
      stock   INTEGER NOT NULL
    );
  `);
  const ins = db.prepare('INSERT OR IGNORE INTO order_stock (item_id, stock) VALUES (?, ?)');
  Object.keys(PRODUCTS).forEach(id => ins.run(id, PRODUCTS[id].stock));
  return db;
}

const now = () => Date.now();

function newTradeNo() {
  // 时间戳 + 4 位随机；够用且可读，不要用 uuid（客服听不清）
  return 'K' + now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

function stockOf(db, itemId) {
  const r = db.prepare('SELECT stock FROM order_stock WHERE item_id = ?').get(itemId);
  return r ? r.stock : 0;
}

// ── 建单：金额由服务端算，库存不足直接拒 ────────────────────────────
function createOrder(db, { itemId, qty, openid }) {
  const p = PRODUCTS[itemId];
  if (!p) return { ok: false, reason: 'unknown_item' };
  const n = Number(qty);
  if (!Number.isInteger(n) || n < 1 || n > 5) return { ok: false, reason: 'bad_qty' };
  if (stockOf(db, itemId) < n) return { ok: false, reason: 'out_of_stock' };

  const no = newTradeNo();
  const amount = p.priceFen * n;                 // ← 唯一金额来源
  db.prepare(`INSERT INTO orders
    (out_trade_no, item_id, item_name, qty, amount_fen, openid, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'created', ?)`)
    .run(no, itemId, p.name, n, amount, openid || '', now());
  db.prepare('UPDATE order_stock SET stock = stock - ? WHERE item_id = ?').run(n, itemId);
  return { ok: true, outTradeNo: no, amountFen: amount, amountYuan: (amount / 100).toFixed(2) };
}

function getOrder(db, no) {
  const r = db.prepare('SELECT * FROM orders WHERE out_trade_no = ?').get(no);
  if (!r) return null;
  return {
    outTradeNo: r.out_trade_no, itemId: r.item_id, itemName: r.item_name,
    qty: r.qty, amountFen: r.amount_fen, amountYuan: (r.amount_fen / 100).toFixed(2),
    status: r.status, trackingNo: r.tracking_no, carrier: r.carrier,
    aftersale: r.aftersale, createdAt: r.created_at, paidAt: r.paid_at, shippedAt: r.shipped_at
  };
}

// ── 状态迁移（唯一入口，防止跳步）────────────────────────────────
function transition(db, no, to, extra) {
  const r = db.prepare('SELECT status FROM orders WHERE out_trade_no = ?').get(no);
  if (!r) return { ok: false, reason: 'not_found' };
  // 幂等：已经在目标状态 = 直接成功（支付回调会重复推送，绝不能报错让平台一直重试）
  if (r.status === to) return { ok: true, already: true };
  if (!(NEXT[r.status] || []).includes(to)) {
    return { ok: false, reason: 'illegal_transition', from: r.status, to };
  }
  const ts = now();
  if (to === 'paid') {
    db.prepare('UPDATE orders SET status = ?, paid_at = ? WHERE out_trade_no = ?').run(to, ts, no);
  } else if (to === 'shipped') {
    db.prepare('UPDATE orders SET status = ?, shipped_at = ?, tracking_no = ?, carrier = ? WHERE out_trade_no = ?')
      .run(to, ts, (extra && extra.trackingNo) || '', (extra && extra.carrier) || '', no);
  } else if (to === 'refunding') {
    db.prepare('UPDATE orders SET status = ?, aftersale = ? WHERE out_trade_no = ?')
      .run(to, (extra && extra.reason) || '', no);
  } else {
    db.prepare('UPDATE orders SET status = ? WHERE out_trade_no = ?').run(to, no);
  }
  return { ok: true, from: r.status, to };
}

const markPaid = (db, no) => transition(db, no, 'paid');
const markShipped = (db, no, trackingNo, carrier) =>
  transition(db, no, 'shipped', { trackingNo, carrier });
const markDone = (db, no) => transition(db, no, 'done');
const requestRefund = (db, no, reason) => transition(db, no, 'refunding', { reason });
const markRefunded = (db, no) => transition(db, no, 'refunded');
const cancelOrder = (db, no) => transition(db, no, 'canceled');

function listByOpenid(db, openid, limit) {
  return db.prepare('SELECT out_trade_no FROM orders WHERE openid = ? ORDER BY created_at DESC LIMIT ?')
    .all(openid, limit || 20)
    .map(x => getOrder(db, x.out_trade_no));
}

// 只读：给后台看的库存
const listStock = db => Object.keys(PRODUCTS).map(id => ({
  itemId: id, name: PRODUCTS[id].name, stock: stockOf(db, id)
}));

module.exports = {
  PRODUCTS, NEXT, open,
  createOrder, getOrder, listByOpenid, listStock,
  markPaid, markShipped, markDone, requestRefund, markRefunded, cancelOrder
};
