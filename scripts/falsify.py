#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/falsify.py — **反证 harness：门禁到底抓不抓得住真缺陷？**

为什么要有这个（2026-10-09 用户提出「系统会制造假象，全绿但其实有问题」）：
  门禁最危险的失效模式不是「报错」，而是**对真缺陷报绿**。
  一个从没被证伪过的检查等于没写 —— 但我们平时只看它「全绿」就放心了。
  绿灯只说明「没触发红灯」，**不说明「灯是对的」**。

做法（变异测试 / mutation testing，目标不是覆盖率，而是**检查的有效性**）：
  1. 往真实代码注入一个**已知缺陷**；
  2. 跑对应门禁，看它**是否报红**；
  3. 无论结果如何，用 git 还原；
  4. 汇总「抓到 / 漏掉」—— 漏掉的那条就是**假绿门禁**，要修门禁而不是修代码。

⚠️ **这个 harness 自己就被证伪过一次，值得完整记下来**（第一版写在 Node 里）：
  第一版跑出「22/22 抓到，检出率 100%」。但同一时刻 `node scripts/validate.js`
  单独跑是 exit 0 全绿。真相是：**本机 Node 里 spawn 任何子进程都 EBUSY**
  （git / python / ffmpeg / 甚至自己，全灭）→ harness 里每个门禁都「失败」→
  于是**每条变异都算「抓到」**。那个 100% 是彻头彻尾的假象，
  而且是 harness 自己制造的假象 —— 比被测的门禁造假更隐蔽，因为它看起来像好消息。
  两条由此定下的纪律：
  ① **基线必须先验证**：注入任何变异之前，先确认所有门禁在干净树上真的全绿；
     否则**直接中止**，绝不输出检出率（无法信任的数字比没有数字更危险）。
  ② **三种结果严格分开**：CAUGHT / MISSED / INJECT_ERROR。
     变异没注入成功 = harness 的问题，绝不能算成「抓到」或「漏网」。
  本版改用 Python 写，因为 python → 子进程在本机是通的（compress_voice.py 就靠它调 ffmpeg）。

用法：
  python scripts/falsify.py                 # 跑全部
  python scripts/falsify.py --only probe    # 只跑某一组
  python scripts/falsify.py --list          # 只列清单
"""
import argparse
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NODE_MODULES = os.environ.get(
    'NODE_PATH', 'C:/Users/zhuga/.workbuddy/binaries/node/workspace/node_modules')

# ---- 变异清单 ---------------------------------------------------------------
# group : 归类；gate : 用哪个门禁验；desc : 这个缺陷在现实中对应什么
MUTATIONS = [
    # 1. json / schema / contract
    dict(group='json', file='app.json', find='"pages/game/game"', repl='"pages/game/GAME"',
         gate='validate', desc='app.json 页面路径拼错（编译期找不到页面）'),
    dict(group='json', file='data/cards.js', find="id: 'letter_01'", repl="id: 'letter_99'",
         gate='validate', desc='文化卡 id 与元素库脱钩（发音/成就全对不上）'),
    dict(group='schema', file='data/voices.js', find="'letter_02',", repl="'letter_02', 'letter_77',",
         gate='validate', desc='发音清单声称一个目录里并不存在的文件（UI 说谎）'),
    dict(group='schema', file='data/voices.js', find="'letter_03',", repl='',
         gate='validate', desc='把「已知缺失」悄悄从缺口中抹掉（缺口无出处）'),
    dict(group='schema', file='project.config.json', find='"scripts"', repl='"scriptsXX"',
         gate='validate', desc='打包忽略项被改坏（20MB 开发资产进主包）'),

    # 2. contract：发音诚实 / 打扰预算 / 声画耦合
    dict(group='contract', file='utils/audio.js',
         find='if (!id || !VOICE_SET[id]) return false;', repl='',
         gate='validate', desc='pronounce 对不存在的音源也返回 true（回到「假装播了」）'),
    dict(group='contract', file='utils/audio.js', find='hasVoice: hasVoice,', repl='',
         gate='validate', desc='不再导出 hasVoice（UI 无法预判有没有音）'),
    dict(group='contract', file='pages/game/game.js',
         find='var REPEAT_TOAST = false;', repl='var REPEAT_TOAST = true;',
         gate='validate', desc='重复匹配又开始弹浮层（单局打扰 2 → 14 次）'),
    dict(group='contract', file='pages/game/game.js',
         find='var BLOCK_COOLDOWN_MS = 3000;', repl='var BLOCK_COOLDOWN_MS = 0;',
         gate='validate', desc='障碍提示冷却失效（连点一条接一条弹）'),
    dict(group='contract', file='utils/audio.js', find='duckBgm(1400);', repl='',
         gate='validate', desc='语音不再压低 BGM（齿音被盖 =「有时候听不清」）'),
    dict(group='contract', file='pages/game/game.js', find="haptic('medium');", repl='',
         gate='validate', desc='错配没有触觉反馈（投入感缺口重现）'),
    dict(group='contract', file='utils/grid.js',
         find="var parts = t.split('་');", repl="var parts = t.split('');",
         gate='validate', desc='断行改成按字符硬切（会把藏文音节切碎）'),
    dict(group='contract', file='utils/grid.js', find='var INNER = 0.86;', repl='var INNER = 1.6;',
         gate='validate', desc='可用宽度被放宽到超出格子（牌面溢出回归）'),

    # 3. coordination：两端同构
    dict(group='coordination', file='preview/template.html',
         find='const REPEAT_TOAST = false;', repl='const REPEAT_TOAST = true;',
         gate='validate', desc='两端预算漂移（小程序不弹、体验版弹）'),
    dict(group='coordination', file='preview/template.html',
         find='const BGM_DUCK = 0.10;', repl='const BGM_DUCK = 0.28;',
         gate='validate', desc='两端 ducking 目标音量漂移'),

    # 4. content：正字法 / 规范
    dict(group='content', file='data/learning.js',
         find="var VOWELS = ['ི', 'ུ', 'ེ', 'ོ'];", repl="var VOWELS = ['ི', '་ུ'];",
         gate='validate', desc='元音表里混入 tsheg（教出错字形）'),
    dict(group='content', file='data/learning.js',
         find="var SUBS = ['ྱ', 'ྲ', 'ླ', 'ྭ'];", repl="var SUBS = ['ྭ', 'ྲ'];",
         gate='validate', desc='下加字表被改动（可能生成非法叠字）'),
    dict(group='content', file='data/cards.js',
         find='藏语：གངས་རི་', repl='藏语：གངས་རི',
         gate='validate', desc='藏文词尾丢掉 ་（D48 定的书写规范）'),

    # 5. orchestration：注入链
    dict(group='orchestration', file='preview/template.html',
         find='const VOICES = /*__VOICES__*/;', repl='const VOICES = {};',
         gate='validate', desc='H5 不再内联语音（单文件体验版必然 404 静音）'),
    dict(group='orchestration', file='scripts/build-h5.js',
         find="html.indexOf('/*__VOICES__*/')", repl="html.indexOf('/*__VOICES_XX__*/')",
         gate='validate', desc='构建脚本不再校验 VOICES 占位符（注入链悄悄断掉）'),

    # 6. 音频资产（经 ffmpeg 变异）
    dict(group='audio', file='audio/voice/letter_02.mp3', gate='check_voice',
         desc='把一条藏文发音换成纯静音（近静音产物混入）', ffmpeg_volume='0'),
    dict(group='audio', file='audio/voice/letter_05.mp3', gate='check_voice',
         desc='把一条藏文发音压到听不见（D59 之前的原始病灶）', ffmpeg_volume='0.02'),

    # 7. 图像资产
    dict(group='image', file='images/logo-144.png', gate='validate',
         desc='品牌 logo 被删（分享卡/首页开天窗）', prepare='delete'),
    dict(group='image', file='images/bg-global.jpg', gate='validate',
         desc='全局底图被删（首屏变白）', prepare='zero'),

    # 8. probe：**事先不确定是否被守卫覆盖**的盲注（这组才是真缺口的探测器）
    dict(group='probe', file='data/learning.js', find="ག: 'ས'", repl="ག: 'ད'",
         gate='validate', desc='PROBE 再后加字配错（ག 后规范只能接 ས）'),
    dict(group='probe', file='utils/learning.js',
         find="(sel.sub || '') + (sel.vowel || '')", repl="(sel.vowel || '') + (sel.sub || '')",
         gate='validate', desc='PROBE 七位骨架里「下加字」与「元音」顺序被换'),
    dict(group='probe', file='utils/audio.js', find='var BGM_VOLUME = 0.28;',
         repl='var BGM_VOLUME = 0.9;', gate='validate',
         desc='PROBE BGM 音量拉到 0.9（盖过语音的混音基准）'),
    dict(group='probe', file='utils/storage.js',
         find='var needPick = !p.tibetanName || prev !== g;', repl='var needPick = true;',
         gate='validate', desc='PROBE 性别重复选择又重新取名（D55 的「不换名」被推翻）'),
    dict(group='probe', file='preview/template.html',
         find='if (state.matchedCount === totalPairs()) return;', repl='if (false) return;',
         gate='validate', desc='PROBE 通关瞬间不再抑制浮层（最后一对会弹出卡片）'),
    dict(group='probe', file='pages/game/game.js',
         find='if (this.data.locked) return;', repl='if (false) return;',
         gate='validate', desc='PROBE 下落锁定失效（连点会在动画期间误触）'),
    dict(group='probe', file='data/levels.js',
         find="{ level: 1, cols: 6, rows: 4, elements: [['letter_01', 16], ['letter_02', 14]] }",
         repl="{ level: 1, cols: 7, rows: 4, elements: [['letter_01', 16], ['letter_02', 14]] }",
         gate='validate', desc='PROBE 第 1 关格数被改（盘面配比与三条守恒失效）'),
    dict(group='probe', file='utils/grid.js', find='var FONT_RATIO = 0.62;',
         repl='var FONT_RATIO = 1.4;', gate='validate',
         desc='PROBE 名义字号比例被放大（牌面基准字号整体溢出）'),
]

GATES = {
    'validate':   [['node', 'scripts/validate.js']],
    'check_voice': [['python', 'scripts/check_voice.py']],
    'build_h5':   [['node', 'scripts/build-h5.js']],
    'test_h5':    [['node', 'scripts/test-h5.js']],
}


def run_gate(gate):
    """返回 (failed, runner_error, output)。runner_error 表示「门禁没跑起来」。"""
    env = dict(os.environ)
    env['NODE_PATH'] = NODE_MODULES
    for cmd in GATES[gate]:
        try:
            p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True,
                               timeout=600, env=env)
        except Exception as e:                      # 跑不起来 ≠ 门禁失败
            return False, True, 'harness: %s' % e
        if p.returncode is None:
            return False, True, 'harness: 无法 spawn %s' % cmd[0]
        out = p.stdout + p.stderr
        failed = p.returncode != 0
    return failed, False, out


def read_rel(rel):
    with open(os.path.join(ROOT, rel), encoding='utf-8') as f:
        return f.read()


def write_rel(rel, s):
    with open(os.path.join(ROOT, rel), 'w', encoding='utf-8', newline='\n') as f:
        f.write(s)


def restore(rel):
    subprocess.run(['git', 'checkout', '--', rel], cwd=ROOT,
                   capture_output=True, text=True)


def apply_mut(m):
    """注入缺陷。返回说明；抛异常 = 注入失败（harness 的问题）。"""
    abs_p = os.path.join(ROOT, m['file'])
    if not os.path.exists(abs_p):
        raise RuntimeError('文件不存在：' + m['file'])
    if m.get('prepare') == 'delete':
        os.remove(abs_p)
        return '已删除'
    if m.get('prepare') == 'zero':
        open(abs_p, 'wb').close()
        return '已清空'
    if 'ffmpeg_volume' in m:
        tmp = abs_p + '.mut.wav'
        p = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', abs_p,
                            '-af', 'volume=' + m['ffmpeg_volume'],
                            '-ac', '1', '-ar', '16000', '-codec:a', 'libmp3lame',
                            '-b:a', '12k', tmp], cwd=ROOT, capture_output=True, text=True)
        if p.returncode != 0 or not os.path.exists(tmp):
            raise RuntimeError('ffmpeg 变异失败：' + p.stderr[:120])
        with open(tmp, 'rb') as src, open(abs_p, 'wb') as dst:
            dst.write(src.read())
        os.remove(tmp)
        return 'ffmpeg volume=' + m['ffmpeg_volume']
    src = read_rel(m['file'])
    if m['find'] not in src:
        raise RuntimeError('find 串不存在：%r' % m['find'][:40])
    write_rel(m['file'], src.replace(m['find'], m['repl']))
    return '已替换'


def main():
    ap = argparse.ArgumentParser(description='反证 harness：门禁抓不抓得住真缺陷')
    ap.add_argument('--only', help='只跑某一组')
    ap.add_argument('--list', action='store_true', help='只列清单')
    args = ap.parse_args()

    if args.list:
        for m in MUTATIONS:
            print('  [%-13s] %-28s %s' % (m['group'], m['file'], m['desc']))
        return 0

    # ---- 纪律①：基线必须先验证，否则中止，绝不输出检出率 ----
    print('反证 harness：注入已知缺陷，看门禁是否报红')
    print('第 0 步 · 基线验证（干净树上所有门禁必须全绿，否则本轮结果不可信）：')
    baseline_ok = True
    for g in GATES:
        failed, rerr, out = run_gate(g)
        if rerr:
            print('  \x1b[31m✗ %-12s 门禁跑不起来：%s\x1b[0m' % (g, out.strip()[:120]))
            baseline_ok = False
        elif failed:
            print('  \x1b[31m✗ %-12s 基线就不干净\x1b[0m' % g)
            for line in out.splitlines():
                if '✗' in line:
                    print('      ' + line.strip())
            baseline_ok = False
        else:
            print('  \x1b[32m✓ %-12s PASS\x1b[0m' % g)
    if not baseline_ok:
        print('\n\x1b[31m基线不干净或门禁无法运行 —— 已中止。'
              '\n在能信任这个数字之前，输出检出率是没有意义的（第一版就是这么造出假象的）。\x1b[0m')
        return 2

    todo = [m for m in MUTATIONS if not args.only or m['group'] == args.only]
    print('\n第 1 步 · 注入并验证（共 %d 条）' % len(todo))
    rows = []
    for m in todo:
        try:
            note = apply_mut(m)
        except Exception as e:
            rows.append((m, 'INJECT_ERROR', str(e)))
            restore(m['file'])
            continue
        failed, rerr, out = run_gate(m['gate'])
        if rerr:
            rows.append((m, 'RUNNER_ERROR', note + ' / ' + out.strip()[:80]))
        else:
            rows.append((m, 'CAUGHT' if failed else 'MISSED', note))
        restore(m['file'])

    color = {'CAUGHT': '\x1b[32m抓到\x1b[0m', 'MISSED': '\x1b[31m漏网\x1b[0m',
             'INJECT_ERROR': '\x1b[33m注入失败\x1b[0m', 'RUNNER_ERROR': '\x1b[33m门禁没跑起来\x1b[0m'}
    for m, verdict, note in rows:
        print('  %s  [%-13s] %s' % (color[verdict], m['group'], m['desc']))
        if verdict != 'CAUGHT':
            print('        ↳ %s（%s）' % (m['file'], note))

    by = {}
    for m, v, _ in rows:
        by.setdefault(m['group'], {}).setdefault(v, 0)
        by[m['group']][v] += 1
    print('\n按维度汇总：')
    for g in sorted(by):
        b = by[g]
        print('  %-14s 抓到 %d / 漏网 %d / 注入失败 %d / 门禁异常 %d'
              % (g, b.get('CAUGHT', 0), b.get('MISSED', 0),
                 b.get('INJECT_ERROR', 0), b.get('RUNNER_ERROR', 0)))

    caught = sum(1 for _, v, _ in rows if v == 'CAUGHT')
    missed = sum(1 for _, v, _ in rows if v == 'MISSED')
    bad = sum(1 for _, v, _ in rows if v in ('INJECT_ERROR', 'RUNNER_ERROR'))
    denom = caught + missed
    print('\n合计：抓到 %d / 漏网 %d / 无效 %d' % (caught, missed, bad))
    if denom:
        print('检出率 %.0f%%（分母只算「注入成功且门禁跑起来」的那些）'
              % (caught / denom * 100))
    if bad:
        print('\x1b[33m⚠️ 有 %d 条无效样本：注入失败或门禁没跑起来 —— '
              '这些既不算抓到也不算漏网，需要先修 harness。\x1b[0m' % bad)
    if missed:
        print('\x1b[31m漏网的 %d 条就是「假绿门禁」：要修的是门禁，不是代码。\x1b[0m' % missed)

    # 收尾不变量：**harness 把自己改过的东西还原了**，而不是「仓库本来是干净的」。
    # 为什么不用后者当判据：本项目 preview/play.html 是构建产物，存在换行符（EOL）噪声，
    # 每次 build 之后 git status 都不干净 —— 若拿「仓库必须干净」当收尾标准，
    # harness 会永远失败，而真正的失败（没还原）会被这条噪声淹没。
    changed = sorted({m['file'] for m in todo})
    still_dirty = []
    try:
        p = subprocess.run(['git', 'status', '--porcelain', '--'] + changed,
                           cwd=ROOT, capture_output=True, text=True)
        for line in (p.stdout or '').splitlines():
            f = line[3:].strip().strip('"')
            if f in changed:
                still_dirty.append(line.strip())
    except Exception as e:
        still_dirty = ['(git status 调用失败：%s)' % e]
    if still_dirty:
        print('\n⚠️ harness 改动过的文件没有全部还原：\n' + '\n'.join(still_dirty))
        return 1
    print('harness 改动的 %d 个文件已全部还原 ✓（不要求仓库原本干净：'
          'preview/play.html 有已知的 EOL 噪声）' % len(changed))
    return 0


if __name__ == '__main__':
    sys.exit(main())
