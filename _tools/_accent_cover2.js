// 黄色强调层覆盖面检查 ②: 局内浮层 —— 计分板 / 背包 / 结算页
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9621;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) { try { if (ws) ws.close(); } catch (e) { } try { if (proc) proc.kill(); } catch (e) { } fs.writeFileSync(path.join(ROOT, '_tools', '_accent_cover2.txt'), out.join('\n') + '\n', 'utf8'); process.exit(c); }
(async () => {
  const ud = path.join(require('os').tmpdir(), 'ac2_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1500,940', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
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

  await rpc('Page.navigate', { url: URL });
  await sleep(15000);
  await ev(`(function(){ META.wallet=999999; const w=['m4','mp40','stg44','m1911','p320','kar98','awm','hk416','qbz95','deagle','pass','g17']; for(const k of w) META.owned[k]=(META.owned[k]||0)+1; if(typeof metaSave==='function') metaSave(); return 1; })()`);
  await ev(`(function(){ const b=[...document.querySelectorAll('.navBtn')].find(x=>x.dataset.p==='mPlay'); if(b) b.click(); return 1; })()`);
  await sleep(1200);
  await ev(`(function(){ const b=document.getElementById('startBtn'); if(b) b.click(); return 1; })()`);
  await sleep(6500);
  await ev(`(function(){ const b=document.getElementById('deployBtn'); if(b) b.click(); return 1; })()`);
  await sleep(3500);
  log('开局: ' + await ev(`(function(){try{return player.alive+' / hp '+Math.round(player.hp);}catch(e){return 'EXC '+e.message;}})()`));

  // ① 计分板
  log('\n=== 计分板 ===');
  await ev(`(function(){ document.getElementById('scoreboard').style.display='block'; if(typeof updateScoreboard==='function') updateScoreboard(); return 1; })()`);
  await sleep(900);
  log('  h3 色 : ' + await ev(`getComputedStyle(document.querySelector('#scoreboard h3')).color`));
  log('  th 色 : ' + await ev(`getComputedStyle(document.querySelector('#scoreboard th')).color`));
  await shot('accent_scoreboard.png');
  await ev(`(function(){ document.getElementById('scoreboard').style.display='none'; return 1; })()`);

  // ② 背包
  log('\n=== 背包面板 ===');
  const bag = await ev(`(function(){ if(typeof toggleBagPanel!=='function') return 'NO_FN'; toggleBagPanel(); return document.getElementById('bagPanel').className; })()`);
  await sleep(900);
  log('  toggle 返回 : ' + bag);
  log('  标题色 : ' + await ev(`(function(){const e=document.getElementById('bagPanelTitle');return e?getComputedStyle(e).color:'-';})()`));
  await shot('accent_bag.png');
  await ev(`(function(){ if(typeof toggleBagPanel==='function') toggleBagPanel(); return 1; })()`);

  // ③ 结算页
  log('\n=== 结算页 ===');
  const fr = await ev(`(function(){ try{ finishRaid(true); return 'OK'; }catch(e){ return 'EXC '+e.message; } })()`);
  await sleep(2000);
  log('  finishRaid : ' + fr);
  log('  end 可见 : ' + await ev(`(function(){const e=document.getElementById('end');return e?!e.classList.contains('hidden'):'MISSING';})()`));
  log('  endTitle : ' + await ev(`(function(){const e=document.getElementById('endTitle');return e?e.textContent.trim()+' / '+getComputedStyle(e).color:'-';})()`));
  await shot('accent_end.png');

  log('\n=== 异常 ===');
  log(errs.length ? errs.join('\n') : '无');
  finish(0);
})();
