#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/check_tile_centering.py — 全量牌面纵向居中核验（D78）

## 为什么要有它
D75–D78 的视觉重心补偿，一直是拿 **6 个代表样本**验证的。6 个样本能说明方向对不对，
但**不能说明 770 个牌面都没问题** —— 而边界情况（离群字形）恰恰是样本覆盖不到的。

本工具把**全部关卡的每一个牌面**都渲染出来，逐个量「墨心 vs 格子中心」，
给出真实分布与离群清单。判据与 `measure_ink_bounds.py` 同源：
  · 真字体（HTTP 同源伺服，见 D73）
  · PNG 逐像素取墨迹上下界（见 D75）
  · 单元格带**实际使用的补偿值**（由 utils/grid.js 的 opticalShift 给出）

用法：
  python scripts/check_tile_centering.py            # 全量（214 个唯一文本，覆盖 770 牌面）
  python scripts/check_tile_centering.py --top 20   # 只列最差的 20 个
"""
import argparse
import functools
import http.server
import json
import os
import socketserver
import subprocess
import threading

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMP = os.path.join(ROOT, '.workbuddy', 'tmp')
FONT = os.path.join(ROOT, 'assets-src', 'fonts', 'NotoSerifTibetan-Variable.ttf')
CHROME = os.environ.get('WB_CHROME') or os.path.expanduser(
    '~/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe')

TILE = 120          # 格子边长
GAP = 30            # 格子间距
COLS = 8            # 每屏列数
FS = int(TILE * 0.62)   # 字号（与游戏一致：容器的 62%）


def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    httpd = socketserver.TCPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, httpd.server_address[1]


def page(items, port, shift_of, applied):
    """items: [(text, shift)]；applied=False 时不施加补偿（对照用）。"""
    rows = (len(items) + COLS - 1) // COLS
    W = GAP + COLS * (TILE + GAP)
    H = GAP + rows * (TILE + GAP)
    cells = []
    for i, (t, sh) in enumerate(items):
        r, c = divmod(i, COLS)
        x, y = GAP + c * (TILE + GAP), GAP + r * (TILE + GAP)
        tf = ('transform:translateY(%.4fem)' % sh) if applied else ''
        cells.append('<div class="cell" style="left:%dpx;top:%dpx">'
                     '<span class="g" style="%s">%s</span></div>' % (x, y, tf, t))
    return ("<!doctype html><meta charset='utf-8'><style>html,body{margin:0;background:#fff}"
            "@font-face{font-family:'NST';src:url('http://127.0.0.1:%d/assets-src/fonts/%s')"
            " format('truetype');font-weight:100 900;}"
            ".cell{position:absolute;width:%dpx;height:%dpx;display:flex;align-items:center;"
            "justify-content:center;border:1px solid #ddd;box-sizing:border-box}"
            ".g{font-family:'NST';font-size:%dpx;line-height:1;white-space:nowrap}"
            "</style><body>%s</body>"
            % (port, os.path.basename(FONT), TILE, TILE, FS, ''.join(cells))), W, H


def shoot(html, out, W, H, port):
    hp = os.path.join(TMP, '_center.html')
    os.makedirs(TMP, exist_ok=True)
    with open(hp, 'w', encoding='utf-8') as f:
        f.write(html)
    subprocess.run([CHROME, '--headless=new', '--no-sandbox', '--disable-gpu',
                    '--hide-scrollbars', '--screenshot=' + out,
                    '--window-size=%d,%d' % (W, H),
                    'http://127.0.0.1:%d/.workbuddy/tmp/_center.html' % port],
                   capture_output=True, timeout=180)
    return out


def offsets(png, n):
    im = Image.open(png).convert('L')
    px = im.load()
    res = []
    for i in range(n):
        r, c = divmod(i, COLS)
        x0 = GAP + c * (TILE + GAP); y0 = GAP + r * (TILE + GAP)
        top, bot = 10 ** 6, -1
        for y in range(y0, y0 + TILE):
            for x in range(x0, x0 + TILE):
                if px[x, y] < 160:
                    if y < top: top = y
                    if y > bot: bot = y
        res.append(None if bot < 0 else ((top + bot) / 2.0 - (y0 + TILE / 2.0)) / FS)
    return res


def main():
    ap = argparse.ArgumentParser(description='全量牌面纵向居中核验')
    ap.add_argument('--top', type=int, default=10, help='列出最差的 N 个')
    args = ap.parse_args()

    src = os.path.join(TMP, '_tiles.json')
    if not os.path.exists(src):
        print('✗ 缺少 %s（先生成牌面清单）' % src); return 2
    tiles = json.load(open(src, encoding='utf-8'))
    uniq = []
    seen = set()
    for lv, t in tiles:
        if t not in seen:
            seen.add(t); uniq.append((lv, t))

    # 取 grid.js 给出的补偿值
    r = subprocess.run(['node', '-e',
        "const g=require('./utils/grid.js');const t=JSON.parse(require('fs')"
        ".readFileSync('.workbuddy/tmp/_tiles.json','utf8'));"
        "console.log(JSON.stringify([...new Set(t.map(x=>x[1]))].map(s=>g.opticalShift(s))))"],
        cwd=ROOT, capture_output=True, text=True)
    shifts = json.loads(r.stdout.strip())
    items = [(uniq[i][1], shifts[i]) for i in range(len(uniq))]

    httpd, port = serve()
    try:
        all_off, batch = [], 40
        for s in range(0, len(items), batch):
            chunk = items[s:s + batch]
            html, W, H = page(chunk, port, None, True)
            png = shoot(html, os.path.join(TMP, '_c_%d.png' % s), W, H, port)
            all_off.extend(offsets(png, len(chunk)))
    finally:
        httpd.shutdown()

    # ⚠️ 元组顺序要对齐：items 是 [(文本, 补偿)]，关卡号在 uniq 里 —— 之前误写成 items[i][0]，
    #    于是把「文本」当成了关卡号传给 %d，直接崩在打印上（数值本身是对的）。
    pairs = [(uniq[i][1], all_off[i], uniq[i][0])
             for i in range(len(items)) if all_off[i] is not None]
    if not pairs:
        print('✗ 未测到任何牌面'); return 3
    vals = [abs(v) for _, v, _ in pairs]
    mean = sum(v for _, v, _ in pairs) / len(pairs)
    mx = max(vals)
    over = sum(1 for v in vals if v > 0.15)
    print('全量牌面纵向居中核验')
    print('  唯一文本 %d 个（覆盖 %d 个牌面）' % (len(pairs), len(tiles)))
    print('  平均偏差 %+.3f em ｜ 最大偏差 %.3f em ｜ 超 0.15em 的 %d 个（%.1f%%）'
          % (mean, mx, over, over * 100.0 / len(pairs)))
    bad = sorted(pairs, key=lambda x: -abs(x[1]))[:args.top]
    print('\n最差的 %d 个：' % len(bad))
    print('  %-6s %10s %10s  %s' % ('关卡', '偏差(em)', '补偿(em)', '文本'))
    smap = dict(items)
    for t, v, lv in bad:
        print('  L%-5d %8.3f %10.3f  %s' % (lv, v, smap.get(t, 0.0), t))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
