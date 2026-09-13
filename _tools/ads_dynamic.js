// 动态状态最坏情况扫描: 移动摆动 / 鼠标急转拖拽 / 侧身 / 后坐 / 腾空 / 组合。
// 之前所有测试都只测了"静态收敛后的 ADS 姿态", 覆盖不到实战中枪体扫过准星的情况。
// 做法: 直接设定各状态量后用 dt=0 调用 updateViewModel 冻结姿态, 再渲染两次求差得到枪体掩码。
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9393;
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const WPN = ['mp40', 'm1911'];

(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'dyn_' + Date.now());
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
  window.__prep = function(key){
    vmEquip(key, player.team);
    player.ads=true; player.carry='high'; player.braced=false; player.prone=false;
    player.onGround=true; player.vel.x=0; player.vel.z=0; player.holdBreath=false;
    player.leanT=0; player.landDip=0; player.sprinting=false; player.crouch=false;
    VM.recoilP=0; VM.recoilV=0; VM.kickZ=0; VM.kickV=0;
    player.mouseDX=0; player.mouseDY=0;
    VM.airBlend=0;
    for(let i=0;i<400;i++){ player.ads=true; updateViewModel(0.016, player); }
  };
  // 用 dt=0 冻结姿态: 阻尼项(exp(-k*0)=1)不变化, 设定的状态量原样生效
  window.__diff = function(){
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
    // 噪声基线: 连续两次"无枪"渲染求差, 用来判断世界本身在两次渲染之间是否变化
    const A1 = grab(false), A = grab(false), B = grab(true);
    VM.root.visible = true;
    const cx=w/2, cy=h/2;
    const rw=h*0.08, rh=h*0.15;               // 中心瞄准视线区: 16%H 宽 x 30%H 高
    let ntot=0, nz=0;
    for(let y=Math.floor(cy-rh);y<=Math.ceil(cy+rh);y++) for(let x=Math.floor(cx-rw);x<=Math.ceil(cx+rw);x++){
      if(x<0||y<0||x>=w||y>=h) continue;
      const i=(y*w+x)*4; ntot++;
      if(Math.abs(A1[i]-A[i])+Math.abs(A1[i+1]-A[i+1])+Math.abs(A1[i+2]-A[i+2])>24) nz++;
    }
    const noise = +(nz/ntot*100).toFixed(1);
    let tot=0, gun=0, lum=0, dark=0;
    for(let y=Math.floor(cy-rh);y<=Math.ceil(cy+rh);y++) for(let x=Math.floor(cx-rw);x<=Math.ceil(cx+rw);x++){
      if(x<0||y<0||x>=w||y>=h) continue;
      const i=(y*w+x)*4; tot++;
      if(Math.abs(A[i]-B[i])+Math.abs(A[i+1]-B[i+1])+Math.abs(A[i+2]-B[i+2])>24){
        gun++; const L=0.299*B[i]+0.587*B[i+1]+0.114*B[i+2]; lum+=L; if(L<40) dark++;
      }
    }
    // 准星所在列(中心 ±5%H)里, 枪体最高点越过中心线上方多少像素 —— 直接反映"往上糊"
    // 注意 readPixels 原点在左下角: 要从 y=h-1 往下扫才是"最高点"
    const cw=h*0.05;
    let topY=-1;
    for(let y=h-1;y>=0;y--){
      let hit=false;
      for(let x=Math.floor(cx-cw);x<=Math.ceil(cx+cw);x++){
        if(x<0||x>=w) continue;
        const i=(y*w+x)*4;
        if(Math.abs(A[i]-B[i])+Math.abs(A[i+1]-B[i+1])+Math.abs(A[i+2]-B[i+2])>24){ hit=true; break; }
      }
      if(hit){ topY=y; break; }
    }
    const aboveCenter = topY>=0 ? +(cy-(h-1-topY)).toFixed(0) : null;
    const centerIdx=(Math.floor(cy)*w+Math.floor(cx))*4;
    const centerCovered = Math.abs(A[centerIdx]-B[centerIdx])+Math.abs(A[centerIdx+1]-B[centerIdx+1])+Math.abs(A[centerIdx+2]-B[centerIdx+2])>24;
    return JSON.stringify({ pct:+(gun/tot*100).toFixed(1), lum: gun?+(lum/gun).toFixed(1):-1,
      dark: gun?+(dark/gun*100).toFixed(0):0, aboveCenter:aboveCenter, centerCovered:centerCovered,
      rootZ:+VM.root.position.z.toFixed(3), noise:noise,
      rootY:+VM.root.position.y.toFixed(4), rootRX:+VM.root.rotation.x.toFixed(4),
      innerRX:VM.inner?+VM.inner.rotation.x.toFixed(4):null,
      swayRX:VM.sway?+VM.sway.rotation.x.toFixed(4):null,
      sy:VM.sway?+VM.sway.position.y.toFixed(4):null,
      air:+VM.airBlend.toFixed(3), ads:+VM.adsBlend.toFixed(3),
      swx:+VM.swayX.toFixed(2), rec:+VM.recoilP.toFixed(4) });
  };
  'ok'`);

  // 各动态状态: [名称, 应用函数]
  const STATES = [
    ['静止基线', `updateViewModel(0, player); window.__r = JSON.parse(__diff()); 1`],
    ['移动摆动(最坏相位)', `
      (function(){
        player.vel.x=4.2; player.onGround=true;
        let worst=null;
        for(let p=0;p<12;p++){
          VM.bobT = p/12*Math.PI*2;
          updateViewModel(0, player);
          const r=JSON.parse(__diff());
          if(!worst || r.pct>worst.pct) worst=r;
        }
        window.__r = worst; return 1;
      })()`],
    ['鼠标急转(右上)', `
      (function(){
        for(let i=0;i<80;i++){ player.mouseDX=40; player.mouseDY=40; updateViewModel(0.016, player); }
        updateViewModel(0, player); window.__r = JSON.parse(__diff()); return 1;
      })()`],
    ['鼠标急转(左下)', `
      (function(){
        for(let i=0;i<80;i++){ player.mouseDX=-40; player.mouseDY=-40; updateViewModel(0.016, player); }
        updateViewModel(0, player); window.__r = JSON.parse(__diff()); return 1;
      })()`],
    ['侧身(右满)', `player.leanT=1; updateViewModel(0, player); window.__r = JSON.parse(__diff()); 1`],
    ['侧身(左满)', `player.leanT=-1; updateViewModel(0, player); window.__r = JSON.parse(__diff()); 1`],
    ['开火后坐峰值', `VM.recoilP=0.08; VM.kickZ=0.04; updateViewModel(0, player); window.__r = JSON.parse(__diff()); 1`],
    ['腾空', `VM.airBlend=1; updateViewModel(0, player); window.__r = JSON.parse(__diff()); 1`],
    ['组合最坏', `
      (function(){
        player.vel.x=4.2; player.onGround=true; player.leanT=1;
        VM.recoilP=0.08; VM.kickZ=0.04;
        for(let i=0;i<80;i++){ player.mouseDX=40; player.mouseDY=40; updateViewModel(0.016, player); }
        let worst=null;
        for(let p=0;p<12;p++){
          VM.bobT=p/12*Math.PI*2;
          updateViewModel(0, player);
          const r=JSON.parse(__diff());
          if(!worst || r.pct>worst.pct) worst=r;
        }
        window.__r = worst; return 1;
      })()`],
  ];

  const runSet = async (killDepth) => {
    await ev(`if(${killDepth}){ if(!window.__origD) window.__origD=window.adsViewDepth; window.adsViewDepth=function(){return 0;}; } else if(window.__origD){ window.adsViewDepth=window.__origD; window.__origD=null; }`);
    const res = {};
    for (const k of WPN) {
      res[k] = {};
      for (const [name, apply] of STATES) {
        await ev(`__prep('${k}')`);
        const r = await ev(`(function(){ ${apply} })()`);
        if (String(r).startsWith('EXC')) { res[k][name] = { err: String(r).slice(0, 50) }; continue; }
        const out = await ev(`JSON.stringify(window.__r)`);
        try { res[k][name] = JSON.parse(out); } catch (e) { res[k][name] = { err: 'parse' }; }
      }
    }
    return res;
  };

  const before = await runSet(true);
  const after = await runSet(false);

  console.log('动态状态最坏情况扫描 (中心瞄准区 16%H×30%H; aboveCenter = 枪体在准星列越过中心线上方多少px)');
  for (const k of WPN) {
    console.log('');
    console.log('【' + k + '】');
    console.log('  状态                  | 修复前 覆盖/暗像素/越中心 | 修复后 覆盖/暗像素/越中心');
    console.log('  ----------------------|---------------------------|---------------------------');
    for (const [name] of STATES) {
      const b = before[k][name], a = after[k][name];
      const f = o => o && !o.err ? (`${o.pct}% / 噪${o.noise}% / 暗${o.dark}% / 顶越${o.aboveCenter === null ? '-' : o.aboveCenter + 'px'} / z${o.rootZ}`).padStart(42) : String(o && o.err ? 'ERR' : '-').padStart(42);
      console.log('  ' + name.padEnd(21) + ' | ' + f(b) + ' | ' + f(a));
      if (name === '腾空' || name === '静止基线') {
        const pose = o => o && !o.err ? `y${o.rootY} rx${o.rootRX} irx${o.innerRX} srx${o.swayRX} sy${o.sy} air${o.air} ads${o.ads} swx${o.swx} rec${o.rec}` : '-';
        console.log('      前姿态: ' + pose(b));
        console.log('      后姿态: ' + pose(a));
      }
    }
  }
  // 找最坏
  let worstB = null, worstA = null;
  for (const k of WPN) for (const [name] of STATES) {
    const b = before[k][name], a = after[k][name];
    if (b && !b.err && (!worstB || b.pct > worstB.pct)) worstB = Object.assign({ k, name }, b);
    if (a && !a.err && (!worstA || a.pct > worstA.pct)) worstA = Object.assign({ k, name }, a);
  }
  console.log('');
  console.log('最坏用例 —— 修复前: ' + worstB.k + ' / ' + worstB.name + ' 覆盖 ' + worstB.pct + '% 暗' + worstB.dark + '% 越中心' + worstB.aboveCenter + 'px');
  console.log('            修复后: ' + worstA.k + ' / ' + worstA.name + ' 覆盖 ' + worstA.pct + '% 暗' + worstA.dark + '% 越中心' + worstA.aboveCenter + 'px');

  ws.close(); proc.kill(); await sleep(300); process.exit(0);
})();
