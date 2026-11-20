// UI 换配色后的观感检查: 主菜单 / 设置页 / 部署界面 / 游戏内各截一张
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9521;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) { try { if (ws) ws.close(); } catch (e) { } try { if (proc) proc.kill(); } catch (e) { } fs.writeFileSync(path.join(ROOT, '_tools', '_ui_retint_probe.txt'), out.join('\n') + '\n', 'utf8'); process.exit(c); }
(async () => {
  const ud = path.join(require('os').tmpdir(), 'ui_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1400,860', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
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

  await rpc('Page.navigate', { url: URL });
  await sleep(14000);
  await ev(`localStorage.setItem('sf_campaign','0'); localStorage.removeItem('bf_meta_v1'); localStorage.setItem('sf_aspect','auto');`);
  await rpc('Page.navigate', { url: URL });
  await sleep(15000);

  log('=== 主菜单 ===');
  log('body 背景 : ' + await ev(`getComputedStyle(document.body).backgroundColor`));
  log('.screen 背景 : ' + await ev(`getComputedStyle(document.querySelector('.screen')).backgroundImage.slice(0,90)`));
  log('标题颜色 : ' + await ev(`getComputedStyle(document.querySelector('.gameLogo')).color`));
  log('导航按钮 : ' + await ev(`(function(){const b=document.querySelector('.navBtn');const s=getComputedStyle(b);return s.color+' / bg '+s.backgroundColor+' / border '+s.borderColor;})()`));
  await shot('ui_retint_menu.png');

  log('');
  log('=== 设置页 ===');
  await ev(`(function(){el('mHome').classList.add('hidden');el('mSet').classList.remove('hidden');return 'OK';})()`);
  await sleep(500);
  log('optBtn : ' + await ev(`(function(){const b=document.querySelector('#mSet .optBtn');const s=getComputedStyle(b);return s.color+' / bg '+s.backgroundColor+' / border '+s.borderColor;})()`));
  log('选中态(.sel) : ' + await ev(`(function(){const b=document.querySelector('#mSet .optBtn.sel');if(!b)return '无';const s=getComputedStyle(b);return s.color+' / bg '+s.backgroundColor+' / border '+s.borderColor;})()`));
  await shot('ui_retint_settings.png');

  log('');
  log('=== 部署界面 ===');
  await ev(`(function(){el('mSet').classList.add('hidden');el('mPlay').classList.remove('hidden');if(typeof refreshLoadoutSelects==='function')refreshLoadoutSelects();return 'OK';})()`);
  await sleep(600);
  log('secLabel : ' + await ev(`(function(){const b=document.querySelector('#mPlay .secLabel');const s=getComputedStyle(b);return s.color+' / border-bottom '+s.borderBottomColor;})()`));
  await shot('ui_retint_deploy.png');

  log('');
  log('=== 游戏内 ===');
  log('开局 : ' + await ev(`(function(){try{el('menu').classList.add('hidden');startMatch();showDeploy(false);selectedSpawn=-1;deployPlayer();return 'OK';}catch(e){return 'EXC '+e.message;}})()`));
  await sleep(2500);
  await shot('ui_retint_ingame.png');

  log('');
  log('=== 异常 ===');
  log(errs.length ? errs.slice(0, 8).join('\n') : '无');
  finish(0);
})().catch(e => { log('FATAL ' + e.message); finish(1); });
