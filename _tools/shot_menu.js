// 主页改版截图 + 布局体检: 新名称 / 广告语
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9424, HTTP = 8134;
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
  const proc = spawn(ch, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,860', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'http://127.0.0.1:' + HTTP + '/index.html'], { stdio: 'ignore' });
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

  await sleep(7000);

  const txt = await ev(`JSON.stringify({
    logo: (document.querySelector('.gameLogo')||{}).textContent,
    sub: (document.querySelector('.gameLogoSub')||{}).textContent,
    tag: (document.querySelector('.gameTagline')||{}).textContent,
    intro: (document.querySelector('.gameIntroduction')||{}).textContent,
    menuSub: (document.getElementById('menuSub')||{}).textContent,
    ver: (document.getElementById('menuVer')||{}).textContent
  })`);
  console.log('主页文案:', txt);

  const geo = JSON.parse(await ev(`(function(){
    const g=s=>{const e=document.querySelector(s); if(!e) return 'MISSING'; const b=e.getBoundingClientRect();
      return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height),b:Math.round(b.bottom),
              fs:getComputedStyle(e).fontSize, color:getComputedStyle(e).color};};
    return JSON.stringify({
      logo:g('.gameLogo'), sub:g('.gameLogoSub'), tag:g('.gameTagline'),
      intro:g('.gameIntroduction'), menuSub:g('#menuSub'), ver:g('#menuVer'),
      panel:g('.menuMain'), vw:window.innerWidth, vh:window.innerHeight
    });
  })()`));
  console.log(JSON.stringify(geo, null, 1));
  console.log('广告语在副标下方:', geo.tag.y >= geo.sub.b - 1);
  console.log('广告语在介绍上方:', geo.tag.b <= geo.intro.y + 1);
  console.log('标题未超出面板:', geo.logo.w <= geo.panel.w && geo.tag.w <= geo.panel.w);

  await shot('smoke-menu-home.png', { x: 0, y: 0, width: geo.vw, height: geo.vh });
  // 标题区特写
  await shot('smoke-menu-title.png', { x: Math.max(0, geo.panel.x - 10), y: Math.max(0, geo.logo.y - 16), width: Math.min(geo.vw, geo.panel.w + 20), height: (geo.intro.b - geo.logo.y) + 32 });

  console.log('页面异常数:', errs.length, errs.slice(0, 3).join(' | '));
  ws.close(); proc.kill(); srv.close();
  setTimeout(() => process.exit(0), 400);
})();