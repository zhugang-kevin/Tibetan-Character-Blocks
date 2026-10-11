// server/store.js — 订单持久化（SQLite，Node 内置，**零依赖**）D92
//
// ## 为什么用它，而不是别的
//   上一版订单存在内存 `Map` 里 —— **重启即丢**：微信回调重放时会找不到订单，
//   或者补发货时无从判断是否已发。支付数据不能这么存。
//
//   候选与结论（详见 docs/data-storage-options.md）：
//     · **SQLite（本文件）** —— 免费（Node 内置 `node:sqlite`，无需装包）、**ACID 事务**、
//       **零锁定**（就是一个文件，随时可导出/搬迁）、**零额外服务商**。
//       我们的量级（一个小程序的订单）远在 SQLite 的舒适区内。
//     · 托管云数据库 —— 免运维，但支付订单必须在**服务端**读写（官方红线：签名只能在服务端算），
//       而托管方案面向的是「App 端 + RLS 用户隔离」，不是「服务端持有凭证访问」。
//     · 自建 Postgres/MySQL —— 对我们这个量级是杀鸡用牛刀，且多一个要运维的东西。
//
//   ⚠️ `node:sqlite` 在 Node 22 仍是**实验特性**（会打 ExperimentalWarning）。
//      若你的部署环境 Node < 22.5，改用 `better-sqlite3`（同样是单文件，API 几乎一致）。
//
// ## 幂等是**靠数据库约束保证**的，不是靠代码自觉
//   `out_trade_no` 上有 UNIQUE 约束 —— 重复下单在数据库层就被拒。
//   发货用 `UPDATE ... WHERE delivered = 0` 并检查受影响行数 —— 并发重放也只有一次生效。

'use strict';
const path = require('path');
const fs = require('fs');

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
  throw new Error(
    'node:sqlite 不可用（需要 Node >= 22.5）。' +
    '请改用 better-sqlite3，或在支持的 Node 版本上运行。原始错误: ' + e.message
  );
}

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'pay.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
// WAL：读写并发更稳，且崩溃后更容易恢复（支付场景值得）
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    out_trade_no TEXT PRIMARY KEY,          -- 主键 = 天然幂等（重复下单直接拒）
    openid       TEXT NOT NULL,
    product_id   TEXT NOT NULL,
    amount       INTEGER NOT NULL,          -- 单位：分
    status       TEXT NOT NULL DEFAULT 'PENDING',   -- PENDING / PAID / CLOSED
    attach       TEXT,
    delivered    INTEGER NOT NULL DEFAULT 0,        -- 0/1，发货幂等的依据
    created_at   INTEGER NOT NULL,
    paid_at      INTEGER,
    delivered_at INTEGER
  )
`);

// session_key 必须存最新的（旧的算 signature 会 -15007）；单独一张表便于覆盖更新
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    openid      TEXT PRIMARY KEY,
    session_key TEXT NOT NULL,
    updated_at  INTEGER NOT NULL
  )
`);

// D94：用户学习进度（甲类数据）。**隔离靠 openid 条件**（托管方案的 RLS 我们这里没有，
//   用「服务端不信任客户端 openid + 每条 SQL 必带 openid 条件」来替代，并由门禁看守）。
db.exec(`
  CREATE TABLE IF NOT EXISTS progress (
    openid      TEXT PRIMARY KEY,      -- 主键 = 一个人一条，天然幂等
    done_stages TEXT,
    lamps       INTEGER NOT NULL DEFAULT 0,
    cards       INTEGER NOT NULL DEFAULT 0,
    owner_name  TEXT,
    updated_at  INTEGER NOT NULL
  )
`);

const stmt = {
  insertOrder: db.prepare(`INSERT INTO orders
    (out_trade_no, openid, product_id, amount, attach, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`),
  getOrder: db.prepare('SELECT * FROM orders WHERE out_trade_no = ?'),
  markPaid: db.prepare(`UPDATE orders SET status='PAID', paid_at=?
    WHERE out_trade_no=? AND status='PENDING'`),
  // 幂等的关键：只有 delivered=0 才会被更新，受影响行数就是「这次真的发货了吗」
  markDelivered: db.prepare(`UPDATE orders SET delivered=1, delivered_at=?
    WHERE out_trade_no=? AND delivered=0`),
  upsertSession: db.prepare(`INSERT INTO sessions (openid, session_key, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(openid) DO UPDATE SET session_key=excluded.session_key, updated_at=excluded.updated_at`),
  getSession: db.prepare('SELECT * FROM sessions WHERE openid = ?'),
  // 兜底查单用：找出「已支付但未发货」的订单（回调丢失时它们会一直挂着）
  pendingDelivery: db.prepare(`SELECT * FROM orders
    WHERE status='PAID' AND delivered=0 ORDER BY paid_at LIMIT ?`),
  // 以下三条**每一条都带 openid 条件** —— 这是自建方案替代 RLS 的隔离手段
  upsertProgress: db.prepare(`INSERT INTO progress (openid, done_stages, lamps, cards, owner_name, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(openid) DO UPDATE SET
      done_stages=excluded.done_stages, lamps=excluded.lamps,
      cards=excluded.cards, owner_name=excluded.owner_name, updated_at=excluded.updated_at`),
  getProgress: db.prepare('SELECT done_stages, lamps, cards, owner_name, updated_at FROM progress WHERE openid = ?')
};

function createOrder(o) {
  stmt.insertOrder.run(o.outTradeNo, o.openid, o.productId, o.amount,
    o.attach || '', Date.now());
  return getOrder(o.outTradeNo);
}
function getOrder(outTradeNo) { return stmt.getOrder.get(outTradeNo) || null; }

/** @returns {boolean} 本次是否真的把它标记为已支付（false = 之前就已经是 PAID） */
function markPaid(outTradeNo) {
  return stmt.markPaid.run(Date.now(), outTradeNo).changes > 0;
}

/**
 * 发货标记。**这是防重复发货的唯一权威**。
 * @returns {boolean} true = 本次由我发货；false = 之前已发过（微信重推）→ 直接回成功，不要再发
 */
function claimDelivery(outTradeNo) {
  return stmt.markDelivered.run(Date.now(), outTradeNo).changes > 0;
}

function saveSession(openid, sessionKey) {
  stmt.upsertSession.run(openid, sessionKey, Date.now());
}
function getSession(openid) {
  const r = stmt.getSession.get(openid);
  return r ? r.session_key : '';
}
function listPendingDelivery(limit) { return stmt.pendingDelivery.all(limit || 50); }

// 进度读写：**openid 由调用方从 code2Session 取**，绝不接受客户端传入的 openid
function saveProgress(openid, d) {
  if (!openid) throw new Error('saveProgress: openid 必填');
  stmt.upsertProgress.run(openid, d.doneStages || '', d.lamps | 0, d.cards | 0,
    d.ownerName || '', Date.now());
  return getProgress(openid);
}
function getProgress(openid) {
  if (!openid) throw new Error('getProgress: openid 必填');
  return stmt.getProgress.get(openid) || null;
}

module.exports = {
  DB_PATH,
  db,
  createOrder,
  getOrder,
  markPaid,
  claimDelivery,
  saveSession,
  getSession,
  listPendingDelivery,
  saveProgress,
  getProgress
};
