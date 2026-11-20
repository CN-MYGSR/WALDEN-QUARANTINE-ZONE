// 敌方 NPC 散布检查: 每张图测密度 / 最近邻距离 / 占地图面积比
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9771;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) { try { if (ws) ws.close(); } catch (e) { } try { if (proc) proc.kill(); } catch (e) { } fs.writeFileSync(path.join(ROOT, '_tools', '_spread_probe.txt'), out.join('\n') + '\n', 'utf8'); process.exit(c); }
(async () => {
  const ud = path.join(require('os').tmpdir(), 'sp_' + Date.now());
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
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : String(o); };

  await rpc('Page.navigate', { url: URL });
  await sleep(14000);
  const NAMES = ['街区', '秘密实验室', '港口', '瓦尔登机场'];
  const STAT = `(function(){
    try{
      var e=[], t=1-player.team;
      for(var i=0;i<soldiers.length;i++){ var s=soldiers[i]; if(s.team!==t) continue; e.push(s); }
      if(!e.length) return 'NO_ENEMY';
      var xs=e.map(function(s){return s.pos.x;}), zs=e.map(function(s){return s.pos.z;});
      var minx=Math.min.apply(null,xs), maxx=Math.max.apply(null,xs);
      var minz=Math.min.apply(null,zs), maxz=Math.max.apply(null,zs);
      // 最近邻
      var nn=[];
      for(var i=0;i<e.length;i++){
        var bd=1e9;
        for(var j=0;j<e.length;j++){ if(i===j) continue;
          var d=Math.hypot(e[i].pos.x-e[j].pos.x, e[i].pos.z-e[j].pos.z); if(d<bd) bd=d; }
        nn.push(bd);
      }
      nn.sort(function(a,b){return a-b;});
      var avg=nn.reduce(function(a,b){return a+b;},0)/nn.length;
      // 离各自基地的距离
      var eb=BASES[t];
      var ds=e.map(function(s){return Math.hypot(s.pos.x-eb.x,s.pos.z-eb.z);});
      var dmin=Math.min.apply(null,ds), dmax=Math.max.apply(null,ds);
      // 覆盖面积占地图比例
      var area=(maxx-minx)*(maxz-minz), mapArea=MAP_SIZE*MAP_SIZE;
      return 'n='+e.length
        +'  包围盒 '+(maxx-minx).toFixed(0)+'×'+(maxz-minz).toFixed(0)+'m (占地图 '+(area/mapArea*100).toFixed(1)+'%)'
        +'  最近邻 中位'+(nn[Math.floor(nn.length/2)]).toFixed(1)+'m/均'+avg.toFixed(1)+'m/最近'+nn[0].toFixed(1)+'m'
        +'  离基地 '+dmin.toFixed(0)+'~'+dmax.toFixed(0)+'m'
        +'  地图 '+MAP_SIZE+'m';
    }catch(err){ return 'EXC '+err.message; }
  })()`;

  for (let idx = 0; idx < 4; idx++) {
    errs.length = 0;
    await ev(`(function(){ localStorage.setItem('sf_campaign','${idx}'); localStorage.setItem('sf_autodeploy','0'); return 1; })()`);
    await rpc('Page.navigate', { url: URL });
    await sleep(17000);
    await ev(`(function(){ const b=[...document.querySelectorAll('.navBtn')].find(x=>x.dataset.p==='mPlay'); if(b) b.click(); return 1; })()`);
    await sleep(1300);
    await ev(`(function(){ const b=document.getElementById('startBtn'); if(b) b.click(); return 1; })()`);
    await sleep(7000);
    await ev(`(function(){ const b=document.getElementById('deployBtn'); if(b) b.click(); return 1; })()`);
    await sleep(2500);
    log('===== [' + idx + '] ' + NAMES[idx] + ' =====');
    log('  ' + await ev(STAT));
    log('  小队锚点 = ' + await ev(`(function(){try{
      var m={};
      for(var i=0;i<soldiers.length;i++){ var s=soldiers[i]; if(s.team===player.team) continue;
        if(s.squadAnchor) m[Math.round(s.squadAnchor.x)+','+Math.round(s.squadAnchor.z)]=1; }
      return Object.keys(m).join(' | ');
    }catch(e){return 'EXC';}})()`));
    log('  逐小队 = ' + await ev(`(function(){try{
      var g={};
      for(var i=0;i<soldiers.length;i++){ var s=soldiers[i]; if(s.team===player.team) continue;
        var k=s.squadGroup||0; (g[k]=g[k]||[]).push(Math.round(s.pos.x)+','+Math.round(s.pos.z)); }
      var r=[]; for(var k in g) r.push('组'+k+': '+g[k].join(' '));
      return r.join('  |  ');
    }catch(e){return 'EXC';}})()`));
    log('  异常 = ' + (errs.length ? errs.join(' | ') : '无'));
  }
  finish(0);
})();
