// 撤离结算 E2E: 真实走完「部署 → 撤离 → 结算画面 → 局外存档」, 验证 ELO 结算行真的渲染出来
// 用法: node _tools/settle_e2e.js [campaignIdx]
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9452, URL = 'http://127.0.0.1:8123/index.html';
const IDX = parseInt(process.argv[2] || '0', 10);
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PROBE = `(function(){
try{
 const out={};
 // ---------- 部署 ----------
 AudioSys.init();
 player.team=0; matchOver=false; player.deployed=false; player.alive=false;
 player.kills=0; player.deaths=0; player.score=0;
 BOTS_PER_TEAM=SIZE_OPTS[0].bots; tickets[0]=SIZE_OPTS[0].tk; tickets[1]=SIZE_OPTS[0].tk;
 startMatch(); el('menu').classList.add('hidden'); showDeploy(false);
 selectedSpawn=-1; deployPlayer();
 for(let i=0;i<10;i++){ updatePlayer(0.05); updateCamera(0.05); }
 out.deployed=player.deployed;

 const eloBefore={rating:ELO.rating,raids:ELO.raids,peak:ELO.peak};
 const walletBefore=META.wallet;
 const lootBefore=Object.assign({},META.loot||{});
 out.eloBefore=eloBefore; out.walletBefore=walletBefore;

 // ---------- 模拟一局"好局" ----------
 RUN.kills=4; RUN.searches=3;
 const keys=[];
 for(let i=0;i<3;i++){ const k=addRunLoot(); if(k) keys.push(k); }
 out.lootKeys=keys;
 out.lootTotalBefore=runLootTotal(); out.lootValueBefore=runLootValue();

 // ---------- 走到撤离点, 让 updateExtraction 自然收口 ----------
 const ex=EXTRACT_POINTS[0];
 out.extractPt=ex?{x:ex.x,z:ex.z,r:ex.r,hold:ex.holdTime||6}:null;
 player.pos.x=ex.x; player.pos.z=ex.z; player.pos.y=heightAt(ex.x,ex.z);
 player.vel.x=0; player.vel.y=0; player.vel.z=0;
 player.alive=true;
 let steps=0;
 while(!matchOver && steps<400){ updateExtraction(0.1); steps++; }
 out.extractSteps=steps; out.matchOverAfterExtract=matchOver;

 // ---------- 结算画面 ----------
 const endEl=document.getElementById('end');
 const endStats=document.getElementById('endStats');
 out.endDisplay=endEl?(endEl.style.display||getComputedStyle(endEl).display):'NO_END';
 out.endStatsHtml=(endStats?endStats.innerHTML:'').replace(/<[^>]+>/g,'|').replace(/\\|+/g,' | ').trim().slice(0,600);
 out.hasEloLine=/ELO 动态难度/.test(endStats?endStats.innerHTML:'');
 out.hasPerfLine=/本局表现/.test(endStats?endStats.innerHTML:'');
 out.hasLootLine=/战利品已存入仓库/.test(endStats?endStats.innerHTML:'');

 // ---------- 局外存档 ----------
 out.eloAfter={rating:ELO.rating,raids:ELO.raids,delta:ELO.rating-eloBefore.rating,lastPerf:+ELO.lastPerf.toFixed(3)};
 out.metaElo=JSON.parse(JSON.stringify(META.elo||null));
 out.walletDelta=META.wallet-walletBefore;
 const lootMerged={};
 for(const k of keys) lootMerged[k]=((META.loot||{})[k]||0)-(lootBefore[k]||0);
 out.lootMerged=lootMerged;
 out.runLootCleared=Object.keys(RUN.loot).length===0;
 out.persisted=(function(){ try{ const m=JSON.parse(localStorage.getItem('bf_meta_v1')||'{}'); return {elo:m.elo||null}; }catch(e){ return 'ERR'; } })();

 // ---------- 失败路径 ----------
 matchOver=false;   // finishRaid 开头有 if(matchOver) return, 必须重置
 startMatch(); el('menu').classList.add('hidden'); showDeploy(false);
 selectedSpawn=-1; deployPlayer();
 RUN.kills=0; RUN.searches=0; RUN.loot={}; RUN.failComp=0;
 player.alive=true;
 const ratingB4Fail=ELO.rating;
 finishRaid(false);
 out.fail={from:ratingB4Fail,to:ELO.rating,delta:ELO.rating-ratingB4Fail,
   failComp:RUN.failComp, wallet:META.wallet};
 const es2=document.getElementById('endStats');
 out.failHasEloLine=/ELO 动态难度/.test(es2?es2.innerHTML:'');
 out.failText=(es2?es2.innerHTML:'').replace(/<[^>]+>/g,'|').replace(/\\|+/g,' | ').trim().slice(0,420);
 return JSON.stringify(out);
}catch(e){ return 'PROBE_ERR:'+e.message+' | '+(e.stack||'').split('\\n').slice(0,3).join(' <- '); }
})()`;

(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'stl_' + Date.now());
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
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true }); if (o.result && o.result.exceptionDetails) return 'EVAL_EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : JSON.stringify(o); };
  const shot = async (name) => { const o = await rpc('Page.captureScreenshot', { format: 'png' }); if (o.result && o.result.data) { fs.writeFileSync(path.join(path.resolve(__dirname, '..'), name), Buffer.from(o.result.data, 'base64')); console.log('截图', name); } };
  await rpc('Page.navigate', { url: URL });
  await sleep(4000);
  await ev(`localStorage.setItem('sf_campaign','${IDX}');`);
  await rpc('Page.navigate', { url: URL });
  await sleep(13000);
  const r = await ev(PROBE);
  console.log('=== settle e2e @camp' + IDX + ' ===');
  console.log(typeof r === 'string' && r[0] === '{' ? JSON.stringify(JSON.parse(r), null, 1) : r);
  await sleep(600);
  await shot('outputs/settle_end.png');
  if (errs.length) console.log('ERRS ' + errs.slice(0, 6).join(' | '));
  ws.close(); proc.kill();
  await sleep(300);
  try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) { }
})();
