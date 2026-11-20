// 手机端验证: 背包面板的「存入安全箱 / 丢弃 / 全部丢弃」按钮能否用真实触摸事件触发。
// ⚠️ MOBILE 是 01_data 里加载时算出的 const → 必须用 CDP 设备仿真, 运行时改不了。
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9641;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) { try { if (ws) ws.close(); } catch (e) { } try { if (proc) proc.kill(); } catch (e) { } fs.writeFileSync(path.join(ROOT, '_tools', '_bagbtn_probe.txt'), out.join('\n') + '\n', 'utf8'); process.exit(c); }
(async () => {
  const ud = path.join(require('os').tmpdir(), 'bb_' + Date.now());
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

  // ---- 设备仿真必须在导航之前 (argv[3]==='desktop' 时跳过, 用来对比桌面端) ----
  const DESKTOP = process.argv[3] === 'desktop';
  if (!DESKTOP) {
    await rpc('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
    await rpc('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  }
  await rpc('Page.navigate', { url: URL });
  await sleep(16000);

  log('模式 : ' + (DESKTOP ? '桌面端' : '手机仿真'));
  log('MOBILE 判定 : ' + await ev(`typeof MOBILE!=='undefined'?MOBILE:'undefined'`));
  log('body.mobile : ' + await ev(`document.body.classList.contains('mobile')`));

  // 开局
  await ev(`(function(){ const b=[...document.querySelectorAll('.navBtn')].find(x=>x.dataset.p==='mPlay'); if(b) b.click(); return 1; })()`);
  await sleep(1200);
  await ev(`(function(){ const b=document.getElementById('startBtn'); if(b) b.click(); return 1; })()`);
  await sleep(6500);
  await ev(`(function(){ const b=document.getElementById('deployBtn'); if(b) b.click(); return 1; })()`);
  await sleep(3500);
  log('开局: ' + await ev(`(function(){try{return player.alive+' hp'+Math.round(player.hp);}catch(e){return 'EXC '+e.message;}})()`));

  // 塞点物资进背包
  log('\n塞入物资: ' + await ev(`(function(){
    try{
      const add=['tourniquet','water','bandage','painkiller'];
      for(const k of add){ if(typeof itemLabel==='function'){ try{ addLootToBag(k,2); }catch(e){} } }
      return JSON.stringify({loot:RUN.loot, keys:bagEntryKeys()});
    }catch(e){ return 'EXC '+e.message; }
  })()`));

  // 打开背包
  await ev(`(function(){ if(!BAG_UI.open) toggleBagPanel(); return 1; })()`);
  await sleep(900);
  log('\n背包面板可见 : ' + await ev(`!document.getElementById('bagPanel').classList.contains('hidden')`));
  log('按钮渲染     : ' + await ev(`(function(){
    const b=document.getElementById('bagPanelBtns'); if(!b) return 'NO_BOX';
    return JSON.stringify([...b.querySelectorAll('.bagAct')].map(x=>x.textContent+'('+Math.round(x.getBoundingClientRect().width)+'x'+Math.round(x.getBoundingClientRect().height)+')'));
  })()`));
  log('提示文案     : ' + await ev(`document.getElementById('bagPanelHint').textContent`));
  await shot('bagbtn_mobile.png');

  // ---- 真实指针点击辅助: 桌面用鼠标事件, 手机用触摸事件 ----
  const tap = async (sel) => {
    const box = await ev(`(function(){ const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return 'NO_EL'; const r=e.getBoundingClientRect(); return JSON.stringify({x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)}); })()`);
    if (box === 'NO_EL') return 'NO_EL';
    const { x, y } = JSON.parse(box);
    // 命中诊断: 该坐标上"能收到事件的最上层元素"是谁
    const hit = await ev(`(function(){ const e=document.elementFromPoint(${x},${y}); if(!e) return 'null';
      return (e.tagName+(e.id?'#'+e.id:'')+(e.className?'.'+String(e.className).replace(/\\s+/g,'.'):'')).slice(0,60); })()`);
    if (DESKTOP) {
      await rpc('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
      await sleep(40);
      await rpc('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
    } else {
      await rpc('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1, radiusX: 12, radiusY: 12, force: 1 }] });
      await sleep(60);
      await rpc('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    await sleep(500);
    return '点击@' + x + ',' + y + '  命中=' + hit;
  };
  const state = () => ev(`JSON.stringify({loot:RUN.loot, secure:RUN.secure, sel:BAG_UI.sel})`);

  // ⓪ 真实指针点行选中(否则按钮永远只作用于第 1 项)
  log('\n=== ⓪ 真实指针: 点第 3 行选中 ===');
  log('  点击前 sel : ' + await ev(`BAG_UI.sel`));
  log('  ' + await tap('#bagPanelList .bagRow:nth-child(3)'));
  log('  点击后 sel : ' + await ev(`BAG_UI.sel`) + '  选中项=' + await ev(`(function(){const k=bagActKey();return k?itemLabel(k):'null';})()`));

  // ① 选中第 2 项(水), 点"存入安全箱"
  log("\n=== ① 真实指针: 存入安全箱 ===");
  await ev(`(function(){ const rows=document.querySelectorAll('#bagPanelList .bagRow'); if(rows[1]) rows[1].click(); return 1; })()`);
  await sleep(400);
  log('  当前状态 : ' + await state());
  log('  ' + await tap('#bagPanelBtns .bagAct[data-bact="secure"]'));
  log('  点击后   : ' + await state());

  // ② 触摸: 丢弃 1 个
  log("\n=== ② 真实指针: 丢弃 1 个 ===");
  log('  当前状态 : ' + await state());
  log('  ' + await tap('#bagPanelBtns .bagAct[data-bact="drop1"]'));
  log('  点击后   : ' + await state());

  // ③ 全部丢弃: 第一下应是"确认", 第二下才真删
  log('\n=== ③ 全部丢弃(两下确认) ===');
  log('  第一下前 : ' + await state());
  log('  ' + await tap('#bagPanelBtns .bagAct[data-bact="dropall"]'));
  log('  第一下后 : ' + await state() + '  按钮文案=' + await ev(`document.querySelector('#bagPanelBtns .bagAct[data-bact="dropall"]').textContent`));
  log('  ' + await tap('#bagPanelBtns .bagAct[data-bact="dropall"]'));
  log('  第二下后 : ' + await state());

  // ④ 关闭按钮
  log('\n=== ④ 关闭 ===');
  log('  ' + await tap('#bagPanelBtns .bagAct[data-bact="close"]'));
  log('  面板可见 : ' + await ev(`!document.getElementById('bagPanel').classList.contains('hidden')`));

  log('\n=== 异常 ===');
  log(errs.length ? errs.join('\n') : '无');
  finish(0);
})();
