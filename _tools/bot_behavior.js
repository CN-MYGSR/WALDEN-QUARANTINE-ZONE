// 验证: NPC 不再堆在出生点 + 搜刮/跳跃/侧身/低姿态是否生效
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9391;
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'bb_' + Date.now());
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
  console.log(await ev(`(function(){ try{ return '页面就绪 GAMEMODE='+GAMEMODE; }catch(e){ return 'EXC '+e.message; } })()`));
  await ev(`startMatch(); el('menu').classList.add('hidden'); showDeploy(false);`);
  await sleep(1500);
  await ev(`(function(){ selectedSpawn=-1; deployPlayer(); })()`);
  await sleep(1200);

  // 记录初始位置
  await ev(`(function(){ window.__p0={}; for(const s of soldiers){ if(s.alive) window.__p0[s.name]=[s.pos.x,s.pos.z]; } window.__maxd={}; window.__jumps=0; window.__leand=0; window.__carryLow=0; window.__samples=0; return 'ok'; })()`);

  for (let k = 0; k < 10; k++) {
    await sleep(2500);
    const r = await ev(`(function(){
      const al=soldiers.filter(s=>s.alive);
      const st={}; let nearBase=0, still=0, looting=0, air=0, lean=0, carryLow=0, searching=0;
      let sumD=0, maxStill=0;
      for(const s of al){
        st[s.state]=(st[s.state]||0)+1;
        const p0=window.__p0[s.name];
        if(p0){ const d=Math.hypot(s.pos.x-p0[0],s.pos.z-p0[1]); window.__maxd[s.name]=Math.max(window.__maxd[s.name]||0,d); sumD+=d; }
        const b=BASES[s.team];
        if(Math.hypot(s.pos.x-b.x,s.pos.z-b.z)<24) nearBase++;
        if((window.__maxd[s.name]||0)<4) still++;
        if(s.state==='loot') looting++;
        if(s.jumpVy!==0) air++;
        if(Math.abs(s.leanT||0)>0.15) lean++;
        if(s.carry==='low') carryLow++;
        if(s.lootT>0) searching++;
      }
      // 队友扎堆检测: 任意两人 <1.5m 的对数
      let pairs=0;
      for(let i=0;i<al.length;i++)for(let j=i+1;j<al.length;j++){
        if(Math.hypot(al[i].pos.x-al[j].pos.x,al[i].pos.z-al[j].pos.z)<1.5) pairs++;
      }
      const cratesSearched=(typeof LOOT_CRATES!=='undefined')?LOOT_CRATES.filter(c=>c.searched).length:-1;
      const corpses=(typeof CORPSES!=='undefined')?CORPSES.length:-1;
      const corpsesSearched=(typeof CORPSES!=='undefined')?CORPSES.filter(c=>c.searched).length:-1;
      let stashed=0; for(const s of al) if(s.stash&&Object.keys(s.stash).length) stashed++;
      window.__jumps+=air; window.__leand+=lean; window.__carryLow+=carryLow; window.__samples++;
      return JSON.stringify({t:+nowT.toFixed(1),alive:al.length,states:st,nearBase,still,pairs,looting,searching,air,lean,carryLow,cratesSearched,corpses,corpsesSearched,stashed,avgMove:+(sumD/Math.max(1,al.length)).toFixed(1)});
    })()`);
    try {
      const p = JSON.parse(r);
      console.log(`t=${p.t} 存活=${p.alive} | 己方基地24m内=${p.nearBase} 几乎没动(<4m)=${p.still} 贴身对=${p.pairs} | 搜刮中=${p.searching} 腾空=${p.air} 侧身=${p.lean} 低姿态=${p.carryLow}`);
      console.log(`   状态=${JSON.stringify(p.states)} 箱已搜=${p.cratesSearched}/14 尸体=${p.corpses}(已搜${p.corpsesSearched}) 带货Bot=${p.stashed} 平均位移=${p.avgMove}m`);
    } catch (e) { console.log(r); }
  }

  const fin = await ev(`(function(){
    const al=soldiers.filter(s=>s.alive);
    const md=Object.values(window.__maxd).sort((a,b)=>b-a);
    return JSON.stringify({n:md.length, top:md.slice(0,5).map(v=>+v.toFixed(1)), bottom:md.slice(-6).map(v=>+v.toFixed(1)),
      med:+(md[Math.floor(md.length/2)]||0).toFixed(1)});
  })()`);
  console.log('25s 总位移统计(降序前5 / 后6 / 中位):', fin);

  const err = await ev(`(function(){ return window.__lastErr||'none'; })()`);
  console.log('页面错误:', err);

  ws.close(); proc.kill(); await sleep(300); process.exit(0);
})();
