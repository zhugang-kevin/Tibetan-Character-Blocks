#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""真人录音入库 —— A3 方案（压缩 + 归一，12kbps）

方案依据：docs/loudness-decision-2026-10-15.md
  ffmpeg -af "acompressor=threshold=-20dB:ratio=3:attack=5:release=100,volume=6dB"
         -ac 1 -ar 16000 -codec:a libmp3lame -b:a 12k

为什么 A3（而不是 D59 的静态增益）：
  · 真人录音 RMS −17.4比 TTS −21.0 **更响**，不处理会「跳」出来
  · A3 压到 +2.1dB，落在人耳可辨的「更近更实」范围但不会突兀
  · crest 只损失 0.7dB（14.6→13.9）；D59 反对压缩的理由针对 **整句**（crest 20+dB），
    单字辅音 crest 14~18dB，压 0.7dB 几乎无感
  · **整句/情绪语音仍走 B 静态增益**（见 --scheme static）

安全措施（不可逆操作前的纪律）：
  1. 现有 TTS 音频先备份到 assets-src/voice-backup-tts/
  2. 只覆盖明确列出的 id，不碰其他文件
  3. 入库后逐条体检 + 目录对账

用法：
  python scripts/inject_human_voice.py --scheme a3# 30 辅音
  python scripts/inject_human_voice.py --scheme static   # 整句（greet_*/blessing/tashi）
  python scripts/inject_human_voice.py --scheme a3 --only letter_03
  python scripts/inject_human_voice.py --dry-run         # 只看会做什么
"""
import argparse
import io
import json
import os
import re
import shutil
import subprocess
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAND = os.path.join(ROOT, '.workbuddy', 'tmp', 'voice-candidates')
SRC_M4A = r"C:\Users\zhuga\OneDrive\Documents\xwechat_files\wxid_kp8ov257seut22_be73\msg\file\2026-10"
VOICE_DIR = os.path.join(ROOT, 'audio', 'voice')
BACKUP = os.path.join(ROOT, 'assets-src', 'voice-backup-tts')
RATE = 16000

# A3：单字/短词（crest 窄，压0.7dB 无感）
CHAIN_A3 = 'acompressor=threshold=-20dB:ratio=3:attack=5:release=100,volume=6dB'
# B：整句/情绪语音（保留 D59 立场：呼吸与句尾收弱是其灵魂）
CHAIN_STATIC = 'volume=-1.5dB'

ARGS_DRY_RUN = [False]
ID_RE = re.compile(r'^(letter_\d+|icon_\d+|greet_\d+|blessing_\d+|tashi_delek|'
                    r'mantra|rar|blessing_bo_\d+_\d+)$')


def sh(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, **kw)


def ffmpeg_convert(src, dst, chain, bitrate='12k'):
    r = sh(['ffmpeg', '-y', '-loglevel', 'error', '-i', src,
            '-af', chain, '-ac', '1', '-ar', str(RATE),
            '-codec:a', 'libmp3lame', '-b:a', bitrate, dst])
    return r.returncode == 0, r.stderr.decode('utf-8', 'ignore')


def pcm(path):
    raw = os.path.join(ROOT, '.workbuddy', 'tmp', '_inj.raw')
    os.makedirs(os.path.dirname(raw), exist_ok=True)
    sh(['ffmpeg', '-y', '-loglevel', 'error', '-i', path,
        '-f', 's16le', '-ac', '1', '-ar', str(RATE), raw])
    if not os.path.exists(raw):
        return None
    d = open(raw, 'rb').read()
    os.remove(raw)
    if len(d) < 4:
        return None
    return np.frombuffer(d[:len(d) // 2 * 2], dtype='<i2').astype(np.float64)


def pick_segment_above(vid, min_dur=0.25):
    """从候选段里挑「时长达标 + 评分最高」的一段。

    为什么需要这个：入库时 3 条（letter_09/13/17）失败，根因是
    **自动选中的那几段只有 0.22~0.24s，短于项目 check_voice.py 的 MIN_DUR=0.25s**
    （门禁判据：太短说明没录全或没读出来）。
    不是录音质量问题，是「那几遍念得偏快」。同一条里有更长的段可用 → 改选即可。
    ⚠️ 诚实边界：若某条**所有**段都< 0.25s，这里会返回 None，
    那就必须如实报「需重录」，不能靠放宽判据蒙混过关。
    """
    import numpy as np
    #辅音与句子各有自己的清单（阈值不同，段边界也不同）
    sj = os.path.join(CAND, '_segments.json')
    if vid.startswith(('greet_', 'blessing_', 'tashi_delek')):
        sj = os.path.join(CAND, '_segments_sentences.json')
    if not os.path.exists(sj):
        return None
    segs = json.load(io.open(sj, encoding='utf-8'))
    arr = segs.get(vid) or []
    ok = [s for s in arr if s['dur'] >= min_dur]
    if not ok:
        return None
    ok.sort(key=lambda s: -s['peak_db'])          # 峰值高 = 录得饱满
    return os.path.join(CAND, ok[0]['file']), ok[0]


def measure(path):
    x = pcm(path)
    if x is None or len(x) < RATE // 8:            # 0.125s：只防「完全解不出」，不误杀
        return None
    pk = float(np.abs(x).max())
    rms = float(np.sqrt((x ** 2).mean()))
    dur = len(x) / RATE
    clip = int(np.sum(np.abs(x[1:]) >= 32700))
    return {
        'dur': round(dur, 3),
        'peak_db': round(20 * np.log10(max(pk, 1e-9) / 32768), 1),
        'rms_db': round(20 * np.log10(max(rms, 1e-9) / 32768), 1),
        'crest_db': round(20 * np.log10(pk / max(rms, 1e-9)), 1),
        'clip': clip,
        'kb': round(os.path.getsize(path) / 1024.0, 2),
    }


SENTENCE_PREFIXES = ('greet_', 'blessing_')
def is_sentence_id(vid):
    """整句 / 情绪 / 六字真言走句子清单（时长窗 0.9~1.8s），其余走辅音清单。"""
    return vid == 'tashi_delek' or vid == 'mantra' or vid.startswith(SENTENCE_PREFIXES)


def pick_one_for(vid, dur_min=0.25):
    """从候选清单里挑「单次念」最优一段。绝不直接用原始多遍 m4a。

    返回 (path, info) 或 (None, None)。
    优先级：picked.json（人工/自动挑过的最高优先）→ 句子/辅音清单（按峰值择优、时长窗过滤）。
    ⚠️ 与早期踩过的坑一致：原始 m4a 是 N 遍连录，直接入库 = 玩家听 N 遍连读，故此处永不退回原始文件。
    """
    pj = os.path.join(CAND, 'picked.json')
    if os.path.exists(pj):
        pk = json.load(io.open(pj, encoding='utf-8'))
        if vid in pk:
            c = os.path.join(CAND, pk[vid]['file'])
            if os.path.exists(c):
                return c, pk[vid]
    if is_sentence_id(vid):
        sj = os.path.join(CAND, '_segments_sentences.json')
        dmin, dmax = 0.90, 1.80
    else:
        sj = os.path.join(CAND, '_segments.json')
        dmin, dmax = 0.20, 1.00
    if dur_min:
        dmin = max(dmin, dur_min)
    if os.path.exists(sj):
        arr = json.load(io.open(sj, encoding='utf-8')).get(vid) or []
        # 时长窗过滤掉「粘连的多遍大段」，再按峰值择优（录得最饱满那一遍）
        ok = [s for s in arr if dmin <= s['dur'] <= dmax]
        if ok:
            ok.sort(key=lambda s: -s['peak_db'])
            return os.path.join(CAND, ok[0]['file']), ok[0]
    return None, None


def collect_targets(scheme, only):
    """返回 [(id, 源文件)]。only 为列表或 None。"""
    out = []
    pj = os.path.join(CAND, 'picked.json')
    if only:
        ids = only if isinstance(only, list) else [only]
        for vid in ids:
            vid = vid.strip()
            # D116：统一走「候选段择优」，绝不直接用原始多遍 m4a（避免玩家听 N 遍连读）。
            seg, info = pick_one_for(vid)
            if seg:
                out.append((vid, seg))
            else:
                print('  [拒收] %s：候选集里没有达标的单次念段' % vid)
                print('         原始 m4a 是「多遍连录整段」，直接入库会让玩家听到 N 遍连读；')
                print('         请先跑 scripts/extract_voice_segments.py 生成候选段。')
        return out
    if scheme == 'static':
        ids = ['tashi_delek', 'blessing_01', 'mantra',
               'greet_03', 'greet_04', 'greet_05', 'greet_06', 'greet_07']
        # D114修正：原先这里直接把 SRC_M4A 的**整段多遍录音**交给管线 ——
        #   与 a3 分支「只取候选段」的做法不一致，等于把「玩家点一下喇叭
        #   听到 5 遍连读」的错误又放回来。必须同样走候选段。
        #   优先 picked.json（人工/自动挑过），回退 _segments.json（客观择优）。
        pj = os.path.join(CAND, 'picked.json')
        _sj = os.path.join(CAND, '_segments_sentences.json')
        pk = json.load(io.open(pj, encoding='utf-8')) if os.path.exists(pj) else {}
        sgs = json.load(io.open(_sj, encoding='utf-8')) if os.path.exists(_sj) else {}
        for vid in ids:
            seg_path = None
            if vid in pk:
                c = os.path.join(CAND, pk[vid]['file'])
                if os.path.exists(c):
                    seg_path = c
            if seg_path is None:
                arr = sgs.get(vid) or []
                # D114：句子择优**必须加时长窗**，不能只按峰值排。
                #   实测 7 条的「完整一遍」全部落在 1.0~1.6s；
                #   而 2.8~6.8s 的段是**两遍以上被粘连**的结果
                #   （遍间停顿 0.6s 恰好略低于 700ms 阈值，没被切开）。
                #   若只按 peak 排序，greet_03 会选中 6.84s 那段 ——
                #   玩家点一下喇叭要听 5 遍连读，正是本脚本要防的缺陷。
                ok = [s for s in arr if 0.90 <= s['dur'] <= 1.80]
                if ok:
                    ok.sort(key=lambda s: -s['peak_db'])
                    seg_path = os.path.join(CAND, ok[0]['file'])
            if seg_path:
                out.append((vid, seg_path))
            else:
                print('  [拒收] %s：候选集里没有达标的单次念段（≥0.6s）。' % vid)
                print('         请先跑python scripts/extract_voice_segments.py --sentence')
        return out
    # a3：从 picked.json 取推荐段
    pj = os.path.join(CAND, 'picked.json')
    if os.path.exists(pj):
        pk = json.load(io.open(pj, encoding='utf-8'))
        for vid, v in pk.items():
            seg = os.path.join(CAND, v['file'])
            if os.path.exists(seg):
                out.append((vid, seg))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--scheme', choices=['a3', 'static'], default='a3')
    ap.add_argument('--only', default=None)
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--bitrate', default='12k')
    args = ap.parse_args()
    ARGS_DRY_RUN[0] = args.dry_run

    chain = CHAIN_A3 if args.scheme == 'a3' else CHAIN_STATIC
    only = args.only.split(',') if args.only else None
    targets = collect_targets(args.scheme, only)
    if not targets:
        print('未找到目标文件')
        return 1

    print('=' * 92)
    print('真人录音入库 · 方案 %s' % args.scheme.upper())
    print('  音频链：ffmpeg -af "%s" -b:a %s' % (chain, args.bitrate))
    print('  目标：%d 条→ audio/voice/<id>.mp3' % len(targets))
    print('=' * 92)

    if args.dry_run:
        for vid, src in targets:
            ex = os.path.join(VOICE_DIR, vid + '.mp3')
            old = os.path.getsize(ex) / 1024.0 if os.path.exists(ex) else 0
            print('  %-16s ← %-30s 现有 %s' % (vid, os.path.basename(src),
                                        ('%.2fKB' % old) if old else '（新）'))
        print('\n[预览模式] 未写入任何文件')
        return 0

    # 备份现有 TTS（只备份将被覆盖的）
    os.makedirs(BACKUP, exist_ok=True)
    backed = 0
    for vid, _ in targets:
        ex = os.path.join(VOICE_DIR, vid + '.mp3')
        if os.path.exists(ex):
            bk = os.path.join(BACKUP, vid + '.tts.mp3')
            if not os.path.exists(bk):
                shutil.copy2(ex, bk)
                backed += 1
    print('已备份现有 TTS 音频 %d 条 → assets-src/voice-backup-tts/' % backed)

    ok, fail = 0, []
    report = []
    for vid, src in targets:
        dst = os.path.join(VOICE_DIR, vid + '.mp3')
        tmp = os.path.join(ROOT, '.workbuddy', 'tmp', '_inj_out.mp3')
        good, err = ffmpeg_convert(src, tmp, chain, args.bitrate)
        if not good:
            print('  [FAIL] %-16s ffmpeg: %s' % (vid, err[:80]))
            fail.append(vid)
            continue
        m = measure(tmp)
        if m is None:
            print('  [FAIL] %-16s 转换结果无法解码' % vid)
            fail.append(vid)
            continue
        # 时长达标：0.25s 是项目 check_voice.py / gen_voice.py 的 MIN_DUR（门禁判据）
        if m['dur'] < 0.25:
            # 不直接判死：先试同一条里更长的段（那几遍念得偏快，不是录音坏了）
            alt = pick_segment_above(vid)
            if alt:
                alt_path, alt_info = alt
                good2, _ = ffmpeg_convert(alt_path, tmp, chain, args.bitrate)
                m2 = measure(tmp) if good2 else None
                if m2 and m2['dur'] >= 0.25 and m2['clip'] <= 20:
                    print('  [RETRY] %-14s 原选段 %.3fs <0.25s → 改用 s%02d(%.3fs)'
                          % (vid, m['dur'], alt_info['seg'], m2['dur']))
                    m = m2
                else:
                    print('  [FAIL] %-16s 改选段仍不合格（原 %.3fs）' % (vid, m['dur']))
                    fail.append(vid)
                    continue
            else:
                print('  [FAIL] %-16s 仅 %.3s，该条**所有**段都 <0.25s —— 需重录'
                      % (vid, m['dur']))
                print('         （如实报告，不放宽门禁判据）')
                fail.append(vid)
                continue
        if m['clip'] > 20:
            print('  [FAIL] %-16s 削波 %d 个（拒收）' % (vid, m['clip']))
            fail.append(vid)
            continue
        shutil.move(tmp, dst)
        m['id'] = vid
        report.append(m)
        ok += 1
        print('  [OK] %-16s %.3fs  RMS %.1fdB  峰值 %.1fdB  crest %.1fdB  %.2fKB'
              % (vid, m['dur'], m['rms_db'], m['peak_db'], m['crest_db'], m['kb']))

    print('\n' + '=' * 92)
    print('完成：成功 %d 条 ｜ 失败 %d 条' % (ok, len(fail)))
    if fail:
        print('失败：%s' % ', '.join(fail))
    if report:
        print('\n入库后客观量汇总：')
        print('  RMS  中位 %.1f dBFS' % np.median([r['rms_db'] for r in report]))
        print('  峰值 中位 %.1f dBFS' % np.median([r['peak_db'] for r in report]))
        print('  crest 中位 %.1f dB' % np.median([r['crest_db'] for r in report]))
        print('  合计 %.1f KB' % sum(r['kb'] for r in report))
    p = os.path.join(ROOT, '.workbuddy', 'tmp',
                     '_inject_%s.json' % args.scheme)
    with io.open(p, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    print('  报告：%s' % p)
    return 0 if not fail else 1


if __name__ == '__main__':
    sys.exit(main())
