// 背包改名 + 容量 验证
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9851;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) { try { if (ws) ws.close(); } catch (e) { } try { if (proc) proc.kill(); } catch (e) { } fs.writeFileSync(path.join(ROOT, '_tools', '_pack_probe.txt'), out.join('\n') + '\n', 'utf8'); process.exit(c); }
(async () => {
  const ud = path.join(require('os').tmpdir(), 'pk_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,760', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
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

  log('=== 1. 背包定义 ===');
  log('  ' + await ev(`Object.keys(PACK_DEFS).map(function(k){var d=PACK_DEFS[k];return k+' → '+d.name+' | '+d.slots+' 格 | 售价 '+d.price;}).join(' || ')`));

  log('\n=== 2. 物品函数 ===');
  for (const k of ['packSmall', 'packAssault', 'packRaid', 'packTT45']) {
    log('  ' + k + ': kind=' + await ev(`itemKind('${k}')`) + ' icon=' + await ev(`itemIconOf('${k}')`) + ' 名称=' + await ev(`itemName('${k}')`));
    log('     描述=' + await ev(`itemDesc('${k}')`) + ' · 买价=' + await ev(`itemPrice('${k}')`) + ' · 售价=' + await ev(`itemSellPrice('${k}')`));
  }

  log('\n=== 3. 实际背包容量 (bagCapacity) ===');
  log('  ' + await ev(`(function(){
    try{
      const save=META.loadout.pack, res=[];
      for(const k of Object.keys(PACK_DEFS)){
        META.loadout.pack=k;
        res.push(PACK_DEFS[k].slots+' 格 → bagCapacity()='+bagCapacity());
      }
      META.loadout.pack=save;
      return res.join(' | ');
    }catch(e){ return 'EXC '+e.message; }
  })()`));

  log('\n=== 4. 部署界面背包下拉 ===');
  await ev(`(function(){ localStorage.setItem('sf_campaign','3'); localStorage.setItem('sf_autodeploy','0'); return 1; })()`);
  await rpc('Page.navigate', { url: URL });
  await sleep(17000);
  await ev(`(function(){ const b=[...document.querySelectorAll('.navBtn')].find(x=>x.dataset.p==='mPlay'); if(b) b.click(); return 1; })()`);
  await sleep(1300);
  await ev(`(function(){ const b=document.getElementById('startBtn'); if(b) b.click(); return 1; })()`);
  await sleep(7000);
  log('  下拉选项 = ' + await ev(`(function(){var e=document.getElementById('packSelect');return e?[...e.options].map(function(o){return o.textContent;}).join(' | '):'NO_EL';})()`));

  log('\n=== 5. 军械库货架 ===');
  log('  ' + await ev(`(function(){
    try{ renderArmory('market'); var t=document.getElementById('arList').textContent;
      var hit=['Flyye','LBT-8005A','Gruppa','Tasmanian'].filter(function(s){return t.indexOf(s)>=0;});
      return '货架命中: '+(hit.join(', ')||'（无）'); }catch(e){ return 'EXC '+e.message; }
  })()`));

  log('\n=== 6. 买下 40 格包并部署 ===');
  log('  ' + await ev(`(function(){try{ META.wallet+=20000; addOwned('packTT45',1); META.loadout.pack='packTT45'; saveMeta(); return '已入库并选中'; }catch(e){return 'EXC '+e.message;}})()`));
  await ev(`(function(){ const b=document.getElementById('deployBtn'); if(b) b.click(); return 1; })()`);
  await sleep(3000);
  log('  部署后容量 = ' + await ev(`(function(){try{return bagCapacity()+' 格 · 已用 '+bagUsed();}catch(e){return 'EXC '+e.message;}})()`));
  log('  消耗品摘要 = ' + await ev(`(function(){try{return (document.getElementById('consumSummary')||{}).textContent||'NO_EL';}catch(e){return 'EXC';}})()`));

  log('\n=== 异常 ===');
  log(errs.length ? errs.join('\n') : '无');
  finish(0);
})();
