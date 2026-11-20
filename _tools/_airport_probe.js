// 验证机场地图: 能否构建 / 开局 / 物资是否以资料与电子产品为主
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9701;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) { try { if (ws) ws.close(); } catch (e) { } try { if (proc) proc.kill(); } catch (e) { } fs.writeFileSync(path.join(ROOT, '_tools', '_airport_probe.txt'), out.join('\n') + '\n', 'utf8'); process.exit(c); }
(async () => {
  const MAPIDX = process.argv[3] || '3';
  const ud = path.join(require('os').tmpdir(), 'ap_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,760', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  await sleep(2500);
  let list = null;
  for (let i = 0; i < 40; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list && list.length) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page');
  if (!page) { log('NO_PAGE'); return finish(1); }
  ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); if (j.method === 'Runtime.exceptionThrown') errs.push('EXC ' + ((j.params.exceptionDetails.exception || {}).description || '').split('\n')[0]); });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable');
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : String(o); };
  const shot = async n => { const o = await rpc('Page.captureScreenshot', { format: 'png' }); if (o.result && o.result.data) fs.writeFileSync(path.join(ROOT, 'outputs', n), Buffer.from(o.result.data, 'base64')); log('  已存 outputs/' + n); };

  // 先落地地图选择, 再导航
  await rpc('Page.navigate', { url: URL });
  await sleep(14000);
  await ev(`(function(){ localStorage.setItem('sf_campaign','${MAPIDX}'); return localStorage.getItem('sf_campaign'); })()`);
  await rpc('Page.navigate', { url: URL });
  await sleep(18000);

  log('=== 地图识别 ===');
  log('  location        = ' + await ev(`location.href`));
  log('  CAMPAIGN.id     = ' + await ev(`CAMPAIGN.id`));
  log('  CAMPAIGN.layout = ' + await ev(`CAMPAIGN.layout`));
  log('  mapName         = ' + await ev(`CAMPAIGN.mapName`));
  log('  MAP_SIZE/HALF   = ' + await ev(`MAP_SIZE+' / '+MAP_HALF`));
  log('  THEME 存在      = ' + await ev(`typeof THEME==='object'`));
  log('  WEATHER         = ' + await ev(`WEATHER`));

  log('\n=== 世界构建结果 ===');
  log('  CQ_BUILDINGS    = ' + await ev(`typeof CQ_BUILDINGS!=='undefined'?CQ_BUILDINGS.length:'-'`));
  log('  建筑类型        = ' + await ev(`typeof CQ_BUILDINGS!=='undefined'?JSON.stringify([...new Set(CQ_BUILDINGS.map(b=>b.kind))]):'-'`));
  log('  LOOT_CRATES     = ' + await ev(`typeof LOOT_CRATES!=='undefined'?LOOT_CRATES.length:'-'`));
  log('  高价值箱数      = ' + await ev(`typeof LOOT_CRATES!=='undefined'?LOOT_CRATES.filter(c=>c.rich).length:'-'`));
  log('  EXTRACT_POINTS  = ' + await ev(`typeof EXTRACT_POINTS!=='undefined'?EXTRACT_POINTS.length:'-'`));
  log('  NAV_CLEARS      = ' + await ev(`typeof NAV_CLEARS!=='undefined'?NAV_CLEARS.length:'-'`));
  log('  场景对象数      = ' + await ev(`scene.children.length`));

  log('\n=== 地图卡片 ===');
  log('  卡片数          = ' + await ev(`document.querySelectorAll('#mapCards .optBtn, #mapCards button').length`));
  log('  卡片文字        = ' + await ev(`(function(){const b=document.getElementById('mapCards');return b?b.textContent.replace(/\\s+/g,' ').trim().slice(0,220):'NO_EL';})()`));
  log('  简介            = ' + await ev(`(function(){const b=document.getElementById('mapBrief');return b?b.textContent.replace(/\\s+/g,' ').trim().slice(0,180):'NO_EL';})()`));

  log('\n=== 开局冒烟 ===');
  await ev(`(function(){ const b=[...document.querySelectorAll('.navBtn')].find(x=>x.dataset.p==='mPlay'); if(b) b.click(); return 1; })()`);
  await sleep(1300);
  await ev(`(function(){ const b=document.getElementById('startBtn'); if(b) b.click(); return 1; })()`);
  await sleep(7000);
  await ev(`(function(){ const b=document.getElementById('deployBtn'); if(b) b.click(); return 1; })()`);
  await sleep(4000);
  log('  deployed/alive  = ' + await ev(`(function(){try{return player.deployed+' / '+player.alive;}catch(e){return 'EXC '+e.message;}})()`));
  log('  玩家坐标        = ' + await ev(`(function(){try{return Math.round(player.pos.x)+','+Math.round(player.pos.z);}catch(e){return 'EXC';}})()`));
  log('  NPC 数          = ' + await ev(`(function(){try{return soldiers.filter(s=>s.alive).length;}catch(e){return 'EXC';}})()`));
  log('  帧计数          = ' + await ev(`(typeof frameCount!=='undefined'?frameCount:'?')`));
  await shot('airport_ingame.png');

  log('\n=== 物资构成抽样 (200 次普通箱 + 200 次高价值箱) ===');
  log('  ' + await ev(`(function(){
    try{
      const DOCS=['docs','keycard'], ELEC=['chip','phone','gpu','satphone','radio'];
      let docN=0, elecN=0, other=0, total=0;
      const tally={};
      for(let i=0;i<200;i++){
        const o=rollCrateLootList({rich:false});
        for(const k in o){ const n=o[k]|0; total+=n; tally[k]=(tally[k]||0)+n;
          if(DOCS.indexOf(k)>=0) docN+=n; else if(ELEC.indexOf(k)>=0) elecN+=n; else other+=n; }
      }
      for(let i=0;i<200;i++){
        const o=rollCrateLootList({rich:true});
        for(const k in o){ const n=o[k]|0; total+=n; tally[k]=(tally[k]||0)+n;
          if(DOCS.indexOf(k)>=0) docN+=n; else if(ELEC.indexOf(k)>=0) elecN+=n; else other+=n; }
      }
      const top=Object.keys(tally).sort((a,b)=>tally[b]-tally[a]).slice(0,12).map(k=>k+'×'+tally[k]).join('  ');
      return '总件数 '+total+' · 资料 '+docN+' ('+(docN/total*100).toFixed(1)+'%) · 电子产品 '+elecN+' ('+(elecN/total*100).toFixed(1)+'%)'
        +' · 两类合计 '+((docN+elecN)/total*100).toFixed(1)+'%\\n  TOP12: '+top;
    }catch(e){ return 'EXC '+e.message; }
  })()`));

  log('\n=== 大地图俯瞰 ===');
  await ev(`(function(){ try{ if(typeof toggleBigMap==='function') toggleBigMap(true); return 1; }catch(e){ return 'EXC '+e.message; } })()`);
  await sleep(1500);
  log('  大地图可见 = ' + await ev(`(function(){const e=document.getElementById('bigmapWrap');return e?!e.classList.contains('hidden'):'NO_EL';})()`));
  await shot('airport_bigmap.png');
  await ev(`(function(){ try{ if(typeof toggleBigMap==='function') toggleBigMap(false); return 1; }catch(e){ return 'EXC'; } })()`);

  log('\n=== 定点取景 ===');
  // ⚠️ yaw=0 朝 -z, yaw=PI 朝 +z (实测)
  const spots = [['terminal', 0, 55, Math.PI], ['cargo', 0, -60, 0], ['hangar', -72, 86, -Math.PI * 0.5], ['runway', 20, 8, Math.PI * 0.5]];
  for (const [nm, px, pz, yaw] of spots) {
    await ev(`(function(){
      try{
        player.pos.x=${px}; player.pos.z=${pz}; player.yaw=${yaw}; player.pitch=-0.06;
        player.vy=0; player.pos.y=heightAt(${px},${pz})+1.7;
        if(typeof player.body!=='undefined'){ /* 保持存活 */ }
        return 1;
      }catch(e){ return 'EXC '+e.message; }
    })()`);
    await sleep(1400);
    log('  ' + nm + ' → ' + await ev(`(function(){try{return Math.round(player.pos.x)+','+Math.round(player.pos.z)+' yaw='+player.yaw.toFixed(2);}catch(e){return 'EXC';}})()`));
    await shot('airport_' + nm + '.png');
  }

  log('\n=== 异常 ===');
  log(errs.length ? errs.join('\n') : '无');
  finish(0);
})();
