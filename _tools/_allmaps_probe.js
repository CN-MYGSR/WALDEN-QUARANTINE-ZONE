// 四张地图回归检查: 逐图构建 + 开局冒烟, 确认新增机场没有影响既有地图
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9711;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) { try { if (ws) ws.close(); } catch (e) { } try { if (proc) proc.kill(); } catch (e) { } fs.writeFileSync(path.join(ROOT, '_tools', '_allmaps_probe.txt'), out.join('\n') + '\n', 'utf8'); process.exit(c); }
(async () => {
  const ud = path.join(require('os').tmpdir(), 'am_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,760', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  await sleep(2500);
  let list = null;
  for (let i = 0; i < 40; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list && list.length) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page');
  if (!page) { log('NO_PAGE'); return finish(1); }
  ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {}; let errs = [];
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); if (j.method === 'Runtime.exceptionThrown') { const s = ((j.params.exceptionDetails.exception || {}).description || '').split('\n')[0]; if (errs.indexOf(s) < 0) errs.push(s); } });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable');
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : String(o); };

  await rpc('Page.navigate', { url: URL });
  await sleep(14000);

  const NAMES = ['街区', '秘密实验室', '港口', '瓦尔登机场'];
  for (let idx = 0; idx < 4; idx++) {
    errs = [];
    await ev(`(function(){ localStorage.setItem('sf_campaign','${idx}'); localStorage.setItem('sf_autodeploy','0'); return 1; })()`);
    await rpc('Page.navigate', { url: URL });
    await sleep(17000);
    log('===== [' + idx + '] ' + NAMES[idx] + ' =====');
    log('  id/layout  = ' + await ev(`CAMPAIGN.id + ' / ' + CAMPAIGN.layout`));
    log('  地图名     = ' + await ev(`CAMPAIGN.mapName`));
    log('  MAP_SIZE   = ' + await ev(`MAP_SIZE`));
    log('  THEME/WEATHER = ' + await ev(`CAMPAIGN.theme + ' / ' + WEATHER`));
    log('  建筑数/类型 = ' + await ev(`(typeof CQ_BUILDINGS!=='undefined')?(CQ_BUILDINGS.length+' '+JSON.stringify([...new Set(CQ_BUILDINGS.map(b=>b.kind))])):'-'`));
    log('  物资箱(高价值) = ' + await ev(`(typeof LOOT_CRATES!=='undefined')?(LOOT_CRATES.length+' ('+LOOT_CRATES.filter(c=>c.rich).length+')'):'-'`));
    log('  撤离点     = ' + await ev(`(typeof EXTRACT_POINTS!=='undefined')?EXTRACT_POINTS.length:'-'`));
    log('  NAV_CLEARS = ' + await ev(`(typeof NAV_CLEARS!=='undefined')?NAV_CLEARS.length:'-'`));
    log('  场景对象   = ' + await ev(`scene.children.length`));
    // 开局
    await ev(`(function(){ const b=[...document.querySelectorAll('.navBtn')].find(x=>x.dataset.p==='mPlay'); if(b) b.click(); return 1; })()`);
    await sleep(1300);
    await ev(`(function(){ const b=document.getElementById('startBtn'); if(b) b.click(); return 1; })()`);
    await sleep(7000);
    await ev(`(function(){ const b=document.getElementById('deployBtn'); if(b) b.click(); return 1; })()`);
    await sleep(3800);
    log('  开局       = ' + await ev(`(function(){try{return 'deployed='+player.deployed+' alive='+player.alive+' @'+Math.round(player.pos.x)+','+Math.round(player.pos.z)+' npc='+soldiers.filter(s=>s.alive).length;}catch(e){return 'EXC '+e.message;}})()`));
    log('  弹药箱数   = ' + await ev(`(typeof AMMO_CRATES!=='undefined')?AMMO_CRATES.length:'-'`));
    log('  弹药箱离基地 = ' + await ev(`(function(){
  try{
    if(typeof AMMO_CRATES==='undefined'||!AMMO_CRATES.length) return 'NO_CRATES';
    var best=1e9;
    for(var i=0;i<AMMO_CRATES.length;i++){
      for(var j=0;j<CAMPAIGN.bases.length;j++){
        var d=Math.hypot(AMMO_CRATES[i].x-CAMPAIGN.bases[j].x, AMMO_CRATES[i].z-CAMPAIGN.bases[j].z);
        if(d<best) best=d;
      }
    }
    return String(Math.round(best))+'m';
  }catch(e){ return 'ERR '+e.message; }
})()`));
    // ⚠️ 主循环存活判据: 检查循环靠后的副作用。
  // 不能只看 nowT —— 它在循环很靠前就赋值, 中途抛错照样递增 (2026-09-19 踩过:
  // 一行 const hemi 被误删导致主循环每帧在第 32 行炸, 而 nowT 一直正常)。
  log('  主循环存活 = ' + await ev(`(function(){try{
    var w=document.getElementById('stamBar');
    return (w&&w.style.width)?('正常 · stamBar='+w.style.width):'❌ 循环可能没跑到 updateHUD';
  }catch(e){ return 'EXC '+e.message; }})()`));
  log('  异常       = ' + (errs.length ? errs.join(' | ') : '无'));
  }
  finish(0);
})();
