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

// 道具表：productId 与价格来自 ../data/goods.js **唯一事实源**（前后端同一份）。
//   ⚠️ 不要在服务端另抄一份价格 —— 与前端漂移会直接 -15013；
//   ⚠️ 与 mp 后台「虚拟支付 → 道具配置」也必须逐字一致（申报表见
//      docs/virtual-payment-go-live.md）。
const GIFTS = {};
require('../data/goods.js').list.forEach(function (g) {
  GIFTS[g.productId] = { price: g.price, give: g.give };
});

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

  // ---- D113 防御：限额（docs/gifting-product-design.md 第五节）----
  // 为什么放在**下单前**而不是发货前：让用户在付钱之前就知道被拦，而不是付完才被告知。
  // 为什么必须在服务端算：客户端的限额用户改一个字段就能绕过，等于没有。
  let attachObj = {};
  try { attachObj = JSON.parse(attach || '{}'); } catch (e) { attachObj = {}; }
  const toUid = String(attachObj.toUid || '');
  const price = GIFTS[productId].price;
  if (toUid) {
    if (store.pairCountToday(sess.openid, toUid) >= 3)
      return fail(res, 429, '今天给这位朋友送的够多了，明天再来');
    if (store.toCountToday(toUid) >= 50)
      return fail(res, 429, '这位朋友今天收到的祝福已经很多了');
  }
  // 单账号单日 ¥50（5000 分）——未成年人保护的兜底口径
  if (store.spentToday(sess.openid) + price > 5000)
    return fail(res, 429, '今天送出的祝福已达上限，明天再来');

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

// 发货动作（D113：**真的入收礼箱**，不再只是打日志）
//
// 「送到」这件事由三件事共同保证，缺一不可：
//   ① 幂等 —— 主键 out_trade_no（INSERT OR IGNORE），微信回调重推不会重复入账；
//      调用方（handleNotify）也已经用 claimDelivery 在数据库层拦过一次。
//   ② 收礼人靠 **attach 里的匿名 uid**，不靠 openid —— 小程序没有关系链，
//      B 拿不到 A 的 openid，只能拿到分享卡片上那个 uid。
//   ③ A 什么时候看到：A 端主动拉 /gift/inbox（不做推送，省掉订阅消息这条合规重路）。
function deliver(order) {
  const give = (GIFTS[order.product_id] || {}).give || 'unknown';
  let attach = {};
  try { attach = JSON.parse(order.attach || '{}'); } catch (e) { attach = {}; }
  const toUid = String(attach.toUid || '');
  // 没有收礼人（比如自己给自己买）：不进收礼箱，但订单仍算已发货，绝不重试补发。
  if (!toUid) {
    console.log('[发货] 无收礼人 uid（不进收礼箱）', order.out_trade_no, '礼物', give);
    return;
  }
  const put = store.putGift({
    outTradeNo: order.out_trade_no,
    fromOpenid: order.openid,
    toUid: toUid,
    productId: order.product_id,
    amount: order.amount,
    payload: JSON.stringify(attach.extra || {})
  });
  console.log('[发货]', order.out_trade_no, '→ 收礼箱', toUid, '礼物', give,
    put ? '' : '（已入过，本次为重推）');
}

// ---------- ④b 收礼箱（D113）----------
// A 端用它取「别人送我的」。身份只认 code→openid→progress.uid ——
//   uid 是匿名收礼地址，客户端拿它来问，服务端绝不反向暴露是谁。
async function handleGiftInbox(req, res, body) {
  if (!body.code) return fail(res, 400, '缺少 code');
  const sess = await code2Session(body.code);
  if (!sess.openid) return fail(res, 500, '登录态获取失败');
  const p = store.getProgress(sess.openid);
  const uid = (p && p.uid) || '';
  if (!uid) return ok(res, { uid: '', gifts: [] });
  const rows = store.inboxOf(uid, 50);
  const gifts = rows.map(function (r) {
    let extra = {};
    try { extra = JSON.parse(r.payload || '{}'); } catch (e) { extra = {}; }
    // id 用 out_trade_no：前端按它去重，同一个单号永远只入账一次
    return {
      id: r.out_trade_no, productId: r.product_id, amount: r.amount,
      extra: extra, createdAt: r.created_at
    };
  });
  return ok(res, { uid: uid, gifts: gifts });
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

// ---------- ④ 进度同步（D94）----------
// 隔离要点：**openid 一律由 code2Session 从微信换取，绝不接受客户端传入** ——
// 这样客户端无法伪造别人的身份；所有读写也只按这个 openid 走。
async function handleSyncSave(req, res, body) {
  if (!body.code) return fail(res, 400, '缺少 code');
  const sess = await code2Session(body.code);
  if (!sess.openid) return fail(res, 500, '登录态获取失败');
  store.saveSession(sess.openid, sess.session_key);   // 顺带刷新（支付要用）
  // D113：uid 是**客户端生成的匿名收礼地址**，由客户端带来、服务端绑定到 openid 上。
  //   它不含任何身份信息（不是 openid、不是手机号），所以可以直接存。
  const row = store.saveProgress(sess.openid, {
    doneStages: body.doneStages, lamps: body.lamps,
    cards: body.cards, ownerName: body.ownerName,
    uid: String(body.uid || '')
  });
  return ok(res, { saved: true, updatedAt: row && row.updated_at });
}

async function handleSyncLoad(req, res, body) {
  if (!body.code) return fail(res, 400, '缺少 code');
  const sess = await code2Session(body.code);
  if (!sess.openid) return fail(res, 500, '登录态获取失败');
  return ok(res, { progress: store.getProgress(sess.openid) });
}

// ---------- HTTP 骨架（零依赖）----------
function ok(res, data) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(Object.assign({ ok: true }, data))); }
function fail(res, code, msg) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, msg })); }

const ROUTES = {
  '/pay/order': handleOrder, '/pay/notify': handleNotify, '/pay/query': handleQuery,
  '/sync/save': handleSyncSave, '/sync/load': handleSyncLoad,
  '/gift/inbox': handleGiftInbox     // D113：A 端拉「别人送我的」
};

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
