// 查厅内的圆柱体/其它异形 (那些斜着的绿色大梁)
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9728;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => { out.push(s); console.log(s); };
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c){
  try { if (ws) ws.close(); } catch (e) {}
  try { if (proc) proc.kill(); } catch (e) {}
  fs.writeFileSync(path.join(ROOT, '_tools', '_range_query4.txt'), out.join('\n') + '\n', 'utf8');
  process.exit(c);
}

(async () => {
  const ud = path.join(require('os').tmpdir(), 'rq4_' + Date.now());
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
    const r = o.result && o.result.result;
    if (!r) return String(o);
    return (typeof r.value === 'object' && r.value !== null) ? JSON.stringify(r.value) : r.value;
  };

  await rpc('Page.navigate', { url: URL });
  await sleep(14000);
  const idx = await ev(`(function(){ for(let i=0;i<CAMPAIGNS.length;i++) if(CAMPAIGNS[i].rangeOnly) return i; return -1; })()`);
  await ev(`(function(){ localStorage.setItem('sf_campaign','${idx}'); localStorage.setItem('sf_range','1'); localStorage.setItem('sf_autodeploy','1'); return 1; })()`);
  await rpc('Page.navigate', { url: URL });
  await sleep(17000);

  log('=== 厅内 (|x|<9, -20<z<16) 的非盒子几何 ===');
  log(await ev(`(function(){
    var rows=[];
    scene.traverse(function(o){
      if(!o.isMesh||!o.geometry||!o.geometry.parameters) return;
      var gp=o.geometry.parameters;
      if(gp.width!==undefined) return;                       // 只看非 Box
      var p=o.getWorldPosition(new THREE.Vector3());
      if(Math.abs(p.x)>9.5||p.z<-20.5||p.z>16.5) return;
      var hex=(o.material&&o.material.color)?o.material.color.getHexString():'-';
      rows.push('  '+(o.geometry.type)+' @('+p.x.toFixed(1)+','+p.y.toFixed(1)+','+p.z.toFixed(1)+')'
        +' r='+(gp.radiusTop!==undefined?gp.radiusTop+'/'+gp.radiusBottom:'-')
        +' h='+(gp.height!==undefined?gp.height:'-')
        +' rot=('+o.rotation.x.toFixed(2)+','+o.rotation.y.toFixed(2)+','+o.rotation.z.toFixed(2)+')'
        +' hex='+hex);
    });
    return rows.length? rows.join('\\n') : '(厅内没有非盒子几何)';
  })()`));

  log('');
  log('=== 厅内所有 mesh 按 hex 统计 ===');
  log(await ev(`(function(){
    var m={};
    scene.traverse(function(o){
      if(!o.isMesh||!o.material||!o.material.color) return;
      var p=o.getWorldPosition(new THREE.Vector3());
      if(Math.abs(p.x)>9.5||p.z<-20.5||p.z>16.5) return;
      var k=o.material.color.getHexString();
      m[k]=(m[k]||0)+1;
    });
    return Object.keys(m).sort().map(function(k){return k+':'+m[k]}).join('  ');
  })()`));

  log('');
  log('=== 最近相机 12 个 mesh (含旋转) ===');
  log(await ev(`(function(){
    var p=player.pos, rows=[];
    scene.traverse(function(o){
      if(!o.isMesh) return;
      var wp=o.getWorldPosition(new THREE.Vector3());
      var d=Math.hypot(wp.x-p.x,wp.z-p.z);
      if(d>14) return;
      var gp=(o.geometry&&o.geometry.parameters)||{};
      rows.push({d:d,s:'  d='+d.toFixed(1)+' '+o.geometry.type
        +' '+(gp.width!==undefined?gp.width.toFixed(2)+'x'+gp.height.toFixed(2)+'x'+gp.depth.toFixed(2):'r'+(gp.radiusTop||0))
        +' @('+wp.x.toFixed(1)+','+wp.y.toFixed(1)+','+wp.z.toFixed(1)+')'
        +' rot=('+o.rotation.x.toFixed(2)+','+o.rotation.y.toFixed(2)+','+o.rotation.z.toFixed(2)+')'
        +' hex='+((o.material&&o.material.color)?o.material.color.getHexString():'-')});
    });
    rows.sort(function(a,b){return a.d-b.d});
    return rows.slice(0,12).map(function(r){return r.s}).join('\\n');
  })()`));

  return finish(0);
})().catch(e => { log('FATAL ' + e.message); finish(1); });
