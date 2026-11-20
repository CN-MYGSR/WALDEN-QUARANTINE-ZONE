// 仓库列出头盔/耳机/背包 + 装备按钮槽位 验证
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9871;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) { try { if (ws) ws.close(); } catch (e) { } try { if (proc) proc.kill(); } catch (e) { } fs.writeFileSync(path.join(ROOT, '_tools', '_warehouse_probe.txt'), out.join('\n') + '\n', 'utf8'); process.exit(c); }
(async () => {
  const ud = path.join(require('os').tmpdir(), 'wh_' + Date.now());
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
  const shot = async (name, clip) => { const o = await rpc('Page.captureScreenshot', { format: 'png', clip: Object.assign({ scale: 2 }, clip) }); if (o.result && o.result.data) { fs.writeFileSync(path.join(ROOT, name), Buffer.from(o.result.data, 'base64')); log('  截图 → ' + name); } };

  await rpc('Page.navigate', { url: URL });
  await sleep(16000);

  log('=== 1. 备好五种装备 ===');
  log('  ' + await ev(`(function(){
    try{
      META.wallet+=50000;
      addOwned('hk416',1); addOwned('armor5',1); addOwned('helm4',1); addOwned('hs_comtac6',1); addOwned('packTT45',1);
      saveMeta();
      return '已入库: hk416 / armor5 / helm4 / hs_comtac6 / packTT45';
    }catch(e){ return 'EXC '+e.message; }
  })()`));

  log('\n=== 2. ownedXxxList 各自识别 ===');
  log('  weapons=' + await ev(`ownedWeaponList().join(',')`));
  log('  armor  =' + await ev(`ownedArmorList().join(',')`));
  log('  helmet =' + await ev(`ownedHelmetList().join(',')`));
  log('  headset=' + await ev(`ownedHeadsetList().join(',')`));
  log('  pack   =' + await ev(`(typeof ownedPackList==='function')?ownedPackList().join(','):'❌ 没有 ownedPackList'`));

  log('\n=== 仓库网格·通过物品详情装备五个槽位 ===');
  const result = await ev(`(()=>{
    document.querySelector('[data-p=mArmory]').click();
    document.querySelector('[data-ar=warehouse]').click();
    const count=document.querySelectorAll('#arGridHost .invTile').length;
    const equipped={};
    for(const [slot,key] of Object.entries({armor:'armor5',helmet:'helm4',headset:'hs_comtac6',pack:'packTT45',primary:'hk416'})){
      const tile=document.querySelector('#arGridHost .invTile[data-key="'+key+'"]');
      if(!tile) throw Error('仓库缺少物品 '+key);
      tile.click();
      const button=document.querySelector('#arDetail [data-action=equip][data-key="'+key+'"]');
      if(!button) throw Error('详情缺少装备按钮 '+key);
      button.click();
      equipped[slot]=META.loadout[slot];
      if(equipped[slot]!==key) throw Error('装备后槽位不符 '+slot+' '+equipped[slot]);
    }
    return {count,equipped};
  })()`);
  if (!result || typeof result !== 'object') { log('  '+result); return finish(1); }
  const gear = result.equipped;
  log('  物品格 = '+result.count);
  log('  护甲→'+gear.armor+' | 头盔→'+gear.helmet+' | 耳机→'+gear.headset+' | 背包→'+gear.pack+' | 主武器→'+gear.primary);

  log('\n=== 仓库截图 ===');
  await sleep(600);
  await shot('smoke-warehouse.png', { x: 180, y: 0, width: 900, height: 620 });
  // 滚到底, 检查网格底部
  await ev(`(function(){ var l=document.getElementById('arList'); if(l) l.scrollTop=l.scrollHeight; return 1; })()`);
  await sleep(400);
  await shot('smoke-warehouse2.png', { x: 180, y: 0, width: 900, height: 620 });

  log('\n=== 异常 ===');
  log(errs.length ? errs.join('\n') : '无');
  finish(0);
})();
