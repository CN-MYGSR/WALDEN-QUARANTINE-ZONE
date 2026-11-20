// 验证「资源加载失败兜底」：① 正常加载不应出现遮罩 ② 屏蔽一个核心脚本后必须出现遮罩
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8124/index.html';
const PORT = 9581;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) { try { if (ws) ws.close(); } catch (e) { } try { if (proc) proc.kill(); } catch (e) { } fs.writeFileSync(path.join(ROOT, '_tools', '_loadfail_probe.txt'), out.join('\n') + '\n', 'utf8'); process.exit(c); }
(async () => {
  const ud = path.join(require('os').tmpdir(), 'lf_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1400,900', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  await sleep(2500);
  let list = null;
  for (let i = 0; i < 40; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list && list.length) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page');
  if (!page) { log('NO_PAGE'); return finish(1); }
  ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {};
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable'); await rpc('Network.enable');
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : String(o); };
  const shot = async n => { const o = await rpc('Page.captureScreenshot', { format: 'png' }); if (o.result && o.result.data) fs.writeFileSync(path.join(ROOT, 'outputs', n), Buffer.from(o.result.data, 'base64')); log('  已存 outputs/' + n); };

  // ---------- ① 正常加载 ----------
  log('=== ① 正常加载（不应出现遮罩）===');
  await rpc('Page.navigate', { url: URL });
  await sleep(15000);
  log('  #loadFailOv 存在 : ' + await ev(`!!document.getElementById('loadFailOv')`));
  log('  主菜单可见       : ' + await ev(`(function(){const m=el('menu');return m?(!m.classList.contains('hidden')):'NO_EL';})()`));
  log('  ELO 已加载       : ' + await ev(`typeof ELO`));
  log('  渲染帧数         : ' + await ev(`typeof nowT!=='undefined'?nowT.toFixed(1):'NO_nowT'`));

  // ---------- ② 屏蔽核心脚本 ----------
  log('\n=== ② 屏蔽 js/00b_elo.js（应出现遮罩）===');
  await rpc('Network.setBlockedURLs', { urls: ['*00b_elo.js*'] });
  await rpc('Page.navigate', { url: URL + (URL.indexOf('?') < 0 ? '?' : '&') + 'nf=1' });
  await sleep(16000);
  log('  #loadFailOv 存在 : ' + await ev(`!!document.getElementById('loadFailOv')`));
  log('  遮罩文案         : ' + await ev(`(function(){const d=document.getElementById('loadFailOv');return d?d.innerText.replace(/\\s+/g,' ').slice(0,120):'-';})()`));
  log('  ELO（应 undefined）: ' + await ev(`typeof ELO`));
  await shot('loadfail_guard.png');

  await rpc('Network.setBlockedURLs', { urls: [] });
  finish(0);
})();
