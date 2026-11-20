// 亮度体检: 直接读光照/雾参数 (亮度的真实来源), 比采样像素稳
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const ROUNDS = parseInt(process.argv[3] || '8', 10);
const PORT = 9921;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(String(s));
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) {
  try { if (ws) ws.close(); } catch (e) { }
  try { if (proc) proc.kill(); } catch (e) { }
  try { fs.writeFileSync(path.join(ROOT, '_tools', '_brightness_probe.txt'), out.join('\n') + '\n', 'utf8'); } catch (e) { }
  process.exit(c);
}
process.on('uncaughtException', e => { log('!! uncaught: ' + e.message); finish(1); });
process.on('unhandledRejection', e => { log('!! unhandled: ' + (e && e.message)); finish(1); });

(async () => {
  const ud = path.join(require('os').tmpdir(), 'bl_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,760', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  await sleep(2500);
  let list = null;
  for (let i = 0; i < 40; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list && list.length) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page');
  if (!page) { log('NO_PAGE'); return finish(1); }
  ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {};
  ws.on('message', m => { try { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); } catch (e) { } });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable');
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (o.result && o.result.exceptionDetails) return 'EXC'; return o.result && o.result.result ? o.result.result.value : String(o); };

  log('亮度体检 · 直接读光照参数');
  log('判据: sun.intensity 与 hemi.intensity 决定画面基础亮度; fog.far 决定能看多远');
  log('');
  log('地图   天气        sun.intensity  hemi.intensity  fog.far   fog.near  AI视距');
  log('------ ---------- -------------- --------------- --------- --------- --------');

  const MAPS = [['3', '机场'], ['1', '实验室']];
  for (let r = 0; r < ROUNDS; r++) {
    const [m, name] = MAPS[r % MAPS.length];
    await ev(`(function(){ localStorage.setItem('sf_campaign','${m}'); localStorage.setItem('sf_autodeploy','0'); return 1; })()`).catch(() => { });
    await rpc('Page.navigate', { url: URL + '?r=' + r }).catch(() => { });
    await sleep(13000);
    const row = await ev(`(function(){
      try{
        if(typeof WEATHER_MODE==='undefined'||typeof scene==='undefined') return 'NOT_READY';
        var sun=null,hemi=null;
        scene.traverse(function(o){
          if(o.isDirectionalLight&&!sun) sun=o;
          if(o.isHemisphereLight&&!hemi) hemi=o;
        });
        var wd=70*(typeof EFF_DIFF!=='undefined'&&EFF_DIFF.visMul?EFF_DIFF.visMul:1)*(1+(WFX.sight-1)*0.5);
        return [WEATHER_MODE,
          sun?sun.intensity.toFixed(2):'?',
          hemi?hemi.intensity.toFixed(2):'?',
          scene.fog?scene.fog.far.toFixed(0):'?',
          scene.fog?scene.fog.near.toFixed(0):'?',
          wd.toFixed(0)+'m'
        ].join('|');
      }catch(e){ return 'EXC '+e.message; }
    })()`);
    const p = String(row).split('|');
    if (p.length < 6) { log('  ' + name + '   ' + row); continue; }
    const pad = (s, n) => String(s).padEnd(n, ' ');
    log('  ' + pad(name, 6) + pad(p[0], 11) + pad(p[1], 15) + pad(p[2], 16) + pad(p[3], 10) + pad(p[4], 10) + p[5]);
  }

  log('');
  log('参考: 晴朗白天 sun≈2.0 hemi≈0.75; 夜晚 sun≈0.11 hemi≈0.16 (KEY_BASE=THEME.sunI*0.055)');
  log('实验室的 dimLight=0.42 会在上述基础上再乘一遍');
  finish(0);
})();
