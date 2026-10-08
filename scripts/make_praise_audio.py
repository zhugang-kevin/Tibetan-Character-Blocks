# -*- coding: utf-8 -*-
"""scripts/make_praise_audio.py — 生成「消除情绪激励」新增的 3 条音效（程序合成，零版权可商用）

产出（与既有 4 条同规格：单声道 / 22050Hz / 16-bit PCM）：
  audio/drum.wav   手鼓   等级 2  —— 短促双击，颗粒感
  audio/horn.wav   法号   等级 3  —— 低音长鸣，缓慢起音 + 轻微颤音
  audio/cheer.wav  欢呼   等级 4+ —— 明亮钟簇 + 高频光泽

为什么程序合成：项目既有的 tap/match/mismatch/win 就是程序合成的（免费可商用、无侵权风险、
无外部依赖）。新增音沿用同一条路线，避免引入来路不明的音源。

响度对齐：目标 RMS ≈ 2400（与既有的 match.wav 2394 一致）；欢呼略响（≈2800，对标 win.wav），
因为它是整条阶梯的落点。峰值留足余量（< 26000），避免手机小喇叭削波。

用法：python scripts/make_praise_audio.py
"""
import array
import math
import os
import random
import wave

RATE = 22050
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'audio')


def new_buf(seconds):
    return [0.0] * int(RATE * seconds)


def add_tone(buf, start, dur, freq, amp, tau, shape='exp', freq_end=None,
             attack=0.0, vibrato_hz=0.0, vibrato_depth=0.0):
    """叠加一个带包络的正弦音。

    shape='exp'   指数衰减（打击类）：amp * exp(-t/tau)
    shape='adshr' 起音/保持/释放（吹奏类）：tau 为释放时间常数，attack 为起音时长
    """
    i0 = int(start * RATE)
    n = int(dur * RATE)
    for k in range(n):
        i = i0 + k
        if i >= len(buf):
            break
        t = k / RATE
        f = freq
        if freq_end is not None:
            # 起音 120ms 内从 freq_end 滑到 freq（号角的「吹开」感）
            g = min(1.0, t / 0.12)
            f = freq_end + (freq - freq_end) * (g * g * (3 - 2 * g))
        if vibrato_hz:
            f *= 1.0 + vibrato_depth * math.sin(2 * math.pi * vibrato_hz * t)
        if shape == 'exp':
            env = amp * math.exp(-t / tau)
        else:
            atk = 1.0 if attack <= 0 else min(1.0, t / attack)
            atk = atk * atk * (3 - 2 * atk)
            rel = 1.0 if t < dur - 3 * tau else math.exp(-(t - (dur - 3 * tau)) / tau)
            env = amp * atk * rel
        # 相位用积分近似：频率变化很慢，直接乘即可
        buf[i] += env * math.sin(2 * math.pi * f * t)


def add_noise(buf, start, dur, amp, tau, seed=0):
    """叠加指数衰减的白噪声（打击的瞬态 / 光泽）。"""
    rng = random.Random(seed)
    i0 = int(start * RATE)
    n = int(dur * RATE)
    for k in range(n):
        i = i0 + k
        if i >= len(buf):
            break
        env = amp * math.exp(-(k / RATE) / tau)
        buf[i] += env * (rng.random() * 2 - 1)


def normalize_rms(buf, target_rms, peak_limit=26000.0):
    """按 RMS 对齐响度；若峰值超限则整体回退（宁可略轻也不削波）。"""
    if not buf:
        return buf
    rms = math.sqrt(sum(x * x for x in buf) / len(buf))
    if rms <= 0:
        return buf
    g = target_rms / rms
    peak = max(abs(x) for x in buf) * g
    if peak > peak_limit:
        g *= peak_limit / peak
    return [x * g for x in buf]


def write_wav(name, buf):
    path = os.path.join(OUT_DIR, name)
    data = array.array('h')
    for x in buf:
        v = int(round(x))
        v = -32768 if v < -32768 else (32767 if v > 32767 else v)
        data.append(v)
    w = wave.open(path, 'wb')
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(RATE)
    w.writeframes(data.tobytes())
    w.close()
    rms = math.sqrt(sum(v * v for v in data) / len(data)) if len(data) else 0
    print('  %-12s %5.2fs  RMS=%6.1f  峰值=%6d  %d bytes'
          % (name, len(data) / RATE, rms, max(abs(v) for v in data),
             os.path.getsize(path)))


def make_drum():
    """手鼓：低频闷击 + 噪声瞬态，再补一记较轻的第二次敲击（手鼓的双手节奏感）。"""
    buf = new_buf(0.38)
    # 第一击：130Hz → 72Hz 下滑，指数衰减
    add_tone(buf, 0.000, 0.30, 130.0, 0.85, 0.085, freq_end=72.0)
    add_tone(buf, 0.000, 0.30, 196.0, 0.22, 0.045)
    add_noise(buf, 0.000, 0.06, 0.30, 0.010, seed=11)
    # 第二击（轻）
    add_tone(buf, 0.130, 0.24, 124.0, 0.42, 0.075, freq_end=70.0)
    add_noise(buf, 0.130, 0.04, 0.16, 0.009, seed=12)
    return normalize_rms(buf, 2400.0)


def make_horn():
    """法号：低音长鸣。基音 98Hz + 6 个谐波，缓慢起音，轻微颤音，尾部自然收。"""
    buf = new_buf(0.98)
    dur = 0.90
    partials = [(1, 1.00), (2, 0.55), (3, 0.34), (4, 0.21), (5, 0.13), (6, 0.08)]
    for mult, amp in partials:
        add_tone(buf, 0.0, dur, 98.0 * mult, amp, 0.22, shape='adshr',
                 freq_end=98.0 * mult * 0.955, attack=0.085,
                 vibrato_hz=4.5, vibrato_depth=0.006)
    # 一点气息噪声，随包络走
    add_noise(buf, 0.0, 0.45, 0.020, 0.28, seed=21)
    return normalize_rms(buf, 2400.0)


def make_cheer():
    """欢呼：明亮钟簇（C6/E6/G6/C7，错峰起音）+ 高低两层光泽 + 一层低频厚度。"""
    buf = new_buf(0.90)
    # 低频厚度
    add_tone(buf, 0.0, 0.80, 261.63, 0.26, 0.42)
    # 钟簇：错峰 0 / 12 / 24 / 40 ms
    for start, freq, amp, tau in [(0.000, 1046.50, 0.55, 0.34),
                                  (0.012, 1318.51, 0.45, 0.30),
                                  (0.024, 1567.98, 0.38, 0.27),
                                  (0.040, 2093.00, 0.30, 0.21)]:
        add_tone(buf, start, 0.78, freq, amp, tau)
    # 高频光泽（起音后缓缓铺开）
    add_noise(buf, 0.010, 0.30, 0.10, 0.11, seed=31)
    add_noise(buf, 0.000, 0.05, 0.14, 0.008, seed=32)
    return normalize_rms(buf, 2800.0)


if __name__ == '__main__':
    print('生成情绪激励音效 → audio/')
    write_wav('drum.wav', make_drum())
    write_wav('horn.wav', make_horn())
    write_wav('cheer.wav', make_cheer())
    print('完成（规格：单声道 / 22050Hz / 16-bit PCM，与既有 4 条一致）')
    print('⚠ 下一步：python scripts/compress_sfx.py —— drum/horn/cheer 在包内是 MP3'
          '（D52 体积腾挪），WAV 只是中间产物，不压缩会让主包超 2MB 上限。')
