#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/fix_voiced_letters.py — 修正 7 个浊音字母的读音标注（D104）

## 依据（四方一致，见 scripts/audit_letter_reading.py 头部出处）
1. 维基「标准藏语」：「基字声母为**浊塞音、浊擦音和浊塞擦音的字母，读成相对应的送气清辅音**」
2. 百度百科「浊音」：藏语卫藏方言「**全浊声母当无前加字或上加字时送气**」（安多方言保留浊音）
3. 维基「清浊音」：同一规律，并给出卫藏/安多的对比表
4. Wikibooks「Tibetan」：现代读音列 `ག [ɡà/kʰːà]`、`ད [dà/tʰːà]`、`བ [bà/pʰːà]`、`ཛ [dzà/tsʰːà]`

## 本项目的问题（三方互相矛盾）
· **标注**写「浊音」→ 那是**古典（9 世纪书面）音**
· **中文近字**给的是 嘎/加/达/巴/杂 → 这些在普通话里都是**不送气清音**，既不是浊音、也不是送气
· **音频**由天翼 zhuoma 合成，是**卫藏方言** → 按规律应为**送气清音**
→ 三者各不相同。学的人听到一个、读到另一个、记住第三个。

## 本次改什么、不改什么
· **改**：中文近字与括注 → 与**现代卫藏音**对齐（与音频同口径）
· **不改**：威利转写（`ga`/`ja`/`da`/`ba`/`dza`）——那是**字母的转写名**，与读音口径无关，动了反而错
· **补**：description 里点明「古典浊音在现代卫藏已清化」，让这条知识不会丢
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = os.path.join(ROOT, 'data', 'cards.js')

# 字母 → (旧中文标注, 新中文标注, 卫藏IPA, 说明)
#   ⚠️ 必须带**声调**：清化之后 ག 与 ཁ 的声母**完全相同**（都是 kʰ），
#     唯一的区别就是声调（浊声母清化后读低平调，清声母读高平调）。
#     第一版只写「卡（拉萨音·送气）」，结果 ག 与 ཁ 两条标注**一模一样**，等于没区分开。
FIX = {
    'ག': ('嘎（浊音）', '卡（拉萨音·送气·低调）', 'kʰà',
          '古典藏语为浊音 ɡa；现代卫藏（拉萨）方言全浊声母在无前加字时清化为**送气清音**，故读 kʰà，且因源自浊声母而读**低平调**（与清声母 ཁ kʰá 的高平调相区别）。安多方言仍保留浊音 ɡa。'),
    'ཇ': ('加（浊音）', '恰（拉萨音·送气·低调）', 'tɕʰà',
          '古典藏语为浊音 dʑa；现代卫藏方言清化为**送气清音** tɕʰà，读**低平调**（与 ཆ tɕʰá 的高平调相区别）。安多方言仍保留 dʑa。'),
    'ད': ('达（浊音）', '他（拉萨音·送气·低调）', 'tʰà',
          '古典藏语为浊音 da；现代卫藏方言清化为**送气清音** tʰà，读**低平调**（与 ཐ tʰá 的高平调相区别）。安多方言仍保留 da。'),
    'བ': ('巴（浊音）', '怕（拉萨音·送气·低调）', 'pʰà',
          '古典藏语为浊音 ba；现代卫藏方言清化为**送气清音** pʰà，读**低平调**（与 ཕ pʰá 的高平调相区别）。安多方言仍保留 ba。'),
    'ཛ': ('杂（浊音）', '擦（拉萨音·送气·低调）', 'tsʰà',
          '古典藏语为浊音 dza；现代卫藏方言清化为**送气清音** tsʰà，读**低平调**（与 ཚ tsʰá 的高平调相区别）。安多方言仍保留 dza。'),
    'ཞ': ('霞（浊音）', '夏（拉萨音·清擦·低调）', 'ɕà',
          '古典藏语为浊擦音 ʑa；现代卫藏方言清化为 ɕà（擦音无送气对立，靠声调区分），读**低平调**（与 ཤ ɕá 的高平调相区别）。安多方言仍保留 ʑa。'),
    'ཟ': ('萨（浊音）', '萨（拉萨音·清擦·低调）', 'sà',
          '古典藏语为浊擦音 za；现代卫藏方言清化为 sà（擦音无送气对立，靠声调区分），读**低平调**（与 ས sá 的高平调相区别）。安多方言仍保留 za。'),
}


def main():
    src = io.open(CARDS, encoding='utf-8').read()
    orig = src
    n = 0
    print('修正浊音字母的读音标注（口径统一到现代卫藏音，与音频一致）')
    print('')
    for ch, (old_cn, new_cn, ipa, note) in FIX.items():
        # 该字母的卡片块：以 tibetan: 'ཀ' 定位
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

        # 替换中文标注部分（威利转写保持不动）
        wylie = old_sub.split('·')[0].strip()
        new_sub = '%s · %s' % (wylie, new_cn)
        if old_cn not in old_sub:
            print('  ! %s 的中文标注与预期不符：%s' % (ch, old_sub))
        new_seg = seg.replace("subtitle: '%s'" % old_sub, "subtitle: '%s'" % new_sub, 1)

        # 在 description 里补上「古典 vs 现代」的说明（不覆盖原文，追加一句）
        md = re.search(r"description:\s*'([^']*)'", new_seg)
        if md and '卫藏' not in md.group(1):
            desc = md.group(1)
            add = ' ' + note
            if len(desc) + len(add) < 200:
                new_seg = new_seg.replace("description: '%s'" % desc,
                                          "description: '%s%s'" % (desc, add), 1)

        src = src[:idx] + new_seg + src[seg_end:]
        n += 1
        print('  ✓ %s  %-16s → %-22s  卫藏 %s' % (ch, old_sub, new_sub, ipa))

    if src != orig:
        io.open(CARDS, 'w', encoding='utf-8', newline='\n').write(src)
        print('')
        print('已写入 data/cards.js（%d 条）' % n)
        print('⚠️ 威利转写（ga/ja/da/ba/dza）**未改动** —— 那是字母的转写名，不是读音标注。')
    else:
        print('无改动')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
