// 手雷机制验证: 3 拿出 / 右键蓄力 / 越久越远 / 引信不再烹饪 / 手电移到 G
// 用法: node _tools/nade_probe.js [campaignIdx]
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9444, URL = 'http://127.0.0.1:8123/index.html';
const IDX = parseInt(process.argv[2] || '0', 10);
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PROBE = `(function(){
try{
 const out={};
 // ---- A. 接口与键位 ----
 out.hasEquip=typeof InputActions.nadeEquip==='function';
 out.hasHolster=typeof InputActions.nadeHolster==='function';
 out.hasChargeStart=typeof InputActions.nadeChargeStart==='function';
 out.hasChargeRelease=typeof InputActions.nadeChargeRelease==='function';
 out.oldApiGone=(typeof InputActions.nadeStart==='undefined')&&(typeof InputActions.nadeRelease==='undefined');
 out.chargeTime=NADE_CHARGE_TIME;
 out.nadeIndExists=!!document.getElementById('nadeInd');
 out.flashDescHasG=(typeof ALL_MODS!=='undefined')&&/按 G/.test(ALL_MODS.light_flash.desc);
 // ---- B. 部署 ----
 AudioSys.init();
 player.team=0; matchOver=false; player.deployed=false; player.alive=false;
 player.kills=0; player.deaths=0; player.score=0;
 BOTS_PER_TEAM=SIZE_OPTS[0].bots; tickets[0]=SIZE_OPTS[0].tk; tickets[1]=SIZE_OPTS[0].tk;
 startMatch(); el('menu').classList.add('hidden'); showDeploy(false);
 out.__defer=true;
 return JSON.stringify(out);
}catch(e){ return 'PROBE_ERR:'+e.message+' | '+(e.stack||'').split('\\n')[1]; }
})()`;

const PROBE2 = `(function(){
try{
 const out={};
 selectedSpawn=-1; deployPlayer();
 player.nadeCount=3;
 // 先跑完举枪动画(draw 0.45s), 否则 VM.state!=='idle' 无法拿出手雷
 for(let i=0;i<16;i++){ updatePlayer(0.05); updateViewModel(0.05, player); }
 out.vmStateReady=VM.state;

 // 截获投掷: 记录实际初速
 const origThrow=window.throwNade;
 const thrown=[];
 window.throwNade=function(thrower,origin,vel,fuse,at,smoke){ thrown.push({vx:+vel.x.toFixed(2),vy:+vel.y.toFixed(2),vz:+vel.z.toFixed(2),spd:+vel.length().toFixed(2),fuse:fuse,at:!!at,smoke:!!smoke}); return origThrow.apply(this,arguments); };
 out.thrown=thrown;

 // ---- C. 3 拿出 ----
 InputActions.nadeEquip();
 out.afterEquip={state:VM.state, held:player.nadeHeld, count:player.nadeCount, charge:player.nadeCharge};
 // ---- D. 右键蓄力: 逐帧推进 ----
 InputActions.nadeChargeStart();
 const samples=[];
 let t=0;
 for(let i=0;i<20;i++){ updatePlayer(0.05); updateViewModel(0.05, player); t+=0.05; if(i%4===0) samples.push({t:+t.toFixed(2),c:+player.nadeCharge.toFixed(3),fuse:+player.nadeFuse.toFixed(2)}); }
 out.chargeRamp=samples;
 out.chargeFullAt=+player.nadeCharge.toFixed(3);
 out.fuseWhileHeld=+player.nadeFuse.toFixed(2);   // 应仍为 3.8 (不再烹饪)
 // ---- E. 满蓄力投出 ----
 InputActions.nadeChargeRelease();
 out.afterRelease={held:player.nadeHeld, charging:player.nadeCharging, state:VM.state};
 // 走完投掷动画 (stateDur 0.55) → releaseNade 在动画中段触发
 for(let i=0;i<24;i++){ updatePlayer(0.05); updateViewModel(0.05, player); }
 out.fullThrow=thrown[thrown.length-1]||null;
 out.countAfterFull=player.nadeCount;

 // ---- F. 零蓄力投出 ----
 InputActions.nadeEquip();
 InputActions.nadeChargeStart();
 updatePlayer(0.05);   // 只蓄 0.05s
 InputActions.nadeChargeRelease();
 for(let i=0;i<24;i++){ updatePlayer(0.05); updateViewModel(0.05, player); }
 out.zeroThrow=thrown[thrown.length-1]||null;
 out.countAfterZero=player.nadeCount;

 // ---- G. 再按 3 收起 ----
 InputActions.nadeEquip();                       // 拿出
 const eq1=VM.state;
 InputActions.nadeEquip();                       // 再按 → 收起
 out.holster={firstPress:eq1, secondPress:VM.state, held:player.nadeHeld};

 // ---- H. 蓄力中途被收起 / 上车等路径 ----
 InputActions.nadeEquip(); InputActions.nadeChargeStart();
 updatePlayer(0.1);
 InputActions.nadeHolster();
 out.afterHolster={state:VM.state, charging:player.nadeCharging, charge:player.nadeCharge};

 // ---- I. HUD 指示 ----
 InputActions.nadeEquip(); InputActions.nadeChargeStart(); updatePlayer(0.4);
 updateHUD(0.016);
 const ni=document.getElementById('nadeInd');
 out.hud={disp:ni.style.display, cls:ni.className,
   txt:document.getElementById('nadeIndTxt').textContent,
   bar:document.getElementById('nadeIndBar').style.width};
 InputActions.nadeHolster();
 updateHUD(0.016);
 out.hudOff=document.getElementById('nadeInd').style.display;

 // ---- J. 手电: G 键 ----
 setModChoice(player.curW?player.curW.key:'m1911','light','light_flash');
 if(player.curW) vmEquip(player.curW.key, player.team);
 FLASH.want=false; updateFlashlight(0.016);
 const offState=FLASH.on;
 flashToggle(); updateFlashlight(0.016);
 out.flash={before:offState, afterToggle:FLASH.on, want:FLASH.want, hasMod:FLASH.hasMod};

 window.throwNade=origThrow;
 return JSON.stringify(out);
}catch(e){ return 'PROBE_ERR:'+e.message+' | '+(e.stack||'').split('\\n')[1]; }
})()`;

(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'nade_' + Date.now());
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
  const r1 = await ev(PROBE);
  await sleep(3000);
  const r2 = await ev(PROBE2);
  console.log('=== nade probe @camp' + IDX + ' ===');
  let A = {}, B = {};
  try { A = JSON.parse(r1); } catch (e) { console.log('PHASE1: ' + r1); }
  try { B = JSON.parse(r2); } catch (e) { console.log('PHASE2: ' + r2); }
  console.log(JSON.stringify(Object.assign(A, B), null, 1));
  if (errs.length) console.log('ERRS ' + errs.slice(0, 6).join(' | '));
  ws.close(); proc.kill();
  await sleep(300);
  try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) { }
})();
