/**
 * 图片重复引用检查（2026-10-24）
 *
 * 为什么要有这条：长明灯弹窗曾把 buddha-bg.jpg 当成卡片背景和佛龛主体各引一次，
 * 两层叠在一起，用户看到的是「图片一个叠一个」。当时没有任何门禁能发现。
 *
 * 判定规则：
 *   同一个 wxml 文件里，同一个图片路径**出现 2 次以上** = 疑似重复引用
 *   例外：明确标记 `data-allow-dup` 的（例如确实要前后两层做视差）
 *
 * 用法：node scripts/test-image-dup.js
 * 退出码：0 = 通过；1 = 发现重复
 */
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var TARGETS = [];

function walk(dir) {
  var list;
  try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  list.forEach(function (e) {
    var p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'preview' || e.name.startsWith('.')) return;
      walk(p);
    } else if (e.name.endsWith('.wxml')) {
      TARGETS.push(p);
    }
  });
}

walk(ROOT);

var pass = 0;
var fail = 0;
var problems = [];

TARGETS.forEach(function (file) {
  var src = fs.readFileSync(file, 'utf8');

  // 抓 <image ... src="..." ...>（只抓标签内部，避免误伤注释里的示例）
  var imgRe = /<image\b[^>]*>/g;
  var counts = {};
  var order = [];
  var m;

  while ((m = imgRe.exec(src)) !== null) {
    var tag = m[0];
    var srcM = tag.match(/src\s*=\s*"([^"]+)"/);
    if (!srcM) continue;
    var p = srcM[1];
    // 跳过动态绑定（{{...}}），它们运行时才确定，静态查不准
    if (p.indexOf('{{') >= 0) continue;
    // 跳过带显式允许标记的
    if (tag.indexOf('data-allow-dup') >= 0) continue;

    if (!counts[p]) { counts[p] = 0; order.push(p); }
    counts[p]++;
  }

  order.forEach(function (p) {
    if (counts[p] > 1) {
      fail++;
      problems.push(path.relative(ROOT, file) + ' → ' + p + ' 出现 ' + counts[p] + ' 次');
    } else {
      pass++;
    }
  });
});

console.log('扫描 wxml 文件: ' + TARGETS.length);
console.log('唯一定向图片引用: ' + pass + ' 个');
console.log('重复引用: ' + fail + ' 个');
console.log('');

if (fail === 0) {
  console.log('✓ 没有图片在同一页面被重复引用');
  process.exit(0);
}

console.log('✗ 发现重复引用（两层叠在一起的风险）：');
problems.forEach(function (p) { console.log('  · ' + p); });
console.log('');
console.log('处理方式：删掉其中一层，或给确实需要的那个加 data-allow-dup 标记并写明理由。');
process.exit(1);
