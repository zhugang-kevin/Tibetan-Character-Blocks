#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/fix_tone_pairs.py — 给清音字母补上「高调」，让成对区别完整（D104）

## 为什么还要这一步
`fix_voiced_letters.py` 把 7 个浊音字母的标注改成了现代卫藏音，并标出**低调**。
但清音那一侧（ཁ ཆ ཐ ཕ ཚ ཤ ས）当时没标调，读者会看到：

    ཁ  kha · 卡（送气）
    ག  ga  · 卡（拉萨音·送气·低调）

第二行说了「低调」，第一行没说 —— **读者不知道区别在哪，反而以为是笔误**。
补上「高调」后，两行成为一对完整的对立：

    ཁ  kha · 卡（送气·高调）
    ག  ga  · 卡（拉萨音·送气·低调）

## 依据
维基「标准藏语」：「以**清**辅音字母为基字的音节在标准藏语里读做**高平调**，
以**浊**辅音字母为基字的音节读做**低平调**」。
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = os.path.join(ROOT, 'data', 'cards.js')

# 字母 → (旧括注, 新括注)
PAIRS = {
    'ཁ': ('卡（送气）', '卡（送气·高调）'),
    'ཆ': ('恰（送气）', '恰（送气·高调）'),
    'ཐ': ('塔（送气）', '塔（送气·高调）'),
    'ཕ': ('帕（送气）', '帕（送气·高调）'),
    'ཚ': ('擦（送气）', '擦（送气·高调）'),
    'ཤ': ('夏（清音）', '夏（清音·高调）'),
    'ས': ('萨（清音）', '萨（清音·高调）'),
}


def main():
    src = io.open(CARDS, encoding='utf-8').read()
    orig = src
    n = 0
    print('给清音字母补「高调」（与已标低调的浊音字母成对）')
    print('')
    for ch, (old_cn, new_cn) in PAIRS.items():
        key = "tibetan: '%s'" % ch
        idx = src.find(key)
        if idx < 0:
            print('  ! 找不到 %s' % ch); continue
        seg_end = src.find('\n  }', idx)
        seg = src[idx:seg_end]
        m = re.search(r"subtitle:\s*'([^']*)'", seg)
        if not m:
            print('  ! %s 无 subtitle' % ch); continue
        old_sub = m.group(1)
        if old_cn not in old_sub:
            print('  ! %s 标注与预期不符：%s' % (ch, old_sub)); continue
        new_sub = old_sub.replace(old_cn, new_cn, 1)
        src = src[:idx] + seg.replace("subtitle: '%s'" % old_sub,
                                      "subtitle: '%s'" % new_sub, 1) + src[seg_end:]
        n += 1
        print('  ✓ %s  %-16s → %s' % (ch, old_sub, new_sub))

    if src != orig:
        io.open(CARDS, 'w', encoding='utf-8', newline='\n').write(src)
        print('')
        print('已写入（%d 条）' % n)
    else:
        print('无改动')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
