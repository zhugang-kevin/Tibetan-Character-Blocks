#!/usr/bin/env python
# scripts/make_astamangala.py — 程序绘制「吉祥八宝 + 卷草纹」无缝纹样砖 → images/pat-tile.png
# 用途：全局背景 sc-pattern（opacity 0.10，纯装饰纹理）。改纹样重跑本脚本即可：
#   .venv python scripts/make_astamangala.py
# 设计约束：单色古金描线（#C9A227）、透明底、4×2 排布、无缝（网格对齐即可无缝平铺）。
# 卷草纹（vine scroll）织入八宝之间的缝道，作为底纹骨架 —— 不新增背景层（validate §18 六层不变）。
# 无缝原理：跨边的只有藤蔓。横向主藤周期 = CELL 且 W = 4·CELL，纵向同理 H = 2·CELL，故藤蔓满足 f(x+W) = f(x)；
# 卷须间距 32 且 W/32 为偶数，故绕边重绘与本体旋向一致。八宝每格各不相同，但它们全部内缩
# （最外到格内 x∈[10,54]、y∈[6.5,56]），故符号不参与接缝 —— 判据见文件末尾「边带周期性」自证。
# 藤蔓落在缝道内，与八宝边缘至多相切；两者同为古金描线，相切处读作「织入」而非碰撞。
# 画布放大到 3×3 块、只在正中一块画八宝、藤蔓九块都画，最后裁正中一块再降采样 ——
# 这样降采样时每个输出像素的滤波窗口都完整落在已绘区域内，不会出现 PIL 在图像边缘
# 单边取窗导致的「首列与其余列不周期」的假接缝（实测边缘列可见差一度到 50）。
import math
import os
from PIL import Image, ImageDraw

S = 4  # 4x 超采样抗锯齿
CELL = 64          # 单元边长（1x）
COLS, ROWS = 4, 2
W, H = CELL * COLS, CELL * ROWS

GOLD = (201, 162, 39, 235)   # 古金描线（八宝主体）
VINE = (201, 162, 39, 165)   # 藤蔓浅一档：主次分明，避免卷草纹喧宾夺主（整层本就 0.10 透明度）
# 3×3 块画布；正中一块（偏移 CX,CY）才是最终纹样砖
CX, CY = W * S, H * S
img = Image.new("RGBA", (3 * W * S, 3 * H * S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
LW = 3.2 * S                 # 线宽


def cell_origin(ix, iy):
    return CX + ix * CELL * S, CY + iy * CELL * S


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


# ---------- 卷草纹（vine scroll）----------
# 织入八宝之间的缝道：横向主藤走行缝（y = 0/64/128），纵向主藤走列缝（x = 0/64/…/256），
# 缝上按半格（32px）交替布卷须。所有元素都落在缝道内，不压八宝符号。
VINE_W = LW * 0.55          # 藤蔓比主体符号细一档


def curve(pts, w=VINE_W):
    if len(pts) < 2:
        return
    d.line(pts, fill=VINE, width=int(w), joint="curve")


def stem_h(cy, ox, oy, amp=7.0):
    """横向主藤：y = cy + amp·sin(2πx/CELL)，周期 = CELL，故天然绕边续接。"""
    pts = []
    x = float(-CELL)
    while x <= W + CELL:
        pts.append(P(x, cy + amp * math.sin(2.0 * math.pi * x / CELL), ox, oy))
        x += 1.0
    curve(pts)


def stem_v(cx, ox, oy, amp=6.0):
    """纵向主藤：x = cx + amp·sin(2πy/CELL)，H = 2·CELL → 纵向也绕边续接。"""
    pts = []
    y = float(-CELL)
    while y <= H + CELL:
        pts.append(P(cx + amp * math.sin(2.0 * math.pi * y / CELL), y, ox, oy))
        y += 1.0
    curve(pts)


def volute(cx, cy, ox, oy, r=8.0, turns=1.3, ccw=False):
    """卷须：半径由 r 递减到 0.28r 的对数螺旋，1.3 圈即读作卷草纹的「卷」。"""
    pts = []
    steps = 46
    for i in range(steps + 1):
        t = i / float(steps)
        ang = turns * 2.0 * math.pi * t * (-1.0 if ccw else 1.0)
        rr = r * (1.0 - 0.72 * t)
        pts.append(P(cx + rr * math.cos(ang), cy + rr * math.sin(ang), ox, oy))
    curve(pts)


def vine_lattice_pass(ox, oy):
    # 主藤：行缝 0/64/128，列缝 0/64/…/256
    for cy in (0, CELL, H):
        stem_h(cy, ox, oy)
    for cx in range(0, W + 1, CELL):
        stem_v(cx, ox, oy)
    # 行缝卷须：每半格一枚、上下交替旋向；k 与 k+8 同奇偶 → 绕边后方向一致
    for cy in (0, CELL, H):
        k = 0
        for cx in range(-CELL, W + CELL + 1, CELL // 2):
            volute(cx, cy, ox, oy, r=8.0, turns=1.3, ccw=(k % 2 == 0))
            k += 1
    # 列缝卷须：只落在行中（y = 32/96），半径小一档
    for cx in range(0, W + 1, CELL):
        j = 0
        for cy in range(CELL // 2, H, CELL):
            volute(cx, cy, ox, oy, r=5.5, turns=1.1, ccw=(j % 2 == 0))
            j += 1


def vine_lattice():
    """3×3 重叠绘制：让每条绕边的藤蔓在砖外的部分也落到砖内对应位置。
    只画一遍时，落在 x<0 / y<0 的那半截会被裁掉而无法续接，接缝处抗锯齿覆盖度不均（实测可见差 50）。"""
    for dy in (-H, 0, H):
        for dx in (-W, 0, W):
            vine_lattice_pass(CX + dx * S, CY + dy * S)


# 先铺藤蔓骨架，再压八宝符号（两者区域不相交，顺序只为保险）
vine_lattice()

GRID = [
    [fish, vase, lotus, wheel],       # 上行：金鱼 宝瓶 莲花 法轮
    [conch, knot, banner, umbrella],  # 下行：海螺 吉祥结 胜利幢 宝伞
]
for iy, row in enumerate(GRID):
    for ix, fn in enumerate(row):
        fn(*cell_origin(ix, iy))

img = img.crop((CX, CY, CX + W * S, CY + H * S)).resize((W, H), Image.BOX)
out = os.path.join(os.path.dirname(__file__), "..", "images", "pat-tile.png")
img.save(out, "PNG", optimize=True)

# ---- 无缝自证 ----
# 注意：八宝纹样每格各不相同，所以「整块砖 = N 个单元原样重复」不成立，不能拿格子互比。
# 正确的判据是：*跨边的只有藤蔓*（八宝每格内缩，最外 10px 与最上 6px 无符号墨迹），
# 而藤蔓在 x 方向周期 = CELL(64)、y 方向周期 = CELL，且 W = 4·CELL、H = 2·CELL。
# 于是「符号不触及的边带」必须逐像素等于 64 的整数倍位移 —— 这等价于藤蔓绕边完美续接。
px = img.load()


def chdiff(a, b):
    """比较两个像素的「可见差异」。
    注意：全透明像素的 RGB 是重采样残值（可能 0 也可能 255），逐通道硬比会得到 255 假失败 ——
    必须比预乘颜色，否则等于在比看不见的数据。"""
    d = abs(a[3] - b[3])
    for c in range(3):
        d = max(d, abs(a[c] * a[3] - b[c] * b[3]) // 255)
    return d


def band_worst():
    worst, at = 0, None
    # 竖向边带：每格最左 7px（留 3px 容差给 4x 超采样降采样时的墨迹渗出）
    for k in (1, 2, 3):
        for y in range(H):
            for x in range(7):
                dd = chdiff(px[x, y], px[x + CELL * k, y])
                if dd > worst:
                    worst, at = dd, ("x", x, y, k)
    # 横向边带：最上 3px，与 y+CELL 逐像素比
    for y in range(3):
        for x in range(W):
            dd = chdiff(px[x, y], px[x, y + CELL])
            if dd > worst:
                worst, at = dd, ("y", x, y, 0)
    return worst, at


worst, at = band_worst()
size_bytes = os.path.getsize(out)
print("written", os.path.normpath(out), img.size, str(size_bytes) + "B")
print("edge-band periodicity worst visible-diff =", worst, "at", at,
      "-> seamless (藤蔓绕边续接)" if worst <= 12 else "-> NOT seamless (检查藤蔓周期)")
