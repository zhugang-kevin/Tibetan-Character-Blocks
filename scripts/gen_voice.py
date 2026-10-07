#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/gen_voice.py — 把「藏文发音」批量生成为 audio/voice/*.wav（TTS 预生成流水线）

D45（2026-10-07）：34 条元素发音 + 2 条情绪语音目前是静默回退——游戏里「配对成功后的
发音播报」要有声音，只差音频文件本身。用第三方藏语 TTS **一次性离线预生成**放进来。
预生成 = 静态资产、运行时零请求 —— 不触碰 D3（纯本地）/ D13（不建后端）红线。

主通道：天翼 AI 开放平台「卫藏实时超自然语音合成」
  · 协议：WebSocket（wss://openapi.teleagi.cn:443/aipaas/voice/v1/tts/supernaturalrt）
  · 鉴权：Authorization = teleai-cloud-auth-v1/{AppID}/{region}/{ts}/{exp}/{signedHeaders}/{sig}
           SigningKey = HMAC-SHA256-HEX(AppKey, prefix)，Signature = HMAC-SHA256-HEX(SigningKey, CanonicalRequest)
           CanonicalRequest = GET \\n {path} \\n {query=''} \\n x-app-id:{AppID}
  · 输出：PCM 16bit 单声道（base64 分片，is_end 收尾）→ 本脚本封装为 WAV + 静音裁剪
  · 配置：scripts/tts-config.json（从 .example.json 复制；该文件被 .gitignore 屏蔽）

备用通道：任何 HTTP TTS 接口（provider = custom-http，模板见 .example.json）。

用法：
  python scripts/gen_voice.py --dry-run          # 列出 36 条文本（不联网）
  python scripts/gen_voice.py --probe            # 只握手一次，打印鉴权结果（排障用）
  python scripts/gen_voice.py --only letter_01   # 先生成 1 条试听
  python scripts/gen_voice.py                    # 全量（幂等：已存在跳过）
  python scripts/gen_voice.py --self-test        # 本地假 WS 服务自测整条流水线（不联网）

只依赖 Python 标准库（socket/ssl/hmac/hashlib/wave/…），零安装。
"""
import argparse
import array
import base64
import hashlib
import hmac
import json
import os
import re
import socket
import ssl
import struct
import sys
import time
import urllib.parse
import urllib.request
import urllib.error
import uuid
import wave

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICE_DIR = os.path.join(ROOT, 'audio', 'voice')
CONFIG_PATH = os.path.join(ROOT, 'scripts', 'tts-config.json')
CARDS_PATH = os.path.join(ROOT, 'data', 'cards.js')

EMOTION_TEXTS = {
    'tashi_delek': 'བཀྲ་ཤིས་བདེ་ལེགས',
    'blessing_01': 'སེམས་ཁྲལ་མེད་པར་སྤྲོ་པོ་ཡོང་བར་ཤོག',
}

# 天翼默认参数（可在 tts-config.json 里覆盖）
TELEAI_ENDPOINT = 'wss://openapi.teleagi.cn:443/aipaas/voice/v1/weizStreamingSuperTts/streaming'   # 卫藏专属（8005200036）
TELEAI_ORIGIN = 'teleai-cloud-auth-v1'   # 公网鉴权头部（内网为 eop-auth-v1）

# 静音裁剪：首尾的静音按阈值裁掉，各留 30ms 垫（16kHz 下 480 样本）
TRIM_KEEP_MS = 30


# ---------------------------------------------------------------- 文本
def read_texts():
    """从 data/cards.js 提取 34 条元素文本 + 2 条情绪语音 → {id: text}（顺序稳定）。"""
    src = open(CARDS_PATH, encoding='utf-8').read()
    texts = {}
    for m in re.finditer(r"id:\s*'([^']+)'[\s\S]*?tibetan:\s*'([^']*)'[\s\S]*?subtitle:\s*'([^']*)'", src):
        eid, tibetan, subtitle = m.group(1), m.group(2).strip(), m.group(3)
        if tibetan:
            texts[eid] = tibetan
        else:
            mm = re.search(r'藏语：([^\s\'"、（()]+)', subtitle)
            if mm:
                texts[eid] = mm.group(1)
            else:
                print('  ⚠️ %s 找不到藏文文本（跳过）：%s' % (eid, subtitle))
    texts.update(EMOTION_TEXTS)
    return texts


# ---------------------------------------------------------------- 配置
def load_config():
    if not os.path.exists(CONFIG_PATH):
        print('✗ 缺少 %s（从 scripts/tts-config.example.json 复制一份并填入你的接口信息）' % CONFIG_PATH)
        sys.exit(2)
    cfg = json.load(open(CONFIG_PATH, encoding='utf-8'))
    cfg.setdefault('provider', 'teleai-ws')
    if cfg['provider'] == 'teleai-ws':
        for k in ('appId', 'appKey'):
            if not cfg.get(k) or '把这里' in str(cfg.get(k)):
                print('✗ 配置缺 %s（在 scripts/tts-config.json 里填入控制台的值）' % k)
                sys.exit(2)
        cfg.setdefault('endpoint', TELEAI_ENDPOINT)
        cfg.setdefault('region', 'QG')
        cfg.setdefault('voice', 'zhuoma')     # 卫藏方言音色（该产品唯一/默认音色）
        cfg.setdefault('sampleRate', 16000)
        if not cfg.get('deviceUuid'):
            cfg['deviceUuid'] = uuid.uuid4().hex
            print('  提示：未配置 deviceUuid，本次自动生成 %s…（若鉴权被拒，请到控制台-设备管理复制设备 uuid 填进 tts-config.json）' % cfg['deviceUuid'][:8])
        cfg.setdefault('speechRate', 0.9)     # 单字朗读稍慢一点更清楚
        cfg.setdefault('volume', 60)
    else:
        for k in ('url', 'responseMode'):
            if not cfg.get(k) or '把这里' in str(cfg.get(k)):
                print('✗ custom-http 配置缺 %s' % k)
                sys.exit(2)
    return cfg


# ---------------------------------------------------------------- 天翼签名（官方算法，见开发指南-签名认证方式）
def build_authorization(app_id, app_key, region, method, path, timestamp=None, expiration=43200):
    ts = str(timestamp or int(time.time()))
    exp = str(expiration)
    prefix = '%s/%s/%s/%s/%s' % (TELEAI_ORIGIN, app_id, region, ts, exp)
    signing_key = hmac.new(app_key.encode(), prefix.encode(), hashlib.sha256).hexdigest()
    # CanonicalHeaders：signedHeaders 用默认的 x-app-id；值按官方工具做 quote
    canonical_headers = 'x-app-id:' + urllib.parse.quote(app_id.strip(), safe='')
    canonical_request = '%s\n%s\n%s\n%s' % (method.upper(), path, '', canonical_headers)
    signature = hmac.new(signing_key.encode(), canonical_request.encode(), hashlib.sha256).hexdigest()
    return '%s/%s/%s' % (prefix, 'x-app-id', signature)


# ---------------------------------------------------------------- 极简 WebSocket 客户端（标准库实现，仅用于本脚本）
class WSClient(object):
    def __init__(self, url, headers, timeout=30):
        u = urllib.parse.urlparse(url)
        if u.scheme != 'wss':
            raise ValueError('仅支持 wss://')
        self.host, self.port, self.path = u.hostname, u.port or 443, u.path or '/'
        raw = socket.create_connection((self.host, self.port), timeout=timeout)
        ctx = ssl.create_default_context()
        self.sock = ctx.wrap_socket(raw, server_hostname=self.host)
        key = base64.b64encode(os.urandom(16)).decode()
        req = ['GET %s HTTP/1.1' % self.path, 'Host: %s:%d' % (self.host, self.port),
               'Upgrade: websocket', 'Connection: Upgrade',
               'Sec-WebSocket-Key: %s' % key, 'Sec-WebSocket-Version: 13']
        for k, v in headers.items():
            req.append('%s: %s' % (k, v))
        self.sock.sendall(('\r\n'.join(req) + '\r\n\r\n').encode())
        # 读握手响应头
        buf = b''
        while b'\r\n\r\n' not in buf:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise IOError('握手时连接被关闭')
            buf += chunk
        head, _, rest = buf.partition(b'\r\n\r\n')
        head_text = head.decode('utf-8', 'replace')
        if ' 101 ' not in head_text.split('\r\n')[0]:
            raise IOError('WebSocket 握手失败：\n' + head_text)
        # 记录网关的 Trace-Id（排障时给客服，他们能直接定位这次请求）
        mm = re.search(r'(?:Trace-Id|X-Cloud-Gateway-Request-Id):\s*(\S+)', head_text, re.I)
        self.trace_id = mm.group(1) if mm else '(无)'
        self._buf = rest

    def recv_raw(self, timeout=12):
        """读**一帧**原始数据 → (opcode, payload)；连接关闭返回 None。供 probe 用。"""
        self.sock.settimeout(timeout)
        while True:
            b1, b2 = self._recv_exact(2)
            fin, opcode = b1 & 0x80, b1 & 0x0F
            length = b2 & 0x7F
            if length == 126:
                length = struct.unpack('>H', self._recv_exact(2))[0]
            elif length == 127:
                length = struct.unpack('>Q', self._recv_exact(8))[0]
            payload = self._recv_exact(length) if length else b''
            if opcode == 0x9:                       # ping：回 pong 后继续等
                mask = os.urandom(4)
                self.sock.sendall(bytes([0x8A, 0x80 | len(payload)]) + mask +
                                  bytes(b ^ mask[i % 4] for i, b in enumerate(payload)))
                continue
            return (opcode, payload)

    def send_text(self, text):
        payload = text.encode('utf-8')
        header = bytearray([0x81])                      # FIN + text
        n = len(payload)
        if n < 126:
            header.append(0x80 | n)
        elif n < 65536:
            header.append(0x80 | 126); header += struct.pack('>H', n)
        else:
            header.append(0x80 | 127); header += struct.pack('>Q', n)
        mask = os.urandom(4)
        header += mask
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        self.sock.sendall(bytes(header) + masked)

    def _recv_exact(self, n):
        while len(self._buf) < n:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise IOError('连接被关闭')
            self._buf += chunk
        out, self._buf = self._buf[:n], self._buf[n:]
        return out

    def recv_message(self):
        """读一条完整消息（拼接分片 / 跳过 ping）。返回 str 或 None（服务端关闭）。"""
        data = b''
        while True:
            b1, b2 = self._recv_exact(2)
            fin, opcode = b1 & 0x80, b1 & 0x0F
            length = b2 & 0x7F
            if length == 126:
                length = struct.unpack('>H', self._recv_exact(2))[0]
            elif length == 127:
                length = struct.unpack('>Q', self._recv_exact(8))[0]
            payload = self._recv_exact(length) if length else b''
            if opcode == 0x8:
                return None
            if opcode == 0x9:                       # ping → pong（带掩码）
                mask = os.urandom(4)
                self.sock.sendall(bytes([0x8A, 0x80 | len(payload)]) + mask +
                                  bytes(b ^ mask[i % 4] for i, b in enumerate(payload)))
                continue
            if opcode in (0x1, 0x0, 0x2):
                data += payload
                if fin:
                    return data.decode('utf-8', 'replace')

    def close(self):
        try:
            self.sock.close()
        except Exception:
            pass


# ---------------------------------------------------------------- 天翼 WS 合成
def teleai_synthesize(cfg, text, timeout=45):
    auth = build_authorization(cfg['appId'], cfg['appKey'], cfg['region'], 'GET',
                               urllib.parse.urlparse(cfg['endpoint']).path)
    ws = WSClient(cfg['endpoint'], {
        'Content-Type': 'application/json',
        'X-APP-ID': cfg['appId'],
        'Device-Uuid': cfg.get('deviceUuid', ''),
        'Authorization': auth,
    }, timeout=timeout)
    try:
        ws.send_text(json.dumps({
            'req_id': 'zangzi-%d' % int(time.time() * 1000),
            'text': text,
            'format': 'PCM',
            'sample_rate': int(cfg['sampleRate']),
            'voice': cfg['voice'],
            'speech_rate': float(cfg['speechRate']),
            'volume': int(cfg['volume']),
        }, ensure_ascii=False))
        pcm = b''
        deadline = time.time() + timeout
        while time.time() < deadline:
            msg = ws.recv_message()
            if msg is None:
                break
            try:
                obj = json.loads(msg)
            except ValueError:
                continue
            if obj.get('code') not in (None, 10000, 101):
                raise IOError('服务返回错误：%s' % msg[:200])
            res = obj.get('result') or {}
            if res.get('audio'):
                pcm += base64.b64decode(res['audio'])
            if res.get('is_end'):
                break
        if not pcm:
            raise IOError('未收到音频数据（可能音色不支持该文本）')
        return pcm
    finally:
        ws.close()


# ---------------------------------------------------------------- PCM → WAV（含静音裁剪）
def pcm_to_wav(pcm, rate, keep_ms=TRIM_KEEP_MS):
    arr = array.array('h')
    arr.frombytes(pcm[:len(pcm) // 2 * 2])
    if not arr:
        return b''
    peak = max(max(arr), -min(arr))
    if peak <= 0:
        return b''
    thr = max(150, int(peak * 0.04))                # 静音阈值：峰值的 4%
    lo, hi = 0, len(arr) - 1
    while lo < hi and abs(arr[lo]) < thr:
        lo += 1
    while hi > lo and abs(arr[hi]) < thr:
        hi -= 1
    pad = int(rate * keep_ms / 1000)
    lo = max(0, lo - pad)
    hi = min(len(arr) - 1, hi + pad)
    arr = arr[lo:hi + 1]
    import io
    buf = io.BytesIO()
    w = wave.open(buf, 'wb')
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(rate)
    w.writeframes(arr.tobytes())
    w.close()
    return buf.getvalue()


# ---------------------------------------------------------------- HTTP 备用通道
def http_synthesize(cfg, text, timeout=30):
    body = {}
    for k, v in (cfg.get('bodyTemplate') or {'text': '{text}'}).items():
        body[k] = v.replace('{text}', text) if isinstance(v, str) else v
    body.update(cfg.get('bodyExtra') or {})
    data = json.dumps(body, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(cfg['url'], data=data, method=cfg.get('method', 'POST'))
    req.add_header('Content-Type', 'application/json')
    for k, v in (cfg.get('headers') or {}).items():
        req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
    mode = cfg['responseMode']
    if mode == 'raw':
        return raw
    if mode.startswith('json:'):
        cur = json.loads(raw.decode('utf-8'))
        for p in mode.split(':', 1)[1].split('.'):
            cur = cur[int(p)] if p.isdigit() else cur[p]
        return base64.b64decode(cur)
    raise ValueError('未知 responseMode: ' + mode)


def synthesize(cfg, text):
    if cfg['provider'] == 'teleai-ws':
        pcm = teleai_synthesize(cfg, text)
        return pcm_to_wav(pcm, int(cfg['sampleRate']))
    return http_synthesize(cfg, text)


# ---------------------------------------------------------------- 批处理
def run(targets, texts, cfg, force, quiet=False):
    os.makedirs(VOICE_DIR, exist_ok=True)
    ok, skip, fail = 0, 0, []
    for vid in targets:
        text = texts[vid]
        out = os.path.join(VOICE_DIR, vid + '.wav')
        if os.path.exists(out) and not force:
            skip += 1
            if not quiet:
                print('  - %-12s 已存在，跳过' % vid)
            continue
        try:
            audio = synthesize(cfg, text)
            if not audio or len(audio) < 512:
                raise ValueError('返回音频过小（%d 字节）' % len(audio or b''))
            with open(out, 'wb') as f:
                f.write(audio)
            ok += 1
            print('  ✓ %-12s %-24s → %6d 字节' % (vid, text, len(audio)))
        except urllib.error.HTTPError as e:
            fail.append('%s: HTTP %s %s' % (vid, e.code, e.read()[:120]))
        except Exception as e:  # noqa: BLE001 —— 单条失败不能中断整批
            fail.append('%s: %s' % (vid, e))
    print('\n完成：新增 %d 条 / 跳过 %d 条 / 失败 %d 条' % (ok, skip, len(fail)))
    for f in fail[:8]:
        print('  ✗ ' + f)
    if len(fail) > 8:
        print('  … 共 %d 条失败' % len(fail))
    if fail:
        print('提示：鉴权类失败先跑 python scripts/gen_voice.py --probe 定位；修好后重跑即可（已生成的会跳过）')
    return len(fail)


def probe(cfg):
    """只做一次握手 + 读第一帧：把排障需要的每一步都打印出来。
    三种结果对应三件不同的事：
      · 非 101（如 401）        → 签名/网络问题（AppKey、region、系统时间）
      · 101 + {"message":"success"} → 一切正常，可以开始生成
      · 101 + 立即被关（1002 Protocol error）→ 网关验签已通过，是**账号/服务侧**问题：
        常见原因按顺序排查：① 该能力未「开通服务/下单购买」（文档四步：实名→下单→建应用→调用）
        ② X-APP-ID 应取自「买家中心-已购能力」而非应用管理 ③ 设备管理里的 设备uuid 尚未登记。
        把下面的 Trace-Id 一并给天翼客服，他们能直接定位该请求。"""
    auth = build_authorization(cfg['appId'], cfg['appKey'], cfg['region'], 'GET',
                               urllib.parse.urlparse(cfg['endpoint']).path)
    print('握手中：%s（region=%s，AppID=%s…）' % (cfg['endpoint'], cfg['region'], str(cfg['appId'])[:8]))
    ws = None
    try:
        ws = WSClient(cfg['endpoint'], {
            'Content-Type': 'application/json', 'X-APP-ID': cfg['appId'],
            'Device-Uuid': cfg.get('deviceUuid', ''), 'Authorization': auth,
        }, timeout=20)
    except Exception as e:
        print('✗ 握手失败（非 101）：%s' % e)
        print('  · 多为签名/网络问题：核对 AppKey / region，并确认本机时间准确（签名含时间戳）')
        return 1
    print('Trace-Id: %s（排障时提供给天翼客服）' % ws.trace_id)
    try:
        raw = ws.recv_raw(timeout=12)
        if raw is None:
            print('（连接关闭，未收到任何帧）')
            return 1
        op, payload = raw
        if op == 0x8:
            code = struct.unpack('>H', payload[:2])[0] if len(payload) >= 2 else 0
            reason = payload[2:].decode('utf-8', 'replace')
            print('✗ 网关已验签通过（101），但服务后端拒绝了连接：close code=%d reason=%r' % (code, reason))
            print('  → 这是账号/服务侧问题，不是本脚本的问题。请在控制台核对三件事：')
            print('    ① 该能力是否已「开通服务 / 下单购买」（免费额度也要走一次开通）')
            print('    ② 本产品文档写明 X-APP-ID 取自「买家中心-已购能力」，确认它与应用管理的 AppID 一致')
            print('    ③ 「设备管理」里是否已登记设备 uuid（本配置当前用的是 %s…）' % str(cfg.get('deviceUuid'))[:8])
            print('  若三项都确认无误，把这行的 Trace-Id 发给天翼客服即可定位。')
            return 1
        if op in (0x1, 0x0):
            txt = payload.decode('utf-8', 'replace')
            print('服务端应答：%s' % txt[:200])
            if 'success' in txt:
                print('✓ 鉴权通过（101 success）——可以开始生成')
                return 0
        print('✗ 未知帧：op=%d payload=%r' % (op, payload[:120]))
        return 1
    finally:
        if ws:
            ws.close()


# ---------------------------------------------------------------- 自测（本地假 WS 服务）
def self_test():
    import threading

    def frame(payload):
        b = payload.encode('utf-8')
        head = bytearray([0x81])
        if len(b) < 126:
            head.append(len(b))
        else:
            head.append(126); head += struct.pack('>H', len(b))
        return bytes(head) + b      # 服务端帧不掩码

    class FakeWS(threading.Thread):
        daemon = True

        def __init__(self):
            super().__init__()
            self.srv = socket.socket()
            self.srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.srv.bind(('127.0.0.1', 0))
            self.srv.listen(8)
            self.port = self.srv.getsockname()[1]
            self.handshake_ok = False
            self.served = 0
            self._stop = False

        def run(self):
            # 循环接客：每条语音一个连接（固定接客数 = 自测条目数，实际由主线程关闭）
            while not self._stop:
                try:
                    self.srv.settimeout(0.5)
                    conn, _ = self.srv.accept()
                except socket.timeout:
                    continue
                except OSError:
                    break
                self._serve_one(conn)

        def _serve_one(self, conn):
            self.served += 1
            buf = b''
            while b'\r\n\r\n' not in buf:
                buf += conn.recv(4096)
            head = buf.decode('utf-8', 'replace')
            # 校验关键头：签名头必须在（内容不校验）
            self.handshake_ok = ('Authorization: teleai-cloud-auth-v1/' in head and
                                 'X-APP-ID: TESTAPPID' in head and 'Upgrade: websocket' in head)
            import base64 as b64
            key = re.search(r'Sec-WebSocket-Key: (\S+)', head).group(1)
            accept = b64.b64encode(hashlib.sha1((key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode()
            conn.sendall(('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n'
                          'Connection: Upgrade\r\nSec-WebSocket-Accept: %s\r\n\r\n' % accept).encode())
            conn.sendall(frame(json.dumps({'message': 'success'})))
            # 读一帧客户端消息（含掩码），返回两段音频 + is_end
            hdr = conn.recv(2)
            masked = hdr[1] & 0x80
            length = hdr[1] & 0x7F
            if length == 126:
                length = struct.unpack('>H', conn.recv(2))[0]
            mask = conn.recv(4) if masked else b'\x00' * 4
            payload = b''
            while len(payload) < length:
                payload += conn.recv(length - len(payload))
            if masked:
                payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
            req = json.loads(payload.decode())
            assert req.get('text'), '请求缺 text'
            pcm = struct.pack('<%dh' % 800, *[(-1) ** i * 6000 for i in range(800)])   # 50ms 16k 假 PCM
            part = b64.b64encode(pcm).decode()
            conn.sendall(frame(json.dumps({'code': 10000, 'result': {'audio': part, 'audio_len': 50, 'is_end': False}})))
            conn.sendall(frame(json.dumps({'code': 10000, 'result': {'audio': part, 'audio_len': 50, 'is_end': True}})))
            time.sleep(0.2)
            conn.close()

    fake = FakeWS()
    fake.start()
    cfg = {'provider': 'teleai-ws', 'appId': 'TESTAPPID', 'appKey': 'TESTKEY', 'region': 'QG',
           'endpoint': 'wss://127.0.0.1:%d/aipaas/voice/v1/tts/supernaturalrt' % fake.port,
           'voice': 'surennv', 'sampleRate': 16000, 'speechRate': 1.0, 'volume': 60}
    texts = read_texts()
    print('自测：从 data/cards.js 读到 %d 条文本（应为 36）' % len(texts))
    assert len(texts) == 36
    if not hasattr(ssl, 'create_default_context'):
        raise SystemExit('环境缺 ssl 模块')
    # 假服务是明文：临时把 WSClient 的 ssl 包装换成直连
    orig_wrap = ssl.SSLContext.wrap_socket
    def plain_wrap(self, raw, server_hostname=None):
        return raw
    ssl.SSLContext.wrap_socket = plain_wrap
    try:
        subset = list(texts.keys())[:2]
        fails = run(subset, texts, cfg, force=True, quiet=True)
        made = [v for v in subset if os.path.exists(os.path.join(VOICE_DIR, v + '.wav'))]
        for v in subset:
            p = os.path.join(VOICE_DIR, v + '.wav')
            if os.path.exists(p):
                os.remove(p)
        assert fails == 0 and len(made) == 2, 'WS 通道自测失败'
        assert fake.handshake_ok, '握手缺少签名头/X-APP-ID'
    finally:
        ssl.SSLContext.wrap_socket = orig_wrap
        fake.srv.close()
    # 签名算法自测：固定输入 → 手工核对量纲（64 位十六进制）
    sig = build_authorization('APPID', 'KEY', 'QG', 'GET', '/aipaas/x', timestamp=1728892448, expiration=43200)
    assert re.match(r'^teleai-cloud-auth-v1/APPID/QG/1728892448/43200/x-app-id/[0-9a-f]{64}$', sig), sig
    print('自测通过 ✓（WS 握手含签名头 / 两段 PCM 拼接与 WAV 封装落盘 / 签名格式 ' + sig.split('/')[-1][:12] + '…）')


# ---------------------------------------------------------------- CLI
def main():
    ap = argparse.ArgumentParser(description='藏文发音批量预生成（TTS → audio/voice/*.wav）')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--probe', action='store_true', help='只握手一次，验证鉴权')
    ap.add_argument('--only', nargs='+', help='只生成指定条目（如 letter_01 icon_01）')
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--self-test', action='store_true')
    args = ap.parse_args()

    if args.self_test:
        self_test()
        return

    texts = read_texts()
    targets = list(texts.keys())
    if args.only:
        unknown = [t for t in args.only if t not in texts]
        if unknown:
            print('✗ 未知条目：%s' % ' '.join(unknown))
            sys.exit(2)
        targets = args.only

    if args.dry_run:
        print('待生成 %d 条（写入 audio/voice/*.wav）：' % len(targets))
        for t in targets:
            print('  %-12s %s' % (t, texts[t]))
        print('\n真实生成前：复制 scripts/tts-config.example.json → scripts/tts-config.json 并填好 AppID/AppKey。')
        return

    cfg = load_config()
    if args.probe:
        sys.exit(probe(cfg))
    print('通道：%s（region=%s，voice=%s，%dHz）' % (cfg['provider'], cfg.get('region'), cfg.get('voice'), cfg.get('sampleRate', 0)))
    sys.exit(1 if run(targets, texts, cfg, args.force) else 0)


if __name__ == '__main__':
    main()
