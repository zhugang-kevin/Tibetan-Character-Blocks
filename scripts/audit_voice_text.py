#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/audit_voice_text.py — 读音对账（D102）

## 解决什么问题
用户反馈「游戏里面的很多藏文读音**有错误**」。
「错误」有两类，都能**用机器验证**：
  ① **念错字** —— UI 显示的是字母 A，而播放的音频是用字母 B 合成的
  ② **文本漂移** —— 音频是按旧文案生成的，后来数据改了，音频没跟上（同上，本质是 ①）

做法：把三份东西对起来
  · data/cards.js         —— UI 显示什么（id → tibetan）
  · scripts/tts-manifest.json —— 每条音频**当年是用哪段藏文合成的**
  · audio/voice/*.mp3     —— 实际存在的音频文件
任何一处对不上，就是一条**可确证的读音错误**。

## 为什么写成文件而不是塞进命令行
本项目的 shell 是 Git Bash，heredoc 里的正则反斜杠会被转义破坏
（`\\s` 变成 `//s`，今天已踩过多次，其中一次还导致「拿空集合比对」得出
一个**看似通过、其实毫无意义**的结论）。写成文件就绕开了整类问题。

用法：python scripts/audit_voice_text.py
"""
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = os.path.join(ROOT, 'data', 'cards.js')
MANIFEST = os.path.join(ROOT, 'scripts', 'tts-manifest.json')
VOICE_DIR = os.path.join(ROOT, 'audio', 'voice')

TSHEG = '\u0f0b'
DOT = '\u0f0d'


def norm(s):
    """归一：去 tsheg / shad / 空白 —— 只比较「念的是哪个字」"""
    return (s or '').replace(TSHEG, '').replace(DOT, '').replace(' ', '').strip()


def read_cards():
    src = io.open(CARDS, encoding='utf-8').read()
    out = {}
    pat = r"id:\s*'([^']+)'[\s\S]*?tibetan:\s*'([^']*)'[\s\S]*?subtitle:\s*'([^']*)'"
    for m in re.finditer(pat, src):
        eid, tib, sub = m.group(1), m.group(2).strip(), m.group(3)
        if tib:
            out[eid] = tib
        else:
            # icon 类的 tibetan 是空的，藏文写在 subtitle 的「藏语：དཔལ་བེའུ」里。
            #   ⚠️ 判据第一版只看 tibetan 字段，于是 3 个 icon 被误报成「念错字」。
            inner = re.search(r'藏语：([^\s\'"、（()]+)', sub)
            out[eid] = inner.group(1).strip() if inner else ''
    return out


def main():
    cards = read_cards()
    if not cards:
        print('✗ 从 data/cards.js 没解析出任何条目 —— 检查文件格式是否变了')
        return 2

    try:
        man = json.load(io.open(MANIFEST, encoding='utf-8'))
    except Exception as e:
        print('✗ 读不到 tts-manifest.json：%s' % e)
        return 2
    voices = man.get('voices', man)

    files = set(f[:-4] for f in os.listdir(VOICE_DIR) if f.endswith('.mp3'))

    print('读音对账（UI 显示 vs 音频原文 vs 实际文件）')
    print('  条目：cards.js %d ｜ manifest %d ｜ 音频文件 %d' % (len(cards), len(voices), len(files)))
    print('')

    mismatch, no_audio, no_manifest, ok = [], [], [], 0
    alt_form = []

    for eid in sorted(cards):
        ui = cards[eid]
        has_file = eid in files
        entry = voices.get(eid)
        at = (entry.get('text') if isinstance(entry, dict) else entry) or ''

        if not has_file:
            no_audio.append(eid)
            continue
        if not entry or not at:
            no_manifest.append(eid)
            continue
        if norm(ui) != norm(at):
            mismatch.append((eid, ui, at))
        else:
            ok += 1
        # form=alt 表示「当年为出声，用了 字母+ཱ（长 a）」——元音长度不对，
        # 属可确证的不准确（UI 教裸辅音，音频念长音）。单列出来，不混进「念错字」。
        if isinstance(entry, dict) and entry.get('form') == 'alt':
            alt_form.append((eid, at))

    # ① 念错字（最严重）
    if mismatch:
        print('❌ **念错字：UI 显示与音频原文不一致（%d 条）**' % len(mismatch))
        for eid, ui, at in mismatch:
            print('   %-12s  UI 显示 %s   音频念的是 %s' % (eid, ui, at))
    else:
        print('✓ 已生成音频的 %d 条：**逐字一致**，不存在「念错字」' % ok)

    # ② 有文件但清单里没有原文（无据可查）
    if no_manifest:
        print('')
        print('! 有音频但清单里查不到原文（无法证伪，需人工听）：%d 条' % len(no_manifest))
        print('   ' + ', '.join(no_manifest[:12]))

    # ③ 根本没音频（用户听到的「点了没声」）
    if no_audio:
        print('')
        print('! 没有音频的条目（点了没声）: %d 条' % len(no_audio))
        print('   ' + ', '.join(x for x in no_audio if re.match(r'^(letter|icon)_', x)))
        other = [x for x in no_audio if not re.match(r'^(letter|icon)_', x)]
        if other:
            print('   （非字母类）' + ', '.join(other))

    # ③ 长音妥协（form=alt）
    if alt_form:
        print('')
        print('! **长音妥协（form=alt）%d 条：音频用的是「字母 + ཱ（长 a）」，比裸辅音长一档**'
              % len(alt_form))
        print('   这不是「念错另一个字」，而是元音长度不对 —— 对学习者仍属不准确。')
        print('   ⚠️ 「双写取首段」这条捷径已被 scripts/prove_double_form.py **证明不可用**：')
        print('      首段只有 0.11s（基准裸辅音 0.52s），且切段数与相似度都无法区分字母。')
        print('   → 唯一可靠的修法是**真人录音**（下表即录音清单）。')
        for eid, at in alt_form:
            print('   %-12s 音频原文 %s' % (eid, at))

    print('')
    print('=' * 54)
    if mismatch or alt_form or no_audio:
        # ⚠️ 本脚本**只报告、不判失败**。
        #   为什么：这三类都是**外部依赖**（真人录音）才能消掉的，不是代码缺陷。
        #   若这里 exit 1，交付流水线会永远卡在「检查」阶段 —— 那就成了
        #   「用一个永远红的灯把整条流水线堵死」，反而没人再看它。
        #   强制「这件事必须被看见」交给门禁 §59.18（validate.js）来做，
        #   那个门禁不阻止发布，但会在有人删掉清单/抹掉记录时立刻报出来。
        print('  📋 待补齐：念错字 %d ｜ 长音妥协 %d ｜ 无音频 %d'
              % (len(mismatch), len(alt_form), len(no_audio)))
        print('     修法见 docs/voice-recording-pending.md（真人录音清单）')
        print('     —— 本脚本只报告，不判失败（外部依赖；防止把流水线堵死）')
        return 0
    print('  ✅ 全部对齐：无念错字、无长音妥协、无缺音频')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
