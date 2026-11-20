// 双摄像机镜内渲染探针: 部署 + 装镜 + 腰射/开镜截图
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const URL_ = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9335;
const profile = os.tmpdir() + '/scope-probe-' + Date.now();
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
  if (!page) { console.log(JSON.stringify({ fatal: 'cdp not ready', stderr: stderr.slice(-800) })); process.exit(1); }
  const WebSocket = require('./ws');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
  const errors = [];
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (m.method === 'Runtime.exceptionThrown') errors.push('EXC ' + ((m.params.exceptionDetails.exception || {}).description || ''));
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
      errors.push('ERR ' + (m.params.args || []).map(a => a.value !== undefined ? a.value : a.description).join(' '));
  });
  await rpc(ws, 'Runtime.enable'); await rpc(ws, 'Page.enable');
  await rpc(ws, 'Page.navigate', { url: URL_ });
  await sleep(13000);

  const setup = `(async function(){
    const out={};
    try{
      el('menu').classList.add('hidden'); startMatch(); showDeploy(false); selectedSpawn=-1; deployPlayer();
      await new Promise(r=>setTimeout(r,700));
      vmEquip('kar98zf',0);
      player.curW={key:'kar98zf',def:WPN_DEFS.kar98zf,mag:5,reserve:40};
      player.deployed=true; player.alive=true; player.ads=false; player.sprinting=false;
      VM.state='idle'; VM.stateT=0; VM.stateDur=0;
      if(typeof setCarryStance==='function') setCarryStance('high');
      await new Promise(r=>setTimeout(r,900));
      const lp=new THREE.Vector3(); SCOPE.state().lens.getWorldPosition(lp); const ln=lp.clone().project(vmCamera);
      const gp=new THREE.Vector3(); VM.gunParts.gun.getWorldPosition(gp); const gn=gp.clone().project(vmCamera);
      out.blend={sprint:+VM.sprintBlend.toFixed(2), carry:+VM.carryBlend.toFixed(2), crouch:+(VM.crouchBlend||0).toFixed(2), air:+VM.airBlend.toFixed(2), ads:+VM.adsBlend.toFixed(2), state:VM.state, onGround:player.onGround, carryS:player.carry};
      out.dbg={gunNdc:[+gn.x.toFixed(2),+gn.y.toFixed(2),+gn.z.toFixed(2)], gunPos:[+gp.x.toFixed(2),+gp.y.toFixed(2),+gp.z.toFixed(2)], lensLocal:SCOPE.state().lens.position.toArray().map(v=>+v.toFixed(3)), hip:VM.hip&&VM.hip.pos?VM.hip.pos.toArray().map(v=>+v.toFixed(3)):null, vmRoot:VM.root.position.toArray().map(v=>+v.toFixed(3))};
      out.lensPos={ndc:[+ln.x.toFixed(2),+ln.y.toFixed(2),+ln.z.toFixed(2)], dist:+lp.distanceTo(vmCamera.position).toFixed(3)};
      out.env={weather:typeof WEATHER!=='undefined'?WEATHER:'', night:!!NIGHT, camp:(typeof CAMPAIGN!=='undefined'&&CAMPAIGN)?CAMPAIGN.id:'', fov:SETTINGS.fov};
      out.hip={carry:player.carry, lens:!!SCOPE.state().lens, show:SCOPE.state().show, mode:SCOPE.state().mode,
               scale:+(SCOPE.state().lens?SCOPE.state().lens.scale.x:0).toFixed(4),
               fov:+SCOPE.state().fov.toFixed(2), vhs:typeof VHS, adsBlend:+(VM.adsBlend||0).toFixed(2)};
    }catch(e){ out.err=String((e&&e.stack)||e); }
    return out;
  })()`;
  const a = await rpc(ws, 'Runtime.evaluate', { expression: setup, awaitPromise: true, returnByValue: true });
  const s1 = await rpc(ws, 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('_scope_hip.png', Buffer.from(s1.data, 'base64'));
  await rpc(ws, 'Runtime.evaluate', {
    expression: "(async()=>{SCOPE.state().lens.visible=false;await new Promise(r=>setTimeout(r,250));return 1;})()",
    awaitPromise: true, returnByValue: true
  });
  const s1b = await rpc(ws, 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('_scope_hip_nolens.png', Buffer.from(s1b.data, 'base64'));
  await rpc(ws, 'Runtime.evaluate', { expression: "SCOPE.state().lens.visible=true;1", returnByValue: true });

  const ads = `(async function(){
    const out={};
    try{
      player.ads=true;
      await new Promise(r=>setTimeout(r,900));
      const lp2=new THREE.Vector3(); SCOPE.state().lens.getWorldPosition(lp2); const ln2=lp2.clone().project(vmCamera);
      out.lensPos={ndc:[+ln2.x.toFixed(2),+ln2.y.toFixed(2),+ln2.z.toFixed(2)], dist:+lp2.distanceTo(vmCamera.position).toFixed(3)};
      out.ads={show:SCOPE.state().show, fov:+SCOPE.state().fov.toFixed(2),
               scale:+(SCOPE.state().lens?SCOPE.state().lens.scale.x:0).toFixed(4),
               blend:+(VM.adsBlend||0).toFixed(2)};
    }catch(e){ out.err=String((e&&e.stack)||e); }
    return out;
  })()`;
  const b = await rpc(ws, 'Runtime.evaluate', { expression: ads, awaitPromise: true, returnByValue: true });
  const s2 = await rpc(ws, 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('_scope_ads.png', Buffer.from(s2.data, 'base64'));
  await rpc(ws, 'Runtime.evaluate', {
    expression: "(async()=>{SCOPE.tune({dust:0});await new Promise(r=>setTimeout(r,250));return 1;})()",
    awaitPromise: true, returnByValue: true
  });
  const s3 = await rpc(ws, 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('_scope_ads_nodust.png', Buffer.from(s3.data, 'base64'));

  console.log(JSON.stringify({ hip: a.result && a.result.value, ads: b.result && b.result.value, exceptions: errors.slice(0, 6) }, null, 1));
  try { chrome.kill(); } catch (e) { }
  process.exit(0);
})();
