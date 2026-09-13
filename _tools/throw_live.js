// 投掷物自费化 · 实机冒烟 (headless Chrome + CDP + 本地 no-cache 服务器)
// 检查: ① 页面加载无异常 ② 物品 API/市集上架 ③ 部署面板投掷物行
//      ④ 3/4/5 快捷键真的能进入投掷状态 ⑤ 闪光弹能投出并致盲
// 结果写入 _tools/throw_live.txt, 截图写到 outputs/
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9451, URL = 'http://127.0.0.1:8123/index.html';
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const srv = spawn('python', [path.join(ROOT, '_tools', 'serve_nocache.py'), '8123'], { stdio: 'ignore' });
  await sleep(1200);
  const ud = path.join(require('os').tmpdir(), 'throwlive_' + Date.now());
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud,
    '--window-size=1440,900', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  await sleep(2500);
  let list = null;
  for (let i = 0; i < 40; i++) {
    try {
      list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej));
      if (list && list.length) break;
    } catch (e) { await sleep(500); }
  }
  const page = (list || []).find(t => t.type === 'page');
  if (!page) { log('NO_PAGE'); proc.kill(); srv.kill(); fs.writeFileSync('_tools/throw_live.txt', out.join('\n') + '\n', 'utf8'); process.exit(1); }
  const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => {
    const j = JSON.parse(m);
    if (j.id && pend[j.id]) pend[j.id](j);
    if (j.method === 'Runtime.exceptionThrown') errs.push('EXC ' + ((j.params.exceptionDetails.exception || {}).description || '').split('\n')[0]);
    if (j.method === 'Log.entryAdded' && j.params.entry.level === 'error') errs.push('LOG ' + String(j.params.entry.text).slice(0, 160));
  });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable'); await rpc('Log.enable');
  const ev = async e => {
    const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: false });
    if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0];
    return o.result && o.result.result ? o.result.result.value : String(o);
  };
  const shot = async name => {
    const o = await rpc('Page.captureScreenshot', { format: 'png' });
    if (o.result && o.result.data) { fs.writeFileSync(path.join(ROOT, 'outputs', name), Buffer.from(o.result.data, 'base64')); log('  截图 outputs/' + name); }
  };
  await rpc('Page.navigate', { url: URL });
  await sleep(6000);

  log('=== 1. 加载与模块 ===');
  log('THROW_DEFS: ' + await ev(`typeof THROW_DEFS!=='undefined'?JSON.stringify(Object.keys(THROW_DEFS)):'undefined'`));
  log('itemKind(nade_frag) = ' + await ev(`itemKind('nade_frag')`));
  log('itemLabel(nade_flash) = ' + await ev(`itemLabel('nade_flash')`));
  log('市集含投掷物: ' + await ev(`JSON.stringify(TRADE_KEYS.filter(k=>k.indexOf('nade_')===0))`));
  log('玩家初始携带: ' + await ev(`JSON.stringify({frag:player.nadeCount,flash:player.flashCount,smoke:player.smokeCount,at:player.atNades})`));

  log('');
  log('=== 2. 军械库 → 市集 ===');
  await ev(`(function(){const m=document.getElementById('menu');if(m)m.classList.remove('hidden');const h=document.getElementById('mHome');if(h)h.classList.add('hidden');const a=document.getElementById('mArmory');if(a)a.classList.remove('hidden');renderArmory('market');return 1;})()`);
  await sleep(600);
  log('市集含 手雷/闪光弹/烟雾弹: ' + await ev(`(function(){const t=document.getElementById('arList').textContent;return [t.indexOf('手雷')>=0,t.indexOf('闪光弹')>=0,t.indexOf('烟雾弹')>=0].join(',');})()`));
  await shot('throw_market.png');

  log('');
  log('=== 3. 部署面板投掷物行 ===');
  await ev(`(function(){try{showDeploy();}catch(e){return 'showDeploy EXC '+e.message;} return 1;})()`);
  await sleep(600);
  log('#throwRow 单元格数 = ' + await ev(`(document.getElementById('throwRow')||{children:[]}).children.length`));
  log('行内容: ' + await ev(`(function(){const r=document.getElementById('throwRow');return r?Array.from(r.children).map(c=>c.textContent.replace(/\\s+/g,' ').trim()).join(' | '):'MISSING';})()`));
  log('摘要含投掷物行: ' + await ev(`(document.getElementById('consumSummary')||{textContent:''}).textContent.indexOf('投掷物')>=0`));
  await ev(`(function(){const r=document.getElementById('throwRow');if(r&&r.scrollIntoView)r.scrollIntoView({block:'center'});return 1;})()`);
  await sleep(400);
  await shot('throw_deploy.png');

  log('');
  log('=== 4. 快捷键 3 / 4 / 5 (需先真正进场) ===');
  log('进场: ' + await ev(`(function(){try{selectedSpawn=-1;deployPlayer();}catch(e){return 'EXC '+e.message;} return 'alive='+player.alive+' cls='+player.cls;})()`));
  await sleep(1500);
  // 投掷物按键有两个前置: player.alive 且 pointerLocked
  log('出击扣费链路 RUN.throwables = ' + await ev(`JSON.stringify(RUN.throwables)`));
  log('玩家实带 = ' + await ev(`JSON.stringify({frag:player.nadeCount,flash:player.flashCount,smoke:player.smokeCount})`));
  log('出击后仓库 = ' + await ev(`JSON.stringify({frag:META.owned.nade_frag||0,flash:META.owned.nade_flash||0,smoke:META.owned.nade_smoke||0})`));
  log('HUD 投掷物行 = ' + await ev(`document.getElementById('nadeN').textContent`));
  log('pointerLocked 置真: ' + await ev(`(function(){try{pointerLocked=true;return String(pointerLocked);}catch(e){return 'EXC '+e.message;}})()`));
  log('补给投掷物: ' + await ev(`(function(){RUN.throwables={nade_frag:3,nade_flash:2,nade_smoke:2};applyThrowablesToPlayer(player);return JSON.stringify({f:player.nadeCount,l:player.flashCount,s:player.smokeCount});})()`));
  const key = async code => {
    await ev(`(function(){VM.state='idle';return 1;})()`);
    await ev(`(function(){const e=new KeyboardEvent('keydown',{code:'${code}',bubbles:true});window.dispatchEvent(e);return 1;})()`);
    await sleep(250);
    return await ev(`JSON.stringify({state:VM.state,held:player.nadeHeld,smoke:player.nadeIsSmoke,flash:player.nadeIsFlash})`);
  };
  log('按 3: ' + await key('Digit3'));
  log('按 4: ' + await key('Digit4'));
  log('按 5: ' + await key('Digit5'));

  log('');
  log('=== 5. 闪光弹实投 + 致盲 ===');
  log('投前 flashCount = ' + await ev(`player.flashCount`));
  await ev(`(function(){VM.state='idle';InputActions.throwFlash();return 1;})()`);
  await sleep(1800);
  log('投后 flashCount = ' + await ev(`player.flashCount`));
  log('场上闪光弹: ' + await ev(`nades.filter(n=>n.flashN).length`));
  await sleep(1200);
  log('玩家 flashT = ' + await ev(`(player.flashT||0).toFixed(2)`) + '  (自投自闪会因距离衰减为 0, 属预期)');
  // 直接在脚下引爆: 验证致盲链路
  log('脚下引爆: ' + await ev(`(function(){const alive=(soldiers||[]).filter(s=>s&&s.alive);const n=flashBangBlind(player.pos,null);return '存活NPC='+alive.length+' 命中='+n+' playerFlashT='+(player.flashT||0).toFixed(2)+' ads='+player.ads;})()`));
  await sleep(300);
  log('白屏 overlay opacity = ' + await ev(`document.getElementById('flashOv').style.opacity`));
  log('被致盲的 NPC 数 = ' + await ev(`(soldiers||[]).filter(s=>s&&(s.flashT||0)>0).length`));
  log('soldiers 总数 = ' + await ev(`(typeof soldiers!=='undefined')?soldiers.length:'undefined'`));
  log('Bot.perceive 已被包裹: ' + await ev(`(typeof Bot!=='undefined'&&String(Bot.prototype.perceive).indexOf('flashT')>=0)?'OK':'FAIL'`));
  log('Bot.update 已被包裹: ' + await ev(`(typeof Bot!=='undefined'&&String(Bot.prototype.update).indexOf('flashT')>=0)?'OK':'FAIL'`));
  await shot('throw_flash.png');

  log('');
  log('=== 控制台异常 ===');
  log(errs.length ? errs.slice(0, 12).join('\n') : '无');

  ws.close(); proc.kill(); srv.kill();
  fs.writeFileSync(path.join(ROOT, '_tools', 'throw_live.txt'), out.join('\n') + '\n', 'utf8');
  process.exit(0);
})().catch(e => { log('FATAL ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')); fs.writeFileSync(path.join(ROOT, '_tools', 'throw_live.txt'), out.join('\n') + '\n', 'utf8'); process.exit(1); });
