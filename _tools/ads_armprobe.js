// 分离测量: 枪体 vs 手臂 各自对屏幕中心的遮挡贡献。
// VM.arms 位于 VM.inner 内 z=+0.2, 比枪根更靠近 vmCamera, 推远视模型会改变它们的距离。
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9394;
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'arm_' + Date.now());
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
  await sleep(4000);

  await ev(`
  window.__setup = function(key, depth, air){
    window.adsViewDepth = function(d){ return d.scoped ? 0 : depth; };
    vmEquip(key, player.team);
    player.ads=true; player.carry='high'; player.braced=false; player.prone=false;
    player.onGround=true; player.vel.x=0; player.vel.z=0; player.leanT=0; player.landDip=0;
    VM.recoilP=0; VM.recoilV=0; VM.kickZ=0; VM.kickV=0; player.mouseDX=0; player.mouseDY=0;
    VM.airBlend=0;
    for(let i=0;i<400;i++){ player.ads=true; updateViewModel(0.016, player); }
    if(air){ VM.airBlend=1; }
    updateViewModel(0, player);
    vmScene.updateMatrixWorld(true);
    const gz = VM.gunParts && VM.gunParts.gun;
    const az = VM.arms && VM.arms.R;
    function wz(o){ if(!o) return null; const v=new THREE.Vector3(); o.getWorldPosition(v); return +v.z.toFixed(3); }
    return JSON.stringify({ rootZ:+VM.root.position.z.toFixed(3), gunWorldZ:wz(gz), armWorldZ:wz(az) });
  };
  // mode: 'gun' 只显示枪 / 'arms' 只显示手臂 / 'all' 全部
  window.__sep = function(mode){
    const gun = VM.gunParts && VM.gunParts.gun;
    const arms = [];
    (function collect(o){ if(!o) return; if(o===VM.arms||o===VM.arms.L||o===VM.arms.R) arms.push(o);
      (o.children||[]).forEach(collect); })(VM.inner);
    const armSet = [];
    if(VM.arms){ if(VM.arms.L) armSet.push(VM.arms.L); if(VM.arms.R) armSet.push(VM.arms.R); }
    const saveG = gun?gun.visible:null, saveA = armSet.map(a=>a.visible);
    if(gun) gun.visible = (mode==='gun'||mode==='all');
    armSet.forEach(a=> a.visible = (mode==='arms'||mode==='all'));
    const gl = renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    function grab(show){
      VM.root.visible = show;
      renderer.render(scene, camera);
      if(show){ renderer.clearDepth(); renderer.render(vmScene, vmCamera); }
      const px = new Uint8Array(w*h*4);
      gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,px);
      return px;
    }
    const A = grab(false), B = grab(true);
    VM.root.visible = true;
    if(gun) gun.visible = saveG;
    armSet.forEach((a,i)=> a.visible = saveA[i]);
    const cx=w/2, cy=h/2, rw=h*0.08, rh=h*0.15;
    let tot=0, hitN=0;
    for(let y=Math.floor(cy-rh);y<=Math.ceil(cy+rh);y++) for(let x=Math.floor(cx-rw);x<=Math.ceil(cx+rw);x++){
      if(x<0||y<0||x>=w||y>=h) continue;
      const i=(y*w+x)*4; tot++;
      if(Math.abs(A[i]-B[i])+Math.abs(A[i+1]-B[i+1])+Math.abs(A[i+2]-B[i+2])>24) hitN++;
    }
    return JSON.stringify({ pct:+(hitN/tot*100).toFixed(1), armCount:armSet.length });
  };
  'ok'`);

  for (const key of ['mp40', 'm1911']) {
    for (const air of [false, true]) {
      console.log('');
      console.log('【' + key + '】' + (air ? ' 腾空状态' : ' 静止状态'));
      console.log('  推远 | rootZ | 枪体世界Z | 手臂世界Z | 全部覆盖 | 仅枪体 | 仅手臂');
      for (const d of [0, 0.20]) {
        const info = await ev(`__setup('${key}', ${d}, ${air ? 1 : 0})`);
        let s = {}; try { s = JSON.parse(info); } catch (e) { console.log('  ' + d + ' ERR ' + String(info).slice(0, 60)); continue; }
        const all = JSON.parse(await ev(`__sep('all')`));
        const gun = JSON.parse(await ev(`__sep('gun')`));
        const arms = JSON.parse(await ev(`__sep('arms')`));
        console.log('  ' + String(d).padEnd(4) + ' | ' + String(s.rootZ).padStart(5) + ' | ' +
          String(s.gunWorldZ).padStart(8) + ' | ' + String(s.armWorldZ).padStart(8) + ' | ' +
          String(all.pct + '%').padStart(8) + ' | ' + String(gun.pct + '%').padStart(6) + ' | ' + String(arms.pct + '%').padStart(6));
      }
    }
  }

  ws.close(); proc.kill(); await sleep(300); process.exit(0);
})();
