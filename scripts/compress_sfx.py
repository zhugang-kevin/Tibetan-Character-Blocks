#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/compress_sfx.py — 程序合成音效 WAV → MP3（D52 包体腾挪）

为什么做这件事：
  D52 把「藏地密码」的中文讲解从「只播第一句」改成「播整段正文」（单一事实源
  data/secrets.js），十条 mp3 合计 +83KB（196KB → 279KB），主包直接顶到 2MB 上限
  （实测 1845KB > 1843KB 预算）。腾挪从音效侧出最干净：
    tap / match / mismatch / win / drum / horn / cheer 七条音效是**未压缩的
    16-bit PCM WAV**，合计 172KB；而它们的实际内容不到 2 秒（纯正弦 + 包络的
    程序合成音）。转 MP3 后约 16KB —— 省 ~156KB，主包回到 1650KB 量级，
    并给 D51 的后续（首页课表 UI / 证书墙 / 体验版学习棋盘）留出真实余量。

为什么 tap 不动：
  它只有 1.5KB（省不出空间），且是「点一下立刻响」的即时反馈；MP3 编码器约 26ms
  的前置延迟会把手感变钝。收益为零、风险非零 —— 保留 WAV。

规格：单声道 / 22050Hz（与源 WAV 同，不重采样）/ libmp3lame 64kbps。
听感：合成音频谱极简（基音 + 少量谐波 + 噪声层），64kbps 单声道无可辨损失。

⚠️ 与 scripts/make_praise_audio.py 的关系：
  那个脚本仍然产出 WAV（纯 Python，不引 ffmpeg 依赖）。重生成 drum/horn/cheer 后
  必须再跑一次本脚本，否则 WAV 会重新进包、体积守卫会红。

用法：
  python scripts/compress_sfx.py              # 转换缺失的条目（已是 mp3 则跳过）
  python scripts/compress_sfx.py --force      # 全部重转
  python scripts/compress_sfx.py --keep-wav   # 保留源 WAV（默认转换成功后删除）
"""
import argparse
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO_DIR = os.path.join(ROOT, 'audio')

# tap 保留 WAV：1.5KB，且是零延迟的点击反馈（见文件头说明）
TARGETS = ['match', 'mismatch', 'win', 'drum', 'horn', 'cheer']
BITRATE = '64k'
PER_FILE_LIMIT_KB = 12   # 最长的 win/horn 也不到 1 秒，64kbps 下约 8KB


def convert(name, force, keep_wav):
    wav = os.path.join(AUDIO_DIR, name + '.wav')
    mp3 = os.path.join(AUDIO_DIR, name + '.mp3')
    if os.path.exists(mp3) and not force:
        return None, os.path.getsize(mp3)
    if not os.path.exists(wav):
        print('  - %-9s 缺源 WAV，跳过（已是 mp3 则无妨）' % name)
        return None, os.path.getsize(mp3) if os.path.exists(mp3) else 0
    before = os.path.getsize(wav)
    ff = shutil.which('ffmpeg')
    if not ff:
        print('✗ 未找到 ffmpeg —— 无法压缩音效（pip/安装包见 docs）')
        sys.exit(2)
    cmd = [ff, '-y', '-loglevel', 'error', '-i', wav,
           '-ac', '1', '-ar', '22050', '-codec:a', 'libmp3lame', '-b:a', BITRATE, mp3]
    subprocess.run(cmd, check=True)
    after = os.path.getsize(mp3)
    if not keep_wav:
        os.remove(wav)
    return before, after


def main():
    ap = argparse.ArgumentParser(description='程序合成音效 WAV → MP3（包体腾挪）')
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--keep-wav', action='store_true')
    args = ap.parse_args()

    print('音效压缩（%s / 单声道 / 22050Hz）：' % BITRATE)
    saved, total_before, total_after = 0, 0, 0
    over = []
    for name in TARGETS:
        before, after = convert(name, args.force, args.keep_wav)
        total_after += after
        if before is None:
            print('  - %-9s %5.1fKB（已是 mp3，跳过）' % (name, after / 1024))
            continue
        total_before += before
        saved += before - after
        flag = '' if after <= PER_FILE_LIMIT_KB * 1024 else '  ⚠ 超单条上限 %dKB' % PER_FILE_LIMIT_KB
        if flag:
            over.append(name)
        print('  ✓ %-9s %5.1fKB → %5.1fKB%s' % (name, before / 1024, after / 1024, flag))

    print('\n音效合计 %.1fKB，本轮省下 %.1fKB（tap.wav 保留 %.1fKB）'
          % (total_after / 1024, saved / 1024,
             os.path.getsize(os.path.join(AUDIO_DIR, 'tap.wav')) / 1024
             if os.path.exists(os.path.join(AUDIO_DIR, 'tap.wav')) else 0))
    if over:
        print('✗ 超限条目：%s' % ' '.join(over))
        sys.exit(1)


if __name__ == '__main__':
    main()
