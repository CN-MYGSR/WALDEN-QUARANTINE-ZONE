// 从真实渲染像素层面量化 ADS 黑块:
//   同一帧渲染两次(隐藏/显示视模型), 逐像素求差得到"枪体掩码",
//   再统计该掩码在屏幕中心圆盘的覆盖率与平均亮度。
// 横向对比不同的 adsViewDepth 推远量, 为取值提供数值依据。
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9388;
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const WPN = process.argv[2] ? process.argv[2].split(',') : ['m1911', 'g17', 'mp40', 'ak74m', 'm4', 'kar98', 'springfield'];
const DEPTHS = process.argv[3] ? process.argv[3].split(',').map(Number) : [0, 0.14, 0.22, 0.3];

(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'blk_' + Date.now());
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
  window.__blk = function(key, depth){
    if(!WPN_DEFS[key]) return JSON.stringify({key:key, err:'no-def'});
    window.adsViewDepth = function(d){ return d.scoped ? 0 : depth; };
    vmEquip(key, player.team);
    player.ads = true; player.carry='high'; player.braced=false; player.prone=false;
    for(let i=0;i<600;i++){ player.ads=true; updateViewModel(0.016, player); }
    const dd = WPN_DEFS[key]||{};
    if(dd.scoped) return JSON.stringify({key:key, scoped:true, rootZ:+VM.root.position.z.toFixed(3), gunPct:0, ctr8:null, ctr14:null});

    const gl = renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    function grab(showVM){
      VM.root.visible = showVM;
      renderer.render(scene, camera);
      if(showVM){ renderer.clearDepth(); renderer.render(vmScene, vmCamera); }
      const px = new Uint8Array(w*h*4);
      gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,px);
      return px;
    }
    const A = grab(false);          // 无枪
    const B = grab(true);           // 有枪
    VM.root.visible = true;

    // 圆盘半径取屏幕高度的比例; readPixels 原点在左下角
    const cx = w/2, cy = h/2;
    function disc(frac){
      const R = h*frac;
      let tot=0, gun=0, lum=0;
      const y0=Math.max(0,Math.floor(cy-R)), y1=Math.min(h-1,Math.ceil(cy+R));
      const x0=Math.max(0,Math.floor(cx-R)), x1=Math.min(w-1,Math.ceil(cx+R));
      for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++){
        const dx=x-cx, dy=y-cy; if(dx*dx+dy*dy>R*R) continue;
        const i=(y*w+x)*4; tot++;
        const dr=Math.abs(A[i]-B[i]), dg=Math.abs(A[i+1]-B[i+1]), db=Math.abs(A[i+2]-B[i+2]);
        if(dr+dg+db > 24){ gun++; lum += 0.299*B[i]+0.587*B[i+1]+0.114*B[i+2]; }
      }
      return { pct:+(gun/tot*100).toFixed(1), lum: gun? +(lum/gun).toFixed(1) : -1 };
    }
    let gunAll=0;
    for(let i=0;i<w*h;i++){ const j=i*4; if(Math.abs(A[j]-B[j])+Math.abs(A[j+1]-B[j+1])+Math.abs(A[j+2]-B[j+2])>24) gunAll++; }
    const c8=disc(0.08), c14=disc(0.14);
    return JSON.stringify({ key:key, scoped:false, rootZ:+VM.root.position.z.toFixed(3),
      gunPct:+(gunAll/(w*h)*100).toFixed(1),
      ctr8:c8, ctr14:c14 });
  };
  'ok'`);

  console.log('真实渲染像素统计: 枪体占屏比例 / 中心圆盘(半径8%H,14%H)被枪覆盖比例 / 枪体区域平均亮度');
  console.log('武器 ' + DEPTHS.map(d => ('推远' + d).padStart(22)).join(' | '));
  console.log('-'.repeat(14 + DEPTHS.length * 25));
  for (const k of WPN) {
    const cells = [];
    for (const d of DEPTHS) {
      const r = await ev(`__blk('${k}', ${d})`);
      let o; try { o = JSON.parse(r); } catch (e) { cells.push('ERR ' + String(r).slice(0, 18)); continue; }
      if (o.err) { cells.push('ERR ' + o.err); continue; }
      if (o.scoped) { cells.push('镜内遮罩(不参与)'.padStart(22)); continue; }
      cells.push((`全屏${String(o.gunPct).padStart(4)}% 心${String(o.ctr8.pct).padStart(5)}% 亮${String(o.ctr8.lum).padStart(5)}`).padStart(22));
    }
    console.log(k.padEnd(13) + ' | ' + cells.join(' | '));
  }

  ws.close(); proc.kill(); await sleep(300); process.exit(0);
})();
