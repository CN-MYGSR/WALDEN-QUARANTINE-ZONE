// 开发者控制台验收
// 覆盖: ~ 开关 · 输入框聚焦 · 打字不触发游戏动作 · help/list/未知指令 · dmg 倍率 · god ·
//       准星击杀 · killall · heal/ammo/nade/money/tp · 自杀 · 控制台异常
// 用法: node _tools/_devcon_probe.js [url]
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9511;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;

function finish(code) {
  try { if (ws) ws.close(); } catch (e) { }
  try { if (proc) proc.kill(); } catch (e) { }
  fs.writeFileSync(path.join(ROOT, '_tools', '_devcon_probe.txt'), out.join('\n') + '\n', 'utf8');
  process.exit(code);
}

(async () => {
  const ud = path.join(require('os').tmpdir(), 'devcon_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,800', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  await sleep(2500);
  let list = null;
  for (let i = 0; i < 40; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list && list.length) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page');
  if (!page) { log('NO_PAGE'); return finish(1); }
  ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => {
    const j = JSON.parse(m);
    if (j.id && pend[j.id]) pend[j.id](j);
    if (j.method === 'Runtime.exceptionThrown') errs.push('EXC ' + ((j.params.exceptionDetails.exception || {}).description || '').split('\n')[0]);
  });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable');
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : String(o); };
  const key = (type, code, k, vk) => rpc('Input.dispatchKeyEvent', { type, code, key: k, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  // 往控制台输入一行 (insertText 走输入法通道, 不触发 keydown; 回车再单独派发)
  const typeLine = async (s) => {
    await rpc('Input.insertText', { text: s });
    await sleep(120);
    await key('keyDown', 'Enter', 'Enter', 13); await sleep(80);
    await key('keyUp', 'Enter', 'Enter', 13); await sleep(260);
  };
  const lastLines = async (n) => await ev(`(function(){const l=el('devConLog');if(!l)return 'NO_LOG';
    return [...l.children].slice(-${n}).map(d=>d.className.replace('devLine','').trim()+': '+d.textContent).join('\\n');})()`);

  await rpc('Page.navigate', { url: URL });
  await sleep(14000);
  await ev(`localStorage.setItem('sf_campaign','0'); localStorage.removeItem('bf_meta_v1'); localStorage.removeItem('bf_keys_v1');`);
  await rpc('Page.navigate', { url: URL });
  await sleep(15000);

  log('=== 0) 加载 ===');
  log('window.DEV : ' + await ev(`typeof window.DEV`));
  log('devOpenConsole 可用 : ' + await ev(`typeof devOpenConsole`));
  log('设置里没有控制台入口 : ' + await ev(`(function(){
    if(el('devConBtn')) return '❌ 仍然存在 #devConBtn';
    const t=[...document.querySelectorAll('#mSet button')].map(b=>b.textContent).join(' | ');
    return '✅ 无 #devConBtn · 设置页按钮: '+t;
  })()`));

  log('');
  log('=== 1) 按 ~ 打开 ===');
  await key('keyDown', 'Backslash', '\\', 220); await sleep(80);
  await key('keyUp', 'Backslash', '\\', 220); await sleep(400);
  log('DEV.consoleOpen (应 true) : ' + await ev(`window.DEV.consoleOpen`));
  log('#devCon 可见 : ' + await ev(`el('devCon')?!el('devCon').classList.contains('hidden'):'NO_EL'`));
  log('输入框已聚焦 : ' + await ev(`document.activeElement&&document.activeElement.id`));
  log('bag/score 键位已被挪开 : ' + await ev(`keyOf('bag')+' / '+keyOf('score')`));

  log('');
  log('=== 2) help / 未知指令 / list ===');
  await typeLine('help');
  log(await lastLines(4));
  await typeLine('foobar');
  log(await lastLines(1));
  await typeLine('list wpn');
  log(await lastLines(2));

  log('');
  log('=== 3) 打字不应触发游戏动作 (按 P 不该弹计分板) ===');
  await key('keyDown', 'KeyP', 'p', 80); await sleep(60); await key('keyUp', 'KeyP', 'p', 80); await sleep(200);
  log('计分板 display (应 none/空): ' + await ev(`el('scoreboard').style.display||'(空)'`));
  log('背包面板 BAG_UI.open (应 false): ' + await ev(`typeof BAG_UI!=='undefined'?BAG_UI.open:'无 BAG_UI'`));

  log('');
  log('=== 4) 部署一局, 测战斗类指令 ===');
  log('部署(先开无敌, 免得测试途中被打死): ' + await ev(`(function(){try{
    window.DEV.god=true;
    el('menu').classList.add('hidden'); startMatch(); showDeploy(false); selectedSpawn=-1; deployPlayer();
    return 'OK';}catch(e){return 'EXC '+e.message;}})()`));
  await sleep(2500);
  log('敌人存活: ' + await ev(`combatants.filter(s=>s!==player&&s.team!==player.team&&s.alive).length`));

  log('');
  log('=== 5) dmg 倍率 ===');
  await typeLine('dmg 5');
  log('  DEV.dmgMul (应 5): ' + await ev(`window.DEV.dmgMul`));
  log('  非法参数: '); await typeLine('dmg abc');
  log('  ' + await lastLines(1));

  log('');
  log('=== 6) god 无敌 ===');
  log('  部署时已开, DEV.god (应 true): ' + await ev(`window.DEV.god`));
  log('  无敌中 player.damage(500) → hp: ' + await ev(`(function(){player.damage(500,null,true);return Math.round(player.hp);})()`) + '  (应不变)');
  await typeLine('god off');
  log('  god off 后 DEV.god (应 false): ' + await ev(`window.DEV.god`));
  log('  此时 player.damage(50) → hp: ' + await ev(`(function(){player.damage(50,null,true);return Math.round(player.hp);})()`) + '  (应减少)');
  await typeLine('god');
  log('  再开上 DEV.god (应 true): ' + await ev(`window.DEV.god`));
  log('  再开上后 player.damage(500) → hp: ' + await ev(`(function(){player.damage(500,null,true);return Math.round(player.hp);})()`) + '  (应不变)');

  log('');
  log('=== 7) 准星击杀 ===');
  log('  诊断 (无敌下仍可能被别的路径打死): ' + await ev(`(function(){
    return 'alive='+player.alive+' hp='+Math.round(player.hp)
      +' 出血轻/重='+(player.bleedLight||0)+'/'+(player.bleedHeavy||0)
      +' 骨折='+((player.fractures&&player.fractures.length)||0)
      +' 水分/保食='+Math.round(player.water==null?-1:player.water)+'/'+Math.round(player.food==null?-1:player.food);
  })()`));
  log('  强制复活 (只为验证 kill 指令本身): ' + await ev(`(function(){player.alive=true;player.hp=player.maxHp||440;
    player.bleedLight=0;player.bleedHeavy=0;player.fractures=[];return 'OK';})()`));
  log('先把视角对准最近的敌人: ' + await ev(`(function(){
    const es=combatants.filter(s=>s!==player&&s.team!==player.team&&s.alive);
    if(!es.length) return '没有敌人';
    let best=null,bd=1e9;
    for(const s of es){ const d=Math.hypot(s.pos.x-player.pos.x,s.pos.z-player.pos.z); if(d<bd){bd=d;best=s;} }
    player.yaw=Math.atan2(best.pos.x-player.pos.x,best.pos.z-player.pos.z);
    player.pitch=0; updateCamera();
    return '已对准 '+best.name+' 距离 '+bd.toFixed(1)+'m';
  })()`));
  await sleep(300);
  await typeLine('kill');
  log(await lastLines(2));
  log('  敌人存活(应少 1): ' + await ev(`combatants.filter(s=>s!==player&&s.team!==player.team&&s.alive).length`));

  log('');
  log('=== 8) heal / ammo / nade / money / tp ===');
  log('先把血和弹打掉一点: ' + await ev(`(function(){player.hp=100;player.curW.mag=1;player.nadeCount=0;
    return 'hp='+Math.round(player.hp)+' mag='+player.curW.mag+' nade='+player.nadeCount;})()`));
  await typeLine('heal');
  await typeLine('ammo');
  await typeLine('nade 3');
  log('  结果: hp=' + await ev(`Math.round(player.hp)`) + ' mag=' + await ev(`player.curW.mag`) + ' nade=' + await ev(`player.nadeCount`));
  const w0 = await ev(`META.wallet`);
  await typeLine('money 12345');
  log('  货币: ' + w0 + ' → ' + await ev(`META.wallet`));
  await typeLine('tp 12 -34');
  log('  位置: ' + await ev(`player.pos.x.toFixed(1)+','+player.pos.z.toFixed(1)`));

  log('');
  log('=== 9) killall ===');
  await typeLine('killall');
  log(await lastLines(1));
  log('  敌人存活(应 0): ' + await ev(`combatants.filter(s=>s!==player&&s.team!==player.team&&s.alive).length`));

  log('');
  log('=== 10) 自杀 ===');
  await typeLine('suicide');
  log(await lastLines(1));
  log('  player.alive (应 false): ' + await ev(`player.alive`));

  log('');
  log('=== 11) 关闭控制台 ===');
  await key('keyDown', 'Backslash', '\\', 220); await sleep(80);
  await key('keyUp', 'Backslash', '\\', 220); await sleep(400);
  log('DEV.consoleOpen (应 false): ' + await ev(`window.DEV.consoleOpen`));
  log('#devCon 隐藏: ' + await ev(`el('devCon').classList.contains('hidden')`));
  log('bag/score 键位已还原: ' + await ev(`keyOf('bag')+' / '+keyOf('score')`));

  log('');
  log('=== 11b) 左键取消聚焦 ===');
  await key('keyDown', 'Backslash', '\\', 220); await sleep(60);
  await key('keyUp', 'Backslash', '\\', 220); await sleep(300);
  log('  重新打开 consoleOpen (应 true): ' + await ev(`window.DEV.consoleOpen`));
  await rpc('Input.dispatchMouseEvent', { type: 'mousePressed', x: 40, y: 40, button: 'left', clickCount: 1 });
  await rpc('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 40, y: 40, button: 'left', clickCount: 1 });
  await sleep(300);
  log('  左键点画面外后 consoleOpen (应 false): ' + await ev(`window.DEV.consoleOpen`));

  log('');
  log('=== 11c) 补测剩余指令 (先复活) ===');
  await ev(`(function(){player.alive=true;player.hp=player.maxHp||440;return 'OK';})()`);
  await key('keyDown', 'Backslash', '\\', 220); await sleep(60);
  await key('keyUp', 'Backslash', '\\', 220); await sleep(300);
  log('  重新打开: ' + await ev(`window.DEV.consoleOpen`));

  log('  [give m4 3]'); await typeLine('give m4 3');
  log('    ' + await lastLines(1) + '  · 仓库 m4 = ' + await ev(`ownedCount('m4')`));
  log('  [give 不存在的枪]'); await typeLine('give zzz');
  log('    ' + await lastLines(1));

  log('  [wpn ak74m]'); await typeLine('wpn ak74m');
  log('    ' + await lastLines(1) + '  · 当前武器 = ' + await ev(`player.curW.key`));

  log('  [pos]'); await typeLine('pos');
  log('    ' + await ev(`(function(){const l=el('devConLog');return l.children[l.children.length-2].textContent;})()`));
  log('    ' + await ev(`(function(){const l=el('devConLog');return l.children[l.children.length-1].textContent;})()`));
  log('  [bots]'); await typeLine('bots');
  log('    ' + await lastLines(1));

  log('  [dmgai 2]'); await typeLine('dmgai 2');
  log('    EFF_DIFF.dmgMul (应 2) = ' + await ev(`EFF_DIFF.dmgMul`));
  log('  [elo 1500]'); await typeLine('elo 1500');
  log('    ELO.rating = ' + await ev(`Math.round(ELO.rating)`));

  log('  [nvg]'); await typeLine('nvg');
  log('    ' + await lastLines(1));

  log('  [list weather]'); await typeLine('list weather');
  log('    ' + await lastLines(1));
  log('  [list cmd]'); await typeLine('list cmd');
  log('    ' + await lastLines(1));
  log('  [help dmg]'); await typeLine('help dmg');
  log('    ' + await lastLines(1));

  log('  [killall all]'); await typeLine('killall all');
  log('    ' + await lastLines(1) + '  · 场上存活 bot = ' + await ev(`combatants.filter(s=>s!==player&&s.alive).length`));

  log('  [clear]'); await typeLine('clear');
  log('    清屏后日志行数 (应 0): ' + await ev(`el('devConLog').children.length`));

  log('');
  log('=== 11d) weather (会重载, 放最后) ===');
  await typeLine('weather');
  log('    ' + await lastLines(1));
  await typeLine('weather fog');
  log('    ' + await lastLines(1));
  await sleep(1200);
  log('    localStorage.sf_weather (应 fog) = ' + await ev(`localStorage.getItem('sf_weather')`));
  log('    重载后 WEATHER_MODE (应 fog) = ' + await ev(`typeof WEATHER_MODE!=='undefined'?WEATHER_MODE:'(还没起来)'`));

  log('');
  log('=== 12) 控制台异常 ===');
  log(errs.length ? errs.slice(0, 10).join('\n') : '无');
  finish(0);
})().catch(e => { log('FATAL ' + e.message); finish(1); });
