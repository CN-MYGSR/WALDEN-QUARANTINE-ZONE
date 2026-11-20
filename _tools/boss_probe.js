// BOSS 刷怪/敌对关系探针: 用法 node _tools/boss_probe.js <mapIndex> [url]
// mapIndex: 0 街区 / 1 实验室 / 2 港口 / 3 机场
const http=require('http');
const {spawn}=require('child_process');
const fs=require('fs');
const os=require('os');
const IDX=process.argv[2]||'0';
const STORY=process.argv[4]==='story';
const URL_=process.argv[3]||'http://127.0.0.1:8123/index.html';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT=9361+ (parseInt(IDX,10)||0);
const profile=os.tmpdir()+'/boss-probe-'+Date.now();
const chrome=spawn(CHROME,['--headless=new','--disable-gpu','--no-sandbox','--disable-dev-shm-usage',
 '--remote-debugging-port='+PORT,'--user-data-dir='+profile,'--window-size=1440,900','--hide-scrollbars',
 '--mute-audio','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','about:blank'],
 {stdio:['ignore','pipe','pipe']});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const getJSON=p=>new Promise((res,rej)=>{http.get({host:'127.0.0.1',port:PORT,path:p},r=>{let b='';r.on('data',c=>b+=c);r.on('end',()=>{try{res(JSON.parse(b))}catch(e){rej(e)}})}).on('error',rej)});
let idc=0;
function rpc(ws,method,params){const id=++idc;return new Promise((res,rej)=>{const on=raw=>{let m;try{m=JSON.parse(raw)}catch(e){return}if(m.id===id){ws.off('message',on);m.error?rej(new Error(JSON.stringify(m.error))):res(m.result)}};ws.on('message',on);ws.send(JSON.stringify({id,method,params:params||{}}));setTimeout(()=>{ws.off('message',on);rej(new Error('rpc timeout '+method))},60000)})}
(async()=>{
 let page;
 for(let i=0;i<70;i++){try{const l=await getJSON('/json/list');if(l&&l.length){page=l.find(t=>t.type==='page')||l[0];break}}catch(e){}await sleep(400)}
 if(!page){console.log(JSON.stringify({fatal:'cdp not ready'}));process.exit(1)}
 const WebSocket=require('./ws');
 const ws=new WebSocket(page.webSocketDebuggerUrl,{perMessageDeflate:false});
 await new Promise((r,j)=>{ws.on('open',r);ws.on('error',j)});
 const errors=[];
 ws.on('message',raw=>{let m;try{m=JSON.parse(raw)}catch(e){return}if(m.method==='Runtime.exceptionThrown')errors.push('EXC '+((m.params.exceptionDetails.exception||{}).description||'').split('\n')[0])});
 await rpc(ws,'Runtime.enable'); await rpc(ws,'Page.enable');
 await rpc(ws,'Page.addScriptToEvaluateOnNewDocument',{source:`try{localStorage.setItem('sf_campaign','${IDX}');`+(STORY?`localStorage.setItem('sf_story','1');`:``)+`}catch(e){}`});
 await rpc(ws,'Page.navigate',{url:URL_});
 await sleep(14000);
 const expr=`(async function(){
  try{
   el('menu').classList.add('hidden'); startMatch(); showDeploy(false); selectedSpawn=-1; deployPlayer();
   await new Promise(r=>setTimeout(r,1200));
   const b=(typeof BOSS!=='undefined')?BOSS:null;
   if(!b) return {map:CAMPAIGN.id,boss:false};
   const foes=soldiers.filter(s=>s!==b&&s.team===b.team);
   const foe=foes[0]||null;
   const res={map:CAMPAIGN.id,boss:true,name:b.name,team:b.team,playerTeam:player.team,
     hp:+b.hp.toFixed(0),alive:b.alive,weapon:b.customWeapon||b.wpnKey,unitId:b.unitId,squadGroup:b.squadGroup,
     scale:+(b.mesh&&b.mesh.root?b.mesh.root.scale.x:0).toFixed(2),
     pos:[+b.pos.x.toFixed(1),+b.pos.z.toFixed(1)],
     hostileFoeToBoss:foe?(typeof isHostileUnit==='function'?isHostileUnit(foe,b):null):null,
     hostileBossToFoe:foe?(typeof isHostileUnit==='function'?isHostileUnit(b,foe):null):null,
     unitBlocksFoe:foe&&typeof unitBlocks==='function'?unitBlocks(foe,b):null,
     hudHp:!!document.querySelector('[id*="boss" i][id*="hp" i],.bossHp,.boss-hp,.bossBar,.bossBarWrap'),
     bossHpText:(document.body.innerText.match(/BOSS[^\\n]{0,10}HP/gi)||[]).length};
   // 强制对脸: 把一名同队守备挪到 BOSS 前方 12m, 看它会不会把 BOSS 当目标
   if(foe){
    const ang=rand(0,TAU);
    foe.pos.set(b.pos.x+Math.sin(ang)*12,0,b.pos.z+Math.cos(ang)*12);
    foe.pos.y=standHeight(foe.pos.x,foe.pos.z,10);
    foe.yaw=Math.atan2(b.pos.x-foe.pos.x,b.pos.z-foe.pos.z);
    foe.lastSeenT=-99; foe.target=null; foe.decisionT=0; foe.perceptT=0;
    await new Promise(r=>setTimeout(r,1800));
    res.foeTargetsBoss=foe.target===b;
    res.foeHasTarget=!!foe.target;
    res.bossHpAfter=+b.hp.toFixed(0);
   }
   return res;
  }catch(e){ return {err:String(e&&e.stack||e)} }
 })()`;
 const a=await rpc(ws,'Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true});
 const s=await rpc(ws,'Page.captureScreenshot',{format:'png'});
 fs.writeFileSync('_boss_'+IDX+'.png',Buffer.from(s.data,'base64'));
 console.log(JSON.stringify({result:a.result&&a.result.value,exceptions:errors.slice(0,5)},null,1));
 try{chrome.kill()}catch(e){}
 process.exit(0);
})();
