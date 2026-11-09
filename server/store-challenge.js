// server/store-challenge.js — 同盘挑战的最小数据层（S01 / S02）
//
// 为什么单独一个模块：
//   现有 store.js 管的是订单/会话/进度/礼物，语义完全不同。挑战数据混进去会让
//   一张表承担两种生命周期（订单要留档、挑战数据可以定期清）。**新开一张表、一个新模块。**
//
// 隐私边界（写死，不许改）：
//   - 只存**匿名 uid**（storage.ensureUid 产出的本地 id），不存 openid、昵称、头像、位置。
//   - 不存任何可以还原到具体人的字段。
//
// 去重规则：
//   (cid, uid) 唯一 —— 同一人对同一个挑战只留**一条**记录（首次有效游玩）。
//   这不是"防作弊"，是"防止一个人反复刷榜把别人挤掉"。
//   真正的防作弊要客户端上报操作日志并由服务端复算，本轮**不做**（明确标记为未实现）。

'use strict';

const path = require('path');
const fs = require('fs');

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
  DatabaseSync = null;
}

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'pay.db');

let db = null;

function ensureDb() {
  if (db) return db;
  if (!DatabaseSync) throw new Error('node:sqlite 不可用（需要 Node 22+ 且启用 node:sqlite）');
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS challenge_plays (
      cid    TEXT NOT NULL,
      uid    TEXT NOT NULL,
      level  INTEGER NOT NULL,
      seed   INTEGER NOT NULL,
      score  INTEGER NOT NULL DEFAULT 0,
      steps  INTEGER NOT NULL DEFAULT 0,
      won    INTEGER NOT NULL DEFAULT 0,
      ts     INTEGER NOT NULL,
      PRIMARY KEY (cid, uid)
    );
    CREATE INDEX IF NOT EXISTS idx_challenge_rank
      ON challenge_plays (cid, won DESC, steps ASC, score DESC);
  `);
  return db;
}

function nowMs() { return Date.now(); }

/**
 * 记录一次有效游玩。同一 (cid, uid) 只记第一次。
 * @returns {{ok:boolean, dup:boolean}}
 */
function recordPlay(p) {
  if (!p || !p.cid || !p.uid) return { ok: false, dup: false, reason: 'missing cid/uid' };
  const d = ensureDb();
  const dup = d.prepare('SELECT 1 FROM challenge_plays WHERE cid = ? AND uid = ?').get(p.cid, p.uid);
  if (dup) return { ok: true, dup: true };
  d.prepare(
    `INSERT INTO challenge_plays (cid, uid, level, seed, score, steps, won, ts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    String(p.cid), String(p.uid),
    Number(p.level) | 0, Number(p.seed) | 0,
    Number(p.score) | 0, Number(p.steps) | 0,
    p.won ? 1 : 0, nowMs()
  );
  return { ok: true, dup: false };
}

/**
 * 榜单：先按是否达标，再按步数少、分数高。
 * 只返回匿名 uid，不返回任何可识别信息。
 */
function listByCid(cid, limit) {
  const d = ensureDb();
  return d.prepare(
    `SELECT uid, score, steps, won, ts FROM challenge_plays
     WHERE cid = ? ORDER BY won DESC, steps ASC, score DESC LIMIT ?`
  ).all(String(cid), Number(limit) || 20);
}

function countByCid(cid) {
  const d = ensureDb();
  const row = d.prepare('SELECT COUNT(*) AS n FROM challenge_plays WHERE cid = ?').get(String(cid));
  return row ? row.n : 0;
}

function close() {
  if (db) { try { db.close(); } catch (e) {} db = null; }
}

module.exports = { recordPlay, listByCid, countByCid, close, DB_PATH };
