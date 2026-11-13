#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/make-brand-assets.py — 生成「藏趣方块」品牌资产（D152）

## 符号选择：牦牛头（不是藏文、不是宗教符号）
  · 哈达 / 经幡 / 转经筒 / 八吉祥 都带**宗教属性** → 国宗发〔2017〕88 号第 2 条
    禁止以佛教道教名义进行商业宣传，做品牌主符号风险太高。
  · **牦牛是纯世俗的藏地符号**，全球辨识度极高，轮廓简洁，缩到 48px 仍认得出。
  · 用户明确要求「不要文字」→ 全套资产零文字，只有图形。

## 流程
  1. 取 `brand/src/` 里的牦牛稿（AI 生成，纯白底、无水印）
  2. 按"与白色的差值"做柔和抠图（保留抗锯齿边缘），统一上品牌金色
  3. 合成到圆角红底 + 双金边 + 四角菱纹的图标底版
  4. 按各平台尺寸重绘/缩放导出

## 输出（brand/，已加入 packOptions.ignore，不进小程序包）
  logo-{2048,1024,512,256,200,180,144,128,96,72,64,48,32}.png
  banner-{900x383,750x400,1080x1080,1920x1080,1200x628}.png
"""
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'brand', 'src')
OUT = os.path.join(ROOT, 'brand')
os.makedirs(OUT, exist_ok=True)

EMBLEM_SRC = os.path.join(SRC, 'Flat_vector_icon_of_a_TIBETAN__2026-10-21T12-04-17.png')

RED_TOP, RED_BOT = (150, 34, 30), (104, 22, 20)
GOLD, GOLD_L = (226, 186, 106), (240, 205, 130)


def vgrad(size, top, bot):
    w, h = size
    col = Image.new('RGB', (1, h))
    px = col.load()
    for y in range(h):
        t = y / max(1, h - 1)
        px[0, y] = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3))
    return col.resize((w, h))


def load_emblem():
    """白底 → 透明，统一金色，裁到内容框"""
    im = Image.open(EMBLEM_SRC).convert('RGB')
    w, h = im.size
    px = im.load()
    alpha = Image.new('L', (w, h), 0)
    ap = alpha.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            dv = 255 - min(r, g, b)           # 与白的差值
            ap[x, y] = 0 if dv <= 6 else min(255, (dv - 6) * 6)
    solid = Image.new('RGBA', (w, h), GOLD_L + (255,))
    solid.putalpha(alpha)
    em = solid.crop(solid.getbbox())
    # 强制左右对称：取左半 + 镜像。AI 稿两角不完全一致，图标尺度下看得出来。
    ww, hh = em.size
    half = ww // 2
    left = em.crop((0, 0, half, hh))
    sym = Image.new('RGBA', (half * 2, hh), GOLD_L + (0,))
    sym.paste(left, (0, 0))
    sym.paste(left.transpose(Image.FLIP_LEFT_RIGHT), (half, 0))
    return sym.crop(sym.getbbox())


EMBLEM = load_emblem()


def diamond(d, cx, cy, r, fill):
    d.polygon([(cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)], fill=fill)


def tile(S):
    """圆角红底 + 双金边 + 四角菱纹 + 牦牛"""
    img = vgrad((S, S), RED_TOP, RED_BOT).convert('RGBA')
    m = Image.new('L', (S, S), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.225), fill=255)
    img.putalpha(m)
    d = ImageDraw.Draw(img)

    d.rounded_rectangle([int(S*.050)] * 2 + [S - int(S*.050)] * 2, radius=int(S * .195),
                        outline=GOLD, width=max(2, round(S * .013)))
    d.rounded_rectangle([int(S*.093)] * 2 + [S - int(S*.093)] * 2, radius=int(S * .160),
                        outline=(198, 156, 88, 170), width=max(1, round(S * .004)))

    for fx in (0.135, 0.865):
        for fy in (0.135, 0.865):
            diamond(d, S * fx, S * fy, S * 0.017, (240, 210, 150, 225))
    for fx in (0.086, 0.914):
        diamond(d, S * fx, S * 0.5, S * 0.010, (226, 186, 106, 180))

    inner = S * 0.70
    ew, eh = EMBLEM.size
    scale = min(inner / ew, inner / eh)
    nw, nh = max(1, int(ew * scale)), max(1, int(eh * scale))
    em = EMBLEM.resize((nw, nh), Image.LANCZOS)
    ex, ey = (S - nw) // 2, int((S - nh) / 2 - S * 0.012)

    img.alpha_composite(em, (ex, ey))
    return img


made = []


def save(img, name, rgb=False):
    p = os.path.join(OUT, name)
    (img.convert('RGB') if rgb else img).save(p, quality=95)
    made.append(p)


MASTER = tile(2048)
save(MASTER, 'logo-2048.png')
for s in (1024, 512, 256, 200, 180, 144, 128, 96, 72, 64, 48, 32):
    save(MASTER.resize((s, s), Image.LANCZOS), f'logo-{s}.png')


def banner(W, H):
    """无文字横幅：渐变底 + 细斜纹 + 上下金线 + 居中牦牛 + 左右对称细线"""
    img = vgrad((W, H), RED_TOP, RED_BOT).convert('RGBA')
    d = ImageDraw.Draw(img)
    d.line([(0, int(H*.055)), (W, int(H*.055))], fill=(226, 186, 106, 75), width=2)
    d.line([(0, int(H*.945)), (W, int(H*.945))], fill=(226, 186, 106, 75), width=2)

    glow = Image.new('L', (W, H), 0)
    ImageDraw.Draw(glow).ellipse([W*0.18, -H*0.25, W*0.82, H*1.25], fill=40)
    glow = glow.filter(ImageFilter.GaussianBlur(min(W, H) * 0.09))
    layer = Image.new('RGBA', (W, H), (255, 226, 180, 0))
    layer.putalpha(glow)
    img.alpha_composite(layer)

    eh = int(H * 0.66)
    ew = int(EMBLEM.size[0] * eh / EMBLEM.size[1])
    if ew > W * 0.32:
        ew = int(W * 0.32)
        eh = int(EMBLEM.size[1] * ew / EMBLEM.size[0])
    em = EMBLEM.resize((ew, eh), Image.LANCZOS)
    img.alpha_composite(em, ((W - ew) // 2, (H - eh) // 2))

    ly = H // 2
    for sign in (-1, 1):
        a = W / 2 + sign * (ew / 2 + W * 0.030)
        b = W / 2 + sign * (ew / 2 + W * 0.105)
        x1, x2 = min(a, b), max(a, b)
        if 0 <= x1 and x2 <= W:
            d.line([(x1, ly), (x2, ly)], fill=(226, 186, 106, 150), width=2)
            diamond(d, b, ly, max(3, H * 0.008), (226, 186, 106, 200))
    return img


for name, (w, h) in {
    'banner-900x383.png': (900, 383),
    'banner-750x400.png': (750, 400),
    'banner-1080x1080.png': (1080, 1080),
    'banner-1920x1080.png': (1920, 1080),
    'banner-1200x628.png': (1200, 628),
}.items():
    save(banner(w, h), name, rgb=True)

for p in made:
    print(os.path.relpath(p, ROOT), os.path.getsize(p) // 1024, 'KB')
