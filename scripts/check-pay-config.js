#!/usr/bin/env node
// scripts/check-pay-config.js — 虚拟支付配置自检（D136）
//
// ## 它解决的问题
//   虚拟支付失败的绝大多数原因不是代码，是**配置**：
//     · orderApi 用了 http / IP / localhost / 带 :443  → 请求发不出去（官方《网络》硬约束）
//     · offerId 抄错一个字符                      → -15001 / -15018
//     · 道具没发布就置 goodsPublished=true         → -15010 / -15014
//     · 手滑把 AppKey 写进前端配置                 → 密钥泄漏（最严重）
//   这些都能在**不联网、不花钱**的前提下提前查出来。
//
// ## 用法
//   node scripts/check-pay-config.js
//   退出码：0 = 通过或处于未配置状态；1 = 配置有错（禁止上线）
//
// ## 口径
//   三个值全空 = 未开通，**这是正常状态**，不判红（否则开发期天天红，人就会绕开它）。
//   半配置（填了一半）= 危险状态，判红 —— 比全空更容易出事。

'use strict';
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const CFG_PATH = path.join(ROOT, 'config', 'pay.js');
const GOODS_PATH = path.join(ROOT, 'data', 'goods.js');

let fail = 0, pass = 0;
function ok(msg) { pass++; console.log('  ✓ ' + msg); }
function err(msg) { fail++; console.log('  ✗ ' + msg); }
function warn(msg) { console.log('  ⚠ ' + msg); }

// ---------- 0. 读配置 ----------
if (!fs.existsSync(CFG_PATH)) {
  console.log('✗ 缺 config/pay.js —— 模板文件被删了（它必须提交进仓库，无密钥）');
  process.exit(1);
}
const raw = fs.readFileSync(CFG_PATH, 'utf8');
let cfg;
try {
  cfg = require(CFG_PATH);
} catch (e) {
  console.log('✗ config/pay.js 语法错误：' + e.message);
  process.exit(1);
}

console.log('虚拟支付配置自检（D136）');
console.log('');

// ---------- 1. 密钥绝不进前端（最高优先级，先查） ----------
//   注释里提到"AppKey"是允许的（那是说明文字），所以先去掉注释再扫。
const codeOnly = raw.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const secretWords = ['appkey', 'app_key', 'appsecret', 'app_secret', 'privatekey', 'mchkey'];
const hitSecret = secretWords.filter(function (w) { return codeOnly.toLowerCase().indexOf(w) >= 0; });
if (hitSecret.length) {
  err('config/pay.js 里出现了密钥字段：' + hitSecret.join('、')
    + ' —— AppKey/AppSecret 只能放服务端环境变量，绝不能进前端（官方红线）');
} else {
  ok('前端配置里没有任何密钥字段（AppKey/AppSecret 只在服务端）');
}

// ---------- 2. 状态判定 ----------
const offerId = String(cfg.offerId || '').trim();
const orderApi = String(cfg.orderApi || '').trim();
const goodsPublished = cfg.goodsPublished === true;
const env = cfg.env;

const isEmpty = !offerId && !orderApi && !goodsPublished;

if (isEmpty) {
  ok('未配置状态（offerId / orderApi / goodsPublished 全空）—— 打赏入口会隐藏，不会假装能付');
  console.log('');
  console.log('通过: ' + pass + ' | 失败: ' + fail);
  console.log('（未开通虚拟支付时这是正常结果；开通后把值填进 config/pay.js 再跑一次）');
  process.exit(fail === 0 ? 0 : 1);
}

// 半配置：填了一部分 = 最容易出事的状态
const half = [];
if (!offerId) half.push('offerId 空');
if (!orderApi) half.push('orderApi 空');
if (!goodsPublished) half.push('goodsPublished=false');
if (half.length && (offerId || orderApi)) {
  err('半配置状态（' + half.join(' / ') + '）—— 要么全填，要么全空；填一半比不填更容易出错');
} else {
  ok('配置完整（offerId + orderApi + goodsPublished 都已填）');
}

// ---------- 3. offerId 格式 ----------
if (offerId) {
  if (!/^[0-9]+$/.test(offerId)) {
    err('offerId 不是纯数字：' + offerId + ' —— 以 mp 后台「虚拟支付 → 基本配置」显示的为准，别带空格/引号');
  } else if (offerId.length < 6) {
    err('offerId 只有 ' + offerId.length + ' 位，看起来不像 OfferID，请回后台核对');
  } else {
    ok('offerId 格式正常（纯数字，' + offerId.length + ' 位）');
  }
}

// ---------- 4. orderApi 必须满足官方《网络》硬约束 ----------
if (orderApi) {
  const problems = [];
  if (!/^https:\/\//i.test(orderApi)) problems.push('不是 https://（官方：域名只支持 https / wss）');
  if (/^https?:\/\/\d{1,3}(\.\d{1,3}){3}/i.test(orderApi)) problems.push('用了 IP 地址（官方：域名不能用 IP）');
  if (/localhost|127\.0\.0\.1/i.test(orderApi)) problems.push('用了 localhost / 127.0.0.1（官方：不允许）');
  if (/api\.weixin\.qq\.com/i.test(orderApi)) problems.push('用了 api.weixin.qq.com（官方：禁止配为服务器域名）');
  if (/:443(\/|$)/.test(orderApi)) problems.push('带了 :443（官方：后台没配端口时，请求里连 443 也不能出现）');
  if (/\s/.test(orderApi)) problems.push('含空格');
  if (problems.length) {
    problems.forEach(function (p) { err('orderApi ' + p); });
  } else {
    ok('orderApi 满足官方《网络》约束（https / 非 IP / 非 localhost / 无 :443）');
  }
  warn('还需人工确认（脚本查不到）：该域名已完成 ICP 备案 · 已在小程序后台「服务器域名」里配置 · TLS ≥ 1.2 · 证书非自签名');
}

// ---------- 5. env ----------
if (env === 1) {
  warn('env=1 是沙箱环境 —— 现网版本只能是 0（否则官方报 -15011）');
} else if (env === 0) {
  ok('env=0（正式环境）');
} else {
  err('env 只能是 0 或 1，当前是：' + JSON.stringify(env));
}

// ---------- 6. 道具表与后台逐字核对提醒 + 单位校验 ----------
console.log('');
console.log('[道具表 —— 必须与 mp 后台「道具管理」逐字一致]');
let goods = null;
try { goods = require(GOODS_PATH); } catch (e) { goods = null; }
if (!goods || !goods.list || !goods.list.length) {
  err('读不到 data/goods.js 的道具表');
} else {
  goods.list.forEach(function (g) {
    const isInt = typeof g.price === 'number' && g.price > 0 && g.price % 1 === 0;
    console.log('  · ' + String(g.productId).padEnd(18) + ' ' + String(g.price).padStart(4) + ' 分  = ¥' + (g.price / 100));
    if (!isInt) err(g.productId + ' 的 price 必须是以「分」为单位的正整数（官方 goodsPrice 口径，否则 -15013）');
    if (!/^[a-z0-9_]+$/.test(String(g.productId))) warn(g.productId + ' 含非常规字符，注意后台是否逐字一致');
  });
  ok('道具表已列出（' + goods.list.length + ' 个）—— 请逐个对照后台 productId 与价格');
}

console.log('');
console.log('通过: ' + pass + ' | 失败: ' + fail);
if (fail === 0) console.log('配置自检通过 ✓（脚本能查的都过了，剩下三条人工确认见上面的 ⚠）');
process.exit(fail === 0 ? 0 : 1);
