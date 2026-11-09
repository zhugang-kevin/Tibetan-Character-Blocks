/**
 * 下载已确认可商用的寺庙图片（2026-10-25）
 *
 * 为什么必须下载到本地：
 *   小程序 <image src> 只能引用**已备案的 request 合法域名**或包内文件。
 *   upload.wikimedia.org 不可能进白名单 → 必须下载进 images/temples/。
 *
 * 输入：.workbuddy/tmp/temple-fetch.log 里的 ---JSON--- 段
 * 输出：
 *   images/temples/<level>_<name>.jpg
 *   .workbuddy/tmp/temple-images.json  （下载记录：文件名 / 许可 / 作者 / 原始页）
 *
 * 用法：node scripts/download-temple-images.js
 */

var fs = require('fs');
var path = require('path');
var execFileSync = require('child_process').execFileSync;

var ROOT = path.join(__dirname, '..');
var LOG = path.join(ROOT, '.workbuddy/tmp/temple-fetch.log');
var OUTDIR = path.join(ROOT, 'images/temples');
var RECORD = path.join(ROOT, '.workbuddy/tmp/temple-images.json');
var PROXY = 'http://127.0.0.1:10809';

function main() {
  if (!fs.existsSync(LOG)) { console.error('找不到日志: ' + LOG); process.exit(1); }
  var raw = fs.readFileSync(LOG, 'utf8');
  var idx = raw.indexOf('---JSON---');
  if (idx < 0) { console.error('日志里没有 ---JSON--- 段（重跑时加 --json）'); process.exit(1); }

  var json = raw.slice(idx + 10).trim();
  var items;
  try { items = JSON.parse(json); } catch (e) {
    console.error('JSON 解析失败: ' + e.message);
    process.exit(1);
  }

  // 只下可商用 + 有署名的
  var ok = items.filter(function (x) {
    return !x.error && x.licenseOk && x.artist && x.fileUrl;
  });
  var noArtist = items.filter(function (x) {
    return !x.error && x.licenseOk && !x.artist;
  });

  console.log('待下载: ' + ok.length + ' 张');
  if (noArtist.length) {
    console.log('跳过（可商用但无署名，协议要求署名）: ' + noArtist.map(function (x) { return x.temple; }).join('、'));
  }

  if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });

  var record = [];
  var done = 0, fail = 0;

  ok.forEach(function (x) {
    // 文件名：level_名字.jpg（去掉括号和斜杠）
    var safe = x.temple.replace(/[（）()\/\\:*?"<>|]/g, '');
    var fname = String(x.level).padStart(3, '0') + '_' + safe + '.jpg';
    var fpath = path.join(OUTDIR, fname);

    if (fs.existsSync(fpath) && fs.statSync(fpath).size > 20000) {
      console.log('· ' + fname + ' 已存在，跳过');
      record.push(mk(x, fname));
      done++;
      return;
    }

    try {
      execFileSync('curl', [
        '-sS', '--max-time', '60', '-L', '-x', PROXY,
        '-A', 'ZangQu-TempleFetcher/1.0',
        '-o', fpath, x.fileUrl
      ], { stdio: 'pipe' });
      var size = fs.statSync(fpath).size;
      if (size < 20000) throw new Error('文件过小 ' + size + 'B');
      console.log('✓ ' + fname + ' (' + Math.round(size / 1024) + 'KB)');
      record.push(mk(x, fname));
      done++;
    } catch (e) {
      console.log('✗ ' + fname + ' — ' + (e.message || '').slice(0, 60));
      try { fs.unlinkSync(fpath); } catch (e2) {}
      fail++;
    }
  });

  fs.writeFileSync(RECORD, JSON.stringify(record, null, 2), 'utf8');
  console.log('\n下载成功: ' + done + ' | 失败: ' + fail);
  console.log('记录写入: ' + path.relative(ROOT, RECORD));
}

function mk(x, fname) {
  return {
    level: x.level,
    temple: x.temple,
    file: '/images/temples/' + fname,
    license: x.license,
    artist: x.artist,
    pageUrl: x.pageUrl,
    sourceTitle: x.title
  };
}

main();
