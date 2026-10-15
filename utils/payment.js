// utils/payment.js — 官方虚拟支付（米大师）封装（D90）
//
// ## 为什么只用这一条路
//   ① 官方要求：**2026-04-01 起**，小程序内销售虚拟商品**必须全终端接入官方虚拟支付**
//      （`wx.requestVirtualPayment`，底层是腾讯**米大师**），不得用普通微信支付
//      （`wx.requestPayment`）卖虚拟商品，也不得引导跳转到 App/公众号/H5 支付。
//      违规：风险提示 → 限制功能 → 终止服务。
//   ② 所以本项目**不存在第二种支付方式**：虚拟商品一律走这里，实物才可能走普通支付。
//      （打赏/礼物 = 虚拟商品 → 只能走本模块。）
//
// ## 三条不可越的红线（违反其一即不可上线）
//   R1. **AppKey / session_key 绝不出现在前端**。官方原话：
//       「签名只能在服务端计算（AppKey 和 session_key 绝不能出现在小程序前端代码里）」
//       → 本模块**只接收服务端算好的 paySig/signature**，自己不做任何签名。
//   R2. **凭证不进代码库**。offerId 走配置注入，不进 git。
//   R3. **不在前端判定支付成功**。官方：「不要把前端 success 当最终成功，必须以后端状态为准」
//       → 本模块把 success 只当作**弱确认**，真正的发货以后端回调 + 查单为准。
//
// ## 未配置时的行为
//   未注入 offerId 时，`isReady()` 返回 false，`pay()` 直接返回 `{ ok:false, reason:'unconfigured' }`。
//   **不会崩、不会发请求、不会误导用户**。UI 侧应据此隐藏或禁用打赏入口。
//   （与 app.js 里字体占位地址的处理同源：没配就显式跳过，而不是发无效请求。）
var CONFIG = {
  // 支付应用 ID（mp 后台「虚拟支付 → 基本配置」）。**不要写死在代码里**，
  // 由 app.js 启动时注入（app.injectPaymentConfig）。
  offerId: '',
  // 0 = 正式环境，1 = 沙箱环境。官方：现网版本 env 只能是 0（错误码 -15011）
  env: 0,
  // 服务端下单接口地址（**必须 HTTPS**）。签名在哪算，这里就指向哪。
  orderApi: '',
  // 是否已在 mp 后台发布道具（未发布时下单会报 -15010 / -15014）
  goodsPublished: false
};
// 礼物道具表：productId 与价格来自 data/goods.js **唯一事实源**。
// ⚠️ 不要在前端另抄一份价格 —— 前端价与服务端价一旦不一致，
//   要么是官方 -15013 直接失败，要么是「页面显示价 ≠ 实付价」的投诉。
//   （展示用的名称 / 图标 / 说明在 utils/gift-view.js，与本表靠 productId 对应）
var GIFTS = require('../data/goods.js').list;
// 官方错误码 → 人话。**照官方文档逐条抄**，不自行发挥。
// 覆盖这些码的价值：出问题时能立刻定位，而不是只见「支付失败」四个字。
var ERR = {
  '-1':     '支付失败',
  '-2':     '支付取消',
  '-4':     '风控拦截（账号或环境异常）',
  '-5':     '开通签约结果未知',
  '1001':   '参数错误',
  '-15001': '参数错误（详见 errMsg）',
  '-15002': '订单号重复使用，请重试',
  '-15003': '系统错误',
  '-15004': '币种错误（只能是 CNY）',
  '-15005': '用户态签名错误（服务端 signature 算错）',
  '-15006': '支付签名错误（服务端 paySig 算错）',
  '-15007': 'session_key 过期（需重新 wx.login）',
  '-15008': '二级商户进件未完成',
  '-15009': '代币未发布',
  '-15010': '道具 productId 未发布',
  '-15011': '现网版本 env 只能是 0',
  '-15012': '调用米大师失败导致关单，请换新单号重试',
  '-15013': '道具价格错误（goodsPrice 与后台不一致）',
  '-15014': '道具发布未生效（约 10 分钟后生效）',
  '-15016': 'signData 格式有问题',
  '-15017': '商家涉嫌违规，收款功能受限',
  '-15018': '代币/道具 productId 审核不通过',
  '-15019': '商户受限',
  '-15020': '操作过快，请稍候再试',
  '-15021': '小程序被限频交易'
};
// 这些错误重试有意义（换新单号即可）
var RETRYABLE = { '-15002': 1, '-15012': 1, '-15020': 1 };
function injectConfig(cfg) {
  cfg = cfg || {};
  Object.keys(CONFIG).forEach(function (k) {
    if (cfg[k] !== undefined && cfg[k] !== '') CONFIG[k] = cfg[k];
  });
}
function isReady() {
  return !!(CONFIG.offerId && CONFIG.orderApi && CONFIG.goodsPublished);
}
function configState() {
  var miss = [];
  if (!CONFIG.offerId) miss.push('offerId');
  if (!CONFIG.orderApi) miss.push('orderApi');
  if (!CONFIG.goodsPublished) miss.push('goodsPublished');
  return { ready: miss.length === 0, missing: miss };
}
// 官方兼容判断：>= 2.19.2 直接用；否则用 wx.canIUse 兜底
function apiAvailable() {
  if (typeof wx === 'undefined' || !wx.requestVirtualPayment) return false;
  if (wx.canIUse && wx.canIUse('requestVirtualPayment')) return true;
  // 优先 getWindowInfo（getSystemInfoSync 已弃用）；拿不到再退回
  var v = '0.0.0';
  if (wx.getAppBaseInfo && wx.getAppBaseInfo().SDKVersion) v = wx.getAppBaseInfo().SDKVersion;
  else if (wx.getWindowInfo && wx.getWindowInfo().SDKVersion) v = wx.getWindowInfo().SDKVersion;
  else if (wx.getSystemInfoSync) v = wx.getSystemInfoSync().SDKVersion || '0.0.0';
  var cmp = function (a, b) {
    var A = String(a).split('.'), B = String(b).split('.'), n = Math.max(A.length, B.length);
    while (A.length < n) A.push('0');
    while (B.length < n) B.push('0');
    for (var i = 0; i < n; i++) {
      var x = parseInt(A[i], 10) || 0, y = parseInt(B[i], 10) || 0;
      if (x !== y) return x > y ? 1 : -1;
    }
    return 0;
  };
  return cmp(v, '2.19.2') >= 0;
}
function giftById(productId) {
  for (var i = 0; i < GIFTS.length; i++) if (GIFTS[i].productId === productId) return GIFTS[i];
  return null;
}
// 订单号：8-32 字符，数字/大小写字母/_-|*@，**不能以下划线开头**
function makeOutTradeNo(productId) {
  var ts = Date.now().toString(36).toUpperCase();
  var rnd = Math.floor(Math.random() * 0x1000000).toString(36).toUpperCase();
  var pid = String(productId).replace(/[^0-9A-Za-z]/g, '').slice(0, 8);
  return (pid || 'O') + ts + rnd;   // 以字母开头，规避「不能以下划线开头」
}
function request(options) {
  var url = CONFIG.orderApi;
  if (!wx.request) return Promise.reject(new Error('no wx.request'));
  return new Promise(function (resolve, reject) {
    wx.request({
      url: url,
      method: 'POST',
      data: options,
      header: { 'content-type': 'application/json' },
      success: function (res) { resolve(res.data); },
      fail: function (err) { reject(err); }
    });
  });
}
// 取一次性 code（服务端用它换 openid + session_key；**openid 不出现在前端**）。
// ⚠️ 这是本项目 wx.login 的两处具名例外之一（另一处是 utils/sync.js）：
//   虚拟支付的服务端必须拿到 session_key 才能算用户态签名（官方：签名只能在服务端算）。
function getCode() {
  return new Promise(function (resolve) {
    wx.login({
      success: function (r) { resolve(r && r.code ? r.code : ''); },
      fail: function () { resolve(''); }
    });
  });
}
// 发起一次打赏（道具直购）
//   toUid：收礼人匿名 id。没有关系链，A 的身份只能由**分享卡片参数**带过来。
//   extra：随礼物一起送出去的内容（选的哪句祝福 / 给 TA 取的名字 / 署名），
//          原样进 attach，由服务端发货时写进收礼箱。
function pay(productId, opts) {
  opts = opts || {};
  var gift = giftById(productId);
  if (!gift) return Promise.resolve({ ok: false, reason: 'unknown_product' });
  if (!isReady()) return Promise.resolve({ ok: false, reason: 'unconfigured', missing: configState().missing });
  if (!apiAvailable()) return Promise.resolve({ ok: false, reason: 'api_unavailable' });
  var outTradeNo = makeOutTradeNo(productId);
  // attach：透传给服务端发货用（官方：发货通知时会透传给开发者）
  var attach = JSON.stringify({
    productId: productId,
    toUid: String(opts.toUid || ''),  // 收礼的人（来自分享卡片参数，匿名 uid，不是 openid）
    fromScene: opts.scene || 'share', // 从哪个入口来的
    extra: opts.extra || {}           // 祝福语 / 名字 / 署名（纯展示内容，不含任何身份标识）
  });
  // ① 让**服务端**组装 signData 并算两个签名（R1：前端绝不算签名）
  //    code 是服务端换 openid + session_key 的凭据 —— 缺了它服务端算不出用户态签名（会 -15007）。
  return getCode().then(function (code) {
    if (!code) return { ok: false, reason: 'login_failed' };
    return request({
      action: 'createOrder',
      code: code,
      productId: productId,
      outTradeNo: outTradeNo,
      attach: attach
    });
  }).then(function (r) {
    // 登录失败（拿不到 code）原样透出去：这是「没下单」而不是「下单失败」，
    //   两者给用户的提示不同，混成一句话会让人反复重试却卡在同一个地方。
    if (r && r.ok === false && r.reason === 'login_failed') return r;
    if (!r || !r.signData || !r.paySig || !r.signature) {
      return { ok: false, reason: 'order_failed', detail: r && r.msg };
    }
    // ② 调官方接口
    return new Promise(function (resolve) {
      wx.requestVirtualPayment({
        signData: r.signData,
        paySig: r.paySig,
        signature: r.signature,
        mode: 'short_series_goods',
        success: function () {
          // R3：success 只是**弱确认**，以后端状态为准。这里回一个「确认中」。
          resolve({ ok: true, pending: true, outTradeNo: outTradeNo });
        },
        fail: function (e) {
          var code = String(e.errCode);
          resolve({
            ok: false,
            reason: 'pay_failed',
            code: code,
            message: ERR[code] || e.errMsg || '支付失败',
            retryable: !!RETRYABLE[code]
          });
        }
      });
    });
  }).catch(function (e) {
    return { ok: false, reason: 'network', detail: String(e && e.message || e) };
  });
}
// 查单：官方建议「回调 + 查单」双通道兜底，不能只依赖前端 success
function queryOrder(outTradeNo) {
  if (!CONFIG.orderApi) return Promise.resolve({ ok: false, reason: 'unconfigured' });
  return request({ action: 'queryOrder', outTradeNo: outTradeNo }).then(function (r) {
    return r || { ok: false, reason: 'empty' };
  }).catch(function (e) {
    return { ok: false, reason: 'network', detail: String(e && e.message || e) };
  });
}
module.exports = {
  CONFIG: CONFIG,
  GIFTS: GIFTS,
  ERR: ERR,
  injectConfig: injectConfig,
  isReady: isReady,
  configState: configState,
  apiAvailable: apiAvailable,
  giftById: giftById,
  makeOutTradeNo: makeOutTradeNo,
  pay: pay,
  queryOrder: queryOrder
};