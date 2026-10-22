#!/usr/bin/env node
// scripts/upload-ci.js — 不依赖微信开发者工具 GUI 的代码上传（D165）
//
// ## 为什么不用 IDE / cli.bat
//   IDE 把项目当临时窗口打开（isTemp），判定 isMiniAppProject=false，
//   收到 UPLOAD 后既不编译也不报错 → CLI 永远等。GUI 在本会话又起不来。
//   miniprogram-ci 直接调官方上传接口，**完全不需要 IDE**。
//
// ## 前置：上传密钥
//   后台 → 开发管理 → 小程序代码上传 → 生成上传密钥，下载 private.<appid>.key
//   放到项目根目录（已加 .gitignore，绝不入库）
//
// ## 用法
//   NODE_PATH=... node scripts/upload-ci.js [版本号] [描述]
//   例：node scripts/upload-ci.js 1.0.0 "首个版本"

'use strict';
const fs = require('fs');
const path = require('path');

const APPID = 'wx3378038122ee9d54';
const ROOT = path.join(__dirname, '..');
const KEY = path.join(ROOT, `private.${APPID}.key`);

const version = process.argv[2] || '1.0.0';
const desc = process.argv[3] || 'upload via miniprogram-ci';

function die(msg) {
  console.error('✗ ' + msg);
  process.exit(1);
}

if (!fs.existsSync(KEY)) {
  die(`找不到上传密钥：${KEY}\n` +
      '  去后台「开发管理 → 小程序代码上传 → 生成上传密钥」下载，\n' +
      `  重命名为 private.${APPID}.key 放到项目根目录。`);
}

let ci;
try {
  ci = require('miniprogram-ci');
} catch (e) {
  die('没装 miniprogram-ci。在 workspace 里 npm install miniprogram-ci，' +
      '并设置 NODE_PATH 指向它的 node_modules。');
}

const project = new ci.Project({
  appid: APPID,
  type: 'miniProgram',
  projectPath: ROOT,
  privateKeyPath: KEY,
  ignores: ['node_modules/**/*', 'brand/**/*', 'docs/**/*', 'scripts/**/*',
            'preview/**/*', 'server/**/*', 'assets-src/**/*']
});

console.log(`上传 ${APPID} v${version} — ${desc}`);
ci.upload({
  project,
  version,
  desc,
  setting: {
    es6: true,
    es7: true,
    minify: true,          // 压缩，主包只剩 ~1KB 余量，必须压
    minifyWXML: true,
    minifyWXSS: true,
    autoPrefixWXSS: true
  },
  onProgressUpdate: info => {
    if (typeof info === 'string') console.log('  ' + info);
    else if (info && info._msg) console.log('  ' + info._msg);
  }
}).then(res => {
  console.log('✓ 上传成功');
  console.log(JSON.stringify(res && res.subPackageInfo || res, null, 1).slice(0, 600));
}).catch(e => {
  console.error('✗ 上传失败');
  console.error(e && (e.message || e));
  if (e && e.errCode) console.error('errCode=' + e.errCode);
  process.exit(1);
});
