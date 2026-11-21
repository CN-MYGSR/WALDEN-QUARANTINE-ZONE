'use strict';
// ===================== 局外经济 / 军械库 / 仓库 =====================
// ===== 护具 (2026-09-19: 改用真实型号名) =====
// 护甲只保护 胸/腹 (见 38_tarkov.applyPlayerBodyDamage); 头盔只保护 头。
// 两者各自独立耐久, 打光后报废并提示。
// color 供玩家模型上色 (见 16_soldier 的 buildSoldierMesh): 护甲颜色 = 躯干颜色
// level 决定加多少护甲几何 (1-2 只前板 / 3-4 加背板与肩带 / 5-6 加肩垫与裆片)
const ARMOR_DEFS={
 armor1:{name:'PACA 软质护甲',level:1,hp:12,resist:0.05,weight:1.0,price:320,color:0x33362c},
 armor2:{name:'6B23-1 防弹背心',level:2,hp:22,resist:0.10,weight:1.8,price:720,color:0x3a382c},
 armor3:{name:'MF-UNTAR 防弹背心',level:3,hp:34,resist:0.14,weight:2.7,price:1250,color:0x333c47},
 armor4:{name:'6B13 突击护甲',level:4,hp:46,resist:0.18,weight:3.6,price:2100,color:0x3c4232},
 armor5:{name:'Hexatac HPC 插板背心',level:5,hp:60,resist:0.22,weight:5.0,price:3200,color:0x1f1f1f},
 armor6:{name:'6B43 屏障-Sh 防弹衣',level:6,hp:76,resist:0.26,weight:6.5,price:4800,color:0x2a2f28}
};
// 插板: 护甲本身只有凯夫拉, 必须插板才有等级防护
// level  = 插板防护等级(1-4); breakMul = 被子弹削级的倍率(陶瓷碎得快)
const PLATE_DEFS={
 plate_steel:{name:'钢板', level:3, durability:180, breakMul:1.0, weight:4.2, price:650, size:2, desc:'3 级 · 高耐久 · 重量大'},
 plate_ti:{name:'钛板', level:3, durability:125, breakMul:1.0, weight:2.6, price:950, size:2, desc:'3 级 · 重量轻 · 价格高'},
 plate_ceramic:{name:'陶瓷板', level:4, durability:95, breakMul:1.3, weight:3.0, price:1300, size:2, desc:'4 级 · 防护最高 · 碎得最快'}
};
// 没穿护甲时玩家躯干用的颜色 (2026-09-19 需求: 「没有护具则为游骑兵黄」)
const RANGER_YELLOW=0xc8a03c;
const HELMET_DEFS={
 helm1:{name:'SSh-68 钢盔',level:1,hp:15,resist:0.08,weight:1.1,price:380,faceShield:true},
 helm2:{name:'PSh-97 头盔',level:2,hp:26,resist:0.12,weight:1.7,price:820,faceShield:true},
 helm3:{name:'6B47 头盔',level:3,hp:40,resist:0.16,weight:2.3,price:1450,faceShield:true},
 helm4:{name:'FAST MT 头盔',level:4,hp:54,resist:0.20,weight:2.9,price:2500,faceShield:true},
 helm5:{name:'Team Wendy EXFIL 头盔',level:5,hp:70,resist:0.25,weight:3.5,price:3900,faceShield:true},
 helm6:{name:'Altyn 防弹头盔 + Maska 1Sch 面罩',level:6,hp:90,resist:0.32,weight:4.8,price:6000,faceShield:true}
};
// ===== 耳机 (2026-09-19) =====
// range   = 听力范围(米): 能听到敌人脚步的最大距离 (不戴耳机 = 40m)
// amp     = 脚步 / 开火声放大倍数
// ambient = 环境音(风/雨/鸟/远处机枪)保留比例, 越小越安静
// earMuff = true 表示耳罩式 —— 与 Altyn(helm6) 冲突, 戴不了
const HEADSET_DEFS={
 hs_comtac6:{name:'Peltor ComTac VI 耳机',color:'黑色',level:3,range:67,amp:1.45,ambient:0.42,weight:0.6,price:4200,earMuff:true},
 hs_razor:{name:"Walker's Razor 数字耳机",color:'橄榄绿',level:2,range:59,amp:1.25,ambient:0.58,weight:0.5,price:2400,earMuff:true},
 hs_tep300:{name:'Peltor TEP-300 战术耳塞',color:'狼棕色',level:2,range:54,amp:1.15,ambient:0.72,weight:0.2,price:1800,earMuff:false}
};
const ITEM_CATALOG=[
 ...Object.keys(WPN_DEFS).map(k=>({key:k,kind:'weapon'})),
 ...Object.keys(ARMOR_DEFS).map(k=>({key:k,kind:'armor'})),
 ...Object.keys(HELMET_DEFS).map(k=>({key:k,kind:'helmet'})),
 ...Object.keys(HEADSET_DEFS).map(k=>({key:k,kind:'headset'}))
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
for(const c of ITEM_CATALOG) ITEM_PRICES[c.key]=c.kind==='weapon'?weaponPrice(c.key):(c.kind==='helmet'?HELMET_DEFS[c.key].price:(c.kind==='headset'?HEADSET_DEFS[c.key].price:ARMOR_DEFS[c.key].price));
function itemName(key){ return WPN_DEFS[key]?WPN_DEFS[key].name:(ARMOR_DEFS[key]?ARMOR_DEFS[key].name:(HELMET_DEFS[key]?HELMET_DEFS[key].name:'未知物品')); }
function itemKind(key){ return WPN_DEFS[key]?'weapon':(HELMET_DEFS[key]?'helmet':'armor'); }
function itemDesc(key){
 if(HELMET_DEFS[key]){
  const h=HELMET_DEFS[key];
  return `头盔 Lv${h.level} · 护头耐久 ${h.hp} · 减伤 ${Math.round(h.resist*100)}% · 重量 ${h.weight}`;
 }
 if(ARMOR_DEFS[key]){
  const a=ARMOR_DEFS[key];
  return `护甲 Lv${a.level} · 胸腹耐久 ${a.hp} · 减伤 ${Math.round(a.resist*100)}% · 重量 ${a.weight}`;
 }
 const d=WPN_DEFS[key];
 return d?`${d.mode} · 伤害 ${d.dmg} · 弹匣容量 ${d.mag} 发`:'';
}
function itemSellPrice(key){ return Math.max(1,Math.floor((ITEM_PRICES[key]||0)*0.45)); }
function itemPrice(key){ return ITEM_PRICES[key]||0; }
function metaLoadoutDefault(){ return { primary:'m1911', secondary:'', armor:'armor1', helmet:'helm1', headset:'hs_tep300', pack:'packSmall', chest:'', meds:['','',''], foods:['',''], ammo:null, nvg:'', pass:false }; }
const SAFETY_WEAPON='m1911';
const XP_PER_LEVEL=1000;
function metaDefault(){
 return {
  seeded:true,
  seed2:true,
  ammoFamilies:true,
  wallet:2600,
  owned:{m1911:1,armor1:1,helm1:1,hs_tep300:1,packSmall:1,medkit:1,tourniquet:1,water:2,noodles:1,painkiller:1,ammo_std:1,ammo_pistol_std:1},
  loot:{},
  insurance:[],
  xp:0,
  level:1,
  questProg:{},
  questDone:{},
  prestige:0,
  stats:{kills:0,deaths:0},
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
 if(!m.stats||typeof m.stats!=='object') m.stats={};
 for(const k of ['kills','deaths']) if(!Number.isSafeInteger(m.stats[k])||m.stats[k]<0) m.stats[k]=0;
 // 任务系统迁移: 等级/任务进度/重生次数
 if(typeof m.level!=='number'||m.level<1) m.level=1;
 if(m.xp>=XP_PER_LEVEL){ m.level+=Math.floor(m.xp/XP_PER_LEVEL); m.xp%=XP_PER_LEVEL; }
 if(!m.questProg||typeof m.questProg!=='object') m.questProg={};
 if(!m.questDone||typeof m.questDone!=='object'||Array.isArray(m.questDone)) m.questDone={};
 if(typeof m.prestige!=='number'||m.prestige<0) m.prestige=0;
 // ELO 动态难度评分 (老存档没有该字段 → 用初始值)
 if(!m.elo||typeof m.elo!=='object') m.elo={rating:ELO_START,peak:ELO_START,raids:0,auto:true};
 if(!m.loadout||typeof m.loadout!=='object') m.loadout=metaLoadoutDefault();
 if(!m.loadout.pack) m.loadout.pack='packSmall';
 if(!m.ammoFamilies){
  const weapons=[m.loadout.primary,m.loadout.secondary].filter(k=>WPN_DEFS[k]);
  if(weapons.length&&weapons.every(k=>ammoCaliberOf(k)==='pistol')){
   const legacy=['ammo_rip','ammo_std','ammo_m855','ammo_m995','ammo_ap'];
   for(const k of legacy){
    const next=k.replace('ammo_','ammo_pistol_');
    for(const stock of [m.owned,m.loot]) if(stock[k]>0){
     stock[next]=(stock[next]||0)+stock[k]; delete stock[k];
    }
    if(Array.isArray(m.loadout.ammo)) m.loadout.ammo=m.loadout.ammo.map(v=>v===k?next:v);
   }
  }
  for(const k of ['ammo_std','ammo_pistol_std']) if(!(m.owned[k]>0||m.loot[k]>0)) m.owned[k]=1;
  if(m.loadout.ammo?.length&&Array.isArray(m.loadout.ammo)&&m.loadout.ammo.every(k=>!k)) m.loadout.ammo=null;
  m.ammoFamilies=true;
 }
 if(!Array.isArray(m.loadout.ammo)) m.loadout.ammo=null;
 // 已删除武器的存档回退 (2026-09-13 移除火箭筒/反坦克枪): 装备了不存在武器时退回保底手枪
 // 注意: 此处只能用 13_weapons_data 的 WPN_DEFS; PACK_DEFS 定义在 38_tarkov, 本文件加载时还在 TDZ, 不可访问
 if(m.loadout.primary&&!WPN_DEFS[m.loadout.primary]) m.loadout.primary=SAFETY_WEAPON;
 if(m.loadout.secondary&&!WPN_DEFS[m.loadout.secondary]) m.loadout.secondary='';
 if(!Array.isArray(m.loadout.meds)) m.loadout.meds=['','',''];
 while(m.loadout.meds.length<3) m.loadout.meds.push('');
 if(!Array.isArray(m.loadout.foods)) m.loadout.foods=['',''];
 while(m.loadout.foods.length<2) m.loadout.foods.push('');
 // 撤离通行证: 装备槽里的随身物品 (老存档没有 → false)
 if(typeof m.loadout.pass!=='boolean') m.loadout.pass=false;
 // ⚠️ 夜视仪型号归一化必须**无条件**做, 不能只写在下面的 !seeded 块里 ——
 //    老档的 m.seeded 早就是 true, 于是 loadout.nvg 会残留布尔 true / undefined,
 //    而 applyDeployLoadout 只认字符串 → 明明拥有夜视仪也带不出去 (用户实测)。
 if(m.loadout.nvg===true) m.loadout.nvg='nvg';
 if(typeof m.loadout.nvg!=='string') m.loadout.nvg='';
 if(!m.seeded){
  if(!m.owned.m1911) m.owned.m1911=(m.owned.m1911||0)+1;
  if(!m.owned.armor1) m.owned.armor1=(m.owned.armor1||0)+1;
 if(!m.owned.helm1) m.owned.helm1=(m.owned.helm1||0)+1;   // 头盔系统迁移: 老档补一顶一级盔
 if(!m.loadout||typeof m.loadout!=='object') m.loadout=metaLoadoutDefault();
 if(m.loadout.helmet===undefined) m.loadout.helmet='helm1';
 if(!m.owned.hs_tep300) m.owned.hs_tep300=(m.owned.hs_tep300||0)+1;   // 耳机系统迁移: 老档补一副耳塞
 if(m.loadout.headset===undefined) m.loadout.headset='hs_tep300';
 if(m.loadout.chest===undefined) m.loadout.chest='';   // 胸挂: 老档默认不戴
 // 夜视仪: 老档是布尔 → 迁移成型号键 (true 视为带 PVS-14)
 if(m.loadout.nvg===true) m.loadout.nvg='nvg';
 else if(m.loadout.nvg===false||m.loadout.nvg===undefined||!m.loadout.nvg) m.loadout.nvg='';
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
const RUN={kills:0,searches:0,loot:{},extracting:false,failComp:0,autoKit:null,lostGear:null,returnedGear:null,passBrought:false,nvgBrought:false,nvgKey:''};

// ===================== 失败补偿 / 保底 =====================
// 目的: 撤离失败(阵亡)后给予固定补贴, 并确保玩家任何时候都不会"赤手空拳"进场。
// 设计: 失败补偿 500 是净收入, 不依赖战利品带回; 同时兜底发放一把最廉价手枪,
//       避免玩家卖光装备后陷入"无武器 → 打不过 → 更没钱"的死亡螺旋。
const FAIL_COMPENSATION=500;        // 单局失败固定补贴
const SAFETY_ARMOR='armor1';
const SAFETY_HELMET='helm1';
const SAFETY_HEADSET='hs_tep300';

// 玩家是否处于"无任何武器"状态
function hasAnyWeapon(){ return ownedWeaponList().length>0; }
// 确保至少有一把武器(及一件护甲), 返回是否发生了补发
function ensureSafetyKit(reason){
 const granted=[];
 if(!hasAnyWeapon()){
   addOwned(SAFETY_WEAPON,1);
   granted.push(SAFETY_WEAPON);
   if(!META.loadout.primary||!ownedCount(META.loadout.primary)) META.loadout.primary=SAFETY_WEAPON;
   const box='ammo_pistol_std';
   if(!(ownedCount(box)>0||META.loot[box]>0)) addOwned(box,1);
   if(Array.isArray(META.loadout.ammo)&&!META.loadout.ammo.includes(box)) META.loadout.ammo.unshift(box);
 }
 if(!ownedArmorList().length){
   addOwned(SAFETY_ARMOR,1);
   granted.push(SAFETY_ARMOR);
   if(!META.loadout.armor||!ownedCount(META.loadout.armor)) META.loadout.armor=SAFETY_ARMOR;
 }
 if(!ownedHelmetList().length){
   addOwned(SAFETY_HELMET,1);
   granted.push(SAFETY_HELMET);
   if(!META.loadout.helmet||!ownedCount(META.loadout.helmet)) META.loadout.helmet=SAFETY_HELMET;
 }
 if(!ownedHeadsetList().length){
   addOwned(SAFETY_HEADSET,1);
   granted.push(SAFETY_HEADSET);
   if(!META.loadout.headset||!ownedCount(META.loadout.headset)) META.loadout.headset=SAFETY_HEADSET;
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
 const armors=Object.keys(ARMOR_DEFS).concat(Object.keys(HELMET_DEFS)).concat(Object.keys(HEADSET_DEFS));
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
function extractedLoot(){
 const loot={...RUN.loot};
 for(const k of RUN.secure||[]) loot[k]=(loot[k]||0)+1;
 return loot;
}
function mergeRunLoot(loot=extractedLoot()){
 for(const k in loot) META.loot[k]=(META.loot[k]||0)+loot[k];
 RUN.loot={};
 RUN.secure=[];
 saveMeta();
}
function formatMoney(n){ return Number(n||0).toLocaleString('zh-CN'); }
function ownedWeaponList(){ return Object.keys(META.owned).filter(k=>WPN_DEFS[k]&&META.owned[k]>0); }
function ownedArmorList(){ return Object.keys(META.owned).filter(k=>ARMOR_DEFS[k]&&META.owned[k]>0); }
function ownedPlateList(){ return Object.keys(META.owned).filter(k=>PLATE_DEFS[k]&&META.owned[k]>0); }
function ownedHelmetList(){ return Object.keys(META.owned).filter(k=>HELMET_DEFS[k]&&META.owned[k]>0); }
function ownedHeadsetList(){ return Object.keys(META.owned).filter(k=>HEADSET_DEFS[k]&&META.owned[k]>0); }
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
 if(META.loadout.helmet===key&&ownedCount(key)<=0) META.loadout.helmet=ownedHelmetList()[0]||'helm1';
 if(META.loadout.headset===key&&ownedCount(key)<=0) META.loadout.headset=ownedHeadsetList()[0]||'';
 if(META.loadout.chest===key&&ownedCount(key)<=0) META.loadout.chest=ownedChestList()[0]||'';
 if(META.loadout.pack===key&&ownedCount(key)<=0) META.loadout.pack=ownedPackList()[0]||'packSmall';
 if(META.loadout.nvg===key&&ownedCount(key)<=0) META.loadout.nvg='';
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
// 可选槽位允许置空 (下拉里的「不携带 / 不佩戴」), 否则选了完全没反应
const OPTIONAL_LOADOUT_SLOTS=['secondary','headset','chest','nvg','pass','plate'];
function setLoadout(slot,key){
 if(!key&&OPTIONAL_LOADOUT_SLOTS.indexOf(slot)<0) return;
 META.loadout[slot]=key;
 saveMeta();
 refreshLoadoutSelects();
 if(['primary','secondary','chest'].includes(slot)&&typeof renderDeployAmmo==='function'){
  renderDeployAmmo(); updateConsumSummary();
 }
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
 // 主武器下拉下方的说明行 (#arsenalStats): 29_menus 的军械库逻辑按 PLAYER_ARSENAL_KEY 写它,
 // 而本函数按 META.loadout.primary 重建同一个下拉 —— 两者不一致时这行会显示一把你根本不带的枪。
 // SCAV 拾荒者(主武器每局随机)下尤其误导, 所以一并在这里收口。
 const pStats=el('arsenalStats');
 if(pStats){
  const scavP=!!(typeof TEAM_FACTION!=='undefined'&&TEAM_FACTION[player.team]&&TEAM_FACTION[player.team].scav);
  const pd=WPN_DEFS[META.loadout.primary];
  const scavKey=scavP&&RUN.scavLoadout&&RUN.scavLoadout.primary;
  pStats.textContent=scavP
   ?(scavKey?'本局配发 '+itemName(scavKey)+' · '+AMMO_CAL_NAME[ammoCaliberOf(scavKey)]:'拾荒者入场时配发二战武器')
   :(pd?`伤害 ${pd.dmg} · 弹匣容量 ${pd.mag} 发`:'');
 }
 if(sSel){
  sSel.innerHTML='<option value="">— 不携带副武器 —</option>';
  const primary=RUN.scavLoadout?RUN.scavLoadout.primary:META.loadout.primary;
  for(const k of ownedWeaponList()){
   if(k===primary) continue;
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
 // 插板: 护甲只有凯夫拉, 必须选一块板才有等级防护
 const plSel=el('plateSelect');
 if(plSel){
  if(!META.loadout.plate||!PLATE_DEFS[META.loadout.plate]||ownedCount(META.loadout.plate)<=0) META.loadout.plate='';
  plSel.innerHTML='';
  const _noPlate=document.createElement('option');
  _noPlate.value=''; _noPlate.textContent='— 无插板（凯夫拉 · 防护较差）—';
  plSel.appendChild(_noPlate);
  for(const k of ownedPlateList()){
   const d=PLATE_DEFS[k];
   const o=document.createElement('option');
   o.value=k;
   o.textContent=`${d.name} · ${d.level}级 · 占 ${d.size} 格 · ¥${formatMoney(itemSellPrice(k))}`;
   o.selected=k===META.loadout.plate;
   plSel.appendChild(o);
  }
  plSel.value=META.loadout.plate||'';
  plSel.onchange=()=>{ META.loadout.plate=plSel.value; saveMeta(); refreshLoadoutSelects(); };
 }
 const hSel=el('helmetSelect');
 if(hSel){
  hSel.innerHTML='';
  for(const k of ownedHelmetList()){
   const o=document.createElement('option');
   o.value=k; o.textContent=`${HELMET_DEFS[k].name} · 售价 ${formatMoney(itemSellPrice(k))}`;
   o.selected=k===META.loadout.helmet;
   hSel.appendChild(o);
  }
  hSel.value=META.loadout.helmet||'';
  hSel.onchange=()=>setLoadout('helmet',hSel.value);
 }
 // 面罩: 只有带面罩的头盔可用; 展开后禁夜视
 const fChk=el('faceShieldChk');
 if(fChk){
  const hd=HELMET_DEFS[META.loadout.helmet];
  const can=!!(hd&&hd.faceShield);
  const nvgSel=!!META.loadout.nvg;
  // 面罩与夜视仪二选一: 已选夜视则面罩强制收起/禁用
  if(nvgSel&&META.loadout.faceShield){ META.loadout.faceShield=false; saveMeta(); }
  if(!can&&META.loadout.faceShield){ META.loadout.faceShield=false; saveMeta(); }
  fChk.disabled=!can||nvgSel;
  fChk.checked=can&&!nvgSel&&!!META.loadout.faceShield;
  fChk.title=!can?'当前头盔没有面罩':(nvgSel?'本局已选择夜视仪，不能同时戴面罩':'展开后提升头部防弹');
  fChk.onchange=()=>{ META.loadout.faceShield=can&&!nvgSel&&fChk.checked; if(META.loadout.faceShield) META.loadout.nvg=''; saveMeta(); refreshLoadoutSelects(); };
 }
 const eSel=el('headsetSelect');
 if(eSel){
  eSel.innerHTML='';
  const _noHeadset=document.createElement('option');
  _noHeadset.value=''; _noHeadset.textContent='— 不佩戴耳机 —';
  eSel.appendChild(_noHeadset);
  for(const k of ownedHeadsetList()){
   const d=HEADSET_DEFS[k];
   const o=document.createElement('option');
   o.value=k;
   // 耳罩式与 Altyn 冲突: 标注并禁用 (TEP-300 是入耳式, 不受影响)
   const bad=!!(d.earMuff&&META.loadout.helmet==='helm6');
   o.textContent=d.name+' '+d.color+' · 听力 '+d.range+'m'+(bad?'（与 Altyn 冲突）':'');
   o.disabled=bad;
   o.selected=k===META.loadout.headset;
   eSel.appendChild(o);
  }
  if(!META.loadout.headset) eSel.value='';
  eSel.onchange=()=>setLoadout('headset',eSel.value);
 }
 const cSel=el('chestSelect');
 if(cSel){
  cSel.innerHTML='';
  const _noChest=document.createElement('option');
  _noChest.value=''; _noChest.textContent='— 不佩戴胸挂 —';
  cSel.appendChild(_noChest);
  for(const k of ownedChestList()){
   const d=CHEST_DEFS[k];
   const o=document.createElement('option');
   o.value=k;
   o.textContent=d.name+' · '+d.slots+' 格（只收 ≤2 格物品）';
   o.selected=k===META.loadout.chest;
   cSel.appendChild(o);
  }
  if(!META.loadout.chest) cSel.value='';
  cSel.onchange=()=>setLoadout('chest',cSel.value);
 }
 const nSel=el('nvgSelect');
 if(nSel){
  nSel.innerHTML='';
  const _noNvg=document.createElement('option');
  _noNvg.value=''; _noNvg.textContent='— 不携带夜视仪 —';
  nSel.appendChild(_noNvg);
  for(const k of ownedNvgList()){
   const d=NVG_DEFS[k];
   const o=document.createElement('option');
   o.value=k;
   o.textContent=d.name+' · 视野 '+d.fov+'° · ISO ×'+d.gain+(d.thermal?' · 热成像':'');
   o.selected=k===META.loadout.nvg;
   nSel.appendChild(o);
  }
  if(!META.loadout.nvg) nSel.value='';
  nSel.onchange=()=>{ if(nSel.value){ META.loadout.faceShield=false; } setLoadout('nvg',nSel.value); };
  const _faceDown=!!(META.loadout.faceShield&&HELMET_DEFS[META.loadout.helmet]&&HELMET_DEFS[META.loadout.helmet].faceShield);
  if(_faceDown){
   nSel.disabled=true; nSel.title='面罩展开时不能使用夜视仪';
   if(META.loadout.nvg){ META.loadout.nvg=''; saveMeta(); nSel.value=''; }
  } else { nSel.disabled=false; nSel.title=''; }
 }
 const sum=el('loadoutSummary');
 if(sum){
  // SCAV 拾荒者阵营: 主武器由出击时随机决定, 仓库里选的那把不会带出去 (见 38_tarkov.ensureScavLoadout)
  const scav=!!(typeof TEAM_FACTION!=='undefined'&&TEAM_FACTION[player.team]&&TEAM_FACTION[player.team].scav);
  const p=scav?'随机二战兵器 (出击时抽取)':(META.loadout.primary?itemName(META.loadout.primary):'未装备');
  const s=META.loadout.secondary?itemName(META.loadout.secondary):'未装备';
  const a=(META.loadout.armor&&ARMOR_DEFS[META.loadout.armor])?ARMOR_DEFS[META.loadout.armor].name:'未装备';
  const h=(META.loadout.helmet&&HELMET_DEFS[META.loadout.helmet])?HELMET_DEFS[META.loadout.helmet].name:'未装备';
  const _hs=HEADSET_DEFS[META.loadout.headset];
  const hs=_hs?(_hs.name+' '+_hs.color):'未装备';
  const _ch=(typeof CHEST_DEFS!=='undefined')?CHEST_DEFS[META.loadout.chest]:null;
  const ch=_ch?(_ch.name+' · '+_ch.slots+'格'):'未装备';
  const _nv=(typeof NVG_DEFS!=='undefined')?NVG_DEFS[META.loadout.nvg]:null;
  const nv=_nv?_nv.name:'未携带';
  const _pl=PLATE_DEFS[META.loadout.plate];
  const pl=_pl?(_pl.name+' Lv'+_pl.level):'无插板（凯夫拉）';
  const fs=(META.loadout.faceShield&&HELMET_DEFS[META.loadout.helmet]&&HELMET_DEFS[META.loadout.helmet].faceShield)?'展开（禁夜视）':'收起';
  const _conf=(_hs&&_hs.earMuff&&META.loadout.helmet==='helm6');
  sum.innerHTML=`<b>主武器:</b> ${p} · <b>副武器:</b> ${s} · <b>防弹衣:</b> ${a} · <b>插板:</b> ${pl} · <b>头盔:</b> ${h} · <b>面罩:</b> ${fs} · <b>耳机:</b> ${hs}`
   +` · <b>胸挂:</b> ${ch} · <b>夜视:</b> ${nv}`
   +(_conf?'<div style="color:#e0b080;font-size:12px;margin-top:4px">⚠ 该耳机是耳罩式，和 Altyn 头盔冲突 —— 出击时不会生效，请改用 Peltor TEP-300 战术耳塞</div>':'')
   +(scav?'<div style="color:#d8b878;font-size:12px;margin-top:4px">拾荒者出击 · 主武器每局随机, 不带仓库主武器 / 无保险 / 阵亡不掉落仓库装备</div>':'');
 }
 // 装备变了 → 刷新 ELO 装备估值维度读数 (00b_elo)
 if(typeof eloRenderUI==='function') eloRenderUI();
}
function armorySection(tab){
 return tab==='loot'?'warehouse':tab==='market'?'store':tab;
}
function armoryCategory(key){
 const kind=itemKind(key);
 if(['armor','helmet','headset','plate','gear'].includes(kind)) return 'protection';
 if(kind==='pack'||kind==='chest') return 'carry';
 return kind;
}
function renderStoreCatalog(tab){
 const supplies=tab==='market'?TRADE_KEYS:[...TRADE_KEYS,...ITEM_CATALOG.map(c=>c.key)];
 const calibers=[META.loadout.primary,META.loadout.secondary].filter(k=>WPN_DEFS[k]).map(ammoCaliberOf);
 const quick=calibers.map(ammoKeyOfCaliber);
 const catalog=[...new Set([...quick,...supplies])];
 return catalog.filter(k=>k!=='pass'||questsAllDone()).map(k=>{
  const locked=buyGateMsg(k), price=itemPrice(k), owned=ownedCount(k);
  const why=locked?'Lv.'+tradeLockLevel(k)+' 解锁':META.wallet<price?'余额不足':'购买';
  const cls=armoryCategory(k), fits=AMMO_DEFS[k]&&calibers.includes(AMMO_DEFS[k].cal);
  return '<div class="arRow arProduct" data-category="'+cls+'" data-product="'+k+'"><div class="arBody">'
   +'<div class="arName">'+itemLabel(k)+'</div><div class="arDesc">'+itemDesc(k)+'</div>'
   +'<div class="arOwned">库存 '+owned+(fits?' · 当前配装适用':'')+'</div></div>'
   +'<span class="arPrice">¥'+formatMoney(price)+'</span><div class="arTradeButtons"><button type="button" class="optBtn arBtn" data-key="'+k+'" data-action="buy" aria-label="'+why+' '+itemLabel(k)+'" '+(locked||META.wallet<price?'disabled':'')+'>'+why+'</button>'
   +(tab==='market'&&owned?'<button class="optBtn arBtn" type="button" data-key="'+k+'" data-action="sell">卖出 ¥'+formatMoney(itemSellPrice(k))+'</button>':'')+'</div></div>';
 }).join('');
}
let ARMORY_TAB='warehouse', armoryGridMode=false;
function renderArmory(tab='warehouse'){
 const section=armorySection(tab), current=armorySection(ARMORY_TAB);
 const list=el('arList');
 if(!list) return;
 const scroll=tab===ARMORY_TAB?list.scrollTop:0;
 if(section!==current){ el('arSearch').value=''; el('arCategory').value=''; }
 ARMORY_TAB=tab;
 el('arWallet').textContent='余额 ¥'+formatMoney(META.wallet)+' · Lv.'+(META.level||1);
 const map=CAMPAIGNS[selectedRaidMap];
 const field=map&&!map.storyOnly&&!map.rangeOnly?map:CAMPAIGNS.find(c=>!c.storyOnly&&!c.rangeOnly);
 el('arCheckoutBtn').textContent=field?'前往'+(field.mapName||field.title)+'配装':'前往配装';
 el('arCarry').textContent=[META.loadout.primary,META.loadout.secondary].filter(k=>WPN_DEFS[k]).map(itemName).join(' / ')||'未配备武器';
 el('arDepartments').querySelectorAll('[data-ar]').forEach(b=>{
  const on=b.dataset.ar===section;
  b.classList.toggle('sel',on); b.setAttribute('aria-pressed',String(on));
 });
 el('arToolbar').querySelectorAll('[data-ar],[data-stock]').forEach(b=>{
  const on=(b.dataset.ar||b.dataset.stock)===tab;
  b.classList.toggle('sel',on); b.setAttribute('aria-pressed',String(on));
 });
 el('arStockViews').hidden=section!=='warehouse';
 el('arShopViews').hidden=section!=='store';
 el('arCategory').hidden=section!=='warehouse'&&section!=='store';
 el('arLayoutBtn').hidden=section!=='warehouse';
 el('arFilters').hidden=section==='workbench';
 el('arLayoutBtn').textContent=armoryGridMode?'返回清单':'整理格位';
 el('arLayoutBtn').setAttribute('aria-pressed',String(armoryGridMode));
 list.dataset.section=section;
 if(section==='warehouse') renderArmoryGrid(tab);
 else if(section==='store') list.innerHTML=renderStoreCatalog(tab);
 else if(section==='workbench'){ list.innerHTML=renderWorkbenchRows(); bindWorkbench(); }
 else if(section==='quests') list.innerHTML=renderQuestRows();
 shopApplyFilter();
 list.scrollTop=scroll;
 if((section==='store'||section==='warehouse')&&typeof buildDeployConsumables==='function') buildDeployConsumables();
}
function initArmoryUI(){
 el('mArmory').querySelectorAll('[data-ar],[data-stock]').forEach(b=>b.onclick=()=>renderArmory(b.dataset.ar||b.dataset.stock));
 el('arLayoutBtn').onclick=()=>{ armoryGridMode=!armoryGridMode; renderArmory(ARMORY_TAB); };
 el('arCheckoutBtn').onclick=()=>{
  const map=CAMPAIGNS[selectedRaidMap];
  selectMapAndDeploy(map&&!map.storyOnly&&!map.rangeOnly?selectedRaidMap:CAMPAIGNS.findIndex(c=>!c.storyOnly&&!c.rangeOnly));
 };
 renderArmory('warehouse');
 refreshLoadoutSelects();
}
function openArmoryFromEnd(){
 document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden'));
 const menu=el('menu');
 if(menu) menu.classList.remove('hidden');
 showMenuPanel('mArmory','loot');
}
document.addEventListener('click',e=>{
 const b=e.target.closest?.('[data-action]');
 if(!b) return;
 const key=b.dataset.key, action=b.dataset.action;
 const restore=document.activeElement===b&&!!b.closest('#arList');
 if(action==='buy') buyItem(key);
 else if(action==='sell') sellItem(key);
 else if(action==='equip'||action==='equip-side'){
  if(!ownedCount(key)) return;
  const slots={weapon:'primary',armor:'armor',helmet:'helmet',headset:'headset',pack:'pack',chest:'chest',gear:'nvg',plate:'plate'};
  const slot=action==='equip-side'?'secondary':slots[itemKind(key)];
  if(!slot) return;
  const L=META.loadout;
  if(slot==='secondary'&&L.primary===key) return;
  if(slot==='primary'&&L.secondary===key) L.secondary=L.primary&&ownedCount(L.primary)?L.primary:'';
  if(slot==='nvg') L.faceShield=false;
  setLoadout(slot,key);
  renderArmory('warehouse');
 }
 else if(action==='workbench'){ WORKBENCH_KEY=key; renderArmory('workbench'); el('wbWeapon')?.focus(); }
 else if(action==='find-supply'){
  renderArmory('store');
  const weapon=WPN_DEFS[key], search=el('arSearch');
  el('arCategory').value=weapon?'ammo':armoryCategory(key);
  search.value=weapon?AMMO_CAL_NAME[ammoCaliberOf(key)]:itemLabel(key);
  shopApplyFilter(); search.focus(); search.select(); return;
 }
 else if(action==='loot-sell') sellLoot(key);
 else if(action==='loot-keep') moveLootToOwned(key);
 if(restore&&!b.isConnected&&action!=='workbench'){
  const target=el('arList').querySelector('[data-action="'+action+'"][data-key="'+CSS.escape(key)+'"]:enabled')
    ||el('arList').querySelector('.invTile.sel, .arProduct:not([hidden]) button:enabled');
  (target||el('arSearch')).focus({preventScroll:true});
 }
});
