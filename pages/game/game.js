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
var cardsData = require('../../data/cards');
var revealsData = require('../../data/reveals');
var audio = require('../../utils/audio');
var icons = require('../../utils/icons');
var praise = require('../../utils/praise');
var storage = require('../../utils/storage');
var tracker = require('../../utils/tracker');
var obstacles = require('../../utils/obstacles');
var board = require('../../utils/board');

var GUIDE = [
  { title: '如何使用', text: '点击两张相同的藏文字母或文化图标，它们就会一起消失。' },
  { title: '听发音', text: '每消除成功一次，都会读出这个字的藏文发音——边学边听，记得更牢。连续正确不断，声音还会越清亮。' },
  { title: '方块会下落', text: '消除之后，上方的方块会落下来补位，顶上还会掉下新的方块。把这一课的方块全部消完，棋盘下面的秘境图就整幅揭晓了。带 ❄ 的牌先碰不得，消除它旁边的牌即可解冻；木箱上的金色数字是剩余耐久。金色 ✦ 是特殊方块，双倍练习。' }
];

// 统一牌面尺寸：以 8 列为基准（所有关卡牌一样大，只变数量）
var REF_COLS = 8;
var PAGE_PAD = 20;     // 页面左右留白（rpx）
var PANEL_PAD = 18;    // 底盘内边距（rpx）
var OUTLINE_PAD = 12;  // 凹槽内边距（rpx）
var AVAIL_W = 750 - PAGE_PAD * 2 - PANEL_PAD * 2 - OUTLINE_PAD * 2 - 6;
var CARD_AUTO_MS = 5200;
var TOAST_MS = 1700;
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
    level: 1,
    cols: 6,
    rows: 4,
    // 渲染列表：绝对定位的方块（按 uid 稳定 key）。坐标用**百分比**表达 ——
    // translate 的百分比相对元素自身尺寸，所以不需要在 transform 里写 rpx 单位。
    pieces: [],
    tileW: 73,           // 统一牌宽（rpx）
    tileH: 88,           // 统一牌高（rpx）
    glyphSize: 45,       // 藏文字号（rpx）
    boardW: 498,         // 盘面宽（rpx，随列数变化，居中）
    boardH: 400,         // 盘面高（rpx，随行数变化，揭图层与牌区精确对齐）
    gap: 8,
    iconPaths: {},
    matchedPairs: 0,
    totalPairs: 0,
    // 秘境揭图（D31）：reveal.img 为空表示本关无揭图；名字在通关前不出现（不剧透）
    reveal: { img: '', name: '', tibetan: '', roman: '', desc: '' },
    revealPct: 0,
    showCard: false,
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
  // 正确率统计（证书质量门槛用）：attempts = 配对尝试次数，misses = 失败次数
  attempts: 0,
  matches: 0,
  misses: 0,

  onLoad: function (query) {
    var level = parseInt(query.level, 10) || 1;
    var cfg = levelsData[level - 1];
    if (!cfg) {
      wx.redirectTo({ url: '/pages/index/index' });
      return;
    }
    var that = this;
    // 页面存活守卫：unload 之后到期的定时器不再回调，避免在已销毁的页面上 setData
    this._alive = true;
    this.goldenId = cfg.elements[Math.floor(Math.random() * cfg.elements.length)][0];
    this.occCount = {};
    this.collected = {};
    this.removeQueue = [];
    this.draining = false;
    this.finished = false;
    this.pendingFresh = {};

    // 盘面：初始铺满 cols×rows（无开局空洞，揭图从 0% 起步），其余牌进补充池
    this.board = board.createLevel(cfg, function (id, uid) { return that.makeTile(id, uid); }, Math.random);

    // 障碍物：确定性布点（冰霜 / 藏式木箱），保证每种元素至少留 2 张可点的牌。
    // 遮挡是**牌**的属性：牌下落时冰霜/木箱跟着走（视觉上像冰块滑落），
    // 因此 D23 的「总遮挡 ≤ 25%」「每种元素至少留 2 张可点」在任何时刻都成立。
    var initialIds = this.board.cells.map(function (t) { return t ? t.id : null; });
    obstacles.planOverlays(cfg, initialIds).forEach(function (o) {
      var t = that.board.cells[o.index];
      if (!t) return;
      if (o.kind === 'frost') t.frost = true;
      else if (o.kind === 'rope') t.rope = o.hp;
      else t.crate = o.hp;
    });

    // 揭图透出标记：本关所有格初始都给牌（满铺），所以开局没有一格透出
    this.freed = [];
    for (var i = 0; i < this.board.slots; i++) this.freed.push(false);

    wx.setNavigationBarTitle({ title: '第 ' + level + ' 课' });

    // 正确率统计清零（本关重新计数）
    this.attempts = 0;
    this.matches = 0;
    this.misses = 0;
    this.matchedCount = 0;

    // 即时应激励（D34）：本关的连击/档位/抽取历史全部重新起步
    this.comboState = praise.initState();
    var praiseOff = storage.getPraiseOff();

    // 统一牌面尺寸：tile 由 8 列基准算出，各关只变列数与行数
    var gap = 8;
    var tileW = Math.floor((AVAIL_W - gap * (REF_COLS - 1)) / REF_COLS);
    var tileH = Math.round(tileW * 1.2);
    var boardW = cfg.cols * tileW + (cfg.cols - 1) * gap;
    var boardH = cfg.rows * tileH + (cfg.rows - 1) * gap;

    // 位置步进（百分比）：translate 的百分比相对元素自身 → 不需要在 transform 里写 rpx
    this.stepX = (tileW + gap) / tileW * 100;
    this.stepY = (tileH + gap) / tileH * 100;

    // 秘境揭图（D31）：十关每关一张，程序绘制（scripts/make_reveals.py）
    var rv = revealsData[level - 1] || null;

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
      reveal: rv ? { img: rv.img, name: rv.name, tibetan: rv.tibetan, roman: rv.roman, desc: rv.desc } : { img: '', name: '', tibetan: '', roman: '', desc: '' },
      revealPct: 0,
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

  // 造一张牌（含全部显示字段）。board.js 只负责把它在盘面上搬来搬去。
  makeTile: function (id, uid) {
    var el = elements[id];
    var t = {
      uid: uid,
      id: id,
      type: el.type,
      tibetan: el.tibetan || '',
      color: el.color,
      fallbackText: el.char || '',
      golden: id === this.goldenId,
      pieceStyle: pieceStyle(el.color),
      frost: false,
      rope: 0,
      crate: 0,
      shatter: false,
      state: 'idle' // idle | selected | removing
    };
    // 精灵表字母：成对同色帧（同字母第 1、2 张同帧，第 3、4 张同帧……）
    // 配对仍按字母判定，颜色只是视觉暗示
    var spriteKey = SPRITE_LETTERS[id];
    if (spriteKey) {
      var occ = this.occCount[id] || 0;
      this.occCount[id] = occ + 1;
      t.sprite = spriteKey;
      t.variant = Math.floor(occ / 2) % 4;
      t.spriteSrc = '/images/sprite_' + spriteKey + '.png';
      t.pieceStyle = ''; // 质感烘在帧里，不用 CSS 渐变
    }
    return t;
  },

  // 把盘面投影成渲染列表。
  //   phase='in'     补充牌停在盘外上方 + 透明（首帧，让下一帧能过渡下来）
  //   phase='settle' 全部落到最终位置
  applyPieces: function (phase) {
    var st = this.board;
    if (!st) return;
    var fresh = this.pendingFresh || {};
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
        fallbackText: t.fallbackText,
        golden: t.golden,
        pieceStyle: t.pieceStyle,
        sprite: t.sprite,
        variant: t.variant,
        spriteSrc: t.spriteSrc,
        frost: t.frost,
        rope: t.rope,
        crate: t.crate,
        blocked: !!(t.frost || t.rope > 0 || t.crate > 0),
        shatter: t.shatter,
        state: t.state
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
    var idx = e.currentTarget.dataset.index;
    var tile = this.board.cells[idx];
    if (!tile || tile.state === 'removing') return;

    // 障碍物：冰霜/木箱罩住的牌不能直接点（不计入正确率、不惩罚）
    if (obstacles.isBlocked(tile)) {
      this.showBlockedTip(idx, tile);
      return;
    }

    // 再点已选中的那张牌 → 取消选中（按 uid 认牌，不按格号）
    if (this.firstUid !== null && this.firstUid === tile.uid) {
      this.firstUid = null;
      tile.state = 'idle';
      this.applyPieces('settle');
      return;
    }

    audio.tap();

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

    if (a.id === b.id) {
      this.matches++;
      this.handleMatch(first, second);
    } else {
      this.misses++;
      this.handleMismatch(first, second);
    }
  },

  // 配对成功：消除立即生效、不锁盘面；首次发现弹完整文化卡，重复只出轻提示
  handleMatch: function (i, j) {
    var that = this;
    var a = this.board.cells[i];
    var b = this.board.cells[j];
    if (!a || !b) return;

    this.matchedCount++;
    this.collected[a.id] = true;
    tracker.track('first_match');

    // 即时应激励（D34）：连击判定 / 档位 / 文案抽取 / 频率控制全部交给 utils/praise.js。
    // 元素种类数取自盘面配额（第 1 关 2 种 → 第 10 关 12 种），因为连击窗口要随
    // 「找一对有多难」缩放：种类越多越难找，窗口就得越宽。
    var types = (this.board.plan && this.board.plan.ids.length) || 1;
    var dec = praise.onMatch(this.comboState, Date.now(), types, Math.random);
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
    // 文案开关只关「文字」，不关音效与元素发音（发音属学习闭环，见 D34）
    if (dec.show && dec.text && !this.data.praiseOff) this.showPraise(dec);

    var id = a.id;
    var firstTime = !storage.isCardSeen(id);
    if (firstTime) storage.markCardSeen(id);

    // 每次配对成功都朗读该元素发音（学习闭环：看得见 → 听得见）
    // 延后 300ms 让配对音效先响，避免人声与铃声糊在一起；连击时新发音打断旧发音
    if (this.voiceTimer) clearTimeout(this.voiceTimer);
    this.voiceTimer = setTimeout(function () {
      if (audio.pronounce(id)) tracker.track('first_pronunciation');
    }, 300);

    // 下落结算排队（连点不阻塞：玩家可以在下落动画期间继续配对）
    // ⚠️ 入队的是 uid：排队期间盘面会因前面的下落而变化，格号到结算时就过期了
    this.removeQueue.push([a.uid, b.uid]);
    this.drainQueue();

    setTimeout(function () {
      if (!that._alive) return;   // 页面已销毁：不再回调
      if (that.matchedCount === that.data.totalPairs) return;
      if (firstTime) that.showCard(id); else that.showToastTip(id);
    }, 320);
  },

  // 展示一条赞美（D34）：一次只显示一条，**新的替换旧的**（不排队、不叠加）。
  // 替换时靠 praiseAnt 在 A/B 之间翻转来重启动画——WXSS 里同一个 animation-name 不会重播，
  // 必须换成另一个同名不同键的动画（praisePopA / praisePopB），否则第二条看不出播放。
  showPraise: function (dec) {
    var that = this;
    this.setData({
      praiseOn: true,
      praiseAnt: !this.data.praiseAnt,
      praiseCombo: dec.combo.combo,
      praiseLevel: dec.level,
      praiseZh: dec.text.zh,
      praiseBo: dec.text.bo,
      praiseTibetan: dec.tibetan,
      praiseBurst: dec.burst
    });
    if (this.praiseTimer) clearTimeout(this.praiseTimer);
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
  },

  onHide: function () {
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
      that.setData({
        matchedPairs: that.matchedCount,
        revealPct: that.freedPct()
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
  finishLevel: function () {
    var that = this;
    if (this.finished) return;
    this.finished = true;
    this.dismissCard();
    this.hideToast();
    audio.win();
    this.celebrate();
    this.tashiTimer = setTimeout(function () { audio.tashiDelek(); }, 350);
    setTimeout(function () {
      // 用户在这 1.2 秒里点了返回/退出：页面已销毁，不能再把他硬推到结算页
      if (!that._alive) return;
      wx.redirectTo({
        url: '/pages/result/result?level=' + that.data.level +
          '&pairs=' + that.data.totalPairs +
          '&cards=' + that.collectedIds().join(',') +
          '&score=' + that.data.score +
          // D34：传「本关窗口连击的峰值」而不是结算那一刻的连击值——
          // 结算值取决于关卡何时结束（最后一对刚好连着就高），是个偶然量；
          // 峰值才代表「本局曾达到过几连」，与 3 星门槛（rateStars 的 combo>=3）语义一致。
          '&combo=' + ((that.comboState && that.comboState.maxCombo) || 0) +
          // 正确率（证书质量门槛）：attempts = 尝试次数，misses = 失败次数
          '&att=' + that.attempts +
          '&miss=' + that.misses
      });
    }, 1500);
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
    try {
      if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    } catch (e) { /* 部分机型不支持，忽略 */ }
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
    tile.state = 'shake';
    this.applyPieces('settle');
    this.setData({
      toastShow: true,
      toastIsIcon: false,
      toastGlyph: tile.frost ? '❄' : (tile.rope > 0 ? '🪢' : '📦'),
      toastIcon: '',
      toastText: tile.frost ? '这块被冰霜罩住了 · 先消除旁边的牌'
        : (tile.rope > 0 ? ('绳结还缠着 ' + tile.rope + ' 股 · 消除旁边的牌来解开')
          : ('藏式木箱还剩 ' + tile.crate + ' 次 · 消除旁边的牌来敲开')),
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
  speakCard: function () {
    if (!this.data.card) return;
    if (audio.pronounce(this.data.card.id)) tracker.track('card_pronounce');
  },

  // 本关消掉过的元素（结算页据此展示本课收集的文化卡）
  collectedIds: function () {
    return Object.keys(this.collected);
  },

  noop: function () {},

  onUnload: function () {
    audio.bgmStop();
    audio.stopVoice();   // 元素发音 / 扎西德勒语音不追着用户跑到别的页面
    this._alive = false;
    if (this.cardTimer) clearTimeout(this.cardTimer);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    if (this.comboTimer) clearTimeout(this.comboTimer);
    if (this.barTimer) clearTimeout(this.barTimer);
    if (this.voiceTimer) clearTimeout(this.voiceTimer);
    if (this.fxTimer) clearTimeout(this.fxTimer);
    if (this.tashiTimer) clearTimeout(this.tashiTimer);
    if (this.breakTimer) clearTimeout(this.breakTimer);
    if (this.praiseTimer) clearTimeout(this.praiseTimer);
    this.removeQueue = [];
  }
});
