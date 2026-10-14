#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""批量真人录音体检 —— 判据与项目既有口径同源

判据来源（不另立标准）：
  · 时长 ≥ 0.25s、峰值 > −32dBFS、单声道 16kHz← check_voice.py (D56)
  · 响度口径 −20dBFS /峰值上限 −1.5 dBFS     ← normalize_voice.py (D59)
  · 信噪比 > 35dB                            ← 新增（真人录音的环境噪声闸）

输出：每个条目的裁后时长 / 各段 / 峰值 / SNR / 需否增益 / 建议选第几段
"""
import io
import json
import os
import re
import subprocess
import sys

import numpy as np

SRC = r"C:\Users\zhuga\OneDrive\Documents\xwechat_files\wxid_kp8ov257seut22_be73\msg\file\2026-10"
RATE = 16000
TARGET_RMS_DB = -20.0
PEAK_CEIL_DB = -1.5


def amp_of(dbfs):
    return 10 ** (dbfs / 20.0) * 32768.0


def db_of(amp):
    return 20 * np.log10(max(abs(amp), 1e-12) / 32768.0)


TARGET_RMS = amp_of(TARGET_RMS_DB)
PEAK_CEIL = amp_of(PEAK_CEIL_DB)


def load(p, rate=RATE):
    raw = '.workbuddy/tmp/_b.raw'
    os.makedirs(os.path.dirname(raw), exist_ok=True)
    r = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', p,
                        '-f', 's16le', '-ac', '1', '-ar', str(rate), raw],
                       capture_output=True)
    if r.returncode:
        return None
    d = open(raw, 'rb').read()
    os.remove(raw)
    return np.frombuffer(d[:len(d) // 2 * 2], dtype='<i2').astype(np.float64)


def segments(x, win=0.02, rel=0.06, min_ms=90, gap_ms=140):
    n = int(win * RATE)
    m = len(x) // n
    env = np.array([np.sqrt((x[i * n:(i + 1) * n] ** 2).mean() + 1e-12) for i in range(m)])
    peak = env.max()
    thr = peak * rel
    on = env > thr
    gf = int(gap_ms / 1000.0 / win)
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
    mf = max(2, int(min_ms / 1000.0 / win))
    for k, v in enumerate(on):
        if v and cur is None:
            cur = k
        elif not v and cur is not None:
            if k - cur >= mf:
                segs.append((cur * win, k * win))
            cur = None
    if cur is not None and len(on) - cur >= mf:
        segs.append((cur * win, m * win))
    return segs


def analyze(path, name):
    x = load(path)
    if x is None or len(x) < RATE // 4:
        return {'id': name, 'error': '解码失败'}
    dur = len(x) / RATE
    peak = int(np.abs(x).max())
    clip = int(np.sum(np.abs(x[1:]) >= 32700))
    dc = float(x.mean())
    segs = segments(x)
    if not segs:
        return {'id': name, 'error': '未检测到有声段'}
    sdur = [round(b - a, 3) for a, b in segs]
    gaps = [round(segs[i + 1][0] - segs[i][1], 3) for i in range(len(segs) - 1)]
    # 整条有声部分（从首段到末段）
    a0, b0 = segs[0][0], segs[-1][1]
    speech = x[int(a0 * RATE):int(b0 * RATE)]
    srms = np.sqrt((speech ** 2).mean())
    # 底噪：⚠️ 第一版用「首段之前的静音」估底噪 —— 但真人录音里
    #    字与字之间的间隙同样「很安静」，会被当成底噪，
    #    于是 letter_16 被算出 SNR 24.5dB（误报「噪高」）。
    #    自检发现后改正：用**全文件最安静的 10% 帧**的均值（功率平均）作底噪。
    #    实测 letter_16：首段前法得 −77dBFS（错），最低 10% 法得 −87dBFS（对）。
    fw = int(0.02 * RATE)
    frames = [speech[i * fw:(i + 1) * fw] for i in range(len(speech) // fw)]
    if frames:
        p = np.mean([np.mean(f * f) for f in frames])
        thr = np.percentile([np.sqrt(v) for v in [np.mean(f * f) for f in frames]], 10)
        sel = [f for f in frames if np.sqrt(np.mean(f * f)) <= thr]
        p2 = np.mean([np.mean(f * f) for f in sel]) if sel else p
        noise = float(np.sqrt(max(p2, 1e-12)))
    else:
        noise = float(np.sqrt((speech ** 2).mean()))
    snr = 20 * np.log10((srms + 1e-9) / (noise + 1e-9)) if noise > 0 else 99.0
    g_rms = TARGET_RMS / (srms + 1e-9)
    g_peak = PEAK_CEIL / (peak + 1e-9)
    g = min(g_rms, g_peak)
    limited = g < g_rms - 1e-9
    return {
        'id': name, 'dur': round(dur, 2), 'n_seg': len(segs), 'segs': sdur, 'gaps': gaps,
        'speech_dur': round(sum(sdur), 2),
        'speech_rms': round(float(db_of(srms)), 1), 'peak': round(float(db_of(peak)), 1),
        'clip': clip, 'dc': round(dc, 1), 'snr': round(float(snr), 1),
        'gain': round(float(db_of(g * 32768)), 1),
        'rms_after': round(float(db_of(srms * g)), 1),
        'peak_after': round(float(db_of(peak * g)), 1),
        'peak_limited': bool(limited),
    }


def main():
    files = sorted(f for f in os.listdir(SRC) if re.match(r'^(letter_\d+|icon_\d+)\.mp3\.m4a$', f))
    if not files:
        print('未找到 letter_*.mp3.m4a / icon_*.mp3.m4a')
        return
    print('=' * 100)
    print('真人录音批量体检  —— %d 个文件' % len(files))
    print('=' * 100)
    rows = []
    for f in files:
        vid = f.replace('.mp3.m4a', '')
        r = analyze(os.path.join(SRC, f), vid)
        rows.append(r)
    # 汇总表
    print('\n%-12s %6s %4s %8s %8s %8s %8s %8s %8s %6s'
          % ('条目', '时长', '段数', '各段', '裁后', 'RMS', '峰值', 'SNR', '增益', '削波'))
    print('-' * 100)
    ok, warn, bad = [], [], []
    for r in rows:
        if 'error' in r:
            print('%-12s  ✗ %s' % (r['id'], r['error']))
            bad.append(r['id'])
            continue
        segtxt = ','.join('%.2f' % s for s in r['segs'])
        flag = ''
        if r['clip'] > 20:
            flag += ' 削波'
        if r['snr'] < 35:
            flag += ' 噪高'
        if r['n_seg'] == 1 and r['dur'] > 3:
            flag += ' 长单段'
        print('%-12s %5.2fs %4d %8s %7.2fs %7.1f %7.1f %7.1f %+7.1f %6s%s'
              % (r['id'], r['dur'], r['n_seg'], segtxt[:26], r['speech_dur'],
                 r['speech_rms'], r['peak'], r['snr'], r['gain'],
                 '✓' if r['clip'] <= 20 else '⚠%d' % r['clip'], flag))
        (bad if (r['clip'] > 20 or r['snr'] < 35 or 'error' in r) else
         (warn if (r['peak_limited'] or r['n_seg'] != 3) else ok)).append(r['id'])
    print('\n' + '=' * 100)
    print('汇总')
    print('=' * 100)
    tot_crop = sum(r.get('speech_dur', 0) for r in rows if 'error' not in r)
    tot_dur = sum(r.get('dur', 0) for r in rows if 'error' not in r)
    print('  可用 %d 条 ｜ 有提醒 %d 条 ｜ 不可用 %d 条'
          % (len(ok), len(warn), len(bad)))
    if bad:
        print('  不可用：%s' % ', '.join(bad))
    if warn:
        print('  有提醒：%s' % ', '.join(warn))
    print('  原总时长 %.1fs → 裁后 %.1fs（省 %.0f%%空白）' % (tot_dur, tot_crop,
                                                100 * (1 - tot_crop / max(tot_dur, 1e-9))))
    segc = sum(r.get('n_seg', 0) for r in rows if 'error' not in r)
    print('  检出有声段合计 %d 个 → 提取单段入库后约 %d 条音频' % (segc, segc))
    p = '.workbuddy/tmp/_batch_qa.json'
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with io.open(p, 'w', encoding='utf-8') as fh:
        json.dump(rows, fh, ensure_ascii=False, indent=1)
    print('  报告：%s' % p)


if __name__ == '__main__':
    main()
