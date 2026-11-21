// 靶场 —— 行为验证（真跑 61_range.js，桩 THREE / DOM / 玩家 / 武器表）
// 用法: node _tools/_range_probe.js
const fs = require('fs');
const SRC = fs.readFileSync('js/61_range.js', 'utf8');

let pass = 0, fail = 0;
function t(name, cond, extra){
  if (cond) { pass++; console.log('✅ ' + name); }
  else { fail++; console.log('❌ ' + name + (extra !== undefined ? '   → ' + extra : '')); }
}

// ---------- 桩 ----------
function makeTHREE(){
  function Vec(){ return { x: 0, y: 0, z: 0, set(a, b, c){ this.x = a; this.y = b; this.z = c; } }; }
  return {
    DoubleSide: 2,
    BoxGeometry: function(){ this.dispose = () => {}; },
    PlaneGeometry: function(){ this.dispose = () => {}; },
    MeshLambertMaterial: function(o){ Object.assign(this, o); this.emissive = { setRGB(){} }; this.dispose = () => {}; },
    CanvasTexture: function(){ this.dispose = () => {}; },
    Mesh: function(g, m){ this.geometry = g; this.material = m; this.position = Vec(); this.parent = null; },
    Sprite: function(m){ this.material = m; this.position = Vec(); this.scale = { set(){} }; this.parent = null; },
    SpriteMaterial: function(o){ Object.assign(this, o); this.dispose = () => {}; }
  };
}

function makeDoc(){
  const els = {};
  const ctx = {
    fillRect(){}, beginPath(){}, arc(){}, fill(){}, fillText(){},
    font: '', fillStyle: '', textAlign: '', textBaseline: ''
  };
  return {
    els,
    addEventListener(){},   // 61_range 用捕获阶段委托绑 #rangeBtn
    createElement(tag){
      if (tag === 'canvas') return { width: 0, height: 0, getContext(){ return ctx; } };
      return { style: {}, appendChild(){}, setAttribute(){} };
    },
    getElementById(id){
      if (!els[id]) els[id] = { id, style: {}, textContent: '', innerHTML: '', children: [], appendChild(c){ this.children.push(c); } };
      return els[id];
    }
  };
}

function mk(opts){
  opts = opts || {};
  const store = Object.assign({}, opts.store || {});
  const localStorage = {
    getItem(k){ return (k in store) ? store[k] : null; },
    setItem(k, v){ store[k] = String(v); },
    removeItem(k){ delete store[k]; }
  };
  const doc = makeDoc();
  const scene = { children: [], add(o){ this.children.push(o); o.parent = this; }, remove(o){ o.parent = null; } };
  const WPN_DEFS = {
    m4: { name: 'M4', dmg: 33, mag: 30, reserve: 90 },
    m1911: { name: 'M1911', dmg: 28, mag: 7, reserve: 35 },
    awm: { name: 'AWM', dmg: 120, mag: 5, reserve: 20 }
  };
  const META = { loadout: { primary: 'm1911', secondary: '', armor: '' }, owned: {} };
  const RUN = { rangeWpn: '' };
  const player = { isPlayer: true, slots: [{ key: 'm4', reserve: 90 }, { key: 'm1911', reserve: 35 }] };
  const CAMPAIGN = { rangeOnly: !!opts.active };

  // 桩: 原有函数
  let deployCalls = 0, seenPrimary = null, ownedCalls = 0;
  function ownedCount(k){ ownedCalls++; return (META.owned[k] || 0); }
  function deployPlayer(){ deployCalls++; seenPrimary = META.loadout.primary; }
  function raySoldiers(){ return opts.soldierHit || null; }
  let bloodCalls = 0;
  function bloodFX(){ bloodCalls++; }
  let fireCalls = 0;
  function fireBullet(){ fireCalls++; }
  function updateMedCrates(){}
  function showDeploy(){}
  function showScorePop(){}
  let matchTime = 300;
  const nowT = 3.0;

  const fn = new Function(
    'THREE', 'document', 'scene', 'MAT', 'WPN_DEFS', 'META', 'RUN', 'player', 'CAMPAIGN', 'nowT', 'matchTime',
    'localStorage', 'ownedCount', 'deployPlayer', 'raySoldiers', 'bloodFX', 'fireBullet',
    'updateMedCrates', 'showDeploy', 'showScorePop', 'CAMPAIGNS', 'window', 'ammoCaliberOf', 'ammoKeyOfCaliber',
    SRC + '\nreturn {RANGE, rangeActive, rangePending, rangeWeapon, rangeSpawnTargets, rangeRayBox, ' +
    'rangeRayTargets, rangeAmmo, rangeDeployUI, getRay:()=>raySoldiers, getFire:()=>fireBullet, ' +
    'getDeploy:()=>deployPlayer, getBlood:()=>bloodFX, getMed:()=>updateMedCrates, ' +
    'getMatchTime:()=>matchTime, scene};'
  );

  const api = fn(
    makeTHREE(), doc, scene, { metalDark: {} }, WPN_DEFS, META, RUN, player, CAMPAIGN, nowT, matchTime,
    localStorage, ownedCount, deployPlayer, raySoldiers, bloodFX, fireBullet,
    updateMedCrates, showDeploy, showScorePop, [{ id: 'bfruins' }, { id: 'range', rangeOnly: true }], {},
    key => key === 'm1911' ? 'pistol' : 'rifle', cal => ({pistol:'ammo_pistol_std', rifle:'ammo_std'})[cal]
  );
  api.doc = doc; api.META = META; api.RUN = RUN; api.player = player; api.CAMPAIGN = CAMPAIGN;
  api.WPN = WPN_DEFS; api.store = store; api.deployCalls = () => deployCalls;
  api.seenPrimary = () => seenPrimary; api.bloodCalls = () => bloodCalls;
  api.fireCalls = () => fireCalls;
  return api;
}

// ---------- ① 模式判定 ----------
{
  const a = mk({ active: true });
  t('rangeOnly 地图 → rangeActive=true', a.rangeActive() === true);
  const b = mk({ active: false });
  t('普通地图 → rangeActive=false', b.rangeActive() === false);
  t('没有 sf_range 标记 → rangePending=false', b.rangePending() === false);
  const c = mk({ store: { sf_range: '1' } });
  t('有 sf_range 标记 → rangePending=true', c.rangePending() === true);
}

// ---------- ② 免费武器: 部署时临时借用，结束后还原 ----------
{
  const a = mk({ active: true, store: { sf_rangeWpn: 'awm' } });
  t('默认武器读 localStorage', a.rangeWeapon() === 'awm', a.rangeWeapon());
  a.getDeploy()();
  // 真实部署入口的选枪由 raid_regression 覆盖，此处验证靶场包装不会临时改写正式配装。
  t('部署期间正式仓库仍装备原本的枪', a.seenPrimary() === 'm1911', a.seenPrimary());
  t('部署后 META.loadout.primary 已还原', a.META.loadout.primary === 'm1911', a.META.loadout.primary);
  t('部署后 ownedCount 已还原 (不是临时桩)', a.META.owned.awm === undefined);
  // 还原后再调 ownedCount 应回到真实值
  t('原函数仍被调用', a.deployCalls() === 1);
}
{
  const a = mk({ active: false });
  a.getDeploy()();
  t('非靶场地图不接管 deployPlayer', a.seenPrimary() === 'm1911', a.seenPrimary());
}

// ---------- ③ 无限弹药 ----------
{
  const a = mk({ active: true });
  a.rangeAmmo();
  t('无限弹药: 每个槽位 reserve 补满', a.player.slots.every(s => s.reserve === 9999),
    JSON.stringify(a.player.slots));
  t('靶场借用武器按槽位领取对应弹种', a.player.slots[0].ammo === 'ammo_std' && a.player.slots[1].ammo === 'ammo_pistol_std');
}

// ---------- ④ 靶子生成 ----------
{
  const a = mk({ active: true });
  a.rangeSpawnTargets();
  const T = a.RANGE.targets;
  t('生成 11 个靶位', T.length === 11, T.length);
  t('距离 2~30m', T[0].d === 2 && T[T.length - 1].d === 30, T.map(x => x.d).join(','));
  t('射击线 12.5m → 最近靶 z=10.5', Math.abs(T[0].z - 10.5) < 1e-6, T[0].z);
  t('最远靶 z=-17.5', Math.abs(T[T.length - 1].z + 17.5) < 1e-6, T[T.length - 1].z);
  const moving = T.filter(x => x.moving).length;
  t('3 个移动靶 (8/18/26m)', moving === 3, moving);
  t('移动靶带振幅与相位', T.filter(x => x.moving).every(x => x.amp > 0 && x.spd > 0));
  t('靶子都挂进了场景', a.scene.children.length >= 11 * 3, a.scene.children.length);
  t('靶板命中盒高度 ~1m (胸靶)', Math.abs((T[0].box.maxY - T[0].box.minY) - 0.96) < 1e-6);
}

// ---------- ⑤ 射线命中 ----------
{
  const a = mk({ active: true });
  a.rangeSpawnTargets();
  const T = a.RANGE.targets;
  const tgt = T[0];                       // 2m, x=-3.6, z=10.5
  const o = { x: tgt.baseX, y: 1.45, z: 12.5 };
  const dir = { x: 0, y: 0, z: -1 };
  const hit = a.rangeRayBox(o, dir, tgt.box, 50);
  t('正对靶心 → 命中 (t≈2m)', hit !== null && Math.abs(hit - 2.0) < 0.1, hit);

  const miss = a.rangeRayBox({ x: tgt.baseX + 3, y: 1.45, z: 12.5 }, dir, tgt.box, 50);
  t('偏 3m → 不命中', miss === null);

  const high = a.rangeRayBox({ x: tgt.baseX, y: 3.2, z: 12.5 }, dir, tgt.box, 50);
  t('打高了 → 不命中', high === null);

  const back = a.rangeRayBox({ x: tgt.baseX, y: 1.45, z: 5 }, { x: 0, y: 0, z: -1 }, tgt.box, 50);
  t('背对靶子 (靶在身后) → 不命中', back === null);
}

// ---------- ⑥ raySoldiers 包装 ----------
{
  const a = mk({ active: true });
  a.rangeSpawnTargets();
  const T = a.RANGE.targets;
  const o = { x: T[0].baseX, y: 1.45, z: 12.5 };
  const dir = { x: 0, y: 0, z: -1 };
  const r = a.getRay()(o, dir, 40, { isPlayer: true });
  t('raySoldiers 包装: 打中靶子会返回目标', r && r.sol && r.sol.isTarget === true, r && r.sol);
  t('返回结构兼容 fireBullet (t/head/part)', r && typeof r.t === 'number' && r.head === false && r.part === 'torso');

  // 打中靶子时不该出血
  a.getBlood()({ x: 0, y: 1, z: 0 });
  t('打靶不触发血雾', a.bloodCalls() === 0, a.bloodCalls());
  // 没打靶时血迹正常
  a.getBlood()({ x: 0, y: 1, z: 0 });
  t('普通命中仍有血雾', a.bloodCalls() === 1, a.bloodCalls());
}
{
  // 士兵比靶子更近 → 应该返回士兵
  const soldierHit = { sol: { isPlayer: false }, t: 1.0, head: false, part: 'torso' };
  const a = mk({ active: true, soldierHit });
  a.rangeSpawnTargets();
  const T = a.RANGE.targets;
  const r = a.getRay()({ x: T[0].baseX, y: 1.45, z: 12.5 }, { x: 0, y: 0, z: -1 }, 40, { isPlayer: true });
  t('更近的士兵优先于靶子', r === soldierHit);
}

// ---------- ⑦ 计数 ----------
{
  const a = mk({ active: true });
  a.rangeSpawnTargets();
  const T = a.RANGE.targets;
  T[0].proxy.damage(33);
  T[1].proxy.damage(33);
  t('命中计数 +2', a.RANGE.hits === 2, a.RANGE.hits);
  t('命中会让靶板闪一下', T[0].flash === 1, T[0].flash);

  a.getFire()({ isPlayer: true });
  a.getFire()({ isPlayer: true });
  t('射击计数 +2', a.RANGE.shots === 2, a.RANGE.shots);
  t('HUD 写入了命中率', /命中 2 \/ 射击 2/.test(a.doc.getElementById('rangeStat').textContent),
    a.doc.getElementById('rangeStat').textContent);
}

// ---------- ⑧ 静态接线 ----------
{
  const html = fs.readFileSync('index.html', 'utf8');
  const data = fs.readFileSync('js/01_data.js', 'utf8');
  const world = fs.readFileSync('js/08_world.js', 'utf8');
  const maps = fs.readFileSync('js/43_maps.js', 'utf8');
  const map = fs.readFileSync('js/07h_range.js', 'utf8');

  t('主菜单有靶场按钮', /id="rangeBtn"/.test(html));
  // ⚠️ 29_menus 的 initMenuUI 会在所有脚本加载完之后把每个 .navBtn 的 onclick 重绑成通用导航
  //    → 直接在脚本加载时绑会被覆盖, 表现是「点靶场没反应」
  t('靶场按钮在 initMenuUI 之后绑定', /initMenuUI=function\(\)\{[\s\S]{0,400}?rangeBindMenuBtn\(\); [\s\S]{0,90}?return r;/.test(fs.readFileSync('js/61_range.js', 'utf8')))
  t('靶场按钮有捕获阶段兜底委托', /addEventListener\('click',function\(ev\)\{[\s\S]{0,200}?t\.closest\('#rangeBtn'\)/.test(fs.readFileSync('js/61_range.js', 'utf8')));
  t('靶场 HUD 在 index.html', /id="rangeHud"/.test(html));
  t('61_range.js 已加载', /js\/61_range\.js\?v=/.test(html));
  t('07h_range.js 在 08_world 之前', html.indexOf('07h_range.js') > 0 && html.indexOf('07h_range.js') < html.indexOf('08_world.js'));
  t('CAMPAIGNS 有 range 且 rangeOnly', /id:'range'[\s\S]{0,600}?rangeOnly:true/.test(data));
  t('靶场天气 indoor 已登记 (WEATHER_MODES)', /indoor:\{name:'室内'\}/.test(data));
  t('靶场天气 indoor 已登记 (WEATHER_FX)', /indoor:\{fogFar:1/.test(data));
  t('08_world 有 range 布局分支', /case 'range': layoutRange\(\);/.test(world));
  t('地图卡片过滤 rangeOnly', /if\(c\.storyOnly\|\|c\.rangeOnly\) return;/.test(maps));
  t('守卫放行 sf_range', /localStorage\.getItem\('sf_range'\)==='1'\) return false;/.test(maps));
  t('靶场布局用 mesh 做天花板 (不能 solidBox 污染 OCC)', /const ceil=mesh\(/.test(map));
  // ⚠️ 通用基地营区会把帐篷/沙袋搭进靶道 (bases 就在厅内) —— 必须排除 range
  t('08_world 的基地营区排除了 range', /layout!=='range'\)\{/.test(world));
  t('靶场地面用浅色石材 (深色木地板在室内像黑洞)', /apPave\(0,cz,W,LEN,0\.06,MAT\.stone\)/.test(map));
  t('距离标牌已缩小 (0.46×0.23)', /sp\.scale\.set\(0\.46,0\.23,1\)/.test(fs.readFileSync('js/61_range.js', 'utf8')));
  t('出生点归位到射击线后方 (z=13.6)', /player\.pos\.z=13\.6/.test(fs.readFileSync('js/61_range.js', 'utf8')));
  t('靶场隐藏了撤离/战利品 HUD', /tkt\.style\.display/.test(fs.readFileSync('js/61_range.js', 'utf8')))
}

console.log('\n' + (fail ? '❌ ' + fail + ' 项失败 / ' + (pass + fail) + ' 项' : '✅ 全部 ' + pass + ' 项通过'));
process.exit(fail ? 1 : 0);
