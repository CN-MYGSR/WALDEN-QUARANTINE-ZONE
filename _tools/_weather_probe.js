// 天气选择器验收 (恢复遗失 UI 后)
// 覆盖: 部署界面出现天气行 · 当前项高亮 · 描述文字 · 点击后写 sf_weather 并重载 · 重载后 WEATHER_MODE 生效
// 用法: node _tools/_weather_probe.js [url]
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9513;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(code) {
  try { if (ws) ws.close(); } catch (e) { }
  try { if (proc) proc.kill(); } catch (e) { }
  fs.writeFileSync(path.join(ROOT, '_tools', '_weather_probe.txt'), out.join('\n') + '\n', 'utf8');
  process.exit(code);
}
(async () => {
  const ud = path.join(require('os').tmpdir(), 'wx_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,800', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  await sleep(2500);
  let list = null;
  for (let i = 0; i < 40; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list && list.length) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page');
  if (!page) { log('NO_PAGE'); return finish(1); }
  ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => {
    const j = JSON.parse(m);
    if (j.id && pend[j.id]) pend[j.id](j);
    if (j.method === 'Runtime.exceptionThrown') errs.push('EXC ' + ((j.params.exceptionDetails.exception || {}).description || '').split('\n')[0]);
  });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable');
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : String(o); };

  await rpc('Page.navigate', { url: URL });
  await sleep(14000);
  await ev(`localStorage.removeItem('sf_weather'); localStorage.setItem('sf_campaign','0');`);
  await rpc('Page.navigate', { url: URL });
  await sleep(15000);

  log('=== 1) 部署界面里的天气行 ===');
  await ev(`(function(){el('mHome').classList.add('hidden');el('mPlay').classList.remove('hidden');if(typeof refreshLoadoutSelects==='function')refreshLoadoutSelects();return 'OK';})()`);
  await sleep(600);
  log('#weatherRow 存在 : ' + await ev(`!!el('weatherRow')`));
  log('按钮 : ' + await ev(`[...document.querySelectorAll('#weatherRow [data-wx]')].map(b=>b.dataset.wx+'='+b.textContent).join(' ')`));
  log('当前高亮 : ' + await ev(`[...document.querySelectorAll('#weatherRow [data-wx].sel')].map(b=>b.dataset.wx).join(',')||'(无)'`));
  log('#weatherDesc : ' + await ev(`el('weatherDesc')?el('weatherDesc').textContent:'NO_EL'`));
  log('WEATHER_MODE : ' + await ev(`WEATHER_MODE`));

  log('');
  log('=== 2) 点「迷雾」应写 sf_weather 并重载 ===');
  await ev(`(function(){const b=document.querySelector('#weatherRow [data-wx="fog"]');b.click();return 'clicked';})()`);
  await sleep(2000);
  log('localStorage.sf_weather : ' + await ev(`localStorage.getItem('sf_weather')`));

  log('');
  log('=== 3) 重载后生效 ===');
  await rpc('Page.navigate', { url: URL });
  await sleep(15000);
  log('WEATHER_MODE (应 fog) : ' + await ev(`WEATHER_MODE`));
  log('WEATHER (实际生效值)  : ' + await ev(`WEATHER`));
  log('NIGHT : ' + await ev(`NIGHT`));
  await ev(`(function(){el('mHome').classList.add('hidden');el('mPlay').classList.remove('hidden');return 'OK';})()`);
  await sleep(500);
  log('高亮项 (应 fog) : ' + await ev(`[...document.querySelectorAll('#weatherRow [data-wx].sel')].map(b=>b.dataset.wx).join(',')||'(无)'`));
  log('描述 : ' + await ev(`el('weatherDesc')?el('weatherDesc').textContent:'NO_EL'`));

  log('');
  log('=== 4) 点回「晴朗」 ===');
  await ev(`(function(){const b=document.querySelector('#weatherRow [data-wx="clear"]');b.click();return 'clicked';})()`);
  await sleep(2000);
  log('localStorage.sf_weather (应 clear) : ' + await ev(`localStorage.getItem('sf_weather')`));

  log('');
  log('=== 5) 异常 ===');
  log(errs.length ? errs.slice(0, 8).join('\n') : '无');
  finish(0);
})().catch(e => { log('FATAL ' + e.message); finish(1); });
