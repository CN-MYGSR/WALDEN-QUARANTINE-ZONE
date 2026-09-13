// 手雷端到端: 蓄力投出 → 真实弹道 → 落地 → 引爆 (前几次只验证了初速, 没验证完整链路)
// 用法: node _tools/nade_e2e.js [campaignIdx]
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9448, URL = 'http://127.0.0.1:8123/index.html';
const IDX = parseInt(process.argv[2] || '0', 10);
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PROBE = `(function(){
try{
 const out={};
 // ---- 部署 + 跑完举枪 ----
 AudioSys.init();
 player.team=0; matchOver=false; player.deployed=false; player.alive=false;
 player.kills=0; player.deaths=0; player.score=0;
 BOTS_PER_TEAM=SIZE_OPTS[0].bots; tickets[0]=SIZE_OPTS[0].tk; tickets[1]=SIZE_OPTS[0].tk;
 startMatch(); el('menu').classList.add('hidden'); showDeploy(false);
 selectedSpawn=-1; deployPlayer();
 player.nadeCount=3;
 for(let i=0;i<16;i++){ updatePlayer(0.05); updateViewModel(0.05,player); updateCamera(0.05); }
 out.readyState=VM.state;
 // 站到一片空地上, 朝固定方向, 俯仰归零, 保证弹道可比
 player.pos.x=0; player.pos.z=0; player.pos.y=(typeof heightAt==='function')?heightAt(0,0):0;
 player.vel.x=0; player.vel.z=0; player.vel.y=0;
 player.yaw=0; player.pitch=0.06;
 for(let i=0;i<6;i++){ updatePlayer(0.05); updateViewModel(0.05,player); updateCamera(0.05); }
 // ---- 引爆计数 ----
 let boom=0, boomAt=null;
 const origExplode=window.nadeExplode;
 window.nadeExplode=function(n){ boom++; boomAt={x:n.pos.x,y:n.pos.y,z:n.pos.z,team:n.team,at:!!n.at,smoke:!!n.smokeN}; return origExplode.apply(this,arguments); };

 // ---- 投掷: 满蓄力 ----
 const origin0={x:camera.position.x,y:camera.position.y,z:camera.position.z};
 InputActions.nadeEquip();
 InputActions.nadeChargeStart();
 let chAcc=0; while(chAcc<1.0){ updatePlayer(0.05); updateViewModel(0.05,player); updateCamera(0.05); chAcc+=0.05; }
 out.charge=+player.nadeCharge.toFixed(2);
 InputActions.nadeChargeRelease();
 // 走完投掷动画 → releaseNade 在动画中段触发
 for(let i=0;i<24;i++){ updatePlayer(0.05); updateViewModel(0.05,player); updateCamera(0.05); }
 const ref=nades[nades.length-1];
 out.spawned=!!ref;
 out.countAfterThrow=player.nadeCount;
 out.spawnInfo=ref?{pos:[+ref.pos.x.toFixed(2),+ref.pos.y.toFixed(2),+ref.pos.z.toFixed(2)],
   spd:+ref.vel.length().toFixed(2),fuse:+ref.fuse.toFixed(2)}:null;
 // ---- 手动推进弹道 (只用 updateNades, 避免主循环重复步进) ----
 let t=0, maxY=-1e9, last=null, removedAt=null, landY=null, bounces=0;
 if(ref){
   while(t<8){
     updateNades(0.02); t+=0.02;
     if(nades.indexOf(ref)<0){ removedAt=t; break; }
     if(ref.pos.y>maxY) maxY=ref.pos.y;
     last={x:ref.pos.x,y:ref.pos.y,z:ref.pos.z};
     if(ref.bounces>bounces) bounces=ref.bounces;
   }
   out.trajectory=last?{landX:+last.x.toFixed(2),landY:+last.y.toFixed(2),landZ:+last.z.toFixed(2),
     maxY:+maxY.toFixed(2),bounces:bounces}:null;
   out.removedAt=removedAt?+removedAt.toFixed(2):null;
   out.horizDist=last?+Math.hypot(last.x-origin0.x,last.z-origin0.z).toFixed(2):null;
 }
 out.boomCount=boom; out.boomAt=boomAt;
 out.nadesLeft=nades.length;
 out.countFinal=player.nadeCount;

 // ---- 零蓄力对比 (同一位置/朝向) ----
 const before=nades.length;
 player.pos.x=0; player.pos.z=0; player.vel.x=0; player.vel.z=0;
 for(let i=0;i<6;i++){ updatePlayer(0.05); updateViewModel(0.05,player); updateCamera(0.05); }
 InputActions.nadeEquip();
 InputActions.nadeChargeStart();
 updatePlayer(0.05); updateViewModel(0.05,player); updateCamera(0.05);   // 只蓄 0.05s
 InputActions.nadeChargeRelease();
 for(let i=0;i<24;i++){ updatePlayer(0.05); updateViewModel(0.05,player); updateCamera(0.05); }
 const ref2=nades[nades.length-1];
 let last2=null,t2=0;
 if(ref2){ while(t2<8){ updateNades(0.02); t2+=0.02; if(nades.indexOf(ref2)<0) break; last2={x:ref2.pos.x,z:ref2.pos.z}; } }
 out.lowChargeThrow=last2?{horizDist:+Math.hypot(last2.x-origin0.x,last2.z-origin0.z).toFixed(2)}:null;

 // ---- 投完能否立刻再投 ----
 out.canThrowAgain=(VM.state==='idle'||VM.state==='nade');
 out.nadeIndHidden=document.getElementById('nadeInd').style.display;

 window.nadeExplode=origExplode;
 return JSON.stringify(out);
}catch(e){ return 'PROBE_ERR:'+e.message+' | '+(e.stack||'').split('\\n').slice(0,3).join(' <- '); }
})()`;

(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'ne2e_' + Date.now());
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
  await sleep(13000);
  const r = await ev(PROBE);
  console.log('=== nade e2e @camp' + IDX + ' ===');
  console.log(typeof r === 'string' && r[0] === '{' ? JSON.stringify(JSON.parse(r), null, 1) : r);
  if (errs.length) console.log('ERRS ' + errs.slice(0, 6).join(' | '));
  ws.close(); proc.kill();
  await sleep(300);
  try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) { }
})();
