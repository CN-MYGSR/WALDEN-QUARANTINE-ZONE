// 验证"局内改件立即生效": 改件后视图模型 mesh 数应增加、槽位属性应刷新。
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9397;
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'mle_' + Date.now());
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

  const fails = [];
  const setup = await ev(`(function(){
    PLAYER_MODS['m4']={optic:'optic_iron',muzzle:'muzzle_standard',mag:'mag_standard'};
    savePlayerMods();
    META.wallet=999999;
    const md=moddedDef('m4')||WPN_DEFS['m4'];
    player.slots=[{key:'m4',def:md,mag:md.mag,reserve:md.reserve}];
    player.curSlot=0; player.curW=player.slots[0];
    vmEquip('m4', player.team);
    let n=0; VM.gunParts.gun.traverse(o=>{ if(o.isMesh) n++; });
    return JSON.stringify({mesh:n, mag:player.curW.def.mag, dmg:player.curW.def.dmg, spreadAds:player.curW.def.spreadAds, wallet:META.wallet});
  })()`);
  let s0; try { s0 = JSON.parse(setup); } catch (e) { console.log('setup ERR ' + setup); ws.close(); proc.kill(); process.exit(1); }
  console.log('改件前: mesh=' + s0.mesh + ' 弹匣=' + s0.mag + ' 伤害=' + s0.dmg + ' ADS散布=' + s0.spreadAds);

  const CASES = [
    ['muzzle', 'muzzle_supp', '消音器', d => d.dmg],
    ['optic', 'optic_reflex', '反射瞄具', d => d.spreadAds],
    ['mag', 'mag_ext', '扩容弹匣', d => d.mag],
  ];
  for (const [slot, mid, name, pick] of CASES) {
    const r = await ev(`(function(){
      const before={ mesh:(function(){let n=0;VM.gunParts.gun.traverse(o=>{if(o.isMesh)n++;});return n;})(),
                      val:(function(){const d=player.curW.def; return {dmg:d.dmg,spreadAds:d.spreadAds,mag:d.mag};})(),
                      slotMag:player.curW.mag };
      const ok=chargeModChoice('m4','${slot}','${mid}');
      const after={ mesh:(function(){let n=0;VM.gunParts.gun.traverse(o=>{if(o.isMesh)n++;});return n;})(),
                     val:(function(){const d=player.curW.def; return {dmg:d.dmg,spreadAds:d.spreadAds,mag:d.mag};})(),
                     slotMag:player.curW.mag, vmKey:VM.key, choice:getModChoice('m4','${slot}') };
      return JSON.stringify({ok:ok, before:before, after:after});
    })()`);
    let o; try { o = JSON.parse(r); } catch (e) { fails.push(`${name}: 返回值无法解析`); continue; }
    const dMesh = o.after.mesh - o.before.mesh;
    const vB = o.before.val, vA = o.after.val;
    const dVal = (vA.dmg !== vB.dmg) || (vA.spreadAds !== vB.spreadAds) || (vA.mag !== vB.mag);
    console.log(`  ${name.padEnd(6)} mesh ${o.before.mesh}→${o.after.mesh} (${dMesh >= 0 ? '+' : ''}${dMesh}) | 属性变化=${dVal ? '是' : '否'} (dmg ${vB.dmg}→${vA.dmg}, ads ${vB.spreadAds}→${vA.spreadAds}, mag ${vB.mag}→${vA.mag}) | 装填 ${o.before.slotMag}→${o.after.slotMag} | vmKey=${o.after.vmKey}`);
    if (!o.ok) fails.push(`${name}: chargeModChoice 返回 false`);
    if (o.after.choice !== mid) fails.push(`${name}: 改装选择未保存 (${o.after.choice})`);
    if (dMesh <= 0) fails.push(`${name}: 视图模型未重建 (mesh ${o.before.mesh}→${o.after.mesh})`);
    if (!dVal) fails.push(`${name}: 武器属性未刷新`);
    if (o.after.vmKey !== 'm4') fails.push(`${name}: VM.key 变成 ${o.after.vmKey}`);
    if (o.after.slotMag < 1) fails.push(`${name}: 装填量异常 ${o.after.slotMag}`);
    if (o.after.slotMag > vA.mag) fails.push(`${name}: 装填量 ${o.after.slotMag} 超过新弹匣容量 ${vA.mag}`);
  }

  // 回归: 改装后 ADS 仍不报错, 准星仍居中
  const align = await ev(`(function(){
    player.ads=true; player.carry='high';
    for(let i=0;i<400;i++){ player.ads=true; updateViewModel(0.016, player); }
    const sa=VM.gunParts&&VM.gunParts.sightAnchor;
    if(!sa) return JSON.stringify({dy:null});
    vmCamera.updateMatrixWorld(true); VM.inner.updateWorldMatrix(true,false);
    const w=new THREE.Vector3(0,sa.y,0).applyMatrix4(VM.inner.matrixWorld);
    const p=w.project(vmCamera);
    return JSON.stringify({dy:+((-p.y*0.5+0.5)*innerHeight-innerHeight/2).toFixed(1), rootZ:+VM.root.position.z.toFixed(3), inner:VM.inner.visible});
  })()`);
  let a; try { a = JSON.parse(align); } catch (e) { a = {}; }
  console.log('');
  console.log('改装后 ADS 回归: 准星偏差 ' + a.dy + 'px, rootZ ' + a.rootZ + ', VM.inner 可见 ' + a.inner);
  if (a.dy !== null && Math.abs(a.dy) > 3) fails.push(`改装后准星偏移 ${a.dy}px`);

  console.log('');
  if (!fails.length) console.log('✅ 局内改件立即生效 —— 全部断言通过');
  else { console.log('❌ 失败:'); fails.forEach(f => console.log('   - ' + f)); }

  ws.close(); proc.kill(); await sleep(300); process.exit(fails.length ? 1 : 0);
})();
