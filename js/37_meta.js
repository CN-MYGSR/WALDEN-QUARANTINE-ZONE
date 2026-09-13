'use strict';
// ===================== 局外经济 / 军械库 / 仓库 =====================
const ARMOR_DEFS={
 armor1:{name:'轻型防弹衣 Lv1',level:1,hp:12,resist:0.05,weight:1.0,price:320},
 armor2:{name:'标准防弹衣 Lv2',level:2,hp:22,resist:0.10,weight:1.8,price:720},
 armor3:{name:'重型防弹衣 Lv3',level:3,hp:34,resist:0.14,weight:2.7,price:1250},
 armor4:{name:'复合护甲 Lv4',level:4,hp:46,resist:0.18,weight:3.6,price:2100},
 armor5:{name:'战术动力甲 Lv5',level:5,hp:60,resist:0.22,weight:5.0,price:3200},
 armor6:{name:'重装动力甲 Lv6',level:6,hp:76,resist:0.26,weight:6.5,price:4800}
};
const ITEM_CATALOG=[
 ...Object.keys(WPN_DEFS).map(k=>({key:k,kind:'weapon'})),
 ...Object.keys(ARMOR_DEFS).map(k=>({key:k,kind:'armor'}))
];
function weaponPrice(key){
 const d=WPN_DEFS[key]||{};
 let base=420;
 if(d.pistol) base=240;
 else if(d.rocket||d.atRifle) base=1450;
 else if(d.scoped) base=1250;
 else if(d.mortar) base=900;
 else if(d.wg) base=880;
 else if(d.type==='auto') base=760;
 base+=((d.dmg||20)*9);
 return Math.max(160,Math.round(base/10)*10);
}
const ITEM_PRICES={};
for(const c of ITEM_CATALOG) ITEM_PRICES[c.key]=c.kind==='weapon'?weaponPrice(c.key):ARMOR_DEFS[c.key].price;
function itemName(key){ return WPN_DEFS[key]?WPN_DEFS[key].name:(ARMOR_DEFS[key]?ARMOR_DEFS[key].name:'未知物品'); }
function itemKind(key){ return WPN_DEFS[key]?'weapon':'armor'; }
function itemDesc(key){
 if(ARMOR_DEFS[key]){
  const a=ARMOR_DEFS[key];
  return `Lv${a.level} · +${a.hp} HP · 减伤 ${Math.round(a.resist*100)}% · 重量 ${a.weight}`;
 }
 const d=WPN_DEFS[key];
 return d?`${d.mode} · 伤害 ${d.dmg} · 弹匣 ${d.mag} / 备弹 ${d.reserve}`:'';
}
function itemSellPrice(key){ return Math.max(1,Math.floor((ITEM_PRICES[key]||0)*0.45)); }
function itemPrice(key){ return ITEM_PRICES[key]||0; }
function metaLoadoutDefault(){ return { primary:'m1911', secondary:'', armor:'armor1', pack:'packSmall', meds:['','',''], foods:['',''], nvg:false }; }
function metaDefault(){
 return {
  seeded:true,
  seed2:true,
  wallet:2600,
  owned:{m1911:1,armor1:1,packSmall:1,medkit:1,tourniquet:1,water:2,noodles:1,painkiller:1},
  loot:{},
  insurance:[],
  xp:0,
  level:1,
  questProg:{},
  questDone:{},
  prestige:0,
  scavT:0,
  loadout:metaLoadoutDefault()
 };
}
function normalizeMeta(m){
 const d=metaDefault();
 if(!m||typeof m!=='object') return d;
 if(typeof m.wallet!=='number'||m.wallet<0) m.wallet=d.wallet;
 if(!m.owned||typeof m.owned!=='object') m.owned={...d.owned};
 if(!m.loot||typeof m.loot!=='object') m.loot={};
 if(!Array.isArray(m.insurance)) m.insurance=[];
 if(typeof m.xp!=='number'||m.xp<0) m.xp=0;
 // 任务系统迁移: 等级/任务进度/重生次数
 if(typeof m.level!=='number'||m.level<1) m.level=1;
 if(!m.questProg||typeof m.questProg!=='object') m.questProg={};
 if(!m.questDone||typeof m.questDone!=='object'||Array.isArray(m.questDone)) m.questDone={};
 if(typeof m.prestige!=='number'||m.prestige<0) m.prestige=0;
 // ELO 动态难度评分 (老存档没有该字段 → 用初始值)
 if(!m.elo||typeof m.elo!=='object') m.elo={rating:ELO_START,peak:ELO_START,raids:0,auto:true};
 if(!m.loadout||typeof m.loadout!=='object') m.loadout=metaLoadoutDefault();
 if(!m.loadout.pack) m.loadout.pack='packSmall';
 // 已删除武器的存档回退 (2026-09-13 移除火箭筒/反坦克枪): 装备了不存在武器时退回保底手枪
 // 注意: 此处只能用 13_weapons_data 的 WPN_DEFS; PACK_DEFS 定义在 38_tarkov, 本文件加载时还在 TDZ, 不可访问
 if(m.loadout.primary&&!WPN_DEFS[m.loadout.primary]) m.loadout.primary=SAFETY_WEAPON;
 if(m.loadout.secondary&&!WPN_DEFS[m.loadout.secondary]) m.loadout.secondary='';
 if(!Array.isArray(m.loadout.meds)) m.loadout.meds=['','',''];
 while(m.loadout.meds.length<3) m.loadout.meds.push('');
 if(!Array.isArray(m.loadout.foods)) m.loadout.foods=['',''];
 while(m.loadout.foods.length<2) m.loadout.foods.push('');
 if(!m.seeded){
  if(!m.owned.m1911) m.owned.m1911=(m.owned.m1911||0)+1;
  if(!m.owned.armor1) m.owned.armor1=(m.owned.armor1||0)+1;
  m.seeded=true;
 }
 // 塔科夫化迁移: 首次升级存档发放新手消耗品 (背包/医疗包/止血带/水/面/止痛药)
 if(!m.seed2){
  m.owned.packSmall=(m.owned.packSmall||0)+1;
  m.owned.medkit=(m.owned.medkit||0)+1;
  m.owned.tourniquet=(m.owned.tourniquet||0)+1;
  m.owned.painkiller=(m.owned.painkiller||0)+1;
  m.owned.water=(m.owned.water||0)+2;
  m.owned.noodles=(m.owned.noodles||0)+1;
  m.seed2=true;
 }
 return m;
}
function loadMeta(){
 let m=null;
 try{ m=JSON.parse(localStorage.getItem('bf_meta_v1')||'null'); }catch(e){}
 return normalizeMeta(m);
}
const META=loadMeta();
// 读档后同步 ELO 评分并重算敌方强度乘区 (00b_elo 已在本文件之前加载完毕)
if(typeof eloSyncFromMeta==='function') eloSyncFromMeta();
const RUN={kills:0,searches:0,loot:{},extracting:false,failComp:0,autoKit:null,lostGear:null,returnedGear:null};

// ===================== 失败补偿 / 保底 =====================
// 目的: 撤离失败(阵亡)后给予固定补贴, 并确保玩家任何时候都不会"赤手空拳"进场。
// 设计: 失败补偿 500 是净收入, 不依赖战利品带回; 同时兜底发放一把最廉价手枪,
//       避免玩家卖光装备后陷入"无武器 → 打不过 → 更没钱"的死亡螺旋。
const FAIL_COMPENSATION=500;        // 单局失败固定补贴
const SAFETY_WEAPON='m1911';        // 无枪时的保底武器
const SAFETY_WEAPON_MAG=2;          // 保底发放时附带弹匣数
const SAFETY_ARMOR='armor1';

// 玩家是否处于"无任何武器"状态
function hasAnyWeapon(){ return ownedWeaponList().length>0; }
// 确保至少有一把武器(及一件护甲), 返回是否发生了补发
function ensureSafetyKit(reason){
 const granted=[];
 if(!hasAnyWeapon()){
   addOwned(SAFETY_WEAPON,SAFETY_WEAPON_MAG>0?1:1);
   granted.push(SAFETY_WEAPON);
   if(!META.loadout.primary||!ownedCount(META.loadout.primary)) META.loadout.primary=SAFETY_WEAPON;
 }
 if(!ownedArmorList().length){
   addOwned(SAFETY_ARMOR,1);
   granted.push(SAFETY_ARMOR);
   if(!META.loadout.armor||!ownedCount(META.loadout.armor)) META.loadout.armor=SAFETY_ARMOR;
 }
 if(granted.length){
   saveMeta();
   if(typeof showScorePop==='function')
     showScorePop('保底补给: '+granted.map(k=>itemName(k)).join(' · ')+' 已入库');
 }
 return granted;
}
// 发放失败补偿, 返回本次实发金额
function grantFailCompensation(extra){
 const total=FAIL_COMPENSATION+Math.max(0,Math.round(extra||0));
 META.wallet+=total;
 saveMeta();
 return total;
}
function saveMeta(){
 try{ localStorage.setItem('bf_meta_v1',JSON.stringify(META)); }catch(e){}
}
function ownedCount(key){ return (META.owned[key]||0); }
function addOwned(key,n=1){ META.owned[key]=(META.owned[key]||0)+n; saveMeta(); }
function addLootToRun(key,n=1){ RUN.loot[key]=(RUN.loot[key]||0)+n; }
function rollLootKey(){
 const weapons=Object.keys(WPN_DEFS);
 const armors=Object.keys(ARMOR_DEFS);
 return Math.random()<0.72?weapons[randi(0,weapons.length-1)]:armors[randi(0,armors.length-1)];
}
function addRunLoot(){
 const key=rollLootKey();
 addLootToRun(key,1);
 return key;
}
function runLootTotal(){
 return Object.values(RUN.loot).reduce((a,b)=>a+b,0);
}
function runLootValue(){
 let v=0;
 for(const k in RUN.loot) v+=itemSellPrice(k)*RUN.loot[k];
 return v;
}
function mergeRunLoot(){
 for(const k in RUN.loot) META.loot[k]=(META.loot[k]||0)+RUN.loot[k];
 RUN.loot={};
 saveMeta();
}
function formatMoney(n){ return Number(n||0).toLocaleString('zh-CN'); }
function ownedWeaponList(){ return Object.keys(META.owned).filter(k=>WPN_DEFS[k]&&META.owned[k]>0); }
function ownedArmorList(){ return Object.keys(META.owned).filter(k=>ARMOR_DEFS[k]&&META.owned[k]>0); }
function firstOwnedWeapon(){
 const list=ownedWeaponList();
 return list.includes('m1911')?'m1911':(list[0]||'');
}
function buyItem(key){
 const price=itemPrice(key);
 if(!price) return;
 // 任务系统门控: 通行证需 20 任务全完成; 市集商品有等级要求 (见 39_quests)
 if(typeof buyGateMsg==='function'){
  const gm=buyGateMsg(key);
  if(gm){ if(typeof showScorePop==='function') showScorePop(gm); return; }
 }
 if(META.wallet<price){ if(typeof showScorePop==='function') showScorePop('货币不足'); return; }
 META.wallet-=price;
 addOwned(key,1);
 if(typeof questEvent==='function') questEvent('buy',key,1);
 saveMeta();
 renderArmory(ARMORY_TAB||'store');
 refreshLoadoutSelects();
}
function sellItem(key){
 if(!ownedCount(key)) return;
 META.owned[key]--;
 if(META.owned[key]<=0) delete META.owned[key];
 if(META.loadout.primary===key&&ownedCount(key)<=0) META.loadout.primary=firstOwnedWeapon();
 if(META.loadout.secondary===key&&ownedCount(key)<=0) META.loadout.secondary='';
 if(META.loadout.armor===key&&ownedCount(key)<=0) META.loadout.armor=ownedArmorList()[0]||'armor1';
 META.wallet+=itemSellPrice(key);
 saveMeta();
 renderArmory(ARMORY_TAB||'warehouse');
 refreshLoadoutSelects();
}
function sellLoot(key){
 if(!(META.loot[key]||0)) return;
 META.loot[key]--;
 if(META.loot[key]<=0) delete META.loot[key];
 META.wallet+=itemSellPrice(key);
 saveMeta();
 renderArmory(ARMORY_TAB||'loot');
}
function moveLootToOwned(key){
 if(!(META.loot[key]||0)) return;
 META.loot[key]--;
 if(META.loot[key]<=0) delete META.loot[key];
 addOwned(key,1);
 saveMeta();
 renderArmory(ARMORY_TAB||'loot');
 refreshLoadoutSelects();
}
function sellAllLoot(){
 for(const k in META.loot) META.wallet+=itemSellPrice(k)*META.loot[k];
 META.loot={};
 saveMeta();
 renderArmory(ARMORY_TAB||'loot');
}
function setLoadout(slot,key){
 if(!key) return;
 META.loadout[slot]=key;
 saveMeta();
 refreshLoadoutSelects();
}
function refreshLoadoutSelects(){
 const pSel=el('arsenalSelect'), sSel=el('secondarySelect'), aSel=el('armorSelect');
 if(pSel){
  pSel.innerHTML='<option value="">— 未选择 —</option>';
  for(const k of ownedWeaponList()){
   const o=document.createElement('option');
   o.value=k; o.textContent=itemName(k);
   o.selected=k===META.loadout.primary;
   pSel.appendChild(o);
  }
  pSel.value=META.loadout.primary||'';
  pSel.onchange=()=>setLoadout('primary',pSel.value);
 }
 if(sSel){
  sSel.innerHTML='<option value="">— 不携带副武器 —</option>';
  for(const k of ownedWeaponList()){
   if(k===META.loadout.primary) continue;
   const o=document.createElement('option');
   o.value=k; o.textContent=itemName(k);
   o.selected=k===META.loadout.secondary;
   sSel.appendChild(o);
  }
  sSel.value=META.loadout.secondary||'';
  sSel.onchange=()=>setLoadout('secondary',sSel.value);
 }
 if(aSel){
  aSel.innerHTML='';
  for(const k of ownedArmorList()){
   const o=document.createElement('option');
   o.value=k; o.textContent=`${ARMOR_DEFS[k].name} · 售价 ${formatMoney(itemSellPrice(k))}`;
   o.selected=k===META.loadout.armor;
   aSel.appendChild(o);
  }
  aSel.value=META.loadout.armor||'';
  aSel.onchange=()=>setLoadout('armor',aSel.value);
 }
 const sum=el('loadoutSummary');
 if(sum){
  const p=META.loadout.primary?itemName(META.loadout.primary):'未装备';
  const s=META.loadout.secondary?itemName(META.loadout.secondary):'未装备';
  const a=META.loadout.armor?ARMOR_DEFS[META.loadout.armor].name:'未装备';
  sum.innerHTML=`<b>主武器:</b> ${p} · <b>副武器:</b> ${s} · <b>防弹衣:</b> ${a}`;
 }
 // 装备变了 → 刷新 ELO 装备估值维度读数 (00b_elo)
 if(typeof eloRenderUI==='function') eloRenderUI();
}
function renderArmory(tab){
 ARMORY_TAB=tab||'store';
 const walletEl=el('arWallet'), listEl=el('arList'), hintEl=el('arHint');
 if(!walletEl||!listEl) return;
 walletEl.textContent=`作战货币：${formatMoney(META.wallet)} · Lv.${META.level||1} · 经验 ${Math.floor(META.xp||0)}/${(typeof XP_PER_LEVEL!=='undefined'?XP_PER_LEVEL:1000)}`;
 document.querySelectorAll('[data-ar]').forEach(b=>b.classList.toggle('sel',b.dataset.ar===tab));
 let rows='';
 const addRow=(key,extra)=>{
  const kind=itemKind(key);
  const owned=ownedCount(key);
  const price=itemPrice(key), sell=itemSellPrice(key);
  const icon=typeof itemIconOf==='function'?itemIconOf(key):(kind==='armor'?'🛡':'🔫');
  const priceTxt=tab==='store'?`<span class="arPrice">${formatMoney(price)}</span>`:`<span class="arPrice">可售 ${formatMoney(sell)}</span>`;
  const action=tab==='store'
   ? `<button class="optBtn arBtn" data-key="${key}" data-action="buy">购买</button>`
   : tab==='warehouse'
   ? `<button class="optBtn arBtn" data-key="${key}" data-action="equip">装备</button><button class="optBtn arBtn" data-key="${key}" data-action="sell">出售</button>`
   : `<button class="optBtn arBtn" data-key="${key}" data-action="loot-keep">入库</button><button class="optBtn arBtn" data-key="${key}" data-action="loot-sell">出售</button>`;
  rows+=`<div class="arRow"><div class="arIcon">${icon}</div><div class="arBody"><div class="arName">${itemName(key)}</div><div class="arDesc">${itemDesc(key)}</div>${extra}</div>${priceTxt}${action}</div>`;
 };
 if(tab==='store'){
  for(const c of ITEM_CATALOG) addRow(c.key,ownedCount(c.key)?`<div class="arOwned">库存 ${ownedCount(c.key)}</div>`:'');
 } else if(tab==='market'){
  rows+=typeof renderMarketRows==='function'?renderMarketRows(tab):'';
 } else if(tab==='workbench'){
  rows+=typeof renderWorkbenchRows==='function'?renderWorkbenchRows():'';
 } else if(tab==='quests'){
  rows+=typeof renderQuestRows==='function'?renderQuestRows():'';
 } else if(tab==='warehouse'){
  for(const k of ownedWeaponList().concat(ownedArmorList())) addRow(k,`<div class="arOwned">库存 ${ownedCount(k)}</div>`);
 } else {
  const lootKeys=Object.keys(META.loot);
  if(lootKeys.length){
   for(const k of lootKeys) addRow(k,`<div class="arOwned">带出 ${META.loot[k]}</div>`);
   rows+=`<div class="arRow arLootActions"><button class="bigBtn" id="sellAllLoot">全部卖出 (${formatMoney(lootKeys.reduce((a,k)=>a+META.loot[k]*itemSellPrice(k),0))})</button></div>`;
  } else rows='<div class="arEmpty">尚未带出战利品。进入街区或秘密实验室搜索物资箱、搜刮敌人尸体，然后在地图上的撤离点完成撤离。</div>';
 }
 listEl.innerHTML=rows;
 if(hintEl){
  const hints={
   store:'商店出售武器与防弹衣；已拥有的可在仓库出售。',
   market:'市集交易食物 / 药品 / 杂物 / 背包 / 夜视仪 — 局内也能在物资箱与尸体上搜到同款。',
   workbench:'改枪工坊：换装配件按件收取货币改装费，改装在局外完成、整局生效。',
   quests:'完成任务获得经验与货币 · 每 1000 经验升 1 级 · 等级解锁市集商品 · 全部 '+(typeof QUEST_DEFS!=='undefined'?QUEST_DEFS.length:24)+' 个任务完成后市集解锁「撤离通行证」（瓦尔登禁区出境许可 · 持证撤离解锁结局）。标有地图名的任务只能在对应地图完成。',
   warehouse:'仓库中的物品可在部署界面自由装配。',
   loot:'战利品可在「市集」与商店目录中出售换取货币。'
  };
  hintEl.textContent=hints[tab]||'';
 }
 if(el('sellAllLoot')) el('sellAllLoot').onclick=sellAllLoot;
 if(tab==='workbench'&&typeof bindWorkbench==='function') bindWorkbench();
 // 购买/出售后同步部署界面的消耗品选择器
 if((tab==='market'||tab==='store'||tab==='loot')&&typeof buildDeployConsumables==='function') buildDeployConsumables();
}
let ARMORY_TAB='store';
function initArmoryUI(){
 document.querySelectorAll('[data-ar]').forEach(b=>b.onclick=()=>renderArmory(b.dataset.ar));
 renderArmory('store');
 refreshLoadoutSelects();
}
function openArmoryFromEnd(){
 document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden'));
 const menu=el('menu');
 if(menu) menu.classList.remove('hidden');
 const home=el('mHome'), armory=el('mArmory');
 if(home) home.classList.add('hidden');
 if(armory) armory.classList.remove('hidden');
 renderArmory('loot');
}
document.addEventListener('click',e=>{
 const b=e.target.closest?.('[data-action]');
 if(!b) return;
 const key=b.dataset.key, action=b.dataset.action;
 if(action==='buy') buyItem(key);
 else if(action==='sell') sellItem(key);
 else if(action==='equip'){
  const kind=itemKind(key);
  setLoadout(kind==='armor'?'armor':(key==='m1911'?'primary':'primary'),key);
  renderArmory('warehouse');
 }
 else if(action==='loot-sell') sellLoot(key);
 else if(action==='loot-keep') moveLootToOwned(key);
});
