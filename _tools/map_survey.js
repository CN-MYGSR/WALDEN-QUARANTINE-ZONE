// 地图普查: 对指定战役截取俯视图 + 街景, 输出结构指标
// 用法: node _tools/map_survey.js <campaignIdx> <tag>
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9411, URL = 'http://127.0.0.1:8123/index.html';
const IDX = parseInt(process.argv[2] || '0', 10);
const TAG = process.argv[3] || ('map' + IDX);
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'survey_' + Date.now());
  // 先写 localStorage 再导航: 用 CDP 无法预置, 改为导航后 reload
  const proc = spawn(ch, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud,
    '--window-size=1600,1000', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
    '--hide-scrollbars', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  await sleep(2500);
  let list = null;
  for (let i = 0; i < 40; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list && list.length) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page'); if (!page) { console.log('NO_PAGE'); proc.kill(); process.exit(1); }
  const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {};
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable');
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true }); return o.result && o.result.result ? o.result.result.value : JSON.stringify(o); };

  await rpc('Page.navigate', { url: URL });
  await sleep(4000);
  await ev(`localStorage.setItem('sf_campaign','${IDX}');localStorage.setItem('sf_weather','clear');`);
  await rpc('Page.navigate', { url: URL });
  await sleep(14000);

  const info = await ev(`(function(){try{return JSON.stringify({
    campaign:CAMPAIGN.id, layout:CAMPAIGN.layout, size:MAP_SIZE,
    bases:CAMPAIGN.bases.map(b=>[b.x,b.z]), extract:(CAMPAIGN.extract||[]).map(e=>[e.x,e.z]),
    boxes:BOXES.length, cyls:CYLS.length, navClears:NAV_CLEARS.length,
    buildings:(typeof CQ_BUILDINGS!=='undefined')?CQ_BUILDINGS.length:-1,
    ramps:(typeof RAMPS!=='undefined')?RAMPS.length:-1,
    crates:(typeof LOOT_CRATES!=='undefined')?LOOT_CRATES.length:-1,
    worldKids:world.children.length, sceneKids:scene.children.length
  });}catch(e){return 'ERR:'+e.message;}})()`);
  console.log('INFO ' + TAG + ' :: ' + info);

  // 冻结主循环, 接管相机
  await ev(`(function(){window.__raf=window.requestAnimationFrame;window.requestAnimationFrame=function(){return 0;};return 1;})()`);
  // 隐藏所有 UI 覆盖层, 只留 3D 画面
  await ev(`(function(){
    const s=document.createElement('style'); s.id='__surveyHide';
    s.textContent='#menu,#hud,#deploy,#hudRoot,.hud,#crosshair,#minimap,#topbar{display:none!important}';
    document.head.appendChild(s);
    document.querySelectorAll('#menu,[id^=hud],[id*=Hud],[class*=hud]').forEach(e=>e.style.display='none');
    const m=document.getElementById('menu'); if(m) m.classList.add('hidden');
    return 'ui-hidden';
  })()`);
  await sleep(300);
  await sleep(500);

  const M = JSON.parse(info);
  const H = M.size / 2;
  const SHOTS = [
    { n: 'top', x: 0, z: 0, y: H * 2.05, yaw: 0, pitch: -1.5 },
    { n: 'iso', x: 0, z: 0, y: H * 1.25, yaw: 0.6, pitch: -0.72 },
    { n: 'base0', x: M.bases[0][0], z: M.bases[0][1], y: 12, yaw: 0.9, pitch: -0.55 },
    { n: 'mid', x: (M.bases[0][0] + M.bases[1][0]) / 2, z: 0, y: 4, yaw: 0, pitch: -0.05 },
    { n: 'ext', x: M.extract[0] ? M.extract[0][0] : 0, z: M.extract[0] ? M.extract[0][1] : 0, y: 26, yaw: 0.5, pitch: -0.85 },
  ];
  for (const s of SHOTS) {
    await ev(`(function(){try{
      camera.position.set(${s.x},${s.y},${s.z});
      camera.rotation.order='YXZ';
      camera.rotation.set(${s.pitch},${s.yaw},0);
      camera.fov=62; camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
      hemi.intensity=Math.max(hemi.intensity,1.5); sun.intensity=Math.max(sun.intensity,1.1);
      window.__fog=scene.fog; scene.fog=null;
      camera.far=3000; camera.near=0.3; camera.updateProjectionMatrix();
      renderer.clear(); renderer.render(scene,camera);
      return 'ok';
    }catch(e){return 'ERR:'+e.message;}})()`);
    await sleep(600);
    const o = await rpc('Page.captureScreenshot', { format: 'png' });
    const fn = path.join(__dirname, 'sv_' + TAG + '_' + s.n + '.png');
    fs.writeFileSync(fn, Buffer.from(o.result.data, 'base64'));
    console.log('SHOT ' + fn);
  }
  ws.close(); proc.kill();
  await sleep(400);
  try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) { }
})();
