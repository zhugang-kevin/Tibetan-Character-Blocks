// pages/game/game.js — 游戏页：配对消除 + 下落式补充（D33）
// P0 冲刺：连击系统 / 金色特殊方块 / 藏文发音 / 新手引导 / 15分钟埋点
// 体验优化：文化卡仅首次发现弹出（非阻塞、自动收起），重复匹配只出轻提示；
//           牌面尺寸全关卡统一（以 8 列为基准），盘面居中。
// PRD v4 视觉重构：四层物理层次（夜色背景 → 青金石底盘 → 凹陷槽位 → 3D 凸起方块）、
//           冰霜/木箱障碍物、消除破碎成金粉与风马旗碎片。
// D33 下落式补充：盘面由 utils/board.js 管理（初始铺满 + 补充池）；
//           消除后上方方块下落、顶部从池中补一对同元素的牌；池空后盘面收缩到空 → 通关揭图。
//           渲染模型从「CSS grid 自动流 + 扁平数组」改为「绝对定位 + 按牌 uid 稳定 key」——
//           这是**必须**的：grid 自动流下重排数组只会让牌瞬间跳位，落不下动画。
// D34 即时应激励：每次消除给一句中藏双语赞美，档位由「时间窗口连击」判定（utils/praise.js）。
//           为什么不用裸连击数：配对判定是「任意两张同 id」（比三消宽两个数量级），
//           连击极易不断链（实测 90% 正确率下最高档占 56%）→ 裸连击分级会退化。详见 utils/praise.js 头注。
var levelsData = require('../../data/levels');
var elements = require('../../data/elements');
var tibText = require('../../utils/tibetan-text');
var cardsData = require('../../data/cards');
var revealsData = require('../../data/reveals');
var revealTemples = require('../../data/reveal-temples');
var audio = require('../../utils/audio');
var icons = require('../../utils/icons');
var praise = require('../../utils/praise');
// D115 场景祝福语音：连续消除 / 完成挑战 / 稀有奖励 / 目标达成 / 温柔鼓励
var sceneVoice = require('../../utils/scene-voice');
var storage = require('../../utils/storage');
var photoAssets = require('../../data/photo-assets');   // D47 场景照片层（空 = 不渲染）
var tracker = require('../../utils/tracker');
var obstacles = require('../../utils/obstacles');
var board = require('../../utils/board');
var match3 = require('../../utils/match3.js');
var resume = require('../../utils/resume');   // Q5：中途存档的编解码/校验（与 H5 共用）
var telemetry = require('../../utils/telemetry');   // 自检：只记匿名事件   // 三消引擎（老线专用，2026-10-20）
var ads = require('../../utils/ads');   // D156 激励视频（无广告位 ID 时全链路静默）
// D51 学习体系（15 级 × 150 关）：生成器 + 动态格子尺寸 + 藏文字形量算
var learning = require('../../utils/learning');
var grid = require('../../utils/grid');
var GUIDE = [
  { title: '如何使用', text: '点击两张相同的藏文字母或文化图标，它们就会一起消失。' },
  { title: '听发音', text: '每配对成功一次，都会读出这个字的藏文发音——边学边听，记得更牢。连续正确不断，声音还会越清亮。' },
  { title: '方块会下落', text: '配对之后，上方的方块会落下来补位，顶上还会掉下新的方块。把这一课的方块全部消完，棋盘下面的秘境图就整幅揭晓了。带 ❄ 的牌先碰不得，配对它旁边的牌即可解冻；木箱上的金色数字是剩余耐久。金色 ✦ 是特殊方块，双倍练习。' }
];
// 统一牌面尺寸：以 8 列为基准（所有关卡牌一样大，只变数量）
var PAGE_PAD = 20;     // 页面左右留白（rpx）
var PANEL_PAD = 18;    // 底盘内边距（rpx）
var OUTLINE_PAD = 12;  // 凹槽内边距（rpx）
var AVAIL_W = 750 - PAGE_PAD * 2 - PANEL_PAD * 2 - OUTLINE_PAD * 2 - 6;
// ---------------------------------------------------------------- 触觉反馈（D60）
// 为什么补这一层（2026-10-09 用户「需要真实的投入感」）：盘点了所有交互点的反馈，
// 发现**频率最高的那几个交互完全没有触觉**——
//   选中一张牌（每关 12~24 次，只有声音）· 错配（只有声音）· 撞障碍（只有 toast + 抖动）
// 而消除、通关、点灯是有震动的。结果是「操作有回音但手上没感觉」，
// 手机外放又会把声音吃掉一部分（尤其 D59 之前的藏文发音轻 12~15dB），
// 触觉于是成了唯一不会被环境噪声吃掉的通道 —— 它是「投入感」的兜底通道。
// 分档：light = 选中 / 障碍（高频、轻）；medium = 错配（要能分辨）；heavy = 通关。
function haptic(type) {
  try {
    if (wx.vibrateShort) wx.vibrateShort({ type: type || 'light' });
  } catch (e) { /* 部分机型不支持震动，静默降级 */ }
}
var CARD_AUTO_MS = 5200;
var TOAST_MS = 1700;
// ---------- 游戏中的「打扰预算」（D57，2026-10-09 用户反馈「跳窗实在太多了」）----------
// 实测：打完第 1 关（12 对）一共被打断 **14 次** —— 文化卡 2 次（每次 5.2s）
// + 重复匹配「已收藏」轻提示 **12 次**（每次 1.7s），平均**每一对消掉都要弹一次**。
// 根因：第 1 关只有 2 种元素，而 D33 的下落补充会让同一元素反复出现，
// 于是「重复匹配 → 弹提示」这条规则在单局里被触发了十几次。
// 预算三原则：**① 每次配对最多打扰一次；② 能不给的不给；③ 该给的留在视觉边缘，不遮挡盘面。**
//   · REPEAT_TOAST  重复匹配不再弹任何东西（配对消失本身就是反馈，多余的一律删）
//   · BLOCK_COOLDOWN 障碍提示（冰霜/绳结/木箱）给 3 秒冷却：连点同一个障碍只提示一次
//   · 文化卡保留（首次发现一次），它是学习内容本身，且非阻塞
var REPEAT_TOAST = false;
var BLOCK_COOLDOWN_MS = 3000;
var SHATTER_MS = 340;  // 消除碎裂动画时长（与 game.wxss 的 shatterUp 0.34s 对齐），落定后再结算下落
// 赞美的展示时长（与 game.wxss 的 praisePopA/B 1.2s 对齐）；一次只显示一条，新的替换旧的
var PRAISE_SHOW_MS = 1200;
// 下落/补充动画时长 = game.wxss 里 .tile 的 transition 300ms（同一个节点换 translate 坐标）
// 破碎粒子的六个方向 × 颜色（金粉 + 五色风马旗）
var BIT_SLOTS = ['d0 gold', 'd1 r', 'd2 g', 'd3 b', 'd4 y', 'd5 w'];
// 精灵表字母（试点：ཀ）：全部 ཀ 方块共用 images/sprite_ka.png 一张图（1 次图片请求），
// 四色帧（红/蓝/绿/黄）由帧位移切换；质感（左上光源/软糖材质/底部暗色）已烘在帧里，不再叠加 CSS 渐变。
var SPRITE_LETTERS = { letter_01: 'ka' };
function findCard(id) {
  for (var k = 0; k < cardsData.length; k++) {
    if (cardsData[k].id === id) return cardsData[k];
  }
  return null;
}
// 颜色加深/提亮（用于卡片头图渐变与 3D 方块的高光/投影）
function shade(hex, f) {
  var n = parseInt(hex.slice(1), 16);
  var r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  var g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  var b = Math.min(255, Math.round((n & 255) * f));
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}
// 3D 方块内联样式：顶部窄倒角高光 → 本色平段 → 底部加深，配 0 偏移投影与顶部内高光
// D32 对比度：高光带必须收进字形占位区（y10%~90%）之外，否则白字被冲掉。
//   旧 stops: shade(c,1.42) 0% → c 58% → shade(c,0.68) 100%，最亮段正压在字形上，四色牌面 1.48~3.26
//   新 stops: 0% 1.39 → 8% 1.02 → 14% 起为平色 c，四色牌面 4.61~5.99（金/绿两色另见 data/elements.js）
function pieceStyle(color) {
  return 'background-image: linear-gradient(180deg, ' + shade(color, 1.39) + ' 0%, ' + shade(color, 1.02) + ' 8%, ' + color + ' 14%, ' + color + ' 58%, ' + shade(color, 0.68) + ' 100%);' +
    ' box-shadow: 0 6rpx 0 ' + shade(color, 0.46) + ', 0 10rpx 18rpx rgba(0, 0, 0, 0.46), inset 0 3rpx 8rpx rgba(255, 255, 255, 0.42);';
}
function nextFrame(fn) {
  if (typeof wx !== 'undefined' && wx.nextTick) wx.nextTick(fn);
  else setTimeout(fn, 20);
}
Page({
  data: {
    scenePhoto: photoAssets.game || '',
    level: 1,
    // 结算等待中（最后一对后要等语音念完才跳页；给玩家一个「跳过」出口）
    resultPending: false,
    cols: 6,
    rows: 4,
    // 渲染列表：绝对定位的方块（按 uid 稳定 key）。坐标用**百分比**表达 ——
    // translate 的百分比相对元素自身尺寸，所以不需要在 transform 里写 rpx 单位。
    pieces: [],
    // D51 学习体系
    zoomable: false,
    zoom: { show: false, tibetan: '', color: '' },
    learnName: '',
    learnLv: 0,
    learnStage: 0,
    stepsBudget: 0,
    stepsLeft: 0,
    tileW: 73,           // 统一牌宽（rpx）—— 仅默认值，实际由下方按屏宽/列数重算
    tileH: 88,           // 统一牌高（rpx）
    glyphSize: 45,       // 藏文字号（rpx）
    boardW: 498,         // 盘面宽（rpx，随列数变化，居中）
    boardH: 400,         // 盘面高（rpx，随行数变化，揭图层与牌区精确对齐）
    gap: 8,
    iconPaths: {},
    matchedPairs: 0,
    progressPct: 0,      // 2026-10-24：进度条百分比（WXML 不支持算术，由 JS 算）
    comboLevel: 0,       // 2026-10-24：底部信息条的连击档位（由 praise.onMatch 回填）
    totalPairs: 0,
    // 秘境揭图（D31）：reveal.img 为空表示本关无揭图；名字在通关前不出现（不剧透）
    reveal: { img: '', name: '', tibetan: '', roman: '', desc: '' },
    revealPct: 0,
    revealOpacity: 0,   // 2026-11-05：揭图透明度 = 进度，避免 0% 就透出整幅图
    showCard: false,
    comboAura: 0,        // D62：连击光晕档位 0~4
    comboAuraOn: false,  // D62：光晕一闪即收，不遮挡盘面
    card: null,
    cardColor: '#C0392B',
    cardColorDark: '#8F2B20',
    cardBarRun: false,   // 进度条动画开关（每次弹出重新触发）
    toastShow: false,
    toastIsIcon: false,
    toastGlyph: '',
    toastIcon: '',
    toastText: '',
    toastColor: '#C0392B',
    locked: false,       // 仅失配抖动期间锁定
    // 通关情绪反馈：粒子参数数组 + 层开关
    fxOn: false,
    fx: [],
    score: 0,
    // 即时应激励浮字（D34）：一次只显示一条，新的一条替换旧的（不排队、不叠加）
    praiseOn: false,
    praiseCombo: 0,
    praiseLevel: 1,
    praiseZh: '',
    praiseBo: '',
    praiseTibetan: false,
    praiseBurst: false,
    praiseAnt: false,   // A/B 翻转用：同一个 animation-name 不会重播，替换时必须换名
    // 文案开关（HUD 内小开关）：只关「赞美文案」，不关元素发音——
    // 元素发音属学习闭环（每次配对朗读该元素），不在可关范围内。
    praiseOff: false,
    // 背景音乐开关（HUD 内小开关，PRD 3.3）：默认开，偏好落 progress.bgmOff
    bgmOff: false,
    // D156 激励视频：只有广告位配好且广告拉取成功才出现入口。
    // 全空时整块不渲染 —— 未开通流量主时页面与 D155 验收态完全一致。
    adHintOn: false,
    adHintBusy: false,
    // 每次**进入**这一课最多 1 次（重进会重置，这是刻意的人性化而不是漏洞：
    // 提示只高亮一手、不换任何进度，多给一次玩家不吃亏，多看一次广告对我们也不亏。
    // 官方「每人每日观看次数有限」由平台侧兜底；我们不把核心进度绑在广告上。）
    adHintLeft: 0,
    guideStep: 0,
    guide: GUIDE[0],
    bitSlots: BIT_SLOTS,   // 破碎粒子方向/颜色类名
    brokenFx: ''           // 破冰/破箱浮出文字
  },
  board: null,          // utils/board.js 的盘面状态（唯一真相源）
  firstIndex: -1,
  matchedCount: 0,
  // 即时应激励状态（D34）：combo/档位/抽取/频率控制全在 utils/praise.js 里判定，
  // 页面只持有状态并按结果渲染。maxCombo 是本关窗口连击的峰值（传给结算页做星级判定）。
  comboState: null,
  praiseTimer: null,
  goldenId: '',
  goldenSeen: false,
  occCount: {},         // 精灵表帧计数（同字母第 n 次出现 → 帧 floor(n/2)%4）
  freed: [],            // 曾清空过的格（揭图透出 = 该格 freed，透出后不再被遮回）
  collected: {},        // 本课收集到的元素 id（结算页文化卡用）
  // ⚠️ removeQueue 里存的是**牌的 uid**，不是格号 —— 排队期间盘面会因前面的下落而变化，
  //    格号到结算时就过期了（会消错牌、破坏守恒）。uid 不变，结算时再解析成格号。
  removeQueue: [],      // 待结算的消除对（连点不阻塞，逐对结算）
  draining: false,
  // ⚠️ 选中态也按 uid 记：牌会在下落中换格，按格号记会把「选中」留在换下来的另一张牌上
  firstUid: null,
  finished: false,      // 通关只结算一次（连点时最后一对可能先于队列排空完成任务，必须去重）
  pendingFresh: {},     // uid → 从盘面上方几格落下（补充牌的首帧偏移）
  stepX: 100,           // 列步进（% of tileW）
  stepY: 100,           // 行步进（% of tileH）
  comboTimer: null,
  cardTimer: null,
  toastTimer: null,
  barTimer: null,
  voiceTimer: null,
  // D115：场景语音频次闸门状态（各场景上次播的时刻 / 连击峰值 / 目标是否已达成）
  sceneVoiceState: null,
  // 正确率统计（证书质量门槛用）：attempts = 配对尝试次数，misses = 失败次数
  attempts: 0,
  matches: 0,
  misses: 0,
  onLoad: function (query) {
    // D51：支持两种入口
    //   ① 老 10 关线：?level=N         → data/levels.js 的盘面配置（行为完全不变）
    //   ② 学习体系线：?lv=N&stage=M     → utils/learning.js 生成的关卡（15 级 × 150 关）
    //   未带 lv/stage 时走老线，零回归；学习线入口见首页「学习体系 · 十五级」面板（D96/D111）。
    // D86：解析挑战参数（来自好友分享的卡片）。ch = 挑战者用了几步
    this.challenge = null;
    var chSteps = parseInt(query.ch, 10);
    if (chSteps > 0) {
      this.challenge = { steps: chSteps };
    }
    // D113：这张卡是谁分享出来的（匿名 uid）。只有从好友分享卡进来才非空 ——
    //   非空意味着「打完这一课可以去给 TA 送一份祝福」，所以要一路带到结算页。
    this.toUid = String(query.to || '');
    var queryLearn = { lv: parseInt(query.lv, 10) || 0, stage: parseInt(query.stage, 10) || 1 };
    var stageCfg = queryLearn.lv ? learning.buildStage(queryLearn.lv, queryLearn.stage) : null;
    this.learnCfg = stageCfg;                 // 非空 = 学习模式
    this.runtimeTiles = stageCfg ? stageCfg.tiles : {};
    this.stepsBudget = stageCfg ? stageCfg.steps : 0;
    var level = stageCfg ? stageCfg.index : (parseInt(query.level, 10) || 1);
    var cfg = stageCfg ? stageCfg : levelsData[level - 1];
    if (!cfg) {
      wx.redirectTo({ url: '/pages/index/index' });
      return;
    }
    var that = this;
    // 页面存活守卫：unload 之后到期的定时器不再回调，避免在已销毁的页面上 setData
    this._alive = true;
    // 预热分包：藏文赞美音频在分包，进游戏页即下载避免首播静默
    // 预热分包（藏文赞美音频在分包，进游戏页即下载避免首播静默）
    try { wx.loadSubpackage && wx.loadSubpackage({ name: 'praiseVoice' }); } catch (e) {}
    // 2026-11-05：寺庙揭图放在 package-temples-1/2，进游戏页就后台下载。
    // 分包没就绪时 <image> 会是一块空图；下载完成后把当前 img 重设一次，
    // 让 <image> 重新发起加载（否则那一关会一直空白到下次进关）。
    var refreshReveal = function () {
      if (!that._alive) return;
      var cur = that.data && that.data.reveal && that.data.reveal.img;
      if (!cur) return;
      that.setData({ 'reveal.img': '' }, function () {
        if (that._alive) that.setData({ 'reveal.img': cur });
      });
    };
    try {
      if (wx.loadSubpackage) {
        wx.loadSubpackage({ name: 'temples1', success: refreshReveal, fail: function () {} });
        wx.loadSubpackage({ name: 'temples2', success: refreshReveal, fail: function () {} });
      }
    } catch (e) {}
    this.goldenId = cfg.elements[Math.floor(Math.random() * cfg.elements.length)][0];
    this.occCount = {};
    this.collected = {};
    this.removeQueue = [];
    this.draining = false;
    this.finished = false;
    this.pendingFresh = {};
    this._hintUids = {};       // D156：提示高亮的牌 uid（只做视觉，不进存档、不改盘面）
    this._adBusy = false;      // D156：激励重入锁（实例级，不依赖 setData 时序）
    // D156 激励视频：没配广告位 ID 时 createRewarded 返回 null，下面整块不执行。
    // 只有真正拉取成功才把入口显示出来（官方建议：先判断广告是否拉取成功再展示按钮）。
    this._rewarded = ads.createRewarded(function (ready) {
      if (that._alive) that.setData({ adHintOn: !!ready });
    }, function () {
      // 迟到回调：播放看门狗已按 timeout 收口（按钮放开了），但玩家其实看完了。
      // 奖励补发一次 —— 组件丢回调是平台的事，不能让玩家白看。
      that.grantAdHint(true);
    });
    this.setData({ adHintLeft: 1 });
    // 盘面：初始铺满 cols×rows（无开局空洞，揭图从 0% 起步），其余牌进补充池
    // === 模式分流（2026-10-20）===
    // 老线 10 关（learnCfg 为空）→ 三消（交换相邻、成线消除、连锁、特效）
    // 学习线 150 课（learnCfg 非空）→ 保持配对消，**一行不动**
    //   为什么这么分：实测 150 课里 100 关是 3×3/4×4，9~16 格撑不起三消（仿真 117/150，卡死 33）；
    //   而老线棋盘 6×4~6×8，三消仿真 **10/10 全部达标、零卡死**。练习要快、游戏要爽，两者诉求不同。
    this.match3 = !this.learnCfg;
    // === S01：可复现盘面 ===
    // 同盘挑战要求两个人拿到完全相同的盘面。seed 从 URL 传入（挑战卡带过来），
    // 没有就用当前时间生成一个并存进 URL —— 分享出去的那一局才可复现。
    this.m3seed = (parseInt(query.seed, 10) >>> 0) || ((Date.now() % 2147483647) >>> 0);
    this.m3rng = match3.seededRng(this.m3seed);
    this.m3challengeId = match3.challengeIdFor(parseInt(query.level, 10) || 1, this.m3seed, 1);
    // === S02 ③：落地来源 ===
    //   cid = 挑战 ID（同盘），to = 发卡人匿名 uid。
    //   只有从挑战卡进来这两个才非空 —— 自然进入的访问不能算传播。
    this.chFrom = String(query.to || '');
    this.chCid = String(query.cid || '');
    var _make = function (id, uid) { return that.makeTile(id, uid); };
    if (this.match3) {
      this.board = board.createLevelMatch3(cfg, _make, this.m3rng);
      // Q5：优先恢复**真实存档**。只有「同关 + 同随机源（或本次没指定 seed）+ 形状/目标/步数/牌全部合法」
      //   才恢复；任何一项不合法 → 丢弃存档开新局，绝不「尽量恢复」出一个坏局。
      var _rs = storage.loadResume();
      var _lvNow = parseInt(query.level, 10) || 1;
      var _canResume = false;
      if (_rs) {
        var _seedOK = !query.seed || ((parseInt(query.seed, 10) >>> 0) === _rs.seed);
        _canResume = _seedOK && resume.valid(_rs, _lvNow, this.board.slots);
      }
      this.m3resumed = false;
      if (_canResume) {
        this.m3seed = _rs.seed;
        this.m3rng = match3.seededRng(this.m3seed);
        if (_rs.rngState && this.m3rng.setState) this.m3rng.setState(_rs.rngState);
        this.board.cells = _rs.cells;
        this.board.pool = _rs.pool || {};
        this.board.nextUid = _rs.nextUid || this.board.nextUid;
        this.board.spent = _rs.spent || 0;
        this.m3obj = { target: _rs.obj.target, moves: _rs.obj.moves };
        this.m3left = _rs.left;
        this.m3cleared = _rs.cleared;
        this.m3resumed = true;
      } else {
        // 开局保证：无现成三连 + 有合法交换（不满足就重洗）
        var _ep = match3.ensurePlayable(this.board.cells, this.board.cols, this.board.rows, this.m3rng,
          null, this.board.pool, _make);
        this.board.cells = _ep.cells;
        if (_ep.pool) this.board.pool = _ep.pool;
        if (_ep.nextUid && _ep.nextUid > this.board.nextUid) this.board.nextUid = _ep.nextUid;
        this.m3obj = match3.objectiveFor(this.board.total);
        this.m3left = this.m3obj.moves;
        this.m3cleared = 0;
        storage.clearResume();          // 新局：旧档作废
      }
      // 中止标志必须在**建关时**复位：它原来只在「发生一次交换」时才置 false，
      // 于是 onUnload 之后再次进同一实例会永远处于「已中止」，回调一律不执行。
      this.m3aborted = false;
      // G03：HUD 初值必须在建关时就写进 data（续玩时要显示**真实**进度，不是 0）
      this.setData({
        m3target: this.m3obj.target,
        m3cleared: this.m3cleared,
        stepsLeft: this.m3left
      });
      // 自检：开局 / 续玩分开记（level_start 的次数差 = 重试次数）
      telemetry.event(this.m3resumed ? 'level_resume' : 'level_start', {
        level: this.data.level || 0, seed: this.m3seed, total: this.board.total,
        moves: this.m3obj.moves, target: this.m3obj.target,
        cleared: this.m3cleared, left: this.m3left
      });
    } else {
      this.board = board.createLevel(cfg, _make, Math.random);
    }
    // 障碍物：确定性布点（冰霜 / 藏式木箱），保证每种元素至少留 2 张可点的牌。
    // 遮挡是**牌**的属性：牌下落时冰霜/木箱跟着走（视觉上像冰块滑落），
    // 因此 D23 的「总遮挡 ≤ 25%」「每种元素至少留 2 张可点」在任何时刻都成立。
    // Q5：续玩时盘面已经带着退出前的冰霜/木箱/绳索 —— **不能重新布点**（否则会叠加/覆盖）
    if (!this.m3resumed) {
      var initialIds = this.board.cells.map(function (t) { return t ? t.id : null; });
      obstacles.planOverlays(cfg, initialIds).forEach(function (o) {
        var t = that.board.cells[o.index];
        if (!t) return;
        if (o.kind === 'frost') t.frost = true;
        else if (o.kind === 'rope') t.rope = o.hp;
        else t.crate = o.hp;
      });
    }
    // 揭图透出标记：本关所有格初始都给牌（满铺），所以开局没有一格透出
    this.freed = [];
    for (var i = 0; i < this.board.slots; i++) this.freed.push(false);
    wx.setNavigationBarTitle({
      title: this.learnCfg ? ('L' + this.learnCfg.lv + ' · 第 ' + this.learnCfg.stage + ' 课') : ('第 ' + level + ' 课')
    });
    // 正确率统计清零（本关重新计数）
    this.attempts = 0;
    this.matches = 0;
    this.misses = 0;
    this.matchedCount = 0;
    // 即时应激励（D34）：本关的连击/档位/抽取历史全部重新起步
    this.comboState = praise.initState();
    // D115：每关重置场景语音闸门（否则上一关的冷却会把本关该播的压掉）
    this.sceneVoiceState = sceneVoice.createState(Date.now());
    var praiseOff = storage.getPraiseOff();
    // 2026-11-05：老线格子尺寸改成「由实际列数决定、正方形」，与学习线同一口径。
    //   原来固定按 8 列基准算格子 → 6 列关只占 64% 屏宽、8 列关占 86%，
    //   同一款游戏前面几关比后面窄一圈（用户实测指出：前几关盘面明显小）。
    //   现在任何列数都占满同样的宽度，格子大小恒定；难度差异只体现在「行数」（盘面高度）。
    var gap = 8;
    var tileW = Math.floor((AVAIL_W - gap * (cfg.cols - 1)) / cfg.cols);
    var tileH = tileW;                         // 正方格（藏文上下叠，长方格只会显得扁）
    var boardW = cfg.cols * tileW + (cfg.cols - 1) * gap;
    var boardH = cfg.rows * tileH + (cfg.rows - 1) * gap;
    // D51 学习体系：格子尺寸**反过来由列数决定**（cell = 屏宽 × 0.9 / cols，再扣间隙），
    // 所以是「6×6 小格 → 3×3 大格」，不再套用 8 列基准。
    var zoomable = false;
    if (this.learnCfg) {
      var sw = this.screenW();
      var geo = grid.boardSize(this.learnCfg.lv, sw, gap);
      tileW = tileH = geo.cell;                       // 正方格（藏文上下叠，长方格无用）
      boardW = geo.width;
      boardH = geo.height;
      zoomable = grid.needsZoomPreview(this.learnCfg.lv);
    }
    // 位置步进（百分比）：translate 的百分比相对元素自身 → 不需要在 transform 里写 rpx
    this.stepX = (tileW + gap) / tileW * 100;
    this.stepY = (tileH + gap) / tileH * 100;
    // 秘境揭图（D31）：先用「寺庙图鉴」—— 只有可信的 50 座（政府名录核过 / 大寺补录），
    // 150 关循环复用（宁可变重复，也不给玩家看混进来的照片标题或人名）。
    //
    // 🔴 学习线不显示揭图（2026-11-05 修）：
    //   结果页的揭晓卡是 `wx:if="{{reveal && !learnMode}}"` —— 学习课根本不揭晓。
    //   如果牌面底下照样透出寺庙照片，玩家看到的是一张**永远不会被告知是什么**的图，
    //   更要命的是 CCD 图必须署名，而学习线没有任何署名位置 → 授权不合规。
    var rt = null;
    if (!this.learnCfg) {
      try { rt = revealTemples.revealFor(level); } catch (e) { rt = null; }
    }
    var rv = rt
      ? { img: rt.img, name: rt.name, tibetan: rt.tibetan, roman: '', desc: rt.sub || rt.desc }
      : (this.learnCfg ? null : (revealsData[level - 1] || null));
    this.setData({
      level: level,
      cols: cfg.cols,
      rows: cfg.rows,
      totalPairs: this.board.total / 2,
      tileW: tileW,
      tileH: tileH,
      glyphSize: Math.round(tileW * 0.62),
      boardW: boardW,
      boardH: boardH,
      gap: gap,
      zoomable: zoomable,
      learnName: this.learnCfg ? this.learnCfg.name : '',
      learnLv: this.learnCfg ? this.learnCfg.lv : 0,
      learnStage: this.learnCfg ? this.learnCfg.stage : 0,
      stepsBudget: this.stepsBudget,
      // ⚠️ 三消要用目标模型的步数（m3left），不能用工学习线的 stepsBudget —— 老线它是 0，
      //    会把建关时写好的步数覆盖成 0（行为测试第 ④ 条抓到）。
      stepsLeft: this.match3 ? this.m3left : this.stepsBudget,
      reveal: rv ? { img: rv.img, name: rv.name, tibetan: rv.tibetan, roman: rv.roman, desc: rv.desc } : { img: '', name: '', tibetan: '', roman: '', desc: '' },
      revealPct: 0,
      revealOpacity: 0,
      praiseOff: praiseOff,
      bgmOff: storage.getBgmOff()
    });
    this.applyPieces('settle');
    tracker.track('first_letter_seen');
    if (!storage.isOnboardDone()) {
      this.setData({ guideStep: 1, guide: GUIDE[0] });
    }
    icons.renderIcons(cfg.elements.map(function (e) { return e[0]; }))
      .then(function (map) {
        if (Object.keys(map).length) {
          that.setData({ iconPaths: map });
        }
      });
  },
  guideNext: function () {
    var s = this.data.guideStep + 1;
    if (s > GUIDE.length) {
      storage.setOnboardDone();
      this.setData({ guideStep: 0 });
    } else {
      this.setData({ guideStep: s, guide: GUIDE[s - 1] });
    }
  },
  // 屏宽（px）：学习体系的格子尺寸按真实屏宽算（cell = 屏宽 × 0.9 / cols）
  screenW: function () {
    try {
      if (wx.getWindowInfo) return wx.getWindowInfo().windowWidth || 375;  // 官方首选（已替代 getSystemInfoSync）
    } catch (e) { /* 回退 */ }
    try { return wx.getSystemInfoSync().windowWidth || 375; } catch (e2) { return 375; }
  },
  // 造一张牌（含全部显示字段）。board.js 只负责把它在盘面上搬来搬去。
  makeTile: function (id, uid) {
    var el = elements[id] || this.runtimeTiles[id] || elements.letter_01;
    // D152 双轨：学习线**统一墨色牌** —— 颜色不再编码字母，玩家不能靠颜色配对，
    //   必须认字。纯游戏线（老 10 关/三消）this.learnCfg 为空，颜色照旧保留。
    var mono = !!this.learnCfg;
    var tileColor = mono ? '#2C3E50' : el.color;
    var t = {
      uid: uid,
      id: id,
      type: el.type,
      tibetan: tibText.withTseg(el.tibetan || ''),
      color: tileColor,
      fallbackText: el.char || '',
      golden: id === this.goldenId,
      pieceStyle: pieceStyle(tileColor),
      frost: false,
      rope: 0,
      crate: 0,
      shatter: false,
      state: 'idle' // idle | selected | removing
    };
    // 精灵表字母：成对同色帧（同字母第 1、2 张同帧，第 3、4 张同帧……）
    // 配对仍按字母判定，颜色只是视觉暗示
    var spriteKey = mono ? null : SPRITE_LETTERS[id];   // 学习线不用彩色精灵帧（帧里烘死了颜色）
    if (spriteKey) {
      var occ = this.occCount[id] || 0;
      this.occCount[id] = occ + 1;
      t.sprite = spriteKey;
      t.variant = Math.floor(occ / 2) % 4;
      t.spriteSrc = '/images/sprite_' + spriteKey + '.png';
      t.pieceStyle = ''; // 质感烘在帧里，不用 CSS 渐变
    }
    // D51：学习体系的字是叠加 3~4 部件的复合音节（如 བཀི），统一字号必然溢出格子，
    // 所以按**每张牌自己的字**算缩放（measureTibetanSyllable → calcScale）。
    //
    // D59：光靠「整体缩放」不够 —— 缩放被 MIN_SCALE 夹住，而 L10 起的**词 / 句**
    // （བཀྲ་ཤིས ~ ངའི་མིང་ལ་བཀྲ་ཤིས་རེད）实测超格最多 3.5 倍。
    // 改为 grid.layoutTile：**按 tsheg 断行 → 再按行数缩放**，词界不会被切断。
    if (this.learnCfg) {
      var sw = this.screenW();
      var cell = grid.cellPx(this.learnCfg.lv, sw);
      var baseFont = Math.round(cell * grid.FONT_RATIO);
      var lay = grid.layoutTile(t.tibetan, cell, baseFont, null);
      t.opticalShift = lay.opticalShift || 0;
      // 小程序 style 用 rpx → 把 px 按「750rpx = 屏宽」换算回来
      t.glyphOverride = Math.round(lay.font * 750 / sw);
      // 多行交给 <text> 的 \n 断行（藏文按 tsheg 断，不会切碎音节）
      t.glyphText = lay.lines.join('\n');
      // 装不下时**不静默**：字号已到下限仍溢出，说明该内容不该做牌面
      t.tileFits = lay.fits;
    }
    return t;
  },
  // D51 长按放大预览：L11 以上的复合字在 3×3 格里偏小，长按即看大图；
  // 仅在 zoomable 级别启用（由 grid.needsZoomPreview 判定 ≥ L11），点任意处收起。
  onTileLongPress: function (e) {
    if (!this.data.zoomable) return;
    var idx = parseInt(e.currentTarget.dataset.index, 10);
    var t = this.board && this.board.cells[idx];
    if (!t) return;
    this.setData({
      // D152：学习线墨牌 → 放大字用浅色，否则深字压深底看不见
      zoom: { show: true, tibetan: t.tibetan || '', color: this.learnCfg ? '#FFF6DC' : (t.color || '#C0392B') }
    });
  },
  closeZoom: function () {
    if (this.data.zoom && this.data.zoom.show) this.setData({ zoom: { show: false, tibetan: '', color: '' } });
  },
  // 把盘面投影成渲染列表。
  //   phase='in'     补充牌停在盘外上方 + 透明（首帧，让下一帧能过渡下来）
  //   phase='settle' 全部落到最终位置
  applyPieces: function (phase) {
    var st = this.board;
    if (!st) return;
    var fresh = this.pendingFresh || {};
    var hint = this._hintUids || {};
    var out = [];
    for (var i = 0; i < st.cells.length; i++) {
      var t = st.cells[i];
      if (!t) continue;
      var row = Math.floor(i / st.cols);
      var col = i % st.cols;
      var ty = row * this.stepY;
      var dropRows = fresh[t.uid] || 0;
      if (phase === 'in' && dropRows) ty -= dropRows * this.stepY;
      out.push({
        uid: t.uid,
        id: t.id,
        index: i,
        tx: Math.round(col * this.stepX * 100) / 100,
        ty: Math.round(ty * 100) / 100,
        fresh: !!(phase === 'in' && dropRows),
        type: t.type,
        tibetan: t.tibetan,
        opticalShift: t.opticalShift || 0,
        fallbackText: t.fallbackText,
        golden: t.golden,
        special: t.special,      // 三消特效牌：stripe（笔锋）/ rainbow（同字归一）
        pieceStyle: t.pieceStyle,
        sprite: t.sprite,
        variant: t.variant,
        spriteSrc: t.spriteSrc,
        frost: t.frost,
        rope: t.rope,
        crate: t.crate,
        blocked: !!(t.frost || t.rope > 0 || t.crate > 0),
        shatter: t.shatter,
        state: t.state,
        hinted: !!hint[t.uid]      // D156：仅视觉高亮，不影响牌面数据与点击判定
      });
    }
    this.setData({ pieces: out });
  },
  // 盘面变化后统一出图：有补充牌就分两帧（先盘外、再落下），否则一次到位
  showBoard: function (freshMap) {
    var that = this;
    this.pendingFresh = freshMap || {};
    if (!Object.keys(this.pendingFresh).length) {
      this.applyPieces('settle');
      return;
    }
    this.applyPieces('in');
    nextFrame(function () {
      that.pendingFresh = {};
      that.applyPieces('settle');
    });
  },
  // 按 uid 反查当前格号（牌会下落换格，格号不能缓存）
  indexOfUid: function (uid) {
    var c = this.board ? this.board.cells : [];
    for (var i = 0; i < c.length; i++) if (c[i] && c[i].uid === uid) return i;
    return -1;
  },
  onTapTile: function (e) {
    if (this.data.locked) return;
    // D51：放大预览开着时，这一次点击只用来收起它（不误选牌）
    if (this.data.zoom && this.data.zoom.show) { this.closeZoom(); return; }
    var idx = e.currentTarget.dataset.index;
    var tile = this.board.cells[idx];
    if (!tile || tile.state === 'removing') return;
    // 障碍物：冰霜/木箱罩住的牌不能直接点（不计入正确率、不惩罚）
    if (obstacles.isBlocked(tile)) {
      haptic('light');     // D60：撞障碍也要有手上回馈（原来只有 toast + 抖动）
      this.showBlockedTip(idx, tile);
      return;
    }
    // 再点已选中的那张牌 → 取消选中（按 uid 认牌，不按格号）
    if (this.firstUid !== null && this.firstUid === tile.uid) {
      this.firstUid = null;
      tile.state = 'idle';
      haptic('light');
      this.applyPieces('settle');
      return;
    }
    audio.tap();
    // D60：选中是**频率最高**的交互（每关 12~24 次），原来完全没有触觉 ——
    // 补上轻震，让「点到了」这件事在手上有确认感。
    haptic('light');
    if (tile.golden && !this.goldenSeen) {
      this.goldenSeen = true;
      tracker.track('first_special');
    }
    if (this.firstUid === null) {
      this.firstUid = tile.uid;
      tile.state = 'selected';
      this.applyPieces('settle');
      return;
    }
    var first = this.indexOfUid(this.firstUid);
    this.firstUid = null;
    var a = first >= 0 ? this.board.cells[first] : null;
    var b = tile;
    if (!a || !b) { this.applyPieces('settle'); return; }
    // 一次配对尝试（成功或失败都算）——正确率 = matches / attempts
    this.attempts++;
    // D51 学习体系：每次配对尝试消耗一步（成功失败都消耗，这就是「步数预算」的含义）。
    // 预算用完而盘面未空 → 本关结束走结算（不扣分；与既有的「正确率」口径分开统计）。
    if (this.learnCfg) {
      var left = Math.max(0, this.stepsBudget - this.attempts);
      var patch = { stepsLeft: left };
      // D115 目标达成：只剩最后 3 步时给一句祝福。
      // 判据用「剩余步数 ≤3」而不是「完成」——盘面清空是**通关**（另一场景），
      // 这里是「你快到目标了」。两者语义不同，不能混成一句。
      if (left > 0 && left <= 3) this.playSceneVoice('goal');
      if (left <= 0) {
        patch.locked = true;
        this.setData(patch);
        var self = this;
        setTimeout(function () { self.finishLevel(); }, 700);
        return;
      }
      this.setData(patch);
    }
    // 三消分支：老线专用。学习线仍然走下面的配对判定，行为完全不变。
    if (this.match3) {
      var cols3 = this.board.cols, rows3 = this.board.rows;
      if (!match3.adjacent(cols3, rows3, first, idx)) {
        haptic('light');
        wx.showToast({ title: '要选相邻的两张', icon: 'none', duration: 1000 });
        this.applyPieces('settle');
        return;
      }
      if (!match3.swapMakesLine(this.board.cells, cols3, rows3, first, idx)) {
        haptic('light');
        wx.showToast({ title: '这样换不出三个', icon: 'none', duration: 1000 });
        this.applyPieces('settle');
        return;
      }
      // 合法：交换 → 连锁结算
      var swapped = match3.swapCells(this.board.cells, first, idx);
      var that2 = this;                      // ⚠️ 必须在 resolve 之前声明：create 闭包要用它
      var res = match3.resolve({
        cols: cols3, rows: rows3, cells: swapped,
        pool: this.board.pool, nextUid: this.board.nextUid, spent: this.board.spent
      }, { create: function (id, uid) { return that2.makeTile(id, uid); }, rng: that2.m3rng });
      // === S02 ③：首次有效游玩 ===
      // 口径：**一次成功的交换**（真的消掉 ≥3 张）才算有效游玩 —— 打开页面不算。
      // 去重：tracker.track 内部只记第一次（`if (!d.events[id])`），
      //   所以用 cid 当 key 就天然做到「每个挑战只记一次」，不需要额外状态。
      // ⚠️ 判据必须用**本次**消除量 res.spent，不能用 this.m3cleared ——
      //    后者此刻还是上一轮的值（首次恒为 0），会导致"从挑战卡进来的首次游玩永远不记"。
      //    口径不变：一次成功的交换（真的消掉 ≥3 张）才算有效游玩；非法交换走不到这里。
      if (this.chCid && res.spent > 0) {
        tracker.track('chplay_' + this.chCid);
        if (this.chFrom) tracker.track('chfrom_' + this.chFrom);
      }

      // 状态先写回（池 / uid / spent 与播放无关，先落库）
      this.board.pool = res.pool;
      this.board.nextUid = res.nextUid;
      this.board.spent = res.spent;
      this.m3cleared = res.spent;
      this.m3left--;

      // === G03：三消必须接进「得分 / 连击 / 收藏 / 朗读」 ===
      // 每个 API 都是读出来的（handleMatch / 第 697 行 / 第 1128 行），不是猜的。
      this.matchedCount += res.spent;
      var clearedIds = {};
      res.rounds.forEach(function (rd) {
        rd.lines.forEach(function (ln) { clearedIds[ln.id] = 1; });
      });
      var cidList = Object.keys(clearedIds);
      for (var ci = 0; ci < cidList.length; ci++) this.collected[cidList[ci]] = true;
      var types3 = (this.board.plan && this.board.plan.ids.length) || 1;
      var dec3 = praise.onMatch(this.comboState, Date.now(), types3, Math.random);
      this.comboState = {
        combo: dec3.combo, prevTier: dec3.prevTier, lastShownAt: dec3.lastShownAt,
        lastIndex: dec3.lastIndex, maxCombo: dec3.maxCombo
      };
      storage.recordCombo(dec3.combo.combo);
      var gain3 = 10 * res.spent + 2 * Math.max(0, res.cascades - 1);
      this.setData({
        score: this.data.score + gain3,
        stepsLeft: this.m3left,
        m3target: this.m3obj.target,
        m3cleared: this.m3cleared
      });
      audio.tier(dec3.level);
      if (cidList.length && audio.pronounce(cidList[0])) tracker.track('first_pronunciation');

      // === G02：逐轮播放（2026-10-20）===
      // 为什么不直接落终局：玩家看不到"哪一轮消了什么"，连锁的因果与爆发感就消失了。
      // 三条硬约束：
      //   ① 播放期间 setData({ locked: true }) —— 否则玩家狂点会重复结算；
      //   ② 播完才落终局盘面并解锁；
      //   ③ 胜负（G01）与死局（G04）的判定必须挪到**播完之后**，不能提前。
      var rounds3 = res.rounds || [];
      var ix3 = 0;
      this.setData({ locked: true });
      var afterPlay = function () {
        if (that2.m3aborted) return;               // 同上：离开后不得结算
        that2.board.cells = res.cells;             // 终局盘面（含补牌后的最终态）
        that2.setData({ locked: false });
        that2.applyPieces('land');
        if (res.cascades >= 2) {
          haptic('medium');
          wx.showToast({ title: '连锁 ×' + res.cascades, icon: 'none', duration: 900 });
        }
        // G01：胜负分离（播完之后判）
        var won3 = that2.m3cleared >= that2.m3obj.target;
        if (won3 || that2.m3left <= 0) {
          that2.m3won = won3;
          that2.finishLevel();
          return;
        }
        // G04：死局判定（含锁定牌）
        var blk3 = {};
        that2.board.cells.forEach(function (t, i2) {
          if (t && obstacles.isBlocked(t)) blk3[i2] = 1;
        });
        if (!match3.hasMove(that2.board.cells, cols3, rows3, blk3)) {
          // R06/R07：池感知重洗（纯排列在 3×3 小盘上救不回来）；blocked 一并透传
          var sh = match3.reshuffle(that2.board.cells, cols3, rows3, {
            rng: that2.m3rng, pool: that2.board.pool, blocked: blk3,
            create: function (id, u) { return that2.makeTile(id, u); }
          });
          if (sh.ok) {
            that2.board.cells = sh.cells;
            if (sh.pool) that2.board.pool = sh.pool;
            if (sh.nextUid && sh.nextUid > that2.board.nextUid) that2.board.nextUid = sh.nextUid;
            wx.showToast({ title: '没有可走的了，重新排一下', icon: 'none', duration: 1200 });
          }
          that2.applyPieces('land');
        }
        // Q5：这一手已完全结算（胜负已判、死局已处理）→ 存真实盘面
        that2.saveResume();
      };
      that2.m3aborted = false;
      var playStep = function () {
        // === 生命周期守卫（任务书三.6）===
        // 页面已离开 / 已中止 → 立刻停，不能在已关闭的页面上继续结算、发奖或解锁。
        if (that2.m3aborted) return;
        if (ix3 >= rounds3.length) { afterPlay(); return; }
        that2.board.cells = rounds3[ix3].cellsAfter;   // 该轮落定后的快照
        that2.applyPieces('land');
        ix3++;
        // timer 必须存下来：否则 onUnload / onHide 时无法取消（原来就是漏了这一步）
        that2.m3Timer = setTimeout(playStep, 260);
      };
      playStep();
      return;
    }
    if (a.id === b.id) {
      this.matches++;
      // ⚠️ 这里原来是 handleMatch(first, second) —— **second 从未定义**，
      //    配对成功必抛 ReferenceError: second is not defined（学习线直接崩）。
      //    第二张牌的格号是 onTapTile 里的 idx（e.currentTarget.dataset.index）。
      this.handleMatch(first, idx);
    } else {
      this.misses++;
      // 同一类错误：错配路径也用了未定义的 second（行为测试第 ③ 条抓到）。
      this.handleMismatch(first, idx);
    }
  },
  // 配对成功：消除立即生效、不锁盘面；首次发现弹完整文化卡，重复只出轻提示
  handleMatch: function (i, j) {
    var that = this;
    var a = this.board.cells[i];
    var b = this.board.cells[j];
    if (!a || !b) return;
    this.matchedCount++;
    // 2026-10-24 单次配对反馈（此前只有连击档位才有声光，新手一次都连不成 → 全程无声）：
    //   ① 触觉：轻震动
    //   ② 听觉：match.mp3（素材早就在 audio/ 里，代码从未引用）
    //   ③ 视觉：光晕闪一下（复用连击用的 flashComboAura，档位固定 2 = 最轻一档）
    try {
      if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    } catch (err) { /* 部分机型不支持 */ }
    try { audio.play('match'); } catch (err) { /* 音频模块异常不影响游戏 */ }
    this.flashComboAura(2);
    this.collected[a.id] = true;
    tracker.track('first_match');
    // 即时应激励（D34）：连击判定 / 档位 / 文案抽取 / 频率控制全部交给 utils/praise.js。
    // 元素种类数取自盘面配额（第 1 关 2 种 → 第 10 关 12 种），因为连击窗口要随
    // 「找一对有多难」缩放：种类越多越难找，窗口就得越宽。
    var types = (this.board.plan && this.board.plan.ids.length) || 1;
    var dec = praise.onMatch(this.comboState, Date.now(), types, Math.random);
    // 2026-10-24：底部信息条要用连击档位（此前 combo 只存在 comboState 里，WXML 取不到）
    this.setData({ comboLevel: dec.combo });
    this.comboState = {
      combo: dec.combo,
      prevTier: dec.prevTier,
      lastShownAt: dec.lastShownAt,
      lastIndex: dec.lastIndex,
      maxCombo: dec.maxCombo
    };
    if (dec.level >= 2) tracker.track('first_combo');
    storage.recordCombo(dec.combo.combo);
    var gain = 10 * (a.golden ? 2 : 1) + 2 * (dec.combo.combo - 1);
    // 碎裂动画用：两张牌先转 removing + shatter，SHATTER_MS 后才真正从盘面移除
    a.state = 'removing'; a.shatter = true;
    b.state = 'removing'; b.shatter = true;
    // 障碍物结算：相邻冰霜解冻、相邻绳结松一股、相邻木箱扣耐久
    // ⚠️ resolveMatch 返回的是**副本**，必须把 changed 写回真实牌对象
    var settled = obstacles.resolveMatch(this.board.cells, [i, j], this.board.cols, this.board.rows);
    var brokeLabels = [];
    settled.changed.forEach(function (c) {
      var t = this.board.cells[c.index];
      if (!t) return;
      if (c.kind === 'frost') t.frost = false;
      else if (c.kind === 'rope') t.rope = c.hp;
      else t.crate = c.hp;
      if (c.broken) brokeLabels.push(c.kind === 'frost' ? '破冰！' : (c.kind === 'rope' ? '绳结解开！' : '木箱破开！'));
    }, this);
    this.setData({ score: this.data.score + gain });
    this.applyPieces('settle');
    if (settled.changed.length) {
      if (brokeLabels.length) this.showBreakFx(brokeLabels[0]);
      tracker.track('obstacle_broken');
    }
    // 轻微震动 + 档位音效（D34：一档一音，1 铜铃 / 2 手鼓 / 3 法号 / 4+ 欢呼）
    try {
      if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    } catch (err) { /* 部分机型不支持，忽略 */ }
    audio.tier(dec.level);
    // D62：连击与视听耦合 —— 光晕强度随档位递增，让「连了五对」这件事**看得见**。
    // 原来连击只有「文字 + 音效」两条通道，玩家要读字才知道升档了；
    // 现在档位一升，画面同时给一层短促的光晕，色/强度按档位分四档。
    // 刻意做得克制：一闪即收（420ms），不遮挡盘面、不打断 D57 的打扰预算。
    if (dec.level >= 2) this.flashComboAura(dec.level);
    // D115 连续消除：连到门槛才给一句，且同一关内只在新高时播一次。
    // 放在flashComboAura 之后 —— 连击的视觉反馈先出，语音再跟上。
    this.playSceneVoice('combo', { combo: dec.combo.combo });
    // 文案开关只关「文字」，不关音效与元素发音（发音属学习闭环，见 D34）
    if (dec.show && dec.text && !this.data.praiseOff) this.showPraise(dec);
    if (dec.show && dec.level >= 2 && dec.text && !this.data.praiseOff) {
      if (!audio.speakPraiseBo(dec.level, dec.text.index)) {
        audio.speak('praise_' + Math.min(5, dec.level));
      }
    }
    var id = a.id;
    var firstTime = !storage.isCardSeen(id);
    if (firstTime) storage.markCardSeen(id);
    // D115 稀有奖励：首次发现某个元素 = 抽到新文化卡，是本关最值得给一句的时刻。
    // 走 showCard 那条路（首次发现才弹完整文化卡），与该浮层的出现对齐。
    if (firstTime) this.playSceneVoice('rare');
    // 每次配对成功都朗读该元素发音（学习闭环：看得见 → 听得见）
    // 延后 300ms 让配对音效先响，避免人声与铃声糊在一起；连击时新发音打断旧发音
    // ⚠️ 带上牌面文本：学习关的 id 是 lrn_* 查不到音源，audio.pronounce 会按文本回退查一次，
    //    这样 L1 的三十个辅音能用上本来就有的真人录音（此前整条学习线是静默的）。
    var tibOfMatch = a && a.tibetan;
    if (this.voiceTimer) clearTimeout(this.voiceTimer);
    this.voiceTimer = setTimeout(function () {
      if (audio.pronounce(id, tibOfMatch)) tracker.track('first_pronunciation');
    }, 300);
    // 下落结算排队（连点不阻塞：玩家可以在下落动画期间继续配对）
    // ⚠️ 入队的是 uid：排队期间盘面会因前面的下落而变化，格号到结算时就过期了
    this.removeQueue.push([a.uid, b.uid]);
    this.drainQueue();
    setTimeout(function () {
      if (!that._alive) return;   // 页面已销毁：不再回调
      if (that.matchedCount === that.data.totalPairs) return;
      // 打扰预算（D57）：首次发现才出文化卡；重复匹配**不再弹任何浮层**——
      // 第 1 关只有 2 种元素，重复匹配在单局里会发生十几次，每一次都弹就是「跳窗太多」。
      if (firstTime) that.showCard(id);
      else if (REPEAT_TOAST) that.showToastTip(id);
    }, 320);
  },
  // D115：播一句场景祝福语音。
  // ⚠️ 必须让位于元素发音——每次配对成功都会朗读该元素（voiceTimer，300ms 后触发），
  //   那是学习闭环，优先级高于任何鼓励语。若两者同时抢单声部通道，
  //   玩家听到的是祝福语、**辅音被吃掉** —— 那等于把学习功能静音了。
  //   所以这里固定延后 1200ms：既避开 300ms 的元素发音（0.3~1.5s），
  //   又不会和下一对的元素发音撞在一起（连击时每对间隔通常 >1.5s）。
  //
  // ⚠️ 判定与播放**必须分开**：sceneVoice.trigger() 会写状态（记冷却时刻），
  //   若在延时回调里再调一次，第二次必然被自己的冷却判掉 —— 结果是永远不响。
  //   这是本轮真实写错又改掉的一处，故留注释钉住。
  playSceneVoice: function (scene, opt) {
    var that = this;
    if (!this.sceneVoiceState) this.sceneVoiceState = sceneVoice.createState(Date.now());
    if (!sceneVoice.shouldPlay(scene, this.sceneVoiceState, Date.now(), opt)) return false;
    var id = sceneVoice.SCENE_VOICE[scene];
    if (!audio.hasVoice(id)) return false;   // 没音源就不假装（与 pronounce 同策略）
    if (this.sceneTimer) clearTimeout(this.sceneTimer);
    this.sceneTimer = setTimeout(function () {
      if (!that._alive) return;
      // 到点才写状态：若在延时期间又触发了别的场景，冷却/连击闸门会重新判定
      sceneVoice.trigger(scene, that.sceneVoiceState, function (vid) {
        if (audio.speak(vid)) tracker.track('scene_voice');
      }, Date.now(), opt);
    }, sceneVoice.SCENE_YIELD_MS[scene] || 1200);
    return true;
  },
  // 展示一条赞美（D34）：一次只显示一条，**新的替换旧的**（不排队、不叠加）。
  // 替换时靠 praiseAnt 在 A/B 之间翻转来重启动画——WXSS 里同一个 animation-name 不会重播，
  // 必须换成另一个同名不同键的动画（praisePopA / praisePopB），否则第二条看不出播放。
  // D62 连击光晕：一闪即收，四档强度递增
  flashComboAura: function (level) {
    var lv = Math.max(1, Math.min(4, level || 1));
    this.setData({ comboAura: lv, comboAuraOn: false });
    var that = this;
    // 下一帧再打开：保证连续触发时每一闪都能重播（与 praiseAnt 同理）
    setTimeout(function () {
      if (!that._alive) return;
      that.setData({ comboAuraOn: true });
    }, 16);
    if (this.auraTimer) clearTimeout(this.auraTimer);
    this.auraTimer = setTimeout(function () {
      if (!that._alive) return;
      that.setData({ comboAuraOn: false });
    }, 420);
  },
  showPraise: function (dec) {
    var that = this;
    this.setData({
      praiseOn: true,
      praiseAnt: !this.data.praiseAnt,
      praiseCombo: dec.combo.combo,
      praiseLevel: dec.level,
      praiseZh: dec.text.zh,
      praiseBo: dec.text.bo,
      praiseTibetan: tibText.withTseg(dec.tibetan),
      praiseBurst: dec.burst
    });
    if (this.praiseTimer) clearTimeout(this.praiseTimer);
    if (this.auraTimer) clearTimeout(this.auraTimer);
    this.praiseTimer = setTimeout(function () {
      that.setData({ praiseOn: false });
    }, PRAISE_SHOW_MS);
  },
  // HUD 内的文案开关：只关「赞美文案」，不关音效与元素发音（发音属学习闭环）
  onTogglePraise: function () {
    var off = !this.data.praiseOff;
    this.setData({ praiseOff: off, praiseOn: false });
    storage.setPraiseOff(off);
    if (this.praiseTimer) clearTimeout(this.praiseTimer);
  },
  // HUD 内的背景音乐开关（PRD 3.3）：默认开，偏好落 progress.bgmOff（跨关/跨次保留）
  onToggleBgm: function () {
    var off = !this.data.bgmOff;
    this.setData({ bgmOff: off });
    storage.setBgmOff(off);
    if (off) audio.bgmStop();
    else audio.bgmStart();
  },
  // 背景音乐随页面生命周期启停：进入游戏页响、切走 / 关闭时停（不漏到别的页面）
  onShow: function () {
    if (!storage.getBgmOff()) audio.bgmStart();
    // D86 挑战闭环：从好友分享的挑战卡片进来时，提示一次目标步数
    //   （只提示一次：提示过就清掉，避免每次回到前台都弹）
    if (this.challenge && !this.challenge.shown) {
      this.challenge.shown = true;
      var that = this;
      wx.showModal({
        title: '好友邀请你一起练习',
        content: 'TA 用 ' + this.challenge.steps + ' 步完成了这一课。你能更快吗？',
        confirmText: '开始练习',
        showCancel: false,
        success: function () { if (that.challenge) that.challenge.accepted = true; }
      });
    }
    // D86 分享：必须在 onShow 里开启菜单，否则右上角「···」里没有分享入口
    //   （分享到朋友圈要求页面同时实现 onShareAppMessage 与 onShareTimeline，缺一不可）
    if (wx.showShareMenu) {
      wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
    }
  },
  // ---- D86 挑战分享：A 通关 → 分享带参数 → B 点开进同一关 → 结算对比 ----
  // 为什么带参数：没有关系链（小程序拿不到好友列表），「挑战」只能靠**分享链路**传递。
  //   A 用了几步走完，写在卡片参数里；B 打开后进同一关，结算时对比。
  onShareAppMessage: function () {
    // S02：记录「分享意图」。⚠️ 这只是意图，不是分享成功 —— 平台不回传真实结果，
    //   所以不能把它当"传播发生了"。真实新增要靠落地页的首次有效游玩来算。
    tracker.track('share_intent');
    var q = this.shareQuery();
    return {
      title: q.title,
      path: '/pages/game/game?' + q.query,
      imageUrl: '/images/logo-144.png'
    };
  },
  onShareTimeline: function () {
    var q = this.shareQuery();
    // ⚠️ 朋友圈打开进入「单页模式」（场景值 1154）：**无登录态、不能跳转、支付被禁用**。
    //    所以朋友圈卡片的作用是「让人看到并点『前往小程序』」，真正的游戏/打赏都在小程序里完成。
    return { title: q.title, query: q.query, imageUrl: '/images/logo-144.png' };
  },
  shareQuery: function () {
    var d = this.data || {};
    var lv = (this.learnCfg && this.learnCfg.lv) || 0;
    var stage = (this.learnCfg && this.learnCfg.stage) || 0;
    // 字段是 stepsLeft（剩余步数）；已用步数 = 预算 − 剩余
    var used = 0;
    if (typeof d.stepsLeft === 'number' && this.stepsBudget) {
      used = Math.max(0, this.stepsBudget - d.stepsLeft);
    }
    var steps = used;
    var parts = [];
    if (lv && stage) { parts.push('lv=' + lv); parts.push('stage=' + stage); }
    else { parts.push('level=' + (d.level || 1)); }
    if (steps > 0) parts.push('ch=' + steps);          // 挑战者的步数（越少越强）
    // === S02：同盘挑战必须带 seed + 挑战 ID ===
    // 只传关号不够：关号相同但从不同的种子生成，盘面就不同，成绩不可比。
    // seed 已在 S01 里做到"同 seed 同盘面"，这里把它带进分享链路。
    if (this.match3 && this.m3seed) {
      parts.push('seed=' + this.m3seed);
      parts.push('cid=' + this.m3challengeId);
    }
    // D113：收礼人匿名 uid —— 朋友从这张卡进来才能给 A 送祝福（打赏入口只挂在分享上）
    parts.push('to=' + storage.ensureUid());
    // D41/D43 去游戏化：量词必须用「课」，不能用「关」
    var where = lv ? ('L' + lv + ' · ' + stage + ' 课') : ('第 ' + (d.level || 1) + ' 课');
    var title = steps > 0
      ? ('我用 ' + steps + ' 步走完' + where + '，来一起练习吧')
      : ('藏字方块 · ' + where + '，认藏文从方块开始');
    return { title: title, query: parts.join('&') };
  },
  onHide: function () {
    // D156：切后台先把等待中的激励视频结算收掉。
    //   不收的话 _pending 会一直挂着 —— 回到前台再点，show() 直接返回 busy，
    //   玩家看到的就是一个「点了没反应」的按钮（而且不会再有奖励）。
    if (this._rewarded && typeof this._rewarded.abort === 'function') {
      try { this._rewarded.abort(); } catch (e) {}
    }
    // Q5：切后台先把**真实盘面**存下来（saveResume 内部会跳过结算动画中的不稳定态）
    this.saveResume();
    // 切后台：中止连锁播放（回调不能跑到后台去结算）
    this.m3aborted = true;
    if (this.m3Timer) { clearTimeout(this.m3Timer); this.m3Timer = null; }
    audio.bgmStop();
  },
  // 逐对结算：碎裂动画 → 下落 + 补充 → 出图 → 判断通关
  drainQueue: function () {
    var that = this;
    if (this.draining || !this.removeQueue.length) return;
    this.draining = true;
    var uids = this.removeQueue.shift();
    setTimeout(function () {
      if (!that._alive) return;   // 页面已销毁：结算队列停止排空
      // 结算时才把 uid 解析成格号：排队期间前面的下落已经把牌挪过位置了。
      // 这两张牌一定还在盘面上（只有它们自己的结算才会移走它们），所以必然找得到。
      var pair = [that.indexOfUid(uids[0]), that.indexOfUid(uids[1])];
      if (pair[0] < 0 || pair[1] < 0) {
        that.draining = false;
        that.drainQueue();
        return;
      }
      var fresh = {};
      that.board = board.collapse(that.board, pair, {
        create: function (id, uid) { return that.makeTile(id, uid); },
        rng: Math.random
      });
      (that.board.spawned || []).forEach(function (s) {
        fresh[s.uid] = Math.floor(s.index / that.board.cols) + 1;
      });
      // 揭图透出：被消除的格 + 收缩后仍为空的格（牌堆退潮露出来的位置）；只增不减
      pair.forEach(function (i) { that.freed[i] = true; });
      that.board.cells.forEach(function (t, i) { if (!t) that.freed[i] = true; });
      that.showBoard(fresh);
      var pctNow = that.freedPct();
      that.setData({
        matchedPairs: that.matchedCount,
        // 2026-10-24：进度条用（WXML 不支持算术表达式，必须在 JS 里算）
        progressPct: that.totalPairs ? Math.round(that.matchedCount / that.totalPairs * 100) : 0,
        revealPct: pctNow,
        // 2026-11-05：揭图透明度跟着进度走。
        // 原来图片是**满不透明**垫在牌层下面，牌与牌之间有缝 ——
        // 开局 0% 就能从缝里看清整座寺院（实测截图：牌面缝里已经是大昭寺）。
        // 「已揭开 0%」却看得见图，是自相矛盾，也把揭晓的那一刻提前毁了。
        revealOpacity: pctNow / 100
      });
      that.draining = false;
      // 通关判定必须等队列排空：连点时「最后一对」可能先于之前的对结算完成
      if (that.matchedCount === that.data.totalPairs && !that.removeQueue.length) that.finishLevel();
      that.drainQueue();
    }, SHATTER_MS);
  },
  freedPct: function () {
    if (!this.board) return 0;
    var n = 0;
    for (var i = 0; i < this.freed.length; i++) if (this.freed[i]) n++;
    return Math.round(n * 100 / this.board.slots);
  },
  // 通关：清空盘面 → 揭图整幅揭晓
  // Q5：把**当前真实盘面**写进本机存档。只在稳定态存（结算动画中不存，否则会存下半消的牌）。
  saveResume: function () {
    try {
      if (!this.match3 || this.finished || !this.board || !this.board.cells || !this.m3obj) return;
      if (this.draining || (this.removeQueue && this.removeQueue.length)) return;
      storage.saveResume(resume.snapshot({
        level: this.data.level || 0, seed: this.m3seed,
        rngState: (this.m3rng && this.m3rng.getState) ? this.m3rng.getState() : 0,
        cols: this.board.cols, rows: this.board.rows,
        cells: this.board.cells, pool: this.board.pool,
        nextUid: this.board.nextUid, spent: this.board.spent,
        target: this.m3obj.target, moves: this.m3obj.moves,
        left: this.m3left, cleared: this.m3cleared
      }));
    } catch (e) { /* 存档失败不影响本局 */ }
  },
  finishLevel: function () {
    // D96：记学习线进度
    if (this.learnCfg) {
      try { storage.markLearnStageDone(this.learnCfg.lv, this.learnCfg.stage); } catch (e) { /* 不影响通关 */ }
    }
    var that = this;
    if (this.finished) return;
    // Q5：结算即清档 —— 否则下次进来会「续」一局已经结束的局
    try { storage.clearResume(); } catch (e) {}
    // 三消：结算口径要改 —— 配对模式的 matchedCount/totalPairs 在三消下恒为 0/0，
    // 结果页会显示「共消除 0 对」。这里把「已消张数 / 目标张数」顶上同一套字段，
    // 保证结算页至少说的是真话（完整的三消结算文案属于 P2）。
    if (this.match3 && this.m3obj) {
      // 自检：结算（赢还是输、用了多少步、消了多少张）——「哪一关反复失败」靠这个算
      telemetry.event('level_end', {
        level: this.data.level || 0, seed: this.m3seed, won: !!this.m3won,
        used: Math.max(0, this.m3obj.moves - this.m3left), moves: this.m3obj.moves,
        cleared: this.m3cleared, target: this.m3obj.target
      });
      this.matchedCount = this.m3cleared;
      this.setData({ totalPairs: this.m3obj.target });
    }
    this.finished = true;
    this.dismissCard();
    this.hideToast();
    // D156：结算瞬间收掉提示高亮 —— 3.2 秒定时器可能在跳页动画里再 setData 一次，
    // 那会在「正在揭晓」的画面上闪一下金环。这里只清状态，不重绘（页面马上要走）。
    if (this.hintTimer) { clearTimeout(this.hintTimer); this.hintTimer = null; }
    this._hintUids = {};
    // R04：失败（三消步数耗尽未达标）不播胜利音效、不放庆祝粒子、不念扎西德勒。
    //   只有真正达标（非三消恒为真 / 三消看 m3won）才走成功路径。
    var isWin = !this.match3 || this.m3won;
    if (isWin) {
      audio.win();
      this.celebrate();
    }
    // 通关默认仍播tashi_delek（用户对照表里它标的正是「游戏欢迎、通关」）。
    // ⚠️ D115 修正：我先前把这里换成 greet_04，是**读错了你的表**——
    //   你的表里 greet_04 对应「完成挑战」，而 tashi_delek 对应「通关」。
    //   两者是不同场景：通关是「打完这一关」，完成挑战是「打完好友发来的挑战」
    //   （代码里 this.challenge，来自 D86 分享链路）。
    //   若把两者混为一谈，通关就会一直少念扎西德勒 —— 那是把你已有的功能删掉。
    var self2 = this;
    this.tashiTimer = setTimeout(function () {
      if (!isWin) return;   // R04：失败不念扎西德勒
      // 完成挑战（好友分享进来的那一次通关）→ greet_04（愿幸福与安乐降临）
      if (self2.challenge && self2.challenge.accepted !== false) {
        self2.playSceneVoice('clear');
      } else {
        audio.tashiDelek();
      }
    }, 350);
    // 结算跳转抽成具名函数：定时器到点走它，「跳过等待」也走它 —— 只有一条跳转路径。
    var goResult = function () {
      // D115：语音**念完再跳页**。原来固定 1200ms 后redirectTo，而完成挑战的
      //   祝福 350+350 才起播、最长 1.6s → 1200ms 跳转会把祝福腰斩成半句。
      //   半句藏语比不念更糟（听起来像卡住/破音）。所以推迟到语音结束后再走。
      //   通关（非挑战）走tashi_delek，时长同量级，一并等完。
      if (!that._alive) return;
      that.setData({ resultPending: false });
      // D111：学习线带 lv/stage/steps 走学习结算分支（结算页据此渲染
      //   「L1 · 第 3 课 / 下一课 / 本级证书」，不再把累计序号当老线 level 传）。
      //   老线不带这些参数，行为零变化。步数 = 配对尝试次数（学习线每试一次扣一步）。
      var learnPart = that.learnCfg
        ? ('&lv=' + that.learnCfg.lv + '&stage=' + that.learnCfg.stage +
           '&steps=' + that.attempts + '&budget=' + (that.stepsBudget || 0))
        : '';
      wx.redirectTo({
        url: '/pages/result/result?level=' + that.data.level +
          '&pairs=' + that.data.totalPairs +
          '&cards=' + that.collectedIds().join(',') +
          '&score=' + that.data.score +
          // D34：传「本关窗口连击的峰值」而不是结算那一刻的连击值——
          // 结算值取决于关卡何时结束（最后一对刚好连着就高），是个偶然量；
          // 峰值才代表「本局曾达到过几连」，与 3 星门槛（rateStars 的 combo>=3）语义一致。
          // G01：老线三消带真实胜负；学习线与配对恒为 1（行为零变化）
          '&won=' + (that.match3 ? (that.m3won ? 1 : 0) : 1) +
          // S01：把 seed 与挑战 ID 带进结算页，分享卡才能复现同一盘面
          (that.match3 ? ('&seed=' + that.m3seed + '&cid=' + that.m3challengeId) : '') +
          '&combo=' + ((that.comboState && that.comboState.maxCombo) || 0) +
          // 正确率（证书质量门槛）：attempts = 尝试次数，misses = 失败次数
          '&att=' + that.attempts +
          '&miss=' + that.misses + learnPart +
          // D113：挑战赛步数透传（B 从 A 的分享卡进来时带 ch=），结算页才能对比
          (that.challenge && that.challenge.steps > 0 ? ('&ch=' + that.challenge.steps) : '') +
          // D113：收礼人匿名 uid 透传（B 是从 A 的分享卡进来的 → 结算页才有「送一份祝福」入口）。
          //   自己玩自己的关卡时 toUid 为空，结算页不出现任何打赏入口。
          (that.toUid ? ('&to=' + that.toUid) : '')
      });
    // D115：1500ms → NAV_HOLD_MS(2200ms)。语音要念完才跳页，否则被腰斩成半句藏语。
    };
    this._goResult = goResult;
    // 面板上的「跳过等待 →」：有它就显示，没它也照常等语音念完
    this.setData({ resultPending: true });
    this.resultTimer = setTimeout(goResult, sceneVoice.NAV_HOLD_MS);
  },
  // 结算等待跳过：清掉延迟，立刻走同一条结算跳转（不复制 URL 构造）
  skipToResult: function () {
    if (this.resultTimer) { clearTimeout(this.resultTimer); this.resultTimer = null; }
    this.setData({ resultPending: false });
    if (this._goResult) this._goResult();
  },
  // ---- 通关情绪反馈（PRD 4.2）：金色莲花 + 风马旗碎片粒子 + 雪山金光 + 震动 ----
  // 纯 CSS 动画 + wx.vibrateShort，零依赖；粒子由 JS 生成随机参数后交 WXSS 播放
  celebrate: function () {
    var that = this;
    var flagColors = ['#C0392B', '#1E8449', '#2471A3', '#8A6A12', '#FFFFFF'];
    var fx = [];
    for (var i = 0; i < 18; i++) {
      var isFlag = i % 3 === 2;   // 每 3 片有 1 片风马旗
      fx.push({
        left: (8 + Math.random() * 84) + '%',
        top: (40 + Math.random() * 42) + '%',
        size: (14 + Math.floor(Math.random() * 3) * 6) + 'rpx',
        color: isFlag ? flagColors[i % 5] : (i % 2 ? '#8A6A12' : '#C0392B'),
        kind: isFlag ? 'flag' : 'lotus',
        alt: i % 2 ? ' alt' : '',
        delay: Math.floor(Math.random() * 260)
      });
    }
    this.setData({ fx: fx, fxOn: true });
    // D60：通关是全场最重的时刻，用 heavy（错配 medium / 选中 light），
    // 让「通关」在手上的重量与前两者区分开 —— 触觉分档才成体系。
    haptic('heavy');
    if (this.fxTimer) clearTimeout(this.fxTimer);
    this.fxTimer = setTimeout(function () {
      that.setData({ fxOn: false, fx: [] });
    }, 1700);
    tracker.track('first_celebration');
  },
  // 配对失败：抖动 + 轻声提示，无惩罚（连击清零）——唯一需要短暂锁盘面的场景
  handleMismatch: function (i, j) {
    var that = this;
    audio.mismatch();
    // D115 温柔鼓励：错配时给一句安慰，而不是只有否定音效。
    // 注意频次——连错 5 次不能句句安慰，所以冷却在 scene-voice.js 里（15s）。
    this.playSceneVoice('comfort');
    // D60：错配要给「身体感」——玩家点错时手上应有回馈，而不是只有声音。
    // 用 medium（比选中�� light 重一档），和「选中」区分开：手指能分辨这两种。
    haptic('medium');
    // D34：错配把窗口连击链条整条打断（档位同时归零，下一次消除从等级 1 重新起步）
    this.comboState = praise.onMiss(this.comboState);
    var a = this.board.cells[i];
    var b = this.board.cells[j];
    if (a) a.state = 'shake';
    if (b) b.state = 'shake';
    this.setData({ locked: true });
    this.applyPieces('settle');
    setTimeout(function () {
      if (!that._alive) return;   // 页面已销毁：不必再重置抖动状态
      if (a) a.state = 'idle';
      if (b) b.state = 'idle';
      that.setData({ locked: false });
      that.applyPieces('settle');
    }, 450);
  },
  // ---------- 文化卡（首次发现：非阻塞 + 自动收起） ----------
  showCard: function (id) {
    var that = this;
    var card = findCard(id);
    if (!card) return;
    this.hideToast();
    this.setData({
      showCard: true,
      card: card,
      // 这张卡到底有没有发音 —— 决定喇叭按钮写着「点击播放」还是「发音待录入」
      cardHasVoice: audio.hasVoice(id),
      speakMiss: false,
      cardColor: elements[id].color,
      cardColorDark: shade(elements[id].color, 0.76),
      cardBarRun: false
    });
    // 重置进度条动画（下一拍重新触发，保证每次弹出都从头走）
    if (this.barTimer) clearTimeout(this.barTimer);
    this.barTimer = setTimeout(function () {
      that.setData({ cardBarRun: true });
    }, 40);
    if (this.cardTimer) clearTimeout(this.cardTimer);
    this.cardTimer = setTimeout(function () {
      that.setData({ showCard: false });
    }, CARD_AUTO_MS);
  },
  // 用户开始操作文化卡（阅读 / 准备点「点击播放藏文读音」）：暂停自动收起——
  // 2026-10-08 用户反馈：卡片 5.2s 自动收起，手指还没点到按钮就消失，观感像「点不了」
  holdCard: function () {
    if (this.cardTimer) { clearTimeout(this.cardTimer); this.cardTimer = null; }
  },
  dismissCard: function () {
    if (this.cardTimer) { clearTimeout(this.cardTimer); this.cardTimer = null; }
    if (this.barTimer) { clearTimeout(this.barTimer); this.barTimer = null; }
    this.setData({ showCard: false, cardBarRun: false });
  },
  // ---------- 重复匹配轻提示（非阻塞） ----------
  showToastTip: function (id) {
    var that = this;
    var card = findCard(id);
    if (!card) return;
    this.setData({
      toastShow: true,
      toastIsIcon: card.type === 'icon',
      toastGlyph: card.type === 'icon' ? '' : card.title,
      toastIcon: this.data.iconPaths[id] || '',
      toastText: (card.subtitle || card.title) + ' · 已收藏',
      toastColor: elements[id].color
    });
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(function () {
      that.setData({ toastShow: false });
    }, TOAST_MS);
  },
  hideToast: function () {
    if (this.toastTimer) { clearTimeout(this.toastTimer); this.toastTimer = null; }
    if (this.data.toastShow) this.setData({ toastShow: false });
  },
  // ---------- 障碍物提示（冰霜/木箱，非阻塞，不计入正确率） ----------
  // ⚠️ 复位要认「牌对象」而不是「格号」：420ms 内牌可能已经下落换格，
  //    按格号复位会把状态写到换下来的另一张牌上（原牌会一直抖）。
  showBlockedTip: function (idx, tile) {
    var that = this;
    // 打扰预算（D57）：同一类障碍连点时不重复弹 —— 3 秒冷却期内只提示一次。
    // 没有它时「每点一下被冰住的牌就弹一条 1.7s 提示」，一次卡壳能连弹四五条。
    var now = Date.now();
    if (this._lastBlockTip && now - this._lastBlockTip < BLOCK_COOLDOWN_MS) return;
    this._lastBlockTip = now;
    tile.state = 'shake';
    this.applyPieces('settle');
    this.setData({
      toastShow: true,
      toastIsIcon: false,
      toastGlyph: tile.frost ? '❄' : (tile.rope > 0 ? '🪢' : '📦'),
      toastIcon: '',
      toastText: tile.frost ? '这块被冰霜罩住了 · 先配对旁边的牌'
        : (tile.rope > 0 ? ('绳结还缠着 ' + tile.rope + ' 股 · 配对旁边的牌来解开')
          : ('藏式木箱还剩 ' + tile.crate + ' 次 · 配对旁边的牌来敲开')),
      toastColor: tile.frost ? '#2471A3' : (tile.rope > 0 ? '#8A6A12' : '#8A5A2B')
    });
    setTimeout(function () {
      if (tile.state !== 'shake') return;
      tile.state = 'idle';
      that.applyPieces('settle');
    }, 420);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(function () {
      that.setData({ toastShow: false });
    }, TOAST_MS);
  },
  // 破冰/破箱浮字（复用浮字的观感，独立节点避免互相打断）
  showBreakFx: function (label) {
    var that = this;
    this.setData({ brokenFx: label });
    if (this.breakTimer) clearTimeout(this.breakTimer);
    this.breakTimer = setTimeout(function () { that.setData({ brokenFx: '' }); }, 1100);
  },
  // 文化卡喇叭：播放该元素的藏文发音（PRD 4.3「点击播放」）
  // 2026-10-09 用户反馈「根本就没有办法播放」——根因是**一部分元素根本没有音频文件**，
  // 而按钮一如既往写着「点击播放藏文读音」，点了当然是死寂。
  // 现在先在构建期就知道谁有、谁没有（data/voices.js），没有的直接把按钮写成
  // 「发音待录入」并点一下抖一抖——**不承诺给不了的东西**，也不弹窗打扰。
  speakCard: function () {
    if (!this.data.card) return;
    if (audio.pronounce(this.data.card.id)) {
      tracker.track('card_pronounce');
      return;
    }
    // 没有音源：轻抖动 + 文案提示（不是弹窗，不打断当前这一局）
    this.setData({ speakMiss: false });
    var that = this;
    setTimeout(function () {
      if (that._alive) that.setData({ speakMiss: true });
    }, 20);
  },
  // 本关消掉过的元素（结算页据此展示本课收集的文化卡）
  collectedIds: function () {
    return Object.keys(this.collected);
  },
  noop: function () {},

  // ---------- D156 激励视频：只给「找得到的一手」的一次视觉提示 ----------
  // 红线：不发酥油灯 / 哈达 / 道具 / 学习得分 / 星级，也不加步数 ——
  //       用广告换自家虚拟商品等于绕开虚拟支付。这里只高亮两张牌，3.2 秒后收。
  // 三消盘（老线）：找「相邻 + 换得出三个」的一对，口径与 onTapTile 完全一致；
  // 配对盘（学习线）：找两张同 id 的牌。两种盘都跳过被障碍锁住 / 正在消除的牌。
  findHintPair: function () {
    var st = this.board;
    if (!st || !st.cells || this.finished) return null;
    var cols = st.cols, rows = st.rows, cells = st.cells;
    var blocked = {};
    for (var k = 0; k < cells.length; k++) {
      if (cells[k] && obstacles.isBlocked(cells[k])) blocked[k] = 1;
    }
    var usable = function (i) {
      return !!cells[i] && !blocked[i] && cells[i].state !== 'removing';
    };
    if (this.match3) {
      for (var i = 0; i < cells.length; i++) {
        if (!usable(i)) continue;
        var r = Math.floor(i / cols), c = i % cols;
        if (c + 1 < cols && usable(i + 1) && match3.swapMakesLine(cells, cols, rows, i, i + 1))
          return [cells[i].uid, cells[i + 1].uid];
        if (r + 1 < rows && usable(i + cols) && match3.swapMakesLine(cells, cols, rows, i, i + cols))
          return [cells[i].uid, cells[i + cols].uid];
      }
      return null;
    }
    var seen = {};
    for (var j = 0; j < cells.length; j++) {
      if (!usable(j)) continue;
      var id = cells[j].id;
      if (seen[id] !== undefined) return [cells[seen[id]].uid, cells[j].uid];
      seen[id] = j;
    }
    return null;
  },
  clearHint: function () {
    if (this.hintTimer) { clearTimeout(this.hintTimer); this.hintTimer = null; }
    this._hintUids = {};
    this.applyPieces('settle');
  },
  /**
   * 发一次提示 —— **唯一发奖入口**（正常看完、超时后迟到的 onClose 都走这里）。
   * 次数本身是幂等闸门：`adHintLeft` 只有 1，发过就归零，
   * 所以「迟到补发」和「正常发奖」不可能叠加成两次。
   * @param {boolean} late 是否是超时收口之后补发的
   * @returns {boolean} 是否真的发出去了
   */
  grantAdHint: function (late) {
    if (!this._alive || this.finished) return false;
    if (this.data.adHintLeft <= 0) return false;
    // 广告播放期间盘面可能继续下落，落地时重新找一次，避免高亮到已消失的牌
    var now = this.findHintPair();
    if (!now) {
      wx.showToast({ title: '盘面已变，这次先留着', icon: 'none', duration: 1200 });
      return false;
    }
    this.setData({ adHintLeft: Math.max(0, this.data.adHintLeft - 1) });
    this._hintUids = {};
    this._hintUids[now[0]] = 1;
    this._hintUids[now[1]] = 1;
    this.applyPieces('settle');
    if (this.hintTimer) clearTimeout(this.hintTimer);
    var that = this;
    this.hintTimer = setTimeout(function () {
      if (that._alive) that.clearHint();
    }, 3200);
    // 说清为什么奖励是「晚到」的，不然玩家会以为中了什么随机奖励
    if (late) wx.showToast({ title: '广告看完了，提示补给你', icon: 'none', duration: 1400 });
    telemetry.event('ad_hint_grant', late ? { late: 1 } : null);
    telemetry.flush();
    return true;
  },
  // 官方：show() 必须在用户主动触发的回调里调，所以只挂在 bindtap 上。
  // 唯一发奖判据 = utils/ads.js 回来的 `{ok, reason}`（内部只看 res && res.isEnded）；
  // 中途关掉、拉取失败一律不发，且不消耗这一课的次数。
  onTapAdHint: function () {
    var that = this;
    if (!this._rewarded || typeof this._rewarded.show !== 'function') return;
    // 实例级重入锁：不拿 setData 的时序当契约（data 同步更新只是实现细节）。
    // 连点两次只会结算一次 —— 否则会出现「看一遍、发两次提示」。
    if (this._adBusy || this.data.adHintBusy || this.data.adHintLeft <= 0) return;
    if (this.finished || this.data.locked) return;
    // 先确认盘面真有可提示的一手：没有就不浪费玩家一次观看
    if (!this.findHintPair()) {
      wx.showToast({ title: '这一课暂时没有可提示的', icon: 'none', duration: 1200 });
      return;
    }
    this._adBusy = true;
    this.setData({ adHintBusy: true });
    // 漏斗起点：只记「点了」，不含广告 ID / 任何用户数据（隐私指引 §2.6 口径）
    telemetry.event('ad_hint_tap');
    // 幂等：正常回调、Promise 被 reject、show() 同步抛错三条路都可能走到 done，
    // 只允许结算一次 —— 否则会「看一遍、扣两次 / 埋两次点」。
    var settled = false;
    var done = function (r) {
      if (settled) return;
      settled = true;
      var ok = !!(r && r.ok);
      var reason = (r && r.reason) || 'failed';
      that._adBusy = false;
      if (!that._alive) return;
      that.setData({ adHintBusy: false });
      if (!ok) {
        // 说真话：只有玩家**真的中途关掉**才说「没看完」；
        // 广告压根没拉出来 / 起播超时 / 组件抛错，是平台或网络的事，不能赖到玩家头上。
        var msg = '';
        if (reason === 'skipped') msg = '没看完，这次不发提示';
        else if (reason === 'error' || reason === 'failed' || reason === 'timeout' || reason === 'exception')
          msg = '广告暂时没加载出来，稍后再试';
        // busy / aborted / destroyed：玩家没在看，不需要任何提示；timeout 属"没加载出来"，要提示
        if (msg) wx.showToast({ title: msg, icon: 'none', duration: 1200 });
        // 只记真实用户结局：中途退出 / 拉取失败 / 起播超时 / 组件异常。
        // busy/aborted/destroyed 不是用户行为，不记。
        // 🔴 exception 必须记：以前同步抛错只弹 toast、不进漏斗，
        //    上线后看到的就是「有 tap、既没 grant 也没 fail」的凭空断流 —— 查无可查。
        if (reason === 'skipped' || reason === 'error' || reason === 'failed' ||
            reason === 'timeout' || reason === 'exception') {
          telemetry.event('ad_hint_fail', { r: reason });
          telemetry.flush();
        }
        return;
      }
      // 广告播放期间盘面可能继续下落，落地时重新找一次，避免高亮到已消失的牌
      that.grantAdHint(false);
    };
    try {
      // 🔴 包一层 Promise.resolve 并给 then 传第二个回调：
      //    show() 同步抛错（实例已 destroy）与被 reject，过去只有前者被兜住；
      //    被 reject 时 done 根本不跑 → _adBusy 永远 true → 按钮永久停在「正在准备…」。
      //    两条异常路都归一成 reason:"exception"，既复位也进漏斗，不静默断流。
      Promise.resolve(this._rewarded.show()).then(done, function () {
        done({ ok: false, reason: 'exception' });
      });
    } catch (e) {
      done({ ok: false, reason: 'exception' });
    }
  },

  onUnload: function () {
    audio.bgmStop();     // 门禁：onUnload 第一件事必须是停 BGM（不能把音乐带到别的页面）
    // Q5：离开页面前存真实盘面（稳定态才存；本局已结算的会被 finishLevel 清掉）
    this.saveResume();
    audio.stopVoice();   // 元素发音 / 扎西德勒语音不追着用户跑到别的页面
    this._alive = false;
    // D156：激励视频是页面级单例，不摘监听下次进来会累积 onClose → 重复发提示。
    // 等待中的观看 Promise 也在这里收掉（destroy 内部会 resolve(false)，不发奖）。
    if (this._rewarded) {
      try { this._rewarded.destroy(); } catch (e) {}
      this._rewarded = null;
    }
    if (this.hintTimer) { clearTimeout(this.hintTimer); this.hintTimer = null; }
    this._hintUids = {};
    // 三消连锁播放：必须与原版这套清理一致（否则离开后回调继续结算/解锁）
    this.m3aborted = true;
    if (this.m3Timer) { clearTimeout(this.m3Timer); this.m3Timer = null; }
    if (this.resultTimer) { clearTimeout(this.resultTimer); this.resultTimer = null; }
    // 自检：未结算就离开 = 中途退出（「玩到第几步退出」就是这里的 used）
    if (this.match3 && this.m3obj && !this.finished) {
      try {
        telemetry.event('level_abort', {
          level: this.data.level || 0, seed: this.m3seed,
          used: Math.max(0, this.m3obj.moves - this.m3left),
          cleared: this.m3cleared, target: this.m3obj.target
        });
        telemetry.flush();
      } catch (e) {}
    }
    if (this.cardTimer) clearTimeout(this.cardTimer);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    if (this.comboTimer) clearTimeout(this.comboTimer);
    if (this.barTimer) clearTimeout(this.barTimer);
    if (this.voiceTimer) clearTimeout(this.voiceTimer);
    if (this.fxTimer) clearTimeout(this.fxTimer);
    if (this.tashiTimer) clearTimeout(this.tashiTimer);
    // D115：场景语音的延时播放定时器也必须清 —— 页面走了还播祝福
    // 与 audio.js 的 stopVoice 注释说的是同一个真实缺陷。
    if (this.sceneTimer) clearTimeout(this.sceneTimer);
    if (this.breakTimer) clearTimeout(this.breakTimer);
    if (this.praiseTimer) clearTimeout(this.praiseTimer);
    this.removeQueue = [];
  }
});