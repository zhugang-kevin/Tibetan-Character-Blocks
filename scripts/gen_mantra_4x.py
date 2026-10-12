#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/gen_mantra_4x.py — 「六字真言 ×4」祈福音频（D109）

## 用户原话（2026-10-13）
「打开这个第一页的时候，游戏刚刚下载的时候，我们有一个祈福……
 那个祈福的话叫藏语的话，**藏文的读音是 唵嘛呢叭咪吽 唵嘛呢叭咪吽 唵嘛呢叭咪吽 唵嘛呢叭咪吽**」

即：**ཨོཾ་མ་ཎི་པདྨེ་ཧཱུྃ 重复 4 遍**，用**藏文**念。

## 为什么不是「让 TTS 一次念 4 遍」
实测过（第一版就是这么做的）：TTS 返回 3.85s，而单遍是 2.08s —— **只长了 1.85 倍**，
包络数出来只有 8 个有声段（4 遍应为 12）。**它把 4 遍压缩着念了**，
不是四遍清晰的诵念。用户要的是「唵嘛呢叭咪吽」念四遍，不是一句快口句。

## 现在的做法
拿**已验证的单遍音频**（`mantra.mp3`，manifest 记录 text=ཨོཾ་མ་ཎི་པདྨེ་ཧཱུྃ།）
重复 4 次，中间插入 350ms 静音。
· 每一遍都是已知正确的那一条，**遍数可数、可验**
· 诵咒本就该是一遍一遍 discrete 的，拼接处加静音反而更自然

## 同时修正的既有问题
`pages/index/index.js` 的注释写着「**中文**播报《嗡 嘛 呢 叭 咪 吽》」——
**与事实不符**：那条音频是藏文合成的（天翼 zhuoma 念藏文）。注释错会误导后来的人。

用法：python scripts/gen_mantra_4x.py
"""
import io
import json
import os
import struct
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICE = os.path.join(ROOT, 'audio', 'voice')
TMP = os.path.join(ROOT, '.workbuddy', 'tmp')
MAN = os.path.join(ROOT, 'scripts', 'tts-manifest.json')
SRC_ID = 'mantra'
OUT_ID = 'mantra_4x'
REPS = 4
GAP_MS = 150
os.makedirs(TMP, exist_ok=True)


def to_pcm(src, dst):
    r = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src,
                        '-f', 's16le', '-ac', '1', '-ar', '16000', dst],
                       capture_output=True)
    return r.returncode == 0


def write_wav(samples, path, rate=16000):
    d = struct.pack('<%dh' % len(samples), *samples)
    with open(path, 'wb') as f:
        f.write(b'RIFF'); f.write(struct.pack('<I', 36 + len(d)))
        f.write(b'WAVEfmt ')
        f.write(struct.pack('<IHHIIHH', 16, 1, 1, rate, rate * 2, 2, 16))
        f.write(b'data'); f.write(struct.pack('<I', len(d)))
        f.write(d)


def load_pcm(path):
    d = open(path, 'rb').read()
    n = len(d) // 2
    return list(struct.unpack('<%dh' % n, d[:n * 2]))


def stats(path):
    raw = os.path.join(TMP, '_m4s.raw')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', path,
                    '-f', 's16le', '-ac', '1', '-ar', '16000', raw], capture_output=True)
    s = load_pcm(raw)
    if not s:
        return (0.0, 0)
    return (len(s) / 16000.0, max(abs(x) for x in s))


def count_groups(path):
    """数「有声段」—— 用于验证真的拼了 4 遍"""
    raw = os.path.join(TMP, '_m4c.raw')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', path,
                    '-f', 's16le', '-ac', '1', '-ar', '16000', raw], capture_output=True)
    s = load_pcm(raw)
    if not s:
        return []
    win = 160
    env = []
    for i in range(0, len(s) - win, win):
        seg = s[i:i + win]
        env.append((sum(x * x for x in seg) / len(seg)) ** 0.5)
    peak = max(env) or 1
    thr = peak * 0.15
    segs, cur = [], None
    for i, v in enumerate(env):
        if v > thr and cur is None:
            cur = i
        elif v <= thr and cur is not None:
            if i - cur >= 3:
                segs.append((cur, i))
            cur = None
    if cur is not None:
        segs.append((cur, len(env)))
    return segs


def main():
    src_mp3 = os.path.join(VOICE, SRC_ID + '.mp3')
    if not os.path.exists(src_mp3):
        print('X 找不到单遍音频 %s' % src_mp3)
        return 1

    try:
        man = json.load(io.open(MAN, encoding='utf-8'))
    except Exception:
        man = {}
    entry = man.get(SRC_ID) if isinstance(man, dict) else None
    text = (entry or {}).get('text', 'ཨོཾ་མ་ཎི་པདྨེ་ཧཱུྃ།')
    print('拼接「六字真言 x%d」' % REPS)
    print('  源：%s（manifest text=%s）' % (SRC_ID + '.mp3', text))

    pcm = os.path.join(TMP, '_m4src.raw')
    if not to_pcm(src_mp3, pcm):
        print('X 解码单遍失败'); return 1
    one = load_pcm(pcm)
    gap = [0] * int(16000 * GAP_MS / 1000.0)
    print('  单遍 %.2fs（%d 样本）｜ 间隔 %dms' % (len(one) / 16000.0, len(one), GAP_MS))

    out = []
    for i in range(REPS):
        out.extend(one)
        if i != REPS - 1:
            out.extend(gap)

    wav = os.path.join(TMP, '_m4out.wav')
    write_wav(out, wav)
    dur, peak = stats(wav)
    segs = count_groups(wav)
    print('  拼接结果：%.2fs 峰值 %d ｜ 有声段 %d 个' % (dur, peak, len(segs)))
    one_segs = len(count_groups(src_mp3))
    expect = one_segs * REPS
    print('  单遍段数 %d x %d = %d，实际 %d' % (one_segs, REPS, expect, len(segs)))
    if len(segs) < expect * 0.75:
        print('X 段数明显不足 —— 拼接结果不像 %d 遍' % REPS)
        return 1
    if dur < 6.0:
        print('X 总时长 %.2fs 过短（4 遍应 >=6s）' % dur)
        return 1
    print('  OK 遍数与时长都符合预期')

    out_mp3 = os.path.join(VOICE, OUT_ID + '.mp3')
    r = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav,
                        '-codec:a', 'libmp3lame', '-b:a', '20k', '-ac', '1',
                        '-ar', '16000', out_mp3], capture_output=True)
    if r.returncode:
        print('X 转 MP3 失败'); return 1
    st = stats(out_mp3)
    print('  OK 已写入 %s（%.1fKB，%.2fs，峰值 %d）'
          % (OUT_ID + '.mp3', os.path.getsize(out_mp3) / 1024.0, st[0], st[1]))

    # 原子写入 manifest
    if not isinstance(man, dict):
        man = {}
    man[OUT_ID] = {'dur': round(st[0], 3), 'form': 'base', 'peak': st[1],
                   'sampleRate': 16000,
                   'text': ' '.join([text.rstrip('\u0f0d\u0f0b')] * REPS) + '\u0f0d',
                   'voice': (entry or {}).get('voice', 'zhuoma'),
                   'note': '由已验证单遍 mantra 拼接 %d 遍（间隔 %dms）' % (REPS, GAP_MS)}
    tmp = MAN + '.tmp'
    with io.open(tmp, 'w', encoding='utf-8') as f:
        json.dump(man, f, ensure_ascii=False, indent=1)
        f.flush(); os.fsync(f.fileno())
    os.replace(tmp, MAN)
    print('  OK 已记入 tts-manifest.json（原子写入）')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
