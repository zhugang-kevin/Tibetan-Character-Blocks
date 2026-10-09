#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/normalize_voice.py — 全量音频**响度归一**（D59）

为什么做这件事（2026-10-09 用户反馈「藏文的播放有时候就是没有读取的」）：
  逐条量完 42 条语音 + 9 条音效后，发现**响度差了 15dB 以上**：

    中文讲解 secret_*   RMS ≈ −20 dB   峰值 −2.7…−4.7
    激励 praise_*       RMS ≈ −21 dB   峰值 −3.6��−7.0
    **藏文发音 letter_***  RMS ≈ **−28…−35 dB**   峰值 −9.4…**−21.3**

  也就是说：藏文发音比中文讲解**轻 12~15dB**。手机外放本身就不够劲，
  再轻 15dB 的结果就是「按了像没反应」—— 这才是用户感知到的「没有读取」，
  而不是文件缺失（缺文件的那 9 条已经由 D57 如实标成「发音待录入」）。

  做法：按 **RMS 响度**统一到 −20 dBFS（与中文讲解同档，也就是项目既有的听感标准），
  再用**峰值上限 −1.5 dBFS** 兜住爆音。
  为什么不用 ffmpeg 的 loudnorm：那是动态压缩，会把呼吸、句尾收弱一起改变；
  而这里要的是「同一条音量线」，静态增益更可控、结果可预测（可复现）。

  ⚠️ 峰值上限意味着个别冲击波大的文件（如 ཨ，crest factor 特别高）到不了目标 RMS ——
  那宁可小声一点，也**不要削波**：削波产生的失真比小声难听得多，也更伤清晰度。

用法：
  python scripts/normalize_voice.py            # 预览（只报会怎么改，不落盘）
  python scripts/normalize_voice.py --apply    # 真改
  python scripts/normalize_voice.py --include-sfx   # 连音效一起归一（bgm 永远排除）
"""
import argparse
import array
import math
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICE_DIR = os.path.join(ROOT, 'audio', 'voice')
SFX_DIR = os.path.join(ROOT, 'audio')

TARGET_RMS_DB = -20.0     # 与中文讲解同档（项目既有听感标准）
PEAK_CEIL_DB = -1.5       # 爆音上限；等于 -1.5dBFS ≈ 峰值 29500/32768
TARGET_RMS = 10 ** (TARGET_RMS_DB / 20.0) * 32768
PEAK_CEIL = 10 ** (PEAK_CEIL_DB / 20.0) * 32768

# 背景音乐**永远不参与**：它的响度是设计的一部分（utils/audio.js 的 BGM_VOLUME 0.28
# 就是在控混音平衡），归一等于把混音推翻。
EXCLUDE_NAMES = {'bgm.wav', 'bgm.mp3'}


def decode_peak_rms(path, rate=16000):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-map', 'a:0',
                        '-f', 's16le', '-ac', '1', '-ar', str(rate), '-'],
                       capture_output=True)
    raw = r.stdout or b''
    if len(raw) < 2:
        return None
    a = array.array('h')
    a.frombytes(raw[:len(raw) // 2 * 2])
    if not a:
        return None
    peak = max(max(a), -min(a))
    rms = math.sqrt(sum(float(x) * x for x in a) / len(a))
    return peak, rms


def gain_for(peak, rms):
    """返回该文件需要的增益（线性）。先按 RMS 算，再被峰值上限夹住。"""
    if rms <= 0:
        return 1.0
    g = TARGET_RMS / rms
    if peak * g > PEAK_CEIL:
        g = PEAK_CEIL / peak          # 削波换清晰度 —— 不做，宁可小声
    return g


def collect(include_sfx):
    files = []
    for d in (VOICE_DIR, SFX_DIR) if include_sfx else (VOICE_DIR,):
        if not os.path.isdir(d):
            continue
        for f in sorted(os.listdir(d)):
            if not f.lower().endswith(('.mp3', '.wav', '.m4a')):
                continue
            if f in EXCLUDE_NAMES:
                continue
            files.append(os.path.join(d, f))
    return files


def main():
    ap = argparse.ArgumentParser(description='全量音频响度归一（RMS 对齐 + 峰值兜底）')
    ap.add_argument('--apply', action='store_true', help='真改（默认只预览）')
    ap.add_argument('--include-sfx', action='store_true', help='连音效一起归一')
    ap.add_argument('--tol', type=float, default=0.5, help='增益小于该 dB 视为无需改动')
    args = ap.parse_args()

    ff = shutil.which('ffmpeg')
    if not ff:
        print('✗ 未找到 ffmpeg（PATH 里装一下即可）')
        sys.exit(2)

    files = collect(args.include_sfx)
    print('响度归一：目标 RMS %.0f dBFS / 峰值上限 %.1f dBFS（%s）'
          % (TARGET_RMS_DB, PEAK_CEIL_DB, '含音效' if args.include_sfx else '仅藏文/讲解语音'))
    changed = 0
    for path in files:
        st = decode_peak_rms(path)
        if not st:
            print('  ! %s 解码失败，跳过' % os.path.basename(path))
            continue
        peak, rms = st
        g = gain_for(peak, rms)
        gdb = 20 * math.log10(g) if g > 0 else -99.0
        if abs(gdb) < args.tol:
            print('  - %-18s 已在档（增益 %+.1f dB）' % (os.path.basename(path), gdb))
            continue
        rel = os.path.relpath(path, ROOT)
        if args.apply:
            tmp = tempfile.NamedTemporaryFile(suffix=os.path.splitext(path)[1],
                                              delete=False, dir=os.path.dirname(path))
            tmp.close()
            try:
                subprocess.run([ff, '-y', '-loglevel', 'error', '-i', path,
                                '-af', 'volume=%.4fdB' % gdb, '-ac', '1',
                                '-ar', '16000', tmp.name], check=True)
                # 编码参数必须与源一致，否则体积会漂
                if path.lower().endswith('.mp3'):
                    br = {'secret_': '8k', 'praise_': '24k'}.get(
                        os.path.basename(path).rsplit('.', 1)[0][:7], '12k')
                    subprocess.run([ff, '-y', '-loglevel', 'error', '-i', tmp.name,
                                    '-ac', '1', '-ar', '16000', '-codec:a', 'libmp3lame',
                                    '-b:a', br, path], check=True)
                else:
                    os.replace(tmp.name, path)
            finally:
                # 中途被中断 / ffmpeg 失败时也必须清掉临时文件：
                # 它就落在 audio/voice/ 里，会被当成一条语音打进主包（白占 3KB），
                # 还会让 §47 的「清单与目录零漂移」误报。第一次就被 SIGTERM 咬过一次。
                if os.path.exists(tmp.name):
                    os.remove(tmp.name)
        changed += 1
        print('  ✓ %-18s RMS %+.1f dB → 增益 %+.1f dB%s'
              % (rel, 20 * math.log10(max(1e-6, rms / 32768)), gdb,
                 '' if args.apply else '（预览，加 --apply 落盘）'))
    print('\n%s %d 条' % ('已归一' if args.apply else '将归一', changed))
    if not args.apply and changed:
        print('确认无误后加 --apply 落盘；随后请跑 python scripts/check_voice.py 复检')


if __name__ == '__main__':
    main()
