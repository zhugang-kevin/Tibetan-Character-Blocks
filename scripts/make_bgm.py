# -*- coding: utf-8 -*-
"""scripts/make_bgm.py — 生成游戏背景音乐（程序合成，零版权可商用）

产出：
  audio/bgm.wav   背景音乐 —— 藏式五声音阶（D 宫系统）拨弦 + 低音 + 铺底，
                  两小节无缝循环，供游戏页低音量循环播放（PRD 3.3）。

为什么程序合成：与 tap/match/mismatch/win、drum/horn/cheer 同一条路线 ——
免费可商用、无侵权风险、无外部依赖、可用脚本复现。
体验版（preview/template.html）用 Web Audio 按**同一份音符表**复现，
两端旋律一致；WAV 只在小程序包内。

规格（与既有音效一致）：单声道 / 22050Hz / 16-bit PCM。
响度口径：BGM 必须明显低于音效 —— 目标 RMS ≈ 1100（match.wav 是 2394），
峰值压在 12000 以下；播放时小程序端再把音量乘 0.35，留足余量不吵人。

**无缝循环**：所有音符的衰减尾巴超过循环末尾时**回绕写入开头**（wrap-around），
而不是截断 —— 否则每次循环点会有一个可听见的「咔」。

体积预算：2.8s × 22050 × 2B ≈ 121KB（validate §34 上限 150KB，主包 2MB 硬约束）。

用法：python scripts/make_bgm.py
"""
import array
import math
import os
import wave

RATE = 22050
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'audio')

# ---- 乐曲规格（体验版 template.html 的 BGM_* 常量与此逐字对应，改一处必须改两处） ----
LOOP_LEN = 2.8      # 循环长度（秒）：2 小节 4/4，每拍 0.35s ≈ 143 BPM
BEAT = 0.35         # 一拍
EIGHTH = BEAT / 2   # 八分音符

# D 宫五声音阶用到的音（Hz）
D3, A2 = 146.83, 110.00
D4, E4, Fs4, A4, B4, D5 = 293.66, 329.63, 369.99, 440.00, 493.88, 587.33
A5, D6 = 880.00, 1174.66

# 旋律：两个小节各 8 个八分音符（D 宫五声，落音回主音，循环点自然咬合）
MELODY = [D4, Fs4, A4, D5, B4, A4, Fs4, A4,
          E4, Fs4, A4, B4, A4, Fs4, E4, D4]
# 每个八分音符的力度：强拍起、弱拍落，第二小节略收（避免机械等响）
MELODY_AMP = [0.30, 0.18, 0.24, 0.20, 0.26, 0.18, 0.22, 0.18,
              0.28, 0.18, 0.24, 0.20, 0.26, 0.18, 0.22, 0.18]
# 拨弦衰减时间常数（秒）
PLUCK_TAU = 0.12
PLUCK_DUR = 0.34


def new_buf():
    return [0.0] * int(RATE * LOOP_LEN)


def add_pluck(buf, start, freq, amp, tau=PLUCK_TAU, dur=PLUCK_DUR):
    """拨弦音：快起音 + 指数衰减，基音 + 4 个递减谐波。
    衰减尾巴越过循环末尾时回绕写入开头（无缝循环的关键）。"""
    i0 = int(round(start * RATE))
    n = int(dur * RATE)
    total = len(buf)
    partials = [(1, 1.00), (2, 0.34), (3, 0.16), (4, 0.09)]
    for k in range(n):
        t = k / RATE
        env = amp * math.exp(-t / tau)
        if t < 0.004:
            env *= t / 0.004          # 4ms 起音，去掉「哒」的爆点
        v = 0.0
        for mult, pa in partials:
            v += pa * math.sin(2 * math.pi * freq * mult * t)
        i = (i0 + k) % total          # ← 回绕
        buf[i] += env * v


def add_pad(buf, start, dur, freq, amp, attack):
    """铺底长音：慢起音、慢释放（正弦窗），同样是单音不带谐波（不抢旋律）。"""
    i0 = int(round(start * RATE))
    n = int(dur * RATE)
    total = len(buf)
    for k in range(n):
        t = k / RATE
        env = amp * math.sin(math.pi * min(1.0, t / dur))  # 半正弦窗：首尾都为零
        if attack > 0 and t < attack:
            env *= (t / attack)
        i = (i0 + k) % total
        buf[i] += env * math.sin(2 * math.pi * freq * t)


def normalize_rms(buf, target_rms, peak_limit):
    """按 RMS 对齐响度；峰值超限则整体回退（宁可略轻也不削波）。"""
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
    print('  %-10s %5.2fs  RMS=%6.1f  峰值=%6d  %d bytes'
          % (name, len(data) / RATE, rms, max(abs(v) for v in data),
             os.path.getsize(path)))
    # 循环连续性：首尾**采样值**应接近（|x[0]-x[-1]| ≪ 峰值）——
    # 否则循环点会有一个可听见的「咔」。注意别用首尾窗口的 RMS 比较：
    # 音符从循环点起音属正常音乐结构，那会让能量差看似很大。
    jump = abs(data[0] - data[-1])
    print('    循环点采样跳变：%d（峰值 %d，应 ≪ 峰值）' % (jump, max(abs(v) for v in data)))


def make_bgm():
    buf = new_buf()
    # 铺底：主音 + 纯五度，两小节一条（首尾为零，天然无缝）
    add_pad(buf, 0.0, LOOP_LEN, D4, 0.055, 0.5)
    add_pad(buf, 0.0, LOOP_LEN, A4, 0.038, 0.7)
    # 低音：第 1 小节主音 D3；第 2 小节先 A2（属）再回 D3，循环回主音
    add_pluck(buf, 0.000, D3, 0.30, tau=0.20, dur=1.20)
    add_pluck(buf, 1.400, A2, 0.26, tau=0.18, dur=0.60)
    add_pluck(buf, 2.100, D3, 0.24, tau=0.18, dur=0.60)
    # 旋律：16 个八分音符
    for k, (freq, amp) in enumerate(zip(MELODY, MELODY_AMP)):
        add_pluck(buf, k * EIGHTH, freq, amp)
    # 点缀：每小节首拍一颗很轻的高八度钟音（像远处的铃）
    add_pluck(buf, 0.000, D6, 0.06, tau=0.30, dur=1.10)
    add_pluck(buf, 1.400, A5, 0.05, tau=0.30, dur=1.10)
    return normalize_rms(buf, 1100.0, 12000.0)


if __name__ == '__main__':
    print('生成背景音乐 → audio/')
    write_wav('bgm.wav', make_bgm())
    print('完成（规格：单声道 / 22050Hz / 16-bit PCM / 两小节无缝循环）')
