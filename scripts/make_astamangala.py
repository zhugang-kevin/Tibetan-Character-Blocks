#!/usr/bin/env python
# scripts/make_astamangala.py — 程序绘制「吉祥八宝」无缝纹样砖 → images/pat-tile.png
# 用途：全局背景 sc-pattern（opacity 0.10，纯装饰纹理）。改纹样重跑本脚本即可：
#   .venv python scripts/make_astamangala.py
# 设计约束：单色古金描线（#C9A227）、透明底、4×2 排布、无缝（网格对齐即可无缝平铺）。
import math
import os
from PIL import Image, ImageDraw

S = 4  # 4x 超采样抗锯齿
CELL = 64          # 单元边长（1x）
COLS, ROWS = 4, 2
W, H = CELL * COLS, CELL * ROWS

GOLD = (201, 162, 39, 235)   # 古金描线
img = Image.new("RGBA", (W * S, H * S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
LW = 3.2 * S                 # 线宽


def cell_origin(ix, iy):
    return ix * CELL * S, iy * CELL * S


def P(x, y, ox, oy):
    return (ox + x * S, oy + y * S)


def line(x1, y1, x2, y2, ox, oy, w=LW):
    d.line([P(x1, y1, ox, oy), P(x2, y2, ox, oy)], fill=GOLD, width=int(w))


def circle(x, y, r, ox, oy, w=LW, fill=None):
    d.ellipse([P(x - r, y - r, ox, oy), P(x + r, y + r, ox, oy)],
              outline=GOLD, width=int(w), fill=fill)


def poly(pts, ox, oy, w=LW, close=True):
    ps = [P(x, y, ox, oy) for (x, y) in pts]
    if close:
        ps.append(ps[0])
    d.line(ps, fill=GOLD, width=int(w), joint="curve")


# 1. 法轮（dharma wheel）：外圈 + 八辐 + 轮毂
def wheel(ox, oy):
    circle(32, 32, 22, ox, oy)
    for k in range(8):
        a = math.pi / 4 * k
        line(32, 32, 32 + 21 * math.cos(a), 32 + 21 * math.sin(a), ox, oy, w=LW * 0.8)
    circle(32, 32, 4.5, ox, oy, fill=GOLD)


# 2. 吉祥结（endless knot，简化交织）：外方框 + 45° 内方框 + 角连线
def knot(ox, oy):
    poly([(16, 16), (48, 16), (48, 48), (16, 48)], ox, oy)
    poly([(24, 32), (32, 24), (40, 32), (32, 40)], ox, oy)
    line(16, 16, 24, 32, ox, oy, w=LW * 0.8)
    line(48, 16, 40, 32, ox, oy, w=LW * 0.8)
    line(16, 48, 24, 40, ox, oy, w=LW * 0.8)
    line(48, 48, 40, 40, ox, oy, w=LW * 0.8)
    line(24, 32, 24, 40, ox, oy, w=LW * 0.8)
    line(40, 32, 40, 40, ox, oy, w=LW * 0.8)
    line(32, 24, 40, 32, ox, oy, w=LW * 0.8)
    line(32, 40, 24, 40, ox, oy, w=LW * 0.8)


# 3. 莲花（lotus）：五瓣 + 底弧
def lotus(ox, oy):
    # 中瓣
    poly([(32, 12), (38, 26), (32, 40), (26, 26)], ox, oy)
    # 左右内瓣
    poly([(20, 18), (26, 30), (24, 40), (18, 32)], ox, oy)
    poly([(44, 18), (38, 30), (40, 40), (46, 32)], ox, oy)
    # 左右外瓣
    poly([(10, 28), (18, 36), (18, 42), (12, 38)], ox, oy)
    poly([(54, 28), (46, 36), (46, 42), (52, 38)], ox, oy)
    # 托底
    line(14, 46, 50, 46, ox, oy, w=LW)


# 4. 宝伞（parasol）：伞面圆顶 + 伞骨 + 杆 + 顶饰
def umbrella(ox, oy):
    d.pieslice([P(10, 12, ox, oy), P(54, 56, ox, oy)], 180, 360, outline=GOLD, width=int(LW))
    for xx in (22, 32, 42):
        line(32, 12, xx, 34, ox, oy, w=LW * 0.7)
    line(32, 34, 32, 54, ox, oy, w=LW)
    line(26, 54, 38, 54, ox, oy, w=LW * 0.9)
    circle(32, 9, 2.5, ox, oy, fill=GOLD)


# 5. 金鱼（golden fish，一对）
def fish(ox, oy):
    for i, dy in enumerate((0, 20)):
        yy = 22 + dy
        flip = 1 if i == 0 else -1
        d.ellipse([P(18, yy - 7, ox, oy), P(42, yy + 7, ox, oy)], outline=GOLD, width=int(LW))
        poly([(42, yy), (52, yy - 7 * flip), (52, yy + 7 * flip)], ox, oy, w=LW * 0.8)
        circle(24, yy - 1, 1.5, ox, oy, fill=GOLD)


# 6. 宝瓶（vase）：瓶身 + 颈 + 盖 + 底
def vase(ox, oy):
    d.ellipse([P(18, 24, ox, oy), P(46, 50, ox, oy)], outline=GOLD, width=int(LW))
    poly([(26, 26), (26, 18), (38, 18), (38, 26)], ox, oy, w=LW * 0.9)
    d.ellipse([P(24, 13, ox, oy), P(40, 20, ox, oy)], outline=GOLD, width=int(LW * 0.9))
    line(22, 54, 42, 54, ox, oy, w=LW)


# 7. 胜利幢（banner）：杆 + 幢身 + 垂穗
def banner(ox, oy):
    line(32, 8, 32, 56, ox, oy, w=LW)
    poly([(20, 14), (44, 14), (44, 36), (32, 42), (20, 36)], ox, oy, w=LW * 0.9)
    for xx in (24, 32, 40):
        line(xx, 44, xx, 52, ox, oy, w=LW * 0.7)


# 8. 右旋海螺（conch）：螺旋壳 + 底足
def conch(ox, oy):
    circle(30, 28, 14, ox, oy)
    circle(30, 28, 7, ox, oy, w=LW * 0.8)
    circle(30, 28, 2.5, ox, oy, fill=GOLD)
    poly([(42, 34), (54, 44), (40, 48)], ox, oy, w=LW * 0.9)
    line(20, 46, 44, 50, ox, oy, w=LW * 0.8)


GRID = [
    [fish, vase, lotus, wheel],       # 上行：金鱼 宝瓶 莲花 法轮
    [conch, knot, banner, umbrella],  # 下行：海螺 吉祥结 胜利幢 宝伞
]
for iy, row in enumerate(GRID):
    for ix, fn in enumerate(row):
        fn(*cell_origin(ix, iy))

img = img.resize((W, H), Image.LANCZOS)
out = os.path.join(os.path.dirname(__file__), "..", "images", "pat-tile.png")
img.save(out, "PNG", optimize=True)
print("written", os.path.normpath(out), img.size)
