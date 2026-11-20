// 护甲插板/面罩探针
const http = require('http');
const { spawn } = require('child_process');
const os = require('os');
const URL_ = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9345;
const profile = os.tmpdir() + '/armor-probe-' + Date.now();
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  '--window-size=1440,900', '--hide-scrollbars', '--mute-audio',
  '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', 'about:blank'
], { stdio: ['ignore', 'pipe', 'pipe'] });
let stderr = '';
chrome.stderr.on('data', d => { stderr += d.toString(); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = p => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: PORT, path: p }, r => {
    let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
  }).on('error', rej);
});
let idc = 0;
function rpc(ws, method, params) {
  const id = ++idc;
  return new Promise((res, rej) => {
    const on = raw => {
      let m; try { m = JSON.parse(raw); } catch (e) { return; }
      if (m.id === id) { ws.off('message', on); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    };
    ws.on('message', on);
    ws.send(JSON.stringify({ id, method, params: params || {} }));
    setTimeout(() => { ws.off('message', on); rej(new Error('rpc timeout ' + method)); }, 60000);
  });
}
(async () => {
  let page;
  for (let i = 0; i < 70; i++) {
    try { const l = await getJSON('/json/list'); if (l && l.length) { page = l.find(t => t.type === 'page') || l[0]; break; } } catch (e) { }
    await sleep(400);
  }
  if (!page) { console.log(JSON.stringify({ fatal: 'cdp not ready', stderr: stderr.slice(-800) })); process.exit(1); }
  const WebSocket = require('./ws');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
  const errors = [];
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (m.method === 'Runtime.exceptionThrown') errors.push('EXC ' + ((m.params.exceptionDetails.exception || {}).description || ''));
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
      errors.push('ERR ' + (m.params.args || []).map(a => a.value !== undefined ? a.value : a.description).join(' '));
  });
  await rpc(ws, 'Runtime.enable'); await rpc(ws, 'Page.enable');
  await rpc(ws, 'Page.navigate', { url: URL_ });
  await sleep(13000);

  const expr = `(async function(){
    const out={};
    try{
      el('menu').classList.add('hidden');
      META.wallet=100000;
      META.owned.armor3=1; META.owned.helm6=1;
      META.owned.plate_steel=1; META.owned.plate_ti=1; META.owned.plate_ceramic=1;
      META.loadout.armor='armor3'; META.loadout.helmet='helm6';
      META.loadout.plate='plate_steel'; META.loadout.faceShield=true; META.loadout.nvg='';
      refreshLoadoutSelects();
      const plSel=document.getElementById('plateSelect'), fChk=document.getElementById('faceShieldChk'), nSel=document.getElementById('nvgSelect');
      out.picker={plateVal:plSel?plSel.value:'', plateOpts:plSel?plSel.options.length:0,
                  faceChecked:!!(fChk&&fChk.checked), faceDisabled:!!(fChk&&fChk.disabled),
                  nvgDisabled:!!(nSel&&nSel.disabled), plates:Object.keys(PLATE_DEFS)};
      startMatch(); showDeploy(false); selectedSpawn=-1; deployPlayer();
      await new Promise(r=>setTimeout(r,700));
      VM.state='idle';
      out.deploy={plateLevel:player.plateLevel, breakMul:player.plateBreakMul, armorResist:+player.armorResist.toFixed(3),
                  faceDown:RUN.faceDown, faceLvl:player.faceLevel, nvgBrought:RUN.nvgBrought, nvgKey:RUN.nvgKey};
      out.nvg={active:NVG.active()};
      NVG.toggle();
      out.nvgAfter=NVG.active();
      function hit(tierKey, plateLvl, face, amt){
        player.plateLevel=plateLvl; player.faceLevel=3; player.faceDown=!!face; player.armorDur=1000;
        player.body.thorax.hp=100; player.body.thorax.max=100; player.body.head.hp=100; player.body.head.max=100;
        const part=face?'head':'thorax';
        applyPlayerBodyDamage(amt||50,{_lastAmmo:AMMO_DEFS[tierKey],_lastAmmoT:nowT},false,part);
        return {dmg:+(100-(face?player.body.head.hp:player.body.thorax.hp)).toFixed(1),
                lvl:+(face?player.faceLevel:player.plateLevel).toFixed(2)};
      }
      out.dmg={
        t1_p3:hit('ammo_std',3,false),
        t2_p3:hit('ammo_m855',3,false),
        t2_p2:hit('ammo_m855',2,false),
        t2_p1:hit('ammo_m855',1,false),
        t3_p3:hit('ammo_m995',3,false),
        t4_p4:hit('ammo_ap',4,false),
        kevlar:hit('ammo_std',0,false)
      };
      // 1级弹 5 枪破 1 级
      player.plateLevel=1; player.faceDown=false; player.armorDur=1000; player.body.thorax.hp=100; player.body.thorax.max=100;
      for(let i=0;i<5;i++) applyPlayerBodyDamage(5,{_lastAmmo:AMMO_DEFS.ammo_std,_lastAmmoT:nowT},false,'thorax');
      out.five={lvl:+player.plateLevel.toFixed(2), loss:+(100-player.body.thorax.hp).toFixed(1)};
      // 面罩: 2级弹打3级面罩
      player.faceDown=true; player.faceLevel=3; player.body.head.hp=100; player.body.head.max=100;
      applyPlayerBodyDamage(50,{_lastAmmo:AMMO_DEFS.ammo_m855,_lastAmmoT:nowT},false,'head');
      const f1={dmg:+(100-player.body.head.hp).toFixed(1), lvl:+player.faceLevel.toFixed(2)};
      player.body.head.hp=100;
      applyPlayerBodyDamage(50,{_lastAmmo:AMMO_DEFS.ammo_m855,_lastAmmoT:nowT},false,'head');
      out.face={first:f1, second:{dmg:+(100-player.body.head.hp).toFixed(1), lvl:+player.faceLevel.toFixed(2)}};
      // 面罩升降
      RUN.faceDown=true; player.faceDown=true; toggleFaceShield(); out.toggle1=RUN.faceDown;
      toggleFaceShield(); out.toggle2=RUN.faceDown;
      // 新枪与全头盔面罩
      PLAYER_MODS.ak12={optic:'optic_2x',muzzle:'muzzle_comp',gear:'gear_none'};
      vmEquip('ak12',0);
      const ak12={name:WPN_DEFS.ak12.name, model:WPN_DEFS.ak12.model, children:VM.gunParts.gun.children.length,
                  opticY:VM.gunParts.opticSightY, price:weaponPrice('ak12'), opticSlots:getModSlots('ak12').optic};
      PLAYER_MODS.aks74u={optic:'optic_reflex',muzzle:'muzzle_comp',gear:'gear_none'};
      vmEquip('aks74u',0);
      const aks74u={name:WPN_DEFS.aks74u.name, model:WPN_DEFS.aks74u.model, children:VM.gunParts.gun.children.length,
                    opticY:VM.gunParts.opticSightY, price:weaponPrice('aks74u')};
      out.weapons={ak12:ak12, aks74u:aks74u,
                   allHelmetsFaceShield:Object.keys(HELMET_DEFS).every(k=>!!HELMET_DEFS[k].faceShield)};
      // N 轻按: 面罩模式切面罩
      pointerLocked=true; player.alive=true; player.deployed=true; player.helmetKey='helm6';
      RUN.headGear='face'; RUN.faceDown=false; player.faceDown=false;
      dispatchEvent(new KeyboardEvent('keydown',{code:'KeyN'})); await new Promise(r=>setTimeout(r,50));
      dispatchEvent(new KeyboardEvent('keyup',{code:'KeyN'}));
      out.tapFace=RUN.faceDown;
      // 轻按 N: 夜视开关 (与长按面罩同键位)
      META.owned.m4=1; META.owned.nvg=1;
      META.loadout.primary='m4'; META.loadout.nvg='nvg'; META.loadout.faceShield=false;
      PLAYER_MODS.m4={gear:'gear_nvg'};
      startMatch(); showDeploy(false); selectedSpawn=-1; deployPlayer();
      await new Promise(r=>setTimeout(r,700));
      VM.state='idle'; pointerLocked=true;
      out.nvgDeploy={brought:RUN.nvgBrought, key:RUN.nvgKey, headGear:RUN.headGear, active:NVG.active()};
      dispatchEvent(new KeyboardEvent('keydown',{code:'KeyN'})); await new Promise(r=>setTimeout(r,60)); dispatchEvent(new KeyboardEvent('keyup',{code:'KeyN'}));
      out.tapOn={active:NVG.active()};
      await new Promise(r=>setTimeout(r,120));
      dispatchEvent(new KeyboardEvent('keydown',{code:'KeyN'})); await new Promise(r=>setTimeout(r,60)); dispatchEvent(new KeyboardEvent('keyup',{code:'KeyN'}));
      out.tapOff={active:NVG.active()};
      toggleFaceShield(); out.faceDenied=RUN.faceDown;
      // 市场/网格
      buyItem('plate_ceramic');
      META.loadout.faceShield=true; META.loadout.nvg='nvg'; refreshLoadoutSelects();
      const _f=document.getElementById('faceShieldChk');
      out.exclusive={face:META.loadout.faceShield, faceChecked:!!(_f&&_f.checked), faceDisabled:!!(_f&&_f.disabled)};
      RUN.headGear='face'; if(typeof syncHeadgearUI==='function') syncHeadgearUI();
      out.touchFace={label:(document.querySelector('#tNvg .tLbl')||{}).textContent||'', hidden:!!(document.getElementById('tNvg')&&document.getElementById('tNvg').classList.contains('hidden'))};
      RUN.headGear='nvg'; if(typeof syncHeadgearUI==='function') syncHeadgearUI();
      out.touchNvg={label:(document.querySelector('#tNvg .tLbl')||{}).textContent||''};
      RUN.loot.m4=1; toggleBagPanel(); await new Promise(r=>setTimeout(r,200));
      BAG_UI.key='m4'; BAG_UI.sel=bagEntryKeys().indexOf('m4');
      const rotOk=bagRotateSelected(); await new Promise(r=>setTimeout(r,100));
      out.rotate={ok:rotOk, rot:RUN.grid.pack.m4&&RUN.grid.pack.m4.rot,
                  hasBtn:(document.getElementById('bagPanelBtns')||{}).textContent.indexOf('旋转')>=0};
      toggleBagPanel();
      renderArmory('warehouse'); await new Promise(r=>setTimeout(r,150));
      out.armoryRotate=!!document.getElementById('arRotate');
      const _ref={x:player.pos.x,z:player.pos.z,loot:{plate_steel:1},grid:{}};
      openLootPanel({kind:'crate',ref:_ref}); await new Promise(r=>setTimeout(r,200));
      out.lootRotate=!!document.getElementById('lootRotate');
      lootPanelClose();
      out.market={owned:META.owned.plate_ceramic||0, kind:itemKind('plate_steel'),
                  size:itemSizeOf('plate_steel'), foot:INVGRID.foot('plate_steel')};
    }catch(e){ out.err=String((e&&e.stack)||e); }
    return out;
  })()`;
  const r = await rpc(ws, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  console.log(JSON.stringify({ result: r.result && r.result.value, exceptions: errors.slice(0, 8) }, null, 1));
  try { chrome.kill(); } catch (e) { }
  process.exit(0);
})();
