// 诊断2: 开局前 8 秒 NPC 是否滞留在出生点; 以及 defend 状态下是否原地不动
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9382;
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'nav2_' + Date.now());
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
  // 装 findPath 计数器
  await ev(`(function(){ const o=NAV.findPath; window.__fp=0; window.__fpFail=0; NAV.findPath=function(){ const r=o.apply(NAV,arguments); window.__fp++; if(!r) window.__fpFail++; return r; }; return 'ok'; })()`);
  await ev(`startMatch(); el('menu').classList.add('hidden'); showDeploy(false);`);
  await sleep(1500);
  await ev(`(function(){ selectedSpawn=-1; deployPlayer(); })()`);

  // 密集采样: 开局第 1 秒起每 1.5 秒
  for (let k = 0; k < 8; k++) {
    await sleep(1500);
    const r = await ev(`(function(){
      const al=soldiers.filter(s=>s.alive);
      let far=0, nearSpawn=0, engaged=0, defending=0, noPath=0, mg=0, mort=0;
      const st={};
      for(const s of al){
        st[s.state]=(st[s.state]||0)+1;
        if(s.state==='defend') defending++;
        if(s.state==='idle') far++;
        if(!s.path && (s.state==='advance'||s.state==='hunt'||s.state==='toVehicle')) noPath++;
        if(s.mgUse||s.mortUse||s.empUse) mg++;
        const sp=pickSpawnFor(s.team);
        const d=Math.hypot(s.pos.x-sp.x,s.pos.z-sp.z);
        if(d<6) nearSpawn++;
      }
      return JSON.stringify({t:nowT.toFixed(1),alive:al.length,states:st,nearSpawnOfTeamSpawn:nearSpawn,noPathMoving:noPath,onEmplacement:mg,fp:window.__fp,fpFail:window.__fpFail});
    })()`);
    try { const p = JSON.parse(r); console.log('t=' + p.t + ' 存活=' + p.alive + ' 距出生点<6m=' + p.nearSpawnOfTeamSpawn + ' 有意图却无路径=' + p.noPathMoving + ' 上炮=' + p.onEmplacement + ' | findPath调用=' + p.fp + ' 失败=' + p.fpFail); console.log('    状态分布:', JSON.stringify(p.states)); } catch (e) { console.log(r); }
  }

  // 检查出生点是否被占用: 出生点周围是否 occBlocked
  const blk = await ev(`(function(){
    const sp=pickSpawnFor(0);
    const out=[];
    for(const r of [0,2,4,6]){
      for(const a of [0,1.57,3.14,4.71]){
        const x=sp.x+Math.sin(a)*r, z=sp.z+Math.cos(a)*r;
        out.push('r'+r+'a'+a.toFixed(1)+':'+(occBlocked(x,z)?'BLOCK':'open'));
      }
    }
    return JSON.stringify({spawn:[sp.x.toFixed(1),sp.z.toFixed(1)], samples:out});
  })()`);
  console.log('出生点通行性:', blk);

  ws.close(); proc.kill(); await sleep(300); process.exit(0);
})();
