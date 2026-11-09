#!/usr/bin/env node
/**
 * scripts/sweep-150.js — 穷尽扫查 150 课（15 级 × 10 课）
 *
 * ⚠️ 上一版我直接 createLevel(lv, st) —— 签名是 createLevel(cfg, create, rng)，
 *    传数字进去 cfg.elements 是 undefined，150 课全抛错，被误读成"140 课全坏"。
 *    这一版照抄页面真实路径：learning.buildStage(lv, stage) 产出 cfg，
 *    再 board.createLevel(cfg, make, rng)。
 *
 * 用法：node scripts/sweep-150.js --one   # 只跑 L1-1 自证脚本本身
 *       node scripts/sweep-150.js         # 全量 150
 */
'use strict';
const board = require('../utils/board.js');
const learning = require('../utils/learning.js');

function make(id, uid) { return { id: id, uid: uid }; }

function once(lv, st) {
  const tag = 'L' + lv + '-' + st;
  let cfg, b;
  try { cfg = learning.buildStage(lv, st); } catch (e) {
    return tag + ' buildStage 抛错：' + (e && e.message);
  }
  if (!cfg) return tag + ' buildStage 返回空';
  try { b = board.createLevel(cfg, make, Math.random); } catch (e) {
    return tag + ' 建关抛错：' + (e && e.message);
  }
  if (!b || !b.cells || !b.cells.length) return tag + ' 盘面为空';

  const onBoard = b.cells.filter(Boolean).length;
  // ⚠️ 不能要求 onBoard === cols*rows：5×5=25 是奇数，配对必须偶数，
  //    建关会故意留 1 个空格（24/25）。真正的判据是「偶数 + 塞得下」。
  if (onBoard % 2 !== 0) return tag + ' 盘面张数为奇数（配对必有剩余）：' + onBoard;
  if (onBoard > b.cols * b.rows) return tag + ' 盘面超出格数：' + onBoard + '/' + (b.cols * b.rows);
  if (board.hasPair && !board.hasPair(b.cells, b.cols, b.rows)) return tag + ' 开局无任何可配对的牌';

  const left = board.poolLeft ? board.poolLeft(b) : 0;
  const need = b.pairs || b.totalPairs || 0;
  if (need > 0 && onBoard + left < need * 2) {
    return tag + ' 牌数不够：需 ' + (need * 2) + '，盘面 ' + onBoard + ' + 池 ' + left;
  }
  return null;
}

const one = process.argv.indexOf('--one') > -1;

console.log('');
console.log('==========================================');
if (one) {
  const r = once(1, 1);
  console.log('  自证样本 L1-1：' + (r ? '✗ ' + r : '✓ 通过'));
  console.log('  ' + (r ? '脚本本身有问题，不许全量跑' : '脚本可信，可以全量'));
  console.log('==========================================');
  process.exit(r ? 1 : 0);
}

let total = 0, bad = 0; const fails = [];
for (let lv = 1; lv <= 15; lv++) {
  for (let st = 1; st <= 10; st++) {
    total++;
    const r = once(lv, st);
    if (r) { bad++; fails.push(r); }
  }
}
console.log('  150 课扫查：总计 ' + total + '，通过 ' + (total - bad) + '，失败 ' + bad);
if (bad) fails.slice(0, 12).forEach(f => console.log('   - ' + f));
console.log('==========================================');
process.exit(bad ? 1 : 0);
