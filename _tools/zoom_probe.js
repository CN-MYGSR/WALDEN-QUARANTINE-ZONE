'use strict';
// node _tools/zoom_probe.js <game URL> [Chrome debugging URL]
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtempSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { setTimeout: sleep } = require('node:timers/promises');

const game = new URL(process.argv[2] || 'http://127.0.0.1:8123/');
let chrome;
async function browserEndpoint() {
  if (process.argv[3]) {
    const version = await (await fetch(new URL('/json/version', process.argv[3]))).json();
    return version.webSocketDebuggerUrl;
  }
  const profile = mkdtempSync(path.join(os.tmpdir(), 'walden-zoom-'));
  chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile,
    '--window-size=1200,800', '--mute-audio', 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  return new Promise((resolve, reject) => {
    let log = '';
    chrome.stderr.on('data', chunk => {
      log += chunk;
      const address = log.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (address) resolve(address[1]);
    });
    chrome.once('error', reject);
    chrome.once('exit', code => reject(Error('Chrome exited ' + code)));
  });
}

async function run() {
  const socket = new WebSocket(await browserEndpoint());
  await new Promise((ok, fail) => { socket.onopen = ok; socket.onerror = fail; });
  let seq = 0, sessionId;
  const pending = new Map();
  socket.onmessage = ({ data }) => {
    const { id, result, error } = JSON.parse(data);
    if (!pending.has(id)) return;
    const { ok, fail, timer } = pending.get(id);
    pending.delete(id);
    clearTimeout(timer);
    error ? fail(Error(error.message)) : ok(result);
  };
  function rpc(method, params = {}, session) {
    return new Promise((ok, fail) => {
      const id = ++seq;
      const timer = setTimeout(() => { pending.delete(id); fail(Error('Timed out: ' + method)); }, 45000);
      pending.set(id, { ok, fail, timer });
      socket.send(JSON.stringify({ id, method, params, sessionId: session }));
    });
  }
  const page = (method, params) => rpc(method, params, sessionId);
  const read = async expression => {
    const r = await page('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const errors = [];
  socket.addEventListener('message', ({ data }) => {
    const { method, params, sessionId: eventSession } = JSON.parse(data);
    if (eventSession === sessionId && method === 'Runtime.exceptionThrown')
      errors.push(params.exceptionDetails.exception?.description || params.exceptionDetails.text);
  });
  async function waitFor(expression) {
    const stop = Date.now() + 35000;
    while (Date.now() < stop) {
      if (await read(expression).catch(() => false)) return;
      await sleep(100);
    }
    const state = await read("({screen:document.querySelector('.screen:not(.hidden)')?.id,alive:player.alive,weapon:player.curW?.key,map:CAMPAIGN.id})").catch(String);
    throw Error('Timed out waiting for ' + expression + ': ' + JSON.stringify(state) + '\n' + errors.join('\n'));
  }
  const { browserContextId } = await rpc('Target.createBrowserContext');
  try {
    const { targetId } = await rpc('Target.createTarget', { browserContextId, url: 'about:blank' });
    ({ sessionId } = await rpc('Target.attachToTarget', { targetId, flatten: true }));
    await page('Page.enable');
    await page('Runtime.enable');
    await page('Emulation.setFocusEmulationEnabled', { enabled: true });
    await page('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: true });
    await page('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await page('Network.enable');
    await page('Network.setBlockedURLs', { urls: ['*://gamesvibe.app/*', '*://vibe.lumigrav.space/*'] });
    await page('Page.addScriptToEvaluateOnNewDocument', { source: `
      localStorage.setItem('sf_campaign','6'); localStorage.setItem('sf_range','1'); localStorage.setItem('sf_autodeploy','1');
      localStorage.setItem('sf_rangeWpn','m4'); localStorage.setItem('sf_touch','1'); localStorage.setItem('sf_fov','92');
      localStorage.setItem('sf_mods',JSON.stringify({m4:{optic:'optic_2x'}}));
      window.VibeHubWorkshop={beforeStart:Promise.resolve(),markGameReady(){}};
      const raf=requestAnimationFrame.bind(window);
      window.requestAnimationFrame=fn=>fn.name==='loop'?0:raf(fn);
    ` });
    await page('Page.navigate', { url: game.href });
    await waitFor('document.readyState==="complete"&&typeof el("deployBtn").onclick==="function"&&!el("deploy").classList.contains("hidden")');
    await read("el('deployBtn').click()");
    await waitFor("player.deployed&&player.alive&&player.curW.key==='m4'&&!document.body.classList.contains('uiOpen')");
    await read(`
      window.sampleLens=()=>{
        for(let i=0;i<100;i++) updateViewModel(1/60,player);
        zoomHudUpdate();
        if(!SCOPE.preRender()) throw Error('Scope render target was not rendered');
        const s=SCOPE.state(), lens=s.lens;
        const projectY=y=>lens.localToWorld(new THREE.Vector3(0,y,0)).project(vmCamera).y;
        const diameter=(projectY(.5)-projectY(-.5))/2;
        return {power:zoomOf(player.curW.key),fov:s.cam.fov,wide:camera.fov,
          imagePower:diameter*s.cam.projectionMatrix.elements[5]/camera.projectionMatrix.elements[5],
          hud:el('zoomN').textContent,carry:player.carry};
      };
      dispatchEvent(new MouseEvent('mousedown',{button:2}));
    `);
    const base = await read('sampleLens()');
    assert.equal(base.power, 1, 'start at the wide end');
    const wheel = async (dy, mode = 0) => read(`dispatchEvent(new WheelEvent('wheel',{deltaY:${dy},deltaMode:${mode},cancelable:true}))`);
    await wheel(-100);
    const near = await read('sampleLens()');
    assert.ok(near.power > base.power && near.fov < base.fov, 'wheel zooms actual render camera');
    assert.ok(Math.abs(base.wide - near.wide) < 0.03 && Math.abs(near.wide - 92) < 0.03);
    assert.ok(Math.abs(near.imagePower - near.power) < 0.05, 'rendered size agrees with the power readout');
    assert.ok(near.hud.includes(near.power.toFixed(2)) && near.carry === base.carry);
    await read("for(const dy of [-1,-1,-1])dispatchEvent(new WheelEvent('wheel',{deltaY:dy,deltaMode:1,cancelable:true}))");
    const fine = await read('sampleLens()');
    assert.ok(fine.power > near.power && fine.fov < near.fov, 'fine line deltas are not eaten by a throttle');
    await read("dispatchEvent(new KeyboardEvent('keydown',{code:'BracketLeft',bubbles:true}))");
    assert.ok(await read("zoomOf('m4')") < fine.power);
    await wheel(-10000);
    assert.equal(await read("zoomOf('m4')===zoomRangeOf('m4')[1]"), true);
    await wheel(10000);
    assert.equal(await read("zoomOf('m4')"), base.power);
    const { x, y } = await read("updateTouchVis();const rect=el('tAds').getBoundingClientRect();({x:rect.x+rect.width/2,y:rect.y+rect.height/2})");
    assert.equal(await read(`document.elementFromPoint(${x},${y})?.closest('[data-act]')?.dataset.act`), 'ads', 'touch aim is visible');
    const touch = (type, offset = 0) => page('Input.dispatchTouchEvent', {
      type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: y + offset, id: 1 }]
    });
    await touch('touchStart');
    await touch('touchMove', -40);
    await touch('touchEnd');
    const dragged = await read('sampleLens()');
    assert.ok(await read('player.ads') && dragged.power > near.power && dragged.fov < near.fov, 'drag zooms and stays aimed: ' + JSON.stringify(dragged));
    await touch('touchStart');
    await touch('touchEnd');
    assert.equal(await read('player.ads'), false, 'tapping the same control exits aim');
    await read('dispatchEvent(new MouseEvent("mousedown",{button:2}));');
    await read("player.slots.push({key:'kar98zf',def:moddedDef('kar98zf'),mag:0,reserve:0});switchSlot(player.slots.length-1)");
    const builtIn = await read('sampleLens()');
    await wheel(-200);
    assert.ok((await read('sampleLens()')).fov < builtIn.fov, 'built-in lens responds after switching weapons');
    assert.equal(await read("zoomOf('m1911')"), null, 'iron sights do not advertise zoom');
    console.log('PASS scope FOV', base.fov.toFixed(2), '→', near.fov.toFixed(2), '→', fine.fov.toFixed(2),
      '| outer FOV', near.wide.toFixed(2), '| displayed / rendered power', near.power.toFixed(2), '/', near.imagePower.toFixed(2));
  } finally {
    await rpc('Target.disposeBrowserContext', { browserContextId });
    socket.close();
  }
}
run().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { if (chrome) chrome.kill(); });
