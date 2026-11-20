// 无极变倍探针: 验证倍率区间 / 连续调整 / FOV 联动 / HUD
const http = require('http');
const { spawn } = require('child_process');
const os = require('os');
const URL_ = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const profile = os.tmpdir() + '/zoom-probe-' + Date.now();
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
  const expr = `(async function(){
    const out={};
    try{
      PLAYER_MODS.m4=Object.assign({},PLAYER_MODS.m4,{optic:'optic_2x',gear:'gear_none'});
      out.range4=zoomRangeOf('m4').map(v=>+v.toFixed(2));
      out.z4=+zoomOf('m4').toFixed(2); out.fov4=+adsFovOf('m4').toFixed(2);
      const seq=[];
      for(let i=0;i<6;i++){ zoomAdjust('m4',-1); seq.push([+zoomOf('m4').toFixed(2),+adsFovOf('m4').toFixed(2)]); }
      out.seq=seq;
      out.rangeScoped=zoomRangeOf('kar98zf').map(v=>+v.toFixed(2));
      out.zScoped=+zoomOf('kar98zf').toFixed(2); out.fovScoped=+adsFovOf('kar98zf').toFixed(2);
      zoomAdjust('kar98zf',-1); out.fovScoped2=+adsFovOf('kar98zf').toFixed(2);
      out.iron=zoomOf('m1911'); out.fovIron=+adsFovOf('m1911').toFixed(2);
      out.keepWide=SCOPE.keepWide('m4',1);
      VM.key='m4'; player.ads=true; zoomHudUpdate();
      out.hud={txt:document.getElementById('zoomN').textContent,disp:document.getElementById('zoomN').style.display};
      // 真实滚轮路径
      player.alive=true; pointerLocked=true; player.ads=true; VM.key='m4';
      const zb=zoomOf('m4'), c0=player.carry;
      dispatchEvent(new WheelEvent('wheel',{deltaY:120,cancelable:true,bubbles:true}));
      await new Promise(r=>setTimeout(r,260));
      out.wheel={before:+zb.toFixed(2), after:+zoomOf('m4').toFixed(2), decreased:zoomOf('m4')<zb, carrySame:player.carry===c0};
      // 实战: 部署 + 开镜后看镜内 FOV 是否跟着变倍
      try{
        el('menu').classList.add('hidden'); startMatch(); showDeploy(false); selectedSpawn=-1; deployPlayer();
        await new Promise(r=>setTimeout(r,600));
        PLAYER_MODS.m4=Object.assign({},PLAYER_MODS.m4,{optic:'optic_2x',gear:'gear_none'});
        VM.key='m4'; player.curW={key:'m4',def:WPN_DEFS.m4,mag:30,reserve:90};
        await new Promise(r=>setTimeout(r,1200));
        player.ads=true;
        await new Promise(r=>setTimeout(r,600));
        out.scope={mode:SCOPE.state().mode,fov1:+SCOPE.state().fov.toFixed(2),z1:+zoomOf('m4').toFixed(2)};
        zoomAdjust('m4',-1,0.3);
        await new Promise(r=>setTimeout(r,350));
        out.scope.fov2=+SCOPE.state().fov.toFixed(2); out.scope.z2=+zoomOf('m4').toFixed(2);
        out.scope.wider=out.scope.fov2>out.scope.fov1;
      }catch(e){ out.scopeErr=String(e); }
    }catch(e){ out.err=String((e&&e.stack)||e); }
    return out;
  })()`;
  const r = await rpc(ws, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  console.log(JSON.stringify({ result: r.result && r.result.value, exceptions: errors.slice(0, 6) }, null, 1));
  try { chrome.kill(); } catch (e) { }
  process.exit(0);
})();
