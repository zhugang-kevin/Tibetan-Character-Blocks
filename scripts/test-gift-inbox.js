// 行为验证：给 utils/gift-inbox.js 与 storage.unreadGiftCount 装上 wx 桩，真跑一遍入账。
// 门禁是静态的（看代码里有没有那行字）；这个脚本看的是**跑出来对不对**。
var mem = {};
global.wx = {
  getStorageSync: function (k) { return mem[k]; },
  setStorageSync: function (k, v) { mem[k] = v; },
  removeStorageSync: function (k) { delete mem[k]; }
};

var ROOT = require('path').join(__dirname, '..');
var storage = require(ROOT + '/utils/storage.js');
var inbox = require(ROOT + '/utils/gift-inbox.js');

var fail = 0;
function ck(name, cond, got) {
  if (cond) console.log('  ✓ ' + name);
  else { fail++; console.log('  ✗ ' + name + '（实际：' + got + '）'); }
}

console.log('[1. 首次入账：三件礼物（1 灯 + 1 哈达 + 1 祝福）]');
var r1 = inbox.absorb([
  { id: 'o1', productId: 'tib_lamp_1', createdAt: 1000, extra: { fromName: '卓玛' } },
  { id: 'o2', productId: 'tib_khata_6', createdAt: 1001, extra: {} },
  { id: 'o3', productId: 'tib_blessing_3', createdAt: 1002, extra: { blessingId: 'b1' } }
]);
ck('新增 3 件', r1.fresh.length === 3, r1.fresh.length);
ck('点亮 1 盏', r1.lamps === 1 && storage.getLamps() === 1, storage.getLamps());
ck('献上 1 条哈达', r1.khatas === 1 && storage.getKhatas() === 1, storage.getKhatas());
ck('累计 3 份', r1.total === 3, r1.total);
ck('未读 3 份', r1.unread === 3, r1.unread);

console.log('[2. 重复拉取同一批（回调重推 / 断线重连）：不许重复发奖]');
var r2 = inbox.absorb([
  { id: 'o1', productId: 'tib_lamp_1', createdAt: 1000, extra: {} },
  { id: 'o2', productId: 'tib_khata_6', createdAt: 1001, extra: {} }
]);
ck('新增 0 件', r2.fresh.length === 0, r2.fresh.length);
ck('灯数仍是 1（没被点第二次）', storage.getLamps() === 1, storage.getLamps());
ck('哈达仍是 1 条', storage.getKhatas() === 1, storage.getKhatas());

console.log('[3. 已读之后：未读归零，累计数不动]');
storage.markGiftsSeen(['o1', 'o2', 'o3']);
ck('未读 0', storage.unreadGiftCount() === 0, storage.unreadGiftCount());
ck('累计仍 3', storage.getReceivedGifts().length === 3, storage.getReceivedGifts().length);

console.log('[4. 又来一盏新灯：只点这一盏，已读的两条不再提示]');
var r3 = inbox.absorb([
  { id: 'o1', productId: 'tib_lamp_1', createdAt: 1000, extra: {} },
  { id: 'o2', productId: 'tib_khata_6', createdAt: 1001, extra: {} },
  { id: 'o4', productId: 'tib_lamp_1', createdAt: 1003, extra: {} }
]);
ck('新增 1 件（只有 o4）', r3.fresh.length === 1 && r3.fresh[0].id === 'o4', r3.fresh.map(function (g) { return g.id; }).join(','));
ck('灯数 2', storage.getLamps() === 2, storage.getLamps());
ck('哈达仍 1', storage.getKhatas() === 1, storage.getKhatas());
ck('未读 1', r3.unread === 1, r3.unread);

console.log('[5. 离线口径：localState 不联网也算得出来]');
var ls = inbox.localState();
ck('total 4', ls.total === 4, ls.total);
ck('unread 1', ls.unread === 1, ls.unread);
ck('lamps 2', ls.lamps === 2, ls.lamps);
ck('khatas 1', ls.khatas === 1, ls.khatas);

console.log('[6. 空列表 / 脏数据不许崩、不许乱加分]');
var r4 = inbox.absorb(null);
ck('null 入账：新增 0', r4.fresh.length === 0, r4.fresh.length);
ck('null 入账后灯数不变', storage.getLamps() === 2, storage.getLamps());
var r5 = inbox.absorb([{ id: '', productId: 'tib_lamp_1' }, { productId: 'tib_lamp_1' }]);
ck('无 id 的脏数据被丢弃（不会因空 id 重复入账）', r5.fresh.length === 0, r5.fresh.length);

console.log('');
console.log(fail === 0 ? '全部通过 ✓' : ('失败 ' + fail + ' 项'));
process.exit(fail === 0 ? 0 : 1);
