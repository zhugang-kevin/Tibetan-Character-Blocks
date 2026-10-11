#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/audit_local_runtime.py — 本地运行时体检（真实浏览器，D95）

## 为什么要有它
静态检查（audit_local.py）只能查「文件在不在、语法对不对」。
**运行时的问题只能靠真跑**：
  · 控制台报错（某个 API 在浏览器里不存在、某处 undefined）
  · 资源 404（图片路径拼错、字体没加载）
  · 布局溢出（内容比屏幕宽 → 手机上左右滚 / 文字被切）
  · 字体是否真的加载成功（没加载成功会静默回退，测出来的尺寸全是假的）

本脚本用真实 Chromium 打开体验版，逐个页面走一遍，把上述四类问题抓出来。

用法：python scripts/audit_local_runtime.py
"""
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
VIEWPORT = (375, 812)          # iPhone X 尺寸；真机最常见的一档


def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    httpd = socketserver.TCPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, httpd.server_address[1]


PROBE = r"""
(() => {
  const out = { errors: [], failed: [], overflow: [], fonts: {} };
  window.addEventListener('error', e => out.errors.push('onerror: ' + (e.message || e.type)));
  const origErr = console.error;
  console.error = function () {
    out.errors.push('console.error: ' + Array.prototype.slice.call(arguments).join(' ').slice(0, 200));
    origErr.apply(console, arguments);
  };
  const origWarn = console.warn;
  console.warn = function () {
    out.errors.push('console.warn: ' + Array.prototype.slice.call(arguments).join(' ').slice(0, 200));
    origWarn.apply(console, arguments);
  };
  try {
    const r = performance.getEntriesByType('resource');
    r.forEach(function (e) {
      if (e.responseStatus === 0 || (e.responseStatus >= 400)) {
        out.failed.push(e.name.split('/').pop() + ' (' + e.responseStatus + ')');
      }
    });
  } catch (e) {}
  // 横向溢出：**判据是「文档能不能真的横向滚」，不是「某个元素比视口宽」**。
  //   ⚠️ 本探针第一版用「元素宽度 > 视口」判定，把有意为之的装饰误报成溢出：
  //      `.lamp-halo` 是 width:120% 的**光晕**（pointer-events:none），故意比容器宽、居中溢出，
  //      父层会裁掉 —— 而全文 scrollWidth 仍等于视口宽，**没有真的横向滚动**。
  //      装饰性外溢是设计，可滚动才是 bug。
  const vw = window.innerWidth;
  const docW = document.documentElement.scrollWidth;
  if (docW > vw + 1) {
    out.overflow.push('文档宽 ' + docW + ' > 视口 ' + vw + '（可横向滚动）');
  }
  // 附带记录「比视口宽的元素」供人工判断，但**不算失败**
  out.wideElements = [];
  document.querySelectorAll('body *').forEach(function (el) {
    const rc = el.getBoundingClientRect();
    if (rc.width > vw + 1 && rc.height > 0) {
      out.wideElements.push((el.className || el.tagName) + ' 宽 ' + Math.round(rc.width));
    }
  });
  out.wideElements = out.wideElements.slice(0, 5);
  // 字体是否真的可用（未加载会静默回退 → 之前所有测量都会失真）
  try {
    out.fonts.tibetan = document.fonts.check('16px "Noto Serif Tibetan"');
  } catch (e) { out.fonts.tibetan = 'unknown'; }
  out.scrollW = document.documentElement.scrollWidth;
  return out;
})()
"""


def run_probe(port, path):
    """打开某个路径，等渲染完，跑探针"""
    url = 'http://127.0.0.1:%d/%s' % (port, path.lstrip('/'))
    js = ("const p = require('playwright-core');"
          "(async () => {"
          "  const b = await p.chromium.launch({ executablePath: %s, args: ['--no-sandbox'] });"
          "  const pg = await b.newPage({ viewport: { width: %d, height: %d } });"
          "  const bad = [];"
          "  pg.on('requestfailed', r => bad.push('requestfailed: ' + r.url().split('/').pop()));"
          "  pg.on('response', r => { if (r.status() >= 400) bad.push('HTTP ' + r.status() + ' ' + r.url().split('/').pop()); });"
          "  await pg.goto(%s, { waitUntil: 'networkidle', timeout: 30000 });"
          "  await pg.waitForTimeout(1200);"
          "  const r = await pg.evaluate(%s);"
          "  r.netFail = bad;"
          "  console.log(JSON.stringify(r));"
          "  await b.close();"
          "})().catch(e => { console.log(JSON.stringify({ fatal: String(e).slice(0,200) })); });"
          ) % (json.dumps(CHROME), VIEWPORT[0], VIEWPORT[1], json.dumps(url), PROBE)
    r = subprocess.run(['node', '-e', js], capture_output=True, text=True,
                       cwd=ROOT, timeout=120,
                       env=dict(os.environ, NODE_PATH=os.environ.get(
                           'NODE_PATH',
                           'C:/Users/zhuga/.workbuddy/binaries/node/workspace/node_modules')))
    line = [l for l in (r.stdout or '').strip().split('\n') if l.startswith('{')]
    if not line:
        return {'fatal': (r.stderr or '')[-200:]}
    return json.loads(line[-1])


def main():
    if not os.path.exists(CHROME):
        print('✗ 找不到 Chromium：%s' % CHROME); return 2
    if not os.path.exists(os.path.join(ROOT, 'preview', 'play.html')):
        print('✗ 缺少 preview/play.html —— 先跑 node scripts/build-h5.js'); return 2

    httpd, port = serve()
    pages = [
        ('首页', 'preview/play.html'),
        ('游戏页(第1关)', 'preview/play.html?level=1'),
        ('学习体系 L12', 'preview/play.html?lv=12&stage=1'),
        ('结算页', 'preview/play.html?screen=result&level=1'),
        ('证书页', 'preview/play.html?screen=cert'),
        ('护照页', 'preview/play.html?screen=passport'),
    ]
    total_err, total_fail = 0, 0
    print('本地运行时体检（真实 Chromium %dx%d）' % VIEWPORT)
    for name, path in pages:
        r = run_probe(port, path)
        if r.get('fatal'):
            print('  ✗ %-14s 打不开：%s' % (name, r['fatal'][:90]))
            total_err += 1
            continue
        errs = (r.get('errors') or []) + (r.get('netFail') or []) + (r.get('failed') or [])
        ovf = r.get('overflow') or []
        wide = r.get('wideElements') or []
        font = (r.get('fonts') or {}).get('tibetan')
        status = '✓' if not errs and not ovf else '✗'
        print('  %s %-14s 报错 %d ｜ 溢出 %d ｜ 藏文字体 %s'
              % (status, name, len(errs), len(ovf), font))
        for e in errs[:3]:
            print('        ✗ ' + str(e)[:120])
        for o in ovf[:2]:
            print('        ✗ 横向溢出：' + str(o)[:120])
        if wide and not ovf:
            print('        · 装饰性外溢（设计允许）：' + '、'.join(wide[:2])[:90])
        total_err += len(errs)
        total_fail += len(ovf)
    httpd.shutdown()
    print('\n' + '=' * 50)
    print('  报错合计 %d ｜ 横向溢出合计 %d' % (total_err, total_fail))
    print('  注意：体验版用的是**系统字体**（内嵌字体只进了小程序包），')
    print('       所以这里字体检查为 false 属正常 —— 但藏文仍应正常显示（回退链）。')
    return 0 if (total_err == 0 and total_fail == 0) else 1


if __name__ == '__main__':
    raise SystemExit(main())
