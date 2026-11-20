// 户外/夜间地图的 VHS 观感抽查: 部署到指定 CAMPAIGNS 下标, 抓一张图
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const IDX = +(process.argv[3] || 0);
const TAG = process.argv[4] || 'out';
const PORT = 9728;
const ROOT = path.resolve(__dirname, '..');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) { try { if (ws) ws.close(); } catch (e) {} try { if (proc) proc.kill(); } catch (e) {} process.exit(c); }
(async () => {
  const ud = path.join(require('os').tmpdir(), 'vo_' + Date.now());
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
  await rpc('Page.navigate', { url: URL });
  await sleep(14000);
  const info = await ev(`(function(){ return JSON.stringify({name:CAMPAIGNS[${IDX}]&&CAMPAIGNS[${IDX}].name, night:!!(typeof NIGHT!=='undefined'&&NIGHT)}); })()`);
  await ev(`(function(){ localStorage.removeItem('sf_range'); localStorage.setItem('sf_campaign','${IDX}'); localStorage.setItem('sf_autodeploy','1'); return 1; })()`);
  await rpc('Page.navigate', { url: URL });
  await sleep(18000);
  await ev(`(function(){ document.getElementById('deployBtn').click(); return 1; })()`);
  await sleep(5000);
  await ev(`(function(){ player.pitch=-0.05; return 1; })()`);
  await sleep(1500);
  const shot = await rpc('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ROOT, '_tools', '_vhs_' + TAG + '.png'), Buffer.from(shot.result.data, 'base64'));
  console.log('地图: ' + info + ' → _tools/_vhs_' + TAG + '.png');
  return finish(0);
})().catch(e => { console.log('FATAL ' + e.message); finish(1); });
