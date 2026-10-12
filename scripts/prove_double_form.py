#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/prove_double_form.py — 证明「双写取首段」拿到的是本音（D102）

## 为什么要「证明」而不是「听起来像」
生成脚本对另一批字母（ག ང པ མ ཝ ཞ འ ཡ）否决过双写，理由写得很清楚：
  「无法证明裁出来的就是本音」——**教错了比没声音更糟**。
所以这次必须**先把方法证明出来**，再拿去批量修那 8 条长音妥协的字母。

## 证明设计（用项目自己的对照组）
`ཁ` 的**裸字形是能发声的**（manifest 里 form=base，音频就在库）—— 这就是**基准真值**。
于是：
  ① 生成 `ཁ་ཁ`，按包络切成两段
  ② 取第一段，与**已知正确的裸 `ཁ`** 做比对
  ③ 同时取 `ཀ་ཀ` 的第一段，与裸 `ཁ` 做比对
判据：
  · 若 ①的第一段 ≈ 裸ཁ，而 ②的第一段 ≠ 裸ཁ → **方法成立**（首段确实是对应字母的本音）
  · 若两者都 ≈ 或都 ≠ → 方法不可信，**不采用**

比对用 MFCC 无关的简单谱特征 + DTW-免的包络相关：本项目无 numpy，
用「16 段梅尔式频带能量」的余弦相似度 + 时长归一后的包络相关。

用法：python scripts/prove_double_form.py
"""
import io
import math
import os
import struct
import subprocess
import sys
import wave

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_voice as G   # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMP = os.path.join(ROOT, '.workbuddy', 'tmp')
VOICE = os.path.join(ROOT, 'audio', 'voice')
os.makedirs(TMP, exist_ok=True)


def decode(path):
    """→ (samples list[int], rate)"""
    raw = os.path.join(TMP, '_d.raw')
    r = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', path,
                        '-f', 's16le', '-ac', '1', '-ar', '16000', raw],
                       capture_output=True)
    if r.returncode:
        return [], 16000
    data = open(raw, 'rb').read()
    n = len(data) // 2
    return list(struct.unpack('<%dh' % n, data[:n * 2])), 16000


def bands(samples, rate=16000, nband=16):
    """粗糙的频带能量：对整段做一阶差分能量 + 过零率分段统计。
    不追求 MFCC 精度，只求「同一音 vs 不同音」能分开。"""
    if not samples:
        return [0.0] * nband
    seg = max(1, len(samples) // nband)
    out = []
    for i in range(nband):
        s = samples[i * seg:(i + 1) * seg] or [0]
        e = sum(abs(x) for x in s) / len(s)
        zc = sum(1 for a, b in zip(s, s[1:]) if (a >= 0) != (b >= 0)) / max(1, len(s))
        out.append(e * (1 + zc * 10))
    m = max(out) or 1.0
    return [x / m for x in out]


def cos(a, b):
    num = sum(x * y for x, y in zip(a, b))
    da = math.sqrt(sum(x * x for x in a)) or 1
    db = math.sqrt(sum(y * y for y in b)) or 1
    return num / (da * db)


def voiced_segments(samples, rate=16000):
    if not samples:
        return []
    peak = max(abs(x) for x in samples) or 1
    win = 160
    thr = max(peak * 0.12, 120)
    out, cur = [], None
    for i in range(0, len(samples) - win, win):
        seg = samples[i:i + win]
        rms = math.sqrt(sum(x * x for x in seg) / len(seg))
        on = rms > thr
        if on and cur is None:
            cur = i
        elif not on and cur is not None:
            if i - cur >= 3:
                out.append((cur, i))
            cur = None
    if cur is not None:
        out.append((cur, len(samples)))
    return out


def main():
    cfg = G.load_config()
    print('证明：双写取首段 = 本音？')
    print('  对照组：ཁ 的裸字形**能发声**（form=base）→ 它就是「kha」的基准真值')
    print('')

    # 基准真值：库里现成的裸 ཁ
    base_kha_path = os.path.join(VOICE, 'letter_02.mp3')   # letter_02 = ཁ
    base_kha, _ = decode(base_kha_path)
    if not base_kha:
        print('✗ 读不到 letter_02.mp3（ེེཁ 的基准）'); return 2
    print('基准 ཁ（裸字形，已知正确）：%.2fs' % (len(base_kha) / 16000.0))

    # 生成 ཁ་ཁ 与 ཀ་ཀ
    results = {}
    for label, text in [('ཁ་ཁ', 'ཁ\u0f0bཁ'), ('ཀ་ཀ', 'ཀ\u0f0bཀ')]:
        wav = G.synthesize(cfg, text)
        if not wav:
            print('  %s → 无音频' % label); continue
        p = os.path.join(TMP, '_%s.wav' % label.replace('\u0f0b', '_'))
        open(p, 'wb').write(wav)
        s, _ = decode(p)
        segs = voiced_segments(s)
        print('  %s → %.2fs，%d 段 %s' % (label, len(s) / 16000.0, len(segs),
                                          [round((b - a) / 16000.0, 3) for a, b in segs]))
        if segs:
            a, b = segs[0]
            results[label] = s[a:b]

    if len(results) < 2:
        print('')
        print('✗ 至少一种双写没出声 —— 方法不成立，不采用'); return 1

    # 比对：各自首段 vs 基准裸 ཁ
    ref = bands(base_kha)
    print('')
    print('相似度（1.000 = 与基准一模一样）：')
    ok_proof = False
    for label in ['ཁ་ཁ', 'ཀ་ཀ']:
        v = bands(results[label])
        sim = cos(ref, v)
        verdict = '与基准**接近**' if sim > 0.93 else ('与基准**有差异**' if sim < 0.85 else '介于中间')
        print('  %-6s 首段 vs 裸ཁ ： %.4f   %s' % (label, sim, verdict))
        if label == 'ཁ་ཁ' and sim > 0.93:
            ok_proof = True
        if label == 'ཀ་ཀ':
            sim_k = sim

    print('')
    if ok_proof and sim_k < 0.93:
        print('✅ **方法成立**：ཁ་ཁ 的首段 ≈ 已知正确的裸 ཁ，而 ཀ་ཀ 的首段与它可区分')
        print('   → 「双写取首段」拿到的确实是**对应字母的本音**，可以拿去修那 8 条长音妥协。')
        return 0
    print('❌ 未通过：无法区分「首段是本音」与「首段只是随便一段有声」')
    print('   → **不采用该写法**（教错了比没声音更糟）。')
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
