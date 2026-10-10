# -*- coding: utf-8 -*-
"""scripts/synth_letters_by_frame.py — 用「框架 + 裁切」合成孤立字母（D69）

背景（用户 2026-10-10 质疑，实测证实是对的）：
    「藏文 TTS 其实很成熟了……怎么到你这边就什么都不可行了？」
    实测（`.workbuddy/tmp/probe_input_hypothesis.py`）：
        · 连续句子 4.87s / 11 个音节  —— **完好**
        · 书籍式长句 4.06s / 13 个音节 —— **完好**
        · 孤立字母 ཀ —— 0.03s、峰值 14（静音桩）
        · **ཀ་ཀ་ཀ —— 0.75s、3 个音节、峰值 6098 —— 完好**
    结论：**引擎没问题，是我的输入方式有问题。**
    TTS 是按连续语流训练的；喂它一个裸辅音 = 分布外输入。
    中文 TTS 喂一个单独声母「b」同样发不出来，这与语言无关。

    由此还推翻了 D67 的一条结论：当时三条探针「全挂」，其实**测的是我自己的输入错误**
    （P2 比较的是两个静音桩；P3 的短式本身是静音桩）。**探针没有校准，就会给出很正式的错误结论。**

做法：把目标音节放进一个自然的重复框架里合成，再按**有声段**切出中间那个：
        ཀ  →  合成「ཀ་ཀ་ཀ」→ 取中段 → 输出单音节 ཀ
    为什么取中段：首尾段会带句首起音与句尾收尾（更短、更弱），中段最饱满稳定。

用法：
    python scripts/synth_letters_by_frame.py --dry-run     # 看会合成哪些
    python scripts/synth_letters_by_frame.py --all         # 全 30 字母，写入 audio/voice/
    python scripts/synth_letters_by_frame.py --only ཀ ཏ     # 指定字母
"""
import argparse
import array
import io
import math
import os
import sys
import wave

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'scripts'))

REPEAT = 3          # 框架重复次数
WIN_MS = 10
THR = 0.15


def load_wav(b):
    w = wave.open(io.BytesIO(b))
    a = array.array('h')
    a.frombytes(w.readframes(w.getnframes()))
    return a, w.getframerate()


def voiced_runs(a, sr, thr=THR):
    """返回 [(start_sample, end_sample), ...]，按 RMS 找有声段。"""
    win = max(1, int(sr * WIN_MS / 1000.0))
    rms = []
    for i in range(0, len(a) - win, win):
        seg = a[i:i + win]
        rms.append(math.sqrt(sum(float(v) * v for v in seg) / len(seg)))
    if not rms:
        return []
    t = max(rms) * thr
    out, cur = [], None
    for i, v in enumerate(rms):
        if v >= t:
            cur = [i, i] if cur is None else [cur[0], i]
        else:
            if cur and (cur[1] - cur[0]) * WIN_MS >= 30:
                out.append((cur[0] * win, (cur[1] + 1) * win))
            cur = None
    if cur and (cur[1] - cur[0]) * WIN_MS >= 30:
        out.append((cur[0] * win, (cur[1] + 1) * win))
    return out


# 框架回退链：先用 tsheg 重复，切不开就换 shad 分隔再试。
# 为什么需要（实测）：鼻音 མ 与边音 ལ 会被引擎连成一片，tsheg 框架只得到 1 段；
# 改用 **shad + 空格**（X། X། X།）后能切出 3 段（ལ 实测 [0.16, 0.18, 0.19]）。
# 这不是"再试一次"，而是**换一种让引擎自然分句的标点**——shad 是藏文的句号，
# 引擎见到句号会更明确地断开。
FRAMES = [
    (u'{c}་{c}་{c}', 0.15),
    (u'{c}། {c}། {c}།', 0.30),
    (u'{c}། {c}། {c}། {c}།', 0.30),
]


def extract_middle(b, thr=THR):
    """从重复框架里切出中间那段。返回 (wav_bytes, 说明)。"""
    a, sr = load_wav(b)
    runs = voiced_runs(a, sr, thr)
    # ⚠️ 必须**至少 3 段**才能确定"中间那一段"。
    #    早先允许 2 段，于是 མ 切出「第 1/2 段 0.44s」—— 而单个 མ 不该有 0.44s，
    #    那多半是**两个音节连在一起**（切错了却看着像成功，是最危险的一种"成功"）。
    #    宁可让它落到下一个框架重试，也不要交出一个长度不对的样本。
    if len(runs) < 3:
        return None, '只找到 %d 段（<3 段无法确定中段，换框架重试）' % len(runs)
    # 取中段：首尾会带句首起音/句尾收尾，中段最饱满稳定
    i = (len(runs) - 1) // 2
    s, e = runs[i]
    # 前后各留 30ms 余量，避免把起音切掉
    pad = int(sr * 0.03)
    s = max(0, s - pad)
    e = min(len(a), e + pad)
    seg = a[s:e]
    out = io.BytesIO()
    w = wave.open(out, 'wb')
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(sr)
    w.writeframes(seg.tobytes())
    w.close()
    return out.getvalue(), '切出第 %d/%d 段 %.2fs' % (i + 1, len(runs), len(seg) / float(sr))


def main():
    ap = argparse.ArgumentParser(description='框架+裁切 合成孤立藏文字母（D69）')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--all', action='store_true')
    ap.add_argument('--only', nargs='*')
    ap.add_argument('--sleep', type=float, default=6.0)
    args = ap.parse_args()

    import gen_voice as G
    cfg = G.load_config()

    # ⚠️ 这里踩过一个把整个评估都带偏的坑：`voices.js` 的 ids 是 **`letter_01` 这种
    #    id 字符串，不是藏文字符**。我一度以为「id 即藏文」，于是把 "letter_01"
    #    这串拉丁字母喂给了藏文 TTS —— 产出的自然是垃圾，而我把它记成了「引擎不行」。
    #    真正的藏文在 data/elements.js 的 `.tibetan` 字段。**先看清楚数据结构再喂数据。**
    import json as _json
    import subprocess
    r = subprocess.run(['node', '-e',
        "const e=require('./data/elements.js');"
        "console.log(JSON.stringify(Object.keys(e)"
        ".filter(k=>k.indexOf('letter_')===0)"
        ".map(k=>({id:k,tibetan:e[k].tibetan}))))"],
        cwd=ROOT, capture_output=True, text=True)
    pairs = _json.loads(r.stdout.strip() or '[]')

    # 只关心单字符（孤立字母）；多字符的本来就属于连续输入，不需要框架
    if args.all:
        letters = [(p['id'], p['tibetan']) for p in pairs if len(p['tibetan']) == 1]
    else:
        want = set(args.only or [])
        letters = [(p['id'], p['tibetan']) for p in pairs if p['tibetan'] in want]
    if not letters:
        ap.error('用 --all 或 --only <字母...>')

    if args.dry_run:
        print('将用「%s」框架合成 %d 个字母：%s'
              % ('་'.join(['X'] * REPEAT), len(letters),
                 ' '.join(ch for _, ch in letters)))
        return 0

    import time
    # ⚠️ 输出到 **assets-src/voice-candidates/**（暂存区），不能写进 audio/voice/：
    #    后者是「已入库音频」的目录，会被 §38（无 WAV 残留）与 §47（清单零漂移）
    #    当成正式资产 —— 把候选产物放进去会立刻把门禁弄红，而且它们是**未经试听**的。
    #    候选与入库必须物理分开：入库要有人的试听结论，不能靠脚本自己搬。
    outdir = os.path.join(ROOT, 'assets-src', 'voice-candidates')
    if not os.path.isdir(outdir):
        os.makedirs(outdir)
    ok, bad = 0, []
    for vid, ch in letters:
        seg, note, used = None, '', ''
        for tmpl, thr in FRAMES:
            frame = tmpl.format(c=ch)
            try:
                wav = G.synthesize(cfg, frame)
            except Exception as e:
                note = str(e)[:40]
                continue
            seg, note = extract_middle(wav, thr)
            used = frame
            if seg is not None:
                break
            time.sleep(2)
        if True:
            if seg is None:
                bad.append((vid, note))
                print('  ✗ %-10s %s' % (vid, note))
            else:
                a, sr = load_wav(seg)
                pk = max(max(a), -min(a))
                dur = len(a) / float(sr)
                # 长度护栏：单音节藏文字母正常 0.10~0.40s；>0.40s 疑似连读、是"沉默的错误"
                if dur > 0.40:
                    bad.append((vid, '裁切 %.2fs 疑似连读（单音节应 ≤0.40s）' % dur))
                    print('  ✗ %-10s 裁切 %.2fs 疑似连读，弃用' % (vid, dur))
                    continue
                if dur < 0.10 or pk < 500:
                    bad.append((ch, '裁切结果过短/过轻 %.2fs 峰值 %d' % (dur, pk)))
                    print('  ✗ %s  裁切结果不可用 %.2fs 峰值 %d' % (ch, dur, pk))
                else:
                    # 命名沿用现有约定（由调用方决定 id → 文件名映射）
                    path = os.path.join(outdir, '_frame_%s.wav' % vid)
                    open(path, 'wb').write(seg)
                    ok += 1
                    print('  ✓ %-10s %-16s %s（%.2fs 峰值 %d）' % (vid, used, note, dur, pk))
        time.sleep(args.sleep)

    print('\n成功 %d / 失败 %d' % (ok, len(bad)))
    if bad:
        print('失败清单：%s' % '、'.join('%s(%s)' % (a, b) for a, b in bad))
    print('输出目录：assets-src/voice-candidates/（**候选产物**，需人工试听后改名入库）')
    return 0


if __name__ == '__main__':
    sys.exit(main())
