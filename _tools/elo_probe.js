// ELO 动态难度探针: 校验评分→强度映射的单调性、上下限、注入隔离、持久化与真实部署兵力
// 用法: node _tools/elo_probe.js [campaignIdx]
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9421, URL = 'http://127.0.0.1:8123/index.html';
const IDX = parseInt(process.argv[2] || '0', 10);
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PROBE = `(function(){
try{
 const out={};
 if(typeof ELO==='undefined'||typeof EFF_DIFF==='undefined') return 'NO_ELO: 00b_elo.js 未加载';
 if(typeof applyPrestigeBot!=='function') return 'NO_INJECT: applyPrestigeBot 缺失';
 // ELO 乘区落在 ELO.enemy* 上; EFF_DIFF 只透传基准档
 const snap=()=>({rating:ELO.rating,t:+ELO.t.toFixed(3),
   hp:+ELO.enemyHp.toFixed(3),react:+ELO.enemyReact.toFixed(3),spread:+ELO.enemySpread.toFixed(3),
   vis:+ELO.enemyVis.toFixed(3),dmg:+ELO.enemyDmg.toFixed(3),count:+ELO.enemyCount.toFixed(3)});
 // 实际生效值 = 基准档 × ELO 乘区
 const eff=()=>({react:+(EFF_DIFF.react*ELO.enemyReact).toFixed(3),
   spread:+(EFF_DIFF.spreadMul*ELO.enemySpread).toFixed(3),
   dmg:+(EFF_DIFF.dmgMul*ELO.enemyDmg).toFixed(3),
   vis:+(EFF_DIFF.visMul*ELO.enemyVis).toFixed(3)});
 out.initial=snap(); out.initialEff=eff();
 out.baseName=EFF_DIFF.name;
 out.base={react:EFF_DIFF.react,spread:EFF_DIFF.spreadMul,dmg:EFF_DIFF.dmgMul,vis:EFF_DIFF.visMul};
 out.tierAt900=eloTier(900); out.tierAt1000=eloTier(1000); out.tierAt1400=eloTier(1400); out.tierAt1700=eloTier(1700);
 // 保留原状, 测试完还原
 const keep={rating:ELO.rating,peak:ELO.peak,raids:ELO.raids,auto:ELO.auto,lastFrom:ELO.lastFrom,lastDelta:ELO.lastDelta,lastPerf:ELO.lastPerf};
 const savedRUN={kills:RUN.kills,searches:RUN.searches,loot:RUN.loot};
 const setR=(r)=>{ ELO.rating=r; ELO.raids=99; eloRecalc(); return Object.assign({r},snap(),eff()); };
 out.ladder=[];
 for(const r of [400,600,800,900,1000,1200,1400,1600,1900]) out.ladder.push(setR(r));
 // 单调性: 评分↑ → 敌方 react↓ spread↓ vis↑ dmg↑ hp↑ count↑
 let mono=true;
 for(let i=1;i<out.ladder.length;i++){
   const a=out.ladder[i-1], b=out.ladder[i];
   if(!(b.react<=a.react+1e-9 && b.spread<=a.spread+1e-9 && b.dmg>=a.dmg-1e-9 && b.vis>=a.vis-1e-9
        && b.hp>=a.hp-1e-9 && b.count>=a.count-1e-9)) mono=false;
 }
 out.monotonic=mono;
 // 注入隔离: 敌方 bot 拿到 ELO 乘区, 友军必须完全不受影响 (t=1 时差异最大)
 setR(1900);
 out.inject=(function(){
   const mk=(team)=>{ const o={team}; applyPrestigeBot(o);
     return {team:team,hpMul:+(o.hpMul||1).toFixed(3),reactMul:+(o.reactMul||1).toFixed(3),
             sprMul:+(o.sprMul||1).toFixed(3),visMul:+(o.visMul||1).toFixed(3),
             dmgMul:+(o.dmgMul||1).toFixed(3),eloScaled:!!o.eloScaled}; };
   return {enemy:mk(1-player.team), ally:mk(player.team), playerTeam:player.team};
 })();
 // 模拟连续吃瘪 / 连续超神 (用真实结算函数)
 const sim=(n,extracted,kills,searches,lootVal)=>{
   RUN.kills=kills; RUN.searches=searches; RUN.loot={};
   for(let i=0;i<n;i++) eloApplyRaid(extracted,lootVal);
   return Object.assign(snap(),eff());
 };
 setR(1000); ELO.raids=99;
 out.after5Bad=sim(5,false,0,0,0);
 setR(1000); ELO.raids=99;
 out.after15Bad=sim(15,false,0,0,0);
 setR(1000); ELO.raids=99;
 out.after5Good=sim(5,true,3,3,60000);
 setR(1000); ELO.raids=99;
 out.after15Good=sim(15,true,3,3,60000);
 // 新档前 8 局 (临时 K) 的放水速度
 setR(1000); ELO.raids=0;
 out.prov5Bad=sim(5,false,0,0,0);
 // 上限/下限夹紧 (注意清空 RUN, 否则击杀分会污染 perf)
 setR(1000); ELO.raids=99; RUN.kills=0; RUN.searches=0;
 for(let i=0;i<60;i++) eloApplyRaid(false,0);
 out.floor=Object.assign(snap(),eff());
 setR(1000); ELO.raids=99; RUN.kills=0; RUN.searches=0;
 for(let i=0;i<60;i++) eloApplyRaid(true,60000);
 out.ceiling=Object.assign(snap(),eff());
 // ELO 关闭 → 敌方乘区必须全部回到 1, 且基准档原样
 ELO.auto=false; eloRecalc();
 out.autoOff={hp:ELO.enemyHp,react:ELO.enemyReact,spread:ELO.enemySpread,vis:ELO.enemyVis,
   dmg:ELO.enemyDmg,count:ELO.enemyCount,
   baseUnchanged:Math.abs(EFF_DIFF.react-DIFF_TABLE[SETTINGS.diff].react)<1e-9};
 const mkOff=(team)=>{ const o={team}; applyPrestigeBot(o); return {hpMul:o.hpMul||1,eloScaled:!!o.eloScaled}; };
 out.autoOffInjectEnemy=mkOff(1-player.team);
 ELO.auto=true; eloRecalc();
 // 真实部署: 兵力规模是否按 ELO 浮动
 ELO.rating=400; ELO.raids=99; eloRecalc(); eloApplyForceSize();
 out.botsLow={bots:BOTS_PER_TEAM,tk:tickets[0],base:SIZE_OPTS[SIZE_IDX].bots};
 ELO.rating=1900; eloRecalc(); eloApplyForceSize();
 out.botsHigh={bots:BOTS_PER_TEAM,tk:tickets[0],base:SIZE_OPTS[SIZE_IDX].bots};
 // 还原
 ELO.rating=keep.rating; ELO.peak=keep.peak; ELO.raids=keep.raids; ELO.auto=keep.auto;
 ELO.lastFrom=keep.lastFrom; ELO.lastDelta=keep.lastDelta; ELO.lastPerf=keep.lastPerf;
 eloRecalc(); eloApplyForceSize(); eloSave();
 RUN.kills=savedRUN.kills; RUN.searches=savedRUN.searches; RUN.loot=savedRUN.loot;
 out.restored=snap();
 // 持久化字段
 out.metaElo=JSON.parse(JSON.stringify(META.elo||null));
 out.saveKey=Object.keys(localStorage).filter(k=>/bf_meta|elo/i.test(k));
 // 菜单读数
 out.menuBox=(function(){ const b=document.getElementById('eloBox'); return b?(b.textContent||'').slice(0,140):'NO_BOX'; })();
 out.menuBtn=(function(){ const b=document.getElementById('eloToggle'); return b?b.textContent:'NO_BTN'; })();
 return JSON.stringify(out);
}catch(e){ return 'PROBE_ERR:'+e.message+' | '+(e.stack||'').split('\\n')[1]; }
})()`;

(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'elo_' + Date.now());
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
  console.log('=== ELO probe @camp' + IDX + ' ===');
  console.log(typeof r === 'string' && r[0] === '{' ? JSON.stringify(JSON.parse(r), null, 1) : r);
  if (errs.length) console.log('ERRS ' + errs.slice(0, 5).join(' | '));
  ws.close(); proc.kill();
  await sleep(300);
  try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) { }
})();
