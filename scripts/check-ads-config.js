#!/usr/bin/env node
// scripts/check-ads-config.js — 广告位配置自检（D138）
//
// ## 为什么需要
//   广告配置错了**不会报错，只会静默没收入**，这是最坏的一种失败：
//     · ID 填成 offerId / 网址            → 组件不渲染，页面看起来"少了块东西"
//     · banner 的 ID 填进 rewarded        → 激励视频永远拉不到（官方：ID 与类型必须匹配）
//     · 同一个 ID 填到两个类型            → 只有一个能工作，另一个静默失败
//   这些都能在**不联网、不花钱、没有广告位**的情况下提前查出来。
//
// ## 用法
//   node scripts/check-ads-config.js
//   退出码：0 = 通过或未配置；1 = 配置有错。
//
// ## 口径
//   全空 = 未开通流量主，**正常状态**，不判红。填了但格式不对 = 红。

'use strict';
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const CFG = path.join(ROOT, 'config', 'ads.js');
const TYPES = ['banner', 'rewarded', 'interstitial', 'video', 'videoPatch', 'template'];
const LABEL = {
  banner: 'banner（页面内横幅）',
  rewarded: 'rewarded（激励视频）',
  interstitial: 'interstitial（插屏）',
  video: 'video（视频广告）',
  videoPatch: 'videoPatch（视频前贴）',
  template: 'template（原生模板）'
};
// 官方示例：adunit-04a286aaed8abcde —— 前缀 + 十六进制串
const ID_RE = /^adunit-[0-9a-z]{6,40}$/i;

let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✓ ' + m); };
const err = m => { fail++; console.log('  ✗ ' + m); };

console.log('广告位配置自检（D138）');
console.log('');

if (!fs.existsSync(CFG)) {
  console.log('✗ 缺 config/ads.js —— 模板文件被删了（它必须提交进仓库，无密钥）');
  process.exit(1);
}
let ads;
try { ads = require(CFG) || {}; } catch (e) {
  console.log('✗ config/ads.js 语法错误：' + e.message);
  process.exit(1);
}

const filled = TYPES.filter(t => String(ads[t] || '').trim());

if (!filled.length) {
  ok('未配置状态（6 个广告位全空）—— 不会创建任何广告实例，也不会报错');
  console.log('');
  console.log('通过: ' + pass + ' | 失败: ' + fail);
  console.log('（未开通流量主时这是正常结果；开通后从 mp 后台复制广告位 ID 填进 config/ads.js）');
  process.exit(0);
}

// 1. 格式
filled.forEach(t => {
  const v = String(ads[t]).trim();
  if (!ID_RE.test(v)) {
    err(LABEL[t] + ' 的 ID 格式不对：' + v + ' —— 应为 adunit- 开头 + 字母数字（后台复制，别手打）');
  } else {
    ok(LABEL[t] + ' 格式正常');
  }
});

// 2. 同一个 ID 不得跨类型复用（官方：ID 与广告位类型必须匹配）
const seen = {};
filled.forEach(t => {
  const v = String(ads[t]).trim();
  if (!v) return;
  if (seen[v]) err('同一个 ID 同时填给了 ' + LABEL[seen[v]] + ' 和 ' + LABEL[t] + ' —— 官方要求 ID 与类型一一匹配');
  else seen[v] = t;
});

// 3. 明显填错的东西（拿 offerId / 网址来凑）
filled.forEach(t => {
  const v = String(ads[t]).trim();
  if (/^https?:\/\//i.test(v)) err(LABEL[t] + ' 填的是网址，不是广告位 ID');
  if (/^\d{6,}$/.test(v)) err(LABEL[t] + ' 填的是一串纯数字 —— 像是 OfferID，广告位 ID 必须以 adunit- 开头');
});

// 4. 提醒：激励视频在后台建的时候要选解锁时长
if (String(ads.rewarded || '').trim()) {
  console.log('  ⚠ 激励视频广告位在后台创建时要选「解锁时长 15 / 30 秒」（官方《创建广告单元》必填项）');
}

console.log('');
console.log('通过: ' + pass + ' | 失败: ' + fail);
if (fail === 0) console.log('广告配置自检通过 ✓');
process.exit(fail === 0 ? 0 : 1);
