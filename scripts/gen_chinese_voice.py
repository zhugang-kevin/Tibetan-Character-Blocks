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

# 藏地密码讲解（精简版：一句话能听懂；完整文字在结算页与护照页展示）
SECRETS = {
    'secret_01': ('高原上的雪峰终年不化，是因为海拔越高气温越低。开始常年积雪的那条高度线，就叫雪线。', 16),
    'secret_02': ('青稞炒熟磨成粉，就是糌粑。不用生火、不用筷子，抓起来就能吃，是长途行走的干粮。', 16),
    'secret_03': ('牦牛的毛是高原上重要的织物原料。下雨时毛纤维吸潮膨胀，帐篷的缝隙会自己合拢挡雨。', 16),
    'secret_04': ('高原冬季寒冷干燥、风大，是天然的冷库。牛肉切条挂在通风处，让风带走水分，就是风干肉。', 16),
    'secret_05': ('茶从云南、四川压成茶砖，用马帮驮进高原，换回马匹与畜产品——这就是茶马古道。', 16),
    'secret_06': ('藏文有三十个辅音字母，你在这款游戏里能见到全部三十个。走完十课，就认过一遍字母表。', 16),
    'secret_07': ('藏文里那个小小的点，叫音节点。它不是标点，作用更像空格，把音节一个个分开。', 16),
    'secret_08': ('哈达是一条长巾，最常见的颜色是白色。递哈达时要双手捧起，微微躬身。', 16),
    'secret_09': ('藏式木碗轻、不烫手、摔不碎，出门就揣在怀里，一人一碗、随身携带。', 16),
    'secret_10': ('秋收之前，人们绕着田地走一圈，看看青稞的长势，也庆祝即将到来的丰收。这叫望果。', 16),
}

ITEMS = dict(PRAISE)
ITEMS.update(SECRETS)
# 燃灯播报（D50，用户点名）：点亮酥油灯后播《嗡 嘛 呢 叭 咪 吽》。
# 字与字之间留空格 → 逐字庄重；走 RATE_SECRET（-8% 慢速）。6 字短句 24kbps 足够。
ITEMS['mantra'] = ('嗡 嘛 呢 叭 咪 吽', 24)
# 单条体积上限（KB）：讲解 22KB；激励 8KB
LIMIT = {k: (8 if k.startswith('praise') else 22) for k in ITEMS}
LIMIT['mantra'] = 18


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
