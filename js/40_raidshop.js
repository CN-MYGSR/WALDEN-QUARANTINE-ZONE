'use strict';
// =====================================================================
// 请求 I: 战利品局内即时可用 + 弹药局内购买
// 模块: Inventory(局内背包) / Shop(弹药商店) / UI(获得·消耗提示) / GameMode(生命周期)
// 加载位置(不可调换): 37_meta → 38_tarkov → 35_extraction → 39_quests → 40_raidshop → 32_boot
// 设计约束:
//   · 不新增任何 localStorage 持久化字段 —— 局内状态一律放在 RUN(每局重建的临时对象)
//   · 不改动 finishMedUse / finishFoodUse / mergeRunLoot / finishRaid / onPlayerRaidDeath 的契约,
//     全部通过"包裹(wrapper)"方式扩展, 保证任务/经验/结算链路不受影响
// =====================================================================

// ============================ 配置区 ============================
// ---- 局内即时使用 ----
// 从背包临时取用比预置快捷栏慢一点的倍率; 默认 1.35, 取值范围 1.0 ~ 3.0
const RAID_USE_TIME_MUL = 1.35;
// 两次使用之间的公共冷却(秒); 默认 0.4, 取值范围 0 ~ 5
const RAID_USE_CD       = 0.4;
// 获得/消耗提示停留时长(毫秒); 默认 1700, 取值范围 800 ~ 4000
const RAID_POP_MS       = 1700;

// ---- 弹药购买 ----
// 弹药商店总开关; 默认 true(开启), 置 false 则恢复为弹药箱免费补给
const AMMO_SHOP_ENABLED = true;
// 生效的游戏模式; 默认 ['extract'](仅撤离模式), 可改为 ['extract','conquest'] 等
const AMMO_SHOP_MODES   = ['extract'];
// 弹种等级: 0 RIP / 1 普通 / 2 M855 / 3 M995 / 4 AP
// pen 0-4 决定穿透能力; armorMul 影响护甲耐久损耗, dmgMul 是肉体伤害倍率
const AMMO_TIERS = [
 { id:'ammo_rip',  name:'RIP 弹',  short:'RIP',  tier:0, pen:0, dmgMul:1.35, armorMul:0.25, rounds:30, price:120, weight:0.40, icon:'🟥', desc:'0 级 · 几乎不穿甲，软组织伤害极高' },
 { id:'ammo_std',  name:'普通弹',   short:'普通', tier:1, pen:1, dmgMul:1.00, armorMul:1.00, rounds:30, price:180, weight:0.45, icon:'⬜', desc:'1 级 · 标准弹药' },
 { id:'ammo_m855', name:'M855 弹', short:'M855', tier:2, pen:2, dmgMul:1.05, armorMul:1.30, rounds:30, price:320, weight:0.50, icon:'🟦', desc:'2 级 · 钢芯穿甲，对 1–2 级护甲有效' },
 { id:'ammo_m995', name:'M995 弹', short:'M995', tier:3, pen:3, dmgMul:1.12, armorMul:1.70, rounds:30, price:520, weight:0.55, icon:'🟪', desc:'3 级 · 钨芯穿甲，对 3 级护甲有效' },
 { id:'ammo_ap',   name:'AP 弹',   short:'AP',   tier:4, pen:4, dmgMul:1.20, armorMul:2.20, rounds:20, price:780, weight:0.60, icon:'🟨', desc:'4 级 · 高硬度穿甲弹，专打重甲' }
];
// 旧存档的五个物品键继续代表同档步枪弹，手枪弹和支援弹使用独立物品键。
const AMMO_CAL_NAME = { rifle:'步枪弹', pistol:'手枪弹', heavy:'支援弹' };
const AMMO_KEYS_BY_CAL = { rifle:'ammo_std', pistol:'ammo_pistol_std', heavy:'ammo_heavy_std' };
const AMMO_PACK_DEFS = [];
for(const cal of Object.keys(AMMO_CAL_NAME)){
 for(const t of AMMO_TIERS){
  if(cal==='heavy'&&t.tier!==1) continue;
  const id=cal==='rifle'?t.id:t.id.replace('ammo_', 'ammo_'+cal+'_');
  const short=cal==='pistol'?['RIP','普通','强化','精制','AP'][t.tier]:t.short;
  AMMO_PACK_DEFS.push({...t,id,cal,short,size:1,name:AMMO_CAL_NAME[cal]+' · '+short,
    rounds:cal==='heavy'?4:t.rounds});
 }
}
const AMMO_DEFS=Object.fromEntries(AMMO_PACK_DEFS.map(d=>[d.id,d]));

// ==================== 极简事件总线(对局生命周期) ====================
// 目的: 让"拾取/使用/购买"这些动作可以对 OnMatchStart / OnMatchEnd / OnPlayerDeath
//       等生命周期事件保持只读订阅, 不新增持久化字段, 也不侵入既有函数体。
const RAID_EVENTS = {};
function onRaidEvent(name, fn){ (RAID_EVENTS[name] = RAID_EVENTS[name] || []).push(fn); }
function emitRaidEvent(name, payload){
 const l = RAID_EVENTS[name];
 if(!l) return;
 for(let i=0;i<l.length;i++){ try{ l[i](payload); }catch(e){ console.warn('[raidEvent]',name,e); } }
}

// ==================== UI: 获得 / 消耗 提示条 ====================
// 模块: UI · 调用入口: addLootToBag / useLootFromBag / buyAmmoPack 等
// 独立元素 #lootToast, 不与 showScorePop 抢占同一个 DOM, 避免提示被覆盖
let _raidPopT = null;
function raidPop(html, ms){
 const s = (typeof el==='function') ? el('lootToast') : document.getElementById('lootToast');
 if(!s) { if(typeof showScorePop==='function') showScorePop(String(html).replace(/<[^>]*>/g,'')); return; }
 s.innerHTML = html;
 s.style.opacity = 1;
 clearTimeout(_raidPopT);
 _raidPopT = setTimeout(()=>{ s.style.opacity = 0; }, ms||RAID_POP_MS);
}
function raidOk(html){   raidPop(`<span style="color:#9fe08a">✔</span> ${html}`, RAID_POP_MS); }
function raidWarn(html){ raidPop(`<span style="color:#ff9c7a">✖</span> ${html}`, 2100);
 if(typeof AudioSys!=='undefined' && AudioSys.click) AudioSys.click(220,0.22,0.05); }

// ==================== Inventory: 局内背包 ====================
// 模块: Inventory · 调用入口: renderBagPanel / lootTakeSelected / useMedQuick
function bagCount(key){ return (RUN && RUN.loot) ? (RUN.loot[key]||0) : 0; }
function itemUsableInRaid(key){ return !!(MED_DEFS[key] || FOOD_DEFS[key]); }
function bagUsableKeys(){
 return (typeof bagEntryKeys==='function' ? bagEntryKeys() : Object.keys(RUN.loot||{}))
        .filter(itemUsableInRaid);
}
// 按伤势给背包里的医疗品打分(与 bestMedIndex 同款权重, 只是数据源换成背包)
function bestBagMedKey(){
 const p = player;
 const keys = bagUsableKeys().filter(k=>MED_DEFS[k]);
 if(!keys.length) return '';
 const anyBlacked = Object.keys(p.blacked||{}).some(k=>p.blacked[k]);
 let best='', bestSc=0;
 for(const k of keys){
  const d = MED_DEFS[k];
  let sc = 0;
  if(d.treat==='black' && (anyBlacked || (p.fractures && p.fractures.length))) sc = 6;
  else if(d.treat==='bleed' && ((p.bleedHeavy||0)>0 || (p.bleedLight||0)>0)) sc = 5;
  else if(d.treat==='infection' && (p.blacked && p.blacked.stomach)) sc = 4;
  else if(d.treat==='heal' && p.body && (typeof bodyHpTotal==='function') && bodyHpTotal(p) < bodyHpMax(p)*0.96) sc = 3;
  else if((d.treat==='pain' || d.treat==='pain2') && (p.painT||0)<=0
          && (typeof playerInPain==='function' ? playerInPain(p) : false)) sc = 5.5;
  else if(d.treat==='stim' && (p.stamina||1) < 0.25) sc = 1;
  if(sc > bestSc){ bestSc = sc; best = k; }
 }
 return bestSc>0 ? best : keys[0];
}
// 选最"补得上"的食物(缺多少补多少, 不浪费)
function bestBagFoodKey(){
 const p = player;
 const keys = bagUsableKeys().filter(k=>FOOD_DEFS[k]);
 if(!keys.length) return '';
 const nw = 100-(p.hydration||0), nf = 100-(p.satiety||0);
 let best=keys[0], bs=-1;
 for(const k of keys){
  const d = FOOD_DEFS[k];
  const sc = Math.min(d.water||0, nw) + Math.min(d.food||0, nf);
  if(sc > bs){ bs = sc; best = k; }
 }
 return best;
}

// ---------- 核心: 局内即时使用背包物品 ----------
// 模块: Inventory · 调用入口: 背包面板 [E] / 点击「使用」/ H·K 快捷栏空时回退
// 说明: 从 RUN.loot 扣 1 → 注入 player.medItems / player.foodItems → 复用既有
//       startUseAnim + finishMedUse / finishFoodUse, 因此任务系统(39_quests 的
//       questEvent('use'))、肢体血量、经验值全部自动生效, 无需任何新字段。
function useLootFromBag(key){
 const p = (typeof player!=='undefined') ? player : null;
 if(!p || !p.alive || !p.deployed){ raidWarn('当前无法使用物品'); return false; }
 if(typeof matchOver!=='undefined' && matchOver) return false;
 if((p.medUseT||0) > 0){ raidWarn('正在使用其他物品'); return false; }
 if(p.onMG || p.onAT || p.onAA || (typeof handsFreeVeh==='function' && !handsFreeVeh())){
  raidWarn('当前姿态无法使用物品'); return false;
 }
 if(typeof VM!=='undefined' && VM.state!=='idle'){ raidWarn('动作进行中'); return false; }
 if(typeof nowT!=='undefined' && nowT-(p._raidUseCdT||-99) < RAID_USE_CD) return false;
 if(!itemUsableInRaid(key)){ raidWarn('「'+itemLabel(key)+'」无法在局内使用'); return false; }
 const n = bagCount(key);
 if(n <= 0){ raidWarn('背包中没有「'+itemLabel(key)+'」'); return false; }

 const isMed = !!MED_DEFS[key];
 const d = isMed ? MED_DEFS[key] : FOOD_DEFS[key];
 const t = (d.utime||1.2) * RAID_USE_TIME_MUL;

 // 1) 从局内背包扣减
 RUN.loot[key] = n-1;
 if(RUN.loot[key] <= 0) delete RUN.loot[key];
 // 2) 注入既有快捷栏结构(带 fromBag 标记, 便于调试; 不写 META, 不会被存档)
 if(isMed){
  p.medItems = p.medItems || [];
  p.medItems.push({ key:key, uses:1, fromBag:true });
  p._medIdx = p.medItems.length-1;
 } else {
  p.foodItems = p.foodItems || [];
  p.foodItems.push({ key:key, fromBag:true });
  p.foodSel = p.foodItems.length-1;
 }
 // 3) 走既有使用流程
 startUseAnim(t, isMed ? 'med' : 'food');
 p._raidUseCdT = (typeof nowT!=='undefined') ? nowT : 0;
 raidPop(`${itemIconOf(key)} 使用 <b>${itemLabel(key)}</b> ×1 · 背包剩余 <b>${bagCount(key)}</b>`, RAID_POP_MS);
 if(typeof AudioSys!=='undefined' && AudioSys.metalSlide) AudioSys.metalSlide(0.14,0.25,400,700);
 if(typeof renderRaidBag==='function') renderRaidBag();
 emitRaidEvent('OnItemUsed', { key:key, left:bagCount(key) });
 return true;
}

// 拾取提示中 [E] 后面跟的动词; 41_raidloot 会把弹药改写为「装填」
// 模块: UI · 调用入口: addLootToBag 的富提示
function raidUseVerb(key){ return '立即使用'; }

// ---------- 拾取重构: 统一入口 + 富提示 ----------
// 模块: Inventory + UI · 调用入口: lootTakeSelected(F 搜刮拿取) → addLootToBag
const _origAddLootToBag = (typeof addLootToBag==='function') ? addLootToBag : null;
addLootToBag = function(key, n){
 n = n || 1;
 if(!_origAddLootToBag) return false;
 if(!canCarry(key, n)){
  raidWarn(`背包空间不足 · ${itemIconOf(key)} ${itemLabel(key)} 需 ${itemSizeOf(key)*n} 格, 剩余 ${bagFree()} 格`);
  return false;
 }
 const before = bagCount(key);
 if(!_origAddLootToBag(key, n)) return false;
 const after = bagCount(key);
 const action=AMMO_DEFS[key]?(TOUCHUI?'点换弹装填':'按 '+keyLabelOf('reload')+' 装填'):'可在背包使用';
 const useTip=itemUsableInRaid(key)?' · '+action:'';
 raidOk(`获得 ${itemIconOf(key)} <b>${itemLabel(key)}</b> <b>×${n}</b> · 持有 <b>${after}</b>${before?`（原 ${before}）`:''}${useTip}`);
 emitRaidEvent('OnLootPickup', { key:key, n:n, total:after });
 return true;
};

// ---------- 快捷栏回退: H / K 在快捷栏空时自动取用背包 ----------
// 模块: Inventory · 调用入口: InputActions.bandage(H) / InputActions.eatFood(K)
const _origUseMedQuick  = (typeof useMedQuick ==='function') ? useMedQuick  : null;
const _origUseFoodQuick = (typeof useFoodQuick==='function') ? useFoodQuick : null;
useMedQuick = function(){
 const p = (typeof player!=='undefined') ? player : null;
 const empty = !p || !(p.medItems||[]).some(m => m && m.uses>0);
 if(empty){
  const k = bestBagMedKey();
  if(k){ useLootFromBag(k); return; }
 }
 if(_origUseMedQuick) _origUseMedQuick();
};
useFoodQuick = function(){
 const p = (typeof player!=='undefined') ? player : null;
 const empty = !p || !(p.foodItems||[]).length;
 if(empty){
  const k = bestBagFoodKey();
  if(k){ useLootFromBag(k); return; }
 }
 if(_origUseFoodQuick) _origUseFoodQuick();
};

// ---------- 背包面板增强: [E] 使用 + 行内「使用」按钮 ----------
// 模块: UI · 调用入口: renderRaidBag → renderBagPanel(本文件已包裹)
const _origRenderBagPanel = (typeof renderBagPanel==='function') ? renderBagPanel : null;
renderBagPanel = function(){
 if(_origRenderBagPanel) _origRenderBagPanel();
 enhanceBagPanel();
};
function enhanceBagPanel(){
 if(!(typeof BAG_UI!=='undefined' && BAG_UI.open)) return;
 const list = (typeof el==='function') ? el('bagPanelList') : document.getElementById('bagPanelList');
 if(!list) return;
 // 行内「使用」按钮
 Array.prototype.forEach.call(list.querySelectorAll('.bagRow'), row=>{
  const key = row.dataset ? decodeURIComponent(row.dataset.bk||'') : '';
  if(!key || !itemUsableInRaid(key)) return;
  if(row.querySelector('.apUse')) return;
  const b = document.createElement('button');
  b.className = 'apUse';
  b.textContent = '使用';
  b.dataset.buse = key;
  row.appendChild(b);
 });
 // 提示行统一走 38_tarkov 的 bagHintHTML(): 桌面列快捷键 / 手机显示触屏说明,
 // 并自动带上「E 立即使用」。以前这里自己拼字符串, 会把手机端文案覆盖掉。
 const hint = (typeof el==='function') ? el('bagPanelHint') : document.getElementById('bagPanelHint');
 if(hint){
  hint.innerHTML = (typeof bagHintHTML==='function')
   ? bagHintHTML()
   : `<b>↑/↓</b> 选择 · <b>E</b> 立即使用 · <b>G</b> 丢弃 1 个 · <b>Shift+G</b> 全部丢弃(装备类放回仓库) · <b>Q</b> 存入安全箱 · <b>Tab</b> 关闭`;
 }
 if(list && !list._useBound){
  list._useBound = true;
  list.addEventListener('click', ev=>{
   const b = ev.target && ev.target.closest ? ev.target.closest('.apUse') : null;
   if(!b || !b.dataset.buse) return;
   ev.stopPropagation();
   useLootFromBag(b.dataset.buse);
  });
 }
}
// 背包面板按键表追加 KeyE(通过包裹既有 bagPanelKey, 不改 24_input.js)
const _origBagPanelKey = (typeof bagPanelKey==='function') ? bagPanelKey : null;
bagPanelKey = function(code, shift){
 if(code === 'KeyE' && typeof BAG_UI!=='undefined' && BAG_UI.open){
  const ks = bagEntryKeys();
  if(ks.length){
   const key = ks[Math.min(BAG_UI.sel, ks.length-1)];
   if(itemUsableInRaid(key)) useLootFromBag(key);
   else raidWarn('「'+itemLabel(key)+'」无法在局内使用');
  }
  return true;
 }
 return _origBagPanelKey ? _origBagPanelKey(code, shift) : false;
};

// ==================== Shop: 弹药局内购买 ====================
// 模块: Shop(弹药商店) + GameMode
function ammoShopActive(){
 if(!AMMO_SHOP_ENABLED) return false;
 return AMMO_SHOP_MODES.indexOf((typeof GAMEMODE!=='undefined') ? GAMEMODE : '') >= 0;
}
function ammoShopCanOpen(){
 const p = (typeof player!=='undefined') ? player : null;
 return ammoShopActive() && !!p && p.alive && p.deployed
        && !(typeof matchOver!=='undefined' && matchOver);
}
function ammoKeyOfCaliber(cal){ return AMMO_KEYS_BY_CAL[cal]; }
function currentAmmoWeapon(){
 const p = (typeof player!=='undefined') ? player : null;
 return (p && p.curW && p.curW.def) ? p.curW : null;
}
function ammoNameOf(key){
 return AMMO_DEFS[key]?AMMO_DEFS[key].name:key;
}
function ammoQuote(pk, w){
 if(!w) return { ok:false, reason:'当前没有可装填的武器', give:0, price:pk.price, cur:0, cap:0 };
 const cal=ammoCaliberOf(w.key);
 if(pk.cal!==cal) return {ok:false,reason:w.def.name+' 使用'+AMMO_CAL_NAME[cal],give:0,price:pk.price};
 // 备弹/弹匣里已有别的弹种: 不允许混装, 先打空再换
 if(w.ammo && ((w.reserve||0)>0 || (w.mag||0)>0) && w.ammo!==pk.id)
  return { ok:false, reason:`枪里/备弹是「${ammoNameOf(w.ammo)}」，先打空再换 ${pk.name}`,
           give:0, price:pk.price, cur:w.reserve||0, cap:w.def.reserve||0 };
 const cap  = w.def.reserve || 0;
 const room = Math.max(0, cap - (w.reserve||0));
 if(room <= 0)
  return { ok:false, reason:`「${w.def.name}」备弹已满 ${w.reserve}/${cap}`, give:0, price:0, cur:w.reserve||0, cap:cap };
 const give  = Math.min(pk.rounds, room);
 const price = Math.max(1, Math.round(pk.price * give / pk.rounds));
 return { ok:true, give:give, price:price, cur:w.reserve||0, cap:cap };
}
// ---------- 扣费 + 发货 ----------
// 模块: Shop · 调用入口: 弹药商店 [F]/[Enter]/[1-6]/点击购买 · 补给点 AMMO_CRATES 按 F
function buyAmmoPack(id){
 if(!ammoShopCanOpen()){ raidWarn('仅在对局进行中可购买弹药'); return false; }
 const pk = AMMO_DEFS[id];
 if(!pk) return false;
 const w = currentAmmoWeapon();
 const q = ammoQuote(pk, w);
 if(!q.ok){ raidWarn(q.reason); return false; }
 const wallet = (typeof META!=='undefined') ? (META.wallet||0) : 0;
 if(wallet < q.price){
  raidWarn(`货币不足 · ${pk.icon} ${pk.name} 需 <b>¥${formatMoney(q.price)}</b>,`
          +` 当前 <b>¥${formatMoney(wallet)}</b>, 还差 <b>¥${formatMoney(q.price-wallet)}</b>`);
  emitRaidEvent('OnAmmoBuyFailed', { id:id, need:q.price, wallet:wallet });
  return false;                       // 硬失败: 一分钱不扣, 一发子弹不发
 }
 META.wallet = wallet - q.price;      // 扣费
 w.reserve = Math.min(q.cap, (w.reserve||0) + q.give);  // 发货(不超过备弹上限)
 w.ammo = pk.id;
 RUN.ammoSpent  = (RUN.ammoSpent||0)  + q.price;       // 局内统计(RUN 不持久化)
 RUN.ammoRounds = (RUN.ammoRounds||0) + q.give;
 if(typeof saveMeta==='function') saveMeta();
 raidOk(`买入 ${pk.icon} ${pk.name} (T${pk.tier}) · <b>+${q.give}</b> 发 · 支出 <b>¥${formatMoney(q.price)}</b>`
       +` · 「${w.def.name}」备弹 <b>${w.reserve}/${q.cap}</b> · 余额 ¥${formatMoney(META.wallet)}`);
 if(typeof AudioSys!=='undefined' && AudioSys.metalSlide) AudioSys.metalSlide(0.3,0.15,500,900);
 emitRaidEvent('OnAmmoPurchased', { id:id, rounds:q.give, price:q.price });
 renderAmmoShop();
 return true;
}

// ---------- 移除免费补给: 弹药箱不再白给 ----------
// 模块: GameMode · 调用入口: 补给点(AMMO_CRATES)按 F → doGrabResolve
// 原逻辑(23_player.js): 补给箱直接把所有武器 reserve 拉满 + 手雷回满 → 现改为打开弹药商店。
// AMMO_SHOP_ENABLED=false 或不在 AMMO_SHOP_MODES 中时, 自动退回原免费补给, 不影响经典征服模式。
const _origDoGrabResolve = (typeof player!=='undefined' && player.doGrabResolve) ? player.doGrabResolve : null;
if(_origDoGrabResolve){
 player.doGrabResolve = function(){
  const ga = this.grabAction;
  if(ga && ga.kind === 'ammo' && ammoShopActive()){
   this.grabAction = null;
   if(typeof VM!=='undefined') VM.state = 'idle';
   ammoShopOpen();
   return;
  }
  return _origDoGrabResolve.call(this);
 };
}
function ammoBoxForReload(w){
 if(!w) return '';
 const cal=ammoCaliberOf(w.key);
 if(w.ammo&&AMMO_DEFS[w.ammo]?.cal===cal&&(bagCount(w.ammo)>0||w.loanAmmoBox===w.ammo)) return w.ammo;
 if(w.mag>0&&w.ammo) return '';
 if(w.loanAmmoBox&&AMMO_DEFS[w.loanAmmoBox]?.cal===cal) return w.loanAmmoBox;
 const basic=ammoKeyOfCaliber(cal);
 if(bagCount(basic)>0) return basic;
 for(const key in RUN.loot) if(RUN.loot[key]>0&&AMMO_DEFS[key]?.cal===cal) return key;
 return '';
}
// 换弹统一走同一入口：先用现有备弹，需要时再拆与当前枪匹配的一盒。
const _origTryReload = (typeof tryReload==='function') ? tryReload : null;
tryReload = function(){
 const w = currentAmmoWeapon();
 if(w&&w.mag<w.def.mag&&w.reserve<=0&&VM.state==='idle'&&player.alive&&player.deployed&&!matchOver){
  const cal=ammoCaliberOf(w.key);
  const key=ammoBoxForReload(w);
  if(key){
   if(!loadAmmoFromBag(key)) return;
  } else if(ammoShopActive()){
   const needed=w.mag&&w.ammo?ammoNameOf(w.ammo):AMMO_CAL_NAME[cal];
   raidWarn(needed+'已用完 · '+(TOUCHUI?'到弹药补给点购买':keyLabelOf('ammoShop')+' 打开弹药商店'));
   return;
  }
 }
 if(_origTryReload) _origTryReload();
};

// ==================== UI: 弹药商店面板 ====================
const AMMO_UI = { open:false, sel:0 };
function currentAmmoPacks(){
 const w=currentAmmoWeapon();
 return w?AMMO_PACK_DEFS.filter(pk=>pk.cal===ammoCaliberOf(w.key)):[];
}
function ammoShopOpen(){
 if(!ammoShopCanOpen()){ raidWarn('仅在对局进行中可购买弹药'); return false; }
 if(typeof lootPanelClose==='function') lootPanelClose(false);
 if(typeof bagPanelClose==='function') bagPanelClose(false);
 AMMO_UI.open = true;
 const w=currentAmmoWeapon(), packs=currentAmmoPacks();
 const initial=w&&(w.mag||w.reserve)&&w.ammo?w.ammo:(w&&ammoKeyOfCaliber(ammoCaliberOf(w.key)));
 AMMO_UI.sel=Math.max(0,packs.findIndex(pk=>pk.id===initial));
 releaseAllInputs();
 player.ads=false;
 if(!TOUCHUI&&document.pointerLockElement) document.exitPointerLock();
 renderAmmoShop();
 el('ammoShopPanel').focus({preventScroll:true});
 if(typeof AudioSys!=='undefined' && AudioSys.click) AudioSys.click(900,0.2,0.04);
 return true;
}
function ammoShopClose(resume=true){
 const wasOpen=AMMO_UI.open;
 AMMO_UI.open = false;
 const pnl = (typeof el==='function') ? el('ammoShopPanel') : document.getElementById('ammoShopPanel');
 if(pnl) pnl.classList.add('hidden');
 if(wasOpen&&resume){ releaseAllInputs(); bagRelockPointer(); }
}
function ammoSelMove(d){
 if(!AMMO_UI.open) return;
 const n=currentAmmoPacks().length;
 if(!n) return;
 AMMO_UI.sel = (AMMO_UI.sel + d + n) % n;
 renderAmmoShop();
 if(typeof AudioSys!=='undefined' && AudioSys.click) AudioSys.click(1400,0.1,0.03);
}
// 模块: UI · 调用入口: ammoShopOpen / buyAmmoPack(刷新价格与余额) / ammoSelMove
function renderAmmoShop(){
 const pnl = (typeof el==='function') ? el('ammoShopPanel') : document.getElementById('ammoShopPanel');
 if(!pnl) return;
 if(!AMMO_UI.open || !ammoShopCanOpen()){ pnl.classList.add('hidden'); return; }
 pnl.classList.remove('hidden');
 const w = currentAmmoWeapon();
 const g = id => ((typeof el==='function') ? el(id) : document.getElementById(id));
 const stat = g('ammoShopStat');
 if(stat) stat.innerHTML = `当前武器 <b>${w ? w.def.name : '无'}</b>`
   + ` · 弹种 <b>${w && w.ammo ? ammoNameOf(w.ammo) : '空'}</b>`
   + ` · 备弹 <b>${w ? (w.reserve||0) : 0}/${w ? (w.def.reserve||0) : 0}</b>`
   + ` · 余额 <b>¥${formatMoney((typeof META!=='undefined') ? (META.wallet||0) : 0)}</b>`;
 const packs=currentAmmoPacks();
 if(AMMO_UI.sel >= packs.length) AMMO_UI.sel = 0;
 let rows = '';
 packs.forEach((pk,i)=>{
  const q = ammoQuote(pk, w);
  const affordable=q.ok&&META.wallet>=q.price;
  const info=q.ok?(affordable?'实发 '+q.give+' 发':'余额不足'):q.reason;
  rows += `<div class="lootRow ammoRow${i===AMMO_UI.sel?' sel':''}${affordable?'':' cant'}" data-ap="${pk.id}">`
        + `<span class="lrMark">${i===AMMO_UI.sel?'▸':' '}</span>`
        + `<span class="lrName">${pk.name} <span>T${pk.tier}</span></span>`
        + `<span class="lrInfo">${info}</span>`
        + `<button type="button" class="apBuy" data-apbuy="${pk.id}" ${affordable?'':'disabled'}>¥${formatMoney(q.ok?q.price:pk.price)} 购买</button>`
        + `</div>`;
 });
 const list = g('ammoShopList');
 if(list) list.innerHTML = rows;
 const hint = g('ammoShopHint');
 if(hint) hint.textContent=TOUCHUI?'购买后加入当前武器备弹':('↑/↓ 选择 · Enter 购买 · 数字键直购 · Esc 关闭');
 if(list && !list._ammoBound){
  list._ammoBound = true;
  list.addEventListener('click', ev=>{
   const row = ev.target && ev.target.closest ? ev.target.closest('[data-ap]') : null;
   if(row && row.dataset.ap){
    AMMO_UI.sel = Math.max(0, currentAmmoPacks().findIndex(p=>p.id===row.dataset.ap));
   }
   const b = ev.target && ev.target.closest ? ev.target.closest('[data-apbuy]') : null;
   if(b && b.dataset.apbuy){ ev.stopPropagation(); buyAmmoPack(b.dataset.apbuy); }
   else renderAmmoShop();
  });
 }
}
// 模块: Input · 调用入口: bagPanelKey 包裹层(24_input.js 按键分发)
function ammoPanelKey(code, shift){
 if(!AMMO_UI.open) return false;
 if(code === 'ArrowUp'){ ammoSelMove(-1); return true; }
 if(code === 'ArrowDown'){ ammoSelMove(1); return true; }
 if(code === 'KeyF' || code === 'Enter' || code === 'NumpadEnter'){
  const pk = currentAmmoPacks()[AMMO_UI.sel];
  if(pk) buyAmmoPack(pk.id);
  return true;
 }
 if(code === 'Escape'){ ammoShopClose(); return true; }
 const m = /^Digit([1-9])$/.exec(code);
 if(m){
  const pk = currentAmmoPacks()[(+m[1]) - 1];
  if(pk) buyAmmoPack(pk.id);
  return true;
 }
 return false;
}

// ==================== 生命周期挂载 (兼容性) ====================
// 模块: GameMode · 调用入口: startMatch / finishRaid / onPlayerRaidDeath
const _origStartMatch = (typeof startMatch==='function') ? startMatch : null;
startMatch = function(){
 ammoShopClose(false);
 RUN.ammoSpent = 0; RUN.ammoRounds = 0;
 const r = _origStartMatch ? _origStartMatch.apply(this, arguments) : undefined;
 emitRaidEvent('OnMatchStart', { mode:(typeof GAMEMODE!=='undefined')?GAMEMODE:'' });
 return r;
};
const _origFinishRaid = (typeof finishRaid==='function') ? finishRaid : null;
finishRaid = function(extracted){
 ammoShopClose(false);
 const r = _origFinishRaid ? _origFinishRaid(extracted) : undefined;
 // 结算追加一行弹药采购支出(只读展示, 不写 META)
 const spent = RUN.ammoSpent || 0;
 if(spent>0&&!el('endStats').querySelector('.reportAmmo')){
  reportGroup('局内弹药采购',[(RUN.ammoRounds||0)+' 发 · 支出 ¥'+formatMoney(spent)]).classList.add('reportAmmo');
 }
 emitRaidEvent('OnMatchEnd', { extracted:!!extracted, ammoSpent:spent });
 return r;
};
const _origOnPlayerRaidDeath = (typeof onPlayerRaidDeath==='function') ? onPlayerRaidDeath : null;
onPlayerRaidDeath = function(){
 ammoShopClose(false);
 const r = _origOnPlayerRaidDeath ? _origOnPlayerRaidDeath() : undefined;
 emitRaidEvent('OnPlayerDeath', { ammoSpent:(RUN.ammoSpent||0) });
 return r;
};
