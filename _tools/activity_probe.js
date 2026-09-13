// 活跃度探针: 验证"30s 不动就随机换点"以及整体活跃度
// 指标: 每 5s 窗口内位移 <1m 的 Bot 数(实时呆滞)、stillT 最大值/分布、软硬换点触发次数
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9394;
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'ac_' + Date.now());
  const proc = spawn(ch, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,720', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'http://127.0.0.1:8123/index.html'], { stdio: 'ignore' });
  await sleep(3500);
  let list = null;
  for (let i = 0; i < 25; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page'); if (!page) { console.log('NO_PAGE'); proc.kill(); process.exit(1); }
  const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); if (j.method === 'Runtime.exceptionThrown') errs.push('EXC ' + (j.params.exceptionDetails.exception && j.params.exceptionDetails.exception.description || '').split('\n')[0]); if (j.method === 'Runtime.consoleAPICalled' && j.params.type === 'error') errs.push('CONSOLE ' + JSON.stringify(j.params.args.map(a => a.value).slice(0, 2))); });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa })); });
  await rpc('Page.enable', {}); await rpc('Runtime.enable', {});
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + (o.result.exceptionDetails.exception.description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : JSON.stringify(o); };

  await sleep(9000);
  await ev(`startMatch(); el('menu').classList.add('hidden'); showDeploy(false);`);
  await sleep(1500);
  await ev(`(function(){ selectedSpawn=-1; deployPlayer(); })()`);
  await sleep(1500);
  // 计数换点次数: 包住 pickRoamPoint, 返回非空即视为一次成功换点
  await ev(`(function(){
    window.__hard=0; window.__soft=0; window.__prev={};
    const of=Bot.prototype.pickRoamPoint;
    Bot.prototype.pickRoamPoint=function(far){
      const r=of.call(this,far);
      if(r){ if(this.stillT>=30) window.__hard++; else window.__soft++; }
      return r;
    };
    return 'hooked'; })()`);

  for (let k = 0; k < 14; k++) {
    await sleep(5000);
    const r = await ev(`(function(){
      const al=soldiers.filter(s=>s.alive&&!s.onVehicle);
      let win0=0, maxStill=0, over30=0, over20=0;
      const st=[], ids={};
      for(const s of al){
        const p0=window.__prev[s.name];
        const mv=p0?Math.hypot(s.pos.x-p0[0],s.pos.z-p0[1]):99;
        if(p0&&mv<1){ win0++; ids[s.state]=(ids[s.state]||0)+1; }
        window.__prev[s.name]=[s.pos.x,s.pos.z];
        const stt=s.stillT||0; st.push(stt);
        if(stt>maxStill) maxStill=stt;
        if(stt>=30) over30++;
        if(stt>=20) over20++;
      }
      st.sort((a,b)=>a-b);
      const med=st.length?st[Math.floor(st.length/2)]:0;
      const p90=st.length?st[Math.min(st.length-1,Math.floor(st.length*0.9))]:0;
      const hist={};
      for(const s of al){ const b=Math.min(6,Math.floor((s.stillT||0)/5))*5; hist[b>=30?'30+':b+'-'+(b+5)]=(hist[b>=30?'30+':b+'-'+(b+5)]||0)+1; }
      return JSON.stringify({t:+nowT.toFixed(0),al:al.length,win0,maxStill:+maxStill.toFixed(1),med:+med.toFixed(1),p90:+p90.toFixed(1),over20,over30,
        hard:window.__hard, soft:window.__soft, hist, ids});
    })()`);
    try {
      const p = JSON.parse(r);
      console.log(`t=${p.t} 存活=${p.al} | 本窗口零位移=${p.win0} | stillT 中位=${p.med}s P90=${p.p90}s 最大=${p.maxStill}s ≥20s=${p.over20} ≥30s=${p.over30} | 强制换点=${p.hard} 软换点=${p.soft}`);
      console.log(`   静止分布 ${JSON.stringify(p.hist)} 零位移状态 ${JSON.stringify(p.ids)}`);
    } catch (e) { console.log(r); }
  }
  console.log('页面报错数:', errs.length);
  errs.slice(0, 10).forEach(e => console.log('  ', e));
  ws.close(); proc.kill(); await sleep(300); process.exit(0);
})();
