#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""合成礼物道具图标 —— 微信虚拟支付「道具图片」规格：200x200 PNG <200KB

用法：python scripts/build-gift-icons.py

设计依据（实测得出，非拍脑袋）：
  · 已通过验收的两张（灯火 / 祝福卡）= 深漆地 + 金主体。
    采样：灯火四角 #1D1710（近黑褐）、祝福卡四角 #5A1912（深绛）。
  · 被否的两张：哈达四角 #F6F6EF（米白）、藏名卡四角 #FEFFFF（纯白）。
    → 浅底 + 浅主体 = 在微信支付弹窗白底上直接消失。这是「terrible」的根因。
  · 结论：深色高饱和地 + 高对比主体；主体占画面 <60% 留呼吸位。

藏文排版：PIL 无 raqm（复杂文本整形），PIL 直出是断笔字。
  → 用 Chrome + NotoSerifTibetan 渲染（浏览器有 HarfBuzz，字形正确）。
     同 scripts/make_logo.py 的做法。
"""
import os, sys, subprocess, json
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance

HERE = os.path.dirname(os.path.abspath(__file__))


def find_root(d):
    while d != os.path.dirname(d):
        if os.path.isfile(os.path.join(d, 'assets-src', 'fonts', 'NotoSerifTibetan-Variable.ttf')):
            return d
        d = os.path.dirname(d)
    raise RuntimeError('project root not found')


ROOT = find_root(HERE)
GEN = os.path.join(ROOT, '.workbuddy', 'tmp', 'icon-gen')
OUT = os.path.join(ROOT, 'images', 'gift-icons')
RENDERER = os.path.join(ROOT, 'scripts', 'render-tibetan-text.js')

# AI 生成的底图（1024×1024）。源图放 .workbuddy/tmp/（不入库）；
# 需要重跑时重新生成同名文件即可，脚本本身已入库，可复现合成步骤。
KHATA_SRC = os.path.join(GEN, 'A_single_traditional_Tibetan_k_2026-11-11T10-35-42.png')
CARD_SRC = os.path.join(GEN, 'An_ornate_traditional_Tibetan__2026-11-11T10-17-32.png')

TARGET = 200
MAX_KB = 200

INK = '#6E2B22'      # 与小程序 gf-name-bo 同色（页面已用）
GOLD = '#C8912F'


def render_text(out_name, text, size_px, color, weight='700', family=None):
    """Chrome 渲染文本 → 透明底 PNG（PIL 排不了藏文）"""
    env = dict(os.environ)
    env['NODE_PATH'] = 'C:/Users/zhuga/.workbuddy/binaries/node/workspace/node_modules'
    cmd = ['node', RENDERER, out_name, text,
           str(size_px), color, weight]
    if family:
        cmd.append(family)
    r = subprocess.run(cmd, capture_output=True, text=True, env=env, cwd=ROOT)
    if r.returncode != 0:
        raise RuntimeError('render failed: ' + r.stderr[-1000:])
    info = json.loads(r.stdout.strip().splitlines()[-1])
    return os.path.join(GEN, out_name), info


def inpaint_corner_mirror(img, region, src_block):
    """把 src_block 水平镜像贴到 region（清掉右下角水印，且保留对称花纹）"""
    a = np.array(img.convert('RGB')).astype(np.float32)
    x0, y0, x1, y1 = region
    sx0, sy0, sx1, sy1 = src_block
    patch = a[sy0:sy1, sx0:sx1][:, ::-1]
    th, tw = y1 - y0, x1 - x0
    patch = patch[:th, :tw]
    a[y0:y0 + patch.shape[0], x0:x0 + patch.shape[1]] = patch
    return Image.fromarray(a.clip(0, 255).astype(np.uint8))


def trim(img, box):
    return img.crop(box)


def scale_to(im, size=TARGET):
    return im.resize((size, size), Image.LANCZOS)


def save_png(im, path):
    im = im.convert('RGB')
    im.save(path, 'PNG', optimize=True)
    kb = os.path.getsize(path) / 1024
    if kb > MAX_KB:
        q = im.quantize(colors=256, method=Image.MEDIANCUT, dither=Image.FLOYDSTEINBERG)
        q.save(path, 'PNG', optimize=True)
        kb = os.path.getsize(path) / 1024
    return kb


def build_khata():
    src = Image.open(KHATA_SRC).convert('RGB')
    # 1) 先内缩 12px：切掉四周那道浅蓝描边亮线（实测在第 3-8 行/列）
    src = trim(src, (12, 12, 1012, 1012))          # → 1000x1000
    # 2) 去右下角水印：右下金饰被水印压住，用左下同款金饰水平镜像补回
    #    （实测四角金饰中心 BL x≈63 / BR x≈937，镜像后完全对位）
    src = inpaint_corner_mirror(src, (876, 876, 1000, 1000), (0, 876, 124, 1000))
    # 3) 提饱和 + 提对比（深地更沉、白绸更亮）
    src = ImageEnhance.Color(src).enhance(1.14)
    src = ImageEnhance.Contrast(src).enhance(1.08)
    return scale_to(src)


def build_card():
    src = Image.open(CARD_SRC).convert('RGB')
    # 1) 去右下角水印：镜像左下角（同一张卡，图案连续）
    src = inpaint_corner_mirror(src, (860, 900, 1024, 1024), (0, 900, 164, 1024))
    # 2) 内缩到卡片内部，让织锦铺满画布（与灯火/祝福卡「满幅」一致）
    src = trim(src, (34, 34, 990, 990))
    # 3) 提饱和 + 提对比
    src = ImageEnhance.Color(src).enhance(1.12)
    src = ImageEnhance.Contrast(src).enhance(1.06)

    W = src.width                       # 956
    # 羊皮纸面板在 1024 坐标是 x243-782 / y240-759；换算到裁剪后
    px0, px1 = (243 - 34) / W, (782 - 34) / W
    py0, py1 = (240 - 34) / W, (759 - 34) / W
    pcx = (px0 + px1) / 2

    base = src.convert('RGBA')

    # 藏文名（大号，页面同色）
    p_bo, info_bo = render_text('card_bo.png', 'བཀྲ་ཤིས་', 132, INK, '700')
    bo = Image.open(p_bo).convert('RGBA')
    scale = (px1 - px0) * W * 0.86 / bo.width
    bo = bo.resize((max(1, int(bo.width * scale)), max(1, int(bo.height * scale))), Image.LANCZOS)
    bx = int(pcx * W - bo.width / 2)
    by = int(py0 * W + (py1 - py0) * W * 0.16)
    base.alpha_composite(bo, (bx, by))

    # 中文名
    p_cn, info_cn = render_text('card_cn.png', '扎西', 92, '#3A2418', '700',
                                "'PingFang SC','Microsoft YaHei',sans-serif")
    cn = Image.open(p_cn).convert('RGBA')
    cscale = (px1 - px0) * W * 0.34 / cn.width
    cn = cn.resize((max(1, int(cn.width * cscale)), max(1, int(cn.height * cscale))), Image.LANCZOS)
    cx = int(pcx * W - cn.width / 2)
    cy = int(py0 * W + (py1 - py0) * W * 0.56)
    base.alpha_composite(cn, (cx, cy))

    # 金色分隔线
    ly = int(py0 * W + (py1 - py0) * W * 0.47)
    lx0 = int(pcx * W - (px1 - px0) * W * 0.16)
    lx1 = int(pcx * W + (px1 - px0) * W * 0.16)
    line = Image.new('RGBA', base.size, (0, 0, 0, 0))
    from PIL import ImageDraw
    d = ImageDraw.Draw(line)
    d.line([(lx0, ly), (lx1, ly)], fill=(200, 145, 47, 235), width=4)
    base.alpha_composite(line)

    # 词义（小号）
    p_mn, info_mn = render_text('card_mn.png', '吉祥', 60, '#6E2B22', '500',
                                "'PingFang SC','Microsoft YaHei',sans-serif")
    mn = Image.open(p_mn).convert('RGBA')
    mscale = (px1 - px0) * W * 0.20 / mn.width
    mn = mn.resize((max(1, int(mn.width * mscale)), max(1, int(mn.height * mscale))), Image.LANCZOS)
    mx = int(pcx * W - mn.width / 2)
    my = int(py0 * W + (py1 - py0) * W * 0.72)
    base.alpha_composite(mn, (mx, my))

    return scale_to(base)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    kh = build_khata()
    kb1 = save_png(kh, os.path.join(OUT, 'tib_khata_6.png'))
    cd = build_card()
    kb2 = save_png(cd, os.path.join(OUT, 'tib_name_99.png'))
    print(json.dumps({
        'khata': {'size': kh.size, 'kb': round(kb1, 1)},
        'card': {'size': cd.size, 'kb': round(kb2, 1)},
    }, ensure_ascii=False))
