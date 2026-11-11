// 用 Chrome 渲染藏文（PIL 无 raqm，无法做复杂文本整形）
// 产出：透明底 PNG（4x 超采样，供 PIL 合成）
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

// 向上找到项目根（含 package.json 的那层）
function findRoot(dir) {
  let d = dir;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(d, 'assets-src', 'fonts', 'NotoSerifTibetan-Variable.ttf'))) return d;
    d = path.dirname(d);
  }
  throw new Error('project root not found from ' + dir);
}
const ROOT = findRoot(__dirname);
const FONT = path.join(ROOT, 'assets-src', 'fonts', 'NotoSerifTibetan-Variable.ttf');
const OUT = path.join(ROOT, '.workbuddy', 'tmp', 'icon-gen');

const fontB64 = fs.readFileSync(FONT).toString('base64');

// usage: node render-tibetan.js <outName> <text> <sizePx> <color> [weight] [extraFontFamily]
const [outName, text, sizePx, color, weightArg, familyArg] = process.argv.slice(2);
const weight = weightArg || '600';
const family = familyArg
  ? `'NotoSerifTibetan',${familyArg}`
  : `'NotoSerifTibetan',-apple-system,'PingFang SC','Microsoft YaHei',sans-serif`;

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 500 }, deviceScaleFactor: 4 });
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @font-face{font-family:'NotoSerifTibetan';src:url(data:font/ttf;base64,${fontB64}) format('truetype');font-weight:100 900;}
    html,body{margin:0;padding:0;background:transparent;overflow:hidden;}
    #t{font-family:${family};font-weight:${weight};font-size:${sizePx}px;
       color:${color};white-space:nowrap;line-height:1.55;display:inline-block;
       -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;}
  </style></head><body><div id="t">${text}</div></body></html>`;
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const fs2 = await page.evaluate(() => {
    const r = document.getElementById('t').getBoundingClientRect();
    return { w: Math.ceil(r.width), h: Math.ceil(r.height) };
  });
  await page.setViewportSize({ width: Math.max(fs2.w + 40, 100), height: Math.max(fs2.h + 40, 60) });
  await page.evaluate(() => document.fonts.ready);
  const el = await page.$('#t');
  const out = path.join(OUT, outName);
  await el.screenshot({ path: out, omitBackground: true });
  await browser.close();
  console.log(JSON.stringify({ out, w: fs2.w, h: fs2.h }));
})().catch(e => { console.error('FAIL', e); process.exit(1); });
