// 商店搜索实机冒烟 (headless Chrome + CDP + 本地 no-cache 服务器)
// 检查: ① 搜索框存在 ② 输入"手雷"只剩手雷行 ③ 清空恢复 ④ 无匹配给出提示 ⑤ 无控制台异常
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9455, URL = 'http://127.0.0.1:8123/index.html';
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = spawn('python', [path.join(ROOT, '_tools', 'serve_nocache.py'), '8123'], { stdio: 'ignore' });
  await sleep(1200);
  const ud = path.join(require('os').tmpdir(), 'shopsearch_' + Date.now());
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,800', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  await sleep(2500);
  let list = null;
  for (let i = 0; i < 40; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list && list.length) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page');
  if (!page) { log('NO_PAGE'); proc.kill(); srv.kill(); fs.writeFileSync('_tools/shop_live.txt', out.join('\n') + '\n', 'utf8'); process.exit(1); }
  const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); if (j.method === 'Runtime.exceptionThrown') errs.push('EXC ' + ((j.params.exceptionDetails.exception || {}).description || '').split('\n')[0]); if (j.method === 'Log.entryAdded' && j.params.entry.level === 'error') errs.push('LOG ' + String(j.params.entry.text).slice(0, 160)); });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable'); await rpc('Log.enable');
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : String(o); };
  const shot = async name => { const o = await rpc('Page.captureScreenshot', { format: 'png' }); if (o.result && o.result.data) fs.writeFileSync(path.join(ROOT, 'outputs', name), Buffer.from(o.result.data, 'base64')); };
  await rpc('Page.navigate', { url: URL });
  await sleep(6000);

  log('=== 打开军械库 → 商店 ===');
  await ev(`(function(){const m=document.getElementById('menu');if(m)m.classList.remove('hidden');const h=document.getElementById('mHome');if(h)h.classList.add('hidden');const a=document.getElementById('mArmory');if(a)a.classList.remove('hidden');renderArmory('store');return 1;})()`);
  await sleep(500);
  log('搜索框存在: ' + await ev(`!!document.getElementById('arSearch')`));
  log('商店初始行数: ' + await ev(`document.querySelectorAll('#arList .arRow').length`));
  const setQ = async q => { await ev(`(function(){const i=document.getElementById('arSearch');i.value=${JSON.stringify(q)};i.dispatchEvent(new Event('input',{bubbles:true}));return 1;})()`); await sleep(200); };
  const visible = () => ev(`Array.from(document.querySelectorAll('#arList .arRow')).filter(r=>r.style.display!=='none').length`);

  log('');
  log('=== 搜索过滤 ===');
  await setQ('手雷');
  log('搜「手雷」可见行: ' + await visible() + ' (期望 0 —— 手雷在市集, 不在商店页签)');
  await setQ('m1911');
  log('搜「m1911」可见行: ' + await visible() + ' (期望 ≥1)');
  await setQ('不存在的物品xyz');
  log('搜「不存在」空提示: ' + await ev(`(document.querySelector('#arList .arEmpty')||{textContent:''}).textContent`));

  log('');
  log('=== 市集页签搜索 (投掷物/药品) ===');
  await ev(`renderArmory('market')`);
  await sleep(400);
  log('市集总行数: ' + await ev(`document.querySelectorAll('#arList .arRow').length`));
  await setQ('手雷');
  log('市集搜「手雷」可见行: ' + await visible() + ' (期望 1)');
  await setQ('闪光');
  log('市集搜「闪光」可见行: ' + await visible() + ' (期望 1)');
  await setQ('止痛');
  log('市集搜「止痛」可见行: ' + await visible() + ' (期望 1)');
  await shot('shop_search.png');
  await setQ('');
  log('清空后恢复: ' + await visible() + ' 行 (期望等于市集总行数)');

  log('');
  log('=== 控制台异常 ===');
  log(errs.length ? errs.slice(0, 12).join('\n') : '无');
  ws.close(); proc.kill(); srv.kill();
  fs.writeFileSync(path.join(ROOT, '_tools', 'shop_live.txt'), out.join('\n') + '\n', 'utf8');
  process.exit(0);
})().catch(e => { log('FATAL ' + e.message); fs.writeFileSync(path.join(ROOT, '_tools', 'shop_live.txt'), out.join('\n') + '\n', 'utf8'); process.exit(1); });
