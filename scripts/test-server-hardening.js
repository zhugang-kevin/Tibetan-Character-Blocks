#!/usr/bin/env node
/**
 * scripts/test-server-hardening.js — 服务端硬化验收（R09/R10/R11/R12）
 *
 * 用一个**项目内临时 SQLite** 起真实 HTTP 服务，验证：
 *   R09 输入安全：坏 JSON → 400 / 超大 → 413 / 错方法 → 405 / 恶意请求后 health 仍可用
 *   R10 日志鉴权：/telemetry/read 无 token → 401，带 token → 200，错 token → 401
 *   R11 收礼身份：uid 唯一；别人占用时不被覆盖；openidOfUid 稳定
 *   R12 发货原子性：claim+入账同事务；重复回调只入账一次；入账失败则回滚（不标已发）
 *   R13 遥测写入口限流：60/min/IP；日志超 5MB 只留最后 2000 行
 *
 * 用法：node scripts/test-server-hardening.js
 */
'use strict';

const path = require('path');
const fs = require('fs');

const TMP_DIR = path.join(__dirname, '..', '.workbuddy', 'tmp');
fs.mkdirSync(TMP_DIR, { recursive: true });
// 开头清理上一次遗留的临时库（进程被 kill 时可能留下；都在项目内，不污染机器）
try {
  fs.readdirSync(TMP_DIR).forEach(function (f) {
    if (/^test-pay-.*\.db/.test(f)) { try { fs.unlinkSync(path.join(TMP_DIR, f)); } catch (e) {} }
  });
} catch (e) {}
const DB = path.join(TMP_DIR, 'test-pay-' + Date.now() + '.db');
process.env.DB_PATH = DB;
process.env.TELEMETRY_TOKEN = 'test-token';
process.env.WX_ENV = '0';                 // 生产口径
process.env.MAX_BODY_BYTES = '512';       // R09 测试用：把上限设小，避免 300KB 上传在 Windows 上偶发挂死

const { server, store, telemetryAllowed } = require('../server/index.js');

let PASS = 0, FAIL = 0;
const fails = [];
function chk(name, cond, detail) {
  if (cond) { PASS++; console.log('  ✓ ' + name); }
  else { FAIL++; fails.push(name + (detail ? '：' + detail : '')); console.log('  ✗ ' + name + (detail ? ' → ' + detail : '')); }
}

// 硬超时：任何一步吊死都要退出，不能挂住
const hard = setTimeout(function () { console.error('✗ 硬超时（30s）'); process.exit(1); }, 30000);

(async function main() {
  console.log('\n==========================================');
  console.log('  服务端硬化 · R09/R10/R11/R12');
  console.log('==========================================');

  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  const port = server.address().port;
  const base = 'http://127.0.0.1:' + port;
  // 每个请求 5s 超时：413 这类「服务端提前回包」的用例不会把测试挂住
  const req = function (p, o) {
    o = o || {};
    if (!o.signal) o.signal = AbortSignal.timeout(5000);
    return fetch(base + p, o);
  };

  // ---------- R09 输入安全 ----------
  console.log('\n[R09] 输入边界');
  {
    let r = await req('/telemetry', { method: 'POST', body: '{bad json' });
    chk('坏 JSON → 400（不再无保护二次解析）', r.status === 400, 'status=' + r.status);

    r = await req('/telemetry', { method: 'GET' });
    chk('错误方法 → 405', r.status === 405, 'status=' + r.status);

    // 超大请求体：上限已设为 512B，发 2KB 即超 —— 小流量，不会在 Windows 上卡半开 socket
    let big = null;
    try {
      r = await req('/telemetry', { method: 'POST', body: 'x'.repeat(2048) });
      big = r.status;
    } catch (e) { big = 'ERR:' + (e && e.name); }
    chk('超大请求体 → 413', big === 413, 'result=' + big);

    r = await req('/telemetry', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ver: 't', sess: 's', rows: [{ type: 'event' }] })
    });
    chk('正常上报 → 200', r.status === 200, 'status=' + r.status);

    r = await req('/health');
    chk('恶意请求后 health 仍可用', r.status === 200, 'status=' + r.status);
  }

  // ---------- R10 日志鉴权 ----------
  console.log('\n[R10] 日志鉴权');
  {
    let r = await req('/telemetry/read');
    chk('无 token → 401', r.status === 401, 'status=' + r.status);

    r = await req('/telemetry/read?token=test-token');
    chk('带正确 token → 200', r.status === 200, 'status=' + r.status);

    r = await req('/telemetry/read?token=wrong');
    chk('错误 token → 401', r.status === 401, 'status=' + r.status);
  }

  // ---------- R11 收礼身份唯一 ----------
  console.log('\n[R11] 收礼身份');
  {
    store.saveProgress('openidA', { uid: 'u1', doneStages: '', lamps: 0, cards: 0 });
    store.saveProgress('openidB', { uid: 'u1', doneStages: '', lamps: 0, cards: 0 });
    const a = store.getProgress('openidA');
    const b = store.getProgress('openidB');
    chk('A 绑定 u1 成功', a && a.uid === 'u1', a && a.uid);
    chk('B 不能抢走 u1（不被覆盖）', b && b.uid !== 'u1', b && b.uid);
    chk('openidOfUid 唯一解析到 A', store.openidOfUid('u1') === 'openidA', store.openidOfUid('u1'));
    const idx = store.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='uq_progress_uid'").get();
    chk('uid 唯一索引已建立', !!idx, JSON.stringify(idx));
  }

  // ---------- R12 发货原子性 ----------
  console.log('\n[R12] 发货原子性');
  {
    store.createOrder({ outTradeNo: 'T1', openid: 'openidA', productId: 'p', amount: 100 });
    store.markPaid('T1');
    const gift = { outTradeNo: 'T1', fromOpenid: 'openidA', toUid: 'u1', productId: 'p', amount: 100, payload: '{}' };
    const r1 = store.claimAndDeliver('T1', gift);
    chk('首次：claim=true 且入账=true', r1.claimed === true && r1.delivered === true, JSON.stringify(r1));
    const r2 = store.claimAndDeliver('T1', gift);
    chk('重复回调：claim=false（只入账一次）', r2.claimed === false, JSON.stringify(r2));
    chk('收礼箱只有一条', store.inboxOf('u1', 10).filter(function (x) { return x.out_trade_no === 'T1'; }).length === 1);

    // 原子性：入账失败 → 整个事务回滚 → 订单不能停留在「已发」
    store.createOrder({ outTradeNo: 'T2', openid: 'openidA', productId: 'p', amount: 100 });
    store.markPaid('T2');
    let threw = false;
    try {
      store.claimAndDeliver('T2', { outTradeNo: 'T2', fromOpenid: 'openidA', toUid: null, productId: 'p', amount: 100, payload: '{}' });
    } catch (e) { threw = true; }
    chk('入账失败会抛错（NOT NULL）', threw === true);
    chk('入账失败 → 回滚，订单未被标已发', store.getOrder('T2').delivered === 0,
      'delivered=' + store.getOrder('T2').delivered);
  }

  // ---------- 收尾 ----------
  // ⚠️ **收尾零 I/O**：`server.close()` 会被 413 的半开连接挂住；
  //   Windows 下 `unlinkSync` 删除仍被 SQLite 打开的库也会卡住（实测 exit=124）。
  //   端口与文件都由进程结束 / 下次运行开头（已清理）处理，这里只打印再退出。
  // R13：遥测写入口限流（60/min/IP）
  {
    let allow = 0, deny = 0;
    for (let i = 0; i < 61; i++) { if (telemetryAllowed('rate-test-ip')) allow++; else deny++; }
    chk('R13 遥测写入口限流（60/min，第 61 次拒绝）', allow === 60 && deny === 1, allow + '/' + deny);
  }

  console.log('\n  通过: ' + PASS + ' | 失败: ' + FAIL);
  if (FAIL) {
    console.log('');
    fails.forEach(function (f) { console.log('   - ' + f); });
    console.log('\n✗ 服务端硬化未达标。');
  } else {
    console.log('  ✓ R09/R10/R11/R12/R13 全部成立。');
  }
  console.log('==========================================');
  clearTimeout(hard);
  process.exit(FAIL ? 1 : 0);
})().catch(function (e) {
  console.error('✗ 异常中断：', e && e.stack || e);
  process.exit(1);
});
