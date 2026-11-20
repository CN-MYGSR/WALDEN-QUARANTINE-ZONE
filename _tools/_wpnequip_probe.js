// 验证「缴获的敌方武器能装备到快捷栏」
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9671;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) { try { if (ws) ws.close(); } catch (e) { } try { if (proc) proc.kill(); } catch (e) { } fs.writeFileSync(path.join(ROOT, '_tools', '_wpnequip_probe.txt'), out.join('\n') + '\n', 'utf8'); process.exit(c); }
(async () => {
  const ud = path.join(require('os').tmpdir(), 'we_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=844,390', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  await sleep(2500);
  let list = null;
  for (let i = 0; i < 40; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list && list.length) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page');
  if (!page) { log('NO_PAGE'); return finish(1); }
  ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); if (j.method === 'Runtime.exceptionThrown') errs.push('EXC ' + ((j.params.exceptionDetails.exception || {}).description || '').split('\n')[0]); });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable');
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : String(o); };
  const shot = async n => { const o = await rpc('Page.captureScreenshot', { format: 'png' }); if (o.result && o.result.data) fs.writeFileSync(path.join(ROOT, 'outputs', n), Buffer.from(o.result.data, 'base64')); log('  已存 outputs/' + n); };
  const tap = async (sel) => {
    const box = await ev(`(function(){ const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return 'NO_EL'; const r=e.getBoundingClientRect(); return JSON.stringify({x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)}); })()`);
    if (box === 'NO_EL') return 'NO_EL';
    const { x, y } = JSON.parse(box);
    const hit = await ev(`(function(){ const e=document.elementFromPoint(${x},${y}); if(!e) return 'null';
      return (e.tagName+(e.id?'#'+e.id:'')+(e.className?'.'+String(e.className).replace(/\\s+/g,'.'):'')).slice(0,52); })()`);
    await rpc('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1, radiusX: 12, radiusY: 12, force: 1 }] });
    await sleep(60);
    await rpc('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(600);
    return '点击@' + x + ',' + y + ' 命中=' + hit;
  };
  const wpnState = () => ev(`JSON.stringify({
    slots:player.slots.map(s=>s&&s.key),
    curSlot:player.curSlot,
    curW:player.curW&&player.curW.key,
    vmKey:(typeof VM!=='undefined')?VM.key:null,
    loot:Object.keys(RUN.loot)
  })`);

  await rpc('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await rpc('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await rpc('Page.navigate', { url: URL });
  await sleep(parseInt(process.argv[4] || '16000', 10));
  await ev(`(function(){ const b=[...document.querySelectorAll('.navBtn')].find(x=>x.dataset.p==='mPlay'); if(b) b.click(); return 1; })()`);
  await sleep(1200);
  await ev(`(function(){ const b=document.getElementById('startBtn'); if(b) b.click(); return 1; })()`);
  await sleep(6500);
  await ev(`(function(){ const b=document.getElementById('deployBtn'); if(b) b.click(); return 1; })()`);
  await sleep(3500);

  log('=== 开局武器状态 ===');
  log('  ' + await wpnState());

  // 模拟缴获一把敌方武器(直接塞进背包, 等价于从尸体搜刮)
  log('\n=== 缴获一把敌方武器 ===');
  const lootKey = await ev(`(function(){
    const cands=['mp40','stg44','kar98','mosin','ppsh','g43','thompson','garand'];
    for(const k of cands){ if(WPN_DEFS[k] && !player.slots.some(s=>s&&s.key===k)){ if(addLootToBag(k,1)) return k; } }
    return 'NONE';
  })()`);
  log('  塞入背包: ' + lootKey);
  log('  状态: ' + await wpnState());

  await ev(`(function(){ if(!BAG_UI.open) toggleBagPanel(); return 1; })()`);
  await sleep(800);
  log('\n=== 背包里选中该武器 ===');
  log('  选中: ' + await ev(`(function(){
    const ks=bagEntryKeys(); const i=ks.indexOf('${lootKey}');
    if(i<0) return 'NOT_IN_BAG'; BAG_UI.sel=i; renderBagPanel();
    return ks[i]+' · 第'+(i+1)+'行';
  })()`));
  await sleep(500);
  log('  操作条按钮: ' + await ev(`JSON.stringify([...document.querySelectorAll('#bagPanelBtns .bagAct')].map(b=>b.textContent))`));
  log('  行内标记: ' + await ev(`(function(){const r=document.querySelector('#bagPanelList .bagRow.sel');return r?r.textContent.trim().slice(0,60):'-';})()`));
  log('  提示行: ' + await ev(`document.getElementById('bagPanelHint').textContent`));
  await shot('wpnequip_mobile.png');

  log('\n=== ① 触摸「装备到副武器」 ===');
  log('  ' + await tap('#bagPanelBtns .bagAct[data-bact="eq1"]'));
  log('  状态: ' + await wpnState());

  log('\n=== ② 再装备一把到主武器(应把原主武器换回背包) ===');
  const loot2 = await ev(`(function(){
    const cands=['mp40','stg44','kar98','mosin','ppsh','g43','thompson','garand','svt40','mp44'];
    for(const k of cands){ if(WPN_DEFS[k] && !player.slots.some(s=>s&&s.key===k) && !RUN.loot[k]){ if(addLootToBag(k,1)) return k; } }
    return 'NONE';
  })()`);
  log('  再塞入: ' + loot2);
  await ev(`(function(){ const ks=bagEntryKeys(); const i=ks.indexOf('${loot2}'); if(i>=0){ BAG_UI.sel=i; renderBagPanel(); } return 1; })()`);
  await sleep(500);
  log('  装备前: ' + await wpnState());
  log('  ' + await tap('#bagPanelBtns .bagAct[data-bact="eq0"]'));
  log('  装备后: ' + await wpnState());

  log('\n=== ③ 切枪键仍可用(1/2 换手) ===');
  log('  ' + await ev(`(function(){ try{ VM.state='idle'; switchSlot(0); return 'curSlot='+player.curSlot+' curW='+(player.curW&&player.curW.key); }catch(e){ return 'EXC '+e.message; } })()`));
  log('  ' + await ev(`(function(){ try{ VM.state='idle'; switchSlot(1); return 'curSlot='+player.curSlot+' curW='+(player.curW&&player.curW.key); }catch(e){ return 'EXC '+e.message; } })()`));

  log('\n=== ④ 非武器行不应出现装备按钮 ===');
  await ev(`(function(){ addLootToBag('water',1); const ks=bagEntryKeys(); const i=ks.indexOf('water'); if(i>=0){ BAG_UI.sel=i; renderBagPanel(); } return 1; })()`);
  await sleep(500);
  log('  操作条按钮: ' + await ev(`JSON.stringify([...document.querySelectorAll('#bagPanelBtns .bagAct')].map(b=>b.textContent))`));

  log('\n=== 异常 ===');
  log(errs.length ? errs.join('\n') : '无');
  finish(0);
})();
