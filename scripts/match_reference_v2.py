#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/match_reference_v2.py — 用**频谱特征**重做匹配（D106 v2）

## 为什么要 v2
v1（`match_reference_perm.py`）用的特征是「16 段能量×过零率」——
它擅长**整体包络形状**，对**音色**几乎不敏感。结果：
  · 30 段录音里有 **17 段**都被判为与同一个字母最像
  · **23/30 段**的领先幅度 <0.02 → 匹配不可靠
于是 v1 的「不构成双射」**不能作为证据**（可能只是工具失败）。

## v2 换什么
改用**频谱**：对每段做短时 DFT，取 log 频带能量（近似 mel 分组），
再对时间轴取均值 → 得到一个「音色指纹」。
判断两个音像不像，看**指纹的余弦相似度**。

纯 Python 实现 DFT（本项目环境无 numpy）。段长都在 1 秒内、下采样到 8kHz，
计算量可控。

## 自带验证（不通过就不给结论）
先做**已知答案的自检**：
  · 我们的 22 条字母两两比对 —— 不同字母应能分开
  · 若「≥0.95 的配对数」仍然很高 → **特征无分辨力，脚本直接声明失败**
只有自检通过，才用它去匹配录音。

用法：python scripts/match_reference_v2.py
"""
import cmath
import math
import os
import struct
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICE = os.path.join(ROOT, 'audio', 'voice')
TMP = os.path.join(ROOT, '.workbuddy', 'tmp')
SRC_RATE = 16000
DS_RATE = 8000        # 下采样到 8k，DFT 快一倍
NFFT = 256            # 32ms 窗 @8k
HOP = 128
NBAND = 20            # 频带数（近似 mel）
os.makedirs(TMP, exist_ok=True)

ORDER = 'ཀཁགངཅཆཇཉཏཐདནཔཕབམཙཚཛཝཞཟའཡརལཤསཧཨ'


def decode(path, ds=True):
    raw = os.path.join(TMP, '_v2.raw')
    r = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', path,
                        '-f', 's16le', '-ac', '1', '-ar', str(SRC_RATE), raw],
                       capture_output=True)
    if r.returncode:
        return []
    d = open(raw, 'rb').read()
    n = len(d) // 2
    s = struct.unpack('<%dh' % n, d[:n * 2])
    if ds:  # 简单 2:1 抽取（先做 3 点滑动平均抗混叠）
        out = []
        acc = 0
        for i, v in enumerate(s):
            acc += v
            if i >= 2:
                acc -= s[i - 2]
                out.append(acc // 3 if i % 2 == 0 else None)
        s = [x for x in out if x is not None]
    return list(s)


def hann(n):
    return [0.5 - 0.5 * math.cos(2 * math.pi * i / (n - 1)) for i in range(n)]


WIN = hann(NFFT)
# mel 式三角频带
def mel(f):
    return 2595.0 * math.log10(1.0 + f / 700.0)


def imel(m):
    return 700.0 * (10 ** (m / 2595.0) - 1.0)


BANDS = []
_m0, _m1 = mel(80), mel(DS_RATE / 2)
for b in range(NBAND + 2):
    BANDS.append(imel(_m0 + (_m1 - _m0) * b / (NBAND + 1)))


def spectrum_fp(samples):
    """短时谱 → 对数频带能量均值（音色指纹）"""
    if len(samples) < NFFT:
        return [0.0] * NBAND
    acc = [0.0] * NBAND
    frames = 0
    # 预计算每个 DFT bin 的窗值（纯 Python，只算前半谱）
    half = NFFT // 2 + 1
    bin_hz = [i * DS_RATE / float(NFFT) for i in range(half)]
    # 每个频带的 bin 权重
    wts = []
    for b in range(NBAND):
        lo, hi = BANDS[b], BANDS[b + 1]
        w = [0.0] * half
        for i, hz in enumerate(bin_hz):
            if lo <= hz <= hi and hi > lo:
                # 三角权重
                mid = (lo + hi) / 2.0
                w[i] = 1.0 - abs(hz - mid) / ((hi - lo) / 2.0) if abs(hz - mid) <= (hi - lo) / 2.0 else 0.0
        wts.append(w)
    for st in range(0, len(samples) - NFFT, HOP):
        seg = samples[st:st + NFFT]
        # 加窗
        w = [seg[i] * WIN[i] for i in range(NFFT)]
        # DFT（只算前半谱）
        mags = []
        for k in range(half):
            acc_re = 0.0
            acc_im = 0.0
            c = -2 * math.pi * k / NFFT
            for t in range(NFFT):
                acc_re += w[t] * math.cos(c * t)
                acc_im += w[t] * math.sin(c * t)
            mags.append(math.sqrt(acc_re * acc_re + acc_im * acc_im))
        for b in range(NBAND):
            e = 0.0
            wb = wts[b]
            for i in range(half):
                if wb[i]:
                    e += mags[i] * wb[i]
            acc[b] += math.log1p(e)
        frames += 1
    if not frames:
        return [0.0] * NBAND
    fp = [x / frames for x in acc]
    m = max(fp) or 1.0
    return [x / m for x in fp]


def cos(a, b):
    num = sum(x * y for x, y in zip(a, b))
    da = math.sqrt(sum(x * x for x in a)) or 1
    db = math.sqrt(sum(y * y for y in b)) or 1
    return num / (da * db)


def utterances(samples, gap=0.35):
    if not samples:
        return []
    peak = max(abs(x) for x in samples) or 1
    win = 80          # 10ms @8k
    thr = max(peak * 0.08, 100)
    segs, cur = [], None
    for i in range(0, len(samples) - win, win):
        seg = samples[i:i + win]
        rms = math.sqrt(sum(x * x for x in seg) / len(seg))
        if rms > thr and cur is None:
            cur = i
        elif rms <= thr and cur is not None:
            if i - cur >= 3:
                segs.append((cur, i))
            cur = None
    if cur is not None:
        segs.append((cur, len(samples)))
    utt, g = [], int(DS_RATE * gap)
    for a, b in segs:
        if utt and a - utt[-1][1] < g:
            utt[-1] = (utt[-1][0], b)
        else:
            utt.append((a, b))
    return utt


def main():
    print('参考录音匹配 v2（频谱指纹）')
    print('  特征：短时 DFT → 20 段对数频带能量（音色指纹），余弦相似度')
    print('')

    # ---------- 第一步：自检 ----------
    print('① 自检（用已知答案验证特征是否有分辨力）')
    t0 = __import__('time').time()
    mine = {}
    for k in range(1, 31):
        p = os.path.join(VOICE, 'letter_%02d.mp3' % k)
        if os.path.exists(p):
            s = decode(p)
            if s:
                mine[k] = spectrum_fp(s)
    print('   本项目可测字母 %d 条，用时 %.1fs' % (len(mine), __import__('time').time() - t0))

    import itertools
    vals = []
    for a, b in itertools.combinations(sorted(mine), 2):
        vals.append(cos(mine[a], mine[b]))
    vals.sort()
    hi = sum(1 for v in vals if v >= 0.95)
    ratio = 100.0 * hi / len(vals)
    print('   两两相似度：中位 %.4f  最高 %.4f  ｜ ≥0.95 占 %.1f%%'
          % (vals[len(vals) // 2], vals[-1], ratio))

    if ratio > 20.0:
        print('')
        print('   ❌ **自检不通过**：%.1f%% 的不同字母被判为「几乎相同」——' % ratio)
        print('      频谱指纹仍无分辨力。**本脚本不给任何关于录音的结论。**')
        print('      （宁可明说工具不行，也不拿噪声当证据。）')
        return 1
    print('   ✓ 自检通过（≥0.95 仅 %.1f%%）→ 可作粗筛' % ratio)
    print('')

    # ---------- 第二步：匹配录音 ----------
    ref_path = sys.argv[1] if len(sys.argv) > 1 else r'C:\Users\zhuga\Downloads\videoplayback.m4a'
    if not os.path.exists(ref_path):
        print('② 找不到录音，跳过：%s' % ref_path); return 2
    s = decode(ref_path)
    utt = utterances(s)
    print('② 录音：%s ｜ 切出 %d 段' % (os.path.basename(ref_path), len(utt)))
    if len(utt) < 33:
        print('   段数不足 33，跳过'); return 2
    seg = [(a, b) for a, b in utt[3:33]]

    rows, picked = [], {}
    for i, (a, b) in enumerate(seg):
        fp = spectrum_fp(s[a:b])
        sc = sorted(((cos(fp, v), k) for k, v in mine.items()), reverse=True)
        top, tk = sc[0]
        tk2, m2 = sc[1][1], sc[1][0]
        picked.setdefault(tk, []).append(i + 1)
        rows.append((i + 1, tk, top, tk2, top - m2))

    firm = sum(1 for r in rows if r[4] >= 0.02)
    print('   领先幅度 ≥0.02 的段：%d / %d' % (firm, len(rows)))
    dupes = {k: v for k, v in picked.items() if len(v) > 1}
    never = [k for k in sorted(mine) if k not in picked]
    print('   被选中 %d 个不同字母' % len(picked))
    if never:
        print('   从未被选中：%s' % ' '.join(ORDER[k - 1] for k in never))
    print('')
    print('   前 12 段：')
    for i, tk, top, tk2, mg in rows[:12]:
        print('     第%2d段 → %s(letter_%02d) %.3f  领先 %+.3f%s'
              % (i, ORDER[tk - 1], tk, top, mg, '' if mg >= 0.02 else '  (不可靠)'))
    print('')
    print('=' * 58)
    if (not dupes) and (not never) and firm >= 20:
        print('   ✅ 构成双射且多数段可靠 → 录音很可能就是 30 个字母')
    else:
        print('   ❌ 仍不构成可靠双射（可靠段 %d/30，重复选中的字母 %d 个）'
              % (firm, len(dupes)))
        print('   → **不给「谁念错了」的结论。**')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
