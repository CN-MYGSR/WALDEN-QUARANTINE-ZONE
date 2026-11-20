// 显示比例验收: 自动 / 16:9 / 4:3 / 21:9 的信箱式(letterbox)渲染
// 覆盖: viewRect 计算 · 渲染区尺寸与居中 · camera.aspect · HUD 与触控层跟随 · 不拉伸 · 持久化 · 控制台异常
// 用法: node _tools/_aspect_probe.js [url]
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9515;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(code) {
  try { if (ws) ws.close(); } catch (e) { }
  try { if (proc) proc.kill(); } catch (e) { }
  fs.writeFileSync(path.join(ROOT, '_tools', '_aspect_probe.txt'), out.join('\n') + '\n', 'utf8');
  process.exit(code);
}
(async () => {
  const ud = path.join(require('os').tmpdir(), 'ar_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,800', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
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
  const shot = async n => { const o = await rpc('Page.captureScreenshot', { format: 'png' }); if (o.result && o.result.data) fs.writeFileSync(path.join(ROOT, 'outputs', n), Buffer.from(o.result.data, 'base64')); };

  // 状态快照: 渲染区 / 相机 / HUD
  const snap = `(function(){
    const r=viewRect();
    const cv=renderer.domElement;
    const cs=getComputedStyle(cv);
    const ui=document.getElementById('ui');
    const tu=document.getElementById('touchUI');
    return 'viewRect='+r.x+','+r.y+' '+r.w+'x'+r.h
      +'  canvas样式='+cs.width+'x'+cs.height+' @'+cs.left+','+cs.top
      +'  绘制缓冲='+cv.width+'x'+cv.height
      +'  camera.aspect='+camera.aspect.toFixed(4)
      +'  #ui='+getComputedStyle(ui).width+'x'+getComputedStyle(ui).height
      +'  #touchUI='+getComputedStyle(tu).width+'x'+getComputedStyle(tu).height
      +'  touchTransform='+(tu.style.transform||'(无)');
  })()`;

  await rpc('Page.navigate', { url: URL });
  await sleep(14000);
  await ev(`localStorage.removeItem('sf_aspect'); localStorage.setItem('sf_campaign','0');`);
  await rpc('Page.navigate', { url: URL });
  await sleep(15000);

  log('=== 0) 环境 ===');
  log('窗口 : ' + await ev(`innerWidth+'x'+innerHeight+' (比例 '+(innerWidth/innerHeight).toFixed(3)+')'`));
  log('默认 SETTINGS.aspect : ' + await ev(`SETTINGS.aspect`));

  log('');
  log('=== 1) 设置界面里的「显示比例」行 ===');
  await ev(`(function(){el('mHome').classList.add('hidden');el('mSet').classList.remove('hidden');return 'OK';})()`);
  await sleep(500);
  log('#aspectRow 存在 : ' + await ev(`!!el('aspectRow')`));
  log('诊断 : ' + await ev(`(function(){
    const b=document.querySelector('#aspectRow [data-aspect="16:9"]');
    return 'SETTINGS.aspect='+SETTINGS.aspect
      +' · typeof applyAspect='+(typeof applyAspect)
      +' · typeof viewRect='+(typeof viewRect)
      +' · typeof initAspectUI='+(typeof initAspectUI)
      +' · 按钮 onclick='+(b&&typeof b.onclick)
      +' · 51_settings 是否加载='+(typeof keyOf);
  })()`));
  log('按钮 : ' + await ev(`[...document.querySelectorAll('#aspectRow [data-aspect]')].map(b=>b.dataset.aspect).join(' ')`));
  log('当前高亮 : ' + await ev(`[...document.querySelectorAll('#aspectRow [data-aspect].sel')].map(b=>b.dataset.aspect).join(',')||'(无)'`));
  log('提示 : ' + await ev(`el('aspectHint')?el('aspectHint').textContent:'NO_EL'`));

  log('');
  log('=== 2) 逐档切换 (窗口 1280x800 = 1.600) ===');
  for (const ar of ['16:9', '4:3', '21:9', 'auto']) {
    await ev(`(function(){document.querySelector('#aspectRow [data-aspect="${ar}"]').click();return 'ok';})()`);
    await sleep(400);
    log('  [' + ar.padEnd(5) + '] ' + await ev(snap));
    log('          localStorage=' + await ev(`localStorage.getItem('sf_aspect')`) + ' · 高亮=' + await ev(`[...document.querySelectorAll('#aspectRow [data-aspect].sel')].map(b=>b.dataset.aspect).join(',')`));
  }

  log('');
  log('=== 3) 拉伸模式检查 (渲染区应永远是整窗, 相机比例 = 选定比例) ===');
  for (const ar of ['16:9', '4:3', '21:9']) {
    await ev(`(function(){document.querySelector('#aspectRow [data-aspect="${ar}"]').click();return 'ok';})()`);
    await sleep(400);
    log('  [' + ar.padEnd(5) + '] ' + await ev(`(function(){
      const r=viewRect();
      const cv=renderer.domElement;
      const cs=getComputedStyle(cv);
      const win=innerWidth/innerHeight;
      const want=(function(){const p='${ar}'.split(':');return (+p[0])/(+p[1]);})();
      return 'canvas='+cs.width+'x'+cs.height+' @'+cs.left+','+cs.top
        +' · 铺满整窗='+(cs.width===innerWidth+'px'&&cs.height===innerHeight+'px')
        +' · 窗口比例='+win.toFixed(4)+' 相机比例='+camera.aspect.toFixed(4)+' 期望='+want.toFixed(4)
        +' → '+(Math.abs(camera.aspect-want)<0.001?'✅ 相机按选定比例':'❌ 相机比例不对')
        +' / '+(Math.abs(win-want)>0.001?'✅ 与窗口不同=画面被拉伸':'（与窗口同比例, 看不出拉伸）')
        +' · #ui='+getComputedStyle(document.getElementById('ui')).width
        +' · #touchUI='+getComputedStyle(document.getElementById('touchUI')).width
        +' · transform='+(document.getElementById('touchUI').style.transform||'(无)');
    })()`));
  }
  await ev(`(function(){document.querySelector('#aspectRow [data-aspect="16:9"]').click();return 'ok';})()`);
  await sleep(400);
  await shot('aspect_16_9.png');
  await ev(`(function(){document.querySelector('#aspectRow [data-aspect="21:9"]').click();return 'ok';})()`);
  await sleep(400);
  await shot('aspect_21_9.png');
  await ev(`(function(){document.querySelector('#aspectRow [data-aspect="4:3"]').click();return 'ok';})()`);
  await sleep(400);
  await shot('aspect_4_3.png');

  log('');
  log('=== 4) 部署一局, 确认 HUD / 触控层也跟着缩进 ===');
  await ev(`(function(){document.querySelector('#aspectRow [data-aspect="16:9"]').click();
    el('menu').classList.add('hidden'); startMatch(); showDeploy(false); selectedSpawn=-1; deployPlayer(); return 'OK';})()`);
  await sleep(2500);
  log('  ' + await ev(snap));
  log('  小地图位置(应落在渲染区内, top≈40+18=58) : ' + await ev(`(function(){const r=el('minimapWrap').getBoundingClientRect();
    return Math.round(r.left)+','+Math.round(r.top)+' 尺寸 '+Math.round(r.width)+'x'+Math.round(r.height);})()`));
  await shot('aspect_ingame_16_9.png');

  log('');
  log('=== 5) 持久化 ===');
  await rpc('Page.navigate', { url: URL });
  await sleep(15000);
  log('  重载后 SETTINGS.aspect (应 16:9) : ' + await ev(`SETTINGS.aspect`));
  log('  重载后渲染区 : ' + await ev(`(function(){const r=viewRect();return r.x+','+r.y+' '+r.w+'x'+r.h;})()`));

  log('');
  log('=== 6) 异常 ===');
  log(errs.length ? errs.slice(0, 10).join('\n') : '无');
  finish(0);
})().catch(e => { log('FATAL ' + e.message); finish(1); });
