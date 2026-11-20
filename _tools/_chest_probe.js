// 胸挂系统验证
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9881;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) { try { if (ws) ws.close(); } catch (e) { } try { if (proc) proc.kill(); } catch (e) { } fs.writeFileSync(path.join(ROOT, '_tools', '_chest_probe.txt'), out.join('\n') + '\n', 'utf8'); process.exit(c); }
(async () => {
  const ud = path.join(require('os').tmpdir(), 'cs_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,900', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  await sleep(2500);
  let list = null;
  for (let i = 0; i < 40; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list && list.length) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page');
  if (!page) { log('NO_PAGE'); return finish(1); }
  ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); if (j.method === 'Runtime.exceptionThrown') { const s = ((j.params.exceptionDetails.exception || {}).description || '').split('\n')[0]; if (errs.indexOf(s) < 0) errs.push(s); } });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable');
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : String(o); };

  await rpc('Page.navigate', { url: URL });
  await sleep(16000);

  log('=== 1. 胸挂定义 ===');
  log('  ' + await ev(`Object.keys(CHEST_DEFS).map(function(k){var d=CHEST_DEFS[k];return k+' → '+d.name+(d.color?(' '+d.color):'')+' | '+d.slots+' 格 | 售价 '+d.price;}).join(' || ')`));

  log('\n=== 2. 物品函数 ===');
  for (const k of ['chest56', 'chestBH', 'chestMK3']) {
    log('  ' + k + ': kind=' + await ev(`itemKind('${k}')`) + ' icon=' + await ev(`itemIconOf('${k}')`) + ' 名称=' + await ev(`itemName('${k}')`) + ' 自身尺寸=' + await ev(`itemSizeOf('${k}')`));
    log('     描述=' + await ev(`itemDesc('${k}')`) + ' · 买价=' + await ev(`itemPrice('${k}')`));
  }

  log('\n=== 3. 容量 = 背包 + 胸挂 ===');
  log('  ' + await ev(`(function(){
    try{
      const res=[];
      for(const p of ['packSmall','packTT45']) for(const c of ['', 'chest56','chestMK3']){
        META.loadout.pack=p; META.loadout.chest=c;
        res.push(p+'('+bagPackSlots()+') + '+(c||'无')+'('+bagChestSlots()+') = '+bagCapacity()+' 格');
      }
      return res.join(' || ');
    }catch(e){ return 'EXC '+e.message; }
  })()`));

  log('\n=== 4. 核心约束: 胸挂只收 <=2 格物品 ===');
  log('  ' + await ev(`(function(){
    try{
      META.loadout.pack='packSmall';   // 背包 16 格
      META.loadout.chest='chestMK3';   // 胸挂 25 格 → 合计 41
      RUN.loot={};
      const BIG='hk416';               // 尺寸 6
      const SMALL='cig';               // 尺寸 1
      const res=[];
      res.push('配置: 背包 16 + 胸挂 25 = '+bagCapacity()+' 格');
      res.push('大件 '+BIG+' 尺寸='+itemSizeOf(BIG)+' · 小件 '+SMALL+' 尺寸='+itemSizeOf(SMALL));
      // 先塞 2 个大件 = 12 格, 背包还剩 4
      addLootToBag(BIG,2);
      res.push('塞 2 个大件后: 大件池='+bagUsedBig()+' 小件池='+bagUsedSmall()+' 总='+bagUsed()+' 还能装大件? '+canCarry(BIG,1));
      // 再塞 1 个大件 = 18 > 16 → 必须失败, 哪怕总容量 41 还很空
      res.push('再塞第 3 个大件(需 18 > 背包 16): canCarry='+canCarry(BIG,1)+'  → '+(canCarry(BIG,1)?'❌ 不该通过':'✅ 正确拒绝'));
      // 小件应该还能塞很多 (合计 41)
      res.push('小件还能塞: '+Math.floor((bagCapacity()-bagUsed())/itemSizeOf(SMALL))+' 个');
      return res.join('\\n  ');
    }catch(e){ return 'EXC '+e.message; }
  })()`));

  log('\n=== 5. 只有胸挂没有背包时 ===');
  log('  ' + await ev(`(function(){
    try{
      META.loadout.chest='chestMK3';
      RUN.loot={};
      const r=[];
      r.push('胸挂 25 格 · 小件 canCarry(cig,20)='+canCarry('cig',20));
      r.push('大件 canCarry(hk416,1)='+canCarry('hk416',1)+' (背包 16 还能放 1 个 6 格的)');
      addLootToBag('hk416',2);   // 12 格
      r.push('塞 2 个大件后 大件池='+bagUsedBig()+' · 再要 1 个? '+canCarry('hk416',1));
      return r.join(' | ');
    }catch(e){ return 'EXC '+e.message; }
  })()`));

  log('\n=== 6. 胸挂与背包共存 (两个槽独立) ===');
  log('  ' + await ev(`(function(){
    try{
      META.loadout.pack='packSmall'; META.loadout.chest='chest56';
      const r=['背包='+META.loadout.pack+' 胸挂='+META.loadout.chest+' 同时存在='+(!!META.loadout.pack&&!!META.loadout.chest)];
      r.push('容量='+bagCapacity()+' (16+10)');
      return r.join(' · ');
    }catch(e){ return 'EXC '+e.message; }
  })()`));

  log('\n=== 7. 下拉 / 仓库 / 市集 / 装备槽位 ===');
  await ev(`(function(){ localStorage.setItem('sf_campaign','3'); localStorage.setItem('sf_autodeploy','0'); return 1; })()`);
  await rpc('Page.navigate', { url: URL });
  await sleep(17000);
  await ev(`(function(){ META.wallet+=30000; addOwned('chest56',1); addOwned('chestBH',1); addOwned('chestMK3',1); saveMeta(); return 1; })()`);
  await ev(`(function(){ const b=[...document.querySelectorAll('.navBtn')].find(x=>x.dataset.p==='mPlay'); if(b) b.click(); return 1; })()`);
  await sleep(1300);
  log('  胸挂下拉 = ' + await ev(`(function(){var e=document.getElementById('chestSelect');return e?[...e.options].map(function(o){return o.textContent;}).join(' | '):'NO_EL';})()`));
  await ev(`(function(){ const b=document.getElementById('startBtn'); if(b) b.click(); return 1; })()`);
  await sleep(7000);
  log('  配装摘要 = ' + await ev(`(document.getElementById('loadoutSummary')||{}).textContent||'NO_EL'`));
  log('  仓库行数 = ' + await ev(`(function(){try{ renderArmory('warehouse'); return document.querySelectorAll('#arList .arRow').length; }catch(e){return 'EXC';}})()`));
  log('  仓库里的胸挂 = ' + await ev(`(function(){try{ var n=[...document.querySelectorAll('#arList .arName')].map(function(e){return e.textContent;}).filter(function(t){return t.indexOf('胸挂')>=0;}); return n.join(' | ')||'（无）'; }catch(e){return 'EXC';}})()`));
  log('  市集货架 = ' + await ev(`(function(){try{ renderArmory('market'); var t=document.getElementById('arList').textContent; var hit=['56式','Commando','WARTECH'].filter(function(s){return t.indexOf(s)>=0;}); return hit.join(', ')||'（无）'; }catch(e){return 'EXC';}})()`));
  log('  装备槽位映射 = ' + await ev(`(function(){ try{ var kind=itemKind('chestMK3'); var slot=(kind==='armor')?'armor':(kind==='helmet')?'helmet':(kind==='headset')?'headset':(kind==='pack')?'pack':(kind==='chest')?'chest':'primary'; return 'chestMK3 ('+kind+') → '+slot; }catch(e){return 'EXC';} })()`));

  log('\n=== 异常 ===');
  log(errs.length ? errs.join('\n') : '无');
  finish(0);
})();
