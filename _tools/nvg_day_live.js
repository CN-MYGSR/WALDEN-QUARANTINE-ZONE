// 夜视仪白天过曝可用 + gear_nvg 枪上模型 实机冒烟 (headless Chrome + CDP)
// 结果写入 _tools/nvg_day_live.txt, 截图到 outputs/
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9457, URL = 'http://127.0.0.1:8123/index.html';
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = spawn('python', [path.join(ROOT, '_tools', 'serve_nocache.py'), '8123'], { stdio: 'ignore' });
  await sleep(1200);
  const ud = path.join(require('os').tmpdir(), 'nvgday_' + Date.now());
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,800', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  await sleep(2500);
  let list = null;
  for (let i = 0; i < 40; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list && list.length) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page');
  if (!page) { log('NO_PAGE'); proc.kill(); srv.kill(); fs.writeFileSync('_tools/nvg_day_live.txt', out.join('\n') + '\n', 'utf8'); process.exit(1); }
  const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); if (j.method === 'Runtime.exceptionThrown') errs.push('EXC ' + ((j.params.exceptionDetails.exception || {}).description || '').split('\n')[0]); if (j.method === 'Log.entryAdded' && j.params.entry.level === 'error') errs.push('LOG ' + String(j.params.entry.text).slice(0, 160)); });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable'); await rpc('Log.enable');
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : String(o); };
  const shot = async name => { const o = await rpc('Page.captureScreenshot', { format: 'png' }); if (o.result && o.result.data) fs.writeFileSync(path.join(ROOT, 'outputs', name), Buffer.from(o.result.data, 'base64')); };
  await rpc('Page.navigate', { url: URL });
  await sleep(6000);

  log('=== 1. 环境 ===');
  log('NIGHT = ' + await ev(`NIGHT`));
  log('dayExposure 基准 = ' + await ev(`renderer.toneMappingExposure`));

  log('');
  log('=== 2. 装备夜视仪(gear_nvg)并白天开 (真实进场) ===');
  await ev(`(function(){
    PLAYER_MODS['m4']={gear:'gear_nvg',optic:'optic_iron',muzzle:'muzzle_standard',mag:'mag_standard'};
    META.loadout.primary='m4';
    META.owned.m4=(META.owned.m4||0)+1;
    try{ selectedSpawn=-1; deployPlayer(); }catch(e){ return 'EXC '+e.message; }
    RUN.nvgBrought=true;
    return 'alive='+player.alive+' curW='+(player.curW&&player.curW.key)+' gear='+getModChoice('m4','gear');
  })()`);
  await sleep(1000);
  await ev(`NVG.toggle()`);
  await sleep(100);
  log('白天 toggle 后 active = ' + await ev(`NVG.active()`));
  log('toggle 未被"仅夜战"拦截: ' + await ev(`NVG.active()?'OK':'FAIL 还是被拦了'`));

  log('');
  log('=== 3. 过曝(曝光拉高) ===');
  log('开启前 exposure = ' + await ev(`renderer.toneMappingExposure`));
  for (let i = 0; i < 60; i++) await ev(`NVG.update(0.016)`);
  log('开启后 exposure = ' + await ev(`renderer.toneMappingExposure`) + '  (期望 > 开启前)');
  log('白天不增强太阳光: ' + await ev(`(sun.intensity<4?'OK sun='+sun.intensity.toFixed(2):'FAIL sun='+sun.intensity)`));
  await shot('nvg_day_overexpose.png');
  await ev(`NVG.toggle()`);   // 关
  for (let i = 0; i < 60; i++) await ev(`NVG.update(0.016)`);
  log('关闭后 exposure 复位 = ' + await ev(`renderer.toneMappingExposure`) + '  (期望 ≈ 基准)');

  log('');
  log('=== 4. gear_nvg 枪上模型 ===');
  log('枪模型含夜视仪物镜(绿色发光): ' + await ev(`(function(){
    const p=buildGunModel('m4');
    let green=0, meshes=0;
    p.gun.traverse(o=>{ if(o.isMesh){ meshes++; const m=o.material; if(m&&(m.color&&m.color.getHex()===0x57d168)||(m&&m.emissive&&m.emissive.getHex()===0x1c5c28)) green++; } });
    return 'meshes='+meshes+' · 夜视仪绿色件='+green;
  })()`));
  log('对比: 未装夜视仪时无绿色件: ' + await ev(`(function(){
    const old=PLAYER_MODS['m4']; PLAYER_MODS['m4']={gear:'gear_none',optic:'optic_iron',muzzle:'muzzle_standard',mag:'mag_standard'};
    const p=buildGunModel('m4'); let green=0;
    p.gun.traverse(o=>{ if(o.isMesh){ const m=o.material; if(m&&m.color&&m.color.getHex()===0x57d168) green++; } });
    PLAYER_MODS['m4']=old;
    return '绿色件='+green+' (期望 0)';
  })()`));

  log('');
  log('=== 控制台异常 ===');
  log(errs.length ? errs.slice(0, 12).join('\n') : '无');
  ws.close(); proc.kill(); srv.kill();
  fs.writeFileSync(path.join(ROOT, '_tools', 'nvg_day_live.txt'), out.join('\n') + '\n', 'utf8');
  process.exit(0);
})().catch(e => { log('FATAL ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')); fs.writeFileSync(path.join(ROOT, '_tools', 'nvg_day_live.txt'), out.join('\n') + '\n', 'utf8'); process.exit(1); });
