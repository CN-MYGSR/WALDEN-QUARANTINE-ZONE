// 精细探针: ① 实验室部署报错定位 ② 街区中立/反击的强证据
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const PORT = 9473, URL = 'http://127.0.0.1:8123/index.html';
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(code) { try { if (ws) ws.close(); } catch (e) { } try { if (proc) proc.kill(); } catch (e) { } fs.writeFileSync(path.join(ROOT, '_tools', 'scav_probe2.txt'), out.join('\n') + '\n', 'utf8'); process.exit(code); }

(async () => {
  const ud = path.join(require('os').tmpdir(), 'scav2_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,760', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  await sleep(2500);
  let list = null;
  for (let i = 0; i < 40; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list && list.length) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page');
  if (!page) { log('NO_PAGE'); return finish(1); }
  ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); if (j.method === 'Runtime.exceptionThrown') errs.push('EXC ' + ((j.params.exceptionDetails.exception || {}).description || '').split('\n')[0] + ' @' + (j.params.exceptionDetails.stackTrace ? (j.params.exceptionDetails.stackTrace.callFrames[0] || {}).functionName : '')); });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable'); await rpc('Log.enable');
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n').slice(0, 3).join(' | '); return o.result && o.result.result ? o.result.result.value : String(o); };
  const shot = async name => { const o = await rpc('Page.captureScreenshot', { format: 'png' }); if (o.result && o.result.data) fs.writeFileSync(path.join(ROOT, 'outputs', name), Buffer.from(o.result.data, 'base64')); };

  // ---------- 阶段 B 定位: 实验室 ----------
  await rpc('Page.navigate', { url: URL });
  await sleep(7000);
  await ev(`localStorage.setItem('sf_campaign','1');`);
  await rpc('Page.navigate', { url: URL });
  await sleep(8000);
  log('=== 实验室逐步定位 ===');
  log('CAMPAIGN: ' + await ev(`CAMPAIGN.id`));
  log('RUN 存在: ' + await ev(`typeof RUN + ' scav=' + RUN.scav + ' scavLoadout=' + JSON.stringify(RUN.scavLoadout)`));
  log('player 初始: ' + await ev(`typeof player + ' hp=' + player.hp + ' maxHp=' + player.maxHp + ' curW=' + JSON.stringify(player.curW) + ' team=' + player.team`));
  log('step1 startMatch: ' + await ev(`(function(){try{startMatch();return 'OK';}catch(e){return 'EXC '+e.message+' @'+e.stack.split('\\n')[1];}})()`));
  log('step2 showDeploy: ' + await ev(`(function(){try{el('menu').classList.add('hidden');showDeploy(false);return 'OK';}catch(e){return 'EXC '+e.message+' @'+e.stack.split('\\n')[1];}})()`));
  log('step3 ensureScavLoadout: ' + await ev(`(function(){try{const r=ensureScavLoadout();return 'OK '+(r?r.primary:'null');}catch(e){return 'EXC '+e.message+' @'+e.stack.split('\\n')[1];}})()`));
  log('step4 deployPlayer: ' + await ev(`(function(){try{selectedSpawn=-1;deployPlayer();return 'OK curW='+(player.curW?player.curW.key:'null')+' hp='+player.hp+'/'+player.maxHp;}catch(e){return 'EXC '+e.message+' @'+e.stack.split('\\n')[1];}})()`));
  log('console EXC: ' + (errs.length ? errs.slice(0, 6).join(' ;; ') : '无'));
  await shot('scav_lab_probe.png');

  // ---------- 阶段 A 强证据: 街区中立 + 反击 ----------
  await ev(`localStorage.setItem('sf_campaign','0');`);
  await rpc('Page.navigate', { url: URL });
  await sleep(8000);
  log('');
  log('=== 街区中立强证据 ===');
  log('NPC_NEUTRAL: ' + await ev(`NPC_NEUTRAL`));
  log('startMatch: ' + await ev(`(function(){try{startMatch();el('menu').classList.add('hidden');showDeploy(false);selectedSpawn=-1;deployPlayer();return 'OK '+WPN_DEFS[player.curW.key].name;}catch(e){return 'EXC '+e.message+' @'+e.stack.split('\\n')[1];}})()`));

  // 贴身验证: 每秒把玩家拉回 bot 旁 6m, 持续 14s, 观察是否有人锁定/开火
  log('');
  log('--- 贴身 14s (每秒把玩家拉回 bot 旁 6m) ---');
  await ev(`(function(){
    const b=soldiers.find(s=>s.team!==player.team&&s.alive);
    window.__b=b; window.__hp0=player.hp; window.__pinN=0;
    window.__pin=setInterval(()=>{
      const b2=window.__b; if(!b2||!b2.alive) return;
      for(let a=0;a<32;a++){
        const ang=a/32*Math.PI*2;
        const x=b2.pos.x+Math.sin(ang)*6, z=b2.pos.z+Math.cos(ang)*6;
        if(occBlocked(x,z)) continue;
        player.pos.set(x,0,z); player.pos.y=standHeight(x,z,10);
        window.__pinN++; return;
      }
    },1000);
    return 'bot='+b.name;
  })()`);
  await sleep(14000);
  log('结果: 敌人有目标=' + await ev(`soldiers.filter(s=>s.team!==player.team&&s.alive&&s.target).length`)
    + ' 近14s开火NPC=' + await ev(`soldiers.filter(s=>s.lastFiredT>nowT-14).length`)
    + ' 玩家掉血=' + await ev(`(${await ev(`window.__hp0`)}-player.hp).toFixed(1)`)
    + ' 玩家距离bot=' + await ev(`Math.round(Math.hypot(window.__b.pos.x-player.pos.x,window.__b.pos.z-player.pos.z))`));
  log('该 bot: ' + await ev(`(function(){const b=window.__b;return 'state='+b.state+' target='+(b.target?b.target.name:'null')+' hp='+Math.round(b.hp);})()`));
  await shot('scav_neutral_pin.png');

  log('');
  log('--- 开火反击 (玩家贴到 bot 旁 4m 并打它) ---');
  await ev(`clearInterval(window.__pin)`);
  log('打它: ' + await ev(`(function(){
    const b=window.__b;
    let best=null;
    for(let a=0;a<32;a++){ const ang=a/32*Math.PI*2; const x=b.pos.x+Math.sin(ang)*4, z=b.pos.z+Math.cos(ang)*4; if(!occBlocked(x,z)){best=[x,z];break;} }
    if(best){ player.pos.set(best[0],0,best[1]); player.pos.y=standHeight(best[0],best[1],10); }
    player.hp=player.maxHp;
    b.damage(6,player,false);
    return 'bot target='+(b.target?b.target.name:'null')+' aggro='+b.aggro.length+' 玩家距bot='+Math.round(Math.hypot(b.pos.x-player.pos.x,b.pos.z-player.pos.z));
  })()`));
  await sleep(9000);
  log('9s 后: bot 最近开火距今=' + await ev(`(nowT-window.__b.lastFiredT).toFixed(1)+'s'`)
    + ' 有目标的敌人数=' + await ev(`soldiers.filter(s=>s.team!==player.team&&s.alive&&s.target).length`)
    + ' 玩家血量=' + await ev(`Math.round(player.hp)+'/'+player.maxHp`));
  log('bot 状态: ' + await ev(`(function(){const b=window.__b;return 'alive='+b.alive+' target='+(b.target?b.target.name:'null')+' state='+b.state+' hp='+Math.round(b.hp);})()`));
  await shot('scav_retaliate_pin.png');

  log('');
  log('=== console EXC ===');
  log(errs.length ? errs.slice(0, 8).join('\n') : '无');
  finish(0);
})().catch(e => { log('FATAL ' + e.message + '\n' + e.stack); finish(1); });
