// VibeHub 联机/排行榜 接入验证
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9791;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) { try { if (ws) ws.close(); } catch (e) { } try { if (proc) proc.kill(); } catch (e) { } fs.writeFileSync(path.join(ROOT, '_tools', '_net_probe.txt'), out.join('\n') + '\n', 'utf8'); process.exit(c); }
(async () => {
  const ud = path.join(require('os').tmpdir(), 'nt_' + Date.now());
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

  log('=== SDK 接入 ===');
  log('  typeof VibeHub      = ' + await ev(`typeof VibeHub`));
  log('  VibeHub.version     = ' + await ev(`(typeof VibeHub!=='undefined'&&VibeHub.version)||'-'`));
  log('  VibeHub.channel     = ' + await ev(`(typeof VibeHub!=='undefined'&&VibeHub.channel)||'-'`));
  log('  VIBE.ready / err    = ' + await ev(`(typeof VIBE!=='undefined')?(VIBE.ready+' / '+(VIBE.err||'无')):'NO_VIBE'`));
  log('  VIBE.client         = ' + await ev(`(typeof VIBE!=='undefined'&&VIBE.client)?('work='+VIBE.client.work):'null'`));
  log('  VIBE.user           = ' + await ev(`(typeof VIBE!=='undefined'&&VIBE.user)?VIBE.user.name:'（游客）'`));
  log('  NET 状态            = ' + await ev(`(typeof NET!=='undefined')?('enabled='+NET.enabled+' room='+(NET.roomId||'-')):'NO_NET'`));

  log('\n=== 存档/排行榜 API 可用性 ===');
  log('  save.get            = ' + await ev(`(function(){try{return typeof VIBE.client.save.get;}catch(e){return 'EXC';}})()`));
  log('  global.get          = ' + await ev(`(function(){try{return typeof VIBE.client.global.get;}catch(e){return 'EXC';}})()`));
  log('  room.join           = ' + await ev(`(function(){try{return typeof VIBE.client.room.join;}catch(e){return 'EXC';}})()`));
  log('  rooms.quickJoin     = ' + await ev(`(function(){try{return typeof VIBE.client.rooms.quickJoin;}catch(e){return 'EXC';}})()`));
  log('  读 global 榜单      = ' + await ev(`(async function(){try{ var r=await VIBE.client.global.get('leaderboard'); return Array.isArray(r)?('数组 '+r.length+' 条'):String(r); }catch(e){ return '读失败: '+e.message; }})()`));

  log('\n=== UI ===');
  log('  联机按钮存在        = ' + await ev(`!!document.querySelector('.navBtn[data-p="mNet"]')`));
  log('  #mNet 面板存在      = ' + await ev(`!!document.getElementById('mNet')`));
  log('  #netBox / #vhBoard  = ' + await ev(`(!!document.getElementById('netBox'))+' / '+(!!document.getElementById('vhBoard'))`));
  log('  #vhUser 文案        = ' + await ev(`(document.getElementById('vhUser')||{}).textContent||'NO_EL'`));
  log('  登录按钮可见        = ' + await ev(`(function(){var e=document.getElementById('vhLogin');return e?getComputedStyle(e).display:'NO_EL';})()`));
  log('  账号栏 HTML         = ' + await ev(`(document.querySelector('.netAcct')||{}).textContent||'NO_EL'`));

  log('\n=== 打开联机面板 ===');
  await ev(`(function(){ const b=document.querySelector('.navBtn[data-p="mNet"]'); if(b) b.click(); return 1; })()`);
  await sleep(800);
  log('  面板可见            = ' + await ev(`(function(){var e=document.getElementById('mNet');return e?!e.classList.contains('hidden'):'NO_EL';})()`));
  log('  netBox 内容         = ' + await ev(`(document.getElementById('netBox')||{}).textContent||'NO_EL'`));
  log('  vhBoard 内容        = ' + await ev(`(document.getElementById('vhBoard')||{}).textContent||'NO_EL'`));
  const guestControls = await ev(`['netCode','netCreate','netJoin'].filter(id=>el(id).getClientRects().length)`);
  log('  游客可见的房间控件  = ' + (Array.isArray(guestControls) ? guestControls.join(', ') || '无' : guestControls));
  if (!Array.isArray(guestControls) || guestControls.length || await ev(`!!VIBE.user`) !== false) return finish(1);

  log('\n=== 未登录时点创建房间（应给出提示而不是崩）===');
  const refused = await ev(`(async()=>!await netCreateRoom() && !NET.room && NET.msg[0].includes('请先登录'))()`);
  log('  游客创建请求被拒绝  = ' + refused);
  if (refused !== true) return finish(1);
  log('  netBox 内容         = ' + await ev(`(document.getElementById('netBox')||{}).textContent||'NO_EL'`));

  log('\n=== 友伤补丁 ===');
  log('  unitBlocks 已打补丁 = ' + await ev(`(typeof unitBlocks==='function')?String(!!unitBlocks._netPatched):'NO_FN'`));
  log('  真人之间不算同单位  = ' + await ev(`(function(){try{ return String(unitBlocks({netRemote:true,team:0},{netRemote:true,team:0})); }catch(e){ return 'EXC '+e.message; }})()`));

  log('\n=== 异常 ===');
  log(errs.length ? errs.join('\n') : '无');
  finish(0);
})();
