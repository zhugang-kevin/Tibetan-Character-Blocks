// utils/telemetry.js — 自检（客户端采集）
//
// 存在理由（用户原话）：
//   「上线没有办法检测问题就是一个大问题，我们就算是有了用户也拿不到数据，
//     我们也不知道问题在哪里」
//
// 设计原则：
//   1. **绝不影响游戏**：上报失败静默，任何异常都吞掉，最多丢一条记录。
//   2. **先落本地再上报**：网络失败时留在缓冲区（环形，最多 50 条），下次启动补发。
//   3. **带会话与版本**：没有 sessionId / version，数据无法归因到"哪一版哪一局"。
//   4. **只收匿名数据**：sessionId 随机生成、不落盘用户身份；payload 里禁止放藏文名/uid。

'use strict';

var platform = require('./platform');

var BUF_KEY = 'tel_buf_v1';
var MAX_BUF = 50;
var VERSION = '2026.10.21';       // 构建版本：报问题时必须能说清是哪一版

var _session = null;
var _seq = 0;

function nowIso() { return new Date().toISOString(); }

function sessionId() {
  if (_session) return _session;
  _session = 's' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  return _session;
}

function readBuf() {
  try {
    var v = platform.storage.get(BUF_KEY);
    return Array.isArray(v) ? v : [];
  } catch (e) { return []; }
}
function writeBuf(arr) {
  try {
    platform.storage.set(BUF_KEY, arr.slice(-MAX_BUF));
  } catch (e) { /* 存储满：放弃缓存，不影响游戏 */ }
}

/** 追加一条记录（本地）。type: error | event | state */
function push(type, payload) {
  try {
    var buf = readBuf();
    buf.push({
      t: nowIso(),
      ts: Date.now(),
      sess: sessionId(),
      ver: VERSION,
      seq: ++_seq,
      type: type,
      data: payload || {}
    });
    writeBuf(buf);
  } catch (e) { /* 采集失败绝不影响游戏 */ }
}

/** 错误：必须带"在哪里"（页面/动作），否则只知道崩了、不知道崩在哪 */
function error(err, where) {
  var msg = err && err.message ? err.message : String(err);
  var stack = err && err.stack ? String(err.stack).slice(0, 800) : '';
  push('error', { where: where || 'unknown', msg: msg, stack: stack });
  flush();
}

/** 关键事件（比如：开局/结算/胜负/洗牌/上报失败），用于还原一局发生了什么 */
function event(name, data) {
  push('event', { name: name, d: data || {} });
}

function flush() {
  try {
    var buf = readBuf();
    if (!buf.length) return;
    var sync = require('./sync');
    // 服务端地址来自 sync 的 CONFIG.api（已注入才有），没准备好就只留在本地
    if (!sync.isReady || !sync.isReady()) return;
    var base = (sync.CONFIG && sync.CONFIG.api) ? String(sync.CONFIG.api).replace(/\/$/, '') : '';
    if (!base) return;
    var rows = buf.slice(-30);
    platform.network.request({
      url: base + '/telemetry',
      method: 'POST',
      data: { ver: VERSION, sess: sessionId(), rows: rows },
      success: function (res) {
        if (res && res.statusCode >= 200 && res.statusCode < 300) {
          // R08：只删「本次真正发出去的那几条」，**不能清空整个缓冲** ——
          //   缓冲超过 30 条时，其余未发送的记录会被一起抹掉（实测 41 条 → 0，11 条凭空消失）。
          //   用 sess|seq 作复合键：seq 每启动重置，单用 seq 会跨会话撞号。
          var sent = {};
          rows.forEach(function (r) { if (r) sent[String(r.sess) + '|' + String(r.seq)] = 1; });
          var cur = readBuf();
          writeBuf(cur.filter(function (r) {
            return !(r && sent[String(r.sess) + '|' + String(r.seq)]);
          }));
        }
      },
      fail: function () { /* 静默：留在本地 */ }
    });
  } catch (e) { /* 静默 */ }
}

/** 本地查看（调试/设置页用），不上报 */
function dump() { return readBuf(); }
function clear() { writeBuf([]); }

module.exports = {
  VERSION: VERSION,
  sessionId: sessionId,
  error: error,
  event: event,
  flush: flush,
  dump: dump,
  clear: clear
};
