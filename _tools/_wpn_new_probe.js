// 新武器验收: 沙漠之鹰 / 格洛克18 / AWM / QBZ-95 / QBZ-191 / HK416
// 覆盖: WPN_DEFS 定义 → CQB_BALANCE 生效值 → ARSENAL 归类 → 价格 → 改件槽 →
//       3D 模型(buildGunModel) → 视模型(vmEquip) → 实机装备并部署 → 控制台异常
// 用法: node _tools/_wpn_new_probe.js [url]
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9493;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const NEW = ['deagle', 'glock18', 'awm', 'qbz95', 'qbz191', 'hk416'];
let proc, ws;

function finish(code) {
  try { if (ws) ws.close(); } catch (e) { }
  try { if (proc) proc.kill(); } catch (e) { }
  fs.writeFileSync(path.join(ROOT, '_tools', '_wpn_new_probe.txt'), out.join('\n') + '\n', 'utf8');
  process.exit(code);
}

(async () => {
  const ud = path.join(require('os').tmpdir(), 'wpnnew_' + Date.now());
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

  await rpc('Page.navigate', { url: URL });
  await sleep(8000);
  await ev(`localStorage.setItem('sf_campaign','0'); localStorage.removeItem('bf_meta_v1');`);
  await rpc('Page.navigate', { url: URL });
  await sleep(8000);

  log('=== 1) WPN_DEFS 定义与 CQB 平衡后生效值 ===');
  log(await ev(`(function(){
    const K=${JSON.stringify(NEW)};
    const rows=K.map(k=>{const d=WPN_DEFS[k];
      if(!d) return k+' 缺失!';
      return k.padEnd(9)+' '+(d.name+'').padEnd(12)+' type='+d.type.padEnd(5)+' 基准dmg='+d.cqbBase.dmg
        +' 生效dmg='+d.dmg+' '+(d.cqbBuff?'[buff]':(d.cqbNerf?'[nerf]':''))
        +' mag='+d.mag+' rpm='+d.rpm+' adsFov='+d.adsFov+(d.adsTime?' adsTime='+d.adsTime.toFixed(2):'')
        +(d.pistol?' pistol':'')+(d.scoped?' scoped':'');});
    return rows.join('\\n');})()`));

  log('');
  log('=== 2) 套装归类 / 拾荒者池隔离 ===');
  log('ARSENAL_ERA: ' + await ev(`(function(){const K=${JSON.stringify(NEW)};return K.map(k=>k+'='+ARSENAL_ERA[k]).join(' ');})()`));
  log('modern 套装 keys 含全部 6 把: ' + await ev(`(function(){const K=${JSON.stringify(NEW)};const m=ARSENAL_SETS.find(s=>s.id==='modern').keys;return K.every(k=>m.includes(k))+' (modern 共 '+m.length+' 把)';})()`));
  log('ww2 套装 keys 数: ' + await ev(`ARSENAL_SETS.find(s=>s.id==='ww2').keys.length`));
  log('SCAV 池是否被污染(应 0): ' + await ev(`(function(){const K=${JSON.stringify(NEW)};return SCAV_WPN_POOL.filter(k=>K.includes(k)).length;})()`));
  log('总武器数: ' + await ev(`Object.keys(WPN_DEFS).length`));

  log('');
  log('=== 3) 价格 / 改件槽 ===');
  log(await ev(`(function(){const K=${JSON.stringify(NEW)};
    return K.map(k=>k.padEnd(9)+' ¥'+String(weaponPrice(k)).padEnd(6)
      +' 重量='+itemWeightOf(k)+'kg'
      +' 槽位='+Object.keys(getModSlots(k)).join('/')
      +' 瞄具=['+getModSlots(k).optic.join(',')+']').join('\\n');})()`));
  log('ITEM_CATALOG 是否包含(自动派生): ' + await ev(`(function(){const K=${JSON.stringify(NEW)};return K.every(k=>ITEM_CATALOG.some(c=>c.key===k&&c.kind==='weapon'));})()`));

  log('');
  log('=== 4) 3D 模型 (buildGunModel) ===');
  log(await ev(`(function(){const K=${JSON.stringify(NEW)};
    return K.map(k=>{try{const p=buildGunModel(k);
      const meshes=p.gun.children.length;
      return k.padEnd(9)+' mesh数='+String(meshes).padEnd(4)
        +' mag='+(p.mag?'有':'无')
        +' muzzle=['+p.muzzle.x.toFixed(3)+','+p.muzzle.y.toFixed(3)+','+p.muzzle.z.toFixed(3)+']'
        +' anchors='+(p.anchors?'有':'无')
        +' sightAnchor='+(p.sightAnchor?'有':'无')
        +(meshes>3?'':'  <<< mesh 过少, 可能落到兜底模型!');
    }catch(e){return k+' 建模异常: '+e.message;}}).join('\\n');})()`));
  log('(兜底模型 mesh 数参考: ' + await ev(`buildGunModel('__nonexistent__').gun.children.length`) + ')');

  log('');
  log('=== 5) 视模型 vmEquip ===');
  log(await ev(`(function(){const K=${JSON.stringify(NEW)};
    return K.map(k=>{try{vmEquip(k,0);return k.padEnd(9)+' VM.key='+VM.key+' gunParts='+(VM.gunParts?'ok':'null')+' 子节点='+VM.inner.children.length;}catch(e){return k+' vmEquip 异常: '+e.message;}}).join('\\n');})()`));

  log('');
  log('=== 6) 实机装备并部署 ===');
  log('SCAV 阵营(决定主武器是否被随机覆盖): ' + await ev(`TEAM_FACTION[player.team].scav`));
log('准备(先临时关掉 SCAV 随机, 以便验证主武器位): ' + await ev(`(function(){try{FACTIONS.us.scav=false;
    for(const k of ${JSON.stringify(NEW)}) addOwned(k,1);
    META.loadout.primary='hk416'; META.loadout.secondary='deagle';
    el('menu').classList.add('hidden'); startMatch(); showDeploy(false); selectedSpawn=-1; deployPlayer();
    return 'OK';
  }catch(e){return 'EXC '+e.message;}})()`));
  await sleep(1500);
  log('主武器: ' + await ev(`(WPN_DEFS[player.curW.key]||{}).name+' ('+player.curW.key+')'`));
  log('副武器: ' + await ev(`(function(){const s=player.slots[1];return s?((WPN_DEFS[s.key]||{}).name+' ('+s.key+')'):'无';})()`));
  log('弹匣/备弹: ' + await ev(`player.curW.mag+' / '+player.curW.reserve`));
  log('切到副武器: ' + await ev(`(function(){try{switchSlot(1);return (WPN_DEFS[player.curW.key]||{}).name+' ('+player.curW.key+')';}catch(e){return 'EXC '+e.message;}})()`));
  await sleep(400);
  log('切回主武器: ' + await ev(`(function(){try{switchSlot(0);return (WPN_DEFS[player.curW.key]||{}).name;}catch(e){return 'EXC '+e.message;}})()`));
  log('开火 1 发: ' + await ev(`(function(){try{const m0=player.curW.mag;mouseDown=true;updatePlayer(0.02);mouseDown=false;return 'mag '+m0+' -> '+player.curW.mag;}catch(e){return 'EXC '+e.message;}})()`));
  await shot('wpn_new_deploy.png');

  log('');
  log('=== 7) 逐一换枪实机 (部署 + 开火 + 截图) ===');
  for (const k of NEW) {
    const dep = await ev(`(function(){try{META.loadout.primary='${k}';META.loadout.secondary='';deployPlayer();
      const m0=player.curW.mag; const r0=player.curW.reserve; player.fireT=0;
      mouseDown=false; updatePlayer(0.02); updateViewModel(0.02,player);
      for(let i=0;i<250;i++){ mouseDown=(i%12<6); updatePlayer(0.02); updateViewModel(0.02,player); }
      mouseDown=false;
      return (WPN_DEFS[player.curW.key]||{}).name+' | 射弹 '+(m0-player.curW.mag)+' 发 | 备弹 '+r0+' -> '+player.curW.reserve+' | VM.state='+VM.state;
      }catch(e){return 'EXC '+e.message;}})()`);
    log(k.padEnd(9) + ' -> ' + dep);
    await ev(`(function(){try{META.loadout.primary='${k}';deployPlayer();}catch(e){}})()`);
    await sleep(900);
    await shot('wpn_' + k + '.png');
  }

  log('');
  log('=== 8) 控制台异常 ===');
  log(errs.length ? errs.slice(0, 12).join('\n') : '无');
  finish(0);
})().catch(e => { log('FATAL ' + e.message); finish(1); });
