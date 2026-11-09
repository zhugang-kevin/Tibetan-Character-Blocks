#!/usr/bin/env node
/**
 * 揭图池门禁（2026-11-05）
 *
 * 背景（真实事故）：
 *   第三批「image-only」67 条是从 Commons 分类树爬来的，混进了
 *     · 照片标题：'Interior of Shalu Monastery' / 'Sand mandala - Drongste Gompa 1993'
 *     · 人名：    'Sakya Lotsawa Jampai Dorje'
 *   这些一旦进揭图池，玩家通关时看到的就是一个照片名或一个僧人名，
 *   而界面上写的是「秘境图揭晓 · XXX 寺」。
 *
 * 用户 2026-11-05 明确选 A：**只用可信的 50 座，允许 150 关循环复用**。
 * 本门禁把这条决定固定成可执行规则 —— 口头约定会被下一次改动冲掉，门禁不会。
 *
 * 检查项：
 *   ① 池子里每一条都必须「可信」= verified===true，或显式 atlas===true 的补录
 *   ② 池子里不允许 atlas===false 的条目（如雍布拉康：宫殿不是寺院）
 *   ③ 名字不许像照片标题/人名（正则 + 白名单外的人工例外需显式标注）
 *   ④ 每张图必须真的在包里（路径存在）—— 这条抓到过「图片搬进分包但路径没改」
 *   ⑤ 池内不许重名（同一座寺出现两次会让人以为是两座）
 *   ⑥ 150 关必须每关都能取到揭图，且同一关重复调用结果稳定
 *   ⑦ 覆盖量必须够：池子 < 30 视为数据退化（防有人误删数据文件）
 */

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var reveal = require(path.join(ROOT, 'data/reveal-temples.js'));

var pass = 0, fail = 0;
var errors = [];

function ok(msg) { pass++; console.log('  ✓ ' + msg); }
function bad(msg) { fail++; errors.push(msg); console.log('  ✗ ' + msg); }

console.log('==========================================');
console.log('  揭图池门禁（可信寺庙 · 150 关循环）');
console.log('==========================================');

var pool = reveal.displayable();

// ① 可信性：来源必须可交代
var untrusted = pool.filter(function (t) {
  return !(t.verified === true || t.atlas === true);
});
if (untrusted.length === 0) {
  ok('池内 ' + pool.length + ' 条全部可信（verified 或显式 atlas 补录）');
} else {
  bad('池内有 ' + untrusted.length + ' 条来源不可交代：' +
      untrusted.slice(0, 5).map(function (t) { return t.name || t.nameEn; }).join('、'));
}

// ② 明确「不是寺院」的，即使被误标 atlas:true 也不许进池
//    （实测教训：只靠 atlas 标记拦不住 —— 谁手一抖改成 true 就漏了，必须名字级硬拦）
var NOT_TEMPLE = [
  '雍布拉康',      // 吐蕃第一座宫殿，不是寺院
  '布达拉宫',      // 宫殿
  '罗布林卡',      // 园林
  '日喀则宗堡',    // 城堡
  '协格尔宗堡',    // 城堡
  '德格印经院'     // 印经院
];
var intruders = pool.filter(function (t) {
  var n = t.name || '';
  return NOT_TEMPLE.some(function (x) { return n.indexOf(x) > -1; });
});
if (intruders.length === 0) {
  ok('没有「非寺院」条目混进池子（宫殿/园林/城堡/印经院）');
} else {
  bad('非寺院进了池子：' + intruders.map(function (t) { return t.name; }).join('、'));
}

// ③ 名字不能像照片标题/人名
var PHOTO_TITLE = /^(Interior|Exterior|Detail|Details|View|Views|History|Images|Old|Statue|Painting|Thangka|Portrait|Pilgrims|Monks|Debating|Prayer|Sand|The\s|\d+(st|nd|rd|th)\b)/i;
var BODY_WORD = /\b(hall|stupa|tomb|interior|mandala|terrace|display|monastery interior)\b/i;
var looksPhoto = pool.filter(function (t) {
  var n = t.name || t.nameEn || '';
  return !n || PHOTO_TITLE.test(n) || BODY_WORD.test(n);
});
if (looksPhoto.length === 0) {
  ok('没有「照片标题 / 局部构件」式条目');
} else {
  bad('疑似照片标题：' + looksPhoto.slice(0, 5).map(function (t) { return t.name || t.nameEn; }).join('、'));
}

// ④ 图片文件必须真的存在（含分包路径）
var missing = pool.filter(function (t) {
  var rel = String(t.img || '').replace(/^\//, '');
  return !fs.existsSync(path.join(ROOT, rel));
});
if (missing.length === 0) {
  ok('池内 ' + pool.length + ' 张图在包内均存在（含 package-temples-*）');
} else {
  bad('图片文件缺失 ' + missing.length + ' 张：' +
      missing.slice(0, 5).map(function (t) { return t.name + '→' + t.img; }).join('、'));
}

// ⑤ 池内不许重名
var seen = {}, dup = [];
pool.forEach(function (t) {
  var n = t.name || t.nameEn || '';
  if (seen[n]) dup.push(n);
  seen[n] = 1;
});
if (dup.length === 0) {
  ok('池内无重名（同一座寺不会出现两次）');
} else {
  bad('池内重名：' + dup.join('、'));
}

// ⑥ 150 关每关都能取到，且同一关稳定
var unresolved = [], unstable = [];
for (var lv = 1; lv <= 150; lv++) {
  var a = reveal.revealFor(lv);
  if (!a || !a.img || !a.name) { unresolved.push(lv); continue; }
  var b = reveal.revealFor(lv);
  if (b.img !== a.img || b.name !== a.name) unstable.push(lv);
}
if (unresolved.length === 0) {
  ok('150 关全部能取到揭图（图 + 名）');
} else {
  bad('取不到揭图：第 ' + unresolved.slice(0, 10).join('、') + ' 关');
}
if (unstable.length === 0) {
  ok('同一关重复调用结果稳定（不会这局是 A 寺、下局变 B 寺）');
} else {
  bad('同关结果不稳定：第 ' + unstable.slice(0, 10).join('、') + ' 关');
}

// ⑦ 池子不能太小（防误删数据文件后静默降级）
var MIN_POOL = 30;
if (pool.length >= MIN_POOL) {
  ok('池子 ' + pool.length + ' 座 ≥ ' + MIN_POOL + '（数据未退化）');
} else {
  bad('池子只剩 ' + pool.length + ' 座（< ' + MIN_POOL + '），疑似数据文件缺失');
}

// ⑧ 复用必须被标记（界面要能说「这是第 N 次见到」而不是假装新图）
var last = reveal.revealFor(150);
if (!last || last.reused !== true) {
  bad('第 150 关应标记 reused=true（池子只有 ' + pool.length + ' 座）');
} else {
  ok('超过池子的关卡都标了 reused（第 150 关 reused=true）');
}

// ⑩ 署名必须带许可协议 —— CC BY / CC BY-SA 要求「署名 + 协议」同时出现，
//    只写作者不写协议等于没满足授权条件（真被投诉时这条最要命）
var LIC = /(CC[ -]?BY(?:[ -]?SA)?(?:[ -]?\d(?:\.\d)?)?|CC0|Public\s*domain|公有领域|GFDL)/i;
var noLic = pool.filter(function (t) {
  var c = String(t.imgCredit || '').trim();
  if (!c) return true;
  // 必须是「作者 / 协议」两段。只写协议（'CC BY-SA 2.0'）同样不合规 ——
  // CC 的署名条款要的是「谁的作品 + 什么协议」。
  var parts = c.split('/');
  if (parts.length < 2) return true;
  var author = parts.slice(0, -1).join('/').trim();
  var lic = parts[parts.length - 1].trim();
  if (author.length < 2) return true;
  return !LIC.test(lic);
});
if (noLic.length === 0) {
  ok('每条署名都含「作者 + 协议」（CC 授权的硬要求）');
} else {
  bad('署名缺作者或协议 ' + noLic.length + ' 条：' +
      noLic.slice(0, 5).map(function (t) { return t.name + '→' + (t.imgCredit || '(空)'); }).join('、'));
}

// ⑪ 藏文名书写规范（项目既有标准：完整词尾必须带 ་；禁止行首 ་ 与连续 ་་）
//    注：**不做附加字合法性校验** —— `scripts/audit_combinations.js` 的穷举表只覆盖
//    30 辅音课程音节，拿它审 བསམ་ཡས་ 这类真实寺院名会误报（实测过）。字形对错仍需母语者复核。
var badTib = pool.filter(function (t) {
  if (!t.tibetan) return false;                // 没有藏文名不算错（不编）
  var s = t.tibetan;
  return !/[་།]$/.test(s) || /^་|་་/.test(s);
});
if (badTib.length === 0) {
  ok('有藏文名的条目都符合书写规范（词尾带 ་；无行首/连续 ་）');
} else {
  bad('藏文名格式不合规：' + badTib.slice(0, 5).map(function (t) { return t.name; }).join('、'));
}

console.log('------------------------------------------');
console.log('  通过: ' + pass + ' | 失败: ' + fail);
console.log('==========================================');
if (fail) {
  errors.forEach(function (e) { console.log('  - ' + e); });
  process.exit(1);
}
