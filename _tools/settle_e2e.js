'use strict';
// node _tools/settle_e2e.js [沙盒地图下标] [本地游戏 URL]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { setTimeout: sleep } = require('node:timers/promises');
const WS = require('./ws');
const url = process.argv[3] || 'http://127.0.0.1:8123/';
const map = Number(process.argv[2] || 0);
const out = path.join(__dirname, '..', 'outputs');
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(fs.existsSync);

async function run(){
  const proc = spawn(chrome, ['--headless=new','--guest','--remote-debugging-port=0',
    '--user-data-dir='+path.join(out,'settle-probe-chrome'),'--no-first-run','--disable-background-networking',
    '--no-default-browser-check','--enable-unsafe-swiftshader','--use-angle=swiftshader','--mute-audio','about:blank'],
    {stdio:['ignore','ignore','pipe'],windowsHide:true});
  let ws;
  try{
    const debugPort=await new Promise((resolve,reject)=>{
      proc.on('error',reject);
      proc.once('exit',code=>reject(Error('Chrome exited '+code)));
      let log='';
      proc.stderr.on('data',chunk=>{
        log=(log+chunk).slice(-2000);
        const hit=log.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
        if(hit) resolve(hit[1]);
      });
    });
    const pages=await (await fetch('http://127.0.0.1:'+debugPort+'/json/list')).json();
    ws=new WS(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
    await new Promise((ok,fail)=>{ws.on('open',ok);ws.on('error',fail)});
    const pending=new Map(), errors=[];
    let id=0;
    ws.on('message',msg=>{
      const j=JSON.parse(msg), p=pending.get(j.id);
      if(p){ pending.delete(j.id); j.error?p.reject(Error(j.error.message)):p.resolve(j.result); }
      if(j.method==='Runtime.exceptionThrown') errors.push(j.params.exceptionDetails.exception?.description||j.params.exceptionDetails.text);
    });
    function call(method,params={}){
      return new Promise((resolve,reject)=>{
        pending.set(++id,{resolve,reject}); ws.send(JSON.stringify({id,method,params}));
      });
    }
    async function read(expression){
      const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
      if(r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
      return r.result.value;
    }
    async function until(condition){
      const end=Date.now()+65000;
      while(Date.now()<end){ if(await read(condition).catch(()=>false)) return; await sleep(120); }
      throw Error('Timeout: '+condition+'; '+await read('JSON.stringify({focus:document.activeElement.id,screen:document.querySelector(".screen:not(.hidden)")?.id,events:window.__reportEvents})'));
    }
    async function resize(width,height,touch=false){
      await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:touch});
      await call('Emulation.setTouchEmulationEnabled',{enabled:touch});
      await read('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))');
    }
    async function press(selector,touch=false){
      const pos=await read(`(()=>{const b=document.querySelector(${JSON.stringify(selector)});
        b.scrollIntoView({block:'nearest'});const r=b.getBoundingClientRect();
        const x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);
        if(!b.contains(hit)||b.disabled)throw Error('无法操作 '+b.id+' '+r.toJSON().width+'×'+r.height+' '+hit?.id);
        return {x,y}})()`);
      if(touch){
        await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[pos]});
        await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      }else{
        for(const type of ['mousePressed','mouseReleased']) await call('Input.dispatchMouseEvent',{type,...pos,button:'left',clickCount:1});
      }
    }
    async function screenshot(name){
      const dest=path.join(out,'操作验证',name+'.jpg');
      fs.mkdirSync(path.dirname(dest),{recursive:true});
      const result=await call('Page.captureScreenshot',{format:'jpeg',quality:82});
      fs.writeFileSync(dest,Buffer.from(result.data,'base64'));
    }
    const active=selector=>`!!document.querySelector(${JSON.stringify(selector)})?.getClientRects().length`;
    const deploy=async(touch=false)=>{
      await press('#deployBtn',touch); await until('player.alive&&player.deployed');
      await read('if(CUT.active&&CUT.kind==="deploy") updateCutscene(CUT.dur)');
    };
    await call('Runtime.enable'); await call('Network.enable'); await call('Page.enable');
    await call('Network.setBlockedURLs',{urls:['*://gamesvibe.app/*','*://vibe.lumigrav.space/*']});
    // Advance the actual extraction and cutscene timers in the test, without waiting for AI combat.
    await call('Page.addScriptToEvaluateOnNewDocument',{source:`
      if(!sessionStorage.getItem('settle-init')){localStorage.clear();localStorage.setItem('sf_campaign',${JSON.stringify(String(map))});sessionStorage.setItem('settle-init','1')}
      const nextFrame=requestAnimationFrame.bind(window);window.requestAnimationFrame=f=>f.name==='loop'?0:nextFrame(f);
      window.__reportEvents=[];for(const type of ['pointerdown','pointerup','pointercancel','click']){
        document.addEventListener(type,e=>{window.__reportEvents.push(type+':'+e.target.id);window.__reportEvents=window.__reportEvents.slice(-8)},true)
      }
    `});
    await resize(1280,720);
    await call('Page.navigate',{url});
    await until('typeof el==="function"&&!!el("startBtn").onclick&&typeof finishRangeTraining==="function"');
    await press('[data-p=mPlay]'); await press('#startBtn'); await deploy();
    const initial=await read('[ELO.raids,META.loot.water||0,META.loot.chip||0]');
    await read(`RUN.loot={water:2};RUN.secure=['chip'];RUN.kills=4;RUN.searches=3;
      player.pos.x=EXTRACT_POINTS[0].x;player.pos.z=EXTRACT_POINTS[0].z;updateExtraction(0.05)`);
    assert.equal(await read('RUN.extracting&&!!VO.state.last.m_extract_hold'),true);
    await read('updateExtraction(EXTRACT_POINTS[0].holdTime||3)');
    await until(active('#endTitle'));
    assert.equal(await read('el("endTitle").textContent'),'撤离成功');
    assert.equal(await read('!!VO.state.last.m_extract_ok'),true);
    assert.deepEqual(await read('[...el("endStats").querySelectorAll("dd")].map(n=>n.textContent)'),['4','3','3 件']);
    assert.deepEqual(await read('[ELO.raids,META.loot.water,META.loot.chip]'),[initial[0]+1,initial[1]+2,initial[2]+1]);
    assert.equal(await read('JSON.parse(localStorage.bf_meta_v1).loot.water===META.loot.water&&el("endStats").textContent.includes("ELO 动态难度")'),true);
    await screenshot('行动战报-撤离-桌面');
    await press('#againBtn'); await until(active('#mPlay'));
    assert.equal(await read('el("voSub").parentElement.id'),'ui');
    await press('#startBtn'); await deploy();
    const equipment=await read('({...META.owned})');
    await read("RUN.loot={water:3};RUN.secure=['chip'];RUN.insured=true;const roll=Math.random;try{Math.random=()=>0.31;player.die(null,true)}finally{Math.random=roll}");
    await until(active('#endTitle'));
    assert.equal(await read('el("endTitle").textContent'),'撤离失败');
    assert.equal(await read('!!VO.state.last.m_defeat'),true);
    assert.deepEqual(await read('[RUN.failComp>0,META.insurance.length,RUN.returnedGear.length>0,META.loot.water,META.loot.chip]'),[true,0,true,initial[1]+2,initial[2]+2]);
    assert.equal(await read('RUN.returnedGear.every(k=>ownedCount(k)>0)&&el("endStats").textContent.includes("保险返还")'),true);
    const returned=await read('RUN.returnedGear.map(k=>[k,ownedCount(k),RUN.autoKit.includes(k)])');
    for(const [key,count,granted] of returned) assert.deepEqual([count,granted],[equipment[key],false],key+' received twice');
    await resize(390,844,true);
    await read("VO.play('m_defeat',{force:true,priority:1})");
    await until(active('#end #voSub.on'));
    assert.equal(await read(`(()=>{const caption=el('voSub').getBoundingClientRect();
      return el('endStats').getBoundingClientRect().bottom<=caption.top+1&&caption.bottom<=document.querySelector('.reportActions').getBoundingClientRect().top+1})()`),true);
    await screenshot('行动战报-阵亡-手机');
    await resize(844,390,true);
    assert.equal(await read('el("endStats").scrollHeight>el("endStats").clientHeight'),true);
    await read('el("endStats").scrollTop=el("endStats").scrollHeight');
    await press('#armoryBtn',true); await until(active('#mArmory'));
    assert.equal(await read('el("voSub").parentElement.id'),'ui');
    assert.equal(await read("ARMORY_TAB"),'loot');
    console.log('PASS 撤离、死亡、安全箱、保险、仓库存档和跨页重开');
    await press('#mArmory .backBtn',true); await until(active('#mHome'));
    const personal=await read('META');
    const rangeReady='typeof rangeActive==="function"&&rangeActive()&&!el("deploy").classList.contains("hidden")&&!!el("rangeExitBtn")';
    await press('#rangeBtn',true); await until(rangeReady);
    await press('#rangeExitBtn',true);
    await until('typeof el==="function"&&typeof rangeActive==="function"&&!rangeActive()&&!!el("rangeBtn").onclick');
    await press('#rangeBtn',true); await until(rangeReady); await deploy(true);
    await read(`const target=RANGE.targets[0].board.position, origin=target.clone();origin.z+=1;
      fireBullet(player,origin,V3(0,0,-1),player.curW.def,null);
      fireBullet(player,origin,V3(0,1,0),player.curW.def,null);
      showDeploy(false)`);
    await press('#rangeExitBtn',true); await until(active('#endTitle'));
    assert.equal(await read('el("endTitle").textContent'),'训练结束');
    assert.deepEqual(await read('[...el("endStats").querySelectorAll("dd")].map(n=>n.textContent)'),['2','1','50%']);
    assert.deepEqual(await read('META'),personal,'training changed the warehouse or career');
    await screenshot('行动战报-靶场-横屏');
    await press('#againBtn',true); await until(rangeReady); await deploy(true);
    assert.deepEqual(await read('[RANGE.shots,RANGE.hits]'),[0,0]);
    await read('showDeploy(false)'); await press('#rangeExitBtn',true); await press('#armoryBtn',true);
    await until('typeof el==="function"&&typeof rangeActive==="function"&&!rangeActive()&&!!el("rangeBtn").onclick');
    console.log('PASS 靶场部署前返回、2 发 1 中、再练清零、返回主菜单');
    await press('[data-p=mPlay]',true); await press('#startBtn',true); await deploy(true);
    const balance=await read('META.wallet');
    await read('matchTime=.01;updateExtraction(.05);updateExtraction(.05)');
    assert.deepEqual(await read('[el("endTitle").textContent,!!VO.state.last.m_signal_lost,META.wallet-RUN.failComp]'),['无线电信号丢失',true,balance]);
    for(const [winner,title,voice] of [[0,'胜利','m_victory'],[1,'战败','m_defeat'],[-1,'平局','m_draw']]){
      await read('matchOver=false;player.team=0;endMatch('+winner+');updateCutscene(CUT.dur)');
      assert.deepEqual(await read('[el("endTitle").textContent,!!VO.state.last['+JSON.stringify(voice)+'],el("endStats").querySelector("h2").textContent]'),[title,true,'双方剩余兵力']);
    }
    console.log('PASS 超时不重复补偿，胜负平战报与对应播报');
    assert.deepEqual(errors,[]);
  }finally{
    if(ws && ws.readyState===1) ws.send(JSON.stringify({id:100000,method:'Browser.close'}));
    else proc.kill();
    ws?.close();
  }
}
run().catch(e=>{console.error(e);process.exitCode=1});
