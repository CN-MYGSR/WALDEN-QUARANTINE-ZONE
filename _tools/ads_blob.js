// 直接量化"中央黑块": 对枪体掩码做连通域分析, 找出包含屏幕正中心(或最接近中心)的那一块,
// 报告它的像素尺寸、占屏比例、平均亮度 —— 这就是玩家看到的堵住准星的黑色几何。
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9391;
const OUT = 'D:/Escape from TakeFu/outputs';
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const WPN = process.argv[2] ? process.argv[2].split(',') : ['m1911', 'mp40', 'ak74m', 'm4', 'kar98'];
const DEPTHS = process.argv[3] ? process.argv[3].split(',').map(Number) : [0, 0.14, 0.22, 0.3, 0.38];
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'blob_' + Date.now());
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

  await ev(`
  window.__blob = async function(aB64, bB64){
    function load(b64){ return new Promise(res=>{ const im=new Image(); im.onload=()=>res(im); im.src='data:image/png;base64,'+b64; }); }
    const ia = await load(aB64), ib = await load(bB64);
    const w = ia.width, h = ia.height;
    const ca = document.createElement('canvas'); ca.width=w; ca.height=h;
    const ctx = ca.getContext('2d', {willReadFrequently:true});
    ctx.drawImage(ia,0,0); const A = ctx.getImageData(0,0,w,h).data;
    ctx.clearRect(0,0,w,h); ctx.drawImage(ib,0,0); const B = ctx.getImageData(0,0,w,h).data;

    const mask = new Uint8Array(w*h);
    for(let i=0;i<w*h;i++){ const j=i*4;
      if(Math.abs(A[j]-B[j])+Math.abs(A[j+1]-B[j+1])+Math.abs(A[j+2]-B[j+2])>24) mask[i]=1; }

    // BFS 连通域
    const lab = new Int32Array(w*h).fill(0);
    const comps = [];
    const q = new Int32Array(w*h);
    for(let s=0;s<w*h;s++){
      if(!mask[s]||lab[s]) continue;
      const idc = comps.length+1;
      let head=0, tail=0; q[tail++]=s; lab[s]=idc;
      let minx=w, maxx=-1, miny=h, maxy=-1, n=0, lum=0, dark=0;
      while(head<tail){
        const p=q[head++]; const px=p%w, py=(p-px)/w; n++;
        if(px<minx)minx=px; if(px>maxx)maxx=px; if(py<miny)miny=py; if(py>maxy)maxy=py;
        const j=p*4; const L=0.299*B[j]+0.587*B[j+1]+0.114*B[j+2]; lum+=L; if(L<40) dark++;
        if(px>0 && mask[p-1] && !lab[p-1]){ lab[p-1]=idc; q[tail++]=p-1; }
        if(px<w-1 && mask[p+1] && !lab[p+1]){ lab[p+1]=idc; q[tail++]=p+1; }
        if(py>0 && mask[p-w] && !lab[p-w]){ lab[p-w]=idc; q[tail++]=p-w; }
        if(py<h-1 && mask[p+w] && !lab[p+w]){ lab[p+w]=idc; q[tail++]=p+w; }
      }
      comps.push({ id:idc, n:n, minx:minx, maxx:maxx, miny:miny, maxy:maxy,
                   lum:+(lum/n).toFixed(1), dark:+(dark/n*100).toFixed(0) });
    }
    comps.sort((a,b)=>b.n-a.n);
    const cx=w/2, cy=h/2;
    // 找到离屏幕中心最近的那一块
    let best=null, bd=1e18;
    for(const c of comps){
      if(c.n < w*h*0.0015) continue;               // 忽略碎屑
      const ccx=(c.minx+c.maxx)/2, ccy=(c.miny+c.maxy)/2;
      const d=Math.hypot(ccx-cx, ccy-cy);
      if(d<bd){ bd=d; best=c; }
    }
    const ci = Math.floor(cy)*w + Math.floor(cx);
    const centerCovered = mask[ci]===1;
    let centerLum = -1;
    if(centerCovered){ const j=ci*4; centerLum=+(0.299*B[j]+0.587*B[j+1]+0.114*B[j+2]).toFixed(1); }
    return JSON.stringify({
      dim:w+'x'+h,
      centerCovered:centerCovered, centerLum:centerLum,
      big: comps.length ? { w:comps[0].maxx-comps[0].minx+1, h:comps[0].maxy-comps[0].miny+1, pct:+(comps[0].n/(w*h)*100).toFixed(2), lum:comps[0].lum, dark:comps[0].dark } : null,
      nearest: best ? { w:best.maxx-best.minx+1, h:best.maxy-best.miny+1, pct:+(best.n/(w*h)*100).toFixed(2), lum:best.lum, dark:best.dark, dist:+bd.toFixed(0) } : null
    });
  };
  'ok'`);

  console.log('中央黑块量化: 屏幕正中心是否被枪挡住 / 最靠近中心的那一块几何的尺寸与亮度');
  for (const k of WPN) {
    console.log('');
    console.log('【' + k + '】');
    console.log('  推远量 | 中心被挡 | 中心亮度 | 最近中心块尺寸(px) | 占屏 | 块亮度 | 暗像素');
    console.log('  -------|----------|----------|--------------------|------|--------|-------');
    for (const d of DEPTHS) {
      await ev(`
      (function(){
        window.adsViewDepth = function(dd){ return dd.scoped ? 0 : ${d}; };
        vmEquip('${k}', player.team);
        player.ads=true; player.carry='high'; player.braced=false; player.prone=false;
        for(let i=0;i<600;i++){ player.ads=true; updateViewModel(0.016, player); }
      })()`);
      await sleep(280);
      const withGun = await shot();
      await ev(`VM.root.visible=false;`);
      await sleep(260);
      const noGun = await shot();
      await ev(`VM.root.visible=true;`);
      fs.writeFileSync(path.join(OUT, `blob-${k}-d${String(d).replace('.', '')}.png`), Buffer.from(withGun, 'base64'));
      const r = await ev(`__blob(${JSON.stringify(noGun)}, ${JSON.stringify(withGun)})`);
      let o; try { o = JSON.parse(r); } catch (e) { console.log('  ' + d + ' ERR ' + String(r).slice(0, 40)); continue; }
      const nn = o.nearest;
      console.log('  ' + String(d).padEnd(6) + ' | ' + (o.centerCovered ? '   是   ' : '   否   ') + '  | ' +
        String(o.centerLum).padStart(8) + ' | ' +
        String(nn ? (nn.w + ' x ' + nn.h) : '-').padStart(18) + ' | ' +
        String(nn ? nn.pct + '%' : '-').padStart(4) + ' | ' +
        String(nn ? nn.lum : '-').padStart(6) + ' | ' +
        String(nn ? nn.dark + '%' : '-').padStart(5));
    }
  }
  console.log('');
  console.log('截图已存: ' + OUT + '/blob-<武器>-d<推远量>.png');

  ws.close(); proc.kill(); await sleep(300); process.exit(0);
})();
