#!/usr/bin/env node
/**
 * 数据层「玩家可见文案」门禁（2026-11-05）
 *
 * 为什么单独做这一道：
 *   `validate.js` 的违禁词检查只扫 **.wxml / .json**（模板里的字面量）。
 *   但本项目大量文案是**运行时从 data/*.js 注入**的：
 *     `pages/index/index.wxml` → `{{item.name}}` / `{{item.goal}}`（data/learning.js 的层级名）
 *     `{{secret.title}}` / `{{daily.text}}` / `{{card.title}}` …
 *   实测抓到的真实事故：`data/learning.js` 里 L15 叫「大师挑战」、目标写「藏文拼读通级挑战」，
 *   两句话都直接显示在学习面板上 —— **「挑战」是教育类类目禁用词**，
 *   wxml 扫描一条都扫不到，线上却看得见。
 *
 * 判据：把 data/*.js 里的**字符串字面量**抽出来查违禁词。
 *   - 跳过整行注释（行首 //）
 *   - 跳过块注释
 *   - 只查被引号包起来的字面量（注释里的同名词不会命中）
 *   故意不做「裸文本扫描」：data 文件里有大量解释性注释，扫裸文本会天天假红。
 */

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var DATA_DIR = path.join(ROOT, 'data');

// 与 validate.js / content-consistency 同一份口径（游戏化措辞 = 教育类目红线）
var BANNED = ['游戏', '消除', '闯关', '关卡', '挑战', '掉落', '竞技', '排行', 'PK'];

var files = fs.readdirSync(DATA_DIR).filter(function (f) { return /\.js$/.test(f); });
var hits = [];
var scannedStrings = 0;

files.forEach(function (f) {
  var raw = fs.readFileSync(path.join(DATA_DIR, f), 'utf8');
  // 1) 去掉块注释（data 文件里没有嵌套注释，非贪婪够用）
  var noBlock = raw.replace(/\/\*[\s\S]*?\*\//g, function (m) {
    return m.replace(/[^\n]/g, ' ');          // 保留行号
  });
  var lines = noBlock.split('\n');
  lines.forEach(function (line, i) {
    var t = line.trim();
    if (t.indexOf('//') === 0) return;         // 整行注释
    // 2) 抽字符串字面量（单/双引号，支持转义）
    var re = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g;
    var m;
    while ((m = re.exec(line)) !== null) {
      var s = (m[1] !== undefined ? m[1] : m[2]) || '';
      scannedStrings++;
      for (var k = 0; k < BANNED.length; k++) {
        if (s.indexOf(BANNED[k]) > -1) {
          hits.push({
            file: 'data/' + f,
            line: i + 1,
            word: BANNED[k],
            text: s.length > 60 ? s.slice(0, 60) + '…' : s
          });
          break;
        }
      }
    }
  });
});

console.log('==========================================');
console.log('  数据层玩家可见文案门禁');
console.log('==========================================');
console.log('  扫描文件: ' + files.length + ' 个 | 字符串字面量: ' + scannedStrings + ' 条');

if (!hits.length) {
  console.log('  ✓ 没有出现游戏化违禁词（' + BANNED.join('/') + '）');
  console.log('------------------------------------------');
  console.log('  通过: 1 | 失败: 0');
  process.exit(0);
}

console.log('  ✗ 发现 ' + hits.length + ' 处违禁词：');
hits.slice(0, 30).forEach(function (h) {
  console.log('    · ' + h.file + ':' + h.line + '  「' + h.word + '」  ' + h.text);
});
console.log('------------------------------------------');
console.log('  通过: 0 | 失败: 1');
console.log('  说明：这些字符串会经 wxml 的 {{…}} 直接显示给玩家，必须改文案（不是改门禁）。');
process.exit(1);
