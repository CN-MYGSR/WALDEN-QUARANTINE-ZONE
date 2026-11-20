// 部署页下半部: 找到真正的滚动容器再滚
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9551;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) { try { if (ws) ws.close(); } catch (e) { } try { if (proc) proc.kill(); } catch (e) { } fs.writeFileSync(path.join(ROOT, '_tools', '_retint_shot4.txt'), out.join('\n') + '\n', 'utf8'); process.exit(c); }
(async () => {
  const ud = path.join(require('os').tmpdir(), 'rs4_' + Date.now());
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
  await ev(`(function(){ const b=[...document.querySelectorAll('.navBtn')].find(x=>x.dataset.p==='mPlay'); if(b) b.click(); else showPanel('mPlay'); return 1; })()`);
  await sleep(1800);

  log('=== 滚动容器候选 ===');
  log(await ev(`(function(){
    const r=[];
    document.querySelectorAll('*').forEach(e=>{
      if(e.scrollHeight>e.clientHeight+30 && e.clientHeight>100){
        const s=getComputedStyle(e);
        if(s.overflowY!=='visible') r.push((e.id||e.className||e.tagName)+' sh='+e.scrollHeight+' ch='+e.clientHeight+' ov='+s.overflowY);
      }
    });
    return r.slice(0,8).join(' | ');
  })()`));

  await ev(`(function(){
    let best=null;
    document.querySelectorAll('*').forEach(e=>{
      if(e.scrollHeight>e.clientHeight+30 && e.clientHeight>100 && getComputedStyle(e).overflowY!=='visible'){
        if(!best || e.scrollHeight>best.scrollHeight) best=e;
      }
    });
    if(best){ best.scrollTop = best.scrollHeight; window.__SC=best.id||best.className; return window.__SC; }
    return 'none';
  })()`);
  await sleep(800);
  log('滚动元素: ' + await ev(`window.__SC||'-'`) + ' / scrollTop=' + await ev(`(function(){let best=null;document.querySelectorAll('*').forEach(e=>{if(e.scrollHeight>e.clientHeight+30&&e.clientHeight>100&&getComputedStyle(e).overflowY!=='visible'){if(!best||e.scrollHeight>best.scrollHeight)best=e;}});return best?best.scrollTop+'/'+best.scrollHeight:'-';})()`));
  await shot('ui_retint_deploy_bottom.png');

  log('\n=== 异常 ===');
  log(errs.length ? errs.join('\n') : '无');
  finish(0);
})();
