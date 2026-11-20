// 腰射/开镜两帧截图, 校验镜片画面
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const URL_ = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9353;
const profile = os.tmpdir() + '/scope-2shot-' + Date.now();
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  '--window-size=1440,900', '--hide-scrollbars', '--mute-audio',
  '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', 'about:blank'
], { stdio: ['ignore', 'pipe', 'pipe'] });
let stderr = '';
chrome.stderr.on('data', d => { stderr += d.toString(); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = p => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: PORT, path: p }, r => {
    let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
  }).on('error', rej);
});
let idc = 0;
function rpc(ws, method, params) {
  const id = ++idc;
  return new Promise((res, rej) => {
    const on = raw => {
      let m; try { m = JSON.parse(raw); } catch (e) { return; }
      if (m.id === id) { ws.off('message', on); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    };
    ws.on('message', on);
    ws.send(JSON.stringify({ id, method, params: params || {} }));
    setTimeout(() => { ws.off('message', on); rej(new Error('rpc timeout ' + method)); }, 60000);
  });
}
(async () => {
  let page;
  for (let i = 0; i < 70; i++) {
    try { const l = await getJSON('/json/list'); if (l && l.length) { page = l.find(t => t.type === 'page') || l[0]; break; } } catch (e) { }
    await sleep(400);
  }
  if (!page) { console.log(JSON.stringify({ fatal: 'cdp not ready', stderr: stderr.slice(-600) })); process.exit(1); }
  const WebSocket = require('./ws');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
  const errors = [];
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (m.method === 'Runtime.exceptionThrown') errors.push('EXC ' + ((m.params.exceptionDetails.exception || {}).description || ''));
  });
  await rpc(ws, 'Runtime.enable'); await rpc(ws, 'Page.enable');
  await rpc(ws, 'Page.navigate', { url: URL_ });
  await sleep(13000);

  const setup = `(async function(){
    try{
      el('menu').classList.add('hidden'); startMatch(); showDeploy(false); selectedSpawn=-1; deployPlayer();
      await new Promise(r=>setTimeout(r,700));
      const batch={};
      for(const k of ['m4','ak12','hk416','mp40','thompson','stg44','g36c','kar98']){
        PLAYER_MODS[k]={optic:'optic_2x',muzzle:'muzzle_standard',gear:'gear_none'};
        vmEquip(k,0);
        const IS=VM.gunParts.ironSight;
        batch[k]=IS?{z:+IS.z.toFixed(3),y:+IS.y.toFixed(3),lensZ:VM.gunParts.gun.userData.scopeLens?+VM.gunParts.gun.userData.scopeLens.pos.z.toFixed(3):null,muzzle:+VM.gunParts.muzzle.z.toFixed(2)}:null;
      }
      PLAYER_MODS.m4={optic:'optic_2x',muzzle:'muzzle_standard',gear:'gear_none'};
      vmEquip('m4',0);
      player.curW={key:'m4',def:WPN_DEFS.m4,mag:0,reserve:0,ammo:''};
      window.__batch=batch;
      player.deployed=true; player.alive=true; player.ads=false;
      VM.state='idle'; VM.stateT=0; VM.stateDur=0;
      await new Promise(r=>setTimeout(r,900));
      const g=VM.gunParts.gun; g.updateWorldMatrix(true,false);
      const wp=function(v){ return g.localToWorld(v.clone()).project(vmCamera); };
      const mz=wp(VM.gunParts.muzzle);
      const stk=wp(new THREE.Vector3(0,0,0.13));
      const lp=new THREE.Vector3(); SCOPE.state().lens.getWorldPosition(lp); lp.project(vmCamera);
      const ax=stk.x-mz.x, ay=stk.y-mz.y;
      const frac=((lp.x-mz.x)*ax+(lp.y-mz.y)*ay)/(ax*ax+ay*ay);
      const IS=VM.gunParts.ironSight;
      return {ok:true, batch:window.__batch, ironSight:IS?{x:+IS.x.toFixed(3),y:+IS.y.toFixed(3),z:+IS.z.toFixed(3)}:null, alongGun:+frac.toFixed(2), muzzleSide:(mz.x<stk.x?'left':'right'), muzzleNdc:[+mz.x.toFixed(2),+mz.y.toFixed(2)], lensNdc:[+lp.x.toFixed(2),+lp.y.toFixed(2)], stockNdc:[+stk.x.toFixed(2),+stk.y.toFixed(2)], lensZ:VM.gunParts.gun.userData.scopeLens?+VM.gunParts.gun.userData.scopeLens.pos.z.toFixed(3):null, muzzleZ:+VM.gunParts.muzzle.z.toFixed(3), opticY:VM.gunParts.opticSightY};
    }catch(e){ return {err:String(e&&e.stack||e)}; }
  })()`;
  const a = await rpc(ws, 'Runtime.evaluate', { expression: setup, awaitPromise: true, returnByValue: true });
  const s1 = await rpc(ws, 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('_scope_hip_big.png', Buffer.from(s1.data, 'base64'));

  const ads = `(async function(){
    player.ads=true; await new Promise(r=>setTimeout(r,1200)); return {blend:+(VM.adsBlend||0).toFixed(2)};
  })()`;
  const b = await rpc(ws, 'Runtime.evaluate', { expression: ads, awaitPromise: true, returnByValue: true });
  const s2 = await rpc(ws, 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('_scope_ads_big.png', Buffer.from(s2.data, 'base64'));

  console.log(JSON.stringify({ setup: a.result && a.result.value, ads: b.result && b.result.value, exceptions: errors.slice(0, 5) }, null, 1));
  try { chrome.kill(); } catch (e) { }
  process.exit(0);
})();
