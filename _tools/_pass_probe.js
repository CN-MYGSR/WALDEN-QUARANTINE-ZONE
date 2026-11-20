// 撤离通行证「随身携带」验收
// 覆盖: 部署界面槽位 · META.loadout.pass → RUN.passBrought · passUsable 门控(带没带 / 哪张图) ·
//       成功登船时消耗 · 阵亡不消耗 · 老存档迁移 · 控制台异常
// 用法: node _tools/_pass_probe.js [url]
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9499;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;

function finish(code) {
  try { if (ws) ws.close(); } catch (e) { }
  try { if (proc) proc.kill(); } catch (e) { }
  fs.writeFileSync(path.join(ROOT, '_tools', '_pass_probe.txt'), out.join('\n') + '\n', 'utf8');
  process.exit(code);
}

(async () => {
  const ud = path.join(require('os').tmpdir(), 'pass_' + Date.now());
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
    if (j.method === 'Log.entryAdded' && j.params.entry.level === 'error') errs.push('LOG ' + String(j.params.entry.text).slice(0, 200));
  });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable'); await rpc('Log.enable');
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : String(o); };

  // 一次进入战役 2 (港口)
  await rpc('Page.navigate', { url: URL });
  await sleep(6000);
  await ev(`localStorage.setItem('sf_campaign','2'); localStorage.removeItem('bf_meta_v1');`);
  await rpc('Page.navigate', { url: URL });
  await sleep(7000);

  log('=== 0) 初始状态 ===');
  log('地图            : ' + await ev(`CAMPAIGN.id + ' / PASS_MAP=' + PASS_MAP`));
  log('仓库通行证数量  : ' + await ev(`ownedCount('pass')`));
  log('hasPass/carryingPass/passUsable: ' + await ev(`hasPass()+' / '+carryingPass()+' / '+passUsable()`));
  log('RUN.passBrought : ' + await ev(`RUN.passBrought`));

  log('');
  log('=== 1) 未持有通行证时: 槽位应禁用 ===');
  log('deploy 屏构建   : ' + await ev(`(function(){try{startMatch();el('menu').classList.add('hidden');showDeploy(false);return 'OK';}catch(e){return 'EXC '+e.message;}})()`));
  await sleep(1200);
  log('passSelect 存在 : ' + await ev(`!!el('passSelect')`));
  log('  options       : ' + await ev(`el('passSelect')?[...el('passSelect').options].map(o=>o.textContent).join(' | '):'-'`));
  log('  disabled      : ' + await ev(`el('passSelect')?el('passSelect').disabled:'-'`));
  log('  L.pass        : ' + await ev(`META.loadout.pass`));

  log('');
  log('=== 2) 给 1 张通行证, 重建部署界面 ===');
  log('addOwned(pass)  : ' + await ev(`(function(){try{addOwned('pass',1);buildDeployConsumables();return 'OK';}catch(e){return 'EXC '+e.message;}})()`));
  await sleep(600);
  log('  options       : ' + await ev(`el('passSelect')?[...el('passSelect').options].map(o=>o.textContent).join(' | '):'-'`));
  log('  disabled      : ' + await ev(`el('passSelect')?el('passSelect').disabled:'-'`));
  log('consumSummary   : ' + await ev(`el('consumSummary')?el('consumSummary').innerText.replace(/\\n/g,' / '):'-'`));

  log('');
  log('=== 3) 不携带 → 部署 (港口) ===');
  log('设 L.pass=false + deploy: ' + await ev(`(function(){try{META.loadout.pass=false;saveMeta();selectedSpawn=-1;deployPlayer();return 'OK';}catch(e){return 'EXC '+e.message;}})()`));
  await sleep(900);
  log('RUN.passBrought (应 false): ' + await ev(`RUN.passBrought`));
  log('passUsable (应 false)     : ' + await ev(`passUsable()`));
  log('extractionPassNotice      : ' + await ev(`extractionPassNotice()`));
  log('仓库证数(应仍 1)          : ' + await ev(`ownedCount('pass')`));

  log('');
  log('=== 4) 携带 → 部署 (港口) ===');
  log('设 L.pass=true + deploy : ' + await ev(`(function(){try{META.loadout.pass=true;saveMeta();selectedSpawn=-1;deployPlayer();return 'OK';}catch(e){return 'EXC '+e.message;}})()`));
  await sleep(900);
  log('RUN.passBrought (应 true): ' + await ev(`RUN.passBrought`));
  log('passUsable (应 true)     : ' + await ev(`passUsable()`));
  log('extractionPassNotice     : ' + await ev(`extractionPassNotice()`));

  log('');
  log('=== 5) 携带但换成街区 (非 PASS_MAP) ===');
  await ev(`localStorage.setItem('sf_campaign','0');`);
  await rpc('Page.navigate', { url: URL });
  await sleep(7000);
  log('地图                    : ' + await ev(`CAMPAIGN.id`));
  log('L.pass 是否被存档记住    : ' + await ev(`META.loadout.pass`));
  log('deploy(携带)            : ' + await ev(`(function(){try{startMatch();el('menu').classList.add('hidden');showDeploy(false);selectedSpawn=-1;deployPlayer();return 'OK';}catch(e){return 'EXC '+e.message;}})()`));
  await sleep(900);
  log('RUN.passBrought (应 true): ' + await ev(`RUN.passBrought`));
  log('passUsable (应 false: 非港口): ' + await ev(`passUsable()`));
  log('extractionPassNotice    : ' + await ev(`extractionPassNotice()`));

  log('');
  log('=== 6) 回港口, 携带并成功登船 → 应消耗 1 张 ===');
  await ev(`localStorage.setItem('sf_campaign','2');`);
  await rpc('Page.navigate', { url: URL });
  await sleep(7000);
  log('deploy(携带)            : ' + await ev(`(function(){try{startMatch();el('menu').classList.add('hidden');showDeploy(false);selectedSpawn=-1;deployPlayer();return 'OK';}catch(e){return 'EXC '+e.message;}})()`));
  await sleep(900);
  log('证数 before             : ' + await ev(`ownedCount('pass')`) + ' / passBrought=' + await ev(`RUN.passBrought`));
  log('finishRaid(true)        : ' + await ev(`(function(){try{finishRaid(true);return 'OK';}catch(e){return 'EXC '+e.message;}})()`));
  await sleep(1200);
  log('证数 after (应 0)       : ' + await ev(`ownedCount('pass')`));
  log('RUN.hadPass (应 true)   : ' + await ev(`RUN.hadPass`));

  log('');
  log('=== 7) 阵亡不消耗 (回港口, 携带后走失败结算) ===');
  await rpc('Page.navigate', { url: URL });
  await sleep(7000);
  log('再给 1 张 + deploy      : ' + await ev(`(function(){try{addOwned('pass',1);startMatch();el('menu').classList.add('hidden');showDeploy(false);META.loadout.pass=true;selectedSpawn=-1;deployPlayer();return 'OK';}catch(e){return 'EXC '+e.message;}})()`));
  await sleep(900);
  log('证数 before             : ' + await ev(`ownedCount('pass')`) + ' / passBrought=' + await ev(`RUN.passBrought`));
  log('finishRaid(false)       : ' + await ev(`(function(){try{finishRaid(false);return 'OK';}catch(e){return 'EXC '+e.message;}})()`));
  await sleep(1200);
  log('证数 after (应仍 1)     : ' + await ev(`ownedCount('pass')`));

  log('');
  log('=== 8) 老存档迁移 (loadout 无 pass 字段) ===');
  log(await ev(`(function(){try{
    const raw=JSON.parse(localStorage.getItem('bf_meta_v1')||'{}');
    delete raw.loadout.pass;
    localStorage.setItem('bf_meta_v1',JSON.stringify(raw));
    return '已抹掉 pass 字段';
  }catch(e){return 'EXC '+e.message;}})()`));
  await rpc('Page.navigate', { url: URL });
  await sleep(7000);
  log('迁移后 META.loadout.pass (应 false): ' + await ev(`META.loadout.pass`));
  log('迁移后 RUN.passBrought             : ' + await ev(`RUN.passBrought`));

  log('');
  log('=== 9) 控制台异常 ===');
  log(errs.length ? errs.slice(0, 12).join('\n') : '无');
  finish(0);
})().catch(e => { log('FATAL ' + e.message); finish(1); });
