// 工坊接入后的极简加载测试:
//   ① mod_api.js 顶层加载没有抛错
//   ② modApi 在 window.VibeHubGame 上正确暴露
//   ③ 各子 API (weapons/npcs/maps/player/events) 注册函数可见
//   ④ 武器注册、地图注册、NPC 模板注册能落到 WPN_DEFS / CAMPAIGNS / applyPrestigeBot 包裹
//   ⑤ 玩家伤害钩子、子弹钩子被正确挂在 player.damage / fireBullet 上
const fs = require('fs');
const path = require('path');
const out = [];
function log(s) { out.push(s); }

// ---------- 极简 DOM 桩 ----------
function makeEl(id) {
  const el = {
    id, children: [], innerHTML: '', textContent: '', value: '', disabled: false,
    dataset: {}, style: { setProperty() { }, },
    _cls: new Set(),
    classList: {
      add: c => el._cls.add(c), remove: c => el._cls.delete(c),
      contains: c => el._cls.has(c),
      toggle: (c, on) => { if (on === undefined) { el._cls.has(c) ? el._cls.delete(c) : el._cls.add(c); } else if (on) el._cls.add(c); else el._cls.delete(c); }
    },
    appendChild(c) { el.children.push(c); return c; },
    addEventListener() { }, removeEventListener() { },
    querySelectorAll() { return []; },
    getContext() { return null; },
  };
  return el;
}
const els = {};
['mapRow', 'ammoShopPanel'].forEach(id => els[id] = makeEl(id));
global.document = {
  getElementById: id => els[id] || null,
  createElement: tag => makeEl('<' + tag + '>'),
  querySelectorAll: () => [], querySelector: () => null,
  addEventListener() { }, body: makeEl('body'), exitPointerLock() { },
};
const store = new Map();
global.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};
global.window = { addEventListener() { }, location: { reload() { } } };
global.location = global.window.location;
global.el = id => global.document.getElementById(id);
global.console = { log() { }, warn: (...a) => log('  [warn] ' + a.join(' ')), error: (...a) => log('  [error] ' + a.join(' ')) };

// ---------- 游戏全局桩 ----------
global.WPN_DEFS = { m4: { name: 'M4 卡宾枪', dmg: 26 } };
global.CAMPAIGNS = [{ id: 'bfruins', title: '街区' }];
global.CAMPAIGN_IDX = 0;
global.CAMPAIGN = global.CAMPAIGNS[0];
global.FACTIONS = { us: { name: '美国陆军' } };
global.ELO = { rating: 1000, auto: true };
global.combatants = [];
global.soldiers = [];
global.player = {
  isPlayer: true, hp: 100, alive: true, deployed: true, team: 0,
  pos: { x: 0, y: 0, z: 0, clone() { return { x: 0, y: 0, z: 0 }; } },
  limbs: { head: 100, arms: 100, torso: 100, legs: 100 },
  damage(amt){ this.hp -= amt; },
  die(){}
};
global.addKillfeed = function(){};   // 必须存在, mod_api 要包装它
global.finishRaid = function(){};    // 必须存在
global.fireBullet = function(shooter, origin, dir, def){ return 'origFire'; };  // 必须存在
global.applyPrestigeBot = function(bot){};
global.META = { wallet: 100000 };
global.RUN = {};

// ---------- 加载 49_mod_api.js ----------
log('=== 49_mod_api.js 加载 ===');
const src = fs.readFileSync(path.join('js', '49_mod_api.js'), 'utf8');
let loaded = false;
try { (0, eval)(src); loaded = true; log('顶层加载: OK'); }
catch (e) { log('顶层加载: FAIL -> ' + e.constructor.name + ': ' + e.message); }

if (loaded) {
  const api = global.window.VibeHubGame && global.window.VibeHubGame.modApi;
  log('VibeHubGame 已挂载: ' + (!!global.window.VibeHubGame));
  log('modApi 暴露: ' + (!!api));
  log('modApi.version: ' + (api && api.version));
  log('modApi.weapons.register 可见: ' + (typeof (api && api.weapons.register) === 'function'));
  log('modApi.npcs.register 可见: ' + (typeof (api && api.npcs.register) === 'function'));
  log('modApi.maps.register 可见: ' + (typeof (api && api.maps.register) === 'function'));
  log('modApi.player.hookDamage 可见: ' + (typeof (api && api.player.hookDamage) === 'function'));
  log('modApi.player.hookFireBullet 可见: ' + (typeof (api && api.player.hookFireBullet) === 'function'));
  log('modApi.events.on 可见: ' + (typeof (api && api.events.on) === 'function'));

  // 1) 注册新武器
  api.weapons.register('golden_m4', { name: '黄金 M4', dmg: 999 });
  log('注册 golden_m4 后 WPN_DEFS 含该 key: ' + (!!global.WPN_DEFS.golden_m4));
  log('  → WPN_DEFS.golden_m4.dmg = ' + global.WPN_DEFS.golden_m4.dmg);

  // 2) 注册地图
  api.maps.register({ id: 'factory', title: '工厂', modeName: '撤离 · 工厂', layout: 'cqb', terr: 'urban', theme: 'cqb', f: ['us','ger'], mapSize: 180, bases: [{x:-60,z:0},{x:60,z:0}], extract: [{x:0,z:60}] });
  log('注册 factory 后 CAMPAIGNS 长度: ' + global.CAMPAIGNS.length);
  log('  → 新地图 CAMPAIGNS[1].id = ' + global.CAMPAIGNS[1].id);

  // 3) 注册 NPC 模板 + 触发 applyPrestigeBot
  api.npcs.register({ id: 'tough_guard', hpMul: 1.5, reactMul: 0.8, match: (b) => b.team === 1 });
  let capturedHp = null;
  const fakeBot = { team: 1, hpMul: 1, reactMul: 1 };
  global.applyPrestigeBot(fakeBot);
  log('applyPrestigeBot 调用后 bot.hpMul = ' + fakeBot.hpMul + ' (期望 1.5)');
  log('  → bot.reactMul = ' + fakeBot.reactMul + ' (期望 0.8)');

  // 4) 注册伤害钩子 + 验证 player.damage 被包裹
  api.player.hookDamage((amount) => amount * 0.5);
  const playerBefore = global.player.hp;
  global.player.damage(20);   // 现在应该被钩子减半
  log('玩家受伤前 hp=' + playerBefore + ', 调 damage(20) 后 hp=' + global.player.hp + ' (期望 ' + (playerBefore - 10) + ')');

  // 5) 注册子弹钩子 + 验证 fireBullet 被包裹
  api.player.hookFireBullet((def) => { def.dmg = 999; return def; });
  const ret = global.fireBullet({}, {x:0,y:0,z:0}, {x:1,y:0,z:0}, { dmg: 10 });
  log('fireBullet 返回: ' + JSON.stringify(ret) + ' (期望 "origFire", 因为钩子只改 def 不改返回值)');

  // 6) 事件订阅
  let killFired = 0;
  api.events.on('kill', () => killFired++);
  global.addKillfeed({name:'A'}, {name:'B'}, true);
  log('addKillfeed 一次后 kill 事件触发次数: ' + killFired + ' (期望 1)');
}

fs.writeFileSync(path.join('_tools', '_modapi_load.txt'), out.join('\n') + '\n', 'utf8');
console.log('written, length=', out.length);