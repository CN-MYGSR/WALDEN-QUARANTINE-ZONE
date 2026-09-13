// 视觉验证: 开镜时准星是否落在照门上
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9385;
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'av_' + Date.now());
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
  const shot = async fn => { const s = await rpc('Page.captureScreenshot', { format: 'png' }); if (s && s.result && s.result.data) { fs.writeFileSync(fn, Buffer.from(s.result.data, 'base64')); return fn; } return 'FAIL'; };

  await sleep(9000);
  await ev(`startMatch(); el('menu').classList.add('hidden'); showDeploy(false);`);
  await sleep(2500);
  await ev(`(function(){ selectedSpawn=-1; deployPlayer(); })()`);
  await sleep(3500);

  // 站到开阔地, 面向空处, 便于看清机瞄
  await ev(`(function(){ try{ player.pos.y=heightAt(player.pos.x,player.pos.z); }catch(e){} })()`);
  await sleep(600);

  for (const k of ['m1911', 'mp40', 'm4']) {
    await ev(`(function(){ vmEquip('${k}', player.team); player.ads=true; player.carry='high'; for(let i=0;i<500;i++){ player.ads=true; updateViewModel(0.016,player); } })()`);
    await sleep(900);
    console.log(k + ' 开镜截图:', await shot('ads-' + k + '.png'));
    console.log('   adsBlend=', await ev(`+VM.adsBlend.toFixed(3)`), ' sightAnchor=', await ev(`JSON.stringify(VM.gunParts.sightAnchor)`));
  }

  ws.close(); proc.kill(); await sleep(300); process.exit(0);
})();
