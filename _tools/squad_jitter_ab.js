// A/B 对照: 小队"个人游走偏移"开 / 关, 各测 6 个 5s 窗口的平均位移
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9396;
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'sq_' + Date.now());
  const proc = spawn(ch, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,720', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'http://127.0.0.1:8123/index.html'], { stdio: 'ignore' });
  await sleep(3500);
  let list = null;
  for (let i = 0; i < 25; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page'); if (!page) { console.log('NO_PAGE'); proc.kill(); process.exit(1); }
  const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); if (j.method === 'Runtime.exceptionThrown') errs.push('EXC ' + (j.params.exceptionDetails.exception && j.params.exceptionDetails.exception.description || '').split('\n')[0]); });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa })); });
  await rpc('Page.enable', {}); await rpc('Runtime.enable', {});
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + (o.result.exceptionDetails.exception.description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : JSON.stringify(o); };

  await sleep(9000);
  await ev(`startMatch(); el('menu').classList.add('hidden'); showDeploy(false);`);
  await sleep(1200);
  await ev(`(function(){ selectedSpawn=-1; deployPlayer(); })()`);
  await sleep(4000);

  const snap = `window.__pv={}; for(const s of SQUAD.members) if(s.alive) window.__pv[s.name]=[s.pos.x,s.pos.z]; 'ok'`;
  const meas = `(function(){
    const rs=[];
    for(const s of SQUAD.members){
      if(!s.alive) continue;
      const p=window.__pv[s.name]; if(!p) continue;
      rs.push(Math.hypot(s.pos.x-p[0],s.pos.z-p[1]));
      window.__pv[s.name]=[s.pos.x,s.pos.z];
    }
    rs.sort((a,b)=>a-b);
    const avg=rs.length?rs.reduce((a,b)=>a+b,0)/rs.length:0;
    return JSON.stringify({n:rs.length, avg:+avg.toFixed(2), med:rs.length?+rs[Math.floor(rs.length/2)].toFixed(2):0,
      still:rs.filter(v=>v<1).length});
  })()`;

  const run = async (label, n) => {
    await ev(snap);
    const acc = [];
    for (let k = 0; k < n; k++) { await sleep(5000); try { acc.push(JSON.parse(await ev(meas))); } catch (e) { console.log(e, await ev(meas)); } }
    const av = (acc.reduce((a, b) => a + b.avg, 0) / acc.length).toFixed(2);
    const st = acc.reduce((a, b) => a + b.still, 0);
    console.log(`${label}: 每 5s 平均位移 ${av}m | 呆立(<1m) 累计 ${st} 人次 | 样本数 ${acc[0] ? acc[0].n : 0}`);
    console.log('   逐窗口 ' + acc.map(a => `${a.avg}m(呆${a.still})`).join('  '));
  };

  await run('游走偏移 开', 6);
  // 关掉: 清空偏移并把下次刷新推到很远
  await ev(`(function(){ for(const s of SQUAD.members){ s.slotJit=[0,0]; s.slotJitT=nowT+9999; } return 'off'; })()`);
  await run('游走偏移 关', 6);

  console.log('页面报错数:', errs.length);
  ws.close(); proc.kill(); await sleep(300); process.exit(0);
})();
