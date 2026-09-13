// 排查"离地 >0.9m": 是真的卡空中, 还是只是踩在箱顶/跳跃途中
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9397;
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'ar_' + Date.now());
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
  await sleep(1200);
  await ev(`(function(){ selectedSpawn=-1; deployPlayer(); })()`);
  await sleep(2000);
  // 每秒记录一次: 谁离地 >0.9m, 持续了几拍, 是否在跳(jumpVy!=0)
  await ev(`(function(){ window.__air={}; window.__log=[];
    window.__t=setInterval(function(){
      const cur={};
      for(const s of soldiers){
        if(!s.alive||s.onVehicle) continue;
        const gh=standHeight(s.pos.x,s.pos.z,s.pos.y+0.6);
        const h=s.pos.y-gh;
        if(h>0.9){ cur[s.name]=1; window.__air[s.name]=(window.__air[s.name]||0)+1; }
      }
      for(const n in window.__air) if(!cur[n]) delete window.__air[n];
      const worst=Object.keys(window.__air).map(function(n){return n+':'+window.__air[n]+'拍';});
      if(worst.length) window.__log.push(nowT.toFixed(0)+' '+worst.join(' '));
    },1000);
    return 'ok'; })()`);
  await sleep(45000);
  const r = await ev(`(function(){ clearInterval(window.__t); return JSON.stringify({log:window.__log.slice(-40), air:window.__air}); })()`);
  try {
    const o = JSON.parse(r);
    console.log('当前仍在空中的:', JSON.stringify(o.air));
    console.log('逐秒记录(名字:持续拍数):');
    o.log.forEach(l => console.log('  t=' + l));
    if (!o.log.length) console.log('  (45 秒内没有任何 Bot 离地超过 0.9m)');
  } catch (e) { console.log(r); }
  // 快照: 现在离地最高的几个, 附带是否在跳
  console.log(await ev(`(function(){
    const a=soldiers.filter(s=>s.alive&&!s.onVehicle).map(function(s){
      const gh=standHeight(s.pos.x,s.pos.z,s.pos.y+0.6);
      return {n:s.name,h:+(s.pos.y-gh).toFixed(2),jy:+(s.jumpVy||0).toFixed(2),st:s.state};
    }).sort((x,y)=>y.h-x.h).slice(0,4);
    return JSON.stringify(a); })()`));
  ws.close(); proc.kill(); await sleep(300); process.exit(0);
})();
