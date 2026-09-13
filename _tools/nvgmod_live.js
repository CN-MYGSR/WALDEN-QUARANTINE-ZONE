// 夜视仪白天过曝 + 改件模型 实机确认 (headless Chrome + CDP + no-cache 服务器)
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9457, URL = 'http://127.0.0.1:8123/index.html';
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = spawn('python', [path.join(ROOT, '_tools', 'serve_nocache.py'), '8123'], { stdio: 'ignore' });
  await sleep(1200);
  const ud = path.join(require('os').tmpdir(), 'nvgmod_' + Date.now());
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,760', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  await sleep(2500);
  let list = null;
  for (let i = 0; i < 40; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list && list.length) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page');
  if (!page) { log('NO_PAGE'); proc.kill(); srv.kill(); fs.writeFileSync('_tools/nvgmod_live.txt', out.join('\n') + '\n', 'utf8'); process.exit(1); }
  const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); if (j.method === 'Runtime.exceptionThrown') errs.push('EXC ' + ((j.params.exceptionDetails.exception || {}).description || '').split('\n')[0]); });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable');
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : String(o); };
  await rpc('Page.navigate', { url: URL });
  await sleep(6000);

  log('=== 1. 夜视仪白天过曝 ===');
  log('当前是夜晚(NIGHT): ' + await ev(`NIGHT`));
  log('装备夜视仪并激活: ' + await ev(`(function(){
    try{ META.owned.nvg=1; RUN.nvgBrought=true; setModChoice('m4','gear','gear_nvg'); PLAYER_MODS.m4=PLAYER_MODS.m4||{}; PLAYER_MODS.m4.gear='gear_nvg'; player.alive=true; player.curW={key:'m4'}; }catch(e){ return 'EXC '+e.message; }
    const before=renderer.toneMappingExposure;
    NVG.toggle();
    const active=NVG.active();
    let e2=before; for(let i=0;i<60;i++){ NVG.update(1/30); e2=renderer.toneMappingExposure; }
    NVG.toggle();
    // 还原, 避免游戏循环拿假玩家状态报错
    player.alive=false; player.curW=null; setModChoice('m4','gear','gear_none'); RUN.nvgBrought=false;
    return 'active='+active+' · 白天过曝曝光 '+before.toFixed(2)+'→'+e2.toFixed(2)+' (期望显著增大)';
  })()`));

  log('');
  log('=== 2. 改件是否加模型 ===');
  log('源码: addModVisuals 挂在 buildGunModel 末尾: ' + await ev(`buildGunModel.toString().indexOf('addModVisuals')>=0?'OK':'MISSING'`));
  log('每个非默认改件都有模型分支: ' + await ev(`(function(){
    const has={optic_reflex:1,optic_2x:1,optic_4x:1,optic_nvg:1,muzzle_comp:1,muzzle_supp:1,muzzle_hider:1,mag_ext:1,mag_quick:1,gear_nvg:1,light_flash:1};
    const src=addModVisuals.toString();
    return Object.keys(has).every(k=>src.indexOf("'"+k+"'")>=0)?'OK 全部':'MISSING';
  })()`));
  log('加装反射瞄具后网格数变化: ' + await ev(`(function(){
    ['optic','muzzle','mag','gear','light'].forEach(s=>setModChoice('m4',s,{optic:'optic_iron',muzzle:'muzzle_standard',mag:'mag_standard',gear:'gear_none',light:'light_none'}[s]));
    const cnt=()=>{let n=0;const p=buildGunModel('m4');p.gun.traverse(o=>{if(o.isMesh)n++});return n;};
    const base=cnt();
    setModChoice('m4','optic','optic_reflex');
    const after=cnt();
    return base+' → '+after+' (期望 +2)';
  })()`));

  log('');
  log('=== 控制台异常 ===');
  log(errs.length ? errs.slice(0, 8).join('\n') : '无');
  ws.close(); proc.kill(); srv.kill();
  fs.writeFileSync(path.join(ROOT, '_tools', 'nvgmod_live.txt'), out.join('\n') + '\n', 'utf8');
  process.exit(0);
})().catch(e => { log('FATAL ' + e.message); fs.writeFileSync(path.join(ROOT, '_tools', 'nvgmod_live.txt'), out.join('\n') + '\n', 'utf8'); process.exit(1); });
