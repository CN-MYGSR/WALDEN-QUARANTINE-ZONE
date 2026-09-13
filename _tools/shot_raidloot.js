// 截图: 友军遗体搜刮面板 + 背包弹药「装填」按钮
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9381, HTTP = 8128;
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
(async () => {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const f = path.join(ROOT, p);
    fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('404'); } else { res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); } });
  }).listen(HTTP);
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'sh_' + Date.now());
  const proc = spawn(ch, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,720', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'http://127.0.0.1:' + HTTP + '/index.html'], { stdio: 'ignore' });
  await sleep(3500);
  let list = null;
  for (let i = 0; i < 25; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page'); if (!page) { console.log('NO_PAGE'); proc.kill(); srv.close(); process.exit(1); }
  const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0; const pend = {};
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa })); });
  await rpc('Page.enable', {}); await rpc('Runtime.enable', {});
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + (o.result.exceptionDetails.exception.description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : JSON.stringify(o); };
  const shot = async fn => { const s = await rpc('Page.captureScreenshot', { format: 'png' }); if (s && s.result && s.result.data) { fs.writeFileSync(path.join(ROOT, fn), Buffer.from(s.result.data, 'base64')); return fn + ' (' + Math.round(fs.statSync(path.join(ROOT, fn)).size / 1024) + ' KB)'; } return 'FAIL'; };

  await sleep(9000);
  await ev(`startMatch(); el('menu').classList.add('hidden'); showDeploy(false);`);
  await sleep(2200);
  await ev(`(function(){ selectedSpawn=-1; deployPlayer(); })()`);
  await sleep(3000);

  // 1) 友军遗体搜刮面板
  await ev(`(function(){
    CORPSES.length=0;
    const b=combatants.find(c=>!c.isPlayer&&c.team===player.team&&c.alive);
    if(!b) return;
    const bx=b.pos.x,bz=b.pos.z; b.die(null,false);
    player.pos.x=bx+0.6; player.pos.z=bz+0.6;
    const t=lootTargetNear(); if(t){ openLootPanel(t); renderLootPanel(); }
  })()`);
  await sleep(900);
  console.log('遗体标题:', await ev(`document.getElementById('lootTitle').textContent`));
  console.log('遗体内容:', await ev(`[...document.querySelectorAll('#lootList .lootRow')].map(r=>r.textContent.trim().replace(/\\s+/g,' ')).join(' | ')`));
  console.log('友军遗体截图:', await shot('smoke-friendly-corpse.png'));
  await ev(`lootPanelClose()`);

  // 2) 背包弹药装填按钮
  await ev(`(function(){ RUN.loot={}; addLootToBag('ammo_rifle',2); addLootToBag('ammo_pistol',1); addLootToBag('medkit',1); addLootToBag('water',2); toggleBagPanel(); })()`);
  await sleep(800);
  console.log('背包行:', await ev(`[...document.querySelectorAll('#bagPanelList .bagRow')].map(r=>r.textContent.trim().replace(/\\s+/g,' ')).join(' | ')`));
  console.log('背包截图:', await shot('smoke-bag-ammo.png'));
  await ev(`bagPanelClose()`);

  // 3) 装填提示
  await ev(`(function(){ player.slots=[{key:'m4',def:WPN_DEFS.m4,mag:30,reserve:18}]; player.curW=player.slots[0]; player.medUseT=0; useLootFromBag('ammo_rifle'); })()`);
  await sleep(500);
  console.log('装填提示:', await ev(`document.getElementById('lootToast').textContent`));
  console.log('装填截图:', await shot('smoke-ammo-load.png'));

  ws.close(); proc.kill(); srv.close(); process.exit(0);
})();
