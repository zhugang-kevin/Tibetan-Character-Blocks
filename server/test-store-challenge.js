#!/usr/bin/env node
/**
 * server/test-store-challenge.js — 挑战数据层的真实验证
 *
 * 用**临时数据库**跑，不碰 server/data/pay.db。
 * 验的是四件事：写入、去重、榜单排序、匿名性（不存可识别字段）。
 */
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

// 必须在 require 之前设置，store 在首次调用时才建库
const TMP = path.join(os.tmpdir(), 'challenge-test-' + process.pid + '.db');
process.env.DB_PATH = TMP;

const store = require('./store-challenge.js');

let PASS = 0, FAIL = 0;
const fails = [];
function chk(name, cond, detail) {
  if (cond) PASS++;
  else { FAIL++; fails.push(name + (detail ? '：' + detail : '')); }
}

console.log('');
console.log('==========================================');
console.log('  挑战数据层 · 验证');
console.log('==========================================');

const CID = 'cTEST123';

// ① 写入
const r1 = store.recordPlay({ cid: CID, uid: 'u_a', level: 3, seed: 999, score: 120, steps: 14, won: 1 });
chk('① 首次写入成功', r1.ok === true && r1.dup === false, JSON.stringify(r1));

// ② 去重：同一 (cid, uid) 第二次不算新记录
const r2 = store.recordPlay({ cid: CID, uid: 'u_a', level: 3, seed: 999, score: 9999, steps: 1, won: 1 });
chk('② 重复上报被识别为 dup（不改写成绩）', r2.ok === true && r2.dup === true, JSON.stringify(r2));
chk('② 总数仍是 1（重复没进库）', store.countByCid(CID) === 1, 'count=' + store.countByCid(CID));

// ③ 榜单排序：达标优先 → 步数少优先 → 分数高优先
store.recordPlay({ cid: CID, uid: 'u_b', level: 3, seed: 999, score: 80, steps: 12, won: 1 });   // 达标、12 步
store.recordPlay({ cid: CID, uid: 'u_c', level: 3, seed: 999, score: 200, steps: 8, won: 0 });   // 未达标
store.recordPlay({ cid: CID, uid: 'u_d', level: 3, seed: 999, score: 90, steps: 9, won: 1 });    // 达标、9 步
const rank = store.listByCid(CID, 10);
chk('③ 榜单长度 4', rank.length === 4, 'len=' + rank.length);
chk('③ 达标排在未达标之前', rank[0].won === 1 && rank[rank.length - 1].won === 0,
  rank.map(r => r.uid + ':' + r.won).join(','));
chk('③ 达标者里步数少的在前（u_d 9 步 应早于 u_b 12 步）',
  rank.findIndex(r => r.uid === 'u_d') < rank.findIndex(r => r.uid === 'u_b'),
  rank.map(r => r.uid).join(','));

// ④ 匿名性：返回字段里不得有 openid / nickName / avatar 之类
const keys = Object.keys(rank[0]).sort().join(',');
chk('④ 榜单只返回匿名字段', /^(score,steps,ts,uid,won|score,steps,ts,uid,won)$/.test(keys), keys);
chk('④ 不含 openid / 昵称 / 头像', !/openid|nick|avatar|phone/i.test(keys), keys);

// ⑤ 不同 cid 互不干扰
store.recordPlay({ cid: 'cOTHER', uid: 'u_a', level: 4, seed: 1, score: 10, steps: 5, won: 1 });
chk('⑤ 不同挑战的榜单隔离', store.listByCid('cOTHER', 10).length === 1);
chk('⑤ 原挑战计数未变', store.countByCid(CID) === 4);

// ⑥ 缺参数必须拒绝（不能静默写入脏数据）
const r6 = store.recordPlay({ cid: '', uid: 'u_x' });
chk('⑥ 缺 cid 被拒绝', r6.ok === false, JSON.stringify(r6));

store.close();
try { fs.unlinkSync(TMP); } catch (e) {}

console.log('  通过: ' + PASS + ' | 失败: ' + FAIL);
if (FAIL) {
  console.log('');
  fails.forEach(f => console.log('   - ' + f));
  console.log('');
  console.log('✗ 挑战数据层不成立 —— 不要接路由。');
} else {
  console.log('  ✓ 写入 / 去重 / 榜单排序 / 匿名性 / 隔离 / 参数校验 全部通过。');
  console.log('    ⚠️ 未验证：防作弊（需客户端上报操作日志 + 服务端复算，本轮不做）。');
}
console.log('==========================================');
process.exit(FAIL ? 1 : 0);
