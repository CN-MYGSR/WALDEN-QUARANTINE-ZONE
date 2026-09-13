const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9394, URL = 'http://127.0.0.1:8123/index.html';
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const __out = [];
const _cl = console.log.bind(console);
const flush = () => { try { fs.writeFileSync(path.join(__dirname, 'maps_smoke_report.txt'), __out.join('\n') + '\n', 'utf8'); } catch (e) { } };
console.log = (...a) => { __out.push(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')); flush(); _cl(...a); };
process.on('exit', flush);

const MAPS = [
  { idx: 0, name: '街区', id: 'bfruins' },
  { idx: 1, name: '秘密实验室', id: 'lab' },
  { idx: 2, name: '港口', id: 'port' }
];

(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'mapsmoke_' + Date.now());
  const proc = spawn(ch, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,720', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', URL], { stdio: 'ignore' });
  await sleep(3500);
  let list = null;
  for (let i = 0; i < 30; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list && list.length) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page'); if (!page) { console.log('NO_PAGE'); proc.kill(); process.exit(1); }
  const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0; const pend = {}; let errs = [];
  ws.on('message', m => {
    const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j);
    if (j.method === 'Runtime.exceptionThrown') errs.push('EXC ' + ((j.params.exceptionDetails.exception || {}).description || j.params.exceptionDetails.text || '').split('\n')[0]);
    if (j.method === 'Runtime.consoleAPICalled' && j.params.type === 'error') errs.push('CONSOLE ' + JSON.stringify(j.params.args.map(a => a.value).slice(0, 3)));
  });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa })); });
  await rpc('Page.enable', {}); await rpc('Runtime.enable', {});
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || o.result.exceptionDetails.text || ''); return o.result && o.result.result ? o.result.result.value : JSON.stringify(o); };

  // 主菜单：验证 3 张卡片
  await sleep(9000);
  console.log('=== Phase 0 · 主菜单地图卡片 ===');
  console.log(await ev(`JSON.stringify({n:CAMPAIGNS.length,cards:document.querySelectorAll('#mapRow .mapCard').length,startBtn:(el('startBtn')||{}).textContent,questTotal:QUEST_DEFS.length,passMap:(typeof PASS_MAP!=='undefined'?PASS_MAP:'undef')})`));
  await rpc('Page.captureScreenshot', {}).then(o => { try { fs.writeFileSync(path.join(__dirname, 'smoke-menu.png'), Buffer.from(o.result.data, 'base64')); console.log('截图 _tools/smoke-menu.png'); } catch (e) { } }).catch(() => { });

  // 通行证门控验证: 给仓库里塞一张通行证, 然后在各图验证 passUsable
  console.log('\n=== 通行证门控验证 ===');
  await ev(`(function(){ META.owned['pass']=1; if(typeof saveMeta==='function') saveMeta(); return 'pass injected'; })()`);
  for (const m of MAPS) {
    console.log(`切到 ${m.name} 验证 passUsable...`);
    await ev(`localStorage.setItem('sf_campaign','${m.idx}');localStorage.setItem('sf_autodeploy','1');`);
    await ev(`location.reload()`);
    await sleep(11000);
    const r = await ev(`JSON.stringify({campaign:CAMPAIGN.id, hasPass:typeof hasPass==='function'?hasPass():'n/a', usable:typeof passUsable==='function'?passUsable():'n/a'})`);
    console.log(r);
  }
  await ev(`(function(){ META.owned['pass']=0; if(typeof saveMeta==='function') saveMeta(); return 'pass removed'; })()`);

  // 依次验证每个地图
  for (const m of MAPS) {
    console.log(`\n=== Phase ${m.idx + 1} · ${m.name} (${m.id}) ===`);
    errs = [];
    await ev(`localStorage.setItem('sf_campaign','${m.idx}');localStorage.setItem('sf_autodeploy','1');`);
    await ev(`location.reload()`);
    await sleep(11000);

    const world = await ev(`JSON.stringify({
      campaign:CAMPAIGN.id, idx:CAMPAIGN_IDX, name:CAMPAIGN.mapName, layout:CAMPAIGN.layout, terr:CAMPAIGN.terr,
      weather:WEATHER, sight:WFX.sight, bots:soldiers.length, enemy:ENEMY_BOT_COUNT,
      crates:LOOT_CRATES.length, richCrates:LOOT_CRATES.filter(c=>c.rich).length,
      spots:(CAMPAIGN.lootSpots||[]).length, boxes:BOXES.length, cyls:CYLS.length, navClears:NAV_CLEARS.length,
      questTotal:QUEST_DEFS.length, passNotice: typeof extractionPassNotice==='function' ? extractionPassNotice() : 'n/a',
      menuHidden: el('menu')?el('menu').classList.contains('hidden'):null,
      deployVisible: el('deploy')?!el('deploy').classList.contains('hidden'):null
    })`);
    console.log(world);

    // 连通性
    const conn = await ev(`JSON.stringify((function(){
      const b0=CAMPAIGN.bases[0], b1=CAMPAIGN.bases[1], ex=CAMPAIGN.extract[0];
      let reach=0, un=[];
      for(const c of LOOT_CRATES){ const p=NAV.findPath(b0.x,b0.z,c.x,c.z); if(p&&p.length) reach++; else un.push('('+c.x.toFixed(0)+','+c.z.toFixed(0)+(c.rich?',rich':'')+')'); }
      const bb=NAV.findPath(b0.x,b0.z,b1.x,b1.z); const be=NAV.findPath(b0.x,b0.z,ex.x,ex.z); const be2=NAV.findPath(b1.x,b1.z,ex.x,ex.z);
      const plen=p=>{ if(!p||!p.length) return 0; let L=0; for(let i=1;i<p.length;i++) L+=Math.hypot(p[i][0]-p[i-1][0],p[i][1]-p[i-1][1]); return Math.round(L); };
      return {crates:LOOT_CRATES.length, reachable:reach, unreachable:un.slice(0,10), baseToBase:plen(bb), baseToExtract:plen(be), base1ToExtract:plen(be2), directBaseDist:Math.round(Math.hypot(b1.x-b0.x,b1.z-b0.z)), passUsable:(typeof passUsable==='function'?passUsable():'n/a')};
    })())`);
    console.log('连通:', conn);

    // 截图
    await ev(`(function(){ try{ if(el('menu')) el('menu').classList.add('hidden'); }catch(e){} selectedSpawn=-1; if(typeof deployPlayer==='function') deployPlayer(); return 'deployed'; })()`);
    await sleep(2500);
    await rpc('Page.captureScreenshot', {}).then(o => { try { fs.writeFileSync(path.join(__dirname, 'smoke-' + m.id + '.png'), Buffer.from(o.result.data, 'base64')); console.log('截图 _tools/smoke-' + m.id + '.png'); } catch (e) { } }).catch(() => { });

    console.log('页面报错数:', errs.length); errs.slice(0, 6).forEach(e => console.log('  ', e));
  }

  ws.close(); try { proc.kill(); } catch (e) { }
  await sleep(300); process.exit(0);
})();
