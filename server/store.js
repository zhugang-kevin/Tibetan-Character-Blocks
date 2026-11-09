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

// D113 收礼地址：progress 上补一个匿名 uid 列。
//   为什么不是「uid 表」：uid 与 openid **一对一**（一个人就一个收礼地址），
//   多开一张表反而要维护一致性；直接在 progress 上加一列最省，也最少出错。
//   ⚠️ 老的库文件没有这一列 → 用 ALTER 补（已存在时 SQLite 会报错，吞掉即可）。
try { db.exec('ALTER TABLE progress ADD COLUMN uid TEXT'); } catch (e) { /* 已有该列 */ }
// R11：uid 必须**全局唯一**（一个收礼地址只属于一个人）。原先是普通索引 ——
//   两个 openid 能写同一个 uid，`openidOfUid` 只会随机返回一个 → 能越权读到别人的礼物。
//   迁移：历史重复的 uid 只保留最早一条（其余置 NULL；NULL 不参与 UNIQUE），再建**部分唯一索引**。
try {
  db.exec(`UPDATE progress SET uid = NULL
    WHERE uid IS NOT NULL AND uid <> '' AND rowid NOT IN (
      SELECT MIN(rowid) FROM progress WHERE uid IS NOT NULL AND uid <> '' GROUP BY uid
    )`);
  db.exec('DROP INDEX IF EXISTS idx_progress_uid');
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS uq_progress_uid ON progress(uid) WHERE uid IS NOT NULL AND uid <> ''");
} catch (e) {
  // 迁移失败不阻塞启动，但必须显式记录 —— 否则唯一约束没生效却无人知道
  console.error('[store] uid 唯一索引迁移失败：', e && e.message);
}

// D113 收礼箱：谁给谁送了什么。
//   out_trade_no 做主键 = **发货幂等**落到数据库层（回调重推不会重复入账，
//   前端也因此可以放心按它去重：同一个单号永远只对应一件礼物）。
db.exec(`
  CREATE TABLE IF NOT EXISTS gifts (
    out_trade_no TEXT PRIMARY KEY,     -- 主键 = 天然幂等（重复发货直接拒）
    from_openid  TEXT NOT NULL,        -- 送礼的人（B）
    to_uid       TEXT NOT NULL,        -- 收礼的人（A，匿名 uid）
    product_id   TEXT NOT NULL,
    amount       INTEGER NOT NULL,     -- 单位：分
    payload      TEXT,                 -- 祝福语 / 名字 / 署名（纯展示内容）
    created_at   INTEGER NOT NULL
  )
`);
db.exec('CREATE INDEX IF NOT EXISTS idx_gifts_to ON gifts(to_uid)');
db.exec('CREATE INDEX IF NOT EXISTS idx_gifts_from ON gifts(from_openid)');

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
  upsertProgress: db.prepare(`INSERT INTO progress (openid, done_stages, lamps, cards, owner_name, uid, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(openid) DO UPDATE SET
      done_stages=excluded.done_stages, lamps=excluded.lamps,
      cards=excluded.cards, owner_name=excluded.owner_name,
      uid=excluded.uid, updated_at=excluded.updated_at`),
  getProgress: db.prepare('SELECT done_stages, lamps, cards, owner_name, uid, updated_at FROM progress WHERE openid = ?'),
  // ---- D113 收礼箱 ----
  // 幂等靠主键：同一个 out_trade_no 插不进第二次（回调重推 / 并发都安全）
  insertGift: db.prepare(`INSERT OR IGNORE INTO gifts
    (out_trade_no, from_openid, to_uid, product_id, amount, payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`),
  // R12：事务内必须用**严格 INSERT** —— `INSERT OR IGNORE` 会把 NOT NULL 等约束违反
  //   一并忽略（changes=0 但不抛），结果「订单标了已发、礼物没写进去」，正是要防的丢失。
  //   严格 INSERT 失败会抛 → 外层 ROLLBACK → 连 claim 一起回滚，重推可再补。
  insertGiftStrict: db.prepare(`INSERT INTO gifts
    (out_trade_no, from_openid, to_uid, product_id, amount, payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`),
  inboxOf: db.prepare(`SELECT out_trade_no, product_id, amount, payload, created_at
    FROM gifts WHERE to_uid = ? ORDER BY created_at DESC LIMIT ?`),
  // 防御：**同一对 B→A 每天 3 次**（防刷单 / 自送自收）
  pairToday: db.prepare(`SELECT COUNT(*) AS n FROM gifts
    WHERE from_openid = ? AND to_uid = ? AND created_at >= ?`),
  // 防御：**同一个 A 每天最多收 50 次**（防集中轰炸）
  toToday: db.prepare(`SELECT COUNT(*) AS n FROM gifts WHERE to_uid = ? AND created_at >= ?`),
  // 防御：**单账号单日上限 ¥50**（未成年人保护口径，单位分）
  spentToday: db.prepare(`SELECT COALESCE(SUM(amount), 0) AS n FROM gifts WHERE from_openid = ? AND created_at >= ?`),
  // uid → openid 反查（收礼箱要知道「这个 uid 现在属于谁」）
  openidOfUid: db.prepare('SELECT openid FROM progress WHERE uid = ?')
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

// R12：发货原子性 ——「标已发」+「写礼物」必须在**同一个事务**里。
//   原实现先 claimDelivery 再 putGift：两步之间崩溃 → 订单已标已发、礼物没写进去 → 永久丢失，
//   而且因为 delivered=1，重推也不会补发。
//   @returns {{claimed:boolean, delivered:boolean}}
function claimAndDeliver(outTradeNo, gift) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const claimed = stmt.markDelivered.run(Date.now(), outTradeNo).changes > 0;
    if (!claimed) { db.exec('COMMIT'); return { claimed: false, delivered: false }; }
    const delivered = stmt.insertGiftStrict.run(gift.outTradeNo, gift.fromOpenid, gift.toUid,
      gift.productId, gift.amount, gift.payload || '', Date.now()).changes > 0;
    db.exec('COMMIT');
    return { claimed: true, delivered: delivered };
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (e2) { /* ignore */ }
    throw e;
  }
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
// D113：顺带把匿名收礼地址 uid 绑到这个 openid 上（客户端只传 uid，不传 openid）。
//   uid 为空时**不覆盖**已有的 —— 否则一次没带 uid 的同步会把收礼地址清空。
function saveProgress(openid, d) {
  if (!openid) throw new Error('saveProgress: openid 必填');
  const cur = getProgress(openid);
  let uid = d.uid || ((cur && cur.uid) || '');
  // R11：uid 已被**别的 openid** 占用 → 不覆盖（保留原主），否则等于把别人的收礼地址抢走
  if (uid) {
    const owner = openidOfUid(uid);
    if (owner && owner !== openid) uid = (cur && cur.uid) || '';
  }
  try {
    stmt.upsertProgress.run(openid, d.doneStages || '', d.lamps | 0, d.cards | 0,
      d.ownerName || '', uid, Date.now());
  } catch (e) {
    // 并发抢占同一 uid：唯一索引会抛 → 退回「不写 uid」，绝不覆盖别人
    if (/UNIQUE/i.test(String(e && e.message))) {
      stmt.upsertProgress.run(openid, d.doneStages || '', d.lamps | 0, d.cards | 0,
        d.ownerName || '', (cur && cur.uid) || '', Date.now());
    } else { throw e; }
  }
  return getProgress(openid);
}
function getProgress(openid) {
  if (!openid) throw new Error('getProgress: openid 必填');
  return stmt.getProgress.get(openid) || null;
}
function openidOfUid(uid) {
  if (!uid) return '';
  const r = stmt.openidOfUid.get(uid);
  return r ? r.openid : '';
}

// ---- D113 收礼箱 ----
/** 一天的开始（本地时区）。限额都按「自然日」算，与用户直觉一致。 */
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
/**
 * 发货：**幂等**靠主键（INSERT OR IGNORE），微信回调重推不会重复入账。
 * @returns {boolean} true = 本次真的入账；false = 之前已经入过
 */
function putGift(g) {
  return stmt.insertGift.run(g.outTradeNo, g.fromOpenid, g.toUid,
    g.productId, g.amount, g.payload || '', Date.now()).changes > 0;
}
function inboxOf(uid, limit) { return stmt.inboxOf.all(uid, limit || 50); }
function pairCountToday(fromOpenid, toUid) {
  return (stmt.pairToday.get(fromOpenid, toUid, startOfToday()) || {}).n || 0;
}
function toCountToday(toUid) {
  return (stmt.toToday.get(toUid, startOfToday()) || {}).n || 0;
}
function spentToday(openid) {
  return (stmt.spentToday.get(openid, startOfToday()) || {}).n || 0;
}

module.exports = {
  DB_PATH,
  db,
  createOrder,
  getOrder,
  markPaid,
  claimDelivery,
  claimAndDeliver,
  saveSession,
  getSession,
  listPendingDelivery,
  saveProgress,
  getProgress,
  // D113 收礼箱
  openidOfUid,
  putGift,
  inboxOf,
  pairCountToday,
  toCountToday,
  spentToday,
  startOfToday
};
