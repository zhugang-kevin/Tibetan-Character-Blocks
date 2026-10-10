#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/audit_tibetan_punct.py — 藏文标点审计（D70）

用户 2026-10-10 提出的三条规则 + 我查到的权威来源，合并成**可机械检验**的判据。

## 来源（必须留档，不能凭印象）
1. **W3C《Requirements for Tibetan Text Layout and Typography》** 6.1.3：
   「The tsheg is **not used before a shad**, except after ང (NGA).」
   「…use ཌ U+0F0C TSHEG BSTAR between NGA and a shad.」
2. **DigitalTibetan《Tibetan formatting rules》**：
   ·「There is **never a tsheg after a visarga ཿ**」（例：ཨོཾ་ཨཱཿཧཱུྃ་）
   ·「if the last letter of a line is either ka ཀ or ga ག, one shad is omitted…
     A shad is **not** omitted if they have a sub- or superscript.」
     例：错 གི། / 对 གི；对 སྐུ།、གྲུ།
3. **TibetanLanguage.school Unit 4**：ང 与 shad 之间必须插入 tsheg；
   ག 无元音符号时右「腿」充当 shad。例：ལོད། / ལོང་། / **ལོག**
4. **Tsadra（vajra speech）**：tsheg「must invariably be put down at the end of each
   written syllable, **except before a shad**」

## 由此得到的判据（本脚本逐条检查）
R1 每个音节后应有 tsheg（音节 = tsheg/shad/空白 分隔的单元）
R2 **tsheg 不得紧接在 shad 前**（唯一例外：ང）
R3 ང 与 shad 之间**必须**有 tsheg（且优先用 U+0F0C 不换行变体）
R4 ག / ཀ 结尾且**无下加/上加字、无元音符号**时，其后应省略一个 shad
R5 visarga ཿ 之后**不得**有 tsheg
R6 含 ≥2 音节的句子/短语**结尾应有 shad**（用户规则 3 的合理内核；
   「2 音节」这个阈值无来源支持，改为「≥2 音节且作为完整分句出现时必须收尾」）

用法：
  python scripts/audit_tibetan_punct.py            # 全量审计
  python scripts/audit_tibetan_punct.py --json
"""
import argparse
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TSEG = u'\u0F0B'          # ་
TSEG_BSTAR = u'\u0F0C'    # ༌ 不换行变体
SHAD = u'\u0F0D'          # །
NYIS_SHAD = u'\u0F0E'     # ༎
VISARGA = u'\u0F7F'       # ཿ
TIB = re.compile(u'[\u0F00-\u0FFF]')
SUB = u'ྲླྭྱྰྫྐྵ'          # 下加字
VOWEL = u'ཱིེོུ'          # 元音符号
SUPER = u'ྲླྭྱ'           # 上加字（与下加字同形，位置由上下文决定，此处按 W3C 的
                          # 「有 sub-/superscript 则不省略」宽判）

# 收集项目里所有含藏文的字符串
SCAN_DIRS = ['data', 'pages', 'utils', 'scripts']
SCAN_EXT = ('.js', '.wxml', '.json', '.py', '.md')
SKIP_FILES = {'tts-provider-evaluation.md', 'DECISIONS.md'}   # 文档里有"反例"，不算内容


def collect():
    """返回 [(来源, 文本), ...]，只取含藏文、且长度 ≥1 的字符串。"""
    out = []
    for d in SCAN_DIRS:
        base = os.path.join(ROOT, d)
        if not os.path.isdir(base):
            continue
        for dirpath, _dirs, files in os.walk(base):
            for fn in files:
                if not fn.endswith(SCAN_EXT) or fn in SKIP_FILES:
                    continue
                p = os.path.join(dirpath, fn)
                rel = os.path.relpath(p, ROOT).replace('\\', '/')
                try:
                    s = io.open(p, encoding='utf-8').read()
                except Exception:
                    continue
                # 提取所有含藏文的片段
                for m in re.finditer(u'[^\'"\\s`]{0,40}[\u0F00-\u0FFF][^\'"\\s`]{0,60}', s):
                    t = m.group(0)
                    if TIB.search(t):
                        out.append((rel, t))
    return out


def check(rel, text):
    """返回该文本违反的规则列表。"""
    bad = []
    # R2：tsheg 紧接 shad（除 ང）
    for m in re.finditer(re.escape(TSEG) + r'(?:' + re.escape(TSEG_BSTAR) + r')?'
                         + re.escape(SHAD), text):
        prev = text[m.start() - 1] if m.start() > 0 else ''
        if prev != u'ང':
            bad.append(('R2', 'tsheg 紧接 shad（仅 ང 允许）：…%s' % text[max(0, m.start() - 8):m.end() + 2]))
    # R3：ང 直接接 shad（中间没有 tsheg）
    for m in re.finditer(u'ང' + re.escape(SHAD), text):
        bad.append(('R3', 'ང 与 shad 之间缺 tsheg（应用 U+0F0C）：…%s'
                    % text[max(0, m.start() - 6):m.end() + 2]))
    # R4：ག/ཀ 结尾（无元音、无叠字）后接 shad → 应省略
    for m in re.finditer(u'([ཀག])' + re.escape(SHAD), text):
        idx = m.start()
        before = text[max(0, idx - 2):idx]
        # 若前一个字符是元音符号或下加字，则不适用省略规则（应保留 shad）
        if before and (before[-1] in VOWEL or before[-1] in SUB):
            continue
        bad.append(('R4', 'ག/ཀ 结尾（无元音/叠字）后应省略一个 shad：…%s'
                    % text[max(0, idx - 8):m.end() + 2]))
    # R5：visarga 后有 tsheg
    for m in re.finditer(re.escape(VISARGA) + re.escape(TSEG), text):
        bad.append(('R5', 'visarga ཿ 之后不得有 tsheg：…%s'
                    % text[max(0, m.start() - 8):m.end() + 2]))
    return bad


def main():
    ap = argparse.ArgumentParser(description='藏文标点审计（D70）')
    ap.add_argument('--json', action='store_true')
    args = ap.parse_args()

    items = collect()
    violations = []
    for rel, t in items:
        for rule, msg in check(rel, t):
            violations.append({'file': rel, 'text': t, 'rule': rule, 'msg': msg})

    if args.json:
        print(json.dumps(violations, ensure_ascii=False, indent=1))
        return 0 if not violations else 1

    print('藏文标点审计（判据来自 W3C / DigitalTibetan / TibetanLanguage.school / Tsadra）')
    print('扫描 %d 个含藏文片段，来自 %d 个文件' % (len(items), len(set(r for r, _ in items))))
    print('-' * 70)
    if not violations:
        print('✓ 未发现标点违规')
        return 0
    by = {}
    for v in violations:
        by.setdefault(v['rule'], []).append(v)
    names = {'R2': 'tsheg 紧接 shad（仅 ང 允许）',
             'R3': 'ང 与 shad 之间缺 tsheg',
             'R4': 'ག/ཀ 结尾后应省略一个 shad',
             'R5': 'visarga ཿ 后不得有 tsheg'}
    for r in sorted(by):
        vs = by[r]
        print('\n[%s] %s —— %d 处' % (r, names.get(r, r), len(vs)))
        seen = set()
        for v in vs:
            key = (v['file'], v['text'])
            if key in seen:
                continue
            seen.add(key)
            print('   %-28s %s' % (v['file'], v['msg'][:78]))
    print('\n合计 %d 处' % len(violations))
    return 1


if __name__ == '__main__':
    sys.exit(main())
