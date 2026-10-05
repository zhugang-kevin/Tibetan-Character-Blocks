// 临时脚本：往 preview/play.html 注入多场景验证跳屏（截图后删除或重建 play.html 即消失）
const fs = require('fs');
let h = fs.readFileSync('preview/play.html', 'utf8');
h = h.replace(/<script>\/\*__AUTONAV__\*\/[\s\S]*?<\/script>/, '');
const s = '<script>/*__AUTONAV__*/(function(){var q=location.search;' +
  'function closeGuide(){var n=document.getElementById("guide-next");if(n){n.click();n.click();n.click();}}' +
  'setTimeout(function(){try{' +
  'if(q.indexOf("vt=game10")>-1){showScreen("game");startLevel(10);closeGuide();}' +
  'else if(q.indexOf("vt=card")>-1){showScreen("game");startLevel(3);closeGuide();' +
  'setTimeout(function(){try{showCard("letter_03");}catch(e){}},8800);}' +
  'else if(q.indexOf("vt=result")>-1){showScreen("game");startLevel(10);closeGuide();finishLevel();' +
  'setTimeout(function(){try{var b=document.getElementById("bless-name");if(b)b.value="卓玛";generateBlessing();}catch(e){}},200);}' +
  '}catch(e){document.title="ERR:"+e.message;}},150);})();</' + 'script>';
h = h.replace('</body>', s + '</body>');
fs.writeFileSync('preview/play.html', h);
console.log('multi-scenario injected');
