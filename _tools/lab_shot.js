// 截屏验证: 部署界面的地图卡片(街区/秘密实验室) + 实验室局内第一人称画面
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9400, URL = 'http://127.0.0.1:8123/index.html';
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const __out = [];
const flush = () => { try { fs.writeFileSync(path.join(__dirname, 'lab_shot.txt'), __out.join('\n') + '\n', 'utf8'); } catch (e) { } };
console.log = (...a) => { __out.push(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')); flush(); };
process.on('exit', flush);
(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'labshot_' + Date.now());
  const proc = spawn(ch, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,760', '--disable-gpu', '--no-first-run', '--no-default-browser-check', URL], { stdio: 'ignore' });
  await sleep(3500);
  let list = null;
  for (let i = 0; i < 30; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list && list.length) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page'); if (!page) { console.log('NO_PAGE'); proc.kill(); process.exit(1); }
  const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); if (j.method === 'Runtime.exceptionThrown') errs.push('EXC ' + ((j.params.exceptionDetails.exception || {}).description || '').split('\n')[0]); });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa })); });
  await rpc('Page.enable', {}); await rpc('Runtime.enable', {});
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || ''); return o.result && o.result.result ? o.result.result.value : JSON.stringify(o); };
  const shot = async n => { const o = await rpc('Page.captureScreenshot', {}); try { fs.writeFileSync(path.join(__dirname, n), Buffer.from(o.result.data, 'base64')); console.log('saved ' + n); } catch (e) { console.log('shot fail ' + n + ' ' + e.message); } };

  await sleep(9000);
  // 1) 街区 的部署界面
  await ev(`(function(){ try{ initMenuUI(); }catch(e){} try{ el('menu').classList.remove('hidden'); }catch(e){} return 1; })()`);
  await sleep(1200);
  console.log('cards(block)=' + await ev(`document.querySelectorAll('#mapRow .mapCard').length`));
  await shot('smoke-map-cards-block.png');

  // 2) 秘密实验室 的部署界面
  await ev(`localStorage.setItem('sf_campaign','1');localStorage.removeItem('sf_autodeploy');location.reload()`);
  await sleep(11000);
  await ev(`(function(){ try{ el('menu').classList.remove('hidden'); }catch(e){} return 1; })()`);
  await sleep(1200);
  console.log('cards(lab)=' + await ev(`document.querySelectorAll('#mapRow .mapCard').length`));
  await shot('smoke-map-cards-lab.png');

  // 3) 实验室局内
  await ev(`(function(){ beginRaid(); return 1; })()`);
  await sleep(2000);
  await ev(`(function(){ selectedSpawn=-1; deployPlayer(); return 1; })()`);
  await sleep(6000);
  await shot('smoke-lab-ingame.png');
  await sleep(6000);
  await shot('smoke-lab-ingame2.png');
  console.log('errors:' + errs.length); errs.slice(0, 6).forEach(e => console.log('  ' + e));
  ws.close(); try { proc.kill(); } catch (e) { }
  await sleep(300); process.exit(0);
})();
