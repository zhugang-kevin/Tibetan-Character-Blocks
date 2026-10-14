#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""录音质量深度体检 —— 不猜内容，只测可判定的物理质量

比check_voice.py 更严：check_voice 只判「有没有声」（D56 的最低门槛），
这里判「能不能直接入库」：响度口径、削波、底噪、DC 偏移、频谱、可裁剪性。
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
TARGET_RMS_DB = -20.0     # 与 data/secret_*.mp3 同档（scripts/normalize_voice.py 的既有口径）
PEAK_CEIL_DB = -1.5
# ⚠️ 常数必须由 db_of() 反推，不能手写：db_of() 定义是 20*log10(amp/32768)，
#    所以 X dBFS 对应幅度 = 10**(X/20) * 32768。
#    自检发现：手写「29400」是错的（−0.94dBFS），正确值 27571（−1.5dBFS）。
def amp_of(dbfs):
    return 10 ** (dbfs / 20.0) * 32768.0
def db_of(amp):
    return 20 * np.log10(max(abs(amp), 1e-12) / 32768.0)

TARGET_RMS = amp_of(TARGET_RMS_DB)     # 3277
PEAK_CEIL = amp_of(PEAK_CEIL_DB)       # 27571


def load(p, rate=RATE):
    raw = '.workbuddy/tmp/_qa.raw'
    os.makedirs(os.path.dirname(raw), exist_ok=True)
    r = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', p,
                        '-f', 's16le', '-ac', '1', '-ar', str(rate), raw],
                       capture_output=True)
    if r.returncode:
        return None, 0
    d = open(raw, 'rb').read()
    x = np.frombuffer(d[:len(d) // 2 * 2], dtype='<i2').astype(np.float64)
    return x, r.returncode


def _biquad(y, b, a):
    """直接 II 型转置双二阶（纯 numpy，不引 scipy）"""
    x = y
    out = np.empty_like(x)
    x1 = x2 = y1 = y2 = 0.0
    b0, b1, b2 = b[0] / a[0], b[1] / a[0], b[2] / a[0]
    a1, a2 = a[1] / a[0], a[2] / a[0]
    for i, xn in enumerate(x):
        yn = b0 * xn + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        out[i] = yn
        x2, x1 = x1, xn
        y2, y1 = y1, yn
    return out


def k_weight_lufs(x16):
    """ITU-R BS.1770 K 加权近似（16kHz 单声道）—— 用于判断「像不像专业母带」"""
    # 预滤波（高通）+ K 加权（高架 shelving），系数为 BS.1770-4 的 48k 定义在 16k 的等效近似
    y = x16.astype(np.float64) / 32768.0
    # 高通：~38Hz
    fc, Q = 38.0, 0.5
    w = 2 * np.pi * fc / RATE
    alpha = np.sin(w) / (2 * Q)
    b = [(1 + alpha) / 2, 0, -(1 + alpha) / 2]
    a = [1 + alpha, -2 * np.cos(w), 1 - alpha]
    y = _biquad(y, b, a)
    # K 加权中高频架
    fc, G, Q = 1681.97, 3.99984, 0.7071
    w = 2 * np.pi * fc / RATE
    alpha = np.sin(w) / (2 * Q)
    Vh = 10 ** (G / 20.0)
    Vb = Vh ** 0.4996
    a0 = 1 + alpha / Vb + (alpha * alpha)
    bk = [(Vh + Vh * alpha + alpha * alpha), 2 * (alpha * alpha - Vh), (alpha * alpha - Vh * alpha)]
    ak = [a0, 2 * (alpha / Vb - 1), 1 - alpha / Vb + (alpha * alpha)]
    y = _biquad(y, bk, ak)
    ms = np.mean(y ** 2)
    return -0.691 + 10 * np.log10(ms + 1e-20)


def segments(x16, win_ms=20, rel=0.03, min_ms=60, gap_ms=110):
    n = int(RATE * win_ms / 1000)
    m = len(x16) // n
    env = np.array([np.sqrt((x16[i * n:(i + 1) * n].astype(np.float64) ** 2).mean() + 1e-12) for i in range(m)])
    thr = env.max() * rel
    on = env > thr
    gf = int(gap_ms / win_ms)
    i = 0
    while i < len(on):
        if not on[i]:
            j = i
            while j < len(on) and not on[j]:
                j += 1
            if i > 0 and j < len(on) and (j - i) <= gf:
                on[i:j] = True
            i = j
        else:
            i += 1
    segs, cur = [], None
    mf = max(2, int(min_ms / win_ms))
    for k, v in enumerate(on):
        if v and cur is None:
            cur = k
        elif not v and cur is not None:
            if k - cur >= mf:
                segs.append((cur, k))
            cur = None
    if cur is not None and len(on) - cur >= mf:
        segs.append((cur, len(on)))
    return env, thr, segs


def spectral(x16, sr=RATE):
    if len(x16) < 512:
        return None
    s = x16.astype(np.float64) * np.hanning(len(x16))
    sp = np.abs(np.fft.rfft(s)) ** 2
    f = np.fft.rfftfreq(len(s), 1.0 / sr)
    tot = sp.sum() or 1.0
    bands = {}
    for lo, hi in [(0, 100), (100, 300), (300, 1000), (1000, 2000), (2000, 4000), (4000, 6000), (6000, 8000)]:
        bands['%d-%d' % (lo, hi)] = float(sp[(f >= lo) & (f < hi)].sum() / tot)
    # 有效带宽（能量 99% 处）
    c = np.cumsum(sp) / tot
    bw = float(f[np.searchsorted(c, 0.99)])
    return bands, bw


def main():
    print('=' * 92)
    print('录音质量深度体检  ——  判据来自项目既有口径（normalize_voice.py / check_voice.py）')
    print('=' * 92)
    rows = []
    for name in FILES:
        p = os.path.join(SRC, name)
        if not os.path.exists(p):
            print('\n[缺失] %s' % name)
            continue
        x16, rc = load(p)
        if rc or x16 is None or len(x16) < RATE // 4:
            print('\n[解码失败] %s' % name)
            continue
        xf = x16.astype(np.float64)
        dur = len(x16) / RATE
        peak = int(np.abs(x16).max())
        rms = np.sqrt((xf ** 2).mean())
        # 削波：连续3 个样本打满
        clip = int(np.sum(np.abs(x16[1:]) >= 32700))
        dc = float(xf.mean())
        env, thr, segs = segments(x16)
        sdur = [(b - a) * 0.02 for a, b in segs]
        speech = x16[int(segs[0][0] * 0.02 * RATE):int(segs[-1][1] * 0.02 * RATE)] if segs else x16
        srms = np.sqrt((speech.astype(np.float64) ** 2).mean())
        sp = spectral(speech)
        # 底噪：无声段（阈值下 10%）的能量—— 逐窗取样，长度天然对齐
        mask = env < thr * 0.1
        if mask.any():
            nb = max(1, len(x16) // len(env))
            noise = float(np.sqrt((xf[:len(env) * nb].reshape(len(env), nb) ** 2).mean(axis=1)[mask].mean()))
        else:
            noise = 0.0
        snr = 20 * np.log10((srms + 1e-9) / (noise + 1e-9))
        # 增益：目标是「峰值不超过 −1.5dBFS」与「RMS 达 −20dBFS」两者取小的那个
        # ⚠️ 第一版写成 db_of(TARGET_RMS/srms) —— db_of() 内部又除了一次 32768，
        #    等于把线性比值当成幅度算，得出 −87dB 这种荒谬值。自检发现后修正。
        rms_lin = srms                      # 幅度域（0..32768）
        gain_rms = TARGET_RMS / (rms_lin + 1e-9)          # 达 −20dBFS 所需线性倍数
        gain_peak = PEAK_CEIL / (peak + 1e-9)             # 不超−1.5dBFS 允许的线性倍数
        gain_used = min(gain_rms, gain_peak)
        limited = gain_used < gain_rms - 1e-9  # True = 为保护峰值而放弃了 −20dBFS 目标
        gain_needed = gain_used
        peak_after = db_of(peak * gain_used)
        rms_after = db_of(srms * gain_used)
        gap = [(segs[i + 1][0] - segs[i][1]) * 0.02 for i in range(len(segs) - 1)]
        cropped = sum(sdur)
        # 预估包体：16kbps 单声道 MP3≈ 2KB/s
        est_kb_single = cropped * 2.0
        est_kb_4x = cropped * 4 * 2.0
        print('\n' + '-' * 92)
        print('文件：%s   时长 %.2fs' % (name, dur))
        print('【响度】')
        print('  全文件 RMS %6.1f dBFS ｜ 峰值 %6.1f dBFS (%d/32768)'
              % (db_of(rms), db_of(peak), peak))
        print('  **有声段 RMS %6.1f dBFS**（入库只保留这部分）' % db_of(srms))
        print('  目标口径 −20 dBFS（峰值上限 −1.5 dBFS）→ 采用增益 %+.1f dB，'
              '得RMS %.1f dBFS / 峰值 %.1f dBFS %s'
              % (db_of(gain_used * 32768), rms_after, peak_after,
                 ('｜⚠ 为守峰值，RMS 只能到 %.1f dBFS（比−20低 %.1f dB）'
                  % (rms_after, rms_after - TARGET_RMS_DB)) if limited else '✓ 两者都达标'))
        print('【失真】')
        print('  削波样本 %d 个 %s ｜ DC 偏移 %.1f %s'
              % (clip, '⚠ 有削波' if clip > 20 else '✓ 无削波',
                 dc, '⚠ 直流偏置（占满量程 %.1f%%）' % (100 * abs(dc) / 32768) if abs(dc) > 200 else '✓ 正常'))
        print('【底噪】')
        print('  静音段 RMS %.1f dBFS ｜ 信噪比 %.1f dB %s'
              % (db_of(noise) if noise else -99, snr, '✓ 安静' if snr > 35 else '⚠ 有环境噪音'))
        print('【结构】')
        print('  有声段 %d 个，各段 %s' % (len(segs), ', '.join('%.2fs' % d for d in sdur)))
        print('  段间停顿 %s' % (', '.join('%.2fs' % g for g in gap) or '—'))
        print('  **裁掉停顿后 %.2fs**（省去 %.0f%% 空白）' % (cropped, 100 * (1 - cropped / dur)))
        if sp:
            bands, bw = sp
            print('【频谱】有效带宽 %.0f Hz（语音正常 300–3400；>6000 为手机麦克风染色）' % bw)
            print('  ' + ' '.join('%s=%.0f%%' % (k, v * 100) for k, v in bands.items()))
        print('【包体】按 16kbps 估：裁后单遍 %.1f KB ｜ 若做 4 遍版 %.1f KB' % (est_kb_single, est_kb_4x))
        rows.append({'name': name, 'dur': round(dur, 2), 'n_seg': len(segs),
                     'seg_durs': [round(float(d), 3) for d in sdur],
                     'gaps': [round(float(g), 3) for g in gap],
                     'speech_rms_db': round(float(db_of(srms)), 1), 'peak_db': round(float(db_of(peak)), 1),
                     'clip': int(clip), 'dc': round(float(dc), 1), 'snr': round(float(snr), 1),
                     'cropped_dur': round(float(cropped), 3),
                     'gain_db': round(float(db_of(gain_used * 32768)), 1),
                     'rms_after_db': round(float(db_of(srms * gain_used)), 1),
                     'peak_after_db': round(float(peak_after), 1),
                     'peak_limited': bool(limited),
                     'est_kb_single': round(float(est_kb_single), 1)})
    # 汇总
    print('\n' + '=' * 92)
    print('汇总与入库可行性判定')
    print('=' * 92)
    hdr = ('文件', '时长', '段数', '有声段RMS', '峰值', '削波', '信噪比', '采用增益', '归一后RMS', '裁后', '估KB')
    print('%-14s %7s %4s %11s %8s %5s %8s %9s %11s %7s %7s' % hdr)
    for r in rows:
        print('%-14s %6.2fs %4d %9.1fdB %6.1fdB %5s %7.1fdB %+7.1fdB %9.1fdB %6.2fs %6.1f'
              % (r['name'], r['dur'], r['n_seg'], r['speech_rms_db'], r['peak_db'],
                 '⚠%d' % r['clip'] if r['clip'] > 20 else '✓', r['snr'],
                 r['gain_db'], r['rms_after_db'], r['cropped_dur'], r['est_kb_single']))
    bad_clip = [r['name'] for r in rows if r['clip'] > 20]
    bad_snr = [r['name'] for r in rows if r['snr'] < 35]
    limited = [r['name'] for r in rows if r['peak_limited']]
    print()
    print('削波失真：%s' % (', '.join(bad_clip) if bad_clip else '无 ✓'))
    print('底噪超标：%s' % (', '.join(bad_snr) if bad_snr else '无 ✓（全部 >35dB）'))
    print('峰值受限：%s' % (', '.join(limited) if limited else '无 ✓'))
    tot = sum(r['est_kb_single'] for r in rows)
    print('五条裁后合计约 %.1f KB（单遍口径）／ 主包余量 189.5 KB' % tot)
    p = '.workbuddy/tmp/_qa_report.json'
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with io.open(p, 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)
    print('报告：%s' % p)


if __name__ == '__main__':
    main()
