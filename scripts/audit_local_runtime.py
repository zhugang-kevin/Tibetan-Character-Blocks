#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/audit_local_runtime.py — 本地运行时体检（真实浏览器，D95/D98）

## 为什么要有它
静态检查（audit_local.py）只能查「文件在不在、语法对不对」。
**运行时的问题只能靠真跑**：控制台报错、资源 404、布局溢出、字体是否真的加载。

## 性能（D98 修）
第一版**每查一个页面就重启一次浏览器**（3 次启动 × networkidle 等待），
单次跑 120s+，直接让交付流水线的「检查」阶段超时 → 流水线当场把它标红。
现在改成：**一个浏览器会话跑完所有页面**，并用 domcontentloaded + 固定等待
（不用 networkidle —— 它对 favicon 这类噪音太敏感，会把等待拖满）。
同一会话还有额外好处：字体与缓存状态是连续的，更接近真机连续使用。

用法：python scripts/audit_local_runtime.py [--json]
"""
import argparse
import functools
import http.server
import json
import os
import socketserver
import subprocess
import threading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = os.environ.get('WB_CHROME') or os.path.expanduser(
    '~/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe')
NODE_PATH = os.environ.get('NODE_PATH',
                           'C:/Users/zhuga/.workbuddy/binaries/node/workspace/node_modules')

PAGES = [
    ('首页', 'preview/play.html'),
    ('游戏页', 'preview/play.html?level=1'),
    ('学习线 L12', 'preview/play.html?lv=12&stage=1'),
]

PROBE = r"""
(() => {
  const out = { overflow: [], wide: [], fonts: {} };
  const vw = window.innerWidth, docW = document.documentElement.scrollWidth;
  // 判据：**文档能不能真的横向滚**，不是「某个元素比视口宽」。
  //   ⚠️ 第一版用「元素宽度 > 视口」判定，把有意的装饰误报成溢出：
  //      .lamp-halo 是 width:120% 的光晕（pointer-events:none），故意比容器宽、居中溢出，
  //      父层会裁掉 —— 而全文 scrollWidth 仍等于视口宽，没有真的横向滚动。
  //      装饰性外溢是设计，可滚动才是 bug。
  if (docW > vw + 1) out.overflow.push('文档宽 ' + docW + ' > 视口 ' + vw);
  document.querySelectorAll('body *').forEach(function (el) {
    const rc = el.getBoundingClientRect();
    if (rc.width > vw + 1 && rc.height > 0) {
      out.wide.push((el.className || el.tagName) + ' ' + Math.round(rc.width));
    }
  });
  out.wide = out.wide.slice(0, 4);
  try { out.fonts.tibetan = document.fonts.check('16px "Noto Serif Tibetan"'); } catch (e) {}
  return out;
})()
"""


def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    httpd = socketserver.TCPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, httpd.server_address[1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--json', action='store_true')
    args = ap.parse_args()

    if not os.path.exists(CHROME):
        print('✗ 找不到 Chromium：%s' % CHROME); return 2
    if not os.path.exists(os.path.join(ROOT, 'preview', 'play.html')):
        print('✗ 缺少 preview/play.html —— 先跑 node scripts/build-h5.js'); return 2

    httpd, port = serve()
    pages = [[n, 'http://127.0.0.1:%d/%s' % (port, p)] for n, p in PAGES]

    js = """
const p = require('playwright-core');
(async () => {
  const b = await p.chromium.launch({ executablePath: %s, args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 } });
  const pg = await ctx.newPage();
  const all = [];
  for (const [name, url] of %s) {
    const errs = [];
    const h1 = e => errs.push('pageerror: ' + String(e).slice(0, 100));
    const h2 = m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text().slice(0, 110)); };
    const h3 = r => { if (r.status() >= 400 && !/favicon/.test(r.url())) errs.push('HTTP' + r.status() + ' ' + r.url().split('/').pop()); };
    pg.on('pageerror', h1); pg.on('console', h2); pg.on('response', h3);
    try {
      await pg.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await pg.waitForTimeout(700);
      const r = await pg.evaluate(%s);
      all.push({ name, errs, overflow: r.overflow, wide: r.wide, font: r.fonts.tibetan });
    } catch (e) {
      all.push({ name, errs, fatal: String(e).slice(0, 120) });
    }
    pg.off('pageerror', h1); pg.off('console', h2); pg.off('response', h3);
  }
  console.log(JSON.stringify(all));
  await b.close();
})().catch(e => console.log(JSON.stringify([{ fatal: String(e).slice(0, 200) }])));
""" % (json.dumps(CHROME), json.dumps(pages), json.dumps(PROBE))

    r = subprocess.run(['node', '-e', js], capture_output=True, text=True,
                       cwd=ROOT, timeout=300, env=dict(os.environ, NODE_PATH=NODE_PATH))
    httpd.shutdown()
    line = [l for l in (r.stdout or '').strip().split('\n') if l.startswith('[')]
    if not line:
        print('✗ 探针无输出：%s' % (r.stderr or '')[-200:]); return 2
    results = json.loads(line[-1])

    if args.json:
        print(json.dumps(results, ensure_ascii=False)); return 0

    print('本地运行时体检（真实 Chromium 375x812，单会话）')
    bad = 0
    for x in results:
        if x.get('fatal'):
            print('  ✗ %-12s 打不开：%s' % (x['name'], x['fatal'][:90])); bad += 1; continue
        errs = x.get('errs') or []
        ovf = x.get('overflow') or []
        mark = '✓' if not errs and not ovf else '✗'
        print('  %s %-12s 报错 %d ｜ 溢出 %d' % (mark, x['name'], len(errs), len(ovf)))
        for e in errs[:3]:
            print('        ✗ ' + e[:110])
        for o in ovf[:2]:
            print('        ✗ ' + o[:110])
        if x.get('wide') and not ovf:
            print('        · 装饰性外溢（设计允许）：' + '、'.join(x['wide'][:2])[:80])
        bad += len(errs) + len(ovf)
    print('')
    print('  报错+溢出合计 %d' % bad)
    return 0 if bad == 0 else 1


if __name__ == '__main__':
    raise SystemExit(main())
