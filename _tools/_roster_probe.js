// 编制 / 对局时间 / 超时处理 验证
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9781;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) { try { if (ws) ws.close(); } catch (e) { } try { if (proc) proc.kill(); } catch (e) { } fs.writeFileSync(path.join(ROOT, '_tools', '_roster_probe.txt'), out.join('\n') + '\n', 'utf8'); process.exit(c); }
(async () => {
  const ud = path.join(require('os').tmpdir(), 'rs_' + Date.now());
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

  // ① 开始界面上不该再有人数选择器
  log('=== 开始界面人数选择器 ===');
  log('  .sizeBtn 数量 = ' + await ev(`document.querySelectorAll('.sizeBtn').length`));
  log('  含「兵力规模」的标签 = ' + await ev(`(function(){var n=0;document.querySelectorAll('.secLabel').forEach(function(e){if(e.textContent.indexOf('兵力规模')>=0)n++;});return n;})()`));

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
    await sleep(2500);
    log('\n===== [' + idx + '] ' + NAMES[idx] + ' =====');
    log('  配置 enemyBots/allyBots = ' + await ev(`CAMPAIGN.enemyBots+' / '+CAMPAIGN.allyBots`));
    log('  常量 FRIENDLY/ENEMY = ' + await ev(`FRIENDLY_BOT_COUNT+' / '+ENEMY_BOT_COUNT+'  小队数='+ENEMY_SQUAD_COUNT`));
    log('  实际编制 = ' + await ev(`(function(){try{
      var ally=0,foe=0;
      for(var i=0;i<soldiers.length;i++){ if(soldiers[i].team===player.team) ally++; else foe++; }
      return '我方 AI '+ally+' + 玩家 1 = '+(ally+1)+'  vs  敌方 '+foe;
    }catch(e){return 'EXC '+e.message;}})()`));
    log('  小队数(实际) = ' + await ev(`(function(){try{var m={};for(var i=0;i<soldiers.length;i++){var s=soldiers[i];if(s.team===player.team)continue;m[s.squadGroup||0]=1;}return Object.keys(m).length;}catch(e){return 'EXC';}})()`));
    log('  matchTime = ' + await ev(`(function(){try{return Math.round(matchTime)+'s ('+(matchTime/60).toFixed(1)+' 分钟)';}catch(e){return 'EXC';}})()`));
    log('  撤离读条 = ' + await ev(`(function(){try{return EXTRACT_POINTS.length?(EXTRACT_POINTS[0].holdTime||3)+'s':'NO_EXTRACT';}catch(e){return 'EXC';}})()`));
    log('  异常 = ' + (errs.length ? errs.join(' | ') : '无'));
  }

  // ② 超时处理: 把 matchTime 压到 1 秒, 看提示 + 装备是否按阵亡处理
  log('\n===== 超时处理（把计时压到 1 秒）=====');
  log('  超时前装备数 = ' + await ev(`(function(){try{return Object.keys(META.owned).length;}catch(e){return 'EXC';}})()`));
  log('  超时前背包 = ' + await ev(`(function(){try{return Object.keys(RUN.loot).length;}catch(e){return 'EXC';}})()`));
  log('  触发超时 = ' + await ev(`(function(){try{ matchTime=0.4; return 'ok'; }catch(e){return 'EXC '+e.message;}})()`));
  await sleep(1500);
  log('  RUN.timeout = ' + await ev(`(function(){try{return String(RUN.timeout);}catch(e){return 'EXC';}})()`));
  log('  丢失装备 = ' + await ev(`(function(){try{return (RUN.lostGear||[]).join(',')||'（无）';}catch(e){return 'EXC';}})()`));
  log('  失败补偿 = ' + await ev(`(function(){try{return String(RUN.failComp);}catch(e){return 'EXC';}})()`));
  await sleep(3000);
  log('  matchOver = ' + await ev(`(function(){try{return String(matchOver);}catch(e){return 'EXC';}})()`));
  log('  结算标题 = ' + await ev(`(function(){try{var e=document.getElementById('endTitle');return e?e.textContent:'NO_EL';}catch(e){return 'EXC';}})()`));
  log('  结算面板可见 = ' + await ev(`(function(){try{var e=document.getElementById('end');return e?!e.classList.contains('hidden'):'NO_EL';}catch(e){return 'EXC';}})()`));
  log('  异常 = ' + (errs.length ? errs.join(' | ') : '无'));
  finish(0);
})();
