// 真值校验: 用 CDP 真实截图(合成后的画面)统计 ADS 时枪体对屏幕中心的遮挡。
// 每组对比两张截图 —— 隐藏视模型 / 显示视模型 —— 逐像素求差得到枪体掩码。
// 同时把"显示视模型"的截图保存下来, 便于人工目视。
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9389;
const OUT = 'D:/Escape from TakeFu/outputs';
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const WPN = process.argv[2] ? process.argv[2].split(',') : ['m1911', 'g17', 'mp40', 'ak74m', 'm4', 'kar98'];
const DEPTHS = process.argv[3] ? process.argv[3].split(',').map(Number) : [0, 0.14, 0.22, 0.3];
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'blks_' + Date.now());
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
  const shot = async () => { const o = await rpc('Page.captureScreenshot', { format: 'png' }); return o.result && o.result.data; };

  await sleep(9000);
  await ev(`startMatch(); el('menu').classList.add('hidden'); showDeploy(false);`);
  await sleep(2500);
  await ev(`(function(){ selectedSpawn=-1; deployPlayer(); })()`);
  await sleep(4000);

  // 页面内: 对两张 base64 截图做差, 统计枪体掩码
  await ev(`
  window.__cmpShot = async function(aB64, bB64, fracs){
    function load(b64){ return new Promise(res=>{ const im=new Image(); im.onload=()=>res(im); im.src='data:image/png;base64,'+b64; }); }
    const ia = await load(aB64), ib = await load(bB64);
    const w = ia.width, h = ia.height;
    const ca = document.createElement('canvas'); ca.width=w; ca.height=h;
    const ctx = ca.getContext('2d', {willReadFrequently:true});
    ctx.drawImage(ia,0,0); const A = ctx.getImageData(0,0,w,h).data;
    ctx.clearRect(0,0,w,h); ctx.drawImage(ib,0,0); const B = ctx.getImageData(0,0,w,h).data;
    const cx=w/2, cy=h/2;
    const out = {};
    let all=0;
    for(let i=0;i<w*h;i++){ const j=i*4; if(Math.abs(A[j]-B[j])+Math.abs(A[j+1]-B[j+1])+Math.abs(A[j+2]-B[j+2])>24) all++; }
    out.full = +(all/(w*h)*100).toFixed(1);
    for(const f of fracs){
      const R=h*f; let tot=0, gun=0, lum=0, dark=0;
      const y0=Math.max(0,Math.floor(cy-R)), y1=Math.min(h-1,Math.ceil(cy+R));
      const x0=Math.max(0,Math.floor(cx-R)), x1=Math.min(w-1,Math.ceil(cx+R));
      for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++){
        const dx=x-cx, dy=y-cy; if(dx*dx+dy*dy>R*R) continue;
        const i=(y*w+x)*4; tot++;
        if(Math.abs(A[i]-B[i])+Math.abs(A[i+1]-B[i+1])+Math.abs(A[i+2]-B[i+2])>24){
          gun++; const L=0.299*B[i]+0.587*B[i+1]+0.114*B[i+2]; lum+=L; if(L<40) dark++;
        }
      }
      out['r'+f] = { pct:+(gun/tot*100).toFixed(1), lum: gun? +(lum/gun).toFixed(1):-1, dark: gun? +(dark/gun*100).toFixed(0):0 };
    }
    out.dim = w+'x'+h;
    return JSON.stringify(out);
  };
  'ok'`);

  console.log('真值(CDP截图)统计: 全屏枪体占比 / 中心圆盘覆盖率(半径8%H、14%H) / 枪体平均亮度 / 暗像素占比');
  console.log('武器        |' + DEPTHS.map(d => ('推远 ' + d).padStart(30)).join('|'));
  console.log('-'.repeat(12 + DEPTHS.length * 31));

  for (const k of WPN) {
    const cells = [];
    for (const d of DEPTHS) {
      await ev(`
      (function(){
        window.adsViewDepth = function(dd){ return dd.scoped ? 0 : ${d}; };
        vmEquip('${k}', player.team);
        player.ads=true; player.carry='high'; player.braced=false; player.prone=false;
        for(let i=0;i<600;i++){ player.ads=true; updateViewModel(0.016, player); }
        window.__freezeVM = VM.root.visible;
      })()`);
      await sleep(260);
      const withGun = await shot();
      await ev(`VM.root.visible=false;`);
      await sleep(260);
      const noGun = await shot();
      await ev(`VM.root.visible=true;`);
      fs.writeFileSync(path.join(OUT, `ads-${k}-d${String(d).replace('.', '')}.png`), Buffer.from(withGun, 'base64'));
      const r = await ev(`__cmpShot(${JSON.stringify(noGun)}, ${JSON.stringify(withGun)}, [0.08, 0.14])`);
      let o; try { o = JSON.parse(r); } catch (e) { cells.push('ERR'.padStart(30)); continue; }
      cells.push((`全屏${String(o.full).padStart(4)}% 心8:${String(o.r0_08 ? o.r0_08.pct : o['r0.08'].pct).padStart(5)}% 亮${String((o['r0.08']).lum).padStart(5)} 暗${String((o['r0.08']).dark).padStart(3)}%`).padStart(30));
    }
    console.log(k.padEnd(11) + ' |' + cells.join('|'));
  }
  console.log('');
  console.log('截图已存: ' + OUT + '/ads-<武器>-d<推远量>.png');

  ws.close(); proc.kill(); await sleep(300); process.exit(0);
})();
