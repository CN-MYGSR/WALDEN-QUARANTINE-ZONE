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

  log('\n=== 3. 仓库 tab 现在列出的装备 ===');
  log('  ' + await ev(`(function(){
    try{
      renderArmory('warehouse');
      var names=[...document.querySelectorAll('#arList .arName')].map(function(e){return e.textContent;});
      return names.join(' | ') || '（空）';
    }catch(e){ return 'EXC '+e.message; }
  })()`));
  log('  行数 = ' + await ev(`document.querySelectorAll('#arList .arRow').length`));

  log('\n=== 4. 装备按钮槽位映射 (原来会把头盔装成主武器) ===');
  log('  ' + await ev(`(function(){
    try{
      const res=[];
      const before=JSON.stringify(META.loadout);
      for(const key of ['hk416','armor5','helm4','hs_comtac6','packTT45']){
        const kind=itemKind(key);
        const slot=(kind==='armor')?'armor':(kind==='helmet')?'helmet':(kind==='headset')?'headset':(kind==='pack')?'pack':'primary';
        res.push(key+' ('+kind+') → 槽位 '+slot);
      }
      return res.join(' || ');
    }catch(e){ return 'EXC '+e.message; }
  })()`));

  log('\n=== 5. 真点一次「装备」按钮 (头盔) ===');
  log('  ' + await ev(`(function(){
    try{
      META.loadout.helmet='helm1';
      renderArmory('warehouse');
      var rows=[...document.querySelectorAll('#arList .arRow')];
      for(var i=0;i<rows.length;i++){
        var nm=rows[i].querySelector('.arName');
        if(nm&&nm.textContent.indexOf('FAST MT')>=0){
          var b=[...rows[i].querySelectorAll('button')].find(function(x){return x.textContent==='装备';});
          if(b){ b.click(); return '点了 FAST MT 的「装备」· META.loadout.helmet 现在 = '+META.loadout.helmet; }
          return '没找到装备按钮';
        }
      }
      return '仓库里没找到 FAST MT 行';
    }catch(e){ return 'EXC '+e.message; }
  })()`));

  log('\n=== 6. 逐个槽位点一遍 ===');
  log('  ' + await ev(`(function(){
    try{
      const res=[];
      function clickEquip(namePart){
        renderArmory('warehouse');
        var rows=[...document.querySelectorAll('#arList .arRow')];
        for(var i=0;i<rows.length;i++){
          var nm=rows[i].querySelector('.arName');
          if(nm&&nm.textContent.indexOf(namePart)>=0){
            var b=[...rows[i].querySelectorAll('button')].find(function(x){return x.textContent==='装备';});
            if(b) b.click();
            return true;
          }
        }
        return false;
      }
      META.loadout.armor='armor1'; META.loadout.helmet='helm1'; META.loadout.headset=''; META.loadout.pack='packSmall'; META.loadout.primary='m1911';
      clickEquip('Hexatac');  res.push('护甲→'+META.loadout.armor);
      clickEquip('FAST MT');  res.push('头盔→'+META.loadout.helmet);
      clickEquip('ComTac');   res.push('耳机→'+META.loadout.headset);
      clickEquip('Tasmanian');res.push('背包→'+META.loadout.pack);
      clickEquip('HK416');    res.push('主武器→'+META.loadout.primary);
      return res.join(' | ');
    }catch(e){ return 'EXC '+e.message; }
  })()`));

  log('\n=== 7. 截图 ===');
  await ev(`(function(){ META.loadout.helmet='helm4'; META.loadout.headset='hs_comtac6'; META.loadout.pack='packTT45'; saveMeta(); return 1; })()`);
  // 必须先切到军械库面板, 否则截到的是主菜单
  await ev(`(function(){ var b=[...document.querySelectorAll('.navBtn')].find(function(x){return x.dataset.p==='mArmory';}); if(b) b.click(); return 1; })()`);
  await sleep(500);
  await ev(`(function(){ var b=[...document.querySelectorAll('[data-ar]')].find(function(x){return x.dataset.ar==='warehouse';}); if(b) b.click(); return 1; })()`);
  await sleep(600);
  await shot('smoke-warehouse.png', { x: 180, y: 0, width: 900, height: 620 });
  // 滚到底, 拍头盔/耳机/背包那几行
  await ev(`(function(){ var l=document.getElementById('arList'); if(l) l.scrollTop=l.scrollHeight; return 1; })()`);
  await sleep(400);
  await shot('smoke-warehouse2.png', { x: 180, y: 0, width: 900, height: 620 });

  log('\n=== 异常 ===');
  log(errs.length ? errs.join('\n') : '无');
  finish(0);
})();
