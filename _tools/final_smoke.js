// 最终冒烟: 长跑 60s, 检查报错 / 卡空中 / 堆人 / 搜刮与动作是否持续发生
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9393;
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'fs_' + Date.now());
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
  await ev(`(function(){ window.__p0={}; for(const s of soldiers) if(s.alive) window.__p0[s.name]=[s.pos.x,s.pos.z];
    window.__jump=0; window.__lean=0; window.__low=0; window.__lootDone=0;
    const of=Bot.prototype.finishLoot; Bot.prototype.finishLoot=function(){ if(this.lootRef) window.__lootDone++; return of.call(this); };
    return 'ok'; })()`);

  for (let k = 0; k < 12; k++) {
    await sleep(5000);
    const r = await ev(`(function(){
      const al=soldiers.filter(s=>s.alive&&!s.onVehicle);
      let maxAir=0, stuckAir=0, pairs=0, still=0, nearBase=0, looting=0, air=0, lean=0, low=0;
      for(const s of al){
        const gh=standHeight(s.pos.x,s.pos.z,s.pos.y+0.6);
        const h=s.pos.y-gh; if(h>maxAir) maxAir=h; if(h>0.9) stuckAir++;
        if(Math.abs(s.leanT||0)>0.15) lean++;
        if(s.carry==='low') low++;
        if(s.jumpVy!==0) air++;
        if(s.lootT>0) looting++;
        const p0=window.__p0[s.name];
        if(p0&&Math.hypot(s.pos.x-p0[0],s.pos.z-p0[1])<4) still++;
        const b=BASES[s.team]; if(Math.hypot(s.pos.x-b.x,s.pos.z-b.z)<24) nearBase++;
      }
      for(let i=0;i<al.length;i++)for(let j=i+1;j<al.length;j++) if(Math.hypot(al[i].pos.x-al[j].pos.x,al[i].pos.z-al[j].pos.z)<1.5) pairs++;
      window.__jump+=air; window.__lean+=lean; window.__low+=low;
      return JSON.stringify({t:+nowT.toFixed(0),al:al.length,maxAir:+maxAir.toFixed(2),stuckAir,pairs,still,nearBase,looting,air,lean,low,
        crates:LOOT_CRATES.filter(c=>c.searched).length, corpses:CORPSES.length, cSearched:CORPSES.filter(c=>c.searched).length,
        lootDone:window.__lootDone, stashed:al.filter(s=>s.stash&&Object.keys(s.stash).length).length});
    })()`);
    try { const p = JSON.parse(r); console.log(`t=${p.t} 存活=${p.al} | 离地最高=${p.maxAir}m 卡空=${p.stuckAir} 贴身对=${p.pairs} 几乎不动=${p.still} 基地圈内=${p.nearBase}`); console.log(`   搜刮中=${p.looting} 腾空=${p.air} 侧身=${p.lean} 低姿态=${p.low} | 已搜箱=${p.crates}/14 尸体=${p.corpses}(搜${p.cSearched}) 累计搜刮=${p.lootDone} 带货Bot=${p.stashed}`); } catch (e) { console.log(r); }
  }

  await rpc('Page.captureScreenshot', {}).then(o => { try { fs.writeFileSync(path.join(__dirname, 'smoke-npc.png'), Buffer.from(o.result.data, 'base64')); console.log('截图已保存 smoke-npc.png'); } catch (e) { console.log('截图失败', e.message); } });
  console.log('页面报错数:', errs.length);
  errs.slice(0, 10).forEach(e => console.log('  ', e));

  ws.close(); proc.kill(); await sleep(300); process.exit(0);
})();
