#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/ci.py — 一条命令跑完全部门禁（D65）

为什么要有它（D63 的最大遗留项）：反证 harness 与设备审计**都靠人记得去跑**。
「靠自觉的门禁」等于没有门禁 —— D63 的整个教训就是「没报错 ≠ 没问题」，
那么「没人跑 → 没报错」更是这个教训的极端形态。所以把顺序固化下来：

    1. validate.js      结构 / 契约 / 资产 / 门禁自检（最快，失败即停）
    2. test-tibetan.js  藏文排版规则（tsheg 断行 / shad 不居行首）
    3. build-h5.js      构建（必须先于 test-h5，否则测的是旧产物）
    4. test-h5.js       体验版端到端
    5. check_voice.py   音频体检（时长 / 峰值 / 响度带 / 削波）
    6. audit_device.py  设备矩阵（手机 → 平板 → 电脑）
    7. falsify.py       反证 harness（**默认跳过**，约 5~11 分钟；--with-falsify 打开）

**顺序是有讲究的**：build 必须在 test-h5 之前（否则测的是上一次的产物，
这正是 D63 里「模板变异挂错门禁」的根因）；validate 放最前，因为它最快且最基础。

退出码：任一步失败即非 0，并打印失败清单。**--fast 跳过反证**（默认就跳过，
显式加 --with-falsify 才跑，避免每次提交都等 11 分钟）。
"""
import argparse
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NODE_MODULES = os.environ.get(
    'NODE_PATH', 'C:/Users/zhuga/.workbuddy/binaries/node/workspace/node_modules')

# (名称, 命令, 是否默认执行)
STEPS = [
    ('结构与契约门禁',      ['node', 'scripts/validate.js'], True),
    ('藏文排版规则',        ['node', 'scripts/test-tibetan.js'], True),
    ('构建体验版',          ['node', 'scripts/build-h5.js'], True),
    ('体验版端到端',        ['node', 'scripts/test-h5.js'], True),
    ('音频体检',            ['python', 'scripts/check_voice.py'], True),
    ('设备矩阵审计',        ['python', 'scripts/audit_device.py'], True),
    ('反证 harness',        ['python', 'scripts/falsify.py'], False),
]


def main():
    ap = argparse.ArgumentParser(description='一条命令跑完全部门禁')
    ap.add_argument('--with-falsify', action='store_true',
                    help='连反证 harness 一起跑（约 5~11 分钟）')
    ap.add_argument('--only', help='只跑名字里含该关键字的步骤')
    args = ap.parse_args()

    env = dict(os.environ)
    env['NODE_PATH'] = NODE_MODULES

    results, failed = [], []
    print('=' * 62)
    print('CI · 全部门禁（手机优先 → 平板 → 电脑）')
    print('=' * 62)
    for name, cmd, default in STEPS:
        if args.only and args.only not in name:
            continue
        if not default and not args.with_falsify:
            results.append((name, 'SKIP', 0, '默认跳过（--with-falsify 打开）'))
            print('  \x1b[33m—\x1b[0m %-16s 跳过（用 --with-falsify 打开）' % name)
            continue
        t0 = time.time()
        try:
            p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True,
                               timeout=1800, env=env)
            dt = time.time() - t0
            if p.returncode == 0:
                results.append((name, 'PASS', dt, ''))
                print('  \x1b[32m✓\x1b[0m %-16s 通过（%.1fs）' % (name, dt))
            else:
                bad = [l.strip() for l in (p.stdout + p.stderr).splitlines()
                       if '✗' in l or '失败' in l or 'Error' in l]
                results.append((name, 'FAIL', dt, bad[0] if bad else ''))
                failed.append(name)
                print('  \x1b[31m✗\x1b[0m %-16s 失败（%.1fs）%s'
                      % (name, dt, ('  ← ' + bad[0][:70]) if bad else ''))
        except Exception as e:
            results.append((name, 'ERROR', 0, str(e)[:70]))
            failed.append(name)
            print('  \x1b[31m!\x1b[0m %-16s 跑不起来：%s' % (name, str(e)[:70]))

    print('-' * 62)
    npass = sum(1 for r in results if r[1] == 'PASS')
    nskip = sum(1 for r in results if r[1] == 'SKIP')
    print('通过 %d / 失败 %d / 跳过 %d' % (npass, len(failed), nskip))
    if failed:
        print('\x1b[31m失败：%s\x1b[0m —— 不要提交，也不要把「门禁红了」当成「大概没事」。'
              % '、'.join(failed))
        return 1
    if not args.with_falsify:
        print('\x1b[33m提示：反证 harness 本次未跑（--with-falsify 打开）。'
              '它的作用是证明「门禁真的抓得住缺陷」，建议发布前跑一次。\x1b[0m')
    return 0


if __name__ == '__main__':
    sys.exit(main())
