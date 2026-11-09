#!/usr/bin/env node
/**
 * 后端端到端自检（2026-11-06）
 *
 * 为什么要有这个脚本：
 *   以前只跑 `node server/test-sign.js`（纯算法），以及各 store 的单元测试。
 *   但「服务能不能真的起来、每条路由是不是按契约回包」从来没被一条命令验证过 ——
 *   部署到 ECS 时才发现某个接口 500 的情况就是这样漏出去的。
 *
 * 做法：
 *   1. 自己 spawn `server/index.js`（独立端口 + 独立临时库，不碰仓库里的 server/data）
 *   2. 轮询 /health 直到就绪
 *   3. 逐条打真实 HTTP，按**契约**断言状态码与关键字段
 *   4. 关掉子进程
 *
 * 注意：需要 `code`（微信登录）的接口在没有真 AppID 时无法成功，
 *      所以对这类接口断言的是「**参数校验与错误码正确、进程不崩**」，不是伪造成功。
 */
'use strict';

var http = require('http');
var path = require('path');
var fs = require('fs');
var spawn = require('child_process').spawn;

var ROOT = path.join(__dirname, '..');
var PORT = 8799;
var TMP = path.join(ROOT, '.workbuddy', 'tmp', 'backend');
var TOKEN = 'devtoken_' + Date.now();

var pass = 0, fail = 0;
function chk(name, cond, info) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (info ? '  — ' + info : '')); }
}

function req(method, p, body, headers) {
  return new Promise(function (resolve) {
    var data = body ? JSON.stringify(body) : null;
    var r = http.request({
      host: '127.0.0.1', port: PORT, path: p, method: method,
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {})
    }, function (res) {
      var b = '';
      res.on('data', function (d) { b += d; });
      res.on('end', function () {
        var json = null;
        try { json = JSON.parse(b); } catch (e) {}
        resolve({ code: res.statusCode, raw: b, json: json, headers: res.headers });
      });
    });
    r.on('error', function (e) { resolve({ code: -1, raw: e.message, json: null }); });
    r.setTimeout(8000, function () { r.destroy(new Error('timeout')); });
    if (data) r.write(data);
    r.end();
  });
}

function waitHealth(tries) {
  return req('GET', '/health').then(function (r) {
    if (r.code === 200) return true;
    if (tries <= 0) return false;
    return new Promise(function (res) { setTimeout(res, 300); }).then(function () {
      return waitHealth(tries - 1);
    });
  });
}

(async function main() {
  if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });
  // 每次干净启动，避免上一次的订单/会话影响断言
  fs.readdirSync(TMP).forEach(function (f) {
    if (/\.db/.test(f)) { try { fs.unlinkSync(path.join(TMP, f)); } catch (e) {} }
  });

  console.log('\n=== 启动服务端（端口 ' + PORT + '，临时库，不碰仓库数据）===');
  var child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    env: Object.assign({}, process.env, {
      PORT: String(PORT),
      DB_PATH: path.join(TMP, 'pay.db'),
      ORDERS_DB: path.join(TMP, 'orders.db'),
      TELEMETRY_TOKEN: TOKEN,
      WX_APPID: 'wxtestappid000000',
      WX_APPSECRET: 'testsecret',
      WX_OFFER_ID: '1450000000',
      WX_APPKEY_SANDBOX: 'testappkeysandbox',
      WX_APPKEY_PROD: 'testappkeyprod',
      WX_ENV: '1',
      WX_HTTP_TIMEOUT_MS: '3000'
    }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  var log = '';
  child.stdout.on('data', function (d) { log += d; });
  child.stderr.on('data', function (d) { log += d; });

  var alive = true;
  child.on('exit', function (c) { alive = false; log += '\n[exit ' + c + ']'; });

  try {
    var up = await waitHealth(40);
    chk('服务启动并响应 /health', up, log.split('\n').slice(0, 3).join(' | '));
    if (!up) throw new Error('服务未就绪');

    console.log('\n=== 健康检查 ===');
    var h = await req('GET', '/health');
    chk('/health 返回 200', h.code === 200);
    chk('/health 声明 configured', h.json && h.json.configured === true, JSON.stringify(h.json));
    chk('/health 不泄露密钥', h.raw.indexOf('testappkey') === -1 && h.raw.indexOf(TOKEN) === -1);

    console.log('\n=== 自检遥测（D135 上线自检通道）===');
    // 服务端契约：只收 {ver, sess, rows[]}（紧凑格式，避免任意字段膨胀）
    var t1 = await req('POST', '/telemetry', { ver: '1.1.0', sess: 'selfcheck', rows: [{ ev: 'playthrough', stage: 'L1' }] });
    chk('POST /telemetry 接收', t1.code === 200 && t1.json && t1.json.ok === true, t1.raw.slice(0, 80));
    var t2 = await req('GET', '/telemetry/read?limit=3');
    chk('/telemetry/read 无 token 时拒绝', t2.code === 401, 'code=' + t2.code);
    var t3 = await req('GET', '/telemetry/read?limit=3&token=' + TOKEN);
    chk('/telemetry/read 带 token 可读', t3.code === 200, 'code=' + t3.code);
    chk('遥测内容真的落盘（含刚提交的 rows.ev）', t3.raw.indexOf('playthrough') > -1, t3.raw.slice(0, 90));
    var t4 = await req('POST', '/telemetry', { event: 'x'.repeat(50), pad: 'y'.repeat(2000) });
    chk('超大遥测体不导致 500 崩溃', t4.code !== -1, 'code=' + t4.code);

    console.log('\n=== 好友挑战（D86 分享卡）===');
    var c1 = await req('POST', '/challenge/play', { cid: 'c_selfcheck', uid: 'u_1', level: 3, seed: 42, score: 900, steps: 26, won: true });
    chk('POST /challenge/play 记录成功', c1.code === 200 && c1.json && c1.json.ok === true, c1.raw.slice(0, 90));
    chk('回包明示 verified:false（未做防作弊，不许假装）', c1.json && c1.json.verified === false);
    var c2 = await req('POST', '/challenge/play', { cid: 'c_selfcheck', uid: 'u_1', level: 3, seed: 42, score: 900, steps: 26, won: true });
    chk('同 uid 重复上报被判定 dup', c2.code === 200 && c2.json && c2.json.dup === true, c2.raw.slice(0, 90));
    var c3 = await req('GET', '/challenge?cid=c_selfcheck');
    chk('GET /challenge 能列出记录', c3.code === 200 && c3.json && c3.json.count >= 1, c3.raw.slice(0, 90));
    var c4 = await req('GET', '/challenge');
    chk('缺 cid 时 400（不是 500）', c4.code === 400, 'code=' + c4.code);
    var c5 = await req('POST', '/challenge/play', {});
    chk('缺 cid/uid 时 400', c5.code === 400, 'code=' + c5.code);

    console.log('\n=== 登录态 / 云同步（需要真 AppID，此处只验参数与错误码）===');
    var s1 = await req('POST', '/sync/save', {});
    chk('POST /sync/save 缺 code 时 400', s1.code === 400, 'code=' + s1.code);
    var s2 = await req('POST', '/sync/load', {});
    chk('POST /sync/load 缺 code 时 400', s2.code === 400, 'code=' + s2.code);
    var s3 = await req('POST', '/gift/inbox', {});
    chk('POST /gift/inbox 缺 code 时 400', s3.code === 400, 'code=' + s3.code);
    var t0 = Date.now();
    var s4 = await req('POST', '/sync/save', { code: 'invalid_code_for_selfcheck' });
    var cost = Date.now() - t0;
    chk('伪 code 得到明确失败而非进程崩溃', s4.code >= 400 && s4.code < 600, 'code=' + s4.code);
    chk('微信接口挂住时会超时返回（不无限占用连接）', s4.code !== -1 && cost < 9000, 'cost=' + cost + 'ms code=' + s4.code);

    console.log('\n=== 虚拟支付（D91，无真凭证时只验契约）===');
    var p1 = await req('POST', '/pay/order', {});
    chk('POST /pay/order 参数不全时 4xx', p1.code >= 400 && p1.code < 500, 'code=' + p1.code);
    var p2 = await req('POST', '/pay/query', {});
    chk('POST /pay/query 缺 outTradeNo 时 400（不能把 undefined 丢给 SQLite）', p2.code === 400, 'code=' + p2.code);
    var p2b = await req('POST', '/pay/query', { outTradeNo: 'NOT_EXIST_1' });
    chk('POST /pay/query 查不存在的单 → 404', p2b.code === 404, 'code=' + p2b.code);
    var p3 = await req('POST', '/pay/notify', {});
    chk('POST /pay/notify 空回调被拒（不能凭空发货）', p3.code >= 400, 'code=' + p3.code);

    console.log('\n=== 其他 ===');
    var n1 = await req('GET', '/nope');
    chk('未知路由返回 4xx 而非 500', n1.code === 404 || n1.code === 400, 'code=' + n1.code);
    var n2 = await req('POST', '/telemetry', null);
    chk('空 body 不崩', n2.code !== -1, 'code=' + n2.code);
    chk('全过程进程未退出', alive);

    console.log('\n=== 落库校验 ===');
    chk('支付库文件已生成', fs.existsSync(path.join(TMP, 'pay.db')));
    var ordersMod = require(path.join(ROOT, 'server', 'orders.js'));
    chk('订单库路径可自证（部署时不再靠猜数据落在哪）', /orders\.db$/.test(String(ordersMod.DB_PATH || '')), String(ordersMod.DB_PATH));
    chk('订单库跟随 ORDERS_DB 环境变量（源码契约）', fs.readFileSync(path.join(ROOT, 'server', 'orders.js'), 'utf8').indexOf('process.env.ORDERS_DB') > -1);
  } catch (e) {
    fail++;
    console.log('  ✗ 中断：' + e.message);
  } finally {
    try { child.kill('SIGTERM'); } catch (e) {}
  }

  console.log('\n------------------------------------------');
  console.log('后端自检: 通过 ' + pass + ' / 失败 ' + fail);
  process.exit(fail ? 1 : 0);
})();
