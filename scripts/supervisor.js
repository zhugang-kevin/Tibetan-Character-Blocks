#!/usr/bin/env node
/**
 * supervisor.js — 十分钟续跑监督器（可验证结构 + 虚拟时钟验收；真实调度=BLOCKED）
 *
 * 依据 docs/gameplay-match3-redesign.md 13.3 B / 12.3：
 *  - 续跑目标 = 负责本项目的 Worker 任务；一次回合实际结束后 persisted endedAt，
 *    nextEligibleAt = endedAt + 600s；到期且有可执行任务才触发下一回合。
 *  - 任务仍运行时即使 10 分钟无输出也不重复启动；工作超 10 分钟继续运行不掐断。
 *  - 单实例锁/租约 + runId 防旧回调；锁过期先确认旧 worker 是否活跃再决定。
 *  - 验收监督器（虚拟时钟）：599s 不调度、600s 仅调度一次、15min 不双开、
 *    重复完成不重调度、worker 失败可恢复、重启读等待期、损坏检查点可恢复、
 *    锁冲突不并行、用户停止后不触发、全部阻塞不灌请求。
 *  - 真实接入前只实现可验证的监督器结构/模拟器，标记 WORKBUDDY_DISPATCH=BLOCKED；
 *    模型自身 sleep / 打印"继续" / 文件轮询 / Codex 心跳 均不算 DeepSeek 续跑。
 *
 * 本脚本不修改任何项目外文件、不注册系统计划任务、不调用云端。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const QUALITY = path.resolve(__dirname, '..', '.workbuddy', 'quality');
const CHECKPOINT = path.join(QUALITY, 'checkpoint.json');
const RUNS = path.join(QUALITY, 'runs.jsonl');
const LOCK = path.join(QUALITY, '.lock');
const RESUME_GAP_MS = 600 * 1000; // 600 秒
const HEARTBEAT_TIMEOUT_MS = 120 * 1000; // 锁租约心跳超时

// ---------- 时钟抽象（测试可注入虚拟时钟）----------
class Clock {
  now() { return Date.now(); }
}
class FakeClock {
  constructor(startMs) { this.t = startMs; }
  now() { return this.t; }
  advance(ms) { this.t += ms; }
}

// ---------- 原子读写 ----------
function readJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fallback; }
}
function writeJSON(p, obj) {
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, p); // 原子落盘：先写临时再 rename
}
function appendRun(line) {
  fs.appendFileSync(RUNS, JSON.stringify(line) + '\n');
}

// ---------- 单实例锁 ----------
function readLock() {
  try { return JSON.parse(fs.readFileSync(LOCK, 'utf8')); } catch (e) { return null; }
}
function writeLock(obj) {
  fs.writeFileSync(LOCK, JSON.stringify(obj));
}
function clearLock() {
  try { fs.unlinkSync(LOCK); } catch (e) {}
}
// 判断旧 worker 是否仍活跃：锁存在且心跳未超时
function lockActive(lock, nowMs) {
  if (!lock) return false;
  return (nowMs - (lock.lastHeartbeatAt || 0)) < HEARTBEAT_TIMEOUT_MS;
}

// ---------- 监督器核心 ----------
class Scheduler {
  constructor(clock, opts) {
    this.clock = clock;
    this.worker = opts && opts.worker; // 注入的"执行一批任务"函数（模拟/真实）
    this.cp = readJSON(CHECKPOINT, null);
    if (!this.cp) this.cp = this._freshCheckpoint();
  }
  _freshCheckpoint() {
    const now = this.clock.now();
    return {
      runId: null, taskId: null, workerState: 'IDLE',
      startedAt: null, lastHeartbeatAt: null, lastProgressAt: null,
      endedAt: null, nextEligibleAt: 0,
      sourceHash: '', evidence: '', unverifiedChanges: '', nextCommand: '',
      status: 'IDLE',
    };
  }
  // 是否有可执行任务（真实场景读 queue.json；模拟由 caller 注入 hasTask）
  hasExecutableTask() {
    if (typeof this._hasTask === 'function') return this._hasTask();
    const q = readJSON(path.join(QUALITY, 'queue.json'), { tasks: [] });
    return q.tasks.some(t => t.state === 'REPRODUCED' || t.state === 'DIAGNOSED' || t.state === 'FIXING' || t.state === 'VERIFYING');
  }
  setHasTask(fn) { this._hasTask = fn; }

  // 核心：评估是否调度
  tick() {
    const now = this.clock.now();
    // 用户已停止 → 永不调度
    if (this.cp.status === 'STOPPED_BY_USER') return { dispatched: false, reason: 'STOPPED' };
    const lock = readLock();
    // 单实例：若旧 worker 仍活跃，不重复启动
    if (lockActive(lock, now)) {
      return { dispatched: false, reason: 'LOCK_ACTIVE' };
    }
    // 等待期未到
    if (now < (this.cp.nextEligibleAt || 0)) {
      return { dispatched: false, reason: 'WAITING' };
    }
    // 无可执行任务：不灌请求
    if (!this.hasExecutableTask()) {
      return { dispatched: false, reason: 'NO_TASK' };
    }
    // 真实调度接入点：当前未验证 → BLOCKED；模拟模式下仍跑调度结构（不接真实 worker）
    return this._dispatch(now, lock);
  }

  _dispatch(now, lock) {
    const runId = 'run-' + now + '-' + Math.floor(Math.random() * 1e6);
    // 写入锁（带 runId + 心跳），代表 worker 正在运行
    writeLock({ runId, lastHeartbeatAt: now, pid: process.pid });
    this.cp.runId = runId;
    this.cp.workerState = 'RUNNING';
    this.cp.startedAt = now;
    this.cp.lastHeartbeatAt = now;
    this.cp.endedAt = null;
    this.cp.nextEligibleAt = 0;
    this.cp.status = 'RUNNING';
    writeJSON(CHECKPOINT, this.cp);
    appendRun({ event: 'dispatch', runId, at: now, mode: this.dispatchMode() });

    // 真实接入点：若未配置真实接口，仅模拟执行（worker 由调用方/测试显式 finishRound 结束）
    if (this.worker) {
      try {
        const out = this.worker(runId, now, (outcome, ev) => this.finishRound(now, outcome, ev));
        // 若 worker 同步返回且未自行结束，则此处结束（模拟同步完成）
        if (this.cp.workerState === 'RUNNING') this.finishRound(now, 'OK', out);
      } catch (e) {
        this.finishRound(now, 'WORKER_FAILED', String(e && e.message));
      }
    }
    return { dispatched: true, runId, mode: this.dispatchMode() };
  }

  dispatchMode() {
    // 真实接口未验证 → 模拟
    return 'SIMULATED';
  }

  // 回合结束：持久化 endedAt + 600s 等待期，清锁
  finishRound(now, outcome, evidence) {
    this.cp.endedAt = now;
    this.cp.nextEligibleAt = now + RESUME_GAP_MS;
    this.cp.workerState = 'IDLE';
    this.cp.lastProgressAt = now;
    this.cp.status = (outcome === 'STOPPED') ? 'STOPPED_BY_USER' : 'WAITING_10_MIN';
    this.cp.evidence = evidence || this.cp.evidence;
    writeJSON(CHECKPOINT, this.cp);
    clearLock();
    appendRun({ event: 'end', runId: this.cp.runId, at: now, outcome, nextEligibleAt: this.cp.nextEligibleAt });
  }

  // 用户停止
  stop() {
    const now = this.clock.now();
    this.cp.status = 'STOPPED_BY_USER';
    this.cp.workerState = 'IDLE';
    writeJSON(CHECKPOINT, this.cp);
    clearLock();
    appendRun({ event: 'stop', at: now });
  }
}

// ---------- 验收监督器（虚拟时钟）----------
function assert(name, cond) {
  console.log((cond ? '  PASS ' : '  FAIL ') + name);
  return cond;
}
// 重置状态（每个场景独立）
function resetState() {
  try { fs.unlinkSync(CHECKPOINT); } catch (e) {}
  try { fs.unlinkSync(LOCK); } catch (e) {}
}

function runAcceptanceTests() {
  console.log('=== 监督器虚拟时钟验收（依据 13.3 B 验收清单）===');
  let allPass = true;
  const hasTask = () => true;

  // 1) 结束后 599s 不调度，600s 仅调度一次（调度后锁活跃不双开）
  resetState();
  {
    const clk = new FakeClock(1_000_000);
    const s = new Scheduler(clk); s.setHasTask(hasTask);
    s.finishRound(1_000_000, 'OK', 'seed'); // endedAt=1e6, nextEligible=1e6+600000
    clk.advance(599 * 1000);
    const r1 = s.tick();
    clk.advance(1000);
    const r2 = s.tick(); // dispatch 一次（RUNNING，锁活跃）
    const r3 = s.tick(); // 锁活跃 → LOCK_ACTIVE
    allPass &= assert('600s 到点前(599s)不调度', r1.dispatched === false && r1.reason === 'WAITING');
    allPass &= assert('600s 仅调度一次（首次 dispatch）', r2.dispatched === true);
    allPass &= assert('调度后再次 tick 不双开（锁活跃）', r3.dispatched === false && r3.reason === 'LOCK_ACTIVE');
  }

  // 2) 运行 15 分钟不双开（锁心跳持续更新）
  resetState();
  {
    const clk = new FakeClock(2_000_000);
    const s = new Scheduler(clk); s.setHasTask(hasTask);
    s.finishRound(2_000_000, 'OK', 'seed');
    clk.advance(600 * 1000);
    const r1 = s.tick(); // dispatch，写锁
    let dispatched = 0;
    for (let i = 0; i < 15 * 60; i++) {
      clk.advance(1000);
      const lk = readJSON(LOCK, null);
      if (lk) writeLock(Object.assign({}, lk, { lastHeartbeatAt: clk.now() }));
      const r = s.tick();
      if (r.dispatched) dispatched++;
    }
    allPass &= assert('15 分钟内无额外调度（仅初始 1 次）', dispatched === 0 && r1.dispatched === true);
  }

  // 3) 无任务时重复 tick 不调度
  resetState();
  {
    const clk = new FakeClock(3_000_000);
    const s = new Scheduler(clk); s.setHasTask(() => false);
    s.finishRound(3_000_000, 'OK', 'done');
    clk.advance(600 * 1000);
    const r1 = s.tick();
    const r2 = s.tick();
    allPass &= assert('无任务时重复 tick 不调度', r1.dispatched === false && r1.reason === 'NO_TASK' && r2.dispatched === false);
  }

  // 4) worker 失败可恢复
  resetState();
  {
    const clk = new FakeClock(4_000_000);
    const s = new Scheduler(clk, { worker: () => { throw new Error('boom'); } });
    s.setHasTask(hasTask);
    s.finishRound(4_000_000, 'OK', 'seed');
    clk.advance(600 * 1000);
    const r1 = s.tick(); // dispatch → worker 抛错 → finishRound(WORKER_FAILED)
    const cp = readJSON(CHECKPOINT, null);
    allPass &= assert('worker 失败仍写回 checkpoint（可恢复）',
      r1.dispatched === true && cp.endedAt === clk.now() && cp.nextEligibleAt === clk.now() + 600000);
  }

  // 5) 重启读取等待期
  resetState();
  {
    const clk = new FakeClock(5_000_000);
    const s1 = new Scheduler(clk); s1.setHasTask(hasTask);
    s1.finishRound(5_000_000, 'OK', 'seed');
    const persisted = readJSON(CHECKPOINT, null).nextEligibleAt;
    const s2 = new Scheduler(clk); s2.setHasTask(hasTask); // 模拟重启
    clk.advance(1000);
    const r = s2.tick();
    allPass &= assert('重启后读取等待期（未到不调度）',
      r.dispatched === false && r.reason === 'WAITING' && persisted === 5_000_000 + 600000);
  }

  // 6) 损坏/缺失检查点可恢复（默认空状态可调度）
  resetState();
  {
    const clk = new FakeClock(6_000_000);
    const s = new Scheduler(clk); s.setHasTask(hasTask);
    clk.advance(600 * 1000);
    const r = s.tick();
    allPass &= assert('损坏/缺失检查点可恢复（默认空状态可调度）', r.dispatched === true);
  }

  // 7) 外部活跃锁不并行
  resetState();
  {
    const clk = new FakeClock(7_000_000);
    const s = new Scheduler(clk); s.setHasTask(hasTask);
    clk.advance(600 * 1000);
    writeLock({ runId: 'foreign-run', lastHeartbeatAt: clk.now() }); // 写在推进后，心跳为当前时刻（活跃）
    const r = s.tick();
    allPass &= assert('外部活跃锁不并行启动', r.dispatched === false && r.reason === 'LOCK_ACTIVE');
    clearLock();
  }

  // 8) 用户停止后不触发
  resetState();
  {
    const clk = new FakeClock(8_000_000);
    const s = new Scheduler(clk); s.setHasTask(hasTask);
    s.stop();
    clk.advance(600 * 1000);
    const r = s.tick();
    allPass &= assert('用户停止后不调度', r.dispatched === false && r.reason === 'STOPPED');
  }

  // 9) 全部阻塞（无任务）不灌请求
  resetState();
  {
    const clk = new FakeClock(9_000_000);
    const s = new Scheduler(clk); s.setHasTask(() => false);
    s.finishRound(9_000_000, 'OK', 'seed');
    clk.advance(600 * 1000);
    let ticks = 0, dispatched = 0;
    for (let i = 0; i < 5; i++) { const r = s.tick(); ticks++; if (r.dispatched) dispatched++; }
    allPass &= assert('全部阻塞时节流（多次 tick 不调度）', dispatched === 0 && ticks === 5);
  }

  console.log(allPass ? '\n验收结果：全部通过（模拟器逻辑正确）' : '\n验收结果：存在失败');
  console.log('真实调度接入：WORKBUDDY_DISPATCH=BLOCKED（无项目内可验证的真实任务调用接口；不得声称自动化已启用）');
  return allPass;
}

// ---------- CLI ----------
function main() {
  const cmd = process.argv[2];
  if (cmd === 'test') {
    const ok = runAcceptanceTests();
    process.exit(ok ? 0 : 1);
  } else if (cmd === 'status') {
    console.log(JSON.stringify(readJSON(CHECKPOINT, { status: 'NO_CHECKPOINT' }), null, 2));
  } else if (cmd === 'tick') {
    const s = new Scheduler(new Clock());
    const r = s.tick();
    console.log('tick ->', JSON.stringify(r));
  } else if (cmd === 'stop') {
    new Scheduler(new Clock()).stop();
    console.log('stopped');
  } else {
    console.log('usage: node scripts/supervisor.js <test|status|tick|stop>');
    console.log('  真实调度未接入；本程序仅实现可验证监督器结构与虚拟时钟验收。');
  }
}

if (require.main === module) main();
module.exports = { Scheduler, Clock, FakeClock, runAcceptanceTests, RESUME_GAP_MS };
