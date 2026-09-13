// 请求 K 视觉体检: 总血量读数 440 的布局 + 左下 HUD 截图
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9422, HTTP = 8132;
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
  const ud = path.join(require('os').tmpdir(), 'bd_' + Date.now());
  const proc = spawn(ch, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,720', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'http://127.0.0.1:' + HTTP + '/index.html'], { stdio: 'ignore' });
  await sleep(3500);
  let list = null;
  for (let i = 0; i < 25; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page'); if (!page) { console.log('NO_PAGE'); proc.kill(); srv.close(); process.exit(1); }
  const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); if (j.method === 'Runtime.exceptionThrown') errs.push('EXC ' + (j.params.exceptionDetails.exception && j.params.exceptionDetails.exception.description || '').split('\n')[0]); });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa })); });
  await rpc('Page.enable', {}); await rpc('Runtime.enable', {});
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + (o.result.exceptionDetails.exception.description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : JSON.stringify(o); };
  const shot = async (name, clip) => {
    const o = await rpc('Page.captureScreenshot', { format: 'png', clip: Object.assign({ scale: 2 }, clip) });
    if (o.result && o.result.data) { fs.writeFileSync(path.join(ROOT, name), Buffer.from(o.result.data, 'base64')); console.log('截图', name); }
  };

  await sleep(9000);
  await ev(`startMatch(); el('menu').classList.add('hidden'); showDeploy(false);`);
  await sleep(1200);
  await ev(`(function(){ selectedSpawn=-1; deployPlayer(); })()`);
  await sleep(2500);
  await ev(`initRaidBody(player,{armor:{level:2,hp:40,resist:0.25}}); player.alive=true; player.lastDmgT=nowT; player.armorDur=40; player.armorMax=40;`);
  await sleep(1500);

  const geo = JSON.parse(await ev(`(function(){
    const ids=['healthPanel','bodyWrap','bodyFig','hpTotal','vitalsCol','armorHud','ammoPanel','minimapWrap','quickHud'];
    const o={};
    for(const i of ids){ const e=document.getElementById(i); if(!e){ o[i]='MISSING'; continue; }
      const b=e.getBoundingClientRect(); o[i]={x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height),b:Math.round(b.bottom)}; }
    o.__hpText=document.getElementById('hpTotal').textContent;
    o.__hpClass=document.getElementById('hpTotal').className;
    o.__vw=window.innerWidth; o.__vh=window.innerHeight;
    return JSON.stringify(o);
  })()`));
  console.log(JSON.stringify(geo, null, 1));
  const ov = (a, b) => !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
  console.log('armorHud 与 healthPanel 重叠:', ov(geo.armorHud, geo.healthPanel));
  console.log('healthPanel 出界:', geo.healthPanel.b > geo.__vh || geo.healthPanel.x < 0);
  console.log('hpTotal 在 bodyFig 正下方:', geo.hpTotal.y >= geo.bodyFig.b - 1 && geo.hpTotal.x < geo.bodyFig.x + geo.bodyFig.w);

  await shot('smoke-hp-full.png', { x: 8, y: geo.__vh - 200, width: 300, height: 196 });

  // 受伤态: 腿/臂/胃受伤, 显示黄字
  await ev(`(function(){ damageBodyPart('legL',28,null,false); damageBodyPart('armR',22,null,false);
    damageBodyPart('stomach',30,null,false); player.bleedHeavy=0; player.bleedLight=0; player.lastDmgT=nowT; })()`);
  await sleep(1500);
  const hurt = JSON.parse(await ev(`JSON.stringify({t:document.getElementById('hpTotal').textContent,c:document.getElementById('hpTotal').className,hp:player.hp,max:player.maxHp})`));
  console.log('受伤态:', JSON.stringify(hurt));
  await shot('smoke-hp-hurt.png', { x: 8, y: geo.__vh - 200, width: 300, height: 196 });

  // 濒死态: 胸部重创 -> 红字 + 暗角
  await ev(`(function(){ damageBodyPart('thorax',62,null,false); player.bleedHeavy=0; player.bleedLight=0; player.lastDmgT=nowT; })()`);
  await sleep(1500);
  const bad = JSON.parse(await ev(`JSON.stringify({t:document.getElementById('hpTotal').textContent,c:document.getElementById('hpTotal').className,hp:player.hp,low:document.getElementById('lowOv').style.opacity,ratio:tkLowHpRatio(player)})`));
  console.log('濒死态:', JSON.stringify(bad));
  await shot('smoke-hp-bad.png', { x: 0, y: geo.__vh - 420, width: 640, height: 416 });

  console.log('页面异常数:', errs.length, errs.slice(0, 3).join(' | '));
  ws.close(); proc.kill(); srv.close();
  setTimeout(() => process.exit(0), 400);
})();
