'use strict';
// =====================================================================
// 请求 J: 削弱玩家方 NPC + 可搜刮队友遗体 + 搜尸/搜容器获得子弹
// 模块: Inventory(弹药类物品) / Loot(掉落表) / UI(遗体面板) / GameMode(友方强度)
// 加载位置(不可调换): 37_meta → 38_tarkov → 35_extraction → 39_quests → 40_raidshop → 41_raidloot → 32_boot
// 设计约束: 沿用 40_raidshop 的"包裹式扩展", 不改动 38/39/19 的函数体;
//           不新增持久化字段, 弹药战利品只在 RUN.loot(局内) 与 META.loot(撤离后入库) 之间流转。
// =====================================================================

// ============================ 配置区 ============================
// ---- 友方(玩家同阵营) NPC 基础削弱 ----
// 说明: 与 prestige 削弱叠加(39_quests 的 applyPrestigeBot 先算 prestige, 本文件再乘基础值)
const FRIENDLY_BOT_CFG = {
  hp:     0.75,   // 血量倍率, 默认 0.75, 取值范围 0.3 ~ 1.0  (越小越脆)
  react:  1.30,   // 反应时间倍率, 默认 1.30, 取值范围 1.0 ~ 3.0 (越大越迟钝)
  spread: 1.40,   // 弹道散布倍率, 默认 1.40, 取值范围 1.0 ~ 3.0 (越大越不准)
  modes:  null    // null = 全部模式生效; 例: ['extract'] 表示仅撤离模式削弱
};

// ---- 队友遗体可搜刮 ----
const CORPSE_CFG = {
  friendlySearchable: true,  // 玩家可搜刮同阵营 NPC 遗体, 默认 true
  titleFriendly: '友 军 遗 体',
  titleEnemy:    '敌 军 尸 体'
};

// ---- 弹药掉落 ----
const AMMO_LOOT_CFG = {
  crateChance:   0.55,  // 物资箱出现弹药的概率, 默认 0.55, 范围 0 ~ 1
  crateMaxKinds: 2,     // 单个物资箱最多几种弹药, 默认 2, 范围 1 ~ 3
  crateStackMax: 2,     // 单种弹药最多几盒, 默认 2, 范围 1 ~ 5
  corpseChance:  0.80,  // 敌方尸体掉弹药的概率, 默认 0.80, 范围 0 ~ 1
  friendlyCorpseChance: 1.00, // 队友遗体掉弹药的概率, 默认 1.00, 范围 0 ~ 1
  friendlyWeaponKeep: 0.85,   // 队友遗体保留其武器的概率, 默认 0.85, 范围 0 ~ 1
  enemyWeaponKeep:    0.45    // 敌方尸体保留其武器的概率, 默认 0.45, 范围 0 ~ 1
};

// ---------- 弹药类物品 (可拾取 / 可装填 / 可售卖) ----------
// cal: 适用口径(与 AMMO_PACK_DEFS 同一套口径, 由 ammoCaliberOf 推导)
// rounds: 一盒发数; size: 占背包格数; weight: 重量(kg); price: 基础价值(出售价 45%)
// 数值约为商店弹药包的"半包", 保证"捡到的比买的便宜, 但量更少", 购买入口仍有意义
const AMMO_DEFS = {
  ammo_pistol:{ name:"手枪弹药盒",   cal:"pistol", size:1, weight:0.4, price:200, rounds:15, desc:"捡来的散装弹药 · 按 E 装填到当前武器" },
  ammo_smg:   { name:"冲锋枪弹药盒", cal:"smg",    size:1, weight:0.6, price:330, rounds:30, desc:"捡来的散装弹药 · 按 E 装填到当前武器" },
  ammo_rifle: { name:"步枪弹药盒",   cal:"rifle",  size:1, weight:0.7, price:420, rounds:30, desc:"捡来的散装弹药 · 按 E 装填到当前武器" },
  ammo_mg:    { name:"机枪弹药盒",   cal:"mg",     size:2, weight:1.6, price:600, rounds:40, desc:"捡来的散装弹药 · 按 E 装填到当前武器" },
  ammo_sniper:{ name:"狙击弹药盒",   cal:"sniper", size:1, weight:0.5, price:480, rounds:10, desc:"捡来的散装弹药 · 按 E 装填到当前武器" },
  ammo_heavy: { name:"重型弹药筒",   cal:"heavy",  size:2, weight:2.4, price:900, rounds:2,  desc:"捡来的散装弹药 · 按 E 装填到当前武器" }
};
const AMMO_KEYS_BY_CAL = {};
for(const _k in AMMO_DEFS){ AMMO_KEYS_BY_CAL[AMMO_DEFS[_k].cal] = _k; }
function ammoKeyOfCaliber(cal){ return AMMO_KEYS_BY_CAL[cal] || 'ammo_rifle'; }

// ==================== 物品 API 扩展: 让弹药走统一通道 ====================
// 模块: Inventory · 调用入口: 所有既有 item*() 调用点(背包/市集/结算/仓库)
// 全部为"先判弹药、否则回落原实现", 因此武器/护甲/医疗/食物逻辑零改动。
const _iSizeOf = itemSizeOf, _iWeightOf = itemWeightOf, _iPriceOf = itemPriceOf,
      _iLabel  = itemLabel,  _iSell     = itemSellPrice, _iDescOf = itemDescOf,
      _iName   = itemName,   _iKind     = itemKind,      _iIconOf = itemIconOf;
itemSizeOf   = key => AMMO_DEFS[key] ? (AMMO_DEFS[key].size||1)            : _iSizeOf(key);
itemWeightOf = key => AMMO_DEFS[key] ? (AMMO_DEFS[key].weight||0.5)         : _iWeightOf(key);
itemPriceOf  = key => AMMO_DEFS[key] ? (AMMO_DEFS[key].price||0)            : _iPriceOf(key);
itemLabel    = key => AMMO_DEFS[key] ? AMMO_DEFS[key].name                  : _iLabel(key);
itemName     = key => AMMO_DEFS[key] ? AMMO_DEFS[key].name                  : _iName(key);
itemKind     = key => AMMO_DEFS[key] ? 'ammo'                               : _iKind(key);
itemIconOf   = key => AMMO_DEFS[key] ? '🔋'                                 : _iIconOf(key);
itemSellPrice= key => AMMO_DEFS[key] ? Math.max(15,Math.floor((AMMO_DEFS[key].price||0)*0.45)) : _iSell(key);
itemDescOf   = key => {
  if(!AMMO_DEFS[key]) return _iDescOf(key);
  const d = AMMO_DEFS[key];
  return `弹药 · ${d.rounds} 发 · 占 ${d.size} 格 · 重 ${d.weight}kg · ${d.desc}`;
};

// ==================== Inventory: 把弹药盒装填进当前武器 ====================
// 模块: Inventory · 调用入口: 背包面板 [E] / 点击「装填」/ useLootFromBag 分发
const _origItemUsableInRaid = itemUsableInRaid;
itemUsableInRaid = key => _origItemUsableInRaid(key) || !!AMMO_DEFS[key];

// 拾取提示里 [E] 后面的动词: 弹药显示"装填", 其余显示"立即使用"
const _origRaidUseVerb = (typeof raidUseVerb==='function') ? raidUseVerb : null;
raidUseVerb = key => AMMO_DEFS[key] ? '装填' : (_origRaidUseVerb ? _origRaidUseVerb(key) : '立即使用');

function loadAmmoFromBag(key){
  const p = (typeof player!=='undefined') ? player : null;
  const d = AMMO_DEFS[key];
  if(!d) return false;
  if(!p || !p.alive || !p.deployed){ raidWarn('当前无法装填弹药'); return false; }
  if(typeof matchOver!=='undefined' && matchOver) return false;
  if((p.medUseT||0) > 0){ raidWarn('正在使用其他物品'); return false; }
  if(p.onMG || p.onAT || p.onAA || (typeof handsFreeVeh==='function' && !handsFreeVeh())){
    raidWarn('当前姿态无法装填'); return false;
  }
  if(typeof VM!=='undefined' && VM.state!=='idle'){ raidWarn('动作进行中'); return false; }
  if(typeof nowT!=='undefined' && nowT-(p._raidUseCdT||-99) < RAID_USE_CD) return false;
  const w = (p.curW && p.curW.def) ? p.curW : null;
  if(!w){ raidWarn('当前没有可装填的武器'); return false; }
  const cal = ammoCaliberOf(w.key);
  if(cal !== d.cal){
    raidWarn(`口径不符 · ${d.name}(${AMMO_CAL_NAME[d.cal]}) 不能装进「${w.def.name}」(${AMMO_CAL_NAME[cal]}) · 先按 1/2 换到对应武器`);
    return false;
  }
  const cap  = w.def.reserve || 0;
  const room = cap - (w.reserve||0);
  if(room <= 0){ raidWarn(`「${w.def.name}」备弹已满 ${w.reserve}/${cap}`); return false; }
  const n = bagCount(key);
  if(n <= 0){ raidWarn('背包中没有「'+d.name+'」'); return false; }
  const give = Math.min(d.rounds, room);
  RUN.loot[key] = n-1;
  if(RUN.loot[key] <= 0) delete RUN.loot[key];
  w.reserve = Math.min(cap, (w.reserve||0) + give);
  p._raidUseCdT = (typeof nowT!=='undefined') ? nowT : 0;
  raidOk(`装填 🔋 <b>${d.name}</b> · <b>+${give}</b> 发 · 「${w.def.name}」备弹 <b>${w.reserve}/${cap}</b> · 背包剩余 <b>${bagCount(key)}</b>`);
  if(typeof AudioSys!=='undefined' && AudioSys.metalSlide) AudioSys.metalSlide(0.2,0.18,450,900);
  if(typeof renderRaidBag==='function') renderRaidBag();
  emitRaidEvent('OnItemUsed', { key:key, left:bagCount(key), rounds:give });
  return true;
}
// 分发: 弹药走装填, 其余回落 40_raidshop 的医疗/食物流程
const _origUseLootFromBag = useLootFromBag;
useLootFromBag = function(key){
  if(AMMO_DEFS[key]) return loadAmmoFromBag(key);
  return _origUseLootFromBag(key);
};

// ==================== UI: 背包里弹药行按钮显示「装填」 ====================
// 模块: UI · 调用入口: renderRaidBag → renderBagPanel
const _origRenderBagPanel2 = renderBagPanel;
renderBagPanel = function(){
  _origRenderBagPanel2();
  const list = document.getElementById('bagPanelList');
  if(!list) return;
  Array.prototype.forEach.call(list.querySelectorAll('.apUse'), b=>{
    if(AMMO_DEFS[b.dataset ? b.dataset.buse : '']) b.textContent = '装填';
  });
};

// ==================== Loot: 掉落表注入弹药 ====================
// 模块: Loot · 调用入口: lootTargetNear → rollCrateLootList / registerCorpse → rollCorpseLoot
function addAmmoToLootTable(out, kinds, stackMax){
  if(kinds <= 0) return out;
  const cals = Object.keys(AMMO_KEYS_BY_CAL);
  for(let i=0;i<kinds;i++){
    const cal = cals[randi(0, cals.length-1)];
    const key = AMMO_KEYS_BY_CAL[cal];
    out[key] = (out[key]||0) + randi(1, stackMax);
  }
  return out;
}
const _origRollCrateLootList = rollCrateLootList;
rollCrateLootList = function(){
  const out = _origRollCrateLootList();
  if(Math.random() < AMMO_LOOT_CFG.crateChance)
    addAmmoToLootTable(out, randi(1, AMMO_LOOT_CFG.crateMaxKinds), AMMO_LOOT_CFG.crateStackMax);
  return out;
};
const _origRollCorpseLoot = rollCorpseLoot;
rollCorpseLoot = function(bot){
  const out = _origRollCorpseLoot(bot);
  const friendly = !!(bot && typeof player!=='undefined' && bot.team === player.team);
  const wkey = (bot && (bot.customWeapon || bot.wpnKey)) || '';
  // 武器保留概率: 队友遗体更高(他本来就是带着枪来的)
  const keep = friendly ? AMMO_LOOT_CFG.friendlyWeaponKeep : AMMO_LOOT_CFG.enemyWeaponKeep;
  if(wkey && WPN_DEFS[wkey]){
    if(Math.random() < keep) out[wkey] = Math.max(1, out[wkey]||0);
    else if(out[wkey] && Math.random() > keep) delete out[wkey];
  }
  // 弹药: 优先掉该武器同口径的, 否则随机口径
  const chance = friendly ? AMMO_LOOT_CFG.friendlyCorpseChance : AMMO_LOOT_CFG.corpseChance;
  if(Math.random() < chance){
    const cal = wkey && WPN_DEFS[wkey] ? ammoCaliberOf(wkey)
                                       : Object.keys(AMMO_KEYS_BY_CAL)[randi(0,5)];
    const key = ammoKeyOfCaliber(cal);
    out[key] = (out[key]||0) + (friendly ? randi(1,2) : 1);
  }
  return out;
};

// ==================== Loot: 队友遗体可搜刮 ====================
// 模块: Loot · 调用入口: Bot.die() → registerCorpse
const _origRegisterCorpse = registerCorpse;
registerCorpse = function(bot){
  if(!bot || bot.isPlayer) return;
  const friendly = (typeof player!=='undefined') && bot.team === player.team;
  if(friendly && !CORPSE_CFG.friendlySearchable) return;   // 配置关闭则不生成队友遗体
  _origRegisterCorpse(bot);
  const c = (typeof CORPSES!=='undefined') ? CORPSES[CORPSES.length-1] : null;
  if(c && c.loot){
    c.team = bot.team;
    c.friendly = friendly;
    c.name = bot.name || '';
    if(friendly && !Object.keys(c.loot).length){
      // 兜底: 队友遗体至少留一件东西, 不会出现"搜了个寂寞"
      const key = ammoKeyOfCaliber(ammoCaliberOf((bot.customWeapon||bot.wpnKey)||'m4'));
      c.loot[key] = 1;
    }
  }
};
// 遗体面板标题区分敌我
const _origRenderLootPanel = renderLootPanel;
renderLootPanel = function(){
  _origRenderLootPanel();
  if(typeof LOOT_UI!=='undefined' && LOOT_UI.open && LOOT_UI.kind==='corpse' && LOOT_UI.ref){
    const t = document.getElementById('lootTitle');
    if(t) t.textContent = LOOT_UI.ref.friendly ? CORPSE_CFG.titleFriendly : CORPSE_CFG.titleEnemy;
  }
};

// ==================== GameMode: 削弱玩家方 NPC ====================
// 模块: GameMode · 调用入口: Bot.prototype.spawn / spawnInVehicle → applyPrestigeBot
// 39_quests 已经把 applyPrestigeBot 挂到生成流程上; 这里在其结果之上再乘基础削弱系数,
// 因此 prestige 削弱(己方每级 -12% 血等)与基础削弱自然叠加, 不改动 39 的任何代码。
const _origApplyPrestigeBot = applyPrestigeBot;
applyPrestigeBot = function(bot){
  _origApplyPrestigeBot(bot);
  if(!bot || typeof player==='undefined') return;
  if(bot.team !== player.team) return;                 // 只削弱玩家方
  if(FRIENDLY_BOT_CFG.modes && FRIENDLY_BOT_CFG.modes.length
     && FRIENDLY_BOT_CFG.modes.indexOf(GAMEMODE) < 0) return;
  bot.hpMul    = (bot.hpMul    || 1) * FRIENDLY_BOT_CFG.hp;
  bot.reactMul = (bot.reactMul || 1) * FRIENDLY_BOT_CFG.react;
  bot.sprMul   = (bot.sprMul   || 1) * FRIENDLY_BOT_CFG.spread;
  bot.friendlyNerf = true;
};
