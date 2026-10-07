#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/gen_voice.py — 把「藏文发音」批量生成为 audio/voice/*.mp3（TTS 预生成流水线）

用途（D45，2026-10-07）：
  34 条元素发音 + 2 条情绪语音（扎西德勒 / 结算祝福）目前是**静默回退**——
  游戏里配对成功后的「发音播报」要有声音，只差音频文件本身。
  用第三方藏语 TTS（推荐天翼 AI 开放平台的「卫藏实时超自然语音合成」，
  见 docs/release-and-monetization.md §八）**一次性离线预生成**，放进 audio/voice/。
  ⚠️ 预生成 = 静态资产，运行时零请求、零云函数 —— 不触碰 D3（纯本地）/ D13（不建后端）红线。
  这就是 D36 否决「运行时云函数 TTS」之后，唯一合规且可落地的语音方案。

它怎么工作：
  ① 从 data/cards.js 读出 34 个元素各自的藏文文本（字母=字形本身；图标=藏语名，
     从 subtitle 的「藏语：X」里取），加上 2 条固定情绪语音 → 共 36 条文本；
  ② 按 scripts/tts-config.json 里的接口配置逐个 POST 合成；
  ③ 响应按配置解析（原始音频字节 或 JSON base64 字段），写 MP3 到 audio/voice/；
  ④ 幂等：已存在的文件跳过（--force 覆盖）；失败不中断，最后统一报告。

配置（scripts/tts-config.json，从 tts-config.example.json 复制修改）：
  {
    "url": "https://..../tts",
    "method": "POST",
    "headers": { "Authorization": "Bearer <你的key>", "X-APP-ID": "<天翼的AppID>" },
    "bodyTemplate": { "text": "{text}", "format": "mp3" },
    "bodyExtra": { "voice": "卫藏女声", "speed": 1.0 },
    "responseMode": "raw"                 // 或 "json:result.audio"（base64 字段路径）
  }

用法：
  python scripts/gen_voice.py --dry-run          # 只列出要生成的 36 条文本（不联网）
  python scripts/gen_voice.py                    # 全量生成（跳过已存在）
  python scripts/gen_voice.py --only letter_01 icon_1  # 只生成指定条目（试音）
  python scripts/gen_voice.py --force            # 覆盖已存在
  python scripts/gen_voice.py --self-test        # 本地假接口自测（不联网，验证流水线）

只依赖 Python 标准库（urllib/json/base64/re），不需要 pip install。
"""
import argparse
import base64
import json
import os
import re
import sys
import urllib.request
import urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICE_DIR = os.path.join(ROOT, 'audio', 'voice')
CONFIG_PATH = os.path.join(ROOT, 'scripts', 'tts-config.json')
CARDS_PATH = os.path.join(ROOT, 'data', 'cards.js')

# 情绪语音（README 里定的两条）与它们的固定文本
EMOTION_TEXTS = {
    'tashi_delek': 'བཀྲ་ཤིས་བདེ་ལེགས',                       # 扎西德勒
    'blessing_01': 'སེམས་ཁྲལ་མེད་པར་སྤྲོ་པོ་ཡོང་བར་ཤོག',      # 愿你无忧无虑，心生欢喜
}


def read_texts():
    """从 data/cards.js 提取 34 条元素文本 + 2 条情绪语音 → {id: text}（顺序稳定）。"""
    src = open(CARDS_PATH, encoding='utf-8').read()
    texts = {}
    for m in re.finditer(r"id:\s*'([^']+)'[\s\S]*?tibetan:\s*'([^']*)'[\s\S]*?subtitle:\s*'([^']*)'", src):
        eid, tibetan, subtitle = m.group(1), m.group(2).strip(), m.group(3)
        if tibetan:
            texts[eid] = tibetan                      # 字母：字形本身
        else:
            mm = re.search(r'藏语：([^\s\'"、（()]+)', subtitle)
            if mm:
                texts[eid] = mm.group(1)              # 图标：藏语名（དཔལ་བེའུ / ནས / གངས་རི / གཡག）
            else:
                print('  ⚠️ %s 找不到藏文文本（跳过）：%s' % (eid, subtitle))
    texts.update(EMOTION_TEXTS)
    return texts


def load_config():
    if not os.path.exists(CONFIG_PATH):
        print('✗ 缺少 %s（从 scripts/tts-config.example.json 复制一份并填入你的接口信息）' % CONFIG_PATH)
        sys.exit(2)
    cfg = json.load(open(CONFIG_PATH, encoding='utf-8'))
    for k in ('url', 'responseMode'):
        if not cfg.get(k):
            print('✗ 配置缺字段：%s' % k)
            sys.exit(2)
    return cfg


def build_request(cfg, text):
    """按配置构造请求体。{text} 占位符在 bodyTemplate 的任意字符串值里替换。"""
    body = {}
    for k, v in (cfg.get('bodyTemplate') or {'text': '{text}'}).items():
        body[k] = v.replace('{text}', text) if isinstance(v, str) else v
    body.update(cfg.get('bodyExtra') or {})
    data = json.dumps(body, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(cfg['url'], data=data, method=cfg.get('method', 'POST'))
    req.add_header('Content-Type', 'application/json')
    for k, v in (cfg.get('headers') or {}).items():
        req.add_header(k, v)
    return req


def parse_response(cfg, raw):
    """raw → 音频字节。responseMode: 'raw' 或 'json:<路径>'（路径指向 base64 字符串）。"""
    mode = cfg['responseMode']
    if mode == 'raw':
        return raw
    if mode.startswith('json:'):
        path = mode.split(':', 1)[1].split('.')
        obj = json.loads(raw.decode('utf-8'))
        cur = obj
        for p in path:
            cur = cur[int(p)] if p.isdigit() else cur[p]
        return base64.b64decode(cur)
    raise ValueError('未知 responseMode: ' + mode)


def synthesize(cfg, text, timeout=30):
    req = build_request(cfg, text)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return parse_response(cfg, resp.read())


def run(targets, texts, cfg, force, quiet=False):
    os.makedirs(VOICE_DIR, exist_ok=True)
    ok, skip, fail = 0, 0, []
    for vid in targets:
        text = texts[vid]
        out = os.path.join(VOICE_DIR, vid + '.mp3')
        if os.path.exists(out) and not force:
            skip += 1
            if not quiet:
                print('  - %-12s 已存在，跳过' % vid)
            continue
        try:
            audio = synthesize(cfg, text)
            if not audio or len(audio) < 256:
                raise ValueError('返回音频过小（%d 字节）' % len(audio or b''))
            with open(out, 'wb') as f:
                f.write(audio)
            ok += 1
            print('  ✓ %-12s %-24s → %d 字节' % (vid, text, len(audio)))
        except urllib.error.HTTPError as e:
            fail.append('%s: HTTP %s %s' % (vid, e.code, e.read()[:120]))
        except Exception as e:  # noqa: BLE001 —— 单条失败不能中断整批
            fail.append('%s: %s' % (vid, e))
    print('\n完成：新增 %d 条 / 跳过 %d 条 / 失败 %d 条' % (ok, skip, len(fail)))
    for f in fail:
        print('  ✗ ' + f)
    if fail:
        print('提示：失败多为鉴权或额度问题；修正 scripts/tts-config.json 后重跑即可（已生成的会跳过）')
    return len(fail)


def self_test():
    """本地假接口自测：不联网，验证「取文本 → 构造请求 → 解析响应 → 落盘」整条流水线。"""
    import threading
    from http.server import BaseHTTPRequestHandler, HTTPServer

    class Fake(BaseHTTPRequestHandler):
        def do_POST(self):
            n = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(n).decode('utf-8'))
            assert body.get('text'), '请求体缺 text'
            fake_mp3 = b'ID3\x03\x00\x00\x00' + b'\x00' * 400   # 一段占位音频（>256 字节）
            if self.path == '/jsonmode':
                data = json.dumps({'code': 0, 'result': {'audio': base64.b64encode(fake_mp3).decode()}}).encode()
                self.send_response(200); self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)
            else:
                self.send_response(200); self.send_header('Content-Type', 'audio/mpeg')
                self.send_header('Content-Length', str(len(fake_mp3))); self.end_headers(); self.wfile.write(fake_mp3)

        def log_message(self, *a):
            pass

    srv = HTTPServer(('127.0.0.1', 0), Fake)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    port = srv.server_address[1]
    texts = read_texts()
    print('自测：从 data/cards.js 读到 %d 条文本（应为 36）' % len(texts))
    assert len(texts) == 36, '文本条数不对'
    cfg = {'url': 'http://127.0.0.1:%d/tts' % port, 'responseMode': 'raw',
           'headers': {'Authorization': 'test'}, 'bodyTemplate': {'text': '{text}', 'format': 'mp3'}}
    # 只测前 3 条 + 清理
    subset = list(texts.keys())[:3]
    fails = run(subset, texts, cfg, force=True, quiet=True)
    made = [v for v in subset if os.path.exists(os.path.join(VOICE_DIR, v + '.mp3'))]
    for v in subset:
        p = os.path.join(VOICE_DIR, v + '.mp3')
        if os.path.exists(p):
            os.remove(p)
    assert fails == 0 and len(made) == 3, 'raw 模式自测失败'
    # json:result.audio 模式
    cfg2 = dict(cfg); cfg2['url'] = 'http://127.0.0.1:%d/jsonmode' % port; cfg2['responseMode'] = 'json:result.audio'
    subset2 = list(texts.keys())[3:4]
    fails2 = run(subset2, texts, cfg2, force=True, quiet=True)
    made2 = os.path.exists(os.path.join(VOICE_DIR, subset2[0] + '.mp3'))
    for v in subset2:
        p = os.path.join(VOICE_DIR, v + '.mp3')
        if os.path.exists(p):
            os.remove(p)
    assert fails2 == 0 and made2, 'json 模式自测失败'
    srv.shutdown()
    print('自测通过 ✓（raw 与 json:result.audio 两种响应模式都能落盘，且用后清理）')


def main():
    ap = argparse.ArgumentParser(description='藏文发音批量预生成（TTS → audio/voice/*.mp3）')
    ap.add_argument('--dry-run', action='store_true', help='只列出将生成的文本，不联网')
    ap.add_argument('--only', nargs='+', help='只生成指定条目（如 letter_01 icon_1）')
    ap.add_argument('--force', action='store_true', help='覆盖已存在的文件')
    ap.add_argument('--self-test', action='store_true', help='本地假接口自测（不联网）')
    args = ap.parse_args()

    if args.self_test:
        self_test()
        return

    texts = read_texts()
    targets = list(texts.keys())
    if args.only:
        targets = [t for t in args.only if t in texts]
        unknown = [t for t in args.only if t not in texts]
        if unknown:
            print('✗ 未知条目：%s（可选：%s…）' % (' '.join(unknown), ' '.join(list(texts)[:5])))
            sys.exit(2)

    if args.dry_run:
        print('待生成 %d 条（写入 audio/voice/）：' % len(targets))
        for t in targets:
            print('  %-12s %s' % (t, texts[t]))
        print('\n提示：真实生成前先复制 scripts/tts-config.example.json → scripts/tts-config.json 并填好接口信息。')
        return

    cfg = load_config()
    print('接口：%s（responseMode=%s）' % (cfg['url'], cfg['responseMode']))
    sys.exit(1 if run(targets, texts, cfg, args.force) else 0)


if __name__ == '__main__':
    main()
