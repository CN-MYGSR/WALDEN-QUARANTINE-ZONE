// 直接测「线上发布的那个包」: 打开 apps.gamesvibe.app 的 release 地址, 点靶场按钮
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const REL = process.argv[2] || 'iOwRvOkIyn77qjuUPDycC';
const URL = 'https://apps.gamesvibe.app/escape-from-walden/_releases/' + REL + '/';
const PORT = 9731;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => { out.push(s); console.log(s); };
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c){
  try { if (ws) ws.close(); } catch (e) {}
  try { if (proc) proc.kill(); } catch (e) {}
  fs.writeFileSync(path.join(ROOT, '_tools', '_range_online.txt'), out.join('\n') + '\n', 'utf8');
  process.exit(c);
}

(async () => {
  const ud = path.join(require('os').tmpdir(), 'ro_' + Date.now());
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
  if (!page) { log('NO_PAGE'); return finish(1); }
  ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {}; let errs = [];
  ws.on('message', m => {
    const j = JSON.parse(m);
    if (j.id && pend[j.id]) pend[j.id](j);
    if (j.method === 'Runtime.exceptionThrown') {
      const d = j.params.exceptionDetails;
      const s = ((d.exception || {}).description || d.text || '').split('\n').slice(0, 2).join(' | ');
      if (errs.indexOf(s) < 0) errs.push(s);
    }
  });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable');
  const ev = async e => {
    const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true });
    if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0];
    const r = o.result && o.result.result;
    return (r && typeof r.value === 'object' && r.value !== null) ? JSON.stringify(r.value) : (r ? r.value : String(o));
  };

  log('目标 = ' + URL);
  await rpc('Page.navigate', { url: URL });
  await sleep(20000);

  log('脚本版本 = ' + await ev(`(function(){var s=document.querySelector('script[src*="61_range"]');return s?s.getAttribute('src'):'未找到'})()`));
  log('CAMPAIGN = ' + await ev(`(typeof CAMPAIGN!=='undefined')?CAMPAIGN.id+'/'+CAMPAIGN.layout:'NO_CAMPAIGN'`));
  log('按钮存在 = ' + await ev(`!!document.getElementById('rangeBtn')`));
  log('按钮 onclick = ' + await ev(`(function(){var b=document.getElementById('rangeBtn');return b&&b.onclick?String(b.onclick).slice(0,80):'NULL'})()`));
  log('已绑定委托? = ' + await ev(`typeof rangeOpen==='function'`));
  log('异常 = ' + (errs.length ? JSON.stringify(errs) : '无'));

  // 点按钮
  errs = [];
  log('');
  log('=== 点击靶场按钮 ===');
  await ev(`(function(){ document.getElementById('rangeBtn').click(); return 1; })()`);
  await sleep(20000);
  log('  CAMPAIGN = ' + await ev(`(typeof CAMPAIGN!=='undefined')?CAMPAIGN.id+'/'+CAMPAIGN.layout:'NO'`));
  log('  sf_range = ' + await ev(`localStorage.getItem('sf_range')`));
  log('  sf_campaign = ' + await ev(`localStorage.getItem('sf_campaign')`));
  log('  可见 screen = ' + await ev(`(function(){var a=[];document.querySelectorAll('.screen').forEach(function(s){if(!s.classList.contains('hidden'))a.push(s.id)});return a.join(',')||'(无)'})()`));
  log('  异常 = ' + (errs.length ? JSON.stringify(errs) : '无'));

  const s = await rpc('Page.captureScreenshot', { format: 'png' });
  if (s.result && s.result.data) {
    fs.writeFileSync(path.join(ROOT, '_tools', '_online_1.png'), Buffer.from(s.result.data, 'base64'));
    log('  📷 _online_1.png');
  }
  return finish(0);
})().catch(e => { log('FATAL ' + e.message); finish(1); });
