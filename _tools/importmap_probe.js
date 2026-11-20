// Import Maps 验收: 检查裸模块名是否解析到本地 vendor ESM
const http=require('http');
const {spawn}=require('child_process');
const os=require('os');
const WS=require('./ws');
const URL_=process.argv[2]||'http://127.0.0.1:8144/index.html';
const PORT=9391;
const profile=os.tmpdir()+'/imap-'+Date.now();
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-sandbox',
 '--remote-debugging-port='+PORT,'--user-data-dir='+profile,'--window-size=1280,760','--enable-unsafe-swiftshader',
 '--use-gl=angle','--use-angle=swiftshader','about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const getJSON=p=>new Promise((res,rej)=>{http.get({host:'127.0.0.1',port:PORT,path:p},r=>{let b='';r.on('data',c=>b+=c);r.on('end',()=>{try{res(JSON.parse(b))}catch(e){rej(e)}})}).on('error',rej)});
let id=0;
function rpc(ws,method,params){const i=++id;return new Promise((res,rej)=>{const on=m=>{let j;try{j=JSON.parse(m)}catch(e){return}if(j.id===i){ws.off('message',on);j.error?rej(new Error(JSON.stringify(j.error))):res(j.result)}};ws.on('message',on);ws.send(JSON.stringify({id:i,method,params:params||{}}));setTimeout(()=>{ws.off('message',on);rej(new Error('timeout '+method))},30000)})}
(async()=>{
 let page;
 for(let i=0;i<50;i++){try{const l=await getJSON('/json/list');if(l&&l.length){page=l.find(t=>t.type==='page')||l[0];break}}catch(e){}await sleep(300)}
 if(!page){console.log('NO_PAGE');process.exit(1)}
 const ws=new WS(page.webSocketDebuggerUrl);
 await new Promise(r=>ws.on('open',r));
 await rpc(ws,'Runtime.enable'); await rpc(ws,'Page.enable');
 await rpc(ws,'Page.navigate',{url:URL_});
 await sleep(12000);
 const r=await rpc(ws,'Runtime.evaluate',{expression:`(async()=>{
   try{
     const three=await import('three');
     const cannon=await import('cannon-es');
     return {three:three.REVISION, cannon:typeof cannon.World, map:(document.querySelector('script[type=importmap]')||{}).textContent?'present':'missing'};
   }catch(e){ return {err:String(e&&e.message||e)}; }
 })()`,awaitPromise:true,returnByValue:true});
 console.log(JSON.stringify(r&&r.result?r.result.value:r,null,1));
 try{chrome.kill()}catch(e){}
 process.exit(0);
})();
