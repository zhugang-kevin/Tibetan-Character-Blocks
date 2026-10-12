#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/try_letter_forms.py — 为「长音妥协」的字母找出**正确读音**的写法（D102）

## 要解决什么
`data/cards.js` 里教的是裸辅音（`ཀ` = 「ka」），但当年 TTS 发不出裸字形，
生成脚本退而用 `ཀཱ`（**长 a**）换出声 —— 于是音频念的是「kā」。
用户反馈「很多藏文读音**有错误**」，这是其中一批（共 8 条：ལཀ ཆ ཏ ན ཕ ཛ ར ཤ）。

## 思路
藏文里**短 a 没有独立符号**（是辅音固有的），所以 `ཱ` 是唯一能显式写出来的形式，但它偏长。
可试的方向是**用音节上下文把短 a 逼出来**：
  · `ཀ་`   加 tsheg（音节分隔符，不改变读音）
  · `ཀཀ`   双写 —— 会念「ka ka」两遍，**第一段就是我们要的「ka」**
  · `ཀཀ་`  双写 + tsheg

## 判据（不靠感觉）
对每段音频量 **RMS 包络的分段**：
  · 双写法若给出**两个等长有声段**，说明它确实念了两遍同一个音节，第一段可安全裁出
  · 与已有 `+ཱ` 版本的时长对比：正确读音应**短于**长音版（长音的特征就是更长）

## 用法
  python scripts/try_letter_forms.py            # 只测 1 个字母（letter_01 ཀ），省钱省时
  python scripts/try_letter_forms.py letter_01 letter_06
"""
import argparse
import os
import struct
import subprocess
import sys
import wave
import io

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_voice as G   # noqa: E402  复用它的鉴权与合成通道（不另造一套）

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMP = os.path.join(ROOT, '.workbuddy', 'tmp')
os.makedirs(TMP, exist_ok=True)

# 要试的写法（按「离正确读音由近到远」排序）
def variants(bare):
    return [
        (bare, '裸字形（理想，当年失败）'),
        (bare + '\u0f0b', '裸字形 + tsheg'),
        (bare + bare, '双写（念两遍，取第一段）'),
        (bare + bare + '\u0f0b', '双写 + tsheg'),
        (bare + '\u0f0b' + bare, 'tsheg 分隔的双写'),
    ]


def segments(path):
    """量 RMS 包络，返回（时长秒, 峰值, 有声段列表）"""
    raw = os.path.join(TMP, '_seg.raw')
    r = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', path,
                        '-f', 's16le', '-ac', '1', '-ar', '16000', raw],
                       capture_output=True)
    if r.returncode:
        return None
    data = open(raw, 'rb').read()
    n = len(data) // 2
    if n == 0:
        return (0.0, 0, [])
    s = struct.unpack('<%dh' % n, data[:n * 2])
    dur = n / 16000.0
    peak = max(abs(x) for x in s)
    # 按 10ms 窗算 RMS，再按阈值找有声段
    win = 160
    thr = max(peak * 0.12, 120)
    voiced = []
    cur = None
    for i in range(0, n - win, win):
        seg = s[i:i + win]
        rms = (sum(x * x for x in seg) / len(seg)) ** 0.5
        on = rms > thr
        if on and cur is None:
            cur = i
        elif not on and cur is not None:
            if (i - cur) >= 3:      # 至少 30ms 才算一段
                voiced.append((cur / 16000.0, i / 16000.0))
            cur = None
    if cur is not None:
        voiced.append((cur / 16000.0, n / 16000.0))
    return (dur, peak, voiced)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('ids', nargs='*', default=['letter_01'])
    args = ap.parse_args()

    cfg = G.load_config()
    texts = G.read_texts()

    print('字母写法试探（目标：找到能念出**短 a** 的写法）')
    print('  判据：① 有声 ② 双写法必须给出两个等长段 ③ 时长应短于长音版')
    print('')

    for vid in args.ids:
        bare = texts.get(vid)
        if not bare:
            print('  ✗ %s 不在文本表里' % vid)
            continue
        cur = vid in G.KNOWN_BLOCKED
        print('【%s】目标读音 = 裸字形 %s' % (vid, bare))
        if cur:
            print('   （该条在 KNOWN_BLOCKED 里，历史上两种写法都发不出声）')
        for text, label in variants(bare):
            out = os.path.join(TMP, '_try.wav')
            try:
                wav = G.synthesize(cfg, text)
            except Exception as e:
                print('   %-22s %-28s 异常：%s' % (text, label, str(e)[:40]))
                continue
            if not wav:
                print('   %-22s %-28s ✗ 无音频（0 字节）' % (text, label))
                continue
            open(out, 'wb').write(wav)
            seg = segments(out)
            if not seg:
                print('   %-22s %-28s ✗ 解码失败' % (text, label))
                continue
            dur, peak, voiced = seg
            mark = '✓' if (dur >= 0.25 and peak > 400) else '✗'
            extra = ''
            if len(voiced) >= 2:
                lens = [round(b - a, 3) for a, b in voiced]
                if max(lens) - min(lens) < 0.06:
                    extra = '  → **两个等长段 %s，第一段可安全裁出**' % lens
                else:
                    extra = '  → %d 段 %s（不等长，需人工判断）' % (len(voiced), lens)
            elif len(voiced) == 1:
                extra = '  → 单段 %.2fs' % (voiced[0][1] - voiced[0][0])
            print('   %-22s %-28s %s %.2fs 峰值%d%s' % (text, label, mark, dur, peak, extra))
        print('')


if __name__ == '__main__':
    main()
