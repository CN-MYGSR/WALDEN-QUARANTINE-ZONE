// 复现用户路径: 点「靶 场」按钮 → 重载 → 自动进部署 → 点部署 → 截图三次
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9729;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => { out.push(s); console.log(s); };
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c){
  try { if (ws) ws.close(); } catch (e) {}
  try { if (proc) proc.kill(); } catch (e) {}
  fs.writeFileSync(path.join(ROOT, '_tools', '_range_repro.txt'), out.join('\n') + '\n', 'utf8');
  process.exit(c);
}

(async () => {
  const ud = path.join(require('os').tmpdir(), 'rp_' + Date.now());
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
  const shot = async (name) => {
    const s = await rpc('Page.captureScreenshot', { format: 'png' });
    if (s.result && s.result.data) {
      fs.writeFileSync(path.join(ROOT, '_tools', name), Buffer.from(s.result.data, 'base64'));
      log('  📷 ' + name);
    }
  };

  // ① 首次加载
  await rpc('Page.navigate', { url: URL });
  await sleep(15000);
  log('首屏: 靶场按钮 = ' + await ev(`!!document.getElementById('rangeBtn')`));
  log('RANGE_DEBUG = ' + await ev(`typeof RANGE_DEBUG`));
  log('RANGE = ' + await ev(`typeof RANGE`));
  log('按钮 onclick = ' + await ev(`(function(){var b=document.getElementById('rangeBtn');return b&&b.onclick?String(b.onclick).slice(0,90):'NULL'})()`));
  log('按钮 class = ' + await ev(`document.getElementById('rangeBtn').className`));
  await ev(`(function(){ localStorage.removeItem('sf_range'); localStorage.setItem('sf_campaign','0'); return 1; })()`);

  // ② 点「靶 场」按钮（真实用户路径）
  errs = [];
  log('');
  log('=== 点「靶 场」按钮 ===');
  log('  先故意清空 onclick (测事件委托) = ' + await ev(`(function(){var b=document.getElementById('rangeBtn');b.onclick=function(){};return 'onclick 已被清空'})()`));
  log('  click 返回 = ' + await ev(`(function(){ document.getElementById('rangeBtn').click(); return 'clicked'; })()`));
  await sleep(18000);
  log('  CAMPAIGN = ' + await ev(`CAMPAIGN.id + '/' + CAMPAIGN.layout`));
  log('  sf_range = ' + await ev(`localStorage.getItem('sf_range')`));
  log('  sf_campaign = ' + await ev(`localStorage.getItem('sf_campaign')`));
  log('  sf_autodeploy = ' + await ev(`localStorage.getItem('sf_autodeploy')`));
  log('  blackOv opacity = ' + await ev(`(document.getElementById('blackOv')||{}).style.opacity`));
  log('  deploy 面板可见 = ' + await ev(`!document.getElementById('deploy').classList.contains('hidden')`));
  log('  可见的 .screen = ' + await ev(`(function(){var a=[];document.querySelectorAll('.screen').forEach(function(s){if(!s.classList.contains('hidden'))a.push(s.id)});return a.join(',')||'(无)'})()`));
  log('  异常 = ' + (errs.length ? JSON.stringify(errs) : '无'));
  await shot('_repro_1_deploy.png');

  // ③ 点部署
  errs = [];
  log('');
  log('=== 点「部 署」 ===');
  log('  click 返回 = ' + await ev(`(function(){ document.getElementById('deployBtn').click(); return 'clicked'; })()`));
  await sleep(4000);
  log('  deployed = ' + await ev(`player.deployed`));
  log('  靶子 = ' + await ev(`(typeof RANGE!=='undefined')?RANGE.targets.length:'NO'`));
  log('  blackOv = ' + await ev(`(document.getElementById('blackOv')||{}).style.opacity`));
  log('  可见 screen = ' + await ev(`(function(){var a=[];document.querySelectorAll('.screen').forEach(function(s){if(!s.classList.contains('hidden'))a.push(s.id)});return a.join(',')||'(无)'})()`));
  log('  异常 = ' + (errs.length ? JSON.stringify(errs) : '无'));
  await shot('_repro_2_deployed.png');

  await sleep(2000);
  await shot('_repro_3_after.png');
  return finish(0);
})().catch(e => { log('FATAL ' + e.message); finish(1); });
