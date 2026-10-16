/* scripts/test-level-guard.js — 关卡护栏（指纹 + 依赖隔离）
 *
 * 目的：用户 2026-10-16 的要求 ——「确保其他的内容修改不会影响到关卡」。
 *      口号没用，必须变成**机械闸门**：改了无关内容 → 关卡指纹必须一动不动；
 *      改了关卡内容 → 必须**显式**更新基线（否则红灯），不允许悄悄漂移。
 *
 * 两道闸：
 *   A. **关卡指纹**：把 150 关的规范内容（级 / 课 / 全局序号 / 盘面几何 / 元素与张数 /
 *      牌面藏文 / 配对数 / 步数预算 / 盘面计划）序列化成一份 sha256。
 *      · 与 data/level-fingerprint.json 的基线比对
 *      · 基线更新必须显式：node scripts/test-level-guard.js --update
 *   B. **依赖隔离**：关卡四件套的 require 必须落在闭集内 ——
 *      {utils/board.js, utils/learning.js, data/learning.js, data/affixes.js}。
 *      任何一个关卡模块去 require 卡片 / 元素 / 商家 / 藏香… → 直接判红。
 *
 * 为什么这两道能证明「其他改动不影响关卡」：
 *   指纹的输入**只来自那 4 个文件**（见 B 的闭集断言）；4 个文件之外任何改动
 *   （cards / elements / merchants / incense / regions / 页面 / 样式…）
 *   都没有进入指纹的路径 —— 改了也变不了指纹，这是**构造上的保证**，不是抽样观察。
 *
 * 用法：
 *   node scripts/test-level-guard.js            校验（CI 默认）
 *   node scripts/test-level-guard.js --update   更新指纹基线（改关卡时刻意为之）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');

let PASS = 0, FAIL = 0;
const fails = [];
function chk(cond, name, detail) {
  if (cond) PASS++;
  else { FAIL++; fails.push(name + (detail ? '：' + detail : '')); }
}

/* ---------- 关卡闭集：只有这四个文件属于「关卡」 ---------- */
const LEVEL_UNIVERSE = [
  'utils/board.js',
  'utils/learning.js',
  'data/learning.js',
  'data/affixes.js'
];

/* ---------- B. 依赖隔离 ---------- */
// 抽成纯函数，便于自证（用合成输入验证它真的抓得到域外依赖）
function leaksIn(rel, src) {
  const reqRe = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
  const out = [];
  const dir = path.dirname(rel);
  let m;
  while ((m = reqRe.exec(src)) !== null) {
    const target = path.normalize(path.join(dir, m[1])).replace(/\\/g, '/');
    // require 常省略 .js（如 require('../data/learning')）→ 归一化后再比
    const targetJs = /\.js$/.test(target) ? target : target + '.js';
    if (LEVEL_UNIVERSE.indexOf(target) === -1 && LEVEL_UNIVERSE.indexOf(targetJs) === -1) {
      out.push(rel + ' → ' + m[1] + '（' + targetJs + '）');
    }
  }
  return out;
}
let leak = [];
LEVEL_UNIVERSE.forEach(function (rel) {
  leak = leak.concat(leaksIn(rel, fs.readFileSync(path.join(ROOT, rel), 'utf8')));
});
chk(!leak.length, '关卡四件套的依赖是闭集（不引用任何关卡域外的文件）', leak.join('、'));
chk(LEVEL_UNIVERSE.every(function (f) { return fs.existsSync(path.join(ROOT, f)); }),
  '关卡四件套齐全', LEVEL_UNIVERSE.filter(function (f) { return !fs.existsSync(path.join(ROOT, f)); }).join('、'));

/* ---------- A. 关卡指纹 ---------- */
const board = require(path.join(ROOT, 'utils', 'board'));
const learning = require(path.join(ROOT, 'utils', 'learning'));
const data = require(path.join(ROOT, 'data', 'learning'));

function sortedObj(o) {
  const out = {};
  Object.keys(o).sort().forEach(function (k) { out[k] = o[k]; });
  return out;
}

function levelSpec() {
  const out = [];
  for (let lv = 1; lv <= 15; lv++) {
    const L = data.LEVELS[lv - 1];
    for (let st = 1; st <= 10; st++) {
      const stage = learning.buildStage(lv, st);
      const cfg = { cols: stage.cols, rows: stage.rows, elements: stage.elements };
      const plan = board.planCounts(cfg);          // 确定性（不随机洗牌）
      out.push({
        index: stage.index,
        lv: lv,
        st: st,
        name: L.name,
        cols: stage.cols,
        rows: stage.rows,
        pairs: stage.pairs,
        steps: stage.steps,
        elements: stage.elements.map(function (e) { return [e[0], e[1]]; }),
        titles: stage.titles,
        tiles: sortedObj(Object.keys(stage.tiles).sort().reduce(function (a, k) {
          a[k] = stage.tiles[k].tibetan; return a;
        }, {})),
        planSlots: plan.slots,
        planTotal: plan.total,
        planGive: sortedObj(plan.give),
        planPool: sortedObj(plan.pool)
      });
    }
  }
  return out;
}

const spec = levelSpec();
const json = JSON.stringify(spec);
const hash = crypto.createHash('sha256').update(json).digest('hex');
// 逐关哈希：光有总哈希只能告诉你「变了」，说不出**哪一关变了**。
// 「任何情况下都不出现冲突」需要**定位到关** —— 否则排查等于大海捞针。
const perLevel = {};
spec.forEach(function (one) {
  perLevel['L' + one.lv + '-' + one.st] =
    crypto.createHash('sha256').update(JSON.stringify(one)).digest('hex').slice(0, 16);
});

const BASELINE = path.join(ROOT, 'data', 'level-fingerprint.json');
const CHANGELOG = path.join(ROOT, 'docs', '关卡改动日志.md');

if (process.argv.indexOf('--update') > -1) {
  // 改动必须**留理由**：空理由直接拒绝 —— 防止「手滑跑个 --update 把改动洗白」
  let reason = '';
  process.argv.forEach(function (a) {
    if (a.indexOf('--reason=') === 0) reason = a.slice(9);
  });
  if (!reason.trim()) {
    console.log('✗ 拒绝更新：必须给出理由。');
    console.log('  用法：node scripts/test-level-guard.js --update --reason="为什么要改关卡"');
    console.log('  （关卡是本项目的核心资产，任何改动都要能在日志里查到「谁在什么时候为什么改的」）');
    process.exit(1);
  }
  let oldBase = null;
  try { oldBase = JSON.parse(fs.readFileSync(BASELINE, 'utf8')); } catch (e) { oldBase = null; }
  const changed = [];
  if (oldBase && oldBase.perLevel) {
    Object.keys(perLevel).forEach(function (k) {
      if (oldBase.perLevel[k] !== perLevel[k]) changed.push(k);
    });
  }
  fs.writeFileSync(BASELINE, JSON.stringify({
    _note: '关卡指纹基线（scripts/test-level-guard.js 生成）。改关卡必须 --update --reason="…"，不得手改。',
    _universe: LEVEL_UNIVERSE,
    levels: spec.length,
    sha256: hash,
    perLevel: perLevel
  }, null, 2) + '\n', 'utf8');

  // 追加改动日志（append-only）
  // 本地时间（不要用 toISOString —— 那是 UTC，日志会显示成 8 小时前的时刻，读日志的人会误判）
  const _d = new Date();
  const _p2 = function (n) { return (n < 10 ? '0' : '') + n; };
  const stamp = _d.getFullYear() + '-' + _p2(_d.getMonth() + 1) + '-' + _p2(_d.getDate()) +
    ' ' + _p2(_d.getHours()) + ':' + _p2(_d.getMinutes());
  let log = '';
  if (fs.existsSync(CHANGELOG)) log = fs.readFileSync(CHANGELOG, 'utf8');
  else log = '# 关卡改动日志\n\n> append-only。每次 `test-level-guard.js --update` 追加一条。\n' +
    '> 为什么要它：关卡是本项目核心资产，**任何改动都要能查到时间与理由**。\n\n';
  log += '## ' + stamp + '\n\n';
  log += '- 理由：' + reason + '\n';
  log += '- 指纹：`' + hash.slice(0, 32) + '…`\n';
  log += '- 变动关卡：' + (changed.length ? changed.join('、') : '（无逐关变动记录 / 首次建立基线）') + '\n\n';
  fs.writeFileSync(CHANGELOG, log, 'utf8');

  console.log('✓ 已更新关卡指纹基线：' + hash);
  console.log('  关卡数 ' + spec.length + '（15 级 × 10 课）');
  console.log('  变动关卡：' + (changed.length ? changed.join('、') : '（首次建立基线）'));
  console.log('  已记入 docs/关卡改动日志.md（理由：' + reason + '）');
  process.exit(0);
}

chk(spec.length === 150, '指纹覆盖 150 关（15 级 × 10 课）', '实际 ' + spec.length);

let base = null;
try { base = JSON.parse(fs.readFileSync(BASELINE, 'utf8')); } catch (e) { base = null; }
if (!base) {
  chk(false, '存在关卡指纹基线 data/level-fingerprint.json',
    '缺失 —— 先跑 node scripts/test-level-guard.js --update');
} else {
  // 逐关定位：不一致时必须能说出**哪一关**
  const diff = [];
  if (base.perLevel) {
    Object.keys(perLevel).forEach(function (k) {
      if (base.perLevel[k] !== perLevel[k]) diff.push(k);
    });
  }
  chk(base.sha256 === hash, '关卡指纹与基线一致（关卡内容未被改动）',
    base.sha256 === hash ? '' :
      '基线 ' + String(base.sha256).slice(0, 12) + ' ≠ 当前 ' + hash.slice(0, 12) +
      (diff.length ? '；变动的关卡：' + diff.slice(0, 12).join('、') +
        (diff.length > 12 ? ' 等 ' + diff.length + ' 关' : '') : '（无逐关基线可比）') +
      ' —— 有意改关卡请跑 --update --reason="…"；否则说明有改动泄漏进关卡');
  chk(!diff.length, '逐关哈希全部一致（没有单独某一关被悄悄改过）',
    diff.slice(0, 12).join('、') + (diff.length > 12 ? ' 等 ' + diff.length + ' 关' : ''));
  chk(base.levels === spec.length, '基线记录的关卡数一致', '基线 ' + base.levels + ' / 当前 ' + spec.length);
  chk(JSON.stringify(base._universe) === JSON.stringify(LEVEL_UNIVERSE),
    '基线的闭集与当前一致（闭集本身也不许悄悄扩容）');
}

/* ---------- 确定性自证：同一进程内两次构造必须逐字一致 ---------- */
const again = crypto.createHash('sha256').update(JSON.stringify(levelSpec())).digest('hex');
chk(again === hash, '关卡生成是确定性的（两次构造指纹相同）', hash.slice(0, 12) + ' ≠ ' + again.slice(0, 12));

/* ---------- C. 密封沙箱：拒绝一切域外依赖，关卡仍须完好构建 ----------
   这是「其他内容改不到关卡」的**直接实证** —— 不是观察，是构造：
   把关卡闭集之外的 require 全部变成抛错，如果关卡还能完整生成，
   就说明关卡对域外内容**没有任何读取路径**，改什么都不可能影响它。 */
{
  const Module = require('module');
  const origLoad = Module._load;
  const denied = [];
  Module._load = function (request, parent, isMain) {
    if (request.charAt(0) !== '.' && request.charAt(0) !== '/') {
      return origLoad.apply(this, arguments);            // Node 内置（path/fs/crypto…）放行
    }
    const parentRel = parent ? path.relative(ROOT, parent.filename).replace(/\\/g, '/') : '';
    const resolved = path.normalize(path.join(path.dirname(parentRel), request)).replace(/\\/g, '/');
    const resolvedJs = /\.js$/.test(resolved) ? resolved : resolved + '.js';
    if (LEVEL_UNIVERSE.indexOf(resolvedJs) === -1) {
      denied.push(parentRel + ' → ' + request);
      throw new Error('域外依赖被密封沙箱拒绝：' + request);
    }
    return origLoad.apply(this, arguments);
  };
  let sealedOk = true, sealedErr = '';
  try {
    LEVEL_UNIVERSE.forEach(function (f) {
      const abs = path.join(ROOT, f) + '.js';
      if (require.cache[abs]) delete require.cache[abs];
    });
    const l2 = require(path.join(ROOT, 'utils', 'learning'));
    let built = 0;
    for (let lv = 1; lv <= 15; lv++) for (let st = 1; st <= 10; st++) {
      const one = l2.buildStage(lv, st);
      if (!one || !one.elements || !one.elements.length) throw new Error('L' + lv + '-' + st + ' 构建为空');
      built++;
    }
    if (built !== 150) throw new Error('只构建出 ' + built + ' 关');
  } catch (e) { sealedOk = false; sealedErr = String(e.message || e); }
  Module._load = origLoad;
  chk(sealedOk && !denied.length,
    '密封沙箱：拒绝一切域外依赖后，150 关仍能完整构建（= 其他内容改不到关卡）',
    denied.slice(0, 3).join('、') || sealedErr);
}

/* ---------- 自证：证明两道闸都不是空转 ---------- */
{
  // ① 指纹：改动任一处关卡内容 → 指纹必变
  const mutated = JSON.parse(JSON.stringify(spec));
  mutated[0].steps = mutated[0].steps + 1;
  const h2 = crypto.createHash('sha256').update(JSON.stringify(mutated)).digest('hex');
  chk(h2 !== hash, '自证：改动任一处关卡内容 → 指纹必变（闸门不是空转）');

  // ② 依赖检查：喂一段带域外 require 的源码，必须抓得到
  const caught = leaksIn('utils/learning.js', "var c = require('../data/cards');");
  chk(caught.length === 1 && caught[0].indexOf('data/cards.js') > -1,
    '自证：关卡模块若引用域外文件，依赖检查能抓到', JSON.stringify(caught));
  const okCaught = leaksIn('utils/learning.js', "var a = require('../data/affixes');");
  chk(okCaught.length === 0, '自证：闭集内的引用不会被误报', JSON.stringify(okCaught));
}

/* ---------- 汇总 ---------- */
console.log('');
console.log('==========================================');
console.log('  关卡护栏（指纹 + 依赖隔离）');
console.log('==========================================');
console.log('  关卡数        : ' + spec.length);
console.log('  指纹 sha256   : ' + hash.slice(0, 16) + '…');
console.log('  闭集          : ' + LEVEL_UNIVERSE.join(' / '));
console.log('  域外依赖      : ' + (leak.length ? leak.length + ' 处 ✗' : '0 处 ✓'));
console.log('  ' + (FAIL ? '✗' : '✓') + ' 通过 ' + PASS + ' 项' + (FAIL ? '，失败 ' + FAIL + ' 项' : ''));
if (FAIL) {
  console.log('');
  fails.forEach(function (f) { console.log('   - ' + f); });
}
console.log('==========================================');
process.exit(FAIL ? 1 : 0);
