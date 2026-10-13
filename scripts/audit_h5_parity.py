#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/audit_h5_parity.py — H5 体验版与小程序的功能对等检查（D108）

## 它防的是什么
H5 体验版是**手工维护的镜像**（`build-h5.js` 只拷 `preview/template.html` + 注入资产），
而小程序的功能写在 `pages/*/`。**两边不自动同步。**

后果（D107 实测踩到）：D99/D100/D101 的功能只改进了 `pages/`，
**H5 里一个都没有** —— 于是「H5 端到端通过」给人「已验证」的错觉，
实际那段时间的 H5 测试**从未覆盖这些功能**。

## 检查什么
对每个「已上线功能」在小程序与 H5 里各查一个**特征串**：
  · 小程序侧命中、H5 侧未命中 → **该功能没被 H5 覆盖**
这不是「H5 必须实现所有功能」，而是「**别让未覆盖的功能假装已验证**」。

## 为什么用特征串而不是结构比对
两边框架不同（WXML vs DOM），结构比对没有意义。
特征串是「这个功能的指纹」—— 找到即认为实现。

用法：python scripts/audit_h5_parity.py
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
H5 = os.path.join(ROOT, 'preview', 'play.html')

# 功能 → (小程序特征串所在文件, 特征串, H5 特征串)
FEATURES = [
    ('D99 经书经文背景（我的成绩）', 'pages/index/index.wxml', 'sutra-layer', 'sutra-layer'),
    ('D100 菩提树实景', 'pages/index/index.wxml', 'tree-stage', 'tree-stage'),
    ('D100 菩提树照片字段', 'pages/index/index.js', 'bodhiPhoto', 'bodhiPhoto'),
    ('D100 西藏寺院导览面板', 'pages/index/index.wxml', 'mon-stage', 'mon-stage'),
    ('D100 寺院导览数据', 'data/monasteries.js', 'LIST', 'monastery'),
    ('D101 浇水每日上限', 'utils/storage.js', 'waterDay', 'waterDay'),
    ('D101 浇水并发保护', 'pages/index/index.js', '_watering', '_watering'),
    # ⚠️ D110 修掉的一条**假绿**：这一项原来 H5 特征串写的是 'learn'，
    #   而 build-h5 会把 `learning` 数据整段注入 play.html —— 于是**光靠数据里的
    #   "learning" 字样就命中了**，H5 里其实一个学习面板的 DOM 都没有。
    #   特征串必须指向**UI 本身**（learn-row），不能指能被注入数据蹭中的字符串。
    ('D96 学习体系面板', 'pages/index/index.wxml', 'learn-row', 'learn-row'),
    ('D110 四层读音规则', 'data/learning.js', "rule: '", 'learn-rule'),
    ('D107 测试可控时钟', 'preview/template.html', 'function nowMs', 'function nowMs'),
]


def main():
    if not os.path.exists(H5):
        print('✗ 找不到 preview/play.html —— 先跑 node scripts/build-h5.js')
        return 2
    h5 = io.open(H5, encoding='utf-8').read()
    print('H5 与小程序的功能对等检查')
    print('  H5：preview/play.html（%.1fKB）' % (os.path.getsize(H5) / 1024.0))
    print('')
    print('  %-30s %-8s %-8s %s' % ('功能', '小程序', 'H5', '结论'))
    print('  ' + '-' * 76)

    gap = []
    for name, src, needle, h5needle in FEATURES:
        p = os.path.join(ROOT, src)
        in_mp = (os.path.exists(p) and needle in io.open(p, encoding='utf-8').read())
        in_h5 = h5needle in h5
        if in_mp and not in_h5:
            verdict = '**未覆盖**（H5 没实现，其「通过」不覆盖此功能）'
            gap.append(name)
        elif in_mp and in_h5:
            verdict = '✓ 两侧都有'
        elif not in_mp:
            verdict = '— 小程序侧无（功能未上线或已改名）'
        else:
            verdict = '— 仅 H5 有'
        print('  %-30s %-8s %-8s %s' % (name, '有' if in_mp else '无',
                                        '有' if in_h5 else '无', verdict))

    print('')
    print('=' * 76)
    if gap:
        print('  ⚠️ %d 项功能未被 H5 覆盖：%s' % (len(gap), '、'.join(gap)))
        print('     这些功能的「H5 端到端通过」**不等于**已验证 —— 需镜像进')
        print('     preview/template.html 后重跑。')
        return 1
    print('  ✅ 已上线功能均被 H5 覆盖')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
