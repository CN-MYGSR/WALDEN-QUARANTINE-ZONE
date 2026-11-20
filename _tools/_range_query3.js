// 靶场诊断: 直接重跑 layoutRange() 抓异常 + 统计各类网格
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9727;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => { out.push(s); console.log(s); };
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c){
  try { if (ws) ws.close(); } catch (e) {}
  try { if (proc) proc.kill(); } catch (e) {}
  fs.writeFileSync(path.join(ROOT, '_tools', '_range_query3.txt'), out.join('\n') + '\n', 'utf8');
  process.exit(c);
}

(async () => {
  const ud = path.join(require('os').tmpdir(), 'rq3_' + Date.now());
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
    if (j.method === 'Runtime.exceptionThrown') {
      const d = j.params.exceptionDetails;
      const s = ((d.exception || {}).description || d.text || '').split('\n').slice(0, 3).join(' | ');
      if (errs.indexOf(s) < 0) errs.push(s);
    }
  });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable');
  const ev = async e => {
    const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true });
    if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0];
    return o.result && o.result.result ? o.result.result.value : String(o);
  };

  await rpc('Page.navigate', { url: URL });
  await sleep(14000);
  const idx = await ev(`(function(){ for(let i=0;i<CAMPAIGNS.length;i++) if(CAMPAIGNS[i].rangeOnly) return i; return -1; })()`);
  await ev(`(function(){ localStorage.setItem('sf_campaign','${idx}'); localStorage.setItem('sf_range','1'); localStorage.setItem('sf_autodeploy','1'); return 1; })()`);
  errs = [];
  await rpc('Page.navigate', { url: URL });
  await sleep(17000);

  log('加载期异常 = ' + (errs.length ? JSON.stringify(errs) : '无'));
  log('layoutRange 走到第几步 = ' + await ev('window.__rangeStep'));
  log('world 子对象(首次) = ' + await ev('world.children.length'));
  log('world 子对象 = ' + await ev(`world.children.length`));
  log('【首次加载】按材质统计 = ' + await ev(`(function(){var m={};world.children.forEach(function(o){if(!o.material||!o.material.color)return;var k=o.material.color.getHexString();m[k]=(m[k]||0)+1});var r=Object.keys(m).map(function(k){return k+':'+m[k]});r.sort();return r.join('  ')})`));
  log('scene 子对象 = ' + await ev(`scene.children.length`));

  log('');
  log('=== 重跑 layoutRange() ===');
  log(await ev(`(function(){
    try{ layoutRange(); return 'ok (没有抛错)'; }
    catch(e){ return 'EXC: '+e.message+'\\n  stack: '+String(e.stack||'').split('\\n').slice(1,3).join(' | '); }
  })()`));
  log('重跑后 world 子对象 = ' + await ev(`world.children.length`));

  log('');
  log('=== 按材质统计 (重跑后) ===');
  log(await ev(`(function(){
    var m={};
    world.children.forEach(function(o){
      if(!o.material||!o.material.color) return;
      var k=o.material.color.getHexString();
      m[k]=(m[k]||0)+1;
    });
    var rows=Object.keys(m).map(function(k){return k+':'+m[k]});
    rows.sort();
    return rows.join('  ');
  })()`));
  return finish(0);
})().catch(e => { log('FATAL ' + e.message); finish(1); });
