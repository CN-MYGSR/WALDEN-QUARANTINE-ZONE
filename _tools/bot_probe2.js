// 诊断: 1) 为什么不跳  2) 为什么容器没被搜  3) 那几个不动的 Bot 是谁
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9392;
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'bp2_' + Date.now());
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
  await sleep(1500);
  await ev(`(function(){ selectedSpawn=-1; deployPlayer(); })()`);
  await sleep(1500);
  await ev(`(function(){ window.__p0={}; for(const s of soldiers){ if(s.alive) window.__p0[s.name]=[s.pos.x,s.pos.z]; } window.__maxd={}; return 'ok'; })()`);

  for (let k = 0; k < 6; k++) {
    await sleep(3000);
    const r = await ev(`(function(){
      const al=soldiers.filter(s=>s.alive&&!s.onVehicle);
      let blockedAhead=0, vaultable=0, landOK=0, topBlocked=0;
      const relTops=[];
      let objKind={}, nearCrate=0, nearCorpse=0, wantLoot=0;
      for(const s of al){
        const p0=window.__p0[s.name];
        if(p0) window.__maxd[s.name]=Math.max(window.__maxd[s.name]||0,Math.hypot(s.pos.x-p0[0],s.pos.z-p0[1]));
        // 跳跃条件逐项统计
        if(s.jumpVy===0&&s.jumpCd<=0&&!s.prone&&!s.crouch){
          const ax=s.pos.x+Math.sin(s.yaw)*1.05, az=s.pos.z+Math.cos(s.yaw)*1.05;
          if(occBlocked(ax,az)){
            blockedAhead++;
            const top=lowBoxTopAt(ax,az,s.pos.y);
            relTops.push(+(top-s.pos.y).toFixed(2));
            if(top>s.pos.y+0.52&&top<s.pos.y+1.4){
              vaultable++;
              const bx=s.pos.x+Math.sin(s.yaw)*2.7, bz=s.pos.z+Math.cos(s.yaw)*2.7;
              if(!occBlocked(bx,bz)&&standHeight(bx,bz,top+0.5)>top-1.6) landOK++; else topBlocked++;
            }
          }
        }
        if(s.objective&&s.objective.kind) objKind[s.objective.kind]=(objKind[s.objective.kind]||0)+1;
        // 距离最近未搜容器/尸体
        let dc=1e9, dp=1e9;
        if(typeof LOOT_CRATES!=='undefined') for(const lc of LOOT_CRATES){ if(lc.searched) continue; dc=Math.min(dc,Math.hypot(lc.x-s.pos.x,lc.z-s.pos.z)); }
        if(typeof CORPSES!=='undefined') for(const c of CORPSES){ if(c.searched) continue; dp=Math.min(dp,Math.hypot(c.x-s.pos.x,c.z-s.pos.z)); }
        if(dc<3.2) nearCrate++;
        if(dp<3.2) nearCorpse++;
        const eng=s.target&&nowT-s.lastSeenT<4;
        const dt2=eng?Math.hypot(s.target.pos.x-s.pos.x,s.target.pos.z-s.pos.z):999;
        if((dc<3.2||dp<3.2)&&!(eng&&dt2<26)&&s.lootCd<=0) wantLoot++;
      }
      // 最不动的几个
      const stuck=Object.entries(window.__maxd).filter(([n,d])=>d<5).slice(0,6).map(([n,d])=>{
        const s=soldiers.find(x=>x.name===n);
        return s?{n:n,d:+d.toFixed(1),st:s.state,tm:s.team,pos:[+s.pos.x.toFixed(0),+s.pos.z.toFixed(0)],path:s.path?1:0,un:+ (s.unstickT||0).toFixed(1)}:n+':'+d.toFixed(1);
      });
      return JSON.stringify({t:+nowT.toFixed(1),al:al.length,blockedAhead,vaultable,landOK,topBlocked,relTops:relTops.slice(0,12),
        objKind,nearCrate,nearCorpse,wantLoot,stuck,
        crates:(typeof LOOT_CRATES!=='undefined')?LOOT_CRATES.filter(c=>c.searched).length:-1});
    })()`);
    try { const p = JSON.parse(r); console.log(`t=${p.t} 存活=${p.al} | 前方1.05m被挡=${p.blockedAhead} 其中可翻越=${p.vaultable} 落点合格=${p.landOK} 落点不合格=${p.topBlocked}`); console.log(`   相对高度样本=${JSON.stringify(p.relTops)} 目标类型=${JSON.stringify(p.objKind)} 贴近容器=${p.nearCrate} 贴近尸体=${p.nearCorpse} 应触发搜刮=${p.wantLoot} 已搜箱=${p.crates}`); console.log(`   不动的: ${JSON.stringify(p.stuck)}`); } catch (e) { console.log(r); }
  }

  ws.close(); proc.kill(); await sleep(300); process.exit(0);
})();
