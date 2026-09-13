// 诊断"改了改装件但没有模型":
//  1) buildGunModel 在不同改装下是否真的多出几何体
//  2) 改件后如果不重新 vmEquip, 手上的枪是否还是旧模型
//  3) 军械库/工坊在局内是否可打开(决定 bug 的触发场景)
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9396;
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'mvp_' + Date.now());
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

  console.log('=== 1. buildGunModel 在不同改装下的几何体数量 ===');
  for (const key of ['m4', 'mp40', 'kar98']) {
    const r = await ev(`(function(){
      const out={key:'${key}'};
      function cnt(mods){
        PLAYER_MODS['${key}'] = Object.assign({}, mods);
        const p = buildGunModel('${key}');
        let n=0; p.gun.traverse(o=>{ if(o.isMesh) n++; });
        return n;
      }
      out.iron   = cnt({optic:'optic_iron', muzzle:'muzzle_standard', mag:'mag_standard'});
      out.supp   = cnt({optic:'optic_iron', muzzle:'muzzle_supp',   mag:'mag_standard'});
      out.comp   = cnt({optic:'optic_iron', muzzle:'muzzle_comp',   mag:'mag_standard'});
      out.extmag = cnt({optic:'optic_iron', muzzle:'muzzle_standard', mag:'mag_ext'});
      const avail = (MOD_AVAIL['${key}']||{}).optic||[];
      out.reflex = avail.includes('optic_reflex') ? cnt({optic:'optic_reflex', muzzle:'muzzle_standard', mag:'mag_standard'}) : 'N/A';
      out.x2     = avail.includes('optic_2x')     ? cnt({optic:'optic_2x',     muzzle:'muzzle_standard', mag:'mag_standard'}) : 'N/A';
      PLAYER_MODS['${key}'] = {optic:'optic_iron',muzzle:'muzzle_standard',mag:'mag_standard'};
      return JSON.stringify(out);
    })()`);
    let o; try { o = JSON.parse(r); } catch (e) { console.log('  ' + key + ' ERR ' + String(r).slice(0, 70)); continue; }
    console.log(`  ${key.padEnd(7)} 机瞄${String(o.iron).padStart(4)} | 消音${String(o.supp).padStart(4)} | 制退${String(o.comp).padStart(4)} | 扩容弹匣${String(o.extmag).padStart(4)} | 反射${String(o.reflex).padStart(5)} | 2x${String(o.x2).padStart(5)}`);
  }

  console.log('');
  console.log('=== 2. 改件后不重新 vmEquip, 手上的枪是否变化 ===');
  await ev(`startMatch(); el('menu').classList.add('hidden'); showDeploy(false);`);
  await sleep(2500);
  await ev(`(function(){ selectedSpawn=-1; deployPlayer(); })()`);
  await sleep(3500);
  const r2 = await ev(`(function(){
    const out={};
    PLAYER_MODS['m4']={optic:'optic_iron',muzzle:'muzzle_standard',mag:'mag_standard'};
    vmEquip('m4', player.team);
    let n=0; VM.gunParts.gun.traverse(o=>{ if(o.isMesh) n++; });
    out.before=n;
    // 模拟工坊改件: chargeModChoice 只 setModChoice + renderArmory, 不会重建视图模型
    setModChoice('m4','muzzle','muzzle_supp');
    setModChoice('m4','optic','optic_reflex');
    let n2=0; VM.gunParts.gun.traverse(o=>{ if(o.isMesh) n2++; });
    out.afterNoRebuild=n2;
    // 手动重新装备
    vmEquip('m4', player.team);
    let n3=0; VM.gunParts.gun.traverse(o=>{ if(o.isMesh) n3++; });
    out.afterRebuild=n3;
    out.curW=player.curW; out.vmKey=VM.key;
    return JSON.stringify(out);
  })()`);
  console.log('  ' + r2);

  console.log('');
  console.log('=== 3. 军械库/工坊在局内是否可达 ===');
  const r3 = await ev(`(function(){
    const out={};
    out.hasMenuBtn = !!document.getElementById('mArmory');
    out.hasArmoryFn = typeof renderArmory==='function';
    out.hasWorkbenchTab = typeof renderWorkbenchRows==='function';
    out.deployed = !!(player&&player.deployed);
    out.alive = !!(player&&player.alive);
    // 局内打开菜单看看军械库在不在
    const menu=document.getElementById('menu');
    out.menuHiddenBefore = menu?menu.classList.contains('hidden'):null;
    return JSON.stringify(out);
  })()`);
  console.log('  ' + r3);

  ws.close(); proc.kill(); await sleep(300); process.exit(0);
})();
