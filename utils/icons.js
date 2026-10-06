// utils/icons.js — 文化图标绘制（简笔线条风格）
// 用离屏 Canvas 绘制后导出为临时图片，供 <image> 组件展示。
var elements = require('../data/elements');

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 吉祥结：外层菱形 + 内层方框 + 两道交叉弧线
function drawKnot(ctx, s) {
  var c = s / 2;
  ctx.beginPath();
  ctx.moveTo(c, s * 0.12);
  ctx.lineTo(s * 0.88, c);
  ctx.lineTo(c, s * 0.88);
  ctx.lineTo(s * 0.12, c);
  ctx.closePath();
  ctx.stroke();

  roundRectPath(ctx, c - s * 0.19, c - s * 0.19, s * 0.38, s * 0.38, s * 0.04);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(s * 0.12, c);
  ctx.bezierCurveTo(c, c - s * 0.32, c, c + s * 0.32, s * 0.88, c);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(c, s * 0.12);
  ctx.bezierCurveTo(c - s * 0.32, c, c + s * 0.32, c, c, s * 0.88);
  ctx.stroke();
}

// 青稞（icon_02）：穗轴 + 五对短粗鳞状麦粒（鱼骨状排列）+ 顶部三根长芒 + 基部两片短叶
// D25：原为「莲花」，2026-10-06 拍板换世俗题材；题材与 scripts/make_reveals.py#barley 同源。
function drawBarley(ctx, s) {
  var cx = s * 0.5;
  var lw0 = ctx.lineWidth;

  // 芒（细线，先画，压在麦粒之下）
  ctx.lineWidth = lw0 * 0.45;
  var awns = [-0.17, 0, 0.17];
  for (var k = 0; k < awns.length; k++) {
    ctx.beginPath();
    ctx.moveTo(cx + s * awns[k] * 0.4, s * 0.20);
    ctx.quadraticCurveTo(cx + s * awns[k] * 0.85, s * 0.11, cx + s * awns[k], s * 0.015);
    ctx.stroke();
  }
  ctx.lineWidth = lw0;

  // 穗轴
  ctx.beginPath();
  ctx.moveTo(cx, s * 0.88);
  ctx.lineTo(cx, s * 0.19);
  ctx.stroke();

  // 麦粒：五对短粗鳞片，越靠上越短，呈鱼骨状贴轴
  for (var i = 0; i < 5; i++) {
    var y = s * (0.64 - i * 0.095);
    var len = s * (0.19 - i * 0.010);
    for (var d = -1; d <= 1; d += 2) {
      ctx.beginPath();
      ctx.moveTo(cx, y);
      ctx.quadraticCurveTo(cx + d * len * 0.85, y - len * 0.60,
                           cx + d * len * 1.05, y - len * 1.30);
      ctx.stroke();
    }
  }

  // 基部两片短叶（勿长过麦粒，避免整株读成蕨叶）
  ctx.beginPath();
  ctx.moveTo(cx, s * 0.84);
  ctx.quadraticCurveTo(cx - s * 0.22, s * 0.78, cx - s * 0.26, s * 0.64);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, s * 0.78);
  ctx.quadraticCurveTo(cx + s * 0.22, s * 0.70, cx + s * 0.26, s * 0.56);
  ctx.stroke();
}

// 雪山：双峰轮廓 + 雪线折线
function drawMountain(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(s * 0.08, s * 0.82);
  ctx.lineTo(s * 0.34, s * 0.30);
  ctx.lineTo(s * 0.48, s * 0.50);
  ctx.lineTo(s * 0.68, s * 0.20);
  ctx.lineTo(s * 0.92, s * 0.82);
  ctx.closePath();
  ctx.stroke();

  // 右峰雪线
  ctx.beginPath();
  ctx.moveTo(s * 0.61, s * 0.33);
  ctx.lineTo(s * 0.57, s * 0.38);
  ctx.lineTo(s * 0.65, s * 0.42);
  ctx.lineTo(s * 0.61, s * 0.47);
  ctx.stroke();

  // 左峰雪线
  ctx.beginPath();
  ctx.moveTo(s * 0.29, s * 0.38);
  ctx.lineTo(s * 0.25, s * 0.43);
  ctx.lineTo(s * 0.33, s * 0.46);
  ctx.stroke();
}

// 牦牛（icon_04）：侧影 —— 高耸的肩峰 + 左探下垂的头 + 一对大弯角 + 蓬松腹毛 + 四腿 + 尾
// D25：原为「经幡」，2026-10-06 拍板换世俗题材；题材与 scripts/make_reveals.py#yak 同源。
function drawYak(ctx, s) {
  // 躯干（闭合路径：颈根 → 肩峰 → 背 → 臀 → 腹 → 胸）
  ctx.beginPath();
  ctx.moveTo(s * 0.32, s * 0.48);
  ctx.quadraticCurveTo(s * 0.42, s * 0.29, s * 0.58, s * 0.31);
  ctx.quadraticCurveTo(s * 0.80, s * 0.34, s * 0.89, s * 0.47);
  ctx.quadraticCurveTo(s * 0.93, s * 0.55, s * 0.88, s * 0.63);
  ctx.lineTo(s * 0.36, s * 0.63);
  ctx.quadraticCurveTo(s * 0.28, s * 0.57, s * 0.32, s * 0.48);
  ctx.closePath();
  ctx.stroke();

  // 头（向左下探出，吻部下沉）
  ctx.beginPath();
  ctx.moveTo(s * 0.33, s * 0.46);
  ctx.quadraticCurveTo(s * 0.19, s * 0.47, s * 0.15, s * 0.57);
  ctx.quadraticCurveTo(s * 0.12, s * 0.66, s * 0.21, s * 0.68);
  ctx.quadraticCurveTo(s * 0.31, s * 0.68, s * 0.33, s * 0.58);
  ctx.stroke();

  // 一对大弯角（先外撇再上挑，是牦牛的识别特征）
  ctx.beginPath();
  ctx.moveTo(s * 0.17, s * 0.49);
  ctx.quadraticCurveTo(s * 0.08, s * 0.32, s * 0.24, s * 0.20);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(s * 0.27, s * 0.46);
  ctx.quadraticCurveTo(s * 0.21, s * 0.29, s * 0.38, s * 0.22);
  ctx.stroke();

  // 蓬松腹毛：下垂锯齿（悬在腿前，不与腿线交叉）
  ctx.beginPath();
  ctx.moveTo(s * 0.36, s * 0.62);
  for (var i = 1; i <= 4; i++) {
    var x = s * (0.36 + i * 0.12);
    ctx.quadraticCurveTo(x - s * 0.05, s * 0.71, x, s * 0.62);
  }
  ctx.stroke();

  // 四腿
  var legs = [0.41, 0.51, 0.75, 0.85];
  for (var j = 0; j < legs.length; j++) {
    ctx.beginPath();
    ctx.moveTo(s * legs[j], s * 0.61);
    ctx.lineTo(s * legs[j], s * 0.87);
    ctx.stroke();
  }

  // 尾（垂在体侧）
  ctx.beginPath();
  ctx.moveTo(s * 0.89, s * 0.46);
  ctx.quadraticCurveTo(s * 0.97, s * 0.55, s * 0.91, s * 0.69);
  ctx.stroke();

  // 眼
  ctx.beginPath();
  ctx.arc(s * 0.24, s * 0.57, s * 0.014, 0, Math.PI * 2);
  ctx.fill();
}

var DRAWERS = {
  knot: drawKnot,
  barley: drawBarley,
  mountain: drawMountain,
  yak: drawYak
};

// 三种墨色变体（对比度 D32）：
//   id        → el.color 深墨：浅底卡片 / 奖章 / 徽章（icon_01 吉祥结 #C0392B on 米卡 = 5.04）
//   id|lite   → 奶白 #FFF6DC：普通牌面（牌面本色平色段，#FFF6DC on #C0392B = 5.04）
//   id|gold   → 深墨 #6B4406：金块牌面（浅金底，#6B4406 on #FFE9A8 = 7.12）
// 此前图标只按 el.color 渲染一份，落在同色牌面上对比度仅 1.41~1.75，符号几乎不可见。
var TILE_LITE_INK = '#FFF6DC';
var TILE_GOLD_INK = '#6B4406';
var TILE_INKS = [['', null], ['|lite', TILE_LITE_INK], ['|gold', TILE_GOLD_INK]];

// 批量渲染某关需要的图标，返回 Promise<{iconId: tempFilePath}>（含 |lite / |gold 变体）
function renderIcons(elementIds) {
  return new Promise(function (resolve) {
    var ids = [];
    var seen = {};
    for (var k = 0; k < elementIds.length; k++) {
      var el = elements[elementIds[k]];
      if (el && el.type === 'icon' && !seen[elementIds[k]]) {
        seen[elementIds[k]] = true;
        ids.push(elementIds[k]);
      }
    }
    var out = {};
    if (!ids.length || !wx.createOffscreenCanvas) {
      resolve(out);
      return;
    }
    var S = 160;
    var i = 0;
    var next = function () {
      if (i >= ids.length) {
        resolve(out);
        return;
      }
      var id = ids[i++];
      var v = 0;
      var one = function () {
        if (v >= TILE_INKS.length) {
          next();
          return;
        }
        var suffix = TILE_INKS[v][0];
        var ink = TILE_INKS[v][1];
        v++;
        try {
          var canvas = wx.createOffscreenCanvas({ type: '2d', width: S, height: S });
          var ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, S, S);
          ctx.strokeStyle = ink || elements[id].color;
          ctx.fillStyle = ink || elements[id].color;
          ctx.lineWidth = S * 0.05;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          DRAWERS[elements[id].iconKey](ctx, S);
          wx.canvasToTempFilePath({
            canvas: canvas,
            x: 0, y: 0, width: S, height: S,
            destWidth: S, destHeight: S,
            success: function (res) { out[id + suffix] = res.tempFilePath; },
            complete: one
          });
        } catch (e) {
          one();
        }
      };
      one();
    };
    next();
  });
}

module.exports = { renderIcons: renderIcons };
