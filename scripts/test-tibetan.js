#!/usr/bin/env node
/**
 * scripts/test-tibetan.js — 藏文排版规则可复现测试（无需安装依赖）
 *
 * 验证 utils/tibetan-text.js 是否遵守《docs/tibetan-typography.md》的硬规则：
 *   1. tsheg ( ་ ) 是音节分隔符：分词是无损的，只是切分不增删字符
 *   2. 断行只发生在 tsheg 之后 —— 一个音节绝不能被拆到两行
 *   3. shad 家族（། ༎ ༏）永不居行首 —— 必须附着在前一音节单元内
 *   4. 单个音节超宽时整单元独占一行（不硬拆）
 *
 * 用法：node scripts/test-tibetan.js
 */
'use strict';

const assert = require('assert');
const path = require('path');

const tib = require(path.resolve(__dirname, '..', 'utils', 'tibetan-text.js'));

const TSHEG = '\u0F0B';
const SHAD = '\u0F0D';
const NYI_SHAD = '\u0F0E';
const SHAD4 = '\u0F0F';
const SHAD_FAMILY = [SHAD, NYI_SHAD, SHAD4];
const LINE_END_OK = [TSHEG].concat(SHAD_FAMILY);

let pass = 0, fail = 0;
const failures = [];

function check(name, fn) {
  try { fn(); pass++; }
  catch (e) { fail++; failures.push(name + ' → ' + e.message); }
}

/* 度量桩：给不同类别字符不同宽度，让换行在多个宽度档位上都能被检验 */
function measureCtx(charW) {
  return {
    measureText: function (s) {
      let w = 0;
      for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === TSHEG) w += charW * 0.35;
        else if (SHAD_FAMILY.indexOf(c) > -1) w += charW * 0.5;
        else if (c === ' ') w += charW * 0.3;
        else w += charW;
      }
      return { width: w };
    }
  };
}

const ctx = measureCtx(20);

/* 测试语料：含 tsheg 分音节、句末 shad、双垂符、四垂符、多音节长句 */
const CORPUS = [
  'བཀྲ་ཤིས་བདེ་ལེགས',                 // 扎西德勒（4 音节，无句末标点）
  'བཀྲ་ཤིས་བདེ་ལེགས།',                // 同上 + 句末 shad
  'ཉི་མ་ཤར་བ། ང་ཚོ་སློབ་སྦྱོང་བྱེད་ཀྱི་ཡོད།',  // 两句
  'བོད་ཡིག་ནི་ཧ་ཅང་ཡག་པོ་ཡོད།༎',      // 篇末双垂符
  'ལེགས་སོ།༏'                          // 四垂符
];

/* ---------- 1. 分词：无损且按 tsheg 收束 ---------- */
console.log('\n[1. tsheg 分词]');
CORPUS.forEach(function (text, i) {
  check('语料' + (i + 1) + ' 分词可无损还原', function () {
    assert.strictEqual(tib.tokenize(text).join(''), text);
  });
});
check('ཀ་ 分词为 1 个音节单元', function () {
  assert.deepStrictEqual(tib.tokenize('ཀ་'), ['ཀ་']);
});
check('ཀ 无 tsheg 时也是 1 个单元', function () {
  assert.deepStrictEqual(tib.tokenize('ཀ'), ['ཀ']);
});
check('བཀྲ་ཤིས་བདེ་ལེགས 切为 4 个音节', function () {
  assert.deepStrictEqual(tib.tokenize('བཀྲ་ཤིས་བདེ་ལེགས'),
    ['བཀྲ་', 'ཤིས་', 'བདེ་', 'ལེགས']);
});
check('末尾音节带 tsheg 时 4 个音节都以 ་ 收束', function () {
  const u = tib.tokenize('བཀྲ་ཤིས་བདེ་ལེགས་');
  assert.deepStrictEqual(u, ['བཀྲ་', 'ཤིས་', 'བདེ་', 'ལེགས་']);
  assert.ok(u.every(function (x) { return x[x.length - 1] === TSHEG; }));
});
check('shad 必须附着在前一音节内（不单独成单元）', function () {
  assert.deepStrictEqual(tib.tokenize('བཟང་།'), ['བཟང་།']);
});
check('tsheg 后的双垂符同样附着', function () {
  assert.deepStrictEqual(tib.tokenize('ཡག་༎'), ['ཡག་༎']);
});

/* ---------- 2. 断行：只在 tsheg 之后，且音节不拆 ---------- */
console.log('\n[2. 断行规则]');
let widthCases = 0;
for (let maxW = 40; maxW <= 420; maxW += 7) {
  widthCases++;
  CORPUS.forEach(function (text, ci) {
    const lines = tib.wrapTibetan(ctx, text, maxW);
    const tag = 'maxW=' + maxW + ' 语料' + (ci + 1);

    check(tag + ' 拼接无损', function () {
      assert.strictEqual(lines.join(''), text);
    });
    check(tag + ' 无空行', function () {
      assert.ok(lines.every(function (l) { return l.length > 0; }));
    });
    check(tag + ' 行首无 shad 家族标点', function () {
      lines.forEach(function (l) {
        assert.ok(SHAD_FAMILY.indexOf(l[0]) === -1, '行首出现 shad: ' + l);
      });
    });
    check(tag + ' 行首不是 tsheg', function () {
      lines.forEach(function (l) {
        assert.notStrictEqual(l[0], TSHEG, '行首出现 tsheg: ' + l);
      });
    });
    check(tag + ' 非末行都以 tsheg/标点收束（音节未被拆断）', function () {
      for (let k = 0; k < lines.length - 1; k++) {
        const last = lines[k][lines[k].length - 1];
        assert.ok(LINE_END_OK.indexOf(last) > -1,
          '第 ' + (k + 1) + ' 行以「' + last + '」结尾，音节被拆断');
      }
    });
  });
}

/* ---------- 3. 超窄宽度：整单元独占一行，不硬拆音节 ---------- */
console.log('\n[3. 极端宽度]');
check('宽度极小(10px)时每行恰好一个音节单元', function () {
  const text = 'བཀྲ་ཤིས་བདེ་ལེགས';
  const units = tib.tokenize(text);
  const lines = tib.wrapTibetan(ctx, text, 10);
  assert.strictEqual(lines.length, units.length);
  assert.deepStrictEqual(lines, units);
});
check('宽度极大(5000px)时只有一行', function () {
  const text = 'བཀྲ་ཤིས་བདེ་ལེགས';
  assert.strictEqual(tib.wrapTibetan(ctx, text, 5000).length, 1);
});

/* ---------- 4. 导出常量与排版知识一致 ---------- */
console.log('\n[4. 常量定义]');
check('TSHEG = U+0F0B', function () { assert.strictEqual(tib.TSHEG, '\u0F0B'); });
check('SHAD = U+0F0D', function () { assert.strictEqual(tib.SHAD, '\u0F0D'); });
check('四垂符是 U+0F0F（༏）而非 U+0F08（༈）', function () {
  const src = require('fs').readFileSync(
    path.resolve(__dirname, '..', 'utils', 'tibetan-text.js'), 'utf8');
  assert.ok(src.indexOf('U+0F0F') > -1, '文档未标注 U+0F0F');
  assert.ok(src.indexOf('\u0F08') === -1, '错误字符 ༈(U+0F08) 仍存在于源码');
});

/* ---------- 5. drawTibetanWrapped 行数契约 ---------- */
console.log('\n[5. 绘制行数]');
check('drawTibetanWrapped 返回实际行数', function () {
  let drawn = 0;
  const c = measureCtx(20);
  c.fillText = function () { drawn++; };
  const n = tib.drawTibetanWrapped(c, 'བཀྲ་ཤིས་བདེ་ལེགས', 100, 50, 120, 40);
  assert.strictEqual(n, drawn);
  assert.ok(n >= 2, '窄宽度下应换行，实际行数 ' + n);
});

/* ---------- 汇总 ---------- */
console.log('\n==========================================');
console.log('  通过: ' + pass + ' | 失败: ' + fail + '   （断行宽度档位 ' + widthCases + ' 组）');
if (fail) {
  console.log('  失败项：');
  failures.slice(0, 20).forEach(function (f) { console.log('   - ' + f); });
} else {
  console.log('  藏文排版规则全部通过 ✓（tsheg 断行 / shad 不居行首）');
}
console.log('==========================================');
process.exit(fail ? 1 : 0);
