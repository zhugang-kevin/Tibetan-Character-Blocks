#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/make_lamp_assets.py — 祈福之光跳窗资产（D50 建立 / D53 改版）

用户点名的三项视觉资产（2026-10-08）：
  1. 跳窗背景 = 坐着的释迦牟尼 + 一层色罩（不艳丽）        → images/buddha-bg.jpg
  2. 酥油灯 = 参照用户提供的真实鎏金酥油灯照片（未点燃状态）→ images/lamp.webp（黑底抠透明）
  3. 火焰 = 写实火苗（未点静态 / 点燃后 CSS 多层动态）      → images/flame.webp（SVG→Chrome 渲染）

D53 改版（2026-10-09 用户反馈三条）：
  ① 灯体「特别艳丽」，与暗色底图不协调 → **压艳**：饱和 .42 / 亮度 .60 / 对比 .90
     + 深棕金罩 28%。原图是亮银 + 高饱和金 + 一颗绿松石，在夜色底上像贴纸；
     压完落到暗青铜金，与释迦牟尼的铜色同源，錾刻花纹仍在（再压到 .32/.50 就会糊）。
  ② 灯体太大 → 缩到 50%（150×212rpx），见 index.wxss。
  ③ 灯座要与佛陀底座「同一个基础」 → **底座线必须由资产侧钉死**：
     底图裁到源高的 90%（CROP_TO），而佛陀莲花座底沿在源高的 80.2%（BASE_Y），
     于是底座线永远落在产物图高的 80.2/90 = **89.1%** 处；
     CSS 侧把灯座挂在 `bottom: 11%`（= 100 − 89），两边永远咬合，不随机型漂移。
     产物图最下 11% 渐隐到卡片墨色，避免裁切硬边。

⚠️ 改 CROP_TO / BASE_Y 任何一个，都必须同步改 index.wxss 与 template.html 的
   `bottom: 11%`（validate §44.3 会机械校核两者一致，不一致直接红）。

为什么火焰用图片而不是纯 CSS：
  纯 CSS 圆角块火苗在写实鎏金灯旁会瞬间「穿帮」；SVG 渐变火苗（橙缘 + 白黄芯 +
  淡蓝焰根）在 Chrome 里渲成带透明通道的小图，配合 CSS transform 动画（缩放/摇摆/
  呼吸）可以同时拿到「写实感」与「动态感」，单图体积 ≤12KB。

黑底抠图原理（酥油灯）：产品照背景为纯黑，取每像素 max(R,G,B) 做亮度键控，
灯体明亮处全不透明、暗缝隙半透明——落在深色卡片上视觉无损，且不需要 RGB 精确抠边。

体积口径（主包 1801KB / 1843KB 的余量由 prepare-assets.py 同步收紧 scene/reveal/
bg_global 预算腾出）：buddha ≤50KB、lamp ≤50KB、flame ≤12KB。

用法：python scripts/make_lamp_assets.py [--flame-only]
"""
import argparse
import os
import subprocess

from PIL import Image, ImageEnhance, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets-src', 'lamp')
IMAGES = os.path.join(ROOT, 'images')
TMP = os.path.join(ROOT, 'preview', '_v2')
KB = 1024

BUDDHA_BUDGET = 50 * KB
LAMP_BUDGET = 58 * KB
FLAME_BUDGET = 14 * KB

# ---- D53 底座线契约（与 index.wxss / template.html 的 bottom: 8% 逐一对应）----
# 佛陀坐在莲花座上，座下还有一层须弥座第二层（仰莲瓣带），其下沿 ≈ 源高 94%——
# 这就是「地面」。灯座与它共线 ⇒ 灯像供在佛前、站在同一张供桌上。
BASE_LINE = 0.92   # 灯座线在**产物图**里的高度比例 ⇒ CSS 灯座 bottom = 1 − 0.92 = 8%
CROP_TO = 0.90     # 底图裁到源高的 90%（切掉最底部余黑，卡片下部留给数据区）
FADE_FROM = 0.84   # 从 84% 高度起向卡片墨色渐隐（座基「沉入暗处」，不留硬切边）
FADE_TO = (30, 23, 28)   # 渐隐到的墨色（卡片竖向渐变在该高度附近的取值）

# ---- D53 灯体压艳（用户：灯「特别艳丽」，与背景不协调）----
LAMP_SAT = 0.42
LAMP_BRI = 0.60
LAMP_CON = 0.90
LAMP_TINT = (64, 40, 16)   # 深棕金，与释迦牟尼铜色同源
LAMP_TINT_A = 0.28

CHROME = os.environ.get(
    'WB_CHROME',
    os.path.expanduser('~/AppData/Local/ms-playwright/chromium_headless_shell-1228/'
                       'chrome-headless-shell-win64/chrome-headless-shell.exe'))


def find_src(keyword):
    """assets-src/lamp/ 里按关键词找原始大图（文件名带生成时间戳）。"""
    for f in sorted(os.listdir(SRC)):
        if keyword in f and f.lower().endswith('.png'):
            return os.path.join(SRC, f)
    raise SystemExit('✗ assets-src/lamp/ 缺少含「%s」的原始图' % keyword)


def save_webp_under_budget(img, path, budget, start_q=85, min_q=42):
    for q in range(start_q, min_q - 1, -5):
        img.save(path, 'WEBP', quality=q, method=6)
        if os.path.getsize(path) <= budget:
            return 'webp q=%d' % q
    return 'webp 最小档仍超'


def save_jpeg_under_budget(img, path, budget, start_q=62, min_q=38):
    for q in range(start_q, min_q - 1, -4):
        img.save(path, 'JPEG', quality=q, optimize=True)
        if os.path.getsize(path) <= budget:
            return 'jpeg q=%d' % q
    return 'jpeg 最小档仍超'


# ---------------------------------------------------------------- 1. 释迦牟尼背景
def do_buddha():
    src = find_src('Sakyamuni')
    img = Image.open(src).convert('RGB')
    w, h = img.size
    # 右下角有「AI生成」水印 → 裁掉底部 6%（座基以下为暗部，无主体损失）
    img = img.crop((0, 0, w, int(h * 0.94)))
    # 目标 620 宽（卡片 620rpx，@1x 足够；手机端由系统上采样）
    tw = 620
    img = img.resize((tw, int(img.height * tw / img.width)), Image.LANCZOS)
    # 轻微模糊：既贴合「色罩」的柔和观感，又显著降低 JPEG 体积
    img = img.filter(ImageFilter.GaussianBlur(1.1))
    img = ImageEnhance.Brightness(img).enhance(0.86)
    img = ImageEnhance.Color(img).enhance(0.78)
    # 色罩：夜蓝 → 暗红的垂直渐变（与卡片既有墨色同族，不引入新墨）
    veil = Image.new('RGB', img.size)
    top, bot = (11, 30, 54), (107, 26, 26)
    px = veil.load()
    for y in range(img.height):
        t = y / max(1, img.height - 1)
        c = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3))
        for x in range(img.width):
            px[x, y] = c
    img = Image.blend(img, veil, 0.36)
    # 暗角：四周压暗，中心留给主尊
    vig = Image.new('L', img.size, 0)
    d = ImageDraw.Draw(vig)
    d.ellipse((-img.width * 0.28, -img.height * 0.18,
               img.width * 1.28, img.height * 1.05), fill=255)
    vig = vig.filter(ImageFilter.GaussianBlur(80))
    dark = ImageEnhance.Brightness(img).enhance(0.62)
    img = Image.composite(img, dark, vig)
    # ---- D53：裁到 90% 高 + 底部渐隐。目的 = 让「供桌线」（灯座所站的那条线）
    #      固定在产物图 92% 处，CSS 侧灯座挂 bottom:8% 即与之共线（见文件头契约）。
    #      渐隐让座基「沉入暗处」，避免硬切边。----
    w2, h2 = img.size
    img = img.crop((0, 0, w2, int(h2 * CROP_TO)))
    w2, h2 = img.size
    fade_top = int(h2 * FADE_FROM)
    if fade_top < h2 - 2:
        band = Image.new('RGB', (w2, h2 - fade_top), FADE_TO)
        mask = Image.new('L', (w2, h2 - fade_top), 0)
        mp = mask.load()
        for y in range(h2 - fade_top):
            v = int(255 * (y / max(1, h2 - fade_top - 1)) ** 1.25)
            for x in range(w2):
                mp[x, y] = v
        img.paste(band, (0, fade_top), mask)
    out = os.path.join(IMAGES, 'buddha-bg.jpg')
    how = save_jpeg_under_budget(img, out, BUDDHA_BUDGET)
    print('  %-16s %6.1fKB / 上限 %5.1fKB  %s' % (
        'buddha-bg.jpg', os.path.getsize(out) / KB, BUDDHA_BUDGET / KB, how))


# ---------------------------------------------------------------- 2. 鎏金酥油灯
def do_lamp():
    src = find_src('ornate')
    img = Image.open(src).convert('RGBA')
    w, h = img.size
    px = img.load()
    # 亮度键控：max(R,G,B) → alpha（纯黑背景 → 透明；灯体亮部 → 不透明）
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            m = max(r, g, b)
            alpha = int(max(0.0, min(1.0, (m - 10) / 90.0)) * 255)
            px[x, y] = (r, g, b, alpha)
    # 右下角「AI生成」水印：键控前是灰字（亮度中等，会被保留）→ 按区域强制清零。
    # 灯体最宽处（碗沿）在 x<0.74W，底座右缘 <0.64W，该矩形不与主体相交。
    clean = Image.new('L', (w, h), 0)
    clean.paste(img.split()[3], (0, 0))
    dc = ImageDraw.Draw(clean)
    dc.rectangle((int(w * 0.74), int(h * 0.82), w, h), fill=0)
    img.putalpha(clean.filter(ImageFilter.GaussianBlur(0.8)))
    bbox = img.split()[3].point(lambda v: 255 if v > 46 else 0).getbbox()
    img = img.crop(bbox)
    # 高度 500（卡片内显示约 300rpx 宽 ≈ 415rpx 高，@1.2x 足够清晰；银饰细节密，
    # q45 档实测 560px=70.6KB / 500px=59.5KB 均超 → 480px 落回预算内）
    th = 480
    if img.height > th:
        img = img.resize((int(img.width * th / img.height), th), Image.LANCZOS)
    # ---- D53 压艳：饱和 .42 / 亮度 .60 / 对比 .90 + 深棕金罩 28% ----
    # 原图亮银 + 高饱和金 + 绿松石，在夜色底图上「跳」出来；压完落到暗青铜金，
    # 与释迦牟尼铜色同源。注意再压到 .32/.50 錾刻花纹就糊了（三档对比图已验证）。
    img = ImageEnhance.Color(img).enhance(LAMP_SAT)
    img = ImageEnhance.Brightness(img).enhance(LAMP_BRI)
    img = ImageEnhance.Contrast(img).enhance(LAMP_CON)
    # 罩色必须乘上灯体自身的 alpha：否则会给整张透明区镀一层棕雾（RGBA 合成踩坑，
    # 与 D49 记录的「alpha 被应用两次」是同一类错误）
    tint_layer = Image.new('RGBA', img.size, LAMP_TINT + (255,))
    tint_layer.putalpha(img.split()[3].point(lambda v: int(v * LAMP_TINT_A)))
    img.alpha_composite(tint_layer)
    out = os.path.join(IMAGES, 'lamp.webp')
    how = save_webp_under_budget(img, out, LAMP_BUDGET)
    print('  %-16s %6.1fKB / 上限 %5.1fKB  %s  %dx%d' % (
        'lamp.webp', os.path.getsize(out) / KB, LAMP_BUDGET / KB, how, img.width, img.height))


# ---------------------------------------------------------------- 3. 写实火苗
FLAME_SVG = """<svg width="{W}" height="{H}" viewBox="0 0 240 420" xmlns="http://www.w3.org/2000/svg">
<defs>
  <radialGradient id="glow" cx="0.5" cy="0.62" r="0.62">
    <stop offset="0" stop-color="#FFB44D" stop-opacity="0.62"/>
    <stop offset="0.55" stop-color="#F08A28" stop-opacity="0.2"/>
    <stop offset="1" stop-color="#F08A28" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="outer" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#FFC963"/>
    <stop offset="0.42" stop-color="#FFA032"/>
    <stop offset="0.82" stop-color="#F0761F"/>
    <stop offset="1" stop-color="#D85E14"/>
  </linearGradient>
  <linearGradient id="core" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#FFFBE8"/>
    <stop offset="0.55" stop-color="#FFEB9E"/>
    <stop offset="1" stop-color="#FFC85E"/>
  </linearGradient>
  <radialGradient id="blue" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#8FC1F2" stop-opacity="0.55"/>
    <stop offset="1" stop-color="#8FC1F2" stop-opacity="0"/>
  </radialGradient>
  <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur stdDeviation="2.4"/>
  </filter>
</defs>
<ellipse cx="120" cy="258" rx="112" ry="156" fill="url(#glow)"/>
<path d="M 120 398 C 64 344, 48 268, 76 196 C 94 148, 111 96, 120 28
         C 129 96, 146 148, 164 196 C 192 268, 176 344, 120 398 Z"
      fill="url(#outer)" filter="url(#soft)"/>
<path d="M 120 384 C 88 348, 80 292, 98 244 C 108 216, 116 186, 120 148
         C 124 186, 132 216, 142 244 C 160 292, 152 348, 120 384 Z"
      fill="url(#core)" filter="url(#soft)" opacity="0.95"/>
<ellipse cx="120" cy="376" rx="34" ry="22" fill="url(#blue)"/>
</svg>"""


def do_flame():
    SS = 2
    W, H = 240 * SS, 420 * SS
    html = ('<!doctype html><html><head><meta charset="utf-8"><style>'
            'html,body{margin:0;padding:0;background:transparent;width:%dpx;height:%dpx;'
            'overflow:hidden;}</style></head><body>%s</body></html>'
            % (W, H, FLAME_SVG.replace('{W}', str(W)).replace('{H}', str(H))))
    os.makedirs(TMP, exist_ok=True)
    hp = os.path.join(TMP, '_flame.html')
    open(hp, 'w', encoding='utf-8').write(html)
    raw = os.path.join(TMP, '_flame_raw.png')
    if os.path.exists(raw):
        os.remove(raw)
    cmd = [CHROME, '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
           '--hide-scrollbars', '--force-device-scale-factor=1',
           '--virtual-time-budget=3000', '--default-background-color=00000000',
           '--screenshot=' + raw, '--window-size=%d,%d' % (W, H), 'file:///' + hp.replace('\\', '/')]
    r = subprocess.run(cmd, capture_output=True, timeout=120)
    if not os.path.exists(raw):
        raise SystemExit('✗ Chrome 渲染火苗失败：%s' % r.stderr.decode('utf-8', 'ignore')[:300])
    img = Image.open(raw).convert('RGBA')
    img = img.crop(img.split()[3].getbbox())
    img = img.resize((max(1, img.width // SS), max(1, img.height // SS)), Image.LANCZOS)
    out = os.path.join(IMAGES, 'flame.webp')
    how = save_webp_under_budget(img, out, FLAME_BUDGET, start_q=90, min_q=60)
    print('  %-16s %6.1fKB / 上限 %5.1fKB  %s  %dx%d' % (
        'flame.webp', os.path.getsize(out) / KB, FLAME_BUDGET / KB, how, img.width, img.height))


def main():
    ap = argparse.ArgumentParser(description='万家灯火跳窗改版资产（D50）')
    ap.add_argument('--flame-only', action='store_true')
    a = ap.parse_args()
    os.makedirs(IMAGES, exist_ok=True)
    if not a.flame_only:
        print('生成跳窗资产 → images/')
        do_buddha()
        do_lamp()
    do_flame()


if __name__ == '__main__':
    main()
