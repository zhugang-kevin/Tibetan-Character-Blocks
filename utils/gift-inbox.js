// utils/gift-inbox.js — 收礼箱「入账」的唯一实现（D113e）
//
// ## 为什么要单独抽这一个文件
//   「收到一份心意」要做三件事，缺一件就是事故：
//     ① 按礼物 id（= out_trade_no）去重 —— 重复拉 / 断线重连 / 回调重推都不许重复入账；
//     ② 酥油灯真的点亮一盏、哈达真的献上一条（不是只记个数）；
//     ③ 落本地 —— 断网、云端没开通时「收到的祝福」照样看得到。
//   D113d 之前这套逻辑在**文化护照里独一份**。现在首页也要提示「有新心意」，
//   若首页再抄一遍，将来改发奖规则就会只改一处、另一处静默漂移（同类事故：D101 waterDay）。
//   所以：入账只有这一个实现，首页与护照都调它。
//
// ## 不做什么（D89 三条红线）
//   · 不产生任何「钱」的语义 —— 入账的是灯火 / 哈达 / 祝福卡 / 名字卡；
//   · 不做排行榜 —— 计数只属于本人，本文件里没有任何「比 / 排名 / 最多」；
//   · 不做二次分发 —— 一份礼物只入一次账，用完即弃。
var storage = require('./storage');

/**
 * 把服务端给的礼物列表入账。
 * @param {Array} list 服务端 /gift/inbox 返回的礼物
 * @returns {{fresh:Array, lamps:number, khatas:number, total:number, unread:number}}
 *   fresh —— 这次**真正新增**的（用来决定要不要提示用户）；
 *   lamps / khatas —— 这次点亮 / 献上的数量（已写盘）；
 *   total / unread —— 入账之后的累计数与未读数（首页据此显示角标）。
 */
function absorb(list) {
  var fresh = storage.saveReceivedGifts(list);
  var lamps = 0;
  var khatas = 0;
  fresh.forEach(function (g) {
    if (g.productId === 'tib_lamp_1') lamps++;
    if (g.productId === 'tib_khata_6') khatas++;
  });
  // 一份酥油灯 = 一盏灯火，一条哈达 = 一条哈达。循环而不是乘：addLamp/addKhata
  // 每次都读-改-写，保证并发（两个页面同时入账）也不会互相覆盖。
  for (var i = 0; i < lamps; i++) storage.addLamp();
  for (var k = 0; k < khatas; k++) storage.addKhata();
  return {
    fresh: fresh,
    lamps: lamps,
    khatas: khatas,
    total: storage.getReceivedGifts().length,
    unread: storage.unreadGiftCount()
  };
}

/** 只看本地（离线口径）：首页/护照首屏先用它渲染，再拿服务端补新的。 */
function localState() {
  return {
    total: storage.getReceivedGifts().length,
    unread: storage.unreadGiftCount(),
    lamps: storage.getLamps(),
    khatas: storage.getKhatas()
  };
}

module.exports = { absorb: absorb, localState: localState };
