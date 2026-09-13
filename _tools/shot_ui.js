// UI 实拍: ① 撤离部署面板(ELO 读数) ② 军械库改枪工坊(新增「照明」槽)
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9434, HTTP = 8138;
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
(async () => {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const f = path.join(ROOT, p);
    fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('404'); } else { res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); } });
  }).listen(HTTP);
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'ui_' + Date.now());
  const proc = spawn(ch, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,900', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', 'http://127.0.0.1:' + HTTP + '/index.html'], { stdio: 'ignore' });
  await sleep(3500);
  let list = null;
  for (let i = 0; i < 25; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page'); if (!page) { console.log('NO_PAGE'); proc.kill(); srv.close(); process.exit(1); }
  const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); if (j.method === 'Runtime.exceptionThrown') errs.push('EXC ' + ((j.params.exceptionDetails.exception || {}).description || '').split('\n')[0]); });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable');
  const ev = async (e, aw) => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: !!aw }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : JSON.stringify(o); };
  const shot = async (name, clip) => {
    const o = await rpc('Page.captureScreenshot', { format: 'png', clip: clip ? Object.assign({ scale: 2 }, clip) : undefined });
    if (o.result && o.result.data) { fs.writeFileSync(path.join(ROOT, name), Buffer.from(o.result.data, 'base64')); console.log('截图', name); }
  };
  await sleep(7000);
  // ---- ① 撤离部署面板 ----
  await ev(`(function(){ const b=[...document.querySelectorAll('.navBtn')].find(x=>x.dataset.p==='mPlay'); if(b) b.click(); else if(typeof showPanel==='function') showPanel('mPlay'); return 1; })()`);
  await sleep(1200);
  const g1 = JSON.parse(await ev(`(function(){
    const g=s=>{const e=document.querySelector(s); if(!e) return null; const b=e.getBoundingClientRect();
      return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)};};
    return JSON.stringify({box:g('#eloBox'),btn:g('#eloToggle'),vw:window.innerWidth,vh:window.innerHeight,
      txt:(document.getElementById('eloBox')||{}).textContent, btnTxt:(document.getElementById('eloToggle')||{}).textContent});
  })()`));
  console.log('部署面板:', JSON.stringify(g1));
  if (g1.box) {
    const y = Math.max(0, g1.box.y - 130);
    await shot('outputs/ui_deploy_elo.png', { x: 0, y, width: g1.vw, height: Math.min(g1.vh - y, g1.box.h + 190) });
  }
  // ---- ② 军械库改枪工坊 ----
  const r2 = await ev(`(function(){try{
    META.wallet=999999;
    for(const k of ['m4','mp40','stg44','m1911','p320','kar98']) META.owned[k]=(META.owned[k]||0)+1;
    META.loadout.primary='m4'; META.loadout.secondary='m1911';
    if(typeof saveMeta==='function') saveMeta();
    const b=[...document.querySelectorAll('.navBtn')].find(x=>x.dataset.p==='mArmory');
    if(b) b.click(); else if(typeof showPanel==='function') showPanel('mArmory');
    if(typeof ARMORY_TAB!=='undefined') ARMORY_TAB='workbench';
    if(typeof renderArmory==='function') renderArmory('workbench');
    return 'armory-opened';
  }catch(e){ return 'ERR:'+e.message; }})()`);
  console.log('军械库:', r2);
  await sleep(1500);
  await ev("(function(){ var b=document.querySelector('[data-slot=\"light\"]'); if(b) b.scrollIntoView({block:'center'}); return 1; })()");
  await sleep(600);
  const g2 = JSON.parse(await ev(`(function(){
    const tabs=[...document.querySelectorAll('.arTab,.armoryTab,[data-tab]')].map(b=>b.textContent.trim()+'/'+(b.dataset.tab||b.dataset.armory||''));
    const rows=[...document.querySelectorAll('#mArmory .arRow')].map(r=>r.textContent.replace(/\\s+/g,' ').trim().slice(0,150));
    const lightBtns=[...document.querySelectorAll('[data-slot="light"]')].map(b=>b.textContent.trim()+'|sel='+b.classList.contains('sel'));
    const box=document.getElementById('mArmory')?document.getElementById('mArmory').getBoundingClientRect():null;
    return JSON.stringify({tabs:tabs, rows:rows, lightBtns:lightBtns,
      box:box?{x:Math.round(box.x),y:Math.round(box.y),w:Math.round(box.width),h:Math.round(box.height)}:null,
      vw:window.innerWidth,vh:window.innerHeight, scrollH:document.getElementById('mArmory')?document.getElementById('mArmory').scrollHeight:0});
  })()`));
  console.log('工坊:', JSON.stringify(g2, null, 1));
  await shot('outputs/ui_workbench.png');
  console.log('异常数', errs.length, errs.slice(0, 4).join(' | '));
  ws.close(); proc.kill(); srv.close();
  setTimeout(() => process.exit(0), 400);
})();
