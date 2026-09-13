// 同一会话内背靠背截"腾空 ADS"在 推远0 / 推远0.20 下的图, 供人工目视确认。
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9395;
const OUT = 'D:/Escape from TakeFu/outputs';
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'airs_' + Date.now());
  const proc = spawn(ch, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1366,768', '--force-device-scale-factor=1', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'http://127.0.0.1:8123/index.html'], { stdio: 'ignore' });
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
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + (o.result.exceptionDetails.exception.description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : null; };
  const shot = async () => { const o = await rpc('Page.captureScreenshot', { format: 'png' }); return o.result && o.result.data; };

  await sleep(9000);
  await ev(`startMatch(); el('menu').classList.add('hidden'); showDeploy(false);`);
  await sleep(2500);
  await ev(`(function(){ selectedSpawn=-1; deployPlayer(); })()`);
  await sleep(4000);

  for (const key of ['mp40', 'm1911']) {
    for (const air of [false, true]) {
      for (const d of [0, 0.20]) {
        await ev(`
        (function(){
          window.adsViewDepth = function(dd){ return dd.scoped ? 0 : ${d}; };
          vmEquip('${key}', player.team);
          player.ads=true; player.carry='high'; player.braced=false; player.prone=false;
          player.onGround=true; player.vel.x=0; player.vel.z=0; player.leanT=0; player.landDip=0;
          VM.recoilP=0; VM.recoilV=0; VM.kickZ=0; VM.kickV=0; player.mouseDX=0; player.mouseDY=0;
          VM.airBlend=0;
          for(let i=0;i<400;i++){ player.ads=true; updateViewModel(0.016, player); }
          if(${air ? 1 : 0}){ VM.airBlend=1; }
          updateViewModel(0, player);
        })()`);
        await sleep(300);
        const png = await shot();
        const nm = `vm-${key}-${air ? 'air' : 'still'}-d${String(d).replace('.', '')}.png`;
        fs.writeFileSync(path.join(OUT, nm), Buffer.from(png, 'base64'));
        console.log('已存 ' + nm);
      }
    }
  }
  console.log('');
  console.log('目录: ' + OUT);
  ws.close(); proc.kill(); await sleep(300); process.exit(0);
})();
