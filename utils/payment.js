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

// 礼物道具表：productId 必须与 mp 后台「道具配置」**逐字一致**，价格单位是**分**。
// （官方 -15013：goodsPrice 与后台不一致会直接失败 —— 这是防止"页面显示价 ≠ 实付价"的投诉）
var GIFTS = [
  { productId: 'tib_lamp_1',    price: 100,  name: '点一盏酥油灯',   give: 'lamp' },
  { productId: 'tib_blessing_3', price: 300,  name: '送一句藏文祝福', give: 'blessing' },
  { productId: 'tib_khata_6',   price: 600,  name: '献一条哈达',     give: 'khata' },
  { productId: 'tib_name_99',   price: 990,  name: '藏文名字定制',   give: 'name' }
];

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

// 发起一次打赏（道具直购）
//   toOpenid 可以不传：服务端从 attach 里取；没有关系链时，A 的身份由**分享卡片参数**带过来
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
    toUid: opts.toUid || '',          // 收礼的人（来自分享卡片参数）
    fromScene: opts.scene || 'share'  // 从哪个入口来的
  });

  // ① 让**服务端**组装 signData 并算两个签名（R1：前端绝不算签名）
  return request({
    action: 'createOrder',
    productId: productId,
    outTradeNo: outTradeNo,
    attach: attach
  }).then(function (r) {
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
