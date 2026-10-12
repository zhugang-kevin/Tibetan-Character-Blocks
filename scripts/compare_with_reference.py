#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/compare_with_reference.py — 用母语者录音核对我们的字母发音（D103）

## 用户给的这份录音是什么
`videoplayback.m4a`（74.7s）：包络分析显示前 3 段较长（引导），
**第 4~33 段正好 30 条、每条 100~320ms、间隔约 1 秒** ——
形态上与「按字母表顺序读 30 个辅音字母」完全吻合。

## 这份录音的价值
它是**外部基准真值**。我们可以拿它来回答「我们哪几条念得不对」——
尤其是那 8 条当年为出声而用「字母+ཱ（长音）」的（见 D102）。

## 做法（两步，先证对齐、再找差异）
  ① **对齐验证**：把录音的第 k 段与本项目 `letter_k` 比。若绝大多数 k 都能对上，
     说明「录音 = 30 辅音按序」这个假设成立，后续结论才可信。
     ——**这一步是自证**：假设不成立就不该往下走。
  ② **差异定位**：对每个 k 给出匹配分，列出明显偏低的条目。
     偏低的含义有两种，脚本都会说清：
       · 我们念错了（长音妥协 / 音不对）
       · 录音这一段不是该字母（例如录音顺序与我们不同）

## 特征与局限（先说清，不夸大）
无 numpy，用的是「16 段能量+过零率」的粗特征 + 余弦相似度。
它**能区分「差别明显」的音**，但不能替代人耳做精细判定。
所以本脚本的定位是**缩小范围**（把 30 条缩到几条去听），不是终审。

用法：python scripts/compare_with_reference.py <录音路径>
"""
import io
import math
import os
import struct
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMP = os.path.join(ROOT, '.workbuddy', 'tmp')
VOICE = os.path.join(ROOT, 'audio', 'voice')
RATE = 16000
os.makedirs(TMP, exist_ok=True)

# 录音里 30 个辅音的位置（第 4~33 段，1-based）——由包络分析得出
FIRST, COUNT = 4, 30


def decode(path, mono=True):
    raw = os.path.join(TMP, '_c.raw')
    r = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', path,
                        '-f', 's16le', '-ac', '1', '-ar', str(RATE), raw],
                       capture_output=True)
    if r.returncode:
        return []
    d = open(raw, 'rb').read()
    n = len(d) // 2
    return list(struct.unpack('<%dh' % n, d[:n * 2]))


def utterances(samples, gap=0.35):
    """按包络切「一次发声」"""
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
    utt = []
    g = int(RATE * gap)
    for a, b in segs:
        if utt and a - utt[-1][1] < g:
            utt[-1] = (utt[-1][0], b)
        else:
            utt.append((a, b))
    return utt


def feat(samples, nband=16):
    """16 段（能量 × 过零率）——粗糙但足以区分明显不同的音"""
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
    if len(sys.argv) < 2:
        print('用法：python scripts/compare_with_reference.py <录音路径>')
        return 2
    ref_path = sys.argv[1]
    if not os.path.exists(ref_path):
        print('✗ 找不到录音：%s' % ref_path)
        return 2

    print('用母语者录音核对本项目字母发音')
    print('  录音：%s' % os.path.basename(ref_path))
    print('')

    s = decode(ref_path)
    utt = utterances(s)
    print('  切出「一次发声」%d 段（预期录音里字母段是第 %d~%d 段）'
          % (len(utt), FIRST, FIRST + COUNT - 1))
    if len(utt) < FIRST + COUNT - 1:
        print('  ✗ 段数不足，无法取到 30 个字母段'); return 2

    ref = [s[a:b] for a, b in utt[FIRST - 1:FIRST - 1 + COUNT]]

    # 本项目 30 个字母
    mine = []
    for k in range(1, COUNT + 1):
        p = os.path.join(VOICE, 'letter_%02d.mp3' % k)
        mine.append(decode(p) if os.path.exists(p) else [])

    print('')
    print('① 对齐验证（录音第 k 段 vs 本项目 letter_k）')
    scores = []
    for k in range(COUNT):
        if not ref[k] or not mine[k]:
            scores.append((k + 1, None)); continue
        scores.append((k + 1, cos(feat(ref[k]), feat(mine[k]))))

    got = [sc for _, sc in scores if sc is not None]
    if not got:
        print('  ✗ 无可比对项'); return 2
    hi = sum(1 for x in got if x >= 0.90)
    mid = sum(1 for x in got if 0.80 <= x < 0.90)
    lo = sum(1 for x in got if x < 0.80)
    print('   ≥0.90 高度一致 %d 条 ｜ 0.80~0.90 中 %d 条 ｜ <0.80 低 %d 条' % (hi, mid, lo))
    print('   → 「录音=30 辅音按序」这一假设%s' % ('**成立**（多数高度一致）' if hi >= 18 else '**存疑**'))

    print('')
    print('② 差异定位（低分 = 我们这条念得不对，或录音段序不同）')
    print('   序号  字母   相似度   判断')
    order = 'ཀཁགངཅཆཇཉཏཐདནཔཕབམཙཚཛཝཞཟའཡརལཤསཧཨ'
    for k, sc in scores:
        if sc is None:
            print('   %2d    %s      —      缺音频' % (k, order[k - 1]))
            continue
        tag = '一致' if sc >= 0.90 else ('偏低' if sc >= 0.80 else '**明显不同**')
        print('   %2d    %s     %.4f   %s' % (k, order[k - 1], sc, tag))

    print('')
    print('⚠️ 局限：特征粗糙，只能**缩小范围**，不能替代人耳。')
    print('   低分项应优先人工试听对照。')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
