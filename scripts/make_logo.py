#!/usr/bin/env python
# -*- coding: utf-8 -*-
# scripts/make_logo.py — 品牌 Logo（D1）与藏文金字（E1）母图生成
#
# 为什么用 headless Chrome 而不是 Pillow 画字：
#   藏文是**复杂文种**（下有字/元音符号/连写需要 HarfBuzz 整形）。本机 Pillow 无 Raqm
#   （features.check('raqm') == False），直接画会把 ྲ ི ེ 之类排成线性、字形全错。
#   Chrome 自带 HarfBuzz + 项目同款字体 Noto Serif Tibetan → 字形与 App 内一致。
#
# 产出：
#   assets-src/logo/logo-master.png   1024×1024 透明：藏式方形印章（朱砂红底 +
#                                     藏金卷草边饰 + 中心立体 ཀ；扁平精致、无其他文字）
#   assets-src/logo/tashi-delek.png    600×197 透明：藏文「བཀྲ་ཤིས་བདེ་ལེགས་」金字（Canvas 兜底图）
#   （两者随后由 scripts/prepare-assets.py --logo 加工进 images/ 并按预算派生）
#
# 用法：python scripts/make_logo.py [--logo|--tashi]
import argparse
import base64
import math
import os
import subprocess

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = os.path.join(ROOT, 'assets-src', 'fonts', 'NotoSerifTibetan-Variable.ttf')
# ⚠️ D72：原 NotoSerifTibetan-Bold.ttf **根本不是字体**（是 270KB 的 HTML），
#    已删除并用正版 Noto Serif Tibetan **可变字体**（OFL-1.1，796KB，来自 google/fonts）替代。
#    本文件只在**构建期**使用（assets-src/ 不入包），所以体积不影响小程序包体。
#    可变字体请用 font-weight: 700 取 Bold。
OUT = os.path.join(ROOT, 'assets-src', 'logo')
TMP = os.path.join(ROOT, 'preview', '_v2')
CHROME = os.environ.get(
    'WB_CHROME',
    os.path.expanduser('~/AppData/Local/ms-playwright/chromium_headless_shell-1228/'
                       'chrome-headless-shell-win64/chrome-headless-shell.exe'))
# ⚠️ D73：必须用**完整版 Chromium**；chrome-headless-shell（精简版）对 Noto Serif Tibetan
#    这类大字体报 NetworkError 并**静默回退**（不报错，只是把藏文画成别的字体）。
_FULL_CHROME = os.path.expanduser(
    '~/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe')
if os.path.exists(_FULL_CHROME):
    CHROME = _FULL_CHROME

FONT_CSS = None
_HTTPD = None


def _serve_root():
    """起本地 HTTP 服务器（同源伺服字体与页面）。

    ⚠️ D73：原先用 `@font-face` + **base64 data URL** 内嵌字体。
    Noto Serif Tibetan 可变字体有 **2MB**（base64 后约 2.8MB），
    Chrome 对大体积 data URL 报 `NetworkError` → **静默回退到系统字体**，
    于是生成的藏文图是错的却毫无提示（这正是 D72 那次的真实成因）。
    改为 HTTP 伺服后字体确认可加载（`document.fonts.check` 为 true）。
    """
    global _HTTPD
    if _HTTPD is None:
        import functools
        import http.server
        import socketserver
        import threading
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
        _HTTPD = socketserver.TCPServer(('127.0.0.1', 0), handler)
        threading.Thread(target=_HTTPD.serve_forever, daemon=True).start()
    return _HTTPD.server_address[1]


def font_css():
    """返回 @font-face 的 src URL（HTTP 同源，非 base64）。"""
    global FONT_CSS
    if FONT_CSS is None:
        port = _serve_root()
        FONT_CSS = 'http://127.0.0.1:%d/assets-src/fonts/%s' % (port, os.path.basename(FONT))
    return FONT_CSS


def _page_url(local_path):
    """把 ROOT 内的本地路径转成 HTTP URL（同源，字体才能加载）。"""
    rel = os.path.relpath(local_path, ROOT).replace('\\', '/')
    if not rel.startswith('..'):
        return 'http://127.0.0.1:%d/%s' % (_serve_root(), rel)
    return 'file:///' + local_path.replace('\\', '/')


def verify_font_loads():
    """**渲染前的自证**：同一段藏文分别用目标字体与「必然不存在的字体」渲染，
    若结果完全相同 ⇒ 字体没加载 ⇒ 直接报错退出，不产出错图。

    这是补 D72 的根因：当时字体没加载，脚本照样"成功"产出了错图，无人知晓。
    """
    probe = ('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200">'
             '<style>@font-face{font-family:NST;src:url(\'%s\') format(\'truetype\');font-weight:100 900;}'
             'text{font-size:120px;fill:#000}</style>'
             '<text x="20" y="150" font-family="NST">\u0F40\u0F41\u0F42</text>'
             '<text x="20" y="150" font-family="__NOPE__" opacity="0">\u0F40\u0F41\u0F42</text>'
             '</svg>') % font_css()
    hp = os.path.join(TMP, '_fontprobe.html')
    os.makedirs(TMP, exist_ok=True)
    with open(hp, 'w', encoding='utf-8') as f:
        f.write(probe)
    a = os.path.join(TMP, '_fp_a.png')
    b = os.path.join(TMP, '_fp_b.png')
    # 用目标字体
    shoot(probe.replace('font-family="NST"', 'font-family="NST"'), a, 400, 200)
    # 用必然回退的字体名
    shoot(probe.replace('font-family="NST"', 'font-family="__NOPE__"'), b, 400, 200)
    if os.path.exists(a) and os.path.exists(b):
        import hashlib
        ha = hashlib.md5(open(a, 'rb').read()).hexdigest()
        hb = hashlib.md5(open(b, 'rb').read()).hexdigest()
        if ha == hb:
            raise SystemExit('✗ 字体未加载：目标字体与回退渲染结果完全相同。'
                             '拒绝产出错误图片（D72 教训）。')
    return True


def shoot(html, out_png, w, h):
    hp = os.path.join(TMP, '_ml.html')
    open(hp, 'w', encoding='utf-8').write(html)
    if os.path.exists(out_png):
        os.remove(out_png)
    cmd = [CHROME, '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
           '--hide-scrollbars', '--force-device-scale-factor=1',
           '--virtual-time-budget=4000', '--default-background-color=00000000',
           '--screenshot=' + out_png, '--window-size=%d,%d' % (w, h), _page_url(hp)]
    r = subprocess.run(cmd, capture_output=True, timeout=120)
    if not os.path.exists(out_png):
        raise SystemExit('截图失败：%s' % r.stderr.decode('utf-8', 'ignore')[:400])
    return Image.open(out_png).convert('RGBA')


def page(body, w, h, extra_css=''):
    return """<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:NST;src:url('%s') format('truetype');font-weight:100 900;}
html,body{margin:0;padding:0;background:transparent;width:%dpx;height:%dpx;overflow:hidden;}
%s
</style></head><body>%s</body></html>""" % (font_css(), w, h, extra_css, body)


# ---------------------------------------------------------------- D1 印章 Logo
def spiral(cx, cy, r0, r1, turns, a0, cw=True, steps=48):
    """阿基米德螺线（卷草骨架），返回 SVG path 的 d。"""
    pts = []
    for i in range(steps + 1):
        t = i / steps
        ang = a0 + (1 if cw else -1) * math.tau * turns * t
        r = r0 + (r1 - r0) * t
        pts.append((cx + r * math.cos(ang), cy + r * math.sin(ang)))
    return 'M ' + ' L '.join('%.1f %.1f' % p for p in pts)


def leaf(a, b, w):
    """尖头叶：A→B 两条二次曲线对称外鼓（=点状椭圆），比随手写的贝塞尔干净得多。"""
    mx, my = (a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dy) or 1.0
    nx, ny = -dy / L * w, dx / L * w
    return 'M %.1f %.1f Q %.1f %.1f %.1f %.1f Q %.1f %.1f %.1f %.1f Z' % (
        a[0], a[1], mx + nx, my + ny, b[0], b[1], mx - nx, my - ny, a[0], a[1])


def corner_ornament(x, y, sx, sy, gid):
    """一角卷草：主螺线 + 两片对称尖头叶（沿两肩指向印角）；sx/sy = ±1 控制四角镜像。"""
    P = lambda px, py: (x + sx * px, y + sy * py)
    cw = (sx * sy > 0)
    d = spiral(*P(0, 0), 6, 30, 1.35, -math.pi / 2 if cw else math.pi / 2, cw=cw)
    l1 = leaf(P(-17, -30), P(-40, -64), 8.6)
    l2 = leaf(P(-30, -17), P(-64, -40), 8.6)
    return ('<g fill="none" stroke="#C9A227" stroke-width="3.4" stroke-linecap="round">'
            '<path d="%s"/></g>'
            '<path d="%s" fill="#B7950B"/>'
            '<path d="%s" fill="#B7950B"/>' % (d, l1, l2))


def edge_ornament(cx, cy, horiz, gid):
    """边中点饰：小菱形 + 两侧圆点。"""
    if horiz:
        pts = '%.1f,%.1f %.1f,%.1f %.1f,%.1f %.1f,%.1f' % (
            cx, cy - 11, cx + 11, cy, cx, cy + 11, cx - 11, cy)
        dots = [(cx - 26, cy), (cx + 26, cy)]
    else:
        pts = '%.1f,%.1f %.1f,%.1f %.1f,%.1f %.1f,%.1f' % (
            cx - 11, cy, cx, cy - 11, cx + 11, cy, cx, cy + 11)
        dots = [(cx, cy - 26), (cx, cy + 26)]
    s = ('<polygon points="%s" fill="none" stroke="#C9A227" stroke-width="3"/>' % pts)
    for (dx, dy) in dots:
        s += '<circle cx="%.1f" cy="%.1f" r="3.4" fill="#C9A227"/>' % (dx, dy)
    return s


def do_logo():
    S, SS = 1024, 2                      # 2× 超采样后降采样
    W = H = S * SS
    # viewBox 用设计坐标（1024），width/height 用超采样像素（2048）→ 由 SVG 自己放大，
    # **不能再加内部 scale()**（否则 4× 渲染，只截到左上角——实测踩过）。
    body = ['<svg width="%d" height="%d" viewBox="0 0 %d %d" xmlns="http://www.w3.org/2000/svg">' % (W, H, S, S),
            # 规格书 §五：**扁平精致**。因此全部用平色（无渐变）——顺带消灭了 256 色量化时
            # 大面积渐变必然出现的「色阶断层」（实测渐变版 q256 在印身出现肉眼可见的同心带）。
            # 取色：朱砂红 #C0392B（主品牌）/ 深红 #9A2A1E（中央圆章）/ 藏金亮 #FFD98A（主金）
            # 藏金 #C9A227（细金线，与 pat-tile 同色）/ #6B4406（字形描边，D32 深墨金）
            '</defs>',
            ]
    # 印身：圆角方（朱砂红）+ 金外圈 + 内部细金线
    body.append('<rect x="40" y="40" width="944" height="944" rx="152" fill="#C0392B"/>')
    body.append('<rect x="46" y="46" width="932" height="932" rx="147" fill="none" '
                'stroke="#B7950B" stroke-width="9"/>')
    body.append('<rect x="58" y="58" width="908" height="908" rx="139" fill="none" '
                'stroke="#FFD98A" stroke-width="2.4" opacity="0.75"/>')
    body.append('<rect x="112" y="112" width="800" height="800" rx="104" fill="none" '
                'stroke="#C9A227" stroke-width="3.2"/>')
    # 四角卷草 + 四边中点饰（落在边饰带内：40..112 的环）
    for (x, y, sx, sy) in [(178, 178, 1, 1), (846, 178, -1, 1), (178, 846, 1, -1), (846, 846, -1, -1)]:
        body.append(corner_ornament(x, y, sx, sy, 'gold'))
    body.append(edge_ornament(512, 178, True, 'gold'))
    body.append(edge_ornament(512, 846, True, 'gold'))
    body.append(edge_ornament(178, 512, False, 'gold'))
    body.append(edge_ornament(846, 512, False, 'gold'))
    # 中央圆章：深红底 + 金环
    body.append('<circle cx="512" cy="512" r="304" fill="#9A2A1E"/>')
    body.append('<circle cx="512" cy="512" r="304" fill="none" stroke="#C9A227" stroke-width="5"/>')
    body.append('<circle cx="512" cy="512" r="330" fill="none" stroke="#C9A227" '
                'stroke-width="2" opacity="0.6"/>')
    # 中心立体 ཀ：先落一层暗红投影造厚度，再上金字（描边在下、填色在上 → 字形边缘干净）
    # ⚠️ 藏文 em 框的墨迹偏下（上有元音符号空间）：dominant-baseline=central 也不居中。
    #    实测（font-size 440 时墨迹中心 y=674.5）→ 线性换算：y = 512 - 162.5*(F/440)。
    F = 500
    gy = 512 - 162.5 * (F / 440.0)
    body.append('<text x="%d" y="%.0f" font-family="NST" font-size="%d" text-anchor="middle" '
                'dominant-baseline="central" fill="#5E1008" fill-opacity="0.85" stroke="#5E1008" '
                'stroke-opacity="0.7" stroke-width="10" paint-order="stroke" font-weight="700">ཀ</text>'
                % (516, gy + 9, F))
    body.append('<text x="512" y="%.0f" font-family="NST" font-size="%d" text-anchor="middle" '
                'dominant-baseline="central" fill="#FFD98A" stroke="#6B4406" stroke-width="8" '
                'paint-order="stroke" font-weight="700">ཀ</text>' % (gy, F))
    body.append('</svg>')
    img = shoot(page(''.join(body), W, H), os.path.join(TMP, '_logo_raw.png'), W, H)
    img = img.resize((S, S), Image.LANCZOS)
    os.makedirs(OUT, exist_ok=True)
    out = os.path.join(OUT, 'logo-master.png')
    img.save(out, 'PNG', optimize=True)
    print('  logo-master.png  %dx%d  %d B' % (S, S, os.path.getsize(out)))


# ---------------------------------------------------------------- E1 藏文金字
TASHI = 'བཀྲ་ཤིས་བདེ་ལེགས་'


def do_tashi():
    W, H, SS = 600, 197, 3
    # ⚠️ 用 SVG <text> + linearGradient（与 Logo 同法），不用 HTML 的 background-clip:text：
    #    后者在本机 Chrome 里填色会丢（只剩描边），且字号/百分比要按 3× 空间折算，坑多。
    #    字号推算：ink 宽 ≈ 4.5×font-size（Noto Serif Tibetan Bold 实测），目标 ink 宽 ≈ 550（1×）。
    #    y=250 是让 ink（高约 386）完整落在 591 画布内；最终位置由下面按墨迹重定心决定。
    gid = 'tg'
    body = ('<svg width="%d" height="%d" viewBox="0 0 %d %d" xmlns="http://www.w3.org/2000/svg">'
            '<defs><linearGradient id="%s" x1="0.1" y1="0" x2="0.3" y2="1">'
            '<stop offset="0" stop-color="#FFE7AE"/><stop offset="0.34" stop-color="#F1C756"/>'
            '<stop offset="0.64" stop-color="#D2A32A"/><stop offset="1" stop-color="#A87C12"/>'
            '</linearGradient></defs>'
            '<text x="%d" y="250" font-family="NST" font-size="372" text-anchor="middle" '
            'fill="url(#%s)" stroke="#6B4406" stroke-width="5" paint-order="stroke" '
            'font-weight="700">%s</text></svg>'
            % (W * SS, H * SS, W * SS, H * SS, gid, W * SS // 2, gid, TASHI))
    img = shoot(page(body, W * SS, H * SS), os.path.join(TMP, '_tashi_raw.png'), W * SS, H * SS)
    # 末尾的 ་ 带右空边（advance 居中 ≠ 墨迹居中）→ 按 **墨迹 bbox** 裁紧后再居中，
    # 顺带保证左右不裁切、缩到画布内（留 12px 边距）。
    img = img.crop(img.split()[3].getbbox())
    kw, kh = (W - 24) * SS, (H - 16) * SS
    k = min(1.0, kw / img.width, kh / img.height)
    if k < 1.0:
        img = img.resize((int(img.width * k), int(img.height * k)), Image.LANCZOS)
    img = img.resize((max(1, round(img.width / SS)), max(1, round(img.height / SS))), Image.LANCZOS)
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    canvas.paste(img, ((W - img.width) // 2, (H - img.height) // 2), img)
    img = canvas
    os.makedirs(OUT, exist_ok=True)
    out = os.path.join(OUT, 'tashi-delek.png')
    img.save(out, 'PNG', optimize=True)
    print('  tashi-delek.png  %dx%d  %d B' % (W, H, os.path.getsize(out)))


def main():
    # D73：产出任何图之前，先自证字体真的加载了（否则宁可不产出）
    verify_font_loads()
    ap = argparse.ArgumentParser(description='品牌 Logo 与藏文金字生成（规格书 §五）')
    ap.add_argument('--logo', action='store_true')
    ap.add_argument('--tashi', action='store_true')
    a = ap.parse_args()
    if not any([a.logo, a.tashi]):
        a.logo = a.tashi = True
    if not os.path.exists(FONT):
        raise SystemExit('缺少字体：%s（Noto Serif Tibetan Bold，OFL 许可）' % FONT)
    os.makedirs(TMP, exist_ok=True)
    print('生成品牌图 → assets-src/logo/')
    if a.logo:
        do_logo()
    if a.tashi:
        do_tashi()


if __name__ == '__main__':
    main()
