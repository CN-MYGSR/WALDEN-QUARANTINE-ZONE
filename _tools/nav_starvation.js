// 诊断: NPC 是否因 NAV.budget 饥饿而卡在出生点不动
// 采集: 每个 bot 的 path 是否为 null / 距离出生点位移 / state
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9381;
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'nav_' + Date.now());
  const proc = spawn(ch, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,720', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'http://127.0.0.1:8123/index.html'], { stdio: 'ignore' });
  await sleep(3500);
  let list = null;
  for (let i = 0; i < 25; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page'); if (!page) { console.log('NO_PAGE'); proc.kill(); process.exit(1); }
  const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0; const pend = {};
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa })); });
  await rpc('Page.enable', {}); await rpc('Runtime.enable', {});
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + (o.result.exceptionDetails.exception.description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : JSON.stringify(o); };

  await sleep(9000);
  await ev(`startMatch(); el('menu').classList.add('hidden'); showDeploy(false);`);
  await sleep(2000);
  await ev(`(function(){ selectedSpawn=-1; deployPlayer(); })()`);
  await sleep(3000);

  // 记录初始位置
  await ev(`(function(){ window.__spawnRec = soldiers.filter(s=>s.alive).map(s=>({n:s.name,t:s.team,x:s.pos.x,z:s.pos.z})); window.__t0 = nowT; return __spawnRec.length; })()`);

  // 采 3 次, 每次隔 4 秒
  for (let k = 0; k < 3; k++) {
    await sleep(4000);
    const r = await ev(`(function(){
      const al=soldiers.filter(s=>s.alive);
      let noPath=0, moved=0, stuckDef=0;
      const rows=[];
      for(let i=0;i<al.length;i++){
        const s=al[i], o=window.__spawnRec[i];
        if(!o) continue;
        const d=Math.hypot(s.pos.x-o.x, s.pos.z-o.z);
        if(!s.path) noPath++;
        if(d>3) moved++;
        if(s.state==='defend'||s.state==='idle') stuckDef++;
        if(i<12) rows.push(s.name.slice(0,10)+'|'+s.state+'|'+(s.path?('p'+s.path.length+'@'+s.pathI):'NULL')+'|d='+d.toFixed(1));
      }
      return JSON.stringify({t:(nowT-window.__t0).toFixed(1), alive:al.length, noPath, moved, stuckDef, rows});
    })()`);
    console.log('=== 采样 ' + (k + 1) + ' ===');
    try { const p = JSON.parse(r); console.log('t=' + p.t + 's 存活=' + p.alive + ' 无路径=' + p.noPath + ' 已移动(>3m)=' + p.moved + ' defend/idle=' + p.stuckDef); p.rows.forEach(x => console.log('   ' + x)); } catch (e) { console.log(r); }
  }

  // 统计 A* 调用次数 vs 请求次数
  const cnt = await ev(`(function(){
    const orig=NAV.findPath; let calls=0;
    NAV.findPath=function(a,b,c,d){ calls++; return orig.call(NAV,a,b,c,d); };
    window.__navCalls=()=>calls;
    window.__navReq=0;
    const origS=Bot.prototype?null:null;
    return 'installed';
  })()`);
  console.log('findPath 埋点:', cnt);

  ws.close(); proc.kill(); await sleep(300); process.exit(0);
})();
