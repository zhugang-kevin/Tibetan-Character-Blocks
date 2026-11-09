#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/ci.py — 一条命令跑完全部门禁（D65）

为什么要有它（D63 的最大遗留项）：反证 harness 与设备审计**都靠人记得去跑**。
「靠自觉的门禁」等于没有门禁 —— D63 的整个教训就是「没报错 ≠ 没问题」，
那么「没人跑 → 没报错」更是这个教训的极端形态。所以把顺序固化下来：

    1. validate.js      结构 / 契约 / 资产 / 门禁自检（最快，失败即停）
    2. test-tibetan.js  藏文排版规则（tsheg 断行 / shad 不居行首）
    2b. test-all-150.js 150 关全量打通（逐关用真实盘面逻辑打到清空，无死局）
    2c. test-level-guard.js 关卡护栏（指纹 + 依赖闭集 + 密封沙箱）
    2d. test-content-consistency.js 跨内容一致性（术语 / 数量 / 悬空引用 / 两端分叉）
    3. build-h5.js      构建（必须先于 test-h5，否则测的是旧产物）
    4. test-h5.js       体验版端到端
    5. check_voice.py   音频体检（时长 / 峰值 / 响度带 / 削波）
    6. audit_device.py  设备矩阵（手机 → 平板 → 电脑）
    7. falsify.py       反证 harness（**默认跳过**，约 5~11 分钟；--with-falsify 打开）

**顺序是有讲究的**：build 必须在 test-h5 / test-h5-match3* / **test-game-journey** 之前
（否则测的是上一次的产物，这正是 D63 里「模板变异挂错门禁」的根因）；
validate 放最前，因为它最快且最基础。R14：journey 原来排在 build 前，已移到之后。

退出码：任一步失败即非 0，并打印失败清单。**--fast 跳过真点通关**（默认就跳过，
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
    # 2026-11-09：WXML/WXSS 的错只有微信编译器会报（常只给 code 10、不给行号）。
    # 把能静态查的四类提前拦下：标签闭合 / wx:else 相邻 / 绑定方法存在 / 花括号平衡。
    ('WXML/WXSS 结构',      ['node', 'scripts/test-wxml-lint.js'], True),
    # D138/D156：这两个此前只在 pre-commit 里，没进全量 CI —— 等于「全量」名不副实
    ('广告位配置(ID/类型)',  ['node', 'scripts/check-ads-config.js'], True),
    ('广告运行链路(D156)',   ['node', 'scripts/test-ad-runtime.js'], True),
    # 2026-11-08：门禁自己也要被验（31 项变异全红 + 逐例基线自证），约 12s。
    # 不挂进来就等于「谁把判据改松了也没人知道」。
    ('广告门禁变异(D156)',   ['node', 'scripts/test-ad-runtime-mutation.js'], True),
    ('藏文排版规则',        ['node', 'scripts/test-tibetan.js'], True),
    ('150 关全量打通',      ['node', 'scripts/test-all-150.js'], True),
    # Q4/Q1：课型/复习规则、无提示识认口径（纯规则 + 门禁，不改盘面）
    ('课型与复习(Q4)',       ['node', 'scripts/test-lesson-plan.js'], True),
    ('识认口径(Q1)',         ['node', 'scripts/test-recognition.js'], True),
    # Q1：玩家端测验页（30 题真实作答、无提示、按 D148 判定）
    ('识认测验页(Q1)',       ['node', 'scripts/test-recognition-page.js'], True),
    ('关卡护栏（指纹+隔离）', ['node', 'scripts/test-level-guard.js'], True),
    ('跨内容一致性',         ['node', 'scripts/test-content-consistency.js'], True),
    # Q2/Q12/Q13：伪字源、政策原文 vs 推论、游记地图
    ('字形联想(Q2)',         ['node', 'scripts/test-mnemonic-claims.js'], True),
    ('政策原文(Q12)',        ['node', 'scripts/test-policy-claims.js'], True),
    ('地图合规(Q13)',        ['node', 'scripts/test-map-compliance.js'], True),
    ('三消引擎',             ['node', 'scripts/test-match3.js'], True),
    # Q5：存档契约（版本/关卡/形状/步数/伪造进度全校验）
    ('存档契约(Q5)',         ['node', 'scripts/test-resume.js'], True),
    # R14：150 关三消资格（逐关贪心模拟）此前**没挂进 CI**，等于没有门禁 —— 补上
    ('150 关三消资格',       ['node', 'scripts/test-match3-150.js'], True),
    ('小程序页行为',         ['node', 'scripts/test-page-behaviour.js'], True),
    ('结算页行为',           ['node', 'scripts/test-result-behaviour.js'], True),
    # Q18：客服「未开通」必须明说（不能给点了没反应的假按钮）
    ('客服开关(Q18)',        ['node', 'scripts/test-service-gating.js'], True),
    ('服务端硬化(R09-R12)',  ['node', 'scripts/test-server-hardening.js'], True),
    # R13/R16：订单/礼物对账、D1/D7 留存口径（纯函数，不依赖真实商户/玩家）
    ('订单对账(R13)',        ['node', 'scripts/test-reconcile.js'], True),
    ('留存口径(R16)',        ['node', 'scripts/test-retention.js'], True),
    # R14：服务端签名与挑战数据测试此前只在 server/ 里单跑，没进全量清单
    ('服务端签名',           ['node', 'server/test-sign.js'], True),
    ('挑战数据(去重/隔离)',   ['node', 'server/test-store-challenge.js'], True),
    ('150课逻辑扫查',        ['node', 'scripts/sweep-150.js'], True),
    ('构建体验版',          ['node', 'scripts/build-h5.js'], True),
    ('体验版端到端',        ['node', 'scripts/test-h5.js'], True),
    ('体验版三消接线(静态)', ['node', 'scripts/test-h5-match3.js'], True),
    ('体验版三消行为',       ['node', 'scripts/test-h5-match3-behaviour.js'], True),
    # Q5：续玩行为（真实两遍加载：存档 → 新实例 → 盘面逐项一致）
    ('体验版续玩(Q5)',       ['node', 'scripts/test-h5-resume.js'], True),
    # R14：journey 读 preview/play.html —— 必须在 build 之后；原来排在 build 前，测的是旧产物
    ('体验版全程旅程',       ['node', 'scripts/test-game-journey.js'], True),
    ('送礼入账',            ['node', 'scripts/test-gift-inbox.js'], True),
    ('宗教商业化红线',      ['node', 'scripts/test-religion-compliance.js'], True),
    # 2026-10-24 新增：同一页面重复引用同一张图 → 会叠成"图片一个叠一个"（长明灯佛像事故）。
    # 有意叠层的（如火焰光晕+内核）加 data-allow-dup 放行。
    ('图片重复引用',        ['node', 'scripts/test-image-dup.js'], True),
    # 2026-10-24：寺庙数据完整性 —— 没 source 的条目不得上线（防止编造）
    ('寺庙数据完整性',      ['node', 'scripts/test-temple-data.js'], True),
    # 2026-11-05：揭图池必须是「可信寺庙 50 座」—— 防止照片标题/人名/宫殿再混进通关揭图
    ('揭图池可信性',        ['node', 'scripts/test-reveal-pool.js'], True),
    # 2026-11-05：数据层玩家可见文案 —— wxml 扫描扫不到 {{item.name}} 注入的字（实测漏过「大师挑战」）
    ('数据层可见文案',      ['node', 'scripts/test-visible-strings.js'], True),
    # 2026-11-06：真机之前的「全 10 关真点通关」——
    #   用真实鼠标坐标点击（不是调函数），牌被盖住/坐标错就会点空；同时验证无死局、揭图真加载、文化卡不挡盘面。
    ('全10关通关(真点)',   ['node', 'scripts/playthrough-all.js'], True),
    # 2026-11-06：后端**真启动** + 全接口契约（含参数校验、微信超时、鉴权）——
    #   此前只有签名单测，服务起不起得来、路由回不回对包，从来没被一条命令验证过。
    ('后端接口契约',       ['node', 'scripts/selfcheck-backend.js'], True),
    ('场景图出处（版权）',   ['node', 'scripts/test-photo-provenance.js'], True),
    ('场景语音闸门',        ['node', 'scripts/test-scene-voice.js'], True),
    ('音频体检',            ['python', 'scripts/check_voice.py'], True),
    ('设备矩阵审计',        ['python', 'scripts/audit_device.py'], True),
    ('反证 harness',        ['python', 'scripts/falsify.py'], False),
]


def main():
    ap = argparse.ArgumentParser(description='一条命令跑完全部门禁')
    ap.add_argument('--with-falsify', action='store_true',
                    help='连反证 harness 一起跑（约 5~11 分钟）')
    ap.add_argument('--only', help='只跑名字里含该关键字的步骤')
    ap.add_argument('--fast', action='store_true',
                    help='快速模式：跳过 5 分钟的全 10 关真点通关（**发布前必须跑全量**）')
    args = ap.parse_args()

    env = dict(os.environ)
    env['NODE_PATH'] = NODE_MODULES
    # 2026-11-06：--fast 只跳「真点通关」（5 分钟）。它是发布前必须跑的，日常改文案时可跳过。
    FAST_SKIP = {'全10关通关(真点)'} if args.fast else set()

    results, failed = [], []
    print('=' * 62)
    print('CI · 全部门禁（手机优先 → 平板 → 电脑）')
    print('=' * 62)
    for name, cmd, default in STEPS:
        if args.only and args.only not in name:
            continue
        # 2026-11-07：FAST_SKIP 以前**定义了却从没被使用** —— `--fast` 一直在跑
        # 5 分钟的真点通关，"快速模式"是假的（实测 --fast 与全量耗时几乎相同）。
        # 声明了就必须生效：这里真的跳过，并在汇总里标成 SKIP。
        if name in FAST_SKIP:
            results.append((name, 'SKIP', 0, '--fast 跳过；发布前必须跑全量'))
            print('  \x1b[33m—\x1b[0m %-16s 跳过（--fast；发布前必须跑全量）' % name)
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
