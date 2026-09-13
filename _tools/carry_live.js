// 实测高低姿态切换: 通过真实 InputActions 路径验证
const http=require('http'); const WS=require('ws');
(async()=>{
const list=await new Promise(r=>http.get('http://127.0.0.1:9222/json/list',res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>r(JSON.parse(d)))}));
const page=list.find(t=>t.type==='page');
const ws=new WS(page.webSocketDebuggerUrl,{perMessageDeflate:false});
let id=0; const pend={};
ws.on('message',m=>{const j=JSON.parse(m); if(j.id&&pend[j.id])pend[j.id](j);});
await new Promise(r=>ws.on('open',r));
const rpc=(me,pa)=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method:me,params:pa}))});
const ev=async e=>{const o=await rpc('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return o.result&&o.result.result?o.result.result.value:JSON.stringify(o);};
console.log('0 初始:', await ev(`player.carry`));
console.log('1 toggleCarry ->', await ev(`InputActions.toggleCarry(); player.carry`));
console.log('2 carryLow?', await ev(`player.carryLow`));
console.log('3 VM.carryBlend(等1s)=>', await ev(`new Promise(r=>setTimeout(()=>r(VM.carryBlend.toFixed(2)),1000))`));
console.log('4 开镜后:', await ev(`player.ads=true; InputActions.toggleCarry(); player.carry`));
console.log('5 ADS中切低:', await ev(`InputActions.toggleCarry(); player.carry`));
console.log('6 再toggle回高:', await ev(`InputActions.toggleCarry(); player.carry`));
ws.close();process.exit(0);
})();
