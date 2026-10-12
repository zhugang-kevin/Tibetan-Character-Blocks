#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/audit_deep.py — 潜在问题深挖（D101）

## 它和另外两个体检的分工
  · audit_local.py        —— 「文件/引用/资源」这类**静态完整性**
  · audit_local_runtime.py—— 「控制台报错/溢出」这类**跑起来才看得见**
  · **audit_deep.py（本文件）** —— **还没暴露、但迟早会暴露**的那一类。
    用户要求：「深入深化所有的可能性、潜在性的问题，不要到时候做好了就是一大堆问题」。

## 挖什么（每一条都对应一个真实会发生的故障）
  ① 存储容量      wx.setStorageSync 上限 10MB；长期累积 → **静默丢数据**
  ② 并发点击      打赏/浇水/兑换连点 → **重复扣款 / 重复发货**
  ③ 异步生命周期  页面卸载后 setData / 定时器未清 → 报错、内存增长、错帧
  ④ 小屏适配      320px 宽的旧机型 → 布局崩
  ⑤ 数据版本      老用户本地结构与新代码不匹配 → **白屏**
  ⑥ 音频上下文    每次播放都新建 InnerAudioContext → 句柄泄漏
  ⑦ 页面栈深度    navigateTo 超 10 层 → 跳转失败
  ⑧ 边界/空值     0 值、空数组、超长输入

用法：python scripts/audit_deep.py [--json]
"""
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = ['index', 'game', 'result', 'cert', 'passport', 'benefits']
SKIP = {'node_modules', '.git', '.workbuddy', 'preview', 'docs', 'scripts',
        'server', 'assets-src', 'miniprogram_npm'}

fails, warns, oks = [], [], []


def ok(m): oks.append(m); print('  ✓ ' + m)
def bad(m): fails.append(m); print('  ✗ ' + m)
def warn(m): warns.append(m); print('  ! ' + m)


def read(rel):
    p = os.path.join(ROOT, rel)
    return io.open(p, encoding='utf-8').read() if os.path.exists(p) else ''


def page_files(ext):
    out = []
    for d in PAGES:
        p = 'pages/%s/%s%s' % (d, d, ext)
        if os.path.exists(os.path.join(ROOT, p)):
            out.append(p)
    return out


def all_js():
    out = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP]
        for f in filenames:
            if f.endswith('.js'):
                out.append(os.path.relpath(os.path.join(dirpath, f), ROOT).replace('\\', '/'))
    return out


print('潜在问题深挖（找的是「还没炸、但迟早会炸」的）')

# ---------- ① 存储容量 ----------
print('\n[1. 存储容量（wx.setStorageSync 上限 10MB）]')
storage = read('utils/storage.js')
writes = re.findall(r'rawWrite\(', storage)
# 找出被写入的字段里可能无限增长的
grow = []
for name, pat in [('learnDone（每课一条 key）', r"learnDone"),
                  ('openLog（每次打开一条）', r"openLog"),
                  ('certificates', r"saveCert|getCerts")]:
    if re.search(pat, storage):
        grow.append(name)
if grow:
    warn('可能有增长性的存储字段：' + '、'.join(grow))
    print('      判据：这些字段按「天数/课数」累积，长期不清理会逼近 10MB 上限。')
    print('      需要：写入时做上限裁剪（本项目是否已做，见下方逐项检查）')
# 检查是否有裁剪逻辑
if re.search(r'\.slice\(-?\d+\)|splice\(|MAX_|}', storage):
    ok('storage.js 里存在裁剪/上限相关逻辑（需人工确认覆盖到上述字段）')
else:
    bad('storage.js 未见任何容量裁剪 —— 长期使用会静默丢数据')
# 打开日志是否裁剪
if re.search(r'openLog', storage):
    seg = storage[storage.index('openLog'):storage.index('openLog') + 800] if 'openLog' in storage else ''
    if re.search(r'slice\(|MAX|上限|裁剪', seg):
        ok('打开日志有裁剪')
    else:
        warn('打开日志未见裁剪（逐日累积）')

# ---------- ② 并发点击 ----------
print('\n[2. 并发点击（连点两次 → 重复扣款/发货）]')
concurrent_risky = []
# 会「扣钱/扣分/发货」的动作
for rel in page_files('.js'):
    src = read(rel)
    for fn in re.finditer(r'(\w+):\s*function\s*\([^)]*\)\s*\{(.{0,600}?)\n  \}', src, re.S):
        name, body = fn.group(1), fn.group(2)
        # ⚠️ 第一版把 onShareTimeline 报成「未保护」——它只是分享回调，不做扣减。
        #   误报来自关键词「水」匹配到别处文本，且没排除生命周期/分享钩子。
        self_life = re.match(r'(on|do)?(Share|Load|Show|Hide|Ready|Unload|PullDown|ReachBottom|TabItem|PageScroll|Resize|ShareTimeline|ShareAppMessage)', name, re.I)
        if self_life: continue
        risky = re.search(r'spendPoints\(|createOrder\(|claimDelivery\(|addOil\(|storage\.addItem\(', body)
        if risky:
            guarded = re.search(r'busy|loading|disabled|_lock|_pending|inFlight|if\s*\(\s*this\.data\.\w*(Busy|Lock|ing)', body)
            concurrent_risky.append((rel, name, bool(guarded)))
for rel, name, guarded in concurrent_risky:
    if guarded:
        ok('%s → %s() 有并发保护' % (rel.split('/')[1], name))
    else:
        bad('%s → %s() **无并发保护** —— 连点两次会重复执行' % (rel.split('/')[1], name))
if not concurrent_risky:
    warn('未识别到「扣款/发货」类动作（若确有支付/兑换入口，说明识别规则没覆盖到）')

# ---------- ③ 异步生命周期 ----------
print('\n[3. 异步生命周期（卸载后 setData / 定时器未清）]')
for rel in page_files('.js'):
    src = read(rel)
    has_timer = re.search(r'setTimeout|setInterval', src)
    has_alive = re.search(r'_alive|onUnload', src)
    has_clear = re.search(r'clearTimeout|clearInterval', src)
    if has_timer and not has_alive:
        bad('%s 有定时器但**没有 onUnload/_alive 守卫** —— 卸载后回调会 setData' % rel)
    elif has_timer and has_alive and not has_clear:
        warn('%s 有 _alive 但没有 clearTimeout（守卫够用，但定时器仍会跑完）' % rel)
    elif has_timer:
        ok('%s 定时器有生命周期守卫' % rel)
# 异步 then 里 setData 是否守卫
unguarded = []
for rel in page_files('.js'):
    src = read(rel)
    if 'onUnload' not in src and re.search(r'\.then\(|await ', src):
        unguarded.append(rel)
if unguarded:
    warn('含异步但无 onUnload 的页面：' + '、'.join(u.split('/')[1] for u in unguarded))
else:
    ok('含异步的页面都有 onUnload 生命周期处理')

# ---------- ④ 小屏适配 ----------
print('\n[4. 小屏适配（320px 旧机型）]')
narrow = []
for rel in page_files('.wxss') + ['app.wxss']:
    src = read(rel)
    # 找固定宽度（px），rpx 是自适应的不用管
    # ⚠️ 判据第一版把 `max-width: 560px`（平板封顶，注释写明「只封顶不放大」）
    #   误报成「小屏会溢出」。用负向回顾排除 max-/min- —— 保护性封顶只会更窄，
    #   永远不会导致横向溢出。
    for m in re.finditer(r'(?<!max-)(?<!min-)width:\s*(\d{3,})px', src):
        v = int(m.group(1))
        if v > 320:
            narrow.append('%s 固定 width:%dpx' % (rel, v))
if narrow:
    for x in narrow[:5]:
        bad('小屏会溢出：' + x)
else:
    ok('未发现 >320px 的固定宽度（rpx 自适应）')

# ---------- ⑤ 数据版本 ----------
print('\n[5. 本地数据版本（老用户结构 ≠ 新代码期待 → 白屏）]')
if re.search(r'version|schema|migrat', storage, re.I):
    ok('storage.js 有版本/迁移相关处理')
else:
    warn('storage.js **未见版本号与迁移逻辑** —— 结构一旦变更，老用户数据可能读崩')
    print('      注：rawRead() 对脏数据做了「当成全新用户」的兜底，能避免白屏，')
    print('          但代价是**老用户进度归零且用户无从知晓**。是否可接受需产品决定。')

# ---------- ⑥ 音频上下文 ----------
print('\n[6. 音频上下文（句柄泄漏）]')
audio = read('utils/audio.js')
n_create = len(re.findall(r'createInnerAudioContext', audio))
if re.search(r'voiceCtx\[', audio) or re.search(r'var \w+Ctx = \{\}', audio):
    ok('发音上下文有缓存表（voiceCtx），不是每次新建')
elif n_create > 1:
    bad('可能有 %d 处新建 InnerAudioContext 且无缓存 —— 连播会积句柄' % n_create)
else:
    ok('音频上下文创建点受控')

# ---------- ⑦ 页面栈深度 ----------
print('\n[7. 页面栈深度（navigateTo 上限 10 层）]')
depth_risk = []
for rel in all_js():
    src = read(rel)
    for m in re.finditer(r'navigateTo\(\{\s*url:\s*[\'"]([^\'"]+)', src):
        # 有没有可能自己跳自己形成环
        pass
    if re.search(r'navigateTo', src) and re.search(r'redirectTo|navigateBack', src):
        depth_risk.append(rel)
if re.search(r'redirectTo', ''.join(read(r) for r in all_js())):
    ok('存在 redirectTo/navigateBack（换页而非无限压栈）')
else:
    warn('全项目未见 redirectTo —— 若存在「A→B→C→A」的路径会撞 10 层上限')

# ---------- ⑧ 边界/空值 ----------
print('\n[8. 边界与空值]')
game = read('pages/game/game.js')
if re.search(r'if\s*\(\s*!this\.data\.card\s*\)\s*return', game):
    ok('文化卡操作有「无卡直接返回」守卫')
if re.search(r'Math\.max\(0,', game) or re.search(r'Math\.max\(0,', storage):
    ok('计数类有 Math.max(0,…) 下界（不会变负数）')
else:
    warn('未见 Math.max(0,…) 下界保护 —— 扣减类数值可能变负')
# 超长输入
# ⚠️ 判据第一版只查了首页 —— 而输入框实际在 cert/result 页，
#   于是「有 maxlength=10」被报成「未见长度上限」。改为扫**所有**页面的 wxml。
allw = ''.join(read(r) for r in page_files('.wxml'))
n_max = len(re.findall(r'maxlength=', allw))
n_input = len(re.findall(r'<input', allw))
if n_input and n_max >= n_input:
    ok('全部 %d 个输入框都有 maxlength（%d 处）' % (n_input, n_max))
elif n_max:
    warn('有 %d/%d 个输入框带 maxlength，其余未见上限' % (n_max, n_input))
else:
    warn('页面输入框未见长度上限（超长输入会破坏排版/证书）')

print('\n' + '=' * 58)
print('  通过 %d ｜ 警告 %d ｜ **失败 %d**' % (len(oks), len(warns), len(fails)))
if fails:
    print('  存在必须修的潜在问题，见上方 ✗')
sys.exit(1 if fails else 0)
