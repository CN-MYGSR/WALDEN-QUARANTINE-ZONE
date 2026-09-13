// 定点验证: 人为把某个 Bot 的静止计时顶到 29.5s, 确认 30s 硬阈值会强制它换点并真的走起来
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9395;
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'hr_' + Date.now());
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
  await sleep(3000);

  // 造 4 个"故意杵着"的 Bot: 直接把 moveDir 换成空函数, 让静止计时自然累积到 30s
  // (注意 headless 下 setInterval 会被节流到 1s, 钉位置那招不管用)
  console.log('制造钉死样本:', await ev(`(function(){
    window.__pin=[]; window.__hard=0;
    const of=Bot.prototype.pickRoamPoint;
    Bot.prototype.pickRoamPoint=function(far){
      const r=of.call(this,far);
      if(r&&this.stillT>=30) window.__hard++;
      return r;
    };
    const c=soldiers.filter(s=>s.alive&&!s.onVehicle&&!s.inSquad).slice(0,4);
    for(const s of c){
      s.moveDir=function(){};        // 彻底走不动
      s.__pinAt=[s.pos.x,s.pos.z];
      window.__pin.push({b:s,x:s.pos.x,z:s.pos.z});
    }
    return window.__pin.map(p=>p.b.name).join(',');
  })()`));

  for (let k = 0; k < 9; k++) {
    await sleep(5000);
    const r = await ev(`(function(){
      return JSON.stringify({hard:window.__hard, list:window.__pin.map(function(p){
        const b=p.b;
        return {n:b.name, alive:b.alive, st:+(b.stillT||0).toFixed(1), stt:b.state,
                obj:b.objective?b.objective.kind:'-', path:b.path?b.path.length:0,
                tgt:b.objective?+Math.hypot(b.objective.x-p.x,b.objective.z-p.z).toFixed(1):-1};
      })});
    })()`);
    try { const a = JSON.parse(r); console.log(`[硬换点累计=${a.hard}] ` + a.list.map(o => `${o.n}:stillT=${o.st} state=${o.stt} obj=${o.obj} 目标距=${o.tgt}m path=${o.path}`).join('\n            ')); }
    catch (e) { console.log(r); }
  }
  console.log('页面报错数:', errs.length);
  errs.slice(0, 5).forEach(e => console.log('  ', e));
  ws.close(); proc.kill(); await sleep(300); process.exit(0);
})();
