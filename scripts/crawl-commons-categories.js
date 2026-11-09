/**
 * Commons 分类树爬取（2026-10-25）
 *
 * 思路转变：
 *   逐条搜「邦达寺」这种中文名，Commons 命中率只有 24%（41/168）。
 *   但 Commons 的**分类树**是按「地市 → 具体寺庙 → 图片」组织的，命中率高得多。
 *
 * 本脚本做三件事：
 *   1. 从 Category:Monasteries in Tibet 出发，递归收集所有子分类
 *   2. 对每个「寺庙级」分类，取其中一张可商用图片的元数据
 *   3. 输出目录：分类名（英文）/ 图片 URL / 许可 / 作者
 *
 * 输出：.workbuddy/tmp/commons-catalog.json
 * 用法：node scripts/crawl-commons-categories.js
 */

var fs = require('fs');
var path = require('path');
var execFileSync = require('child_process').execFileSync;

var ROOT = path.join(__dirname, '..');
var OUT = path.join(ROOT, '.workbuddy/tmp/commons-catalog.json');
var PROXY = 'http://127.0.0.1:10809';
var UA = 'ZangQu-TempleFetcher/1.0';
var API = 'https://commons.wikimedia.org/w/api.php';

function api(params) {
  var qs = Object.keys(params).map(function (k) {
    return k + '=' + encodeURIComponent(params[k]);
  }).join('&');
  var url = API + '?action=query&format=json&' + qs;
  for (var attempt = 0; attempt < 3; attempt++) {
    try {
      var out = execFileSync('curl', [
        '-sS', '--max-time', '30', '-L', '-x', PROXY, '-A', UA, url
      ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
      return JSON.parse(out);
    } catch (e) {
      if (attempt === 2) throw e;
      // 限流时退避
      execFileSync('sleep', ['8']);
    }
  }
}

function sleep(ms) {
  execFileSync('sleep', [String(Math.ceil(ms / 1000))]);
}

/** 取一个分类的子分类 */
function subcats(title) {
  try {
    var d = api({ list: 'categorymembers', cmtitle: title, cmlimit: '500', cmnamespace: '14' });
    return (d.query && d.query.categorymembers || []).map(function (x) { return x.title; });
  } catch (e) { return []; }
}

/** 取一个分类里的文件（图片） */
function files(title, limit) {
  try {
    var d = api({
      generator: 'categorymembers', gcmtitle: title, gcmtype: 'file', gcmlimit: String(limit || 10),
      prop: 'imageinfo', iiprop: 'url|extmetadata|size', iiurlwidth: '1200'
    });
    var pages = (d.query && d.query.pages) || {};
    return Object.keys(pages).map(function (k) { return pages[k]; });
  } catch (e) { return []; }
}

function licenseOk(s) {
  if (!s) return false;
  var u = s.toUpperCase();
  if (u.indexOf('NC') >= 0 || u.indexOf('FAIR') >= 0) return false;
  return /^(CC0|PD|CC[ -]BY)/.test(u) || u.indexOf('PUBLIC DOMAIN') >= 0;
}

function pickImage(filesArr) {
  for (var i = 0; i < filesArr.length; i++) {
    var p = filesArr[i];
    var ii = (p.imageinfo && p.imageinfo[0]) || null;
    if (!ii) continue;
    var meta = ii.extmetadata || {};
    var lic = (meta.LicenseShortName && meta.LicenseShortName.value) || '';
    if (!licenseOk(lic)) continue;
    if ((ii.width || 0) < 700) continue;
    var artist = ((meta.Artist && meta.Artist.value) || '').replace(/<[^>]+>/g, '').trim().slice(0, 60);
    if (!artist) continue;   // 无署名的跳过（协议要求）
    return {
      file: p.title,
      thumb: ii.thumburl || ii.url,
      orig: ii.url,
      license: lic,
      artist: artist,
      page: ii.descriptionurl || '',
      size: (ii.width || 0) + 'x' + (ii.height || 0)
    };
  }
  return null;
}

// ─── 主流程 ───
var ROOTS = [
  'Category:Buddhist monasteries in Tibet',
  'Category:Tibetan Buddhist monasteries in Ü-Tsang',
  'Category:Tibetan Buddhist monasteries in Amdo',
  'Category:Tibetan Buddhist monasteries in Kham',
  'Category:Monasteries in Tibet'
];

var seen = {};
var queue = [];
ROOTS.forEach(function (r) { queue.push({ title: r, depth: 0 }); });

var catalog = [];
var visitedCats = 0;

while (queue.length && visitedCats < 220) {
  var cur = queue.shift();
  if (seen[cur.title]) continue;
  seen[cur.title] = 1;
  visitedCats++;

  // 这个分类下有没有可用的图？
  var fs2 = files(cur.title, 8);
  var img = pickImage(fs2);
  if (img) {
    catalog.push({
      category: cur.title.replace('Category:', ''),
      depth: cur.depth,
      image: img
    });
    console.log('✓ ' + cur.title.replace('Category:', '') + ' — ' + img.license + ' / ' + img.artist);
  }

  // 还有没有更细的子类？（最多下钻 4 层）
  if (cur.depth < 4) {
    var kids = subcats(cur.title);
    kids.forEach(function (k) { if (!seen[k]) queue.push({ title: k, depth: cur.depth + 1 }); });
  }

  sleep(700);   // 礼貌间隔，避免限流
}

fs.writeFileSync(OUT, JSON.stringify({
  crawledAt: new Date().toISOString(),
  categoriesVisited: visitedCats,
  withImage: catalog.length,
  items: catalog
}, null, 2), 'utf8');

console.log('\n访问分类: ' + visitedCats + ' | 有可用图: ' + catalog.length);
console.log('目录写入: ' + path.relative(ROOT, OUT));
