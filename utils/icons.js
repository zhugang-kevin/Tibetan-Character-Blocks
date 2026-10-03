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

// 批量渲染某关需要的图标，返回 Promise<{iconId: tempFilePath}>
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
      try {
        var canvas = wx.createOffscreenCanvas({ type: '2d', width: S, height: S });
        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, S, S);
        ctx.strokeStyle = elements[id].color;
        ctx.fillStyle = elements[id].color;
        ctx.lineWidth = S * 0.05;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        DRAWERS[elements[id].iconKey](ctx, S);
        wx.canvasToTempFilePath({
          canvas: canvas,
          x: 0, y: 0, width: S, height: S,
          destWidth: S, destHeight: S,
          success: function (res) { out[id] = res.tempFilePath; },
          complete: next
        });
      } catch (e) {
        next();
      }
    };
    next();
  });
}

module.exports = { renderIcons: renderIcons };
