// 靶场截图: 部署后抓一张画面, 看亮度/靶子/出生位置
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9724;
const ROOT = path.resolve(__dirname, '..');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c){ try { if (ws) ws.close(); } catch (e) {} try { if (proc) proc.kill(); } catch (e) {} process.exit(c); }

(async () => {
  const ud = path.join(require('os').tmpdir(), 'rs_' + Date.now());
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
  const idx = await ev(`(function(){ for(let i=0;i<CAMPAIGNS.length;i++) if(CAMPAIGNS[i].rangeOnly) return i; return -1; })()`);
  await ev(`(function(){ localStorage.setItem('sf_campaign','${idx}'); localStorage.setItem('sf_range','1'); localStorage.setItem('sf_autodeploy','1'); return 1; })()`);
  await rpc('Page.navigate', { url: URL });
  await sleep(17000);
  await ev(`(function(){ document.getElementById('deployBtn').click(); return 1; })()`);
  await sleep(3500);

  // 强制朝向靶区
  await ev(`(function(){ player.yaw=0; player.pitch=0; return 1; })()`);
  await sleep(1200);
  const shot = await rpc('Page.captureScreenshot', { format: 'png' });
  const b64 = shot.result && shot.result.data;
  if (b64) {
    fs.writeFileSync(path.join(ROOT, '_tools', '_range_shot.png'), Buffer.from(b64, 'base64'));
    console.log('✅ 截图已保存 _tools/_range_shot.png');
    console.log('   位置 = ' + await ev(`player.pos.x.toFixed(1)+','+player.pos.y.toFixed(1)+','+player.pos.z.toFixed(1)`));
  } else console.log('❌ 截图失败');
  return finish(0);
})().catch(e => { console.log('FATAL ' + e.message); finish(1); });
