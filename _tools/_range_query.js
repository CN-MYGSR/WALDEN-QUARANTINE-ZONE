// 靶场场景体检: 找出画面里那些奇怪的绿色斜梁是什么
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9725;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => { out.push(s); console.log(s); };
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c){
  try { if (ws) ws.close(); } catch (e) {}
  try { if (proc) proc.kill(); } catch (e) {}
  fs.writeFileSync(path.join(ROOT, '_tools', '_range_query.txt'), out.join('\n') + '\n', 'utf8');
  process.exit(c);
}

(async () => {
  const ud = path.join(require('os').tmpdir(), 'rq_' + Date.now());
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

  log('=== 绿色系网格 (MAT.labGreen 及相近色) ===');
  log(await ev(`(function(){
    var rows=[];
    scene.traverse(function(o){
      if(!o.isMesh||!o.material||!o.material.color) return;
      var c=o.material.color, r=c.r, g=c.g, b=c.b;
      if(!(g>r*1.1&&g>b*1.1&&g>0.08)) return;      // 偏绿的
      var p=o.getWorldPosition(new THREE.Vector3());
      var s=o.scale;
      var gp=o.geometry&&o.geometry.parameters?o.geometry.parameters:{};
      rows.push('  pos('+p.x.toFixed(1)+','+p.y.toFixed(1)+','+p.z.toFixed(1)+') rotY='+o.rotation.y.toFixed(2)
        +' size='+(gp.width?gp.width.toFixed(2)+'x'+gp.height.toFixed(2)+'x'+gp.depth.toFixed(2):'?')
        +' hex='+c.getHexString()+' matName='+(o.material.name||'-'));
      if(rows.length>24) return;
    });
    return rows.join('\\n')||'  (无)';
  })()`));

  log('');
  log('=== 场景里最大的 12 个网格 ===');
  log(await ev(`(function(){
    var arr=[];
    scene.traverse(function(o){
      if(!o.isMesh||!o.geometry||!o.geometry.parameters) return;
      var gp=o.geometry.parameters;
      var v=(gp.width||1)*(gp.height||1)*(gp.depth||1);
      var p=o.getWorldPosition(new THREE.Vector3());
      arr.push({v:v,p:p,x:gp.width,h:gp.height,d:gp.depth,ry:o.rotation.y,
        hex:(o.material&&o.material.color)?o.material.color.getHexString():'-'});
    });
    arr.sort(function(a,b){return b.v-a.v});
    return arr.slice(0,12).map(function(o){
      return '  '+o.x.toFixed(1)+'x'+o.h.toFixed(1)+'x'+o.d.toFixed(1)
        +' @('+o.p.x.toFixed(1)+','+o.p.y.toFixed(1)+','+o.p.z.toFixed(1)+') ry='+o.ry.toFixed(2)+' hex='+o.hex;
    }).join('\\n');
  })()`));

  log('');
  log('=== 靶子/灯/点光源数量 ===');
  log('  靶子 board 数 = ' + await ev(`RANGE.targets.filter(function(t){return !!t.board.parent}).length`));
  log('  PointLight 数 = ' + await ev(`(function(){var n=0;scene.traverse(function(o){if(o.isPointLight)n++});return n})()`));
  log('  场景总对象     = ' + await ev(`(function(){var n=0;scene.traverse(function(){n++});return n})()`));

  return finish(0);
})().catch(e => { log('FATAL ' + e.message); finish(1); });
