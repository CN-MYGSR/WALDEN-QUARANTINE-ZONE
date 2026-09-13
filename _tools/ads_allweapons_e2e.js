// 全武器 ADS 视模型端到端断言:
//  1) 不抛异常
//  2) 非光学武器确实被推远, 光学武器推远量为 0
//  3) 光学武器仍走 scopeOv(隐藏 VM.inner), 非光学武器保持实体视模型可见
//  4) 机瞄准星仍投影在屏幕中心(±3px)
// 同时覆盖"机瞄"与"已装光学改装件"两种配置。
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9392;
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'awe_' + Date.now());
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

  await sleep(9000);
  await ev(`startMatch(); el('menu').classList.add('hidden'); showDeploy(false);`);
  await sleep(2500);
  await ev(`(function(){ selectedSpawn=-1; deployPlayer(); })()`);
  await sleep(3500);

  await ev(`
  window.__one = function(key, opticId){
    const out = { key:key, optic:opticId };
    try{
      PLAYER_MODS[key] = Object.assign({}, PLAYER_MODS[key]||{}, { optic: opticId });
      vmEquip(key, player.team);
      player.ads=true; player.carry='high'; player.braced=false; player.prone=false;
      for(let i=0;i<400;i++){ player.ads=true; updateViewModel(0.016, player); }
      const d = WPN_DEFS[key]||{};
      out.scoped = !!d.scoped;
      out.mortar = !!d.mortar;
      out.anchorZ = +VM.ads.pos.z.toFixed(4);
      out.rootZ = +VM.root.position.z.toFixed(4);
      out.push = +(out.anchorZ - out.rootZ).toFixed(4);
      out.inner = VM.inner.visible;
      out.scope = document.getElementById('scopeOv').style.display;
      out.blend = +VM.adsBlend.toFixed(3);
      // 机瞄对齐(仅非光学/非迫击炮)
      if(!out.scoped && !out.mortar){
        const sa = VM.gunParts && VM.gunParts.sightAnchor;
        if(sa){
          vmCamera.updateMatrixWorld(true); VM.inner.updateWorldMatrix(true,false);
          const w = new THREE.Vector3(0, sa.y, 0).applyMatrix4(VM.inner.matrixWorld);
          const p = w.project(vmCamera);
          out.dy = +((-p.y*0.5+0.5)*innerHeight - innerHeight/2).toFixed(1);
        }
      }
    }catch(e){ out.err = e.message; }
    return JSON.stringify(out);
  };
  window.__keys = Object.keys(WPN_DEFS);
  window.__opticsFor = function(k){ const a=(MOD_AVAIL[k]||{}).optic||['optic_iron']; return a.slice(); };
  'ok'`);
  const keys = await ev(`JSON.stringify(__keys)`);
  let KEYS; try { KEYS = JSON.parse(keys); } catch (e) { console.log('无法读取武器列表: ' + keys); ws.close(); proc.kill(); process.exit(1); }

  const fails = [];
  let n = 0, scopedN = 0, opticCases = 0;
  const rows = [];
  for (const k of KEYS) {
    const optics = JSON.parse(await ev(`JSON.stringify(__opticsFor('${k}'))`));
    for (const op of optics) {
      const r = await ev(`__one('${k}','${op}')`);
      let o; try { o = JSON.parse(r); } catch (e) { fails.push(`${k}/${op}: 返回值无法解析 ${String(r).slice(0, 60)}`); continue; }
      n++;
      const tag = op === 'optic_iron' ? '' : ' [' + op.replace('optic_', '') + ']';
      if (o.err) { fails.push(`${k}${tag}: 抛异常 ${o.err}`); continue; }
      if (o.scoped) {
        scopedN++;
        if (o.push !== 0) fails.push(`${k}${tag}: 光学镜推远量应为 0, 实际 ${o.push}`);
        if (o.inner !== false) fails.push(`${k}${tag}: 光学镜应隐藏 VM.inner`);
        if (o.scope !== 'block') fails.push(`${k}${tag}: 光学镜应显示 scopeOv, 实际 ${o.scope}`);
      } else {
        if (op !== 'optic_iron') opticCases++;
        if (o.push <= 0.001) fails.push(`${k}${tag}: 非光学武器未被推远 (push=${o.push})`);
        if (o.push > 0.30) fails.push(`${k}${tag}: 推远量过大 ${o.push} (>0.30)`);
        if (o.inner !== true) fails.push(`${k}${tag}: 非光学武器应保留实体视模型`);
        if (o.scope !== 'none') fails.push(`${k}${tag}: 非光学武器不应显示 scopeOv, 实际 ${o.scope}`);
        if (o.dy !== undefined && Math.abs(o.dy) > 3) fails.push(`${k}${tag}: 机瞄准星偏移 ${o.dy}px (>3px)`);
      }
      rows.push(o);
    }
  }

  // 汇总
  console.log('全武器 ADS 视模型 E2E —— 用例 ' + n + ' 个(武器 ' + KEYS.length + ' 把, 其中光学镜 ' + scopedN + ' 个用例, 改装光学 ' + opticCases + ' 个用例)');
  console.log('');
  const show = rows.filter(r => !r.scoped);
  console.log('非光学武器: 推远量 / 屏幕中心准星偏差');
  let line = '';
  show.forEach((r, i) => {
    line += (r.key + (r.optic !== 'optic_iron' ? '·' + r.optic.replace('optic_', '') : '')).padEnd(16) +
      ('推' + r.push.toFixed(2)).padEnd(8) + (r.dy === undefined ? '  (迫击炮)' : ' dy ' + r.dy + 'px');
    if (i % 2 === 1) { console.log('  ' + line); line = ''; }
  });
  if (line) console.log('  ' + line);

  console.log('');
  if (fails.length === 0) {
    console.log('✅ 全部 ' + n + ' 个用例通过 (0 失败)');
  } else {
    console.log('❌ 失败 ' + fails.length + ' 项:');
    fails.forEach(f => console.log('   - ' + f));
  }

  ws.close(); proc.kill(); await sleep(300); process.exit(fails.length ? 1 : 0);
})();
