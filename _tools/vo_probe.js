// 配音冒烟探针: 加载游戏, 调用 VO.load/play, 验证清单、播放、字幕
// 用法: node _tools/vo_probe.js [url]
const http = require('http');
const { spawn } = require('child_process');
const os = require('os');

const URL_ = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9331;
const profile = os.tmpdir() + '/vo-probe-' + Date.now();
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  '--window-size=1440,900', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required',
  '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  'about:blank'
], { stdio: ['ignore', 'pipe', 'pipe'] });
let stderr = '';
chrome.stderr.on('data', d => { stderr += d.toString(); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = p => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: PORT, path: p }, r => {
    let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
  }).on('error', rej);
});

let idc = 0;
function rpc(ws, method, params) {
  const id = ++idc;
  return new Promise((res, rej) => {
    const on = raw => {
      let m; try { m = JSON.parse(raw); } catch (e) { return; }
      if (m.id === id) { ws.off('message', on); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    };
    ws.on('message', on);
    ws.send(JSON.stringify({ id, method, params: params || {} }));
    setTimeout(() => { ws.off('message', on); rej(new Error('rpc timeout ' + method)); }, 60000);
  });
}

(async () => {
  let page;
  for (let i = 0; i < 70; i++) {
    try { const l = await getJSON('/json/list'); if (l && l.length) { page = l.find(t => t.type === 'page') || l[0]; break; } } catch (e) { }
    await sleep(400);
  }
  if (!page) { console.log(JSON.stringify({ fatal: 'cdp not ready', stderr: stderr.slice(-800) })); process.exit(1); }

  const WebSocket = require('./ws');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
  const errors = [];
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (m.method === 'Runtime.exceptionThrown') errors.push('EXC ' + (m.params.exceptionDetails.exception || {}).description);
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errors.push('ERR ' + (m.params.args || []).map(a => a.value !== undefined ? a.value : a.description).join(' '));
    }
  });
  await rpc(ws, 'Runtime.enable'); await rpc(ws, 'Page.enable');
  await rpc(ws, 'Page.addScriptToEvaluateOnNewDocument', {
    source: 'window.__errs=[];addEventListener("error",e=>window.__errs.push(String(e.message)));addEventListener("unhandledrejection",e=>window.__errs.push("REJ:"+String(e.reason)));'
  });
  await rpc(ws, 'Page.navigate', { url: URL_ });
  await sleep(15000);

  const expr = `(async()=>{
    const out={};
    try{
      try{ AudioSys.init(); }catch(e){}
      await VO.load();
      out.ready=VO.state.ready; out.n=VO.state.lines.length; out.err=VO.state.err;
      out.files=VO.state.lines.slice(0,0).length;
      VO.play('m_deploy',{force:true,priority:1});
      await new Promise(r=>setTimeout(r,1100));
      const a=VO.state.cur&&VO.state.cur.audio;
      out.play={has:!!a, paused:a?a.paused:null, t:a?+a.currentTime.toFixed(2):null, vol:a?a.volume:null};
      out.sub={cls:document.getElementById('voSub').className, who:document.getElementById('voWho').textContent,
               line:(document.getElementById('voLine').textContent||'').slice(0,40)};
      out.duckDuring=(typeof AudioSys!=='undefined'&&AudioSys.duckLevel)?AudioSys.duckLevel():null;
      VO.playBrief(1,{force:true});
      await new Promise(r=>setTimeout(r,700));
      const b=VO.state.cur&&VO.state.cur.audio;
      out.brief={has:!!b, paused:b?b.paused:null, t:b?+b.currentTime.toFixed(2):null,
                 subCls:document.getElementById('voSub').className};
      VO.stop();
      await new Promise(r=>setTimeout(r,200));
      out.stopped={cur:!!VO.state.cur, subCls:document.getElementById('voSub').className,
                   duck:(typeof AudioSys!=='undefined'&&AudioSys.duckLevel)?AudioSys.duckLevel():null};
      const nav=document.querySelector('[data-p="mStory"]');
      out.hasNav=!!nav;
      if(nav) nav.click();
      await new Promise(r=>setTimeout(r,400));
      const btn=document.querySelector('[data-brief="1"]');
      out.hasBtn=!!btn;
      if(btn){ btn.click(); await new Promise(r=>setTimeout(r,900)); }
      out.panelBrief={id:VO.state.cur&&VO.state.cur.entry.id, has:!!(VO.state.cur&&VO.state.cur.audio),
                      subCls:document.getElementById('voSub').className};
      const back=document.querySelector('.backBtn');
      if(back) back.click();
      await new Promise(r=>setTimeout(r,350));
      out.leftPanelStops=!VO.state.cur;
      VO.stop();
      SRAID.ch=STORY_CHAPTERS[0]; SRAID.live=true; SRAID.obj=[];
      storyFireEvent(STORY_CHAPTERS[0].events[0]);
      await new Promise(r=>setTimeout(r,900));
      out.ev={id:VO.state.cur&&VO.state.cur.entry.id, cls:document.getElementById('voSub').className,
              line:(document.getElementById('voLine').textContent||'').slice(0,30)};
      VO.stop();
      try{
        out.wrapped={deploy:!!deployPlayer.__voWrapped,
                     end:!!startEndCut.__voWrapped,
                     raid:!!finishRaid.__voWrapped};
        el('menu').classList.add('hidden');
        startMatch();
        showDeploy(false);
        selectedSpawn=-1;
        deployPlayer();
        await new Promise(r=>setTimeout(r,600));
        out.deployHook={deployed:!!player.deployed, vo:VO.state.cur&&VO.state.cur.entry.id,
                        cls:document.getElementById('voSub').className};
        VO.play('s1_e0',{force:true});
        await new Promise(r=>setTimeout(r,900));
        out.shotSub={cls:document.getElementById('voSub').className,
                     line:(document.getElementById('voLine').textContent||'').slice(0,24)};
      }catch(e){ out.deployErr=String(e); }
    }catch(e){ out.fatal=String(e&&e.stack||e); }
    out.errs=window.__errs||[];
    return out;
  })()`;

  const r = await rpc(ws, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  let shot = false;
  try {
    const s = await rpc(ws, 'Page.captureScreenshot', { format: 'png' });
    require('fs').writeFileSync('_vo_shot.png', Buffer.from(s.data, 'base64'));
    shot = true;
  } catch (e) { }
  console.log(JSON.stringify({ result: r.result && r.result.value, shot: shot, exceptions: errors.slice(0, 8) }, null, 1));
  try { chrome.kill(); } catch (e) { }
  process.exit(0);
})();
