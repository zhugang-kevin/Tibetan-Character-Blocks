#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/measure_font_metrics.py — 藏文字体度量（D73）

## 为什么要有它，以及它凭什么可信

D70 我曾「实测」出 tsheg = 0.158em 并写进代码，后来发现**那份测量不可信**：
  ① 当时字体文件本身是坏的（是 HTML），② 而且 canvas 在 `document.fonts.load`
     完成前就 `fillText`，画出来的是**回退字体**。
两次都能得出"看起来很正式"的数字 —— 这正是本项目反复出现的同一类事故。

所以本工具内置**两条自证**，任何一条不通过就直接判定「本次测量无效」：

  **对照实验（control）**：同一个字符渲染两次 —— 一次用目标字体，一次用
  **故意不存在的字体名**（必然回退）。若两者墨迹完全相同 ⇒ 目标字体根本没生效，
  **测量作废**。（这条判据之所以成立，是因为它对两种字体都成立，与语言无关。）

  **字形差异性**：藏文 Uchen 是**等宽设计**，所以「宽度是否相同」**不能**用来判断
  是否回退（这是我 D72 犯的错）。能用的判据是**墨迹像素数**：不同字母的墨迹必然不同。

## 产出（喂给 grid.js 与文档的实测常数）
  · advance 宽度（em）：基字 / tsheg / shad
  · 墨迹纵向范围（相对基线，以 em 计）：用于**视觉重心补偿**（多行居中偏下）

用法：
  python scripts/measure_font_metrics.py            # 人类可读
  python scripts/measure_font_metrics.py --json     # 机器可读
"""
import argparse
import base64
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = os.path.join(ROOT, 'assets-src', 'fonts', 'NotoSerifTibetan-Variable.ttf')
# ⚠️ 必须用**完整版 Chromium**，不能用 `chrome-headless-shell`（精简版）：
#    精简版对复杂度高的字体支持不全 —— 实测同一个 @font-face，
#    完整版能加载、精简版报 `NetworkError`，且**静默回退**（不报错，只是画成别的字体）。
#    自证机制（对照组）就是为这种情况准备的：它当场判定「本次测量作废」。
_FULL = os.path.expanduser('~/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe')
_SHELL = os.path.expanduser('~/AppData/Local/ms-playwright/chromium_headless_shell-1228/'
                            'chrome-headless-shell-win64/chrome-headless-shell.exe')
CHROME = os.environ.get('WB_CHROME') or (_FULL if os.path.exists(_FULL) else _SHELL)

FS = 120.0        # 测量字号（越大精度越高）

# 用于度量与重心分析的样本
SAMPLES = [
    u'\u0F40',                      # ཀ 基字
    u'\u0F41',                      # ཁ
    u'\u0F42',                      # ག
    u'\u0F44',                      # ང
    u'\u0F0B',                      # ་ tsheg
    u'\u0F0D',                      # ། shad
    u'\u0F40\u0F0B',                # ཀ་
    u'\u0F40\u0F72',                # ཀི（带上加/元音）
    u'\u0F40\u0F74',                # ཀུ（下加元音）
    u'\u0F56\u0F40\u0FB2',          # བཀྲ（含下加字）
    u'\u0F63\u0F7A',                # ལེ
]


def build_html(font_url):
    """字体用**同源 HTTP URL** 引用。

    ⚠️ 前两版都不行，值得记下来：
      · `@font-face` + **base64 data URL**：字体 796KB → data URL 约 1MB，
        headless Chrome 直接报 `NetworkError`（`document.fonts.load` 失败）。
      · `@font-face` + **file:// 路径**：报 `NetworkError`（本地文件加载被拦）。
    正解：**起一个本地 HTTP 服务器**，页面与字体同源，最稳。
    """
    samples = json.dumps(SAMPLES, ensure_ascii=False)
    return """<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:'TT';src:url('__F__') format('truetype');font-weight:100 900;}
body{margin:0}
</style><body><canvas id=c width=700 height=420></canvas><script>
var FS=__FS__, SAMPLES=__S__;
function ink(x,w,h){
  var d=x.getImageData(0,0,w,h).data, n=0, top=1e9, bot=-1e9, lft=1e9, rgt=-1e9;
  for(var py=0;py<h;py++){ for(var px=0;px<w;px++){
    if(d[(py*w+px)*4+3]>40){ n++;
      if(py<top)top=py; if(py>bot)bot=py; if(px<lft)lft=px; if(px>rgt)rgt=px; }
  }}
  return n? {n:n, top:top, bot:bot, lft:lft, rgt:rgt} : null;
}
function run(fam){
  var c=document.getElementById('c'), x=c.getContext('2d'), out=[];
  for(var i=0;i<SAMPLES.length;i++){
    var s=SAMPLES[i];
    x.clearRect(0,0,c.width,c.height);
    x.font='700 '+FS+'px '+fam; x.fillStyle='#000'; x.textBaseline='alphabetic';
    x.fillText(s, 40, 320);
    var adv=x.measureText(s).width;
    out.push([s, Math.round(adv*100)/100, ink(x,c.width,c.height)]);
  }
  return out;
}
/* ⚠️ 不再依赖 document.fonts.load 的 promise —— 它在 headless shell 里对大体积/
   可变字体报 NetworkError（即便字体已 200 下载成功）。
   而「字体有没有生效」根本不需要那个 promise：**画完和目标 vs 对照组一比就知道**。
   对照组用必然不存在的字体名，必定回退；若两者墨迹相同 ⇒ 目标字体没生效。 */
function go(){
  var target=run("'TT', monospace");
  var control=run("'__NOPE__', monospace");
  document.title='R:'+JSON.stringify({fs:FS, target:target, control:control,
    loaded:(document.fonts&&document.fonts.check)?document.fonts.check(FS+'px TT'):null});
}
// 等字体就绪再测；**同时**保留超时兜底（不把成败押在一个 promise 上）
if (document.fonts && document.fonts.load) {
  document.fonts.load(FS + 'px TT').then(go, go);
  setTimeout(go, 8000);
} else { setTimeout(go, 3000); }
</script></body>""" \
        .replace('__F__', font_url).replace('__FS__', str(FS)).replace('__S__', samples)


def main():
    ap = argparse.ArgumentParser(description='藏文字体度量（含自证）')
    ap.add_argument('--json', action='store_true')
    args = ap.parse_args()

    if not os.path.exists(FONT):
        print('✗ 找不到字体：%s' % FONT); return 2
    with open(FONT, 'rb') as f:
        head = f.read(4)
    if head != b'\x00\x01\x00\x00':
        print('✗ 字体 magic bytes 不对：%s（应为 00010000）' % head.hex()); return 2

    # 起本地 HTTP 服务器（本进程内线程），页面与字体同源
    import functools
    import http.server
    import socketserver
    import threading
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    httpd = socketserver.TCPServer(('127.0.0.1', 0), handler)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    tmp = os.path.join(ROOT, '.workbuddy', 'tmp', '_metrics.html')
    os.makedirs(os.path.dirname(tmp), exist_ok=True)
    font_url = 'http://127.0.0.1:%d/assets-src/fonts/%s' % (port, os.path.basename(FONT))
    open(tmp, 'w', encoding='utf-8').write(build_html(font_url))
    page_url = 'http://127.0.0.1:%d/.workbuddy/tmp/_metrics.html' % port
    try:
        r = subprocess.run([CHROME, '--headless=new', '--no-sandbox', '--disable-gpu',
                            '--dump-dom', '--virtual-time-budget=30000',
                            '--window-size=760,460', page_url],
                           capture_output=True, text=True, timeout=180)
    finally:
        httpd.shutdown()
    m = re.search(r'<title>R:(.*?)</title>', r.stdout, re.S)
    if not m:
        print('✗ 未取到结果（页面可能未跑完）'); return 2
    data = json.loads(m.group(1).replace('&quot;', '"').replace('&amp;', '&'))
    if data.get('err'):
        print('✗ 页面内错误：%s' % data['err']); return 2

    tgt = {c: (a, i) for c, a, i in data['target']}
    ctl = {c: (a, i) for c, a, i in data['control']}
    fs = data['fs']

    # ---- 自证 1：对照实验。目标字体与「必然回退」的墨迹必须不同 ----
    same = []
    for c in SAMPLES:
        ti = tgt[c][1]; ci = ctl[c][1]
        if (ti is None and ci is None):
            continue
        if ti and ci and ti['n'] == ci['n'] and ti['top'] == ci['top'] and ti['bot'] == ci['bot']:
            same.append(c)
    if len(same) == len(SAMPLES):
        print('✗ 自证失败：目标字体与回退字体的墨迹完全相同 —— 字体没有生效，本次测量作废')
        return 3
    print('✓ 自证 1（对照实验）：目标字体与「必然回退」渲染结果不同 —— 字体确实生效了')
    if same:
        print('  （注：有 %d 个样本与回退相同，可能是该字符本就无字形）' % len(same))

    # ---- 自证 2：不同字母的墨迹必须不同（等宽脚本不能用宽度判断回退） ----
    base = [u'\u0F40', u'\u0F41', u'\u0F42', u'\u0F44']
    inks = [tgt[c][1]['n'] for c in base if tgt.get(c) and tgt[c][1]]
    if len(set(inks)) == len(inks):
        print('✓ 自证 2（字形差异）：四个基字墨迹像素互不相同 —— 是真实字形，不是豆腐块')
    else:
        print('✗ 自证失败：基字墨迹像素出现相同值 %s —— 疑似豆腐块' % inks)
        return 3

    out = {'font': os.path.basename(FONT), 'fontSize': fs, 'units': 'em',
           'advance': {}, 'ink': {}}
    for c in SAMPLES:
        a, i = tgt[c]
        key = '%04X' % ord(c[0]) + ('+' + '+'.join('%04X' % ord(ch) for ch in c[1:]) if len(c) > 1 else '')
        out['advance'][key] = round(a / fs, 4)
        if i:
            out['ink'][key] = {'top': round(i['top'] / fs, 4),   # 相对基线（canvas 顶端为 0）
                               'bot': round(i['bot'] / fs, 4),
                               'pixels': i['n']}

    if args.json:
        print(json.dumps(out, ensure_ascii=False, indent=1)); return 0

    print()
    print('字体：%s  测量字号：%.0fpx' % (out['font'], fs))
    print('%-14s %10s %12s %12s' % ('样本', 'advance(em)', '墨顶(em)', '墨底(em)'))
    base_adv = out['advance']['0F40']
    for c in SAMPLES:
        key = '%04X' % ord(c[0]) + ('+' + '+'.join('%04X' % ord(ch) for ch in c[1:]) if len(c) > 1 else '')
        ik = out['ink'].get(key, {})
        top = ik.get('top'); bot = ik.get('bot')
        # canvas 顶端为 0，基线在 320px → 换算成「相对基线」
        # ⚠️ 换算必须一致：canvas 顶端为 0、基线在 320px，所以「相对基线」= (像素-320)/字号
        #    第一版写成 (top - 320/fs)*fs，把像素与 em 混在一起 → 全部输出 -82.004 这种怪值
        topRel = (top - 320) / fs if top is not None else None
        botRel = (bot - 320) / fs if bot is not None else None
        print('%-14s %10.4f %12s %12s' % (
            c, out['advance'][key],
            ('%+.4f' % topRel) if topRel is not None else '-',
            ('%+.4f' % botRel) if botRel is not None else '-'))
    print()
    print('** 关键常数（可直接写进代码）**')
    print('  基字 advance          = %.4f em' % base_adv)
    print('  tsheg ་ / 基字        = %.4f' % (out['advance']['0F0B'] / base_adv))
    print('  shad ། / 基字         = %.4f' % (out['advance']['0F0D'] / base_adv))
    return 0


if __name__ == '__main__':
    sys.exit(main())
