// 黄色强调层覆盖面检查 ①: 军械库 6 个页签 + 开局部署面板 #deploy
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9611;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) { try { if (ws) ws.close(); } catch (e) { } try { if (proc) proc.kill(); } catch (e) { } fs.writeFileSync(path.join(ROOT, '_tools', '_accent_cover1.txt'), out.join('\n') + '\n', 'utf8'); process.exit(c); }
(async () => {
  const ud = path.join(require('os').tmpdir(), 'ac1_' + Date.now());
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
  await ev(`(function(){ META.wallet=999999; const w=['m4','mp40','stg44','m1911','p320','kar98','awm','hk416','qbz95','deagle','pass','g17','g28','mp5','ak74m']; for(const k of w) META.owned[k]=(META.owned[k]||0)+1; if(typeof metaSave==='function') metaSave(); return 1; })()`);
  await ev(`(function(){ const b=[...document.querySelectorAll('.navBtn')].find(x=>x.dataset.p==='mArmory'); if(b) b.click(); else showPanel('mArmory'); return 1; })()`);
  await sleep(1500);

  const TABS = [['store', '商店'], ['market', '市集'], ['workbench', '改枪工坊'], ['warehouse', '仓库'], ['loot', '战利品'], ['quests', '任务']];
  for (const [key, name] of TABS) {
    const r = await ev(`(function(){ const b=document.querySelector('#mArmory .arTab[data-ar="${key}"]'); if(!b) return 'NO_TAB'; b.click(); return 'ok'; })()`);
    await sleep(1100);
    await ev(`(function(){ const s=document.getElementById('mArmory'); if(s) s.scrollTop=0; return 1; })()`);
    await sleep(300);
    log('=== 军械库 · ' + name + ' (' + r + ') ===');
    log('  主色抽查: ' + await ev(`(function(){
      const pick=(s)=>{const e=document.querySelector(s); if(!e) return null; const c=getComputedStyle(e); return c.color;};
      return ['#mArmory .arName','#mArmory .arPrice','#mArmory .arWallet','#mArmory .secLabel','#mArmory .arTab.sel']
        .map(s=>s.split(' ').pop()+'='+(pick(s)||'-')).join('  ');
    })()`));
    await shot('accent_armory_' + key + '.png');
  }

  // 开局部署面板
  await ev(`(function(){ const b=[...document.querySelectorAll('.navBtn')].find(x=>x.dataset.p==='mPlay'); if(b) b.click(); return 1; })()`);
  await sleep(1200);
  await ev(`(function(){ const b=document.getElementById('startBtn'); if(b) b.click(); return 1; })()`);
  await sleep(6500);
  log('\n=== 开局部署面板 #deploy ===');
  log('  deploy 可见: ' + await ev(`(function(){const e=document.getElementById('deploy');return e?!e.classList.contains('hidden'):'MISSING';})()`));
  log('  secLabel: ' + await ev(`(function(){const e=document.querySelector('#deploy .secLabel');return e?getComputedStyle(e).color:'-';})()`));
  await ev(`(function(){ const e=document.getElementById('deployLeft'); if(e) e.scrollTop=0; return 1; })()`);
  await sleep(400);
  await shot('accent_deploy_screen.png');

  log('\n=== 异常 ===');
  log(errs.length ? errs.join('\n') : '无');
  finish(0);
})();
