#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/fix_tablet_layout.py — 平板适配（D66）

问题（用户口径的第二优先设备）：平板上**不破版，但也只是「放大的手机」**。
根因：小程序 rpx 按屏宽缩放，iPad 1024pt 上 1rpx = 1.365pt，于是 750rpx 的手机版式
被整体拉成 1024px —— 元素巨大、左右大片留白、点一下要移动更远的手指。
这不是 bug，但**不是「针对平板设计」**。

做法：给内容加**居中最大宽度上限**（max-width）。
  · 手机（≤430pt）：max-width 不生效，版式与现在**完全一致** → 零回归风险
  · 平板（768pt+）：内容居中、宽度封顶，不再被拉伸
为什么用 `max-width` 而不是媒体查询改字号：媒体查询在小程序里要按 px 写断点，
而 rpx 本身随屏宽缩放，两套单位混用最容易出「改了一处另一处不动」的坑。
max-width 是**只封顶、不放大**，语义单一，跨端一致。

⚠️ 因此 §54 的「不得写死 ≥100px 宽度」要**精确化**：禁的是 `width:`（会把小屏顶破），
`max-width:` 是**保护性**的，必须放行 —— 否则这条门禁会逼着人拆掉平板适配。
"""
import io
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (文件, 锚点选择器, 追加的声明)
TARGETS = [
    ('preview/template.html', '.screen {',
     '\n  /* D66 平板：内容封顶居中，不再是「放大的手机」（手机端 max-width 不生效，零回归） */\n'
     '  .screen { max-width: 560px; margin-left: auto; margin-right: auto; }'),
]

WXSS = [
    ('pages/index/index.wxss', '.page {'),
    ('pages/game/game.wxss', None),
    ('pages/result/result.wxss', None),
    ('pages/cert/cert.wxss', None),
    ('pages/passport/passport.wxss', None),
    ('pages/benefits/benefits.wxss', None),
]

RULE = (
    '\n/* D66 平板适配：内容封顶居中。手机端 max-width 不生效，版式零变化；\n'
    '   平板上不再被拉成「放大的手机」。max-width 是保护性的，只封顶不放大。 */\n'
    'page { max-width: 560px; margin-left: auto; margin-right: auto; }\n'
)


def main():
    n = 0
    # 1) H5：给 .screen 加 max-width 规则（放在原规则之后，避免改动原声明）
    p = os.path.join(ROOT, 'preview', 'template.html')
    s = io.open(p, encoding='utf-8').read()
    if 'D66 平板：内容封顶居中' not in s:
        anchor = '  .screen.active { display: block; }'
        if anchor in s:
            s = s.replace(anchor, anchor + '\n' + TARGETS[0][2], 1)
            io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
            n += 1
            print('  ✓ preview/template.html：.screen 加 max-width 封顶')
        else:
            print('  ! template.html 找不到锚点 .screen.active')

    # 2) WXSS：每个页面文件末尾追加一条 page 规则（WXSS 支持 page 选择器）
    for rel, _ in WXSS:
        fp = os.path.join(ROOT, rel.replace('/', os.sep))
        if not os.path.exists(fp):
            print('  ! 缺文件 %s' % rel)
            continue
        src = io.open(fp, encoding='utf-8').read()
        if 'D66 平板适配' in src:
            print('  - %s 已有平板封顶' % rel)
            continue
        io.open(fp, 'w', encoding='utf-8', newline='\n').write(src.rstrip() + '\n' + RULE)
        n += 1
        print('  ✓ %s：page 加 max-width 封顶' % rel)

    # 回读校验
    miss = []
    for rel, _ in WXSS:
        fp = os.path.join(ROOT, rel.replace('/', os.sep))
        if not os.path.exists(fp):
            continue
        if 'max-width: 560px' not in io.open(fp, encoding='utf-8').read():
            miss.append(rel)
    tpl = io.open(os.path.join(ROOT, 'preview', 'template.html'), encoding='utf-8').read()
    if 'max-width: 560px' not in tpl:
        miss.append('preview/template.html')
    print('回读：缺平板封顶的文件 %d 个 %s' % (len(miss), miss if miss else ''))
    print('共改动 %d 个文件' % n)
    sys.exit(0 if not miss else 1)


if __name__ == '__main__':
    main()
