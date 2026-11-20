// 背包输入/指针锁探针: node _tools/bag_probe.js [url]
const http=require('http');
const {spawn}=require('child_process');
const fs=require('fs');
const os=require('os');
const URL_=process.argv[2]||'http://127.0.0.1:8123/index.html';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT=9381;
const profile=os.tmpdir()+'/bag-probe-'+Date.now();
const chrome=spawn(CHROME,['--headless=new','--disable-gpu','--no-sandbox','--disable-dev-shm-usage',
 '--remote-debugging-port='+PORT,'--user-data-dir='+profile,'--window-size=1440,900','--hide-scrollbars',
 '--mute-audio','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','about:blank'],
 {stdio:['ignore','pipe','pipe']});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const getJSON=p=>new Promise((res,rej)=>{http.get({host:'127.0.0.1',port:PORT,path:p},r=>{let b='';r.on('data',c=>b+=c);r.on('end',()=>{try{res(JSON.parse(b))}catch(e){rej(e)}})}).on('error',rej)});
let idc=0;
function rpc(ws,method,params){const id=++idc;return new Promise((res,rej)=>{const on=raw=>{let m;try{m=JSON.parse(raw)}catch(e){return}if(m.id===id){ws.off('message',on);m.error?rej(new Error(JSON.stringify(m.error))):res(m.result)}};ws.on('message',on);ws.send(JSON.stringify({id,method,params:params||{}}));setTimeout(()=>{ws.off('message',on);rej(new Error('rpc timeout '+method))},60000)})}
async function key(ws,code,k){
 await rpc(ws,'Input.dispatchKeyEvent',{type:'keyDown',code:code,key:k||'',windowsVirtualKeyCode:0,nativeVirtualKeyCode:0});
 await rpc(ws,'Input.dispatchKeyEvent',{type:'keyUp',code:code,key:k||''});
 await sleep(180);
}
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
 await rpc(ws,'Page.navigate',{url:URL_});
 await sleep(14000);
 const setup=`(async function(){
  try{
   el('menu').classList.add('hidden'); startMatch(); showDeploy(false); selectedSpawn=-1; deployPlayer();
   await new Promise(r=>setTimeout(r,1000));
   // 放三件可旋转物品进背包, 并确保有网格位置
   RUN.loot={watch:1,chip:1,coffee:2};
   if(typeof renderRaidBag==='function') renderRaidBag();
   await new Promise(r=>setTimeout(r,300));
   keys.KeyW=true; player.ads=true;\n   const before={lock:!!document.pointerLockElement, deployHidden:el('deploy').classList.contains('hidden')};
   if(typeof toggleBagPanel==='function') toggleBagPanel();
   await new Promise(r=>setTimeout(r,500));
   const opened={bagOpen:!!(BAG_UI&&BAG_UI.open), lock:!!document.pointerLockElement,
     panelHidden:el('bagPanel').classList.contains('hidden'), deployHidden:el('deploy').classList.contains('hidden'),
     keysW:!!(window.keys&&keys.KeyW), ads:!!player.ads, sel:BAG_UI.sel};
   window.__bagTest={before:before,opened:opened};
   return window.__bagTest;
  }catch(e){ return {err:String(e&&e.stack||e)} }
 })()`;
 const a=await rpc(ws,'Runtime.evaluate',{expression:setup,awaitPromise:true,returnByValue:true});
 // 背包打开时: W / G / 1 不应生效; ↓ 应换选中项; R 应旋转
 await key(ws,'KeyW','w');
 const afterW=await rpc(ws,'Runtime.evaluate',{expression:'({keysW:!!keys.KeyW,sel:BAG_UI.sel,slot:player.curSlot})',returnByValue:true});
 await key(ws,'Digit1','1');
 const after1=await rpc(ws,'Runtime.evaluate',{expression:'({slot:player.curSlot,sel:BAG_UI.sel})',returnByValue:true});
 await key(ws,'ArrowDown','ArrowDown');
 const afterDown=await rpc(ws,'Runtime.evaluate',{expression:'({sel:BAG_UI.sel})',returnByValue:true});
 const rotBefore=await rpc(ws,'Runtime.evaluate',{expression:'(function(){const k=(typeof bagActKey==="function")?bagActKey():null;const g=document.querySelector(".invGrid[data-gid=bagPack],.invGrid[data-gid=bagChest]");const c=g&&INVGRID?INVGRID.getSelected&&INVGRID.getSelected():null;return {key:k,gridKey:c?c.key:null,layouts:JSON.stringify(RUN.grid)};})()',returnByValue:true});
 await key(ws,'KeyR','r');
 const afterR=await rpc(ws,'Runtime.evaluate',{expression:'JSON.stringify(RUN.grid)',returnByValue:true});
 await key(ws,'KeyG','g');
 const afterG=await rpc(ws,'Runtime.evaluate',{expression:'({loot:JSON.stringify(RUN.loot)})',returnByValue:true});
 await key(ws,'Tab','Tab');
 const closed=await rpc(ws,'Runtime.evaluate',{expression:'({bagOpen:!!BAG_UI.open,deployHidden:document.getElementById("deploy").classList.contains("hidden"),lock:!!document.pointerLockElement})',returnByValue:true});
 console.log(JSON.stringify({open:a.result&&a.result.value,afterW:afterW.result&&afterW.result.value,after1:after1.result&&after1.result.value,
  afterDown:afterDown.result&&afterDown.result.value,rotBefore:rotBefore.result&&rotBefore.result.value,afterR:afterR.result&&afterR.result.value,
  afterG:afterG.result&&afterG.result.value,closed:closed.result&&closed.result.value,exceptions:errors.slice(0,5)},null,1));
 try{chrome.kill()}catch(e){}
 process.exit(0);
})();
