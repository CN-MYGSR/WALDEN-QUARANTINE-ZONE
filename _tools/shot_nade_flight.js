// 手雷弹道实拍: 满蓄力投出 → 飞行中 → 落地爆炸
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9450, URL = 'http://127.0.0.1:8123/index.html';
const ROOT = path.resolve(__dirname, '..');
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'nfl_' + Date.now());
  const proc = spawn(ch, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud,
    '--window-size=1280,760', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  await sleep(2500);
  let list = null;
  for (let i = 0; i < 40; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list && list.length) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page'); if (!page) { console.log('NO_PAGE'); proc.kill(); process.exit(1); }
  const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); if (j.method === 'Runtime.exceptionThrown') errs.push('EXC ' + ((j.params.exceptionDetails.exception || {}).description || '').split('\n')[0]); });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable');
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : JSON.stringify(o); };
  const shot = async (name) => {
    const o = await rpc('Page.captureScreenshot', { format: 'png' });
    if (o.result && o.result.data) { fs.writeFileSync(path.join(ROOT, name), Buffer.from(o.result.data, 'base64')); console.log('截图', name); }
  };
  await rpc('Page.navigate', { url: URL });
  await sleep(4000);
  await ev(`localStorage.setItem('sf_campaign','1');`);
  await rpc('Page.navigate', { url: URL });
  await sleep(13000);
  // 实验室: 站中央大厅, 朝 +Z 长廊, 满蓄力投出 (大厅贯通, 弹道不会被墙挡)
  const r1 = await ev(`(function(){try{
    AudioSys.init();
    player.team=0; matchOver=false; player.deployed=false; player.alive=false;
    player.kills=0; player.deaths=0; player.score=0;
    BOTS_PER_TEAM=SIZE_OPTS[0].bots; tickets[0]=SIZE_OPTS[0].tk; tickets[1]=SIZE_OPTS[0].tk;
    startMatch(); el('menu').classList.add('hidden'); showDeploy(false);
    selectedSpawn=-1; deployPlayer(); player.nadeCount=3;
    for(let i=0;i<16;i++){ updatePlayer(0.05); updateViewModel(0.05,player); updateCamera(0.05); }
    player.pos.x=0; player.pos.z=0; player.pos.y=heightAt(0,0);
    player.vel.x=0; player.vel.y=0; player.vel.z=0;
    player.yaw=Math.PI; player.pitch=0.05;   // 朝 -Z (dir=-sin/-cos)
    for(let i=0;i<8;i++){ updatePlayer(0.05); updateViewModel(0.05,player); updateCamera(0.05); }
    InputActions.nadeEquip(); InputActions.nadeChargeStart();
    let a=0; while(a<1.0){ updatePlayer(0.05); updateViewModel(0.05,player); updateCamera(0.05); a+=0.05; }
    InputActions.nadeChargeRelease();
    for(let i=0;i<24;i++){ updatePlayer(0.05); updateViewModel(0.05,player); updateCamera(0.05); }
    // 冻结主循环, 之后由探针手动推进弹道
    window.__raf=window.requestAnimationFrame; window.requestAnimationFrame=function(){ return 0; };
    return 'spawned='+(nades.length>0)+' spd='+(nades.length?nades[nades.length-1].vel.length().toFixed(2):'-');
  }catch(e){ return 'ERR:'+e.message; }})()`);
  console.log(r1);
  await sleep(400);
  // 飞行中: 推进 0.45s 后截一张
  await ev(`(function(){ for(let i=0;i<15;i++) updateNades(0.03); renderer.clear(); renderer.render(scene,camera); return nades.length; })()`);
  await sleep(400);
  await shot('outputs/nade_in_flight.png');
  // 落地附近: 再推进 0.55s
  await ev(`(function(){ for(let i=0;i<18;i++) updateNades(0.03); renderer.clear(); renderer.render(scene,camera); return nades.length; })()`);
  await sleep(400);
  await shot('outputs/nade_near_ground.png');
  console.log('state:', await ev(`JSON.stringify({nades:nades.length, fuse:nades.length?+nades[nades.length-1].fuse.toFixed(2):null})`));
  await ev(`(function(){ window.requestAnimationFrame=window.__raf; return 1; })()`);
  console.log('异常数', errs.length, errs.slice(0, 4).join(' | '));
  ws.close(); proc.kill();
  await sleep(300);
  try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) { }
})();
