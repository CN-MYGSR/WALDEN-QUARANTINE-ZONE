// 发布前验收: 把 dist/ 当成线上站点跑一遍, 确认构建产物能正常启动。
// 关键点: index.html 现在把启动权交给了 js/50_workshop_boot.js (type="module"),
// 32_boot.js 只挂 window._wfBoot —— 所以必须实测"游戏真的起来了", 而不是只看脚本 200。
// 用法: node _tools/_dist_boot_check.js [url] [png]
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8124/index.html';
const PNG = process.argv[3] || '_dist_boot.png';
// 第 4 个参数 = 导航后的等待毫秒 (线上 CDN 冷启动可能很慢, 默认 10s)
const WAIT = parseInt(process.argv[4] || '10000', 10);
const PORT = 9487;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;

function finish(code) {
  try { if (ws) ws.close(); } catch (e) { }
  try { if (proc) proc.kill(); } catch (e) { }
  fs.writeFileSync(path.join(ROOT, '_tools', '_dist_boot_check.txt'), out.join('\n') + '\n', 'utf8');
  process.exit(code);
}

(async () => {
  const ud = path.join(require('os').tmpdir(), 'distchk_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,760', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  await sleep(2500);
  let list = null;
  for (let i = 0; i < 40; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list && list.length) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page');
  if (!page) { log('NO_PAGE'); return finish(1); }
  ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {}; const errs = []; const failed = [];
  ws.on('message', m => {
    const j = JSON.parse(m);
    if (j.id && pend[j.id]) pend[j.id](j);
    if (j.method === 'Runtime.exceptionThrown') errs.push('EXC ' + ((j.params.exceptionDetails.exception || {}).description || '').split('\n')[0]);
    if (j.method === 'Log.entryAdded' && j.params.entry.level === 'error') errs.push('LOG ' + String(j.params.entry.text).slice(0, 200));
    if (j.method === 'Network.loadingFailed') failed.push('FAILED ' + j.params.requestId + ' ' + (j.params.errorText || '') + ' type=' + (j.params.type || ''));
    if (j.method === 'Network.responseReceived') { const r = j.params.response; if (r.status >= 400) failed.push('HTTP ' + r.status + ' ' + r.url); }
  });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable'); await rpc('Log.enable'); await rpc('Network.enable');
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : String(o); };

  log('URL: ' + URL);
  await rpc('Page.navigate', { url: URL });
  await sleep(WAIT);

  log('');
  log('=== 启动链路 ===');
  log('_wfBoot 已挂载        : ' + await ev(`typeof window._wfBoot`));
  log('VibeHubGame (modApi)  : ' + await ev(`typeof window.VibeHubGame`));
  log('VibeHubWorkshop       : ' + await ev(`typeof window.VibeHubWorkshop`));
  log('THREE 已加载          : ' + await ev(`typeof THREE`));
  log('CANNON 已加载         : ' + await ev(`typeof CANNON`));

  log('');
  log('=== 游戏是否真的起来了 ===');
  log('主菜单可见            : ' + await ev(`(function(){const m=el('menu');return m?(!m.classList.contains('hidden')):'NO_EL';})()`));
  log('soldiers/combatants   : ' + await ev(`(typeof soldiers!=='undefined')+' / '+(typeof combatants!=='undefined')`));
  log('player 对象           : ' + await ev(`typeof player`));
  log('渲染循环帧数(>0 即跑起来): ' + await ev(`(typeof nowT!=='undefined'?nowT.toFixed(1):'NO_nowT')`));

  log('');
  log('=== 开局冒烟: 启动一局并部署 ===');
  log('startMatch+deploy     : ' + await ev(`(function(){try{el('menu').classList.add('hidden');startMatch();showDeploy(false);selectedSpawn=-1;deployPlayer();return 'OK';}catch(e){return 'EXC '+e.message;}})()`));
  await sleep(2500);
  log('玩家存活/血量         : ' + await ev(`player.alive+' / '+Math.round(player.hp)+'/'+player.maxHp`));
  log('玩家主武器            : ' + await ev(`player.curW?((WPN_DEFS[player.curW.key]||{}).name+' ('+player.curW.key+')'):'none'`));
  log('阵营                  : ' + await ev(`TEAM_FACTION.map(f=>f.short).join(' vs ')`));
  log('NPC 数量              : ' + await ev(`soldiers.length`));
  log('跑 3s 后帧计数(应增长) : ' + await ev(`nowT.toFixed(1)`));

  const o = await rpc('Page.captureScreenshot', { format: 'png' });
  if (o.result && o.result.data) fs.writeFileSync(path.join(ROOT, 'outputs', PNG), Buffer.from(o.result.data, 'base64'));

  log('');
  log('=== 控制台异常 ===');
  log(errs.length ? errs.slice(0, 12).join('\n') : '无');
  log('');
  log('=== 网络失败/4xx5xx ===');
  log(failed.length ? failed.slice(0, 12).join('\n') : '无');
  finish(0);
})().catch(e => { log('FATAL ' + e.message); finish(1); });
