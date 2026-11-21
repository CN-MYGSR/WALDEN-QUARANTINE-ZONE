// 配音冒烟探针: 加载游戏, 调用 VO.load/play, 验证清单、播放、字幕
// 用法: node _tools/vo_probe.js [url] [Chrome 调试端口]
const http = require('http');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const os = require('os');

const URL_ = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = Number(process.argv[3]||9331);
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
  await rpc(ws,'Network.enable');
  await rpc(ws,'Network.setBlockedURLs',{urls:['*://gamesvibe.app/*','*://vibe.lumigrav.space/*']});
  await rpc(ws, 'Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__errs=[];addEventListener("error",e=>window.__errs.push(String(e.message)));
      addEventListener("unhandledrejection",e=>window.__errs.push("REJ:"+String(e.reason)));
      window.VibeHubWorkshop={beforeStart:Promise.resolve(),markGameReady(){}};
      const nextFrame=requestAnimationFrame.bind(window);
      window.requestAnimationFrame=fn=>fn.name==="loop"?0:nextFrame(fn);`
  });
  await rpc(ws, 'Page.navigate', { url: URL_ });
  const deadline=Date.now()+60000;
  while(Date.now()<deadline){
    const ready=await rpc(ws,'Runtime.evaluate',{expression:'document.readyState==="complete"&&typeof VO!=="undefined"&&typeof el("deployBtn").onclick==="function"',returnByValue:true});
    if(ready.result?.value) break;
    await sleep(150);
  }

  const expr = `(async()=>{
    const out={};
    const waitFor=async(fn,msg)=>{
      const deadline=performance.now()+15000;
      while(!fn()){ if(performance.now()>=deadline) throw Error(msg); await new Promise(r=>setTimeout(r,30)); }
    };
    const playing=id=>VO.state.cur?.entry.id===id&&VO.state.cur.audio.currentTime>.02;
    try{
      try{ AudioSys.init(); }catch(e){}
      await VO.load();
      out.ready=VO.state.ready; out.n=VO.state.lines.length; out.err=VO.state.err;
      out.files=new Set(VO.state.lines.map(line=>line.file)).size;
      VO.play('m_objective',{force:true,priority:1});
      await waitFor(()=>playing('m_objective'),'首段播报未播放');
      const a=VO.state.cur&&VO.state.cur.audio;
      out.play={has:!!a, paused:a?a.paused:null, t:a?+a.currentTime.toFixed(2):null, vol:a?a.volume:null};
      out.sub={cls:document.getElementById('voSub').className, who:document.getElementById('voWho').textContent,
               line:(document.getElementById('voLine').textContent||'').slice(0,40)};
      out.duckDuring=(typeof AudioSys!=='undefined'&&AudioSys.duckLevel)?AudioSys.duckLevel():null;
      VO.playBrief(1,{force:true});
      await waitFor(()=>playing('s1_brief'),'第一章简报未播放');
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
      out.chapters=[];
      for(let i=0;i<STORY_CHAPTERS.length;i++){
        document.querySelector('[data-chapter="'+i+'"]').click();
        const btn=document.querySelector('[data-brief="'+(i+1)+'"]');
        btn.click();
        const id='s'+(i+1)+'_brief';
        await waitFor(()=>playing(id)&&btn.getAttribute('aria-pressed')==='true','简报未播放 '+id);
        out.chapters.push({id,locked:document.querySelector('[data-story]').disabled});
        btn.click();
        if(VO.state.cur||btn.getAttribute('aria-pressed')!=='false') throw Error('简报未停止 '+id);
      }
      const back=document.querySelector('#mStory .backBtn');
      document.querySelector('[data-brief]').click();
      if(back) back.click();
      await new Promise(r=>setTimeout(r,350));
      out.leftPanelStops=!VO.state.cur&&el('mHome').checkVisibility()&&AudioSys.duckLevel()===1;
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
        await waitFor(()=>playing('m_deploy'),'部署播报未播放');
        out.deployHook={deployed:!!player.deployed, vo:VO.state.cur&&VO.state.cur.entry.id,
                        cls:document.getElementById('voSub').className};
        VO.play('s1_e0',{force:true});
        await new Promise(r=>setTimeout(r,900));
        out.shotSub={cls:document.getElementById('voSub').className,
                     line:(document.getElementById('voLine').textContent||'').slice(0,24)};
        player.die(null,true);
        await waitFor(()=>matchOver&&playing('m_defeat'),'阵亡播报未播放');
        out.defeat=el('endTitle').textContent;
        beginRaid(); el('deployBtn').click();
        await waitFor(()=>player.deployed&&player.alive,'二次部署失败');
        matchTime=0; updateExtraction(.05);
        await waitFor(()=>matchOver&&playing('m_signal_lost'),'超时播报未播放');
        out.timeout=el('endTitle').textContent;
      }catch(e){ out.deployErr=String(e); out.state=[GAMEMODE,matchOver,player.alive,player.downed,RUN.deathTimer,el('endTitle').textContent,VO.state.cur?.entry.id,VO.state.last]; }
    }catch(e){ out.fatal=String(e&&e.stack||e); }
    out.errs=window.__errs||[];
    return out;
  })()`;

  const r = await rpc(ws, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  let shot = false;
  try {
    const s = await rpc(ws, 'Page.captureScreenshot', { format: 'png' });
    const fs=require('node:fs'), path=require('node:path');
    const output=path.join(__dirname,'..','outputs','操作验证');
    fs.mkdirSync(output,{recursive:true});
    fs.writeFileSync(path.join(output,'剧情-配音验收.png'),Buffer.from(s.data,'base64'));
    shot = true;
  } catch (e) { }
  console.log(JSON.stringify({ result: r.result && r.result.value, shot: shot, exceptions: errors.slice(0, 8) }, null, 1));
  const actual=r.result.value;
  assert.deepEqual(errors,[]); assert.deepEqual(actual.errs,[]);
  assert.equal(actual.fatal,undefined); assert.equal(actual.deployErr,undefined);
  assert.equal(actual.files,30); assert.equal(actual.ready,true);
  assert(actual.play.t>0 && actual.play.paused===false && actual.sub.cls.includes('on') && actual.duckDuring<1);
  assert(actual.brief.t>0 && actual.brief.paused===false && !actual.brief.subCls.includes('on'));
  assert.equal(actual.stopped.duck,1); assert.equal(actual.stopped.cur,false);
  assert.equal(actual.chapters.length,6); assert.deepEqual(actual.chapters.map(c=>c.locked),[false,true,true,true,true,true]);
  assert.equal(actual.leftPanelStops,true); assert.equal(actual.ev.id,'s1_e0'); assert(actual.ev.cls.includes('on') && actual.ev.line);
  assert.equal(actual.deployHook.vo,'m_deploy'); assert.equal(actual.deployHook.deployed,true);
  assert(actual.shotSub.cls.includes('on') && actual.shotSub.line);
  assert.equal(actual.defeat,'撤离失败'); assert.equal(actual.timeout,'无线电信号丢失');
})().then(()=>{chrome.kill();process.exit(0);},e=>{console.error(e);chrome.kill();process.exit(1);});
