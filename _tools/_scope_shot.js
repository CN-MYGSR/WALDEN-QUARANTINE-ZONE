// 开镜观感截图: 进靶场 → 指定武器/改件 → 腰射一张 + 开镜一张
// 用法: node _tools/_scope_shot.js <url> <weaponKey> <optic|null> <tag>
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const WPN = process.argv[3] || 'kar98zf';
const OPTIC = process.argv[4] && process.argv[4] !== 'null' ? process.argv[4] : null;
const TAG = process.argv[5] || 'scope';
const PORT = 9732;
const ROOT = path.resolve(__dirname, '..');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) { try { if (ws) ws.close(); } catch (e) {} try { if (proc) proc.kill(); } catch (e) {} process.exit(c); }
(async () => {
  const ud = path.join(require('os').tmpdir(), 'sc_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud,
    '--window-size=1280,760', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'],
    { stdio: 'ignore' });
  await sleep(2500);
  let list = null;
  for (let i = 0; i < 40; i++) {
    try {
      list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => {
        let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
      }).on('error', rej));
      if (list && list.length) break;
    } catch (e) { await sleep(500); }
  }
  const page = (list || []).find(t => t.type === 'page');
  if (!page) { console.log('NO_PAGE'); return finish(1); }
  ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {};
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable');
  const ev = async e => {
    const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true });
    if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0];
    return o.result && o.result.result ? o.result.result.value : String(o);
  };
  const shot = async (name) => {
    const s = await rpc('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ROOT, '_tools', '_scope_' + name + '.png'), Buffer.from(s.result.data, 'base64'));
  };

  await rpc('Page.navigate', { url: URL });
  await sleep(14000);
  const idx = await ev(`(function(){ for(let i=0;i<CAMPAIGNS.length;i++) if(CAMPAIGNS[i].rangeOnly) return i; return -1; })()`);
  await ev(`(function(){
    localStorage.setItem('sf_campaign','${idx}');
    localStorage.setItem('sf_range','1');
    localStorage.setItem('sf_rangeWpn','${WPN}');
    localStorage.removeItem('sf_autodeploy');
    if(typeof setLoadout==='function') setLoadout('primary','${WPN}');
    ${OPTIC ? `if(typeof setModChoice==='function') setModChoice('${WPN}','optic','${OPTIC}');` : ''}
    return 1; })()`);
  await rpc('Page.navigate', { url: URL });
  await sleep(17000);
  const info = await ev(`(function(){ return JSON.stringify({primary:META.loadout.primary, optic:(typeof getModChoice==='function')?getModChoice('${WPN}','optic'):'?'}); })()`);
  await ev(`(function(){ document.getElementById('deployBtn').click(); return 1; })()`);
  await sleep(4500);
  await ev(`(function(){ player.pos.x=0; player.yaw=0; player.pitch=0; player.ads=false; return 1; })()`);
  await sleep(1200);
  await shot(TAG + '_hip');
  if(process.argv[6]==='novhs') await ev(`(function(){ if(typeof VHS!=='undefined') VHS.setEnabled(false); return 1; })()`);
  await ev(`(function(){ player.ads=true; return 1; })()`);
  await sleep(1600);
  const st = await ev(`(function(){ return JSON.stringify({
    key:(player.curW&&player.curW.key), scoped:!!(WPN_DEFS[player.curW.key]||{}).scoped,
    adsBlend:+VM.adsBlend.toFixed(2), camFov:+camera.fov.toFixed(1),
    scopeOv:(document.getElementById('scopeOv')||{}).style && document.getElementById('scopeOv').style.display,
    vmInner:VM.inner.visible }); })()`);
  await shot(TAG + '_ads');
  console.log('武器: ' + info);
  console.log('状态: ' + st);
  return finish(0);
})().catch(e => { console.log('FATAL ' + e.message); finish(1); });
