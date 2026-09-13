// 验证 视角抖动增强: 三套独立权重 + 总开关 + F8 + 菜单按钮
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9423, HTTP = 8133;
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let PASS = 0, FAIL = 0;
function chk(name, cond, extra) { if (typeof cond === 'string' && cond.startsWith('EXC:')) { extra = cond; cond = false; } if (cond) { PASS++; console.log('  ✓', name, extra || ''); } else { FAIL++; console.log('  ✗ FAIL:', name, extra || ''); } }
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
(async () => {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const f = path.join(ROOT, p);
    fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('404'); } else { res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); } });
  }).listen(HTTP);
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'bd_' + Date.now());
  const proc = spawn(ch, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,720', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'http://127.0.0.1:' + HTTP + '/index.html'], { stdio: 'ignore' });
  await sleep(3500);
  let list = null;
  for (let i = 0; i < 25; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page'); if (!page) { console.log('NO_PAGE'); proc.kill(); srv.close(); process.exit(1); }
  const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); if (j.method === 'Runtime.exceptionThrown') errs.push('EXC ' + ((j.params.exceptionDetails.exception && j.params.exceptionDetails.exception.description) || '').split('\n')[0]); if (j.method === 'Runtime.consoleAPICalled' && j.params.type === 'error') errs.push('CONSOLE ' + JSON.stringify(j.params.args.map(a => a.value).slice(0, 2))); });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa })); });
  await rpc('Page.enable', {}); await rpc('Runtime.enable', {});
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception && o.result.exceptionDetails.exception.description) || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : JSON.stringify(o); };

  await sleep(9000);

  console.log('--- A. SHAKE_CFG / 类型化入口已加载 ---');
  chk('SHAKE_CFG 存在', await ev(`typeof SHAKE_CFG!=='undefined'`));
  chk('默认 enabled=true', await ev(`SHAKE_CFG.enabled===true`));
  chk('默认 masterMul=1.0', Math.abs(await ev(`SHAKE_CFG.masterMul`) - 1.0) < 1e-9);
  chk('hitMul=1.10', Math.abs(await ev(`SHAKE_CFG.hitMul`) - 1.10) < 1e-9);
  chk('shotMul=0.85', Math.abs(await ev(`SHAKE_CFG.shotMul`) - 0.85) < 1e-9);
  chk('explosionMul=1.20', Math.abs(await ev(`SHAKE_CFG.explosionMul`) - 1.20) < 1e-9);
  chk('vehicleMul=0.7', Math.abs(await ev(`SHAKE_CFG.vehicleMul`) - 0.7) < 1e-9);
  chk('shakeHit/Shot/Explosion/Vehicle 都是函数', (await ev(`typeof shakeHit==='function'&&typeof shakeShot==='function'&&typeof shakeExplosion==='function'&&typeof shakeVehicle==='function'`)) === true);

  console.log('--- B. 受击 / 开枪 / 爆炸三类入口路由 ---');
  const t1 = await ev(`(function(){ camTrauma=0; shakeHit(0.3, false); return camTrauma; })()`);
  chk('shakeHit(0.3) 触发 trauma ≈ 0.33', Math.abs(t1 - 0.33) < 1e-6, 'camTrauma=' + t1);
  const t2 = await ev(`(function(){ camTrauma=0; shakeHit(0.3, true); return camTrauma; })()`);
  chk('shakeHit 头部 +25% 加成 ≈ 0.4125', Math.abs(t2 - 0.4125) < 1e-4, 'camTrauma=' + t2);
  const t3 = await ev(`(function(){ camTrauma=0; shakeShot(1.0); return camTrauma; })()`);
  chk('shakeShot(1.0) ≈ 0.85', Math.abs(t3 - 0.85) < 1e-6, 'camTrauma=' + t3);
  const t4 = await ev(`(function(){ camTrauma=0; shakeExplosion(1.0, 10); return camTrauma; })()`);
  chk('shakeExplosion(1.0,d=10) ≈ 0.9 (1.2*0.75)', Math.abs(t4 - 0.9) < 1e-6, 'camTrauma=' + t4);
  const t5 = await ev(`(function(){ camTrauma=0; shakeVehicle(1.0); return camTrauma; })()`);
  chk('shakeVehicle(1.0) ≈ 0.7', Math.abs(t5 - 0.7) < 1e-6, 'camTrauma=' + t5);

  console.log('--- C. 总开关 / 全局乘子联动 ---');
  const t6 = await ev(`(function(){ SHAKE_CFG.enabled=false; camTrauma=0; shakeHit(1.0, false); shakeShot(1.0); shakeExplosion(1.0); shakeVehicle(1.0); const v=camTrauma; SHAKE_CFG.enabled=true; return v; })()`);
  chk('enabled=false 时所有入口都不产生 trauma', t6 === 0, 'camTrauma=' + t6);
  const t7 = await ev(`(function(){ SHAKE_CFG.masterMul=0; camTrauma=0; shakeHit(1.0); const v=camTrauma; SHAKE_CFG.masterMul=1.0; return v; })()`);
  chk('masterMul=0 等价于关闭', t7 === 0, 'camTrauma=' + t7);
  const t8 = await ev(`(function(){ SHAKE_CFG.masterMul=2; camTrauma=0; shakeHit(1.0); const v=camTrauma; SHAKE_CFG.masterMul=1.0; return v; })()`);
  chk('masterMul=2 时 hitMul=1.10 翻倍, 被 1.2 上限截到 1.2', Math.abs(t8 - 1.2) < 1e-6, 'camTrauma=' + t8);
  await ev(`shakeSetMaster(1.5)`);
  chk('shakeSetMaster 写回 1.5', Math.abs(await ev(`SHAKE_CFG.masterMul`) - 1.5) < 1e-9);
  const _v = await ev(`(function(){ try { var s = localStorage.getItem('bf_shake_v1'); return s ? JSON.parse(s).masterMul : -1; } catch(e) { return -1; } })()`);
  chk('localStorage bf_shake_v1 持久化 1.5', Math.abs(_v - 1.5) < 1e-9, '值=' + _v + ' 原文=' + await ev(`localStorage.getItem('bf_shake_v1')`));
  await ev(`shakeSetEnabled(false)`);
  chk('shakeSetEnabled(false) 写入配置', await ev(`SHAKE_CFG.enabled`) === false);
  await ev(`shakeSetEnabled(true)`);

  console.log('--- D. 菜单按钮 / 滑条 ---');
  chk('#shakeBtn 存在', await ev(`!!document.getElementById('shakeBtn')`));
  chk('#shakeRange 存在', await ev(`!!document.getElementById('shakeRange')`));
  chk('#shakeVal 存在', await ev(`!!document.getElementById('shakeVal')`));
  chk('按钮文本以 "视角抖动:" 开头', await ev(`document.getElementById('shakeBtn').textContent.startsWith('视角抖动')`));
  await ev(`shakeSetEnabled(true); document.getElementById('shakeBtn').click();`);
  chk('按钮点击切换 enabled=false', await ev(`SHAKE_CFG.enabled`) === false);
  await ev(`document.getElementById('shakeBtn').click();`);
  chk('再点切换回 enabled=true', await ev(`SHAKE_CFG.enabled`) === true);
  await ev(`shakeSetMaster(0.5)`);
  chk('shakeSetMaster 同步文本为 50%', await ev(`document.getElementById('shakeVal').textContent`) === '50%');
  await ev(`shakeSetMaster(1.0)`);

console.log('--- E. F8 快捷键 (需先部署才能响应) ---');
  await ev(`shakeSetEnabled(true)`);
  // 部署前 F8 应该被早退 (菜单内或未部署)
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{code:'F8',bubbles:true}))`);
  chk('部署前 F8 不切换', await ev(`SHAKE_CFG.enabled`) === true);
  // 部署 + 隐藏菜单
  await ev(`startMatch(); el('menu').classList.add('hidden'); showDeploy(false);`);
  await sleep(1200);
  await ev(`(function(){ selectedSpawn=-1; deployPlayer(); })()`);
  await sleep(2500);
  await ev(`shakeSetEnabled(true)`);
  chk('部署后 F8 前 enabled=true', await ev(`SHAKE_CFG.enabled`) === true);
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{code:'F8',bubbles:true}))`);
  chk('F8 切换 enabled=false', await ev(`SHAKE_CFG.enabled`) === false);
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{code:'F8',bubbles:true}))`);
  chk('F8 再切 enabled=true', await ev(`SHAKE_CFG.enabled`) === true);

  console.log('--- F. 部署后受击真触发 shakeHit ---');
  await ev(`initRaidBody(player,{armor:{level:0,hp:0,resist:0}}); player.alive=true; player.lastDmgT=nowT;`);
  const fr = await ev(`(function(){
    camTrauma=0;
    applyPlayerBodyDamage(10, null, true, 'head');
    const r1=camTrauma;
    applyPlayerBodyDamage(10, null, false, 'legL');
    const r2=camTrauma;
    return JSON.stringify({head:r1, headLimbs:r2});
  })()`);
  const fo = JSON.parse(fr);
  chk('applyPlayerBodyDamage 头部 → camTrauma ≈ 0.34375', Math.abs(fo.head - 0.34375) < 1e-4, 'camTrauma=' + fo.head);
  chk('applyPlayerBodyDamage 四肢 → camTrauma 累计 ≈ 0.61875', Math.abs(fo.headLimbs - 0.61875) < 1e-4, 'camTrauma=' + fo.headLimbs);

  console.log('--- G. 开枪触发 shakeShot ---');
  const gr = await ev(`(function(){
    camTrauma=0;
    const w={def:{kick:1.0,recoil:1.0,recSide:0,mag:30,rpm:600,type:'auto'},mag:30};
    playerShoot(w);
    const v1=camTrauma;
    SHAKE_CFG.enabled=false;
    camTrauma=0;
    playerShoot(w);
    const v2=camTrauma;
    SHAKE_CFG.enabled=true;
    return JSON.stringify({shot:v1, off:v2});
  })()`);
  const go = JSON.parse(gr);
  chk('playerShoot 触发 shakeShot ≈ 0.765 (kick*0.9*shotMul)', Math.abs(go.shot - 0.765) < 1e-6, 'camTrauma=' + go.shot);
  chk('SHAKE_CFG.enabled=false 时开枪不再产生 trauma', go.off === 0, 'camTrauma=' + go.off);

  console.log('--- H. 距离衰减爆炸 ---');
  const hr = await ev(`(function(){
    camTrauma=0; shakeExplosion(1.0, 5); const a=camTrauma;
    camTrauma=0; shakeExplosion(1.0, 100); const b=camTrauma;
    return JSON.stringify({d5:a, d100:b});
  })()`);
  const ho = JSON.parse(hr);
  chk('shakeExplosion d=5 → 1.0*1.2*(1-5/40)=1.05', Math.abs(ho.d5 - 1.05) < 1e-6, 'camTrauma=' + ho.d5);
  chk('shakeExplosion d=100 → 截断 0.25, 1.0*1.2*0.25=0.3', Math.abs(ho.d100 - 0.3) < 1e-6, 'camTrauma=' + ho.d100);

  console.log('--- I. 无新增 META 字段 / 无异常 ---');
  chk('META 字段未变', (await ev(`Object.keys(META).sort().join(',')`)) === (await ev(`Object.keys(JSON.parse(localStorage.getItem('bf_meta_v1'))).sort().join(',')`)));
  chk('META 无 shake 字段', (await ev(`('shake' in META)`)) === false);
  chk('页面无 JS 异常', errs.length === 0, errs.slice(0, 3).join(' | '));
  chk('bf_shake_v1 是独立 key', await ev(`!!localStorage.getItem('bf_shake_v1')`));
  chk('bf_meta_v1 仍不含 shake 字段', await ev(`(function(){ try{return !('shake' in JSON.parse(localStorage.getItem('bf_meta_v1')));}catch(e){return true;} })()`));

  console.log('\n===== 通过 ' + PASS + ' / 失败 ' + FAIL + ' =====');
  ws.close(); proc.kill(); srv.close();
  setTimeout(() => process.exit(FAIL ? 1 : 0), 400);
})();