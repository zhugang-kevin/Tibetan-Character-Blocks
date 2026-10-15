// utils/storage.js — 本地进度存储（L0 设备身份层）
//
// 4.1 方案对应：
// - Gate 1 测试期仅本地存储；云同步（L1）在 Gate 3 合规路线明确后接入
// - stamps（文化护照印记）/ bestCombo / levelStats / certs 等为展示与成就型数据，
//   客户端主导；未来涉及权益/付费的数据一律迁移到服务器权威（见 plan-4.1-review.md）
var KEY = 'progress';
var MAX_LEVEL = 10;

// 连击口径标记（D34）。D34 之前 bestCombo 记的是「本局内连续成功消除的次数」——
// 因为配对判定是「任意两张同 id」（比三消宽两个数量级），链条几乎不会断，
// 一个不错的玩家一局能从 ×2 单调涨到 ×30，这个值其实度量的是「这局你错了几次」。
// D34 起改成「时间窗口内的连击」（utils/praise.js），量纲完全不同。
// 所以：进度里没有口径标记 = 旧数据 → bestCombo 归零（旧值在新口径下是虚假纪录）；
// 下一次 save 会打上标记，之后只按新口径累计。
var COMBO_MODEL = 'window';

// 存储读写的安全包装（生产加固）：
//   wx.getStorageSync 在「存储被清 / 数据损坏 / 极端机型限制」下会抛异常，
//   直接裸调会让 onShow 里的第一个调用点把整页带崩——用户看到的是白屏而不是游戏。
//   读失败 = 当成全新用户（进度丢失但游戏能玩），写失败 = 静默（本局照常进行）。
// D101：当前数据版本。**改结构时必须 +1，并在 MIGRATIONS 里补一条迁移。**
//   为什么需要它：过去没有版本号，一旦结构变更，老用户的数据只能被
//   「当成全新用户」处理 —— 也就是**进度静默归零，用户完全不知道**。
//   有了迁移，老数据能被搬过来，而不是丢掉。
var SCHEMA = 2;

// 逐版迁移：key = 目标版本，函数把「上一版的数据」改成「这一版的数据」。
// 只增不改 —— 已经发布过的迁移函数不要再动，否则老版本升级路径会错。
var MIGRATIONS = {
  // v1 → v2：D101 起浇水有「每日一次」上限，需要 waterDay 字段。
  //   老数据没有这个字段 → 补空串（语义：今天还没浇过，可以浇）。
  2: function (p) {
    if (typeof p.waterDay !== 'string') p.waterDay = '';
    return p;
  }
};

function rawRead() {
  try {
    var v = wx.getStorageSync(KEY);
    // 脏数据（字符串 / 数组 / 别的版本写的东西）一律按「没有进度」处理，
    // 否则后面 p.completedLevels.indexOf 这类调用会直接抛 TypeError。
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    // 版本迁移：老数据（没有 schema 或版本低）先补齐，再交给上层用。
    var ver = typeof v.schema === 'number' ? v.schema : 1;
    if (ver < SCHEMA) {
      for (var n = ver + 1; n <= SCHEMA; n++) {
        if (MIGRATIONS[n]) { try { v = MIGRATIONS[n](v) || v; } catch (e) { /* 单步失败不阻断 */ } }
      }
      v.schema = SCHEMA;
      rawWrite(v);
    }
    return v;
  } catch (e) { return null; }
}

function rawWrite(p) {
  try {
    if (p && typeof p === 'object') p.schema = SCHEMA;   // D101：落盘时打版本号
    wx.setStorageSync(KEY, p);
    return true;
  } catch (e) { return false; }
}

function getProgress() {
  var p = rawRead();
  var comboCurrent = !!p && p.comboModel === COMBO_MODEL;
  return {
    unlockedLevel: (p && p.unlockedLevel) || 1,
    completedLevels: (p && p.completedLevels) || [],
    stamps: (p && p.stamps) || [],
    bestCombo: comboCurrent ? ((p && p.bestCombo) || 0) : 0,
    comboModel: COMBO_MODEL,
    // 即时应激励的文案开关（D34）：只关赞美文案，不关元素发音
    praiseOff: !!(p && p.praiseOff),
    bgmOff: !!(p && p.bgmOff),
    seenCards: (p && p.seenCards) || [],
    onboardDone: !!(p && p.onboardDone),
    // 证书体系（藏文成长阶梯）：最佳正确率 / 证书 / 编号流水 / 持有人
    levelStats: (p && p.levelStats) || {},
    certs: (p && p.certs) || [],
    certSeq: (p && p.certSeq) || 0,
    holderName: (p && p.holderName) || '',
    // D54 性别与藏族名字：**只在用户自己点选后写入**（微信拿不到性别，也不去拿）。
    //   gender 取值 '' | 'male' | 'female' | 'unspecified'（'' = 还没选，会出现首次引导）。
    //   三档之外的值一律不认（见 utils/tibetan-name.js#normalizeGender），避免脏数据。
    //   与 holderName 同一份 progress：纯本机、不上传、不同步、不进埋点。
    gender: (p && p.gender) || '',
    tibetanName: (p && p.tibetanName) || '',
    tibetanNameMean: (p && p.tibetanNameMean) || '',
    // 名字在池里的下标（-1 = 没定位到）。跟着名字一起落库，是「池扩容不换名」的凭据：
    // 日后池 append 变长，取模结果会变，但已存的名字与下标不会被挤走。
    tibetanNameIndex: (p && typeof p.tibetanNameIndex === 'number') ? p.tibetanNameIndex : -1,
    // 权益中心（双轨制）：模式 / 城市 / 已领凭证 / 核销码流水
    userMode: (p && p.userMode) || '',
    city: (p && p.city) || '',
    benefits: (p && p.benefits) || [],
    benefitSeq: (p && p.benefitSeq) || 0,
    // PRD v4 留存系统：每关最佳星数 / 积分 / 长明灯签到 / 唐卡碎片 / 道具 / 菩提树
    stars: (p && p.stars) || {},
    points: (p && p.points) || 0,
    signIn: (p && p.signIn) || { streak: 0, lastDate: '', totalDays: 0, oil: 0 },
    fragments: (p && p.fragments) || [],
    // 唐卡合成标记：集齐 9 片后由玩家主动点「合成」落一次（幂等；只记状态，不承载金额）
    thangkaDone: !!(p && p.thangkaDone),
    inventory: (p && p.inventory) || {},
    pot: (p && p.pot) || 0,
    // D101：浇水「每日一次」的判据字段。**必须在这里列出** ——
    //   getProgress() 是显式清单，漏一处就会读成 undefined，
    //   表现为「上限判断永远通过、漏洞照旧」（本字段第一次就是这么漏的，被测试抓出）。
    waterDay: (p && p.waterDay) || '',
    // 万家灯火祈福跳窗：上次展示的日期（用于「每天首次打开只出现一次」）
    lampDay: (p && p.lampDay) || '',
    // 每日打开记录（本地留存粗指标）：{ days, lastDate, streak, total, first }
    openLog: (p && p.openLog) || { days: [], lastDate: '', streak: 0, total: 0, first: '' },
    // D111 学习线（150 课）进度与成绩。⚠️ **必须列进白名单**：getProgress 是显式挑字段的，
    //   漏列 = save(p) 时被静默丢掉（D101 的 waterDay 就是这么漏的：上限判断永远通过）。
    //   实测事故：renderLearn 里 addPoints 走 getProgress→save，把上一行刚落库的
    //   learnDone 整个写丢 → 本级永远差一课、证书永远不颁。
    learnDone: (p && p.learnDone) || {},
    learnStats: (p && p.learnStats) || {},
    // D113 收礼人匿名 id（打赏链路用）。⚠️ 必须进白名单，否则 save(p) 会把它写丢，
    //   下一次 ensureUid 又生成一个新 uid = 换身份（旧分享卡片全部找不到你）。
    uid: (p && p.uid) || '',
    // D113 已收到的礼物 id（按 id 去重，防止同步/重连时重复入账）
    seenGifts: (p && p.seenGifts) || [],
    // D113 A 端入账：① 别人为你点亮的酥油灯盏数 ② 收到的礼物本体（离线也能看到）。
    //   ⚠️ 两个都必须进白名单 —— getProgress 是显式挑字段的，漏列 = save(p) 静默写丢
    //   （D101 waterDay、D111 learnDone 都是这么漏的，各被测试抓出一次）。
    lamps: (p && p.lamps) || 0,
    receivedGifts: (p && p.receivedGifts) || [],
    // D113b：藏族名字的**藏文写法**（与 tibetanName 一起落库、一起钉死）
    tibetanNameBo: (p && p.tibetanNameBo) || ''
  };
}

function save(p) {
  // 落库时打上连击口径标记：从此这次写入的 bestCombo 就是新口径的值（见 COMBO_MODEL 注释）
  if (p && typeof p === 'object') p.comboModel = COMBO_MODEL;
  return rawWrite(p);
}

// 通关第 n 关：记录完成 + 解锁下一关
function completeLevel(n) {
  var p = getProgress();
  if (p.completedLevels.indexOf(n) === -1) {
    p.completedLevels.push(n);
  }
  p.unlockedLevel = Math.max(p.unlockedLevel, Math.min(n + 1, MAX_LEVEL));
  save(p);
  return p;
}

// 记录最高连击，返回是否刷新纪录。
// ⚠️ n 必须是 utils/praise.js 的「窗口连击」值（不是本局连续成功次数）。
//    口径在 D34 变过一次，见顶部 COMBO_MODEL 注释。
function recordCombo(n) {
  var p = getProgress();
  if (n > p.bestCombo) {
    p.bestCombo = n;
    save(p);
    return true;
  }
  return false;
}

// ---------- 即时应激励的文案开关（D34） ----------
// 只关「赞美文案」。元素发音属学习闭环（每次配对朗读该元素），不在可关范围内。
function getPraiseOff() {
  return !!getProgress().praiseOff;
}

function setPraiseOff(off) {
  var p = getProgress();
  p.praiseOff = !!off;
  save(p);
  return p.praiseOff;
}

// ---------- 背景音乐开关（PRD 3.3） ----------
// 默认**开**（bgmOff=false）：BGM 是氛围的一部分，但用户必须随时能关。
// 与 praiseOff 同一条链路：getProgress 白名单 + 体验版 getProgress + 页面三处同步。
function getBgmOff() {
  return !!getProgress().bgmOff;
}

function setBgmOff(off) {
  var p = getProgress();
  p.bgmOff = !!off;
  save(p);
  return p.bgmOff;
}

// 授予印记（v0：'lhasa' 拉萨印章）。返回是否为新获得。
function grantStamp(id) {
  var p = getProgress();
  if (p.stamps.indexOf(id) > -1) return false;
  p.stamps.push(id);
  save(p);
  return true;
}

// 文化卡是否已展示过完整版（首次消除弹出，之后只出轻提示）
function isCardSeen(id) {
  return getProgress().seenCards.indexOf(id) > -1;
}

function markCardSeen(id) {
  var p = getProgress();
  if (p.seenCards.indexOf(id) === -1) {
    p.seenCards.push(id);
    save(p);
  }
}

function isOnboardDone() {
  return getProgress().onboardDone;
}

function setOnboardDone() {
  var p = getProgress();
  p.onboardDone = true;
  save(p);
}

// ---------- 证书体系：单关最佳正确率（只增不减，鼓励重玩提升） ----------
// r: { matches, attempts, misses }
function recordLevelResult(level, r) {
  var p = getProgress();
  var attempts = r && r.attempts ? r.attempts : 0;
  var matches = r && r.matches ? r.matches : 0;
  var misses = r && r.misses ? r.misses : 0;
  // 一关之内全部一次配对成功 = 100%；没有失败配对 = 无失误通关
  var acc = attempts > 0 ? matches / attempts : 1;
  if (acc > 1) acc = 1;
  if (acc < 0) acc = 0;

  var s = p.levelStats[level] || { bestAcc: 0, clean: false, plays: 0, lastAcc: 0 };
  s.plays = (s.plays || 0) + 1;
  s.lastAcc = acc;
  if (acc > s.bestAcc) s.bestAcc = acc;
  if (misses === 0) s.clean = true;   // 至少达成过一次零失误
  p.levelStats[level] = s;
  save(p);
  return s;
}

function getLevelStats() {
  return getProgress().levelStats;
}

// ---------- 证书体系：颁发 / 查询 ----------
// 写入一张证书（或覆盖升级）。返回落库后的证书对象。
function saveCert(cert) {
  var p = getProgress();
  var found = false;
  for (var i = 0; i < p.certs.length; i++) {
    if (p.certs[i].stage === cert.stage) { p.certs[i] = cert; found = true; break; }
  }
  if (!found) p.certs.push(cert);
  save(p);
  return cert;
}

function getCerts() {
  return getProgress().certs;
}

function findCert(stage) {
  var list = getProgress().certs;
  for (var i = 0; i < list.length; i++) {
    if (list[i].stage === stage) return list[i];
  }
  return null;
}

// 取下一个证书编号流水号（ZWFK-YYYY-0001 的最后一段）
function nextCertSeq() {
  var p = getProgress();
  p.certSeq = (p.certSeq || 0) + 1;
  save(p);
  return p.certSeq;
}

function getCertSeq() {
  return getProgress().certSeq || 0;
}

// 证书持有人（与祝福卡昵称共用，避免让用户填两次）
function setHolderName(name) {
  var p = getProgress();
  p.holderName = (name || '').slice(0, 10);
  save(p);
  return p.holderName;
}

function getHolderName() {
  return getProgress().holderName || '';
}

// ---------- D54 性别 + 藏族名字 ----------
// 性别只能由用户在页面上显式点选（微信不提供性别，头像昵称类接口也在 §6 禁用名单里）。
// seed 用「首次打开日期」→ 同一台机器上的名字稳定，不会每次进页面都变。
//
// ⚠️ **名字一旦定下就钉死**（「池扩容不换名」的核心保证，D55）：
//   重新取名字**只在性别真的变了、或还没有名字的时候**发生。
//   同一个性别重复选择 = 幂等，一个字都不会改。
//   为什么必须这样：`pickFor` 是 seed 对**池长**取模，池以后 append 变长时同一个 seed 会落到
//   别的下标 —— 若每次点选都重算，扩容就会把老用户的名字换掉。钉死之后，扩容影响不到任何人。
var tibetanName = require('./tibetan-name.js');

function getGender() {
  return tibetanName.normalizeGender(getProgress().gender);
}

function setGender(v) {
  var g = tibetanName.normalizeGender(v);
  var p = getProgress();
  var prev = tibetanName.normalizeGender(p.gender);
  if (!g) {
    // 「清除」：性别回到未选择，名字一并撤掉（个人信息可撤回）
    p.gender = '';
    p.tibetanName = '';
    p.tibetanNameBo = '';
    p.tibetanNameMean = '';
    p.tibetanNameIndex = -1;
    save(p);
    return '';
  }
  p.gender = g;
  var needPick = !p.tibetanName || prev !== g;
  if (needPick) {
    var seed = tibetanName.seedFromDate((p.openLog && p.openLog.first) || '');
    var picked = tibetanName.pickFor(g, seed);
    p.tibetanName = picked ? picked.name : '';
    p.tibetanNameBo = picked ? (picked.bo || '') : '';
    p.tibetanNameMean = picked ? picked.mean : '';
    p.tibetanNameIndex = picked ? picked.index : -1;
  } else if (!(p.tibetanNameIndex >= 0)) {
    // 迁移：D54 首版只存了名字没存下标，反查补一个（查不到就留 -1，绝不因此改名）
    p.tibetanNameIndex = tibetanName.indexOfName(g, p.tibetanName);
  }
  save(p);
  return p.gender;
}

// 只读：名字是**存下来的事实**，不是每次算出来的值 —— 池在运行时怎么变都不影响这里。
function getTibetanName() {
  var p = getProgress();
  return {
    name: p.tibetanName || '',
    bo: p.tibetanNameBo || '',
    mean: p.tibetanNameMean || '',
    index: (typeof p.tibetanNameIndex === 'number') ? p.tibetanNameIndex : -1,
    gender: tibetanName.normalizeGender(p.gender)
  };
}

// ---------- 权益中心：模式 / 城市 / 凭证 ----------
// 模式只有 'local' / 'tourist' 两个合法值（见 utils/benefits.js）
function setUserMode(mode) {
  var p = getProgress();
  p.userMode = (mode === 'local' || mode === 'tourist') ? mode : '';
  save(p);
  return p.userMode;
}

function getUserMode() {
  return getProgress().userMode || '';
}

// 城市由用户主动选择（不申请定位权限）
function setCity(id) {
  var p = getProgress();
  p.city = id || '';
  save(p);
  return p.city;
}

function getCity() {
  return getProgress().city || '';
}

// 记录一张已领取的到店权益凭证（同一商家不重复发码）
function addBenefit(record) {
  var p = getProgress();
  var found = false;
  for (var i = 0; i < p.benefits.length; i++) {
    if (p.benefits[i].mid === record.mid) { found = true; break; }
  }
  if (!found) p.benefits.push(record);
  save(p);
  return record;
}

function getBenefits() {
  return getProgress().benefits;
}

function hasBenefit(mid) {
  var list = getProgress().benefits;
  for (var i = 0; i < list.length; i++) {
    if (list[i].mid === mid) return true;
  }
  return false;
}

function nextBenefitSeq() {
  var p = getProgress();
  p.benefitSeq = (p.benefitSeq || 0) + 1;
  save(p);
  return p.benefitSeq;
}

// ---------- PRD v4：积分 / 星级 / 长明灯签到 / 唐卡碎片 / 道具 / 菩提树 ----------
// 成就与进度类字段只增不减（点数只加，星级只取更高）

function addPoints(n) {
  var p = getProgress();
  var add = Math.max(0, Math.floor(n || 0));
  p.points = (p.points || 0) + add;
  save(p);
  return p.points;
}

// 消耗积分（不足则返回 false，不做负数）
function spendPoints(n) {
  var p = getProgress();
  var cost = Math.max(0, Math.floor(n || 0));
  if ((p.points || 0) < cost) return false;
  p.points -= cost;
  save(p);
  return true;
}

function getPoints() { return getProgress().points || 0; }

// 星级只取历史最优（重玩不会降星）
function recordStars(level, stars) {
  var p = getProgress();
  var cur = p.stars[level] || 0;
  if (stars > cur) {
    p.stars[level] = stars;
    save(p);
    return { stars: stars, improved: true };
  }
  return { stars: cur, improved: false };
}

function getStars(level) { return getProgress().stars[level] || 0; }
function getStarsMap() { return getProgress().stars || {}; }

// 签到（祈福长明灯）：跨天判定与 7 天循环由 utils/collect.js 计算，这里只负责持久化
function applySignIn(nextState) {
  var p = getProgress();
  p.signIn = nextState;
  save(p);
  return p.signIn;
}

function getSignIn() { return getProgress().signIn; }

// 灯油（签到与道具铺可增加）
function addOil(n) {
  var p = getProgress();
  var s = p.signIn || { streak: 0, lastDate: '', totalDays: 0, oil: 0 };
  s.oil = (s.oil || 0) + Math.max(0, Math.floor(n || 0));
  p.signIn = s;
  save(p);
  return s.oil;
}

// 唐卡碎片：一片只记一次（集齐 9 片拼成一幅）
function addFragment(index) {
  var p = getProgress();
  if (index === undefined || index === null || index < 0) return { added: false, fragments: p.fragments };
  if (p.fragments.indexOf(index) > -1) return { added: false, fragments: p.fragments };
  p.fragments.push(index);
  save(p);
  return { added: true, fragments: p.fragments };
}

function getFragments() { return getProgress().fragments; }

// 唐卡合成：9 片齐后由玩家主动点「合成」才落标记。
// 此前 index 页承诺「完整图收入文化护照」，但合成动作与护照展示都不存在（空头承诺，2026-10-05 补齐）。
// 片数上限与 collect.FRAGMENT_TOTAL 同为 9（这里用字面量避免与 utils/collect 相互依赖）。
function markThangkaDone() {
  var p = getProgress();
  if ((p.fragments || []).length < 9) return { done: false, thangkaDone: !!p.thangkaDone };
  if (p.thangkaDone) return { done: false, thangkaDone: true };   // 幂等：重复点击不产生第二条记录
  p.thangkaDone = true;
  save(p);
  return { done: true, thangkaDone: true };
}

function getThangkaDone() { return !!getProgress().thangkaDone; }

// 道具（提示 / 洗牌）
function addItem(id, n) {
  var p = getProgress();
  p.inventory[id] = (p.inventory[id] || 0) + Math.max(1, Math.floor(n || 1));
  save(p);
  return p.inventory[id];
}

function getInventory() { return getProgress().inventory || {}; }

function useItem(id) {
  var p = getProgress();
  if (!p.inventory[id] || p.inventory[id] <= 0) return false;
  p.inventory[id] -= 1;
  save(p);
  return true;
}

// 菩提树：浇水计数 + 积分（无广告）
// D101：**加每日上限**。UI 上写的是「每天浇一次水」，但这里过去是**无限次**——
//   连点就能无限刷分（并发审计挖出来的）。现在按自然日记一次，返回是否成功。
//   返回结构保留 pot/points，新增 watered（本次是否真的浇到）与 already（今天已浇过）。
function waterPot(reward, today) {
  var p = getProgress();
  // 日期由调用方传入 —— 与 collect.advanceSignIn(signIn, today) 同一约定，
  // 不在 storage 里再造一个日期格式化函数（避免两处口径漂移）。
  if (today && p.waterDay === String(today)) {
    return { pot: p.pot || 0, points: p.points || 0, watered: false, already: true };
  }
  p.waterDay = String(today || '');
  p.pot = (p.pot || 0) + 1;
  p.points = (p.points || 0) + Math.max(0, Math.floor(reward || 0));
  save(p);
  return { pot: p.pot, points: p.points, watered: true, already: false };
}

function getPot() { return getProgress().pot || 0; }

// 万家灯火：记录「已展示日期」，保证每天只出现一次祈福跳窗
function getLampDay() { return getProgress().lampDay || ''; }

function markLampDay(day) {
  var p = getProgress();
  p.lampDay = String(day || '');
  save(p);
  return p.lampDay;
}

// ---------- 每日打开记录（本地留存粗指标） ----------
// 跨天判定由 utils/collect.js 的纯函数算，这里只做持久化。不上传、不请求网络。
function getOpenLog() { return getProgress().openLog; }

function applyOpenLog(next) {
  var p = getProgress();
  p.openLog = next;
  save(p);
  return p.openLog;
}

// ---------- 收藏与印章计数（结算页的进度锚；此前只在护照页可见） ----------
function getSeenCards() { return getProgress().seenCards; }

function getStampCount() { return getProgress().stamps.length; }

// ---- D113 收礼箱（A 端）----
// 「收到的祝福」以**礼物 id（= out_trade_no）**去重：
//   服务端那边幂等靠主键（同一个单号只可能有一件礼物），
//   客户端这边再按 id 入一次账 —— 于是「重复拉取 / 断线重连 / 回调重推」都不会重复发奖。
//   ⚠️ seenGifts 必须在 getProgress() 白名单里（已在），否则 save(p) 会把它写丢。
function getSeenGifts() {
  var v = getProgress().seenGifts;
  return Array.isArray(v) ? v : [];
}
/**
 * 把一批礼物标记为已入账，返回**这次真的新入账**的那些 id。
 * 调用方据此决定要不要发奖（灯火 +1 / 祝福卡入收藏 …），从而做到「只发一次」。
 */
function markGiftsSeen(ids) {
  var fresh = [];
  if (!ids || !ids.length) return fresh;
  var p = getProgress();
  var seen = Array.isArray(p.seenGifts) ? p.seenGifts : [];
  for (var i = 0; i < ids.length; i++) {
    var id = String(ids[i] || '');
    if (!id || seen.indexOf(id) > -1) continue;
    seen.push(id);
    fresh.push(id);
  }
  if (fresh.length) {
    p.seenGifts = seen;
    save(p);
  }
  return fresh;
}

// ---- D113 A 端入账：把「收到的心意」真正变成自己资产 ----
// 为什么还要本地存一份：服务端只在**拉收礼箱**的那一刻给你列表，
//   而「收到的祝福」是要**常驻**在护照里的（断网、换手机前也要看得到）。
//   所以首次拉到就落本地，之后**离线也能渲染**，服务端那份只用来补新的。
// 灯火：酥油灯礼物的入账口。计数只属于**本人**，既不与人比、也不公示
//   （D6 没有排行榜，D89 红线二 —— 这里是「我有几盏」，不是「谁最多」）。
function getLamps() {
  var n = getProgress().lamps;
  return (typeof n === 'number' && isFinite(n) && n >= 0) ? Math.floor(n) : 0;
}
/** 点亮一盏（+1）。返回点完之后的盏数。 */
function addLamp() {
  var p = getProgress();
  p.lamps = getLamps() + 1;
  save(p);
  return p.lamps;
}
function getReceivedGifts() {
  var v = getProgress().receivedGifts;
  return Array.isArray(v) ? v : [];
}
/**
 * 合并收礼箱到本地（按 id 去重），返回**这次真正新增**的那些。
 * 只返回新增的意义：调用方据此发奖（点灯 / 提示），做到「一份礼物只入一次账」。
 */
function saveReceivedGifts(list) {
  var fresh = [];
  if (!list || !list.length) return fresh;
  var p = getProgress();
  var mine = Array.isArray(p.receivedGifts) ? p.receivedGifts : [];
  var have = {};
  mine.forEach(function (g) { have[String(g && g.id)] = 1; });
  list.forEach(function (g) {
    var id = String((g && g.id) || '');
    if (!id || have[id]) return;
    mine.push(g);
    have[id] = 1;
    fresh.push(g);
  });
  if (fresh.length) {
    p.receivedGifts = mine;
    save(p);
  }
  return fresh;
}


// D96 学习线（150 关）进度。
function getLearnDone() {
  var p = rawRead();
  var v = (p && p.learnDone) || {};
  return (typeof v === 'object' && !Array.isArray(v)) ? v : {};
}
function markLearnStageDone(lv, stage) {
  if (!lv || !stage) return false;
  var p = rawRead() || {};
  var d = (typeof p.learnDone === 'object' && !Array.isArray(p.learnDone)) ? p.learnDone : {};
  d[lv + '-' + stage] = 1;
  p.learnDone = d;
  return rawWrite(p);
}
/** 某级已完成几课（0-10） */
function getLearnLevelDone(lv) {
  var d = getLearnDone();
  var n = 0;
  for (var i = 1; i <= 10; i++) if (d[lv + '-' + i]) n++;
  return n;
}
/** 某级下一课序号（全过返 0） */
function getLearnNextStage(lv) {
  var d = getLearnDone();
  for (var i = 1; i <= 10; i++) if (!d[lv + '-' + i]) return i;
  return 0;
}

// D111 学习线成绩（每级聚合，给「某级 10 课全过 → 颁证书」定档用）。
//   口径与 certificate.aggregate 的「各关最佳正确率平均 / 全程无失误」同义：
//     best[stage] = 该课历史最佳正确率（重练只升不降）；
//     clean      = 该级只要有一课有失误就不是「零失误」（金质门槛）。
//   ⚠️ 与老 10 关线**完全隔离**：学习线的正确率不进 levelStats（那是阶段证书的口径），
//      老线的 completedLevels / stars 也不被学习线写脏（D111 事故：学习线曾把
//      累计序号当 level 传给结算页，把 11..150 写进了 completedLevels）。
function recordLearnResult(lv, stage, acc, clean) {
  if (!lv || !stage) return null;
  var p = rawRead() || {};
  var s = (typeof p.learnStats === 'object' && !Array.isArray(p.learnStats)) ? p.learnStats : {};
  var cur = s[lv];
  if (!cur || typeof cur !== 'object' || Array.isArray(cur)) cur = { best: {}, clean: true };
  var a = Math.max(0, Math.min(1, acc));
  var prev = (typeof cur.best[stage] === 'number') ? cur.best[stage] : 0;
  cur.best[stage] = Math.max(prev, a);
  if (!clean) cur.clean = false;
  s[lv] = cur;
  p.learnStats = s;
  rawWrite(p);
  return getLearnStats(lv);
}
/** 某级聚合成绩：{ acc: 0..1（各课最佳的平均）, clean: 是否零失误, n: 已记录课数 } */
function getLearnStats(lv) {
  var p = rawRead() || {};
  var s = (p && typeof p.learnStats === 'object' && !Array.isArray(p.learnStats)) ? p.learnStats : {};
  var cur = s[lv];
  if (!cur || typeof cur !== 'object' || Array.isArray(cur)) return { acc: 0, clean: true, n: 0 };
  var best = (cur.best && typeof cur.best === 'object') ? cur.best : {};
  var vals = Object.keys(best).map(function (k) { return best[k]; }).filter(function (v) { return typeof v === 'number'; });
  var sum = 0;
  for (var i = 0; i < vals.length; i++) sum += vals[i];
  return { acc: vals.length ? sum / vals.length : 0, clean: !!cur.clean, n: vals.length };
}

// ---------- D113 收礼人匿名 id（uid）----------
// 打赏链路（A 分享 → B 送祝福 → 服务端记账 → A 收礼）里，A 需要一个**能被卡片带着走**
//   的身份。但不能用 openid：openid 只能由服务端用 code 换（官方红线：不进前端），
//   所以分享卡片带的是一个**本地生成的匿名 uid**（zc_ + 12 位随机），服务端只在
//   A 自己同步时把它绑定到 A 的 openid 上。B 送礼物时只写「送给哪个 uid」。
//   uid 一旦生成就**钉死**（与藏族名字同思路）：重生成 = 换身份，旧卡片就找不到你了。
var UID_PREFIX = 'zc_';
function genUid() {
  var abc = 'abcdefghjkmnpqrstuvwxyz23456789';   // 去掉易混淆的 i/l/o/0/1
  var out = '';
  for (var i = 0; i < 12; i++) out += abc[Math.floor(Math.random() * abc.length)];
  return UID_PREFIX + out;
}
/** 取本机 uid（没有就生成并落库；同一个装机用户永远同一个） */
function ensureUid() {
  var p = getProgress();
  if (p.uid && /^zc_[a-z2-9]{12}$/.test(p.uid)) return p.uid;
  var uid = genUid();
  var q = getProgress();
  q.uid = uid;
  save(q);
  return uid;
}
/** 只读（不生成）：供「分享时带上」之外的展示用 */
function getUid() {
  var p = getProgress();
  return (p && p.uid) || '';
}

module.exports = {
  getLearnDone: getLearnDone,
  markLearnStageDone: markLearnStageDone,
  getLearnLevelDone: getLearnLevelDone,
  getLearnNextStage: getLearnNextStage,
  recordLearnResult: recordLearnResult,
  getLearnStats: getLearnStats,
  ensureUid: ensureUid,
  getUid: getUid,
  getSeenGifts: getSeenGifts,
  markGiftsSeen: markGiftsSeen,
  getLamps: getLamps,
  addLamp: addLamp,
  getReceivedGifts: getReceivedGifts,
  saveReceivedGifts: saveReceivedGifts,
  MAX_LEVEL: MAX_LEVEL,
  getProgress: getProgress,
  completeLevel: completeLevel,
  recordCombo: recordCombo,
  getPraiseOff: getPraiseOff,
  setPraiseOff: setPraiseOff,
  grantStamp: grantStamp,
  isCardSeen: isCardSeen,
  markCardSeen: markCardSeen,
  getSeenCards: getSeenCards,
  getStampCount: getStampCount,
  getOpenLog: getOpenLog,
  applyOpenLog: applyOpenLog,
  isOnboardDone: isOnboardDone,
  setOnboardDone: setOnboardDone,
  recordLevelResult: recordLevelResult,
  getLevelStats: getLevelStats,
  saveCert: saveCert,
  getCerts: getCerts,
  findCert: findCert,
  nextCertSeq: nextCertSeq,
  getCertSeq: getCertSeq,
  setHolderName: setHolderName,
  getHolderName: getHolderName,
  setGender: setGender,
  getGender: getGender,
  getTibetanName: getTibetanName,
  setUserMode: setUserMode,
  getUserMode: getUserMode,
  setCity: setCity,
  getCity: getCity,
  addBenefit: addBenefit,
  getBenefits: getBenefits,
  hasBenefit: hasBenefit,
  nextBenefitSeq: nextBenefitSeq,
  // PRD v4 留存系统
  addPoints: addPoints,
  spendPoints: spendPoints,
  getPoints: getPoints,
  recordStars: recordStars,
  getStars: getStars,
  getStarsMap: getStarsMap,
  applySignIn: applySignIn,
  getSignIn: getSignIn,
  addOil: addOil,
  addFragment: addFragment,
  getFragments: getFragments,
  markThangkaDone: markThangkaDone,
  getThangkaDone: getThangkaDone,
  addItem: addItem,
  getInventory: getInventory,
  useItem: useItem,
  waterPot: waterPot,
  getPot: getPot,
  // 万家灯火祈福跳窗（每天首次打开展示一次）
  getLampDay: getLampDay,
  markLampDay: markLampDay
};