#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从真人录音里提取「单次念」候选段，生成试听库

背景（用户实际录音方式）：
  用户为「让系统听准」把每条念了 N 遍（实测 3~16 遍）。但小程序不录音、不识别，
  音频只会被原样播放 → 入库必须是**单次念**，否则玩家会听到连念 N 遍（错误教学示范）。
  所以：把 N 段全部提取成独立文件 → 用户挑最好的一条 → 入库。

产出：
  .workbuddy/tmp/voice-candidates/<id>_s01.wav ... 单段 WAV（16kHz 单声道）
  docs/voice-pick-list.md  试听清单（客观数据 + 文件名）

用法：
  python scripts/extract_voice_segments.py            # 提取
  python scripts/extract_voice_segments.py letter_03  # 只处理某条
"""
import argparse
import io
import json
import os
import re
import subprocess
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = r"C:\Users\zhuga\OneDrive\Documents\xwechat_files\wxid_kp8ov257seut22_be73\msg\file\2026-10"
OUT_DIR = os.path.join(ROOT, '.workbuddy', 'tmp', 'voice-candidates')
PICK_MD = os.path.join(ROOT, 'docs', 'voice-pick-list.md')
RATE = 16000


def load(p):
    raw = os.path.join(OUT_DIR, '_tmp.raw')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', p,
                    '-f', 's16le', '-ac', '1', '-ar', str(RATE), raw],
                   capture_output=True)
    d = open(raw, 'rb').read()
    os.remove(raw)
    return np.frombuffer(d[:len(d) // 2 * 2], dtype='<i2').astype(np.int16)


def segments(x, win=0.02, min_ms=90, gap_ms=140, pad_ms=40):
    """切段并给每段留 pad_ms 的前后余量（避免切掉爆破音的起头/收音）

    ⚠️ 自检踩过的坑（必须保留这个教训）：
      第一版阈值写`env.max() * 0.06`（相对峰值 6%），
      但 `env` 是**幅度域**（0..32768），env.max()≈8000 → thr≈480 ≈ **+53.6dBFS**。
      结果：字与字之间电平稍高的部分全被判成"静音"，切出 0 段。
      —— **相对比例必须以「幅度峰值」而非「dB」来解释**；
      0.06 相对 8000 = 480，看着小，实际是高得离谱的绝对电平。
      正确做法：用**绝对阈值 + 相对下限双约束**：
        thr = max(ABS_FLOOR, peak * 0.08)   # ABS_FLOOR = 噪声门 -45dBFS
    """
    n = int(win * RATE)
    m = len(x) // n
    env = np.array([np.sqrt((x[i * n:(i + 1) * n].astype(np.float64) ** 2).mean() + 1e-12)
                    for i in range(m)])
    peak = float(env.max())
    # 绝对噪声门（−45dBFS）防止极安静录音把噪声也当语音；
    # 相对下限（峰值的 8%）防止大动态录音里尾音被切碎。
    abs_floor = 32768.0 * 10 ** (-45.0 / 20.0)      # ≈ 184
    thr = max(abs_floor, peak * 0.08)
    on = env > thr
    # ⚠️⚠️ 单位换算（这个 bug 让整份输出为 0，必须保留注释）：
    #   win 的单位是**秒**（0.02），gap_ms / min_ms 的单位是**毫秒**（140 / 90）。
    #   所以帧数 = ms / (win * 1000)，我第一版写成 `gap_ms / win` = 7000 帧
    #   → 补洞条件恒真；`min_ms / win` = 4500 帧 = 90 秒 → 所有段都「太短」被丢弃
    #   → segs 恒为 0。ms→帧 的换算必须带 *1000。
    gf = int(gap_ms / (win * 1000.0))    # 140ms → 7 帧
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
    mf = max(2, int(min_ms / (win * 1000.0)))   # 90ms → 4 帧
    for k, v in enumerate(on):
        if v and cur is None:
            cur = k
        elif not v and cur is not None:
            if k - cur >= mf:
                segs.append((cur * win, k * win))
            cur = None
    if cur is not None and len(on) - cur >= mf:
        segs.append((cur * win, m * win))
    pad = pad_ms / 1000.0
    out = []
    for a, b in segs:
        a2 = max(0.0, a - pad)
        b2 = min(m * win, b + pad)
        out.append((a2, b2))
    return out


def write_wav(samples, path, rate=RATE):
    d = samples.astype('<i2').tobytes()
    with open(path, 'wb') as f:
        f.write(b'RIFF')
        f.write((36 + len(d)).to_bytes(4, 'little'))
        f.write(b'WAVEfmt ')
        f.write((16).to_bytes(4, 'little'))
        f.write((1).to_bytes(2, 'little'))      # PCM
        f.write((1).to_bytes(2, 'little'))      # mono
        f.write(rate.to_bytes(4, 'little'))
        f.write((rate * 2).to_bytes(4, 'little'))
        f.write((2).to_bytes(2, 'little'))
        f.write((16).to_bytes(2, 'little'))
        f.write(b'data')
        f.write(len(d).to_bytes(4, 'little'))
        f.write(d)


def db_of(a):
    return 20 * np.log10(max(float(np.abs(a).max()), 1e-9) / 32768.0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('only', nargs='?', default=None)
    ap.add_argument('--sentence', action='store_true',
                    help='按长句阈值切分（句子是整句多遍连录，音节间隔与停顿同量级）')
    args = ap.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    # D114：句子与辅音**互斥扫描**。两种阈值下的段边界完全不同
    #   （tashi_delek 在句子阈值下是 5 段 × ~1.2s，在辅音阈值下会被打碎成
    #   0.24s 的气口碎片）。混在一份清单里必然有一方是错的，所以按模式分开。
    if args.sentence:
        files = sorted(f for f in os.listdir(SRC) if re.match(
            r'^(tashi_delek|blessing_\d+|greet_\d+)\.mp3\.m4a$', f))
        MIN_MS, GAP_MS = 400, 700
    else:
        files = sorted(f for f in os.listdir(SRC) if re.match(
            r'^(letter_\d+|icon_\d+)\.mp3\.m4a$', f))
        MIN_MS, GAP_MS = 90, 140
    if args.only:
        files = [f for f in files if f.startswith(args.only)]
    print('扫描到 %d 个文件，最小段长=%dms 间隙=%dms' % (len(files), MIN_MS, GAP_MS))

    L = []
    L.append('# 单次念候选段 · 试听清单')
    L.append('')
    L.append('> 由 `python scripts/extract_voice_segments.py` 自动生成。')
    L.append('> 每条原始录音念了多遍，下面按顺序拆成单次念，供**挑选入库**。')
    L.append('')
    L.append('## 怎么用');
    L.append('')
    L.append('1. 试听 `候选/voice-candidates/<id>_s01.wav` ~ `_sNN.wav`');
    L.append('2. 挑**最自然的那一遍**，把它的编号告诉我（如 `letter_03 → s02`）')
    L.append('   —— 你不用自己挑，只报编号即可。')
    L.append('3. 或者直接说「都要」（我会按客观质量自动选，见报告里的建议列）。')
    L.append('')

    rows = []
    total_segs = 0
    for f in files:
        vid = f.replace('.mp3.m4a', '')
        x = load(os.path.join(SRC, f))
        segs = segments(x, min_ms=MIN_MS, gap_ms=GAP_MS)
        if not segs:
            continue
        info = []
        for i, (a, b) in enumerate(segs, 1):
            s = x[int(a * RATE):int(b * RATE)]
            if len(s) < int(0.08 * RATE):
                continue
            name = '%s_s%02d.wav' % (vid, len(info) + 1)
            write_wav(s, os.path.join(OUT_DIR, name))
            info.append({
                'seg': len(info) + 1, 'file': name,
                'dur': round(len(s) / RATE, 3),
                'peak_db': round(db_of(s), 1),
                'rms_db': round(float(20 * np.log10(max(np.sqrt(
                    (s.astype(np.float64) ** 2).mean()), 1e-9) / 32768.0)), 1),
            })
        total_segs += len(info)
        rows.append((vid, info))

    # 渲染md
    L.append('## 客观数据（`s01` 起按时间顺序）')
    L.append('')
    L.append('| 条目 | 念了几遍 | 各段时长（秒） | 峰值范围 |')
    L.append('| --- | --- | --- | --- |')
    for vid, info in rows:
        durs = ', '.join('%.2f' % i['dur'] for i in info)
        pk = '%.1f ~ %.1f' % (min(i['peak_db'] for i in info),
                              max(i['peak_db'] for i in info))
        L.append('| `%s` | %d | %s | %s |' % (vid, len(info), durs, pk))
    L.append('')
    L.append('**合计 %d 条原始录音 → %d 个单次念候选段**，均在 `.workbuddy/tmp/voice-candidates/`。'
             % (len(rows), total_segs))
    L.append('')
    L.append('## 建议')
    L.append('')
    L.append('- **峰值最高的那段**通常录得最饱满、口型最到位；')
    L.append('- **时长居中**的那段通常最自然（最短偏急、最长偏拖）；')
    L.append('- 我可以按「峰值优先 + 时长居中」自动选，你在试听后否决即可。')
    L.append('')

    # D114：辅音与句子**必须写不同的清单文件**。
    #   踩过的坑：两种阈值（辅音 90ms/140ms，句子 400ms/700ms）共用一个
    #   `_segments.json`，后跑的那次会把前一次的清单整个覆盖掉 ——
    #   表现为「刚切好的句子段又消失了」，而且是静默的。
    #   现在句子写`_segments_sentences.json`，互不覆盖。
    sj_name = '_segments_sentences.json' if args.sentence else '_segments.json'
    md_name = 'voice-pick-list-sentences.md' if args.sentence else 'voice-pick-list.md'
    with io.open(os.path.join(ROOT, 'docs', md_name), 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(L))
    # JSON 供后续入库脚本使用
    with io.open(os.path.join(OUT_DIR, sj_name), 'w', encoding='utf-8') as fh:
        json.dump({vid: info for vid, info in rows}, fh, ensure_ascii=False, indent=1)

    print('提取完成：%d 条录音 → %d 个候选段' % (len(rows), total_segs))
    print('WAV：%s' % OUT_DIR)
    print('清单：%s' % os.path.join('docs', md_name))
    print('JSON：%s' % os.path.join(OUT_DIR, sj_name))
    print()
    print('%-12s %5s %s' % ('条目', '遍数', '各段时长'))
    for vid, info in rows:
        print('%-12s %5d %s' % (vid, len(info),
                                  ', '.join('%.2f' % i['dur'] for i in info)))


if __name__ == '__main__':
    main()
