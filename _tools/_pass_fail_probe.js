// 聚焦: 携带通行证但撤离失败(阵亡) → 不消耗
// 为什么单独一个脚本: 全量探针连续重载 7 次后 headless Chrome 会 ERR_INSUFFICIENT_RESOURCES
// 导致 WebGL 上下文创建失败, 后续页面根本没启动 (scene is not defined)。这里只加载一次。
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9501;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(code) {
  try { if (ws) ws.close(); } catch (e) { }
  try { if (proc) proc.kill(); } catch (e) { }
  fs.writeFileSync(path.join(ROOT, '_tools', '_pass_fail_probe.txt'), out.join('\n') + '\n', 'utf8');
  process.exit(code);
}
(async () => {
  const ud = path.join(require('os').tmpdir(), 'passfail_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,760', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
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

  await rpc('Page.navigate', { url: URL });
  await sleep(6000);
  await ev(`localStorage.setItem('sf_campaign','2'); localStorage.removeItem('bf_meta_v1');`);
  await rpc('Page.navigate', { url: URL });
  await sleep(8000);

  log('地图 / PASS_MAP : ' + await ev(`CAMPAIGN.id + ' / ' + PASS_MAP`));
  log('给 1 张通行证 + 携带部署 : ' + await ev(`(function(){try{
    addOwned('pass',1);
    startMatch(); el('menu').classList.add('hidden'); showDeploy(false);
    META.loadout.pass=true; selectedSpawn=-1; deployPlayer();
    return 'OK';}catch(e){return 'EXC '+e.message;}})()`));
  await sleep(1000);
  log('证数 before          : ' + await ev(`ownedCount('pass')`));
  log('RUN.passBrought      : ' + await ev(`RUN.passBrought`));
  log('passUsable (应 true) : ' + await ev(`passUsable()`));
  log('');
  log('走失败结算 finishRaid(false) : ' + await ev(`(function(){try{finishRaid(false);return 'OK';}catch(e){return 'EXC '+e.message;}})()`));
  await sleep(1500);
  log('证数 after (应仍 1)  : ' + await ev(`ownedCount('pass')`));
  log('RUN.hadPass (应 false): ' + await ev(`RUN.hadPass`));
  log('');
  log('=== 异常 ===');
  log(errs.length ? errs.slice(0, 8).join('\n') : '无');
  finish(0);
})().catch(e => { log('FATAL ' + e.message); finish(1); });
