// 秘密实验室冒烟: 切图(localStorage.sf_campaign=1 + sf_autodeploy) → 校验世界/掉落/NPC/任务 → 跑 40s 看 Bot 是否正常出动
// 用法: 先起 `python -m http.server 8123`, 再 `node _tools/lab_smoke.js`
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9394, URL = 'http://127.0.0.1:8123/index.html';
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
// 输出同时落盘 (PowerShell 重定向是 UTF-16, 编辑器读不了; 这里自己写 UTF-8)
const __out = [];
const _cl = console.log.bind(console);
const flush = () => { try { fs.writeFileSync(path.join(__dirname, 'lab_smoke_report.txt'), __out.join('\n') + '\n', 'utf8'); } catch (e) { } };
console.log = (...a) => { __out.push(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')); flush(); _cl(...a); };
process.on('exit', flush);
(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'labsmoke_' + Date.now());
  const proc = spawn(ch, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,720', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', URL], { stdio: 'ignore' });
  await sleep(3500);
  let list = null;
  for (let i = 0; i < 30; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list && list.length) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page'); if (!page) { console.log('NO_PAGE'); proc.kill(); process.exit(1); }
  const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0; const pend = {}; let errs = [];
  ws.on('message', m => {
    const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j);
    if (j.method === 'Runtime.exceptionThrown') errs.push('EXC ' + ((j.params.exceptionDetails.exception || {}).description || j.params.exceptionDetails.text || '').split('\n')[0]);
    if (j.method === 'Runtime.consoleAPICalled' && j.params.type === 'error') errs.push('CONSOLE ' + JSON.stringify(j.params.args.map(a => a.value).slice(0, 3)));
  });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa })); });
  await rpc('Page.enable', {}); await rpc('Runtime.enable', {});
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || o.result.exceptionDetails.text || ''); return o.result && o.result.result ? o.result.result.value : JSON.stringify(o); };

  // ---------- Phase 0: 首次加载应为「街区」 ----------
  await sleep(9000);
  console.log('=== Phase 0 · 默认地图 ===');
  console.log(await ev(`JSON.stringify({campaign:CAMPAIGN.id,n:CAMPAIGNS.length,cards:document.querySelectorAll('#mapRow .mapCard').length,startBtn:(el('startBtn')||{}).textContent,questTotal:QUEST_DEFS.length,labQuests:QUEST_DEFS.filter(q=>q.map==='lab').length})`));

  // ---------- Phase 1: 切到秘密实验室 (模拟点击地图卡片的效果) ----------
  console.log('\n=== Phase 1 · 切换到秘密实验室 (reload + auto deploy) ===');
  errs = [];
  await ev(`localStorage.setItem('sf_campaign','1');localStorage.setItem('sf_autodeploy','1');`);
  await ev(`location.reload()`);
  await sleep(11000);

  const world = await ev(`JSON.stringify({
    campaign:CAMPAIGN.id, idx:CAMPAIGN_IDX, campaignName:CAMPAIGN.mapName, layout:CAMPAIGN.layout,
    weather:WEATHER, sight:WFX.sight, bots:soldiers.length, enemy:ENEMY_BOT_COUNT,
    crates:LOOT_CRATES.length, richCrates:LOOT_CRATES.filter(c=>c.rich).length,
    spots:(CAMPAIGN.lootSpots||[]).length, boxes:BOXES.length, cyls:CYLS.length, navClears:NAV_CLEARS.length,
    labQuests:QUEST_DEFS.filter(q=>q.map==='lab').length, questTotal:QUEST_DEFS.length,
    rules:JSON.stringify(mapRules()), themeLab:!!THEME.lab,
    autoDeployFired: !!localStorage.getItem('sf_autodeploy')===false,
    menuHidden: el('menu')?el('menu').classList.contains('hidden'):null,
    deployVisible: el('deploy')?!el('deploy').classList.contains('hidden'):null
  })`);
  console.log('--- 世界校验 ---');
  console.log(world);

  // 掉落质量抽样: 100 个箱子, 统计高价值件占比
  console.log('--- 掉落抽样 (100 箱) ---');
  console.log(await ev(`(function(){
    const RARE={chip:1,watch:1,satphone:1,docs:1,gpu:1,keycard:1,ledx:1,nvg:1};
    let tot=0,rare=0,items=0,boxes=0;
    for(let i=0;i<100;i++){ const L=rollCrateLootList({rich:i%2===0}); boxes++;
      for(const k in L){ const n=L[k]; items+=n; if(RARE[k]) rare+=n; tot+=n; } }
    let corpseTot=0,corpseRare=0;
    for(let i=0;i<100;i++){ const L=rollCorpseLoot({team:1,wpnKey:'m4'}); for(const k in L){ corpseTot+=L[k]; if(RARE[k]) corpseRare+=L[k]; } }
    return JSON.stringify({crateItems:items,rareItems:rare,rarePct:+(100*rare/Math.max(1,items)).toFixed(1),
      corpseItems:corpseTot,corpseRare:corpseRare,corpseRarePct:+(100*corpseRare/Math.max(1,corpseTot)).toFixed(1)});
  })()`));

  // NPC 强化抽样: 生成敌方/友方 bot, 对比倍率
  console.log('--- NPC 倍率校验 ---');
  console.log(await ev(`(function(){
    const mk=(team)=>{ const b=new Bot(team,'m4','probe'); try{b.spawn(team!==player.team);}catch(e){} return {team:b.team,hpMul:b.hpMul,reactMul:b.reactMul,sprMul:b.sprMul,elite:!!b.mapElite}; };
    return JSON.stringify({enemy:mk(1-player.team),friendly:mk(player.team)});
  })()`));

  // 任务文案
  console.log('--- 任务文案 ---');
  console.log(await ev(`JSON.stringify(QUEST_DEFS.filter(q=>q.map==='lab').map(q=>({id:q.id,desc:questDescOf(q),tgt:questTarget(q)})))`));

  // 通关性: 从双方入口能否走到每一个物资箱 / 对侧入口 / 撤离点
  console.log('--- 寻路连通性 (NAV.findPath) ---');
  console.log(await ev(`JSON.stringify((function(){
    const b0=CAMPAIGN.bases[0], b1=CAMPAIGN.bases[1], ex=CAMPAIGN.extract[0];
    let reach=0, un=[];
    for(const c of LOOT_CRATES){ const p=NAV.findPath(b0.x,b0.z,c.x,c.z);
      if(p&&p.length) reach++; else un.push('('+c.x.toFixed(0)+','+c.z.toFixed(0)+(c.rich?',rich':'')+')'); }
    const bb=NAV.findPath(b0.x,b0.z,b1.x,b1.z);
    const be=NAV.findPath(b0.x,b0.z,ex.x,ex.z);
    const be2=NAV.findPath(b1.x,b1.z,ex.x,ex.z);
    const plen=p=>{ if(!p||!p.length) return 0; let L=0; for(let i=1;i<p.length;i++) L+=Math.hypot(p[i][0]-p[i-1][0],p[i][1]-p[i-1][1]); return Math.round(L); };
    return {crates:LOOT_CRATES.length, reachable:reach, unreachable:un.slice(0,10),
      baseToBase:plen(bb), baseToExtract:plen(be), base1ToExtract:plen(be2),
      directBaseDist:Math.round(Math.hypot(b1.x-b0.x,b1.z-b0.z))};
  })())`));

  // ---------- Phase 2: 部署 + 长跑 ----------
  console.log('\n=== Phase 2 · 部署并长跑 60s ===');
  await ev(`(function(){ try{ if(el('menu')) el('menu').classList.add('hidden'); }catch(e){} selectedSpawn=-1; if(typeof deployPlayer==='function') deployPlayer(); return 'deployed'; })()`);
  await sleep(1500);
  console.log('玩家:', await ev(`JSON.stringify({alive:player.alive,deployed:player.deployed,x:+player.pos.x.toFixed(1),z:+player.pos.z.toFixed(1)})`));

  await ev(`(function(){ window.__p0={}; for(const s of soldiers) if(s.alive) window.__p0[s.name]=[s.pos.x,s.pos.z]; return 'ok'; })()`);

  // 局内画面 (部署后 3s, 活着的时候)
  await sleep(3000);
  await rpc('Page.captureScreenshot', {}).then(o => { try { fs.writeFileSync(path.join(__dirname, 'smoke-lab-ingame.png'), Buffer.from(o.result.data, 'base64')); console.log('截图已保存 _tools/smoke-lab-ingame.png'); } catch (e) { } }).catch(() => { });

  try {
    for (let k = 0; k < 8; k++) {
      await sleep(6000);
    const r = await ev(`(function(){
      const al=soldiers.filter(s=>s.alive&&!s.onVehicle);
      let maxAir=0,stuckAir=0,pairs=0,still=0,nearBase=0,outside=0,air=0,inRoom=0,hall=0;
      for(const s of al){
        const gh=standHeight(s.pos.x,s.pos.z,s.pos.y+0.6);
        const h=s.pos.y-gh; if(h>maxAir) maxAir=h; if(h>0.9) stuckAir++;
        if(Math.abs(s.pos.x)>86||Math.abs(s.pos.z)>86) outside++;
        if(Math.abs(s.pos.x)>9.5&&Math.abs(s.pos.z)>9.5) inRoom++; else hall++;
        if(s.jumpVy!==0) air++;
        const p0=window.__p0[s.name];
        if(p0&&Math.hypot(s.pos.x-p0[0],s.pos.z-p0[1])<4) still++;
        const b=BASES[s.team]; if(Math.hypot(s.pos.x-b.x,s.pos.z-b.z)<24) nearBase++;
      }
      for(let i=0;i<al.length;i++)for(let j=i+1;j<al.length;j++) if(Math.hypot(al[i].pos.x-al[j].pos.x,al[i].pos.z-al[j].pos.z)<1.5) pairs++;
      return JSON.stringify({t:+nowT.toFixed(0),al:al.length,maxAir:+maxAir.toFixed(2),stuckAir,pairs,still,nearBase,outside,air,inRoom,hall,
        crates:LOOT_CRATES.filter(c=>c.searched).length,crateTot:LOOT_CRATES.length,
        corpses:CORPSES.length,cSearched:CORPSES.filter(c=>c.searched).length,
        lost:window.__p0?Object.keys(window.__p0).length-al.length:0});
    })()`);
    try { const p = JSON.parse(r); console.log(`t=${p.t} 存活=${p.al} | 离地=${p.maxAir}m 卡空=${p.stuckAir} 越墙=${p.outside} 贴身=${p.pairs} 不动=${p.still} 基地内=${p.nearBase} | 房间内=${p.inRoom} 大厅=${p.hall}`); console.log(`   已搜箱=${p.crates}/${p.crateTot} 尸体=${p.corpses}(搜${p.cSearched})`); } catch (e) { console.log(r); }
    }
  } catch (e) { console.log('采样中断: ' + (e && e.message)); }

  await rpc('Page.captureScreenshot', {}).then(o => { try { fs.writeFileSync(path.join(__dirname, 'smoke-lab.png'), Buffer.from(o.result.data, 'base64')); console.log('截图已保存 _tools/smoke-lab.png'); } catch (e) { console.log('截图失败', e.message); } }).catch(e => console.log('截图失败: ' + e.message));
  console.log('\n页面报错数:', errs.length); errs.slice(0, 12).forEach(e => console.log('  ', e));
  ws.close(); try { proc.kill(); } catch (e) { }
  await sleep(300); process.exit(0);
})();
