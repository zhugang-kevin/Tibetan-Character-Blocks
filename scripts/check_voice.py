#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/check_voice.py — 审计 audio/voice/ 里每一条是否**真的有声**（D56）

为什么要有这一步：
  D56 排了三天才明白：**文件存在 ≠ 文件有声**。天翼返回的近静音片段（0.22s / 峰值 20~70）
  一样是个正常大小的音频文件，`wx.playVoice` 也不报错 —— 于是游戏里就表现为「点了没声音」，
  而且这种 bug 在代码层面查不出来。

  真人录音同样会踩这个坑：手机录的时候没按住、环境太安静只录进底噪、导出时选错声道……
  放进目录之前先过一遍这道闸，比事后在游戏里一个个试听省事得多。

判据（与 scripts/gen_voice.py 的 MIN_DUR / MIN_PEAK 保持同一口径）：
  · 时长：太短说明没录全或没读出来
  · 峰值：太低说明只有底噪
  · 声道 / 采样率：与本项目播放口径一致，避免包体被立体声/高采样率白白撑大

用法：
  python scripts/check_voice.py              # 全量体检
  python scripts/check_voice.py letter_03    # 只查某几条（录完立刻验）

拿到新录音的正确顺序：
  1. 按 docs/voice-recording-kit.md 录音，文件名 = 元素 ID（如 letter_03.mp3）
  2. python scripts/check_voice.py letter_03          ← 先验有声
  3. 体积不合预期时 python scripts/compress_voice.py --force
  4. node scripts/build-h5.js                          ← 体验版才会带上新录音
"""
import argparse
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICE_DIR = os.path.join(ROOT, 'audio', 'voice')

# 有声判据：与 gen_voice.py 同源同值，两边改一处必须同步改另一处（口径漂移 = 防线失效）
MIN_DUR = 0.25          # 秒
MIN_PEAK_DB = -32.0     # dBFS：比只看 16bit 整数峰值更直观（-32dB ≈ 峰值 400/32768）
WANT_CHANNELS = 1
WANT_RATE = 16000
MAX_SIZE_KB = 40


def ffprobe(path, *args):
    try:
        out = subprocess.run(['ffprobe', '-v', 'error'] + list(args) + [path],
                             capture_output=True, text=True, timeout=30)
        return out.stdout.strip()
    except Exception as e:
        return ''


def analyze(path):
    """返回 dict(dur, peak_db, channels, rate)。解析不出来返回 None。"""
    dur = ffprobe(path, '-show_entries', 'format=duration', '-of', 'csv=p=0')
    ch = ffprobe(path, '-select_streams', 'a:0', '-show_entries', 'stream=channels',
                 '-of', 'csv=p=0')
    rate = ffprobe(path, '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate',
                   '-of', 'csv=p=0')
    # 峰值电平：**解码成裸 PCM 自己算**，不去解析 ffmpeg 的日志文本。
    # 踩过的坑：astats 的统计信息是按 info 级别打到 stderr 的，-v error 会把它连同
    # 报错一起压掉，结果「读不到峰值」——看起来像文件坏了，其实是日志级别的问题。
    # 取裸 PCM 后自己求绝对值最大值，既不受日志级别影响，也不受语言/版本差异影响。
    peak = None
    try:
        p = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-map', 'a:0',
                            '-f', 's16le', '-ac', '1', '-ar', str(WANT_RATE), '-'],
                           capture_output=True, timeout=120)
        raw = p.stdout or b''
        if len(raw) >= 2:
            import array
            arr = array.array('h')
            arr.frombytes(raw[:len(raw) // 2 * 2])
            mx = max(max(arr), -min(arr)) if arr else 0
            import math
            peak = 20.0 * math.log10(max(1, mx) / 32768.0)
    except Exception:
        peak = None
    try:
        return {'dur': float(dur), 'peak_db': peak,
                'channels': int(ch) if ch else None,
                'rate': int(rate) if rate else None}
    except ValueError:
        return None


def main():
    ap = argparse.ArgumentParser(description='体检 audio/voice/ 的每一条是否真的有声')
    ap.add_argument('ids', nargs='*', help='只查指定条目（不含扩展名）')
    args = ap.parse_args()

    files = sorted(f for f in os.listdir(VOICE_DIR)
                   if f.lower().endswith(('.mp3', '.wav', '.m4a')))
    if args.ids:
        files = [f for f in files if os.path.splitext(f)[0] in args.ids]
    if not files:
        print('✗ 没有匹配的音频文件')
        sys.exit(2)

    bad, warned = [], []
    print('发音体检（时长 ≥ %.2fs / 峰值 > %.0f dBFS / 单声道 / %dHz）：'
          % (MIN_DUR, MIN_PEAK_DB, WANT_RATE))
    for f in files:
        full = os.path.join(VOICE_DIR, f)
        size = os.path.getsize(full)
        a = analyze(full)
        if not a:
            bad.append(f)
            print('  ✗ %-18s 解析失败（不是音频或已损坏）' % f)
            continue
        issues = []
        if a['dur'] < MIN_DUR:
            issues.append('过短 %.2fs' % a['dur'])
        if a['peak_db'] is None:
            issues.append('读不到峰值')
        elif a['peak_db'] <= MIN_PEAK_DB:
            issues.append('近静音 %.1fdB' % a['peak_db'])
        if a['channels'] not in (None, WANT_CHANNELS):
            issues.append('%s 声道' % a['channels'])
        if a['rate'] not in (None, WANT_RATE):
            issues.append('%sHz' % a['rate'])
        if size > MAX_SIZE_KB * 1024:
            issues.append('体积 %.0fKB 超 %dKB' % (size / 1024.0, MAX_SIZE_KB))
        tag = os.path.splitext(f)[0]
        if issues:
            bad.append(tag)
            print('  ✗ %-18s %5.1fKB  %.2fs  %s dB  —— %s'
                  % (f, size / 1024.0, a['dur'],
                     ('%.1f' % a['peak_db']) if a['peak_db'] is not None else '?',
                     '; '.join(issues)))
        else:
            print('  ✓ %-18s %5.1fKB  %.2fs  %.1f dB'
                  % (f, size / 1024.0, a['dur'], a['peak_db']))
    print('\n合格 %d 条 / 不合格 %d 条' % (len(files) - len(bad), len(bad)))
    if bad:
        print('不合格：' + ' '.join(bad))
        sys.exit(1)
    if warned:
        print('提示：' + ' '.join(warned))


if __name__ == '__main__':
    main()
