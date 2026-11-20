// 改装模型探针: 装瞄具/枪口后模型子节点是否变化
const http = require('http');
const { spawn } = require('child_process');
const os = require('os');
const URL_ = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9339;
const profile = os.tmpdir() + '/mod-probe-' + Date.now();
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
    function snap(key){
      try{
        vmEquip(key,0);
        const g=VM.gunParts;
        return {children:g.gun.children.length, opticY:g.opticSightY!=null?+g.opticSightY.toFixed(3):null,
                lens:!!g.scopeLens, muzzleZ:g.muzzle?+g.muzzle.z.toFixed(3):null,
                anchors:!!(g.anchors&&g.anchors.ads), optic:typeof effectiveOptic==='function'?effectiveOptic(key):null,
                mods:JSON.stringify(PLAYER_MODS[key]||{})};
      }catch(e){ return {err:String(e&&e.stack||e)}; }
    }
    try{
      delete PLAYER_MODS.m4; out.m4base=snap('m4');
      PLAYER_MODS.m4={optic:'optic_2x',muzzle:'muzzle_comp',gear:'gear_none'}; out.m4mod=snap('m4');
      delete PLAYER_MODS.mp40; out.mp40base=snap('mp40');
      PLAYER_MODS.mp40={optic:'optic_reflex',muzzle:'muzzle_comp',gear:'gear_none'}; out.mp40mod=snap('mp40');
      delete PLAYER_MODS.m1911; out.m1911base=snap('m1911');
      PLAYER_MODS.m1911={optic:'optic_iron',muzzle:'muzzle_supp',gear:'gear_none'}; out.m1911mod=snap('m1911');
      out.slots={m4:getModSlots('m4'), mp40:getModSlots('mp40'), m1911:getModSlots('m1911')};
      // 真实工坊点击路径
      META.wallet=100000; META.owned.m4=1; META.owned.mp40=1; META.loadout.primary='m4';
      WORKBENCH_KEY='mp40';
      renderArmory('workbench');
      const wb=document.querySelector('[data-wb][data-slot="optic"][data-mid="optic_reflex"]');
      out.wb={key:WORKBENCH_KEY, hasBtn:!!wb, before:JSON.stringify(PLAYER_MODS.mp40||{})};
      if(wb){ wb.click(); out.wb.after=JSON.stringify(PLAYER_MODS.mp40||{}); out.wb.optic=effectiveOptic('mp40'); }
      vmEquip('mp40',0);
      out.wb.children=VM.gunParts.gun.children.length;
      out.wb.opticY=VM.gunParts.opticSightY!=null?+VM.gunParts.opticSightY.toFixed(3):null;
      // 批量: 所有带非机瞄选项的武器
      out.batch={};
      for(const key of ['mp40','thompson','type100','m1carb','stg44','g36c','m4','qbz95','finmosin','ls26','dp28','zb26']){
        const slots=getModSlots(key);
        const op=(slots.optic||[]).find(x=>x!=='optic_iron')||'optic_iron';
        const mz=(slots.muzzle||[]).find(x=>x!=='muzzle_standard')||'muzzle_standard';
        PLAYER_MODS[key]={optic:op,muzzle:mz,gear:'gear_none'};
        const s=snap(key);
        out.batch[key]={op:op,mz:mz,children:s.children,opticY:s.opticY,muzzleZ:s.muzzleZ,err:s.err};
      }
      // 完整部署链路: 工坊点击 → 部署 → 看模型
      META.owned.m4=1; META.owned.m1911=1; META.loadout.primary='m4'; META.loadout.secondary='';
      WORKBENCH_KEY='m4';
      renderArmory('workbench');
      const b4=document.querySelector('[data-wb][data-slot="optic"][data-mid="optic_2x"]');
      if(b4) b4.click();
      out.beforeDeploy=JSON.stringify(PLAYER_MODS.m4||{});
      startMatch(); showDeploy(false); selectedSpawn=-1; deployPlayer();
      await new Promise(r=>setTimeout(r,500));
      out.deploy={key:VM.key, curW:player.curW&&player.curW.key,
        opticY:VM.gunParts.opticSightY, children:VM.gunParts.gun.children.length,
        mods:JSON.stringify(PLAYER_MODS.m4||{})};
      // 夜视仪占用 / 自带镜武器: 工坊应明确提示并禁用外置镜
      META.owned.m4=1; META.owned.kar98zf=1;
      PLAYER_MODS.m4={optic:'optic_2x',gear:'gear_nvg'};
      WORKBENCH_KEY='m4'; renderArmory('workbench');
      out.nvg={optic:effectiveOptic('m4'), warn:document.body.textContent.indexOf('夜视仪已占用战术配件槽')>=0,
        disabled:(function(){const b=document.querySelector('[data-wb][data-slot="optic"][data-mid="optic_2x"]');return b?b.disabled:null;})()};
      PLAYER_MODS.kar98zf={optic:'optic_2x',gear:'gear_none'};
      WORKBENCH_KEY='kar98zf'; renderArmory('workbench');
      out.scoped={optic:effectiveOptic('kar98zf'), scoped:!!WPN_DEFS.kar98zf.scoped,
        disabled:(function(){const b=document.querySelector('[data-wb][data-slot="optic"][data-mid="optic_2x"]');return b?b.disabled:null;})()};
      // 非手持武器的改装提示
      META.owned.mp40=1;
      player.slots=[]; WORKBENCH_KEY='mp40';
      chargeModChoice('mp40','optic','optic_reflex');
      out.hint=(document.getElementById('scorePop')||{}).textContent||'';
    }catch(e){ out.err=String(e&&e.stack||e); }
    return out;
  })()`;
  const r = await rpc(ws, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  console.log(JSON.stringify({ result: r.result && r.result.value, exceptions: errors.slice(0, 6) }, null, 1));
  try { chrome.kill(); } catch (e) { }
  process.exit(0);
})();
