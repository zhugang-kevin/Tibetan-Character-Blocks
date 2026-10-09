#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/fix_safe_area.py — 给「贴底固定」的浮层补安全区内边距（D65）

问题（由 scripts/audit_device.py 的安全区探针在**全部 10 个尺寸**上同时报出）：
  结算页那条固定底栏有 `env(safe-area-inset-bottom)`（D44 已修），
  但**另外三个贴底固定浮层没有**：
    · 首页 `.dock`        —— 底部 dock（图标 + 文字）
    · 首页 `.entry-panel` —— 入口面板（底部抽屉）
    · 游戏页底部提示条     —— 错配/障碍提示的宿主
  在**带刘海的 iPhone（8 及以后）**上，Home 指示条正好压在这些元素的下沿：
  文字被遮住、主按钮难点中 —— 而这正是项目的**第一优先设备（手机）**。

为什么用脚本而不是手改：这是一处**要在两端 6 个文件里保持一致**的修补，
手改容易漏；而漏了不会报错、只会在真机上被用户看见 —— 属于「静默劣化」。

判定规则（刻意保守，宁可多改不可漏改）：
  凡是 `position: fixed` 且 `bottom: 0` 的规则块，若块内**没有**出现
  `env(safe-area-inset-bottom)`，就把该块的 `padding-bottom` 改成
  `calc(<原值> + env(safe-area-inset-bottom))`。
  已有 env() 的不动；纯遮罩层（inset:0 / top:0+bottom:0，无 bottom:0 语义）不碰。

幂等：改完再跑一次应当 0 处改动。
"""
import glob
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = sorted(glob.glob(os.path.join(ROOT, 'pages', '*', '*.wxss'))) + \
        [os.path.join(ROOT, 'preview', 'template.html')]

RULE = re.compile(r'([^{}]*)\{([^{}]*)\}', re.S)


def fix_rule(sel, body):
    """返回 (新 body, 是否改动)。"""
    if 'position: fixed' not in body:
        return body, False
    if not re.search(r'bottom:\s*0\s*;', body):
        return body, False
    if 'env(safe-area-inset-bottom)' in body:
        return body, False
    # 找 padding-bottom；没有就补一个
    m = re.search(r'padding-bottom:\s*([^;]+);', body)
    if m:
        val = m.group(1).strip()
        if val.startswith('calc(') and 'safe-area' in val:
            return body, False
        new = 'padding-bottom: calc(%s + env(safe-area-inset-bottom));' % val
        return body[:m.start()] + new + body[m.end():], True
    # 没有 padding-bottom：在最后补一条（保持块内声明顺序可读）
    add = '\n  padding-bottom: env(safe-area-inset-bottom);'
    return body.rstrip() + add, True


class _Counter(object):
    """可变计数器：让闭包能累加而不触发 UnboundLocalError。"""
    def __init__(self):
        self.v = 0


def main():
    total = 0
    touched = []
    # ⚠️ 闭包里写 total += 1 会被当成**局部变量**（UnboundLocalError）。
    #    用可变容器包一下 —— 这个坑在本项目已经踩过多次（normalize_voice 也一样）。
    for path in FILES:
        src = io.open(path, encoding='utf-8').read()
        n = [0]
        counter = _Counter()

        def repl(m):
            sel, body = m.group(1), m.group(2)
            # 纯遮罩（left/right/top/bottom 全 0）不是「贴底浮层」，跳过
            if re.search(r'top:\s*0', body) and re.search(r'left:\s*0', body) \
                    and re.search(r'right:\s*0', body):
                return m.group(0)
            nb, changed = fix_rule(sel, body)
            if changed:
                n[0] += 1
                counter.v += 1
                touched.append('%s  %s' % (os.path.relpath(path, ROOT),
                                           ' '.join(sel.split())[:48]))
            return sel + '{' + nb + '}'

        out = RULE.sub(repl, src)
        if out != src:
            io.open(path, 'w', encoding='utf-8', newline='\n').write(out)
        total += counter.v      # 累加放在循环体末尾（此前漏在这里 → 打印 0 处，报告与事实不符）

    # 报告与事实必须一致：touched 是逐条记下的，计数以它为准
    if total != len(touched):
        print('\x1b[31m✗ 计数异常：total=%d 但实际改动 %d 条\x1b[0m' % (total, len(touched)))
        sys.exit(2)
    print('补安全区内边距：%d 处' % total)
    for t in touched:
        print('  ' + t)
    if total == 0:
        print('（已全部具备 env(safe-area-inset-bottom)，幂等）')

    # 回读校验：再扫一遍，确认没有「贴底固定却缺 env()」的规则
    left = 0
    for path in FILES:
        src = io.open(path, encoding='utf-8').read()
        for m in RULE.finditer(src):
            body = m.group(2)
            if 'position: fixed' in body and re.search(r'bottom:\s*0\s*;', body) \
                    and 'env(safe-area-inset-bottom)' not in body \
                    and not (re.search(r'top:\s*0', body) and re.search(r'left:\s*0', body)
                             and re.search(r'right:\s*0', body)):
                left += 1
    print('回读：仍缺安全区的贴底固定规则 %d 条' % left)
    sys.exit(0 if left == 0 else 1)


if __name__ == '__main__':
    main()
