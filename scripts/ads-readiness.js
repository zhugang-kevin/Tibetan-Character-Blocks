#!/usr/bin/env node
// scripts/ads-readiness.js — 广告「就绪度」核对（D156）
//
// ## 为什么需要它
//   广告这件事有**两类阻塞**，混在一起谈就会自欺：
//     ① 代码侧：接线、渲染条件、发奖判据 —— 这些能验证，也必须验证；
//     ② 外部侧：流量主开通、广告位创建与审核、真机验收 —— 代码一行都代做不了。
//   过去只在文档里写「ID 全空、收入为 0」，没人能一眼看出"到底还差什么"。
//   本脚本每次都从 config/ads.js + utils/ads.js + pages/ 现读，不缓存、不猜。
//
// ## 用法
//   node scripts/ads-readiness.js           # 打印就绪度（永远 exit 0）
//   node scripts/ads-readiness.js --check   # 代码侧不自洽时 exit 1（外部阻塞不判红）
//
// ## 纪律
//   · 不估算收益：竞价定价，官方不承诺单价；没跑满真实数据前任何数字都是编的。
//   · 不把「外部未完成」写成「通过」：那是粉饰，比失败更糟。

'use strict';
const path = require('path');
const fs = require('fs');

const ROOT = process.env.ADS_TEST_ROOT
  ? path.resolve(process.env.ADS_TEST_ROOT)
  : path.join(__dirname, '..');

const TYPES = ['banner', 'rewarded', 'interstitial', 'video', 'videoPatch', 'template'];
const CONSUMER = {
  banner: 'pages/result',
  video: 'pages/result',
  rewarded: 'pages/game'
};
const LABEL = {
  banner: '结算页横幅（video 的退路）',
  video: '结算页视频',
  rewarded: '游戏页激励（看一段·得一次提示）',
  interstitial: '插屏',
  videoPatch: '视频前贴',
  template: '原生模板'
};

function loadAds() {
  try {
    const c = require(path.join(ROOT, 'utils', 'ads.js'));
    return { unit: c.unit, enabled: c.enabled, WIRED: c.WIRED || {}, err: null };
  } catch (e) {
    return { unit: () => '', enabled: () => false, WIRED: {}, err: e.message };
  }
}

function main() {
  const check = process.argv.indexOf('--check') > -1;
  const ads = loadAds();
  const problems = [];

  console.log('广告就绪度（现读 config/ads.js + utils/ads.js + pages/，不猜）');
  console.log('');
  if (ads.err) {
    console.log('  ✗ 读不到 utils/ads.js：' + ads.err);
    process.exit(1);
  }

  console.log('代码侧');
  // 中文宽度按 2 列算，否则「填入 config/ads.js」这种会被截断成半截
  const width = s => Array.from(String(s)).reduce((n, ch) => n + (/[\u4e00-\u9fa5\uff00-\uffef]/.test(ch) ? 2 : 1), 0);
  const pad = (s, n) => {
    s = String(s);
    const w = width(s);
    if (w >= n) return s + ' ';
    return s + ' '.repeat(n - w);
  };
  TYPES.forEach(function (t) {
    const wired = ads.WIRED[t] === true;
    const id = ads.unit(t);
    const filled = !!id;
    const consumer = CONSUMER[t] || '—';
    const state = !wired
      ? (filled ? '已填 → 无消费者，会判红' : '空（运行时没接）')
      : (filled ? '已配置 → 会渲染' : '空 → 不建实例 / 不渲染 / 不报错');
    console.log('  ' + pad(t, 14) + pad(wired ? '已接线' : '未接线', 8) + pad(state, 34) + consumer);
    if (filled && !wired) problems.push(t + ' 填了 ID 但运行时没接线（不会渲染、也不会有收入）');
    if (wired && !fs.existsSync(path.join(ROOT, CONSUMER[t]))) problems.push(t + ' 声明已接线，但找不到消费者页面 ' + CONSUMER[t]);
  });

  const wiredFilled = TYPES.filter(t => ads.WIRED[t] === true && ads.unit(t));
  const wiredAll = TYPES.filter(t => ads.WIRED[t] === true);

  console.log('');
  if (problems.length) {
    problems.forEach(p => console.log('  ✗ ' + p));
  } else if (wiredFilled.length === 0) {
    console.log('  ✓ 代码侧已就绪：空态下 0 实例、0 渲染、0 报错（由 test-ad-runtime.js 证明）');
    console.log('  ✓ 填充态也被证明过：临时根填 3 个合法 ID 后，两道广告门禁仍全绿（变异用例「填入 3 个已接线 ID」）');
  } else if (wiredFilled.length === wiredAll.length) {
    console.log('  ✓ 代码侧已配置：' + wiredAll.length + ' 个已接线广告位都有 ID，页面会渲染');
  } else {
    console.log('  ⚠ 部分配置：已填 ' + wiredFilled.join('、') + '；未填 ' +
      wiredAll.filter(t => !wiredFilled.includes(t)).join('、') + '（未填的不渲染，属正常）');
  }

  console.log('');
  console.log('外部阻塞（代码无法代做，只能人工）');
  const anyFilled = TYPES.some(t => ads.unit(t));
  const external = [
    ['① 流量主开通', false, '门槛：累计 UV ≥ 500 且无违规（查询日期 2026-11-07）→ mp 后台「推广 → 流量主」'],
    ['② 建广告位', anyFilled, 'banner / video / rewarded 各建一个；rewarded 必填 15/30 秒解锁时长'],
    ['③ 广告位审核', anyFilled, '平台审核通过后 ID 才能拉到广告'],
    ['④ 填入 config/ads.js', anyFilled, '只填 banner / video / rewarded；不要填未接线的三类（会判红）'],
    ['⑤ 真机验收', false, '开发者工具上传 → 扫码 → 结算页出图；激励入口必须在广告拉取成功后才出现'],
    ['⑥ 真实收益', false, '未跑满真实数据前**不估算**：竞价定价，官方不承诺单价']
  ];
  external.forEach(function (row) {
    console.log('  ' + pad(row[0], 22) + pad(row[1] ? '已完成' : '未完成', 8) + row[2]);
  });

  console.log('');
  console.log('下一步：docs/上线阻塞与边界-2026-11-09.md');
  console.log('门禁：node scripts/check-ads-config.js && node scripts/test-ad-runtime.js && node scripts/test-ad-runtime-mutation.js');

  if (check && problems.length) process.exit(1);
}

main();
