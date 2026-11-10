#!/usr/bin/env node
// scripts/fill-ads.js — 拿到广告位 ID 后一键填入 + 自证（D138 / D156）
//
// ## 为什么需要
//   过去填广告位 ID 是「改 config/ads.js 三行 + 手跑三道门禁」，靠记忆：
//     · 填错类型（banner 的 ID 填进 rewarded）→ 激励视频永远拉不到，且不报错
//     · 填成网址 / OfferID → 组件不渲染，页面静默少一块
//     · 填了未接线的三类（interstitial/videoPatch/template）→ 不渲染、没收入、门禁判红
//   这个脚本把「填」和「验」收成一条命令，减少人为出错，也把口子收窄：
//   只接受 banner / video / rewarded 三个合法 ID，其余一律拒绝。
//
// ## 用法
//   node scripts/fill-ads.js --banner adunit-xxx --video adunit-yyy --rewarded adunit-zzz
//   node scripts/fill-ads.js --banner adunit-xxx --video adunit-yyy --rewarded adunit-zzz --dry-run
//   node scripts/fill-ads.js --clear          # 恢复全空（未开通态）
//
//   三个 ID 可只给部分（其余保持空），但建议一次给全。
//   填完自动跑三道门禁自证：check-ads-config + test-ad-runtime + test-ad-runtime-mutation。
//
// ## 纪律
//   · ID 必须 adunit- 开头 + 字母数字（与 utils/ads.js、check-ads-config.js 同一正则）。
//   · 同一个 ID 不得跨类型复用（官方：ID 与广告位类型必须一一匹配）。
//   · 绝不接受 interstitial / videoPatch / template（未接线，填了不渲染也没收入）。
//   · 不改收益口径：填 ID 只是「准备就绪」，真实收益仍要真机验收后才谈，且不估算。

'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CFG = path.join(ROOT, 'config', 'ads.js');
const ID_RE = /^adunit-[0-9a-z]{6,40}$/i;

const WIRED_TYPES = ['banner', 'video', 'rewarded'];
const FORBIDDEN = ['interstitial', 'videoPatch', 'template'];

function log(...a) { console.log(...a); }

function parseArgs(argv) {
  const out = { ids: {}, dryRun: false, clear: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--clear') out.clear = true;
    else if (a.startsWith('--')) {
      const key = a.slice(2);
      if (WIRED_TYPES.indexOf(key) < 0) {
        log('✗ 不认识的参数：' + a + '（只接受 --banner / --video / --rewarded / --dry-run / --clear）');
        process.exit(1);
      }
      out.ids[key] = argv[i + 1] || '';
      i++;
    }
  }
  return out;
}

function main() {
  const { ids, dryRun, clear } = parseArgs(process.argv.slice(2));

  if (clear) {
    if (dryRun) { log('（dry-run）将恢复 6 个广告位全空'); return; }
    writeCfg({ banner: '', video: '', rewarded: '' });
    log('✓ 已恢复全空（未开通态）。');
    runGates();
    return;
  }

  const given = Object.keys(ids);
  if (!given.length) {
    log('用法：node scripts/fill-ads.js --banner adunit-xxx --video adunit-yyy --rewarded adunit-zzz');
    log('     （--dry-run 预览不落盘；--clear 恢复全空）');
    process.exit(1);
  }

  // 校验格式 + 类型匹配 + 不跨类型复用
  const seen = {};
  let bad = false;
  FORBIDDEN.forEach(t => {
    if (ids[t]) { log('✗ 拒绝填入 ' + t + '：该类型未接线（运行时没有消费者），填了不渲染也不会有收入'); bad = true; }
  });
  given.forEach(t => {
    const v = (ids[t] || '').trim();
    if (!ID_RE.test(v)) {
      log('✗ ' + t + ' 的 ID 格式不对：' + v + ' —— 应为 adunit- 开头 + 字母数字（从 mp 后台复制，别手打）');
      bad = true;
      return;
    }
    if (seen[v]) { log('✗ 同一个 ID 同时填给了 ' + seen[v] + ' 和 ' + t + ' —— 官方要求 ID 与类型一一匹配'); bad = true; }
    else seen[v] = t;
  });
  if (bad) process.exit(1);

  // 合并到现有配置：只覆盖传入的三类，其余（含未接线的空）不动
  const existing = readCfg();
  const next = {
    banner: ids.banner !== undefined ? ids.banner.trim() : existing.banner,
    video: ids.video !== undefined ? ids.video.trim() : existing.video,
    rewarded: ids.rewarded !== undefined ? ids.rewarded.trim() : existing.rewarded
  };

  if (dryRun) {
    log('（dry-run，未落盘）将写入：');
    WIRED_TYPES.forEach(t => log('  ' + t + ': ' + (next[t] || '（空）')));
    return;
  }

  writeCfg(next);
  log('✓ 已写入 config/ads.js：');
  WIRED_TYPES.forEach(t => log('  ' + t + ': ' + (next[t] || '（空）')));
  runGates();
}

function readCfg() {
  const src = fs.readFileSync(CFG, 'utf8');
  const out = {};
  WIRED_TYPES.forEach(t => {
    const m = src.match(new RegExp('\\b' + t + ":\\s*'([^']*)'"));
    out[t] = m ? m[1] : '';
  });
  return out;
}

function writeCfg(ids) {
  let src = fs.readFileSync(CFG, 'utf8');
  WIRED_TYPES.forEach(t => {
    const v = ids[t] || '';
    const re = new RegExp('(\\b' + t + ":\\s*)'[^']*'");
    if (!re.test(src)) {
      log('✗ config/ads.js 里找不到 ' + t + ' 的待填行（文件结构变了？），中止，未写入');
      process.exit(1);
    }
    src = src.replace(re, '$1\'' + v + '\'');
  });
  fs.writeFileSync(CFG, src, 'utf8');
}

function runGates() {
  log('');
  log('自证门禁（填完必须全绿，任何一条红都说明配置有错）：');
  const cmds = [
    ['node scripts/check-ads-config.js', '配置自检'],
    ['node scripts/test-ad-runtime.js', '广告运行链路 93 项'],
    ['node scripts/test-ad-runtime-mutation.js', '广告门禁变异 37 项']
  ];
  let allOk = true;
  cmds.forEach(([cmd, label]) => {
    const r = spawnSync('node', cmd.split(' ').slice(1), { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const ok = r.status === 0;
    if (!ok) allOk = false;
    log('  ' + (ok ? '✓' : '✗') + ' ' + label + '（exit ' + r.status + '）');
    if (!ok && r.stdout) log(String(r.stdout).split('\n').filter(l => /✗|失败|Error/.test(l)).slice(0, 8).join('\n'));
  });
  log('');
  if (allOk) log('✅ 配置已就绪。下一步（人工，代码代做不了）：mp 后台「流量主」→ 广告位审核 → 开发者工具上传 → 真机扫码验收结算页出图。');
  else log('❌ 有门禁红了 —— 说明填进去的 ID 有问题，别上线。回看上面的 ✗。');
  process.exit(allOk ? 0 : 1);
}

main();
