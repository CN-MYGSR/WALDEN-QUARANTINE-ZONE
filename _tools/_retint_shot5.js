// 开局部署面板 #deploy（兵种/武器/背包/医疗/食物/投掷物/通行证/保险）观感检查
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9561;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) { try { if (ws) ws.close(); } catch (e) { } try { if (proc) proc.kill(); } catch (e) { } fs.writeFileSync(path.join(ROOT, '_tools', '_retint_shot5.txt'), out.join('\n') + '\n', 'utf8'); process.exit(c); }
(async () => {
  const ud = path.join(require('os').tmpdir(), 'rs5_' + Date.now());
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
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : JSON.stringify(o); };
  const shot = async n => { const o = await rpc('Page.captureScreenshot', { format: 'png' }); if (o.result && o.result.data) fs.writeFileSync(path.join(ROOT, 'outputs', n), Buffer.from(o.result.data, 'base64')); log('  已存 outputs/' + n); };

  await rpc('Page.navigate', { url: URL });
  await sleep(15000);
  await ev(`(function(){ META.wallet=999999; const w=['m4','mp40','stg44','m1911','p320','kar98','awm','hk416','qbz95','deagle','pass','g17']; for(const k of w) META.owned[k]=(META.owned[k]||0)+1; if(typeof metaSave==='function') metaSave(); return 1; })()`);

  // 进入街区 → 触发 #deploy
  await ev(`(function(){ const b=[...document.querySelectorAll('.navBtn')].find(x=>x.dataset.p==='mPlay'); if(b) b.click(); else showPanel('mPlay'); return 1; })()`);
  await sleep(1500);
  log('点击 startBtn: ' + await ev(`(function(){ const b=document.getElementById('startBtn'); if(!b) return 'NO_BTN'; b.click(); return b.textContent.trim(); })()`));
  await sleep(6000);

  log('deploy 面板可见 : ' + await ev(`(function(){const e=document.getElementById('deploy'); if(!e) return 'MISSING'; return !e.classList.contains('hidden');})()`));
  log('passSelect  : ' + await ev(`(function(){const e=document.getElementById('passSelect'); if(!e) return '-'; const s=getComputedStyle(e); return s.color+' / bg '+s.backgroundColor+' / bd '+s.borderColor;})()`));
  log('throwRow 内单元格 : ' + await ev(`(function(){const e=document.querySelector('#throwRow > *'); if(!e) return '-'; const s=getComputedStyle(e); return s.color+' / bg '+s.backgroundColor+' / bd '+s.borderColor;})()`));
  log('secLabel : ' + await ev(`(function(){const e=document.querySelector('#deploy .secLabel'); if(!e) return '-'; return getComputedStyle(e).color;})()`));

  // 左栏滚到底看投掷物/通行证
  await ev(`(function(){ const e=document.getElementById('deployLeft'); if(e) e.scrollTop=e.scrollHeight; return 1; })()`);
  await sleep(500);
  await shot('ui_retint_deploy_screen.png');

  log('\n=== 异常 ===');
  log(errs.length ? errs.join('\n') : '无');
  finish(0);
})();
