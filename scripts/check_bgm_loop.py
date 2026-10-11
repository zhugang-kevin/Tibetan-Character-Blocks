#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/check_bgm_loop.py — BGM 循环点连续性探针（D83）

## 为什么需要
BGM 从 WAV 换成 MP3（省 78KB 用于内嵌字体）后，**旧门禁的判据失效了**：
旧代码判「首尾采样应接近**静音**」才算无缝 —— **这个判据是错的**。
无缝循环的真实判据是**连续性**：末采样 ≈ 首采样（波形在循环点接得上），
而不是「两端都静音」。一个两端都在 48% 振幅、且末采样 == 首采样的波形，
循环起来是完美的；而被硬截断到静音的波形反而会有「咔」声。

MP3 还多了编码器延迟的问题，所以需要**解码后**再量。

用法：python scripts/check_bgm_loop.py
"""
import os
import struct
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BGM = os.path.join(ROOT, 'audio', 'bgm.mp3')
RAW = os.path.join(ROOT, '.workbuddy', 'tmp', 'bgm_probe.raw')
SR = 24000


def main():
    if not os.path.exists(BGM):
        print('✗ 找不到 %s' % BGM); return 2
    os.makedirs(os.path.dirname(RAW), exist_ok=True)
    r = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', BGM,
                        '-f', 's16le', '-ac', '1', '-ar', str(SR), RAW],
                       capture_output=True)
    if r.returncode != 0 or not os.path.exists(RAW):
        print('✗ 解码失败（需要 ffmpeg）：%s' % r.stderr.decode()[:120]); return 2
    d = open(RAW, 'rb').read()
    n = len(d) // 2
    s = struct.unpack('<%dh' % n, d[:n * 2])
    peak = max(abs(x) for x in s)
    first, last = s[0], s[-1]
    jump = abs(last - first)
    win = int(SR * 0.01)                       # 10ms
    head = max(abs(x) for x in s[:win])
    tail = max(abs(x) for x in s[-win:])
    print('BGM 循环连续性（解码后实测）')
    print('  时长 %.2fs ｜ 峰值 %d' % (n / float(SR), peak))
    print('  首采样 %d ／ 末采样 %d ／ 跳变 %d（%.2f%% 峰值）'
          % (first, last, jump, jump * 100.0 / peak))
    print('  开头 10ms 振幅 %d（%.1f%% 峰值）／ 结尾 10ms %d（%.1f%% 峰值）'
          % (head, head * 100.0 / peak, tail, tail * 100.0 / peak))
    ok = jump < peak * 0.10
    print()
    print('判据：**连续性**（末采样 ≈ 首采样，跳变 < 10% 峰值），不是「两端静音」。')
    print('结论：%s' % ('✓ 循环点连续，接得上（不会「咔」）' if ok
                     else '✗ 循环点跳变偏大，循环处可能可闻爆点'))
    return 0 if ok else 1


if __name__ == '__main__':
    raise SystemExit(main())
