// A/B: 接通 WFX.sight 前后 AI 交战活跃度对比
// 两趟独立加载, 分别把 WFX.sight 钉成 1.0(旧行为) / 0.55(街区实际值), 各采样 42s。
// 用法: node _tools/sight_ab.js [campaignIdx]
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9442, URL = 'http://127.0.0.1:8123/index.html';
const IDX = parseInt(process.argv[2] || '0', 10);
const SIGHTS = (process.argv[3] ? process.argv[3].split(',') : ['1.0','0.55']).map(Number);
const WINDOW_S = parseInt(process.argv[4] || '42', 10);
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const ARM = (sight) => `(function(){
  try{
    window.__A={samples:0, kills:0, deaths:0, engagedSum:0, everEngaged:{}, movedSet:{}, firedSum:0,
                minOppSum:0, minOppN:0, aliveSum:0, stuckSum:0, t0:performance.now()};
    window.__A.p0={};
    for(const s of soldiers){ if(s.alive) window.__A.p0[s.name]=[s.pos.x,s.pos.z]; }
    WFX.sight=${sight};
    window.__T=setInterval(function(){
      const A=window.__A; A.samples++;
      let engaged=0, alive=0, fired=0, stuck=0;
      const en={0:[],1:[]};
      for(const s of soldiers){
        if(s.alive){ alive++; en[s.team].push(s); }
        if(s.alive&&s.target&&s.target.alive){ engaged++; A.everEngaged[s.name]=1; }
        if(s.alive&&nowT-s.lastFiredT<4) fired++;
        if(s.alive&&s.stuckT>1.5) stuck++;
        if(s.alive&&A.p0[s.name]){
          const d=Math.hypot(s.pos.x-A.p0[s.name][0], s.pos.z-A.p0[s.name][1]);
          if(d>20) A.movedSet[s.name]=1;
        }
      }
      A.engagedSum+=engaged; A.aliveSum+=alive; A.firedSum+=fired; A.stuckSum+=stuck;
      let mn=1e9;
      for(const a of en[0]) for(const b of en[1]){ const d=Math.hypot(a.pos.x-b.pos.x,a.pos.z-b.pos.z); if(d<mn) mn=d; }
      if(mn<1e8){ A.minOppSum+=mn; A.minOppN++; }
      return 1;
    }, 2000);
    return 'armed sight='+WFX.sight+' soldiers='+soldiers.length;
  }catch(e){ return 'ARM_ERR:'+e.message; }
})()`;

const REPORT = `(function(){
  try{
    clearInterval(window.__T);
    const A=window.__A;
    let kills=0,deaths=0;
    for(const s of soldiers){ kills+=s.kills||0; deaths+=s.deaths||0; }
    const n=soldiers.length||1;
    return JSON.stringify({
      sight:WFX.sight, samples:A.samples, soldiers:n,
      elapsedS:+((performance.now()-A.t0)/1000).toFixed(1),
      totalKills:kills, totalDeaths:deaths,
      engagedAvgPerSample:+(A.engagedSum/Math.max(A.samples,1)).toFixed(2),
      engagedPctOfAlive:+(A.engagedSum/Math.max(A.aliveSum,1)*100).toFixed(1),
      everEngaged:Object.keys(A.everEngaged).length,
      everEngagedPct:+(Object.keys(A.everEngaged).length/n*100).toFixed(1),
      moved20m:Object.keys(A.movedSet).length,
      firedRecentAvg:+(A.firedSum/Math.max(A.samples,1)).toFixed(2),
      stuckAvg:+(A.stuckSum/Math.max(A.samples,1)).toFixed(2),
      minOppDistAvg:+(A.minOppSum/Math.max(A.minOppN,1)).toFixed(1),
      aliveAvg:+(A.aliveSum/Math.max(A.samples,1)).toFixed(1),
    });
  }catch(e){ return 'REPORT_ERR:'+e.message; }
})()`;

(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'sab_' + Date.now());
  const proc = spawn(ch, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud,
    '--window-size=1280,720', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  await sleep(2500);
  let list = null;
  for (let i = 0; i < 40; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list && list.length) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page'); if (!page) { console.log('NO_PAGE'); proc.kill(); process.exit(1); }
  const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); if (j.method === 'Runtime.exceptionThrown') errs.push('EXC ' + ((j.params.exceptionDetails.exception || {}).description || '').split('\n')[0]); });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable');
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : JSON.stringify(o); };

  const results = [];
  for (const sight of SIGHTS) {
    await rpc('Page.navigate', { url: URL });
    await sleep(4000);
    await ev(`localStorage.setItem('sf_campaign','${IDX}');`);
    await rpc('Page.navigate', { url: URL });
    await sleep(13000);
    console.log('--- 部署 sight=' + sight + ' 窗口' + WINDOW_S + 's ---');
    console.log(await ev(`(function(){try{
      AudioSys.init();
      player.team=0; matchOver=false; player.deployed=false; player.alive=false;
      player.kills=0; player.deaths=0; player.score=0;
      BOTS_PER_TEAM=SIZE_OPTS[0].bots; tickets[0]=SIZE_OPTS[0].tk; tickets[1]=SIZE_OPTS[0].tk;
      startMatch(); el('menu').classList.add('hidden'); showDeploy(false);
      return 'ok';
    }catch(e){ return 'ERR:'+e.message; }})()`));
    await sleep(2500);
    console.log(await ev(`(function(){try{ selectedSpawn=-1; deployPlayer(); return 'deployed='+player.deployed; }catch(e){ return 'ERR:'+e.message; }})()`));
    await sleep(3000);
    console.log(await ev(ARM(sight)));
    await sleep(WINDOW_S * 1000);
    const rep = await ev(REPORT);
    console.log('结果: ' + rep);
    try { results.push(JSON.parse(rep)); } catch (e) { }
  }
  console.log('\n=== 对比 ===');
  console.log(JSON.stringify(results, null, 1));
  if (results.length === 2) {
    const [a, b] = results;
    const pct = (x, y) => (a[x] ? ((b[y] - a[x]) / Math.abs(a[x]) * 100).toFixed(1) + '%' : 'n/a');
    console.log('sight 1.0 → 0.55 变化: 击杀 ' + pct('totalKills', 'totalKills')
      + ' · 交战占比 ' + pct('engagedPctOfAlive', 'engagedPctOfAlive')
      + ' · 开火 ' + pct('firedRecentAvg', 'firedRecentAvg')
      + ' · 移动>20m ' + pct('moved20m', 'moved20m')
      + ' · 最近敌距 ' + pct('minOppDistAvg', 'minOppDistAvg'));
  }
  if (errs.length) console.log('ERRS ' + errs.slice(0, 5).join(' | '));
  ws.close(); proc.kill();
  await sleep(300);
  try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) { }
})();
