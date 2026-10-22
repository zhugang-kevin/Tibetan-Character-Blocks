#!/usr/bin/env node
// scripts/cdp.js — 直连 Chrome DevTools Protocol 的小工具（D156）
//
// ## 为什么需要它
//   agent-browser 的 daemon 会随 shell 退出被回收，还得手动 close，
//   于是出现"浏览器每次都自动关闭"。这里改成**每次调用只开一条 WebSocket，
//   执行完就退**，不依赖任何常驻进程；浏览器由独立进程托管，不受 shell 生命周期影响。
//
// ## 用法（CHROME 需先用 --remote-debugging-port 启动）
//   node scripts/cdp.js targets              列出页面目标
//   node scripts/cdp.js nav <url>            导航（等 load）
//   node scripts/cdp.js text                 取 body.innerText
//   node scripts/cdp.js eval "<js>"          执行表达式并返回结果（JSON）
//   node scripts/cdp.js click <selector>     点击（用 JS 找元素，不依赖 ref）
//   node scripts/cdp.js link <substr>        打印 href 含 <substr> 的链接
//   node scripts/cdp.js shot <path>          截图
//
// 端口默认 9333，可用 CDP_PORT 覆盖。

'use strict';
const fs = require('fs');

const PORT = process.env.CDP_PORT || '9333';
const BASE = `http://127.0.0.1:${PORT}`;

async function listTargets() {
  const r = await fetch(`${BASE}/json/list`);
  return r.json();
}

async function pageWs() {
  const list = await listTargets();
  const page = list.find(t => t.type === 'page' && !/devtools/.test(t.url))
    || list.find(t => t.type === 'page');
  if (!page) throw new Error('没有可用的页面目标');
  return page.webSocketDebuggerUrl;
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    let id = 0;
    ws.onopen = () => resolve({
      ws,
      send(method, params) {
        return new Promise((res, rej) => {
          const mid = ++id;
          pending.set(mid, { res, rej });
          ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
        });
      }
    });
    ws.onerror = e => reject(new Error('WS 连接失败: ' + (e.message || e.type)));
    ws.onmessage = ev => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (_) { return; }
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(JSON.stringify(msg.error)));
        else res(msg.result);
      }
    };
  });
}

async function evaluate(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true
  });
  if (r.exceptionDetails) {
    throw new Error('JS 异常: ' + (r.exceptionDetails.text || '') + ' ' +
      (r.exceptionDetails.exception && r.exceptionDetails.exception.description || ''));
  }
  return r.result && r.result.value;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const [cmd, ...rest] = process.argv.slice(2);
  const cdp = await connect(await pageWs());

  try {
    if (cmd === 'targets') {
      console.log(JSON.stringify((await listTargets()).map(t => ({ t: t.type, title: t.title, url: t.url })), null, 2));
    } else if (cmd === 'nav') {
      const url = rest[0];
      await cdp.send('Page.enable');
      await cdp.send('Page.navigate', { url });
      await sleep(3500);
      console.log('OK ' + (await evaluate(cdp, 'location.href')));
    } else if (cmd === 'text') {
      console.log(await evaluate(cdp, 'document.body.innerText'));
    } else if (cmd === 'eval') {
      console.log(JSON.stringify(await evaluate(cdp, rest.join(' '))));
    } else if (cmd === 'click') {
      const sel = rest[0];
      const out = await evaluate(cdp,
        `(() => { const el = document.querySelector(${JSON.stringify(sel)});
          if (!el) return 'NOT_FOUND';
          el.scrollIntoView({block:'center'}); el.click(); return 'CLICKED'; })()`);
      console.log(out);
    } else if (cmd === 'link') {
      const sub = rest[0];
      console.log(await evaluate(cdp,
        `Array.from(document.querySelectorAll('a')).map(a => a.getAttribute('href')||'')
          .filter(h => h.includes(${JSON.stringify(sub)}))[0] || ''`));
    } else if (cmd === 'shot') {
      const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(rest[0], Buffer.from(r.data, 'base64'));
      console.log('saved ' + rest[0]);
    } else if (cmd === 'set') {
      // set <selector> <text> —— 用原生 setter + input 事件，Vue/React 才认
      const [sel, ...txt] = rest;
      const val = txt.join(' ');
      console.log(await evaluate(cdp, `(() => {
        const el = document.querySelector(${JSON.stringify(sel)});
        if (!el) return 'NOT_FOUND';
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        setter.call(el, ${JSON.stringify(val)});
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return 'SET:' + el.value;
      })()`));
    } else if (cmd === 'file') {
      // file <path> [selector] —— 真正给 <input type=file> 塞文件（CDP 才能做到）
      const filePath = rest[0];
      const sel = rest[1] || 'input[type=file]';
      const r = await cdp.send('Runtime.evaluate', {
        expression: `document.querySelector(${JSON.stringify(sel)})`
      });
      if (!r.result || !r.result.objectId) { console.log('NOT_FOUND'); }
      else {
        await cdp.send('DOM.setFileInputFiles', { files: [filePath], objectId: r.result.objectId });
        console.log('FILE_SET ' + filePath);
      }
    } else if (cmd === 'upload') {
      // upload <path> [selector] —— 用 DataTransfer 造 File 塞进 input（比 setFileInputFiles 稳）
      const p0 = rest[0];
      const sel0 = rest[1] || 'input[type=file]';
      const b64 = fs.readFileSync(p0).toString('base64');
      const mime = /\.png$/i.test(p0) ? 'image/png' : 'image/jpeg';
      const expr = `(async () => {
        const r = await fetch('data:${mime};base64,${b64}');
        const blob = await r.blob();
        const file = new File([blob], 'avatar.${mime === 'image/png' ? 'png' : 'jpg'}', { type: '${mime}' });
        const dt = new DataTransfer();
        dt.items.add(file);
        const el = document.querySelector(${JSON.stringify(sel0)});
        if (!el) return 'NOT_FOUND';
        el.files = dt.files;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return 'UPLOADED:' + el.files.length;
      })()`;
      console.log(await evaluate(cdp, expr));
    } else if (cmd === 'tap') {
      // tap <文本> [第几个] —— 用 Input.dispatchMouseEvent 产生**可信点击**
      // （微信后台会忽略 el.click()，因为 event.isTrusted === false）
      const target = rest[0];
      const nth = Number(rest[1] || 0);
      const box = await evaluate(cdp, `(() => {
        const els = [...document.querySelectorAll('a,button,span,div')]
          .filter(e => e.children.length === 0 && e.textContent.trim() === ${JSON.stringify(target)});
        const el = els[${nth}];
        if (!el) return null;
        el.scrollIntoView({ block: 'center' });
        const b = el.getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2, n: els.length };
      })()`);
      if (!box) {
        console.log('NOT_FOUND');
      } else {
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
        await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
        console.log('TAPPED@' + Math.round(box.x) + ',' + Math.round(box.y) + ' of ' + box.n);
      }
    } else if (cmd === 'find') {
      const t = rest[0];
      console.log(JSON.stringify(await evaluate(cdp,
        `[...document.querySelectorAll('a,button,span,div,li')]
           .filter(e => e.children.length === 0 && e.textContent.trim() === ${JSON.stringify(t)})
           .map(e => ({ tag: e.tagName, cls: e.className, parent: e.parentElement && e.parentElement.tagName }))`), null, 1));
    } else {
      console.log('用法: targets|nav <url>|text|eval <js>|click <sel>|link <substr>|shot <path>');
    }
  } finally {
    try { cdp.ws.close(); } catch (_) {}
  }
})().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
