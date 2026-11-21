// 头盔系统 + 护具真实名称 验证
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9821;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) { try { if (ws) ws.close(); } catch (e) { } try { if (proc) proc.kill(); } catch (e) { } fs.writeFileSync(path.join(ROOT, '_tools', '_helmet_probe.txt'), out.join('\n') + '\n', 'utf8'); process.exit(c); }
(async () => {
  const ud = path.join(require('os').tmpdir(), 'hl_' + Date.now());
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

  log('=== 0. 页面诊断 ===');
  log('  location   = ' + await ev(`location.href`));
  log('  readyState = ' + await ev(`document.readyState`));
  log('  脚本数     = ' + await ev(`document.scripts.length`));
  log('  typeof el  = ' + await ev(`typeof el`));
  log('  typeof scene = ' + await ev(`typeof scene`));
  log('  typeof WPN_DEFS = ' + await ev(`typeof WPN_DEFS`));

  log('=== 1. 护甲名称 (应为真实型号) ===');
  log('  ' + await ev(`Object.keys(ARMOR_DEFS).map(k=>ARMOR_DEFS[k].level+'级 '+ARMOR_DEFS[k].name).join('  |  ')`));

  log('\n=== 2. 头盔名称 (应为真实型号) ===');
  log('  ' + await ev(`(typeof HELMET_DEFS!=='undefined')?Object.keys(HELMET_DEFS).map(k=>HELMET_DEFS[k].level+'级 '+HELMET_DEFS[k].name).join('  |  '):'❌ 没有 HELMET_DEFS'`));

  log('\n=== 3. 物品系统接入 ===');
  log('  itemKind(helm4)  = ' + await ev(`itemKind('helm4')`));
  log('  itemName(helm4)  = ' + await ev(`itemName('helm4')`));
  log('  itemDesc(helm4)  = ' + await ev(`itemDesc('helm4')`));
  log('  itemDesc(armor5) = ' + await ev(`itemDesc('armor5')`));
  log('  helm4 售价/买价   = ' + await ev(`itemSellPrice('helm4')+' / '+itemPrice('helm4')`));
  log('  掉落池含头盔      = ' + await ev(`(function(){var n=0;for(var i=0;i<200;i++){var k=rollLootKey();if(HELMET_DEFS[k])n++;}return n+'/200';})()`));
  log('  loadout 有头盔槽  = ' + await ev(`(function(){try{return JSON.stringify(META.loadout);}catch(e){return 'EXC';}})()`));

  log('\n=== 4. 部署后玩家头盔状态 ===');
  await ev(`(function(){ localStorage.setItem('sf_campaign','3'); localStorage.setItem('sf_autodeploy','0'); return 1; })()`);
  await rpc('Page.navigate', { url: URL });
  await sleep(17000);
  await ev(`(function(){ const b=[...document.querySelectorAll('.navBtn')].find(x=>x.dataset.p==='mPlay'); if(b) b.click(); return 1; })()`);
  await sleep(1300);
  await ev(`(function(){ const b=document.getElementById('startBtn'); if(b) b.click(); return 1; })()`);
  await sleep(7000);
  log('  头盔下拉存在      = ' + await ev(`!!document.getElementById('helmetSelect')`));
  log('  下拉里的头盔      = ' + await ev(`(function(){var e=document.getElementById('helmetSelect');return e?[...e.options].map(o=>o.textContent).join(' | '):'NO_EL';})()`));
  log('  护甲下拉          = ' + await ev(`(function(){var e=document.getElementById('armorSelect');return e?[...e.options].map(o=>o.textContent).join(' | '):'NO_EL';})()`));
  log('  配装摘要          = ' + await ev(`(document.getElementById('loadoutSummary')||{}).textContent||'NO_EL'`));
  await ev(`(function(){ const b=document.getElementById('deployBtn'); if(b) b.click(); return 1; })()`);
  await sleep(3000);
  log('  部署后 helmetKey  = ' + await ev(`(function(){try{return player.helmetKey+' / '+(player.helmetDef?player.helmetDef.name:'无');}catch(e){return 'EXC';}})()`));
  if (await ev(`el('loadoutSummary').textContent.includes('头盔: '+player.helmetDef.name)`) !== true) {
    log('配装摘要与部署头盔不符'); return finish(1);
  }
  log('  头盔减伤/耐久     = ' + await ev(`(function(){try{return Math.round(player.helmetResist*100)+'% / '+player.helmetDur+'/'+player.helmetMax;}catch(e){return 'EXC';}})()`));
  log('  护甲减伤/耐久     = ' + await ev(`(function(){try{return Math.round(player.armorResist*100)+'% / '+player.armorDur+'/'+player.armorMax;}catch(e){return 'EXC';}})()`));

  log('\n=== 5. 头部减伤实测 (换 6 级头盔对比) ===');
  log('  ' + await ev(`(function(){
    try{
      function headDrop(helmKey,bodyArmor){
        player.helmetKey=helmKey; player.helmetDef=HELMET_DEFS[helmKey]||null;
        player.helmetResist=(HELMET_DEFS[helmKey]||{}).resist||0;
        player.helmetDur=(HELMET_DEFS[helmKey]||{}).hp||0;
        player.armorDef=ARMOR_DEFS[bodyArmor]||{level:0}; player.armorResist=(ARMOR_DEFS[bodyArmor]||{}).resist||0;
        player.armorDur=(ARMOR_DEFS[bodyArmor]||{}).hp||0;
        player._armorBroke=false; player._helmetBroke=false;
        initRaidBody(player,{armor:player.armorDef});
        player.alive=true; matchOver=false; player.deployed=true; player.hp=player.maxHp; player.body&&Object.keys(player.body).forEach(function(k){player.body[k].hp=player.body[k].max;});
        const h0=player.body.head.hp;
        player.damage(20,null,true);
        const h1=player.body.head.hp;
        return (h0-h1).toFixed(1);
      }
      var noHelm=headDrop('', 'armor1');
      var lv1=headDrop('helm1','armor1');
      var lv6=headDrop('helm6','armor1');
      var lv6full=headDrop('helm6','armor6');
      return '20 伤害打头 →  无头盔扣 '+noHelm+'  |  SSh-68(1级) 扣 '+lv1+'  |  Altyn(6级) 扣 '+lv6+'  |  6级盔+6级甲 扣 '+lv6full;
    }catch(e){ return 'EXC '+e.message; }
  })()`));

  log('\n=== 6. 头盔打光后会报废 ===');
  log('  ' + await ev(`(function(){
    try{
      player.helmetKey='helm1'; player.helmetDef=HELMET_DEFS.helm1;
      player.helmetResist=HELMET_DEFS.helm1.resist; player.helmetDur=HELMET_DEFS.helm1.hp; player.helmetMax=HELMET_DEFS.helm1.hp;
      player._helmetBroke=false; player.alive=true; matchOver=false; player.deployed=true; player.hp=player.maxHp; player.body&&Object.keys(player.body).forEach(function(k){player.body[k].hp=player.body[k].max;});
      let n=0;
      while(player.helmetDur>0&&n<40){ player.damage(30,null,true); n++; if(!player.alive){player.alive=true; matchOver=false; player.deployed=true; player.hp=player.maxHp; player.body&&Object.keys(player.body).forEach(function(k){player.body[k].hp=player.body[k].max;});} }
      return '打了 '+n+' 次后 头盔耐久='+player.helmetDur+' 已报废='+!!player._helmetBroke;
    }catch(e){ return 'EXC '+e.message; }
  })()`));

  log('\n=== 7. 护甲不该保护头部 ===');
  log('  ' + await ev(`(function(){
    try{
      function headDrop(a){
        player.helmetKey=''; player.helmetDef=null; player.helmetResist=0; player.helmetDur=0;
        player.armorDef=ARMOR_DEFS[a]; player.armorResist=ARMOR_DEFS[a].resist; player.armorDur=ARMOR_DEFS[a].hp;
        initRaidBody(player,{armor:player.armorDef}); player.alive=true; matchOver=false; player.deployed=true; player.hp=player.maxHp; player.body&&Object.keys(player.body).forEach(function(k){player.body[k].hp=player.body[k].max;});
        const h0=player.body.head.hp;
        player.damage(20,null,true);
        const h1=player.body.head.hp;
        return (h0-h1).toFixed(1);
      }
      return '无护甲打头扣 '+headDrop('armor1')+'  vs  6级护甲打头扣 '+headDrop('armor6')+'（应相同 = 护甲不护头）';
    }catch(e){ return 'EXC '+e.message; }
  })()`));

  log('\n=== 8. 护甲仍然保护胸腹 ===');
  log('  ' + await ev(`(function(){
    try{
      function bodyDrop(a){
        player.helmetKey=''; player.helmetDef=null; player.helmetResist=0; player.helmetDur=0;
        player.armorDef=ARMOR_DEFS[a]; player.armorResist=ARMOR_DEFS[a].resist; player.armorDur=ARMOR_DEFS[a].hp;
        initRaidBody(player,{armor:player.armorDef}); player.alive=true; matchOver=false; player.deployed=true; player.hp=player.maxHp; player.body&&Object.keys(player.body).forEach(function(k){player.body[k].hp=player.body[k].max;});
        const t0=player.body.thorax.hp;
        player.damage(50,null,false,'torso');
        const t1=player.body.thorax.hp;
        return (t0-t1).toFixed(1);
      }
      return '1级甲扣胸 '+bodyDrop('armor1')+'  vs  6级甲扣胸 '+bodyDrop('armor6');
    }catch(e){ return 'EXC '+e.message; }
  })()`));

  log('\n=== 9. HUD ===');
  const armorText = await ev(`(()=>{ player.armorDef=ARMOR_DEFS.armor5; player.armorMax=60; player.armorDur=54; updateHUD(0.2); return el('armorHud').textContent; })()`);
  log('  护甲 HUD = ' + armorText);
  if (!String(armorText).includes('54/60')) return finish(1);

  log('\n=== 10. 尸体掉落头盔 ===');
  log('  ' + await ev(`(function(){
    try{
      var n=0,total=200;
      for(var i=0;i<total;i++){ var o=rollCorpseLoot(soldiers[1]); for(var k in o){ if(HELMET_DEFS[k]){ n++; break; } } }
      return '带头盔的尸体 '+n+'/'+total;
    }catch(e){ return 'EXC '+e.message; }
  })()`));

  log('\n=== 11. 军械库能列出头盔 ===');
  log('  ' + await ev(`(function(){
    try{ renderArmory('store'); var t=document.getElementById('arList').textContent; var hit=['SSh-68','FAST MT','Altyn','Hexatac','6B43'].filter(function(s){return t.indexOf(s)>=0;}); return '货架命中: '+(hit.join(', ')||'（无）'); }
    catch(e){ return 'EXC '+e.message; }
  })()`));

  log('\n=== 12. 仓库价值包含头盔 ===');
  log('  ' + await ev(`(function(){ try{ addOwned('helm6',1); return '仓库价值 ¥'+formatMoney(vibeStashValue()); }catch(e){ return 'EXC '+e.message; } })()`));

  log('\n=== 异常 ===');
  log(errs.length ? errs.join('\n') : '无');
  finish(0);
})();
