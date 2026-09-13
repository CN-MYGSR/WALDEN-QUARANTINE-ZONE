// 验证 lootHud 新位置(右上)在各分辨率下不与 nvgInd / 队友列表 / 弹药面板重叠
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9375;
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rectsOverlap = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const sizes = [[1920, 1080], [1600, 900], [1366, 768], [1280, 720]];
  for (const [w, h] of sizes) {
    const ud = path.join(require('os').tmpdir(), 'rs_' + Date.now() + w);
    const proc = spawn(ch, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=' + w + ',' + h, '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'http://127.0.0.1:8123/index.html'], { stdio: 'ignore' });
    await sleep(3500);
    let list = null;
    for (let i = 0; i < 25; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list) break; } catch (e) { await sleep(500); } }
    const page = (list || []).find(t => t.type === 'page'); if (!page) { console.log(w + 'x' + h + ': NO_PAGE'); proc.kill(); continue; }
    const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false });
    let id = 0; const pend = {};
    ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); });
    await new Promise(r => ws.on('open', r));
    const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa })); });
    await rpc('Page.enable', {}); await rpc('Runtime.enable', {});
    const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (o.result && o.result.exceptionDetails) return 'EXC'; return o.result && o.result.result ? o.result.result.value : null; };
    await sleep(9000);
    await ev(`startMatch(); el('menu').classList.add('hidden'); showDeploy(false);`);
    await sleep(2500);
    await ev(`(function(){ selectedSpawn=-1; deployPlayer(); })()`);
    await sleep(3000);
    await ev(`(function(){ const ks=['medkit','water','noodles']; for(const k of ks) addLootToBag(k,2); renderRaidHUD&&renderRaidHUD(); })()`);
    await sleep(800);

    const r = await ev(`(function(){
      const g=id=>{const e=document.getElementById(id); if(!e) return null; const st=getComputedStyle(e); if(st.display==='none'||st.visibility==='hidden'||+st.opacity===0) return null; const b=e.getBoundingClientRect(); return {id:id,left:b.left,right:b.right,top:b.top,bottom:b.bottom,w:Math.round(b.width),h:Math.round(b.height)}; };
      const out={};
      for(const id of ['lootHud','nvgInd','armorHud','healthPanel','ammoPanel','minimapWrap','topBar','carryInd']) out[id]=g(id);
      return JSON.stringify(out);
    })()`);
    let obj = {}; try { obj = JSON.parse(r); } catch (e) { console.log(w + 'x' + h + ': parse-fail ' + r); ws.close(); proc.kill(); continue; }

    const lh = obj.lootHud;
    console.log('\n--- ' + w + 'x' + h + ' ---');
    console.log('lootHud:', lh ? `left=${Math.round(lh.left)} top=${Math.round(lh.top)} w=${lh.w} h=${lh.h}` : 'HIDDEN');
    if (!lh) { ws.close(); proc.kill(); await sleep(300); continue; }
    // 检查与右上/左下区域元素是否重叠
    for (const key of ['nvgInd', 'armorHud', 'ammoPanel', 'healthPanel', 'carryInd', 'topBar', 'minimapWrap']) {
      const el2 = obj[key];
      if (!el2) continue;
      const ov = rectsOverlap(lh, el2);
      if (ov) console.log('  ⚠ 与 ' + key + ' 重叠: ' + el2.id + `(${Math.round(el2.left)},${Math.round(el2.top)} w${el2.w} h${el2.h})`);
    }
    // 检查是否越界/被裁切
    const vw = await ev(`innerWidth`), vh = await ev(`innerHeight`);
    if (lh.right > vw + 0.5) console.log('  ⚠ 右侧越界 right=' + lh.right + ' vw=' + vw);
    if (lh.top < 0) console.log('  ⚠ 顶部越界');
    console.log('  viewport=' + vw + 'x' + vh + ' → ' + (lh.right <= vw + 0.5 && lh.top >= 0 ? '位置正常' : '需调整'));

    ws.close(); proc.kill(); await sleep(400);
  }
  process.exit(0);
})();
