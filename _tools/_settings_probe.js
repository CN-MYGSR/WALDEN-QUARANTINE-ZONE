'use strict';
// node _tools/_settings_probe.js [game URL] — drives the visible menus in an isolated Chrome profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {setTimeout: sleep} = require('node:timers/promises');
const WS = require('./ws');
const game = new URL(process.argv[2] || 'http://127.0.0.1:8123/');
const report = [];
const log = text => { report.push(text); console.log(text); };

async function run() {
  const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--remote-debugging-port=0', '--incognito', '--mute-audio', '--no-first-run',
    '--enable-unsafe-swiftshader', '--user-data-dir=' + path.resolve(__dirname, '../outputs/settings-probe-browser'), 'about:blank'
  ], {stdio:['ignore','ignore','pipe'], windowsHide:true});
  let ws;
  try {
    const browserUrl = await new Promise((ok, fail) => {
      const timeout = setTimeout(() => fail(Error('Chrome did not start')), 20000);
      chrome.once('error', e => { clearTimeout(timeout); fail(e); });
      chrome.once('exit', () => { clearTimeout(timeout); fail(Error('Chrome exited')); });
      chrome.stderr.on('data', data => {
        const url = /DevTools listening on (ws:\/\/\S+)/.exec(String(data))?.[1];
        if (url) { clearTimeout(timeout); ok(url); }
      });
    });
    const pages = await (await fetch('http://' + new URL(browserUrl).host + '/json/list')).json();
    ws = new WS(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
    await new Promise((ok, fail) => { ws.once('open', ok); ws.once('error', fail); });
    let seq=0;
    const pending=new Map(), errors=[];
    ws.on('message', data => {
      const msg=JSON.parse(data), call=pending.get(msg.id);
      if (call) {
        pending.delete(msg.id);
        msg.error ? call.fail(Error(msg.error.message)) : call.ok(msg.result);
      }
      if (msg.method==='Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    });
    const rpc=(method,params={})=>new Promise((ok,fail)=>{
      pending.set(++seq,{ok,fail}); ws.send(JSON.stringify({id:seq,method,params}));
    });
    async function read(expression){
      const r=await rpc('Runtime.evaluate',{expression,returnByValue:true});
      if(r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
      return r.result.value;
    }
    async function wait(expression){
      const end=Date.now()+60000;
      while(!await read(expression).catch(()=>false)){
        if(Date.now()>end) throw Error('Timed out: '+expression);
        await sleep(90);
      }
    }
    const bad=[];
    async function expect(name,expression,value){
      const actual=await read(expression);
      try { assert.deepEqual(actual,value); log('PASS '+name); }
      catch { bad.push(name); log('FAIL '+name+' — '+JSON.stringify(actual)+' / expected '+JSON.stringify(value)); }
    }
    async function center(selector){
      return read(`(()=>{const b=document.querySelector(${JSON.stringify(selector)}); if(!b)throw Error('Missing control'); b.scrollIntoView({block:'nearest'});const {left,top,width,height}=b.getBoundingClientRect(); if(!width||!height)throw Error('Hidden control: '+b.outerHTML.slice(0,80)); return {x:left+width/2,y:top+height/2};})()`);
    }
    const touch=(type,p)=>rpc('Input.dispatchTouchEvent',{type,touchPoints:p?[{...p,id:1}]:[]});
    const mouse=(type,p)=>rpc('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1,buttons:type==='mouseReleased'?0:1});
    let mobile=false;
    async function press(selector){
      const p=await center(selector);
      if(mobile){ await touch('touchStart',p); await touch('touchEnd'); }
      else { await mouse('mousePressed',p); await mouse('mouseReleased',p); }
      await sleep(40);
    }
    async function screenshot(name){
      const dir=path.resolve(__dirname,'../outputs/操作验证');
      fs.mkdirSync(dir,{recursive:true});
      const {data}=await rpc('Page.captureScreenshot',{format:'jpeg',quality:88});
      fs.writeFileSync(path.join(dir,name+'.jpg'),Buffer.from(data,'base64'));
    }
    const key=(type,code,k,vk)=>rpc('Input.dispatchKeyEvent',{type,code,key:k,windowsVirtualKeyCode:vk});
    async function tapKey(code,k,vk){ await key('keyDown',code,k,vk); await key('keyUp',code,k,vk); }
    let visits=0;
    async function open(width,height,withTouch){
      mobile=withTouch;
      await rpc('Emulation.setDeviceMetricsOverride',{width,height,mobile,deviceScaleFactor:1});
      await rpc('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:5});
      const url=new URL(game); url.searchParams.set('settings-check',String(++visits));
      await rpc('Page.navigate',{url:url.href});
      await wait('location.href==='+JSON.stringify(url.href)+'&&document.readyState==="complete"&&typeof el("startBtn").onclick==="function"');
    }
    await rpc('Page.enable'); await rpc('Runtime.enable'); await rpc('Network.enable');
    await rpc('Network.setBlockedURLs',{urls:['*://gamesvibe.app/*','*://vibe.lumigrav.space/*']});
    await rpc('Page.addScriptToEvaluateOnNewDocument',{source:
      'window.VibeHubWorkshop={beforeStart:Promise.resolve(),markGameReady(){}};'+
      'const nativeFrame=requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>fn.name==="loop"?0:nativeFrame(fn);'
    });
    const homeSettings='#mHome [data-p=mSet]', audio='#tabAudio', input='#tabInput', keys='#tabKeys';
    const score='#keyGrid button[aria-label^="计分板"]';
    await open(1280,720,false);
    await press(homeSettings);
    await press(audio);
    await tapKey('ArrowRight','ArrowRight',39);
    await expect('arrow key selects and focuses the next settings tab','[document.activeElement.id,el("setInput").hidden]', ['tabInput',false]);
    await press(keys);
    await expect('all actions have visible binding controls','el("keyGrid").querySelectorAll("button").length===KEY_ACTIONS.length',true);
    await press(score); await tapKey('Escape','Escape',27);
    await expect('Escape cancels capture and keeps the settings page','[keyOf("score"),_keyCapturing,el("mSet").classList.contains("hidden")]', ['KeyP',null,false]);
    await press(score); await press('#fieldNav [data-route=mPlay]'); await press('#fieldNav [data-route=mSet]');
    await tapKey('KeyL','l',76);
    await expect('leaving and returning cancels the pending binding','[keyOf("score"),_keyCapturing]', ['KeyP',null]);
    await press(score); await tapKey('KeyI','i',73);
    await expect('rebinding swaps occupied shortcuts and saves','[keyOf("score"),keyOf("ammoShop"),JSON.parse(localStorage.bf_keys_v1).score]', ['KeyI','KeyP','KeyI']);
    await screenshot('游戏设置-键位');
    await press('#keyGrid button[aria-label^="前进"]'); await tapKey('KeyL','l',76);
    await expect('forward binding updates movement and retires its old key','[canonKey("KeyL"),canonKey("KeyW")]', ['KeyW',null]);
    await press(audio); await press('#volRange'); await tapKey('Home','Home',36);
    await press(input); await press('#sensRange'); await tapKey('End','End',35);
    await press('#tLayoutBtn');
    const fire=await center('#tFire');
    await mouse('mousePressed',fire); await mouse('mouseMoved',{x:fire.x-80,y:fire.y-60}); await mouse('mouseReleased',{x:fire.x-80,y:fire.y-60});
    await expect('desktop mouse drag pins the chosen button','Object.keys(JSON.parse(localStorage.bf_tbtn_v1))',['tFire']);
    await tapKey('Escape','Escape',27);
    await expect('Escape exits layout editing and restores its opener','[window.LAYOUT_EDIT,document.activeElement.id]',[false,'tLayoutBtn']);
    await press('#tLayoutReset');
    await press('#tabDisplay'); await press('.qualBtn[data-q="0"]');
    await press('#fieldNav [data-route=mPlay]'); await press('#startBtn'); await press('#deployBtn');
    await wait('player.alive&&player.deployed');
    await key('keyDown','KeyI','i',73); await expect('held rebound key opens the scoreboard in a raid','el("scoreboard").style.display','block');
    await key('keyUp','KeyI','i',73); await expect('releasing the scoreboard key closes it','el("scoreboard").style.display','none');
    await key('keyDown','KeyL','l',76); await expect('rebound forward key reaches raid input','keys.KeyW',true); await key('keyUp','KeyL','l',76);
    await open(390,844,true); await press(homeSettings);
    await expect('quality, sensitivity and mute survive reload','[SETTINGS.quality,SETTINGS.sens,SETTINGS.vol,+el("volRange").value]', [0,2,0,0]);
    await press(keys); await expect('key binding survives reload','keyOf("score")','KeyI'); await press('#keyResetBtn');
    await expect('reset restores the defaults and visible labels','[keyOf("score"),el("keyGrid").querySelector("[aria-label^=计分板]").textContent]', ['KeyP','P']);
    for(const [width,height] of [[390,844],[844,390]]){
      await open(width,height,true); await press(homeSettings); await press(input);
      await expect(width+' touches leave field navigation fully visible','[...el("fieldNav").querySelectorAll("button")].every(b=>{const r=b.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.bottom<=innerHeight&&r.right<=innerWidth})',true);
      await press('#tLayoutBtn');
      await expect(width+' opens the touch layout editor','window.LAYOUT_EDIT',true);
      await screenshot('触屏布局编辑-'+width+'x'+height);
      const p=await center('#tBag'), dest={x:Math.round(width*.47),y:Math.round(height*.48)};
      const top=await read(`document.elementFromPoint(${p.x},${p.y})?.closest('.tbtn')?.id`);
      await touch('touchStart',p); await touch('touchMove',dest); await touch('touchEnd');
      await expect(width+' dragging the bag by touch saves only the bag (hit '+top+')','Object.keys(JSON.parse(localStorage.getItem("bf_tbtn_v1")||"{}"))',['tBag']);
      const shop=await center('#tShop'), pin={x:Math.round(width*.68),y:Math.round(height*.58)};
      await touch('touchStart',shop); await touch('touchMove',pin); await touch('touchEnd');
      await expect(width+' a tool can leave the tray and be hit at its new position',
        'document.elementFromPoint('+pin.x+','+pin.y+')?.closest(".tbtn")?.id','tShop');
      const stored=await read('localStorage.bf_tbtn_v1');
      await touch('touchStart',pin); await touch('touchMove',{x:pin.x-60,y:pin.y+42}); await touch('touchCancel');
      await expect(width+' interrupted drag preserves the previous pin','localStorage.bf_tbtn_v1',stored);
      await press('#layoutBar button:last-of-type');
      await expect(width+' finishing returns to the input settings','[window.LAYOUT_EDIT,el("setInput").hidden,el("mSet").classList.contains("hidden"),document.activeElement.id]',[false,false,false,'tLayoutBtn']);
      await open(width,height,true); await press(homeSettings); await press(input);
      await expect(width+' position is restored after reloading','el("tBag").classList.contains("placed")',true);
      await press('#tLayoutReset');
      await expect(width+' reset clears the pin and restores default CSS','[el("tBag").style.left,Object.keys(JSON.parse(localStorage.bf_tbtn_v1)).length]', ['',0]);
    }
    assert.deepEqual(errors,[],'Runtime exceptions');
    assert.deepEqual(bad,[],'Failed checks');
    log('全部通过');
  } finally { ws?.close(); chrome.kill(); }
}
run().catch(err=>{ log(err.stack); process.exitCode=1; }).finally(()=>fs.writeFileSync(path.join(__dirname,'_settings_probe.txt'),report.join('\n')+'\n'));
