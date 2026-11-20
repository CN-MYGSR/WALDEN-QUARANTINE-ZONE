// 瞄具模型排查: 装了瞄具后, 枪上到底有没有多出可见的镜体?
// 关键点: addModVisuals 里瞄具分支用的是 adsA.pos.y —— 而 adsFromSight 返回的是 {pos:V3(-sx,-sy,zoff)},
//         也就是 ADS 锚点 Y 是**负值**(把枪往下压, 让准星对上镜头中心), 并不是枪身局部高度。
//         如果直接拿它当局部 Y 放模型, 镜体会沉进机匣里 → 看不见。
// 用法: node _tools/_optic_probe.js [url]
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9509;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;

function finish(code) {
  try { if (ws) ws.close(); } catch (e) { }
  try { if (proc) proc.kill(); } catch (e) { }
  fs.writeFileSync(path.join(ROOT, '_tools', '_optic_probe.txt'), out.join('\n') + '\n', 'utf8');
  console.log('[finish] 写入 ' + out.length + ' 行, code=' + code);
  process.exit(code);
}
console.log('[boot] 脚本开始');

(async () => {
  const ud = path.join(require('os').tmpdir(), 'optic_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,760', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  await sleep(2500);
  let list = null;
  for (let i = 0; i < 40; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list && list.length) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page');
  if (!page) { log('NO_PAGE'); return finish(1); }
  ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => {
    const j = JSON.parse(m);
    if (j.id && pend[j.id]) pend[j.id](j);
    if (j.method === 'Runtime.exceptionThrown') errs.push('EXC ' + ((j.params.exceptionDetails.exception || {}).description || '').split('\n')[0]);
  });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable');
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : String(o); };

  await rpc('Page.navigate', { url: URL });
  await sleep(14000);
  await ev(`localStorage.setItem('sf_campaign','0'); localStorage.removeItem('sf_mods');`);

  log('=== 1) ADS 锚点到底是什么 (m4) ===');
  log(await ev(`(function(){
    setModChoice('m4','optic','optic_iron');
    const p=buildGunModel('m4');
    const a=p.anchors.ads.pos;
    const s=p.sightAnchor;
    return 'anchors.ads.pos = ['+a.x.toFixed(3)+','+a.y.toFixed(3)+','+a.z.toFixed(3)+']'
      +'  (y 为负 = 把枪往下压, 让准星对上镜头中心, 不是枪身局部高度)'
      +'\\n  sightAnchor(机瞄顶) = '+(s?('['+s.x.toFixed(3)+','+s.y.toFixed(3)+','+s.z.toFixed(3)+']'):'无')
      +'\\n  muzzle = ['+p.muzzle.x.toFixed(3)+','+p.muzzle.y.toFixed(3)+','+p.muzzle.z.toFixed(3)+']';
  })()`));

  log('');
  log('=== 2) 各瞄具: mesh 数 + 镜体实际 Y 坐标 ===');
  // 反射镜片色 0x8ac0e0; 其余瞄具用「比无改装多出来的 mesh 的最高/最低 Y」来判断
  const probe = (optic) => `(function(){
    setModChoice('m4','optic','${optic}');
    const p=buildGunModel('m4');
    const g=p.gun; const ys=[];
    g.traverse(o=>{ if(o.isMesh){ const v=new THREE.Vector3(); o.getWorldPosition(v); ys.push(+v.y.toFixed(3)); } });
    ys.sort((a,b)=>a-b);
    const lens=g.children.find(o=>o.isMesh&&o.material&&o.material.color&&o.material.color.getHex()===0x8ac0e0);
    return 'mesh='+String(g.children.length).padEnd(4)
      +' y范围=['+ys[0]+' .. '+ys[ys.length-1]+']'
      +'  反射镜片='+(lens?('['+lens.position.x.toFixed(3)+','+lens.position.y.toFixed(3)+','+lens.position.z.toFixed(3)+']'):'无');
  })()`;
  for (const o of ['optic_iron', 'optic_reflex', 'optic_2x', 'optic_4x', 'optic_nvg']) {
    log('  ' + o.padEnd(13) + ' → ' + await ev(probe(o)));
  }

  log('');
  log('=== 3) 判定 ===');
  log(await ev(`(function(){
    setModChoice('m4','optic','optic_iron'); const base=buildGunModel('m4').gun.children.length;
    setModChoice('m4','optic','optic_reflex'); const rf=buildGunModel('m4');
    const lens=rf.gun.children.find(o=>o.isMesh&&o.material&&o.material.color&&o.material.color.getHex()===0x8ac0e0);
    if(!lens) return '反射瞄具: 连 mesh 都没建出来';
    const y=lens.position.y;
    const ok=y>0.02;
    return '反射瞄具 mesh: '+base+' → '+rf.gun.children.length
      +' · 镜片局部 Y='+y.toFixed(3)
      +' → '+(ok?'✅ 在机匣上方, 可见':'❌ Y 为负/过低, 沉进机匣里 → 看不见');
  })()`));

  log('');
  log('=== 4) 实机截图 (M4 + 反射瞄具, 腰射视角) ===');
  log('部署: ' + await ev(`(function(){try{
    localStorage.setItem('sf_campaign','0');
    addOwned('m4',1); META.loadout.primary='m4'; META.loadout.secondary='';
    setModChoice('m4','optic','optic_reflex');
    el('menu').classList.add('hidden'); startMatch(); showDeploy(false); selectedSpawn=-1; deployPlayer();
    return 'OK';}catch(e){return 'EXC '+e.message;}})()`));
  await sleep(2500);
  log('当前瞄具: ' + await ev(`getModChoice(player.curW.key,'optic')`));
  log('VM 模型里的瞄具镜片: ' + await ev(`(function(){
    const l=VM.gunParts&&VM.gunParts.gun;
    if(!l) return 'VM.gunParts 无';
    let n=0; l.traverse(o=>{ if(o.isMesh&&o.material&&o.material.color&&o.material.color.getHex()===0x8ac0e0) n++; });
    return '找到 '+n+' 个反射镜片 mesh';
  })()`));
  // ADS 对齐: vmEquip 会把 ads.pos.y 强制校准成 -sightAnchor.y, 所以两者应该互为相反数
  log('ADS 对齐校验: ' + await ev(`(function(){
    const sa=VM.gunParts&&VM.gunParts.sightAnchor;
    const ay=VM.ads&&VM.ads.pos?VM.ads.pos.y:null;
    if(sa==null||ay==null) return '取不到 sightAnchor / ads.pos';
    const diff=Math.abs(ay-(-sa.y));
    return 'sightAnchor.y='+sa.y.toFixed(4)+'  ads.pos.y='+ay.toFixed(4)
      +'  (应 ≈ -'+sa.y.toFixed(4)+')  偏差='+diff.toFixed(5)
      +'  → '+(diff<0.001?'✅ 瞄具光学中心正好落在屏幕中心':'❌ 未对齐');
  })()`));
  log('  (对照) 机瞄顶高度: ' + await ev(`(function(){
    setModChoice('m4','optic','optic_iron'); const p=buildGunModel('m4');
    const s=p.sightAnchor; setModChoice('m4','optic','optic_reflex');
    return s?s.y.toFixed(4):'无';
  })()`));
  const s1 = await rpc('Page.captureScreenshot', { format: 'png' });
  if (s1.result && s1.result.data) fs.writeFileSync(path.join(ROOT, 'outputs', 'optic_reflex.png'), Buffer.from(s1.result.data, 'base64'));
  log('  已存 outputs/optic_reflex.png');
  // 开镜看准星是否仍然居中
  await ev(`(function(){try{player.ads=true;for(let i=0;i<40;i++){updatePlayer(0.02);updateViewModel(0.02,player);}}catch(e){}return 1;})()`);
  await sleep(400);
  const s2 = await rpc('Page.captureScreenshot', { format: 'png' });
  if (s2.result && s2.result.data) fs.writeFileSync(path.join(ROOT, 'outputs', 'optic_reflex_ads.png'), Buffer.from(s2.result.data, 'base64'));
  log('  已存 outputs/optic_reflex_ads.png (开镜)');

  log('');
  log('=== 5) 异常 ===');
  log(errs.length ? errs.slice(0, 8).join('\n') : '无');
  finish(0);
})().catch(e => { log('FATAL ' + e.message); finish(1); });
