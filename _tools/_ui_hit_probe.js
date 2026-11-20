// 摸清 #ui 的 pointer-events 继承情况, 以及各面板到底能不能被"真实指针"命中。
// 只读 + 一次真实触摸, 很快。
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9651;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) { try { if (ws) ws.close(); } catch (e) { } try { if (proc) proc.kill(); } catch (e) { } fs.writeFileSync(path.join(ROOT, '_tools', '_ui_hit_probe.txt'), out.join('\n') + '\n', 'utf8'); process.exit(c); }
(async () => {
  const ud = path.join(require('os').tmpdir(), 'uh_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=844,390', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  await sleep(2500);
  let list = null;
  for (let i = 0; i < 40; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list && list.length) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page');
  if (!page) { log('NO_PAGE'); return finish(1); }
  ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); if (j.method === 'Runtime.exceptionThrown') errs.push('EXC ' + ((j.params.exceptionDetails.exception || {}).description || '').split('\n')[0]); });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable');
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : String(o); };

  await rpc('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await rpc('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await rpc('Page.navigate', { url: URL });
  await sleep(16000);

  log('MOBILE=' + await ev(`typeof MOBILE!=='undefined'?MOBILE:'?'`) + '  body.mobile=' + await ev(`document.body.classList.contains('mobile')`));
  log('\n=== 计算后的 pointer-events ===');
  for (const sel of ['#ui', '#menu', '#menu .panel', '#mPlay', '#bagPanel', '#bagPanelList', '#bagPanelBtns', '#lootPanel', '#touchUI', '#tLook', '#tStickZone', '.tbtn']) {
    log('  ' + sel.padEnd(18) + ' = ' + await ev(`(function(){const e=document.querySelector(${JSON.stringify(sel)});return e?getComputedStyle(e).pointerEvents:'(无此元素)';})()`));
  }

  log('\n=== 真实触摸: 主菜单「撤离部署」按钮 ===');
  const navBox = await ev(`(function(){const b=[...document.querySelectorAll('.navBtn')].find(x=>x.dataset.p==='mPlay');if(!b)return 'NO';const r=b.getBoundingClientRect();return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)});})()`);
  if (navBox !== 'NO') {
    const { x, y } = JSON.parse(navBox);
    log('  命中元素 = ' + await ev(`(function(){const e=document.elementFromPoint(${x},${y});return e?(e.tagName+(e.id?'#'+e.id:'')+(e.className?'.'+String(e.className).replace(/\\s+/g,'.'):'')).slice(0,60):'null';})()`));
    await rpc('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1, radiusX: 12, radiusY: 12, force: 1 }] });
    await sleep(60);
    await rpc('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(1200);
    log('  点击后 #mPlay 可见 = ' + await ev(`(function(){const e=document.getElementById('mPlay');return e?!e.classList.contains('hidden'):'MISSING';})()`));
  }

  log('\n=== 真实触摸: 背包面板按钮(先开面板) ===');
  await ev(`(function(){ const b=[...document.querySelectorAll('.navBtn')].find(x=>x.dataset.p==='mPlay'); if(b) b.click(); return 1; })()`);
  await sleep(1000);
  await ev(`(function(){ const b=document.getElementById('startBtn'); if(b) b.click(); return 1; })()`);
  await sleep(6000);
  await ev(`(function(){ const b=document.getElementById('deployBtn'); if(b) b.click(); return 1; })()`);
  await sleep(3500);
  await ev(`(function(){ addLootToBag('water',2); if(!BAG_UI.open) toggleBagPanel(); return 1; })()`);
  await sleep(800);
  log('  body.bagOpen = ' + await ev(`document.body.classList.contains('bagOpen')`));
  log('  #bagPanel 计算 pointer-events = ' + await ev(`getComputedStyle(document.getElementById('bagPanel')).pointerEvents`));
  const btnBox = await ev(`(function(){const b=document.querySelector('#bagPanelBtns .bagAct[data-bact="secure"]');if(!b)return 'NO';const r=b.getBoundingClientRect();return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)});})()`);
  if (btnBox !== 'NO') {
    const { x, y } = JSON.parse(btnBox);
    log('  ' + x + ',' + y + ' 命中元素 = ' + await ev(`(function(){const e=document.elementFromPoint(${x},${y});return e?(e.tagName+(e.id?'#'+e.id:'')+(e.className?'.'+String(e.className).replace(/\\s+/g,'.'):'')).slice(0,60):'null';})()`));
  }

  log('\n=== 异常 ===');
  log(errs.length ? errs.join('\n') : '无');
  finish(0);
})();
