#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/measure_ink_bounds.py — 墨迹上下界测量（D75，PNG 逐像素法）

## 为什么换这条路线

`measure_font_metrics.py` 里用 `canvas.getImageData` 与 `measureText` 的
`actualBoundingBoxAscent/Descent` 拿墨迹范围，**两条都失败了**：
  · getImageData：输出恒为 ≈ -2.65em（墨迹挤在画布顶端 1~2 像素），与其它 API 矛盾；
  · actualBoundingBox：返回值 ≈ 0.006em，无意义。
与其继续调 API，不如换一条**更简单、更独立**的路（用户建议，采纳）：
**让 Chrome 直接截图成 PNG，再用 Python 逐像素解析。**
截图是浏览器的最终输出，没有中间 API 的语义问题；PNG 解析在 Python 侧完全可控。

## 做法

  1. 起本地 HTTP 服务器伺服字体（同源，字体才能加载 —— 见 D73/D74）
  2. 页面用 **SVG**：`<text x=.. y=BASE font-size=FS>` —— **SVG 的 y 就是基线**，
     位置精确可控（HTML 的基线位置受 line-height 影响，不可控）
  3. 渲染两次：
       · 目标字体 `NST`（真字体）
       · **必然不存在的字体名**（一定回退）—— 对照组
  4. 截图 → PIL 解析 → 找非白像素的范围 = 墨迹上下界
  5. **自证**：目标与对照的墨迹必须不同；相同则判定「字体未加载」，测量作废

## 产出（喂给牌面居中补偿）
  各样本的墨迹上下界（相对基线，单位 em）、墨心位置。

用法：
  python scripts/measure_ink_bounds.py            # 人类可读
  python scripts/measure_ink_bounds.py --json     # 机器可读
"""
import argparse
import functools
import http.server
import json
import os
import socketserver
import subprocess
import sys
import threading

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = os.path.join(ROOT, 'assets-src', 'fonts', 'NotoSerifTibetan-Variable.ttf')
TMP = os.path.join(ROOT, '.workbuddy', 'tmp')

_FULL = os.path.expanduser(
    '~/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe')
_SHELL = os.path.expanduser(
    '~/AppData/Local/ms-playwright/chromium_headless_shell-1228/'
    'chrome-headless-shell-win64/chrome-headless-shell.exe')
CHROME = os.environ.get('WB_CHROME') or (_FULL if os.path.exists(_FULL) else _SHELL)

FS = 200          # 字号（越大精度越高）
BASE = 300        # 基线 y（SVG 里 text 的 y 就是基线）
W, H = 1400, 600
CONTROL_FAMILY = '__NO_SUCH_FONT__'

SAMPLES = [
    u'\u0F40',                                        # ཀ
    u'\u0F40\u0F72',                                  # ཀི
    u'\u0F40\u0F74',                                  # ཀུ
    u'\u0F56\u0F40\u0FB2',                            # བཀྲ
    u'\u0F44\u0F60\u0F72\u0F0B\u0F58\u0F72\u0F44\u0F0B',   # ངའི་མིང་
    u'\u0F56\u0F40\u0FB2\u0F0B\u0F64\u0F72\u0F66\u0F0B\u0F56\u0F51\u0F7A\u0F0B\u0F63\u0F7A\u0F42\u0F66',  # བཀྲ་ཤིས་བདེ་ལེགས
]


def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    httpd = socketserver.TCPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, httpd.server_address[1]


def svg_for(text, family, port):
    font_url = 'http://127.0.0.1:%d/assets-src/fonts/%s' % (port, os.path.basename(FONT))
    return (
        '<!doctype html><meta charset="utf-8">'
        '<style>html,body{margin:0;background:#fff}'
        "@font-face{font-family:'NST';src:url('%s') format('truetype');font-weight:100 900;}"
        'text{fill:#000}</style>'
        '<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d">'
        '<rect width="100%%" height="100%%" fill="#fff"/>'
        '<text x="40" y="%d" font-size="%d" font-family="%s">%s</text>'
        '</svg>' % (font_url, W, H, BASE, FS, family, text)
    )


def shoot(html, out_png, port):
    hp = os.path.join(TMP, '_ink.html')
    with open(hp, 'w', encoding='utf-8') as f:
        f.write(html)
    url = 'http://127.0.0.1:%d/.workbuddy/tmp/_ink.html' % port
    r = subprocess.run([CHROME, '--headless=new', '--no-sandbox', '--disable-gpu',
                        '--hide-scrollbars', '--screenshot=' + out_png,
                        '--window-size=%d,%d' % (W, H), url],
                       capture_output=True, timeout=120)
    if not os.path.exists(out_png):
        raise RuntimeError('截图失败：%s' % (r.stderr or b'')[:120])


def ink_bbox(png):
    """返回 (top, bot, left, right) 像素；无墨迹返回 None。"""
    im = Image.open(png).convert('L')
    w, h = im.size
    px = im.load()
    top, bot, left, right = h, -1, w, -1
    for y in range(h):
        for x in range(w):
            if px[x, y] < 200:          # 非白即有墨
                if y < top: top = y
                if y > bot: bot = y
                if x < left: left = x
                if x > right: right = x
    return None if bot < 0 else (top, bot, left, right)


def main():
    ap = argparse.ArgumentParser(description='墨迹上下界测量（PNG 逐像素法）')
    ap.add_argument('--json', action='store_true')
    args = ap.parse_args()

    if not os.path.exists(FONT):
        print('✗ 字体不存在：%s' % FONT); return 2
    if open(FONT, 'rb').read(4) != b'\x00\x01\x00\x00':
        print('✗ 字体 magic bytes 不对'); return 2
    os.makedirs(TMP, exist_ok=True)

    httpd, port = serve()
    rows, fail = [], []
    try:
        for s in SAMPLES:
            a = os.path.join(TMP, '_ink_a.png')
            b = os.path.join(TMP, '_ink_b.png')
            shoot(svg_for(s, 'NST', port), a, port)
            shoot(svg_for(s, CONTROL_FAMILY, port), b, port)
            ba, bb = ink_bbox(a), ink_bbox(b)
            if not ba:
                fail.append((s, '目标字体渲染无墨迹')); continue
            if not bb:
                fail.append((s, '对照组渲染无墨迹')); continue
            same = (ba == bb)
            rows.append({'text': s,
                         'inkTop': round((ba[0] - BASE) / float(FS), 4),
                         'inkBot': round((ba[1] - BASE) / float(FS), 4),
                         'ctrlTop': round((bb[0] - BASE) / float(FS), 4),
                         'ctrlBot': round((bb[1] - BASE) / float(FS), 4),
                         'sameAsControl': same,
                         'width': round((ba[3] - ba[2]) / float(FS), 4)})
    finally:
        httpd.shutdown()

    if not rows:
        print('✗ 无有效样本'); return 3

    # ---- 自证：至少要有样本与对照组不同，否则字体没加载 ----
    differ = [r for r in rows if not r['sameAsControl']]
    if not differ:
        print('✗ 自证失败：所有样本与「必然回退」的墨迹完全相同 —— 字体未加载，测量作废')
        return 3
    print('✓ 自证：%d/%d 个样本的墨迹与对照组不同 —— 字体确实生效了'
          % (len(differ), len(rows)))

    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=1)); return 0

    print()
    print('字号 %(fs)dpx，基线 y=%(base)d（SVG 的 y 即基线）' % {'fs': FS, 'base': BASE})
    print('%-34s %10s %10s %10s %10s' % ('样本', '墨顶(em)', '墨底(em)', '墨高(em)', '对照不同'))
    for r in rows:
        print('%-34s %10.4f %10.4f %10.4f %10s' % (
            r['text'], r['inkTop'], r['inkBot'],
            r['inkBot'] - r['inkTop'], '✓' if not r['sameAsControl'] else '✗'))

    # ---- 汇总：墨心相对基线的位置（视觉重心补偿的依据）----
    tops = [r['inkTop'] for r in rows]
    bots = [r['inkBot'] for r in rows]
    centers = [(r['inkTop'] + r['inkBot']) / 2.0 for r in rows]
    print()
    print('** 汇总（%d 个样本）**' % len(rows))
    print('  墨顶平均  %+.4f em（负=基线以上）' % (sum(tops) / len(tops)))
    print('  墨底平均  %+.4f em' % (sum(bots) / len(bots)))
    print('  墨心平均  %+.4f em  ← 视觉重心所在（相对基线）' % (sum(centers) / len(centers)))
    print()
    print('  解读：若墨心在基线**以上** %.4f em，而我们把文字按**几何居中**摆放，'
          % -(sum(centers) / len(centers)))
    print('        视觉上就会**偏低**同理的量 —— 这就是要补偿的偏移。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
