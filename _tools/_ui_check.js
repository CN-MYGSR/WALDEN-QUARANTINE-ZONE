const http=require('http'),fs=require('fs'),path=require('path'),WS=require('./ws'),{spawn}=require('child_process');
const PORT=9481,URL='http://127.0.0.1:8123/index.html',ROOT=path.resolve(__dirname,'..');
const out=[];const log=s=>out.push(s);const sleep=ms=>new Promise(r=>setTimeout(r,ms));let proc,ws;
function fin(c){try{ws&&ws.close()}catch(e){}try{proc&&proc.kill()}catch(e){}fs.writeFileSync(path.join(ROOT,'_tools','_ui_check.txt'),out.join('\n')+'\n','utf8');process.exit(c);}
(async()=>{
const ud=path.join(require('os').tmpdir(),'uichk_'+Date.now());
proc=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--remote-debugging-port='+PORT,'--user-data-dir='+ud,'--window-size=1280,1400','--disable-gpu','--no-first-run','--no-default-browser-check','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--mute-audio','about:blank'],{stdio:'ignore'});
await sleep(2500);let list=null;
for(let i=0;i<40;i++){try{list=await new Promise((res,rej)=>http.get('http://127.0.0.1:'+PORT+'/json/list',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)))}).on('error',rej));if(list&&list.length)break;}catch(e){await sleep(500);}}
const page=(list||[]).find(t=>t.type==='page');if(!page){log('NO_PAGE');return fin(1);}
ws=new WS(page.webSocketDebuggerUrl,{perMessageDeflate:false,maxPayload:256*1024*1024});let id=0;const pend={};const errs=[];
ws.on('message',m=>{const j=JSON.parse(m);if(j.id&&pend[j.id])pend[j.id](j);if(j.method==='Runtime.exceptionThrown')errs.push('EXC '+((j.params.exceptionDetails.exception||{}).description||'').split('\n')[0]);});
await new Promise(r=>ws.on('open',r));
const rpc=(me,pa)=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method:me,params:pa||{}}))});
await rpc('Page.enable');await rpc('Runtime.enable');
const ev=async e=>{const o=await rpc('Runtime.evaluate',{expression:e,returnByValue:true});if(o.result&&o.result.exceptionDetails)return 'EXC:'+((o.result.exceptionDetails.exception||{}).description||'').split('\n')[0];return o.result&&o.result.result?o.result.result.value:String(o);};
const shot=async n=>{const o=await rpc('Page.captureScreenshot',{format:'png'});if(o.result&&o.result.data)fs.writeFileSync(path.join(ROOT,'outputs',n),Buffer.from(o.result.data,'base64'));};
for(const c of ['0','1']){
 await rpc('Page.navigate',{url:URL});await sleep(6000);
 await ev(`localStorage.setItem('sf_campaign','${c}')`);
 await rpc('Page.navigate',{url:URL});await sleep(7000);
 log('=== campaign '+c+' ===');
 log('loadoutSummary: '+await ev(`el('loadoutSummary')?el('loadoutSummary').innerHTML:'NO_EL'`));
 await ev(`startMatch();el('menu').classList.add('hidden');showDeploy(false);`);
 await sleep(900);
 log('consumSummary : '+await ev(`el('consumSummary')?el('consumSummary').innerHTML:'NO_EL'`));
 log('arsenalSelect : '+await ev(`(function(){const s=el('arsenalSelect');return s?(s.value+' / '+s.options[s.selectedIndex].textContent):'NO_EL';})()`));
 log('arsenalStats  : '+await ev(`el('arsenalStats')?el('arsenalStats').textContent:'NO_EL'`));
 log('cw0           : '+await ev(`el('cw0')?el('cw0').textContent:'NO_EL'`));
 log('保险勾选框文案: '+await ev(`(function(){const s=el('consumSummary');return s?s.textContent.replace(/\\s+/g,' ').slice(0,160):'-';})()`));
 await ev(`el('consumSummary').scrollIntoView({block:'center'})`);
 await sleep(600);
 await shot('scav_deploy_hint_'+c+'.png');
}
log('EXC: '+(errs.length?errs.join(' ;; '):'无'));
fin(0);
})().catch(e=>{log('FATAL '+e.message);fin(1);});
