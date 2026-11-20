// 移动端触控按钮验收: 用 CDP 真机仿真 (deviceMetrics + touch emulation) 加载游戏,
// 然后用真实的 Input.dispatchTouchEvent 逐个按下新按钮, 验证它们真的触发对应动作。
// 为什么必须仿真而不能直接改 MOBILE: MOBILE 是 01_data.js 里的 const,
// 由 navigator.maxTouchPoints / (pointer:coarse) 在加载时算出, 运行时改不了。
// 用法: node _tools/_touch_probe.js [url]
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9491;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;

function finish(code) {
  try { if (ws) ws.close(); } catch (e) { }
  try { if (proc) proc.kill(); } catch (e) { }
  fs.writeFileSync(path.join(ROOT, '_tools', '_touch_probe.txt'), out.join('\n') + '\n', 'utf8');
  process.exit(code);
}

(async () => {
  const ud = path.join(require('os').tmpdir(), 'touch_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=900,420', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
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
    if (j.method === 'Log.entryAdded' && j.params.entry.level === 'error') errs.push('LOG ' + String(j.params.entry.text).slice(0, 200));
  });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable'); await rpc('Log.enable');
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : String(o); };
  const shot = async n => { const o = await rpc('Page.captureScreenshot', { format: 'png' }); if (o.result && o.result.data) fs.writeFileSync(path.join(ROOT, 'outputs', n), Buffer.from(o.result.data, 'base64')); };

  // ---- 真机仿真: 横屏手机 ----
  await rpc('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: 'landscapePrimary', angle: 90 } });
  await rpc('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  await rpc('Page.navigate', { url: URL });
  await sleep(9000);

  log('=== 仿真环境 ===');
  log('MOBILE              : ' + await ev(`MOBILE`));
  log('body.mobile         : ' + await ev(`document.body.classList.contains('mobile')`));
  log('maxTouchPoints      : ' + await ev(`navigator.maxTouchPoints`));
  log('#touchUI display    : ' + await ev(`getComputedStyle(document.getElementById('touchUI')).display`));
  log('视口                : ' + await ev(`innerWidth+'x'+innerHeight`));

  log('');
  log('=== 按钮清单 (HTML 里全部 .tbtn) ===');
  log(await ev(`[...document.querySelectorAll('#touchUI .tbtn')].map(b=>b.id+'('+b.dataset.act+')').join(' ')`));

  // 触控工具
  const rect = async id => await ev(`(function(){const b=document.getElementById('${id}');if(!b)return 'NO_EL';const r=b.getBoundingClientRect();
    const hidden=b.classList.contains('hiddenT')||getComputedStyle(b).display==='none'||r.width===0;
    return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),hidden:!!hidden});})()`);
  const tap = async (id, holdMs) => {
    const rs = await rect(id);
    if (rs === 'NO_EL') return 'NO_EL';
    const r = JSON.parse(rs);
    if (r.hidden) return 'HIDDEN';
    await rpc('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y, id: 1 }] });
    await sleep(holdMs || 120);
    await rpc('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(150);
    return 'ok@' + r.x + ',' + r.y;
  };
  const down = async (id) => { const r = JSON.parse(await rect(id)); await rpc('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y, id: 1 }] }); await sleep(250); return 'ok'; };
  const up = async () => { await rpc('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(200); return 'ok'; };

  log('');
  log('=== 未部署时: 所有按钮应隐藏 ===');
  log('可见按钮数(应 0): ' + await ev(`[...document.querySelectorAll('#touchUI .tbtn')].filter(b=>!b.classList.contains('hiddenT')).length`));

  log('');
  log('=== 部署一局 (SCAV) ===');
  log('deploy: ' + await ev(`(function(){try{el('menu').classList.add('hidden');startMatch();showDeploy(false);selectedSpawn=-1;deployPlayer();return 'OK';}catch(e){return 'EXC '+e.message;}})()`));
  await sleep(2500);
  log('玩家: ' + await ev(`player.alive+' hp='+Math.round(player.hp)+' 武器='+((WPN_DEFS[player.curW.key]||{}).name)`));
  log('小队人数: ' + await ev(`SQUAD.members.length`));

  log('');
  log('=== 步战状态下的按钮可见性 ===');
  const ids = ['tFire','tAds','tJump','tLeanL','tLeanR','tBag','tFlash','tInteract','tAttack','tGuard','tFollow','tMap','tScore','tMenu'];
  for (const i of ids) {
    const r = JSON.parse(await rect(i));
    log(`  ${i.padEnd(9)} ${r.hidden ? '隐藏' : '可见'}`);
  }
  log('  (tFireL 应已不存在: ' + await ev(`!!document.getElementById('tFireL')`) + ')');

  log('');
  log('=== 触摸实测 ===');

  // 背包
  log('背包 tBag 按下: ' + await tap('tBag'));
  log('  BAG_UI.open (应 true): ' + await ev(`BAG_UI.open`));
  await tap('tBag');
  log('  再按一次 -> BAG_UI.open (应 false): ' + await ev(`BAG_UI.open`));

  // 手电: 先给当前武器装 light_flash
  log('装上手电改件: ' + await ev(`(function(){try{setModChoice(player.curW.key,'light','light_flash');return 'ok';}catch(e){return 'EXC '+e.message;}})()`));
  await sleep(600);
  log('  FLASH.hasMod (应 true): ' + await ev(`FLASH.hasMod`));
  log('手电 tFlash 按下: ' + await tap('tFlash'));
  log('  FLASH.want (应 true): ' + await ev(`FLASH.want`));
  log('  再按一次 -> FLASH.want (应 false): ' + await ev(`(function(){return FLASH.want;})()`) + ' (先按)');
  await tap('tFlash');
  log('  FLASH.want (应 false): ' + await ev(`FLASH.want`));

  // 侧身: 按住
  log('左探头 tLeanL 按住: ' + await down('tLeanL'));
  log('  keys.KeyQ (应 true): ' + await ev(`keys.KeyQ`));
  await sleep(700);
  log('  player.leanT (应 <0): ' + await ev(`player.leanT.toFixed(3)`));
  log('  松开: ' + await up());
  log('  keys.KeyQ (应 false): ' + await ev(`keys.KeyQ`));
  log('  1s 后 leanT (应回到 ~0): ' + await ev(`(function(){return player.leanT.toFixed(3);})()`));

  log('右探头 tLeanR 按住: ' + await down('tLeanR'));
  log('  keys.KeyE (应 true): ' + await ev(`keys.KeyE`));
  await sleep(700);
  log('  player.leanT (应 >0): ' + await ev(`player.leanT.toFixed(3)`));
  log('  松开: ' + await up());
  log('  keys.KeyE (应 false): ' + await ev(`keys.KeyE`));

  // 小队指令
  log('小队模式(初始): ' + await ev(`SQUAD.mode`));
  log('攻击 tAttack 按下: ' + await tap('tAttack'));
  log('  按下后 SQUAD.mode (应为 attack 或 move): ' + await ev(`SQUAD.mode`));
  log('驻守 tGuard 按下: ' + await tap('tGuard'));
  log('  按下后 SQUAD.mode (应 guard): ' + await ev(`SQUAD.mode`));
  log('跟随 tFollow 按下: ' + await tap('tFollow'));
  log('  按下后 SQUAD.mode (应 follow): ' + await ev(`SQUAD.mode`));

  // 开火 / 瞄准
  log('开火 tFire 按住: ' + await down('tFire'));
  log('  mouseDown (应 true): ' + await ev(`mouseDown`));
  log('  松开: ' + await up());
  log('  mouseDown (应 false): ' + await ev(`mouseDown`));
  log('瞄准 tAds 按下: ' + await tap('tAds'));
  log('  player.ads (应 true): ' + await ev(`player.ads`));
  await tap('tAds');
  log('  player.ads (应 false): ' + await ev(`player.ads`));

  await shot('touch_ui_probe.png');

  log('');
  log('=== 控制台异常 ===');
  log(errs.length ? errs.slice(0, 12).join('\n') : '无');
  finish(0);
})().catch(e => { log('FATAL ' + e.message); finish(1); });
