// 正确测量: 视模型由 vmCamera(FOV56) 渲染, 必须用它来投影
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9384;
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'vc_' + Date.now());
  const proc = spawn(ch, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1366,768', '--force-device-scale-factor=1', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'http://127.0.0.1:8123/index.html'], { stdio: 'ignore' });
  await sleep(3500);
  let list = null;
  for (let i = 0; i < 25; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page'); if (!page) { console.log('NO_PAGE'); proc.kill(); process.exit(1); }
  const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0; const pend = {};
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa })); });
  await rpc('Page.enable', {}); await rpc('Runtime.enable', {});
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + (o.result.exceptionDetails.exception.description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : null; };

  await sleep(9000);
  await ev(`startMatch(); el('menu').classList.add('hidden'); showDeploy(false);`);
  await sleep(2500);
  await ev(`(function(){ selectedSpawn=-1; deployPlayer(); })()`);
  await sleep(3500);

  console.log('相机: 世界 FOV=', await ev(`camera.fov`), ' 视模型 FOV=', await ev(`vmCamera.fov`));
  console.log('vmCamera 位置/旋转:', await ev(`JSON.stringify({p:[vmCamera.position.x,vmCamera.position.y,vmCamera.position.z],r:[vmCamera.rotation.x,vmCamera.rotation.y,vmCamera.rotation.z]})`));
  console.log('');

  console.log('武器 | ADS锚点Y | 准星顶Y | 用vmCamera投影的准星屏幕Y | 中心Y | 偏差');
  for (const k of ['m1911', 'g17', 'mp40', 'stg44', 'ak74m', 'm4', 'kar98', 'mosin']) {
    const r = await ev(`(function(){
      try{
        if(!WPN_DEFS['${k}']) return 'no-def';
        vmEquip('${k}', player.team);
        const sa=VM.gunParts&&VM.gunParts.sightAnchor;
        player.ads=true; player.carry='high'; player.braced=false; player.prone=false;
        for(let i=0;i<500;i++){ player.ads=true; updateViewModel(0.016, player); }
        vmCamera.updateMatrixWorld(true); vmScene.updateMatrixWorld(true);
        const vw=innerWidth, vh=innerHeight;
        const local=new THREE.Vector3(0, sa?sa.y:0, 0);
        VM.inner.updateWorldMatrix(true,false);
        const world=local.clone().applyMatrix4(VM.inner.matrixWorld);
        // 关键: 用 vmCamera 投影
        const p=world.clone().project(vmCamera);
        const sy=(-p.y*0.5+0.5)*vh;
        // 同时给出世界Y, 便于判断是否在中心线上
        return JSON.stringify({key:'${k}',sightY:sa?+sa.y.toFixed(4):null,adsY:+VM.ads.pos.y.toFixed(4),worldY:+world.y.toFixed(4),screenY:+sy.toFixed(1),cy:vh/2,vmFov:vmCamera.fov});
      }catch(e){ return 'ERR:'+e.message; }
    })()`);
    let o; try { o = JSON.parse(r); } catch (e) { console.log(k + ' | ' + r); continue; }
    const dy = o.screenY - o.cy;
    const ok = Math.abs(dy) < 3;
    console.log(`${k} | adsY=${o.adsY} | 准星顶=${o.sightY} | 世界Y=${o.worldY} | ${o.screenY} | ${o.cy} | dy=${dy.toFixed(1)}px ${ok ? '✓ 对齐' : '⚠ 偏移'}`);
  }

  ws.close(); proc.kill(); await sleep(300); process.exit(0);
})();
