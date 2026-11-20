// 设置扩展验收: 键位自定义 + 手机端按钮布局
// 覆盖: 键位表渲染 · UI 改键(真实按键派发) · 端到端生效 · 移动键规范码翻译 · 占位交换 ·
//       持久化 · 恢复默认 · 布局编辑模式 · 拖拽保存 · 控制台异常
// 用法: node _tools/_settings_probe.js [url]
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9503;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;

function finish(code) {
  try { if (ws) ws.close(); } catch (e) { }
  try { if (proc) proc.kill(); } catch (e) { }
  fs.writeFileSync(path.join(ROOT, '_tools', '_settings_probe.txt'), out.join('\n') + '\n', 'utf8');
  process.exit(code);
}

(async () => {
  const ud = path.join(require('os').tmpdir(), 'settings_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,900', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  await sleep(2500);
  let list = null;
  for (let i = 0; i < 40; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list && list.length) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page');
  if (!page) { log('NO_PAGE'); return finish(1); }
  ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => {
    const j = JSON.parse(m);
    if (j.id && pend[j.id]) pend[j.id](j);
    if (j.method === 'Runtime.exceptionThrown') errs.push('EXC ' + ((j.params.exceptionDetails.exception || {}).description || '').split('\n')[0]);
    if (j.method === 'Log.entryAdded' && j.params.entry.level === 'error') errs.push('LOG ' + String(j.params.entry.text).slice(0, 200));
  });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable'); await rpc('Log.enable');
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : String(o); };
  const key = async (type, code, k, vk) => rpc('Input.dispatchKeyEvent', { type, code, key: k, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  const tapKey = async (code, k, vk) => { await key('keyDown', code, k, vk); await sleep(120); await key('keyUp', code, k, vk); await sleep(150); };

  await rpc('Page.navigate', { url: URL });
  await sleep(6000);
  await ev(`localStorage.removeItem('bf_keys_v1'); localStorage.removeItem('bf_tbtn_v1'); localStorage.setItem('sf_campaign','0'); localStorage.removeItem('bf_meta_v1');`);
  await rpc('Page.navigate', { url: URL });
  await sleep(8000);

  log('=== 1) 键位表渲染 ===');
  log('加载 51_settings : ' + await ev(`typeof keyOf + ' / ' + typeof setKey + ' / ' + typeof canonKey`));
  log('KEY_ACTIONS 条数 : ' + await ev(`typeof KEY_ACTIONS!=='undefined'?KEY_ACTIONS.length:'(const 不可见)'`));
  log('#keyGrid 行数    : ' + await ev(`el('keyGrid')?el('keyGrid').children.length:'NO_EL'`));
  log('前 6 行          : ' + await ev(`el('keyGrid')?[...el('keyGrid').children].slice(0,6).map(r=>r.children[0].textContent+'='+r.children[1].textContent).join(' , '):'-'`));

  log('');
  log('=== 2) 通过界面改键 (计分板 P → I) ===');
  log('点「计分板」右侧按钮 : ' + await ev(`(function(){const rows=[...el('keyGrid').children];const r=rows.find(x=>x.children[0].textContent==='计分板');if(!r)return 'NO_ROW';r.children[1].click();return r.children[1].textContent;})()`));
  log('  → 应显示「按新键…」 : ' + await ev(`(function(){const rows=[...el('keyGrid').children];const r=rows.find(x=>x.children[0].textContent==='计分板');return r.children[1].textContent;})()`));
  await tapKey('KeyI', 'i', 73);
  log('派发 KeyI 后 keyOf(score): ' + await ev(`keyOf('score')`));
  log('  → 按钮文案           : ' + await ev(`(function(){const rows=[...el('keyGrid').children];const r=rows.find(x=>x.children[0].textContent==='计分板');return r.children[1].textContent;})()`));
  log('localStorage 已写入    : ' + await ev(`(JSON.parse(localStorage.getItem('bf_keys_v1')||'{}').score)||'(无)'`));

  log('');
  log('=== 3) 端到端: 按新键应真的触发 (计分板不依赖 pointerLock) ===');
  log('先关掉计分板 : ' + await ev(`(function(){el('scoreboard').style.display='none';return el('scoreboard').style.display;})()`));
  // 计分板是「按住显示 / 松开隐藏」(keyup 里会设回 none), 所以必须在 keyUp 之前读
  await key('keyDown', 'KeyI', 'i', 73); await sleep(200);
  log('按住 I 时 display     : ' + await ev(`el('scoreboard').style.display`) + '  (应 block)');
  await key('keyUp', 'KeyI', 'i', 73); await sleep(200);
  log('松开 I 后 display     : ' + await ev(`el('scoreboard').style.display`) + '  (应 none)');
  await key('keyDown', 'KeyP', 'p', 80); await sleep(200);
  log('按住旧键 P 时 display : ' + await ev(`el('scoreboard').style.display`) + '  (应 none, 老键已解绑)');
  await key('keyUp', 'KeyP', 'p', 80); await sleep(150);

  log('');
  log('=== 4) 移动键规范码翻译 (前进 W → I) ===');
  log('setKey(forward,KeyI) : ' + await ev(`(function(){setKey('forward','KeyI');return keyOf('forward');})()`));
  log('canonKey(KeyI) 应 KeyW : ' + await ev(`canonKey('KeyI')`));
  log('canonKey(KeyW) 应 null : ' + await ev(`String(canonKey('KeyW'))`));
  await key('keyDown', 'KeyI', 'i', 73); await sleep(150);
  log('按 I 后 keys.KeyW       : ' + await ev(`keys.KeyW`) + '  (应 true)');
  await key('keyUp', 'KeyI', 'i', 73); await sleep(150);
  log('松开 I 后 keys.KeyW     : ' + await ev(`keys.KeyW`) + '  (应 false)');
  await key('keyDown', 'KeyW', 'w', 87); await sleep(150);
  log('按旧键 W 后 keys.KeyW   : ' + await ev(`keys.KeyW`) + '  (应 false, 老键作废)');
  await key('keyUp', 'KeyW', 'w', 87); await sleep(150);

  log('');
  log('=== 5) 占位交换 (把「后退」也绑到 I → 前进应被挤到 S) ===');
  log('setKey(back,KeyI) : ' + await ev(`(function(){setKey('back','KeyI');return 'forward='+keyOf('forward')+' back='+keyOf('back');})()`));

  log('');
  log('=== 6) 持久化 ===');
  await rpc('Page.navigate', { url: URL });
  await sleep(7000);
  log('重载后 keyOf(score/forward/back): ' + await ev(`keyOf('score')+' / '+keyOf('forward')+' / '+keyOf('back')`));

  log('');
  log('=== 7) 恢复默认 ===');
  log('resetKeys() : ' + await ev(`(function(){resetKeys();return keyOf('score')+' / '+keyOf('forward')+' / '+keyOf('back');})()`));
  log('按钮文案已同步: ' + await ev(`(function(){renderKeyGrid();const rows=[...el('keyGrid').children];const r=rows.find(x=>x.children[0].textContent==='计分板');return r.children[1].textContent;})()`));

  log('');
  log('=== 8) 手机端按钮布局编辑 ===');
  log('enterLayoutEdit() : ' + await ev(`(function(){try{enterLayoutEdit();return 'OK';}catch(e){return 'EXC '+e.message;}})()`));
  await sleep(400);
  log('body.layoutEdit   : ' + await ev(`document.body.classList.contains('layoutEdit')`));
  log('LAYOUT_EDIT 标志  : ' + await ev(`!!window.LAYOUT_EDIT`));
  log('#layoutBar 存在   : ' + await ev(`!!el('layoutBar')`));
  log('可见按钮数(应 17) : ' + await ev(`[...el('touchUI').querySelectorAll('.tbtn')].filter(b=>!b.classList.contains('hiddenT')).length`));
  log('#touchUI display  : ' + await ev(`getComputedStyle(el('touchUI')).display`));
  log('摇杆区 display    : ' + await ev(`getComputedStyle(el('tStickZone')).display`) + '  (编辑时应 none)');
  const pos = JSON.parse(await ev(`(function(){const b=el('tBag');const r=b.getBoundingClientRect();return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)});})()`));
  log('tBag 中心(拖前)   : ' + JSON.stringify(pos));
  await rpc('Input.dispatchMouseEvent', { type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', clickCount: 1 });
  await sleep(120);
  await rpc('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x - 140, y: pos.y - 90, button: 'left' });
  await sleep(120);
  await rpc('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pos.x - 140, y: pos.y - 90, button: 'left', clickCount: 1 });
  await sleep(300);
  log('拖后 tBag 位置     : ' + await ev(`el('tBag').style.left+' , '+el('tBag').style.top`));
  log('localStorage 布局  : ' + await ev(`localStorage.getItem('bf_tbtn_v1')`));
  log('exitLayoutEdit()   : ' + await ev(`(function(){try{exitLayoutEdit();return 'OK';}catch(e){return 'EXC '+e.message;}})()`));
  await sleep(300);
  log('退出后 layoutEdit  : ' + await ev(`document.body.classList.contains('layoutEdit')`));

  log('');
  log('=== 9) 布局持久化 ===');
  await rpc('Page.navigate', { url: URL });
  await sleep(7000);
  log('重载后 tBag 内联位置: ' + await ev(`el('tBag').style.left+' , '+el('tBag').style.top`));
  log('恢复默认布局       : ' + await ev(`(function(){localStorage.removeItem('bf_tbtn_v1');applyTouchLayout();return el('tBag').style.left||'(空=用 CSS 默认)';})()`));

  log('');
  log('=== 10) 控制台异常 ===');
  log(errs.length ? errs.slice(0, 12).join('\n') : '无');
  finish(0);
})().catch(e => { log('FATAL ' + e.message); finish(1); });
