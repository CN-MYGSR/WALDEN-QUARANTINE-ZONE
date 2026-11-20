// 尸体掉落检查: 杀一批敌人, 看尸体里到底有没有枪
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const CAMP = process.argv[3] || '3';
const PORT = 9761;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) { try { if (ws) ws.close(); } catch (e) { } try { if (proc) proc.kill(); } catch (e) { } fs.writeFileSync(path.join(ROOT, '_tools', '_corpse_probe.txt'), out.join('\n') + '\n', 'utf8'); process.exit(c); }
(async () => {
  const ud = path.join(require('os').tmpdir(), 'cp_' + Date.now());
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
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : String(o); };

  await rpc('Page.navigate', { url: URL });
  await sleep(15000);
  await ev(`(function(){ localStorage.setItem('sf_campaign','${CAMP}'); localStorage.setItem('sf_autodeploy','0'); return 1; })()`);
  await rpc('Page.navigate', { url: URL });
  await sleep(17000);
  await ev(`(function(){ const b=[...document.querySelectorAll('.navBtn')].find(x=>x.dataset.p==='mPlay'); if(b) b.click(); return 1; })()`);
  await sleep(1300);
  await ev(`(function(){ const b=document.getElementById('startBtn'); if(b) b.click(); return 1; })()`);
  await sleep(7000);
  await ev(`(function(){ const b=document.getElementById('deployBtn'); if(b) b.click(); return 1; })()`);
  await sleep(3000);

  log('=== 敌人武器键 (bot.wpnKey / customWeapon) ===');
  log('  ' + await ev(`(function(){
    try{
      var r=[];
      for(var i=0;i<soldiers.length;i++){ var s=soldiers[i];
        if(s.team===player.team) continue;
        r.push(s.wpnKey+'/'+(s.customWeapon||'-')); }
      return r.slice(0,12).join('  ');
    }catch(e){ return 'EXC '+e.message; }
  })()`));

  log('\n=== 直接抽样 rollCorpseLoot (200 个敌人) ===');
  log('  ' + await ev(`(function(){
    try{
      var withGun=0, total=0, kinds={};
      for(var i=0;i<200;i++){
        var s=soldiers[1+(i%(soldiers.length-1))];
        if(s.team===player.team) continue;
        var o=rollCorpseLoot(s); total++;
        var has=false;
        for(var k in o){ if(WPN_DEFS[k]){ has=true; kinds[k]=(kinds[k]||0)+1; } }
        if(has) withGun++;
      }
      var top=Object.keys(kinds).sort(function(a,b){return kinds[b]-kinds[a];}).slice(0,6).map(function(k){return k+'×'+kinds[k];}).join(' ');
      return '有枪的尸体 '+withGun+'/'+total+' ('+(withGun/total*100).toFixed(0)+'%)  常见: '+top;
    }catch(e){ return 'EXC '+e.message; }
  })()`));

  log('\n=== 实杀一批敌人, 看真实尸体 ===');
  log('  ' + await ev(`(function(){
    try{
      var n=0;
      for(var i=0;i<soldiers.length;i++){ var s=soldiers[i];
        if(s.team===player.team||!s.alive) continue;
        s.damage(9999, player, false); n++;
        if(n>=10) break; }
      return '击杀 '+n+' 名敌人';
    }catch(e){ return 'EXC '+e.message; }
  })()`));
  await sleep(1500);
  log('  尸体数 = ' + await ev(`(typeof CORPSES!=='undefined'?CORPSES.length:'-')`));
  log('  尸体掉落明细 = ' + await ev(`(function(){
    try{
      var r=[];
      for(var i=0;i<CORPSES.length;i++){
        var c=CORPSES[i];
        var ks=Object.keys(c.loot||{});
        var guns=ks.filter(function(k){return WPN_DEFS[k];});
        r.push('['+ks.length+'件'+(guns.length?(' 枪:'+guns.join(',')):' 无枪')+'] '+ks.join(','));
      }
      return r.length? r.join(String.fromCharCode(10)+'    ') : '（无尸体）';
    }catch(e){ return 'EXC '+e.message; }
  })()`));

  log('\n=== 搜刮面板里能不能看到枪 ===');
  log('  尸体 loot 里的武器键 = ' + await ev(`(function(){
    try{
      var guns=[];
      for(var i=0;i<CORPSES.length;i++){ for(var k in CORPSES[i].loot){ if(WPN_DEFS[k]) guns.push(k); } }
      return guns.length? guns.join(',') : '（无）';
    }catch(e){ return 'EXC'; }
  })()`));
  log('  lootTargetNear 能否识别 = ' + await ev(`(function(){
    try{
      if(typeof LOOT_UI==='undefined') return 'NO_LOOT_UI';
      return 'LOOT_UI.open='+LOOT_UI.open;
    }catch(e){ return 'EXC'; }
  })()`));

  log('\n=== 完整链路: 走到尸体旁 → 开面板 → 拿走枪 ===');
  log('  ' + await ev(`(function(){ try{
    var c=null; for(var i=0;i<CORPSES.length;i++){ if(Object.keys(CORPSES[i].loot).some(function(k){return WPN_DEFS[k];})){ c=CORPSES[i]; break; } }
    if(!c) return '没有带枪的尸体';
    player.pos.x=c.x; player.pos.z=c.z; player.pos.y=standHeight(c.x,c.z,10);
    return '站到尸体旁 @'+Math.round(c.x)+','+Math.round(c.z);
  }catch(e){ return 'EXC '+e.message; } })()`));
  await sleep(700);
  log('  ' + await ev(`(function(){ try{ return tryLootInteract()?'已开搜刮面板':'开不了'; }catch(e){ return 'EXC '+e.message; } })()`));
  await sleep(400);
  log('  面板行 = ' + await ev(`(function(){ try{ return el('lootList').textContent.replace(/\\s+/g,' ').trim().slice(0,120); }catch(e){ return 'EXC'; } })()`));
  log('  选中武器行 = ' + await ev(`(function(){ try{
    var e=lootEntries(LOOT_UI.ref);
    for(var i=0;i<e.length;i++){ if(WPN_DEFS[e[i][0]]){ LOOT_UI.sel=i; renderLootPanel(); return e[i][0]; } }
    return '面板里没有武器行';
  }catch(e){ return 'EXC '+e.message; } })()`));
  log('  拿取 = ' + await ev(`(function(){ try{ lootTakeSelected(); return 'ok'; }catch(e){ return 'EXC '+e.message; } })()`));
  await sleep(400);
  log('  背包里的枪 = ' + await ev(`(function(){ try{ return Object.keys(RUN.loot).filter(function(k){return WPN_DEFS[k];}).join(',')||'（无）'; }catch(e){ return 'EXC'; } })()`));
  log('  尸体剩余 = ' + await ev(`(function(){ try{ var g=[]; for(var i=0;i<CORPSES.length;i++){ for(var k in CORPSES[i].loot){ if(WPN_DEFS[k]) g.push(k); } } return g.length?g.join(','):'（枪已被拿走）'; }catch(e){ return 'EXC'; } })()`));

  log('\n=== 异常 ===');
  log(errs.length ? errs.join('\n') : '无');
  finish(0);
})();
