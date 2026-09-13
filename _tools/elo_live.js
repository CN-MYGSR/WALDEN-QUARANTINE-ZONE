// 运行时注入验证: 真实部署后, 检查**敌方** bot 是否带上了 ELO 乘区, 友军是否完全不受影响
// 用法: node _tools/elo_live.js [campaignIdx] [rating]
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9422, URL = 'http://127.0.0.1:8123/index.html';
const IDX = parseInt(process.argv[2] || '0', 10);
const RATING = parseInt(process.argv[3] || '1900', 10);
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PROBE = `(function(){
try{
 const out={};
 // 1) 先把评分钉到指定值 (临时 K 关掉, 保证 t 稳定)
 ELO.raids=99; ELO.rating=${RATING}; eloRecalc();
 out.rating=ELO.rating; out.t=+ELO.t.toFixed(3);
 out.enemyMult={hp:ELO.enemyHp,react:ELO.enemyReact,spread:ELO.enemySpread,vis:ELO.enemyVis,dmg:ELO.enemyDmg,count:ELO.enemyCount};
 // 2) 真实部署
 player.team=0;
 matchOver=false; player.deployed=false; player.alive=false;
 eloApplyForceSize();
 startMatch();
 if(typeof deployPlayer==='function') deployPlayer();
 out.bots=BOTS_PER_TEAM;
 // 3) 统计真实 bot 的注入结果
 const stat=(team)=>{
   const list=soldiers.filter(s=>s.team===team&&s.isBot!==false);
   const scaled=list.filter(s=>s.eloScaled);
   const avg=(f)=>{ if(!list.length) return null; let n=0,c=0; for(const s of list){ const v=s[f]; if(typeof v==='number'){ n+=v; c++; } } return c?+(n/c).toFixed(3):null; };
   return {n:list.length, scaled:scaled.length,
     hpMul:avg('hpMul'), reactMul:avg('reactMul'), sprMul:avg('sprMul'),
     visMul:avg('visMul'), dmgMul:avg('dmgMul'), mapElite:list.filter(s=>s.mapElite).length};
 };
 out.enemy=stat(1-player.team);
 out.ally =stat(player.team);
 out.spawnHp={ enemyHp:soldiers.filter(s=>s.team===1-player.team).slice(0,3).map(s=>s.hp),
               allyHp :soldiers.filter(s=>s.team===player.team).slice(0,3).map(s=>s.hp) };
 // 4) 关掉 ELO 再看一次 (必须完全回到 1)
 ELO.auto=false; eloRecalc();
 const off=(team)=>{ const l=soldiers.filter(s=>s.team===team); return {scaled:l.filter(s=>s.eloScaled).length, n:l.length}; };
 out.autoOffEnemy=off(1-player.team);
 ELO.auto=true; eloRecalc();
 // 5) 对照: 同评分下友军乘区 (41_raidloot 的 friendly nerf) 不受 ELO 影响
 out.sampleEnemy=soldiers.filter(s=>s.team===1-player.team).slice(0,2).map(s=>({hpMul:s.hpMul,reactMul:s.reactMul,sprMul:s.sprMul,visMul:s.visMul,dmgMul:s.dmgMul}));
 out.sampleAlly =soldiers.filter(s=>s.team===player.team).slice(0,2).map(s=>({hpMul:s.hpMul,reactMul:s.reactMul,sprMul:s.sprMul,visMul:s.visMul,dmgMul:s.dmgMul}));
 // 还原评分
 ELO.rating=${RATING}; eloRecalc();
 return JSON.stringify(out);
}catch(e){ return 'PROBE_ERR:'+e.message+' | '+(e.stack||'').split('\\n')[1]; }
})()`;

(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'elolive_' + Date.now());
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
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true }); return o.result && o.result.result ? o.result.result.value : JSON.stringify(o); };
  await rpc('Page.navigate', { url: URL });
  await sleep(4000);
  await ev(`localStorage.setItem('sf_campaign','${IDX}');`);
  await rpc('Page.navigate', { url: URL });
  await sleep(13000);
  const r = await ev(PROBE);
  console.log('=== ELO live inject @camp' + IDX + ' rating=' + RATING + ' ===');
  console.log(typeof r === 'string' && r[0] === '{' ? JSON.stringify(JSON.parse(r), null, 1) : r);
  if (errs.length) console.log('ERRS ' + errs.slice(0, 5).join(' | '));
  ws.close(); proc.kill();
  await sleep(300);
  try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) { }
})();
