// 聚焦: updateStrobe 是否真的在跑 + 白屏
const http=require('http'),fs=require('fs'),path=require('path'),WS=require('./ws'),{spawn}=require('child_process');
const URL=process.argv[2],PORT=9901,ROOT=path.resolve(__dirname,'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let proc,ws;const out=[];const log=s=>out.push(s);
function finish(c){try{ws.close();}catch(e){}try{proc.kill();}catch(e){}fs.writeFileSync(path.join(ROOT,'_tools','_strobe2.txt'),out.join('\n')+'\n','utf8');process.exit(c);}
(async()=>{
const ud=path.join(require('os').tmpdir(),'s2_'+Date.now());
proc=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--remote-debugging-port='+PORT,'--user-data-dir='+ud,'--window-size=1280,860','--disable-gpu','--no-first-run','--no-default-browser-check','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--mute-audio','about:blank'],{stdio:'ignore'});
await sleep(2500);
let list=null;
for(let i=0;i<40;i++){try{list=await new Promise((res,rej)=>http.get('http://127.0.0.1:'+PORT+'/json/list',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)))}).on('error',rej));if(list&&list.length)break;}catch(e){await sleep(500);}}
const page=(list||[]).find(t=>t.type==='page');
ws=new WS(page.webSocketDebuggerUrl,{perMessageDeflate:false,maxPayload:256*1024*1024});
let id=0;const pend={};const errs=[];
ws.on('message',m=>{const j=JSON.parse(m);if(j.id&&pend[j.id])pend[j.id](j);
 if(j.method==='Runtime.exceptionThrown'){const s=((j.params.exceptionDetails.exception||{}).description||'').split('\n')[0];if(errs.indexOf(s)<0)errs.push(s);}});
await new Promise(r=>ws.on('open',r));
const rpc=(me,pa)=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method:me,params:pa||{}}));});
await rpc('Page.enable');await rpc('Runtime.enable');
const ev=async e=>{const o=await rpc('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(o.result&&o.result.exceptionDetails)return 'EXC:'+((o.result.exceptionDetails.exception||{}).description||'').split('\n')[0];return o.result&&o.result.result?o.result.result.value:String(o);};

await ev(`(function(){ localStorage.setItem('sf_campaign','3'); localStorage.setItem('sf_autodeploy','0'); return 1; })()`);
await rpc('Page.navigate',{url:URL});
await sleep(16000);
await ev(`(function(){ const b=[...document.querySelectorAll('.navBtn')].find(x=>x.dataset.p==='mPlay'); if(b) b.click(); return 1; })()`);
await sleep(1300);
await ev(`(function(){ const b=document.getElementById('startBtn'); if(b) b.click(); return 1; })()`);
await sleep(7000);
await ev(`(function(){ const b=document.getElementById('deployBtn'); if(b) b.click(); return 1; })()`);
await sleep(3000);

log('=== 直接调 strobeApply ===');
log('  ' + await ev(`(function(){try{
  var foe=soldiers.filter(function(s){return s.team!==player.team&&s.alive;}).slice(0,2);
  var f=camForward();
  foe.forEach(function(s,i){ s.pos.set(camera.position.x+f.x*(3+i*1.2), player.pos.y, camera.position.z+f.z*(3+i*1.2)); s.stunT=0; });
  var before=foe.map(function(s){return s.stunT;}).join(',');
  strobeApply();
  var after=foe.map(function(s){return s.stunT.toFixed(1);}).join(',');
  return '调用前 stunT=['+before+'] → 调用后 ['+after+']';
}catch(e){return 'EXC '+e.message;}})()`));

log('=== 爆闪命中诊断 ===');
log('  ' + await ev(`(function(){try{
  var foe=soldiers.filter(function(s){return s.team!==player.team&&s.alive;}).slice(0,3);
  var f=camForward();
  var out=[];
  foe.forEach(function(s,i){
    var d=3+i*1.2;
    s.pos.set(camera.position.x+f.x*d, player.pos.y, camera.position.z+f.z*d);
    s.stunT=0;
    var dx=s.pos.x-camera.position.x, dy=(s.pos.y+1.4)-camera.position.y, dz=s.pos.z-camera.position.z;
    var dd=Math.hypot(dx,dy,dz);
    var dot=(dx*f.x+dy*f.y+dz*f.z)/dd;
    var los='?';
    try{ var w=raycastWorld(camera.position, V3(dx/dd,dy/dd,dz/dd), dd); los=(w&&w.dist<dd-0.6)?('被挡@'+w.dist.toFixed(1)):'通'; }catch(e){ los='EXC'; }
    out.push('#'+i+' 距'+dd.toFixed(1)+'m dot='+dot.toFixed(3)+' 视线='+los);
  });
  window.__foe=foe;
  return out.join(' | ')+'  (cos阈值='+STROBE.cos.toFixed(3)+' 射程='+STROBE.range+'m)';
}catch(e){return 'EXC '+e.message;}})()`));

log('=== 爆闪效果 ===');
log('  ' + await ev(`(function(){try{ var foe=soldiers.filter(function(s){return s.team!==player.team&&s.alive;}).slice(0,3); var f=camForward(); foe.forEach(function(s,i){ s.pos.set(player.pos.x+f.x*8+i*1.5, player.pos.y, player.pos.z+f.z*8+i*1.5); s.stunT=0; }); window.__foe=foe; return '放置 '+foe.length+' 名敌人到正前方 8m'; }catch(e){return 'EXC '+e.message;}})()`));
log('  装爆闪 = ' + await ev(`(function(){try{ STROBE.cd=0; var k=player.curW.key; setModChoice(k,'light','light_strobe'); return getModChoice(k,'light'); }catch(e){return 'EXC '+e.message;}})()`));
log('  按 G = ' + await ev(`(function(){try{ return flashToggle()?'已触发':'未触发'; }catch(e){return 'EXC '+e.message;}})()`));
await sleep(150);
log('  STROBE.t=' + await ev(`STROBE.t.toFixed(2)`) + ' · 敌人 stunT=' + await ev(`window.__foe.map(function(s){return s.stunT.toFixed(1);}).join(',')`));
log('  白屏 opacity=' + await ev(`JSON.stringify(document.getElementById('strobeOv').style.opacity)`));
log('  FLASH.want (应 false) = ' + await ev(`String(FLASH.want)`));
log('  眩晕中能否移动 = ' + await ev(`(function(){try{ var s=window.__foe[0]; var x0=s.pos.x,z0=s.pos.z; s.update(0.1); return '位移 '+Math.hypot(s.pos.x-x0,s.pos.z-z0).toFixed(3); }catch(e){return 'EXC '+e.message;}})()`));
await sleep(2500);
log('  2.5 秒后敌人 stunT = ' + await ev(`window.__foe.map(function(s){return s.stunT.toFixed(1);}).join(',')`));
log('  冷却中再按 G = ' + await ev(`(function(){try{ return flashToggle()?'❌ 不该触发':'✅ 正确拒绝'; }catch(e){return 'EXC';}})()`));

log('=== updateStrobe 状态 ===');
log('  typeof updateStrobe = ' + await ev(`typeof updateStrobe`));
log('  typeof STROBE       = ' + await ev(`typeof STROBE`));
log('  #strobeOv 存在       = ' + await ev(`!!document.getElementById('strobeOv')`));
log('  opacity 初值         = ' + await ev(`JSON.stringify(document.getElementById('strobeOv').style.opacity)`));
log('  手动调一次 updateStrobe = ' + await ev(`(function(){ try{ updateStrobe(0.016); return 'ok · opacity='+JSON.stringify(document.getElementById('strobeOv').style.opacity); }catch(e){ return 'EXC '+e.message; } })()`));
log('  每帧调用计数 (包一层) = ' + await ev(`(function(){ try{ window.__sc=0; const o=window.updateStrobe; window.updateStrobe=function(d){ window.__sc++; return o(d); }; return '已包装 · typeof='+typeof window.updateStrobe; }catch(e){ return 'EXC '+e.message; } })()`));
  await sleep(2000);
  log('  2 秒内被调用次数     = ' + await ev(`window.__sc`));
  log('  loop 里 updateFlashlight 是否也跑 = ' + await ev(`(function(){ try{ window.__fc=0; const o=window.updateFlashlight; window.updateFlashlight=function(d){ window.__fc++; return o(d); }; return 'ok'; }catch(e){ return 'EXC '+e.message; } })()`));
  await sleep(1500);
  log('  updateFlashlight 1.5 秒内次数 = ' + await ev(`window.__fc`));
  log('  requestAnimationFrame 是否被节流 = ' + await ev(`(function(){ window.__raf=0; (function tick(){ window.__raf++; requestAnimationFrame(tick); })(); return 'ok'; })()`));
  await sleep(1500);
  log('  rAF 1.5 秒内次数 = ' + await ev(`window.__raf`));

log('  装爆闪 + 触发        = ' + await ev(`(function(){
  try{
    var k=player.curW.key; setModChoice(k,'light','light_strobe');
    var r=flashToggle();
    return 'flashToggle='+r+' · STROBE.t='+STROBE.t.toFixed(2)+' · blindT='+STROBE.blindT.toFixed(2);
  }catch(e){ return 'EXC '+e.message; }
})()`));
await sleep(200);
log('  200ms 后 opacity     = ' + await ev(`JSON.stringify(document.getElementById('strobeOv').style.opacity)`));
log('  帧是否在跑 (nowT)    = ' + await ev(`(function(){ var a=nowT; return a>0; })()`));
log('  冷却中再按 G         = ' + await ev(`(function(){try{ return flashToggle()?'❌ 不该触发':'✅ 正确拒绝'; }catch(e){return 'EXC';} })()`));
log('\n=== 异常 ===');
log(errs.length?errs.join('\n'):'无');
finish(0);
})();
