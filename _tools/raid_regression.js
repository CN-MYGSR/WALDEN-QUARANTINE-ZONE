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
    await open(3, {}, { ...meta, xp: 998, loadout: { ...meta.loadout, primary: 'at4' } });
    assert.equal(await read('META.loadout.primary'), 'm1911', 'removed weapon migration');
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
    await open(6, { sf_range: '1', sf_rangeWpn: 'm4' });
    await deploy();
    assert.deepEqual(await read("[player.curW.key,META.owned.medkit,META.owned.water,META.owned.nade_frag,JSON.parse(localStorage.getItem('bf_meta_v1')).loadout.primary]"), ['m4',2,2,2,'m1911']);
    console.log('PASS range equipment and save isolation');
    for (const [pass, carry] of [[0,false], [1,false], [1,true]]) {
      await open(2, { sf_story: '5' }, { ...meta, owned: { ...meta.owned, pass } });
      await read('el("startBtn").click()');
      if(carry) await read('el("passSelect").value="pass";el("passSelect").dispatchEvent(new Event("change"))');
      await deploy();
      assert.deepEqual(await read("[SRAID.ch.id,player.curW.key,META.owned.medkit,META.owned.water]"), ['s6','m4',2,2]);
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
  } finally {
    await rpc('Target.disposeBrowserContext', { browserContextId });
    socket.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
