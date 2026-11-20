// 验证「自动回血」确实没了: 把玩家血量压低 → 等足够久 → 血量不应上升
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9631;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) { try { if (ws) ws.close(); } catch (e) { } try { if (proc) proc.kill(); } catch (e) { } fs.writeFileSync(path.join(ROOT, '_tools', '_noheal_probe.txt'), out.join('\n') + '\n', 'utf8'); process.exit(c); }
(async () => {
  const ud = path.join(require('os').tmpdir(), 'nh_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1400,900', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
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
  const snap = () => ev(`(function(){
    try{
      const b=player.body, o={nowT:+nowT.toFixed(1), hp:Math.round(player.hp)};
      for(const k in b) o[k]=Math.round(b[k].hp*10)/10;
      o.lastDmgAgo=+(nowT-(player.lastDmgT||0)).toFixed(1);
      // 这两项用来证明 tarkovUpdate 确实在跑（回血块就在同一个函数里）
      o.hydration=+player.hydration.toFixed(2);
      o.satiety=+player.satiety.toFixed(2);
      return JSON.stringify(o);
    }catch(e){ return 'EXC '+e.message; }
  })()`);

  await rpc('Page.navigate', { url: URL });
  await sleep(15000);
  await ev(`(function(){ const b=[...document.querySelectorAll('.navBtn')].find(x=>x.dataset.p==='mPlay'); if(b) b.click(); return 1; })()`);
  await sleep(1200);
  await ev(`(function(){ const b=document.getElementById('startBtn'); if(b) b.click(); return 1; })()`);
  await sleep(6500);
  await ev(`(function(){ const b=document.getElementById('deployBtn'); if(b) b.click(); return 1; })()`);
  await sleep(3500);

  log('开局满血基准: ' + await snap());

  // 压低血量: 胸部 30、四肢 40, 清掉出血, 并把"最后受伤时间"设成当前
  log('\n压低血量: ' + await ev(`(function(){
    try{
      const b=player.body;
      b.thorax.hp=30; b.head.hp=60; b.stomach.hp=50;
      for(const k in b) if(b[k].max>0 && b[k].hp>b[k].max*0.6) b[k].hp=Math.round(b[k].max*0.4);
      player.bleedHeavy=0; player.bleedLight=0;
      if(typeof clearBleed==='function') clearBleed();
      player.lastDmgT=nowT;
      if(typeof tkSyncHp==='function') tkSyncHp(player);
      if(typeof tkSyncLegacy==='function') tkSyncLegacy(player);
      return 'ok';
    }catch(e){ return 'EXC '+e.message; }
  })()`));
  log('压完立刻: ' + await snap());

  // 等 25 秒（远超原来 6s / 12s 的脱战判定）
  for (const t of [8, 16, 25]) {
    await sleep(t === 8 ? 8000 : 8000);
    log('等待后 (' + t + 's): ' + await snap());
  }

  log('\n=== 对照: 绷带仍应能回血 ===');
  log('  绷带数: ' + await ev(`(function(){try{return player.bandages;}catch(e){return 'EXC';}})()`));
  log('  医疗品: ' + await ev(`(function(){try{return JSON.stringify((player.medItems||[]).map(m=>m&&m.k));}catch(e){return 'EXC';}})()`));

  log('\n=== 异常 ===');
  log(errs.length ? errs.join('\n') : '无');
  finish(0);
})();
