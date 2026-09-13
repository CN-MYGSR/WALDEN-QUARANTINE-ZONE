// 实验室天花板实拍: 部署后仰视 + 手电照亮, 直观证明顶板是封闭的
// 用法: node _tools/shot_lablook.js
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9440, URL = 'http://127.0.0.1:8123/index.html';
const ROOT = path.resolve(__dirname, '..');
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'lablook_' + Date.now());
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
  await ev(`localStorage.setItem('sf_campaign','1');localStorage.removeItem('sf_mods');`);
  await rpc('Page.navigate', { url: URL });
  await sleep(14000);

  // 装手电 + 部署
  console.log('prep:', await ev(`(function(){try{
    for(const k of Object.keys(MOD_AVAIL)) setModChoice(k,'light','light_flash');
    AudioSys.init();
    player.team=0; matchOver=false; player.deployed=false; player.alive=false;
    player.kills=0; player.deaths=0; player.score=0;
    BOTS_PER_TEAM=SIZE_OPTS[0].bots; tickets[0]=SIZE_OPTS[0].tk; tickets[1]=SIZE_OPTS[0].tk;
    startMatch(); el('menu').classList.add('hidden'); showDeploy(false);
    return 'ok';
  }catch(e){ return 'ERR:'+e.message; }})()`));
  await sleep(2500);
  console.log('deploy:', await ev(`(function(){try{ selectedSpawn=-1; deployPlayer(); return 'deployed='+player.deployed+' curW='+(player.curW&&player.curW.key); }catch(e){ return 'ERR:'+e.message; }})()`));
  await sleep(4000);

  // 把玩家挪到几个位置, 抬头仰视 + 开手电
  const SPOTS = [
    ['hall', 0, 40, 0.95, 0.0],
    ['room', 40, 40, 1.00, 0.6],
    ['corridor', 24.5, 30, 1.05, 0.0],
    ['extract', 0, 74, 0.95, 0.0],
  ];
  for (const [nm, x, z, pitch, yaw] of SPOTS) {
    await ev(`(function(){
      player.pos.x=${x}; player.pos.z=${z};
      player.pos.y=(typeof heightAt==='function')?heightAt(${x},${z}):0;
      player.vel.x=0; player.vel.z=0;
      player.pitch=${pitch}; player.yaw=${yaw};
      player.cameraPitch=${pitch};
      FLASH.want=true; FLASH.hasMod=true;
      return 1;
    })()`);
    await sleep(1400);
    await shot('outputs/lablook_' + nm + '.png');
  }
  const st = await ev(`JSON.stringify({pitch:player.pitch,pos:[+player.pos.x.toFixed(1),+player.pos.z.toFixed(1)],flashOn:FLASH.on,flashI:+FLASH.spot.intensity.toFixed(0)})`);
  console.log('state:', st);
  console.log('异常数', errs.length, errs.slice(0, 4).join(' | '));
  ws.close(); proc.kill();
  await sleep(300);
  try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) { }
})();
