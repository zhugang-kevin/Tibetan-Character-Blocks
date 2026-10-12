#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/pipeline.py — 项目唯一交付流水线（D98）

## 它是什么
把「**检查 → 评估 → 修改 → 测试 → 确认 → 发布**」这条硬规则变成**一条命令**。
规则写在文档里会被忘掉；写成脚本才会每次都真的跑。

    python scripts/pipeline.py            # 跑全部六个阶段（发布阶段只到「提交」，不推）
    python scripts/pipeline.py --push     # 连推送一起做
    python scripts/pipeline.py --stage 1  # 只跑到第 N 阶段（排障用）

## 六个阶段（任何一步红 → 停在那里，不许跳到下一步）
  1 检查 CHECK    —— 静态体检（文件/资源/引用）、运行时体检（真浏览器）、发音体检
  2 评估 ASSESS   —— 全量门禁（validate）+ 藏文排版 + H5 端到端 + 支付签名
  3 修改 FIX      —— **不自动改代码**：汇总上两阶段的红项，形成待修清单
  4 测试 TEST     —— 修完重跑 1+2（回归），确认没有把别的地方弄坏
  5 确认 VERIFY   —— 包体预算、门禁项数、发音合格数，三项硬指标留档
  6 发布 PUBLISH  —— 提交（--push 才推送）

## 为什么第 3 阶段不自动改
自动改代码 = 自动引入你不知道的 bug。本流水线的态度是：
**机器负责「发现问题」和「验证修好了」，改由人/AI 动手，然后被第 4 阶段复验。**
（这与本项目一贯的「门禁看守、不靠自觉」一致。）
"""
import argparse
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NODE = sys.executable and 'node'          # node 在 PATH 里
PY = sys.executable


class Stage:
    def __init__(self, no, name, cn):
        self.no, self.name, self.cn = no, name, cn
        self.rows = []
        self.failed = []

    def run(self, label, cmd, cwd=None, timeout=900, ok_hint=None):
        t0 = time.time()
        # ⚠️ 必须带上 NODE_PATH：jsdom / playwright-core 装在托管 workspace 里，
        #   不带的话 `require('jsdom')` 会失败，表现为「未找到 jsdom」——
        #   而这与代码无关，**是流水线自己没复现出手工跑时的环境**。
        env = dict(os.environ)
        env.setdefault('NODE_PATH',
                       'C:/Users/zhuga/.workbuddy/binaries/node/workspace/node_modules')
        r = subprocess.run(cmd, cwd=cwd or ROOT, capture_output=True, text=True,
                           timeout=timeout, env=env)
        dt = time.time() - t0
        out = (r.stdout or '') + (r.stderr or '')
        good = (r.returncode == 0)
        self.rows.append((label, good, dt, out))
        if not good:
            self.failed.append((label, out))
        mark = '✓' if good else '✗'
        print('    %s %-28s %5.1fs' % (mark, label, dt))
        return good, out


def banner(no, cn, name):
    print('\n' + '=' * 62)
    print('  阶段 %d ｜ %s ｜ %s' % (no, cn, name))
    print('=' * 62)


def tail(out, n=12):
    lines = [l for l in out.strip().split('\n') if l.strip()]
    return '\n'.join(lines[-n:])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--push', action='store_true', help='第 6 阶段连推送一起做')
    ap.add_argument('--stage', type=int, default=6, help='只跑到第 N 阶段')
    ap.add_argument('--message', default='', help='提交信息（留空则用默认）')
    args = ap.parse_args()

    print('藏字方块 · 交付流水线')
    print('规则：检查 → 评估 → 修改 → 测试 → 确认 → 发布（任何一步红就停）')

    all_failed = []

    # ---------------- 1 检查 ----------------
    if args.stage >= 1:
        banner(1, '检查', 'CHECK')
        s = Stage(1, 'check', '检查')
        # D107：**必须先构建 H5，再测 H5**。此前流水线里没有 build-h5 这一步，
        #   而 build-h5.js 有一条过时判据（查已下线的「冬游西藏」）一直在失败 ——
        #   于是 H5 从未重新构建，**而阶段 2/4 的「H5 端到端」跑的是不含新改动的旧构建**。
        #   → 等于那段时间的 H5 验证是无效的。构建本身必须成为流水线的第一道检查。
        s.run('构建 H5 体验版', ['node', 'scripts/build-h5.js'], timeout=300)
        s.run('静态体检（文件/资源/引用）', [PY, 'scripts/audit_local.py'])
        # 运行时体检较慢（要起浏览器），超时放宽
        s.run('运行时体检（真浏览器）', [PY, 'scripts/audit_local_runtime.py'], timeout=600)
        s.run('发音体检（47 条是否真的有声）', [PY, 'scripts/check_voice.py'], timeout=600)
        # 读音对账：UI 显示的藏文 vs 音频当年合成用的原文（「念错字」只能这样查出来）
        s.run('读音对账（显示文本 vs 音频原文）', [PY, 'scripts/audit_voice_text.py'], timeout=300)
        # 字母读音标注 vs 权威资料（现代卫藏音；浊音清化 + 送气 + 声调四列对立）
        s.run('字母读音对账（标注 vs 权威表）', [PY, 'scripts/audit_letter_reading.py'], timeout=180)
        # 音频实际发声类型（浊音 vs 送气清音）—— 标注改了，还得确认音频跟得上
        s.run('发声类型核验（浊音 vs 清化）', [PY, 'scripts/verify_devoicing.py'], timeout=300)
        # D101：深挖「还没炸、但迟早会炸」的那一类（用户要求「深入深化所有可能性」）
        s.run('潜在问题深挖（容量/并发/生命周期/小屏/版本）', [PY, 'scripts/audit_deep.py'], timeout=600)
        if s.failed:
            all_failed += [('1 检查', l) for l, _ in s.failed]
            print('\n  ⛔ 检查阶段有红项 —— 按规则**停在这里**，先修再往下走')
            for l, o in s.failed:
                print('\n  --- %s ---\n%s' % (l, tail(o)))
            return 1

    # ---------------- 2 评估 ----------------
    if args.stage >= 2:
        banner(2, '评估', 'ASSESS')
        s = Stage(2, 'assess', '评估')
        s.run('全量门禁 validate', ['node', 'scripts/validate.js'])
        s.run('藏文排版', ['node', 'scripts/test-tibetan.js'])
        s.run('H5 端到端', ['node', 'scripts/test-h5.js'])
        s.run('支付签名', ['node', 'server/test-sign.js'])
        if s.failed:
            all_failed += [('2 评估', l) for l, _ in s.failed]
            print('\n  ⛔ 评估阶段有红项 —— 按规则**停在这里**，先修再往下走')
            for l, o in s.failed:
                print('\n  --- %s ---\n%s' % (l, tail(o)))
            return 1

    # ---------------- 3 修改（汇总） ----------------
    if args.stage >= 3:
        banner(3, '修改', 'FIX')
        print('    本阶段不自动改代码（自动改 = 自动引入未知 bug）。')
        print('    前两阶段全绿 → 当前无待修项。若有红项，流水线会在上一步停下并列出。')

    # ---------------- 4 测试（回归） ----------------
    if args.stage >= 4:
        banner(4, '测试', 'TEST（回归，确认修改没弄坏别处）')
        s = Stage(4, 'test', '测试')
        s.run('门禁复跑', ['node', 'scripts/validate.js'])
        s.run('H5 端到端复跑', ['node', 'scripts/test-h5.js'])
        if s.failed:
            all_failed += [('4 测试', l) for l, _ in s.failed]
            print('\n  ⛔ 回归失败 —— **修改弄坏了别处**，必须回退或重修')
            for l, o in s.failed:
                print('\n  --- %s ---\n%s' % (l, tail(o)))
            return 1

    # ---------------- 5 确认（三项硬指标留档） ----------------
    if args.stage >= 5:
        banner(5, '确认', 'VERIFY（三项硬指标）')
        v = subprocess.run(['node', 'scripts/validate.js'], cwd=ROOT,
                           capture_output=True, text=True, timeout=600)
        vout = v.stdout or ''
        import re
        gate_n = re.search(r'通过:\s*(\d+)', vout)
        err_n = re.search(r'错误:\s*(\d+)', vout)
        pkg = re.search(r'主包体积\s*(\d+)KB', vout)
        voice = subprocess.run([PY, 'scripts/check_voice.py'], cwd=ROOT,
                               capture_output=True, text=True, timeout=600)
        vok = re.search(r'合格\s*(\d+)\s*条', voice.stdout or '')
        vbad = re.search(r'不合格\s*(\d+)\s*条', voice.stdout or '')
        print('    · 门禁：%s 项，错误 %s' % (gate_n.group(1) if gate_n else '?',
                                             err_n.group(1) if err_n else '?'))
        print('    · 主包：%s KB' % (pkg.group(1) if pkg else '?'))
        print('    · 发音：合格 %s / 不合格 %s' % (vok.group(1) if vok else '?',
                                                  vbad.group(1) if vbad else '?'))
        if err_n and err_n.group(1) != '0':
            all_failed.append(('5 确认', '门禁仍有错误'))
        if vbad and vbad.group(1) != '0':
            all_failed.append(('5 确认', '发音仍有不合格'))

    # ---------------- 6 发布 ----------------
    if args.stage >= 6 and not all_failed:
        banner(6, '发布', 'PUBLISH')
        st = subprocess.run(['git', 'status', '--porcelain'], cwd=ROOT,
                            capture_output=True, text=True)
        if not st.stdout.strip():
            print('    工作区干净，无改动可提交')
        else:
            n = len([l for l in st.stdout.strip().split('\n') if l.strip()])
            print('    待提交 %d 个文件' % n)
            msg = args.message or 'chore: 流水线自动提交'
            subprocess.run(['git', 'add', '-A'], cwd=ROOT, check=True)
            subprocess.run(['git', 'commit', '-q', '-m', msg], cwd=ROOT, check=True)
            subprocess.run(['git', 'log', '--oneline', '-1'], cwd=ROOT)
        if args.push:
            env = dict(os.environ)
            env.update({'GIT_CONFIG_GLOBAL': '/dev/null', 'GIT_CONFIG_SYSTEM': '/dev/null',
                        'GIT_TERMINAL_PROMPT': '0'})
            r = subprocess.run([
                'git', '-c', 'http.proxy=http://127.0.0.1:10809',
                '-c', 'http.sslBackend=openssl',
                '-c', "credential.helper=!gh auth git-credential",
                'push', 'origin', 'main'
            ], cwd=ROOT, capture_output=True, text=True, env=env, timeout=300)
            print((r.stdout or r.stderr or '').strip().split('\n')[-1])

    print('\n' + '=' * 62)
    if all_failed:
        print('  ❌ 流水线未通过：' + '、'.join(set(s for s, _ in all_failed)))
        return 1
    print('  ✅ 六阶段全部通过')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
