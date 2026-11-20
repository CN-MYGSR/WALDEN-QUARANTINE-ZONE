// 靶场视野体检: 列出相机前方 40m 内、尺寸 >0.8m 的网格 (找出那些斜梁)
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9726;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => { out.push(s); console.log(s); };
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c){
  try { if (ws) ws.close(); } catch (e) {}
  try { if (proc) proc.kill(); } catch (e) {}
  fs.writeFileSync(path.join(ROOT, '_tools', '_range_query2.txt'), out.join('\n') + '\n', 'utf8');
  process.exit(c);
}

(async () => {
  const ud = path.join(require('os').tmpdir(), 'rq2_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud,
    '--window-size=1280,760', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'],
    { stdio: 'ignore' });
  await sleep(2500);
  let list = null;
  for (let i = 0; i < 40; i++) {
    try {
      list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => {
        let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
      }).on('error', rej));
      if (list && list.length) break;
    } catch (e) { await sleep(500); }
  }
  const page = (list || []).find(t => t.type === 'page');
  if (!page) { log('NO_PAGE'); return finish(1); }
  ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {};
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable');
  const ev = async e => {
    const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true });
    if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0];
    return o.result && o.result.result ? o.result.result.value : String(o);
  };

  await rpc('Page.navigate', { url: URL });
  await sleep(14000);
  const idx = await ev(`(function(){ for(let i=0;i<CAMPAIGNS.length;i++) if(CAMPAIGNS[i].rangeOnly) return i; return -1; })()`);
  await ev(`(function(){ localStorage.setItem('sf_campaign','${idx}'); localStorage.setItem('sf_range','1'); localStorage.setItem('sf_autodeploy','1'); return 1; })()`);
  await rpc('Page.navigate', { url: URL });
  await sleep(17000);
  await ev(`(function(){ document.getElementById('deployBtn').click(); return 1; })()`);
  await sleep(3000);
  await ev(`(function(){ player.yaw=0; player.pitch=0; return 1; })()`);
  await sleep(800);

  log(await ev(`(function(){
    var p=player.pos, rows=[];
    scene.traverse(function(o){
      if(!o.isMesh||!o.geometry) return;
      var gp=o.geometry.parameters||{};
      var w=gp.width, h=gp.height, d=gp.depth;
      if(w===undefined||h===undefined||d===undefined) return;
      if(Math.max(w,h,d)<0.8) return;
      var wp=o.getWorldPosition(new THREE.Vector3());
      var dz=p.z-wp.z, dx=p.x-wp.x;
      if(dz<0.5||dz>42) return;                       // 只看正前方
      if(Math.abs(dx)>9) return;
      var hex=(o.material&&o.material.color)?o.material.color.getHexString():'-';
      rows.push({dz:dz, s:'  d='+dz.toFixed(1)+'m  '+w.toFixed(2)+'x'+h.toFixed(2)+'x'+d.toFixed(2)
        +'  @('+wp.x.toFixed(1)+','+wp.y.toFixed(1)+','+wp.z.toFixed(1)+')  ry='+o.rotation.y.toFixed(2)+'  hex='+hex});
    });
    rows.sort(function(a,b){return a.dz-b.dz});
    return rows.slice(0,30).map(function(r){return r.s}).join('\\n')||'(空)';
  })()`));

  log('');
  log('相机 = ' + await ev(`camera.position.x.toFixed(1)+','+camera.position.y.toFixed(1)+','+camera.position.z.toFixed(1)`));
  log('玩家 = ' + await ev(`player.pos.x.toFixed(1)+','+player.pos.y.toFixed(1)+','+player.pos.z.toFixed(1)`));
  log('靶子数 = ' + await ev(`RANGE.targets.length`));
  return finish(0);
})().catch(e => { log('FATAL ' + e.message); finish(1); });
