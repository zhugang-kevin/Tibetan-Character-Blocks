// server/index.js — 虚拟支付服务端（D91）
//
// ## 它为什么存在
//   官方红线：「**签名只能在服务端计算**（AppKey 和 session_key 绝不能出现在小程序前端代码里）」
//   加之外发回调需要一个 HTTPS 公网地址 —— 所以虚拟支付**必须有服务端**。
//   这是本项目（原约定 D3「纯本地」）唯一必须联网的部分，已在 D90 记录为具名例外。
//
// ## 三个接口（对应 utils/payment.js 的调用）
//   POST /pay/order   前端下单 → 返回 { signData, paySig, signature }
//   POST /pay/notify  微信发货回调 → 验签 → 发货（幂等）
//   POST /pay/query   主动查单（回调丢了时的兜底，官方建议每 5 分钟一次）
//
// ## 只用 Node 内置模块，零依赖 —— 便于部署到任意环境（含云函数）
//
// ## ⚠️ 上线前必须做的三件事
//   1. 用官方示例值跑通 sign.js，确认输出与官方一致
//   2. 把 ORDERS/发奖 换成**持久化存储**（本文件的 Map 只是参考实现，重启即丢）
//   3. 打开 HTTPS（虚拟支付回调必须是 HTTPS）

'use strict';
const http = require('http');
const https = require('https');
const url = require('url');
const crypto = require('crypto');
const sign = require('./sign');
const store = require('./store');   // D92：订单落 SQLite（旧版是内存 Map → 重启即丢）

// ---------- 配置（全部走环境变量，**绝不进代码库**）----------
const CFG = {
  appId: process.env.WX_APPID || '',
  appSecret: process.env.WX_APPSECRET || '',
  offerId: process.env.WX_OFFER_ID || '',
  appKeyProd: process.env.WX_APPKEY_PROD || '',   // env=0 用
  appKeySandbox: process.env.WX_APPKEY_SANDBOX || '', // env=1 用
  env: Number(process.env.WX_ENV || 0),           // 0 正式 / 1 沙箱
  port: Number(process.env.PORT || 8787)
};

// 道具表：**必须与 mp 后台道具配置逐字一致**（productId 与价格）
const GIFTS = {
  tib_lamp_1:     { price: 100, give: 'lamp' },
  tib_blessing_3: { price: 300, give: 'blessing' },
  tib_khata_6:    { price: 600, give: 'khata' },
  tib_name_99:    { price: 990, give: 'name' }
};

// D92：订单与会话已落 SQLite（server/store.js）——
//   旧版用内存 Map，**重启即丢**：回调重放时找不到订单，或无从判断是否已发货。
//   现在幂等由**数据库约束**保证（out_trade_no 主键 + delivered 条件更新），不靠代码自觉。

function appKey() { return CFG.env === 1 ? CFG.appKeySandbox : CFG.appKeyProd; }

// ---------- 微信服务端 API（用内置 https，避免装 axios）----------
function wxGet(pathname, query) {
  return new Promise((resolve, reject) => {
    const qs = Object.keys(query).map(k => k + '=' + encodeURIComponent(query[k])).join('&');
    https.get('https://api.weixin.qq.com' + pathname + '?' + qs, res => {
      let buf = '';
      res.on('data', d => (buf += d));
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}
function wxPost(pathname, body) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(body, 'utf8');
    const req = https.request({
      hostname: 'api.weixin.qq.com', path: pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    }, res => {
      let buf = '';
      res.on('data', d => (buf += d));
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch (e) { reject(e); } });
    });
    req.on('error', reject); req.write(data); req.end();
  });
}

// code → openid + session_key（**sessionKey 只留在服务端**）
async function code2Session(code) {
  return wxGet('/sns/jscode2session', {
    appid: CFG.appId, secret: CFG.appSecret, js_code: code, grant_type: 'authorization_code'
  });
}

function makeOutTradeNo(productId) {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = crypto.randomBytes(4).toString('hex').toUpperCase();
  const pid = String(productId).replace(/[^0-9A-Za-z]/g, '').slice(0, 8) || 'O';
  return pid + ts + rnd;
}

// ---------- ① 下单 ----------
async function handleOrder(req, res, body) {
  const { code, productId, attach } = body;
  if (!code || !GIFTS[productId]) return fail(res, 400, '参数错误');

  const sess = await code2Session(code);
  if (!sess.openid || !sess.session_key) {
    return fail(res, 500, '登录态获取失败: ' + (sess.errmsg || ''));
  }
  store.saveSession(sess.openid, sess.session_key);   // 必须存最新那份（旧的算 signature 会 -15007）

  const outTradeNo = makeOutTradeNo(productId);
  const signData = sign.buildSignData({
    offerId: CFG.offerId,
    buyQuantity: 1,
    env: CFG.env,
    productId,
    goodsPrice: GIFTS[productId].price,     // 单位=分，与后台一致（否则 -15013）
    outTradeNo,
    attach: attach || ''
  });

  // 订单先落**数据库**，状态 = 待支付（发货与否以后端状态为准，不看前端 success）
  store.createOrder({
    outTradeNo, openid: sess.openid, productId,
    amount: GIFTS[productId].price, attach: attach || ''
  });

  return ok(res, {
    outTradeNo,
    signData,                                              // ← 前端原样透传（坑 P2）
    paySig: sign.calcPaySig(signData, appKey()),
    signature: sign.calcSignature(signData, sess.session_key),
    mode: 'short_series_goods'
  });
}

// ---------- ② 发货回调（幂等！重复推送不能重复发货）----------
function handleNotify(req, res, body, raw) {
  // 回调字段以官方推送为准：event / payload / pay_event_sig
  const evtName = body.event || req.headers['x-event'] || '';
  const payload = raw.payload !== undefined ? raw.payload : (body.payload || '');
  const gotSig = body.pay_event_sig || body.payEventSig || '';

  if (!sign.verifyPayEventSig(evtName, payload, CFG.appKeyProd, gotSig)) {
    return fail(res, 401, '验签失败');
  }

  let data = {};
  try { data = typeof payload === 'string' ? JSON.parse(payload) : payload; } catch (e) { data = {}; }
  const outTradeNo = data.OutTradeNo || data.outTradeNo || '';
  const order = store.getOrder(outTradeNo);
  if (!order) return fail(res, 404, '订单不存在');

  store.markPaid(outTradeNo);

  // **幂等靠数据库**：只有 delivered=0 才会被本次更新到（受影响行数=1）。
  // 微信会重推，若这里返回 false 说明之前已发过 —— 直接回成功，**绝不能再发一次**。
  if (!store.claimDelivery(outTradeNo)) {
    return ok(res, { errcode: 0, errmsg: 'ok', duplicated: true });
  }
  deliver(order);                       // 发奖：灯火 +1 / 祝福卡 +1 …
  return ok(res, { errcode: 0, errmsg: 'ok' });
}

// 发货动作（参考实现：只打日志。生产要写进你的用户资产库）
function deliver(order) {
  const give = (GIFTS[order.productId] || {}).give || 'unknown';
  console.log('[发货]', order.outTradeNo, '→ 收礼人', order.openid, '礼物', give, 'attach=', order.attach);
}

// ---------- ③ 主动查单（回调丢失时的兜底）----------
async function handleQuery(req, res, body) {
  const outTradeNo = body.outTradeNo;
  const order = store.getOrder(outTradeNo);
  if (!order) return fail(res, 404, '订单不存在');

  // 官方服务端 API 需要签名：uri 不带参数（坑 P1），postBody 与真正发出的一致
  const uri = '/xpay/query_order';
  const postBody = JSON.stringify({ outTradeNo, openid: order.openid });
  const paySig = sign.calcApiPaySig(uri, postBody, appKey());

  try {
    const r = await wxPost(uri, JSON.stringify({
      openid: order.openid, out_trade_no: outTradeNo,
      pay_sig: paySig, signature: sign.calcApiSignature(postBody, store.getSession(order.openid))
    }));
    // 查到「已支付但未发货」→ 补发（这正是兜底的意义）
    if (r && (r.errcode === 0) && r.order && r.order.status === 'PAID') {
      store.markPaid(outTradeNo);
      if (store.claimDelivery(outTradeNo)) {   // 同样靠 DB 保证只发一次
        deliver(order);
        return ok(res, { outTradeNo, status: 'PAID', delivered: true, repaired: true });
      }
    }
    return ok(res, { outTradeNo, status: order.status, upstream: r });
  } catch (e) {
    return fail(res, 502, '查单失败: ' + e.message);
  }
}

// ---------- HTTP 骨架（零依赖）----------
function ok(res, data) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(Object.assign({ ok: true }, data))); }
function fail(res, code, msg) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, msg })); }

const ROUTES = { '/pay/order': handleOrder, '/pay/notify': handleNotify, '/pay/query': handleQuery };

const server = http.createServer((req, res) => {
  const p = url.parse(req.url).pathname;
  if (req.method === 'GET' && p === '/health') {
    return ok(res, { status: 'up', configured: !!(CFG.offerId && appKey()) });
  }
  const handler = ROUTES[p];
  if (!handler) return fail(res, 404, 'not found');
  let raw = '';
  req.on('data', d => (raw += d));
  req.on('end', () => {
    let body = {};
    try { body = JSON.parse(raw || '{}'); } catch (e) { body = {}; }
    Promise.resolve(handler(req, res, body, raw, JSON.parse(raw || '{}')))
      .catch(e => fail(res, 500, String(e && e.message || e)));
  });
});

// 被 require 时不当服务启动（便于测试）
if (require.main === module) {
  server.listen(CFG.port, () => {
    console.log('[虚拟支付服务端] 监听 :' + CFG.port + '  env=' + CFG.env +
      (appKey() ? '' : '  ⚠️ 未配置 AppKey，下单会失败'));
  });
}

module.exports = { GIFTS, store, makeOutTradeNo, deliver, server };
