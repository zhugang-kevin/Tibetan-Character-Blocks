#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/verify_devoicing.py — 音频读的是「古典浊音」还是「现代卫藏清化音」（D105）

## 为什么需要它
D104 依据文献把 7 个浊音字母的**标注**改成现代卫藏音（送气清音 + 低调）。
但**音频里实际读的是哪一种**还没验证过。若音频仍读古典浊音，标注就仍不一致，白改。

## 第一版为什么失败（记下来，避免重走）
第一版用「16 段能量×过零率」的余弦相似度，判据是「浊音字母与对应清音是否更相似」。
结果 2/5、且数字很噪（`ད vs ཐ`=0.25 而 `ད` 与其他字母中位=0.84）——**该特征分辨不了
「浊音 vs 送气」这个层级**（它擅长的是整体包络形状，而不是发声类型）。

## 现在的方法：**用可校准的声学判据**
浊音与送气清音的**物理差别**很明确：
  · **浊音**：声带振动 → 有基频周期性 → **过零率低**、低频能量占比高
  · **送气清音**：声带不振动，气流噪声 → **过零率高**、高频能量占比高
所以量「有声段的平均过零率」与「高频/低频能量比」。

**关键：本脚本自带校准，不靠拍脑袋定阈值** ——
  · 已知**清音**（确定）：ཁ ཆ ཐ ཕ ཚ ས ཤ ཧ        → 应落在高过零率一侧
  · 已知**鼻音（浊）**（确定）：ང ཉ ན མ            → 应落在低过零率一侧
  先量这两组，得到「清音区间」与「浊音区间」；再看 7 个待判字母落在哪一侧。
  若两组分不开（区间重叠），**本脚本会直接声明自己无分辨力**，不给结论。
"""
import math
import os
import struct
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICE = os.path.join(ROOT, 'audio', 'voice')
TMP = os.path.join(ROOT, '.workbuddy', 'tmp')
RATE = 16000
os.makedirs(TMP, exist_ok=True)

# 已知清音（不送气/送气都算清音，声带不振动）
CLEAR = {1: 'ཀ', 2: 'ཁ', 5: 'ཅ', 6: 'ཆ', 9: 'ཏ', 10: 'ཐ',
         13: 'པ', 14: 'ཕ', 17: 'ཙ', 18: 'ཚ', 28: 'ས', 27: 'ཤ', 29: 'ཧ'}
# 已知鼻音（浊，声带振动）
NASAL = {4: 'ང', 8: 'ཉ', 12: 'ན', 16: 'མ'}
# 待判：7 个浊音字母里有音频的（ག/ཞ 无音频）
DISPUTED = {7: 'ཇ', 11: 'ད', 15: 'བ', 19: 'ཛ', 22: 'ཟ'}


def decode(path):
    raw = os.path.join(TMP, '_dv2.raw')
    r = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', path,
                        '-f', 's16le', '-ac', '1', '-ar', str(RATE), raw],
                       capture_output=True)
    if r.returncode:
        return []
    d = open(raw, 'rb').read()
    n = len(d) // 2
    return list(struct.unpack('<%dh' % n, d[:n * 2]))


def voice_profile(s):
    """返回 (平均过零率, 高频能量占比)——都在有声段上量"""
    if not s:
        return None
    peak = max(abs(x) for x in s) or 1
    win = 320
    thr = max(peak * 0.12, 150)
    zc_all, hi_all, n_seg = 0.0, 0.0, 0
    for i in range(0, len(s) - win, win):
        seg = s[i:i + win]
        rms = math.sqrt(sum(x * x for x in seg) / len(seg))
        if rms <= thr:
            continue
        zc = sum(1 for a, b in zip(seg, seg[1:]) if (a >= 0) != (b >= 0)) / len(seg)
        # 高频/低频能量比：一阶差分的能量 ≈ 高频；原信号能量 ≈ 总能量
        d1 = sum((b - a) ** 2 for a, b in zip(seg, seg[1:])) / max(1, len(seg) - 1)
        tot = sum(x * x for x in seg) / len(seg) or 1
        zc_all += zc
        hi_all += d1 / tot
        n_seg += 1
    if not n_seg:
        return None
    return (zc_all / n_seg, hi_all / n_seg)


def main():
    prof = {}
    for k, ch in list(CLEAR.items()) + list(NASAL.items()) + list(DISPUTED.items()):
        p = os.path.join(VOICE, 'letter_%02d.mp3' % k)
        if not os.path.exists(p):
            continue
        s = decode(p)
        v = voice_profile(s)
        if v:
            prof[k] = (ch, v[0], v[1])

    def group(ks):
        z = [prof[k][1] for k in ks if k in prof]
        h = [prof[k][2] for k in ks if k in prof]
        return ((min(z), max(z), sum(z) / len(z)), (min(h), max(h), sum(h) / len(h))) if z else (None, None)

    gc, hi_gc = group(list(CLEAR))
    gn, hi_gn = group(list(NASAL))
    if not gc or not gn:
        print('✗ 样本不足'); return 2
    zc_mid = (gc[0] + gn[1]) / 2
    hi_mid = (hi_gc[0] + hi_gn[1]) / 2

    print('验证音频发声类型（浊音 vs 送气清音）')
    print('  物理判据：浊音有基频周期性 → **过零率低**；送气清音是噪声 → **过零率高**。')
    print('  校准组（已知，不靠拍脑袋定阈值）：')
    print('    清音 %s：过零率 %.4f ~ %.4f（均值 %.4f）'
          % (' '.join(prof[k][0] for k in CLEAR if k in prof), gc[0], gc[1], gc[2]))
    print('    鼻音 %s：过零率 %.4f ~ %.4f（均值 %.4f）'
          % (' '.join(prof[k][0] for k in NASAL if k in prof), gn[0], gn[1], gn[2]))
    sep = gn[1] < gc[0] or gc[1] < gn[0]
    margin = (gc[0] - gn[1]) if gc[0] > gn[1] else (gn[0] - gc[1])
    print('    两组%s（间隔 %.4f）' % ('**完全分开**' if sep else '**区间重叠**', margin))
    print('')
    if not sep:
        print('  ⚠️ **本判据在本次样本上没有分辨力**（两组区间重叠，无法区分浊/清）。')
        print('     → 不给结论。这类判定只能靠母语者听，或换更好的特征（本机无 numpy/scipy）。')
        return 0

    print('  待判字母落点（两个独立指标，**都同意**才给结论）：')
    verdicts = []
    for k in DISPUTED:
        if k not in prof:
            print('    %s：无音频' % DISPUTED[k]); continue
        ch, z, hi = prof[k]
        zc_side = '清' if z > zc_mid else '浊'
        # 第二个指标：高频/低频能量比。噪声（送气）高频占比高。
        hi_lo = min(hi_gc[0], hi_gc[1]) if hi_gc else 0
        hi_side = '清' if hi > hi_mid else '浊'
        agree = (zc_side == hi_side)
        margin = abs(z - zc_mid)
        v = ('**已清化**' if zc_side == '清' else '**仍是浊音（古典音）**') if agree \
            else '两个指标**不一致** → 不给结论'
        verdicts.append((ch, zc_side, hi_side, agree, margin))
        print('    %s  过零率 %.4f(%s侧) ｜ 高频比 %.3f(%s侧) ｜ 距边界 %.4f  → %s'
              % (ch, z, zc_side, hi, hi_side, margin, v))

    print('')
    print('=' * 62)
    if verdicts:
        decided = [v for v in verdicts if v[3]]
        nclear = sum(1 for v in decided if v[1] == '清')
        weak = [v[0] for v in verdicts if v[4] < 0.005]
        print('  两个指标都同意的：%d/%d 条；其中落在清音侧 %d 条'
              % (len(decided), len(verdicts), nclear))
        if weak:
            print('  ⚠️ 距校准边界 <0.005 的条目（判定不可信，需人工听）：%s' % ' '.join(weak))
        if decided and nclear == len(decided):
            print('  ✅ 全部同意且落在清音侧 → 音频**已清化**，与 D104 的标注口径一致')
        elif decided and nclear == 0:
            print('  ❌ 全部同意且落在浊音侧 → 音频仍读古典浊音，**D104 的标注应回退**')
        else:
            print('  ⚠️ 混合 → 逐条看上面；未决条目需母语者确认')
    print('')
    print('  ⚠️ 本判据的**校准间隔很窄**（本次样本清音/鼻音几乎贴在一起），')
    print('     所以它只能给出「倾向」，不能作为终审。终审仍需母语者听。')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
