// 镜内渲染探针: 三种瞄具各开一镜, 检查主相机 FOV / 镜片状态 / 控制台
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9734;
const ROOT = path.resolve(__dirname, '..');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
const out = [];
let pass = 0, fail = 0;
const ok = m => { pass++; out.push('  ✅ ' + m); };
const bad = m => { fail++; out.push('  ❌ ' + m); };
const log = m => out.push(m);
function finish(c) {
  const t = out.join('\n');
  fs.writeFileSync(path.join(ROOT, '_tools', '_scope_probe.txt'), t + '\n', 'utf8');
  console.log(t);
  try { if (ws) ws.close(); } catch (e) {}
  try { if (proc) proc.kill(); } catch (e) {}
  process.exit(c);
}

(async () => {
  const ud = path.join(require('os').tmpdir(), 'sp_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud,
    '--window-size=1280,760', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'],
    { stdio: 'ignore' });
  await sleep(2500);
  let list = null;
  for (let i = 0; i < 40; i++) {
    try {
      list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => {
        let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
      }).on('error', rej));
      if (list && list.length) break;
    } catch (e) { await sleep(500); }
  }
  const page = (list || []).find(t => t.type === 'page');
  if (!page) { log('NO_PAGE'); return finish(1); }
  ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {}; let errs = [];
  ws.on('message', m => {
    const j = JSON.parse(m);
    if (j.id && pend[j.id]) pend[j.id](j);
    else if (j.method === 'Runtime.exceptionThrown') errs.push('EXC ' + ((j.params.exceptionDetails.exception || {}).description || j.params.exceptionDetails.text || '').split('\n')[0]);
    else if (j.method === 'Runtime.consoleAPICalled' && j.params.type === 'error')
      errs.push('ERR ' + j.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 160));
  });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable');
  const ev = async e => {
    const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true });
    if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0];
    return o.result && o.result.result ? o.result.result.value : String(o);
  };
  const shot = async (n) => {
    const s = await rpc('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ROOT, '_tools', '_scope_' + n + '.png'), Buffer.from(s.result.data, 'base64'));
  };

  log('=== 镜内渲染探针 ===');
  await rpc('Page.navigate', { url: URL });
  await sleep(14000);
  const ridx = await ev(`(function(){ for(let i=0;i<CAMPAIGNS.length;i++) if(CAMPAIGNS[i].rangeOnly) return i; return -1; })()`);
  await ev(`(function(){ localStorage.setItem('sf_campaign','${ridx}'); localStorage.setItem('sf_range','1'); localStorage.removeItem('sf_autodeploy'); return 1; })()`);

  // ---- 静态: 遮罩必须删干净 ----
  const dom = await ev(`JSON.stringify({ ov: !!document.getElementById('scopeOv'), vhs: typeof VHS, scope: typeof SCOPE })`);
  let d0 = {}; try { d0 = JSON.parse(dom); } catch (e) { }
  d0.ov === false ? ok('#scopeOv 遮罩已从 DOM 移除') : bad('#scopeOv 还在 DOM 里');
  d0.scope === 'object' ? ok('SCOPE 模块已加载') : bad('SCOPE 未加载: ' + d0.scope);
  const wrapped = await ev(`(function(){ return String(NVG.render).indexOf('SCOPE.overlaySafe')>=0; })()`);
  wrapped === true ? ok('NVG.render 已被镜内渲染接管') : bad('NVG.render 未被接管');

  // ---- adsFovOf: scoped 武器不吃瞄具改件倍率 ----
  const fovs = await ev(`JSON.stringify({
    kar:  adsFovOf('kar98zf'),
    gar2: adsFovOf('garand'),
    base: (SETTINGS&&SETTINGS.fov)||74
  })`);
  log('  adsFovOf: ' + fovs);
  let F = {}; try { F = JSON.parse(fovs); } catch (e) { }
  if (Math.abs(F.kar - 20) < 1.5) ok('自带 4x 狙击镜开镜 FOV = 20° (没被改件再乘一次)');
  else bad('kar98zf 开镜 FOV = ' + F.kar + ' (应 ≈20) —— 改件倍率可能重复乘了');
  if (Math.abs(F.gar2 - 52) < 1.5) ok('无改件的加兰德开镜 FOV = 52°');
  else bad('garand 开镜 FOV = ' + F.gar2 + ' (应 ≈52)');

  // ---- 行为: 三种瞄具 ----
  async function caseRun(wpn, optic, tag) {
    errs = [];
    await ev(`(function(){
      localStorage.setItem('sf_campaign','${ridx}');
      localStorage.setItem('sf_range','1');
      localStorage.setItem('sf_rangeWpn','${wpn}');
      ${optic ? `if(typeof setModChoice==='function') setModChoice('${wpn}','optic','${optic}');` : ''}
      return 1; })()`);
    await rpc('Page.navigate', { url: URL });
    await sleep(15000);
    await ev(`(function(){ document.getElementById('deployBtn').click(); return 1; })()`);
    await sleep(4200);
    await ev(`(function(){ player.pos.x=0; player.yaw=0; player.pitch=0; player.ads=false; return 1; })()`);
    await sleep(900);
    const hip = await ev(`JSON.stringify({show:SCOPE.state().show, fov:+camera.fov.toFixed(1)})`);
    await ev(`(function(){ player.ads=true; return 1; })()`);
    await sleep(1500);
    const ads = await ev(`JSON.stringify({
      key:(player.curW&&player.curW.key), show:SCOPE.state().show, R:+SCOPE.state().R.toFixed(3),
      sfov:+SCOPE.state().fov.toFixed(1), cfov:+camera.fov.toFixed(1),
      mode:SCOPE.state().mode, dust:SCOPE.state().dust,
      blend:+VM.adsBlend.toFixed(2) })`);
    await shot(tag + '_ads');
    return { hip, ads, errs: errs.slice() };
  }

  log('');
  log('--- ① 自带 4x 狙击镜 (kar98zf) ---');
  const A = await caseRun('kar98zf', 'optic_4x', 'p_kar');
  let aHip = {}, aAds = {};
  try { aHip = JSON.parse(A.hip); aAds = JSON.parse(A.ads); } catch (e) {}
  log('  腰射: ' + A.hip + ' | 开镜: ' + A.ads);
  aHip.show === false ? ok('腰射时没有镜片') : bad('腰射时就出镜片了');
  aAds.show === true ? ok('开镜出现镜片') : bad('开镜没有镜片');
  aAds.R > 0.2 ? ok('镜片半径正常 (' + aAds.R + ')') : bad('镜片半径过小 (' + aAds.R + ')');
  Math.abs(aAds.cfov - 74) < 3 ? ok('主相机保持腰射视野 (' + aAds.cfov + '°) —— 放大只在镜内')
    : bad('主相机 FOV = ' + aAds.cfov + '° (应 ≈74) —— 又变成整屏放大了');
  Math.abs(aAds.sfov - 20) < 2 ? ok('镜内视野 = 20° (4x 狙击镜)') : bad('镜内视野 = ' + aAds.sfov + '° (应 ≈20)');
  A.errs.length ? bad('控制台异常: ' + A.errs.slice(0, 3).join(' / ')) : ok('无控制台异常');

  log('');
  log('--- ② 加装 2 倍镜 (garand + optic_2x) ---');
  const B = await caseRun('garand', 'optic_2x', 'p_gar');
  let bAds = {};
  try { bAds = JSON.parse(B.ads); } catch (e) {}
  log('  开镜: ' + B.ads);
  bAds.show === true ? ok('加装 2 倍镜也走镜内渲染') : bad('2 倍镜没有镜片');
  Math.abs(bAds.cfov - 74) < 3 ? ok('主相机保持腰射视野 (' + bAds.cfov + '°)')
    : bad('主相机 FOV = ' + bAds.cfov + '° (应 ≈74)');
  Math.abs(bAds.sfov - 30.2) < 2.5 ? ok('镜内视野 ≈30° (52×0.58) —— 2 倍镜真的放大了')
    : bad('镜内视野 = ' + bAds.sfov + '° (应 ≈30)');
  B.errs.length ? bad('控制台异常: ' + B.errs.slice(0, 3).join(' / ')) : ok('无控制台异常');

  log('');
  log('--- ③ 机瞄 (m4 + optic_iron) ---');
  const C = await caseRun('m4', 'optic_iron', 'p_iron');
  let cAds = {};
  try { cAds = JSON.parse(C.ads); } catch (e) {}
  log('  开镜: ' + C.ads);
  cAds.show === false ? ok('机瞄不出镜片') : bad('机瞄却出镜片了');
  cAds.cfov < 70 ? ok('机瞄仍然整屏开镜 (' + cAds.cfov + '°) —— 没被误伤')
    : bad('机瞄没有开镜 (' + cAds.cfov + '°)');
  C.errs.length ? bad('控制台异常: ' + C.errs.slice(0, 3).join(' / ')) : ok('无控制台异常');

  log('');
  log('--- ④ 反射瞄具 (只有玻璃, 不放大) ---');
  const R = await caseRun('garand', 'optic_reflex', 'p_reflex');
  let rAds = {};
  try { rAds = JSON.parse(R.ads); } catch (e) {}
  log('  开镜: ' + R.ads);
  rAds.mode === 2 ? ok('反射瞄具走「纯玻璃灰尘」模式') : bad('反射瞄具 mode = ' + rAds.mode + ' (应 2)');
  rAds.show === true ? ok('反射瞄具开镜有玻璃层') : bad('反射瞄具没有玻璃层');
  (rAds.dust > 0) ? ok('灰尘强度 > 0 (' + rAds.dust + ')') : bad('灰尘强度为 0');
  rAds.cfov < 70 ? ok('反射瞄具不放大, 仍然整屏开镜 (' + rAds.cfov + '°)') : bad('反射瞄具没开镜');
  R.errs.length ? bad('控制台异常: ' + R.errs.slice(0, 3).join(' / ')) : ok('无控制台异常');

  log('');
  log('--- ⑤ 夜视仪 + 狙击镜叠加 ---');
  const D = await caseRun('kar98zf', 'optic_4x', 'p_nvg');
  const nvgSt = await ev(`(function(){ try{
    RUN.nvgBrought=true; RUN.nvgKey='nvg';
    const k=(player.curW&&player.curW.key)||META.loadout.primary;
    if(!PLAYER_MODS[k]) PLAYER_MODS[k]={};
    PLAYER_MODS[k].gear='gear_nvg';
    if(!NVG.active()) NVG.toggle();
    return JSON.stringify({nvg:NVG.active(), show:SCOPE.state().show, R:+SCOPE.state().R.toFixed(2)});
  }catch(e){ return 'EXC '+e.message; } })()`);
  await sleep(1500);
  await shot('p_nvg_ads');
  log('  夜视叠加: ' + nvgSt);
  let nv = {};
  try { nv = JSON.parse(nvgSt); } catch (e) {}
  nv.nvg === true ? ok('夜视仪已激活') : bad('夜视仪没开起来, 无法验证叠加: ' + nvgSt);
  if (nv.nvg === true) {
    nv.show === true ? ok('夜视开启时镜片仍在 (镜内渲染没被 NVG 的整屏 quad 吞掉)')
      : bad('夜视开启后镜片消失了 —— NVG 路径没补画');
  }
  errs.length ? bad('控制台异常: ' + errs.slice(0, 3).join(' / ')) : ok('无控制台异常');

  log('');
  log(fail ? ('❌ ' + fail + ' 项失败 / ' + pass + ' 项通过') : ('✅ 全部 ' + pass + ' 项通过'));
  return finish(fail ? 1 : 0);
})().catch(e => { log('FATAL ' + e.message + '\n' + e.stack); finish(1); });
