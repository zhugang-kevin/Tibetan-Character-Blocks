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

// 莲花：八瓣 + 中心圆
function drawLotus(ctx, s) {
  var c = s / 2;
  for (var i = 0; i < 8; i++) {
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(i * Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.10);
    ctx.quadraticCurveTo(s * 0.15, -s * 0.28, 0, -s * 0.42);
    ctx.quadraticCurveTo(-s * 0.15, -s * 0.28, 0, -s * 0.10);
    ctx.stroke();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(c, c, s * 0.07, 0, Math.PI * 2);
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

// 经幡：弧形绳 + 五色小旗（蓝白红绿黄）
function drawFlags(ctx, s) {
  var y0 = s * 0.24, cy = s * 0.40, y1 = s * 0.20;
  ctx.beginPath();
  ctx.moveTo(s * 0.08, y0);
  ctx.quadraticCurveTo(s * 0.5, cy, s * 0.92, y1);
  ctx.stroke();

  var colors = ['#2471A3', '#FFFFFF', '#C0392B', '#1E8449', '#B7950B'];
  for (var i = 0; i < 5; i++) {
    var t = (i + 0.5) / 5;
    var x = s * 0.08 + s * 0.84 * t;
    var y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1;
    ctx.fillStyle = colors[i];
    ctx.fillRect(x - s * 0.055, y, s * 0.11, s * 0.20);
    roundRectPath(ctx, x - s * 0.055, y, s * 0.11, s * 0.20, s * 0.015);
    ctx.stroke();
  }
}

var DRAWERS = {
  knot: drawKnot,
  lotus: drawLotus,
  mountain: drawMountain,
  flags: drawFlags
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
