#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/compress_voice.py — 藏文发音 WAV → MP3（D56 包体腾挪）

为什么做这件事：
  gen_voice.py 从 data/cards.js 读藏文文本、离线预生成 audio/voice/*.wav（16kHz 单声道
  16bit PCM）。36 条 WAV 合计约 1MB —— 主包 2MB 上限根本装不下，必须压成 MP3。

  中文播报那条链（gen_chinese_voice.py）是本项目的既有口径：讲解 @16kbps、激励 @24kbps。
  藏文发音是**单字 / 短词**，内容极简，取 16kbps 足够，且与讲解同档便于统一维护。

为什么不在 gen_voice.py 里直接出 MP3：
  那个脚本刻意「只依赖 Python 标准库、零安装」（见其文件头），不能引 ffmpeg。
  压缩单独成一步，与 compress_sfx.py（音效侧）同一套路 —— 谁产出 WAV，谁后面跟一个压缩脚本。

⚠️ 与 gen_voice.py 的关系：
  重跑 gen_voice.py 之后**必须再跑一次本脚本**，否则 WAV 会重新进包、体积守卫会红。
  本脚本默认在转换成功后删除源 WAV（--keep-wav 可保留）。

用法：
  python scripts/compress_voice.py                     # 转换缺失的条目（已是 mp3 则跳过）
  python scripts/compress_voice.py --force             # 全部重转
  python scripts/compress_voice.py --keep-wav          # 保留源 WAV
  python scripts/compress_voice.py --bitrate 10k       # 包体紧张时降码率（10kbps ≈ 1.25KB/秒）
"""
import argparse
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICE_DIR = os.path.join(ROOT, 'audio', 'voice')

BITRATE = '16k'
SAMPLE_RATE = '16000'      # 与 gen_voice.py 产出的 WAV 同采样率，不重采样
PER_FILE_LIMIT_KB = 24     # 最长的 blessing_01 约 2.1s，16kbps 下约 4KB；留足余量


def convert(name, force, keep_wav, bitrate):
    # ⚠️ 踩过的坑：早期写法是「已有 mp3 就跳过」，结果重跑 gen_voice.py（--force 重新生成 WAV）
    # 之后，本脚本因为看到旧 mp3 就跳过，**新 WAV 原封不动留在目录里**——1MB 的 WAV 直接进包，
    # 主包体积守卫当场红。判断依据必须是**谁更新**，而不是「存不存在」。
    wav = os.path.join(VOICE_DIR, name + '.wav')
    mp3 = os.path.join(VOICE_DIR, name + '.mp3')
    if not os.path.exists(wav):
        return None, (os.path.getsize(mp3) if os.path.exists(mp3) else 0)
    if os.path.exists(mp3) and not force and os.path.getmtime(mp3) > os.path.getmtime(wav):
        # mp3 比 wav 新：wav 是 --keep-wav 留下的残留，删掉它（留着会进包）
        if not keep_wav:
            os.remove(wav)
            return 0, os.path.getsize(mp3)
        return None, os.path.getsize(mp3)
    before = os.path.getsize(wav)
    ff = shutil.which('ffmpeg')
    if not ff:
        print('✗ 未找到 ffmpeg —— 无法压缩发音（PATH 里装一下即可）')
        sys.exit(2)
    cmd = [ff, '-y', '-loglevel', 'error', '-i', wav,
           '-ac', '1', '-ar', SAMPLE_RATE, '-codec:a', 'libmp3lame', '-b:a', bitrate, mp3]
    subprocess.run(cmd, check=True)
    after = os.path.getsize(mp3)
    if not keep_wav:
        os.remove(wav)
    return before, after


def main():
    ap = argparse.ArgumentParser(description='藏文发音 WAV → MP3（包体腾挪）')
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--keep-wav', action='store_true')
    ap.add_argument('--bitrate', default=BITRATE, help='默认 %s；包体紧张可降到 10k' % BITRATE)
    args = ap.parse_args()

    names = sorted(set(
        f[:-4] for f in os.listdir(VOICE_DIR) if f.endswith('.wav')
    ) | set(
        f[:-4] for f in os.listdir(VOICE_DIR) if f.endswith('.mp3')
    ))
    print('发音压缩（%s / 单声道 / %sHz）：' % (args.bitrate, SAMPLE_RATE))
    saved, total_after = 0, 0
    over = []
    for name in names:
        before, after = convert(name, args.force, args.keep_wav, args.bitrate)
        total_after += after
        if before is None:
            print('  - %-12s %5.1fKB（已是 mp3，跳过）' % (name, after / 1024.0))
            continue
        if before == 0:
            print('  · %-12s %5.1fKB（删掉了旧 WAV 残留）' % (name, after / 1024.0))
            continue
        saved += before - after
        flag = '' if after <= PER_FILE_LIMIT_KB * 1024 else '  ⚠ 超单条上限 %dKB' % PER_FILE_LIMIT_KB
        if flag:
            over.append(name)
        print('  ✓ %-12s %5.1fKB → %5.1fKB%s' % (name, before / 1024.0, after / 1024.0, flag))

    print('\n发音目录合计 %.1fKB（本轮由 WAV 省下 %.1fKB）' % (total_after / 1024.0, saved / 1024.0))
    if over:
        print('✗ 超限条目：%s' % ' '.join(over))
        sys.exit(1)


if __name__ == '__main__':
    main()
