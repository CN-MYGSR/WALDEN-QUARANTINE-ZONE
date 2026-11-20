const http=require('http'),path=require('path'),fs=require('fs'),WS=require('./ws'),{spawn}=require('child_process');
const URL=process.argv[2],PORT=9831;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let proc,ws;
(async()=>{
const ud=path.join(require('os').tmpdir(),'fe_'+Date.now());
proc=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--remote-debugging-port='+PORT,'--user-data-dir='+ud,'--window-size=1280,760','--disable-gpu','--no-first-run','--no-default-browser-check','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--mute-audio','about:blank'],{stdio:'ignore'});
await sleep(2500);
let list=null;
for(let i=0;i<40;i++){try{list=await new Promise((res,rej)=>http.get('http://127.0.0.1:'+PORT+'/json/list',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)))}).on('error',rej));if(list&&list.length)break;}catch(e){await sleep(500);}}
const page=(list||[]).find(t=>t.type==='page');
ws=new WS(page.webSocketDebuggerUrl,{perMessageDeflate:false,maxPayload:256*1024*1024});
let id=0;const pend={};const logs=[];
ws.on('message',m=>{const j=JSON.parse(m);if(j.id&&pend[j.id])pend[j.id](j);
 if(j.method==='Runtime.exceptionThrown'){const d=j.params.exceptionDetails;logs.push('EXC: '+(d.text||'')+' @ '+(d.url||'?').split('/').pop()+':'+d.lineNumber+'  '+((d.exception||{}).description||'').split('\n').slice(0,3).join(' | '));}
 if(j.method==='Runtime.consoleAPICalled'&&(j.params.type==='error'||j.params.type==='warning')){logs.push(j.params.type+': '+(j.params.args||[]).map(a=>a.value||a.description||'').join(' ').slice(0,200));}
});
await new Promise(r=>ws.on('open',r));
const rpc=(me,pa)=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method:me,params:pa||{}}));});
await rpc('Page.enable');await rpc('Runtime.enable');
await rpc('Page.navigate',{url:URL});
await sleep(18000);
const o=await rpc('Runtime.evaluate',{expression:"'scene='+(typeof scene)+' player='+(typeof player)+' HELMET_DEFS='+(typeof HELMET_DEFS)",returnByValue:true});
console.log('状态: '+(o.result&&o.result.result?o.result.result.value:'?'));
console.log('--- 前 12 条日志 ---');
console.log(logs.slice(0,40).join('\n'));
try{ws.close();}catch(e){} try{proc.kill();}catch(e){}
process.exit(0);
})();
