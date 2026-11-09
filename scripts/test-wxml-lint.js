#!/usr/bin/env node
// scripts/test-wxml-lint.js — WXML / WXSS 结构门禁（补真机前最后一道静态防线）
//
// ## 为什么需要
//   WXML / WXSS 的错**只能被微信编译器发现**，`node --check` 与 `validate.js` 都查不出来：
//     · 标签没闭合、属性引号没配对 → 编译失败（有时只给一个 code 10，不给行号）
//     · `wx:else` 没有紧跟 `wx:if` / `wx:elif` → 同样 code 10
//     · `bindtap` 指向一个已被删掉的方法 → 真机上「点了没反应」，静态文本看着完全正常
//   这些都能在**不启动开发者工具**的前提下查出来。查不出的只剩样式渲染结果本身。
//
// ## 四条判据（只留高信号、低误报的）
//   ① 标签闭合平衡（含自闭合 `/>`），报行号
//   ② 属性引号配对（引号或 {{ }} 没配对 → 标签切不出来）
//   ③ `wx:else` / `wx:elif` 必须紧跟同层级的 `wx:if` / `wx:elif`
//   ④ `bind*` / `catch*` 绑定的处理函数必须在同名 .js 里真的存在
//   另：WXSS 花括号平衡 + `@import` 目标存在
//
// ## 自带自证（`--self-test`，也在默认流程里跑）
//   每条判据都先用一段**已知坏掉的样例**验证它会报错，再用一段**已知合规的样例**验证它不误报。
//   否则「全绿」只能证明脚本没崩，不能证明它有用。
//
// ## 明确不查（说了不查，就不假装查了）
//   · 样式最终渲染效果、rpx 换算后的实际像素 → 真机 / 截图对比
//   · 组件的运行时行为 → scripts/test-ad-runtime.js 等行为门禁用替身跑
//
// 用法：node scripts/test-wxml-lint.js [--self-test]

'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ROOTS = ['pages', 'package-service', 'package-praise', 'package-temples-1', 'package-temples-2'];

let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✓ ' + m); };
const err = m => { fail++; console.log('  ✗ ' + m); };

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

// 去掉注释，但**保持行号**（等长空格替换）
function blankComments(src) {
  return src.replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '));
}

// 极简 WXML 扫描：跳过 {{ }} 内的比较符与引号内的 '>'，
// 否则 `wx:if="{{a > b}}"` 会被当成标签结束切坏（假红）。
function scanTags(src) {
  const out = [];
  let i = 0, line = 1;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\n') { line++; i++; continue; }
    if (ch !== '<') { i++; continue; }
    let j = i + 1, quote = null, braces = 0;
    while (j < src.length) {
      const c = src[j];
      if (c === '\n') line++;
      if (quote) { if (c === quote) quote = null; j++; continue; }
      if (c === '"' || c === "'") { quote = c; j++; continue; }
      if (c === '{' && src[j + 1] === '{') { braces++; j += 2; continue; }
      if (c === '}' && src[j + 1] === '}' && braces) { braces--; j += 2; continue; }
      if (c === '>' && !braces) break;
      j++;
    }
    if (j >= src.length) { out.push({ type: 'bad', raw: src.slice(i, i + 40), line }); break; }
    const raw = src.slice(i + 1, j).trim();
    const startLine = line;
    i = j + 1;
    if (!raw || raw[0] === '!' || raw[0] === '?') continue;
    if (raw[0] === '/') { out.push({ type: 'close', name: raw.slice(1).trim(), line: startLine }); continue; }
    const self = /\/$/.test(raw);
    const body = self ? raw.slice(0, -1).trim() : raw;
    const name = (body.match(/^[A-Za-z0-9_:-]+/) || [''])[0];
    out.push({ type: self ? 'self' : 'open', name, body, line: startLine });
  }
  return out;
}

function attrsOf(body) {
  const s = String(body || '').replace(/^[A-Za-z0-9_:-]+/, '');
  const out = {};
  const re = /([A-Za-z0-9_:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(s))) out[m[1]] = m[3] !== undefined ? m[3] : m[4];
  const bare = /\s([A-Za-z0-9_:.-]+)(?=\s|$)/g;
  while ((m = bare.exec(s))) if (!(m[1] in out)) out[m[1]] = '';
  return out;
}

// 纯函数：给文本，返回错误列表（自证与实跑共用同一套判据）
function analyzeWxml(src, jsSrc) {
  const errors = [];
  const tags = scanTags(blankComments(src));
  const root = { children: [] };
  const stack = [root];      // stack[0] 是虚拟根

  for (const t of tags) {
    if (t.type === 'bad') {
      errors.push('第 ' + t.line + ' 行：标签没有闭合的 ">"（引号或 {{ }} 没配对）：' + t.raw.replace(/\s+/g, ' '));
      continue;
    }
    if (t.type === 'self') {
      stack[stack.length - 1].children.push({ name: t.name, attrs: attrsOf(t.body), line: t.line, children: [] });
      continue;
    }
    if (t.type === 'open') {
      const node = { name: t.name, attrs: attrsOf(t.body), line: t.line, children: [] };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
      continue;
    }
    // close
    const top = stack[stack.length - 1];
    if (top.name === t.name) { stack.pop(); continue; }
    errors.push('第 ' + t.line + ' 行：闭合标签 </' + t.name + '> 与最近的 <' + (top.name || '?') + '> 不匹配');
    // 容错：往回找同名节点，让后面的检查还能继续
    for (let k = stack.length - 2; k >= 0; k--) {
      if (stack[k].name === t.name) { stack.length = k; break; }
    }
  }
  if (stack.length > 1) {
    errors.push('有未闭合的标签：<' + stack.slice(1).map(n => n.name).join('>, <') + '>');
  }

  // ③ wx:else / wx:elif 相邻性（同层级）
  const chain = function (children) {
    for (let i = 0; i < children.length; i++) {
      const c = children[i];
      const a = c.attrs || {};
      const isElse = 'wx:else' in a, isElif = 'wx:elif' in a;
      if (isElse || isElif) {
        const prev = children[i - 1];
        const prevOk = prev && prev.attrs && ('wx:if' in prev.attrs || 'wx:elif' in prev.attrs);
        if (!prevOk) {
          errors.push('第 ' + c.line + ' 行：<' + c.name + '> 上的 ' + (isElse ? 'wx:else' : 'wx:elif') +
            ' 没有紧跟带 wx:if / wx:elif 的兄弟节点（编译 code 10）');
        }
      }
      if (c.children && c.children.length) chain(c.children);
    }
  };
  chain(root.children);

  // ④ 事件处理函数必须真的存在
  if (typeof jsSrc === 'string') {
    const seen = {};
    for (const t of tags) {
      if (!t.body) continue;
      const attrs = attrsOf(t.body);
      for (const k of Object.keys(attrs)) {
        if (!/^(bind|catch|capture-bind|capture-catch)/.test(k)) continue;
        const h = String(attrs[k]).trim();
        if (!h || h.indexOf('{{') > -1) continue;
        if (seen[h]) continue;
        seen[h] = k;
        const safe = h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (!new RegExp('(^|[\\s,{])' + safe + '\\s*[:(]').test(jsSrc))
          errors.push('绑定了不存在的方法：' + k + '="' + h + '"（真机点了没反应）');
      }
    }
  }
  return errors;
}

function analyzeWxss(src, fileDir) {
  const errors = [];
  const body = String(src).replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
  let depth = 0, line = 1, badLine = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '\n') line++;
    if (c === '{') depth++;
    if (c === '}') { depth--; if (depth < 0 && !badLine) badLine = line; }
  }
  if (depth !== 0 || badLine)
    errors.push(badLine ? ('第 ' + badLine + ' 行多了一个 }') : '结尾少 }');
  const re = /@import\s+["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(body))) {
    if (fileDir && !fs.existsSync(path.resolve(fileDir, m[1])))
      errors.push('@import 目标不存在：' + m[1]);
  }
  return errors;
}

// ── 自证：已知坏样例必须报错，已知好样例必须不报错 ────────────────────────
function selfTest() {
  const GOOD = [
    '<view wx:if="{{a > b}}" class="x">A</view>',
    '<view wx:elif="{{a > 0}}">B</view>',
    '<view wx:else>C</view>',
    '<image src="/a.png" />',
    '<view bindtap="onTap" data-id="{{x}}"><text>{{ y }}</text></view>',
    '<view hidden="{{h}}" aria-role="button">z</view>',
    '<!-- <view> 注释里的标签不参与 -->'
  ].join('\n');
  const goodJs = 'Page({ onTap: function () {} });';
  const bad = [
    ['未闭合标签', '<view><text>x</text>', goodJs, /未闭合/],
    ['标签不匹配', '<view><text>x</view>', goodJs, /不匹配/],
    ['wx:else 不紧跟 wx:if', '<view>A</view>\n<view wx:else>B</view>', goodJs, /wx:else/],
    ['wx:else 被元素隔开', '<view wx:if="{{a}}">A</view>\n<view>x</view>\n<view wx:else>B</view>', goodJs, /wx:else/],
    ['绑定了不存在的方法', '<view bindtap="onNope">x</view>', goodJs, /不存在的方法/],
    ['引号没配对', '<view class="x>A</view>', goodJs, /没有闭合/],
    ['WXSS 少一个 }', '.a { color: red;', null, /多了一个 }|少 }/],
    ['WXSS 多一个 }', '.a { color: red; } }', null, /多了一个 }/]
  ];

  let badCount = 0;
  const goodErrors = analyzeWxml(GOOD, goodJs).concat(analyzeWxss('.a { color: red; }', null));
  if (goodErrors.length) { badCount++; err('自证失败：合规样例被误报 → ' + goodErrors.join(' | ')); }
  else ok('自证：合规样例 0 误报（含 wx:if 里的 ">"、自闭合、注释里的标签）');

  for (const [name, src, js, re] of bad) {
    const errs = src.indexOf('{ color') > -1 ? analyzeWxss(src, null) : analyzeWxml(src, js);
    if (errs.some(e => re.test(e))) ok('自证：' + name + ' → 会报错');
    else { badCount++; err('自证失败：' + name + ' 没被查出来（这条判据是摆设）'); }
  }
  return badCount;
}

function lintWxml(file) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const jsFile = file.replace(/\.wxml$/, '.js');
  const jsSrc = fs.existsSync(jsFile) ? fs.readFileSync(jsFile, 'utf8') : null;
  const errors = analyzeWxml(fs.readFileSync(file, 'utf8'), jsSrc);
  if (errors.length) errors.forEach(e => err(rel + ' ' + e));
  else ok(rel + '：标签平衡、wx:else 相邻' + (jsSrc ? '、事件处理函数都存在' : ''));
}

function lintWxss(file) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const errors = analyzeWxss(fs.readFileSync(file, 'utf8'), path.dirname(file));
  if (errors.length) errors.forEach(e => err(rel + ' ' + e));
  else ok(rel + '：花括号平衡、@import 都在');
}

function main() {
  console.log('WXML / WXSS 结构门禁');
  console.log('');
  console.log('自证（先证明判据不是摆设）');
  const badCount = selfTest();

  let wxml = [], wxss = [];
  for (const r of ROOTS) {
    const dir = path.join(ROOT, r);
    if (!fs.existsSync(dir)) continue;
    for (const f of walk(dir, [])) {
      if (f.endsWith('.wxml')) wxml.push(f);
      else if (f.endsWith('.wxss')) wxss.push(f);
    }
  }
  console.log('');
  console.log('WXML（' + wxml.length + ' 个）');
  wxml.sort().forEach(lintWxml);
  console.log('');
  console.log('WXSS（' + wxss.length + ' 个）');
  wxss.sort().forEach(lintWxss);

  console.log('');
  console.log('通过: ' + pass + ' | 失败: ' + fail);
  console.log('（查不出的部分：样式最终渲染 / rpx 实际像素 → 只能真机或截图对比）');
  if (fail || badCount) process.exit(1);
}

main();
