#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把全站字号提到设备安全下限（D64）。

为什么需要：小程序是 rpx 体系（750rpx = 屏宽），字号**按屏宽等比缩放**。
按 320pt 折算，22rpx 只有 9.4pt —— 小屏机型上「点了没反应/看不清」的观感就是这么来的。
本脚本把 WXSS 的下限抬到 24rpx（360pt 机型 = 11.5pt），把体验版的 px 下限抬到 11px
（px 不随屏宽缩放，所以在所有机型上都偏小）。

⚠️ 写这个脚本时踩过一次坑：一开始用 `python - <<'PY'` 内联脚本，正则里的 \\s 被
   shell 吃掉变成 `s`，于是**匹配不到任何东西却报告「改了 0 处」** ——
   「没报错」和「真的做了」是两回事（与 D63 的假绿同源）。
   所以脚本落盘运行，并在最后**回读校验**改动条数。
"""
import glob
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RPX_FLOOR = 24   # 360pt 安全线：24 * 0.48 = 11.5pt
PX_FLOOR = 11     # 体验版 px 不随屏宽缩放，下限取 11

RE_RPX = re.compile(r'font-size:[ \t]*(\d+(?:\.\d+)?)rpx')
RE_PX = re.compile(r'font-size:[ \t]*(\d+(?:\.\d+)?)px')


def bump_rpx(m):
    global n_rpx
    v = float(m.group(1))
    if v < RPX_FLOOR:
        n_rpx += 1
        return 'font-size: %drpx' % RPX_FLOOR
    return m.group(0)


def bump_px(m):
    global n_px
    v = float(m.group(1))
    if v < PX_FLOOR:
        n_px += 1
        return 'font-size: %dpx' % PX_FLOOR
    return m.group(0)


n_rpx = 0
n_px = 0

for pat in (os.path.join(ROOT, 'pages', '*', '*.wxss'),):
    for p in glob.glob(pat):
        src = io.open(p, encoding='utf-8').read()
        out = RE_RPX.sub(bump_rpx, src)
        if out != src:
            io.open(p, 'w', encoding='utf-8', newline='\n').write(out)

tpl = os.path.join(ROOT, 'preview', 'template.html')
src = io.open(tpl, encoding='utf-8').read()
out = RE_PX.sub(bump_px, src)
if out != src:
    io.open(tpl, 'w', encoding='utf-8', newline='\n').write(out)

# ---- 回读校验：不信「改了多少」的日志，直接重新扫一遍 ------------------------
left_rpx = left_px = 0
for p in glob.glob(os.path.join(ROOT, 'pages', '*', '*.wxss')):
    for m in RE_RPX.finditer(io.open(p, encoding='utf-8').read()):
        if float(m.group(1)) < RPX_FLOOR:
            left_rpx += 1
for m in RE_PX.finditer(io.open(tpl, encoding='utf-8').read()):
    if float(m.group(1)) < PX_FLOOR:
        left_px += 1

print('WXSS 抬到 >=%drpx：改动 %d 处，回读仍不足 %d 处' % (RPX_FLOOR, n_rpx, left_rpx))
print('体验版抬到 >=%dpx：改动 %d 处，回读仍不足 %d 处' % (PX_FLOOR, n_px, left_px))
sys.exit(0 if (left_rpx == 0 and left_px == 0) else 1)
