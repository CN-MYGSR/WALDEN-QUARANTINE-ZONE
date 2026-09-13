// 高低姿态持枪 — 视觉对比截图
// 用法: node _tools/carry_shots.js <url>
const http = require('http');
const fs = require('fs');
const path = require('path');
const WS = require('ws');
const { spawn } = require('child_process');

const URL_GAME = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const OUTDIR = process.cwd();
const PORT = 9333;

function findChrome() {
  const cands = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ];
  for (const c of cands) { try { if (fs.existsSync(c)) return c; } catch (e) {} }
  return null;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const chrome = findChrome();
  if (!chrome) { console.log('NO_CHROME'); process.exit(1); }
  const udir = path.join(require('os').tmpdir(), 'carry_shots_' + Date.now());
  const args = ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + udir,
    '--window-size=1280,720', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', URL_GAME];
  const proc = spawn(chrome, args, { stdio: 'ignore' });
  await sleep(3500);

  let list;
  for (let i = 0; i < 20; i++) {
    try {
      list = await new Promise((res, rej) => {
        http.get('http://127.0.0.1:' + PORT + '/json/list', r => {
          let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
        }).on('error', rej);
      });
      break;
    } catch (e) { await sleep(500); }
  }
  const page = (list || []).find(t => t.type === 'page');
  if (!page) { console.log('NO_PAGE'); proc.kill(); process.exit(1); }

  const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0; const pend = {};
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa })); });
  await rpc('Page.enable', {});
  await rpc('Runtime.enable', {});
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return o.result && o.result.result ? o.result.result.value : null; };
  const snap = async fn => {
    const s = await rpc('Page.captureScreenshot', { format: 'png' });
    const data = s && s.result && s.result.data;
    if (!data) { return fn + ' (FAILED: ' + JSON.stringify(s && s.error || s) + ')'; }
    const fp = path.join(OUTDIR, fn);
    fs.writeFileSync(fp, Buffer.from(data, 'base64'));
    return fn + ' (' + (fs.statSync(fp).size / 1024).toFixed(0) + 'KB)';
  };

  await sleep(9000); // 等游戏加载

  // 走真实部署流程(与 cdp_test.js 一致), 否则停留在主菜单
  await ev(`(function(){
    try{
      startMatch();
      el('menu').classList.add('hidden');
      showDeploy(false);
      return 'deploy-started';
    }catch(e){ return 'DEPLOY_ERR: '+e.message; }
  })()`);
  await sleep(2500);
  console.log('deploy:', await ev(`(function(){
    try{ selectedSpawn=-1; deployPlayer();
      return 'deployed='+player.deployed+' alive='+player.alive; }
    catch(e){ return 'ERR:'+e.message; }
  })()`));
  await sleep(5000);

  // 布置固定机位: 面向街道平视, 只观察视模型姿态
  await ev(`(function(){
    try{
      player.alive=true; player.deployed=true;
      player.ads=false; player.prone=false; player.crouch=false; player.braced=false; player.sprinting=false;
      player.carry='high';
      player.vel.set(0,0,0);
      player.pos.set(38,player.pos.y,38);
      player.yaw=-2.36; player.pitch=-0.04;
      return 'ready';
    }catch(e){ return 'ERR:'+e.message; }
  })()`);
  await sleep(600);

  const shots = [];
  // 1) 高位持枪
  await ev(`player.carry='high'; VM.carryBlend=0;`);
  await sleep(1100);
  shots.push(await snap('carry_high.png'));

  // 2) 低位持枪
  await ev(`player.carry='low';`);
  await sleep(1400);
  shots.push(await snap('carry_low.png'));

  // 3) 低位 + 行走(看摆动)
  await ev(`player.carry='low'; keys.KeyW=true;`);
  await sleep(900);
  shots.push(await snap('carry_low_walk.png'));
  await ev(`keys.KeyW=false;`);

  // 4) 低位 -> 开镜(应自动回高位瞄准)
  await ev(`player.carry='low'; player.ads=true;`);
  await sleep(1200);
  shots.push(await snap('carry_low_to_ads.png'));
  await ev(`player.ads=false;`);

  const blend = await ev(`VM.carryBlend.toFixed(3)`);
  console.log('shots: ' + shots.join(', '));
  console.log('carryBlend(final):', blend);

  ws.close(); proc.kill();
  await sleep(400);
  process.exit(0);
})();
