#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""盲测声学分析 —— 不猜内容，只测客观物理量

目的：在不知道录音内容的前提下，回答「这些文件的物理结构是什么」，
让用户自己确认「你猜的对不对 / 你录的是不是这个结构」。

诚实边界：本脚本**不能识别说了什么**（那需要语音识别 + 藏语模型，项目里没有）。
它只能回答：时长 / 响度 / 有几个有声段 / 每段多长 / 基频 / 频谱形状 / 段间停顿。
"""
import io
import json
import os
import subprocess
import sys

import numpy as np

SRC = r"C:\Users\zhuga\OneDrive\Documents\xwechat_files\wxid_kp8ov257seut22_be73\msg\file\2026-10"
FILES = ['1.m4a', '2.m4a', '3.m4a', '六字真言.m4a', '雪山.m4a']
RATE = 16000


def load_pcm(path):
    raw = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_blind.raw')
    r = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', path,
                        '-f', 's16le', '-ac', '1', '-ar', str(RATE), raw],
                       capture_output=True)
    if r.returncode:
        return None
    d = open(raw, 'rb').read()
    os.remove(raw)
    return np.frombuffer(d[:len(d) // 2 * 2], dtype='<i2').astype(np.float64) / 32768.0


def segments(x, win=0.02, rel=0.06, min_ms=90, gap_ms=110):
    """切有声段：先用相对阈值定粗边界，再平滑补洞，最后合并近邻。"""
    n = int(win * RATE)
    m = len(x) // n
    env = np.array([np.sqrt((x[i * n:(i + 1) * n] ** 2).mean() + 1e-12) for i in range(m)])
    peak = env.max()
    thr = peak * rel
    on = env > thr
    # 补短洞
    gap_frames = int(gap_ms / 1000.0 / win)
    i = 0
    while i < len(on):
        if not on[i]:
            j = i
            while j < len(on) and not on[j]:
                j += 1
            if i > 0 and j < len(on) and (j - i) <= gap_frames:
                on[i:j] = True
            i = j
        else:
            i += 1
    # 提段
    segs, cur = [], None
    minf = max(2, int(min_ms / 1000.0 / win))
    for k, v in enumerate(on):
        if v and cur is None:
            cur = k
        elif not v and cur is not None:
            if k - cur >= minf:
                segs.append((cur, k))
            cur = None
    if cur is not None and len(on) - cur >= minf:
        segs.append((cur, len(on)))
    return env, thr, segs


def f0_autocorr(seg, fmin=70, fmax=400):
    """自相关估基频（仅对浊音段有意义）。"""
    if len(seg) < int(0.05 * RATE):
        return 0.0
    s = seg - seg.mean()
    s *= np.hanning(len(s))
    n = 1 << int(np.ceil(np.log2(len(s) * 2)))
    sp = np.fft.rfft(s, n)
    ac = np.fft.irfft(sp * np.conj(sp))[:len(s)]
    if ac[0] <= 0:
        return 0.0
    ac /= ac[0]
    lo, hi = int(RATE / fmax), int(RATE / fmin)
    if hi >= len(ac):
        return 0.0
    k = lo + int(np.argmax(ac[lo:hi]))
    # 抛物线插值
    if 0 < k < len(ac) - 1:
        a, b, c = ac[k - 1], ac[k], ac[k + 1]
        d = (a - c) / (2 * (a - 2 * b + c)) if (a - 2 * b + c) != 0 else 0.0
        k = k + d
    return RATE / k if k > 0 else 0.0


def band_energy(seg):
    """8段对数频带能量占比（音色指纹）。"""
    if len(seg) < 256:
        return None
    s = seg * np.hanning(len(seg))
    sp = np.abs(np.fft.rfft(s)) ** 2
    f = np.fft.rfftfreq(len(s), 1.0 / RATE)
    edges = [0, 300, 600, 1000, 1600, 2500, 4000, 6000, 8000]
    tot = sp.sum() or 1.0
    return [float(sp[(f >= edges[i]) & (f < edges[i + 1])].sum() / tot) for i in range(8)]


def main():
    print('=' * 78)
    print('盲测声学报告  —— 客观物理量，不猜内容')
    print('=' * 78)
    out = {}
    for name in FILES:
        p = os.path.join(SRC, name)
        if not os.path.exists(p):
            print('\n[缺失] %s' % name)
            continue
        x = load_pcm(p)
        if x is None or len(x) < RATE // 4:
            print('\n[解码失败] %s' % name)
            continue
        env, thr, segs = segments(x)
        dur = len(x) / RATE
        rms = np.sqrt((x ** 2).mean())
        peak = np.abs(x).max()
        print('\n' + '-' * 78)
        print('文件：%s' % name)
        print('  总时长 %.2fs ｜ 样本 %d ｜ RMS %.1f dBFS ｜ 峰值 %.1f dBFS'
              % (dur, len(x), 20 * np.log10(rms + 1e-12), 20 * np.log10(peak + 1e-12)))
        print('  检测到有声段：**%d 段**（阈值 %.4f）' % (len(segs), thr))
        rows = []
        for i, (a, b) in enumerate(segs):
            sa, sb = a * int(0.02 * RATE), b * int(0.02 * RATE)
            seg = x[sa:sb]
            f0 = f0_autocorr(seg)
            be = band_energy(seg)
            d = (b - a) * 0.02
            rmsv = np.sqrt((seg ** 2).mean())
            tag = []
            if be:
                # 频带集中度：高频占比高= 擦音/噪声成分多（塞音擦音）
                noise = be[5] + be[6] + be[7]
                low = be[0] + be[1]
                if noise > 0.35:
                    tag.append('高频噪声重')
                elif low > 0.5:
                    tag.append('低频主导')
                else:
                    tag.append('中频主导')
            rows.append({
                'i': i + 1, 'dur': round(d, 3), 'rms': round(20 * np.log10(rmsv + 1e-12), 1),
                'f0': round(f0, 1) if f0 else 0, 'tag': '/'.join(tag),
                'bands': [round(v, 3) for v in be] if be else None,
            })
            print('    段%-2d  %.3fs  RMS %6.1f dB  基频 %s Hz  %s'
                  % (i + 1, d, 20 * np.log10(rmsv + 1e-12),
                     ('%.0f' % f0) if f0 else '—', '/'.join(tag)))
        # 段间停顿
        gaps = []
        for i in range(len(segs) - 1):
            gaps.append((segs[i + 1][0] - segs[i][1]) * 0.02)
        if gaps:
            print('  段间停顿：%s' % ', '.join('%.2fs' % g for g in gaps))
        segdurs = [r['dur'] for r in rows]
        if segdurs:
            print('  段长：min %.2fs / max %.2fs / 合计 %.2fs（占全文件 %.0f%%）'
                  % (min(segdurs), max(segdurs), sum(segdurs), 100 * sum(segdurs) / dur))
        out[name] = {'dur': round(dur, 3), 'n_seg': len(segs),
                     'rms': round(20 * np.log10(rms + 1e-12), 1),
                     'peak': round(20 * np.log10(peak + 1e-12), 1),
                     'gaps': [round(g, 3) for g in gaps], 'segs': rows}
    # 横向对比
    print('\n' + '=' * 78)
    print('横向对比')
    print('=' * 78)
    print('%-16s %8s %6s %8s %s' % ('文件', '时长', '段数', '段长合计', '段间停顿'))
    for name, v in out.items():
        sd = sum(s['dur'] for s in v['segs'])
        print('%-16s %7.2fs %6d %7.2fs %s'
              % (name, v['dur'], v['n_seg'], sd,
                 ', '.join('%.2f' % g for g in v['gaps']) or '—'))
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_blind_report.json')
    with io.open(p, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print('\n报告已存：%s' % p)


if __name__ == '__main__':
    main()
