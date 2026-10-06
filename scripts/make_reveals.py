#!/usr/bin/env python
# scripts/make_reveals.py — 程序绘制「通关揭图」10 张秘境图 → images/reveal_01.png .. reveal_10.png
#   用法： python scripts/make_reveals.py
#
# 用途：每关棋盘下方垫一张秘境图（pages/game 的 .reveal-img），消除掉格挡牌即透出；
#       通关时整幅揭晓，并在结算页 / 护照「揭示图鉴」作为收藏图。
#
# 设计约束（与 docs/DECISIONS.md D25 / D31 一致）：
#   · 藏纸底 + 古金双框 + 单一主体：与全局视觉底盘同色系（藏纸 #F8ECD4 / 古金 #B2841E）。
#   · 主体一律「深棕描线 + 有限填色」，在深色棋盘上对比足够，透出的缝隙像金光。
#   · ⚠️ 回避宗教符号（D25 已拍板 2026-10-06）：吉祥八宝里只取另外 7 个，另补 3 个自然/生活题。
#   · 零随机：random.seed 固定，重复运行产物字节一致（可 diff 校验）。
import math
import os
import random
from PIL import Image, ImageDraw

S = 2                # 2x 超采样
W = 480              # 输出边长（1x）
DEV = W * S          # 设备像素边长

PAPER1 = (248, 236, 212)
PAPER2 = (231, 208, 164)
INK = (72, 30, 22)
RED = (150, 38, 32)
GOLD = (178, 132, 30)
GOLD2 = (216, 180, 86)
BLUE = (34, 62, 96)
CREAM = (255, 250, 236)
GREEN = (38, 94, 64)

CX, CY = 240, 248      # 主体中心
dr = None              # 由 new_canvas() 绑定


def dev(v):
    return v * S


def box(x0, y0, x1, y1):
    return [dev(min(x0, x1)), dev(min(y0, y1)), dev(max(x0, x1)), dev(max(y0, y1))]


def pts(seq):
    return [(dev(x), dev(y)) for (x, y) in seq]


def L(seq, color=INK, w=5, close=False):
    q = pts(seq)
    if close:
        q.append(q[0])
    dr.line(q, fill=color, width=max(1, int(dev(w))), joint="curve")


def FILL(seq, color):
    dr.polygon(pts(seq), fill=color)


def E(x0, y0, x1, y1, outline=INK, w=5, fill=None):
    dr.ellipse(box(x0, y0, x1, y1), outline=outline, width=max(1, int(dev(w))), fill=fill)


def C(cx, cy, r, outline=INK, w=5, fill=None):
    E(cx - r, cy - r, cx + r, cy + r, outline, w, fill)


def ARC(x0, y0, x1, y1, a0, a1, color=INK, w=5):
    dr.arc(box(x0, y0, x1, y1), a0, a1, fill=color, width=max(1, int(dev(w))))


def PIE(x0, y0, x1, y1, a0, a1, outline=INK, w=5, fill=None):
    dr.pieslice(box(x0, y0, x1, y1), a0, a1, fill=fill, outline=outline, width=max(1, int(dev(w))))


def DOT(cx, cy, r, color=GOLD):
    dr.ellipse(box(cx - r, cy - r, cx + r, cy + r), fill=color)


def diamond(cx, cy, r, color=GOLD):
    FILL([(cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)], color)


# ---------------- 画布：藏纸底 + 金框 + 坛城环 ----------------
def new_canvas():
    global dr
    random.seed(7)                     # 固定种子 → 产物可复现
    img = Image.new("RGB", (DEV, DEV), PAPER1)
    d0 = ImageDraw.Draw(img)
    for y in range(DEV):               # 竖向渐变藏纸底（直接在设备像素上画）
        t = y / (DEV - 1)
        c = tuple(int(PAPER1[i] + (PAPER2[i] - PAPER1[i]) * t) for i in range(3))
        d0.line([(0, y), (DEV, y)], fill=c)
    for _ in range(1600):              # 藏纸纤维斑（低对比，确定性）
        x, y = random.uniform(0, DEV), random.uniform(0, DEV)
        a = random.randint(0, 20)
        d0.point((x, y), fill=(216 + a, 198 + a, 160 + a))
    dr = ImageDraw.Draw(img)

    L([(16, 16), (464, 16), (464, 464), (16, 464)], GOLD, 6, close=True)
    L([(30, 30), (450, 30), (450, 450), (30, 450)], GOLD2, 2, close=True)
    for (cx, cy) in ((38, 38), (442, 38), (38, 442), (442, 442)):
        DOT(cx, cy, 8, GOLD)
        C(cx, cy, 8, GOLD2, 1.5)
    for v in range(72, 409, 28):       # 四边菱点（藏式框饰）
        diamond(v, 23, 4)
        diamond(v, 457, 4)
        diamond(23, v, 4)
        diamond(457, v, 4)
    C(CX, CY, 178, GOLD, 2)            # 坛城双环 + 刻度环
    C(CX, CY, 184, GOLD2, 1.2)
    for k in range(36):
        a = math.pi * 2 * k / 36
        L([(CX + 170 * math.cos(a), CY + 170 * math.sin(a)),
           (CX + 177 * math.cos(a), CY + 177 * math.sin(a))], GOLD2, 1.4)
    return img


def ground(y=392, half=86):
    """主体下方的台基线，避免主体悬空。"""
    L([(CX - half, y), (CX + half, y)], GOLD, 4)
    for k in range(5):
        x = CX - half + k * (half * 2 / 4)
        L([(x, y), (x, y + 10)], GOLD2, 2)


# ---------------- 10 个主体 ----------------
def snow_mountain():
    FILL([(150, 386), (214, 214), (278, 386)], BLUE)
    L([(150, 386), (214, 214), (278, 386)], INK, 5, close=True)
    FILL([(214, 214), (243, 272), (232, 258), (214, 284), (196, 258), (185, 272)], CREAM)
    L([(214, 214), (243, 272), (232, 258), (214, 284), (196, 258), (185, 272)], INK, 3, close=True)
    FILL([(228, 386), (302, 176), (376, 386)], BLUE)
    L([(228, 386), (302, 176), (376, 386)], INK, 5, close=True)
    FILL([(302, 176), (333, 240), (320, 224), (302, 250), (283, 224), (270, 240)], CREAM)
    L([(302, 176), (333, 240), (320, 224), (302, 250), (283, 224), (270, 240)], INK, 3, close=True)
    C(144, 168, 26, GOLD, 4, GOLD2)
    for k in range(12):
        a = math.pi * 2 * k / 12
        L([(144 + 32 * math.cos(a), 168 + 32 * math.sin(a)),
           (144 + 40 * math.cos(a), 168 + 40 * math.sin(a))], GOLD, 3)
    ground(386, 118)


def barley():
    L([(CX, 158), (CX, 380)], GOLD, 5)
    for k in range(7):
        y = 176 + k * 26
        for sgn in (-1, 1):
            bx = CX + sgn * 12
            tipx, tipy = CX + sgn * 44, y - 16
            FILL([(bx, y), (tipx, tipy), (tipx + sgn * 6, tipy + 20), (bx, y + 20)], GOLD2)
            L([(bx, y), (tipx, tipy), (tipx + sgn * 6, tipy + 20), (bx, y + 20)], INK, 2.6, close=True)
            L([(tipx, tipy), (tipx + sgn * 16, tipy - 18)], GOLD, 2)
    for k in range(5):                 # 叶
        sgn = -1 if k % 2 == 0 else 1
        L([(CX + sgn * 4, 352), (CX + sgn * 66, 300 - k * 12)], GREEN, 3)
    ground(382, 78)


def yak():
    E(156, 202, 344, 296, INK, 5, INK)              # 躯干
    E(206, 176, 300, 236, INK, 5, INK)              # 肩峰（牦牛隆起的背）
    E(104, 238, 178, 316, INK, 5, INK)              # 头（独立于躯干，向左探出）
    L([(146, 290), (166, 318), (182, 292), (200, 320), (218, 292), (236, 320),
       (254, 292), (272, 320), (290, 292), (312, 318), (330, 290)], GOLD2, 3)   # 腹毛
    for (x0, x1) in ((186, 176), (222, 216), (276, 272), (316, 326)):           # 四腿 + 蹄
        L([(x0, 288), (x1, 358)], INK, 9)
        L([(x1 - 9, 358), (x1 + 9, 358)], INK, 6)
        L([(x1 - 9, 364), (x1 + 9, 364)], GOLD2, 4)
    # 一对向上外撇的犄角（月牙形，米白）
    FILL([(150, 244), (122, 196), (134, 186), (166, 240)], CREAM)
    L([(150, 244), (122, 196), (134, 186), (166, 240)], INK, 3, close=True)
    FILL([(164, 244), (196, 200), (186, 190), (150, 238)], CREAM)
    L([(164, 244), (196, 200), (186, 190), (150, 238)], INK, 3, close=True)
    # 吻部 + 眼 + 鼻孔
    E(104, 288, 140, 316, INK, 4, GOLD)
    DOT(146, 264, 5.4, GOLD2)
    DOT(116, 302, 3.6, INK)
    # 尾（垂在体侧，末端毛球）
    L([(340, 214), (372, 240), (378, 286)], INK, 6)
    E(366, 284, 396, 318, INK, 4, INK)
    ground(372, 124)


def parasol():
    PIE(136, 128, 344, 336, 180, 360, INK, 5, RED)
    for xx in (-62, -22, 22, 62):
        L([(240, 130), (240 + xx, 232)], GOLD2, 2.6)
    for k in range(6):                 # 垂幔波浪
        x = 152 + k * 30
        ARC(x, 224, x + 30, 268, 0, 180, INK, 4)
        ARC(x, 224, x + 30, 268, 0, 180, GOLD2, 2)
    L([(240, 246), (240, 384)], GOLD, 6)             # 伞杆
    L([(216, 384), (264, 384)], GOLD, 5)
    C(240, 132, 9, INK, 4, GOLD)                     # 顶饰
    L([(240, 118), (240, 104)], GOLD, 5)
    DOT(240, 100, 6, GOLD)
    for k in range(9):                 # 伞骨端点
        a = math.pi + math.pi * k / 8
        DOT(240 + 104 * math.cos(a), 232 + 104 * math.sin(a), 5, GOLD2)
    ground(392, 96)


def _fish(cx, cy, s, d):
    """单条金鱼：d=1 朝右，d=-1 朝左。"""
    def X(v):
        return cx + d * v * s

    E(min(cx - 46 * s, X(46)), cy - 24 * s, max(cx + 46 * s, X(-46)), cy + 24 * s, INK, 4.4, GOLD2)
    FILL([(X(-46), cy), (X(-80), cy - 26 * s), (X(-80), cy + 26 * s)], RED)
    L([(X(-46), cy), (X(-80), cy - 26 * s), (X(-80), cy + 26 * s)], INK, 3.4, close=True)
    FILL([(X(-6), cy - 24 * s), (X(20), cy - 52 * s), (X(26), cy - 22 * s)], RED)
    L([(X(-6), cy - 24 * s), (X(20), cy - 52 * s), (X(26), cy - 22 * s)], INK, 3, close=True)
    L([(X(-6), cy + 24 * s), (X(18), cy + 50 * s), (X(26), cy + 22 * s)], INK, 3)
    for k in range(3):                 # 鳞纹
        a = X(-30 + k * 12)
        b = X(40)
        ARC(min(a, b), cy - 18 * s, max(a, b), cy + 18 * s, 110, 250, GOLD, 2)
    DOT(X(28), cy - 6 * s, 4.4 * s, INK)


def golden_fish():
    _fish(198, 190, 1.06, 1)
    _fish(270, 302, 1.06, -1)
    ground(392, 96)


def vase():
    # 瓶身（宽肩鼓腹）+ 束颈 + 外撇盘口 + 台基
    E(154, 244, 326, 376, INK, 5, CREAM)
    FILL([(228, 186), (252, 186), (260, 250), (220, 250)], CREAM)
    L([(228, 186), (252, 186), (260, 250), (220, 250)], INK, 4, close=True)
    E(212, 170, 268, 194, INK, 4, GOLD2)
    DOT(240, 158, 9, GOLD)
    L([(240, 150), (240, 134)], GOLD, 4)
    DOT(240, 128, 6, GOLD2)
    L([(172, 268), (308, 268)], GOLD, 2.4)          # 肩部纹带
    diamond(240, 316, 30, GOLD2)
    L([(240, 286), (270, 316), (240, 346), (210, 316)], INK, 3.4, close=True)
    diamond(240, 316, 10, RED)
    FILL([(206, 374), (274, 374), (286, 392), (194, 392)], GOLD)   # 台基
    L([(206, 374), (274, 374), (286, 392), (194, 392)], INK, 3.4, close=True)
    ground(392, 108)


def conch():
    E(150, 176, 330, 356, INK, 5, CREAM)
    for k, r in enumerate((74, 52, 32)):
        ARC(240 - r, 268 - r, 240 + r, 268 + r, 30, 300, GOLD, 3.4 - k * 0.6)
    C(240, 268, 12, INK, 3.4, GOLD)
    FILL([(150, 300), (208, 336), (150, 356)], RED)
    L([(150, 300), (208, 336), (150, 356)], INK, 4, close=True)
    for k in range(7):
        a = math.radians(246 + k * 12)
        L([(240 + 24 * math.cos(a), 268 + 24 * math.sin(a)),
           (240 + 88 * math.cos(a), 268 + 88 * math.sin(a))], GOLD2, 2)
    L([(176, 356), (306, 356)], INK, 4)
    ground(390, 104)


def endless_knot():
    def band(seq):
        L(seq, INK, 20, close=True)
        L(seq, GOLD2, 11, close=True)

    orn = [(240, 156, True), (240, 324, True), (156, 240, False), (324, 240, False),
           (240, 122, False), (240, 358, False), (122, 240, True), (358, 240, True)]
    band([(156, 156), (324, 156), (324, 324), (156, 324)])
    band([(240, 122), (358, 240), (240, 358), (122, 240)])
    band([(240, 186), (294, 240), (240, 294), (186, 240)])
    for (x, y, horiz) in orn:          # 交织断口：压纸色缺口 + 金色联线，形成"上下穿过"
        if horiz:
            L([(x - 19, y), (x + 19, y)], PAPER2, 26)
            L([(x - 11, y), (x + 11, y)], GOLD2, 11)
        else:
            L([(x, y - 19), (x, y + 19)], PAPER2, 26)
            L([(x, y - 11), (x, y + 11)], GOLD2, 11)
    DOT(240, 240, 9, RED)
    ground(390, 96)


def banner():
    L([(240, 108), (240, 384)], GOLD, 6)
    DOT(240, 100, 10, GOLD)
    C(240, 100, 10, INK, 3)
    for (x0, x1, y0, y1, col) in ((214, 266, 148, 186, RED),
                                  (202, 278, 192, 232, GOLD2),
                                  (190, 290, 238, 278, RED)):
        FILL([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], col)
        L([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], INK, 4, close=True)
        L([(x0 + 8, y1), (x1 - 8, y1)], GOLD, 2)
    for x in (214, 240, 266):          # 垂穗
        L([(x, 278), (x, 330)], INK, 3)
        DOT(x, 336, 6, GOLD)
    ground(390, 92)


def wheel():
    C(240, 240, 92, INK, 6, CREAM)
    C(240, 240, 74, GOLD, 4)
    for k in range(8):
        a = math.pi * 2 * k / 8
        L([(240 + 20 * math.cos(a), 240 + 20 * math.sin(a)),
           (240 + 72 * math.cos(a), 240 + 72 * math.sin(a))], GOLD, 5)
    C(240, 240, 24, INK, 5, GOLD2)
    C(240, 240, 9, INK, 3, RED)
    for k in range(5):                 # 莲座（八瓣，纯几何）
        x = 152 + k * 44
        FILL([(x - 18, 380), (x, 346), (x + 18, 380)], GOLD2)
        L([(x - 18, 380), (x, 346), (x + 18, 380)], INK, 3, close=True)
    ground(384, 106)


SUBJECTS = [
    ('snow_mountain', snow_mountain),
    ('barley', barley),
    ('yak', yak),
    ('parasol', parasol),
    ('golden_fish', golden_fish),
    ('vase', vase),
    ('conch', conch),
    ('endless_knot', endless_knot),
    ('banner', banner),
    ('wheel', wheel),
]

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'images')


def render(fn):
    img = new_canvas()
    fn()
    return img.resize((W, W), Image.LANCZOS)


def main():
    total = 0
    for i, (key, fn) in enumerate(SUBJECTS, start=1):
        img = render(fn)
        out = os.path.join(OUT_DIR, 'reveal_%02d.png' % i)
        # 128 色量化：渐变轻微分层反而更像"印出来的"藏纸画，体积可控（主包 2MB 硬约束）
        img.quantize(colors=128, method=Image.MEDIANCUT, dither=Image.FLOYDSTEINBERG) \
            .save(out, 'PNG', optimize=True)
        sz = os.path.getsize(out)
        total += sz
        print('written %-28s %5d B   (%s)' % (os.path.basename(out), sz, key))
    print('total %d B (%.1f KB)' % (total, total / 1024.0))


if __name__ == '__main__':
    main()
