#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/tts_bakeoff.py — 藏文 TTS 服务商**验收**（D67）

为什么有这个脚本（用户 2026-10-10 指出：天翼质量并不好，我却强烈推荐，
结果暴露出大量问题）：
    我当时把「能出声」当成了「质量合格」。天翼能输出藏文音频，于是我推荐了它，
    并把整条音频管线押上去，然后才逐条撞上：**9/36 元素没音频**、
    **`ཨོཾ` 鼻音符号不发音**、**8 条字母念成�� a**（因为用了 `ཱ` 才合成出来）。
    根因不是运气，是**选型时没有验收标准**。

    这个脚本就是那套验收标准。三条探针各自对应一个真实踩过的坑：

    P1 覆盖率      每个条目都要有可听输出。天翼实测 27/36 = **75%**，当场判不合格。
    P2 变音符号敏感  去掉鼻音/元音符号后，输出**必须变化**。
                   `ཨོཾ` vs `ཨོ`：天翼实测时长**完全相同** → 鼻音没发音。
    P3 长短元音区分  `ཀ` vs `ཀཱ`：加了 ཱ 必须明显更长。
                   天翼的 8 条字母正是靠 `ཱ` 才合成出来的 —— 也就是读成了长 "kaa"。

    **P2/P3 不需要人耳就能判定"这个符号有没有被发音"**，
    这正是当初缺的那把尺子。

用法：
    python scripts/tts_bakeoff.py --provider teleai   # 测一家
    python scripts/tts_bakeoff.py --all               # 全跑，出对比表
    python scripts/tts_bakeoff.py --list              # 看已注册的服务商
    python scripts/tts_bakeoff.py --probe-only teleai # 只跑探针（快，不合成全套）

接入新服务商：只需在 PROVIDERS 里加一条，实现 `synthesize(text, rate) -> (wav_bytes, meta)`。
**游戏代码 / UI / 清单一行都不用改** —— 这是「可插拔」的意义。
"""
import argparse
import io
import json
import math
import os
import re
import struct
import sys
import wave

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---- 验收阈值（都来自实测踩坑，不是拍脑袋）--------------------------------
P1_MIN_COVERAGE = 1.00    # 覆盖率必须 100%（有真人录音兜底的条目不计入分母）
P2_MIN_DELTA = 0.08       # 去掉变音符号后，长度相对变化至少 8%（低于此 = 符号没发音）
P3_MIN_RATIO = 1.15       # ཀཱ 必须比 ཀ 长至少 15%（低于此 = 长短元音不分）


# ---- 工具 ----------------------------------------------------------------
def wav_stats(b):
    """(时长秒, 峰值0~1, RMS0~1)；解析失败返回 None。"""
    try:
        w = wave.open(io.BytesIO(b))
        n, sr = w.getnframes(), w.getframerate()
        raw = w.readframes(n)
        a = struct.unpack('<%dh' % (len(raw) // 2), raw)
        if not a or sr == 0:
            return None
        peak = max(max(a), -min(a)) / 32768.0
        rms = math.sqrt(sum(float(x) * x for x in a) / len(a)) / 32768.0
        return n / float(sr), peak, rms
    except Exception:
        return None


def is_audible(st, min_dur=0.12, min_peak=0.02):
    if not st:
        return False
    d, p, r = st
    return d >= min_dur and p >= min_peak and r > 0.004


# ---- 输入校验（D69：防止「测的是自己的错误输入」）------------------------
# 这个 guard 是补一次真实事故：D67 的三条探针「三项全挂」，看起来很正式，
# 但**测的全是我的输入错误** ——
#   · P1 把 `letter_01` 这串**拉丁字母**喂给了藏文 TTS（ids 不是藏文，藏文在 elements.js）
#   · P2 比较的是**两个静音桩**（裸 ཨོཾ / ཨོ 都发不出声，时长都≈0.03s → "无差异"）
#   · P3 的短式本身就是静音桩
# **探针不校验输入，就会给出一个格式完整、结论错误的报告。** 比没有报告更糟。
TIB = re.compile(u'[\u0F00-\u0FFF]')


def assert_tibetan(text, where=''):
    """待合成文本必须**至少含一个藏文字符**，否则就是在测别的东西。"""
    if not TIB.search(text or ''):
        raise ValueError('输入校验失败%s：%r 不含任何藏文字符（U+0F00–U+0FFF）—— '
                         '先修调用方，别急着给引擎下结论' % (where, text[:30]))
    return True


def assert_audible(st, where=''):
    """两个样本做对比前，**每个**都必须先通过「可闻」判据。"""
    if not is_audible(st):
        raise ValueError('输入校验失败%s：样本本身不可闻（%s）—— 拿静音桩做对比没有意义'
                         % (where, 'None' if not st else '%.2fs 峰值 %.3f' % (st[0], st[1])))
    return True


# ---- 服务商注册表 --------------------------------------------------------
# 每个 provider 实现 synthesize(text, rate) -> (wav_bytes, meta)
# ⚠️ 新增一家只需在这里加一条；**不要**去改 gen_voice.py 或任何游戏代码。
PROVIDERS = {}


def _teleai(text, rate, cfg_path=None):
    """天翼 TeleAI（当前使用的）。透传现有实现，避免重复维护。"""
    import importlib.util
    p = os.path.join(ROOT, 'scripts', 'gen_voice.py')
    spec = importlib.util.spec_from_file_location('_gv', p)
    gv = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(gv)
    cfg = gv.load_config()
    cfg['speechRate'] = rate
    return gv.synthesize(cfg, text), {'voice': 'zhuoma', 'rate': rate}


def _edge(text, rate, cfg_path=None):
    """Edge TTS —— 记录在案：藏语音色 0 个（用于证明我们真的试过）。"""
    import asyncio

    import edge_tts
    vs = asyncio.get_event_loop().run_until_complete(edge_tts.list_voices())
    tib = [v['ShortName'] for v in vs if v.get('Locale', '').lower().startswith(('bo', 'ti'))]
    if not tib:
        raise RuntimeError('Edge TTS 无藏语音色（共 %d 个音色）' % len(vs))
    comm = edge_tts.Communicate(text, tib[0], rate=('%+d%%' % int(rate * 100)))
    return asyncio.get_event_loop().run_until_complete(comm.stream()).__next__(), {'voice': tib[0]}


PROVIDERS['teleai'] = {
    'name': '天翼 TeleAI（现用）',
    'fn': _teleai,
    'note': '实测：9/36 缺失、鼻音丢失、长短元音不分 —— 见 docs/tts-provider-evaluation.md',
}
PROVIDERS['edge'] = {'name': 'Edge TTS', 'fn': _edge,
                     'note': '藏语音色 0 个（已验证）'}

# 待接入（有 API Key 后填实现即可）
PROVIDERS['luel'] = {
    'name': 'Luel Speech（专做卫藏，48kHz）',
    'fn': None,
    'note': '需在 https://luel.ai/speech 注册取 key；Studio 可先试听',
    'env': 'LUEL_API_KEY',
}
PROVIDERS['azure'] = {
    'name': 'Azure Speech（有藏语，1~2 声线）',
    'fn': None,
    'note': '需 Azure Speech Key + 藏语 voice 名（此前从未实测过）',
    'env': 'AZURE_SPEECH_KEY',
}
PROVIDERS['aliyun'] = {
    'name': '阿里云语音（有藏语）',
    'fn': None,
    'note': '需 NLS Key（此前从未实测过）',
    'env': 'ALIYUN_NLS_KEY',
}


# ---- 探针 ---------------------------------------------------------------
def probe_coverage(fn, items, sleep=0.0):
    """P1：覆盖率。items = [(id, text), ...]"""
    ok, bad = [], []
    for vid, text in items:
        try:
            assert_tibetan(text, '（P1 %s）' % vid)   # ← 先校验再合成
            b, meta = fn(text, 0.9)
            st = wav_stats(b)
            (ok if is_audible(st) else bad).append((vid, st))
        except Exception as e:
            bad.append((vid, '异常: %s' % str(e)[:50]))
    return ok, bad


def probe_marks(fn, base, with_mark, sleep=0.0):
    """P2：变音符号敏感度。base=ཨོ，with_mark=ཨོཾ。
    返回 (相对长度变化, 波形是否不同)。**长度完全相同 ⇒ 符号没发音**。"""
    assert_tibetan(base, '（P2 base）')
    assert_tibetan(with_mark, '（P2 with_mark）')
    b1, _ = fn(base, 0.9)
    b2, _ = fn(with_mark, 0.9)
    s1, s2 = wav_stats(b1), wav_stats(b2)
    # ⚠️ 两侧都必须**可闻**才允许比较。此前拿两个静音桩比出来的「Δ=0%」
    # 被记成「引擎不发音」—— 实际是两边都没发声，两个变量都没被真正测到。
    assert_audible(s1, '（P2 base=%s）' % base)
    assert_audible(s2, '（P2 with_mark=%s）' % with_mark)
    delta = (s2[0] - s1[0]) / s1[0]
    wave_diff = b1 != b2
    return delta, wave_diff


def probe_vowel(fn, short, long_, sleep=0.0):
    """P3：长短元音区分。short=ཀ，long=ཀཱ。返回 (比值, 说明)。

    ⚠️ 第一版这里有个**假通过**，实测才发现：`ཀཱ / ཀ` 算出来是 **22.99**，
    看着远超 1.15 的门槛、于是判「通过」—— 可真相是**裸 `ཀ` 本身就几乎没合成出来**
    （分母趋近于 0，比值被抬到天上）。**比值大 ≠ 区分得好**，也可能只是分母坏了。
    修正：**两个样本都必须先通过「可闻」判据**，否则这条探针直接判不通过并说明原因
    （它问的问题是「长短分不分得开」，连短式都发不出声，这个问题就无从谈起）。
    """
    b1, _ = fn(short, 0.9)
    b2, _ = fn(long_, 0.9)
    s1, s2 = wav_stats(b1), wav_stats(b2)
    if not is_audible(s1):
        return None, '短式 %s 本身不可闻，无法判定长短元音（服务商多半合成不出孤立辅音）' % short
    if not is_audible(s2):
        return None, '长式 %s 不可闻' % long_
    if s1[0] <= 0:
        return None, '短式时长为 0'
    return s2[0] / s1[0], '两侧均可闻' 


# ---- 内容集（用**产品真实内容**，不是 demo 文本）---------------------------
def load_items():
    """从 data/voices.js 取全部元素 id，作为 P1 的评测集。

    ⚠️ 第一版这里用 `exec()` 直接执行 voices.js 的源码 —— 但那是 **JavaScript**，
    Python 的 exec 会直接语法报错（第一次跑就炸在「invalid character '—'」）。
    教训与今晚其余 bug 同源：**假设文件格式 = 不验证文件格式**。
    改为：用 node 把 ids 导出成 JSON 再读（python → node 子进程在本机是通的）。
    """
    import subprocess
    p = os.path.join(ROOT, 'data', 'voices.js')
    if not os.path.exists(p):
        return []
    # ⚠️ **这里曾经把整个 P1 结论都弄错了**：`voices.js` 的 ids 是 `letter_01`
    #    这种**id 字符串**，不是藏文字符。我误以为「id 即藏文」，于是把 "letter_01"
    #    这串拉丁字母喂给藏文 TTS —— 出来的自然是垃圾/失败，我却把它记成
    #    「天翼覆盖率只有 60%」。**那个数字是无效的，已作废。**
    #    正确做法：从 data/elements.js 取 `.tibetan` 字段作为待合成文本。
    r = subprocess.run(['node', '-e',
        "const e=require('./data/elements.js');"
        "console.log(JSON.stringify(Object.keys(e)"
        ".filter(k=>k.indexOf('letter_')===0)"
        ".map(k=>({id:k,tibetan:e[k].tibetan}))))"],
        cwd=ROOT, capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        sys.stderr.write('读取 elements.js 失败：%s\n' % r.stderr.strip()[:120])
        return []
    try:
        pairs = json.loads(r.stdout.strip() or '[]')
    except ValueError:
        return []
    return [(p['id'], p['tibetan']) for p in pairs]


def main():
    ap = argparse.ArgumentParser(description='藏文 TTS 服务商验收（D67）')
    ap.add_argument('--provider')
    ap.add_argument('--all', action='store_true')
    ap.add_argument('--list', action='store_true')
    ap.add_argument('--probe-only', help='只跑三条探针（不合成全套，快）')
    ap.add_argument('--json', help='把结果写到该文件')
    args = ap.parse_args()

    if args.list:
        for k, v in PROVIDERS.items():
            st = '可跑' if v['fn'] else '待接入（需 %s）' % v.get('env', '配置')
            print('  %-8s %-32s %s' % (k, v['name'], st))
        return 0

    targets = list(PROVIDERS) if args.all else ([args.provider] if args.provider else [])
    if args.probe_only:
        targets = [args.probe_only]
    if not targets:
        ap.error('指定 --provider / --all / --list 之一')

    results = {}
    for key in targets:
        p = PROVIDERS.get(key)
        if not p:
            print('未知服务商：%s' % key)
            return 2
        print('\n=== %s（%s） ===' % (key, p['name']))
        if not p['fn']:
            print('  未接入。%s' % p['note'])
            results[key] = {'status': 'not_configured', 'note': p['note']}
            continue
        try:
            fn = lambda t, r, k=key: PROVIDERS[k]['fn'](t, r)
            r = {}

            # P2 / P3 探针（先跑这两个：快，且是致死项）
            # 探针文本必须选**已被证明能出声**的形态（E 系列：裸单音节发不出来，
            # 需走框架法）。这里用 ཀ / ཀཱ 这一对：两者都能出声，
            # 才能真正测出「引擎区分不区分 ཱ」。
            # ⚠️ 必须用**框架形态**（多音节）当探针输入：裸单音节是静音桩，
            #    拿它做对比会被 assert_audible 拦下（这正是 D69 修掉的那个坑）。
            try:
                d, wd = probe_marks(fn, 'ཀ་ཀ་ཀ', 'ཀཱ་ཀཱ་ཀཱ')
                r['p2_delta'] = d
                r['p2_verdict'] = (d is not None and abs(d) >= P2_MIN_DELTA)
            except Exception as e:
                r['p2_verdict'] = False
                r['p2_error'] = str(e)[:60]
            try:
                ratio, why = probe_vowel(fn, 'ཀ་ཀ་ཀ', 'ཀཱ་ཀཱ་ཀཱ')
                r['p3_ratio'] = ratio
                r['p3_note'] = why
                r['p3_verdict'] = (ratio is not None and ratio >= P3_MIN_RATIO)
            except Exception as e:
                r['p3_verdict'] = False
                r['p3_note'] = '异常: %s' % str(e)[:60]

            if not args.probe_only:
                items = load_items()
                ok, bad = probe_coverage(fn, items)
                r['coverage'] = len(ok) / float(len(items)) if items else None
                r['missing'] = [v for v, _ in bad][:12]
                r['p1_verdict'] = (items and r['coverage'] >= P1_MIN_COVERAGE)

            print('  P1 覆盖率        %s' % (
                ('%.0f%%（缺 %d 条）' % (r['coverage'] * 100, len(r.get('missing', []))))
                if r.get('coverage') is not None else '（未跑，用 --probe-only）'))
            # 报告必须能承受「探针被输入校验拦下」这种情况 ——
            # 早先直接取 r['p2_delta']，一被拦就 KeyError，把「校验失败」显示成了「未测」。
            if r.get('p2_delta') is None:
                print('  P2 变音符号敏感  %s' % (
                    '探针未生效 → 不计入结论（%s）' % r.get('p2_error', '输入校验拦截')))
            else:
                print('  P2 变音符号敏感  %s' % (
                    'Δ时长 = %+.1f%%（判据 ≥%d%%）→ %s'
                    % (r['p2_delta'] * 100, P2_MIN_DELTA * 100,
                       '通过' if r['p2_verdict'] else '**不通过：符号很可能没发音**')))
            print('  P3 长短元音区分  %s' % (
                ('ཀཱ/ཀ = %.2f（判据 ≥%.2f）→ %s' % (r['p3_ratio'], P3_MIN_RATIO,
                        '通过' if r['p3_verdict'] else '**不通过：长短 a 不分**'))
                if r.get('p3_ratio') is not None else
                '无法判定 → **不通过**（%s）' % r.get('p3_note', '未知原因')))
            # 只把「真正跑到的」探针计入总判：输入校验拦下的，既不算通过也不算不通过
            verdicts = [v for k2, v in r.items()
                        if k2.endswith('_verdict') and (k2 != 'p2_verdict' or r.get('p2_delta') is not None)]
            r['overall'] = all(verdicts) if verdicts else None
            print('  总判            %s' % ('**合格**' if r['overall'] else '不合格'))
            results[key] = r
        except Exception as e:
            print('  运行失败：%s' % str(e)[:100])
            results[key] = {'status': 'error', 'error': str(e)[:100]}

    print('\n' + '=' * 56)
    print('%-10s %-12s %-14s %-14s %s' % ('服务商', 'P1 覆盖率', 'P2 变音符号', 'P3 长短元音', '总判'))
    print('-' * 56)
    for k, r in results.items():
        p1 = ('%.0f%%' % (r['coverage'] * 100)) if r.get('coverage') is not None else '—'
        p2 = '通过' if r.get('p2_verdict') else ('—' if 'p2_verdict' not in r else '不通过')
        p3 = '通过' if r.get('p3_verdict') else ('—' if 'p3_verdict' not in r else '不通过')
        ov = {True: '**合格**', False: '不合格', None: '未测'}.get(r.get('overall'), '未接入')
        print('%-10s %-12s %-14s %-14s %s' % (k, p1, p2, p3, ov))
    print('=' * 56)
    print('判读：只有三项全过才可作为默认服务商。P2/P3 不需要人耳即可判定。')

    if args.json:
        io.open(args.json, 'w', encoding='utf-8').write(
            json.dumps(results, ensure_ascii=False, indent=1))
    return 0


if __name__ == '__main__':
    sys.exit(main())