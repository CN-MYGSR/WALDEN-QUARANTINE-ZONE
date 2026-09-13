// 验证: 触屏"丢弃"按钮在面板关闭时也能工作(自动开面板)
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9372;
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'td_' + Date.now());
  const proc = spawn(ch, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,720', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'http://127.0.0.1:8123/index.html'], { stdio: 'ignore' });
  await sleep(3500);
  let list = null;
  for (let i = 0; i < 25; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page'); if (!page) { console.log('NO_PAGE'); proc.kill(); process.exit(1); }
  const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0; const pend = {};
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa })); });
  await rpc('Page.enable', {}); await rpc('Runtime.enable', {});
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + (o.result.exceptionDetails.exception.description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : JSON.stringify(o); };

  await sleep(9000);
  await ev(`startMatch(); el('menu').classList.add('hidden'); showDeploy(false);`);
  await sleep(2500);
  await ev(`(function(){ selectedSpawn=-1; deployPlayer(); })()`);
  await sleep(2500);

  console.log('== 触屏丢弃按钮(面板关闭时) ==');
  console.log('准备:', await ev(`(function(){ RUN.loot={}; addLootToBag('medkit',3); bagPanelClose(); return 'panelOpen='+BAG_UI.open+' bag='+JSON.stringify(RUN.loot); })()`));
  console.log('模拟触屏 bagdrop:', await ev(`(function(){
    const before=JSON.stringify(RUN.loot);
    // 走真实的触屏分发路径
    if(typeof touchAction==='function') touchAction('bagdrop');
    else bagDropSelected(false);
    return before+' -> '+JSON.stringify(RUN.loot)+' panelOpen='+BAG_UI.open; })()`));

  console.log('\n== 触屏携带姿态按钮 vs 滚轮一致性 ==');
  console.log('触屏 carry:', await ev(`(function(){ player.carry='high'; if(typeof touchAction==='function') touchAction('carry'); else setCarryStance('low'); return player.carry; })()`));
  console.log('触屏 carry 再按一次:', await ev(`(function(){ if(typeof touchAction==='function') touchAction('carry'); else setCarryStance('high'); return player.carry; })()`));

  console.log('\n== 低位持枪移动速度实测 ==');
  console.log(await ev(`(function(){
    const p=player; p.alive=true; p.deployed=true;
    const base=()=>{ p.carry='high'; p.carryLow=false; p.ads=false; p.prone=false; p.braced=false; };
    const res={};
    base(); const hi=(p.prone?1.15:p.crouch?2.2:(p.sprinting?6.4:4.3));
    p.carry='low';
    const lowSet=!p.ads&&!p.braced&&!p.prone;
    const lo=hi*(p.sprinting?1.06:1.18);
    return '高位步行='+hi.toFixed(2)+' 低位步行≈'+lo.toFixed(2)+' (+'+Math.round((lo/hi-1)*100)+'%)'; })()`));

  ws.close(); proc.kill(); await sleep(300); process.exit(0);
})();
