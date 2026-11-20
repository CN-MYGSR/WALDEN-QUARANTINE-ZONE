// 联机逻辑路径模拟验证: 不需要真实对端, 用模拟消息把每条路径跑一遍
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9811;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) { try { if (ws) ws.close(); } catch (e) { } try { if (proc) proc.kill(); } catch (e) { } fs.writeFileSync(path.join(ROOT, '_tools', '_netsim_probe.txt'), out.join('\n') + '\n', 'utf8'); process.exit(c); }
(async () => {
  const ud = path.join(require('os').tmpdir(), 'ns_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,760', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  await sleep(2500);
  let list = null;
  for (let i = 0; i < 40; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list && list.length) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page');
  if (!page) { log('NO_PAGE'); return finish(1); }
  ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); if (j.method === 'Runtime.exceptionThrown') { const s = ((j.params.exceptionDetails.exception || {}).description || '').split('\n')[0]; if (errs.indexOf(s) < 0) errs.push(s); } });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable');
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : String(o); };

  await rpc('Page.navigate', { url: URL });
  await sleep(15000);
  await ev(`(function(){ localStorage.setItem('sf_campaign','3'); localStorage.setItem('sf_autodeploy','0'); return 1; })()`);
  await rpc('Page.navigate', { url: URL });
  await sleep(17000);
  await ev(`(function(){ const b=[...document.querySelectorAll('.navBtn')].find(x=>x.dataset.p==='mPlay'); if(b) b.click(); return 1; })()`);
  await sleep(1300);
  await ev(`(function(){ const b=document.getElementById('startBtn'); if(b) b.click(); return 1; })()`);
  await sleep(7000);
  await ev(`(function(){ const b=document.getElementById('deployBtn'); if(b) b.click(); return 1; })()`);
  await sleep(3000);

  log('=== 0. 开局基线 ===');
  log('  ' + await ev(`'soldiers='+soldiers.length+' 我方='+soldiers.filter(s=>s.team===player.team).length+' 敌方='+soldiers.filter(s=>s.team!==player.team).length`));

  log('\n=== 1. 模拟远端玩家加入 ===');
  log('  ' + await ev(`(function(){
    try{
      NET.enabled=true; NET.isHost=false; NET.peerId='me';
      const b=netEnsureRemote('peer-A','测试队友');
      if(!b) return '创建失败 · NET.err='+NET.err;
      window.__rb=b;
      return b?('已创建代理 · netRemote='+b.netRemote+' team='+b.team+' squadGroup='+b.squadGroup+' 在 soldiers 里='+(soldiers.indexOf(b)>=0)):'创建失败';
    }catch(e){ return 'EXC '+e.message; }
  })()`));

  log('\n=== 2. 模拟收到它的状态包（t:"p"）===');
  log('  ' + await ev(`(function(){
    try{
      netOnMessage({t:'p',n:'测试队友',x:12.5,y:1.2,z:-30.5,yaw:1.1,vis:1.1,hp:400,a:1,c:0,pr:0,s:3.2},'peer-A');
      const b=window.__rb;
      return '目标=('+b._nx+','+b._ny+','+b._nz+') hp='+b._nhp+' alive='+b._nalive;
    }catch(e){ return 'EXC '+e.message; }
  })()`));
  await sleep(1200);
  log('  插值后实际位置 = ' + await ev(`(function(){ try{ const b=window.__rb; return '('+b.pos.x.toFixed(1)+','+b.pos.y.toFixed(1)+','+b.pos.z.toFixed(1)+') 网格可见='+(b.mesh&&b.mesh.root.visible); }catch(e){ return 'EXC'; } })()`));

  log('\n=== 3. 远端玩家渲染帧（netUpdateRemote 由 Bot.update 接管）===');
  log('  ' + await ev(`(function(){ try{ const b=window.__rb; b.update(0.016); return 'update() 正常 · mesh.pos=('+b.mesh.root.position.x.toFixed(1)+','+b.mesh.root.position.z.toFixed(1)+')'; }catch(e){ return 'EXC '+e.message; } })()`));

  log('\n=== 4. 友伤: 能否打中同阵营的真人 ===');
  log('  ' + await ev(`(function(){
    try{
      const b=window.__rb;
      b.pos.set(player.pos.x, player.pos.y, player.pos.z-6);   // 放到玩家正前方 6m
      b.alive=true;
      const o=V3(player.pos.x, player.pos.y+1.6, player.pos.z);
      const d=V3(0,0,-1);
      const r=raySoldiers(o,d,20,player);
      return r?('命中 · 目标是否真人='+!!r.sol.netRemote+' t='+r.t.toFixed(2)):'没打中（友伤没生效）';
    }catch(e){ return 'EXC '+e.message; }
  })()`));
  log('  打 AI 队友应该仍然免疫 = ' + await ev(`(function(){
    try{
      window.__rb.pos.set(999,0,999);   // 先把远端玩家挪开, 免得挡住射线
      const ally=soldiers.find(s=>s.team===player.team&&!s.netRemote);
      if(!ally) return '没有 AI 队友';
      ally.pos.set(player.pos.x, player.pos.y, player.pos.z-6); ally.alive=true;
      const r=raySoldiers(V3(player.pos.x,player.pos.y+1.6,player.pos.z),V3(0,0,-1),20,player);
      return r?('❌ 竟然打中了 AI 队友 '+r.sol.name):'✅ AI 队友仍免疫';
    }catch(e){ return 'EXC '+e.message; }
  })()`));

  log('\n=== 5. 远端玩家受伤/死亡（房主权威回包 hitok）===');
  log('  ' + await ev(`(function(){
    try{
      const b=window.__rb;
      netOnMessage({t:'hitok',to:'peer-A',amt:120,hp:280,d:0},'host');
      const mid='hp='+b.hp+' alive='+b.alive;
      netOnMessage({t:'hitok',to:'peer-A',amt:999,hp:0,d:1},'host');
      return mid+' → 致命后 hp='+b.hp+' alive='+b.alive;
    }catch(e){ return 'EXC '+e.message; }
  })()`));

  log('\n=== 6. 自己被打（友伤打到本机）===');
  log('  ' + await ev(`(function(){
    try{
      player.alive=true; const before=player.hp;
      netOnMessage({t:'hitok',to:'me',amt:50,hp:0,d:0},'host');
      return '本地血量 '+before+' → '+player.hp+'（应减少 50）';
    }catch(e){ return 'EXC '+e.message; }
  })()`));

  log('\n=== 7. NPC 快照同步（客户端路径）===');
  log('  ' + await ev(`(function(){
    try{
      const L=netNpcList();
      const a=[];
      for(let i=0;i<L.length;i++) a.push(i, 50+i*3, 1, -40-i*2, 0.5, 90-i, 1, 0, 0);
      netApplyNpcSnapshot({t:'npc',a:a});
      const s0=L[0];
      const before=s0.pos.x.toFixed(1);
      netSnapshotDriven(s0,0.5);
      return '敌方 NPC '+L.length+' 个 · 第 0 个目标 x='+s0._nx+' 插值后 x='+s0.pos.x.toFixed(1)+'（原 '+before+'）';
    }catch(e){ return 'EXC '+e.message; }
  })()`));

  log('\n=== 8. 真人退出 → AI 顶替 ===');
  log('  ' + await ev(`(function(){
    try{
      const n0=soldiers.filter(s=>s.team===player.team).length;
      netOnMessage({t:'bye'},'peer-A');
      const n1=soldiers.filter(s=>s.team===player.team).length;
      return '我方 '+n0+' → '+n1+'（代理被移除, AI 补位）';
    }catch(e){ return 'EXC '+e.message; }
  })()`));

  log('\n=== 9. 开局补位计算 ===');
  log('  0 个真人队友 → AI 数 = ' + await ev(`(function(){ try{ for(const k in NET.remote) delete NET.remote[k]; return netAllyAiTarget(); }catch(e){ return 'EXC'; } })()`));
  log('  2 个真人队友 → AI 数 = ' + await ev(`(function(){ try{ NET.remote={'a':{},'b':{}}; return netAllyAiTarget(); }catch(e){ return 'EXC'; } })()`));
  log('  3 个真人队友 → AI 数 = ' + await ev(`(function(){ try{ NET.remote={'a':{},'b':{},'c':{}}; return netAllyAiTarget(); }catch(e){ return 'EXC'; } })()`));
  log('  4 个真人队友 → AI 数 = ' + await ev(`(function(){ try{ NET.remote={'a':{},'b':{},'c':{},'d':{}}; return netAllyAiTarget(); }catch(e){ return 'EXC'; } })()`));

  log('\n=== 10. 排行榜渲染（模拟数据）===');
  log('  ' + await ev(`(function(){
    try{
      VIBE.lb=[{id:'u1',name:'甲',kd:3.5,kills:35,deaths:10,wallet:120000,stash:450000},
               {id:'u2',name:'乙',kd:2.1,kills:21,deaths:10,wallet:80000,stash:120000}];
      VIBE.user={id:'u1',name:'甲'};
      vibeRenderBoard();
      const t=document.getElementById('vhBoard').textContent.replace(/\\s+/g,' ').trim();
      return t.slice(0,150);
    }catch(e){ return 'EXC '+e.message; }
  })()`));
  log('  自己的三项(未登录时) = ' + await ev(`(function(){
    try{ VIBE.user=null; vibeRenderBoard(); return document.getElementById('vhBoard').textContent.replace(/\\s+/g,' ').trim().slice(0,90); }catch(e){ return 'EXC'; }
  })()`));

  log('\n=== 11. 战绩快照 ===');
  log('  ' + await ev(`(function(){ try{ return JSON.stringify(vibeStatSnapshot()); }catch(e){ return 'EXC '+e.message; } })()`));
  log('  仓库价值 = ' + await ev(`(function(){ try{ return '¥'+formatMoney(vibeStashValue()); }catch(e){ return 'EXC'; } })()`));

  log('\n=== 12. 部署找房倒计时 UI ===');
  log('  ' + await ev(`(function(){ try{ netShowSearching(true,17); const e=document.getElementById('netSearch'); return '可见='+!e.classList.contains('hidden')+' 文案='+e.textContent.replace(/\\s+/g,' ').trim(); }catch(e){ return 'EXC'; } })()`));
  log('  ' + await ev(`(function(){ try{ netShowSearching(false); const e=document.getElementById('netSearch'); return '已隐藏='+e.classList.contains('hidden'); }catch(e){ return 'EXC'; } })()`));

  log('\n=== 异常 ===');
  log(errs.length ? errs.join('\n') : '无');
  finish(0);
})();
