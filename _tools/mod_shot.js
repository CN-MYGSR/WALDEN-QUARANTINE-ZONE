// 改装模型截图: MP40 红点 / M4 2倍镜
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const URL_ = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9341;
const profile = os.tmpdir() + '/mod-shot-' + Date.now();
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
  });
  await rpc(ws, 'Runtime.enable'); await rpc(ws, 'Page.enable');
  await rpc(ws, 'Page.navigate', { url: URL_ });
  await sleep(13000);

  const setup = `(async function(){
    try{
      el('menu').classList.add('hidden'); startMatch(); showDeploy(false); selectedSpawn=-1; deployPlayer();
      await new Promise(r=>setTimeout(r,700));
      VM.state='idle'; VM.stateT=0;
      PLAYER_MODS.mp40={optic:'optic_reflex',muzzle:'muzzle_supp',gear:'gear_none'};
      vmEquip('mp40',0);
      player.curW={key:'mp40',def:WPN_DEFS.mp40,mag:32,reserve:160};
      player.deployed=true; player.alive=true; player.ads=false;
      await new Promise(r=>setTimeout(r,900));
      return {children:VM.gunParts.gun.children.length, opticY:VM.gunParts.opticSightY, muzzleZ:VM.gunParts.muzzle.z};
    }catch(e){ return {err:String(e&&e.stack||e)}; }
  })()`;
  const a = await rpc(ws, 'Runtime.evaluate', { expression: setup, awaitPromise: true, returnByValue: true });
  const s1 = await rpc(ws, 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('_mod_mp40.png', Buffer.from(s1.data, 'base64'));

  const m4 = `(async function(){
    try{
      PLAYER_MODS.m4={optic:'optic_2x',muzzle:'muzzle_comp',gear:'gear_none'};
      vmEquip('m4',0);
      player.curW={key:'m4',def:WPN_DEFS.m4,mag:30,reserve:90};
      VM.state='idle'; player.ads=false;
      await new Promise(r=>setTimeout(r,900));
      return {children:VM.gunParts.gun.children.length, opticY:VM.gunParts.opticSightY, muzzleZ:VM.gunParts.muzzle.z};
    }catch(e){ return {err:String(e&&e.stack||e)}; }
  })()`;
  const b = await rpc(ws, 'Runtime.evaluate', { expression: m4, awaitPromise: true, returnByValue: true });
  const s2 = await rpc(ws, 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('_mod_m4.png', Buffer.from(s2.data, 'base64'));

  console.log(JSON.stringify({ mp40: a.result && a.result.value, m4: b.result && b.result.value, exceptions: errors.slice(0, 6) }, null, 1));
  try { chrome.kill(); } catch (e) { }
  process.exit(0);
})();
