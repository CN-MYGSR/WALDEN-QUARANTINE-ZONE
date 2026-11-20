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
 return d?`${d.mode} · 伤害 ${d.dmg} · 弹匣 ${d.mag} / 备弹 ${d.reserve}`:'';
}
function itemSellPrice(key){ return Math.max(1,Math.floor((ITEM_PRICES[key]||0)*0.45)); }
function itemPrice(key){ return ITEM_PRICES[key]||0; }
function metaLoadoutDefault(){ return { primary:'m1911', secondary:'', armor:'armor1', helmet:'helm1', headset:'hs_tep300', pack:'packSmall', chest:'', meds:['','',''], foods:['',''], nvg:'', pass:false }; }
function metaDefault(){
 return {
  seeded:true,
  seed2:true,
  wallet:2600,
  owned:{m1911:1,armor1:1,helm1:1,hs_tep300:1,packSmall:1,medkit:1,tourniquet:1,water:2,noodles:1,painkiller:1},
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
const SAFETY_WEAPON='m1911';        // 无枪时的保底武器
const SAFETY_WEAPON_MAG=2;          // 保底发放时附带弹匣数
const SAFETY_ARMOR='armor1';
const SAFETY_HELMET='helm1';
const SAFETY_HEADSET='hs_tep300';

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
function mergeRunLoot(){
 for(const k in RUN.loot) META.loot[k]=(META.loot[k]||0)+RUN.loot[k];
 RUN.loot={};
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
  pStats.textContent=scavP
   ?'拾荒者出击 · 主武器每局从二战兵器随机抽取，这里的仓库主武器不会带出'
   :(pd?`当前主武器：${pd.name} · 伤害 ${pd.dmg} · 弹匣 ${pd.mag} / 备弹 ${pd.reserve}`:'');
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
   +(_conf?'<div style="color:#e0b080;font-size:12px;margin-top:4px">⚠ 该耳机是耳罩式，和 Altyn 头盔冲突 —— 出击时不会生效，请改用 Peltor TEP-300 战术耳塞</div>':'');
   +(scav?'<div style="color:#d8b878;font-size:12px;margin-top:4px">拾荒者出击 · 主武器每局随机, 不带仓库主武器 / 无保险 / 阵亡不掉落仓库装备</div>':'');
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
  // 2026-09-19: 原来只列 武器 + 护甲, 头盔/耳机/背包买了也看不见
  // 2026-09-19: 补上夜视仪 —— 之前漏了, 三型夜视仪买了在仓库里根本看不见, 也就无法装备
  for(const k of ownedWeaponList().concat(ownedArmorList()).concat(ownedHelmetList()).concat(ownedHeadsetList()).concat(ownedPackList()).concat(ownedChestList()).concat(ownedNvgList()))
   addRow(k,`<div class="arOwned">库存 ${ownedCount(k)}</div>`);
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
  // ⚠️ 原来写死 kind==='armor'?'armor':'primary' —— 头盔/耳机/背包会被装成主武器
  const slot=(kind==='armor')?'armor'
   :(kind==='helmet')?'helmet'
   :(kind==='headset')?'headset'
   :(kind==='pack')?'pack'
   :(kind==='chest')?'chest'
   :(kind==='gear')?'nvg'
   :'primary';
  setLoadout(slot,key);
  renderArmory('warehouse');
 }
 else if(action==='loot-sell') sellLoot(key);
 else if(action==='loot-keep') moveLootToOwned(key);
});
