// 长时间压力测试: 开局后跑 N 秒, 收集所有控制台异常 (覆盖 AI 低频路径)
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const SECS = parseInt(process.argv[3] || '60', 10);
const CAMP = process.argv[4] || '0';
const PORT = 9751;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) { try { if (ws) ws.close(); } catch (e) { } try { if (proc) proc.kill(); } catch (e) { } fs.writeFileSync(path.join(ROOT, '_tools', '_soak_probe.txt'), out.join('\n') + '\n', 'utf8'); process.exit(c); }
(async () => {
  const ud = path.join(require('os').tmpdir(), 'sk_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,760', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  await sleep(2500);
  let list = null;
  for (let i = 0; i < 40; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list && list.length) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page');
  if (!page) { log('NO_PAGE'); return finish(1); }
  ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {}; const errs = new Map();
  ws.on('message', m => {
    const j = JSON.parse(m);
    if (j.id && pend[j.id]) pend[j.id](j);
    if (j.method === 'Runtime.exceptionThrown') {
      const s = ((j.params.exceptionDetails.exception || {}).description || j.params.exceptionDetails.text || '').split('\n')[0];
      errs.set(s, (errs.get(s) || 0) + 1);
    }
    if (j.method === 'Runtime.consoleAPICalled' && j.params.type === 'error') {
      const s = 'console.error: ' + (j.params.args || []).map(a => a.value || a.description || '').join(' ').slice(0, 160);
      errs.set(s, (errs.get(s) || 0) + 1);
    }
  });
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

  log('=== 压力测试 ' + SECS + 's · 地图 ' + CAMP + ' ===');
  log('  开局: ' + await ev(`(function(){try{return 'deployed='+player.deployed+' npc='+soldiers.length+' 帧='+(typeof frameCount!=='undefined'?frameCount:'?');}catch(e){return 'EXC';}})()`));
  // 让玩家持续移动/开火, 触发更多 AI 分支
  await ev(`(function(){ try{ player.yaw=0; }catch(e){} return 1; })()`);
  // 传送到地图中央并给一把火箭筒, 强制触发交火与 AI 反坦克炮/筒子分支
  await ev(`(function(){ try{
    player.pos.x=0; player.pos.z=0; player.pos.y=standHeight(0,0,10);
    var n=0; for(var i=0;i<soldiers.length;i++){ if(soldiers[i].team!==player.team && n<6){ soldiers[i].pos.x=rand(-8,8); soldiers[i].pos.z=rand(-8,8); soldiers[i].pos.y=standHeight(soldiers[i].pos.x,soldiers[i].pos.z,10); n++; } }
    return 'ok';
  }catch(e){ return 'EXC '+e.message; } })()`);
  for (let i = 0; i < SECS; i++) {
    await ev(`(function(){ try{ keys.KeyW=true; keys.KeyD=(Math.floor(nowT)%4<2); player.pitch=-0.05; }catch(e){} return 1; })()`);
    await sleep(1000);
  }
  log('  结束: ' + await ev(`(function(){try{return 'alive='+player.alive+' hp='+Math.round(player.hp)+' npc='+soldiers.filter(s=>s.alive).length+' 帧='+(typeof frameCount!=='undefined'?frameCount:'?');}catch(e){return 'EXC';}})()`));
  log('  玩家在炮位上: ' + await ev(`(function(){try{return 'onAT='+!!player.onAT+' onMG='+!!player.onMG+' onMortar='+!!player.onMortar+' onVehicle='+!!player.onVehicle;}catch(e){return 'EXC';}})()`));
  
  // 反坦克炮位已删除(2026-09-18), 这里不再强制上炮位
  log('  有目标的 bot: ' + await ev(`(function(){try{return soldiers.filter(s=>s.target).length+' / 占炮位 '+soldiers.filter(s=>s.empUse).length;}catch(e){return 'EXC';}})()`));

  log('');
  log('=== 异常汇总 (' + errs.size + ' 种) ===');
  if (!errs.size) log('  无');
  else for (const [k, v] of [...errs.entries()].sort((a, b) => b[1] - a[1])) log('  ×' + v + '  ' + k);
  finish(errs.size ? 1 : 0);
})();
