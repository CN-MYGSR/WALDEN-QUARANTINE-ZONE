// 激光指示器验收: 改件定义 · 3D 模型 · 开关 · 光柱与落点 · 不暴露 · 与手电互斥 · 工坊可见
// 注意: LASER 是 const 对象, Runtime.evaluate 里读不到 —— 改成在 scene 里按材质颜色找 mesh。
// 用法: node _tools/_laser_probe.js [url]
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9507;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;

function finish(code) {
  try { if (ws) ws.close(); } catch (e) { }
  try { if (proc) proc.kill(); } catch (e) { }
  fs.writeFileSync(path.join(ROOT, '_tools', '_laser_probe.txt'), out.join('\n') + '\n', 'utf8');
  process.exit(code);
}

(async () => {
  const ud = path.join(require('os').tmpdir(), 'laser_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,760', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
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
    if (j.method === 'Log.entryAdded' && j.params.entry.level === 'error') errs.push('LOG ' + String(j.params.entry.text).slice(0, 200));
  });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable'); await rpc('Log.enable');
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : String(o); };
  const shot = async n => { const o = await rpc('Page.captureScreenshot', { format: 'png' }); if (o.result && o.result.data) fs.writeFileSync(path.join(ROOT, 'outputs', n), Buffer.from(o.result.data, 'base64')); };
  // 在 scene 里按材质颜色找激光 mesh (LASER 是 const, 读不到)
  const findMesh = (hex) => `(function(){const m=scene.children.find(o=>o.material&&o.material.color&&o.material.color.getHex()===${hex});return m?JSON.stringify({visible:m.visible,pos:[+m.position.x.toFixed(2),+m.position.y.toFixed(2),+m.position.z.toFixed(2)],scale:[+m.scale.x.toFixed(3),+m.scale.y.toFixed(3),+m.scale.z.toFixed(2)]}):'NOT_FOUND';})()`;

  await rpc('Page.navigate', { url: URL });
  await sleep(14000);
  await ev(`localStorage.setItem('sf_campaign','0'); localStorage.removeItem('bf_meta_v1'); localStorage.removeItem('sf_mods');`);
  await rpc('Page.navigate', { url: URL });
  await sleep(16000);

  log('=== 1) 改件定义 ===');
  log('light_laser 存在 : ' + await ev(`!!ALL_MODS.light_laser`));
  log('  slot / name / cost : ' + await ev(`ALL_MODS.light_laser.slot+' / '+ALL_MODS.light_laser.name+' / ¥'+ALL_MODS.light_laser.cost`));
  log('light 槽可选列表 : ' + await ev(`getModSlots('m4').light.join(' , ')`));
  log('是否与手电同槽位 : ' + await ev(`ALL_MODS.light_laser.slot===ALL_MODS.light_flash.slot`));

  log('');
  log('=== 2) 3D 模型 (装激光 vs 装手电) ===');
  log('装手电: ' + await ev(`(function(){setModChoice('m4','light','light_flash');const p=buildGunModel('m4');
    return 'flashLens='+!!p.flashLens+' laserLens='+!!p.laserLens+' mesh='+p.gun.children.length;})()`));
  log('装激光: ' + await ev(`(function(){setModChoice('m4','light','light_laser');const p=buildGunModel('m4');
    return 'flashLens='+!!p.flashLens+' laserLens='+!!p.laserLens+' laserEmit='+(p.laserEmit?('['+p.laserEmit.x.toFixed(3)+','+p.laserEmit.y.toFixed(3)+','+p.laserEmit.z.toFixed(3)+']'):'无')+' mesh='+p.gun.children.length;})()`));
  log('装无照明: ' + await ev(`(function(){setModChoice('m4','light','light_none');const p=buildGunModel('m4');
    return 'flashLens='+!!p.flashLens+' laserLens='+!!p.laserLens+' mesh='+p.gun.children.length;})()`));

  log('');
  log('=== 3) 开关: 装激光时 G 应切换激光而不是手电 ===');
  log('部署: ' + await ev(`(function(){try{
    addOwned('m4',1); META.loadout.primary='m4'; META.loadout.secondary='';
    setModChoice('m4','light','light_laser');
    el('menu').classList.add('hidden'); startMatch(); showDeploy(false); selectedSpawn=-1; deployPlayer();
    return 'OK';}catch(e){return 'EXC '+e.message;}})()`));
  await sleep(1500);
  log('当前武器 light 槽 : ' + await ev(`getModChoice(player.curW.key,'light')`));
  await ev(`updateFlashlight(0.016);`);
  log('FLASH.isLaser / hasMod / on : ' + await ev(`FLASH.isLaser+' / '+FLASH.hasMod+' / '+FLASH.on`));
  log('手电 spot.visible (应 false): ' + await ev(`FLASH.spot.visible`));
  log('激光束(未开)      : ' + await ev(findMesh('0xff2a2a')));
  log('');
  log('按 G (flashToggle) : ' + await ev(`(function(){try{flashToggle();return 'FLASH.want='+FLASH.want;}catch(e){return 'EXC '+e.message;}})()`));
  await sleep(400);
  log('激光束(开)        : ' + await ev(findMesh('0xff2a2a')));
  log('落点(开)          : ' + await ev(findMesh('0xff3a3a')));
  log('FLASH.expose (激光应 false): ' + await ev(`FLASH.expose`));
  log('手电 spot.visible (仍应 false): ' + await ev(`FLASH.spot.visible`));
  log('镜片颜色 (应 0xff3030)     : ' + await ev(`(function(){const l=VM.gunParts&&VM.gunParts.laserLens;return l?('0x'+l.material.color.getHex().toString(16)):'无镜片';})()`));
  await shot('laser_on.png');
  log('');
  log('再按 G 关闭       : ' + await ev(`(function(){try{flashToggle();return 'FLASH.want='+FLASH.want;}catch(e){return 'EXC '+e.message;}})()`));
  await sleep(400);
  log('激光束(关)        : ' + await ev(findMesh('0xff2a2a')));
  log('落点(关)          : ' + await ev(findMesh('0xff3a3a')));

  log('');
  log('=== 4) 换回手电: 激光应隐藏, 手电应工作 ===');
  log('改装为手电 + 重建: ' + await ev(`(function(){try{
    setModChoice(player.curW.key,'light','light_flash');
    applyModsToLiveWeapon(player.curW.key);
    FLASH.want=true; updateFlashlight(0.016);
    return 'isLaser='+FLASH.isLaser+' spot='+FLASH.spot.visible+' intensity='+FLASH.spot.intensity.toFixed(1);
  }catch(e){return 'EXC '+e.message;}})()`));
  await sleep(300);
  log('激光束 (应隐藏)   : ' + await ev(findMesh('0xff2a2a')));
  log('FLASH.expose (手电应 true): ' + await ev(`FLASH.expose`));

  log('');
  log('=== 5) 工坊列表 ===');
  log(await ev(`(function(){try{
    META.loadout.primary='m4';
    const rows=renderWorkbenchRows();
    const has=rows.indexOf('激光指示器')>=0;
    return '工坊里出现「激光指示器」: '+has;
  }catch(e){return 'EXC '+e.message;}})()`));

  log('');
  log('=== 6) 控制台异常 ===');
  log(errs.length ? errs.slice(0, 12).join('\n') : '无');
  finish(0);
})().catch(e => { log('FATAL ' + e.message); finish(1); });
