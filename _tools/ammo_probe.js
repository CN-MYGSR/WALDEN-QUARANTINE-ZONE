// 弹药体系探针: 空枪 / 带入弹盒 / 装填 / 换弹 / 市场 / 混装 / 穿甲
const http = require('http');
const { spawn } = require('child_process');
const os = require('os');
const URL_ = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9343;
const profile = os.tmpdir() + '/ammo-probe-' + Date.now();
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
      META.wallet=10000;
      META.owned.ammo_std=2;
      META.loadout.ammo=['ammo_std',''];
      startMatch(); showDeploy(false); selectedSpawn=-1; deployPlayer();
      await new Promise(r=>setTimeout(r,700));
      VM.state='idle'; VM.stateT=0;
      out.start={mag:player.curW.mag, reserve:player.curW.reserve, ammo:player.curW.ammo,
                 bagBox:RUN.loot.ammo_std||0, ownedBox:META.owned.ammo_std||0,
                 tier:AMMO_DEFS.ammo_std?AMMO_DEFS.ammo_std.tier:null};
      // 部署选择器
      buildDeployConsumables();
      const sel=document.getElementById('ammoSel1');
      out.picker={exists:!!sel, opts:sel?sel.options.length:0, value:sel?sel.value:''};
      // 背包里应出现弹盒
      toggleBagPanel(); await new Promise(r=>setTimeout(r,300));
      out.bagTile=!!document.querySelector('#bagPackHost .invTile[data-key="ammo_std"]');
      toggleBagPanel();
      // 装填
      const okLoad=loadAmmoFromBag('ammo_std');
      out.load={ok:okLoad, reserve:player.curW.reserve, ammo:player.curW.ammo, bagLeft:RUN.loot.ammo_std||0};
      // 换弹
      tryReload();
      out.reloadStart={state:VM.state, t:+VM.stateT.toFixed(2), dur:+VM.stateDur.toFixed(2), defReload:player.curW.def.reload, mag:player.curW.mag, reserve:player.curW.reserve};
      out.loop={hidden:document.hidden, vis:document.visibilityState, alive:player.alive, curW:!!player.curW, over:!!matchOver, onMG:!!player.onMG, onVeh:!!player.onVehicle, root:VM.root.visible, state:VM.state, t:+VM.stateT.toFixed(2)};
      await new Promise(r=>setTimeout(r,600));
      out.reloadMid={state:VM.state, t:+VM.stateT.toFixed(2), dur:+VM.stateDur.toFixed(2)};
      await new Promise(r=>setTimeout(r,2200));
      out.loop2={t:+VM.stateT.toFixed(2), state:VM.state};
      for(let i=0;i<50;i++) updateViewModel(0.05,player);
      out.reload={state:VM.state, mag:player.curW.mag, reserve:player.curW.reserve};
      out.hud=(document.getElementById('ammoType')||{}).textContent||'';
      // 市场购买
      buyItem('ammo_m855');
      out.market={owned:META.owned.ammo_m855||0, wallet:META.wallet};
      // 混装拦截
      const q=ammoQuote(AMMO_PACK_DEFS[3], player.curW);
      out.mix={ok:q.ok, reason:q.reason||''};
      // 空枪从局内商店买 M995
      player.curW.mag=0; player.curW.reserve=0; player.curW.ammo='';
      const okShop=buyAmmoPack('ammo_m995');
      out.shop={ok:okShop, reserve:player.curW.reserve, ammo:player.curW.ammo, wallet:META.wallet};
      // 穿甲对比: RIP vs AP (同一件 3 级护甲)
      player.armorDur=1000; player.armorResist=0.30; player.body.thorax.hp=100; player.body.thorax.max=100;
      applyPlayerBodyDamage(50,{_lastAmmo:AMMO_DEFS.ammo_rip,_lastAmmoT:nowT},false,'thorax');
      const rip=100-player.body.thorax.hp;
      player.body.thorax.hp=100; player.armorDur=1000;
      applyPlayerBodyDamage(50,{_lastAmmo:AMMO_DEFS.ammo_ap,_lastAmmoT:nowT},false,'thorax');
      const ap=100-player.body.thorax.hp;
      out.pen={rip:+rip.toFixed(1), ap:+ap.toFixed(1)};
    }catch(e){ out.err=String((e&&e.stack)||e); }
    return out;
  })()`;
  const r = await rpc(ws, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  console.log(JSON.stringify({ result: r.result && r.result.value, exceptions: errors.slice(0, 6) }, null, 1));
  try { chrome.kill(); } catch (e) { }
  process.exit(0);
})();
