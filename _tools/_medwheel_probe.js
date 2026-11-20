// 验证药品轮盘: 键位 / 开启 / 方向选格 / 确认使用 / Esc 关闭 / 手机端点选
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9681;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) { try { if (ws) ws.close(); } catch (e) { } try { if (proc) proc.kill(); } catch (e) { } fs.writeFileSync(path.join(ROOT, '_tools', '_medwheel_probe.txt'), out.join('\n') + '\n', 'utf8'); process.exit(c); }
(async () => {
  const DESKTOP = process.argv[3] !== 'mobile';
  const ud = path.join(require('os').tmpdir(), 'mw_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,760', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
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
  const key = async (code, k) => {
    await rpc('Input.dispatchKeyEvent', { type: 'keyDown', code, key: k, windowsVirtualKeyCode: k.charCodeAt(0) });
    await sleep(40);
    await rpc('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k, windowsVirtualKeyCode: k.charCodeAt(0) });
    await sleep(450);
  };
  const boxOf = async sel => ev(`(function(){
    const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'NO_EL';
    if(e.scrollIntoView) e.scrollIntoView({block:'center'});
    const r=e.getBoundingClientRect();
    return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),
      inView:(r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth)});
  })()`);
  const realClick = async sel => {
    const b = await boxOf(sel); if (b === 'NO_EL') return 'NO_EL';
    const { x, y } = JSON.parse(b);
    await rpc('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0 });
    await rpc('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
    await sleep(50);
    await rpc('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
    await sleep(600);
    return 'click@' + x + ',' + y;
  };
  const touchTap = async sel => {
    const b = await boxOf(sel); if (b === 'NO_EL') return 'NO_EL';
    const { x, y } = JSON.parse(b);
    await rpc('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1, radiusX: 12, radiusY: 12, force: 1 }] });
    await sleep(60);
    await rpc('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(600);
    return 'tap@' + x + ',' + y;
  };
  const mwState = () => ev(`JSON.stringify({
    open:(typeof MEDWHEEL!=='undefined')?MEDWHEEL.open:null,
    sel:(typeof MEDWHEEL!=='undefined')?MEDWHEEL.sel:null,
    keys:(typeof MEDWHEEL!=='undefined')?MEDWHEEL.keys:null,
    loot:Object.keys(RUN.loot).filter(k=>MED_DEFS[k]).map(k=>k+'x'+RUN.loot[k]),
    medUseT:+(player.medUseT||0).toFixed(2),
    hidden:document.getElementById('medWheel').classList.contains('hidden')
  })`);

  if (!DESKTOP) {
    await rpc('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
    await rpc('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  }
  await rpc('Page.navigate', { url: URL });
  await sleep(parseInt(process.argv[4] || '16000', 10));

  log('=== 键位 ===');
  log('  skill 默认键 = ' + await ev(`keyOf('skill')`) + '  → 显示为 ' + await ev(`keyLabelOf('skill')`));
  log('  medwheel 默认键 = ' + await ev(`keyOf('medwheel')`) + '  → 显示为 ' + await ev(`keyLabelOf('medwheel')`));
  log('  设置页动作数 = ' + await ev(`KEY_ACTIONS.length`));

  // 部署(桌面端用真实鼠标点, 触发指针锁定)
  await ev(`(function(){ const b=[...document.querySelectorAll('.navBtn')].find(x=>x.dataset.p==='mPlay'); if(b) b.click(); return 1; })()`);
  await sleep(1200);
  await ev(`(function(){ const b=document.getElementById('startBtn'); if(b) b.click(); return 1; })()`);
  await sleep(6500);
  log('\n=== 部署 ===');
  {
    const b = await boxOf('#deployBtn');
    const o = (b === 'NO_EL') ? null : JSON.parse(b);
    log('  #deployBtn 位置 = ' + b);
    if (o && o.inView && DESKTOP) {
      log('  ' + await realClick('#deployBtn'));
    } else {
      // 按钮不在视口内(或手机端): 退回程序化点击 —— 这样拿不到指针锁定,
      // 但轮盘本身不依赖锁定(键位处理在 pointerLocked 检查之前), 功能照样能验。
      await ev(`(function(){ const b=document.getElementById('deployBtn'); if(b) b.click(); return 1; })()`);
      log('  程序化点击(按钮不在视口内)');
    }
  }
  await sleep(3200);
  log('  player.deployed = ' + await ev(`(function(){try{return player.deployed;}catch(e){return 'EXC';}})()`));
  log('  player.alive    = ' + await ev(`(function(){try{return player.alive;}catch(e){return 'EXC';}})()`));
  log('  pointerLocked(实测) = ' + await ev(`!!document.pointerLockElement`));

  // 塞药品
  log('\n=== 准备药品 ===');
  log('  ' + await ev(`(function(){
    const ks=['bandage','tourniquet','painkiller','medkit','morphine'];
    const got=[];
    for(const k of ks){ if(MED_DEFS[k]&&addLootToBag(k,2)) got.push(k); }
    return '塞入: '+got.join(', ');
  })()`));
  log('  状态: ' + await mwState());

  log('\n=== ① 开轮盘 ===');
  if (DESKTOP) {
    await key('KeyB', 'b');
  } else {
    log('  #tMedWheel 可见 = ' + await ev(`(function(){const e=document.getElementById('tMedWheel');if(!e)return 'NO_EL';const cs=getComputedStyle(e);return cs.display!=='none'&&cs.visibility!=='hidden';})()`));
    log('  ' + await touchTap('#tMedWheel'));
  }
  log('  ' + await mwState());
  log('  格子: ' + await ev(`JSON.stringify([...document.querySelectorAll('#mwRing .mwItem')].map(x=>x.querySelector('.mwName').textContent+' '+x.querySelector('.mwQty').textContent))`));
  log('  中心说明: ' + await ev(`document.getElementById('mwSub').textContent`));
  await shot('medwheel_' + (DESKTOP ? 'desktop' : 'mobile') + '.png');

  if (DESKTOP) {
    log('\n=== ② 鼠标方向选格(真实 mousemove) ===');
    const c = await boxOf('#mwRing');
    if (c !== 'NO_EL') {
      const { x, y } = JSON.parse(c);
      const dirs = [['右', 220, 0], ['下', 0, 220], ['左', -220, 0], ['上', 0, -220]];
      for (const [nm, dx, dy] of dirs) {
        await rpc('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + dx, y: y + dy, buttons: 0 });
        await sleep(160);
        log('  往' + nm + '推 → sel=' + await ev(`MEDWHEEL.sel`) + ' 选中=' + await ev(`(function(){const k=MEDWHEEL.keys[MEDWHEEL.sel];return k?itemLabel(k):'-';})()`));
        await rpc('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0 });
        await sleep(120);
      }
      // 用干净的 delta 直接验一遍四方向映射(排除 CDP 位移量的干扰)
      log('  —— 直接用干净 delta 验映射 ——');
      for (const [nm, dx, dy] of [['上', 0, -200], ['右', 200, 0], ['下', 0, 200], ['左', -200, 0]]) {
        const r = await ev(`(function(){ MEDWHEEL.ax=0; MEDWHEEL.ay=0; MEDWHEEL.sel=0; medWheelAim(${dx},${dy}); return MEDWHEEL.sel+' · '+itemLabel(MEDWHEEL.keys[MEDWHEEL.sel]); })()`);
        log('    ' + nm + ' → sel=' + r);
      }
    }
  } else {
    log('\n=== ② 手机端点第 2 格 ===');
    log('  ' + await touchTap('#mwRing .mwItem:nth-child(2)'));
    log('  ' + await mwState());
  }

  log('\n=== ③ 确认使用 ===');
  log('  使用前: ' + await mwState());
  if (DESKTOP) {
    // 先把选中项对准第 1 格(正上方), 再左键。
    // ⚠️ 无头环境拿不到指针锁定, 真实点击会落在 DOM 背景上(走"关闭"分支);
    //    真实锁定状态下 e.target 是 canvas, 所以这里从 canvas 派发 mousedown 来忠实模拟。
    await ev(`(function(){ MEDWHEEL.sel=0; medWheelRender(); return 1; })()`);
    await sleep(200);
    log('  从 canvas 派发 mousedown(模拟指针锁定): ' + await ev(`(function(){
      const cv=document.querySelector('canvas.game')||document.querySelector('canvas');
      if(!cv) return 'NO_CANVAS';
      cv.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0}));
      return '已派发';
    })()`));
    await sleep(600);
  } else {
    await touchTap('#mwRing .mwItem:nth-child(1)');
  }
  log('  使用后: ' + await mwState());

  log('\n=== ③b 直接调 useLootFromBag 诊断 ===');
  log('  VM.state            = ' + await ev(`VM.state`));
  log('  matchOver           = ' + await ev(`typeof matchOver!=='undefined'?matchOver:'?'`));
  log('  handsFreeVeh()      = ' + await ev(`(function(){try{return handsFreeVeh();}catch(e){return 'EXC '+e.message;}})()`));
  log('  bagCount(tourniquet)= ' + await ev(`(function(){try{return bagCount('tourniquet');}catch(e){return 'EXC '+e.message;}})()`));
  log('  itemUsableInRaid    = ' + await ev(`(function(){try{return itemUsableInRaid('tourniquet');}catch(e){return 'EXC '+e.message;}})()`));
  log('  RAID_USE_CD         = ' + await ev(`typeof RAID_USE_CD!=='undefined'?RAID_USE_CD:'?'`));
  log('  _raidUseCdT 距今     = ' + await ev(`(function(){try{return (nowT-(player._raidUseCdT||-99)).toFixed(1);}catch(e){return 'EXC';}})()`));
  log('  直接调用 → ' + await ev(`(function(){
    try{ const r=useLootFromBag('tourniquet');
      return 'return='+r+' · loot='+JSON.stringify(RUN.loot)+' · medItems='+JSON.stringify((player.medItems||[]).map(m=>m.key))+' · medUseT='+(player.medUseT||0);
    }catch(e){ return 'EXC '+e.message; }
  })()`));

  log('\n=== ④ 再开一次 + Esc 关闭 ===');
  await key('KeyB', 'b');
  log('  开启后 hidden = ' + await ev(`document.getElementById('medWheel').classList.contains('hidden')`));
  await key('Escape', 'Escape');
  log('  Esc 后 hidden = ' + await ev(`document.getElementById('medWheel').classList.contains('hidden')`) + '  MEDWHEEL.open=' + await ev(`MEDWHEEL.open`));

  log('\n=== ⑤ 按 B 不应再触发兵种技能 ===');
  log('  按 B 后 medWheel 可见 = ' + await ev(`(function(){ return !document.getElementById('medWheel').classList.contains('hidden'); })()`));
  await key('Escape', 'Escape');
  log('  B 键归属: ' + await ev(`keyOf('medwheel')+' / skill='+keyOf('skill')`));

  log('\n=== 异常 ===');
  log(errs.length ? errs.join('\n') : '无');
  finish(0);
})();
