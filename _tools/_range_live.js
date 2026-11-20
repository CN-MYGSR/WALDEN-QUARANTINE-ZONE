// 靶场实机探针: 真的用无头 Chrome 打开靶场图, 看建图/部署/靶子/弹药是否正常
// 用法: (python _tools/serve_nocache.py 8123 &) ; node _tools/_range_live.js
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9723;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => { out.push(s); console.log(s); };
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c){
  try { if (ws) ws.close(); } catch (e) {}
  try { if (proc) proc.kill(); } catch (e) {}
  fs.writeFileSync(path.join(ROOT, '_tools', '_range_live.txt'), out.join('\n') + '\n', 'utf8');
  process.exit(c);
}

(async () => {
  const ud = path.join(require('os').tmpdir(), 'rg_' + Date.now());
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
  let id = 0; const pend = {}; let errs = [];
  ws.on('message', m => {
    const j = JSON.parse(m);
    if (j.id && pend[j.id]) pend[j.id](j);
    if (j.method === 'Runtime.exceptionThrown') {
      const d = j.params.exceptionDetails;
      const s = ((d.exception || {}).description || d.text || '').split('\n').slice(0, 2).join(' | ');
      if (errs.indexOf(s) < 0) errs.push(s);
    }
  });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable');
  const ev = async e => {
    const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true });
    if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0];
    return o.result && o.result.result ? o.result.result.value : String(o);
  };

  // ① 先加载一次, 写 localStorage
  await rpc('Page.navigate', { url: URL });
  await sleep(14000);
  const idx = await ev(`(function(){ for(let i=0;i<CAMPAIGNS.length;i++) if(CAMPAIGNS[i].rangeOnly) return i; return -1; })()`);
  log('靶场地图索引 = ' + idx);
  await ev(`(function(){ localStorage.setItem('sf_campaign','${idx}'); localStorage.setItem('sf_range','1'); localStorage.setItem('sf_autodeploy','1'); return 1; })()`);

  // ② 带靶场标记重新加载
  errs = [];
  await rpc('Page.navigate', { url: URL });
  await sleep(17000);

  log('');
  log('===== 加载后 =====');
  log('  CAMPAIGN.id/layout = ' + await ev(`CAMPAIGN.id + ' / ' + CAMPAIGN.layout`));
  log('  mapSize/MAP_SIZE   = ' + await ev(`CAMPAIGN.mapSize + ' / ' + MAP_SIZE`));
  log('  forceWeather/WEATHER = ' + await ev(`CAMPAIGN.forceWeather + ' / ' + WEATHER`));
  log('  layoutRange 存在   = ' + await ev(`typeof layoutRange`));
  log('  靶场按钮存在       = ' + await ev(`!!document.getElementById('rangeBtn')`));
  log('  RANGE 对象         = ' + await ev(`typeof RANGE`));
  log('  rangeActive()      = ' + await ev(`(typeof rangeActive==='function')?rangeActive():'NO_FN'`));
  log('  场景对象数         = ' + await ev(`(scene&&scene.children)?scene.children.length:-1`));
  log('  部署面板可见       = ' + await ev(`!document.getElementById('deploy').classList.contains('hidden')`));
  log('  武器下拉选项数     = ' + await ev(`document.getElementById('arsenalSelect')?document.getElementById('arsenalSelect').options.length:-1`));
  log('  当前选中武器       = ' + await ev(`document.getElementById('arsenalSelect')?document.getElementById('arsenalSelect').value:'-'`));
  log('  arsenalStats       = ' + await ev(`(document.getElementById('arsenalStats')||{}).textContent||'-'`));
  log('  部署按钮可见       = ' + await ev(`document.getElementById('deployBtn').style.display`));
  log('  离开按钮存在       = ' + await ev(`!!document.getElementById('rangeExitBtn')`));
  log('  加载期异常         = ' + (errs.length ? JSON.stringify(errs) : '无'));

  // ③ 点部署
  errs = [];
  await ev(`(function(){ document.getElementById('deployBtn').click(); return 1; })()`);
  await sleep(3000);
  log('');
  log('===== 点「部署」之后 =====');
  log('  deployed/alive     = ' + await ev(`player.deployed + ' / ' + player.alive`));
  log('  位置               = ' + await ev(`player.pos.x.toFixed(1)+','+player.pos.y.toFixed(1)+','+player.pos.z.toFixed(1)`));
  log('  朝向 yaw           = ' + await ev(`player.yaw.toFixed(2)`));
  log('  武器槽             = ' + await ev(`player.slots.map(function(s){return s.key+':'+s.reserve}).join(',')`));
  log('  靶子数             = ' + await ev(`(typeof RANGE!=='undefined')?RANGE.targets.length:'NO_RANGE'`));
  log('  靶子距离           = ' + await ev(`(typeof RANGE!=='undefined')?RANGE.targets.map(function(t){return t.d}).join(','):'-'`));
  log('  靶子屏幕内?        = ' + await ev(`(function(){
    if(typeof RANGE==='undefined'||!RANGE.targets.length) return 'NO_TARGETS';
    var n=0; for(var i=0;i<RANGE.targets.length;i++){ var b=RANGE.targets[i].board; if(b&&b.parent) n++; }
    return n+' 个已挂进场景';
  })()`));
  log('  matchTime          = ' + await ev(`matchTime.toFixed(0)`));
  log('  HUD 文本           = ' + await ev(`(document.getElementById('rangeStat')||{}).textContent||'-'`));
  log('  部署后异常         = ' + (errs.length ? JSON.stringify(errs) : '无'));

  // ④ 模拟开一枪, 看射击计数与命中
  errs = [];
  await ev(`(function(){
    try{
      var w=player.curW; if(!w) return 'NO_WEAPON';
      var o={x:player.pos.x,y:player.pos.y+1.5,z:player.pos.z};
      var dir={x:0,y:0,z:-1};
      fireBullet(player,o,dir,w.def,null);
      return 'ok';
    }catch(e){ return 'EXC:'+e.message; }
  })()`);
  await sleep(300);
  log('');
  log('===== 开一枪之后 =====');
  log('  射击/命中          = ' + await ev(`RANGE.shots+' / '+RANGE.hits`));
  log('  当前弹匣/备弹      = ' + await ev(`player.curW.mag+' / '+player.curW.reserve`));
  log('  开枪异常           = ' + (errs.length ? JSON.stringify(errs) : '无'));

  return finish(0);
})().catch(e => { log('FATAL ' + e.message); finish(1); });
