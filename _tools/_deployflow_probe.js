// 部署流程验收: 建局时机从「点开始」推迟到「点部署」
// 覆盖: 点开始后立刻进部署界面且**尚未建局** · 点部署才建局并落地 · 重复部署不重建 · 控制台异常
// 用法: node _tools/_deployflow_probe.js [url]
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9519;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) { try { if (ws) ws.close(); } catch (e) { } try { if (proc) proc.kill(); } catch (e) { } fs.writeFileSync(path.join(ROOT, '_tools', '_deployflow_probe.txt'), out.join('\n') + '\n', 'utf8'); process.exit(c); }
(async () => {
  const ud = path.join(require('os').tmpdir(), 'df_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,800', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  await sleep(2500);
  let list = null;
  for (let i = 0; i < 40; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list && list.length) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page');
  if (!page) { log('NO_PAGE'); return finish(1); }
  ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); if (j.method === 'Runtime.exceptionThrown') errs.push('EXC ' + ((j.params.exceptionDetails.exception || {}).description || '').split('\n')[0]); });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable');
  // This local deployment test supplies its own stalled SDK response below.
  await rpc('Network.enable');
  await rpc('Network.setBlockedURLs',{urls:['*://gamesvibe.app/*','*://vibe.lumigrav.space/*']});
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : String(o); };

  await rpc('Page.addScriptToEvaluateOnNewDocument',{source:"localStorage.setItem('sf_campaign','0'); localStorage.removeItem('bf_meta_v1')"});
  await rpc('Page.navigate', { url: URL });
  const ready="typeof el==='function' && typeof el('startBtn').onclick==='function' && typeof el('deployBtn').onclick==='function'";
  for(let i=0;i<200 && await ev(ready)!==true;i++) await sleep(150);
  if(await ev(ready)!==true) throw new Error('部署界面初始化超时');

  log('=== 0) 初始 ===');
  log('soldiers/bots 数 (应 0) : ' + await ev(`soldiers.length`) + ' / ' + await ev(`combatants.length`));
  log('_pendingRaid (应 false) : ' + await ev(`typeof _pendingRaid!=='undefined'?_pendingRaid:'(不可见)'`));

  log('');
  log('=== 1) 点「进入当前地图」: 应立刻进部署界面, 且还没建局 ===');
  log('点击耗时(ms) : ' + await ev(`(function(){
    const t0=performance.now();
    el('startBtn').click();
    return Math.round((performance.now()-t0)*10)/10;
  })()`));
  await sleep(500);
  log('部署界面可见 : ' + await ev(`!el('deploy').classList.contains('hidden')`));
  log('菜单已隐藏 : ' + await ev(`el('menu').classList.contains('hidden')`));
  log('soldiers 数 (应仍 0 = 没建局) : ' + await ev(`soldiers.length`));
  log('combatants 数 (应仍 0) : ' + await ev(`combatants.length`));
  log('出生点列表已渲染 : ' + await ev(`el('spawnList').children.length+' 项'`));
  log('部署界面地图已画 : ' + await ev(`(function(){const c=el('deployMap');return c.width+'x'+c.height;})()`));

  log('');
  log('=== 2) 选出生点 + 点「部署」: 这时才建局 ===');
  log('选主基地出生点 : ' + await ev(`(function(){
    const b=el('spawnList').querySelector('button,div');
    const t=el('spawnList').textContent.slice(0,40);
    if(typeof selectedSpawn!=='undefined') selectedSpawn=-1;
    return '列表首项: '+t;
  })()`));
  log('点部署 : ' + await ev(`(function(){try{el('deployBtn').click();return 'clicked';}catch(e){return 'EXC '+e.message;}})()`));
  await sleep(2000);
  log('soldiers 数 (应 >0 = 已建局) : ' + await ev(`soldiers.length`));
  log('combatants 数 (应 >0) : ' + await ev(`combatants.length`));
  log('玩家 : ' + await ev(`player.alive+' deployed='+player.deployed+' hp='+Math.round(player.hp)+' 武器='+((WPN_DEFS[player.curW.key]||{}).name)`));
  log('NPC 中立/地图 : ' + await ev(`NPC_NEUTRAL+' / '+CAMPAIGN.id`));

  log('');
  log('=== 3) 再次部署不应重建整局 (从暂停菜单回部署界面) ===');
  const before = await ev(`(function(){window.__probeBot0=soldiers[0];return 'bot0='+(soldiers[0]?soldiers[0].name:'无')+' 共 '+soldiers.length;})()`);
  log('记录: ' + before);
  await ev(`(function(){showDeploy(false);return 'OK';})()`);
  await sleep(600);
  log('回到部署界面 : ' + await ev(`!el('deploy').classList.contains('hidden')`));
  await ev(`(function(){el('deployBtn').click();return 'OK';})()`);
  await sleep(1200);
  log('再次部署后 soldiers 数 : ' + await ev(`soldiers.length`));
  log('bot0 是否还是同一个对象 (应 true) : ' + await ev(`soldiers[0]===window.__probeBot0`));
  log('玩家仍存活 : ' + await ev(`player.alive`));

  log('');
  log('=== 4) 阵亡后经军械库重选当前地图 ===');
  await ev("player.die(null,true)");
  for(let i=0;i<100 && await ev("matchOver && !el('end').classList.contains('hidden')")!==true;i++) await sleep(150);
  if(await ev("matchOver")!==true) throw new Error('阵亡未结算 '+errs.join(', '));
  await ev("el('armoryBtn').click(); document.querySelector('#mArmory .backBtn').click(); document.querySelector('[data-p=mPlay]').click(); el('mapRow').querySelector('.mapCard.sel').click()");
  if(await ev("!el('deploy').classList.contains('hidden') && !el('deployBtn').disabled && !el('respawnTxt').textContent && respawnCd===0")!==true) throw new Error('新局沿用了上局的重生冷却');
  // 已登录但 SDK 请求一直不返回；用缩短的同一超时验证回退和重复点击。
  await ev("VIBE.user={name:'探针'}; VIBE.client={rooms:{quickJoin:()=>new Promise(()=>{})}}; NET_CFG.autoMatchMs=150; el('deployBtn').click(); el('deployBtn').click()");
  for(let i=0;i<60 && await ev('player.alive && player.deployed')!==true;i++) await sleep(150);
  if(await ev("player.alive && player.deployed && el('netSearch').classList.contains('hidden')")!==true) throw new Error('匹配超时后未进入对局');
  log('冷却已清空，匹配超时后成功部署');

  log('=== 异常 ===');
  log(errs.length ? errs.slice(0, 10).join('\n') : '无');
  finish(errs.length ? 1 : 0);
})().catch(e => { log('FATAL ' + e.message); finish(1); });
