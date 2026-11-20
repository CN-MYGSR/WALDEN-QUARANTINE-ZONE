// 镜片占屏比例探针: 腰射 / 开镜 直径占屏幕高度的比例
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const URL_ = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9351;
const profile = os.tmpdir() + '/scope-size-' + Date.now();
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
    const out={};
    function measure(tag){
      const s=SCOPE.state();
      if(!s.lens) return null;
      const p=new THREE.Vector3(); s.lens.getWorldPosition(p);
      const ws=new THREE.Vector3(); s.lens.getWorldScale(ws);
      const q=vmCamera.quaternion;
      const half=ws.x*0.5;   // PlaneGeometry(1,1) 的世界宽度 = worldScale
      const r=new THREE.Vector3(1,0,0).applyQuaternion(q).multiplyScalar(half);
      const u=new THREE.Vector3(0,1,0).applyQuaternion(q).multiplyScalar(half);
      const a=p.clone().add(r).project(vmCamera), b=p.clone().sub(r).project(vmCamera);
      const c=p.clone().add(u).project(vmCamera), d=p.clone().sub(u).project(vmCamera);
      const pc=p.clone().project(vmCamera);
      return {w:+((Math.abs(a.x-b.x)/2)).toFixed(3), h:+((Math.abs(c.y-d.y)/2)).toFixed(3),
              cx:+pc.x.toFixed(3), cy:+pc.y.toFixed(3), fov:+s.fov.toFixed(1),
              ws:+ws.x.toFixed(2), vmScale:+(VM.inner.scale.x).toFixed(2), lensZ:+(-p.z).toFixed(3)};
    }
    try{
      el('menu').classList.add('hidden'); startMatch(); showDeploy(false); selectedSpawn=-1; deployPlayer();
      await new Promise(r=>setTimeout(r,700));
      PLAYER_MODS.m4={optic:'optic_2x',gear:'gear_none'};
      vmEquip('m4',0);
      player.curW={key:'m4',def:WPN_DEFS.m4,mag:0,reserve:0,ammo:''};
      player.deployed=true; player.alive=true; player.ads=false;
      VM.state='idle'; VM.stateT=0; VM.stateDur=0;
      await new Promise(r=>setTimeout(r,900));
      out.hip=measure('hip');
      const s0 = await new Promise(r=>setTimeout(r,0));
      window.__hipShot=true;
      player.ads=true;
      await new Promise(r=>setTimeout(r,1200));
      out.ads=measure('ads');
      out.blend=+(VM.adsBlend||0).toFixed(2);
      // 自带镜狙击枪 (82% 大镜片)
      PLAYER_MODS.kar98zf={optic:'optic_4x',gear:'gear_none'};
      vmEquip('kar98zf',0);
      player.curW={key:'kar98zf',def:WPN_DEFS.kar98zf,mag:0,reserve:0,ammo:''};
      player.ads=false; await new Promise(r=>setTimeout(r,1600));
      out.hipKar=measure('hipKar');
      player.ads=true; await new Promise(r=>setTimeout(r,1400));
      out.adsKar=measure('adsKar');
      // 回到 m4, 让截图保持 2 倍镜开镜
      PLAYER_MODS.m4={optic:'optic_2x',gear:'gear_none'};
      vmEquip('m4',0);
      player.curW={key:'m4',def:WPN_DEFS.m4,mag:0,reserve:0,ammo:''};
      player.ads=true; await new Promise(r=>setTimeout(r,1400));
    }catch(e){ out.err=String((e&&e.stack)||e); }
    return out;
  })()`;
  const a = await rpc(ws, 'Runtime.evaluate', { expression: setup, awaitPromise: true, returnByValue: true });
  const s1 = await rpc(ws, 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('_scope_ads_big.png', Buffer.from(s1.data, 'base64'));
  console.log(JSON.stringify({ result: a.result && a.result.value, exceptions: errors.slice(0, 5) }, null, 1));
  try { chrome.kill(); } catch (e) { }
  process.exit(0);
})();
