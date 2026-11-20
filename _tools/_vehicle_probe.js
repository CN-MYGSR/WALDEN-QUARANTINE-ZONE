// 载具现状检查: 运行时到底有没有坦克/飞机/APC, 以及有哪些载具相关 UI 残留
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9741;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) { try { if (ws) ws.close(); } catch (e) { } try { if (proc) proc.kill(); } catch (e) { } fs.writeFileSync(path.join(ROOT, '_tools', '_vehicle_probe.txt'), out.join('\n') + '\n', 'utf8'); process.exit(c); }
(async () => {
  const ud = path.join(require('os').tmpdir(), 'vh_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,760', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  await sleep(2500);
  let list = null;
  for (let i = 0; i < 40; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list && list.length) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page');
  if (!page) { log('NO_PAGE'); return finish(1); }
  ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); if (j.method === 'Runtime.exceptionThrown') { const s = ((j.params.exceptionDetails.exception || {}).description || '').split('\n')[0]; if (errs.indexOf(s) < 0) errs.push(s); } });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable');
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : String(o); };

  await rpc('Page.navigate', { url: URL });
  await sleep(15000);
  await ev(`(function(){ localStorage.setItem('sf_campaign','0'); localStorage.setItem('sf_autodeploy','0'); return 1; })()`);
  await rpc('Page.navigate', { url: URL });
  await sleep(17000);

  log('=== 载具类是否可用 ===');
  for (const n of ['Tank', 'Plane', 'APC', 'tanks', 'planes', 'apcs', 'shells', 'flakShots', 'planeWrecks', 'TANK_DEFS', 'TANK_CREW_PROXIES']) {
    log('  ' + n.padEnd(18) + ' = ' + await ev(`typeof ${n}`));
  }

  log('\n=== 开局前 ===');
  log('  tanks/planes/apcs = ' + await ev(`(typeof tanks!=='undefined'?tanks.length:'-')+' / '+(typeof planes!=='undefined'?planes.length:'-')+' / '+(typeof apcs!=='undefined'?apcs.length:'-')`));

  await ev(`(function(){ const b=[...document.querySelectorAll('.navBtn')].find(x=>x.dataset.p==='mPlay'); if(b) b.click(); return 1; })()`);
  await sleep(1300);
  await ev(`(function(){ const b=document.getElementById('startBtn'); if(b) b.click(); return 1; })()`);
  await sleep(7000);
  await ev(`(function(){ const b=document.getElementById('deployBtn'); if(b) b.click(); return 1; })()`);
  await sleep(4000);

  log('\n=== 开局后 ===');
  log('  tanks/planes/apcs = ' + await ev(`(typeof tanks!=='undefined'?tanks.length:'-')+' / '+(typeof planes!=='undefined'?planes.length:'-')+' / '+(typeof apcs!=='undefined'?apcs.length:'-')`));
  log('  有 onVehicle 的 bot = ' + await ev(`(function(){try{return combatants.filter(s=>s.onVehicle).length;}catch(e){return 'EXC';}})()`));
  log('  TANK_CREW_PROXIES  = ' + await ev(`(typeof TANK_CREW_PROXIES!=='undefined'?TANK_CREW_PROXIES.length:'-')`));
  log('  UNITS（单位编队）  = ' + await ev(`(function(){try{return typeof UNITS!=='undefined'?Object.keys(UNITS).length:'-';}catch(e){return 'EXC';}})()`));

  log('\n=== UI / 文案残留 ===');
  log('  #tickets / 载具 HUD 元素 = ' + await ev(`JSON.stringify(['vehHud','tankHud','planeHud','apcHud','vehPip','tankPip','apcPip'].map(function(i){var e=document.getElementById(i);return i+':'+(e?'有':'无');}))`));
  log('  含"载具"的可见文本 = ' + await ev(`(function(){
    var hits=[];
    var all=document.querySelectorAll('div,span,b,li,p');
    for(var i=0;i<all.length;i++){
      var t=(all[i].textContent||'');
      if(t.indexOf('载具')>=0 && all[i].children.length===0 && t.length<200) hits.push(all[i].id||all[i].className||'?');
    }
    return hits.length? hits.slice(0,12).join(' | ') : '（无）';
  })()`));
  log('  ctrlHelp 里的载具字样 = ' + await ev(`(function(){var e=document.getElementById('ctrlHelp');return e?(e.textContent.indexOf('载具')>=0?'有':'无'):'NO_EL';})()`));

  log('\n=== 异常 ===');
  log(errs.length ? errs.join('\n') : '无');
  finish(0);
})();
