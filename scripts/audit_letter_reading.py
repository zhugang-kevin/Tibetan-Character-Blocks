#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/audit_letter_reading.py — 30 个字母的读音标注 vs 权威资料（D104）

## 为什么要它
用户指出：**国内自媒体平台有大量藏文读音教学资源，应该借用它们来把读音做对**。
这个方向是对的。可机器核对的、最有价值的一项就是：**我们给每个字母标注的读音是否准确**。

## 权威口径（本脚本采用的基准，附出处）
**基准 A —— 现代标准藏语（拉萨音），维基百科「标准藏语」条目**
  原文：「藏文有 30 个基本单辅音字母，每个字母在 7 世纪的发音是辅音加元音 a。
        在当代标准藏语的发音出现了**有规律的变化**：基字声母为**浊塞音、浊擦音和
        浊塞擦音的字母，读成相对应的送气清辅音**。」
  该条目给出「藏文字母 / 威利转写 / 国际音标（古典藏语 | 现代标准藏语）」对照表。
**基准 B —— Polyglot Club「Tibetan Alphabet & Pronunciation」**（IPA 表，来源
  Lawrence University 藏语教材 Sample-Lesson-1）。
**基准 C —— Wikibooks「Tibetan」**：明确「无长短元音对立（除梵语借词）」，
  并列出现代读音（如 ག [ɡà/kʰːà]、ད [dà/tʰːà]、བ [bà/pʰːà]、ཛ [dzà/tsʰːà]）。

## 三条基准的**共同结论**（这是本脚本的判据基础）
  · 现代标准藏语里，**浊音字母（ག ཇ ད བ ཛ ཟ ཞ འ）已清化**，多数读作**对应的送气清音**
  · 古典（7 世纪）读音仍保留「ka/kʰa/ɡa/ŋa」四列对立，但那是**书面/历史音**，不是今天的拉萨音
  · 藏文**没有长短元音对立**（除梵语借词）→ 这直接关系到 D102 查出的
    「字母 + ཱ（长音）」问题：**`ཱ` 在现代藏语里不构成一个独立的短/长对立**，
    所以拿它当「为出声而加的显式 a」在音系上是有依据的旁证，但仍不应被当作标准读音教。

用法：python scripts/audit_letter_reading.py
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = os.path.join(ROOT, 'data', 'cards.js')

# 权威对照：字母 → (威利, 古典IPA, 现代标准藏语IPA, 是否浊音字母[现代会清化])
TABLE = [
    ('ཀ', 'ka',  'ka',  'ká',    False, '不送气'),
    ('ཁ', 'kha', 'kʰa', 'kʰá',   False, '送气'),
    ('ག', 'ga',  'ɡa',  'kʰà',   True,  '浊→现代清化为送气 kʰ'),
    ('ང', 'nga', 'ŋa',  'ŋà',    False, '鼻音'),
    ('ཅ', 'ca',  'tɕa', 'tɕá',   False, '不送气'),
    ('ཆ', 'cha', 'tɕʰa', 'tɕʰá', False, '送气'),
    ('ཇ', 'ja',  'dʑa', 'tɕʰà',  True,  '浊→现代清化为送气 tɕʰ'),
    ('ཉ', 'nya', 'ɲa',  'ɲà',    False, '鼻音'),
    ('ཏ', 'ta',  'ta',  'tá',    False, '不送气'),
    ('ཐ', 'tha', 'tʰa', 'tʰá',   False, '送气'),
    ('ད', 'da',  'da',  'tʰà',   True,  '浊→现代清化为送气 tʰ'),
    ('ན', 'na',  'na',  'nà',    False, '鼻音'),
    ('པ', 'pa',  'pa',  'pá',    False, '不送气'),
    ('ཕ', 'pha', 'pʰa', 'pʰá',   False, '送气'),
    ('བ', 'ba',  'ba',  'pʰà',   True,  '浊→现代清化为送气 pʰ'),
    ('མ', 'ma',  'ma',  'mà',    False, '鼻音'),
    ('ཙ', 'tsa', 'tsa', 'tsá',   False, '不送气'),
    ('ཚ', 'tsha', 'tsʰa', 'tsʰá', False, '送气'),
    ('ཛ', 'dza', 'dza', 'tsʰà',  True,  '浊→现代清化为送气 tsʰ'),
    ('ཝ', 'wa',  'wa',  'wà',    False, '半元音'),
    ('ཞ', 'zha', 'ʑa',  'ɕà',    True,  '浊→现代清化为 ɕ'),
    ('ཟ', 'za',  'za',  'sà',    True,  '浊→现代清化为 s'),
    ('འ', "'a",  'ɦa',  'ʔà',    True,  '浊喉音'),
    ('ཡ', 'ya',  'ja',  'jà',    False, '半元音'),
    ('ར', 'ra',  'ra',  'ʐà',    False, '近音'),
    ('ལ', 'la',  'la',  'là',    False, '边音'),
    ('ཤ', 'sha', 'ɕa',  'ɕá',    False, '清擦音'),
    ('ས', 'sa',  'sa',  'sá',    False, '清擦音'),
    ('ཧ', 'ha',  'ha',  'há',    False, '清擦音'),
    ('ཨ', 'a',   'a',   'á',     False, '零声母'),
]


def grab(src, key):
    """取 `key: '...'` 的单引号字符串，**能识别 \\' 转义**。

    ⚠️ 为什么不能简单用 split("'"):
    `འ` 的 Wylie 是 `'a`（带撇号），写进 JS 单引号字符串必须转义成 `\\'a`。
    第一版解析器直接 split("'")，遇到 `\\'` 就截断，把该条读成**空字符串** ——
    于是「已修好」的条目在核对里仍显示为不一致。**解析器与写入格式必须同时考虑。**
    """
    i = src.find(key + ": '")
    if i < 0:
        return ''
    j = i + len(key) + 3
    out = []
    while j < len(src):
        c = src[j]
        if c == '\\' and j + 1 < len(src):
            out.append(src[j + 1])   # 取转义后的字符本身
            j += 2
            continue
        if c == "'":
            break
        out.append(c)
        j += 1
    return ''.join(out)


def main():
    src = io.open(CARDS, encoding='utf-8').read()
    pat = r"id:\s*'(letter_\d+)'[\s\S]*?tibetan:\s*'([^']*)'[\s\S]*?subtitle:\s*'([^']*)'"
    rows = re.findall(pat, src)
    if not rows:
        print('✗ 从 data/cards.js 没解析出字母条目'); return 2

    print('30 个字母的读音标注 · 对账（权威口径见脚本头部注释）')
    print('  本项目 %d 条 vs 权威表 %d 条' % (len(rows), len(TABLE)))
    print('')
    print('  序号  字母  本项目标注                  权威现代读音  浊音清化  判断')
    print('  ' + '-' * 88)

    issues = []
    for i, (eid, tib, sub) in enumerate(rows):
        if i >= len(TABLE):
            break
        ch, wy, cls, mod, voiced, note = TABLE[i]
        flag = ''
        # ① 字母对得上吗
        if tib.strip() != ch:
            flag = '字母次序不符(%s≠%s)' % (tib.strip(), ch)
            issues.append((eid, ch, flag))
        else:
            # ② 送气标注对不对
            #   ⚠️ 判据第一版写成 `'送气' in sub` —— 而「**不**送气」里也含「送气」，
            #     于是 4 条标着「不送气」的被误报成「标了送气」。**先判「不送气」再判「送气」。**
            want_asp = ('ʰ' in cls) or voiced     # 权威现代读音是否送气
            if '不送气' in sub:
                if want_asp:
                    flag = '标了「不送气」，但权威现代读音是**送气**'
                    issues.append((eid, ch, flag))
            elif '送气' in sub:
                if not want_asp:
                    flag = '标了「送气」，但权威现代读音是**不送气**'
                    issues.append((eid, ch, flag))
            # ③ 浊音字母：本项目标「浊音」（古典音），而现代标准藏语已清化
            if voiced and '浊音' in sub:
                lab = '；' if flag else ''
                flag += lab + ('浊音字母标作「浊音」（古典音 %s），而现代标准藏语已清化为 %s —— '
                               '**标注与音频（卫藏 TTS）口径可能不一致**' % (cls, mod))
                issues.append((eid, ch, '浊音口径'))
        print('  %2d    %s    %-26s %-12s %-9s %s'
              % (i + 1, ch, sub, mod, '是' if voiced else '—', flag or 'ok'))

    print('')
    # ② Wylie 转写核对（D106 新增）
    #   前面只核了「读音标注」，没核「转写」。而转写也有标准写法 —— 例如 འ 是 `'a`
    #   （带撇号，它是个**辅音**），不是 `a`；本项目原先标成 `a`，
    #   还写成「元音载体，不单独发音」（真正的元音载体是 ཨ）。已修。
    print('【Wylie 转写核对】')
    wy_bad = []
    rows_w = []
    for b in src.split('{')[1:]:
        if "id: 'letter_" not in b:
            continue
        idm = b.split("id: '")[1].split("'")[0]
        sbm = grab(b, 'subtitle')
        rows_w.append((idm, sbm))
    rows_w.sort(key=lambda r: int(r[0].split('_')[1]))
    for i, (eid, sub) in enumerate(rows_w):
        if i >= len(TABLE):
            break
        ours = sub.split('·')[0].strip().replace('\\', '')
        auth = TABLE[i][1]
        if ours != auth:
            wy_bad.append((eid, TABLE[i][0], ours, auth))
    if wy_bad:
        for eid, ch, ours, auth in wy_bad:
            print('   ✗ %s %s  我们「%s」 权威「%s」' % (eid, ch, ours, auth))
    else:
        print('   ✓ %d 条 Wylie 转写与权威表一致' % min(len(rows_w), len(TABLE)))

    print('')
    print('=' * 90)
    if issues:
        print('  ⚠️ 需人工确认 %d 条（脚本只按「字母次序 + 送气标注」做机械比对，' % len(issues))
        print('     不判断中文音近字选得对不对 —— 那需要母语者听）')
        seen = set()
        for eid, ch, why in issues:
            if ch in seen:
                continue
            seen.add(ch)
            print('     %s %s  %s' % (eid, ch, why))
    else:
        print('  ✓ 字母次序与送气标注均与权威表一致')
    print('')
    print('  参考出处：维基百科「标准藏语」· Polyglot Club 藏文发音表（源自 Lawrence Univ. 教材）')
    print('           · Wikibooks「Tibetan」（现代读音含浊音清化）')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
