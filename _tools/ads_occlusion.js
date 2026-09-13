// 量化 ADS 时"枪体挡住屏幕中心"的程度: 从 vmCamera 发射射线网格,
// 统计中心区域的遮挡率与最近命中距离。可 A/B 对比 adsViewDepth=0(修复前) 与当前值(修复后)。
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9387;
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const WPN = ['m1911', 'g17', 'mp40', 'thompson', 'stg44', 'ak74m', 'm4', 'kar98', 'mosin', 'springfield'];

(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'occ_' + Date.now());
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

  // 页面内测量函数
  await ev(`
  window.__occProbe = function(key, killDepth){
    if(!WPN_DEFS[key]) return JSON.stringify({key:key, err:'no-def'});
    if(killDepth){ if(!window.__origDepth) window.__origDepth = window.adsViewDepth; window.adsViewDepth = function(){ return 0; }; }
    else if(window.__origDepth){ window.adsViewDepth = window.__origDepth; window.__origDepth = null; }
    vmEquip(key, player.team);
    player.ads = true; player.carry='high'; player.braced=false; player.prone=false;
    for(let i=0;i<600;i++){ player.ads=true; updateViewModel(0.016, player); }
    const d = WPN_DEFS[key]||{};
    const scoped = !!d.scoped;
    vmCamera.updateMatrixWorld(true);
    vmScene.updateMatrixWorld(true);
    VM.root.updateWorldMatrix(true, true);

    const hidden = !VM.inner.visible;
    const rc = new THREE.Raycaster(); rc.far = 5;
    const aspect = vmCamera.aspect || (innerWidth/innerHeight);

    function visChain(o){ let n=o; while(n){ if(n.visible===false) return false; n=n.parent; } return true; }
    function cast(nx, ny){
      rc.setFromCamera(new THREE.Vector2(nx, ny), vmCamera);
      const hits = rc.intersectObject(VM.root, true);
      for(const h of hits){ if(visChain(h.object)) return h; }
      return null;
    }

    // 中心点
    const c = cast(0,0);
    // 中心圆盘: 半径 = 屏幕高度的 12%  -> ndcY 半径 0.24
    const ry = 0.24, rx = ry/aspect;
    let tot=0, hit=0, dmin=1e9;
    const N = 23;
    for(let iy=0; iy<N; iy++){
      for(let ix=0; ix<N; ix++){
        const ux=(ix/(N-1))*2-1, uy=(iy/(N-1))*2-1;
        if(ux*ux+uy*uy>1) continue;
        tot++;
        const h = cast(ux*rx, uy*ry);
        if(h){ hit++; if(h.distance<dmin) dmin=h.distance; }
      }
    }
    return JSON.stringify({
      key:key, scoped:scoped, hidden:hidden,
      blend:+VM.adsBlend.toFixed(3),
      rootZ:+VM.root.position.z.toFixed(4),
      dCenter: c ? +c.distance.toFixed(4) : -1,
      occ12: +(hit/tot*100).toFixed(1),
      dMin: dmin<1e9 ? +dmin.toFixed(4) : -1,
      n: tot
    });
  };
  'ok'`);

  const run = async (kill) => {
    const out = {};
    for (const k of WPN) {
      const r = await ev(`__occProbe('${k}', ${kill ? 1 : 0})`);
      let o; try { o = JSON.parse(r); } catch (e) { o = { key: k, err: r }; }
      out[k] = o;
    }
    return out;
  };

  const before = await run(true);
  const after = await run(false);

  console.log('ADS 中心遮挡量化 (圆盘半径 = 屏幕高度 12%, 射线 ' + (before.m1911 && before.m1911.n || '?') + ' 条)');
  console.log('武器          | 光学 |  修复前: 中心距/遮挡率 |  修复后: 中心距/遮挡率 | 修复后 rootZ');
  console.log('--------------|------|------------------------|------------------------|-------------');
  for (const k of WPN) {
    const b = before[k], a = after[k];
    if (b.err || a.err) { console.log(k + ' | ERR ' + (b.err || a.err)); continue; }
    const fmt = o => (!o.hidden ? (o.dCenter < 0 ? 'none' : o.dCenter.toFixed(3)) + ' / ' + String(o.occ12).padStart(5) + '%' : '  镜内遮罩  ');
    console.log(
      k.padEnd(13) + ' | ' + (a.scoped ? ' 是 ' : ' 否 ') + ' | ' +
      fmt(b).padStart(22) + ' | ' + fmt(a).padStart(22) + ' | ' + a.rootZ
    );
  }
  console.log('');
  console.log('说明: 中心距 = 屏幕正中心射线到枪体几何的距离(米), -1/none 表示中心无遮挡; 遮挡率 = 中心圆盘内被枪体挡住的射线占比。');

  ws.close(); proc.kill(); await sleep(300); process.exit(0);
})();
