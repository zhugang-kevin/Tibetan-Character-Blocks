#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/prepare-assets.py — 把「真实图片」原始大图加工成仓库可直接接入的规格化资产

配合 docs/asset-spec-images.md（图片资产规格书）使用：
  你把 AI 生成/设计好的原始大图放进 assets-src/ 对应子目录，跑本脚本，
  它会自动完成「裁切 → 圆形徽章蒙版 → 尺寸/体积压缩 → 命名 → 写入 images/ → 生成接入清单」。

用法：
  python scripts/prepare-assets.py --all          # 全部处理
  python scripts/prepare-assets.py --icons        # 只处理 A 组图标（4 个元素徽章）
  python scripts/prepare-assets.py --reveals      # 只处理 B 组揭图（10 张）
  python scripts/prepare-assets.py --bg           # 只处理 C 组背景
  python scripts/prepare-assets.py --logo         # 只处理 D 组品牌（从 logo-master 派生）
  python scripts/prepare-assets.py --scene        # 只处理 G 组场景照片（首页/游戏页底图）
  python scripts/prepare-assets.py --report       # 只打印当前资产与预算对账，不写文件

输入目录（不存在则跳过该组）：
  assets-src/icons/     icon_01 / icon_knot / barley … 任意含关键词的文件名
  assets-src/reveals/   含 reveal_01..10 或 01..10 编号
  assets-src/bg/        bg-global / bg-sky / bg-ground / pat-tile / grain
  assets-src/logo/      logo-master.png
规格与预算以 docs/asset-spec-images.md 为准；超预算的项会标红并在结尾汇总（退出码 1）。
"""
import argparse
import os
import re
import sys

try:
    from PIL import Image, ImageDraw, ImageFilter
except ImportError:
    print('✗ 需要 Pillow：pip install pillow')
    sys.exit(2)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets-src')
IMAGES = os.path.join(ROOT, 'images')
ICON_DIR = os.path.join(IMAGES, 'icons')
SCENE_DIR = os.path.join(IMAGES, 'scene')
ASSETS_JS = os.path.join(ROOT, 'data', 'icon-assets.js')
PHOTO_JS = os.path.join(ROOT, 'data', 'photo-assets.js')

KB = 1024
# 预算表（与规格书 §七 一致）
BUDGET = {
    'icon': 30 * KB,      # 单张
    # D52 曾把本表整体再收一档（reveal 22 / bg_global 46 / scene 92）去填「讲解播整段」的
    # +83KB；随后找到更好的腾挪点（合成音效 WAV→MP3，-133KB，见 scripts/compress_sfx.py），
    # 于是**把画质还回去** —— 能不牺牲画面就别牺牲，体积问题在它该在的地方解决。
    'reveal': 26 * KB,    # 单张（WebP；10 张 ≤260KB。D50 起从 33 收紧——腾体积给灯火跳窗改版资产，画作颗粒密，26KB）
    'bg_global': 52 * KB,
    'bg_global_h5': 24 * KB,   # H5 单文件版内联的小图（preview/assets/，不进小程序包）
    'bg_sky': 40 * KB,
    'bg_ground': 45 * KB,
    'pat_tile': 15 * KB,
    'grain': 10 * KB,
    'logo_master': 150 * KB,
    'logo_200': 12 * KB,
    'logo_watermark': 6 * KB,
    'tashi': 25 * KB,          # E1 藏文金字（Canvas 兜底图）
    'scene': 108 * KB,   # 单张场景照片（D50 起从 130 收紧——照片上蒙了夜色罩，颗粒被罩子吃掉一半，108KB 够用）
}

ICON_ALIAS = [
    ('knot', 'icon_01'), ('吉祥结', 'icon_01'), ('icon_01', 'icon_01'),
    ('barley', 'icon_02'), ('青稞', 'icon_02'), ('icon_02', 'icon_02'),
    ('mountain', 'icon_03'), ('雪山', 'icon_03'), ('icon_03', 'icon_03'),
    ('yak', 'icon_04'), ('牦牛', 'icon_04'), ('icon_04', 'icon_04'),
]
BG_ALIAS = [
    ('global', 'bg-global'), ('sky', 'bg-sky'), ('ground', 'bg-ground'),
    ('pat', 'pat-tile'), ('tile', 'pat-tile'), ('grain', 'grain'), ('颗粒', 'grain'),
]

report = []


def note(name, path, budget, extra=''):
    size = os.path.getsize(path)
    ok = size <= budget
    report.append((name, size, budget, ok, extra))
    print('  %s %-22s %6.1fKB / 上限 %5.1fKB %s' % ('✓' if ok else '✗', name, size / KB, budget / KB, extra))
    return ok


def save_flat_png(img, path, budget):
    """扁平矢量类图（Logo / 藏文金字）：先原样存，超预算再 256 色量化。
    扁平图（无大面积渐变）量化后几乎无损，且不会出现色阶断层——这是把 Logo 设计成
    平色的副产物（渐变版 q256 在印身上会出现肉眼可见的同心带）。"""
    img = img.convert('RGBA')
    img.save(path, 'PNG', optimize=True)
    if os.path.getsize(path) <= budget:
        return 'plain'
    for colors in (256, 192, 128, 96, 64):
        q = img.quantize(colors=colors, method=Image.FASTOCTREE)
        q.save(path, 'PNG', optimize=True)
        if os.path.getsize(path) <= budget:
            return 'q%d' % colors
    return '最小档仍超'


def save_under_budget(img, path, budget, tries=((256, None), (128, None), (96, 0.9), (64, 0.8), (48, 0.7))):
    """按预算递进压缩：逐步减色/缩小，直到落进预算（返回最终使用的档位说明）。"""
    img = img.convert('RGBA')
    for colors, scale in tries:
        im = img
        if scale:
            im = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.LANCZOS)
        if colors:
            q = im.convert('RGBA').quantize(colors=colors, method=Image.FASTOCTREE)
            q.save(path, 'PNG', optimize=True)
        else:
            im.save(path, 'PNG', optimize=True)
        if os.path.getsize(path) <= budget:
            return 'colors=%s scale=%s' % (colors, scale or 1)
    return '最小档仍超'

def save_webp_under_budget(img, path, budget):
    """WebP 阶梯压缩（painting 类图 WebP 比 JPEG 再省 ~40%；微信 <image> 全支持）。
    D50：阶梯下探到 46——灯火跳窗改版要腾体积，画作在夜色底上 q46 不可感知。"""
    img = img.convert('RGB')
    for q in (80, 74, 68, 62, 58, 54, 50, 46, 42, 38, 34):
        img.save(path, 'WEBP', quality=q, method=6)
        if os.path.getsize(path) <= budget:
            return 'webp q=%d' % q
    return 'webp 最小档仍超'


def save_jpeg_under_budget(img, path, budget, max_w=None):
    img = img.convert('RGB')
    if max_w and img.width > max_w:
        img = img.resize((max_w, int(img.height * max_w / img.width)), Image.LANCZOS)
    for q in (85, 80, 74, 68, 62, 56, 50, 46):
        img.save(path, 'JPEG', quality=q, optimize=True, progressive=True)
        if os.path.getsize(path) <= budget:
            return 'q=%d w=%d' % (q, img.width)
    return '最小档仍超'


def src_files(group):
    d = os.path.join(SRC, group)
    if not os.path.isdir(d):
        return []
    return [os.path.join(d, f) for f in os.listdir(d)
            if re.search(r'\.(png|jpe?g|webp)$', f, re.I)]


def find_by(alias_list, files):
    """按别名关键词匹配源文件（不区分大小写）。"""
    out = {}
    for path in files:
        base = os.path.basename(path).lower()
        for key, target in alias_list:
            if key.lower() in base and target not in out:
                out[target] = path
                break
    return out


def do_icons():
    files = src_files('icons')
    if not files:
        print('  （assets-src/icons/ 为空，跳过）')
        return
    os.makedirs(ICON_DIR, exist_ok=True)
    matched = find_by(ICON_ALIAS, files)
    if not matched:
        print('  ✗ 没有识别到图标文件（文件名需含 knot/barley/mountain/yak 或 icon_0N）')
        return
    for eid, path in sorted(matched.items()):
        img = Image.open(path).convert('RGBA')
        # 方形中心裁切 → 160×160
        w, h = img.size
        s = min(w, h)
        img = img.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).resize((160, 160), Image.LANCZOS)
        # 圆形蒙版（半径 49%，1.5px 羽化）：四角透明，任何牌面上都不露"方块边"
        mask = Image.new('L', (160 * 4, 160 * 4), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, 160 * 4 - 1, 160 * 4 - 1), fill=255)
        mask = mask.resize((160, 160), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.8))
        img.putalpha(mask)
        out = os.path.join(ICON_DIR, eid + '.png')
        how = save_under_budget(img, out, BUDGET['icon'])
        note(eid + ' → ' + os.path.relpath(out, ROOT), out, BUDGET['icon'], how)
    # 生成接入清单（只写已产出的）
    lines = ['// data/icon-assets.js — 真实图片图标清单（由 scripts/prepare-assets.py 自动生成）',
             '// 键 = 元素 id；值 = 小程序内路径。三态墨色键共用同一张（徽章自带底与描边）。',
             'module.exports = {']
    for eid in sorted(matched):
        if os.path.exists(os.path.join(ICON_DIR, eid + '.png')):
            lines.append("  %s: '/images/icons/%s.png'," % (eid, eid))
    lines.append('};')
    open(ASSETS_JS, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    print('  → 已更新接入清单 data/icon-assets.js（%d 项）' % len([l for l in lines if 'icon_0' in l]))


def do_reveals():
    """B 组揭图：640×640 JPEG（≤26KB/张）。
    2026-10-08 起输出改 JPEG（painted 图 PNG 量化压不到预算；旧 10 张 PNG 共 320KB，
    新版 JPEG 目标 ≤260KB——主包与图片总盘同时受益）。旧 reveal_NN.png 会一并清理。"""
    files = src_files('reveals')
    if not files:
        print('  （assets-src/reveals/ 为空，跳过）')
        return
    for i in range(1, 11):
        nn = '%02d' % i
        hit = None
        for path in files:
            if re.search(r'reveal[_-]?0?%d\b' % i, os.path.basename(path), re.I):
                hit = path
                break
        if not hit:
            print('  - reveal_%s 未找到源图' % nn)
            continue
        img = Image.open(hit).convert('RGB')
        # 轻柔化 0.5px：AI 画作自带细密颗粒噪点，是压缩的最大敌人；
        # 显示尺寸只有 ~350px（还被棋盘盖着），0.5px 柔化肉眼无损、体积降 30%+
        img = img.filter(ImageFilter.GaussianBlur(0.8))
        out = os.path.join(IMAGES, 'reveal_%s.webp' % nn)
        how = None
        for scale in (1.0, 0.9, 0.8):                      # 阶梯降尺寸兜底
            im = img
            if scale < 1.0:
                im = img.resize((int(640 * scale), int(640 * scale)), Image.LANCZOS)
            elif im.width > 640:
                im = im.resize((640, 640), Image.LANCZOS)
            how = save_webp_under_budget(im, out, BUDGET['reveal'])
            if os.path.getsize(out) <= BUDGET['reveal']:
                break
        for ext in ('.png', '.jpg'):                       # 清掉旧格式同名图
            old = os.path.join(IMAGES, 'reveal_%s%s' % (nn, ext))
            if os.path.exists(old):
                os.remove(old)
        note('reveal_%s.webp' % nn, out, BUDGET['reveal'], how)


def do_bg():
    files = src_files('bg')
    if not files:
        print('  （assets-src/bg/ 为空，跳过）')
        return
    matched = find_by(BG_ALIAS, files)
    for target, path in sorted(matched.items()):
        img = Image.open(path)
        if target == 'bg-global':
            out = os.path.join(IMAGES, 'bg-global.jpg')
            how = save_jpeg_under_budget(img, out, BUDGET['bg_global'], max_w=1170)
            note('bg-global.jpg', out, BUDGET['bg_global'], how)
            # H5 单文件版内联用的小图（preview/assets/，不进小程序包；validate §18.1 要求同在）
            h5 = os.path.join(ROOT, 'preview', 'assets', 'bg-global-h5.jpg')
            os.makedirs(os.path.dirname(h5), exist_ok=True)
            how2 = save_jpeg_under_budget(img, h5, BUDGET['bg_global_h5'], max_w=600)
            note('bg-global-h5.jpg', h5, BUDGET['bg_global_h5'], how2)
        elif target == 'pat-tile':
            out = os.path.join(IMAGES, 'pat-tile.png')
            im = img.convert('RGBA')
            if im.size != (128, 64):
                im = im.resize((128, 64), Image.LANCZOS)
            how = save_under_budget(im, out, BUDGET['pat_tile'])
            note('pat-tile.png', out, BUDGET['pat_tile'], how)
        else:
            out = os.path.join(IMAGES, target + '.png')
            budget = BUDGET['bg_sky'] if target == 'bg-sky' else (BUDGET['bg_ground'] if target == 'bg-ground' else BUDGET['grain'])
            how = save_under_budget(img.convert('RGBA'), out, budget)
            note(target + '.png', out, budget, how)


def do_scene():
    """G 组：真实场景照片（首页/游戏页底图）。加工口径（用户要求「照片上走一层颜色」的另一半）：
    · 降饱和到 82%（照片不艳丽）· 压暗 8%（夜色色罩上仍有细节）· 竖向铺满压缩到 ≤95KB。
    色罩本身由前端既有 .sc-night 层负责，这里只负责「照片那一半」。"""
    files = src_files('scene')
    if not files:
        print('  （assets-src/scene/ 为空，跳过）')
        return
    os.makedirs(SCENE_DIR, exist_ok=True)
    made = {}
    for path in files:
        base = os.path.basename(path).lower()
        key = 'home' if 'home' in base or 'index' in base or '首' in base else ('game' if 'game' in base or '游' in base else None)
        if not key:
            print('  - 跳过 %s（文件名需含 home 或 game）' % os.path.basename(path))
            continue
        img = Image.open(path).convert('RGB')
        # 降饱和：与灰度混合 18%
        gray = img.convert('L').convert('RGB')
        img = Image.blend(img, gray, 0.18)
        # 压暗 8%
        from PIL import ImageEnhance
        img = ImageEnhance.Brightness(img).enhance(0.92)
        # 竖向铺满：只在超宽时下采样到 1170（不放大——放大只会增体积不加清晰度）
        if img.width > 1170:
            img = img.resize((1170, int(img.height * 1170 / img.width)), Image.LANCZOS)
        out = os.path.join(SCENE_DIR, key + '.jpg')
        how = save_jpeg_under_budget(img, out, BUDGET['scene'], max_w=1170)
        note('scene/' + key + '.jpg', out, BUDGET['scene'], how + '（已降饱和82%·压暗8%）')
        made[key] = out
    # 重写清单（只写已产出的键；未产出的保持空字符串）
    keys = ['home', 'game']
    lines = ['// data/photo-assets.js — 真实场景照片清单（由 scripts/prepare-assets.py --scene 自动生成）',
             '// 空字符串 = 该页不启用照片层（保持现有渐变底，零回归）。',
             'module.exports = {']
    for k in keys:
        lines.append("  %s: %s," % (k, ("'/images/scene/%s.jpg'" % k) if k in made or os.path.exists(os.path.join(SCENE_DIR, k + '.jpg')) else "''"))
    lines.append('};')
    open(PHOTO_JS, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    print('  → 已更新 data/photo-assets.js')


def do_logo():
    """品牌派生（规格书 §五）。母图两个：logo-master.png（D1 印章）、tashi-delek.png（E1 藏文金字）。
    派生：logo-200/144/80、logo-watermark（60×60 淡墨）、preview/assets/logo-master.png（H5/设计源）。"""
    files = src_files('logo')
    master = None
    tashi = None
    for path in sorted(files):
        base = os.path.basename(path).lower()
        if 'tashi' in base:
            tashi = path
        elif 'master' in base or 'logo' in base:
            master = master or path
    if not master and not tashi:
        print('  （assets-src/logo/ 为空，跳过）')
        return

    if master:
        img = Image.open(master).convert('RGBA')
        # 尺寸档（≤12KB：缩到目标尺寸后 256 色量化——扁平矢量图量化后几乎无损，实测 30KB→8KB）
        for size, name, budget in ((200, 'logo-200.png', BUDGET['logo_200']),
                                   (144, 'logo-144.png', BUDGET['logo_200']),
                                   (80, 'logo-80.png', BUDGET['logo_200'])):
            out = os.path.join(IMAGES, name)
            how = save_flat_png(img.resize((size, size), Image.LANCZOS), out, budget)
            note(name, out, budget, how)
        # 水印版：祝福签右上角 60×60 以 globalAlpha .5 落纸 → 文件本身再压到 ~.62，读作淡朱印
        wm = img.resize((60, 60), Image.LANCZOS)
        wm.putalpha(wm.split()[3].point(lambda v: int(v * 0.62)))
        out = os.path.join(IMAGES, 'logo-watermark.png')
        how = save_flat_png(wm, out, BUDGET['logo_watermark'])
        note('logo-watermark.png', out, BUDGET['logo_watermark'], how)
        # H5 / 设计源：与小程序同款素材（validate §品牌资产 要求 preview/assets/logo-master.png 在场）
        out = os.path.join(ROOT, 'preview', 'assets', 'logo-master.png')
        os.makedirs(os.path.dirname(out), exist_ok=True)
        how = save_flat_png(img, out, BUDGET['logo_master'])
        note('logo-master.png', out, BUDGET['logo_master'], how)

    if tashi:
        img = Image.open(tashi).convert('RGBA')
        out = os.path.join(IMAGES, 'tashi-delek.png')
        how = save_flat_png(img, out, BUDGET['tashi'])
        note('tashi-delek.png', out, BUDGET['tashi'], how)


def do_report():
    print('\n预算对账（images/ 各区块）：')
    total = 0
    for root, _, files in os.walk(IMAGES):
        for f in files:
            total += os.path.getsize(os.path.join(root, f))
    print('  images/ 合计 %.1fKB / 上限 840KB' % (total / KB))
    print('  （banner：主包 ≤1800KB；跑 --all 加工后再看一次）')


def main():
    ap = argparse.ArgumentParser(description='真实图片资产加工（规格书 docs/asset-spec-images.md）')
    ap.add_argument('--all', action='store_true')
    ap.add_argument('--icons', action='store_true')
    ap.add_argument('--reveals', action='store_true')
    ap.add_argument('--bg', action='store_true')
    ap.add_argument('--logo', action='store_true')
    ap.add_argument('--scene', action='store_true')
    ap.add_argument('--report', action='store_true')
    args = ap.parse_args()
    if not any([args.all, args.icons, args.reveals, args.bg, args.logo, args.scene, args.report]):
        args.report = True

    if not os.path.isdir(SRC) and not args.report:
        print('✗ 缺少 assets-src/ 目录——请先按规格书 §七 建好子目录并放入原始图')
        sys.exit(2)
    print('加工真实图片资产 → images/（规格：docs/asset-spec-images.md）')
    if args.all or args.icons:
        print('\n[A 组] 元素图标（圆形徽章 · 160px · ≤30KB）')
        do_icons()
    if args.all or args.reveals:
        print('\n[B 组] 通关揭图（640px · ≤45KB）')
        do_reveals()
    if args.all or args.bg:
        print('\n[C 组] 背景组（按规格压缩）')
        do_bg()
    if args.all or args.logo:
        print('\n[D 组] 品牌派生（从 logo-master）')
        do_logo()
    if args.all or args.scene:
        print('\n[G 组] 真实场景照片（降饱和/压暗/压缩 → images/scene/）')
        do_scene()
    do_report()
    over = [r for r in report if not r[3]]
    if over:
        print('\n✗ 有 %d 项超出预算（见上）：%s' % (len(over), '、'.join(o[0] for o in over)))
        sys.exit(1)
    if report:
        print('\n✓ 全部 %d 项落进预算' % len(report))


if __name__ == '__main__':
    main()
