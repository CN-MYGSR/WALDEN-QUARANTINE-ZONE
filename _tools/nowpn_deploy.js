// 极端用例: 卖光所有武器后仍能正常部署(不应静默失败)
const http=require('http'),fs=require('fs'),path=require('path'),WS=require('ws'),{spawn}=require('child_process');
const PORT=9355;
function findChrome(){for(const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe']){try{if(fs.existsSync(c))return c;}catch(e){}}return null;}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
const ch=findChrome(); if(!ch){console.log('NO_CHROME');process.exit(1);}
const ud=path.join(require('os').tmpdir(),'nowpn_'+Date.now());
const proc=spawn(ch,['--headless=new','--remote-debugging-port='+PORT,'--user-data-dir='+ud,'--window-size=1280,720','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions',process.argv[2]||'http://127.0.0.1:8123/index.html'],{stdio:'ignore'});
await sleep(3500);
let list=null;
for(let i=0;i<25;i++){try{list=await new Promise((res,rej)=>http.get('http://127.0.0.1:'+PORT+'/json/list',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)))}).on('error',rej));if(list)break;}catch(e){await sleep(500);}}
const page=(list||[]).find(t=>t.type==='page'); if(!page){console.log('NO_PAGE');proc.kill();process.exit(1);}
const ws=new WS(page.webSocketDebuggerUrl,{perMessageDeflate:false});
let id=0;const pend={};ws.on('message',m=>{const j=JSON.parse(m);if(j.id&&pend[j.id])pend[j.id](j);});
await new Promise(r=>ws.on('open',r));
const rpc=(me,pa)=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method:me,params:pa}));});
await rpc('Page.enable',{}); await rpc('Runtime.enable',{});
const ev=async e=>{const o=await rpc('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return o.result&&o.result.result?o.result.result.value:JSON.stringify(o);};
await sleep(9000);
// 卖光所有武器 + 清空装备栏, 模拟破产玩家
console.log('清空武器:', await ev(`(function(){ try{
  for(const k of Object.keys(META.owned)){ if(WPN_DEFS[k]) delete META.owned[k]; }
  META.loadout.primary=''; META.loadout.secondary='';
  saveMeta(); return 'weapons='+ownedWeaponList().length; }catch(e){return 'ERR:'+e.message;} })()`));
await ev(`startMatch(); el('menu').classList.add('hidden'); showDeploy(false);`);
await sleep(2500);
console.log('部署:', await ev(`(function(){ try{ selectedSpawn=-1; deployPlayer();
  return 'deployed='+player.deployed+' alive='+player.alive+' curW='+(player.curW&&player.curW.key)+' slots='+player.slots.length; }
  catch(e){ return 'ERR:'+e.message; } })()`));
await sleep(1500);
console.log('武器数/装备栏:', await ev(`ownedWeaponList().length+' / '+META.loadout.primary`));
ws.close();proc.kill();await sleep(300);process.exit(0);
})();
