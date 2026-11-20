// 验证安全箱「取出」: 正常取出 / 背包满时拒绝 / 空箱时整块隐藏
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9661;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) { try { if (ws) ws.close(); } catch (e) { } try { if (proc) proc.kill(); } catch (e) { } fs.writeFileSync(path.join(ROOT, '_tools', '_securebox_probe.txt'), out.join('\n') + '\n', 'utf8'); process.exit(c); }
(async () => {
  const ud = path.join(require('os').tmpdir(), 'sb_' + Date.now());
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
  const shot = async n => { const o = await rpc('Page.captureScreenshot', { format: 'png' }); if (o.result && o.result.data) fs.writeFileSync(path.join(ROOT, 'outputs', n), Buffer.from(o.result.data, 'base64')); log('  已存 outputs/' + n); };
  const tap = async (sel) => {
    const box = await ev(`(function(){ const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return 'NO_EL'; const r=e.getBoundingClientRect(); return JSON.stringify({x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)}); })()`);
    if (box === 'NO_EL') return 'NO_EL';
    const { x, y } = JSON.parse(box);
    const hit = await ev(`(function(){ const e=document.elementFromPoint(${x},${y}); if(!e) return 'null';
      return (e.tagName+(e.id?'#'+e.id:'')+(e.className?'.'+String(e.className).replace(/\\s+/g,'.'):'')).slice(0,52); })()`);
    await rpc('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1, radiusX: 12, radiusY: 12, force: 1 }] });
    await sleep(60);
    await rpc('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(600);
    return '点击@' + x + ',' + y + ' 命中=' + hit;
  };
  const state = () => ev(`JSON.stringify({secure:RUN.secure, loot:RUN.loot, free:bagFree()})`);

  await rpc('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await rpc('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await rpc('Page.navigate', { url: URL });
  await sleep(16000);

  await ev(`(function(){ const b=[...document.querySelectorAll('.navBtn')].find(x=>x.dataset.p==='mPlay'); if(b) b.click(); return 1; })()`);
  await sleep(1200);
  await ev(`(function(){ const b=document.getElementById('startBtn'); if(b) b.click(); return 1; })()`);
  await sleep(6500);
  await ev(`(function(){ const b=document.getElementById('deployBtn'); if(b) b.click(); return 1; })()`);
  await sleep(3500);

  log('=== ① 空箱时整块应隐藏 ===');
  await ev(`(function(){ addLootToBag('water',2); addLootToBag('tourniquet',2); if(!BAG_UI.open) toggleBagPanel(); return 1; })()`);
  await sleep(800);
  log('  secBox 隐藏 = ' + await ev(`document.getElementById('secBox').classList.contains('hidden')`));

  log('\n=== ② 放进 2 件后应显示内容 ===');
  log('  放入: ' + await ev(`(function(){ secureAdd('water'); secureAdd('tourniquet'); renderBagPanel(); return JSON.stringify(RUN.secure); })()`));
  await sleep(600);
  log('  secBox 隐藏 = ' + await ev(`document.getElementById('secBox').classList.contains('hidden')`));
  log('  secStat = ' + await ev(`document.getElementById('secStat').textContent`));
  log('  行渲染 = ' + await ev(`(function(){ return JSON.stringify([...document.querySelectorAll('#secList .secRow')].map(r=>r.textContent.trim().slice(0,30))); })()`));
  await shot('securebox_mobile.png');

  log('\n=== ③ 真实触摸「取出」第一件 ===');
  log('  点击前: ' + await state());
  log('  ' + await tap('#secList .secRow:nth-child(1) .secTake'));
  log('  点击后: ' + await state());

  log('\n=== ④ 背包满时应拒绝取出 ===');
  log('  塞满背包: ' + await ev(`(function(){
    let n=0; while(bagFree()>0 && n<60){ if(!addLootToBag('water',1)) break; n++; }
    renderBagPanel(); return 'free='+bagFree();
  })()`));
  await sleep(600);
  log('  点击前: ' + await state());
  log('  ' + await tap('#secList .secRow:nth-child(1) .secTake'));
  log('  点击后: ' + await state());
  log('  提示: ' + await ev(`(function(){const e=document.getElementById('scorePop');return e?e.textContent.trim():'-';})()`));

  log('\n=== ⑤ 取空后应重新隐藏 ===');
  log('  清空背包: ' + await ev(`(function(){ RUN.loot={}; renderBagPanel(); return 'free='+bagFree(); })()`));
  await sleep(500);
  log('  ' + await tap('#secList .secRow:nth-child(1) .secTake'));
  log('  剩余 secure: ' + await ev(`JSON.stringify(RUN.secure)`));
  log('  secBox 隐藏 = ' + await ev(`document.getElementById('secBox').classList.contains('hidden')`));

  log('\n=== 异常 ===');
  log(errs.length ? errs.join('\n') : '无');
  finish(0);
})();
