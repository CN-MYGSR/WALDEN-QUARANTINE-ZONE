// 街区提亮 + 战术手电 验证探针
// 1) 亮度: 用浏览器解码「提亮前基准截图」与「提亮后新截图」, 对比平均亮度
// 2) 手电: 改件可装 / 运行时点亮 / 光锥暴露判定 / HUD 指示
// 用法: node _tools/flash_probe.js [campaignIdx]
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9428, URL = 'http://127.0.0.1:8123/index.html';
const IDX = parseInt(process.argv[2] || '0', 10);
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PROBE = `(async function(){
try{
 const out={};
 const W=s=>({ w:window.innerWidth, h:window.innerHeight });
 // ---------- A. 静态配置 ----------
 out.themeName=(typeof CAMPAIGN!=='undefined')?CAMPAIGN.theme:'?';
 out.themeVigA=THEME.vigA;
 out.weather=WEATHER;
 out.wfx={sun:WFX.sun,hemi:WFX.hemi,fogFar:WFX.fogFar,fogNear:WFX.fogNear,skyDark:WFX.skyDark};
 out.vigCss=getComputedStyle(document.documentElement).getPropertyValue('--vigA').trim();
 out.fogFar=+scene.fog.far.toFixed(1); out.fogNear=+scene.fog.near.toFixed(1);
 out.hemiI=null; out.sunI=null;
 scene.traverse(o=>{ if(o.isHemisphereLight&&o.intensity>0.05&&!o.parent.__vm) out.hemiI=+o.intensity.toFixed(3);
   if(o.isDirectionalLight&&o.castShadow) out.sunI=+o.intensity.toFixed(3); });
 // ---------- B. 手电改件 ----------
 out.modExists=!!(typeof ALL_MODS!=='undefined'&&ALL_MODS.light_flash);
 out.modCost=ALL_MODS.light_flash&&ALL_MODS.light_flash.cost;
 out.slotsM4=(typeof getModSlots==='function')?getModSlots('m4').light:null;
 out.slotsP320=(typeof getModSlots==='function')?getModSlots('p320').light:null;
 out.slotNamesUI=(typeof MOD_SLOT_NAMES!=='undefined')?MOD_SLOT_NAMES.light:null;
 out.flashLoaded=typeof FLASH!=='undefined';
 out.spotExists=!!(FLASH&&FLASH.spot);
 out.coneExists=!!(FLASH&&FLASH.cone);
 // 装上并部署 (所有武器都装, 这样玩家拿到什么枪都有手电)
 for(const k of Object.keys(MOD_AVAIL)) setModChoice(k,'light','light_flash');
 out.displayName=modDisplayName('m4');
 out.totalCost=modTotalCost('m4');
 AudioSys.init();
 player.team=0; matchOver=false; player.deployed=false; player.alive=false;
 player.kills=0; player.deaths=0; player.score=0;
 BOTS_PER_TEAM=SIZE_OPTS[0].bots;
 tickets[0]=SIZE_OPTS[0].tk; tickets[1]=SIZE_OPTS[0].tk;
 startMatch();
 el('menu').classList.add('hidden');
 showDeploy(false);
 out.deployStarted=true;
 out.__defer=true;
 return JSON.stringify(out);
}catch(e){ return 'PROBE_ERR:'+e.message+' | '+(e.stack||'').split('\\n')[1]; }
})()`;

const PROBE2 = `(async function(){
try{
 const out={};
 selectedSpawn=-1;
 deployPlayer();
 out.deployed=player.deployed; out.alive=player.alive;
 out.curW=player.curW&&player.curW.key;
 out.slots=(player.slots||[]).map(s=>s&&s.key);
 // 直接用玩家实际手持武器重建视模型, 保证 flashLens 存在
 if(player.curW&&player.curW.key) vmEquip(player.curW.key, player.team);
 out.lensInVM=!!(VM.gunParts&&VM.gunParts.flashLens);
 out.lensColorOff=VM.gunParts&&VM.gunParts.flashLens?VM.gunParts.flashLens.material.color.getHex():null;
 // ---------- C. 运行时点亮 ----------
 FLASH.want=false; updateFlashlight(0.016);
 out.offState={on:FLASH.on,vis:FLASH.spot.visible,i:FLASH.spot.intensity,expose:FLASH.expose};
 flashToggle();                       // want=true
 updateFlashlight(0.016);
 out.onState={want:FLASH.want,on:FLASH.on,hasMod:FLASH.hasMod,vis:FLASH.spot.visible,
   i:+FLASH.spot.intensity.toFixed(1),expose:FLASH.expose,
   lensColorOn:VM.gunParts&&VM.gunParts.flashLens?VM.gunParts.flashLens.material.color.getHex():null,
   spotPos:[+FLASH.spot.position.x.toFixed(2),+FLASH.spot.position.y.toFixed(2),+FLASH.spot.position.z.toFixed(2)],
   camPos:[+camera.position.x.toFixed(2),+camera.position.y.toFixed(2),+camera.position.z.toFixed(2)],
   tgtPos:[+FLASH.spot.target.position.x.toFixed(2),+FLASH.spot.target.position.y.toFixed(2),+FLASH.spot.target.position.z.toFixed(2)],
   coneVis:!!(FLASH.cone&&FLASH.cone.visible)};
 // 暴露判定: 玩家正前方 10m 的敌人 = 被照到; 正后方 10m = 没被照到
 const f=camForward();
 const mkB=(x,z)=>({pos:{x:x,y:FLASH.origin.y,z:z}});
 out.exposeFront=FLASH.botExpose(mkB(FLASH.origin.x+f.x*10, FLASH.origin.z+f.z*10));
 out.exposeBack =FLASH.botExpose(mkB(FLASH.origin.x-f.x*10, FLASH.origin.z-f.z*10));
 out.exposeFar  =FLASH.botExpose(mkB(FLASH.origin.x+f.x*90, FLASH.origin.z+f.z*90));
 out.exposeMul=FLASH.exposeMul;
 // 关灯后不再暴露
 flashToggle(); updateFlashlight(0.016);
 out.afterOff={want:FLASH.want,on:FLASH.on,expose:FLASH.expose,vis:FLASH.spot.visible};
 out.afterOffLens=VM.gunParts&&VM.gunParts.flashLens?VM.gunParts.flashLens.material.color.getHex():null;
 flashToggle(); updateFlashlight(0.016);
 // HUD 指示
 if(typeof updateHUD==='function'){ try{ updateHUD(0.016); }catch(e){ out.hudErr=e.message; } }
 const fi=document.getElementById('flashInd');
 out.hud=fi?{disp:fi.style.display,cls:fi.className,txt:fi.textContent}:'NO_ELEM';
 out.hudState={alive:player.alive,onVeh:!!player.onVehicle,hasMod:FLASH.hasMod,on:FLASH.on};
 // ---------- D. 实测平均亮度 (当前场景) ----------
 out.lum=await new Promise(res=>{
   requestAnimationFrame(()=>{
     try{
       renderer.clear(); renderer.render(scene,camera);
       const gl=renderer.getContext();
       const w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
       const px=new Uint8Array(w*h*4);
       gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,px);
       let s=0,n=0,hist=[0,0,0,0,0];
       for(let i=0;i<px.length;i+=4){
         const y=px[i]*0.299+px[i+1]*0.587+px[i+2]*0.114;
         s+=y; n++; hist[Math.min(4,Math.floor(y/51))]++;
       }
       res({avg:+(s/n).toFixed(1),w:w,h:h,pct:hist.map(v=>+(v/n*100).toFixed(1))});
     }catch(e){ res('LUM_ERR:'+e.message); }
   });
 });
 // ---------- E. 基准图 vs 新图 平均亮度 ----------
 const meanOf=(src)=>new Promise(res=>{
   const im=new Image();
   im.onload=()=>{ try{
     const c=document.createElement('canvas'); c.width=im.width; c.height=im.height;
     const g=c.getContext('2d'); g.drawImage(im,0,0);
     const d=g.getImageData(0,0,c.width,c.height).data;
     let s=0,n=0; for(let i=0;i<d.length;i+=4){ s+=d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114; n++; }
     res(+(s/n).toFixed(1));
   }catch(e){ res('ERR:'+e.message); } };
   im.onerror=()=>res('MISS');
   im.src=src;
 });
 const cmp=[];
 for(const nm of ['street','alley','lane']){
   const b=await meanOf('/outputs/_baseline_dark/elo_tour_c0_'+nm+'.png');
   const a=await meanOf('/outputs/elo_tour_c0_'+nm+'.png');
   cmp.push({shot:nm,before:b,after:a,gain:(typeof a==='number'&&typeof b==='number')?+((a/b-1)*100).toFixed(1):null});
 }
 out.brightCmp=cmp;
 return JSON.stringify(out);
}catch(e){ return 'PROBE_ERR:'+e.message+' | '+(e.stack||'').split('\\n')[1]; }
})()`;

(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'flash_' + Date.now());
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
  const ev = async (e, aw) => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: !!aw }); if (o.result && o.result.exceptionDetails) return 'EVAL_EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : JSON.stringify(o); };
  await rpc('Page.navigate', { url: URL });
  await sleep(4000);
  await ev(`localStorage.setItem('sf_campaign','${IDX}');localStorage.removeItem('sf_mods');`);
  await rpc('Page.navigate', { url: URL });
  await sleep(13000);
  const r1 = await ev(PROBE, true);
  await sleep(3000);
  const r2 = await ev(PROBE2, true);
  console.log('=== flash probe @camp' + IDX + ' ===');
  let A = {}, B = {};
  try { A = JSON.parse(r1); } catch (e) { console.log('PHASE1: ' + r1); }
  try { B = JSON.parse(r2); } catch (e) { console.log('PHASE2: ' + r2); }
  console.log(JSON.stringify(Object.assign(A, B), null, 1));
  if (errs.length) console.log('ERRS ' + errs.slice(0, 6).join(' | '));
  ws.close(); proc.kill();
  await sleep(300);
  try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) { }
})();
