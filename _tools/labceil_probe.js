// 实验室天花板覆盖探针: 确认整个设施内部都有顶板, 且没有多层共面(会 z-fighting)
// 用法: node _tools/labceil_probe.js
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9430, URL = 'http://127.0.0.1:8123/index.html';
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PROBE = `(function(){
try{
 const out={};
 out.campaign=(typeof CAMPAIGN!=='undefined')?CAMPAIGN.id:'?';
 out.LAB_H=(typeof LAB_H!=='undefined')?LAB_H:null;
 out.LAB_EDGE=(typeof LAB_EDGE!=='undefined')?LAB_EDGE:null;
 const CEIL_Y=(typeof LAB_H!=='undefined')?LAB_H+0.16:4.76;
 // 收集所有"顶板高度"的盒子 (按 y 判定, 不依赖名字)
 const slabs=[];
 const root=(typeof world!=='undefined')?world:scene;
 root.traverse(o=>{
   if(!o.isMesh||!o.geometry||!o.geometry.parameters) return;
   const g=o.geometry.parameters;
   if(g.height==null||Math.abs(o.position.y-CEIL_Y)>0.02) return;
   // 世界包围盒
   o.updateWorldMatrix(true,false);
   const bb=new THREE.Box3().setFromObject(o);
   slabs.push({y:+o.position.y.toFixed(3),h:+g.height.toFixed(3),
     w:+(g.width||0).toFixed(1),d:+(g.depth||0).toFixed(1),
     x0:+bb.min.x.toFixed(1),x1:+bb.max.x.toFixed(1),
     z0:+bb.min.z.toFixed(1),z1:+bb.max.z.toFixed(1)});
 });
 out.slabCount=slabs.length;
 out.slabs=slabs.slice(0,12);
 out.slabArea=+slabs.reduce((a,s)=>a+(s.x1-s.x0)*(s.z1-s.z0),0).toFixed(0);
 // 覆盖采样: 设施内部 [-LAB_EDGE, LAB_EDGE], 步长 4m
 const E=out.LAB_EDGE||86;
 let tot=0, cov=0, gaps=[];
 for(let x=-E;x<=E;x+=4){
   for(let z=-E;z<=E;z+=4){
     tot++;
     const hit=slabs.some(s=>x>=s.x0-0.01&&x<=s.x1+0.01&&z>=s.z0-0.01&&z<=s.z1+0.01);
     if(hit) cov++; else if(gaps.length<24) gaps.push([x,z]);
   }
 }
 out.samples=tot; out.covered=cov; out.coveragePct=+(cov/tot*100).toFixed(1);
 out.gapSamples=gaps;
 // 共面层数: 同一 (x,z) 上落了几块板
 let maxLayers=0, layerHist={};
 for(let x=-E;x<=E;x+=8){
   for(let z=-E;z<=E;z+=8){
     const n=slabs.filter(s=>x>=s.x0-0.01&&x<=s.x1+0.01&&z>=s.z0-0.01&&z<=s.z1+0.01).length;
     layerHist[n]=(layerHist[n]||0)+1;
     if(n>maxLayers) maxLayers=n;
   }
 }
 out.maxLayers=maxLayers; out.layerHist=layerHist;
 // 玩家抬头是否有天花板: 从若干实际点位向上打射线(仅世界几何)
 out.upHits=(function(){
   const pts=[[0,0],[40,0],[0,40],[-40,0],[0,-40],[60,60],[-60,-60],[60,-60],[-60,60],[74,0]];
   const ray=new THREE.Raycaster(); ray.far=12;
   const res=[];
   for(const [x,z] of pts){
     ray.set(new THREE.Vector3(x,1.6,z), new THREE.Vector3(0,1,0));
     const hits=ray.intersectObject(root,true).filter(h=>h.object.visible);
     res.push({x:x,z:z,hit:hits.length>0,top:hits.length?+hits[0].point.y.toFixed(2):null});
   }
   return res;
 })();
 out.upAllHit=out.upHits.every(r=>r.hit);
 return JSON.stringify(out);
}catch(e){ return 'PROBE_ERR:'+e.message+' | '+(e.stack||'').split('\\n')[1]; }
})()`;

(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'labc_' + Date.now());
  const proc = spawn(ch, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud,
    '--window-size=1280,720', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  await sleep(2500);
  let list = null;
  for (let i = 0; i < 40; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list && list.length) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page'); if (!page) { console.log('NO_PAGE'); proc.kill(); process.exit(1); }
  const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); if (j.method === 'Runtime.exceptionThrown') errs.push('EXC ' + ((j.params.exceptionDetails.exception || {}).description || '').split('\n')[0]); });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable');
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true }); if (o.result && o.result.exceptionDetails) return 'EVAL_EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : JSON.stringify(o); };
  await rpc('Page.navigate', { url: URL });
  await sleep(4000);
  await ev(`localStorage.setItem('sf_campaign','1');`);
  await rpc('Page.navigate', { url: URL });
  await sleep(14000);
  const r = await ev(PROBE);
  console.log('=== lab ceiling probe ===');
  console.log(typeof r === 'string' && r[0] === '{' ? JSON.stringify(JSON.parse(r), null, 1) : r);
  if (errs.length) console.log('ERRS ' + errs.slice(0, 5).join(' | '));
  ws.close(); proc.kill();
  await sleep(300);
  try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) { }
})();
