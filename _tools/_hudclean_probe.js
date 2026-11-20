// 确认顶部不再有裸文本 HUD
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9861;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) { try { if (ws) ws.close(); } catch (e) { } try { if (proc) proc.kill(); } catch (e) { } fs.writeFileSync(path.join(ROOT, '_tools', '_hudclean_probe.txt'), out.join('\n') + '\n', 'utf8'); process.exit(c); }
(async () => {
  const ud = path.join(require('os').tmpdir(), 'hc_' + Date.now());
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
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : String(o); };
  const shot = async (name, clip) => { const o = await rpc('Page.captureScreenshot', { format: 'png', clip: Object.assign({ scale: 2 }, clip) }); if (o.result && o.result.data) { fs.writeFileSync(path.join(ROOT, name), Buffer.from(o.result.data, 'base64')); log('  截图 → ' + name); } };

  await rpc('Page.navigate', { url: URL });
  await sleep(16000);

  log('=== DOM 检查 ===');
  log('  #helmetHud 存在 = ' + await ev(`!!document.getElementById('helmetHud')`));
  log('  #headsetHud 存在 = ' + await ev(`!!document.getElementById('headsetHud')`));
  log('  #armorHud 存在 = ' + await ev(`!!document.getElementById('armorHud')`));

  await ev(`(function(){ localStorage.setItem('sf_campaign','3'); localStorage.setItem('sf_autodeploy','0'); return 1; })()`);
  await rpc('Page.navigate', { url: URL });
  await sleep(17000);
  await ev(`(function(){ const b=[...document.querySelectorAll('.navBtn')].find(x=>x.dataset.p==='mPlay'); if(b) b.click(); return 1; })()`);
  await sleep(1300);
  await ev(`(function(){ const b=document.getElementById('startBtn'); if(b) b.click(); return 1; })()`);
  await sleep(7000);
  await ev(`(function(){ const b=document.getElementById('deployBtn'); if(b) b.click(); return 1; })()`);
  await sleep(3500);

  log('\n=== 部署后 ===');
  log('  顶部 300px 内的可见文本 = ' + await ev(`(function(){
    try{
      var hits=[];
      document.querySelectorAll('body *').forEach(function(e){
        if(!e.children.length && e.textContent && e.textContent.trim()){
          var r=e.getBoundingClientRect();
          var st=getComputedStyle(e);
          if(r.top<300 && r.height>0 && st.display!=='none' && st.visibility!=='hidden' && st.position!=='absolute'){
            hits.push((e.id||e.className||e.tagName)+': '+e.textContent.trim().slice(0,40));
          }
        }
      });
      return hits.length? hits.join(' || ') : '（顶部没有裸文本）';
    }catch(e){ return 'EXC '+e.message; }
  })()`));
  log('  armorHud 文案 = ' + await ev(`(document.getElementById('armorHud')||{}).textContent||'NO_EL'`));
  log('  armorHud 位置 = ' + await ev(`(function(){try{var r=document.getElementById('armorHud').getBoundingClientRect();return 'top='+Math.round(r.top)+' left='+Math.round(r.left);}catch(e){return 'EXC';}})()`));
  await shot('smoke-hud-top.png', { x: 0, y: 0, width: 1280, height: 300 });
  await shot('smoke-hud-full.png', { x: 0, y: 0, width: 1280, height: 760 });

  log('\n=== 异常 ===');
  log(errs.length ? errs.join('\n') : '无');
  finish(0);
})();
