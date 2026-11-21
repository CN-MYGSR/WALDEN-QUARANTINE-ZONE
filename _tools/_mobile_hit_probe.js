// 手机端「按不动」排查: 逐元素命中测试
// 症状: 手机端有按钮点不动。怀疑是 #touchUI(z-index 40) 盖住了 .screen(z-index 20),
//       而 #tLook 是 pointer-events:auto 铺满全屏 → 触摸都被它吃掉, 原生按钮收不到 click。
// 用法: node _tools/_mobile_hit_probe.js [url]
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
// 第 3 个参数 = 每次导航后的等待毫秒 (线上 CDN 冷启动可能很慢, 默认 9s)
const WAIT = parseInt(process.argv[3] || '9000', 10);
const PORT = 9505;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;

function finish(code) {
  try { if (ws) ws.close(); } catch (e) { }
  try { if (proc) proc.kill(); } catch (e) { }
  fs.writeFileSync(path.join(ROOT, '_tools', '_mobile_hit_probe.txt'), out.join('\n') + '\n', 'utf8');
  process.exit(code);
}

(async () => {
  const ud = path.join(require('os').tmpdir(), 'mhit_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=900,420', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
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
  });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable');
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : String(o); };
  const shot = async n => { const o = await rpc('Page.captureScreenshot', { format: 'png' }); if (o.result && o.result.data) fs.writeFileSync(path.join(ROOT, 'outputs', n), Buffer.from(o.result.data, 'base64')); };

  // Chrome 模拟横屏触控设备。
  await rpc('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: 'landscapePrimary', angle: 90 } });
  await rpc('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await rpc('Page.navigate', { url: URL });
  await sleep(WAIT);
  await ev(`localStorage.setItem('sf_campaign','0'); localStorage.removeItem('bf_meta_v1');`);
  await rpc('Page.navigate', { url: URL });
  await sleep(WAIT);

  log('MOBILE = ' + await ev(`MOBILE`) + ' / body.touchui = ' + await ev(`document.body.classList.contains('touchui')`));
  log('');

  // 命中测试工具: 先滚进视口, 再取中心看 elementFromPoint 到底是谁
  const hit = async (sel) => await ev(`(function(){
    const e=document.querySelector('${sel}'); if(!e) return 'NO_EL';
    e.scrollIntoView({block:'center'});
    const r=e.getBoundingClientRect();
    if(r.width<1||r.height<1) return 'ZERO_SIZE';
    const x=Math.round(r.left+r.width/2), y=Math.round(r.top+r.height/2);
    const t=document.elementFromPoint(x,y);
    const chain=[]; let c=t; while(c&&chain.length<4){ chain.push(c.id?('#'+c.id):(c.tagName+(c.className?'.'+String(c.className).split(' ')[0]:''))); c=c.parentElement; }
    const self=(t===e)||(t&&t.closest&&t.closest('${sel}')===e);
    return (self?'可点':'被挡')+' @'+x+','+y+'  顶层='+chain.join(' < ');
  })()`);

  async function checkHits(selectors) {
    for (const s of selectors) {
      const result = await hit(s);
      log('  ' + s.padEnd(36) + ' → ' + result);
      if (!String(result).startsWith('可点')) throw Error('触屏控件无法命中 '+s);
    }
  }
  log('=== A) 主菜单 (mHome) 上的原生按钮 ===');
  await checkHits(['#mHome .navBtn[data-p="mPlay"]', '#mHome .navBtn[data-p="mArmory"]', '#mHome .navBtn[data-p="mSet"]']);
  log('');
  log('=== B) 撤离部署页上的原生按钮 ===');
  await ev(`document.querySelector('#mHome [data-p=mPlay]').click()`);
  await checkHits(['#mPlay .menuFold summary']);
  await ev(`document.querySelector('#mPlay .menuFold summary').click()`);
  await checkHits(['#teamUS', '#teamGER', '#startBtn', '#mPlay .backBtn']);
  log('');
  log('=== C) 游戏设置页上的原生按钮 ===');
  await ev(`document.querySelector('#fieldNav [data-route=mSet]').click()`);
  await checkHits(['#mSet .qualBtn[data-q="0"]', '#tabInput']);
  await ev(`el('tabInput').click()`);
  await checkHits(['#sensRange', '#tLayoutBtn', '#tabKeys']);
  await ev(`el('tabKeys').click()`);
  await checkHits(['#keyResetBtn', '#mSet .backBtn']);
  log('');
  log('=== D) 模拟触摸: 点主菜单「开始突袭」是否切页 ===');
  await ev(`document.querySelector('#mSet .backBtn').click()`);
  await sleep(400);
  const nav = JSON.parse(await ev(`(function(){const e=document.querySelector('#mHome .navBtn[data-p="mPlay"]');const r=e.getBoundingClientRect();return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)});})()`));
  await rpc('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: nav.x, y: nav.y, id: 1 }] });
  await sleep(90);
  await rpc('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(700);
  if (await ev(`el('mPlay').classList.contains('hidden')`) !== false) throw Error('触摸开始突袭后未切换到地图页');
  log('  触摸 ' + JSON.stringify(nav) + ' → 已切换到地图页');
  log('');
  log('=== E) 触控层与菜单的层级 ===');
  log('  #touchUI z-index : ' + await ev(`getComputedStyle(el('touchUI')).zIndex`));
  log('  #tLook  pointer-events : ' + await ev(`getComputedStyle(el('tLook')).pointerEvents`));
  log('  .screen z-index : ' + await ev(`getComputedStyle(document.querySelector('.screen')).zIndex`));
  log('  菜单打开时 #touchUI display : ' + await ev(`getComputedStyle(el('touchUI')).display`) + '   (非 none 就是盖住了)');
  log('');
  log('=== F) 触控按钮逐个命中测试 ===');
  await ev(`(function(){try{el('menu').classList.add('hidden');startMatch();showDeploy(false);selectedSpawn=-1;deployPlayer();
    if(typeof addOwned==='function'){ addOwned('m4',1); } return 'OK';}catch(e){return 'EXC '+e.message;}})()`);
  await sleep(2500);
  const ids = await ev("[...el('touchUI').querySelectorAll('.tbtn')].map(b=>b.id)");
  const blocked = [];
  const hidden = [];
  for (const i of ids) {
    const r = await ev(`(function(){
      const e=document.getElementById('${i}'); if(!e) return 'NO_EL';
      if(!e.offsetWidth) return 'HIDDEN';
      const r=e.getBoundingClientRect();
      const x=Math.round(r.left+r.width/2), y=Math.round(r.top+r.height/2);
      const t=document.elementFromPoint(x,y);
      const self=(t===e)||(t&&t.closest&&t.closest('.tbtn')===e);
      return (self?'可点':'被挡')+' @'+x+','+y+' 顶层='+(t?(t.id?'#'+t.id:t.tagName):'null');
    })()`);
    if (String(r).indexOf('被挡') >= 0 || String(r).indexOf('NO_EL') >= 0) blocked.push(i + ' → ' + r);
    if (String(r) === 'HIDDEN') hidden.push(i);
    log('  ' + i.padEnd(11) + ' → ' + r);
  }
  log('  · 被挡/缺失: ' + (blocked.length ? blocked.join(' | ') : '无 ✓'));
  log('  · 当前状态不显示: ' + (hidden.length ? hidden.join(' ') : '无'));

  log('');
  log('=== G) Chrome 模拟逐个点按 (排除 tMenu, 每按一次后关掉面板) ===');
  const tapIds = ids.filter(x => x !== 'tMenu' && hidden.indexOf(x) < 0);
  const errBefore = errs.length;
  for (const i of tapIds) {
    const pos = await ev(`(function(){const e=document.getElementById('${i}');
      if(!e||!e.offsetWidth) return '';const r=e.getBoundingClientRect();
      return Math.round(r.left+r.width/2)+','+Math.round(r.top+r.height/2);})()`);
    if (!pos) { log('  ' + i.padEnd(11) + ' 跳过(已隐藏)'); continue; }
    const [x, y] = String(pos).split(',').map(Number);
    await rpc('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await sleep(70);
    await rpc('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(160);
    // 关掉可能被打开的面板, 免得挡住后面的按钮
    await ev(`(function(){try{
      if(typeof BAG_UI!=='undefined'&&BAG_UI.open&&typeof toggleBagPanel==='function') toggleBagPanel();
      if(typeof bigMapVisible==='function'&&bigMapVisible()&&typeof toggleBigMap==='function') toggleBigMap(false);
      const sb=document.getElementById('scoreboard'); if(sb) sb.style.display='none';
      if(typeof LOOT_UI!=='undefined'&&LOOT_UI.open&&typeof lootPanelClose==='function') lootPanelClose();
    }catch(e){} return 1;})()`);
    await sleep(90);
  }
  log('  点按 ' + tapIds.length + ' 个按钮, 新增异常: ' + (errs.length - errBefore));
  if (errs.length - errBefore) log('  ' + errs.slice(errBefore, errBefore + 6).join('\n  '));
  await shot('touch_all_buttons.png');

  log('');
  log('=== H) 布局编辑仍能显示触控层 (body.layoutEdit 必须压过 body.uiOpen) ===');
  await ev(`(function(){el('deploy').classList.add('hidden');el('menu').classList.remove('hidden');el('mHome').classList.add('hidden');el('mSet').classList.remove('hidden');return 'OK';})()`);
  await sleep(500);
  log('  设置页打开 : uiOpen=' + await ev(`document.body.classList.contains('uiOpen')`) + ' · #touchUI display=' + await ev(`getComputedStyle(el('touchUI')).display`) + '  (应 none)');
  log('  enterLayoutEdit : ' + await ev(`(function(){try{enterLayoutEdit();return 'OK';}catch(e){return 'EXC '+e.message;}})()`));
  await sleep(400);
  log('  编辑中     : uiOpen=' + await ev(`document.body.classList.contains('uiOpen')`) + ' · layoutEdit=' + await ev(`document.body.classList.contains('layoutEdit')`) + ' · #touchUI display=' + await ev(`getComputedStyle(el('touchUI')).display`) + '  (应 block)');
  log('  可见按钮数 : ' + await ev(`[...el('touchUI').querySelectorAll('.tbtn')].filter(b=>b.offsetWidth).length`));
  log('  拖一个按钮 : ' + await ev(`(function(){try{const b=el('tBag');b.style.left='40%';b.style.top='50%';return b.style.left+','+b.style.top;}catch(e){return 'EXC '+e.message;}})()`));
  log('  exitLayoutEdit : ' + await ev(`(function(){try{exitLayoutEdit();return 'OK';}catch(e){return 'EXC '+e.message;}})()`));
  await sleep(400);
  log('  退出后     : #touchUI display=' + await ev(`getComputedStyle(el('touchUI')).display`) + '  (应 none, 因为设置页还开着)');

  log('');
  log('=== G) 异常 ===');
  log(errs.length ? errs.slice(0, 8).join('\n') : '无');
  finish(blocked.length || errs.length ? 1 : 0);
})().catch(e => { log('FATAL ' + e.message); finish(1); });
