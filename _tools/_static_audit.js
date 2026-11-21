// 静态数据审计 (不需要浏览器)
// 目的: 抓「数据定义了但没接到某个消费点」这一类静默问题 —— 本会话已踩过两次
//   · 头盔/耳机/背包 加了却没进仓库列表 / 装备按钮槽位映射
//   · 武器加进 WPN_DEFS 却没写 buildGunModel 分支 → 落到兜底通用手枪
// 用法: node _tools/_static_audit.js
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const R = f => path.join(ROOT, f);
const read = f => fs.readFileSync(R(f), 'utf8');

const out = [];
const log = s => out.push(String(s));
let issues = 0;
const bad = s => { log('  ❌ ' + s); issues++; };
const ok = s => log('  ✅ ' + s);

// ---------- 通用: 从形如 `const X={ ... };` 的块里抽顶层键名 ----------
function keysOfBlock(src, decl) {
  // 允许 const X = { / const X={ 两种写法
  let i = src.indexOf(decl);
  if (i < 0) { const m = decl.match(/const\s+([A-Za-z_\$][\w\$]*)/); if (m) i = src.search(new RegExp('const\\s+' + m[1] + '\\s*=')); }
  if (i < 0) return null;
  let j = src.indexOf('{', i), depth = 0, end = -1;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
  }
  if (end < 0) return null;
  const body = src.slice(j + 1, end);
  const keys = new Set();
  // 只取「行首缩进后的 identifier:」形式, 跳过嵌套对象的内部键
  let d = 0;
  for (const line of body.split(/\r?\n/)) {
    const t = line.trim();
    if (d === 0) {
      const m = t.match(/^([A-Za-z_$][\w$]*)\s*:/);
      if (m) keys.add(m[1]);
    }
    for (const c of line) { if (c === '{') d++; else if (c === '}') d--; }
  }
  return keys;
}

// ---------- 1. AI 视距静态核对 ----------
log('=== 1. AI 视距 (改的是数值表, 公式未动) ===');
{
  const d = read('js/01_data.js');
  const b = read('js/19_bot.js');
  const fx = keysOfBlock(d, 'const WEATHER_FX=');
  if (!fx) bad('读不到 WEATHER_FX');
  else {
    const get = k => {
      const m = d.match(new RegExp('^' + k + ':\\s*\\{[^}]*\\bsight:\\s*([0-9.]+)', 'm'));
      return m ? parseFloat(m[1]) : null;
    };
    const labDim = (() => {
      const m = d.match(/id:'lab'[\s\S]{0,400}?dimLight:\s*([0-9.]+)/);
      return m ? parseFloat(m[1]) : 1;
    })();
    log('  （公式来自 19_bot.js: ' + (b.match(/const viewD=([^;]+);/) || [])[1] + '）');
    log('  天气        sight   weatherSight   AI视距');
    for (const k of ['clear', 'overcast', 'dusk', 'fog', 'rain', 'storm', 'night']) {
      const s = get(k);
      if (s == null) { bad('WEATHER_FX.' + k + ' 没有 sight 字段'); continue; }
      const ws = 1 + (s - 1) * 0.5;
      log('  ' + k.padEnd(11) + String(s).padEnd(8) + ws.toFixed(3).padEnd(15) + (70 * ws).toFixed(0) + 'm');
    }
    // 实验室: labhaze.sight × dimLight
    const ls = get('labhaze');
    if (ls != null) {
      const eff = ls * labDim;
      const ws = 1 + (eff - 1) * 0.5;
      log('  ' + 'lab'.padEnd(11) + (ls + '×' + labDim).padEnd(8) + ws.toFixed(3).padEnd(15) + (70 * ws).toFixed(0) + 'm  (labhaze.sight × MAP_DIM)');
    }
    if (!/WFX\.sight\*=MAP_DIM/.test(d)) bad('MAP_DIM 没有乘到 WFX.sight 上');
    else ok('MAP_DIM 已作用于 sight');
    if (get('night') > 0.5) bad('night.sight=' + get('night') + ' 偏高 —— 夜晚玩家看不见时 AI 会占大便宜');
    else ok('night.sight 已压低 (' + get('night') + ' → AI 视距 ' + (70 * (1 + (get('night') - 1) * 0.5)).toFixed(0) + 'm)');
  }
}

// ---------- 2. 武器: 数据表 vs 枪模分支 ----------
log('');
log('=== 2. 武器是否都有枪模分支 (漏了会落到兜底通用手枪) ===');
{
  const wd = read('js/13_weapons_data.js');
  const gm = read('js/14_gunmodels.js');
  const wpn = keysOfBlock(wd, 'const WPN_DEFS=');
  if (!wpn) bad('读不到 WPN_DEFS');
  else {
    // buildGunModel 里的 key==='xxx' 分支
    const branches = new Set();
    for (const m of gm.matchAll(/key\s*===\s*'([A-Za-z0-9_]+)'/g)) branches.add(m[1]);
    // ⚠️ 有 model 别名的武器会被 `if(dm) key=dm` 改道, 不算缺分支
    const alias = new Map();
    for (const m of wd.matchAll(/^([A-Za-z0-9_]+)\s*:\s*\{[^}]*?\bmodel:\s*'([A-Za-z0-9_]+)'/gm)) alias.set(m[1], m[2]);
    const missing = [...wpn].filter(k => {
      if (branches.has(k)) return false;
      const a = alias.get(k);
      return !(a && branches.has(a));
    });
    log('  WPN_DEFS 共 ' + wpn.size + ' 把; buildGunModel 显式分支 ' + branches.size + ' 个; model 别名 ' + alias.size + ' 个');
    if (missing.length) {
      log('  ⚠️ 既没有显式分支、也没有 model 别名的 ' + missing.length + ' 把（会落到末尾兜底模型）:');
      log('     ' + missing.join(', '));
    } else ok('全部武器都有枪模（显式分支或 model 别名）');
    // 反向: 分支里有但 WPN_DEFS 也没有别名指向它的 → 死分支
    const ghost = [...branches].filter(k => !wpn.has(k) && ![...alias.values()].includes(k));
    if (ghost.length) log('  ⚠️ buildGunModel 里有 ' + ghost.length + ' 个死分支（对应武器已从 WPN_DEFS 删除，永远不会命中）:\n     ' + ghost.join(', '));
    else ok('没有幽灵枪模分支');
  }
}

// ---------- 3. 阵营武器池 ----------
log('');
log('=== 3. 阵营配置里的武器键是否都存在 ===');
{
  const d = read('js/01_data.js');
  const wd = read('js/13_weapons_data.js');
  const wpn = keysOfBlock(wd, 'const WPN_DEFS=') || new Set();
  const badKeys = new Set();
  for (const m of d.matchAll(/cls:\s*\[([^\]]+)\]/g)) {
    for (const q of m[1].matchAll(/'([A-Za-z0-9_]+)'/g)) {
      if (!wpn.has(q[1])) badKeys.add(q[1]);
    }
  }
  if (badKeys.size) bad('阵营 cls 表里引用了不存在的武器: ' + [...badKeys].join(', '));
  else ok('阵营 cls 表引用的武器键全部存在');
}

// ---------- 4. 物品系统: 每个类别都要接的消费点 ----------
log('');
log('=== 4. 物品类别 × 消费点 覆盖检查 ===');
{
  const t = read('js/38_tarkov.js');
  const m37 = read('js/37_meta.js');
  const cats = [
    ['护甲', 'ARMOR_DEFS', '37_meta'],
    ['头盔', 'HELMET_DEFS', '37_meta'],
    ['耳机', 'HEADSET_DEFS', '37_meta'],
    ['背包', 'PACK_DEFS', '38_tarkov'],
    ['胸挂', 'CHEST_DEFS', '38_tarkov'],
  ];
  // 每个类别在 38_tarkov 的物品函数里都应该有分支
  const fns = ['itemSizeOf', 'itemWeightOf', 'itemPriceOf', 'itemDescOf', 'itemName', 'itemKind'];
  // itemIconOf 是按 itemKind() 的返回值分支的, 所以要检查 KIND 有没有图标
  const KIND_OF = { '护甲':'armor', '头盔':'helmet', '耳机':'headset', '背包':'pack', '胸挂':'chest' };
  for (const [label, def, where] of cats) {
    const src = where === '37_meta' ? m37 : t;
    const keys = keysOfBlock(src, 'const ' + def + '=');
    if (!keys || !keys.size) { bad(label + ': 读不到 ' + def); continue; }
    const miss = fns.filter(fn => {
      // 在 38_tarkov 里找该函数体, 看有没有引用这个 DEF
      const i = t.indexOf('function ' + fn + '(');
      if (i < 0) return true;
      const seg = t.slice(i, i + 1400);
      return seg.indexOf(def) < 0;
    });
    if (miss.length) bad(label + ' (' + def + ') 在 38_tarkov 里缺少分支: ' + miss.join(', '));
    else ok(label + ' (' + keys.size + ' 项) 物品函数齐全');
    // 图标: itemIconOf 是按 itemKind() 的返回值分支的, 所以查 KIND 有没有图标
    {
      const kind = KIND_OF[label];
      const ic = t.match(/function itemIconOf\(key\)\{([\s\S]*?)\n\}/);
      if (!ic) bad('读不到 itemIconOf');
      else if (ic[1].indexOf("'" + kind + "'") < 0) bad(label + ' 的 kind "' + kind + '" 没有图标分支');
      else ok('  ↳ itemIconOf 有 ' + kind + ' 图标');
    }
    // 掉落池
    if (!new RegExp('Object\\.keys\\(' + def + '\\)').test(t)) log('     ⚠️ 掉落池没有用到 ' + def + '（可能是故意的）');
  }
  // 仓库列表 concat 链
  const wh = m37.match(/tab==='warehouse'\)\{([\s\S]{0,400}?)\}/);
  if (!wh) bad('读不到仓库列表代码');
  else {
    const chain = wh[1];
    const want = ['ownedWeaponList', 'ownedArmorList', 'ownedHelmetList', 'ownedHeadsetList', 'ownedPackList', 'ownedChestList'];
    const miss = want.filter(f => chain.indexOf(f) < 0);
    if (miss.length) bad('仓库列表缺少: ' + miss.join(', '));
    else ok('仓库列表已覆盖全部装备类别 (武器/护甲/头盔/耳机/背包/胸挂)');
  }
  // 装备按钮槽位映射
  const eq = m37.match(/action==='equip'\)\{([\s\S]{0,500}?)\n\s*\}/);
  if (!eq) bad('读不到 equip 分支');
  else {
    const seg = eq[1];
    const miss = ['helmet', 'headset', 'pack', 'chest'].filter(k => seg.indexOf("'" + k + "'") < 0);
    if (miss.length) bad('equip 槽位映射缺少: ' + miss.join(', '));
    else ok('equip 槽位映射覆盖 护甲/头盔/耳机/背包/胸挂');
  }
  // TRADE_KEYS
  // TRADE_KEYS 列的是**字面量物品键**(不是 DEF 表名), 所以按字面量查
  const tk = t.match(/const TRADE_KEYS=\[([\s\S]*?)\];/);
  if (!tk) bad('读不到 TRADE_KEYS');
  else {
    const body = tk[1];
    const miss = ['packSmall', 'packAssault', 'packRaid', 'packTT45', 'chest56', 'chestBH', 'chestMK3'].filter(k => body.indexOf(k) < 0);
    if (miss.length) bad('TRADE_KEYS 缺少: ' + miss.join(', '));
    else ok('TRADE_KEYS 覆盖全部背包与胸挂');
  }
}

// ---------- 5. 存档迁移 ----------
log('');
log('=== 5. 新增槽位是否都有老档迁移 ===');
{
  const m = read('js/37_meta.js');
  for (const slot of ['helmet', 'headset', 'chest']) {
    const re = new RegExp("m\\.loadout\\." + slot + "\\s*===\\s*undefined");
    if (re.test(m)) ok('loadout.' + slot + ' 有老档迁移');
    else bad('loadout.' + slot + ' 没有老档迁移 —— 老存档会是 undefined');
  }
  for (const key of ['helm1', 'hs_tep300']) {
    if (new RegExp('!m\\.owned\\.' + key).test(m)) ok('owned.' + key + ' 有老档补发');
    else log('     ⚠️ owned.' + key + ' 没有老档补发');
  }
}

// ---------- 6. 玩家模型按护甲配色 ----------
log('');
log('=== 6. 玩家模型护甲配色 ===');
{
  const s16 = read('js/16_soldier.js');
  const m37 = read('js/37_meta.js');
  const p25 = read('js/25_player_update.js');
  const bot = read('js/19_bot.js');
  // 护甲都要有 color
  const armors = keysOfBlock(m37, 'const ARMOR_DEFS=');
  if (!armors || !armors.size) bad('读不到 ARMOR_DEFS');
  else {
    const miss = [...armors].filter(k => !new RegExp('\\b' + k + ':\\{[^}]*\\bcolor:').test(m37));
    if (miss.length) bad('护甲缺 color 字段: ' + miss.join(', '));
    else ok('全部 ' + armors.size + ' 件护甲都有 color');
  }
  // RANGER_YELLOW 存在
  if (!/const RANGER_YELLOW=/.test(m37)) bad('没有定义 RANGER_YELLOW');
  else ok('RANGER_YELLOW 已定义');
  // 三态区分: undefined / '' / 有效
  if (!/armorKey===undefined\)\?U\.coat\.color/.test(s16)) {
    bad('buildSoldierMesh 没有区分「没传参」(Bot 保持阵营色) —— 会让所有 NPC 变成游骑兵黄');
  } else ok('buildSoldierMesh 三态区分正确 (undefined=阵营色 / \'\'=游骑兵黄 / 有效=护甲色)');
  // 玩家侧要传 armorKey (+ 胸挂, 决定躯干颜色)
  if (!/buildSoldierMesh\(player\.team,'',player\.armorKey,_chestK\)/.test(p25)) {
    bad("ensurePlayerBody 没有把 player.armorKey / 胸挂 传给 buildSoldierMesh");
  } else ok('玩家 mesh 已传入 armorKey + 胸挂');
  // 换甲要重建
  if (!/player\.meshArmor===\(player\.armorKey\|\|''\)/.test(p25)) {
    bad('ensurePlayerBody 的守卫没有比对 armorKey —— 换护甲后模型不会更新');
  } else ok('换护甲会触发模型重建');
  // 换胸挂也要重建
  if (!/player\.meshChest===_chestK/.test(p25)) bad('ensurePlayerBody 的守卫没有比对胸挂 —— 换胸挂后模型不会更新');
  else ok('换胸挂会触发模型重建');
  // 躯干颜色优先级: 胸挂 > 护甲 > 游骑兵黄
  //   (2026-09-19 用户反馈「全身黑装备, 模型却发黄」—— 玩家是 USEC(制服纯黑),
  //    发黄的是躯干: 用的是护甲色, 而 armor5 原配色 0x7a6f52 色相 43.5° 是黄橙色)
  if (!/_cr\?\(_cr\.hex!=null\?_cr\.hex:_RY\)/.test(s16)) bad('buildSoldierMesh 的躯干颜色没有优先取胸挂色 (胸挂穿在护甲外面)');
  else ok('躯干颜色优先级 = 胸挂 > 护甲 > 游骑兵黄');
  // 胸挂要有模型用的 hex (color 字段是中文色名, 只用于物品名)
  {
    const t38 = read('js/38_tarkov.js');
    const chests = keysOfBlock(t38, 'const CHEST_DEFS=');
    if (!chests || !chests.size) bad('读不到 CHEST_DEFS');
    else {
      const noHex = [...chests].filter(k => !new RegExp('\\b' + k + ':\\{[^}]*\\bhex:0x').test(t38));
      if (noHex.length) bad('胸挂缺 hex 字段 (模型配色用): ' + noHex.join(', '));
      else ok('全部 ' + chests.size + ' 件胸挂都有 hex');
    }
  }
  // 护甲配色不能是「黄橙色」—— 否则玩家穿甲后躯干发黄 (色相 35~70° 且够亮)
  {
    const bad_ = [];
    for (const m of m37.matchAll(/\b(armor\d):\{[^}]*\bcolor:(0x[0-9a-fA-F]{6})/g)) {
      const c = parseInt(m[2].slice(2), 16);
      const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      if (!d) continue;
      let h = 0;
      if (mx === r) h = 60 * (((g - b) / d) % 6);
      else if (mx === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
      if (h < 0) h += 360;
      if (h >= 30 && h <= 75 && mx >= 100) bad_.push(m[1] + '(#' + m[2].slice(2) + ' 色相 ' + h.toFixed(0) + '° 偏黄)');
    }
    if (bad_.length) bad('护甲配色偏黄橙, 穿甲后躯干会发黄: ' + bad_.join(', '));
    else ok('护甲配色都不是黄橙色 (穿甲后躯干不会发黄)');
  }
  // Bot 调用必须不带第三个参数
  const botCalls = [...bot.matchAll(/buildSoldierMesh\(([^)]*)\)/g)].map(m => m[1]);
  const botBad = botCalls.filter(a => a.split(',').length >= 3);
  if (botBad.length) bad('19_bot 里给 buildSoldierMesh 传了第三个参数: ' + botBad.join(' | '));
  else ok('19_bot 的 ' + botCalls.length + ' 处调用都没传 armorKey（保持阵营色）');
}

// ---------- 7. 夜视仪 三型 (普通 / 全景 / 热成像) 接线 ----------
log('');
log('=== 7. 夜视仪三型接线 (数据 → 选择器 → 部署 → 局内) ===');
{
  const t = read('js/38_tarkov.js');
  const m = read('js/37_meta.js');
  const menus = read('js/29_menus.js');
  const nvg = read('js/34_nvg.js');
  const html = read('index.html');
  const css = read('css/style.css');
  const want = ['nvg', 'nvg_pano', 'nvg_thermal'];

  // ① 部署界面必须有 #nvgSelect —— 缺了它 37_meta 的整块选择器就是死代码,
  //    玩家选不了型号 → META.loadout.nvg 恒为 undefined → RUN.nvgKey 恒 '' → 夜视仪永远开不了
  const cntSel = (html.match(/id="nvgSelect"/g) || []).length;
  if (cntSel === 1) ok('index.html 有且仅有一个 #nvgSelect');
  else bad('#nvgSelect 在 index.html 出现 ' + cntSel + ' 次 (需恰好 1) —— 选择器是死代码时夜视仪永远开不了');
  // ② 回归: 装备类 select 的 id 必须唯一 (曾出现 #chestSelect 重复两次)
  const ids = ['arsenalSelect', 'secondarySelect', 'armorSelect', 'helmetSelect', 'headsetSelect', 'chestSelect', 'packSelect', 'passSelect', 'nvgSelect'];
  const dup = ids.filter(id => (html.match(new RegExp('id="' + id + '"', 'g')) || []).length !== 1);
  if (dup.length) bad('index.html 里这些 id 不是恰好 1 次: ' + dup.join(', '));
  else ok('装备类 select 的 id 都唯一');

  // ③ NVG_DEFS 三型齐全 + 每型都有 fov/gain/boost
  const defs = keysOfBlock(t, 'const NVG_DEFS=');
  if (!defs) bad('读不到 NVG_DEFS');
  else {
    const miss = want.filter(k => !defs.has(k));
    if (miss.length) bad('NVG_DEFS 缺少: ' + miss.join(', '));
    else ok('NVG_DEFS 三型齐全 (' + [...defs].join(', ') + ')');
    const noField = [...defs].filter(k => !new RegExp('\\b' + k + ':\\s*\\{[^}]*\\bfov:[^}]*\\bgain:[^}]*\\bboost:').test(t));
    if (noField.length) bad('NVG_DEFS 缺 fov/gain/boost: ' + noField.join(', '));
    else ok('每型都有 fov / gain / boost');
    if (/nvg_thermal:\{[^}]*\bthermal:true/.test(t)) ok('热成像型已标 thermal:true');
    else bad('nvg_thermal 没有 thermal:true');
    const fovOf = k => { const mm = t.match(new RegExp('\\b' + k + ':\\s*\\{[^}]*\\bfov:\\s*([0-9.]+)')); return mm ? parseFloat(mm[1]) : null; };
    const f0 = fovOf('nvg'), f1 = fovOf('nvg_pano');
    if (f0 != null && f1 != null && f1 > f0 + 10) ok('全景视野 ' + f1 + '° 明显大于普通 ' + f0 + '°');
    else bad('全景视野没有明显大于普通 (' + f0 + ' vs ' + f1 + ')');
    // ④ 市集买得到
    const tk = t.match(/const TRADE_KEYS=\[([\s\S]*?)\];/);
    const tkMiss = tk ? want.filter(k => tk[1].indexOf(k) < 0) : want;
    if (tkMiss.length) bad('TRADE_KEYS 里买不到: ' + tkMiss.join(', '));
    else ok('三型都在市集 (TRADE_KEYS)');
  }

  // ⑤ itemKind 归到 gear; 图标分支必须排在通用 gear 之前, 否则永远命中不到
  if (/if\(NVG_DEFS\[key\]\) return 'gear';/.test(t)) ok('itemKind 把三型归到 gear');
  else bad('itemKind 没有 NVG_DEFS 分支');
  const ic = t.match(/function itemIconOf\(key\)\{([\s\S]*?)\n\}/);
  if (!ic) bad('读不到 itemIconOf');
  else {
    const iNvg = ic[1].indexOf('NVG_DEFS[key]'), iGear = ic[1].indexOf("k==='gear'");
    if (iNvg < 0) bad('itemIconOf 没有 NVG 图标分支');
    else if (iGear >= 0 && iNvg > iGear) bad('itemIconOf 里 NVG 分支排在通用 gear 之后 → 永远命中不到 (会显示成 ◐)');
    else ok('itemIconOf 的 NVG 分支排在通用 gear 之前');
  }

  // ⑥ RUN 字段: 初值 + 两处重置点 (漏一处 → 上一局的型号会漏进下一局)
  if (/nvgBrought:false,nvgKey:''/.test(m)) ok('37_meta 的 RUN 初值含 nvgBrought/nvgKey');
  else bad('37_meta 的 RUN 初值缺 nvgBrought/nvgKey');
  const rn = (menus.match(/RUN\.nvgBrought=false; RUN\.nvgKey='';/g) || []).length;
  if (rn >= 2) ok('29_menus 的 ' + rn + ' 处 RUN 重置点都清了 nvg 字段');
  else bad('29_menus 只有 ' + rn + ' 处重置点清了 nvg 字段 (应为 2)');

  // ⑦ 部署: 按「携带物品 + 主武器装了战术配件槽」双门控写入
  if (/RUN\.nvgKey=_nvgWant;/.test(t) && /getModChoice\(primaryKey,'gear'\)==='gear_nvg'/.test(t)) ok('部署时按「物品 + 战术配件槽」双门控写入 RUN.nvgKey');
  else bad('applyDeployLoadout 没有按双门控写 RUN.nvgKey');
  // ⑧ 局内门控
  if (/RUN&&!RUN\.nvgBrought\) return false/.test(nvg) && /RUN&&!RUN\.nvgKey\) return false/.test(nvg)) ok('34_nvg.owned() 同时校验 nvgBrought 与 nvgKey');
  else bad('34_nvg.owned() 门控不完整');
  // ⑨ 不应再有已废弃的 player.nvgBrought (该字段从未被赋值)
  if (/player\.nvgBrought/.test(t + m + nvg)) bad('还残留 player.nvgBrought (从未赋值, 恒 undefined → 夜视仪重量永远不计)');
  else ok('没有残留的 player.nvgBrought');
  // ⑩ 热成像画布层级必须低于 #ui, 否则红框会盖住 HUD
  const z = nvg.match(/z-index:(\d+)'/);
  const zUi = (css.match(/#ui\s*\{[^}]*z-index:(\d+)/) || [])[1];
  if (z && zUi && +z[1] < +zUi) ok('热成像画布 z-index ' + z[1] + ' < #ui ' + zUi + ' (不盖 HUD)');
  else bad('热成像画布层级不对 (nvg=' + (z && z[1]) + ', #ui=' + zUi + ')');
  // ⑪ 生命周期: 只有热成像开启时才建画布, 其余玩家不承担这层全屏 canvas
  if (/if\(st\.active&&_d&&_d\.thermal\)\{ initThermal\(\); drawThermal\(\); \}/.test(nvg)) ok('只有热成像开启时才创建/绘制画布');
  else bad('热成像画布不是惰性创建 (所有玩家都会多一层全屏 canvas 的合成开销)');
  // ⑫ 只标 NPC: 玩家同队必须被跳过
  if (/s\.team===player\.team\) continue;\s*\/\/ 只标 NPC/.test(nvg)) ok('热成像只标非友方 NPC');
  else bad('热成像没有排除友方 (会把队友也框红)');

  // ⑬ 微光地图(实验室)补光: 白天也必须补, 不能只在 NIGHT 分支里提 ISO
  //    教训: 用户反馈「开夜视实验室仍然过暗」—— 因为 MAP_DIM 把灯光压了两次(≈0.18×),
  //    而提高 ISO 的改动只写在 NIGHT 分支 → 白天进实验室走旧系数, 依旧一片黑。
  if (!/else if\(dimK>0\)\{/.test(nvg)) bad('没有「白天 + 微光地图」补光分支 —— 白天进实验室开夜视仍然黑');
  else if (!/else if\(dimK>0\)\{[\s\S]{0,300}?sun\.intensity=daySun\*k;/.test(nvg)) bad('「白天 + 微光地图」分支没有放大场景光 (只提曝光/增益不够)');
  else ok('「白天 + 微光地图」有独立补光分支 (放大场景光)');
  {
    const ks = [...nvg.matchAll(/const k=1\+st\.boost\*\(([\d.]+)\+([\d.]+)\*dimK\)\*bMul;/g)].map(m => [+m[1], +m[2]]);
    const gg = nvg.match(/uGain\.value=\(NIGHT\?\(1\+st\.boost\*([\d.]+)\):\(1\+st\.boost\*([\d.]+)\)\)\*\(1\+st\.boost\*dimK\*([\d.]+)\)\*gMul/);
    const dimOf = (() => { const mm = read('js/01_data.js').match(/id:'lab'[\s\S]{0,400}?dimLight:\s*([0-9.]+)/); return mm ? 1 - parseFloat(mm[1]) : 0; })();
    if (ks.length < 2 || !gg) bad('读不到补光系数 (k / uGain 公式被改写?)');
    else {
      const [kNight, kDayDim] = ks;
      const [gN, gD, gK] = [+gg[1], +gg[2], +gg[3]];
      const dimK = dimOf;
      const f = (k, g, bMul) => '光照×' + k.toFixed(2) + ' 增益×' + (g * bMul).toFixed(1);
      log('     场景            光照倍率      着色增益(PVS-14)');
      log('     白天·普通图      ×1.00        ×' + (1 + gD).toFixed(1) + '   (不补光, 只过曝)');
      log('     白天·实验室      ×' + (1 + kDayDim[0] + kDayDim[1] * dimK).toFixed(2) + '        ×' + ((1 + gD) * (1 + dimK * gK)).toFixed(1));
      log('     夜间·普通图      ×' + (1 + kNight[0]).toFixed(2) + '        ×' + (1 + gN).toFixed(1));
      log('     夜间·实验室      ×' + (1 + kNight[0] + kNight[1] * dimK).toFixed(2) + '       ×' + ((1 + gN) * (1 + dimK * gK)).toFixed(1));
      const dayLab = 1 + kDayDim[0] + kDayDim[1] * dimK;
      if (dayLab > 1.5) ok('白天实验室补光到 ×' + dayLab.toFixed(2) + ' (dimK=' + dimK.toFixed(2) + ') —— 能提亮');
      else bad('白天实验室只补到 ×' + dayLab.toFixed(2) + '，仍然偏暗');
      if (dimK > 0 && dayLab > 1) ok('微光地图补光已按 MAP_DIM 自适应 (换地图不用改代码)');
    }
  }

  // ⑭ 仓库列表必须包含夜视仪 (2026-09-19 用户反馈「仓库无法显示」)
  {
    const wh = m.match(/tab==='warehouse'\)\{([\s\S]{0,700}?)\n\s*\}/);
    if (!wh) bad('读不到仓库列表代码');
    else if (wh[1].indexOf('ownedNvgList()') < 0) bad('仓库列表没有 ownedNvgList() —— 夜视仪买了在仓库里看不见, 也就无法装备');
    else ok('仓库列表已包含夜视仪 (ownedNvgList)');
  }

  // ⑮ 逐把武器检查工坊的 gear 槽必须提供 gear_nvg
  //    (2026-09-19 用户反馈「拥有也无法使用」: 没有 MOD_AVAIL 条目的武器走兜底,
  //     而兜底的 gear 只有 gear_none → 那几把枪在工坊里根本没有夜视仪选项)
  {
    const mods = read('js/14b_weapon_mods.js');
    const wpnAll = keysOfBlock(read('js/13_weapons_data.js'), 'const WPN_DEFS=');
    const availKeys = keysOfBlock(mods, 'const MOD_AVAIL=');
    const fb = mods.match(/getModSlots\(key\)\s*\{\s*return\s+MOD_AVAIL\[key\]\s*\|\|\s*\{([^}]*)\}/);
    const fbGear = fb ? ((/gear:\s*\[([^\]]*)\]/.exec(fb[1]) || [])[1] || '') : '';
    const fbHas = fbGear.indexOf("'gear_nvg'") >= 0;
    const forEachOk = /Object\.values\(MOD_AVAIL\)\.forEach\(a=>\{[\s\S]{0,240}?a\.gear=\['gear_none','gear_nvg'\]/.test(mods);
    if (!forEachOk) bad("MOD_AVAIL 的 forEach 没有给 gear 槽追加 gear_nvg");
    if (!fbHas) bad('getModSlots 兜底字面量的 gear 槽缺 gear_nvg —— 没有 MOD_AVAIL 条目的武器装不了夜视仪');
    if (wpnAll && availKeys && forEachOk && fbHas) {
      const viaFallback = [...wpnAll].filter(k => !availKeys.has(k));
      ok('全部 ' + wpnAll.size + ' 把武器的 gear 槽都能装夜视仪' +
        (viaFallback.length ? '（' + viaFallback.length + ' 把走兜底: ' + viaFallback.join(', ') + '）' : ''));
    }
  }

  // ⑯ 夜视仪只能有一处定义 —— MISC_DEFS 不能残留旧 'nvg'
  //    (itemPriceOf/itemDescOf/itemName 的 MISC 分支都排在 NVG_DEFS 之前, 会抢先命中)
  {
    const misc = keysOfBlock(t, 'const MISC_DEFS=');
    if (misc && misc.has('nvg')) bad("MISC_DEFS 里残留 'nvg' 条目 —— 它会在 price/desc/name 上抢先于 NVG_DEFS, 三型表现不一致");
    else ok('夜视仪只由 NVG_DEFS 定义 (MISC_DEFS 无重复条目)');
    if (/if\(key==='nvg'\) return 'gear';/.test(t)) log("     ⚠️ itemKind 里还留着 if(key==='nvg') 硬编码 (NVG_DEFS 分支已能统一覆盖三型)");
  }

  // ⑰ loadout.nvg 归一化必须**无条件**执行, 不能只在 !m.seeded 块里
  {
    const iSeed = m.indexOf('if(!m.seeded)');
    const head = iSeed < 0 ? m : m.slice(0, iSeed);
    if (!/typeof m\.loadout\.nvg!=='string'/.test(head)) bad('loadout.nvg 的归一化写在 !seeded 块里 —— 老档 seeded 已是 true, 会残留布尔 true/undefined, 拥有夜视仪也带不出去');
    else ok('loadout.nvg 有无条件归一化 (老档残留布尔值也能修好)');
    if (!/!NVG_DEFS\[META\.loadout\.nvg\]/.test(t)) bad('没有「型号是否存在」的收口校验 (37_meta 看不到 NVG_DEFS, 必须在 38_tarkov 补)');
    else ok('型号合法性收口在 38_tarkov');
  }

  // ⑱ 下拉里的「不携带 / 不佩戴」要真的能清空槽位
  {
    if (!/OPTIONAL_LOADOUT_SLOTS/.test(m) || !/'nvg'/.test(m)) bad('setLoadout 不允许清空夜视仪槽 —— 选「不携带夜视仪」没反应');
    else ok('setLoadout 允许清空可选槽位 (含 nvg)');
  }
}

// ---------- 8. 重开对局的清场 (残留 NPC 模型 / RUN 状态) ----------
log('');
log('=== 8. 重开对局清场 (残留 NPC / 布娃娃 / 尸体记录 / RUN) ===');
{
  const menus = read('js/29_menus.js');
  const maps = read('js/43_maps.js');
  const s16 = read('js/16_soldier.js');

  // 前提: buildSoldierMesh 会 scene.add(root) —— 所以只清数组 = 模型留在场景里
  if (!/scene\.add\(root\);/.test(s16)) bad('16_soldier 里没有 scene.add(root) —— 清场逻辑的前提变了, 请复查 clearRaidActors');
  else ok('确认 buildSoldierMesh 会 scene.add(root) (清场的必要性前提)');

  if (!/function clearRaidActors\(\)/.test(menus)) bad('没有 clearRaidActors() —— 重开对局后上一局的 NPC 模型会留在场景里变成「无 AI 指令的雕像」');
  else ok('clearRaidActors() 已定义');
  if (!/function startMatch\(\)\{[\s\S]{0,400}?clearRaidActors\(\);/.test(menus)) bad('startMatch() 没有调用 clearRaidActors()');
  else ok('startMatch() 会清场');
  if (!/scene\.remove\(root\);/.test(menus)) bad('clearRaidActors 没有 scene.remove(root) —— 只清 soldiers 数组就是原 bug');
  else ok('清场会 scene.remove(root)');
  for (const [label, re] of [
    ['布娃娃 RAG.list', /while\(RAG\.list\.length\)\s*removeRagdoll/],
    ['建筑碎屑 DEBRIS.list', /while\(DEBRIS\.list\.length\)\s*removeDebrisEntry/],
    ['尸体记录 CORPSES', /CORPSES\.length=0/],
  ]) {
    if (re.test(menus)) ok('清场覆盖 ' + label);
    else log('     ⚠️ 清场没有覆盖 ' + label);
  }

  // 两处 RUN 重置点的字段集必须一致 (新增 RUN 字段时最容易漏 beginRaid)
  const fieldsOf = (src, anchor) => {
    const i = src.indexOf(anchor);
    if (i < 0) return null;
    return new Set([...src.slice(i, i + 460).matchAll(/RUN\.([A-Za-z_$][\w$]*)\s*=/g)].map(x => x[1]));
  };
  const ANCHOR = 'RUN.kills=0; RUN.searches=0; RUN.loot={}; RUN.extracting=false;';
  const A = fieldsOf(menus, ANCHOR), B = fieldsOf(maps, ANCHOR);
  if (!A || !B) bad('读不到 RUN 重置点');
  else {
    const onlyA = [...A].filter(k => !B.has(k));
    if (onlyA.length) bad('43_maps.beginRaid 的 RUN 重置缺字段 (29_menus 有): ' + onlyA.join(', '));
    else ok('两处 RUN 重置点字段一致 (' + A.size + ' 个)');
  }

  // 每士兵独有材质必须标 perSoldier, 否则清场时不 dispose (内存泄漏)
  const noMark = ['_bodyMat', '_plateMat'].filter(nm =>
    !new RegExp(nm + '=new THREE\\.MeshLambertMaterial[^\\n]*' + nm + '\\.userData\\.perSoldier=true').test(s16));
  if (noMark.length) log('     ⚠️ 未标 perSoldier (清场时不释放): ' + noMark.join(', '));
  else ok('每士兵独有材质都标了 perSoldier (清场时会释放)');
}

// ---------- 9. 剧情模式 ----------
log('');
log('=== 9. 剧情模式 (章节 / 地图接入 / 钩子) ===');
{
  const st = read('js/56_story.js');
  const d = read('js/01_data.js');
  const w8 = read('js/08_world.js');
  const maps = read('js/43_maps.js');
  const html = read('index.html');
  const menus = read('js/29_menus.js');
  const ext = read('js/35_extraction.js');
  const anvil = read('js/07g_anvil.js');

  // ① 章节表
  const chs = [...st.matchAll(/\{ id:'(s\d+)', no:(\d+), name:'([^']+)', map:'([a-z0-9_]+)'/g)];
  if (chs.length < 3) bad('章节数过少 (' + chs.length + ')');
  else ok('章节表 ' + chs.length + ' 章');
  const ids = chs.map(c => c[1]);
  if (new Set(ids).size !== ids.length) bad('章节 id 有重复');
  const noExtract = chs.filter(c => {
    const i = st.indexOf("id:'" + c[1] + "'");
    return i < 0 || st.slice(i, i + 1600).indexOf("type:'extract'") < 0;
  });
  if (noExtract.length) bad('这些章节没有 extract 收尾目标: ' + noExtract.map(c => c[1]).join(', '));
  else ok('每章都有 extract 收尾目标 (成败由 finishRaid 判定)');

  // ② 剧情地图必须按「加地图 5 处」全部接入
  //    ⚠️ case 必须锚定行首 (^...m) —— 否则被注释掉的 "//case 'x':" 也会算通过
  const uniq = [...new Set(chs.map(c => c[4]))];
  const missing = [];
  for (const id of uniq) {
    if (!new RegExp("id:'" + id + "'").test(d)) missing.push(id + '(CAMPAIGNS)');
    if (!new RegExp("^case '" + id + "':", 'm').test(w8)) missing.push(id + '(08_world switch)');
    if (!new RegExp('\\b' + id + ':\\{').test(maps)) missing.push(id + '(MAP_RULES)');
  }
  if (missing.length) bad('剧情地图接入不全: ' + missing.join(', '));
  else ok('剧情用到的 ' + uniq.length + ' 张地图都已接入 (CAMPAIGNS / switch / MAP_RULES)');
  const layouts = [...w8.matchAll(/^case '(anvil_[a-z0-9_]+)': (layout[A-Za-z0-9]+)\(\)/gm)];
  const badFn = layouts.filter(([, , fn]) => !new RegExp('function ' + fn + '\\(').test(anvil));
  if (!layouts.length) bad('08_world 里没有剧情布局的 case');
  else if (badFn.length) bad('08_world 引用了不存在的布局函数: ' + badFn.map(x => x[2]).join(', '));
  else ok('剧情布局函数齐全 (' + layouts.map(x => x[2]).join(', ') + ')');
  if (!/<script src="js\/07g_anvil\.js/.test(html)) bad('index.html 没有加载 07g_anvil.js');
  else ok('07g_anvil.js 已加载');
  if (!/forceWeather:/.test(d)) bad('剧情地图没有 forceWeather —— 章节气氛不可控');
  else ok('剧情地图固定天气 (CAMPAIGN.forceWeather 绕过随机池)');

  // ③ ⚠️ 剧情地图必须**追加在 CAMPAIGNS 末尾** (sf_campaign 存的是索引, 插中间会让老存档串图)
  {
    const i = d.indexOf('const CAMPAIGNS=[');
    let depth = 0, st2 = -1, en = -1;
    for (let k = i; k < d.length; k++) {
      if (d[k] === '[') { depth++; if (st2 < 0) st2 = k; }
      else if (d[k] === ']') { depth--; if (depth === 0) { en = k; break; } }
    }
    const body = en > 0 ? d.slice(st2 + 1, en) : '';
    const campIds = [...body.matchAll(/\{ id:'([a-z0-9_]+)'/g)].map(x => x[1]);
    if (campIds.slice(0, 4).join(',') !== 'bfruins,lab,port,airport')
      bad('CAMPAIGNS 前 4 项变了 (' + campIds.slice(0, 4).join(',') + ') —— 会让老存档的 sf_campaign 索引串图');
    else ok('CAMPAIGNS 前 4 项未变, 剧情地图追加在末尾 (' + campIds.slice(4).join(', ') + ')');
  }

  // ④ 钩子
  const hooks = [
    ['startMatch 装载章节', /storyApplyChapter\(\)/.test(menus)],
    ['finishRaid 判定章节成败', /storyOnRaidEnd\(extracted\)/.test(ext)],
    ['showPanel 渲染剧情面板', /storyRenderPanel\(\)/.test(menus)],
    ['主菜单剧情入口', html.indexOf('data-p="mStory"') >= 0],
    ['#mStory 面板', html.indexOf('id="mStory"') >= 0],
    ['#storyHud 局内目标', html.indexOf('id="storyHud"') >= 0],
    ['每帧钩子 (wrap updateMedCrates)', /updateMedCrates=function\(dt\)\{/.test(st)],
    ['剧情物品保底掉落 (wrap rollCrateLootList)', /rollCrateLootList=function\(crate\)/.test(st)],
    ['章节-地图一致性守卫', /CAMPAIGN\.id!==SRAID\.ch\.map/.test(st)],
  ];
  for (const [label, okFlag] of hooks) { if (okFlag) ok(label); else bad('剧情钩子缺失: ' + label); }

  // ⑤ 依赖的全局符号
  const depSrc = [read('js/00_core.js'), read('js/19_bot.js'), read('js/23_player.js'), read('js/39_quests.js'), read('js/37_meta.js'), read('js/22_emplacements.js')].join('\n');
  const depMiss = [['randi', /const randi=/], ['Bot', /class Bot|function Bot/], ['SQUAD', /const SQUAD=/],
    ['gainXP', /function gainXP/], ['formatMoney', /function formatMoney/], ['updateMedCrates', /function updateMedCrates/]]
    .filter(([, re]) => !re.test(depSrc)).map(x => x[0]);
  if (depMiss.length) bad('剧情依赖的全局符号缺失: ' + depMiss.join(', '));
  else ok('剧情依赖的全局符号齐全');

  // ⑥ ⚠️ 天气名必须在 WEATHER_MODES 与 WEATHER_FX 里
  //    线上事故 (版本 20260919n): 剧情地图写了 forceWeather:'anvilhaze', 但 'anvilhaze' 不在 WEATHER_MODES 里 →
  //    29_menus 的 `WEATHER_MODES[WEATHER_MODE].name` 抛 TypeError → **initMenuUI 中断 → 主菜单导航/地图卡片/部署按钮全失效**。
  //    改动前 WEATHER_MODE 恒等于 WEATHER_POOL 里的键, 这个不变量一直成立 —— 是 forceWeather 把它破坏的。
  {
    // ⚠️ 不能用 keysOfBlock: 它每行只取**第一个**键, 而 WEATHER_MODES 是"单行多键"写法 → 只会读到 clear。
    //    (又一次印证: 检查器写错会产出比没有更糟的结果 —— 假警报淹掉真信号)
    //    这里按各表的条目形态精确匹配: WEATHER_MODES 是 `key:{name:`, WEATHER_FX 是 `key:{fogFar:`。
    const modes = new Set([...d.matchAll(/([a-z][a-z0-9_]*):\{name:/g)].map(m => m[1]));
    const fx = new Set([...d.matchAll(/([a-z][a-z0-9_]*):\{fogFar:/g)].map(m => m[1]));
    // 只用 CAMPAIGNS 里真实存在的 id 去查 CAMPAIGN_WEATHER (表里还有 rhine/alps 等历史条目, 不该被检查)
    const iC = d.indexOf('const CAMPAIGNS=[');
    let dp = 0, sC = -1, eC = -1;
    for (let k = iC; k < d.length; k++) {
      if (d[k] === '[') { dp++; if (sC < 0) sC = k; }
      else if (d[k] === ']') { dp--; if (dp === 0) { eC = k; break; } }
    }
    const campIds = eC > 0 ? [...d.slice(sC + 1, eC).matchAll(/\{ id:'([a-z0-9_]+)'/g)].map(x => x[1]) : [];
    const cwM = d.match(/const CAMPAIGN_WEATHER=\{([\s\S]*?)\}\[/);
    const cw = {};
    if (cwM) for (const m of cwM[1].matchAll(/([a-z0-9_]+):'([a-z]+)'/g)) cw[m[1]] = m[2];
    const names = new Set();
    for (const m of d.matchAll(/forceWeather:'([a-z]+)'/g)) names.add(m[1]);
    for (const id of campIds) if (cw[id]) names.add(cw[id]);
    const missModes = [...names].filter(n => !modes.has(n));
    const missFx = [...names].filter(n => !fx.has(n));
    if (missModes.length) bad('天气名不在 WEATHER_MODES 里: ' + missModes.join(', ') + ' —— 会让 29_menus 的天气显示抛错, 进而中断整个主菜单初始化');
    else ok('地图用到的天气名都在 WEATHER_MODES 里 (' + [...names].join(', ') + ')');
    if (missFx.length) bad('天气名不在 WEATHER_FX 里: ' + missFx.join(', '));
    else ok('地图用到的天气名都在 WEATHER_FX 里');
    if (!/wm\?wm\.name:WEATHER_MODE/.test(menus)) log('     ⚠️ 29_menus 的天气显示没有容错 —— 缺表项时会抛错并中断主菜单初始化');
    else ok('29_menus 的天气显示已容错');
  }

  // ⑦ 剧情固定配装 (无需选择装备) + 自动进场
  {
    const checks = [
      ['storyApplyKit 存在', /function storyApplyKit\(\)/.test(st)],
      ['deployPlayer 被 wrap (配装生效)', /deployPlayer=function\(\)\{ const r=_storyOrigDeployPlayer/.test(st)],
      ['自动进场 (跳过装备选择)', /function storyAutoDeploy\(\)/.test(st) && /db\.onclick\(\)/.test(st)],
      ['剧情面板标注配装', st.includes('本章配发装备')],
    ];
    for (const [label, okFlag] of checks) { if (okFlag) ok(label); else bad('剧情配装缺失: ' + label); }
    // 配装用到的键必须真实存在
    const wd2 = read('js/13_weapons_data.js');
    const med2 = read('js/38_tarkov.js');
    const kitMiss = [];
    if (!/\bm4:\s*\{/.test(wd2)) kitMiss.push('m4(武器表)');
    if (!/\bm1911:\s*\{/.test(wd2)) kitMiss.push('m1911(武器表)');
    if (!/\bmedkit:\s*\{/.test(med2)) kitMiss.push('medkit(医疗表)');
    if (!/\bcms:\s*\{/.test(med2)) kitMiss.push('cms(医疗表)');
    if (kitMiss.length) bad('剧情配装引用了不存在的物品键: ' + kitMiss.join(', '));
    else ok('剧情配装物品键齐全 (m4 / m1911 / medkit / cms)');
    // ⚠️ 配装的 deployPlayer wrap 必须在 46_throwables 之后 —— 否则手雷数会被它覆盖回 0
    const iT = html.indexOf('46_throwables.js'), iS = html.indexOf('56_story.js');
    if (iT >= 0 && iS >= 0 && iS < iT) bad('56_story.js 在 46_throwables.js 之前加载 —— applyThrowablesToPlayer 会覆盖剧情手雷数');
    else ok('56_story.js 在 46_throwables.js 之后加载 (手雷数不会被覆盖)');
  }

  // ⑧ 用实际章节判定检验到访、携带和护送，它们的完成条件不同。
  {
    const probe=require('node:child_process').spawnSync(process.execPath,[R('_tools/_storyonly_probe.js')],{cwd:ROOT,encoding:'utf8'});
    if(probe.status===0) ok('剧情地图与目标行为检查通过');
    else bad('剧情行为检查失败\n'+(probe.stderr||probe.stdout||probe.error));
  }

  // ⑨ 剧情模式的健壮性 —— 它挂在**主循环 / 建局 / 结算**三条主链路上, 抛错会拖垮整个游戏
  //    线上事故: ① `if(SRAID.ch) storyClearPending();` → 地图不匹配时待打标记永不清 →
  //              之后每次页面加载都被强制进场 (用户报「loop」);
  //              ② 每帧的 storyUpdate 没有 try/catch → 主循环后半段全不执行 + 控制台每帧刷错。
  {
    const fnRaw = (st.match(/function storyApplyChapter\(\)\{([\s\S]*?)\n\}/) || [])[1] || '';
    // ⚠️ 必须先剥掉行注释再断言 —— 否则「注释里写的旧代码」也会被匹配到 (本次就踩了:
    //    注释里引用了 `if(SRAID.ch) storyClearPending();` 作为反例, 结果被当成真代码报错)
    const fn = fnRaw.replace(/\/\/[^\r\n]*/g,'');
    if (!fn) bad('读不到 storyApplyChapter');
    else {
      if (/if\(SRAID\.ch\)\s*storyClearPending\(\)/.test(fn)) bad('storyApplyChapter 只在采纳时清待打标记 —— 地图不匹配时标记残留, 之后每次加载都会被强制进场');
      else if (!/^\s*storyClearPending\(\);\s*$/m.test(fn)) bad('storyApplyChapter 没有无条件清理待打标记');
      else ok('待打标记无条件清理 (切图后不会卡在强制进场)');
      if (!/catch\(e\)\{ console\.error\('\[story\] applyChapter failed/.test(fn)) bad('storyApplyChapter 没有外层保护 —— 抛错会中断 startMatch 建局');
      else ok('storyApplyChapter 有外层保护');
    }
    if (!/CAMPAIGN\.id!==STORY_CHAPTERS\[_pi\]\.map/.test(st)) bad('自动进场没有校验地图 —— 切图后会被强拉进局');
    else ok('自动进场校验地图 (不匹配就清标记放弃)');
    if (!/try\{ storyUpdate\(dt\); \}/.test(st)) bad('每帧的 storyUpdate 没有 try/catch —— 抛错会让主循环后半段全不执行, 且每帧刷错');
    else ok('每帧钩子有 try/catch (剧情 bug 不会拖垮主循环)');
    if (!/try\s*\{\s*(?:\w+\s*=\s*)?storyOnRaidEnd\(extracted\);\s*\}\s*catch\(/.test(ext)) bad('结算钩子没有 try/catch —— 抛错会让 finishRaid 中断, 永远结算不了');
    else ok('结算钩子有 try/catch');
  }

  // ⑩ 剧情配装必须含夜视仪 (地下章节太黑), 且**不能漏进沙盒**
  //    夜视仪有双门控: ① 部署界面选型 ② 主武器 gear 槽装支架。剧情模式跳过装备选择 → 两道都不满足。
  {
    const g = (st.match(/function storyNvgGranted\(\)\{([\s\S]*?)\n\}/) || [])[1] || '';
    if (!g) bad('没有 storyNvgGranted() —— 剧情配发的夜视仪会被「工坊装支架」门控挡住');
    else if (!/SRAID\.live&&/.test(g)) bad('storyNvgGranted 没有要求 SRAID.live —— 沙盒局会白拿夜视仪');
    else ok('storyNvgGranted 要求 SRAID.live (沙盒拿不到)');
    const nvg = read('js/34_nvg.js');
    if (!/storyNvgGranted\(\)\) return true/.test(nvg)) bad('34_nvg.owned() 没有调用 storyNvgGranted() —— 剧情局的夜视仪仍然不可用');
    else ok('34_nvg.owned() 对剧情配装放行');
    if (!/RUN\.nvgBrought=true; RUN\.nvgKey='nvg_pano'/.test(st)) bad('storyApplyKit 没有配发全景夜视仪 (nvg_pano)');
    else ok('剧情配装含全景夜视仪 (nvg_pano · 118°)');
  }

  // ⑪ 剧情专用地图只能从剧情模式进入 —— 不能出现在沙盒地图列表里
  {
    const marked = (d.match(/storyOnly:true/g) || []).length;
    if (marked < 2) bad('剧情地图没有标 storyOnly (' + marked + ' 处) —— 会漏进沙盒地图列表');
    else ok('两张剧情地图都标了 storyOnly');
    if (!/if\(CAMPAIGNS\[i\]&&CAMPAIGNS\[i\]\.storyOnly&&!localStorage\.getItem\('sf_story'\)\) i=0;/.test(d))
      bad('CAMPAIGN_IDX 没有 storyOnly 回退 —— 存档停在剧情图时沙盒会直接跑剧情图');
    else ok('CAMPAIGN_IDX 对剧情图有回退');
    const rmc = (maps.match(/function renderMapCards\(\)\{([\s\S]*?)\n\}/) || [])[1] || '';
    const iF = Math.max(rmc.indexOf('if(c.storyOnly) return;'), rmc.indexOf('if(c.storyOnly||c.rangeOnly) return;'));
    const iB = rmc.indexOf("document.createElement('button')");
    if (iF < 0) bad('renderMapCards 没有过滤 storyOnly —— 剧情地图会出现在沙盒地图卡片里');
    else if (iB >= 0 && iF > iB) bad('renderMapCards 的过滤写在了建按钮之后 —— 卡片照样会生成');
    else ok('renderMapCards 过滤掉剧情地图');
    const iDb = menus.indexOf("el('deployBtn').onclick");
    const iG = iDb < 0 ? -1 : menus.indexOf('storyMapBlocked()', iDb);
    const iC = iDb < 0 ? -1 : menus.indexOf('consumeRaidStart()', iDb);
    if (iG < 0) bad('deployBtn 没有 storyMapBlocked 守卫 —— 沙盒能部署进剧情地图');
    else if (iC >= 0 && iG > iC) bad('deployBtn 守卫在 consumeRaidStart 之后 —— 标记已被清, deployPlayer 照样执行 (会被扔进空图)');
    else ok('deployBtn 在建局前拦住剧情地图');
    if (!/function startMatch\(\)\{[\s\S]{0,200}storyMapBlocked\(\)/.test(menus))
      bad('startMatch 没有 storyMapBlocked 守卫');
    else ok('startMatch 有剧情地图守卫');
  }
}

// ---------- 10. 虚拟按键开关 (PC 触控屏) ----------
log('');
log('=== 10. 虚拟按键 TOUCHUI (PC 触控屏) ===');
{
  const d = read('js/01_data.js'), t31 = read('js/31_touch.js'), m30 = read('js/30_main.js');
  const t38 = read('js/38_tarkov.js'), inp = read('js/24_input.js');
  const css = read('css/style.css'), html = read('index.html');

  if (!/const TOUCHUI=/.test(d)) bad('01_data 里没有 TOUCHUI —— PC 触控屏仍然拿不到虚拟按键');
  else ok('TOUCHUI 已定义');
  const blk = (d.match(/const TOUCHUI=\(\(\)=>\{([\s\S]*?)\n\}\)\(\)/) || [])[1] || '';
  if (!/HAS_TOUCH&&!KB_HINT/.test(blk)) bad('TOUCHUI 判定没有包含「有触摸屏 + 检测不到键盘」这条路径 —— PC 触控屏仍不显示');
  else ok('TOUCHUI 包含「触控屏 PC」路径');
  if (!/sf_touch/.test(blk)) bad('TOUCHUI 没有读手动开关 sf_touch');
  else ok('TOUCHUI 支持手动强制 (sf_touch: 1 常开 / 0 常关)');
  if (!/sf_kb/.test(blk)) bad('TOUCHUI 没有读键盘记忆 sf_kb');
  else ok('TOUCHUI 会读键盘记忆 sf_kb');

  // ⚠️ 触控 UI 的判定必须全部换成 TOUCHUI —— 漏一处, PC 触控屏那一处就失效
  const left = [];
  if (/^if\(MOBILE\)\{/m.test(t31)) left.push('31_touch 触控注册');
  if (/if\(MOBILE&&window\.updateTouchVis\)/.test(m30)) left.push('30_main updateTouchVis');
  if (/\(MOBILE&&entries\.length\)/.test(t38)) left.push('38_tarkov 搜刮触屏按钮');
  if (/typeof MOBILE!=='undefined'&&MOBILE/.test(t38)) left.push('38_tarkov 背包提示文案');
  if (left.length) bad('这些触控 UI 判定还在用 MOBILE (PC 触控屏会失效): ' + left.join(', '));
  else ok('触控 UI 判定已全部改用 TOUCHUI');

  if (!/if\(TOUCHUI\)\{\r?\ndocument\.body\.classList\.add\('touchui'\);/.test(t31)) bad('31_touch 没有给 body 加 touchui 类');
  else ok('body.touchui 类已加');
  if (!/body\.touchui #touchUI \{ display:block; \}/.test(css)) bad('CSS 没有 body.touchui #touchUI 规则 —— 类加了也不会显示');
  else ok('CSS 有 body.touchui #touchUI 规则');
  if (html.indexOf('id="touchModeBtn"') < 0) bad('设置面板没有「虚拟按键」开关');
  else ok('设置面板有「虚拟按键」开关');
  if (!/touchModeBtn/.test(t31)) bad('「虚拟按键」开关没有绑定事件');
  else ok('「虚拟按键」开关已绑定');
  if (!/addEventListener\('keydown',onKey,true\)/.test(t31)) bad('没有运行时键盘探测 —— 有键盘的触控屏 PC 会一直挂着虚拟按键');
  else ok('有运行时键盘探测 (按下物理键 → 收起并记住)');
  if (/^if\(MOBILE\) return;$/m.test(inp) || /function lockPointer\(\)\{\r?\nif\(MOBILE\)/.test(inp))
    log('     ⚠️ 24_input 的指针锁定还在用 MOBILE —— 触屏独用设备会被锁指针 (无鼠标时会卡住视角)');
  else ok('指针锁定判定已跟 TOUCHUI');
}

// ---------- 11. 改装槽位同步 ----------
log('');
log('=== 11. 改装槽位同步 (7 槽) ===');
{
  const mm = read('js/14b_weapon_mods.js'), t38 = read('js/38_tarkov.js');
  const SLOTS = ['optic', 'muzzle', 'mag', 'stock', 'grip', 'gear', 'light'];
  // ⚠️ 槽位定义散落在多处, 漏一处那一处就静默失效 —— 这是本项目的老毛病
  const noMod = SLOTS.filter(s => !new RegExp("slot:'" + s + "'").test(mm));
  if (noMod.length) bad('ALL_MODS 里没有这些槽位的改件: ' + noMod.join(', '));
  else ok('ALL_MODS 覆盖全部 ' + SLOTS.length + ' 个槽位');

  const LIST = "'optic','muzzle','mag','stock','grip','gear','light'";
  if ((mm.split(LIST).length - 1) >= 2) ok('modDisplayName / modTotalCost 含 7 槽');
  else bad('modDisplayName / modTotalCost 还是旧槽位清单');
  if (t38.includes(LIST)) ok('工坊渲染循环 (38_tarkov) 含 7 槽');
  else bad('工坊渲染循环还是旧槽位清单 —— 新槽位在工坊里根本不显示');

  if (!/\['optic','muzzle','mag','stock','grip'\]\.forEach/.test(mm)) bad('moddedDef 的槽位循环没算 stock/grip —— 改件有效果但数值不生效');
  else ok('moddedDef 会计算 stock/grip 的数值');

  // 兜底字面量 (没有 MOD_AVAIL 条目的武器走它) —— 两处同步铁律
  const fbLine = mm.split('\n').find(l => l.indexOf('function getModSlots') >= 0) || '';
  const lackFb = SLOTS.filter(s => !new RegExp('\\b' + s + ':').test(fbLine));
  if (lackFb.length) bad('getModSlots 兜底字面量缺: ' + lackFb.join(', ') + ' —— 那几把枪在工坊里没有这些槽位');
  else ok('getModSlots 兜底字面量含全部 ' + SLOTS.length + ' 槽');

  const nmBlk = (t38.match(/const MOD_SLOT_NAMES=\{([^}]*)\}/) || [])[1] || '';
  const lackNm = SLOTS.filter(s => !new RegExp('\\b' + s + ':').test(nmBlk));
  if (lackNm.length) bad('MOD_SLOT_NAMES 缺: ' + lackNm.join(', '));
  else ok('MOD_SLOT_NAMES 含全部 ' + SLOTS.length + ' 槽');

  // 枪托/握把必须**按类别自动分配** —— 逐把写 61 行必然漏
  if (!/a\.stock = bare \? \[\] :/.test(mm) || !/a\.grip {2}= bare \? \[\] :/.test(mm)) bad('枪托/握把没有按武器类别自动分配');
  else ok('枪托/握把按武器类别自动分配 (不逐把写)');

  // 有数值没外观 = 半成品
  if (!/const stk = getModChoice\(key, 'stock'\)/.test(mm)) bad('枪托没有外观件 (改了模型上看不出来)');
  else ok('枪托有外观件');
  if (!/const gp = getModChoice\(key, 'grip'\)/.test(mm)) bad('握把没有外观件');
  else ok('握把有外观件');

  // 行为探针 (真跑逻辑, 不是看代码)
  const probe = path.join(__dirname, '_mods_probe.js');
  if (!fs.existsSync(probe)) log('     ⚠️ 没有 _mods_probe.js —— 建议跑一次行为验证');
  else ok('有行为探针 _mods_probe.js (node _tools/_mods_probe.js)');
}

// ---------- 12. 倒地 / 救援 ----------
log('');
log('=== 12. 倒地 / 救援机制 ===');
{
  const dn = read('js/57_downed.js'), bot = read('js/19_bot.js'), pu = read('js/25_player_update.js');
  const html = read('index.html'), css = read('css/style.css');

  // ① 倒地时长必须是 60 秒 (需求: 最多 1 分钟)
  if (/const DOWN_MAX_T=60;/.test(dn)) ok('倒地时长 = 60 秒 (需求: 最多 1 分钟)');
  else bad('倒地时长不是 60 秒');

  // ② ⚠️ 决策优先级: 救援必须在**搜索之前** (战斗 > 救援 > 搜索)
  const iRes = bot.indexOf('this.tryStartRescue(engaged,distT)');
  const iLoot = bot.indexOf('this.tryStartLoot(engaged,distT)');
  if (iRes < 0) bad('19_bot 决策处没有调用 tryStartRescue —— NPC 永远不会去救人');
  else if (iLoot < 0) bad('找不到 tryStartLoot 决策点');
  else if (iRes < iLoot) ok('优先级正确: 救援判定在搜索之前 (战斗 > 救援 > 搜索)');
  else bad('救援判定排在搜索之后 —— 优先级反了 (NPC 会一直翻箱子不去救人)');

  // ③ 救援状态体
  if (/if\(this\.state==='rescue'\)\{/.test(bot)) ok('19_bot 有 rescue 状态体');
  else bad('19_bot 没有 rescue 状态体 —— 走到队友身边也不会读条');
  // ④ 倒地单位不再被锁定
  if (/\|\|e\.downed\|\|/.test(bot)) ok('敌人候选跳过已倒地单位 (倒地 = 退出战斗)');
  else bad('已倒地单位仍会被锁定 —— 倒地瞬间就被补枪, 救援没意义');
  // ⑤ 玩家倒地闸门 + 交互提示 + F 救援
  if (/if\(player\.downed\) return updatePlayerDowned\(dt\)/.test(pu)) ok('玩家倒地时不移动/不开火');
  else bad('玩家倒地后仍能行动');
  if (/nearestDownedMateNear\(player\.pos\.x/.test(pu)) ok('靠近倒地队友时显示「F 救援」提示');
  else bad('没有救援交互提示');
  if (/playerTryRescue\(\)\) return/.test(pu)) ok('F 键会触发救援');
  else bad('F 键没有接上救援');
  // ⑥ ⚠️ 超时真死必须走 _dieRaw (否则会被自己的包装再判一次「可倒地」→ 无限倒地)
  if (/obj\._dieRaw=orig;/.test(dn)) ok('保存了原始 die (_dieRaw)');
  else bad('没有保存原始 die');
  if (!/p\._dieRaw\|\|p\.die/.test(dn)) bad('玩家超时没走 _dieRaw —— 会无限倒地');
  else if (!/this\._dieRaw\|\|this\.die/.test(dn)) bad('机器人超时没走 _dieRaw —— 会无限倒地');
  else ok('超时/处决走 _dieRaw (不会无限倒地)');
  // ⑦ 爆头不给倒地机会
  if (/return !s\.downed&&!isHead&&!matchOver/.test(dn)) ok('爆头不给倒地机会');
  else bad('爆头也会倒地 —— 会永远打不死');
  // ⑧ HUD + 加载
  if (html.indexOf('id="downHud"') < 0) bad('index.html 没有 #downHud');
  else if (!/#downHud \{/.test(css)) bad('CSS 没有 #downHud 样式');
  else ok('倒地 HUD 已就位 (#downHud + CSS)');
  if (!/<script src="js\/57_downed\.js/.test(html)) bad('index.html 没有加载 57_downed.js');
  else ok('57_downed.js 已加载');
  // ⑨ 加载顺序: 57 必须在 19_bot / 23_player / 25_player_update 之后 (它包装这些)
  const i57 = html.indexOf('57_downed.js');
  const order = ['19_bot.js', '23_player.js', '25_player_update.js'].filter(f => html.indexOf(f) > i57);
  if (order.length) bad('57_downed.js 加载太早 (应在这些之后): ' + order.join(', '));
  else ok('57_downed.js 加载顺序正确 (在 19_bot/23_player/25_player_update 之后)');
  // ⑩ 行为探针
  if (!fs.existsSync(path.join(__dirname, '_downed_probe.js'))) log('     ⚠️ 没有 _downed_probe.js');
  else ok('有行为探针 _downed_probe.js (node _tools/_downed_probe.js)');
}

// ---------- 13. 翻越 (窗户 / 低矮掩体) ----------
log('');
log('=== 13. 翻越 (窗户 / 低矮掩体) ===');
{
  const strip = (x) => x.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');   // ⚠️ 断言前剥注释
  const vp = strip(read('js/58_vault.js'));
  const upd = strip(read('js/25_player_update.js'));
  const htm = read('index.html');

  // ① 加载
  if (!htm.includes('js/58_vault.js?v=')) bad('index.html 没有加载 58_vault.js');
  else ok('58_vault.js 已加载');
  const i25 = htm.indexOf('25_player_update.js'), i58 = htm.indexOf('58_vault.js');
  if (!(i25 >= 0 && i58 > i25)) bad('58_vault.js 必须在 25_player_update.js 之后加载 (updatePlayer 要调 updateVault)');
  else ok('58_vault.js 加载顺序正确');

  // ② 两个钩子
  if (!/if\(player\.vaultT>0\) return updateVault\(dt\);/.test(upd)) bad('updatePlayer 没有翻越钩子 —— 翻越过程会被常规移动/碰撞覆盖');
  else ok('updatePlayer 有翻越钩子 (vaultT>0 时交给 updateVault)');
  if (!/typeof vaultTry==='function'&&vaultTry\(\)/.test(upd)) bad('跳跃分支没有先试翻越 —— 按跳跃键只会跳');
  else ok('跳跃键优先触发翻越 (翻不过去才跳)');

  // ③ 判定依据必须是 BOXES (与 collideMove 同一套), 不能用 OCC 2D 栅格
  if (/occBlocked|OCC\./.test(vp)) bad('58_vault 用了 OCC —— 2D 栅格不含高度, 会把整面墙和窗台当同一回事');
  else ok('翻越判定用 BOXES (与 collideMove 同一套数据)');
  if (!/standHeight\(x,z,feet\+0\.3\)/.test(vp)) bad('落脚点没有用 standHeight 校验 —— 可能落到半空/屋顶');
  else ok('落脚点用 standHeight 校验');

  // ④ 落点落差: 只禁止往上, 往下有上限 (二楼可翻出, 三楼不行)
  if (!/if\(gh-feet>0\.80\) continue;/.test(vp)) bad('翻越落点还在用 |落差|<=0.8 —— 二楼窗台翻不出去');
  else if (!/if\(feet-gh>VAULT\.maxDrop\) continue;/.test(vp)) bad('翻越落点没有向下限幅 —— 能从高层直接翻出去摔死');
  else ok('翻越落点: 只禁往上 0.8m, 往下受 maxDrop 限制');
  const md = (vp.match(/maxDrop:([0-9.]+)/) || [])[1];
  if (!md) bad('读不到 VAULT.maxDrop');
  else if (parseFloat(md) < 3.1) bad('VAULT.maxDrop=' + md + ' 太小 —— 二楼窗台(3.05m)翻不出去');
  else if (parseFloat(md) > 6.0) bad('VAULT.maxDrop=' + md + ' 太大 —— 三层也敢翻');
  else ok('翻越向下上限 = ' + md + 'm (二层可翻, 三层不可)');

  // ⑤ 上限: 不能翻过整面墙
  const mt = (vp.match(/maxTop:([0-9.]+)/) || [])[1];
  if (!mt) bad('读不到 VAULT.maxTop');
  else if (parseFloat(mt) > 1.5) bad('VAULT.maxTop=' + mt + ' 太大 —— 能翻过整面墙');
  else ok('翻越高度上限 = ' + mt + 'm (窗台 0.95 / 沙袋 1.0 可翻, 整墙不可)');

  // ⑤ 必须确认「翻不过去时返回 false」, 否则跳跃会被吃掉
  if (!/if\(!f\) return false;/.test(vp)) bad('vaultTry 没有在找不到目标时返回 false —— 按跳跃键会没反应');
  else ok('无翻越目标时 vaultTry 返回 false (跳跃照常)');
  if (!/p\.vaultNext=nowT\+VAULT\.cooldown/.test(vp)) bad('翻越没有冷却 —— 按住跳跃键会连翻');
  else ok('翻越有冷却');

  // ⑥ 行为探针
  if (!fs.existsSync(path.join(__dirname, '_vault_probe.js'))) log('     ⚠️ 没有 _vault_probe.js');
  else ok('有行为探针 _vault_probe.js (node _tools/_vault_probe.js)');
}

// ---------- 14. 屏幕边缘反馈 (压抑变暗 / 受伤血块) ----------
log('');
log('=== 14. 屏幕边缘反馈 (压抑变暗 / 受伤血块) ===');
{
  const strip = (x) => x.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
  const fx = strip(read('js/59_screenfx.js'));
  const htm = read('index.html');
  const css = read('css/style.css');

  if (!htm.includes('js/59_screenfx.js?v=')) bad('index.html 没有加载 59_screenfx.js');
  else ok('59_screenfx.js 已加载');
  const i59 = htm.indexOf('59_screenfx.js');
  const early = ['18_ballistics.js', '28_hud.js', '23_player.js'].filter(f => htm.indexOf(f) > i59);
  if (early.length) bad('59_screenfx.js 加载太早 (应在这些之后): ' + early.join(', '));
  else ok('59_screenfx.js 加载顺序正确');

  if (!htm.includes('id="bloodOv"')) bad('index.html 没有 #bloodOv');
  else if (!/#bloodOv\{[\s\S]{0,400}radial-gradient/.test(css)) bad('CSS 的 #bloodOv 没有血块渐变');
  else ok('血块遮罩已就位 (#bloodOv + 多团 radial-gradient)');
  if (htm.indexOf('id="bloodOv"') < htm.indexOf('id="vig"')) bad('#bloodOv 在 #vig 之前 —— 会被暗角盖住');
  else ok('血块在暗角之上 (不会被盖住)');

  if (!/fireBullet=function\(shooter,origin/.test(fx)) bad('没有包装 fireBullet —— 队友在附近开火不会压暗');
  else ok('fireBullet 已包装 (队友开火 → 压抑)');
  if (!/player\.damage=function\(amt,attacker,isHead,part\)/.test(fx)) bad('没有包装 player.damage —— 受伤不会出红块');
  else ok('player.damage 已包装 (用血量差算受伤量)');
  if (!/before=this\.hp/.test(fx)) bad('player.damage 包装没有记录血量差');
  else ok('受伤量按血量差计算 (不依赖内部实现)');
  if (!/wasDown\|\|this\.downed/.test(fx)) bad('倒地后中弹不会渗血 (57_downed 拦住了 hp 变化)');
  else ok('倒地后中弹仍会渗血');
  if (!/updateHUD=function\(dt\)/.test(fx)) bad('没有包装 updateHUD —— 遮罩透明度不会被更新');
  else ok('updateHUD 已包装 (每帧写遮罩透明度)');
  if (!/nearR:22/.test(fx)) bad('队友开火的影响半径不是 22m');
  else ok('队友开火影响半径 = 22m');
  if (!/f\.blood=Math\.max\(0,f\.blood-dt\*0\.14\)/.test(fx)) bad('血块没有缓慢消退 —— 会一直红着');
  else ok('血块会缓慢消退');

  if (!fs.existsSync(path.join(__dirname, '_screenfx_probe.js'))) log('     ⚠️ 没有 _screenfx_probe.js');
  else ok('有行为探针 _screenfx_probe.js (node _tools/_screenfx_probe.js)');
}

// ---------- 15. 坠落伤害 ----------
log('');
log('=== 15. 坠落伤害 (>3m 按高度扣血) ===');
{
  const strip = (x) => x.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
  const fd = strip(read('js/60_falldmg.js'));
  const htm = read('index.html');

  if (!htm.includes('js/60_falldmg.js?v=')) bad('index.html 没有加载 60_falldmg.js');
  else ok('60_falldmg.js 已加载');
  const i25 = htm.indexOf('25_player_update.js'), i60 = htm.indexOf('60_falldmg.js');
  if (!(i25 >= 0 && i60 > i25)) bad('60_falldmg.js 必须在 25_player_update.js 之后 (它要包装 updatePlayer)');
  else ok('60_falldmg.js 加载顺序正确');

  if (!/safe:3\.0/.test(fd)) bad('坠落免伤高度不是 3m');
  else ok('坠落免伤高度 = 3m');
  if (!/p\.damage\(dmg,null,false,'legs'\)/.test(fd)) bad('坠落伤害没走 player.damage —— 倒地/死亡/HUD 不会联动');
  else ok('坠落伤害走 player.damage (沿用倒地/死亡链路)');
  if (!/p\.vaulting&&p\.vaultFrom/.test(fd)) bad('翻越落地用了弧线顶点 —— 翻二楼会被多算 0.95m');
  else ok('翻越落地用楼层差 (不用弧线顶点)');
  if (!/p\._onLadder/.test(fd)) bad('爬梯没有排除 —— 下梯子会扣血');
  else ok('爬梯/载具/倒地/对局结束 都不扣血');
  if (!/maxRatio:0\.85/.test(fd)) bad('坠落伤害没有上限 (会直接摔死)');
  else ok('坠落伤害有上限 (最多 85% 最大生命)');

  if (!fs.existsSync(path.join(__dirname, '_falldmg_probe.js'))) log('     ⚠️ 没有 _falldmg_probe.js');
  else ok('有行为探针 _falldmg_probe.js (node _tools/_falldmg_probe.js)');
}

// ---------- 16. 室内靶场 ----------
log('');
log('=== 16. 室内靶场 (免费武器 / 无限弹药 / 2~30m 靶) ===');
{
  const strip = (x) => x.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
  const rg = strip(read('js/61_range.js'));
  const map = read('js/07h_range.js');
  const htm = read('index.html');
  const dat = read('js/01_data.js');
  const wld = read('js/08_world.js');
  const mps = strip(read('js/43_maps.js'));

  if (!/function layoutRange\(\)/.test(map)) bad('07h_range.js 没有 layoutRange()');
  else ok('layoutRange() 已定义');
  if (!/case 'range': layoutRange\(\);/.test(wld)) bad('08_world 没有 range 布局分支');
  else ok('08_world 有 range 分支');
  // ⚠️ 天花板必须用 mesh: solidBox 会把整片区域写进 OCC(2D) → findFreeSpawn 认为靶道全被堵住
  if (!/const ceil=mesh\(/.test(map)) bad('靶场天花板不是 mesh —— solidBox 会污染 OCC, 玩家可能生成在场外');
  else ok('天花板用 mesh (不污染 OCC)');

  if (!/id:'range'[\s\S]{0,700}?rangeOnly:true/.test(dat)) bad('CAMPAIGNS 没有 range 或没标 rangeOnly');
  else ok('CAMPAIGNS 有 range (rangeOnly)');
  if (!/id:'range'[\s\S]{0,700}?extract:\[\]/.test(dat)) bad('靶场没有清空 extract —— 会被撤离点立刻结算');
  else ok('靶场没有撤离点');
  if (!/indoor:\{name:'室内'\}/.test(dat) || !/indoor:\{fogFar:1/.test(dat)) bad('室内天气没登记进 WEATHER_MODES/FX');
  else ok('室内天气已登记 (不会让主菜单天气显示抛错)');

  if (!htm.includes('id="rangeBtn"')) bad('主菜单没有靶场按钮');
  else if (!/initMenuUI=function\(\)\{[\s\S]{0,400}?rangeBindMenuBtn\(\); [\s\S]{0,90}?return r;/.test(rg))
    bad('靶场按钮没在 initMenuUI 之后绑定 —— 会被 .navBtn 通用绑定覆盖, 点了没反应');
  else ok('主菜单有靶场按钮');
  if (!/addEventListener\('click',function\(ev\)\{[\s\S]{0,200}?t\.closest\('#rangeBtn'\)/.test(rg))
    bad('靶场按钮没有捕获阶段的兜底委托 —— onclick 一旦被重绑就点不动');
  else ok('靶场按钮有捕获阶段兜底委托 (onclick 被清空也能用)');
  if (!htm.includes('id="rangeHud"')) bad('index.html 没有 #rangeHud');
  else ok('靶场 HUD 已就位');
  if (!/js\/61_range\.js\?v=/.test(htm) || !/js\/07h_range\.js\?v=/.test(htm)) bad('靶场脚本没加载');
  else ok('靶场脚本已加载');
  if (!(htm.indexOf('07h_range.js') < htm.indexOf('08_world.js'))) bad('07h_range.js 必须在 08_world.js 之前');
  else ok('07h_range.js 加载顺序正确');

  if (!/if\(c\.storyOnly\|\|c\.rangeOnly\) return;/.test(mps)) bad('地图卡片没过滤 rangeOnly');
  else ok('靶场不进沙盒地图列表');
  if (!/localStorage\.getItem\('sf_range'\)==='1'\) return false;/.test(mps)) bad('守卫没放行 sf_range —— 靶场部署会被拦');
  else ok('守卫对靶场放行');

  if (!/raySoldiers=function/.test(rg)) bad('没有包装 raySoldiers —— 打不中靶');
  else ok('raySoldiers 已包装 (靶子可命中)');
  if (!/META\.loadout\.primary=savedPrimary;/.test(rg)) bad('免费武器没有还原 META.loadout.primary —— 会污染存档');
  else ok('免费武器不写存档 (部署后还原)');
  if (!/s\.reserve=RANGE\.AMMO/.test(rg)) bad('没有补满 reserve —— 不是无限弹药');
  else ok('无限弹药已实现');
  if (!/DISTS:\[2,4,6,8,10,12,15,18,22,26,30\]/.test(rg)) bad('靶位距离不是 2~30m');
  else ok('靶位 2~30m (11 个)');
  if (!/MOVING:\{8:1,18:1,26:1\}/.test(rg)) bad('没有移动靶');
  else ok('3 个移动靶 (8/18/26m)');

  // ⚠️ 通用基地营区 (帐篷/沙袋/木箱) 必须排除 range —— bases 就在厅内, 不排除会把帐篷搭进靶道
  if (!/layout!=='range'\)\{/.test(wld)) bad('08_world 的基地营区没有排除 range —— 帐篷会被搭进靶道');
  else ok('基地营区已排除靶场');
  if (!/apPave\(0,cz,W,LEN,0\.06,MAT\.stone\)/.test(map)) bad('靶场地面用了深色材质 —— 室内会看着像黑洞');
  else ok('靶场地面是浅色石材');
  if (!/sp\.scale\.set\(0\.46,0\.23,1\)/.test(rg)) bad('距离标牌尺寸不对 (太大会糊住视野)');
  else ok('距离标牌尺寸正常');
  if (!/player\.pos\.z=13\.6/.test(rg)) bad('没有把出生点放回射击线后方 —— findFreeSpawn 会随机挪到线前面');
  else ok('出生点已归位到射击线后方');
  if (!/tkt\.style\.display/.test(rg)) bad('靶场没有隐藏「撤离行动 / 战利品」HUD');
  else ok('靶场隐藏了撤离 HUD');

  if (!fs.existsSync(path.join(__dirname, '_range_probe.js'))) log('     ⚠️ 没有 _range_probe.js');
  else ok('有行为探针 _range_probe.js (node _tools/_range_probe.js)');
}

// ---------- 17. 准星 / 移动扩散 ----------
log('');
log('=== 17. 准星 / 移动扩散 ===');
{
  const strip = (x) => x.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
  const htm = read('index.html');
  const css = read('css/style.css');
  const hud = strip(read('js/28_hud.js'));
  const upd = strip(read('js/25_player_update.js'));

  // ① 准星必须删干净 (DOM / CSS / HUD 更新三处都清掉, 漏一处就会每帧 TypeError)
  if (/id="crosshair"/.test(htm)) bad('index.html 还有 #crosshair');
  else ok('准星 DOM 已删除');
  if (/#crosshair/.test(css)) bad('CSS 里还有 #crosshair 规则');
  else ok('准星样式已删除');
  if (/el\('crosshair'\)/.test(hud)) bad('28_hud 还在更新准星 —— 元素没了会每帧抛 TypeError');
  else ok('HUD 不再更新准星');

  // ② 移动扩散: 必须是「按实际速度连续加成」, 不能退回台阶式
  if (/Math\.hypot\(p\.vel\.x,p\.vel\.z\)>1\?1\.4:1/.test(upd)) bad('移动扩散还是台阶式 (动起来就 ×1.4)');
  else ok('移动扩散不是台阶式');
  if (!/const vSpd=Math\.hypot\(p\.vel\.x,p\.vel\.z\)/.test(upd)) bad('移动扩散没读实际速度');
  else ok('移动扩散按实际速度计算');
  if (!/moveMul=1\+Math\.min\(1\.6/.test(upd)) bad('缺少 moveMul 系数');
  else ok('moveMul 系数存在 (站定 1.0 / 冲刺 ≈2.6)');
  if (!/1-adsB\*0\.45/.test(upd)) bad('开镜时移动惩罚没有打折');
  else ok('开镜时移动惩罚打折');
}

// ---------- 18. 命中反馈已删 / VHS 后处理 ----------
log('');
log('=== 18. 命中反馈 / VHS 视角 ===');
{
  const strip = (x) => x.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
  const htm = read('index.html');
  const css = read('css/style.css');
  const hud = strip(read('js/28_hud.js'));
  const vhsPath = 'js/62_vhs.js';

  // ① 命中反馈三处必须同清 (DOM / CSS / HUD), 否则 el('hitmark') 每帧 TypeError
  if (/id="hitmark"/.test(htm)) bad('index.html 还有 #hitmark');
  else ok('命中十字 DOM 已删除');
  if (/#hitmark/.test(css)) bad('CSS 里还有 #hitmark 规则');
  else ok('命中十字样式已删除');
  if (/el\('hitmark'\)/.test(hud)) bad("28_hud 还在操作 #hitmark —— 元素没了会每帧抛 TypeError");
  else ok('HUD 不再闪命中十字');
  if (/AudioSys\.hitmarkSnd\(/.test(hud)) bad('28_hud 还在播命中音');
  else ok('命中音已不再播放');

  // ② VHS 必须被 index.html 引用, 且排在 61_range 之后
  if (!/<script[^>]*src="js\/62_vhs\.js/.test(htm)) bad('index.html 没有引用 js/62_vhs.js');
  else ok('index.html 已引用 62_vhs.js');
  const i61 = htm.indexOf('js/61_range.js'), i62 = htm.indexOf('js/62_vhs.js');
  if (i62 < 0 || i61 < 0 || i62 < i61) bad('62_vhs.js 必须排在 61_range.js 之后 (依赖 NVG.render)');
  else ok('62_vhs.js 加载顺序正确');

  if (!fs.existsSync(path.join(__dirname, '..', vhsPath))) bad('缺少 js/62_vhs.js');
  else {
    const vhs = strip(read(vhsPath));
    // ③ 接管 NVG.render —— 主循环唯一的整帧绘制入口
    if (!/NVG\.render=function/.test(vhs)) bad('62_vhs 没有接管 NVG.render (滤镜不会生效)');
    else ok('已接管 NVG.render');
    // ④ 色彩空间: 画进 RT 时 three 输出线性, 必须自己 toSRGB
    if (!/toSRGB\(/.test(vhs)) bad('62_vhs 缺少 linear→sRGB 转换 (画进 RT 是线性的, 不转会发灰)');
    else ok('有 linear→sRGB 转换');
    // ⑤ 夜视路径: 34_nvg 末尾 setRenderTarget(null) 必须被重定向, 否则开夜视就没 VHS
    if (!/capture&&rt\) return _srt\(rt\)/.test(vhs)) bad('62_vhs 没有重定向 setRenderTarget(null) —— 开夜视仪时滤镜会失效');
    else ok('夜视仪的最终 quad 也被包进 VHS 管道');
    // ⑥ 鱼眼/色散两个核心 uniform 必须在
    if (!/uFish/.test(vhs) || !/uCA/.test(vhs)) bad('62_vhs 缺少鱼眼(uFish)或色散(uCA)');
    else ok('鱼眼畸变 + 色散都在');
  }
}

// ---------- 19. 放大瞄具镜内渲染 ----------
log('');
log('=== 19. 瞄具镜内渲染 ===');
{
  const strip = (x) => x.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
  const htm = read('index.html');
  const css = read('css/style.css');
  const vm = strip(read('js/15_viewmodel.js'));
  const inp = strip(read('js/24_input.js'));
  const tch = strip(read('js/31_touch.js'));
  const mods = strip(read('js/14b_weapon_mods.js'));
  const scPath = 'js/63_scope.js';

  // ① 旧的黑圆遮罩必须删干净 (DOM / CSS / 4 处 getElementById)
  if (/id="scopeOv"/.test(htm)) bad('index.html 还有 #scopeOv 遮罩');
  else ok('镜外遮罩 DOM 已删除');
  if (/#scopeOv/.test(css)) bad('CSS 里还有 #scopeOv 规则');
  else ok('镜外遮罩样式已删除');
  let ovRef = 0;
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'js'))) {
    if (!f.endsWith('.js')) continue;
    if (/getElementById\('scopeOv'\)/.test(strip(read('js/' + f)))) ovRef++;
  }
  if (ovRef) bad('还有 ' + ovRef + ' 个 js 在操作 #scopeOv —— 元素没了会抛 TypeError');
  else ok('没有代码再引用 #scopeOv');

  // ② 加载顺序: 63_scope 必须在 62_vhs 之后 (要包在 VHS 的包装外面)
  const i62 = htm.indexOf('js/62_vhs.js'), i63 = htm.indexOf('js/63_scope.js');
  if (i63 < 0) bad('index.html 没有引用 js/63_scope.js');
  else if (i63 < i62) bad('63_scope.js 必须排在 62_vhs.js 之后');
  else ok('63_scope.js 加载顺序正确');

  if (!fs.existsSync(path.join(__dirname, '..', scPath))) bad('缺少 js/63_scope.js');
  else {
    const sc = strip(read(scPath));
    if (!/NVG\.render=function/.test(sc)) bad('63_scope 没有接管 NVG.render (镜片不会出现)');
    else ok('已接管 NVG.render');
    // ③ 色彩空间: 目标是 canvas 时要自己 toSRGB, 画进 VHS 的 RT 则保持线性
    if (!/toSRGB\(/.test(sc)) bad('63_scope 缺少 toSRGB (直接画 canvas 时会发灰)');
    else ok('有 toSRGB 转换');
    if (!/getRenderTarget\(\)/.test(sc)) bad('63_scope 没有用 getRenderTarget 判断目标 (会二次编码)');
    else ok('按当前渲染目标决定是否编码');
    // ③b 镜片必须画在 VHS **之后** (需求: 镜内不吃 VHS 后处理)
    if (!/_prev\(fn\)/.test(sc)) bad('63_scope 没有先让 VHS 画完整帧 —— 镜片会吃到 VHS 后处理');
    else ok('镜片在 VHS 之后画 (镜内是干净的光学通道)');
    // ③c 玻璃灰尘
    // ⚠️ 必须锚定到声明, 不能只匹配标识符前缀 —— /dustCell/ 会被 dustCellX 满足(假绿)
    if (!/float dustCell\(vec2/.test(sc) || !/uniform float uDust;/.test(sc)) bad('63_scope 缺少玻璃灰尘');
    else ok('镜片有玻璃灰尘');
    // ④ 主相机必须保持腰射视野, 否则又变成整屏放大
    // ⚠️ 断言要盯"真的调用了", 不能只匹配 SCOPE.keepWide —— 15_viewmodel 里还有一句
    // typeof SCOPE.keepWide==='function' 的特性检测, 用 /SCOPE\.keepWide/ 会假绿。
    if (!/SCOPE\.keepWide\(VM\.key/.test(vm)) bad('15_viewmodel 没有让主相机保持腰射视野 —— 又变成整屏放大了');
    else ok('主相机开镜时保持腰射视野');
    if (!/adsFovOf/.test(sc) || !/adsFovOf/.test(mods)) bad('缺少 adsFovOf (开镜 FOV 含瞄具倍率)');
    else ok('开镜 FOV 统一走 adsFovOf');
    // ⑤ 灵敏度也要跟着真实倍率 (否则高倍镜转视角会飘)
    if (!/adsFovOf/.test(inp) || !/adsFovOf/.test(tch)) bad('鼠标/触控灵敏度没走 adsFovOf');
    else ok('灵敏度按真实倍率补偿');
    // ⑥ 自带镜的武器不能再乘一次改件倍率 (否则 4x 压成 fov 6.8°)
    if (!/if\(!base\.scoped\)/.test(mods)) bad('adsFovOf 没有排除自带镜武器 —— 4x 会被再乘一次 0.34');
    else ok('自带镜武器不吃改件倍率');
  }

  if (!fs.existsSync(path.join(__dirname, '_scope_probe.js'))) log('     ⚠️ 没有 _scope_probe.js');
  else ok('有行为探针 _scope_probe.js (node _tools/_scope_probe.js)');
}

log('');
log(issues ? ('⚠️ 发现 ' + issues + ' 处需要关注') : '✅ 静态审计全部通过');
fs.writeFileSync(R('_tools/_static_audit.txt'), out.join('\n') + '\n', 'utf8');
console.log(out.join('\n'));
