'use strict';
// node _tools/raid_regression.js <local game URL> <Chrome debugging URL>
// The suite creates and discards its own incognito context, including its saves.
const assert = require('node:assert/strict');
const { setTimeout: sleep } = require('node:timers/promises');
const game = new URL(process.argv[2] || 'http://127.0.0.1:8123/');
const debug = new URL(process.argv[3] || 'http://127.0.0.1:9222/');
const meta = {
  seeded: true, seed2: true, seed3: true, wallet: 2600,
  owned: { m1911: 1, armor1: 1, helm1: 1, packSmall: 1, hs_tep300: 1, medkit: 2, water: 2, nade_frag: 2 },
  loadout: { primary: 'm1911', pack: 'packSmall', meds: ['medkit'], foods: ['water'], throw: { nade_frag: 2 } }
};

async function run() {
  const endpoint = await (await fetch(new URL('/json/version', debug))).json();
  const socket = new WebSocket(endpoint.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { socket.onopen = ok; socket.onerror = fail; });
  let seq = 0;
  const pending = new Map();
  socket.onmessage = ({ data }) => {
    const { id, error, result } = JSON.parse(data);
    const waiter = pending.get(id);
    if (!waiter) return;
    pending.delete(id);
    error ? waiter.fail(Error(error.message)) : waiter.ok(result);
  };
  function rpc(method, params = {}, sessionId) {
    return new Promise((ok, fail) => {
      pending.set(++seq, { ok, fail });
      socket.send(JSON.stringify({ id: seq, method, params, sessionId }));
    });
  }
  const { browserContextId } = await rpc('Target.createBrowserContext');
  try {
    const { targetId } = await rpc('Target.createTarget', { url: 'about:blank', browserContextId });
    const { sessionId } = await rpc('Target.attachToTarget', { targetId, flatten: true });
    const page = (method, params) => rpc(method, params, sessionId);
    await page('Page.enable');
    await page('Network.enable');
    await page('Network.setBlockedURLs', { urls: ['*://gamesvibe.app/*', '*://vibe.lumigrav.space/*'] });
    async function read(expression) {
      const result = await page('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    }
    async function waitFor(expression) {
      const deadline = Date.now() + 40000;
      while (Date.now() < deadline) {
        if (await read(expression).catch(() => false)) return;
        await sleep(80);
      }
      throw Error('Timed out waiting for ' + expression);
    }
    let fixtureId, round = 0;
    async function open(map, options = {}, save = meta) {
      if (fixtureId) await page('Page.removeScriptToEvaluateOnNewDocument', { identifier: fixtureId });
      const values = { sf_campaign: String(map), bf_meta_v1: JSON.stringify(save), ...options };
      // Stop autonomous frames so a bot cannot end the scenario during assertions.
      const source = 'localStorage.clear();for(const [k,v] of Object.entries(' + JSON.stringify(values) + '))localStorage.setItem(k,v);'
        + 'window.VibeHubWorkshop={beforeStart:Promise.resolve(),markGameReady(){}};'
        + 'const nextFrame=requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>fn.name==="loop"?0:nextFrame(fn);';
      fixtureId = (await page('Page.addScriptToEvaluateOnNewDocument', { source })).identifier;
      const url = new URL('index.html', game);
      url.searchParams.set('raid-regression', String(++round));
      await page('Page.navigate', { url: url.href });
      await waitFor('location.href===' + JSON.stringify(url.href) + '&&document.readyState==="complete"&&typeof el("startBtn").onclick==="function"');
    }
    async function deploy() {
      await read('if(!player.deployed){if(el("deploy").classList.contains("hidden"))el("startBtn").click();el("deployBtn").click()}');
      await waitFor('player.alive&&player.deployed');
    }
    async function click(selector, count=1) {
      const point=await read(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});
        node.scrollIntoView({block:'nearest'});const r=node.getBoundingClientRect();
        const x=r.left+r.width/2,y=r.top+r.height/2;
        const hit=document.elementFromPoint(x,y);
        if(!node.contains(hit))throw Error('Obstructed '+selector+' by '+hit?.tagName+'#'+hit?.id+' '+hit?.innerText.slice(0,400));
        return {x,y}})()`);
      for(let i=1;i<=count;i++){
        for(const type of ['mousePressed','mouseReleased']){
          await page('Input.dispatchMouseEvent',{type,button:'left',clickCount:i,...point});
        }
      }
    }
    await open(3, {}, { ...meta, xp: 998, loadout: { ...meta.loadout, primary: 'at4' } });
    assert.equal(await read('META.loadout.primary'), 'm1911', 'removed weapon migration');
    await read("renderArmory('warehouse');el('arSearch').value='矿泉水';el('arSearch').dispatchEvent(new Event('input'))");
    assert.equal(await read("el('arDetail').querySelector('[data-action]').dataset.key"), 'water');
    assert.equal(await read("!!el('arDetail').querySelector('[data-action=equip]')"), false);
    await read("el('arSearch').value='no-such-item';el('arSearch').dispatchEvent(new Event('input'))");
    assert.equal(await read("el('arDetail').hidden && !!el('arList').querySelector('.arSearchEmpty')"), true);
    await read("el('arSearch').value='';el('arSearch').dispatchEvent(new Event('input'));renderArmory('loot')");
    assert.equal(await read("!!el('arList').querySelector('.arEmpty')"), true, 'empty stash guidance survives clearing search');
    await read("renderArmory('store');el('arCategory').value='ammo';el('arCategory').dispatchEvent(new Event('change'))");
    assert.equal(await read("el('arList').querySelectorAll('.arProduct:not([hidden]):not([data-category=ammo])').length"), 0);
    const shopBefore=await read("[META.wallet,ownedCount('ammo_pistol_std'),itemPrice('ammo_pistol_std')]");
    await read("el('arList').querySelector('[data-action=buy][data-key=ammo_pistol_std]').click()");
    assert.deepEqual(await read("[META.wallet,ownedCount('ammo_pistol_std')]"), [shopBefore[0]-shopBefore[2],shopBefore[1]+1]);
    await read("renderArmory('warehouse');el('arLayoutBtn').click()");
    assert.equal(await read("!!el('arGridHost').querySelector('.invGrid')"), true);
    await read("el('arLayoutBtn').click()");
    assert.equal(await read("!!el('arGridHost').querySelector('.arStockList')"), true);
    await deploy();
    assert.equal(await read('CAMPAIGN.id'), 'airport');
    await read("RUN.loot={water:16};");
    assert.equal(await read('bagUsed()'), 16);
    assert.equal(await read("canCarry('armor1',1)"), false, 'full backpack rejects armor');
    await read("RUN.loot={};LOOT_UI.open=true;LOOT_UI.kind='crate';LOOT_UI.ref={loot:{water:2}};LOOT_UI.sel=0;lootTakeToBag('water');lootTakeSelected();");
    assert.deepEqual(await read('[RUN.searches,META.questProg.ap_search,META.level,META.xp]'), [2,2,2,10]);
    await read("secureAdd('water');RUN.loot.chip=6;RUN.kills=2;finishRaid(true);finishRaid(true)");
    assert.deepEqual(await read('[META.questProg.ap_extract,META.questProg.ap_rare,META.loot.water,META.loot.chip,RUN.secure.length,META.stats.kills]'), [1,6,2,6,0,2]);
    assert.equal(await read("JSON.parse(localStorage.getItem('bf_meta_v1')).loot.water"), 2);
    console.log('PASS old equipment, carry limits, both pickup paths, level rollover, airport quests, secure extraction');
    await open(0);
    await deploy();
    await read("RUN.loot={};openLootPanel({kind:'crate',ref:{x:player.pos.x,z:player.pos.z,loot:{water:2,medkit:1}}})");
    assert.equal(await read("el('lootPanel').classList.contains('hidden')"), false);
    assert.equal(await read("el('lootPanel').dataset.view"), 'list');
    await click('#lootSrcHost [data-key=water] .takeItem');
    assert.deepEqual(await read("[RUN.loot.water,LOOT_UI.ref.loot.water,bagUsed(),RUN.searches]"), [1,1,1,1]);
    await click('#lootPanel button[data-view=grid]');
    assert.equal(await read("el('lootPanel').dataset.view"), 'grid');
    await click('#lootSrcHost [data-key=medkit]',2);
    assert.deepEqual(await read("[RUN.loot.medkit,LOOT_UI.ref.loot.medkit||0,RUN.searches]"), [1,0,2]);
    await page('Input.dispatchKeyEvent', {type:'keyDown',key:'r',code:'KeyR'});
    await page('Input.dispatchKeyEvent', {type:'keyUp',key:'r',code:'KeyR'});
    assert.equal(await read("VM.state==='reload'"), false, 'looting blocks combat inputs');
    await page('Input.dispatchKeyEvent', {type:'keyDown',key:'Escape',code:'Escape'});
    await page('Input.dispatchKeyEvent', {type:'keyUp',key:'Escape',code:'Escape'});
    assert.equal(await read("!LOOT_UI.open && el('deploy').classList.contains('hidden')"), true);
    async function press(code){
      await page('Input.dispatchKeyEvent',{type:'keyDown',code});
      await page('Input.dispatchKeyEvent',{type:'keyUp',code});
    }
    await read("RUN.loot.painkiller=1;VM.state='idle'");
    await press('KeyB');
    for(const code of ['KeyR','Tab','KeyI']){
      await press(code);
    }
    assert.equal(await read("medWheelIsOpen()&&!BAG_UI.open&&!AMMO_UI.open&&VM.state!=='reload'"),true);
    assert.equal(await read("document.activeElement===el('mwClose')"),true);
    await press('Enter');
    assert.deepEqual(await read("[medWheelIsOpen(),bagCount('medkit'),bagCount('painkiller')]"),[false,1,1]);
    await press('KeyB');
    await press('ArrowRight');
    const chosen=await read("MEDWHEEL.keys[1]");
    assert.equal(await read("document.querySelector('#mwRing [aria-selected=true]').dataset.mwk"),chosen);
    await press('Enter');
    assert.deepEqual(await read(`[medWheelIsOpen(),bagCount(${JSON.stringify(chosen)}),player.medUseT>0]`),[false,0,true]);
    console.log('PASS stash search, list pickup, grid double-click and modal keyboard isolation');
    const wallet = await read('META.wallet');
    await read('matchTime=0;for(let i=0;i<4;i++)updateExtraction(0.05)');
    assert.deepEqual(await read('[matchOver,META.wallet]'), [true,wallet+500]);
    console.log('PASS timeout compensates once');
    await open(0);
    await deploy();
    await read("RUN.kills=3;player.die(null,true)");
    assert.equal(await read("JSON.parse(localStorage.getItem('bf_meta_v1')).stats.deaths"), 1, 'death saved before the recap');
    await waitFor('matchOver');
    assert.deepEqual(await read('[vibeStatSnapshot().kills,vibeStatSnapshot().deaths,vibeStatSnapshot().kd]'), [3,1,3]);
    assert.equal(await read("JSON.parse(localStorage.getItem('bf_meta_v1')).stats.deaths"), 1);
    console.log('PASS actual death and persistent KD');
    await open(6, { sf_range: '1', sf_rangeWpn: 'm4', sf_autodeploy:'1' });
    await waitFor('!el("deploy").classList.contains("hidden")');
    await deploy();
    assert.deepEqual(await read("[player.curW.key,META.owned.medkit,META.owned.water,META.owned.nade_frag,JSON.parse(localStorage.getItem('bf_meta_v1')).loadout.primary]"), ['m4',2,2,2,'m1911']);
    const warehouseBeforeTrainingSwap=await read('JSON.stringify(META.owned)');
    await read('showDeploy(false);el("arsenalSelect").value="awm";el("arsenalSelect").dispatchEvent(new Event("change"))');
    assert.deepEqual(await read('[player.curW.key,VM.key,player.curW.reserve,player.curW.ammo]'),['awm','awm',await read('RANGE.AMMO'),await read('ammoKeyOfCaliber(ammoCaliberOf("awm"))')]);
    assert.equal(await read('JSON.stringify(META.owned)'),warehouseBeforeTrainingSwap);
    console.log('PASS range equipment and save isolation');
    await open(2, { sf_story: '5', sf_autodeploy:'1' }, { ...meta, owned: { ...meta.owned, pass: 1 } });
    await waitFor('el("deploy").classList.contains("chapterVisit")');
    assert.equal(await read('el("passSelect").checkVisibility() && !el("arsenalSelect").checkVisibility()'),true);
    await read('el("passSelect").value="pass";el("passSelect").dispatchEvent(new Event("change"))');
    await click('#deployBackBtn');
    assert.deepEqual(await read('[el("mStory").checkVisibility(),storyPendingIdx(),_pendingRaid,ownedCount("pass"),!!META.loadout.pass]'),[true,-1,false,1,false]);
    for (const [pass, carry] of [[0,false], [1,false], [1,true]]) {
      await open(2, { sf_story: '5', sf_autodeploy:'1' }, { ...meta, owned: { ...meta.owned, pass } });
      await waitFor('!el("deploy").classList.contains("hidden")');
      if(carry) await read('el("passSelect").value="pass";el("passSelect").dispatchEvent(new Event("change"))');
      await deploy();
      assert.deepEqual(await read("[SRAID.ch.id,player.curW.key,META.owned.medkit,META.owned.water]"), ['s6','m4',2,2]);
      assert.equal(await read('!!META.loadout.pass'),false,'chapter choice must stay local to the raid');
      await read('finishRaid(true)');
      assert.deepEqual(await read("[!!STORY.done.s6,ownedCount('pass'),META.owned.nade_frag]"), [carry,carry?0:pass,2]);
    }
    console.log('PASS final chapter requires a ticket and story kit leaves the stash intact');
    await open(0);
    const occupancy = await read('Array.from(OCC.data)');
    await open(0);
    assert.deepEqual(await read('Array.from(OCC.data)'), occupancy, 'street collisions must agree on both peers');
    await read("NET.room={peers:()=>[{id:'local-fixture-peer',open:true}],send(){},sendRealtime(){}};NET.enabled=true;NET.isHost=true;netEnsureRemote('local-fixture-peer','test');true");
    await deploy();
    assert.deepEqual(await read("(()=>{const p=NET.remote['local-fixture-peer'];return [soldiers.filter(v=>v===p).length,combatants.filter(v=>v===p).length,scene.getObjectById(p.mesh.root.id)===p.mesh.root]})()"), [1,1,true]);
    console.log('PASS shared street layout and a lobby peer surviving deployment');
    await page('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
    async function tap(selector) {
      const point=await read(`(()=>{const b=document.querySelector(${JSON.stringify(selector)}); const r=b.getBoundingClientRect();
        const x=r.left+r.width/2,y=r.top+r.height/2;
        if(!r.width||!b.contains(document.elementFromPoint(x,y))) throw Error('Cannot touch '+b.id);
        return {x,y}})()`);
      await page('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
      await page('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }
    for(const [width,height] of [[844,390],[390,844]]) {
      await page('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
      await open(0,{sf_touch:'1'});
      assert.equal(await read('getComputedStyle(el("ammoPanel")).visibility'), 'hidden', 'menus conceal combat HUD');
      await deploy();
      await read("updateQuestHud();updateHUD(.2);updateRaidHUDBars(false);updateTouchVis()");
      assert.ok(await read("(Math.sin(player.yaw)*player.pos.x+Math.cos(player.yaw)*player.pos.z)/Math.hypot(player.pos.x,player.pos.z)>.99"),'spawn faces the playable area');
      await waitFor("!document.body.classList.contains('uiOpen')");
      await waitFor(`['tAds','tFire','tJump','tCrouch','tReload','tBag','tToolsToggle','tMap'].every(id=>{
        const e=el(id),r=e.getBoundingClientRect(); return r.width>=44 && r.height>=44 && e.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))
      })`);
      assert.equal(await read("el('questHud').offsetHeight"),0,'objectives leave the combat area clear');
      await tap('#tToolsToggle');
      await waitFor("el('tTools').contains(el('questHud')) && el('questHud').offsetHeight>0");
      await tap('#tShop');
      await waitFor("AMMO_UI.open && getComputedStyle(el('touchUI')).display==='none'");
      await tap('#ammoClose');
      await waitFor("!AMMO_UI.open && !document.body.classList.contains('uiOpen')");
      await tap('#tBag');
      await waitFor("BAG_UI.open && getComputedStyle(el('touchUI')).display==='none'");
      await tap('#bagPanelBtns [data-bact="close"]');
      await waitFor("!BAG_UI.open && !document.body.classList.contains('uiOpen')");
      await read("player.curW.mag=0;player.curW.reserve=0;delete player.curW.loanAmmoBox;RUN.loot={};VM.state='idle';updateHUD(.2)");
      assert.match(await read("el('ammoAction').textContent"),/买弹/);
      await tap('#tReload');
      await waitFor("AMMO_UI.open");
      await tap('#ammoShopList .apBuy:not(:disabled)');
      await tap('#ammoClose');
      await read("updateHUD(.2)");
      assert.match(await read("el('ammoAction').textContent"),/装入备弹/);
      await tap('#tReload');
      assert.equal(await read('VM.state'),'reload');
      await read("VM.state='idle';player.curW.mag=0;player.curW.reserve=0;const box=ammoKeyOfCaliber(ammoCaliberOf(player.curW.key));RUN.loot[box]=1;updateHUD(.2)");
      assert.match(await read("el('ammoAction').textContent"),/拆盒/);
      await tap('#tReload');
      assert.equal(await read("VM.state==='reload' && !RUN.loot[box] && player.curW.reserve>0"),true);
      console.log('PASS touch targets, field tools, shop, bag and empty-mag guidance at '+width+'x'+height);
    }
  } finally {
    await rpc('Target.disposeBrowserContext', { browserContextId });
    socket.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
