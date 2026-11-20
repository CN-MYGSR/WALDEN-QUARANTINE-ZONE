// SCAV/USEC 阵营改名 + SCAV 随机二战主武器 + 街区 NPC 中立 —— 实机验证
// 复用 8123 上已启动的 no-cache 服务器 (脚本自己不再起服务)
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const PORT = 9471, URL = 'http://127.0.0.1:8123/index.html';
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;

function finish(code) {
  try { if (ws) ws.close(); } catch (e) { }
  try { if (proc) proc.kill(); } catch (e) { }
  fs.writeFileSync(path.join(ROOT, '_tools', 'scav_usec_live.txt'), out.join('\n') + '\n', 'utf8');
  process.exit(code);
}

(async () => {
  const ud = path.join(require('os').tmpdir(), 'scavusec_' + Date.now());
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
  const shot = async name => { const o = await rpc('Page.captureScreenshot', { format: 'png' }); if (o.result && o.result.data) fs.writeFileSync(path.join(ROOT, 'outputs', name), Buffer.from(o.result.data, 'base64')); };

  // ================= 阶段 A: 街区 (campaign 0) =================
  await rpc('Page.navigate', { url: URL });
  await sleep(7000);
  await ev(`localStorage.setItem('sf_campaign','0'); localStorage.removeItem('bf_meta_v1');`);
  await rpc('Page.navigate', { url: URL });
  await sleep(7000);

  log('=== A1. 阵营数据 ===');
  log('CAMPAIGN: ' + await ev(`CAMPAIGN.id + ' / npcNeutral=' + CAMPAIGN.npcNeutral + ' / NPC_NEUTRAL=' + NPC_NEUTRAL`));
  log('TEAM_FACTION: ' + await ev(`TEAM_FACTION.map(f=>f.short+'('+f.name+',sym='+f.sym+',scav='+!!f.scav+')').join(' | ')`));
  log('TEAM_NAME: ' + await ev(`JSON.stringify(TEAM_NAME)`));
  log('USEC cls 前2: ' + await ev(`JSON.stringify(FACTIONS.usec.cls.slice(0,2))`));

  log('');
  log('=== A2. 部署界面阵营按钮 ===');
  log('teamUS  : ' + await ev(`el('teamUS') ? el('teamUS').innerHTML : 'NO_EL'`));
  log('teamGER : ' + await ev(`el('teamGER') ? el('teamGER').innerHTML : 'NO_EL'`));
  log('el(\'menuSub\'): ' + await ev(`el('menuSub') ? el('menuSub').textContent : 'NO_EL'`));

  log('');
  log('=== A3. SCAV 随机武器池 ===');
  log('SCAV_WPN_POOL.length: ' + await ev(`SCAV_WPN_POOL.length`));
  log('池内容: ' + await ev(`SCAV_WPN_POOL.map(k=>WPN_DEFS[k].name).join(' / ')`));
  log('20 次抽样: ' + await ev(`(function(){const a=[];for(let i=0;i<20;i++)a.push(rollScavWeapon());return [...new Set(a)].map(k=>WPN_DEFS[k].name).join(', ');})()`));

  log('');
  log('=== A4. 开局部署 (SCAV) ===');
  await ev(`(function(){try{startMatch();el('menu').classList.add('hidden');showDeploy(false);}catch(e){return 'EXC '+e.message;}return 'OK';})()`);
  await sleep(1200);
  log('开局后 RUN.scavLoadout.primary: ' + await ev(`RUN.scavLoadout ? (WPN_DEFS[RUN.scavLoadout.primary]?WPN_DEFS[RUN.scavLoadout.primary].name:RUN.scavLoadout.primary) : 'null'`));
  log('兵种卡 cw0 文案: ' + await ev(`el('cw0') ? el('cw0').textContent : 'NO_EL'`));
  log('兵种卡 cw4 文案: ' + await ev(`el('cw4') ? el('cw4').textContent : 'NO_EL'`));
  await shot('scav_deploy_menu.png');
  log('deployPlayer: ' + await ev(`(function(){try{selectedSpawn=-1;deployPlayer();}catch(e){return 'EXC '+e.message;}return 'OK';})()`));
  await sleep(1200);
  log('玩家主武器: ' + await ev(`player.curW ? (WPN_DEFS[player.curW.key]?WPN_DEFS[player.curW.key].name:player.curW.key)+'  ('+player.curW.key+')' : 'none'`));
  log('主武器在二战池内: ' + await ev(`SCAV_WPN_POOL.indexOf(player.curW.key)>=0`));
  log('RUN.scav / raidLoadout().primary: ' + await ev(`RUN.scav + ' / ' + raidLoadout().primary`));
  log('META.loadout.primary 未被改写: ' + await ev(`META.loadout.primary`));
  log('META.owned 未被扣主武器: ' + await ev(`JSON.stringify(META.owned)`));
  log('背包容量/重量: ' + await ev(`bagCapacity() + ' 格 / ' + bagWeight() + ' kg'`));
  log('保险费用(SCAV 应为0): ' + await ev(`insuranceCost()`));
  log('玩家血量: ' + await ev(`Math.round(player.hp)+'/'+player.maxHp`));

  log('');
  log('=== A5. 街区中立: 把玩家挪到敌人附近静置 12s ===');
  log('挪位: ' + await ev(`(function(){
    const b=soldiers.find(s=>s.team!==player.team&&s.alive);
    if(!b) return 'NO_BOT';
    // 找一个可行走落点, 距该 bot 约 12m
    let best=null,bd=1e9;
    for(let a=0;a<24;a++){
      const ang=a/24*Math.PI*2;
      const x=b.pos.x+Math.sin(ang)*12, z=b.pos.z+Math.cos(ang)*12;
      if(occBlocked(x,z)) continue;
      const d=Math.hypot(x-b.pos.x,z-b.pos.z);
      if(d<bd){bd=d;best=[x,z];}
    }
    if(!best) return 'NO_SPOT';
    player.pos.set(best[0],0,best[1]); player.pos.y=standHeight(best[0],best[1],10);
    window.__probeBot=b;
    return 'ok dist='+Math.round(Math.hypot(player.pos.x-b.pos.x,player.pos.z-b.pos.z))+' bot='+b.name;
  })()`));
  const t0 = await ev(`nowT`);
  await sleep(12000);
  log('静置时长(游戏秒): ' + await ev(`(nowT-${t0}).toFixed(1)`));
  log('敌人有目标的个数: ' + await ev(`soldiers.filter(s=>s.team!==player.team&&s.alive&&s.target).length`));
  log('友军有目标的个数: ' + await ev(`soldiers.filter(s=>s.team===player.team&&s.alive&&s.target).length`));
  log('近 12s 内开过火的 NPC 数: ' + await ev(`soldiers.filter(s=>s.lastFiredT>nowT-12).length`));
  log('玩家血量(应不变): ' + await ev(`Math.round(player.hp)+'/'+player.maxHp`));
  log('近处那个 bot 状态: ' + await ev(`(function(){const b=window.__probeBot;return b? ('alive='+b.alive+' target='+(b.target?b.target.name:'null')+' state='+b.state+' dist='+Math.round(Math.hypot(b.pos.x-player.pos.x,b.pos.z-player.pos.z))):'gone';})()`));
  await shot('scav_neutral_idle.png');

  log('');
  log('=== A6. 攻击该 NPC → 应立刻反击 ===');
  log('打它一枪: ' + await ev(`(function(){const b=window.__probeBot;if(!b||!b.alive)return 'NO_BOT';b.damage(7,player,false);return 'hp='+Math.round(b.hp)+' target='+(b.target?b.target.name:'null')+' aggro='+b.aggro.length;})()`));
  await sleep(2500);
  log('2.5s 后: ' + await ev(`(function(){const b=window.__probeBot;if(!b)return 'gone';return 'alive='+b.alive+' hp='+Math.round(b.hp)+' target='+(b.target?b.target.name:'null')+' state='+b.state+' fired='+(b.lastFiredT>nowT-3);})()`));
  log('此刻有目标的敌人总数(应只含结仇单位及其附近同小队): ' + await ev(`soldiers.filter(s=>s.team!==player.team&&s.alive&&s.target).length`));
  await sleep(6000);
  log('8.5s 后玩家血量: ' + await ev(`Math.round(player.hp)+'/'+player.maxHp`));
  log('该 bot 是否在向玩家射击: ' + await ev(`(function(){const b=window.__probeBot;if(!b)return 'gone';return 'target='+(b.target?b.target.name:'null')+' lastFiredAge='+(nowT-b.lastFiredT).toFixed(1)+'s';})()`));
  await shot('scav_neutral_retaliate.png');

  log('');
  log('=== A7. 控制台异常 ===');
  log(errs.length ? errs.slice(0, 10).join('\n') : '无');

  // ================= 阶段 B: 实验室 (campaign 1) 非中立 =================
  log('');
  log('======== 阶段 B: 实验室 (应保持正常交火) ========');
  await ev(`localStorage.setItem('sf_campaign','1');`);
  await rpc('Page.navigate', { url: URL });
  await sleep(8000);
  log('CAMPAIGN / NPC_NEUTRAL: ' + await ev(`CAMPAIGN.id + ' / ' + NPC_NEUTRAL`));
  log('TEAM_FACTION: ' + await ev(`TEAM_FACTION.map(f=>f.short).join(' | ')`));
  log('teamUS/teamGER: ' + await ev(`el('teamUS').innerHTML + '   ||   ' + el('teamGER').innerHTML`));
  await ev(`(function(){try{startMatch();el('menu').classList.add('hidden');showDeploy(false);selectedSpawn=-1;deployPlayer();}catch(e){return 'EXC '+e.message;}return 'OK';})()`);
  await sleep(1000);
  log('实验室部署后主武器: ' + await ev(`WPN_DEFS[player.curW.key]?WPN_DEFS[player.curW.key].name:player.curW.key`));
  log('RUN.scav: ' + await ev(`RUN.scav`));
  await sleep(14000);
  log('14s 后: 敌人有目标数=' + await ev(`soldiers.filter(s=>s.team!==player.team&&s.alive&&s.target).length`)
    + ' 开火过的NPC数=' + await ev(`soldiers.filter(s=>s.lastFiredT>nowT-14).length`)
    + ' 玩家血量=' + await ev(`Math.round(player.hp)+'/'+player.maxHp`));
  log('控制台异常: ' + (errs.length ? errs.slice(0, 10).join(' ; ') : '无'));
  await shot('scav_lab_normal.png');

  finish(0);
})().catch(e => { log('FATAL ' + e.message); finish(1); });
