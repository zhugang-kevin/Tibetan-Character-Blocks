#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/gen_chinese_voice.py — 中文语音播报生成（激励鼓励 + 藏地密码讲解）

用途（2026-10-08 用户要求）：
  · 激励鼓励播报：配对连击时播「很好 / 非常好 / 你好厉害 / 你简直就是无敌」
  · 文化知识播报：「藏地密码」每则的「听讲解」（精简版，完整文字在屏幕上）
  · 全部为**离线预生成**静态资产（audio/voice/*.mp3），运行时零请求（不触碰 D3/D13）。

与 scripts/gen_voice.py 的分工：
  · gen_voice.py         → 藏文元素发音（天翼卫藏 TTS，WS 协议，输出 WAV）
  · gen_chinese_voice.py → 中文播报（微软 Edge TTS，免费无 Key，输出 MP3 → ffmpeg 压到目标码率）

依赖（均只需一次安装）：
  pip install edge-tts        （合成）
  ffmpeg 在 PATH 中           （压缩；找不到则保留原 48kbps，体积会大 3 倍）
  二者都没有时脚本会明确报错并给出安装提示。

体积口径（主包 2MB 硬约束，写死在这里并在结尾对账）：
  · 激励词 4 条 @ 24kbps ≈ 每条 4-6KB
  · 讲解 10 条 @ 16kbps ≈ 每条 14-18KB（单条上限 22KB，超了会打印警告）

用法：
  python scripts/gen_chinese_voice.py --list          # 列出将生成的条目与文本
  python scripts/gen_chinese_voice.py                 # 全量（幂等：已存在跳过）
  python scripts/gen_chinese_voice.py --only praise_2
  python scripts/gen_chinese_voice.py --force         # 覆盖重生成
"""
import argparse
import asyncio
import os
import re
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'audio', 'voice')
VOICE = 'zh-CN-XiaoxiaoNeural'   # 亲和力强的女声（中文）
RATE_SECRET = '-8%'              # 讲解稍慢，舒缓
RATE_PRAISE = '+0%'              # 激励词保持自然节奏

# 激励鼓励播报（用户点名词：很好 / 非常好 / 你好厉害 / 你简直就是无敌）
# 键 = praise_{档位}，与 data/praise.js 的档位（1..5）对齐；档位 1 不播语音（避免吵）
PRAISE = {
    'praise_2': ('很好', 24),
    'praise_3': ('非常好', 24),
    'praise_4': ('你好厉害', 24),
    'praise_5': ('你简直就是无敌', 24),
}

# 藏地密码讲解：**正文直接取自 data/secrets.js（播整段，不截句）**
# ⚠️ D52 修复的真实缺陷：此前本文件硬编码了一份「一句话精简版」，于是 mp3 里只有第一句，
#    而结算页/护照页显示的是完整三段正文 —— 听到的比看到的短一大截。
#    正解 = 单一事实源：讲解文本只在 data/secrets.js 里写一次，这里生成时按关卡号取全文。
#    代价测算：全文约 130 字，16kHz / 10kbps 单声道 ≈ 26KB（原精简版 16kbps 也要 20KB），
#    十条合计 +90KB，由 images/ 侧预算腾挪（见 prepare-assets.py 的 D52 注释）。
def load_secrets():
    """从 data/secrets.js 读出十则的「标题 + 完整正文」（title。text，text 为多段拼接）。

    为什么不在 Python 里再写一份：任何第二份文本都必然与屏幕上的正文漂移，
    「只播第一句」正是这么来的。取不到 / 取不全（≠10 条或某条过短）直接报错退出，
    宁可生成失败，也不静默播半截。
    """
    p = os.path.join(ROOT, 'data', 'secrets.js')
    if not os.path.exists(p):
        raise SystemExit('✗ 缺少 data/secrets.js（藏地密码正文的唯一来源）')
    src = open(p, encoding='utf-8').read()
    pat = re.compile(
        r"level:\s*(\d+)\s*,\s*key:\s*'[^']*'\s*,\s*tag:\s*'[^']*'\s*,\s*title:\s*'([^']*)'\s*,\s*"
        r"text:\s*((?:'[^']*'\s*\+?\s*)+)", re.S)
    out = {}
    for m in pat.finditer(src):
        lv, title, body = int(m.group(1)), m.group(2), m.group(3)
        frags = re.findall(r"'([^']*)'", body)
        text = (title + '。' if title else '') + ''.join(frags)
        if len(text) < 80:
            raise SystemExit('✗ 第 %d 则讲解正文过短（%d 字）——是否只截到了第一句？' % (lv, len(text)))
        out['secret_%02d' % lv] = (text, 10)     # 10kbps：全文 130 字 ≈ 26KB
    if len(out) != 10:
        raise SystemExit('✗ data/secrets.js 解析出 %d 则（应为 10）——正则需同步更新' % len(out))
    return out


SECRETS = load_secrets()

ITEMS = dict(PRAISE)
ITEMS.update(SECRETS)
# 燃灯播报（D50，用户点名）：点亮酥油灯后播《嗡 嘛 呢 叭 咪 吽》。
# 字与字之间留空格 → 逐字庄重；走 RATE_SECRET（-8% 慢速）。6 字短句 24kbps 足够。
ITEMS['mantra'] = ('嗡 嘛 呢 叭 咪 吽', 24)
# 单条体积上限（KB）：讲解 22KB；激励 8KB
LIMIT = {k: (8 if k.startswith('praise') else 22) for k in ITEMS}
LIMIT['mantra'] = 18
# D52：讲解改为播整段（约 130 字 @10kbps ≈ 26KB）→ 单条上限随之放宽到 30KB；
#      仍要卡上限：一旦有人把 bitrate 调回 16k 或塞进更长的正文，这里会先红。
for _k in SECRETS:
    LIMIT[_k] = 32


def synth_one(key, text, kbps):
    """edge-tts 合成 → ffmpeg 压缩 → audio/voice/{key}.mp3；返回最终体积。"""
    import edge_tts
    rate = RATE_PRAISE if key.startswith('praise') else RATE_SECRET
    tmp = os.path.join(OUT_DIR, '_raw_' + key + '.mp3')
    out = os.path.join(OUT_DIR, key + '.mp3')
    tts = edge_tts.Communicate(text, voice=VOICE, rate=rate)
    asyncio.run(tts.save(tmp))
    ff = shutil.which('ffmpeg')
    if ff:
        cmd = [ff, '-y', '-loglevel', 'error', '-i', tmp,
               '-ac', '1', '-ar', '16000', '-codec:a', 'libmp3lame', '-b:a', '%dk' % kbps, out]
        subprocess.run(cmd, check=True)
        os.remove(tmp)
    else:
        os.replace(tmp, out)   # 找不到 ffmpeg：保留原品质（体积会明显更大）
    return os.path.getsize(out)


def main():
    ap = argparse.ArgumentParser(description='中文语音播报生成（激励 + 藏地密码讲解）')
    ap.add_argument('--list', action='store_true')
    ap.add_argument('--only', nargs='+')
    ap.add_argument('--force', action='store_true')
    args = ap.parse_args()

    if args.list or (not args.only and not args.force):
        if args.list:
            print('将生成 %d 条：' % len(ITEMS))
            for k, (t, kb) in ITEMS.items():
                print('  %-12s %dkbps  %s' % (k, kb, t))
            return

    try:
        import edge_tts  # noqa: F401
    except ImportError:
        print('✗ 缺 edge-tts：pip install edge-tts')
        sys.exit(2)
    if not shutil.which('ffmpeg'):
        print('⚠ 未找到 ffmpeg——将保留 48kbps 原始输出（体积约为目标的 3 倍）')

    os.makedirs(OUT_DIR, exist_ok=True)
    targets = args.only or list(ITEMS)
    unknown = [t for t in targets if t not in ITEMS]
    if unknown:
        print('✗ 未知条目：%s' % ' '.join(unknown))
        sys.exit(2)

    total, over = 0, []
    for key in targets:
        text, kbps = ITEMS[key]
        out = os.path.join(OUT_DIR, key + '.mp3')
        if os.path.exists(out) and not args.force:
            print('  - %-12s 已存在，跳过（%.1fKB）' % (key, os.path.getsize(out) / 1024))
            total += os.path.getsize(out)
            continue
        size = synth_one(key, text, kbps)
        total += size
        kb = size / 1024
        flag = '' if size <= LIMIT[key] * 1024 else '  ⚠ 超单条上限 %dKB' % LIMIT[key]
        if flag:
            over.append(key)
        print('  ✓ %-12s %-6s %5.1fKB%s' % (key, text[:6], kb, flag))

    print('\n合计 %.1fKB（目标：激励 ≤8KB/条、讲解 ≤22KB/条）' % (total / 1024))
    if over:
        print('✗ 超限条目：%s —— 建议降低码率或缩短文本后重试' % ' '.join(over))
        sys.exit(1)


if __name__ == '__main__':
    main()
