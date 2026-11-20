// 验证: ① 敌我双方 NPC 强度倍率是否一致 ② NPC 武器价值是否贴近玩家主武器
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9731;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) { try { if (ws) ws.close(); } catch (e) { } try { if (proc) proc.kill(); } catch (e) { } fs.writeFileSync(path.join(ROOT, '_tools', '_botpower_probe.txt'), out.join('\n') + '\n', 'utf8'); process.exit(c); }
(async () => {
  const ud = path.join(require('os').tmpdir(), 'bp2_' + Date.now());
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
  await sleep(14000);

  // 三种玩家配装: 廉价手枪 / 中档步枪 / 高价狙击
  const CASES = [['m1911', '廉价手枪'], ['m4', '中档步枪'], ['awm', '高价狙击']];
  for (const [wpn, label] of CASES) {
    errs.length = 0;
    await ev(`(function(){ localStorage.setItem('sf_campaign','${process.argv[3]||'0'}'); localStorage.setItem('sf_autodeploy','0'); return 1; })()`);
    await rpc('Page.navigate', { url: URL });
    await sleep(16000);
    // 设定玩家主武器 + 解锁拥有
    await ev(`(function(){
      try{
        META.loadout.primary='${wpn}';
        META.owned['${wpn}']=(META.owned['${wpn}']||0)+1;
        if(typeof saveMeta==='function') saveMeta();
        return 1;
      }catch(e){ return 'EXC '+e.message; }
    })()`);
    await ev(`(function(){ const b=[...document.querySelectorAll('.navBtn')].find(x=>x.dataset.p==='mPlay'); if(b) b.click(); return 1; })()`);
    await sleep(1300);
    await ev(`(function(){ const b=document.getElementById('startBtn'); if(b) b.click(); return 1; })()`);
    await sleep(7000);
    await ev(`(function(){ const b=document.getElementById('deployBtn'); if(b) b.click(); return 1; })()`);
    await sleep(3200);
    log('===== 玩家主武器: ' + label + ' (' + wpn + ') =====');
    log('  玩家武器市价 = ' + await ev(`(function(){try{return '¥'+weaponPrice(raidLoadout().primary)+' ('+raidLoadout().primary+')';}catch(e){return 'EXC';}})()`));
    log('  ELO           = ' + await ev(`(function(){try{return 'auto='+ELO.auto+' t='+(ELO.t||0).toFixed(2)+' 敌方倍率 hp='+ELO.enemyHp.toFixed(3)+' react='+ELO.enemyReact.toFixed(3)+' spr='+ELO.enemySpread.toFixed(3);}catch(e){return 'EXC';}})()`));
    log('  我方倍率      = ' + await ev(`(function(){
      try{
        var s=soldiers.filter(function(b){return b.team===player.team;})[0];
        if(!s) return 'NO_BOT';
        return 'hp='+(s.hpMul||1).toFixed(3)+' react='+(s.reactMul||1).toFixed(3)+' spr='+(s.sprMul||1).toFixed(3)+' dmg='+(s.dmgMul||1).toFixed(3);
      }catch(e){ return 'EXC '+e.message; }
    })()`));
    log('  敌方倍率      = ' + await ev(`(function(){
      try{
        var s=soldiers.filter(function(b){return b.team!==player.team;})[0];
        if(!s) return 'NO_BOT';
        return 'hp='+(s.hpMul||1).toFixed(3)+' react='+(s.reactMul||1).toFixed(3)+' spr='+(s.sprMul||1).toFixed(3)+' dmg='+(s.dmgMul||1).toFixed(3);
      }catch(e){ return 'EXC '+e.message; }
    })()`));
    log('  双方武器价值  = ' + await ev(`(function(){
      try{
        function st(team){
          var r=[], seen={};
          for(var i=0;i<soldiers.length;i++){ var s=soldiers[i]; if((s.team===player.team)!==team) continue;
            var k=s.wpnKey; if(!k) continue; seen[k]=(seen[k]||0)+1; }
          var ks=Object.keys(seen);
          var vals=ks.map(function(k){return weaponPrice(k);});
          var avg=vals.length? Math.round(vals.reduce(function(a,b){return a+b;},0)/vals.length) : 0;
          return {list:ks.map(function(k){return k+'×'+seen[k]+'(¥'+weaponPrice(k)+')';}).join(' '), avg:avg};
        }
        var f=st(true), e=st(false);
        return '\\n    我方 avg=¥'+f.avg+'  ['+f.list+']\\n    敌方 avg=¥'+e.avg+'  ['+e.list+']';
      }catch(e){ return 'EXC '+e.message; }
    })()`));
    log('  双方实际数值  = ' + await ev(`(function(){
      try{
        function st(team){
          var r=[], n=0, hp=0, react=0, spr=0;
          for(var i=0;i<soldiers.length;i++){
            var s=soldiers[i]; if((s.team===player.team)!==team) continue;
            n++; hp+=s.hp; react+=s.reactT||0; spr+=s.spreadBase||0;
          }
          if(!n) return '无';
          return n+'人 平均血='+Math.round(hp/n);
        }
        return '我方 '+st(true)+'  |  敌方 '+st(false);
      }catch(e){ return 'EXC '+e.message; }
    })()`));
    log('  异常          = ' + (errs.length ? errs.join(' | ') : '无'));
    log('  武器池诊断    = ' + await ev(`(function(){
      try{
        var anchor=weaponPrice(raidLoadout().primary);
        var all=Object.keys(WPN_DEFS);
        var bands=[[0.72,1.45],[0.5,2.0],[0.35,3.0],[0.15,6.0]];
        var res=[];
        for(var i=0;i<bands.length;i++){
          var lo=anchor*bands[i][0], hi=anchor*bands[i][1];
          var p=all.filter(function(k){var v=weaponPrice(k);return v>=lo&&v<=hi;});
          res.push(bands[i][0]+'~'+bands[i][1]+'='+p.length);
        }
        var t=1-player.team;
        var cls=TEAM_FACTION[t].cls||[];
        var clsTxt=cls.map(function(c){return c[0]+'(¥'+weaponPrice(c[0])+')';}).join(' ');
        var used=null;
        for(var j=0;j<bands.length;j++){
          var lo2=anchor*bands[j][0], hi2=anchor*bands[j][1];
          var pp=all.filter(function(k){var v=weaponPrice(k);return v>=lo2&&v<=hi2;});
          if(pp.length>=6){ used=bands[j][0]+'~'+bands[j][1]+' ('+pp.length+'把)'; break; }
        }
        return 'anchor=¥'+anchor+' 敌方='+TEAM_FACTION[t].short+' 制式表=['+clsTxt+']\\n    带宽候选: '+res.join(' | ')+'  → 实际用 '+used;
      }catch(e){ return 'EXC '+e.message; }
    })()`));
  }
  finish(0);
})();
