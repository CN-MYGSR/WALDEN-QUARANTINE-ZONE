// 专项验证: 装备类丢弃 -> 应放回仓库(META.owned); 杂物类丢弃 -> 直接消失
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9371;
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'gear_' + Date.now());
  const proc = spawn(ch, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,720', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'http://127.0.0.1:8123/index.html'], { stdio: 'ignore' });
  await sleep(3500);
  let list = null;
  for (let i = 0; i < 25; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page'); if (!page) { console.log('NO_PAGE'); proc.kill(); process.exit(1); }
  const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0; const pend = {};
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa })); });
  await rpc('Page.enable', {}); await rpc('Runtime.enable', {});
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + (o.result.exceptionDetails.exception.description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : JSON.stringify(o); };

  await sleep(9000);
  await ev(`startMatch(); el('menu').classList.add('hidden'); showDeploy(false);`);
  await sleep(2500);
  await ev(`(function(){ selectedSpawn=-1; deployPlayer(); })()`);
  await sleep(2500);

  console.log('== 装备类丢弃 -> 放回仓库 ==');
  console.log('打开背包面板:', await ev(`(function(){ if(!BAG_UI.open) toggleBagPanel(); return 'open='+BAG_UI.open; })()`));
  console.log('测试前 META.owned.garand:', await ev(`META.owned.garand||0`));
  console.log('清空背包并腾足空间:', await ev(`(function(){ RUN.loot={}; const cap=bagCapacity(); return 'cap='+cap; })()`));
  console.log('放入 garand:', await ev(`(function(){ const ok=addLootToBag('garand',1); return 'ok='+ok+' used='+bagUsed()+'/'+bagCapacity(); })()`));
  console.log('加一把武器后再放第二把(size=6):', await ev(`(function(){ const ok=addLootToBag('m1911',1); return 'ok='+ok+' used='+bagUsed()+'/'+bagCapacity(); })()`));

  console.log('\n-- 选中 garand 并丢弃 --');
  console.log('结果:', await ev(`(function(){
    const ks=bagEntryKeys(); const i=ks.indexOf('garand'); if(i<0) return 'not-found keys='+ks.join(',');
    BAG_UI.sel=i; const before=META.owned.garand||0;
    bagDropSelected(false);
    return 'owned '+before+'->'+(META.owned.garand||0)+' | inBag='+(RUN.loot.garand||0)+' | 剩余='+bagUsed()+'/'+bagCapacity(); })()`));

  console.log('\n-- 选中 m1911 并丢弃整组 --');
  console.log('结果:', await ev(`(function(){
    const ks=bagEntryKeys(); const i=ks.indexOf('m1911'); if(i<0) return 'not-found keys='+ks.join(',');
    BAG_UI.sel=i; const before=META.owned.m1911||0;
    bagDropAllOfSelected();
    return 'owned '+before+'->'+(META.owned.m1911||0)+' | inBag='+(RUN.loot.m1911||0)+' | 剩余='+bagUsed()+'/'+bagCapacity(); })()`));

  console.log('\n== 对比: 杂物类丢弃 -> 直接消失, 不进仓库 ==');
  await ev(`(function(){ if(!BAG_UI.open) toggleBagPanel(); return 0; })()`);
  console.log('结果:', await ev(`(function(){
    RUN.loot={}; addLootToBag('medkit',2);
    const before=META.owned.medkit||0;
    BAG_UI.sel=bagEntryKeys().indexOf('medkit'); bagDropAllOfSelected();
    return 'owned '+before+'->'+(META.owned.medkit||0)+' | inBag='+(RUN.loot.medkit||0)+' (杂物不应进仓库)'; })()`));

  console.log('\n== 护甲(装备类, size=4) ==');
  await ev(`(function(){ if(!BAG_UI.open) toggleBagPanel(); return 0; })()`);
  console.log('结果:', await ev(`(function(){
    RUN.loot={}; const ok=addLootToBag('armor1',1);
    const before=META.owned.armor1||0;
    BAG_UI.sel=0; bagDropSelected(false);
    return 'addOk='+ok+' owned '+before+'->'+(META.owned.armor1||0)+' | inBag='+(RUN.loot.armor1||0); })()`));

  ws.close(); proc.kill(); await sleep(300); process.exit(0);
})();
