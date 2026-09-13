// 用最小 DOM/全局桩把 43_maps.js 真正跑一遍:
//   ① 顶层加载期有没有抛错 (语法检查查不出来的那种)
//   ② initMenuUI() 被包裹后, #mapRow 到底有没有渲染出地图卡片
// 这是不开浏览器的前提下, 最接近"实机是否能看到地图卡片"的验证。
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
['mapRow', 'mapBrief', 'startBtn', 'deployMapName', 'mPlay', 'menu', 'mHome', 'mCamp', 'mArmory', 'mSet'].forEach(id => els[id] = makeEl(id));
global.document = {
  getElementById: id => els[id] || null,
  createElement: tag => makeEl('<' + tag + '>'),
  querySelectorAll: () => [],
  querySelector: () => null,
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
// 真实环境里 el 是 27_gamemode.js 的顶层 const (全局词法绑定, 不是 window 属性);
// 这里用 global 属性等价替代, 否则会误判成 "el is not defined"。
global.el = id => global.document.getElementById(id);
// mapSelectInit 会挂一个自愈用的 setInterval; 测试里要挡掉, 否则 node 进程不退出
global.setInterval = () => 0;
global.clearInterval = () => { };
global.console = { log() { }, warn: (...a) => log('  [warn] ' + a.join(' ')), error: (...a) => log('  [error] ' + a.join(' ')) };

// ---------- 游戏全局桩 ----------
global.CAMPAIGNS = [
  { id: 'bfruins', title: '街区', sub: '废城巷战', mapName: '街区', mapTag: '废城地表', mapThreat: '★★☆☆☆', mapLoot: '物资箱 ×14', mapDesc: '废墟', enemyBots: 16 },
  { id: 'lab', title: '秘密实验室', sub: '地下设施', mapName: '秘密实验室', mapTag: '铁砧地下层', mapThreat: '★★★★☆', mapLoot: '物资箱 ×22+', mapDesc: '设施', enemyBots: 20, botMul: { enemyHp: 1.28 } },
];
global.CAMPAIGN_IDX = 0;
global.CAMPAIGN = global.CAMPAIGNS[0];
global.QUEST_DEFS = [];
global.WPN_DEFS = { m4: { name: 'M4' } };
global.randi = (a, b) => a;
global.rand = (a, b) => a;
global.weightedPick = list => list[0];
global.LOOT_MED = ['medkit']; global.LOOT_FOOD = ['water']; global.LOOT_MISC = ['chip'];
global.FOOD_WEIGHT = { water: 1 };
global.RUN = { loot: {} };
global.CORPSES = [];
global.finishRaid = function () { };
global.questDescOf = function () { return ''; };
global.lootTakeSelected = function () { };
global.applyPrestigeBot = function () { };
global.rollCrateLootList = function () { return {}; };
global.rollCorpseLoot = function () { return {}; };
// 桩: 主菜单初始化 (29_menus.js 的那个) —— 用来验证包裹是否生效
global.initMenuUI = function () { global.__initMenuUICalledn = (global.__initMenuUICalledn || 0) + 1; };

// ---------- 载入 43_maps.js ----------
const src = fs.readFileSync(path.join('js', '43_maps.js'), 'utf8');
log('=== 43_maps.js 加载 ===');
let loaded = false;
try { (0, eval)(src); loaded = true; log('顶层加载: OK'); }
catch (e) { log('顶层加载: FAIL -> ' + e.constructor.name + ': ' + e.message); }
if (loaded) {
  log('包裹后的 initMenuUI 是否为新函数: ' + (global.initMenuUI.toString().indexOf('mapSelectInit') >= 0 ? 'OK' : '否'));
  log('renderMapCards 全局可见: ' + (typeof global.renderMapCards === 'function' || typeof renderMapCards === 'function' ? 'OK' : '否'));
  log('selectMapAndDeploy 全局可见: ' + (typeof global.selectMapAndDeploy === 'function' || typeof selectMapAndDeploy === 'function' ? 'OK' : '否'));
  log('QUEST_DEFS 追加实验室任务: ' + global.QUEST_DEFS.length + ' 个');
  // 触发包裹后的 initMenuUI (等价 32_boot 的调用)
  log('=== 调用 initMenuUI() ===');
  try {
    global.initMenuUI();
    log('initMenuUI 调用: OK (原函数被调用 ' + (global.__initMenuUICalledn || 0) + ' 次)');
    log('#mapRow 渲染出 ' + els.mapRow.children.length + ' 张地图卡片');
    els.mapRow.children.forEach((c, i) => log('   卡片' + i + ': ' + String(c.innerHTML).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()));
    log('#mapBrief 内容: ' + String(els.mapBrief.innerHTML).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 70));
    log('#startBtn 文案: ' + els.startBtn.textContent);
    log('#deployMapName 内容: ' + String(els.deployMapName.innerHTML).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
  } catch (e) { log('initMenuUI 调用: FAIL -> ' + e.constructor.name + ': ' + e.message + '\n' + (e.stack || '').split('\n')[1]); }
}
fs.writeFileSync(path.join('_tools', '_load_test.txt'), out.join('\n') + '\n', 'utf8');
