#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/audit_affix_reading.py — 上加字 / 下加字 / 前加字 / 后加字 四层规则核对（D110）

## 为什么要它
用户点名：项目只有「基字」一层读音，四层附加字**完全没有读音**。
顺着查下去挖出更硬的问题：**data/learning.js 的 L5/L6/L7 用笛卡尔积生成音节**，
实际会教出「རཁ གཁ ངྱ ཅྲ」这类藏文里根本不成立的组合。

本脚本把权威资料里的**穷举表**独立写死一遍（不读 data/affixes.js 自己导出的数据），
再与 data/affixes.js、data/learning.js 三方对账 ——
**判据必须与被测对象同源不同体**，否则「改错了判据」会一起错（D104 教训：判据错了 5 次）。

## 权威口径（写死在 AUTH 里，附出处）
  A1 上加字 3 个 ར ལ ས；ར 跟 12 个基字、ལ 跟 10 个、ས 跟 11 个
     —— 美篇《入学藏文基础上加字》教材：ར་མགོ་བཅུ་གཉིས / ལ་མགོ་བཅུ / ས་མགོ་བཅུ་གཅིག
     —— 中文百科 / 360 百科「藏文上加字」：同上计数
  A2 前加字 5 个；各自可接基字 ག11 / ད6 / བ10 / མ11 / འ10
     —— 百度百科「藏文前加字」规则 (1)~(5)
  A3 下加字 4 个 ྱ ྲ ླ ྭ；ྱ 接 7、ྲ 接 12、ླ 接 4（སྲ མྲ 计入 ྲ；སླ རླ 属上加字层不计入）、ྭ 有出处者 3
     —— 搜狗百科 / 百度百科「藏文下加字」
  A4 第一后加字 10 个；第二后加字 ས 接 ག ང བ མ、ད 接 ན ར ལ
     —— 维基百科「藏文」；百度百科「藏语」后加字规则 9-10

用法：python scripts/audit_affix_reading.py
退出码：0 = 全部通过；1 = 有硬错误（会卡住流水线）
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AFFIX = os.path.join(ROOT, 'data', 'affixes.js')
LEARNING = os.path.join(ROOT, 'data', 'learning.js')

# 30 个辅音（权威字母表口径，data/learning.js CONSONANTS 应与之一致）
CONSONANTS = ('ཀཁགངཅཆཇཉཏཐདནཔཕབམཙཚཛཝཞཟའཡརལཤསཧཨ')

# ---------------------------------------------------------------- 权威穷举表（独立写死）
AUTH = {
    'super': {
        'ར': 'ཀགངཇཉཏདནབམཙཛ',   # 12
        'ལ': 'ཀགངཅཇཏདཔབཧ',     # 10
        'ས': 'ཀགངཉཏདནཔབམཙ',    # 11
    },
    'prefix': {
        'ག': 'ཅཙཉཡཏདནཤསཞཟ',    # 11
        'ད': 'ཀགངཔབམ',          # 6
        'བ': 'ཀགཅཙཏདཤསཞཟ',     # 10
        'མ': 'ཁགངཆཇཉཐདནཚཛ',    # 11
        'འ': 'ཁགཆཇཐདཕབཚཛ',     # 10
    },
    'sub': {
        'ྱ': 'ཀཁགཔཕབམ',          # 7
        'ྲ': 'ཀཁགཏཐདཔཕབཧསམ',    # 12
        'ླ': 'ཀགབཟ',             # 4
        'ྭ': 'ཀཁག',              # 3（权威源未穷举，只收有出处者）
    },
}
AUTH_SUFFIX = 'གངདནབམའརལས'
AUTH_SECOND = {'ག': 'ས', 'ང': 'ས', 'བ': 'ས', 'མ': 'ས', 'ན': 'ད', 'ར': 'ད', 'ལ': 'ད'}

# 下加字必须落在 Unicode 下接形式区间（U+0F90–U+0FBF），上加字/前加字/基字落在 U+0F40–U+0F69
SUBJOINED = range(0x0F90, 0x0FC0)
RADICAL = range(0x0F40, 0x0F6A)


def grab_js(src, name):
    """取 `var NAME = '...';` / `[...]` / `{...}` 的字面量文本。

    ⚠️ 第一版只认 `{` 和 `'`，撞上两个真实写法就静默读错：
       · data/affixes.js 的 SUFFIXES 是**数组** `['ག','ང',...]` → 被当成字符串，只读出「ག」；
       · data/learning.js 的 SECOND_SUFFIX 键**没加引号** `{ ག: 'ས' }`（JS 允许藏文作标识符）→ 解析成空 dict。
       两处都不是被测数据错，是我这个解析器不认人家的合法写法。
    """
    m = re.search(r'var\s+' + re.escape(name) + r'\s*=\s*', src)
    if not m:
        return None
    i = m.end()
    c = src[i] if i < len(src) else ''
    if c == "'":
        k = src.find("'", i + 1)
        return src[i + 1:k]
    if c == '[':
        k = src.find(']', i)
        return src[i:k + 1]
    if c == '{':
        depth, k = 0, i
        while k < len(src):
            if src[k] == '{':
                depth += 1
            elif src[k] == '}':
                depth -= 1
                if depth == 0:
                    return src[i:k + 1]
            k += 1
    return None


def parse_map(text):
    """把 `{ 'ར': 'ཀགང', ག: 'ས' }` 解析成 dict（键可加引号也可不加）"""
    out = {}
    if not text:
        return out
    for k1, k2, v in re.findall(r"(?:'([^']+)'|([\u0F00-\u0FFF]+))\s*:\s*'([^']*)'", text):
        out[k1 or k2] = v
    return out


def parse_list(text):
    """数组 `['ག','ང']` 或裸串 `'ཀཁག'` 都能解析成字符 list"""
    if not text:
        return []
    if text.lstrip().startswith('['):
        return re.findall(r"'([^']+)'", text)
    return list(text)


def main():
    if not os.path.exists(AFFIX):
        print('✗ 缺少 data/affixes.js'); return 1
    src = io.open(AFFIX, encoding='utf-8').read()
    lsrc = io.open(LEARNING, encoding='utf-8').read()

    errors, warns = [], []

    print('藏文四层拼读规则 · 权威穷举表核对（D110）')
    print('判据独立写死在本脚本 AUTH 里，与 data/affixes.js 同源不同体')
    print('')

    # ---------- ① 三层「谁能接谁」逐条比对 ----------
    for layer, label, order in (
        ('super', '上加字', ['ར', 'ལ', 'ས']),
        ('prefix', '前加字', ['ག', 'ད', 'བ', 'མ', 'འ']),
        ('sub', '下加字', ['ྱ', 'ྲ', 'ླ', 'ྭ']),
    ):
        key = {'super': 'SUPER_OK', 'prefix': 'PREFIX_OK', 'sub': 'SUB_OK'}[layer]
        ours = parse_map(grab_js(src, key))
        auth = AUTH[layer]
        print('【%s】 权威 %d 个附加字' % (label, len(auth)))
        for k in order:
            a = auth.get(k, '')
            o = ours.get(k, '')
            mark = '✓'
            if o != a:
                mark = '✗'
                errors.append('%s %s 组合表不一致：本表「%s」 权威「%s」' % (label, k, o, a))
            print('   %s %s  %2d 个基字  %s' % (mark, k, len(a), a))
        # 多出来的键
        for k in ours:
            if k not in auth:
                errors.append('%s 出现权威表外的附加字：%s' % (label, k))
        print('')

    # ---------- ② 后加字 ----------
    ours_suf = parse_list(grab_js(src, 'SUFFIXES'))
    print('【后加字】 权威 10 个：%s' % AUTH_SUFFIX)
    if ''.join(ours_suf) != AUTH_SUFFIX:
        errors.append('第一后加字不一致：本表「%s」 权威「%s」' % (''.join(ours_suf), AUTH_SUFFIX))
    else:
        print('   ✓ 10 个第一后加字与权威一致')
    ours2 = parse_map(grab_js(lsrc, 'SECOND_SUFFIX'))
    if ours2 != AUTH_SECOND:
        errors.append('第二后加字规则不一致：本表 %s 权威 %s' % (ours2, AUTH_SECOND))
    else:
        print('   ✓ 第二后加字（ས 接 གངབམ / ད 接 ནརལ）与权威一致')
    print('')

    # ---------- ③ 组合展开：数量 + 字形顺序 + 基字合法性 ----------
    print('【组合展开】')
    # 只从 data/affixes.js **取数据**，判据一律用本脚本 AUTH 独立重算后在下面比对
    # （绝不把被测对象自己算出来的展开值当判据 —— 那样判据会和错误一起错）
    import subprocess, json
    r = subprocess.run(['node', '-e',
                        "var A=require('./data/affixes');"
                        "console.log(JSON.stringify({s:A.SUPER_LEGAL,p:A.PREFIX_LEGAL,b:A.SUB_LEGAL,"
                        "sr:A.SUPER_READ,br:A.SUB_READ}));"],
                       cwd=ROOT, capture_output=True, text=True)
    if r.returncode != 0:
        print('   ✗ data/affixes.js 无法在 node 中加载：%s' % (r.stderr or '').strip()[:200])
        return 1
    d = json.loads(r.stdout)
    for key, layer, label, after in (
        ('s', 'super', '上加字', False), ('p', 'prefix', '前加字', False), ('b', 'sub', '下加字', True)
    ):
        lst = d[key]
        expect = []
        for k in AUTH[layer]:
            for base in AUTH[layer][k]:
                expect.append((base + k) if after else (k + base))
        if lst == expect:
            print('   ✓ %-4s 展开 %2d 条，与权威穷举逐条同序一致' % (label, len(lst)))
        else:
            only_ours = [x for x in lst if x not in expect]
            only_auth = [x for x in expect if x not in lst]
            errors.append('%s 展开不一致：多出 %s；缺少 %s' % (label, only_ours, only_auth))
            print('   ✗ %-4s 展开 %2d 条（权威 %d）：多出 %s 缺少 %s'
                  % (label, len(lst), len(expect), only_ours, only_auth))
        # 字形顺序：下加字必须在基字之后；上加字/前加字必须在基字之前
        for syl in lst:
            if len(syl) != 2:
                errors.append('%s 组合「%s」不是 2 个字符' % (label, syl)); continue
            a, b = syl[0], syl[1]
            if after:
                if ord(b) not in SUBJOINED:
                    errors.append('下加字组合「%s」第二个字符不是下接形式' % syl)
                if ord(a) not in RADICAL:
                    errors.append('下加字组合「%s」第一个字符不是基字' % syl)
            else:
                if ord(b) not in RADICAL:
                    errors.append('%s组合「%s」基字不在辅音区间' % (label, syl))
                if ord(a) not in RADICAL:
                    errors.append('%s组合「%s」附加字不在辅音区间' % (label, syl))
            base = a if after else b
            if base not in CONSONANTS:
                errors.append('%s组合「%s」的基字「%s」不在 30 辅音内' % (label, syl, base))
    print('')

    # ---------- ④ 读音覆盖 ----------
    print('【读音覆盖】')
    missing = [x for x in d['b'] if x not in d['br']]
    if missing:
        errors.append('下加字组合缺读音：%s' % ' '.join(missing))
        print('   ✗ 下加字缺读音 %d 条：%s' % (len(missing), ' '.join(missing)))
    else:
        print('   ✓ 下加字 %d 条全部有拉萨音' % len(d['b']))
    m2 = []
    for syl in d['s']:
        base = syl[1]
        if base not in d['sr']:
            m2.append(syl)
    if m2:
        errors.append('上加字组合缺读音：%s' % ' '.join(m2))
        print('   ✗ 上加字缺读音 %d 条：%s' % (len(m2), ' '.join(m2)))
    else:
        print('   ✓ 上加字 %d 条全部有拉萨音' % len(d['s']))
    # 前加字按规则推导，不做逐条读音表 → 但要确认 5 条规则在案
    n_pf = len(re.findall(r"id:\s*'PF\d'", src))
    if n_pf != 5:
        errors.append('前加字读音规则应为 5 条，实为 %d 条' % n_pf)
    else:
        print('   ✓ 前加字 5 条读音规则在案')
    n_sf = len(re.findall(r"id:\s*'SF\d+'", src))
    if n_sf != 10:
        errors.append('后加字读音规则应为 10 条，实为 %d 条' % n_sf)
    else:
        print('   ✓ 后加字 10 条读音规则在案')
    print('')

    # ---------- ⑤ 回归：learning.js 不得再生成非法组合 ----------
    print('【回归】学习体系实际生成的音节是否全部成立')
    r2 = subprocess.run(['node', '-e',
                         "var L=require('./utils/learning');"
                         "var out={};[3,4,5,6,7,8,9].forEach(function(lv){var a=[];"
                         "for(var s=1;s<=10;s++){(L.titlesFor(lv,s)||[]).forEach(function(t){"
                         "if(a.indexOf(t)<0)a.push(t);});}out[lv]=a;});"
                         "console.log(JSON.stringify(out));"],
                        cwd=ROOT, capture_output=True, text=True)
    if r2.returncode != 0:
        errors.append('无法枚举 utils/learning.js 的生成结果')
        print('   ✗ 枚举失败：%s' % (r2.stderr or '').strip()[:200])
    else:
        gen = json.loads(r2.stdout)
        bad_total = 0
        check = {5: ('prefix', '前加字'), 6: ('super', '上加字'), 7: ('sub', '下加字')}
        for lv in sorted(check):
            layer, label = check[lv]
            legal = d[{'prefix': 'p', 'super': 's', 'sub': 'b'}[layer]]
            bad = [x for x in gen.get(str(lv), []) if x not in legal]
            bad_total += len(bad)
            if bad:
                errors.append('L%d %s 仍在生成藏文不成立的音节：%s' % (lv, label, ' '.join(bad)))
                print('   ✗ L%-2d %s 非法 %d/%d：%s' % (lv, label, len(bad), len(gen[str(lv)]), ' '.join(bad)))
            else:
                print('   ✓ L%-2d %s %d 条全部成立' % (lv, label, len(gen[str(lv)])))
        if bad_total == 0:
            print('   ✓ 学习体系不再教不存在的音节')
    print('')

    print('=' * 74)
    if errors:
        print('✗ %d 项硬错误：' % len(errors))
        for e in errors:
            print('   · %s' % e)
        return 1
    print('✓ 四层规则与权威穷举表逐条一致；读音覆盖完整；学习体系无非法音节')
    print('')
    print('参考出处：维基百科「藏文」/「标准藏语」· 百度百科「藏文前加字」「藏语」')
    print('           · 美篇《入学藏文基础上加字》教材 · 中文百科/360 百科「藏文上加字」')
    print('           · 搜狗百科「藏文下加字」· Perekhvalskaya《Lhasa Tibetan》(2025)')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
