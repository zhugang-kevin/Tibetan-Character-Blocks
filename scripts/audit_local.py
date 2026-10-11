#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/audit_local.py — 本地上线前深度体检（D95）

## 为什么还要它
既有测试（validate / test-tibetan / test-h5）都在查「功能对不对」。
但**上线才炸的问题**往往是另一类 —— 本地跑得通、真机上 404 / 空白 / 报错：

  ① **引用了不存在的资源**：图片、音频、字体 —— 本地看图没加载出来没人发现
  ② **引用了不存在的模块**：`require('../../utils/xxx')` 写错路径 → 页面整页白
  ③ **app.json 里的 page 缺文件**：少一个 .js 或 .wxml → 编译失败
  ④ **WXML 标签不配平**：少一个 `</view>` → 整页渲染错乱
  ⑤ **真机 URL 白名单没配**：`wx.request` 的域名没进微信后台 → 上线后请求全失败

本脚本专查这五类「静态可查、但既有测试没覆盖」的问题。

用法：python scripts/audit_local.py
"""
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IGNORE_DIRS = {'node_modules', '.git', '.workbuddy', 'preview', 'docs', 'scripts',
               'server', 'assets-src', 'miniprogram_npm'}

fails = []
warns = []
oks = []


def ok(msg): oks.append(msg); print('  ✓ ' + msg)
def bad(msg): fails.append(msg); print('  ✗ ' + msg)
def warn(msg): warns.append(msg); print('  ! ' + msg)


def walk(exts, skip=IGNORE_DIRS):
    """遍历项目文件（排除不进包的目录）"""
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in skip]
        for f in filenames:
            if any(f.endswith(e) for e in exts):
                yield os.path.join(dirpath, f)


def rel(p):
    return os.path.relpath(p, ROOT).replace('\\', '/')


print('本地深度体检')

# ---------- ① app.json 的 pages 是否都有文件 ----------
print('\n[1. app.json 的页面完整性]')
app = json.load(io.open(os.path.join(ROOT, 'app.json'), encoding='utf-8'))
missing_pages = []
for pg in app.get('pages', []):
    for ext in ('.js', '.wxml'):
        if not os.path.exists(os.path.join(ROOT, pg + ext)):
            missing_pages.append(pg + ext)
if not missing_pages:
    ok('%d 个页面都有 .js 与 .wxml' % len(app.get('pages', [])))
else:
    bad('缺页面文件：' + '、'.join(missing_pages))

# ---------- ② WXML 的 <view> 标签配平 ----------
print('\n[2. WXML 标签配平]')
unbalanced = []
for p in walk(['.wxml']):
    s = io.open(p, encoding='utf-8').read()
    for tag in ('view', 'text', 'block', 'scroll-view'):
        o = len(re.findall(r'<' + tag + r'[\s>]', s))
        c = len(re.findall(r'</' + tag + r'>', s))
        selfclose = len(re.findall(r'<' + tag + r'[^>]*/>', s))
        if o - selfclose != c:
            unbalanced.append('%s 的 <%s> 开%d/闭%d' % (rel(p), tag, o - selfclose, c))
if not unbalanced:
    ok('全部 WXML 的常用标签都配平')
else:
    for u in unbalanced[:8]:
        bad('标签不配平：' + u)

# ---------- ③ JS 的 require 路径是否存在 ----------
print('\n[3. JS 的 require 路径]')
bad_requires = []
for p in walk(['.js']):
    s = io.open(p, encoding='utf-8').read()
    for m in re.finditer(r"require\(['\"](\.[^'\"]+)['\"]\)", s):
        target = os.path.normpath(os.path.join(os.path.dirname(p), m.group(1)))
        if not (os.path.exists(target) or os.path.exists(target + '.js')):
            bad_requires.append('%s → %s' % (rel(p), m.group(1)))
if not bad_requires:
    ok('所有相对 require 都能解析到真实文件')
else:
    for b in bad_requires:
        bad('require 解析不到：' + b)

# ---------- ④ 引用的图片 / 音频是否存在 ----------
print('\n[4. 资源引用完整性]')
missing_assets = set()
# 4a. WXML/WXSS/JS 里的 /images/xxx 与 /audio/xxx
for p in walk(['.wxml', '.wxss', '.js', '.json']):
    s = io.open(p, encoding='utf-8').read()
    for m in re.finditer(r"['\"](/?(?:images|audio)/[A-Za-z0-9_\-./]+\.(?:png|jpg|jpeg|webp|gif|mp3|m4a|wav))['\"]", s):
        cand = os.path.join(ROOT, m.group(1).lstrip('/'))
        if not os.path.exists(cand):
            missing_assets.add('%s → %s' % (rel(p), m.group(1)))
# 4b. data/*.js 里以 '/images/' 或 'images/' 开头的字符串（数据驱动的资源名）
for p in walk(['.js']):
    if '/data/' not in p.replace('\\', '/'):
        continue
    s = io.open(p, encoding='utf-8').read()
    for m in re.finditer(r"['\"](/?(?:images|audio)/[A-Za-z0-9_\-./]+\.(?:png|jpg|jpeg|webp|gif|mp3|m4a|wav))['\"]", s):
        cand = os.path.join(ROOT, m.group(1).lstrip('/'))
        if not os.path.exists(cand):
            missing_assets.add('%s → %s' % (rel(p), m.group(1)))
if not missing_assets:
    ok('图片与音频引用全部指向真实文件')
else:
    for a in sorted(missing_assets)[:10]:
        bad('引用了不存在的资源：' + a)

# ---------- ⑤ 全部 JS 语法 ----------
print('\n[5. 全部 JS 语法]')
import subprocess
syn_bad = []
for p in walk(['.js']):
    r = subprocess.run(['node', '--check', p], capture_output=True, text=True)
    if r.returncode != 0:
        syn_bad.append('%s —— %s' % (rel(p), (r.stderr or '').strip().split('\n')[-1][:80]))
if not syn_bad:
    ok('全部 .js 语法通过')
else:
    for b in syn_bad[:5]:
        bad('语法错误：' + b)

# ---------- ⑥ 真机域名白名单提示 ----------
print('\n[6. 真机联网域名（上线前必须配，本地查不出）]')
net_files = []
for p in walk(['.js']):
    s = io.open(p, encoding='utf-8').read()
    s = re.sub(r'//[^\n]*', '', s)
    s = re.sub(r'/\*[\s\S]*?\*/', '', s)
    if 'wx.request' in s:
        net_files.append(rel(p))
if net_files:
    warn('以下文件会发网络请求，**上线前必须把域名加入微信后台的 request 合法域名**：')
    for f in net_files:
        print('      · ' + f)
    print('      （本地开发者工具可勾「不校验合法域名」，所以本地永远测不出这个问题）')
else:
    ok('无网络请求文件')

# ---------- ⑦ 分包配置与实际目录一致 ----------
print('\n[7. 分包配置（若启用了分包）]')
for sp in app.get('subPackages', app.get('subpackages', [])):
    root = sp.get('root', '')
    if not os.path.isdir(os.path.join(ROOT, root)):
        bad('分包目录不存在：' + root)
    else:
        ok('分包目录存在：' + root)
if not app.get('subPackages') and not app.get('subpackages'):
    print('  · 未启用分包（主包 1843KB 已接近预算时，这是可选项）')

# ---------- 汇总 ----------
print('\n' + '=' * 50)
print('  通过 %d ｜ 警告 %d ｜ **失败 %d**' % (len(oks), len(warns), len(fails)))
if fails:
    print('  存在必须修的问题，见上方 ✗')
sys.exit(1 if fails else 0)
