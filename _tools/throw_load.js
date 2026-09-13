// 46_throwables.js 的离线加载测试 (最小 DOM 桩 + 真正执行模块)
// 验证: ① 顶层加载不抛错 ② 物品 API 包裹生效 ③ 市集上架
//      ④ 部署扣费 / 携带量写入玩家 ⑤ 投掷物行渲染 ⑥ 撤离退回未用掉的
// 输出写入 _tools/throw_load.txt (PowerShell 重定向是 UTF-16, 编辑器读不了)
const fs = require('fs');
const path = require('path');
const out = [];
const log = s => out.push(s);

// ---------- DOM 桩 ----------
function makeEl(id) {
  const el = {
    id, children: [], innerHTML: '', textContent: '', value: '', style: {}, dataset: {},
    classList: { add() { }, remove() { }, contains() { return false; }, toggle() { } },
    appendChild(c) { el.children.push(c); return c; },
    addEventListener() { }, querySelectorAll() { return []; }, getContext() { return null; },
  };
  return el;
}
const els = {};
['throwRow', 'consumSummary', 'flashOv'].forEach(id => els[id] = makeEl(id));
global.document = {
  getElementById: id => els[id] || null,
  createElement: tag => makeEl('<' + tag + '>'),
  querySelectorAll: () => [], querySelector: () => null,
  addEventListener() { }, body: makeEl('body'), exitPointerLock() { },
};
const store = new Map();
global.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
global.window = { addEventListener() { }, location: { reload() { } } };
global.location = global.window.location;
global.el = id => global.document.getElementById(id);
global.setInterval = () => 0; global.clearInterval = () => { };
global.console = { log() { }, warn: (...a) => log('  [warn] ' + a.join(' ')), error: (...a) => log('  [error] ' + a.join(' ')) };

// ---------- 被包裹的既有全局 (38_tarkov / 29_menus / 35_extraction / 28_hud) ----------
const _size = { nade_frag: 1 };
global.itemSizeOf = k => (THROW_TEST_MED[k] ? 1 : 1);
global.itemWeightOf = k => 0.3;
global.itemPriceOf = k => 100;
global.itemLabel = k => '旧名:' + k;
global.itemName = k => '旧名:' + k;
global.itemDescOf = k => '旧描述';
global.itemKind = k => (k === 'medkit' ? 'med' : 'misc');
global.itemIconOf = k => '📦';
global.itemSellPrice = k => 15;
global.TRADE_KEYS = ['water', 'medkit'];
global.TRADE_LEVEL = { water: 1 };
global.THROW_TEST_MED = { water: 1 };

// ---------- 经济 / 存档 ----------
global.META = {
  wallet: 5000,
  owned: { m1911: 1, nade_frag: 3, nade_flash: 1, nade_smoke: 2 },
  loot: {},
  loadout: { primary: 'm1911', secondary: '', armor: 'armor1', pack: 'packSmall', meds: [''], foods: [''] },
};
let saved = 0;
global.saveMeta = () => { saved++; };
global.ownedCount = k => (global.META.owned[k] || 0);
global.RUN = { loot: {} };
global.nowT = 0;
global.V3 = (x = 0, y = 0, z = 0) => ({
  x, y, z,
  length() { return Math.hypot(this.x, this.y, this.z); },
  normalize() { const l = this.length() || 1; this.x /= l; this.y /= l; this.z /= l; return this; },
});
global.angDiff = (a, b) => 0;
global.raycastWorld = () => null;
global.addTrauma = () => { };
global.showScorePop = s => log('    [pop] ' + s);
global.soldiers = [];
global.player = {
  alive: true, pos: { x: 0, y: 0, z: 0 }, yaw: 0, ads: true, bloom: 0,
  nadeCount: 0, flashCount: 0, smokeCount: 0, flashT: 0,
  releaseNade() { this.nadeCount = Math.max(0, this.nadeCount - 1); },
};
global.Bot = function () { };
global.Bot.prototype.perceive = function () { this.__perceived = (this.__perceived || 0) + 1; };
global.Bot.prototype.update = function (dt) { this.__upd = (this.__upd || 0) + 1; };

let calls = { deployConsum: 0, consumSummary: 0, applyDeploy: 0, deployPlayer: 0, finishRaid: 0, updateHUD: 0, crate: 0, corpse: 0 };
global.buildDeployConsumables = () => { calls.deployConsum++; };
global.updateConsumSummary = () => { calls.consumSummary++; };
global.applyDeployLoadout = () => { calls.applyDeploy++; };
global.deployPlayer = () => { calls.deployPlayer++; };
global.finishRaid = () => { calls.finishRaid++; };
global.updateHUD = () => { calls.updateHUD++; };
global.rollCrateLootList = () => { calls.crate++; return { water: 1 }; };
global.rollCorpseLoot = () => { calls.corpse++; return {}; };

// ---------- 载入 46_throwables.js ----------
// 注: 去掉 'use strict' 只是测试桩的让步 —— strict 下间接 eval 的顶层 function 声明
// 不会挂到 global, 测不到 flashBangBlind 等函数。真实 <script> 加载是全局作用域。
const src = fs.readFileSync(path.join('js', '46_throwables.js'), 'utf8')
  .replace(/^\s*['"]use strict['"];?\s*/m, '/* strict removed for test */');
log('=== 46_throwables.js 加载 ===');
let ok = false;
try { (0, eval)(src); ok = true; log('顶层加载: OK'); }
catch (e) { log('顶层加载: FAIL -> ' + e.constructor.name + ': ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 3).join('\n')); }

if (ok) {
  const g = n => (typeof global[n] !== 'undefined' ? global[n] : undefined);
  log('');
  log('--- 物品 API 包裹 ---');
  log('itemKind(nade_frag)  = ' + global.itemKind('nade_frag') + '  (期望 throw)');
  log('itemKind(medkit)     = ' + global.itemKind('medkit') + '  (期望 med, 未被破坏)');
  log('itemLabel(nade_smoke)= ' + global.itemLabel('nade_smoke') + '  (期望 烟雾弹)');
  log('itemIconOf(nade_frag)= ' + global.itemIconOf('nade_frag') + '  (期望 ✷)');
  log('itemPriceOf(nade_flash) = ' + global.itemPriceOf('nade_flash') + '  (期望 540)');
  log('itemSellPrice(nade_frag)= ' + global.itemSellPrice('nade_frag') + '  (期望 279)');
  log('itemSizeOf(nade_frag)   = ' + global.itemSizeOf('nade_frag') + '  (期望 1)');
  log('市集目录 TRADE_KEYS: ' + JSON.stringify(global.TRADE_KEYS));
  log('等级锁 TRADE_LEVEL: ' + JSON.stringify(global.TRADE_LEVEL));

  log('');
  log('--- 起步补给 / 自动预填 ---');
  log('seed3 起步投掷物: ' + JSON.stringify(global.META.owned));
  log('seed3 标记 = ' + global.META.seed3 + ' (期望 true, 只发一次)');
  global.META.throwTouched = true;              // 关掉自动预填, 走显式数量分支
  global.META.owned = { nade_frag: 3, nade_flash: 1, nade_smoke: 2 };

  log('');
  log('--- 存档字段归一化 (老存档没有 throwables) ---');
  const L = global.META.loadout;
  log('载入后 loadout.throwables = ' + JSON.stringify(L.throwables) + ' (惰性补齐, 尚未调用时应为 undefined)');
  global.applyDeployLoadout();
  log('首次出击后自动补齐: ' + JSON.stringify(L.throwables) + ' (期望全 0)');

  log('');
  log('--- 部署扣费 ---');
  L.throwables.nade_frag = 2; L.throwables.nade_flash = 1; L.throwables.nade_smoke = 5; // 5 > 库存 2, 应被夹到 2
  global.applyDeployLoadout();
  log('RUN.throwables = ' + JSON.stringify(global.RUN.throwables));
  log('仓库剩余 = ' + JSON.stringify(global.META.owned));
  log('玩家携带: 手雷=' + global.player.nadeCount + ' 闪光=' + global.player.flashCount + ' 烟雾=' + global.player.smokeCount);
  log('原 applyDeployLoadout 被调用: ' + calls.applyDeploy + ' 次 (期望 2)');

  log('');
  log('--- 投出后同步 + 重生不补满 ---');
  global.player.releaseNade();
  log('投一颗手雷后 RUN.throwables = ' + JSON.stringify(global.RUN.throwables));
  global.deployPlayer();
  log('重生后玩家携带: 手雷=' + global.player.nadeCount + ' (期望 1, 不是 2)');

  log('');
  log('--- 部署面板投掷物行 ---');
  global.META.owned.nade_frag = 4;
  global.buildDeployConsumables();
  log('#throwRow 子元素数 = ' + els.throwRow.children.length + ' (3 种 + 无空提示时 3)');
  els.throwRow.children.forEach(c => {
    const txt = (c.children || []).map(x => String(x.innerHTML || x.textContent || '')).join(' | ');
    log('   ' + txt.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
  });
  log('saveMeta 调用次数 = ' + saved);

  log('');
  log('--- 撤离退回 ---');
  global.finishRaid(true);
  log('撤离后仓库 = ' + JSON.stringify(global.META.owned));

  log('');
  log('--- 闪光弹致盲 ---');
  global.player.flashT = 0;
  const blind = (typeof flashBangBlind === 'function' ? flashBangBlind : global.flashBangBlind);
  const n = blind ? blind({ x: 1, y: 1, z: 1 }, null) : -1;
  log('flashBangBlind 命中 ' + n + ' 个 NPC · 玩家 flashT = ' + (global.player.flashT || 0).toFixed(2));
  log('玩家 ads 被强制收镜: ' + (global.player.ads === false ? 'OK' : 'FAIL'));
  const b = new global.Bot();
  b.flashT = 1; b.alive = true; b.isPlayer = false; b.pos = { x: 0, y: 0, z: 0 };
  b.perceive(); b.update(0.5);
  log('Bot 致盲期间 perceive 被拦截: ' + (b.__perceived === undefined ? 'OK' : 'FAIL 仍调用了原 perceive'));
  log('Bot flashT 倒计时: ' + b.flashT + ' (期望 0.5)');
  const b2 = new global.Bot(); b2.perceive();
  log('未致盲 Bot 正常感知: ' + (b2.__perceived === 1 ? 'OK' : 'FAIL'));

  log('');
  log('--- 白屏 overlay 驱动 ---');
  global.player.flashT = 3;
  global.updateHUD(0.016);
  log('flashOv.opacity = ' + els.flashOv.style.opacity + ' (期望 >0) · bloom = ' + global.player.bloom);

  log('');
  log('--- 战利品掉落包裹 ---');
  let hasThrow = false;
  for (let i = 0; i < 200; i++) { const o = global.rollCrateLootList(); if (Object.keys(o).some(k => k.indexOf('nade_') === 0)) hasThrow = true; }
  log('200 次箱子roll 出现过投掷物: ' + (hasThrow ? 'OK' : 'FAIL'));
}
fs.writeFileSync(path.join('_tools', 'throw_load.txt'), out.join('\n') + '\n', 'utf8');
