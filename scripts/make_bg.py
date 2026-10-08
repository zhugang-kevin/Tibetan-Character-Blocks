#!/usr/bin/env python
# -*- coding: utf-8 -*-
# scripts/make_bg.py — 程序绘制 C 组背景母图（可复现，随机种子固定）
#
# 产出（写入 assets-src/bg/，再由 scripts/prepare-assets.py --bg 加工进 images/）：
#   bg-global.png  1170×2532  全局底图：夜色深蓝 #0B1E36 → 暗红 #6B1A1A 竖向柔和渐变
#                             + 极淡八宝卷草暗纹（≈6%，取自 pat-tile.png 放大 2×）
#                             + 中央暖光微亮（#FFD98A ≤10% 透明度）；禁大块亮色、无纯白
#   bg-sky.png      750×800   游戏页夜空层（透明）：低密度星点（顶部最亮 → 向下渐隐至全透明）
#                             + 细弯月（非大圆盘）+ 两抹极光微光
#   bg-ground.png   750×400   雪山连峰 + 布达拉宫式建筑剪影（透明）：实心深色 #10203A，
#                             远山感（多正弦叠加 + 圆滑，非卡通锯齿），底部对齐
#   grain.png       128×128   藏纸纤维颗粒（透明）：暖灰点 + 横向纤维，最大不透明度 ≈6%，可平铺
#
# 规格书：docs/asset-spec-images.md §四（C 组）；预算见 prepare-assets.py BUDGET。
# 用法：python scripts/make_bg.py [--global|--sky|--ground|--grain]
import argparse
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets-src', 'bg')
PAT = os.path.join(ROOT, 'images', 'pat-tile.png')

SEED = 20261008


def lerp(a, b, t):
    return a + (b - a) * t


def lerp3(c1, c2, t):
    return tuple(int(round(lerp(c1[i], c2[i], t))) for i in range(3))


# ---------------------------------------------------------------- C1 全局底图
GLOBAL_W, GLOBAL_H = 1170, 2532
GLOBAL_STOPS = [
    (0.00, (11, 30, 54)),      # #0B1E36 夜色深蓝
    (0.26, (16, 35, 59)),
    (0.50, (28, 31, 53)),      # 蓝→红的低饱和过渡，避免脏灰
    (0.76, (74, 27, 33)),
    (1.00, (107, 26, 26)),     # #6B1A1A 暗红
]


def do_global():
    W, H = GLOBAL_W, GLOBAL_H
    base = Image.new('RGB', (W, H))
    px = base.load()
    seg = 0
    for y in range(H):
        t = y / (H - 1)
        while seg < len(GLOBAL_STOPS) - 2 and t > GLOBAL_STOPS[seg + 1][0]:
            seg += 1
        t0, c0 = GLOBAL_STOPS[seg]
        t1, c1 = GLOBAL_STOPS[seg + 1]
        k = 0.0 if t1 == t0 else (t - t0) / (t1 - t0)
        k = max(0.0, min(1.0, k))
        col = lerp3(c0, c1, k)
        for x in range(W):
            px[x, y] = col

    # 中央暖光微亮（#FFD98A，中心 ≈10%，向外平滑衰减）
    glow = Image.new('L', (W, H), 0)
    gd = ImageDraw.Draw(glow)
    cx, cy, R = W * 0.50, H * 0.40, W * 0.70
    steps = 46
    for i in range(steps, 0, -1):
        r = R * i / steps
        a = int(255 * 0.10 * (1.0 - (i / steps)) ** 1.35)
        gd.ellipse([cx - r, cy - r * 1.25, cx + r, cy + r * 1.25], fill=a)
    glow = glow.filter(ImageFilter.GaussianBlur(60))
    base = Image.composite(Image.new('RGB', (W, H), (255, 217, 138)), base,
                           glow.point(lambda v: v))

    # 八宝卷草暗纹：pat-tile 放大 2×，铺满，整体 ≈6% 不透明度（规格书 §四 C1：5–8%）。
    # 与页面上的 .sc-pattern（10% 金纹，砖 60rpx≈30px）**尺度差 ~17 倍**：这里是大尺度水印，
    # 页面那层是细纹理，两层叠出层次，不会读成同一张图案。
    # ⚠️ 实现要点：先拼**单通道 alpha**，再 image.composite 一次性上色——不能拿 RGBA 当自己的
    #    mask 去 paste（alpha 会被应用两次，15/255 直接塌成 1/255，图案静默消失，实测踩过）。
    tile = Image.open(PAT).convert('RGBA')
    tile = tile.resize((tile.width * 2, tile.height * 2), Image.LANCZOS)
    tα = tile.split()[3].filter(ImageFilter.GaussianBlur(0.6))
    amask = Image.new('L', (W, H), 0)
    for ty in range(0, H, tα.height):
        for tx in range(0, W, tα.width):
            amask.paste(tα, (tx, ty))
    amask = amask.point(lambda v: int(v * 0.06))
    base = Image.composite(Image.new('RGB', (W, H), (201, 162, 39)), base, amask)

    # 顶部压一档，给状态栏留出安静的暗区
    top = Image.new('L', (W, H), 0)
    ImageDraw.Draw(top).rectangle([0, 0, W, int(H * 0.05)], fill=46)
    top = top.filter(ImageFilter.GaussianBlur(40))
    base = Image.composite(Image.new('RGB', (W, H), (6, 14, 26)), base, top)

    out = os.path.join(OUT, 'bg-global.png')
    base.save(out)
    print('  bg-global.png  %dx%d  %d B' % (W, H, os.path.getsize(out)))


# ---------------------------------------------------------------- C2 夜空层
SKY_W, SKY_H = 750, 800
SKY_SS = 2                      # 超采样倍率


def sky_fade(y):
    """顶部最亮，向下渐隐到全透明的 alpha 系数（1× 坐标）。"""
    if y >= 720:
        return 0.0
    return max(0.0, 1.0 - (y / 720.0) ** 1.25)


def do_sky():
    rnd = random.Random(SEED + 2)
    W, H, S = SKY_W * SKY_SS, SKY_H * SKY_SS, SKY_SS
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 极光微光（先画，被星点压住）
    for (cx, cy, rw, rh, col, al) in [
        (W * 0.30, 210 * S, 640 * S, 120 * S, (36, 113, 163), 0.075),
        (W * 0.74, 330 * S, 560 * S, 100 * S, (23, 107, 60), 0.050),
    ]:
        g = Image.new('L', (W, H), 0)
        ImageDraw.Draw(g).ellipse([cx - rw, cy - rh, cx + rw, cy + rh], fill=int(255 * al))
        g = g.filter(ImageFilter.GaussianBlur(46 * S))
        img = Image.alpha_composite(img, Image.merge('RGBA', (
            Image.new('L', (W, H), col[0]), Image.new('L', (W, H), col[1]),
            Image.new('L', (W, H), col[2]), g)))
        d = ImageDraw.Draw(img)

    # 星点：低密度（≈260 颗），y 偏向顶部
    for _ in range(260):
        u = rnd.random()
        y = (u ** 1.75) * 700.0
        x = rnd.random() * SKY_W
        fade = sky_fade(y)
        if fade <= 0.02:
            continue
        r = rnd.choice([0.55, 0.7, 0.85, 1.0, 1.2, 1.5])
        a = int(255 * fade * rnd.uniform(0.35, 0.95))
        col = rnd.choice([(255, 250, 235), (255, 240, 214), (222, 236, 255)])
        if rnd.random() < 0.14:                      # 一部分星点带柔光
            gr = r * 3.4
            g = Image.new('L', (W, H), 0)
            ImageDraw.Draw(g).ellipse([x * S - gr * S, y * S - gr * S, x * S + gr * S, y * S + gr * S],
                                      fill=int(a * 0.22))
            g = g.filter(ImageFilter.GaussianBlur(2.2 * S))
            img = Image.alpha_composite(img, Image.merge('RGBA', (
                Image.new('L', (W, H), col[0]), Image.new('L', (W, H), col[1]),
                Image.new('L', (W, H), col[2]), g)))
            d = ImageDraw.Draw(img)
        d.ellipse([x * S - r * S, y * S - r * S, x * S + r * S, y * S + r * S],
                  fill=(col[0], col[1], col[2], a))

    # 亮星：十字星芒（6 颗）
    for (x, y, r) in [(120, 76, 1.9), (286, 132, 1.6), (508, 58, 2.1),
                      (622, 168, 1.5), (58, 236, 1.4), (414, 96, 1.6)]:
        fade = sky_fade(y)
        a = int(240 * fade)
        g = Image.new('L', (W, H), 0)
        ImageDraw.Draw(g).ellipse([x * S - r * 4 * S, y * S - r * 4 * S, x * S + r * 4 * S, y * S + r * 4 * S],
                                  fill=int(a * 0.16))
        g = g.filter(ImageFilter.GaussianBlur(3.0 * S))
        img = Image.alpha_composite(img, Image.merge('RGBA', (
            Image.new('L', (W, H), 255), Image.new('L', (W, H), 248),
            Image.new('L', (W, H), 226), g)))
        d = ImageDraw.Draw(img)
        d.ellipse([x * S - r * S, y * S - r * S, x * S + r * S, y * S + r * S],
                  fill=(255, 251, 238, a))
        flare = int(a * 0.5)
        d.line([(x - r * 5.2) * S, y * S, (x + r * 5.2) * S, y * S], fill=(255, 250, 235, flare), width=S)
        d.line([x * S, (y - r * 5.2) * S, x * S, (y + r * 5.2) * S], fill=(255, 250, 235, flare), width=S)

    # 细弯月（右上）：外圆减偏移圆 = 月牙；再叠一层柔光
    mx, my, mr = 596, 92, 30
    halo = Image.new('L', (W, H), 0)
    ImageDraw.Draw(halo).ellipse([(mx - 96) * S, (my - 96) * S, (mx + 96) * S, (my + 96) * S], fill=int(255 * 0.085))
    halo = halo.filter(ImageFilter.GaussianBlur(30 * S))
    img = Image.alpha_composite(img, Image.merge('RGBA', (
        Image.new('L', (W, H), 255), Image.new('L', (W, H), 240),
        Image.new('L', (W, H), 205), halo)))
    d = ImageDraw.Draw(img)
    d.ellipse([(mx - mr) * S, (my - mr) * S, (mx + mr) * S, (my + mr) * S], fill=(255, 246, 220, 236))
    d.ellipse([(mx - mr + 13) * S, (my - mr - 8) * S, (mx + mr + 13) * S, (my + mr - 8) * S], fill=(0, 0, 0, 0))

    # 全局渐隐：整层 alpha × sky_fade(y)
    img = img.resize((SKY_W, SKY_H), Image.LANCZOS)
    a = img.split()[3]
    rows = a.load()
    for y in range(SKY_H):
        f = sky_fade(y)
        if f >= 0.999:
            continue
        for x in range(SKY_W):
            rows[x, y] = int(rows[x, y] * f)
    out = os.path.join(OUT, 'bg-sky.png')
    img.save(out)
    print('  bg-sky.png  %dx%d  %d B' % (SKY_W, SKY_H, os.path.getsize(out)))


# ---------------------------------------------------------------- C3 剪影层
GND_W, GND_H = 750, 400
GND_SS = 2
INK = (16, 32, 58)          # #10203A


def ridge(rnd, n, amp, base, waves):
    """多正弦叠加的圆滑山脊线（远山感，非锯齿）。返回 y(x) 采样表。"""
    phases = [rnd.uniform(0, math.tau) for _ in waves]
    ys = []
    for i in range(n):
        x = i / (n - 1)
        v = 0.0
        for (w, weight, cusp) in waves:
            s = math.sin(math.tau * x * w + phases[0])
            if cusp:
                s = abs(s) ** 1.15 * 2 - 0.72          # 尖峰感，轻度
            v += weight * s
        ys.append(base - amp * v)
    # 轻度圆滑，去掉过硬的折点
    out = []
    for i in range(n):
        lo, hi = max(0, i - 3), min(n, i + 4)
        out.append(sum(ys[lo:hi]) / (hi - lo))
    return out


def do_ground():
    rnd = random.Random(SEED + 3)
    W, H, S = GND_W * GND_SS, GND_H * GND_SS, GND_SS
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))

    def fill_under(ys, alpha):
        poly = [(i * S, ys[i] * S) for i in range(0, len(ys))] + [(W, H), (0, H)]
        layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(layer).polygon(poly, fill=(INK[0], INK[1], INK[2], int(255 * alpha)))
        return layer

    # 远山（淡）→ 中山 → 近山（实）
    far = ridge(rnd, GND_W, 62, 232, [(1.1, 0.52, 0), (2.7, 0.26, 0), (5.3, 0.14, 1), (9.1, 0.08, 0)])
    mid = ridge(rnd, GND_W, 46, 292, [(0.8, 0.50, 0), (2.1, 0.27, 0), (4.4, 0.15, 1), (7.7, 0.08, 0)])
    near = ridge(rnd, GND_W, 30, 348, [(0.6, 0.48, 0), (1.7, 0.28, 0), (3.6, 0.15, 0), (6.3, 0.09, 0)])

    img = Image.alpha_composite(img, fill_under(far, 0.42))
    img = Image.alpha_composite(img, fill_under(mid, 0.62))

    # 布达拉宫式建筑剪影：立在**中山的最高峰**上（实景即「宫堡骑山」），
    # 底座不画平直线，而是沿脊线裁切 —— 否则会在山体上留一个「方块」的边。
    span = range(int(GND_W * 0.33), int(GND_W * 0.67))
    cx = max(span, key=lambda i: -mid[i])           # 中央窗口内的最高点
    base_y = mid[int(cx)]
    HW = 80                                          # 半宽（建筑整体 160px，宽:高 ≈ 2.3:1）
    hL = base_y - mid[int(cx - HW)]
    hR = base_y - mid[int(cx + HW)]
    inner = [
        (-74, 12), (-70, 18), (-70, 24),             # 左外坡（收分）
        (-64, 28), (-64, 36),                        # 一级台地
        (-56, 40), (-48, 44),                        # 二级台地
        (-43, 54), (-36, 58),                        # 中央体起坡
        (-32, 68), (-14, 68),                        # 顶部收口（左半）
        (14, 68), (32, 68),                          # 顶部（右半）
        (36, 58), (43, 54),
        (48, 44), (56, 40),
        (64, 36), (64, 28),
        (70, 24), (70, 18), (74, 12),
    ]
    top_pts = [(cx - HW, mid[int(cx - HW)]), (cx - HW, base_y - hL)]
    top_pts += [(cx + dx, base_y - h) for (dx, h) in inner]
    top_pts += [(cx + HW, base_y - hR), (cx + HW, mid[int(cx + HW)])]
    ridge_pts = [(x, mid[int(x)]) for x in range(int(cx + HW), int(cx - HW) - 1, -4)]
    pal = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    pd = ImageDraw.Draw(pal)
    fill = (INK[0], INK[1], INK[2], int(255 * 0.9))
    pd.polygon([(x * S, y * S) for (x, y) in top_pts + ridge_pts], fill=fill)
    # 金顶栉比：中央红宫 3 座 + 两翼各 1 座（小梯形自屋面**向上**起 + 细尖；不加圆珠，圆珠会读成「小旗」）
    for (dx, baseh, w, h) in [(-22, 68, 8, 7), (0, 68, 9, 8), (22, 68, 8, 7),
                              (-60, 40, 6, 5), (60, 40, 6, 5)]:
        ty = base_y - baseh
        pd.polygon([((cx + dx - w) * S, ty * S), ((cx + dx + w) * S, ty * S),
                    ((cx + dx + w * 0.62) * S, (ty - h) * S), ((cx + dx - w * 0.62) * S, (ty - h) * S)],
                   fill=fill)
        pd.rectangle([(cx + dx - 0.8) * S, (ty - h - 4) * S, (cx + dx + 0.8) * S, (ty - h) * S],
                     fill=fill)
    img = Image.alpha_composite(img, pal)

    img = Image.alpha_composite(img, fill_under(near, 0.9))

    img = img.resize((GND_W, GND_H), Image.LANCZOS)
    out = os.path.join(OUT, 'bg-ground.png')
    img.save(out)
    print('  bg-ground.png  %dx%d  %d B' % (GND_W, GND_H, os.path.getsize(out)))


# ---------------------------------------------------------------- C5 颗粒
GRAIN = 128
GRAIN_SS = 3


def do_grain():
    rnd = random.Random(SEED + 5)
    n = GRAIN * GRAIN_SS
    img = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 横向纸纤维：短横线，两端渐隐
    for _ in range(420):
        y = rnd.randrange(n)
        x = rnd.randrange(n)
        ln = rnd.randint(4, 16) * GRAIN_SS
        a = int(255 * rnd.uniform(0.02, 0.055))
        tone = rnd.choice([(255, 250, 238), (236, 226, 206), (214, 202, 182)])
        for k in range(ln):
            f = math.sin(math.pi * k / ln) ** 0.7
            d.point(((x + k) % n, y), fill=(tone[0], tone[1], tone[2], int(a * f)))
    # 纤维斑点
    for _ in range(900):
        x, y = rnd.randrange(n), rnd.randrange(n)
        r = rnd.randint(1, 3) * GRAIN_SS // 2 + 1
        a = int(255 * rnd.uniform(0.015, 0.05))
        tone = rnd.choice([(255, 250, 238), (240, 232, 214), (206, 194, 174)])
        d.ellipse([x - r, y - r, x + r, y + r], fill=(tone[0], tone[1], tone[2], a))

    img = img.resize((GRAIN, GRAIN), Image.LANCZOS)
    out = os.path.join(OUT, 'grain.png')
    img.save(out)
    print('  grain.png  %dx%d  %d B' % (GRAIN, GRAIN, os.path.getsize(out)))


def main():
    ap = argparse.ArgumentParser(description='C 组背景母图生成（规格书 §四）')
    ap.add_argument('--global', dest='g', action='store_true')
    ap.add_argument('--sky', action='store_true')
    ap.add_argument('--ground', action='store_true')
    ap.add_argument('--grain', action='store_true')
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    if not any([a.g, a.sky, a.ground, a.grain]):
        a.g = a.sky = a.ground = a.grain = True
    print('生成 C 组背景母图 → assets-src/bg/')
    if a.g:
        do_global()
    if a.sky:
        do_sky()
    if a.ground:
        do_ground()
    if a.grain:
        do_grain()


if __name__ == '__main__':
    main()
