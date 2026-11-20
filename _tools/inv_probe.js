// 网格库存探针: 背包 / 仓库 / 物资容器
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const URL_ = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9337;
const profile = os.tmpdir() + '/inv-probe-' + Date.now();
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

  const setup = `(async function(){
    const out={};
    try{
      el('menu').classList.add('hidden'); startMatch(); showDeploy(false); selectedSpawn=-1; deployPlayer();
      await new Promise(r=>setTimeout(r,700));
      VM.state='idle'; VM.stateT=0;
      META.loadout.pack='packRaid'; META.loadout.chest='chest56';
      RUN.loot={tourniquet:2,water:1,m4:1,medkit:1,ledx:2,armor3:1,helm3:1,packSmall:1,m1911:1};
      RUN.secure=['tourniquet'];
      META.owned={m4:1,armor3:1,packSmall:1,helm3:1,m1911:1};
      META.loot={ledx:2,tourniquet:3};
      META.gridOwned={}; META.gridLoot={}; RUN.grid={pack:{},chest:{}};
      toggleBagPanel();
      await new Promise(r=>setTimeout(r,400));
      out.bag={open:BAG_UI.open,
        packTiles:document.querySelectorAll('#bagPackHost .invTile').length,
        chestTiles:document.querySelectorAll('#bagChestHost .invTile').length,
        secTiles:document.querySelectorAll('#bagSecHost .invTile').length,
        hasGrid:!!document.querySelector('#bagPackHost .invGrid'),
        detail:(document.getElementById('bagDetail')||{}).textContent||''};
      out.bag.btns=(document.getElementById('bagPanelBtns')||{}).textContent||'';
      out.foot={m4:INVGRID.foot('m4'),m1911:INVGRID.foot('m1911'),armor3:INVGRID.foot('armor3'),helm3:INVGRID.foot('helm3'),packSmall:INVGRID.foot('packSmall'),tourniquet:INVGRID.foot('tourniquet')};
      out.bag.cap={used:bagUsed(),cap:bagCapacity(),packSlots:bagPackSlots(),chestSlots:bagChestSlots()};
      RUN.grid.chest.tourniquet={x:0,y:0,rot:0};
      delete RUN.grid.pack.tourniquet;
      renderBagPanel();
      await new Promise(r=>setTimeout(r,250));
      out.bag.chestMoved={chestTiles:document.querySelectorAll('#bagChestHost .invTile').length,
                          packTiles:document.querySelectorAll('#bagPackHost .invTile').length};
      const st=document.querySelector('#bagSecHost .secTile');
      if(st){ st.click(); await new Promise(r=>setTimeout(r,200)); out.bag.secAfter=(RUN.secure||[]).length; }
    }catch(e){ out.bagErr=String((e&&e.stack)||e); }
    return out;
  })()`;
  const a = await rpc(ws, 'Runtime.evaluate', { expression: setup, awaitPromise: true, returnByValue: true });
  const s1 = await rpc(ws, 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('_inv_bag.png', Buffer.from(s1.data, 'base64'));

  const armory = `(async function(){
    const out={};
    try{
      toggleBagPanel();
      el('menu').classList.remove('hidden');
      el('mHome').classList.add('hidden');
      el('mArmory').classList.remove('hidden');
      renderArmory('warehouse');
      await new Promise(r=>setTimeout(r,350));
      out.warehouse={tiles:document.querySelectorAll('#arGridHost .invTile').length,
        host:!!document.getElementById('arGridHost'),
        hasEquip:!!document.querySelector('#arDetail [data-action="equip"]'),
        detail:(document.getElementById('arDetail')||{}).textContent||''};
      const eq=document.querySelector('#arDetail [data-action="equip"]');
      if(eq){ eq.click(); await new Promise(r=>setTimeout(r,300)); out.warehouse.equipped=META.loadout.primary; }
      renderArmory('loot');
      await new Promise(r=>setTimeout(r,250));
      out.lootTab={tiles:document.querySelectorAll('#arGridHost .invTile').length,
        detail:(document.getElementById('arDetail')||{}).textContent||''};
    }catch(e){ out.err=String((e&&e.stack)||e); }
    return out;
  })()`;
  const b = await rpc(ws, 'Runtime.evaluate', { expression: armory, awaitPromise: true, returnByValue: true });
  const s2 = await rpc(ws, 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('_inv_armory.png', Buffer.from(s2.data, 'base64'));

  const loot = `(async function(){
    const out={};
    try{
      document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden'));
      const ref={x:player.pos.x,z:player.pos.z,loot:{tourniquet:2,water:1,medkit:1},grid:{},searched:false};
      openLootPanel({kind:'crate',ref:ref});
      await new Promise(r=>setTimeout(r,400));
      out.open={open:LOOT_UI.open,
        src:document.querySelectorAll('#lootSrcHost .invTile').length,
        bag:document.querySelectorAll('#lootBagHost .invTile').length};
      const b0=RUN.loot.tourniquet||0;
      lootTakeToBag('water');
      await new Promise(r=>setTimeout(r,250));
      out.take={bagWater:RUN.loot.water||0, srcWater:(LOOT_UI.ref.loot.water|0),
        bagTiles:document.querySelectorAll('#lootBagHost .invTile').length,
        srcTiles:document.querySelectorAll('#lootSrcHost .invTile').length};
      lootPutBack('tourniquet');
      await new Promise(r=>setTimeout(r,250));
      out.put={bagBandage:RUN.loot.tourniquet||0, srcBandage:(LOOT_UI.ref.loot.tourniquet|0)};
    }catch(e){ out.err=String((e&&e.stack)||e); }
    return out;
  })()`;
  const c = await rpc(ws, 'Runtime.evaluate', { expression: loot, awaitPromise: true, returnByValue: true });
  const s3 = await rpc(ws, 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('_inv_loot.png', Buffer.from(s3.data, 'base64'));

  console.log(JSON.stringify({ bag: a.result && a.result.value, armory: b.result && b.result.value, loot: c.result && c.result.value, exceptions: errors.slice(0, 8) }, null, 1));
  try { chrome.kill(); } catch (e) { }
  process.exit(0);
})();
