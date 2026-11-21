'use strict';
// =====================================================================
// 请求 J: 削弱玩家方 NPC + 可搜刮队友遗体 + 搜尸/搜容器获得子弹
// 模块: Inventory(弹药类物品) / Loot(掉落表) / UI(遗体面板) / GameMode(友方强度)
// 加载位置(不可调换): 37_meta → 38_tarkov → 35_extraction → 39_quests → 40_raidshop → 41_raidloot → 32_boot
// 设计约束: 沿用 40_raidshop 的"包裹式扩展", 不改动 38/39/19 的函数体;
//           不新增持久化字段, 弹药战利品只在 RUN.loot(局内) 与 META.loot(撤离后入库) 之间流转。
// =====================================================================

// ============================ 配置区 ============================
// ---- 友方(玩家同阵营) NPC 基础系数 ----
// ⚠️ 2026-09-17 用户要求「我方 NPC 和敌方一样强」→ 三个系数全部改成 1.0（不再削弱）。
//    原来默认是 hp 0.75 / react 1.30 / spread 1.40 —— 一层**常驻**的削弱:
//    队友开局就比敌人少 25% 血、反应慢 30%、散布大 40%, 再叠加 ELO/地图系数只给敌方,
//    结果就是「玩家和敌人都在变强, 我方 NPC 一直很弱」。
//    这个配置项保留着(方便回退或做难度选项), 但默认值 = 不削弱。
const FRIENDLY_BOT_CFG = {
  hp:     1.00,   // 血量倍率, 默认 1.00 = 与敌方同档, 取值范围 0.3 ~ 1.0  (越小越脆)
  react:  1.00,   // 反应时间倍率, 默认 1.00 = 与敌方同档, 取值范围 1.0 ~ 3.0 (越大越迟钝)
  spread: 1.00,   // 弹道散布倍率, 默认 1.00 = 与敌方同档, 取值范围 1.0 ~ 3.0 (越大越不准)
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
  friendlyWeaponKeep: 1.00,   // 队友遗体保留其武器的概率, 默认 1.00, 范围 0 ~ 1
  enemyWeaponKeep:    1.00    // 敌方尸体保留其武器的概率, 默认 1.00, 范围 0 ~ 1
};

// ---------- 弹药类物品 (可拾取 / 可装填 / 可售卖) ----------
for(const key of Object.keys(AMMO_DEFS)) TRADE_KEYS.push(key);

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
itemIconOf   = key => AMMO_DEFS[key] ? (AMMO_DEFS[key].icon||'🔋')          : _iIconOf(key);
itemSellPrice= key => AMMO_DEFS[key] ? Math.max(15,Math.floor((AMMO_DEFS[key].price||0)*0.45)) : _iSell(key);
itemDescOf   = key => {
  if(!AMMO_DEFS[key]) return _iDescOf(key);
  const d = AMMO_DEFS[key];
  return `弹药 · T${d.tier} · 穿甲 ${d.pen} · ${d.rounds} 发 · 占 ${d.size} 格 · 重 ${d.weight}kg · ${d.desc}`;
};

// ==================== Inventory: 把弹药盒装填进当前武器 ====================
// 模块: Inventory · 调用入口: 背包面板 [E] / 点击「装填」/ useLootFromBag 分发
const _origItemUsableInRaid = itemUsableInRaid;
itemUsableInRaid = key => _origItemUsableInRaid(key) || !!AMMO_DEFS[key];

// 拾取提示里 [E] 后面的动词: 弹药显示"装填", 其余显示"立即使用"
const _origRaidUseVerb = (typeof raidUseVerb==='function') ? raidUseVerb : null;
raidUseVerb = key => AMMO_DEFS[key] ? '装填' : (_origRaidUseVerb ? _origRaidUseVerb(key) : '立即使用');

function ammoBoxIssue(d,w){
  const q=ammoQuote(d,w);
  if(!q.ok) return q.reason;
  return q.give<d.rounds?`备弹还差 ${d.rounds-q.give} 发空间才能拆一整盒`:'';
}
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
  const issue=ammoBoxIssue(d,w);
  if(issue){ raidWarn(issue); return false; }
  if(w.loanAmmoBox===key) delete w.loanAmmoBox;
  else {
    const n=bagCount(key);
    if(n<=0){ raidWarn('背包中没有「'+d.name+'」'); return false; }
    if(n===1) delete RUN.loot[key]; else RUN.loot[key]=n-1;
  }
  w.reserve=(w.reserve||0)+d.rounds;
  w.ammo = key;                                   // 本次装填的弹种成为该枪当前弹种
  p._raidUseCdT = (typeof nowT!=='undefined') ? nowT : 0;
  raidOk(`${d.name} · +${d.rounds} 发 · ${w.def.name} 备弹 ${w.reserve}/${w.def.reserve}`);
  if(typeof AudioSys!=='undefined' && AudioSys.metalSlide) AudioSys.metalSlide(0.2,0.18,450,900);
  if(typeof renderRaidBag==='function') renderRaidBag();
  emitRaidEvent('OnItemUsed', { key:key, left:bagCount(key), rounds:d.rounds });
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
// 0–4 级弹药掉落权重: 越高级越稀有; rich 用于敌方精锐/高级容器
function randomAmmoLootKey(rich,cal='rifle'){
  if(cal==='heavy') return AMMO_KEYS_BY_CAL.heavy;
  const table = rich
    ? [['ammo_rip',0.08],['ammo_std',0.27],['ammo_m855',0.32],['ammo_m995',0.23],['ammo_ap',0.10]]
    : [['ammo_rip',0.24],['ammo_std',0.46],['ammo_m855',0.22],['ammo_m995',0.06],['ammo_ap',0.02]];
  let r=Math.random(), acc=0;
  for(const [k,w] of table){
    acc+=w;
    if(r<=acc) return cal==='pistol'?k.replace('ammo_','ammo_pistol_'):k;
  }
  return ammoKeyOfCaliber(cal);
}
function randomPlateLootKey(){
  const r=Math.random();
  return r<0.45?'plate_steel':(r<0.80?'plate_ti':'plate_ceramic');
}
function addAmmoToLootTable(out, kinds, stackMax){
  if(kinds <= 0) return out;
  for(let i=0;i<kinds;i++){
    const key = randomAmmoLootKey(Math.random()<0.25,Math.random()<0.35?'pistol':'rifle');
    out[key] = (out[key]||0) + randi(1, stackMax);
  }
  return out;
}
const _origRollCrateLootList = rollCrateLootList;
rollCrateLootList = function(){
  const out = _origRollCrateLootList();
  if(Math.random() < AMMO_LOOT_CFG.crateChance)
    addAmmoToLootTable(out, randi(1, AMMO_LOOT_CFG.crateMaxKinds), AMMO_LOOT_CFG.crateStackMax);
  // 插板: 物资箱有概率出
  if(Math.random() < 0.10){ const pk=randomPlateLootKey(); out[pk]=(out[pk]||0)+1; }
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
  // 弹药: 敌方精锐/高级容器更容易掉高级弹
  const chance = friendly ? AMMO_LOOT_CFG.friendlyCorpseChance : AMMO_LOOT_CFG.corpseChance;
  if(Math.random() < chance){
    const key = randomAmmoLootKey(!friendly || !!(bot && bot.cls>=2),ammoCaliberOf(wkey));
    out[key] = (out[key]||0) + (friendly ? randi(1,2) : 1);
  }
  // 插板: 尸体小概率出
  if(Math.random() < 0.08){ const pk=randomPlateLootKey(); out[pk]=(out[pk]||0)+1; }
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
// 模块: GameMode · 调用入口: Bot.prototype.spawn → applyPrestigeBot
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
  // 只有真的削弱了才打标记 —— 默认值全是 1.0 时置位会误导排查
  if(FRIENDLY_BOT_CFG.hp!==1||FRIENDLY_BOT_CFG.react!==1||FRIENDLY_BOT_CFG.spread!==1) bot.friendlyNerf = true;
};
