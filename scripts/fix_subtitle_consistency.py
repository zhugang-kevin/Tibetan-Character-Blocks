#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/fix_subtitle_consistency.py — 把 30 条读音标注的**标法统一**（D104）

## 问题
改完浊音字母后，把 30 条排在 一起看，会发现**标注体例不统一**：

    ཀ  ka · 嘎（不送气）      ← 有标注
    ཅ  ca · 夹               ← 没有！与 ཀ 不对称，学习者看不出 ཅ/ཆ 的对立
    ཆ  cha · 恰              ← 没有！与 ཁ 不对称
    ཉ  nya · 尼亚            ← 没有
    ཝ  wa · 哇               ← 没有
    ཡ  ya · 亚               ← 没有
    ལ  la · 拉               ← 没有
    ཧ  ha · 哈               ← 没有

学藏文的第一步就是搞清「不送气 / 送气 / 浊 / 鼻音」四列对立（每列 4 个）。
**标法不统一，等于把规律藏起来了。**

## 本次统一体例
  · 塞音/塞擦音：`（不送气·高调）` / `（送气·高调）` / `（拉萨音·送气·低调）`
  · 擦音：`（清音·高调）` / `（拉萨音·清擦·低调）`
  · 鼻音：`（鼻音）`
  · 半元音/边音：`（半元音）` / `（边音）` / `（近音·卷舌）`
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = os.path.join(ROOT, 'data', 'cards.js')

# 字母 → (旧完整 subtitle, 新完整 subtitle)
NORM = {
    'ཅ': ('ca · 夹', 'ca · 夹（不送气·高调）'),
    'ཆ': ('cha · 恰', 'cha · 恰（送气·高调）'),
    'ཉ': ('nya · 尼亚', 'nya · 尼亚（鼻音）'),
    'ཝ': ('wa · 哇', 'wa · 哇（半元音）'),
    'ཡ': ('ya · 亚', 'ya · 亚（半元音）'),
    'ལ': ('la · 拉', 'la · 拉（边音）'),
    'ཧ': ('ha · 哈', 'ha · 哈（清擦音·高调）'),
    # ར「热」在普通话里声母是 ʐ（浊擦），而卫藏 ར 是 ʐà 近音；标注补清楚
    'ར': ('ra · 热（卷舌）', 'ra · 热（近音·卷舌·低调）'),
}


def main():
    src = io.open(CARDS, encoding='utf-8').read()
    orig = src
    n = 0
    print('统一 30 条读音标注的体例')
    print('')
    for ch, (old_sub, new_sub) in NORM.items():
        key = "tibetan: '%s'" % ch
        idx = src.find(key)
        if idx < 0:
            print('  ! 找不到 %s' % ch); continue
        seg_end = src.find('\n  }', idx)
        seg = src[idx:seg_end]
        m = re.search(r"subtitle:\s*'([^']*)'", seg)
        if not m:
            print('  ! %s 无 subtitle' % ch); continue
        cur = m.group(1)
        if cur != old_sub:
            print('  ! %s 实际是「%s」，与预期「%s」不符（跳过，不硬改）' % (ch, cur, old_sub))
            continue
        src = src[:idx] + seg.replace("subtitle: '%s'" % cur,
                                      "subtitle: '%s'" % new_sub, 1) + src[seg_end:]
        n += 1
        print('  ✓ %s  %-22s → %s' % (ch, old_sub, new_sub))

    if src != orig:
        io.open(CARDS, 'w', encoding='utf-8', newline='\n').write(src)
        print('')
        print('已写入（%d 条）' % n)
    else:
        print('无改动')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
