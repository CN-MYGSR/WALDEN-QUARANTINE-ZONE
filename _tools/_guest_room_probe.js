// 单浏览器: 测试游客身份能否建房/进房（决定能否做双浏览器 P2P 验证）
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9801;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) { try { if (ws) ws.close(); } catch (e) { } try { if (proc) proc.kill(); } catch (e) { } fs.writeFileSync(path.join(ROOT, '_tools', '_guest_room_probe.txt'), out.join('\n') + '\n', 'utf8'); process.exit(c); }
(async () => {
  const ud = path.join(require('os').tmpdir(), 'gr_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,760', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  await sleep(2500);
  let list = null;
  for (let i = 0; i < 40; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list && list.length) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page');
  if (!page) { log('NO_PAGE'); return finish(1); }
  ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); if (j.method === 'Runtime.exceptionThrown') { const s = ((j.params.exceptionDetails.exception || {}).description || '').split('\n')[0]; if (errs.indexOf(s) < 0) errs.push(s); } });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable');
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : String(o); };

  await rpc('Page.navigate', { url: URL });
  await sleep(16000);
  log('=== 游客态 ===');
  log('  VIBE.ready / user = ' + await ev(`VIBE.ready+' / '+(VIBE.user?'已登录':'游客')`));

  log('\n=== 游客直接调 room.join（绕过我的登录门槛）===');
  log('  ' + await ev(`(async function(){
    try{
      const r=await VIBE.client.room.join('GUEST1',{topology:'host'});
      window.__r=r;
      return '成功 · isHost='+r.isHost+' peerId='+String(r.peerId).slice(0,10);
    }catch(e){ return '失败: '+((e&&e.message)||e); }
  })()`));

  log('\n=== 若成功: announce + 列表 ===');
  log('  announce = ' + await ev(`(async function(){
    try{ if(!window.__r) return '无房间'; await window.__r.announce({open:true,listed:true,max:4,mode:'coop',slug:WORK_SLUG}); return 'ok'; }
    catch(e){ return '失败: '+((e&&e.message)||e); }
  })()`));
  await sleep(1500);
  log('  rooms.list = ' + await ev(`(async function(){
    try{ const l=await VIBE.client.rooms.list(); return '共 '+l.length+' 个 · '+JSON.stringify(l.slice(0,3)); }
    catch(e){ return '失败: '+((e&&e.message)||e); }
  })()`));
  log('  rooms.get  = ' + await ev(`(async function(){
    try{ const m=await VIBE.client.rooms.get('GUEST1'); return m?JSON.stringify(m):'null'; }
    catch(e){ return '失败: '+((e&&e.message)||e); }
  })()`));

  log('\n=== 游客能否读写数据层 ===');
  log('  save.set   = ' + await ev(`(async function(){ try{ await VIBE.client.save.set('t_probe',{a:1}); return 'ok'; }catch(e){ return '失败: '+((e&&e.message)||e); } })()`));
  log('  save.get   = ' + await ev(`(async function(){ try{ return JSON.stringify(await VIBE.client.save.get('t_probe')); }catch(e){ return '失败: '+((e&&e.message)||e); } })()`));
  log('  global.set = ' + await ev(`(async function(){ try{ await VIBE.client.global.set('t_probe',{a:1}); return 'ok（游客也能写 global）'; }catch(e){ return '失败: '+((e&&e.message)||e); } })()`));
  log('  global.get = ' + await ev(`(async function(){ try{ return JSON.stringify(await VIBE.client.global.get('t_probe')); }catch(e){ return '失败: '+((e&&e.message)||e); } })()`));

  log('\n=== 异常 ===');
  log(errs.length ? errs.join('\n') : '无');
  finish(0);
})();
