// 队友生成检查: 逐图统计双方人数 / 队友与玩家的距离 / 是否卡在几何里
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9721;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) { try { if (ws) ws.close(); } catch (e) { } try { if (proc) proc.kill(); } catch (e) { } fs.writeFileSync(path.join(ROOT, '_tools', '_squad_probe.txt'), out.join('\n') + '\n', 'utf8'); process.exit(c); }
(async () => {
  const ud = path.join(require('os').tmpdir(), 'sq_' + Date.now());
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

  const NAMES = ['街区', '秘密实验室', '港口', '瓦尔登机场'];
  for (let idx = 0; idx < 4; idx++) {
    errs.length = 0;
    await ev(`(function(){ localStorage.setItem('sf_campaign','${idx}'); localStorage.setItem('sf_autodeploy','0'); return 1; })()`);
    await rpc('Page.navigate', { url: URL });
    await sleep(17000);
    await ev(`(function(){ const b=[...document.querySelectorAll('.navBtn')].find(x=>x.dataset.p==='mPlay'); if(b) b.click(); return 1; })()`);
    await sleep(1300);
    await ev(`(function(){ const b=document.getElementById('startBtn'); if(b) b.click(); return 1; })()`);
    await sleep(7000);
    await ev(`(function(){ const b=document.getElementById('deployBtn'); if(b) b.click(); return 1; })()`);
    await sleep(3000);
    log('===== [' + idx + '] ' + NAMES[idx] + ' =====');
    log('  基地        = ' + await ev(`JSON.stringify(CAMPAIGN.bases)`));
    log('  玩家        = ' + await ev(`(function(){try{return Math.round(player.pos.x)+','+Math.round(player.pos.z)+' team='+player.team;}catch(e){return 'EXC';}})()`));
    log('  soldiers 总 = ' + await ev(`(typeof soldiers!=='undefined')?soldiers.length:'-'`));
    log('  己方 AI     = ' + await ev(`(function(){try{return soldiers.filter(s=>s.team===player.team).length;}catch(e){return 'EXC';}})()`));
    log('  敌方 AI     = ' + await ev(`(function(){try{return soldiers.filter(s=>s.team!==player.team).length;}catch(e){return 'EXC';}})()`));
    log('  SQUAD.members = ' + await ev(`(typeof SQUAD!=='undefined')?SQUAD.members.length:'-'`));
    log('  队友明细    = ' + await ev(`(function(){
      try{
        var r=[];
        for(var i=0;i<soldiers.length;i++){
          var s=soldiers[i];
          if(s.team!==player.team) continue;
          var d=Math.hypot(s.pos.x-player.pos.x, s.pos.z-player.pos.z);
          var y=Math.round(s.pos.y*10)/10;
          r.push('@'+Math.round(s.pos.x)+','+Math.round(s.pos.z)+' y='+y+' 距'+Math.round(d)+'m '+(s.alive?'活':'死')+' inSquad='+(s.inSquad?1:0));
        }
        return r.length? r.join(' | ') : '（没有己方 AI）';
      }catch(e){ return 'EXC '+e.message; }
    })()`));
    log('  队友离玩家  = ' + await ev(`(function(){
      try{
        var best=1e9, n=0;
        for(var i=0;i<soldiers.length;i++){ var s=soldiers[i]; if(s.team!==player.team) continue; n++;
          var d=Math.hypot(s.pos.x-player.pos.x, s.pos.z-player.pos.z); if(d<best) best=d; }
        return n? (Math.round(best)+'m') : '无队友';
      }catch(e){ return 'EXC'; }
    })()`));
    log('  异常        = ' + (errs.length ? errs.join(' | ') : '无'));
    // 转向最近的队友并截图 —— "没有队友"是视觉问题, 得用眼睛确认
    if (idx === 3) {
      const shot = async n => { const o = await rpc('Page.captureScreenshot', { format: 'png' }); if (o.result && o.result.data) fs.writeFileSync(path.join(ROOT, 'outputs', n), Buffer.from(o.result.data, 'base64')); log('  已存 outputs/' + n); };
      log('  转向队友: ' + await ev(`(function(){
        try{
          var best=null, bd=1e9;
          for(var i=0;i<soldiers.length;i++){ var s=soldiers[i]; if(s.team!==player.team) continue;
            var d=Math.hypot(s.pos.x-player.pos.x, s.pos.z-player.pos.z); if(d<bd){ bd=d; best=s; } }
          if(!best) return 'NO_MATE';
          // yaw=0 朝 -z (实测), 所以 forward=(-sin,-cos) → yaw=atan2(-dx,-dz)
          player.yaw=Math.atan2(-(best.pos.x-player.pos.x), -(best.pos.z-player.pos.z));
          player.pitch=-0.05;
          return '面向 @'+Math.round(best.pos.x)+','+Math.round(best.pos.z)+' 距'+Math.round(bd)+'m';
        }catch(e){ return 'EXC '+e.message; }
      })()`));
      await sleep(1200);
      await shot('airport_squad.png');
    }
  }
  finish(0);
})();
