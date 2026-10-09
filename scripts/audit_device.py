#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/audit_device.py — 真机响应式审计（D64）

为什么必须有这个（2026-10-09 用户：「我们一直忽略一个大问题，就是用户体验感……
我们的第一个用户设备是手机——是所有的手机型号……第二个是平板……最后才是电脑」）：

  小程序是 **rpx 体系**：750rpx = 屏宽，也就是**所有尺寸都按屏宽等比缩放**。
  这意味着「在我这台机器上正常」完全不能推出「在用户机型上正常」——
  屏宽一变，字号、格径、间距**全部跟着变**，而这些数字当初全是按
  **375×667（iPhone 6/7/8）** 一台机器定的：
    · 320pt 老机型：28rpx 的字只有 11.9pt（勉强），再小就读不清
    · 430pt Pro Max：同样 28rpx 变 16pt（偏大，行长与留白要重新看）
    · iPad 1024pt：28rpx 变 **43.7pt** —— 平板不是「放大的手机」，
      它有更宽的可用宽高，但也更容易触发横向溢出、底部安全区与点击区被撑散
  所以本脚本的定位是：**在真机之前先把设备矩阵机械跑一遍**。
  它不能替代真机，但能自动抓出「某尺寸下 overflow / 字号过小 / 点击区过小」——
  这些恰恰最容易在真机上一闪而过、事后又说不清。

设备优先级（严格按用户口径）：**手机 → 平板 → 电脑（最后）**

实现要点（都是踩出来的）：
  · 探针**注入 play.html 自身**再按目标尺寸加载。不能用外层 iframe：
    那样脚本跑在父文档里，量的是壳子不是游戏。
  · 结果**只用一行 ASCII 摘要**回传（`V:...`），不走 JSON —— JSON 塞进 <title>
    会被 HTML 转义（&quot;）并被截断，两者都踩过。
  · 字符串拼接与 % 格式化**不要混**：`a + b % args` 里 % 只作用于 b，
    报错信息会被误导成「设备问题」。

用法：
  python scripts/audit_device.py            # 全矩阵
  python scripts/audit_device.py --quick    # 四个代表尺寸
  python scripts/audit_device.py --json     # 机器可读
"""
import argparse
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML = os.path.join(ROOT, 'preview', 'play.html')
CHROME = os.environ.get('WB_CHROME') or os.path.expanduser(
    '~/AppData/Local/ms-playwright/chromium_headless_shell-1228/'
    'chrome-headless-shell-win64/chrome-headless-shell.exe')
TMP = os.path.join(ROOT, '.workbuddy', 'tmp')

# ---- 设备矩阵：手机优先 → 平板 → 电脑最后 -----------------------------------
DEVICES = [
    ('iPhone SE1/5s · 老安卓',    320,  568, 2, 'phone'),
    ('安卓 360 主流',             360,  640, 3, 'phone'),
    ('iPhone 6/7/8（基准 375）',  375,  667, 2, 'phone'),
    ('iPhone 12–16',              390,  844, 3, 'phone'),
    ('iPhone XR / 11 Plus',       414,  896, 2, 'phone'),
    ('iPhone 14/15 Pro Max',      430,  932, 3, 'phone'),
    ('iPad mini 竖屏',            768, 1024, 2, 'tablet'),
    ('iPad 10.2 竖屏',            810, 1080, 2, 'tablet'),
    ('iPad Air 竖屏',            1024, 1366, 2, 'tablet'),
    ('桌面浏览器（最后）',        1280,  800, 1, 'desktop'),
]

MIN_FONT_PX = 11.0     # 小于此在手机上基本读不清
MIN_TAP_PX = 36.0      # 高频点击区（牌面/按钮）最小可点尺寸
TOL = 1.0              # 横向溢出容差 px

# 页内探针：返回一行纯 ASCII 摘要 V:溢出|小字号数|最小字号×10|小点击区数|最窄点击区|最外溢出元素
PROBE = r"""
(function () {
  try {
    var de = document.documentElement;
    var over = Math.max(de.scrollWidth, document.body.scrollWidth) - window.innerWidth;
    var all = document.querySelectorAll('body *');
    var i, el, r, fs, bad = 0, minFont = 999, taps = 0, minTap = 999, worst = '';
    for (i = 0; i < all.length; i++) {
      el = all[i]; r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right - window.innerWidth > __TOL__ && !worst) {
        worst = String(el.id || el.className || el.tagName).slice(0, 20);
      }
      var hasText = false;
      for (var k = 0; k < el.childNodes.length; k++) {
        if (el.childNodes[k].nodeType === 3 && el.childNodes[k].textContent.trim()) hasText = true;
      }
      if (hasText && r.top < window.innerHeight * 1.2) {
        fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs && fs < __MINFONT__) { bad++; if (fs < minFont) minFont = fs; }
      }
      var cn = typeof el.className === 'string' ? el.className : '';
      if (cn && /(tile|btn|guide-btn|card-know|card-speak|level-btn)/.test(cn) &&
          r.top < window.innerHeight * 1.5) {
        if (r.height < __MINTAP__ || r.width < __MINTAP__) {
          taps++; if (r.width < minTap) { minTap = r.width; }
        }
      }
    }
    // 纵向：首屏之外的内容要能滚（D64 遗留缺口之一）。这里只报「整页高度 vs 视口」，
    // 供人工判断「该滚多少」，不做硬门禁 —— 页面本来就设计成可滚的。
    var vOver = Math.max(de.scrollHeight, document.body.scrollHeight) - window.innerHeight;
    // 安全区：刘海机型上顶部/底部有系统遮挡区。这里用 CSS env() 的模拟值检查
    // 「有没有元素压在下面 34px / 上面 44px 里」—— 那正是真机上被遮住的地方。
    var unsafe = 0;
    for (i = 0; i < all.length; i++) {
      el = all[i]; r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      var cs2 = getComputedStyle(el);
      if (cs2.position !== 'fixed' && cs2.position !== 'absolute') continue;
      if (r.bottom > window.innerHeight - 2 && r.top < window.innerHeight - 34 &&
          (cs2.position === 'fixed')) {
        // 贴底固定元素：只有当它没有留出安全区内边距时才提示
        var padB = parseFloat(cs2.paddingBottom) || 0;
        if (padB < 34) unsafe++;
      }
    }
    return 'V:' + Math.round(over) + '|' + bad + '|' + Math.round(minFont * 10) +
           '|' + taps + '|' + Math.round(minTap) + '|' + worst +
           '|' + Math.round(vOver) + '|' + unsafe;
  } catch (e) {
    return 'E:' + String(e && e.message).slice(0, 60);
  }
})()
"""


def probe(w, h, dpr):
    if not os.path.exists(CHROME):
        raise SystemExit('✗ 找不到 headless Chrome（可用 WB_CHROME 指定）')
    js = (PROBE.replace('__TOL__', str(TOL))
              .replace('__MINFONT__', str(MIN_FONT_PX))
              .replace('__MINTAP__', str(MIN_TAP_PX)))
    src = open(HTML, encoding='utf-8').read()
    inject = ('<script>window.addEventListener("load",function(){setTimeout(function(){'
              'document.title=' + js + ';},700);});</script>')
    os.makedirs(TMP, exist_ok=True)
    tmp = os.path.join(TMP, '_dev_%dx%d.html' % (w, h))
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write(src.replace('</body>', inject + '</body>'))
    cmd = [CHROME, '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
           '--hide-scrollbars', '--force-device-scale-factor=%d' % dpr,
           '--virtual-time-budget=8000', '--dump-dom',
           '--window-size=%d,%d' % (w, h), 'file:///' + tmp.replace('\\', '/')]
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=180).stdout or ''
    m = re.search(r'<title>([^<]*)</title>', out)
    return m.group(1).strip() if m else ''


def parse(v):
    if not v.startswith('V:'):
        return {'error': v[:70] if v else '(空标题)'}
    p = v[2:].split('|')
    return {'overflow': int(p[0] or 0), 'smallText': int(p[1] or 0),
            'minFont': (int(p[2]) / 10.0) if len(p) > 2 and p[2] else None,
            'smallTap': int(p[3] or 0) if len(p) > 3 and p[3] else 0,
            'minTap': int(p[4]) if len(p) > 4 and p[4] else None,
            'worst': p[5] if len(p) > 5 else '',
            'pageH': int(p[6]) if len(p) > 6 and p[6] else None,
            'unsafe': int(p[7]) if len(p) > 7 and p[7] else 0}


def main():
    ap = argparse.ArgumentParser(description='真机响应式审计（手机 → 平板 → 电脑）')
    ap.add_argument('--quick', action='store_true')
    ap.add_argument('--json', action='store_true')
    args = ap.parse_args()
    devs = [d for d in DEVICES if d[1] in (320, 430, 768, 1024)] if args.quick else DEVICES

    rows, bad = [], 0
    for label, w, h, dpr, kind in devs:
        try:
            r = parse(probe(w, h, dpr))
        except Exception as e:
            r = {'error': '%s: %s' % (type(e).__name__, str(e)[:60])}
        rows.append(dict(label=label, w=w, h=h, kind=kind, **r))
        if r.get('error'):
            bad += 1

    if args.json:
        print(json.dumps(rows, ensure_ascii=False))
        return 0

    print('真机响应式审计 · 优先级：手机 → 平板 → 电脑（最后）')
    print('阈值：字号 >= %.0fpx / 高频点击区 >= %.0fpx / 横向溢出 <= %.0fpx\n'
          % (MIN_FONT_PX, MIN_TAP_PX, TOL))
    names = {'phone': '手机（第一优先）', 'tablet': '平板（第二优先）', 'desktop': '电脑（最后）'}
    cur = None
    for r in rows:
        if r['kind'] != cur:
            cur = r['kind']
            print('【%s】' % names.get(cur, cur))
        head = '  %-24s %4dx%-4d ' % (r['label'], r['w'], r['h'])
        if r.get('error'):
            print('\x1b[31m✗\x1b[0m' + head + r['error'])
            continue
        iss = []
        if r['overflow'] > TOL:
            iss.append('横向溢出 %dpx（%s）' % (r['overflow'], r.get('worst') or '?'))
        if r['smallText']:
            iss.append('字号过小 %d 处（最小 %.1fpx）' % (r['smallText'], r['minFont'] or 0))
        if r['smallTap']:
            iss.append('点击区过小 %d 处（最窄 %dpx）' % (r['smallTap'], r.get('minTap') or 0))
        extra = ''
        if r.get('pageH'):
            extra = '  [纵向可滚 %dpx]' % r['pageH']
        if r.get('unsafe'):
            extra += '  [固定元素贴底无安全区内边距 ×%d]' % r['unsafe']
        if iss:
            bad += 1
            print('\x1b[31m✗\x1b[0m' + head + '；'.join(iss) + extra)
        else:
            print('\x1b[32m✓\x1b[0m' + head + '无溢出 / 无过小字号 / 无过小点击区' + extra)
    print('\n合计：%d 个尺寸，%d 个有问题' % (len(rows), bad))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
