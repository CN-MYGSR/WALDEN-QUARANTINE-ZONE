// 街区多撤离点 实机冒烟 (headless Chrome + CDP + no-cache 服务器)
// 检查: ① EXTRACT_POINTS 数量 ② 坐标 ③ 站在新撤离点能正常推进撤离进度 ④ 无控制台异常
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9459, URL = 'http://127.0.0.1:8123/index.html';
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = spawn('python', [path.join(ROOT, '_tools', 'serve_nocache.py'), '8123'], { stdio: 'ignore' });
  await sleep(1200);
  const ud = path.join(require('os').tmpdir(), 'extractmulti_' + Date.now());
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,760', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  await sleep(2500);
  let list = null;
  for (let i = 0; i < 40; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list && list.length) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page');
  if (!page) { log('NO_PAGE'); proc.kill(); srv.kill(); fs.writeFileSync('_tools/extract_multi_live.txt', out.join('\n') + '\n', 'utf8'); process.exit(1); }
  const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); if (j.method === 'Runtime.exceptionThrown') errs.push('EXC ' + ((j.params.exceptionDetails.exception || {}).description || '').split('\n')[0]); if (j.method === 'Log.entryAdded' && j.params.entry.level === 'error') errs.push('LOG ' + String(j.params.entry.text).slice(0, 160)); });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable'); await rpc('Log.enable');
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : String(o); };
  const shot = async name => { const o = await rpc('Page.captureScreenshot', { format: 'png' }); if (o.result && o.result.data) fs.writeFileSync(path.join(ROOT, 'outputs', name), Buffer.from(o.result.data, 'base64')); };
  await rpc('Page.navigate', { url: URL });
  await sleep(6000);

  log('=== 1. 撤离点数量与坐标 ===');
  log('当前地图: ' + await ev(`CAMPAIGN.id`));
  log('CAMPAIGN.extract: ' + await ev(`JSON.stringify(CAMPAIGN.extract)`));
  log('EXTRACT_POINTS.length: ' + await ev(`EXTRACT_POINTS.length`));
  log('坐标: ' + await ev(`JSON.stringify(EXTRACT_POINTS.map(p=>[Math.round(p.x),Math.round(p.z),p.r]))`));

  log('');
  log('=== 2. 开局并验证撤离推进 ===');
  await ev(`(function(){try{startMatch();}catch(e){return 'EXC '+e.message;}return 'OK';})()`);
  await sleep(1000);
  log('开局后 EXTRACT_POINTS.length: ' + await ev(`EXTRACT_POINTS.length`));
  log('站在 (-76,-76) 撤离: ' + await ev(`(function(){
    const ex=EXTRACT_POINTS.find(p=>Math.abs(p.x+76)<1&&Math.abs(p.z+76)<1);
    if(!ex) return '没找到该点';
    player.alive=true; player.deployed=true; player.pos.set(-76,0,-76);
    let p=0; for(let i=0;i<60;i++){ updateExtraction(1/30); p=ex.progress; }
    const r=ex.progress;
    // 还原
    player.alive=false; player.deployed=false; ex.progress=0; RUN.extracting=false;
    return 'progress='+r.toFixed(2)+' · extracting='+(RUN.extracting?'true':'false');
  })()`));
  log('站在 (0,88) 撤离(原北侧): ' + await ev(`(function(){
    const ex=EXTRACT_POINTS.find(p=>Math.abs(p.x-0)<1&&Math.abs(p.z-88)<1);
    if(!ex) return '没找到该点';
    player.alive=true; player.deployed=true; player.pos.set(0,0,88);
    for(let i=0;i<60;i++) updateExtraction(1/30);
    const r=ex.progress;
    player.alive=false; player.deployed=false; ex.progress=0; RUN.extracting=false;
    return 'progress='+r.toFixed(2);
  })()`));

  log('');
  log('=== 3. 大地图/小地图标记 ===');
  log('小地图撤离标记绘制(遍历所有点): ' + await ev(`(function(){const s=drawMinimap.toString();return /for\s*\(const ex of EXTRACT_POINTS\)/.test(s)||s.indexOf('EXTRACT_POINTS')>=0?'OK':'MISSING';})()`));

  log('');
  log('=== 控制台异常 ===');
  log(errs.length ? errs.slice(0, 10).join('\n') : '无');
  ws.close(); proc.kill(); srv.kill();
  fs.writeFileSync(path.join(ROOT, '_tools', 'extract_multi_live.txt'), out.join('\n') + '\n', 'utf8');
  process.exit(0);
})().catch(e => { log('FATAL ' + e.message); fs.writeFileSync(path.join(ROOT, '_tools', 'extract_multi_live.txt'), out.join('\n') + '\n', 'utf8'); process.exit(1); });
