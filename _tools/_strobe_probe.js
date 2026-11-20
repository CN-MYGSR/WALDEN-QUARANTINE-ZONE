// 天气随机 + 亮度 + 爆闪手电 验证
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9891;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) { try { if (ws) ws.close(); } catch (e) { } try { if (proc) proc.kill(); } catch (e) { } fs.writeFileSync(path.join(ROOT, '_tools', '_strobe_probe.txt'), out.join('\n') + '\n', 'utf8'); process.exit(c); }
(async () => {
  const ud = path.join(require('os').tmpdir(), 'sb_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,860', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
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

  // ---------- 天气随机分布 (连刷 24 次, 只看 WEATHER_MODE) ----------
  log('=== 1. 天气随机分布 (12 次页面加载) ===');
  const dist = {};
  for (let i = 0; i < 12; i++) {
    await rpc('Page.navigate', { url: URL + '?r=' + i });
    await sleep(2600);
    const m = await ev(`(typeof WEATHER_MODE!=='undefined')?WEATHER_MODE:'?'`);
    dist[m] = (dist[m] || 0) + 1;
  }
  log('  ' + Object.entries(dist).map(([k, v]) => k + '×' + v).join('  '));
  log('  出现的天气种类 = ' + Object.keys(dist).length + ' (预期 >= 3)');

  // ---------- 正常加载一次, 做其余验证 ----------
  await rpc('Page.navigate', { url: URL });
  await sleep(16000);

  log('\n=== 2. 天气选择器已移除 ===');
  log('  .weatherBtn / [data-wx] 数量 = ' + await ev(`document.querySelectorAll('[data-wx]').length`));
  log('  weatherDesc 文案 = ' + await ev(`(document.getElementById('weatherDesc')||{}).textContent||'NO_EL'`));
  log('  WEATHER_MODE = ' + await ev(`WEATHER_MODE`) + ' · WEATHER = ' + await ev(`WEATHER`) + ' · NIGHT = ' + await ev(`NIGHT`));

  log('\n=== 3. 亮度常量 (夜间应显著变暗) ===');
  log('  ' + await ev(`(function(){
    try{
      return 'NIGHT_FOG=#'+NIGHT_FOG.toString(16).padStart(6,'0')
        +' · NIGHT_HEMI=['+NIGHT_HEMI.map(function(c){return '#'+c.toString(16).padStart(6,'0');}).join(',')+'] 强度 '+NIGHT_HEMI[2]
        +' · 夜间 KEY_BASE 系数 0.055 · MAP_DIM='+MAP_DIM;
    }catch(e){ return 'EXC '+e.message; }
  })()`));

  log('\n=== 4. 各天气能见度 (fogFar 越小雾越近) ===');
  log('  ' + await ev(`['clear','overcast','dusk','fog','rain','storm'].map(function(k){var d=WEATHER_FX[k];return k+': fogFar='+d.fogFar+' fogNear='+d.fogNear;}).join('  |  ')`));

  log('\n=== 5. 实验室微光 ===');
  log('  ' + await ev(`(function(){
    try{
      const lab=CAMPAIGNS.find(function(c){return c.id==='lab';});
      return 'CAMPAIGN.dimLight = '+(lab.dimLight!=null?lab.dimLight:'（未设置）');
    }catch(e){ return 'EXC '+e.message; }
  })()`));

  log('\n=== 6. 爆闪手电改件 ===');
  log('  ALL_MODS 里有 = ' + await ev(`!!(typeof ALL_MODS!=='undefined'&&ALL_MODS.light_strobe)`));
  log('  名称/描述 = ' + await ev(`(ALL_MODS.light_strobe||{}).name+' · '+((ALL_MODS.light_strobe||{}).desc||'')`));
  log('  light 槽可选 = ' + await ev(`(function(){try{return (getModSlots('m4').light||[]).join(',');}catch(e){return 'EXC';}})()`));

  log('\n=== 7. 部署 + 装备爆闪手电 ===');
  await ev(`(function(){ localStorage.setItem('sf_campaign','3'); localStorage.setItem('sf_autodeploy','0'); return 1; })()`);
  await rpc('Page.navigate', { url: URL });
  await sleep(17000);
  await ev(`(function(){ const b=[...document.querySelectorAll('.navBtn')].find(x=>x.dataset.p==='mPlay'); if(b) b.click(); return 1; })()`);
  await sleep(1300);
  await ev(`(function(){ const b=document.getElementById('startBtn'); if(b) b.click(); return 1; })()`);
  await sleep(7000);
  await ev(`(function(){ const b=document.getElementById('deployBtn'); if(b) b.click(); return 1; })()`);
  await sleep(3000);
  log('  部署后 = ' + await ev(`(function(){try{return player.alive?'ok':'未部署';}catch(e){return 'EXC';}})()`));
  log('  给当前武器装爆闪 = ' + await ev(`(function(){
    try{
      var k=player.curW.key;
      if(typeof setModChoice==='function'){ setModChoice(k,'light','light_strobe'); }
      else if(typeof MODS!=='undefined'){}
      return '武器='+k+' light 槽='+(typeof getModChoice==='function'?getModChoice(k,'light'):'?');
    }catch(e){ return 'EXC '+e.message; }
  })()`));

  log('\n=== 8. 爆闪核心: G 不再开手电, 而是触发爆闪 ===');
  log('  ' + await ev(`(function(){
    try{
      // 把 3 个敌人放到正前方 8m
      var foe=soldiers.filter(function(s){return s.team!==player.team&&s.alive;}).slice(0,3);
      var f=camForward();
      foe.forEach(function(s,i){
        s.pos.set(player.pos.x+f.x*8+i*1.5, player.pos.y, player.pos.z+f.z*8+i*1.5);
        s.stunT=0;
      });
      window.__foe=foe;
      return '已放置 '+foe.length+' 名敌人到正前方 8m';
    }catch(e){ return 'EXC '+e.message; }
  })()`));
  log('  按 G 前: FLASH.want=' + await ev(`FLASH.want`) + ' 敌人 stunT=' + await ev(`window.__foe.map(function(s){return s.stunT;}).join(',')`));
  log('  触发 G = ' + await ev(`(function(){try{ return flashToggle()?'已触发':'未触发'; }catch(e){return 'EXC '+e.message;}})()`));
  await sleep(400);
  log('  触发后: STROBE.t=' + await ev(`STROBE.t.toFixed(2)`) + ' 敌人 stunT=' + await ev(`window.__foe.map(function(s){return s.stunT.toFixed(1);}).join(',')`));
  log('  白屏 opacity = ' + await ev(`(document.getElementById('strobeOv')||{}).style.opacity||'NO_EL'`));
  log('  FLASH.want (应该还是 false, 说明没开常亮手电) = ' + await ev(`FLASH.want`));
  log('  爆闪期间能移动吗 (stunT>0 时 update 应直接 return) = ' + await ev(`(function(){
    try{
      var s=window.__foe[0];
      var x0=s.pos.x, z0=s.pos.z;
      s.update(0.1);
      return '位移 '+Math.hypot(s.pos.x-x0,s.pos.z-z0).toFixed(3)+' (应接近 0)';
    }catch(e){ return 'EXC '+e.message; }
  })()`));
  await sleep(2200);
  log('  2.2 秒后敌人 stunT = ' + await ev(`window.__foe.map(function(s){return s.stunT.toFixed(1);}).join(',')`));
  log('  冷却 = ' + await ev(`STROBE.cd.toFixed(1)+'s'`));
  log('  冷却中再按 G = ' + await ev(`(function(){try{ return flashToggle()?'❌ 不该触发':'✅ 正确拒绝'; }catch(e){return 'EXC';}})()`));

  log('\n=== 异常 ===');
  log(errs.length ? errs.slice(0, 8).join('\n') : '无');
  finish(0);
})();
