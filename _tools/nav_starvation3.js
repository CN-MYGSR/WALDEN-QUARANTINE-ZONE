// 诊断3: findPath 失败的真实原因 (起点/终点是否不可达, 距离多远)
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9383;
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'nav3_' + Date.now());
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
  await ev(`(function(){
    window.__fails=[];
    const o=NAV.findPath; window.__fp=0;
    NAV.findPath=function(sx,sz,tx,tz){
      window.__fp++;
      const r=o.apply(NAV,arguments);
      if(!r){
        let why='';
        // 起点/终点格子通行性
        const so=!occBlocked(sx,sz), to=!occBlocked(tx,tz);
        const sd=Math.hypot(tx-sx,tz-sz);
        // 起点终点最近的开放格子距离
        const nearOpen=(x,z)=>{ for(let r2=0;r2<40;r2+=2){ for(let a=0;a<6.28;a+=0.5){ if(!occBlocked(x+Math.sin(a)*r2,z+Math.cos(a)*r2)) return r2; } } return 999; };
        why='dist='+sd.toFixed(1)+' startBlocked='+(!so)+' goalBlocked='+(!to)+' startOpenNear='+nearOpen(sx,sz).toFixed(0)+' goalOpenNear='+nearOpen(tx,tz).toFixed(0);
        window.__fails.push(why);
      }
      return r;
    };
    return 'ok';
  })()`);
  await ev(`startMatch(); el('menu').classList.add('hidden'); showDeploy(false);`);
  await sleep(1500);
  await ev(`(function(){ selectedSpawn=-1; deployPlayer(); })()`);
  await sleep(20000);

  const r = await ev(`(function(){
    const f=window.__fails;
    const dists=f.map(s=>parseFloat((s.match(/dist=([\\d.]+)/)||[0,0])[1]));
    const blockedStart=f.filter(s=>s.includes('startBlocked=true')).length;
    const blockedGoal=f.filter(s=>s.includes('goalBlocked=true')).length;
    const farGoal=f.filter(s=>parseFloat((s.match(/goalOpenNear=([\\d.]+)/)||[0,999])[1])>6).length;
    return JSON.stringify({total:window.__fp, fails:f.length, rate:(f.length/window.__fp*100).toFixed(1)+'%', blockedStart, blockedGoal, farGoal, avgDist:(dists.reduce((a,b)=>a+b,0)/Math.max(1,dists.length)).toFixed(1), samples:f.slice(0,10)});
  })()`);
  console.log('findPath 失败分析:', r);

  ws.close(); proc.kill(); await sleep(300); process.exit(0);
})();
