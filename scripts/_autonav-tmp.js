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
  // 万家灯火：light 后立即进入并点亮（截图用；lampLit 必须先判断，避免被 lamp 子串截胡）
  'else if(q.indexOf("vt=lampLit")>-1){showLampWindow();' +
  'setTimeout(function(){try{document.getElementById("lamp-btn").click();}catch(e){}},120);}' +
  'else if(q.indexOf("vt=lamp")>-1){showLampWindow();}' +
  // 天梯入场：定格在「台阶依次浮现」的中段（截图用）
  'else if(q.indexOf("vt=enter")>-1){' +
  'LADDER_FIRST=true;renderHome();' +
  'setTimeout(function(){try{' +
  'var m=document.getElementById("vine-map");m.classList.add("in");' +
  'var nd=document.querySelectorAll(".level-item.node");' +
  'for(var i=0;i<nd.length;i++){nd[i].style.animationPlayState="paused";nd[i].style.animationDelay=(i<3?"-0.6s":i*0.055+"s");}' +
  'm.style.animationDelay="-1.02s";m.style.animationPlayState="paused";' +
  '}catch(e){}},420);}' +
  // 通关返回：新台阶莲花绽放（定格在爆发中段）
  'else if(q.indexOf("vt=bloom")>-1){' +
  'renderHome();' +
  'var p=getProgress();var max=0;p.completedLevels.forEach(function(n){if(n>max)max=n;});' +
  'var nx=max+1>10?10:max+1;if(p.completedLevels.indexOf(nx)===-1)p.completedLevels.push(nx);' +
  'p.unlockedLevel=nx;saveProgress(p);renderHome();' +
  'setTimeout(function(){try{' +
  'var r=document.querySelector(".node-bloom");if(r){r.style.animationPlayState="paused";r.style.animationDelay="-0.52s";}' +
  'var d=document.querySelector(".node-deco.pop");if(d){d.style.animationPlayState="paused";d.style.animationDelay="-0.5s";}' +
  'var m2=document.getElementById("vine-map");m2.style.animation="none";' +
  'var nd2=document.querySelectorAll(".level-item.node");' +
  'for(var j=0;j<nd2.length;j++){nd2[j].style.animation="none";}' +
  '}catch(e){}},420);}' +
  '}catch(e){document.title="ERR:"+e.message;}},150);})();</' + 'script>';
h = h.replace('</body>', s + '</body>');
fs.writeFileSync('preview/play.html', h);
console.log('multi-scenario injected');
