#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/gen_voice_index.py — 生成 data/voices.js（**哪些元素真的有发音**）

为什么需要它：
  小程序**没有列目录的 API**，`utils/audio.js` 只能「先播一下再说」——文件在不在，
  要等 onError 才晓得。于是 UI 侧只能一律显示「🔊 点击播放藏文读音」，
  点了没声音就成了一个查不出原因的黑洞（2026-10-09 用户的原话：「根本就没有办法播放」）。

  把「哪些 id 有音频」在**构建期**落成一张静态表，运行时就能**先判断再决定**：
    · 有发音 → 喇叭照常
    · 没发音 → 按钮直接标成「发音待录入」，点下去给个轻反馈，不做无效承诺
  这一举把「点了没反应」变成「看得见的缺口」。

单一事实源就是 audio/voice/ 目录本身：本脚本只读目录、不写结论，
任何新录音放进去 → 重跑本脚本 → 表自动更新 → UI 自动亮起来（无需改代码）。

用法：python scripts/gen_voice_index.py
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICE_DIR = os.path.join(ROOT, 'audio', 'voice')
CARDS = os.path.join(ROOT, 'data', 'cards.js')
OUT = os.path.join(ROOT, 'data', 'voices.js')

# 音频资产允许的扩展名（mp3 是压缩后的正式资产；wav 是 TTS 原始产物，尚未压缩）
EXTS = ('.mp3', '.wav')


def read_map():
    """{ id: 扩展名 } —— 多扩展名时 mp3 优先。"""
    found = {}
    if not os.path.isdir(VOICE_DIR):
        print('✗ 找不到 %s' % VOICE_DIR)
        sys.exit(2)
    for f in sorted(os.listdir(VOICE_DIR)):
        name, ext = os.path.splitext(f)
        if ext.lower() not in EXTS:
            continue
        prev = found.get(name)
        if prev is None or (ext.lower() == '.mp3' and prev != '.mp3'):
            found[name] = ext.lower()
    return found


def all_element_ids():
    """data/cards.js 里的全部元素 id（30 字母 + 4 图标），顺序稳定。"""
    src = io.open(CARDS, encoding='utf-8').read()
    seen = []
    for m in re.finditer(r"id:\s*'([^']+)'", src):
        if m.group(1) not in seen:
            seen.append(m.group(1))
    return seen


def main():
    found = read_map()
    ids = all_element_ids()
    have = [i for i in ids if i in found]
    missing = [i for i in ids if i not in found]
    # 情绪语音 / 讲解类也在目录里，但不属元素表，单独列出（供 UI 判断是否可播）
    extra = sorted(k for k in found if k not in ids)

    body = [
        '// data/voices.js — **哪些元素真的有藏文发音**（由 scripts/gen_voice_index.py 生成，勿手改）',
        '//',
        '// 生成依据只有一个：audio/voice/ 目录里到底有哪些文件。录音放进去后重跑脚本即可，',
        '// 不需要改代码；scripts/validate.js 会校对「表 vs 目录」是否一致（漂移即报错）。',
        '//',
        '// 为什么要在构建期算这张表：小程序没有列目录的 API，运行时只能「先播了再说」，',
        '// 而 file missing 要等 onError 才知道 —— UI 便无法提前告诉用户「这个还没录」。',
        '// 有了这张表，喇叭按钮可以在**点之前**就说实话（见 utils/audio.js 的 hasVoice）。',
        '//',
        '// ⚠️ 由脚本生成，手改会在下次重跑时被覆盖（且会被 §48 守卫判为漂移）。',
        'module.exports = {',
        '  // 有音频的元素 id（30 字母 + 4 图标里已到位的那些）',
        '  ids: [',
    ]
    for i in have:
        body.append("    '%s'," % i)
    body += [
        '  ],',
        '  // 还没有发音的元素 id —— UI 必须据此显示「发音待录入」而不是假装能播',
        '  missing: [',
    ]
    for i in missing:
        body.append("    '%s'," % i)
    body += [
        '  ],',
        '  // 非元素类语音（情绪 / 中文讲解），键到 id 不存在时才查这里',
        '  extras: [',
    ]
    for i in extra:
        body.append("    '%s'," % i)
    body += [
        '  ]',
        '};',
        '',
    ]
    io.open(OUT, 'w', encoding='utf-8', newline='\n').write('\n'.join(body))
    print('✓ 已写入 %s' % os.path.relpath(OUT, ROOT))
    print('  有发音 %d 条 / 缺 %d 条 / 非元素类 %d 条'
          % (len(have), len(missing), len(extra)))
    if missing:
        print('  待补：' + ' '.join(missing))


if __name__ == '__main__':
    main()
