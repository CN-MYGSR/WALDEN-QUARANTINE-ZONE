// 部署页下半部（投掷物 / 撤离通行证 / 装备保险）+ 任务页 观感检查
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9541;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) { try { if (ws) ws.close(); } catch (e) { } try { if (proc) proc.kill(); } catch (e) { } fs.writeFileSync(path.join(ROOT, '_tools', '_retint_shot3.txt'), out.join('\n') + '\n', 'utf8'); process.exit(c); }
(async () => {
  const ud = path.join(require('os').tmpdir(), 'rs3_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1400,900', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
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
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : JSON.stringify(o); };
  const shot = async n => { const o = await rpc('Page.captureScreenshot', { format: 'png' }); if (o.result && o.result.data) fs.writeFileSync(path.join(ROOT, 'outputs', n), Buffer.from(o.result.data, 'base64')); log('  已存 outputs/' + n); };

  await rpc('Page.navigate', { url: URL });
  await sleep(15000);
  await ev(`(function(){ META.wallet=999999; const w=['m4','mp40','stg44','m1911','p320','kar98','awm','hk416','qbz95','deagle','pass']; for(const k of w) META.owned[k]=(META.owned[k]||0)+1; if(typeof metaSave==='function') metaSave(); return 1; })()`);

  // 部署页滚到底
  await ev(`(function(){ const b=[...document.querySelectorAll('.navBtn')].find(x=>x.dataset.p==='mPlay'); if(b) b.click(); else showPanel('mPlay'); return 1; })()`);
  await sleep(1800);
  log('=== 部署页(滚到底) ===');
  log('  passSelect : ' + await ev(`(function(){const e=document.getElementById('passSelect'); if(!e) return 'MISSING'; const s=getComputedStyle(e); return s.color+' / bg '+s.backgroundColor+' / bd '+s.borderColor;})()`));
  log('  投掷物面板 : ' + await ev(`(function(){const e=document.getElementById('throwRow')||document.getElementById('throwBox'); if(!e) return 'MISSING'; const s=getComputedStyle(e); return s.color+' / bd '+s.borderColor;})()`));
  await ev(`(function(){ const s=document.getElementById('mPlay'); if(s) s.scrollTop = s.scrollHeight; return 1; })()`);
  await sleep(600);
  await shot('ui_retint_deploy_bottom.png');

  // 任务页
  await ev(`(function(){ const b=[...document.querySelectorAll('.navBtn')].find(x=>x.dataset.p==='mArmory'); if(b) b.click(); return 1; })()`);
  await sleep(1200);
  await ev(`(function(){ const t=[...document.querySelectorAll('#mArmory [data-ar], #mArmory .arTab, #mArmory button')].find(x=>/任务/.test(x.textContent)); if(t) t.click(); return 1; })()`);
  await sleep(1200);
  await ev(`(function(){ const s=document.getElementById('mArmory'); if(s) s.scrollTop=0; return 1; })()`);
  await sleep(400);
  log('\n=== 任务页 ===');
  log('  标题色 : ' + await ev(`(function(){const e=document.querySelector('#mArmory .arName'); return e?getComputedStyle(e).color:'-';})()`));
  await shot('ui_retint_quests.png');

  log('\n=== 异常 ===');
  log(errs.length ? errs.join('\n') : '无');
  finish(0);
})();
