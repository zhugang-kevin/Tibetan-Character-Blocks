#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/match_reference_perm.py — 判断参考录音是否是「30 个字母的某种排列」（D106）

## 为什么要做这一步
D103 只测了「录音第 k 段 = letter_k」（按字母表顺序）这一种对齐，失败了就收手。
但还有两种可能没排除：
  ① 录音确实是 30 个字母，**但顺序不是字母表顺序**（比如按教学分组、按发音部位）
  ② 录音根本不是 30 个字母（是词、是课文、是别的内容）

**判别方法**：对录音的每一段，在本项目 30 个字母里找**最像的那一个**。
  · 若是 ① → 会得到一张**双射**（每段对应一个不同字母，30 个字母恰好各用一次）
  · 若是 ② → 会出现**多段挤到同一字母**、且有字母从不被选中

## 为什么这个判据可靠
它不依赖「顺序」，只依赖「一对一的匹配关系」。
若 30 段恰好构成一个**排列**（30 个字母各被选中一次），那就几乎不可能是巧合 ——
随机 30 段匹配到 30 个字母且恰好构成排列的概率极低。

## 局限（先说清）
特征仍是「16 段能量×过零率」的余弦相似度（无 numpy）。它能分辨明显不同的音，
但对极相近的音（如 kʰ 与 k）会混淆。所以：
  · 若结论是**双射** → 可信度较高（排列不是巧合能凑出来的）
  · 若结论是**非双射** → 只能说「不像 30 个字母」，不能说录音有问题

用法：python scripts/match_reference_perm.py [录音路径] [起始段] [段数]
"""
import math
import os
import re
import struct
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICE = os.path.join(ROOT, 'audio', 'voice')
TMP = os.path.join(ROOT, '.workbuddy', 'tmp')
RATE = 16000
os.makedirs(TMP, exist_ok=True)

ORDER = 'ཀཁགངཅཆཇཉཏཐདནཔཕབམཙཚཛཝཞཟའཡརལཤསཧཨ'


def decode(path):
    raw = os.path.join(TMP, '_mp.raw')
    r = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', path,
                        '-f', 's16le', '-ac', '1', '-ar', str(RATE), raw],
                       capture_output=True)
    if r.returncode:
        return []
    d = open(raw, 'rb').read()
    n = len(d) // 2
    return list(struct.unpack('<%dh' % n, d[:n * 2]))


def utterances(samples, gap=0.35):
    if not samples:
        return []
    peak = max(abs(x) for x in samples) or 1
    win = 160
    thr = max(peak * 0.08, 200)
    segs, cur = [], None
    for i in range(0, len(samples) - win, win):
        seg = samples[i:i + win]
        rms = math.sqrt(sum(x * x for x in seg) / len(seg))
        if rms > thr and cur is None:
            cur = i
        elif rms <= thr and cur is not None:
            if i - cur >= 4:
                segs.append((cur, i))
            cur = None
    if cur is not None:
        segs.append((cur, len(samples)))
    utt, g = [], int(RATE * gap)
    for a, b in segs:
        if utt and a - utt[-1][1] < g:
            utt[-1] = (utt[-1][0], b)
        else:
            utt.append((a, b))
    return utt


def feat(samples, nband=16):
    if not samples:
        return [0.0] * nband
    seg = max(1, len(samples) // nband)
    out = []
    for i in range(nband):
        s = samples[i * seg:(i + 1) * seg] or [0]
        e = sum(abs(x) for x in s) / len(s)
        zc = sum(1 for a, b in zip(s, s[1:]) if (a >= 0) != (b >= 0)) / max(1, len(s))
        out.append(e * (1 + zc * 10))
    m = max(out) or 1.0
    return [x / m for x in out]


def cos(a, b):
    num = sum(x * y for x, y in zip(a, b))
    da = math.sqrt(sum(x * x for x in a)) or 1
    db = math.sqrt(sum(y * y for y in b)) or 1
    return num / (da * db)


def main():
    ref_path = sys.argv[1] if len(sys.argv) > 1 else r'C:\Users\zhuga\Downloads\videoplayback.m4a'
    start = int(sys.argv[2]) if len(sys.argv) > 2 else 4
    count = int(sys.argv[3]) if len(sys.argv) > 3 else 30

    if not os.path.exists(ref_path):
        print('✗ 找不到录音：%s' % ref_path); return 2

    print('参考录音 → 30 个字母的匹配关系（排列检验）')
    print('  录音：%s   取第 %d~%d 段' % (os.path.basename(ref_path), start, start + count - 1))
    print('')

    s = decode(ref_path)
    utt = utterances(s)
    if len(utt) < start - 1 + count:
        print('  ✗ 段数不足（实录 %d 段）' % len(utt)); return 2
    ref = [s[a:b] for a, b in utt[start - 1:start - 1 + count]]

    # 本项目有音频的字母
    mine = {}
    for k in range(1, 31):
        p = os.path.join(VOICE, 'letter_%02d.mp3' % k)
        if os.path.exists(p):
            mm = decode(p)
            if mm:
                mine[k] = feat(mm)
    have = sorted(mine)
    print('  本项目有音频的字母：%d 条（%s 无音频）'
          % (len(have), ' '.join(ORDER[k - 1] for k in range(1, 31) if k not in mine)))
    print('')

    picked, rows = {}, []
    for i, r in enumerate(ref):
        fr = feat(r)
        sc = sorted(((cos(fr, v), k) for k, v in mine.items()), reverse=True)
        top, tk = sc[0]
        second = sc[1] if len(sc) > 1 else (0, 0)
        picked.setdefault(tk, []).append(i + 1)
        rows.append((i + 1, tk, top, second[1], top - second[0]))

    print('  段  最像的字母  相似度  次像  领先幅度')
    for i, tk, top, tk2, margin in rows:
        flag = '  ← 领先很小，不可靠' if margin < 0.02 else ''
        print('  %2d    %s(letter_%02d)  %.3f   %s(letter_%02d)  %+.3f%s'
              % (i, ORDER[tk - 1], tk, top, ORDER[tk2 - 1], tk2, margin, flag))

    print('')
    dupes = {k: v for k, v in picked.items() if len(v) > 1}
    never = [k for k in have if k not in picked]
    print('  被选中 %d 个不同字母（共 %d 条有音频）' % (len(picked), len(have)))
    if dupes:
        print('  ⚠️ 有多段挤到同一字母：')
        for k, v in sorted(dupes.items()):
            print('     %s(letter_%02d) ← 第 %s 段' % (ORDER[k - 1], k, ','.join(map(str, v))))
    if never:
        print('  ⚠️ 从未被选中的字母：%s' % ' '.join(ORDER[k - 1] for k in never))
    print('')

    # 判定
    is_bij = (not dupes) and (not never)
    vals = [m for _, _, _, _, m in rows]
    firm = sum(1 for m in vals if m >= 0.02)
    print('=' * 58)
    print('  领先幅度 ≥0.02 的段：%d / %d（领先小 = 匹配不可靠）' % (firm, len(rows)))
    if is_bij:
        print('  ✅ **构成双射** —— 录音很可能就是这 30 个字母（顺序非字母表），')
        print('     映射关系可以直接用。建议人工抽查 3~5 段的领先幅度是否够大。')
    else:
        print('  ❌ **不构成双射** —— 录音不是「30 个字母各读一次」。')
        print('     可能原因：内容是词/课文而非字母；或特征对相近音分辨不足。')
        print('     **不下任何关于「谁念错了」的结论。**')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
