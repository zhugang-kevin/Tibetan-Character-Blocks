// 临时脚本：D33 下落盘面截图/几何核验注入（截图后重建 play.html 即消失）
// 用法：node scripts/_autonav-tmp.js  然后
//   chrome --headless=new --dump-dom "file:///.../play.html?vt=d33geo"
const fs = require('fs');
let h = fs.readFileSync('preview/play.html', 'utf8');
h = h.replace(/<script>\/\*__AUTONAV__\*\/[\s\S]*?<\/script>/, '');

const s = '<script>/*__AUTONAV__*/(function(){' +
  'function closeGuide(){var n=document.getElementById("guide-next");if(n){n.click();n.click();n.click();}hideLampWindow();}' +
  // 找到一对可点的牌（同 id、idle、未被罩住）
  'function findPair(){var t=state.board.cells,map={};' +
  'for(var i=0;i<t.length;i++){if(!t[i]||t[i].state!=="idle"||t[i].frost||t[i].crate>0)continue;' +
  'if(map[t[i].id]===undefined)map[t[i].id]=i;else return [map[t[i].id],i];}return null;}' +
  'function clickUid(u){var e=document.querySelector("#board .tile[data-uid=\\""+u+"\\"]");if(e)e.click();}' +
  // 盘面几何：每张牌的 DOM 尺寸/位移 vs 期望值（jsdom 无布局，只能在真浏览器里验）
  'function geo(){var b=document.getElementById("board");var els=b.querySelectorAll(".tile");' +
  'var bad=0,out=[];var sw=state.stepX,sy=state.stepY;' +
  'for(var i=0;i<state.board.cells.length;i++){var t=state.board.cells[i];if(!t)continue;' +
  'var e=b.querySelector(".tile[data-uid=\\""+t.uid+"\\"]");' +
  'if(!e){bad++;out.push("missing@"+i);continue;}' +
  'var r=e.getBoundingClientRect();var br=b.getBoundingClientRect();' +
  'var expX=br.left+((i%state.cols)*sw/100)*r.width;var expY=br.top+(Math.floor(i/state.cols)*sy/100)*r.height;' +
  'if(Math.abs(r.width-state.tileW)>1.5)bad++;' +
  'if(Math.abs(r.height-state.tileH)>1.5)bad++;' +
  'if(Math.abs(r.left-expX)>2)bad++;' +
  'if(Math.abs(r.top-expY)>2)bad++;}' +
  'return {tiles:els.length,live:state.board.cells.filter(function(x){return !!x;}).length,' +
  'bad:bad,bw:Math.round(b.getBoundingClientRect().width),bh:Math.round(b.getBoundingClientRect().height),' +
  'tileW:state.tileW,tileH:state.tileH,cols:state.cols,rows:state.rows,stepX:Math.round(sw*100)/100,stepY:Math.round(sy*100)/100,' +
  'inner:(function(){var n=0;for(var i=0;i<els.length;i++){var r=els[i].getBoundingClientRect();' +
  'if(r.left<br.left-1||r.right>br.right+1||r.top<br.top-1||r.bottom>br.bottom+1)n++;}return n;})()' +
  '};}' +
  'function probe(o){document.body.setAttribute("data-probe",JSON.stringify(o));}' +
  'setTimeout(function(){try{' +
  // 初始盘面（第 1 关 6×4）
  'if(location.search.indexOf("vt=d33geo")>-1 && location.search.indexOf("vt=g10")===-1){showScreen("game");startLevel(1);closeGuide();' +
  'setTimeout(function(){var g=geo();g.screen="L1-init";probe(g);},1500);}' +
  // 第 10 关（6×8，最大盘面）→ 横向居中 + 48 张牌不错位
  'else if(location.search.indexOf("vt=g10")>-1){showScreen("game");startLevel(10);closeGuide();' +
  'setTimeout(function(){var g=geo();g.screen="L10-init";probe(g);},1500);}' +
  // 消 4 对后（下落 + 补充都发生过）→ 几何仍成立 + 空格透出揭图
  'else if(location.search.indexOf("vt=d33after")>-1){showScreen("game");startLevel(1);closeGuide();' +
  'var k=0;var iv=setInterval(function(){var p=findPair();if(!p||k>=4){clearInterval(iv);}' +
  'else{k++;clickUid(state.board.cells[p[0]].uid);setTimeout(function(){var q=state.board.cells[p[1]];if(q)clickUid(q.uid);},40);}' +
  '},520);' +
  'setTimeout(function(){var g=geo();g.screen="L1-after4";g.matched=state.matchedCount;' +
  'g.poolLeft=(function(){var n=0;for(var kk in state.board.pool)n+=state.board.pool[kk];return n;})();' +
  'g.revealPct=state.revealPct;g.spawned=document.querySelectorAll("#board .tile").length;probe(g);},4200);}' +
  // 下落中途：放慢过渡到 8s，消一对，在 1.2s 处暂停动画 → 定格在「正在下落」
  'else if(location.search.indexOf("vt=d33mid")>-1){showScreen("game");startLevel(1);closeGuide();' +
  'var ss=document.createElement("style");' +
  'ss.textContent="#board .tile{transition:transform 8s linear !important}";' +
  'document.head.appendChild(ss);' +
  'setTimeout(function(){var p=findPair();if(!p)return;' +
  'clickUid(state.board.cells[p[0]].uid);' +
  'setTimeout(function(){var q=state.board.cells[p[1]];if(q)clickUid(q.uid);' +
  'setTimeout(function(){var an=document.getAnimations?document.getAnimations():[];' +
  'for(var i=0;i<an.length;i++){try{an[i].pause();}catch(e){}}' +
  'probe({screen:"L1-midfall",paused:an.length,matched:state.matchedCount});},1500);},60);},300);}' +
  '}catch(e){document.body.setAttribute("data-probe","ERR:"+e.message);}},150);})();</' + 'script>';

h = h.replace('</body>', s + '</body>');
fs.writeFileSync('preview/play.html', h);
console.log('D33 probe injected');
