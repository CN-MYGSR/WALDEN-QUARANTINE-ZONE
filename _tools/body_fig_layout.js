// 人体图布局体检: 位置/尺寸/与其他 HUD 是否重叠 (无法看图, 只能用几何数据验证)
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9399;
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'bl_' + Date.now());
  const proc = spawn(ch, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,720', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'http://127.0.0.1:8123/index.html'], { stdio: 'ignore' });
  await sleep(3500);
  let list = null;
  for (let i = 0; i < 25; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page'); if (!page) { console.log('NO_PAGE'); proc.kill(); process.exit(1); }
  const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); if (j.method === 'Runtime.exceptionThrown') errs.push('EXC ' + (j.params.exceptionDetails.exception && j.params.exceptionDetails.exception.description || '').split('\n')[0]); });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa })); });
  await rpc('Page.enable', {}); await rpc('Runtime.enable', {});
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + (o.result.exceptionDetails.exception.description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : JSON.stringify(o); };

  await sleep(9000);
  await ev(`startMatch(); el('menu').classList.add('hidden'); showDeploy(false);`);
  await sleep(1200);
  await ev(`(function(){ selectedSpawn=-1; deployPlayer(); })()`);
  await sleep(2500);

  const r = await ev(`(function(){
    const ids=['healthPanel','bodyFig','vitalsCol','stamBarWrap','statBarWrap','minimapWrap','quickHud','ammoPanel','armorHud','lootHud'];
    const o={};
    for(const i of ids){
      const e=document.getElementById(i);
      if(!e){ o[i]='MISSING'; continue; }
      const b=e.getBoundingClientRect();
      o[i]={x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height),vis:getComputedStyle(e).display!=='none'};
    }
    o.__vw=window.innerWidth; o.__vh=window.innerHeight;
    return JSON.stringify(o);
  })()`);
  try {
    const o = JSON.parse(r);
    const VW = o.__vw, VH = o.__vh; delete o.__vw; delete o.__vh;
    console.log(`视口 ${VW}x${VH}`);
    const box = {};
    for (const k in o) {
      const v = o[k];
      if (v === 'MISSING') { console.log(`  ${k.padEnd(13)} 缺失`); continue; }
      console.log(`  ${k.padEnd(13)} x=${String(v.x).padStart(4)} y=${String(v.y).padStart(4)} ${String(v.w).padStart(4)}x${String(v.h).padStart(3)} ${v.vis ? '' : '(隐藏)'}`);
      box[k] = v;
    }
    const hit = (a, b) => a && b && a.vis !== false && b.vis !== false && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const pairs = [['healthPanel', 'minimapWrap'], ['healthPanel', 'ammoPanel'], ['healthPanel', 'quickHud'], ['bodyFig', 'vitalsCol'], ['healthPanel', 'armorHud'], ['healthPanel', 'lootHud']];
    console.log('重叠检查:');
    for (const [a, b] of pairs) console.log(`  ${a} × ${b}: ${hit(box[a], box[b]) ? '⚠ 重叠' : 'OK'}`);
    const hp = box.healthPanel;
    if (hp) console.log(`人体图位置: ${hp.x <= 40 && (hp.y + hp.h) >= VH - 40 ? 'OK 在左下角' : '⚠ 不在左下角'}`);
  } catch (e) { console.log(r); }
  console.log('页面报错数:', errs.length);
  errs.slice(0, 6).forEach(e => console.log('  ', e));
  ws.close(); proc.kill(); await sleep(300); process.exit(0);
})();
