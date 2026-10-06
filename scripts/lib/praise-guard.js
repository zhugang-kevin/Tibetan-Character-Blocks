// scripts/lib/praise-guard.js — 应激励文案库（data/praise.js）的机械守卫
//
// 为什么单独成模块：这份校验有**两个**调用方，且必须用同一把尺子——
//   ① scripts/build-h5.js 生成体验版时把文案内联进单文件，进货前要过闸；
//   ② scripts/validate.js §32 要把它当「尺子」做**反例自测**（喂坏数据必须判错），
//      否则门禁只是「碰巧没报错」，不能证明它拦得住。
// 如果两端各写一份，改了一边就出现两把尺子——这正是本项目在别处踩过的坑。
//
// 校验项（全部为硬错误，越界即 unable 出货）：
//   - 正好 5 个档位，level 必须 1..5 且升序，档位名非空，need 必须等于 level；
//   - 每档 ≥5 条，中文/藏文都非空，字段白名单只有 { zh, bo }（不得夹带金额或权益字段）；
//   - 同一档内中文文案不得重复（重复会让「不连续重复」形同虚设）；
//   - 藏文必须过排版铁律（isWellFormedSentence）：不裸渲染元音/下加字、
//     tsheg·shad 不居首不连续、末尾音节有收尾；
//   - 中文文案与档位名不得含 §19 违禁字眼（竞争性 / 营销性）。
//
// 返回 { bad, errors, warns }：bad > 0 即视为不合格。
//   opts.isWellFormedSentence 缺省时跳过藏文良构检查并给出 warn
//   （调用方必须显式传 utils/tibetan-text 的实现，别默认放行）。

// 与 validate §19（data/lamp.js 守卫）同表，另加「折扣」——
// 文案库同样不得出现竞争性 / 营销性字眼。
var BAN = ['排行榜', '排行', '名次', '战区', '金币', '优惠券', '折扣', '抽奖', '返现', '广告'];

function checkPraiseLibrary(library, opts) {
  var o = opts || {};
  var wf = o.isWellFormedSentence;
  var errors = [];
  var warns = [];
  var lib = library || {};

  if (!Array.isArray(lib.tiers) || lib.tiers.length !== 5) {
    errors.push('data/praise.js 应为 5 个档位，实际 ' + ((lib.tiers || []).length));
    return { bad: errors.length, errors: errors, warns: warns };
  }

  lib.tiers.forEach(function (t, i) {
    var want = i + 1;
    if (t.level !== want) errors.push('第 ' + want + ' 档 level 应为 ' + want + '，实际 ' + t.level);
    if (t.need !== t.level) errors.push('第 ' + want + ' 档 need 应等于 level（领取门槛 = 通关关数口径）');
    if (!t.name || !String(t.name).trim()) errors.push('第 ' + want + ' 档缺少档位名');
    BAN.forEach(function (w) {
      if (String(t.name || '').indexOf(w) > -1) errors.push('第 ' + want + ' 档档位名含违禁字眼「' + w + '」');
    });
    if (!Array.isArray(t.texts) || t.texts.length < 5) {
      errors.push('第 ' + want + ' 档文案不足 5 条（实际 ' + ((t.texts || []).length) + '）');
      return;
    }
    var seenZh = {};
    t.texts.forEach(function (x, k) {
      var tag = '第 ' + want + ' 档第 ' + (k + 1) + ' 条';
      var item = x || {};
      if (typeof item.zh !== 'string' || !item.zh.trim()) { errors.push(tag + ' 缺少中文文案'); return; }
      if (typeof item.bo !== 'string' || !item.bo.trim()) { errors.push(tag + ' 缺少藏文文案'); return; }
      Object.keys(item).forEach(function (key) {
        if (key !== 'zh' && key !== 'bo') {
          errors.push(tag + ' 含多余字段 ' + key + '（文案不得夹带金额 / 券 / 权益）');
        }
      });
      if (seenZh[item.zh]) errors.push('第 ' + want + ' 档中文文案重复：' + item.zh);
      seenZh[item.zh] = true;
      BAN.forEach(function (w) {
        if (item.zh.indexOf(w) > -1) errors.push(tag + ' 中文含违禁字眼「' + w + '」');
      });
      if (wf) {
        var res = wf(item.bo);
        if (!res || !res.ok) {
          errors.push(tag + ' 藏文排版不良构（' + item.bo + '）：' +
            ((res && res.reasons) || []).join('；'));
        }
      }
    });
  });

  if (!wf) warns.push('未传入 isWellFormedSentence，藏文良构检查被跳过');
  if (lib.pendingNativeReview !== true) {
    warns.push('pendingNativeReview 不为 true —— 母语者校对完成后请同步更新 data/praise.js');
  }
  return { bad: errors.length, errors: errors, warns: warns };
}

module.exports = { checkPraiseLibrary: checkPraiseLibrary, PRAISE_BAN: BAN };
