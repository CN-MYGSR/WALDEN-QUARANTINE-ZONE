// 测试"非光学枪加装反射/2倍/4倍镜"后, 实体镜筒是否堵住屏幕中心。
// 这类武器 WPN_DEFS.scoped 为 false, 因此不会走 scopeOv 镜内遮罩。
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9390;
const OUT = 'D:/Escape from TakeFu/outputs';
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CASES = [
  ['mp40', 'optic_iron'], ['mp40', 'optic_reflex'],
  ['stg44', 'optic_iron'], ['stg44', 'optic_reflex'], ['stg44', 'optic_2x'],
  ['kar98', 'optic_iron'], ['kar98', 'optic_2x'],
  ['mosin', 'optic_2x'],
  ['m4', 'optic_reflex'],
  ['springfield', 'optic_iron'],
];
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'opb_' + Date.now());
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
  window.__cmpShot = async function(aB64, bB64){
    function load(b64){ return new Promise(res=>{ const im=new Image(); im.onload=()=>res(im); im.src='data:image/png;base64,'+b64; }); }
    const ia = await load(aB64), ib = await load(bB64);
    const w = ia.width, h = ia.height;
    const ca = document.createElement('canvas'); ca.width=w; ca.height=h;
    const ctx = ca.getContext('2d', {willReadFrequently:true});
    ctx.drawImage(ia,0,0); const A = ctx.getImageData(0,0,w,h).data;
    ctx.clearRect(0,0,w,h); ctx.drawImage(ib,0,0); const B = ctx.getImageData(0,0,w,h).data;
    const cx=w/2, cy=h/2;
    let all=0;
    for(let i=0;i<w*h;i++){ const j=i*4; if(Math.abs(A[j]-B[j])+Math.abs(A[j+1]-B[j+1])+Math.abs(A[j+2]-B[j+2])>24) all++; }
    const out={ full:+(all/(w*h)*100).toFixed(1) };
    // 中心柱状区域(瞄准视线所在): 宽 16%H, 高 30%H 的矩形
    const rw=h*0.08, rh=h*0.15;
    let tot=0,gun=0,lum=0,dark=0;
    for(let y=Math.floor(cy-rh);y<=Math.ceil(cy+rh);y++) for(let x=Math.floor(cx-rw);x<=Math.ceil(cx+rw);x++){
      if(x<0||y<0||x>=w||y>=h) continue;
      const i=(y*w+x)*4; tot++;
      if(Math.abs(A[i]-B[i])+Math.abs(A[i+1]-B[i+1])+Math.abs(A[i+2]-B[i+2])>24){
        gun++; const L=0.299*B[i]+0.587*B[i+1]+0.114*B[i+2]; lum+=L; if(L<40) dark++;
      }
    }
    out.ctr={ pct:+(gun/tot*100).toFixed(1), lum: gun?+(lum/gun).toFixed(1):-1, dark: gun?+(dark/gun*100).toFixed(0):0 };
    return JSON.stringify(out);
  };
  'ok'`);

  console.log('改装瞄具遮挡测试 (中心区域 = 16%H 宽 x 30%H 高的瞄准视线区)');
  console.log('武器 + 瞄具            | 走镜内遮罩 | 全屏枪体 | 中心区覆盖 | 枪体亮度 | 暗像素');
  console.log('-----------------------|------------|----------|------------|----------|-------');
  for (const [k, op] of CASES) {
    await ev(`
    (function(){
      PLAYER_MODS['${k}'] = Object.assign({}, PLAYER_MODS['${k}']||{}, { optic:'${op}' });
      savePlayerMods();
      vmEquip('${k}', player.team);
      player.ads=true; player.carry='high'; player.braced=false; player.prone=false;
      for(let i=0;i<600;i++){ player.ads=true; updateViewModel(0.016, player); }
    })()`);
    await sleep(300);
    const st = await ev(`JSON.stringify({ inner:VM.inner.visible, scope:document.getElementById('scopeOv').style.display, eff:effectiveOptic('${k}'), rootZ:+VM.root.position.z.toFixed(3) })`);
    const withGun = await shot();
    await ev(`VM.root.visible=false;`);
    await sleep(280);
    const noGun = await shot();
    await ev(`VM.root.visible=true;`);
    fs.writeFileSync(path.join(OUT, `optic-${k}-${op}.png`), Buffer.from(withGun, 'base64'));
    const r = await ev(`__cmpShot(${JSON.stringify(noGun)}, ${JSON.stringify(withGun)})`);
    let o = {}, s = {};
    try { o = JSON.parse(r); } catch (e) { }
    try { s = JSON.parse(st); } catch (e) { }
    const label = (k + ' + ' + op.replace('optic_', '')).padEnd(22);
    const hidden = s.inner === false;
    console.log(label + ' | ' + (hidden ? '    是    ' : '    否    ') + ' | ' +
      String(hidden ? '-' : o.full + '%').padStart(8) + ' | ' +
      String(hidden ? '-' : o.ctr.pct + '%').padStart(10) + ' | ' +
      String(hidden ? '-' : o.ctr.lum).padStart(8) + ' | ' +
      String(hidden ? '-' : o.ctr.dark + '%').padStart(6));
  }
  console.log('');
  console.log('截图已存: ' + OUT + '/optic-<武器>-<瞄具>.png');

  ws.close(); proc.kill(); await sleep(300); process.exit(0);
})();
