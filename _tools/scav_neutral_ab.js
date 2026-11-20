// 街区中立 NPC 的确定性 A/B 探针 (必须带视线校验)
// 旧探针 (scav_usec_live.js 的 A5/A6) 只用 occBlocked 选落点, 不保证 bot 能"看到"玩家,
// 于是"中立不开火"可能是假阴性 (bot 根本看不见), "反击"也可能是假阴性 (看不见就不开火)。
// 本脚本用游戏自己的 raycastWorld 复刻 perceive() 的视线判定, 只在 LOS 通畅时下结论。
//
// 用法: node _tools/scav_neutral_ab.js [campaignIdx]   (默认 0 = 街区)
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const CAMP = process.argv[2] || '0';
const PORT = 9473, URL = 'http://127.0.0.1:8123/index.html';
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;

function finish(code) {
  try { if (ws) ws.close(); } catch (e) { }
  try { if (proc) proc.kill(); } catch (e) { }
  fs.writeFileSync(path.join(ROOT, '_tools', 'scav_neutral_ab.txt'), out.join('\n') + '\n', 'utf8');
  process.exit(code);
}

// 在页面里注入一次: 把玩家摆到"正对 bot 且视线通畅"的位置
const PLACE = `(function(){
  const b=soldiers.find(s=>s.team!==player.team&&s.alive&&!s.onVehicle&&!s.pilotOf);
  if(!b) return 'NO_BOT';
  const offs=[0,0.5,-0.5,0.9,-0.9,1.3,-1.3,1.7,-1.7,2.2,-2.2,3.14];
  const dists=[6,8,10,13];
  for(const dd of dists) for(const off of offs){
    const a=b.yaw+off;
    const px=b.pos.x+Math.sin(a)*dd, pz=b.pos.z+Math.cos(a)*dd;
    if(occBlocked(px,pz)) continue;
    const py=standHeight(px,pz,10);
    const eye=b.eyePos();
    const tp=V3(px,py+1.4,pz);
    const dv=tp.clone().sub(eye); const L=dv.length(); dv.normalize();
    const hit=raycastWorld(eye,dv,L);
    if(hit&&hit.dist<L-0.6) continue;              // 视线被挡
    player.pos.set(px,0,pz); player.pos.y=py;
    window.__b=b; window.__place={d:dd,off:+off.toFixed(2),los:true};
    return 'ok bot='+b.name+' dist='+dd+' off='+off.toFixed(2);
  }
  return 'NO_LOS_SPOT';
})()`;

(async () => {
  const ud = path.join(require('os').tmpdir(), 'scavab_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,760', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  await sleep(2500);
  let list = null;
  for (let i = 0; i < 40; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list && list.length) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page');
  if (!page) { log('NO_PAGE'); return finish(1); }
  ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); if (j.method === 'Runtime.exceptionThrown') errs.push('EXC ' + ((j.params.exceptionDetails.exception || {}).description || '').split('\n')[0]); if (j.method === 'Log.entryAdded' && j.params.entry.level === 'error') errs.push('LOG ' + String(j.params.entry.text).slice(0, 200)); });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable'); await rpc('Log.enable');
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : String(o); };

  await rpc('Page.navigate', { url: URL });
  await sleep(7000);
  await ev(`localStorage.setItem('sf_campaign','${CAMP}'); localStorage.removeItem('bf_meta_v1');`);
  await rpc('Page.navigate', { url: URL });
  await sleep(7000);

  log('CAMPAIGN=' + await ev(`CAMPAIGN.id`) + '  NPC_NEUTRAL=' + await ev(`NPC_NEUTRAL`));
  await ev(`(function(){try{startMatch();el('menu').classList.add('hidden');showDeploy(false);selectedSpawn=-1;deployPlayer();}catch(e){return 'EXC '+e.message;}return 'OK';})()`);
  await sleep(1500);

  log('');
  log('=== ① 中立态: 正对 bot + 视线通畅, 静置 14s ===');
  log('摆位: ' + await ev(PLACE));
  log('LOS 确认: ' + await ev(`JSON.stringify(window.__place)`));
  log('摆放瞬间 bot 是否已锁定玩家(应为 false): ' + await ev(`(function(){const b=window.__b;return b?(b.target?b.target.name:'null'):'gone';})()`));
  const hp0 = await ev(`Math.round(player.hp)`);
  const t0 = await ev(`nowT`);
  await sleep(14000);
  log('静置游戏秒: ' + await ev(`(nowT-${t0}).toFixed(1)`));
  log('敌人有目标数(应为 0): ' + await ev(`soldiers.filter(s=>s.team!==player.team&&s.alive&&s.target).length`));
  log('友军有目标数(应为 0): ' + await ev(`soldiers.filter(s=>s.team===player.team&&s.alive&&s.target).length`));
  log('14s 内开火的 NPC 数(应为 0): ' + await ev(`soldiers.filter(s=>s.lastFiredT>nowT-14).length`));
  log('玩家血量 ' + hp0 + ' -> ' + await ev(`Math.round(player.hp)`) + ' (应不变)');
  log('该 bot: ' + await ev(`(function(){const b=window.__b;return b?('alive='+b.alive+' target='+(b.target?b.target.name:'null')+' state='+b.state+' dist='+Math.round(Math.hypot(b.pos.x-player.pos.x,b.pos.z-player.pos.z))):'gone';})()`));

  log('');
  log('=== ② 反击态: 重新摆到正对位, 打它一枪, 观察 8s ===');
  log('重摆位: ' + await ev(PLACE));
  log('LOS 确认: ' + await ev(`JSON.stringify(window.__place)`));
  const firedBefore = await ev(`window.__b.lastFiredT`);
  const hp1 = await ev(`Math.round(player.hp)`);
  log('开火前 lastFiredT: ' + firedBefore);
  log('打它一枪: ' + await ev(`(function(){const b=window.__b;b.damage(7,player,false);return 'botHp='+Math.round(b.hp)+' target='+(b.target?b.target.name:'null')+' aggro='+b.aggro.length+' state='+b.state;})()`));
  await sleep(1000);
  log('1.0s 后: ' + await ev(`(function(){const b=window.__b;return 'target='+(b.target?b.target.name:'null')+' state='+b.state+' 已开火='+(b.lastFiredT>${firedBefore});})()`));
  await sleep(3000);
  log('4.0s 后: ' + await ev(`(function(){const b=window.__b;return 'target='+(b.target?b.target.name:'null')+' state='+b.state+' 已开火='+(b.lastFiredT>${firedBefore})+' lastFiredAge='+(nowT-b.lastFiredT).toFixed(1)+'s';})()`));
  await sleep(4000);
  const hp2 = await ev(`Math.round(player.hp)`);
  log('8.0s 后: ' + await ev(`(function(){const b=window.__b;return 'target='+(b.target?b.target.name:'null')+' 已开火='+(b.lastFiredT>${firedBefore})+' lastFiredAge='+(nowT-b.lastFiredT).toFixed(1)+'s';})()`));
  log('玩家血量 ' + hp1 + ' -> ' + hp2 + ' (应下降)');
  log('结仇连坐: 有目标的敌人总数 = ' + await ev(`soldiers.filter(s=>s.team!==player.team&&s.alive&&s.target).length`));
  log('该 bot 的 aggro 名单: ' + await ev(`(function(){const b=window.__b;return JSON.stringify(b.aggro.map(a=>a.e&&a.e.name||'?'));})()`));
  log('诊断: ' + await ev(`(function(){const b=window.__b;
    const ang=Math.atan2(player.pos.x-b.pos.x,player.pos.z-b.pos.z);
    return 'playerAlive='+player.alive+' playerHp='+Math.round(player.hp)
      +' playerPos=['+player.pos.x.toFixed(1)+','+player.pos.z.toFixed(1)+']'
      +' botPos=['+b.pos.x.toFixed(1)+','+b.pos.z.toFixed(1)+']'
      +' botYaw='+b.yaw.toFixed(2)+' angToPlayer='+ang.toFixed(2)
      +' angDiff='+Math.abs(angDiff(b.yaw,ang)).toFixed(2)
      +' lastSeenAge='+(nowT-b.lastSeenT).toFixed(1)
      +' aggroLen='+b.aggro.length
      +' matchOver='+(typeof matchOver!=='undefined'?matchOver:'?');})()`));

  log('');
  log('=== ③ 控制台异常 ===');
  log(errs.length ? errs.slice(0, 10).join('\n') : '无');
  finish(0);
})().catch(e => { log('FATAL ' + e.message); finish(1); });
