#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""按客观质量从候选段里自动选最优的一条（供用户试听否决）

选段判据（全部可测量，不含主观猜测）：
  1. **完整性**：段长接近该条的中位数（太短=念快了、太长=拖了）
  2. **饱满度**：峰值接近但不超过满量程（峰值高=口型到位、录音响）
  3. **稳定性**：与同条其他段的一致性（同一音念多遍，客观上应有相近的时长/峰值）
  4. **去离群**：剔除明显偏离中位数的段（可能是半句、吞音）

用法：
  python scripts/pick_best_segments.py# 自动选，写出 candidates/picked.json
  python scripts/pick_best_segments.py letter_03       # 看某条的评分明细
"""
import io
import json
import os
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAND = os.path.join(ROOT, '.workbuddy', 'tmp', 'voice-candidates')
SJ = os.path.join(CAND, '_segments.json')


def wav_stats(path):
    d = open(path, 'rb').read()
    # 找 data chunk
    i = d.find(b'data')
    if i < 0:
        return None
    i += 8
    x = np.frombuffer(d[i:i + (len(d) - i) // 2 * 2], dtype='<i2').astype(np.float64)
    if len(x) == 0:
        return None
    peak = float(np.abs(x).max())
    rms = float(np.sqrt((x ** 2).mean()))
    # 起音斜率（辅音的爆破/摩擦是否清晰）：前 30ms 的能量爬升
    n30 = int(0.03 * 16000)
    onset = float(np.sqrt((x[:n30] ** 2).mean())) if len(x) >= n30 else rms
    # 有效带宽（是否有高频噪声）
    s = x * np.hanning(len(x))
    sp = np.abs(np.fft.rfft(s)) ** 2
    f = np.fft.rfftfreq(len(s), 1 / 16000.0)
    tot = sp.sum() or 1.0
    hf = float(sp[f > 6000].sum() / tot)
    return {'dur': len(x) / 16000.0, 'peak': peak, 'rms': rms, 'onset': onset, 'hf': hf}


def main():
    segs = json.load(io.open(SJ, encoding='utf-8'))
    only = sys.argv[1] if len(sys.argv) > 1 else None
    out = {}
    if only:
        segs = {only: segs[only]}
    for vid, info in segs.items():
        st = []
        for it in info:
            p = os.path.join(CAND, it['file'])
            if not os.path.exists(p):
                continue
            m = wav_stats(p)
            if m:
                it = dict(it)
                it.update(m)
                st.append(it)
        if not st:
            continue
        durs = np.array([s['dur'] for s in st])
        peaks = np.array([s['peak'] for s in st])
        dmed, pmed = np.median(durs), np.median(peaks)
        # 评分：时长近中位 + 峰值高但不过载 + 起音清晰 + 高频干净
        for s in st:
            dscore = 1.0 - min(abs(s['dur'] - dmed) / max(dmed, 1e-6), 1.0)
            pscore = min(s['peak'] / 32000.0, 1.0)          # 接近满量程最好，过载会被 -1.5dB 限
            osc = min(s['onset'] / max(s['rms'], 1e-6) / 3.0, 1.0)  # 起音相对能量
            hfp = 1.0 - min(s['hf'] / 0.25, 1.0)            # 高频噪声扣分
            s['score'] = round(0.34 * dscore + 0.30 * pscore + 0.20 * osc + 0.16 * hfp, 4)
        st.sort(key=lambda x: -x['score'])
        out[vid] = st
        if only:
            print('=== %s ===' % vid)
            print('%-10s %7s %9s %8s %8s %7s %7s' %
                  ('段', '时长', '峰值', 'RMS', '起音', '高频%', '评分'))
            for rank, s in enumerate(st, 1):
                mark = ' ★推荐' if rank == 1 else ''
                print('s%02d%s%-6s %6.3fs %8.0f %8.0f %8.2f %6.1f%% %7.4f'
                      % (s['seg'], '' if rank > 1 else '（首选）', '', s['dur'],
                         s['peak'], s['rms'], s['onset'], s['hf'] * 100, s['score']))
            print()
            print('推荐入库：%s_s%02d.wav' % (vid, st[0]['seg']))
    if not only:
        p = os.path.join(CAND, 'picked.json')
        with io.open(p, 'w', encoding='utf-8') as f:
            json.dump({k: v[0] for k, v in out.items()}, f, ensure_ascii=False, indent=1)
        print('已为 %d 条各选出最优段 → %s' % (len(out), p))
        print()
        print('%-12s %6s %8s %8s %8s' % ('条目', '遍数', '推荐段', '时长', '评分'))
        for k in sorted(out):
            v = out[k][0]
            print('%-12s %6d %8s %7.3fs %8.4f' % (k, len(out[k]), 's%02d' % v['seg'],
                                          v['dur'], v['score']))


if __name__ == '__main__':
    main()
