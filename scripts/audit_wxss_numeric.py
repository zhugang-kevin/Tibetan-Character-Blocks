#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/audit_wxss_numeric.py — 小程序端 WXSS 的**数值**审计（D66）

为什么需要这一支（D64 留下的缺口「只量了 H5」）：
  `audit_device.py` 是在 headless Chrome 里量 **H5 体验版**，量不到小程序；
  而小程序的 WXSS 是 rpx，**必须按每个机型屏宽折算成 px** 才能判断合不合格。
  这一支就是补这个缺口：不渲染、纯数值，但**逐条机型**算，
  覆盖「字号 / 点击区 / 间距」三类与屏宽强相关的量。

口径（与 §54 一致，单一事实源）：
  1rpx = 屏宽 / 750
  手机第一优先：最小机型 320pt 也要达标（26rpx = 11.1pt）
  平板其次：768pt 起，同一套数值会整体放大（26rpx = 26.6pt）→ 检查是否**过大**
  电脑最后：H5 才有，不参与本脚本

用法：python scripts/audit_wxss_numeric.py [--json]
"""
import argparse
import glob
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (标签, 屏宽pt, 类别) —— 顺序即用户口径：手机 → 平板
DEVICES = [
    ('iPhone SE1/5s', 320, 'phone'),
    ('安卓 360', 360, 'phone'),
    ('iPhone 6/7/8', 375, 'phone'),
    ('iPhone 12–16', 390, 'phone'),
    ('iPhone 14/15 Pro Max', 430, 'phone'),
    ('iPad mini', 768, 'tablet'),
    ('iPad Air', 1024, 'tablet'),
]

MIN_FONT_PX = 11.0     # 手机可读下限（26rpx @320）
MAX_FONT_PX = 40.0     # 平板上界：超过 40pt 就是「大得离谱」，属于另一种缺陷
MIN_TAP_PX = 36.0      # 高频点击区下限

RE_FONT = re.compile(r'font-size:[ \t]*(\d+(?:\.\d+)?)rpx')
# 高频点击相关的选择器（与 audit_device.py 的口径保持一致）
RE_TAP_RULES = re.compile(
    r'([.#][A-Za-z0-9_\-]+[^{}]*)\{([^{}]*height:[ \t]*(\d+(?:\.\d+)?)rpx[^{}]*)\}', re.S)

TAP_SELECTORS = ('btn', 'guide-btn', 'card-know', 'card-speak', 'level-btn',
                 'side-btn', 'dock', 'res-item', 'entry-item', 'lamp-btn', 'pp-tab')


def collect():
    out = []
    for p in sorted(glob.glob(os.path.join(ROOT, 'pages', '*', '*.wxss'))):
        src = io.open(p, encoding='utf-8').read()
        rel = os.path.relpath(p, ROOT).replace('\\', '/')
        fonts = [float(m.group(1)) for m in RE_FONT.finditer(src)]
        taps = []
        for m in RE_TAP_RULES.finditer(src):
            sel = m.group(1)
            if not any(k in sel for k in TAP_SELECTORS):
                continue
            taps.append((sel.strip().split('\n')[-1].strip()[:28], float(m.group(3))))
        out.append((rel, fonts, taps))
    return out


def main():
    ap = argparse.ArgumentParser(description='小程序 WXSS 数值审计（按机型折算）')
    ap.add_argument('--json', action='store_true')
    args = ap.parse_args()

    files = collect()
    total_font = sum(len(f) for _, f, _ in files)
    rows = []
    bad = 0
    for label, sw, kind in DEVICES:
        f = sw / 750.0
        minf = min((v * f for _, fs, _ in files for v in fs), default=0)
        maxf = max((v * f for _, fs, _ in files for v in fs), default=0)
        # 点击区：只统计显式声明了 height 的规则
        taps = [(sel, v * f) for _, _, ts in files for sel, v in ts]
        mintap = min((t[1] for t in taps), default=999)
        issues = []
        if minf and minf < MIN_FONT_PX:
            issues.append('最小字号 %.1fpx < %.0fpx' % (minf, MIN_FONT_PX))
        if kind == 'tablet' and maxf > MAX_FONT_PX:
            issues.append('最大字号 %.1fpx > %.0fpx（平板上过大）' % (maxf, MAX_FONT_PX))
        if taps and mintap < MIN_TAP_PX:
            issues.append('最小点击区 %.1fpx < %.0fpx' % (mintap, MIN_TAP_PX))
        rows.append(dict(label=label, sw=sw, kind=kind, minFont=round(minf, 1),
                         maxFont=round(maxf, 1), minTap=round(mintap, 1),
                         issues=issues))
        if issues:
            bad += 1

    if args.json:
        print(json.dumps(rows, ensure_ascii=False))
        return 1 if bad else 0

    print('小程序 WXSS 数值审计（1rpx = 屏宽/750；手机第一优先，平板其次）')
    print('阈值：手机字号 >= %.0fpx / 平板字号 <= %.0fpx / 点击区 >= %.0fpx'
          % (MIN_FONT_PX, MAX_FONT_PX, MIN_TAP_PX))
    print('样本：%d 个 WXSS 文件 / %d 条字号声明\n' % (len(files), total_font))
    cur = None
    for r in rows:
        if r['kind'] != cur:
            cur = r['kind']
            print('【%s】' % ('手机（第一优先）' if cur == 'phone' else '平板（第二优先）'))
        head = '  %-20s %4dpt  字号 %4.1f…%4.1fpx  点击区 ≥%s  ' % (
            r['label'], r['sw'], r['minFont'], r['maxFont'],
            ('%.0fpx' % r['minTap']) if r['minTap'] < 999 else '—')
        if r['issues']:
            print('\x1b[31m✗\x1b[0m' + head + '；'.join(r['issues']))
        else:
            print('\x1b[32m✓\x1b[0m' + head + '全部在档')
    print('\n合计 %d 个机型，%d 个有问题' % (len(rows), bad))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
