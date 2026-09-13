// 失败补偿端到端验证: 走真实阵亡路径, 检查钱包增量与结算面板文案
const http = require('http');
const fs = require('fs');
const path = require('path');
const WS = require('ws');
const { spawn } = require('child_process');

const URL_GAME = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9344;
function findChrome() {
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe'])
    { try { if (fs.existsSync(c)) return c; } catch (e) {} }
  return null;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const chrome = findChrome();
  if (!chrome) { console.log('NO_CHROME'); process.exit(1); }
  const udir = path.join(require('os').tmpdir(), 'failcomp_' + Date.now());
  const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + udir, '--window-size=1280,720', '--disable-gpu',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', URL_GAME], { stdio: 'ignore' });
  await sleep(3500);

  let list = null;
  for (let i = 0; i < 25; i++) {
    try {
      list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => {
        let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
      }).on('error', rej));
      if (list) break;
    } catch (e) { await sleep(500); }
  }
  const page = (list || []).find(t => t.type === 'page');
  if (!page) { console.log('NO_PAGE'); proc.kill(); process.exit(1); }

  const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0; const pend = {};
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa })); });
  await rpc('Page.enable', {}); await rpc('Runtime.enable', {});
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return o.result && o.result.result ? o.result.result.value : JSON.stringify(o); };

  await sleep(9000);
  await ev(`startMatch(); el('menu').classList.add('hidden'); showDeploy(false);`);
  await sleep(2500);
  console.log('deploy:', await ev(`(function(){ try{ selectedSpawn=-1; deployPlayer();
    return 'ok deployed='+player.deployed+' curW='+(player.curW&&player.curW.key)+' hp='+player.hp; }
    catch(e){ return 'ERR:'+e.message; } })()`));
  await sleep(3000);

  const before = await ev(`META.wallet`);
  console.log('钱包(战前):', before);

  // 走真实阵亡路径: 用 damage 杀死玩家, 触发 onPlayerRaidDeath
  console.log('击杀玩家 ->', await ev(`(function(){ try{
    player.damage(9999,null,true,'head');
    return 'hp='+player.hp+' alive='+player.alive+' matchOver='+matchOver+" failComp="+(RUN.failComp||0); }
    catch(e){ return 'ERR:'+e.message; } })()`));

  // 等待结算(内置 2600ms 延迟)
  await sleep(4200);
  const after = await ev(`META.wallet`);
  console.log('钱包(战后):', after);
  console.log('净增:', after - before, '(期望 500)');
  console.log('结算面板含补偿:', await ev(`(function(){
    const s=document.getElementById('endStats');
    return s? (/失败补偿/.test(s.innerHTML)?'YES':'NO') + ' | ' + (s.innerHTML.match(/失败补偿[^<]*<b>[^<]*<\\/b>[^<]*/)||[''])[0].replace(/<[^>]+>/g,'') : 'no el'; })()`));
  console.log('结算标题:', await ev(`document.getElementById('endTitle')?document.getElementById('endTitle').textContent:'-'`));
  console.log('保底补给(autoKit):', await ev(`JSON.stringify(RUN.autoKit)`));
  console.log('hasWeapon:', await ev(`ownedWeaponList().length`));
  const sh=await rpc('Page.captureScreenshot',{format:'png'});
  if(sh&&sh.result&&sh.result.data){ fs.writeFileSync('failcomp_panel.png',Buffer.from(sh.result.data,'base64')); console.log('shot: failcomp_panel.png'); }

  ws.close(); proc.kill(); await sleep(300); process.exit(0);
})();
