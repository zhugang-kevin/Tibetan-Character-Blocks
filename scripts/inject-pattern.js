#!/usr/bin/env node
// scripts/inject-pattern.js — 把 images/pat-tile.png 的 base64 批量注入 6 个页面 WXSS 的 .sc-pattern
//
// 背景：WXSS 平铺背景只能用 base64（<image> 无 repeat、url() 引本地路径不可靠），所以纹样砖
// 是以 data URL 形式内联在每页 .sc-pattern 里的。改纹样（重跑 scripts/make_astamangala.py）之后，
// 必须把新砖同步进 6 个页面 —— 这件事以前靠手工替换，本脚本把它变成一条命令，并可供 validate 复核。
//
// 用法：node scripts/inject-pattern.js
// 幂等：重复执行结果一致。任何一页替换数 ≠ 1、或注入后解码 ≠ 砖文件本身，都按错误退出。
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PAGES = ['index', 'game', 'result', 'cert', 'passport', 'benefits'];
const TILE = path.join(ROOT, 'images', 'pat-tile.png');

const tile = fs.readFileSync(TILE);
const b64 = tile.toString('base64');
const dataUrl = "url('data:image/png;base64," + b64 + "')";

let failed = 0;
PAGES.forEach(function (name) {
  const file = path.join(ROOT, 'pages', name, name + '.wxss');
  const src = fs.readFileSync(file, 'utf8');
  // 只动 .sc-pattern 块内的 background-image（app.wxss 的 .grain 也有 base64，不能碰）
  const re = /\.sc-pattern\s*\{[^}]*?background-image:\s*url\('([^']*)'\)/;
  const m = re.exec(src);
  if (!m) {
    console.error('✗ ' + name + '.wxss 未找到 .sc-pattern 的 background-image');
    failed++;
    return;
  }
  const before = Buffer.from(m[1].replace(/^data:image\/png;base64,/, ''), 'base64');
  const next = src.replace(re, function (whole, old) {
    return whole.replace(old, 'data:image/png;base64,' + b64);
  });
  fs.writeFileSync(file, next);
  const after = /\.sc-pattern\s*\{[^}]*?background-image:\s*url\('([^']*)'\)/.exec(next);
  const okBuf = after && Buffer.from(after[1].replace(/^data:image\/png;base64,/, ''), 'base64');
  const same = okBuf && okBuf.length === tile.length && okBuf.equals(tile);
  if (same) {
    console.log((before.equals(tile) ? '= ' : '✓ ') + name + '.wxss 已内联 pat-tile.png（' +
      tile.length + 'B' + (before.equals(tile) ? '，原本一致' : '，已更新') + '）');
  } else {
    console.error('✗ ' + name + '.wxss 注入后与 pat-tile.png 不一致');
    failed++;
  }
});

if (failed) {
  console.error('注入失败：' + failed + ' 页');
  process.exit(1);
}
console.log('纹样砖已同步到 ' + PAGES.length + ' 个页面');
