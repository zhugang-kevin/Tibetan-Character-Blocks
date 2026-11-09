/**
 * Wikimedia Commons 寺庙图片元数据拉取（2026-10-25）
 *
 * 只做一件事：**查元数据**，不下载图片。
 *   给每座寺庙搜一张图，读出：原始链接 / 作者 / 许可协议 / 描述页
 *
 * 为什么先只查不下载：
 *   1. 要先确认每张图的许可真的是可商用（CC BY / CC BY-SA / PD）
 *   2. 有些图是 CC BY-NC（禁商用）或 Fair use —— 这两类**不能用**
 *   3. 确认后再批量下载，避免拉了 24 张发现一半不能用
 *
 * 用法：
 *   node scripts/fetch-temple-images.js            # 只查元数据，打印表格
 *   node scripts/fetch-temple-images.js --json     # 输出 JSON 给下一步用
 *
 * 依赖：Node 内置 https（无需 npm install）
 */

var https = require('https');
var execFileSync = require('child_process').execFileSync;
var TEMPLES = require('../data/temples.js');
var TEMPLES2 = require('../data/temples-batch2.js');

var UA = 'ZangQu-TempleFetcher/1.0 (contact: project owner; purpose: cultural education app)';

// 2026-10-25：这个网络环境直连 commons.wikimedia.org 会超时，必须走代理。
// v2rayN 的 HTTP 口是 10809（SOCKS 是 10808）。
// ⚠️ 不能读 process.env.HTTPS_PROXY —— 环境里那个是沙箱自己的代理（62322），不同目标，
//    用它去连 commons 会全部 timeout。这里显式指定 v2rayN。
var PROXY = 'http://127.0.0.1:10809';

/** 发一个 GET，返回 JSON（走代理） */
function getJSON(url) {
  try {
    var out = execFileSync('curl', [
      '-sS', '--max-time', '25', '-L',          // -L 跟随重定向
      '-x', PROXY,
      '-A', UA,
      url
    ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    return Promise.resolve(JSON.parse(out));
  } catch (e) {
    return Promise.reject(new Error((e.message || 'curl failed').slice(0, 80)));
  }
}

/** 判断许可能否商用 */
function licenseOk(short) {
  if (!short) return false;
  var s = short.toUpperCase();
  if (s.indexOf('NC') >= 0) return false;          // 禁商用
  if (s.indexOf('FAIR') >= 0) return false;        // 合理使用
  if (s.indexOf('NON-FREE') >= 0) return false;
  // 允许：CC0 / PD / CC BY / CC BY-SA（含各版本）
  return /^(CC0|PD|CC[ -]BY)/.test(s) || s.indexOf('PUBLIC DOMAIN') >= 0;
}

/** 查一座寺庙 */
async function lookup(temple) {
  // 用中文名 + 藏文名一起搜，提高命中率
  var q = encodeURIComponent(temple.name + ' monastery Tibet');
  var url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*' +
            '&generator=search&gsrnamespace=6&gsrlimit=3' +
            '&gsrsearch=' + q +
            '&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=1200';

  var data;
  try { data = await getJSON(url); } catch (e) {
    return { temple: temple.name, error: e.message };
  }
  var pages = (data.query && data.query.pages) || {};
  var keys = Object.keys(pages);
  if (!keys.length) return { temple: temple.name, error: '无搜索结果' };

  // 取第一个尺寸够大的
  for (var i = 0; i < keys.length; i++) {
    var p = pages[keys[i]];
    var ii = (p.imageinfo && p.imageinfo[0]) || null;
    if (!ii) continue;
    var meta = ii.extmetadata || {};
    var lic = (meta.LicenseShortName && meta.LicenseShortName.value) || '';
    var artist = (meta.Artist && meta.Artist.value) || '';
    // 去掉 HTML 标签
    artist = artist.replace(/<[^>]+>/g, '').trim().slice(0, 60);
    var descUrl = ii.descriptionurl || '';
    var fileUrl = ii.thumburl || ii.url || '';
    var w = ii.width || 0, h = ii.height || 0;
    if (w < 800) continue;   // 太小的跳过

    return {
      temple: temple.name,
      level: temple.level,
      title: p.title,
      license: lic,
      licenseOk: licenseOk(lic),
      artist: artist,
      fileUrl: fileUrl,
      pageUrl: descUrl,
      size: w + 'x' + h
    };
  }
  return { temple: temple.name, error: '结果尺寸均小于 800px' };
}

async function main() {
  // 2026-10-25：两批合并（168 条），只查已核验的
  var list = (TEMPLES.list || []).concat(TEMPLES2.list || [])
    .filter(function (t) { return t.verified === true; });
  var out = [];
  console.log('查询 ' + list.length + ' 座已核验寺庙的图片元数据...\n');

  for (var i = 0; i < list.length; i++) {
    var r = await lookup(list[i]);
    out.push(r);
    var mark = r.error ? '✗' : (r.licenseOk ? '✓' : '⚠');
    var line = mark + ' ' + r.temple;
    if (r.error) line += ' — ' + r.error;
    else line += ' — ' + r.license + ' / ' + (r.artist || '无署名') + ' / ' + r.size;
    console.log(line);
    await new Promise(function (res) { setTimeout(res, 2500); });   // 礼貌间隔
  }

  var ok = out.filter(function (x) { return !x.error && x.licenseOk; });
  var bad = out.filter(function (x) { return x.error || !x.licenseOk; });
  console.log('\n可商用: ' + ok.length + ' | 不可用/失败: ' + bad.length);

  if (process.argv.indexOf('--json') >= 0) {
    console.log('\n---JSON---');
    console.log(JSON.stringify(out, null, 2));
  }
}

main().catch(function (e) { console.error('FATAL', e.message); process.exit(1); });
