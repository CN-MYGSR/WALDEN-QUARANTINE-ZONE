// 验证: ① L 隐藏枪身已彻底移除 ② 操作说明的按键标签动态正确 ③ 改键后标签跟着刷新
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9691;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) { try { if (ws) ws.close(); } catch (e) { } try { if (proc) proc.kill(); } catch (e) { } fs.writeFileSync(path.join(ROOT, '_tools', '_keyhint_probe.txt'), out.join('\n') + '\n', 'utf8'); process.exit(c); }
(async () => {
  const ud = path.join(require('os').tmpdir(), 'kh_' + Date.now());
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

  await rpc('Page.navigate', { url: URL });
  await sleep(parseInt(process.argv[3] || '16000', 10));
  log('导航目标 : ' + URL);
  log('实际地址 : ' + await ev(`location.href`));
  log('就绪状态 : ' + await ev(`document.readyState`));
  log('脚本数   : ' + await ev(`document.querySelectorAll('script').length`));
  log('全局 keyOf = ' + await ev(`typeof keyOf`));
  if ((await ev(`location.href`)).indexOf('about:blank') === 0) {
    // 导航没生效时重试一次, 并报出页面目标列表
    log('⚠ 导航未生效, 重试');
    await rpc('Page.navigate', { url: URL });
    await sleep(12000);
    log('重试后地址 : ' + await ev(`location.href`));
  }

  log('=== ① L 隐藏枪身是否已彻底移除 ===');
  log('  #hideGunTip 元素        = ' + await ev(`document.getElementById('hideGunTip')?'仍存在':'已移除'`));
  log('  HIDE_GUN_ADS 变量        = ' + await ev(`typeof HIDE_GUN_ADS`));
  log('  setHideGun 函数          = ' + await ev(`typeof setHideGun`));
  log('  kcGunHidden 函数         = ' + await ev(`typeof kcGunHidden`));
  log('  localStorage.sf_hidegun  = ' + await ev(`localStorage.getItem('sf_hidegun')`));

  log('\n=== ② 操作说明的动态按键标签 ===');
  log('  ' + await ev(`JSON.stringify([...document.querySelectorAll('#ctrlHelp [data-k]')].map(b=>b.getAttribute('data-k')+'='+b.textContent))`));
  log('  裸字面量(不可改键, 应为 WASD/左键/右键): ' + await ev(`JSON.stringify([...document.querySelectorAll('#ctrlHelp b:not([data-k])')].map(b=>b.textContent))`));

  log('\n=== ③ keyLabelOf 与关键动作 ===');
  for (const a of ['skill', 'medwheel', 'build', 'heal', 'bag', 'score', 'map', 'sprint', 'jump', 'leanL']) {
    log('  ' + a.padEnd(10) + ' = ' + await ev(`keyOf('${a}')`) + ' → ' + await ev(`keyLabelOf('${a}')`));
  }

  log('\n=== ④ 开局后 L 不应再改变任何状态 ===');
  await ev(`(function(){ const b=[...document.querySelectorAll('.navBtn')].find(x=>x.dataset.p==='mPlay'); if(b) b.click(); return 1; })()`);
  await sleep(1200);
  await ev(`(function(){ const b=document.getElementById('startBtn'); if(b) b.click(); return 1; })()`);
  await sleep(6500);
  await ev(`(function(){ const b=document.getElementById('deployBtn'); if(b) b.click(); return 1; })()`);
  await sleep(3200);
  log('  开局: deployed=' + await ev(`(function(){try{return player.deployed;}catch(e){return 'EXC';}})()`));
  const before = await ev(`JSON.stringify({vis:(typeof VM!=='undefined')?VM.inner.visible:null, ads:player.ads})`);
  await rpc('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyL', key: 'l', windowsVirtualKeyCode: 76 });
  await sleep(80);
  await rpc('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyL', key: 'l', windowsVirtualKeyCode: 76 });
  await sleep(500);
  const after = await ev(`JSON.stringify({vis:(typeof VM!=='undefined')?VM.inner.visible:null, ads:player.ads})`);
  log('  按 L 前: ' + before);
  log('  按 L 后: ' + after);
  log('  ' + (before === after ? '✅ 无变化(L 已失效)' : '❌ 状态变了'));

  log('\n=== ⑤ 改键后标签应自动刷新 ===');
  log('  改前 skill 标签 = ' + await ev(`(function(){const b=document.querySelector('#ctrlHelp [data-k="skill"]');return b?b.textContent:'-';})()`));
  log('  把 skill 改成 KeyI: ' + await ev(`(function(){ setKey('skill','KeyI'); return keyOf('skill'); })()`));
  log('  改后 skill 标签 = ' + await ev(`(function(){const b=document.querySelector('#ctrlHelp [data-k="skill"]');return b?b.textContent:'-';})()`));
  log('  组合标签 1/2 是否正常 = ' + await ev(`(function(){const b=document.querySelector('#ctrlHelp [data-k="slot1"]');return b?b.textContent:'-';})()`));
  log('  恢复默认: ' + await ev(`(function(){ resetKeys(); return keyOf('skill')+' / '+document.querySelector('#ctrlHelp [data-k="skill"]').textContent; })()`));

  log('\n=== 异常 ===');
  log(errs.length ? errs.join('\n') : '无');
  finish(0);
})();
