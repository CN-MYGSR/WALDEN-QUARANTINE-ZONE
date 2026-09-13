// 遗留项验证: ① 港区地形是否仍高于混凝土板  ② 各战役 bot 实际视距
// 用法: node _tools/leftover_probe.js [campaignIdx]
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9436, URL = 'http://127.0.0.1:8123/index.html';
const IDX = parseInt(process.argv[2] || '2', 10);
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PROBE = `(function(){
try{
 const out={};
 out.campaign=CAMPAIGN.id; out.terr=CAMPAIGN.terr; out.weather=WEATHER;
 // ---- ① 地形 vs 混凝土板 ----
 // 找出地图里最高的"水平面"装饰板 (港区/实验室都是 y=0.05 的 PlaneGeometry)
 let slabY=null;
 const root=(typeof world!=='undefined')?world:scene;
 root.traverse(o=>{
   if(!o.isMesh||!o.geometry) return;
   if(o.geometry.type!=='PlaneGeometry') return;
   const bb=new THREE.Box3().setFromObject(o);
   if(bb.max.y-bb.min.y<0.001 && o.position.y<0.5 && o.position.y>=0){
     if(slabY==null||o.position.y<slabY) slabY=o.position.y;
   }
 });
 out.slabY=slabY;
 // 地形高度采样 (整张图)
 const E=Math.round(MAP_SIZE/2)-4;
 let hmin=1e9,hmax=-1e9,above=0,tot=0,worst=null;
 const hist={};
 for(let x=-E;x<=E;x+=2){
   for(let z=-E;z<=E;z+=2){
     const h=heightAt(x,z);
     tot++;
     if(h<hmin) hmin=h;
     if(h>hmax) hmax=h;
     if(slabY!=null&&h>slabY+0.001){
       above++;
       if(!worst||h>worst.h) worst={x:x,z:z,h:+h.toFixed(3)};
       const k=Math.round((h-slabY)*100)/100;
       hist[k]=(hist[k]||0)+1;
     }
   }
 }
 out.hMin=+hmin.toFixed(3); out.hMax=+hmax.toFixed(3);
 out.samples=tot; out.aboveSlab=above; out.abovePct=+(above/tot*100).toFixed(2);
 out.worst=worst; out.overHist=hist;
 // ---- ② bot 视距 ----
 const base=70*EFF_DIFF.visMul;
 out.effDiffVisMul=EFF_DIFF.visMul;
 out.wfxSight=WFX.sight;
 out.viewDBase=+base.toFixed(1);                       // 未含天气
 out.viewDEffective=+(base*WFX.sight).toFixed(1);      // 实际生效
 out.eloT0=+(base*WFX.sight*ELO.enemyVis).toFixed(1);
 ELO.rating=1900; eloRecalc();
 out.eloT1=+(base*WFX.sight*ELO.enemyVis).toFixed(1);
 ELO.rating=400; eloRecalc();
 out.eloTm1=+(base*WFX.sight*ELO.enemyVis).toFixed(1);
 ELO.rating=900; eloRecalc();
 // 地图系数 (43_maps 的 botMul)
 let mapMul=null;
 try{ const m=mapRules().botMul; mapMul=m?{enemyReact:m.enemyReact,enemySpread:m.enemySpread}:null; }catch(e){}
 out.mapBotMul=mapMul;
 return JSON.stringify(out);
}catch(e){ return 'PROBE_ERR:'+e.message+' | '+(e.stack||'').split('\\n')[1]; }
})()`;

(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'lo_' + Date.now());
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
  await ev(`localStorage.setItem('sf_campaign','${IDX}');`);
  await rpc('Page.navigate', { url: URL });
  await sleep(14000);
  const r = await ev(PROBE);
  console.log('=== leftover probe @camp' + IDX + ' ===');
  console.log(typeof r === 'string' && r[0] === '{' ? JSON.stringify(JSON.parse(r), null, 1) : r);
  if (errs.length) console.log('ERRS ' + errs.slice(0, 5).join(' | '));
  ws.close(); proc.kill();
  await sleep(300);
  try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) { }
})();
