/**
 * 把已下载的图片信息写回 data 文件（2026-10-25）
 *
 * 背景：
 *   图片下到了 images/temples/，但 data 里的 img / imgCredit 一直是空的，
 *   导致 utils/temple-index.js 的 ready() 返回 0 —— 整个链条断在最后一环。
 *
 * 本脚本做两件事：
 *   1. 第一轮下载的 40 张（.workbuddy/tmp/temple-images.json）→ 文件名带 level 前缀，
 *      按 level 精确匹配写回
 *   2. 分类树新增的 11 张（new_<中文名>.webp）→ 按中文名匹配写回
 *
 * 用法：node scripts/writeback-temple-images.js
 */

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');

var RECORD = JSON.parse(fs.readFileSync(path.join(ROOT, '.workbuddy/tmp/temple-images.json'), 'utf8'));

// 分类树新增的 11 张：中文名 → 文件
var NEW11 = {
  '甘丹寺': 'new_甘丹寺.webp',
  '热振寺': 'new_热振寺.webp',
  '楚布寺': 'new_楚布寺.webp',
  '帕邦喀': 'new_帕邦喀.webp',
  '雍布拉康': 'new_雍布拉康.webp',
  '扎塘寺': 'new_扎塘寺.webp',
  '拉卜楞寺': 'new_拉卜楞寺.webp',
  '塔尔寺': 'new_塔尔寺.webp',
  '隆务寺': 'new_隆务寺.webp',
  '类乌齐寺': 'new_类乌齐寺.webp',
  '小昭寺': 'new_小昭寺.webp'
};
// 这 11 张的署名（从下载日志里抄下来的）
var NEW11_CREDIT = {
  '甘丹寺': 'Jan Reurink / CC BY 2.0',
  '热振寺': 'Antoine Taveneaux / CC BY-SA 3.0',
  '楚布寺': 'John Hill / CC BY-SA 3.0',
  '帕邦喀': 'John Hill / CC BY-SA 3.0',
  '雍布拉康': 'Preston Rhea / CC BY-SA 2.0',
  '扎塘寺': 'himalayanart.org / Public domain',
  '拉卜楞寺': 'SFT HQ / CC BY 2.0',
  '塔尔寺': 'Gombojab Tsybikov / Public domain',
  '隆务寺': 'gill_penney / CC BY 2.0',
  '类乌齐寺': 'Gruschke / CC BY-SA 3.0',
  '小昭寺': 'Antoine Taveneaux / CC BY-SA 3.0'
};

function patch(file, byLevel, byName) {
  var p = path.join(ROOT, file);
  var src = fs.readFileSync(p, 'utf8');
  var lines = src.split('\n');
  var hit = 0;

  lines = lines.map(function (ln) {
    // 只处理带 img: '' 的行
    if (ln.indexOf("img: ''") < 0) return ln;

    // 1) 按 level 匹配（第一轮）
    var lm = ln.match(/level:\s*(\d+)/);
    if (lm && byLevel[Number(lm[1])]) {
      var rec = byLevel[Number(lm[1])];
      ln = ln.replace("img: ''", "img: '" + rec.file + "'");
      ln = ln.replace("imgCredit: ''", "imgCredit: '" + (rec.artist || '') + ' / ' + (rec.license || '') + "'");
      hit++;
      return ln;
    }

    // 2) 按中文名匹配（分类树新增）
    var nm = ln.match(/name:\s*'([^']+)'/);
    if (nm && byName[nm[1]]) {
      ln = ln.replace("img: ''", "img: '/images/temples/" + byName[nm[1]] + "'");
      ln = ln.replace("imgCredit: ''", "imgCredit: '" + NEW11_CREDIT[nm[1]] + "'");
      hit++;
      return ln;
    }
    return ln;
  });

  fs.writeFileSync(p, lines.join('\n'), 'utf8');
  console.log(file + ' 写回 ' + hit + ' 条');
}

// 第一轮：按 level
var byLevel = {};
RECORD.forEach(function (r) {
  byLevel[r.level] = r;
});

// 第一轮的 level 范围是 1–168（第一批 1–30，第二批 31–168）
patch('data/temples.js', byLevel, NEW11);
patch('data/temples-batch2.js', byLevel, NEW11);
