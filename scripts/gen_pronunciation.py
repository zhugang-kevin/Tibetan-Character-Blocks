#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/gen_pronunciation.py — 内容藏文词/句 读音音频自动化生成 + 权威读音交叉核对

为什么单独做这个脚本（不塞进 gen_voice.py）：
  gen_voice.py 只认 data/cards.js 的 34 个元素 + data/daily.js 的祈福句。
  但四层拼读（D110）与学习体系里还有大量「承载藏文词/句」的内容字段
  （learning 的 WORDS/WORDS_COMPLEX/PHRASES/PHRASES_COMPLEX、reveals.tibetan、
  praise.bo、daily.tibetan、cards.subtitle/tibetan/title），它们没有音频。
  本脚本把「任意藏文文本 → 音频」做成可复用流水线，复用 gen_voice 的
  teleai_synthesize / pcm_to_wav / 有声判定（时长<0.25s 或 峰值<1000 直接判失败，
  不写近静音桩），保证与现有 34 条元素同一套质量门禁。

同时做「权威读音交叉核对」：把联网核查（2026-10-13）得到的权威口径
（Wiktionary / Wikiwand 卫藏方言表 / THL / Rangjung Yeshe / Gosok Rinpoche）
与 data/affixes.js 的拉萨音标注逐条比对，并显式把 ལྷ / རྒྱལ 这类
「真词固有辅音簇」标记为待母语者人工签确（不是语法下加字，自动化不能替代人耳）。

用法：
  python scripts/gen_pronunciation.py                # 全量内容词/句（多文件，耗时，注意主包预算）
  python scripts/gen_pronunciation.py --praise-only  # 仅 25 条藏文赞美（落分包 package-praise/audio/voice）
  python scripts/gen_pronunciation.py --only lha_sa,rgyal_mtshan   # 仅指定条目（推荐先试）
  python scripts/gen_pronunciation.py --dry-run      # 只列待生成条目，不联网
  python scripts/gen_pronunciation.py --no-audio    # 只跑权威读音交叉核对，不生成音频

生成后需再跑一次压缩步骤（与现有口径一致）：
  python scripts/compress_voice.py                  # WAV → MP3（删源 WAV）
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICE_DIR = os.path.join(ROOT, 'audio', 'voice')
# 25 条 praise.bo 的藏文音频放进**分包**（主包已顶到 2MB 硬上限，分包是微信标准解法，
# 见 docs/cloud-sync-blocker.md 路径A）。游戏侧 utils/audio.speakPraiseBo 也从这里取。
SUBPKG_VOICE_DIR = os.path.join(ROOT, 'package-praise', 'audio', 'voice')
sys.path.insert(0, os.path.join(ROOT, 'scripts'))
import gen_voice as gv  # 复用 teleai_synthesize / pcm_to_wav / wav_stats / load_config

# 用户点名的两个（以及任何你想单独加的词），用稳定 id 指定
EXTRA = {
    'lha_sa': 'ལྷ་ས',          # Lhasa；ལྷ = ལ+ཧ 边擦音簇
    'rgyal_mtshan': 'རྒྱལ་མཚན་',  # 胜利幢；རྒྱལ = ར+ྒ+ྱ+ལ 真词固有簇
}

# 权威读音参考（联网核查 2026-10-13，用于交叉核对 + 人工签确清单）
# 来源：Wiktionary(ལྷ/རྒྱལ IPA)、Wikiwand 卫藏方言声母表(ལྷ→lh [ɬ])、
#       Gosok Rinpoche 佛教词典(རྒྱལ=gyel/rgyal)、THL/Rangjung Yeshe(Wylie)
PRON_REF = {
    'ལྷ': {
        'wylie': 'lha', 'ipa': 'ɬa˥˥',
        'note': 'ལ + ཧ → 边擦音 lh；拉萨音 IPA /ɬa˥˥/；威利 lha。属「上加字 ལ + ཧ」特例簇。',
        'src': 'Wiktionary; Wikiwand 卫藏方言声母表(ལྷ→lh [ɬ]); Rangjung Yeshe',
    },
    'རྒྱལ': {
        'wylie': 'rgyal', 'ipa': 'ɡʲal',
        'note': 'ར + ྒ + ྱ + ལ 真词固有簇（非语法下加字）；威利 rgyal，意为 victory/conquer/win。'
                '拉萨口语常读作 "gyal"（ར 前缀不发音、གྱ 簇腭化）。'
                '母语者确认(2026-10-13)：རྒྱལ་མཚན་ = 坚参/Gyantsen（藏族名字），亦为「胜利幢」吉祥符号之名；读音无误（没有问题）。',
        'src': 'Wiktionary; Gosok Rinpoche 简明佛教词典(རྒྱལ=gyel/rgyal); kaikki.org; 母语者确认',
    },
}


def collect_tokens(extra):
    """从 data 模块抽取所有承载藏文词/句的内容字段 → {id: tibetan}。
    用 node 直接 require 各模块（CommonJS），与 audit_combinations.js 同源，避免重复解析。"""
    node = '''
    const load = p => { try { return require(p); } catch (e) { return null; } };
    const L = load('./data/learning.js') || {};
    const R = load('./data/reveals.js') || [];
    const P = load('./data/praise.js') || { tiers: [] };
    const D = load('./data/daily.js') || [];
    const C = load('./data/cards.js') || [];
    const A = load('./data/affixes.js') || {};
    const arr = x => Array.isArray(x) ? x : (x && x.data ? x.data : []);
    const words = [].concat(L.WORDS||[], L.WORDS_COMPLEX||[], L.PHRASES||[], L.PHRASES_COMPLEX||[]);
    // praise.js 导出 { pendingNativeReview, reviewNote, tiers:[{level, name, need, texts:[{zh, bo}]}] }，
    // 不是数组，故不能用 arr(P)（会返回 []）。按 tier.level + texts 下标生成稳定 id：
    //   praise_bo_{level}_{idx}   ← 与游戏侧 audio.speakPraiseBo(level, idx) 一一对应
    const praiseMap = {};
    if (Array.isArray(P.tiers)) {
      P.tiers.forEach(function (t) {
        (t.texts || []).forEach(function (d, i) {
          if (d && d.bo) praiseMap['praise_bo_' + t.level + '_' + i] = d.bo;
        });
      });
    }
    const tokens = {
      words: words,
      reveals: arr(R).map(d => d && d.tibetan).filter(Boolean),
      praise: Object.keys(praiseMap).map(k => praiseMap[k]),
      daily:   arr(D).map(d => d && d.tibetan).filter(Boolean),
      cards_sub:    arr(C).map(d => d && d.subtitle).filter(Boolean),
      cards_tib:    arr(C).map(d => d && d.tibetan).filter(Boolean),
      cards_title:  arr(C).map(d => d && d.title).filter(Boolean),
    };
    console.log(JSON.stringify({
      tokens: tokens,
      praiseMap: praiseMap,
      affix: { SUPER_READ: A.SUPER_READ, SUB_READ: A.SUB_READ,
               SUPER_OK: A.SUPER_OK, SUB_OK: A.SUB_OK }
    }));
    '''
    out = subprocess.run(['node', '-e', node], cwd=ROOT, capture_output=True, text=True)
    if out.returncode != 0:
        print('✗ node 抽取失败：%s' % out.stderr[:500])
        sys.exit(1)
    data = json.loads(out.stdout.strip().splitlines()[-1])
    toks = {}
    for key, lst in data['tokens'].items():
        if key == 'praise':  # praise 已由 praiseMap 以稳定 id 单独纳入，避免重复/错位
            continue
        for t in lst:
            t = (t or '').strip()
            if not t:
                continue
            tid = '%s_%d' % (key, len(toks) + 1)
            toks[tid] = t
    # 稳定 id：praise_bo_{level}_{idx}（level=档位 1..5，idx=同档内序号 0..4）
    for k, v in (data.get('praiseMap') or {}).items():
        toks[k] = v
    toks.update(extra or {})
    return toks, data.get('affix', {})


def cross_check_affix(affix):
    """把 data/affixes.js 的拉萨音标注与权威参考逐条比对，并标记待人工签确项。"""
    print('\n=== 权威读音交叉核对（联网核查 2026-10-13）===')
    ok = True
    # 1) ལྷ：affixes.js 的 SUPER_RULES SP4 写 ལ+ཧ=lhā，应与权威 lha/ɬa 一致
    sr = (affix.get('SUPER_READ') or {}).get('ཧ')
    print('  · ལྷ 簇：affixes.js 标 ལ+ཧ → %s；权威 Wiktionary/Wikiwand = lha / IPA /ɬa˥˥/ %s'
          % (sr, '✓ 一致' if sr and 'lh' in sr else '✗ 不一致'))
    if not (sr and 'lh' in sr):
        ok = False
    # 2) རྒྱལ：真词固有簇，已由母语者签确（2026-10-13）
    print('  · རྒྱལ 簇：威利 rgyal / IPA ɡʲal，ར+ྒ+ྱ+ལ 真词固有簇（非语法下加字）')
    print('      → 已母语者确认(2026-10-13)：རྒྱལ་མཚན་ = 坚参/Gyantsen（藏族名字）；读音无误（没有问题）')
    # 3) ྭ 15 栈与权威 THL 一致已在 audit_affix_reading.py 覆盖，这里只回显一项
    sub_ok_wa = (affix.get('SUB_OK') or {}).get('ྭ', '')
    print('  · 下加字 ྭ 成词栈数 = %d（THL Standard Tibetan Stacks 实测 15，已对齐）%s'
          % (len(sub_ok_wa), '✓' if len(sub_ok_wa) == 15 else '✗'))
    if len(sub_ok_wa) != 15:
        ok = False
    print('  → 交叉核对 %s' % ('通过 ✓' if ok else '存在不一致 ✗'))
    return ok


def gen_one(cfg, tid, text, out_dir, sleep=5.0, retries=3):
    """生成单条音频，返回 (status, info)。复用 gen_voice 的有声判定。
    out_dir 由调用方按 id 决定（praise_bo_* 落分包，其余落主包 audio/voice）。"""
    time.sleep(sleep) if sleep > 0 else None
    last = ''
    for attempt in range(1, retries + 1):
        try:
            wav = gv.synthesize(cfg, text)
        except Exception as e:
            last = '合成异常: %s' % e
            time.sleep(sleep * attempt)
            continue
        dur, peak = gv.wav_stats(wav)
        if len(wav) >= 512 and peak >= gv.MIN_PEAK and dur >= gv.MIN_DUR:
            out = os.path.join(out_dir, tid + '.wav')
            with open(out, 'wb') as f:
                f.write(wav)
            return 'ok', {'bytes': len(wav), 'dur': round(dur, 3), 'peak': peak}
        last = '近静音/过短：%.2fs / 峰值 %d（可能限流降级或厂商发不出）' % (dur, peak)
        time.sleep(sleep * attempt)
    return 'fail', {'reason': last}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', help='只生成指定 id（逗号分隔），如 lha_sa,rgyal_mtshan')
    ap.add_argument('--praise-only', action='store_true',
                   help='只生成 25 条 praise.bo 藏文赞美（落分包 package-praise/audio/voice）')
    ap.add_argument('--dry-run', action='store_true', help='只列条目，不联网')
    ap.add_argument('--no-audio', action='store_true', help='只跑权威读音交叉核对')
    args = ap.parse_args()

    toks, affix = collect_tokens(EXTRA)

    # 只跑 25 条藏文赞美（本任务主交付）：praise_bo_* 落分包
    if args.praise_only:
        toks = {k: v for k, v in toks.items() if k.startswith('praise_bo_')}

    if args.only:
        want = set(args.only.split(','))
        toks = {k: v for k, v in toks.items() if k in want}
        if not toks:
            print('✗ --only 未命中任何条目：%s' % args.only)
            sys.exit(1)

    print('待处理内容词/句：%d 条' % len(toks))
    for k, v in toks.items():
        print('  - %-14s %s' % (k, v))

    # 权威读音交叉核对（无论是否生成音频都跑）
    cross_check_affix(affix)

    if args.dry_run:
        print('\n[dry-run] 未生成音频。')
        return
    if args.no_audio:
        print('\n[no-audio] 跳过音频生成。')
        return

    cfg = gv.load_config()
    os.makedirs(VOICE_DIR, exist_ok=True)
    os.makedirs(SUBPKG_VOICE_DIR, exist_ok=True)

    ok, fail = 0, []
    for i, (tid, text) in enumerate(toks.items()):
        if i:
            time.sleep(gv.DEFAULT_SLEEP)  # 防限流静默降级
        # praise_bo_* 落分包，其余落主包 audio/voice
        out_dir = SUBPKG_VOICE_DIR if tid.startswith('praise_bo_') else VOICE_DIR
        status, info = gen_one(cfg, tid, text, out_dir)
        # 每个目录各维护一份 manifest，避免主包 / 分包清单互相污染
        mpath = os.path.join(out_dir, 'pronunciation_manifest.json')
        manifest = {}
        if os.path.exists(mpath):
            try:
                manifest = json.load(open(mpath, encoding='utf-8'))
            except Exception:
                manifest = {}
        if status == 'ok':
            ok += 1
            print('  ✓ %-14s %-12s → %s' % (tid, text, info))
            manifest[tid] = {'text': text, 'status': 'ok', **info,
                             'ts': time.strftime('%Y-%m-%d %H:%M:%S')}
        else:
            fail.append('%s: %s' % (tid, info.get('reason', '')))
            print('  ✗ %-14s %-12s → %s' % (tid, text, info.get('reason', '')))
            manifest[tid] = {'text': text, 'status': 'fail', **info,
                             'ts': time.strftime('%Y-%m-%d %H:%M:%S')}
        json.dump(manifest, open(mpath, 'w', encoding='utf-8'),
                  ensure_ascii=False, indent=2, sort_keys=True)
    print('\n生成完成：成功 %d / 失败 %d' % (ok, len(fail)))
    if fail:
        print('失败项（多为厂商发不出的孤立音节，需真人录音 / Gate 2 审校）：')
        for f in fail:
            print('  · ' + f)
    print('\n下一步：python scripts/compress_voice.py   # WAV→MP3（删源 WAV，与现有口径一致）')


if __name__ == '__main__':
    main()
