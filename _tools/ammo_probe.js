'use strict';
// node _tools/ammo_probe.js [local game URL] [existing Chrome debugging URL]
// The probe owns its incognito context and leaves existing tabs and saves alone.
const assert = require('node:assert/strict');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {setTimeout: sleep} = require('node:timers/promises');
const game = new URL(process.argv[2] || 'http://127.0.0.1:8123/');
let ownChrome;

async function debuggerUrl() {
  if(process.argv[3]){
    const version=await (await fetch(new URL('/json/version',process.argv[3]))).json();
    return version.webSocketDebuggerUrl;
  }
  const profile=path.join(__dirname,'..','outputs','ammo-probe-browser');
  ownChrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new','--remote-debugging-port=0','--user-data-dir='+profile,'--no-first-run',
     '--no-default-browser-check','--mute-audio','about:blank'],{stdio:['ignore','ignore','pipe'],windowsHide:true});
  return new Promise((ok,fail)=>{
    const timer=setTimeout(()=>fail(Error('Chrome did not start its debugger')),20000);
    ownChrome.once('error',e=>{clearTimeout(timer);fail(e);});
    ownChrome.once('exit',()=>{clearTimeout(timer);fail(Error('Chrome exited before debugger became ready'));});
    ownChrome.stderr.on('data',chunk=>{
      const url=/DevTools listening on (ws:\/\/\S+)/.exec(String(chunk))?.[1];
      if(url){clearTimeout(timer);ok(url);}
    });
  });
}

async function run() {
  const socket = new WebSocket(await debuggerUrl());
  await new Promise((ok, fail) => { socket.onopen = ok; socket.onerror = fail; });
  let seq = 0;
  const pending = new Map();
  socket.onmessage = ({data}) => {
    const reply = JSON.parse(data), task = pending.get(reply.id);
    if (!task) return;
    pending.delete(reply.id);
    reply.error ? task.fail(Error(reply.error.message)) : task.ok(reply.result);
  };
  function rpc(method, params = {}, sessionId) {
    return new Promise((ok, fail) => {
      pending.set(++seq, {ok, fail});
      socket.send(JSON.stringify({id:seq, method, params, sessionId}));
    });
  }
  const {browserContextId} = await rpc('Target.createBrowserContext');
  try {
    const {targetId} = await rpc('Target.createTarget', {browserContextId, url:'about:blank'});
    const {sessionId} = await rpc('Target.attachToTarget', {targetId, flatten:true});
    const page = (method, params) => rpc(method, params, sessionId);
    async function read(expression) {
      const result = await page('Runtime.evaluate', {expression, returnByValue:true, userGesture:true});
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    }
    await page('Page.enable');
    await page('Network.enable');
    await page('Network.setBlockedURLs', {urls:['*://gamesvibe.app/*','*://vibe.lumigrav.space/*']});
    await page('Page.addScriptToEvaluateOnNewDocument', {source:
      "window.VibeHubWorkshop={beforeStart:Promise.resolve(),markGameReady(){}};" +
      "const frame=requestAnimationFrame.bind(window);window.requestAnimationFrame=f=>f.name==='loop'?0:frame(f);"
    });
    await page('Page.navigate', {url:new URL('index.html', game).href});
    const end = Date.now()+45000;
    while (!await read("document.readyState==='complete'&&typeof INVGRID!=='undefined'&&typeof el('startBtn').onclick==='function'").catch(()=>false)) {
      if (Date.now()>end) throw Error('game boot timed out');
      await sleep(100);
    }
    // Each assertion runs against the loaded game's definitions. Stepping the reload
    // completion directly keeps the test independent of rendering speed and bot AI.
    const scenarios = await read('('+checkScenarios.toString()+')()');
    for (const [label,actual,expected] of scenarios) {
      assert.deepEqual(actual,expected,label);
      console.log('PASS '+label);
    }
    console.log(scenarios.length+' ammunition checks passed');
  } finally {
    await rpc('Target.disposeBrowserContext',{browserContextId});
    socket.close();
  }
}

function checkScenarios() {
  const results=[];
  const check=(label,actual,expected)=>results.push([label,actual,expected]);
  const migrated=normalizeMeta({seeded:true,seed2:true,owned:{m1911:1,ammo_ap:2},loot:{ammo_ap:1},
    loadout:{primary:'m1911',ammo:['ammo_ap','']}});
  normalizeMeta(migrated);
  check('legacy handgun boxes and selection migrate once',
    [migrated.owned.ammo_pistol_ap,migrated.loot.ammo_pistol_ap,migrated.loadout.ammo[0],migrated.owned.ammo_ap||0,migrated.owned.ammo_pistol_std],
    [2,1,'ammo_pistol_ap',0,1]);
  const legacyMixed=normalizeMeta({seeded:true,seed2:true,owned:{m4:1,m1911:1,ammo_m995:3},
    loadout:{primary:'m4',secondary:'m1911',ammo:['ammo_m995']}});
  check('old rifle stock retains its grade and quantity', [legacyMixed.owned.ammo_m995,legacyMixed.loadout.ammo], [3,['ammo_m995']]);
  check('all weapon families have compatible boxes', Object.keys(WPN_DEFS).every(k=>{
    const cal=ammoCaliberOf(k); return AMMO_DEFS[ammoKeyOfCaliber(cal)].cal===cal;
  }),true);
  check('handguns, submachine guns, carbines and support use the declared game families',
    ['m1911','glock18','mp5','m1carb','m4','mortar'].map(ammoCaliberOf),['pistol','pistol','pistol','rifle','rifle','heavy']);
  check('new sidearm uses only matching starter stock',plannedAmmo(),['ammo_pistol_std']);
  buildDeployConsumables();
  const prepCash=META.wallet;
  document.querySelector('[data-ammo-key="ammo_pistol_std"] [data-ammo-buy]').click();
  check('deployment quick purchase charges once and adds one carried box',
    [META.wallet,ammoStock('ammo_pistol_std'),plannedAmmo().length],[prepCash-180,2,2]);
  Object.assign(META.owned,{m4:1,m1911:1,ammo_std:32,ammo_pistol_std:3});
  Object.assign(META.loadout,{primary:'m4',secondary:'m1911',pack:'packSmall',chest:'',ammo:Array(40).fill('ammo_std')});
  const cap=deployAmmoCapacity();
  check('overbooked loadout is bounded by pack size',plannedAmmo().length,cap);
  META.loadout.ammo=['ammo_std','ammo_std','ammo_std','ammo_pistol_std'];
  el('startBtn').click();
  consumeRaidStart(); selectedSpawn=-1; deployPlayer();
  check('deployment consumes only selected stock and keeps both chambers empty',
    [RUN.loot.ammo_std,RUN.loot.ammo_pistol_std,META.owned.ammo_std,META.owned.ammo_pistol_std,player.slots.map(w=>[w.mag,w.reserve])],
    [3,1,29,2,[[0,0],[0,0]]]);
  VM.state='idle'; const rifle=player.curW, pistol=player.slots[1];
  check('wrong family refuses without touching the bag', [loadAmmoFromBag('ammo_pistol_std'),bagCount('ammo_pistol_std')],[false,1]);
  const complete=()=>{for(let i=0;i<100;i++) if(VM.state==='reload') updateViewModel(.05,player);};
  tryReload(); complete();
  check('reload opens one correct rifle box',[rifle.mag,rifle.reserve,bagCount('ammo_std')],[30,0,2]);
  switchSlot(1); VM.state='idle'; player._raidUseCdT=-99;
  tryReload(); complete();
  check('reload opens only the pistol box',[pistol.mag,pistol.reserve,pistol.ammo,bagCount('ammo_pistol_std')],[7,23,'ammo_pistol_std',0]);
  RUN.loot.ammo_pistol_std=1; player._raidUseCdT=-99;
  check('insufficient reserve space leaves the entire box in the bag',
    [loadAmmoFromBag('ammo_pistol_std'),bagCount('ammo_pistol_std'),pistol.reserve],[false,1,23]);
  const cash=META.wallet;
  check('in-raid shop rejects mismatches without billing',[buyAmmoPack('ammo_std'),META.wallet,player.curSlot],[false,cash,1]);
  pistol.mag=0; pistol.reserve=0;
  check('buying a new grade for an empty pistol keeps the active gun',
    [buyAmmoPack('ammo_pistol_ap'),pistol.ammo,pistol.reserve,player.curSlot,META.wallet],[true,'ammo_pistol_ap',20,1,cash-780]);
  RUN.loot.m1911=1;
  check('equipping a duplicate in its own slot preserves gun, box and rounds',
    [bagEquipWeapon('m1911',1),bagCount('m1911'),player.slots[1]===pistol,pistol.reserve],[false,1,true,20]);
  RUN.loot.m4=1; bagEquipWeapon('m4',1);
  const crate={loot:{}};
  crate.loot.m1911=RUN.loot.m1911; delete RUN.loot.m1911;
  moveStowedWeapons(RUN,crate,'m1911',crate.loot.m1911);
  takeLootItem(crate,'m1911'); bagEquipWeapon('m1911',1);
  check('weapon moved through a container retains its original remaining rounds',
    [player.curW.ammo,player.curW.reserve,crate.loot.m1911||0],['ammo_pistol_ap',20,1]);
  player.curW.mag=0; player.curW.reserve=0; applyModsToLiveWeapon('m1911');
  check('changing an attachment on an empty gun creates no ammo',[player.curW.mag,player.curW.reserve],[0,0]);
  storyApplyKit(); // Must leave a sandbox player's gear alone.
  check('sandbox never receives loan cartridges',player.slots.some(w=>!!w.loanAmmoBox),false);
  SRAID.live=true;
  storyApplyKit();
  VM.state='idle'; player._raidUseCdT=-99;
  const boxBefore=bagCount('ammo_std');
  tryReload(); complete();
  check('story loan uses one issued rifle box without debiting carried stock',
    [player.curW.mag,player.curW.reserve,!!player.curW.loanAmmoBox,bagCount('ammo_std'),!!player.slots[1].loanAmmoBox],
    [30,0,false,boxBefore,true]);
  SRAID.live=false;
  RUN._loadoutApplied=false; RUN.loot={ammo_pistol_std:cap-3};
  META.owned.ammo_std=2; META.loot.ammo_std=4;
  META.loadout.ammo=Array(8).fill('ammo_std');
  applyDeployLoadout(); applyDeployLoadout();
  check('actual transfer respects free space, uses looted stock and never charges twice',
    [bagUsed(),bagCount('ammo_std'),META.owned.ammo_std,META.loot.ammo_std],[cap,3,0,3]);
  return results;
}

run().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>ownChrome?.kill());
