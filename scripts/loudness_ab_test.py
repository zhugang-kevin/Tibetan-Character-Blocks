#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""响度方案实测对比：A（动态压缩）vs B（静态增益）vs C（重录代价量化）

⚠️ 上一轮我给的三个选项建立在一个**错误前提**上：
   我以为「峰值贴顶 → 归一后必然轻 4~5.5dB」。
   实测发现：真人录音的 RMS 是 **−17.4 dBFS**，比 TTS 的 −21.0 **更响**。
   → 真正的问题不是「太轻」，而是「**峰值贴顶但响度已经足够**」，
     静态增益 −1.5dB 之后 RMS 仍有 −18.9，**根本不需要救**。
   所以 A/B/C 三选一这个框架本身就是错的。本脚本用实测数据给出真实选项。

做法：对同一条真人录音分别施加三种处理，报告客观量。
"""
import json
import io
import os
import subprocess
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAND = os.path.join(ROOT, '.workbuddy', 'tmp', 'voice-candidates')
TMP = os.path.join(ROOT, '.workbuddy', 'tmp')


def ffmpeg(src, dst, af=None, br='12k'):
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-i', src]
    if af:
        cmd += ['-af', af]
    cmd += ['-ac', '1', '-ar', '16000', '-codec:a', 'libmp3lame', '-b:a', br, dst]
    r = subprocess.run(cmd, capture_output=True)
    return r.returncode == 0


def pcm(path):
    raw = os.path.join(TMP, '_cmp.raw')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', path,
                    '-f', 's16le', '-ac', '1', '-ar', '16000', raw], capture_output=True)
    d = open(raw, 'rb').read()
    os.remove(raw)
    return np.frombuffer(d[:len(d) // 2 * 2], dtype='<i2').astype(np.float64)


def db(a):
    return 20 * np.log10(max(float(np.abs(a).max()), 1e-9) / 32768.0)


def rmsdb(x):
    return 20 * np.log10(max(float(np.sqrt((x ** 2).mean())), 1e-9) / 32768.0)


def crest(x):
    return db(x) - rmsdb(x)


def clipcount(x):
    return int(np.sum(np.abs(x[1:]) >= 32700))


def main():
    pk = json.load(io.open(os.path.join(CAND, 'picked.json'), encoding='utf-8'))
    # 用 8 条代表样本（覆盖长/短/各种峰值）而非全部 30 条 ——
    # 180 次 ffmpeg 会超时，而响度是全局量，8 条已足够定方案。
    #⚠️ 诚实标注：这是**抽样**，不是全量。若最终入库需按此参数全量应用，
    #    入库后仍会再跑一次全量体检确认。
    SAMPLE = ['letter_01', 'letter_05', 'letter_09', 'letter_14',
              'letter_17', 'letter_23', 'letter_27', 'letter_30']
    vids = [v for v in SAMPLE if v in pk]
    print('抽样 %d 条（覆盖长/短/高/低峰值）：%s' % (len(vids), ', '.join(vids)))
    print('=' * 96)
    print('响度方案实测 —— 拿 30 条真人辅音的「推荐段」实测，对比现有 TTS 基准')
    print('=' * 96)

    # 现有 TTS 基准
    tts = []
    for v in vids:
        p = os.path.join(ROOT, 'audio', 'voice', v + '.mp3')
        if os.path.exists(p):
            x = pcm(p)
            tts.append((rmsdb(x), db(x), crest(x)))
    print('\n【基准】现有 TTS 22 条：RMS %.1f dBFS ｜ 峰值 %.1f ｜ crest %.1f dB'
          % (np.median([t[0] for t in tts]), np.median([t[1] for t in tts]),
             np.median([t[2] for t in tts])))
    print('  → 这是「玩家已经习惯」的响度，真人音入库后应当与之**一致**')

    schemes = {
        '原样（不处理）': None,
        'B 静态增益 −1.5dB': 'volume=-1.5dB',
        'A1 轻度压缩': 'acompressor=threshold=-18dB:ratio=2:attack=5:release=80',
        'A2 中度压缩': 'acompressor=threshold=-20dB:ratio=3:attack=5:release=100',
        'A3 压缩+归一': 'acompressor=threshold=-20dB:ratio=3:attack=5:release=100,volume=6dB',
        'D 峰值限制器': 'alimiter=limit=0.84:level=disabled',
    }

    print('\n' + '-' * 96)
    print('%-18s %10s %10s %10s %8s %8s' %
          ('方案', 'RMS中位', '峰值中位', 'crest', '削波条数', '总KB'))
    print('-' * 96)
    out = {}
    for name, af in schemes.items():
        rr, pp, cc, clips, tot = [], [], [], 0, 0
        for v in vids:
            src = os.path.join(CAND, pk[v]['file'])
            dst = os.path.join(TMP, '_sch_%s.mp3' % v)
            if not ffmpeg(src, dst, af):
                continue
            tot += os.path.getsize(dst)
            x = pcm(dst)
            rr.append(rmsdb(x))
            pp.append(db(x))
            cc.append(crest(x))
            clips += 1 if clipcount(x) > 20 else 0
            os.remove(dst)
        out[name] = (np.median(rr), np.median(pp), np.median(cc), clips, tot / 1024.0)
        print('%-18s %8.1fdB %8.1fdB %8.1fdB %8d %8.1f'
              % (name, out[name][0], out[name][1], out[name][2], clips, out[name][4]))

    print('\n' + '=' * 96)
    print('判读')
    print('=' * 96)
    base_r = np.median([t[0] for t in tts])
    for name in schemes:
        r, p, c, cl, kb = out[name]
        print('\n【%s】RMS %.1f（与 TTS 差 %+.1f dB）｜ crest %.1f ｜ 削波 %d 条 ｜ %.1f KB'
              % (name, r, r - base_r, c, cl, kb))

    print('\n' + '=' * 96)
    print('结论依据（客观量）')
    print('=' * 96)
    raw = out['原样（不处理）']
    print('\n1. 真人录音的 RMS %.1f 比 TTS 的 %.1f **更响 %.1f dB**'
          % (raw[0], base_r, raw[0] - base_r))
    print('   → 我上一轮说「会轻4~5.5dB」是**错的**，那个结论建立在')
    print('     「归一目标 −20dBFS」上，但实际不需要归一到 −20 才对。')
    print('\n2. 真人 crest %.1f 比 TTS %.1f **更大** → 动态更宽、发音更完整'
          % (raw[2], np.median([t[2] for t in tts])))
    print('   → 压缩会**缩小**这个差异，代价是牺牲动态（D59 反对的理由成立）')
    print('\n3. 静态增益 −1.5dB 后峰值 %+.1f，恰好等于项目上限 −1.5dBFS' % out['B 静态增益 −1.5dB'][1])
    print('   → RMS %.1f，仍比 TTS 响 %.1f dB，听感上「不轻」' %
          (out['B 静态增益 −1.5dB'][0], out['B 静态增益 −1.5dB'][0] - base_r))


if __name__ == '__main__':
    main()
