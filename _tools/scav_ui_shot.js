// 截取部署界面「阵营」区域 (确认 ☠ SCAV / ✠ USEC 字形正常渲染, 无豆腐块)
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const PORT = 9477, URL = 'http://127.0.0.1:8123/index.html';
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) { try { ws && ws.close(); } catch (e) { } try { proc && proc.kill(); } catch (e) { } fs.writeFileSync(path.join(ROOT, '_tools', 'scav_ui_shot.txt'), out.join('\n') + '\n', 'utf8'); process.exit(c); }
(async () => {
  const ud = path.join(require('os').tmpdir(), 'scavui_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,1400', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
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
  await rpc('Page.enable'); await rpc('Runtime.enable');
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true }); return o.result && o.result.result ? o.result.result.value : JSON.stringify(o).slice(0, 200); };
  const shot = async n => { const o = await rpc('Page.captureScreenshot', { format: 'png' }); if (o.result && o.result.data) fs.writeFileSync(path.join(ROOT, 'outputs', n), Buffer.from(o.result.data, 'base64')); };

  for (const [camp, name] of [['0', 'scav_ui_team_bfruins.png'], ['1', 'scav_ui_team_lab.png']]) {
    await rpc('Page.navigate', { url: URL });
    await sleep(6000);
    await ev(`localStorage.setItem('sf_campaign','${camp}')`);
    await rpc('Page.navigate', { url: URL });
    await sleep(7000);
    log('camp=' + camp + ' ' + await ev(`el('teamUS').innerHTML + ' || ' + el('teamGER').innerHTML`));
    await ev(`(function(){
      document.querySelectorAll('.navBtn').forEach(b=>{ if(b.dataset.p==='mPlay') b.click(); });
      el('teamUS').scrollIntoView({block:'center'});
      const r=el('teamUS').getBoundingClientRect();
      return 'mPlay hidden='+el('mPlay').classList.contains('hidden')+' rect='+JSON.stringify([Math.round(r.x),Math.round(r.y)]);
    })()`);
    await sleep(900);
    log('  截图 ' + name);
    await shot(name);
  }
  finish(0);
})().catch(e => { log('FATAL ' + e.message); finish(1); });
