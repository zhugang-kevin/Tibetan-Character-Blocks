# -*- coding: utf-8 -*-
"""scripts/make_bgm.py — 生成游戏背景音乐（程序合成，零版权可商用）

产出：
  audio/bgm.wav   背景音乐 —— 高原晨雾（D 宫五声，慢速 · 柔起音 · 长衰减），
                  两小节无缝循环，供游戏页低音量循环播放（PRD 3.3）。

⚠️ v2 重设计（2026-10-07，用户反馈「太狂躁、不柔和」）：
  v1 是每秒 5.7 个音的 16 分拨弦 + 4 层亮谐波 + 4ms 硬起音 —— 那是一段「忙碌的
  弹拨曲」，在解谜游戏里确实会顶到人。v2 换成环境音思路，三个转向：
    ① **疏**：一循环 7 个音（≈2 音/秒 → v1 的 1/3），留白多；
    ② **软**：起音 4ms → 90ms（软木槌感），谐波 4 层 → 3 层且第 2 层只有 0.10
       （接近纯正弦），去掉高频钟音（D6/A5 → 只留极轻的 D5 泛光）；
    ③ **长**：衰减 τ 0.12 → 0.75s，让音与音之间连成一片，而不是一颗颗「打点」。
  旋律落音 D4 → D4（循环点回到主音，首尾自然咬合）；低音 D3 → A2 → D3。
  BGM_VOLUME 同步 0.35 → 0.28（两端同值，validate §34 机械核对）。

为什么程序合成：与 tap/match/mismatch/win、drum/horn/cheer 同一条路线 ——
免费可商用、无侵权风险、无外部依赖、可用脚本复现。
体验版（preview/template.html）用 Web Audio 按**同一份音符表**复现，
两端旋律一致；WAV 只在小程序包内。

规格：单声道 / 16000Hz / 16-bit PCM（2026-10-08 起；内容最高约 2.6kHz，无听感损失）。
响度口径：BGM 必须明显低于音效 —— 目标 RMS ≈ 1000（match.wav 是 2394），
峰值压在 11000 以下；播放时小程序端再把音量乘 0.28，留足余量不吵人。

**无缝循环**：所有音符的衰减尾巴超过循环末尾时**回绕写入开头**（wrap-around），
而不是截断 —— 否则每次循环点会有一个可听见的「咔」。

体积预算：3.36s × 16000 × 2B ≈ 105KB（validate §34 上限 150KB，主包 2MB 硬约束）。

用法：python scripts/make_bgm.py
"""
import array
import math
import os
import wave

RATE = 16000   # 2026-10-08：22050→16000（内容最高约 2.6kHz，无听感损失；主包省 ~38KB）
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'audio')

# ---- 乐曲规格（体验版 template.html 的 BGM_* 常量与此逐字对应，改一处必须改两处） ----
LOOP_LEN = 3.36     # 循环长度（秒）：2 小节 4/4，一拍 0.42s。
                    #   注意：这里只借 4/4 的格子定位音符，**不是** 143 BPM 的速度——一循环只放 7 个音，
                    #   实际听感 ≈ 2 音/秒的呼吸感（v1 是 16 个音 / 2.8s ≈ 5.7 音/秒，那才是快）
BEAT = 0.42         # 一拍（格线单位，用于 MELODY_AT 的排版理解）

# D 宫五声音阶用到的音（Hz）—— 只留实际用到的（v2 删掉了 v1 的 E4 / D6）
D3, A2 = 146.83, 110.00
D4, Fs4, A4, B4, D5, A5 = 293.66, 369.99, 440.00, 493.88, 587.33, 880.00

# 旋律：一循环 7 个音（v1 是 16 个），落音回主音，循环点自然咬合
MELODY = [D4, Fs4, A4, B4, A4, Fs4, D4]
# 每个音的起拍位置（秒）—— 疏而不均，听感像呼吸而不是节拍器
MELODY_AT = [0.00, 0.84, 1.26, 1.68, 2.10, 2.52, 2.94]
# 每个音的力度：整体收着，D4 落音略实
MELODY_AMP = [0.22, 0.15, 0.18, 0.14, 0.15, 0.12, 0.16]

# 柔起音 + 长衰减（v2 的「软」与「长」都在这三个常量里）
TONE_ATTACK = 0.09    # 90ms 软起音（v1 是 4ms 硬起音）
TONE_TAU = 0.75       # 指数衰减时间常数（v1 是 0.12）
TONE_DUR = 1.50       # 单音总时长
# 谐波配比：第 2 层只剩 0.10（接近纯正弦），第 3 层 0.03 只留一点木质感（v1 是 4 层到 0.09）
PARTIALS = [(1, 1.00), (2, 0.10), (3, 0.03)]
BASS_PARTIALS = [(1, 1.00), (2, 0.05)]


def new_buf():
    return [0.0] * int(RATE * LOOP_LEN)


def add_tone(buf, start, freq, amp, tau=TONE_TAU, dur=TONE_DUR, attack=TONE_ATTACK, partials=None):
    """柔和音：软起音（余弦斜坡）+ 指数衰减，谐波只留很轻的第 2/3 层。
    衰减尾巴越过循环末尾时回绕写入开头（无缝循环的关键）。"""
    i0 = int(round(start * RATE))
    n = int(dur * RATE)
    total = len(buf)
    parts = partials or PARTIALS
    for k in range(n):
        t = k / RATE
        env = amp * math.exp(-t / tau)
        if attack > 0 and t < attack:
            # 余弦斜坡：起音点斜率平滑，没有「哒」的爆点（线性斜坡仍会有一点棱角）
            env *= 0.5 - 0.5 * math.cos(math.pi * t / attack)
        v = 0.0
        for mult, pa in parts:
            v += pa * math.sin(2 * math.pi * freq * mult * t)
        i = (i0 + k) % total          # ← 回绕
        buf[i] += env * v


def add_pad(buf, start, dur, freq, amp, attack):
    """铺底长音：慢起音、慢释放（正弦窗），单音不带谐波（不抢旋律）。"""
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
    # 铺底：主音 + 纯五度 + 低八度长音，一整圈不断（首尾为零，天然无缝）
    add_pad(buf, 0.0, LOOP_LEN, D4, 0.045, 0.90)
    add_pad(buf, 0.0, LOOP_LEN, A4, 0.032, 1.10)
    add_pad(buf, 0.0, LOOP_LEN, D3, 0.055, 0.70)
    # 低音：第 1 段主音 D3；中段 A2（属）；末段回 D3（循环回主音）
    add_tone(buf, 0.00, D3, 0.18, tau=1.10, dur=2.10, attack=0.06, partials=BASS_PARTIALS)
    add_tone(buf, 1.68, A2, 0.15, tau=0.90, dur=1.40, attack=0.06, partials=BASS_PARTIALS)
    add_tone(buf, 2.52, D3, 0.13, tau=0.90, dur=1.00, attack=0.06, partials=BASS_PARTIALS)
    # 旋律：7 个柔和音（软起音 + 长衰减）
    for at, freq, amp in zip(MELODY_AT, MELODY, MELODY_AMP):
        add_tone(buf, at, freq, amp)
    # 泛光：两颗极轻的高八度（像远处的风铃，只提亮不抢戏）
    add_tone(buf, 0.42, D5, 0.040, tau=1.20, dur=2.20)
    add_tone(buf, 2.10, A5, 0.032, tau=1.20, dur=2.00)
    return normalize_rms(buf, 1000.0, 11000.0)


if __name__ == '__main__':
    print('生成背景音乐 → audio/')
    write_wav('bgm.wav', make_bgm())
    print('完成（规格：单声道 / 16000Hz / 16-bit PCM / 两小节无缝循环）')
