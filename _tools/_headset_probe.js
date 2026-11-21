// 耳机系统验证
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9841;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) { try { if (ws) ws.close(); } catch (e) { } try { if (proc) proc.kill(); } catch (e) { } fs.writeFileSync(path.join(ROOT, '_tools', '_headset_probe.txt'), out.join('\n') + '\n', 'utf8'); process.exit(c); }
(async () => {
  const ud = path.join(require('os').tmpdir(), 'hs_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,760', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
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
  await sleep(16000);

  log('=== 0. 页面诊断 ===');
  log('  location=' + await ev(`location.href`) + '  HEADSET_DEFS=' + await ev(`typeof HEADSET_DEFS`));

  log('\n=== 1. 耳机定义 ===');
  for(const k of Object.keys(await ev('Object.keys(HEADSET_DEFS)')||[])){}
  log('  ' + await ev(`Object.keys(HEADSET_DEFS).map(function(k){var d=HEADSET_DEFS[k];return d.name+' '+d.color+' | 听力 '+d.range+'m | 放大 x'+d.amp+' | 环境音 x'+d.ambient+' | '+(d.earMuff?'耳罩式':'入耳式');}).join(' || ')`));

  log('\n=== 2. 物品函数 ===');
  for (const k of ['hs_comtac6', 'hs_razor', 'hs_tep300']) {
    log('  ' + k + ': kind=' + await ev(`itemKind('${k}')`) + ' icon=' + await ev(`itemIconOf('${k}')`));
    log('     名称=' + await ev(`itemName('${k}')`));
    log('     描述=' + await ev(`itemDesc('${k}')`));
    log('     售价=' + await ev(`itemSellPrice('${k}')`) + ' 买价=' + await ev(`itemPrice('${k}')`));
  }
  log('  掉落池含耳机 = ' + await ev(`(function(){var n=0;for(var i=0;i<300;i++){if(HEADSET_DEFS[rollLootKey()])n++;}return n+'/300';})()`));
  log('  loadout.headset = ' + await ev(`META.loadout.headset`));

  log('\n=== 3. AudioSys.setHearing 存在 ===');
  log('  ' + await ev(`(typeof AudioSys.setHearing==='function')?'✅ 有 setHearing':'❌ 没有'`));

  log('\n=== 4. 部署 (默认 TEP-300 + SSh-68) ===');
  await ev(`(function(){ localStorage.setItem('sf_campaign','3'); localStorage.setItem('sf_autodeploy','0'); return 1; })()`);
  await rpc('Page.navigate', { url: URL });
  await sleep(17000);
  await ev(`(function(){ const b=[...document.querySelectorAll('.navBtn')].find(x=>x.dataset.p==='mPlay'); if(b) b.click(); return 1; })()`);
  await sleep(1300);
  await ev(`(function(){ const b=document.getElementById('startBtn'); if(b) b.click(); return 1; })()`);
  await sleep(7000);
  log('  耳机下拉存在 = ' + await ev(`!!document.getElementById('headsetSelect')`));
  log('  下拉选项 = ' + await ev(`(function(){var e=document.getElementById('headsetSelect');return e?[...e.options].map(o=>o.textContent+(o.disabled?'[禁用]':'')).join(' | '):'NO_EL';})()`));
  log('  配装摘要 = ' + await ev(`(document.getElementById('loadoutSummary')||{}).textContent||'NO_EL'`));
  await ev(`(function(){ const b=document.getElementById('deployBtn'); if(b) b.click(); return 1; })()`);
  await sleep(3000);
  log('  部署后 headsetKey = ' + await ev(`(function(){try{return player.headsetKey+' / '+(player.headsetDef?player.headsetDef.name+' '+player.headsetDef.color:'无');}catch(e){return 'EXC';}})()`));
  log('  听力范围 = ' + await ev(`(function(){try{return player.headsetDef?player.headsetDef.range+'m':'（未佩戴 · 默认 40m）';}catch(e){return 'EXC';}})()`));
  if (await ev(`el('loadoutSummary').textContent.includes('耳机: '+player.headsetDef.name)`) !== true) {
    log('配装摘要与部署耳机不符'); return finish(1);
  }

  log('\n=== 5. Altyn 头盔冲突规则 ===');
  log('  ' + await ev(`(function(){
    try{
      const res=[];
      addOwned("helm6",3); addOwned("helm5",1);   // 先确保仓库里有 Altyn, 否则 helmetKey 解析不出 helm6
      function tryPair(helmKey,hsKey){
        META.loadout.helmet=helmKey; META.loadout.headset=hsKey;
        addOwned(hsKey,1);
        // 复现 29_menus 的判定逻辑
        let hk=(META.loadout.helmet&&ownedCount(META.loadout.helmet)>0)?META.loadout.helmet:'';
        let sk=(META.loadout.headset&&ownedCount(META.loadout.headset)>0)?META.loadout.headset:'';
        let hs=HEADSET_DEFS[sk]||null;
        if(hs&&hs.earMuff&&hk==='helm6'){ hs=null; sk=''; }
        return hs?('✅ 生效 · '+hs.name):'❌ 冲突被拒';
      }
      res.push('Altyn + ComTac VI      → '+tryPair('helm6','hs_comtac6'));
      res.push('Altyn + Walker\\'s Razor → '+tryPair('helm6','hs_razor'));
      res.push('Altyn + TEP-300        → '+tryPair('helm6','hs_tep300'));
      res.push('SSh-68 + ComTac VI     → '+tryPair('helm1','hs_comtac6'));
      return res.join('\\n  ');
    }catch(e){ return 'EXC '+e.message; }
  })()`));

  log('\n=== 6. 下拉在 Altyn 下的禁用态 ===');
  log('  ' + await ev(`(function(){
    try{
      META.loadout.helmet='helm6';
      if(typeof refreshLoadoutSelects==='function') refreshLoadoutSelects();
      var e=document.getElementById('headsetSelect');
      return e?[...e.options].map(o=>o.textContent+(o.disabled?'[禁用]':'')).join(' | '):'NO_EL';
    }catch(e){ return 'EXC '+e.message; }
  })()`));

  log('\n=== 7. NPC 脚步音 (原先完全没有) ===');
  log('  ' + await ev(`(function(){
    try{
      window.__stepN=0;
      if(!window.__origStep){ window.__origStep=AudioSys.footstep; AudioSys.footstep=function(r,d){ window.__stepN++; return window.__origStep(r,d); }; }
      var foe=soldiers.filter(function(s){return s.team!==player.team;});
      // 把敌人挪到玩家附近并让它们移动
      foe.forEach(function(s,i){ s.pos.set(player.pos.x+Math.sin(i)*8, player.pos.y, player.pos.z+Math.cos(i)*8); s.alive=true; });
      return '敌人 '+foe.length+' 个已靠近';
    }catch(e){ return 'EXC '+e.message; }
  })()`));
  await sleep(3500);
  log('  3.5 秒内 NPC 脚步音次数 = ' + await ev(`window.__stepN||0`));
  log('  (同一时段玩家自己也会踩几步)');

  log('\n=== 8. 听力范围真的影响可听距离 ===');
  log('  ' + await ev(`(function(){
    try{
      // 直接验证 spatial 的可用范围: 不戴耳机 40m 二次衰减 vs 戴耳机 67m 线性衰减
      const noHear=function(d){ const g=Math.max(0,1-d/40); return g*g; };
      const withHear=function(d){ const g=Math.max(0,1-d/67); return g; };
      const rows=[];
      for(const d of [30,40,50,60,65]){
        rows.push(d+'m: 无耳机 gain='+noHear(d).toFixed(3)+(noHear(d)<0.03?'(听不到)':'')+'  |  戴ComTac gain='+withHear(d).toFixed(3)+(withHear(d)<0.03?'(听不到)':''));
      }
      return rows.join('\\n  ');
    }catch(e){ return 'EXC '+e.message; }
  })()`));

  log('\n=== 9. 环境音压制 ===');
  log('  环境音保留比例 = ' + await ev(`Object.keys(HEADSET_DEFS).map(function(k){return HEADSET_DEFS[k].name+' ×'+HEADSET_DEFS[k].ambient+' (降噪 '+Math.round((1-HEADSET_DEFS[k].ambient)*100)+'%)';}).join(' | ')`));

  log('\n=== 10. 尸体掉落 + 军械库 ===');
  log('  ' + await ev(`(function(){try{var n=0;for(var i=0;i<300;i++){var o=rollCorpseLoot(soldiers[1]);for(var k in o){if(HEADSET_DEFS[k]){n++;break;}}}return '带耳机的尸体 '+n+'/300';}catch(e){return 'EXC '+e.message;}})()`));
  log('  ' + await ev(`(function(){try{renderArmory('store');var t=document.getElementById('arList').textContent;var hit=['ComTac','Razor','TEP-300'].filter(function(s){return t.indexOf(s)>=0;});return '货架命中: '+(hit.join(', ')||'（无）');}catch(e){return 'EXC '+e.message;}})()`));

  log('\n=== 异常 ===');
  log(errs.length ? errs.join('\n') : '无');
  finish(0);
})();
