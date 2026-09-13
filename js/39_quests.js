'use strict';
// ===================== 任务 / 经验 / 等级 / 通行证 / 重生 =====================
// 存档字段(见 37_meta normalizeMeta): META.level, META.xp, META.questProg{id:n},
// META.questDone{id:true}, META.prestige
// 循环: 做任务得经验+货币 → 每 1000 经验升 1 级(经验归零) → 等级解锁市集商品
// → 20 个任务全部完成后市集解锁「撤离通行证」 → 持证到撤离点撤离
// → 结算画面可重生: 从零开始, 任务更难, 敌方 NPC 更强, 己方 NPC 更弱
const XP_PER_LEVEL=1000;
const KILL_XP=60;               // 击杀基础经验(任务外的持续经验来源)
const XP_HEAD_BONUS=40;         // 爆头额外经验
const XP_LONG_RANGE_BONUS=0.8;  // 远距离加成: >50m 后每米 +0.8 (上限 +60)
const XP_LONG_RANGE_CAP=60;
const PASS_KEY='pass';

// ---------- 任务表: use 使用 / buy 购买 / kill 击杀 / search 搜刮 / rare 带出 / extract 撤离 ----------
// key=指定物品; cat=物品类别(weapon/armor/med/food/misc/pack); map=仅限该地图(可选)
const QUEST_DEFS=[
 // ---- 使用道具 (7) ----
 {id:'u_tourni', type:'use', key:'tourniquet', n:1, xp:60,  money:600,  name:'战场急救', desc:'使用 1 次止血带'},
 {id:'u_water',  type:'use', key:'water',      n:2, xp:50,  money:400,  name:'补充水分', desc:'饮用 2 次矿泉水'},
 {id:'u_pain',   type:'use', key:'painkiller', n:1, xp:70,  money:700,  name:'镇痛作战', desc:'使用 1 次止痛药'},
 {id:'u_food',   type:'use', cat:'food',       n:3, xp:80,  money:600,  name:'战地口粮', desc:'食用任意 3 次食物'},
 {id:'u_medkit', type:'use', key:'medkit',     n:2, xp:100, money:1000, name:'自救训练', desc:'使用 2 次医疗包'},
 {id:'u_morph',  type:'use', key:'morphine',   n:1, xp:130, money:1200, name:'强效镇痛', desc:'使用 1 次吗啡'},
 {id:'u_cms',    type:'use', key:'cms',        n:1, xp:150, money:1800, name:'战地手术', desc:'使用 1 次手术包'},
 // ---- 购买道具 (7) ----
 {id:'b_food',   type:'buy', cat:'food',       n:3, xp:60,  money:400,  name:'储备口粮', desc:'购买任意 3 件食物'},
 {id:'b_pain',   type:'buy', key:'painkiller', n:2, xp:70,  money:500,  name:'药品采购', desc:'购买 2 个止痛药'},
 {id:'b_medkit', type:'buy', key:'medkit',     n:1, xp:80,  money:500,  name:'医疗储备', desc:'购买 1 个医疗包'},
 {id:'b_misc',   type:'buy', cat:'misc',       n:2, xp:90,  money:700,  name:'黑市生意', desc:'购买任意 2 件杂货'},
 {id:'b_pack',   type:'buy', cat:'pack',       n:1, xp:100, money:600,  name:'扩容行囊', desc:'购买 1 个背包'},
 {id:'b_armor',  type:'buy', cat:'armor',      n:1, xp:120, money:800,  name:'添置护甲', desc:'购买 1 件防弹衣'},
 {id:'b_weapon', type:'buy', cat:'weapon',     n:1, xp:150, money:1000, name:'军火交易', desc:'购买 1 把武器'},
 // ---- 击杀 (6) ----
 {id:'k3',  type:'kill',     n:3,  xp:100, money:800,  name:'初试锋芒', desc:''},
 {id:'k6',  type:'kill',     n:6,  xp:160, money:1200, name:'连环猎手', desc:''},
 {id:'k10', type:'kill',     n:10, xp:240, money:1800, name:'废城清剿', desc:''},
 {id:'k15', type:'kill',     n:15, xp:320, money:2500, name:'区域压制', desc:''},
 {id:'k20', type:'kill',     n:20, xp:400, money:3000, name:'死神降临', desc:''},
 {id:'kh3', type:'killhead', n:3,  xp:200, money:1500, name:'神射手',   desc:''},
];

// ---------- 市集等级门槛 (未列出 = Lv1 即可交易) ----------
const TRADE_LEVEL={
 antibiotic:2, adrenaline:2, cannedmeat:2, milk:2, creditcard:2, radio:2, detonator:2, gasoline:2, tools:2, packAssault:2,
 morphine:3, cms:3, phone:3, battery:3, chip:3, watch:3,
 satphone:4, docs:4, nvg:4, packRaid:4,
 gpu:5, keycard:5, ledx:5
};

function questCatOf(key){
 if(WPN_DEFS[key]) return 'weapon';
 if(ARMOR_DEFS[key]) return 'armor';
 if(MED_DEFS[key]) return 'med';
 if(FOOD_DEFS[key]) return 'food';
 if(PACK_DEFS[key]) return 'pack';
 if(MISC_DEFS[key]) return 'misc';
 return '';
}
// 重生后击杀类任务目标提高: 每次重生 +50%
function questTarget(q){
 const P=META.prestige||0;
 if((q.type==='kill'||q.type==='killhead')&&P>0) return Math.round(q.n*(1+0.5*P));
 return q.n;
}
function questDescOf(q){
 const t=questTarget(q);
 if(q.type==='kill') return `击杀 ${t} 名敌人`;
 if(q.type==='killhead') return `爆头击杀 ${t} 名敌人`;
 return q.desc;
}
function questsDoneCount(){ let n=0; for(const q of QUEST_DEFS) if(META.questDone&&META.questDone[q.id]) n++; return n; }
function questsAllDone(){
 const qd=META.questDone;
 if(!qd||Array.isArray(qd)) return false;   // 数组是异常形态, 永不视为全完成
 return questsDoneCount()>=QUEST_DEFS.length;
}
function tradeLockLevel(key){ return TRADE_LEVEL[key]||1; }

// ---------- 经验 / 等级 ----------
function gainXP(n){
 META.xp=(META.xp||0)+n;
 let ups=0;
 while(META.xp>=XP_PER_LEVEL){ META.xp-=XP_PER_LEVEL; META.level=(META.level||1)+1; ups++; }
 if(ups&&typeof showScorePop==='function')
  setTimeout(()=>showScorePop(`等级提升！Lv.${META.level} · 市集新品已解锁`),1500);
 saveMeta();
}

// ---------- 任务进度事件 (use / buy / kill / killhead / search / rare / extract) ----------
// q.map: 地图专属任务 —— 只有当前战役 id 与之一致时才计入 (见 43_maps 的实验室任务)
function questEvent(type,key,n){
 n=n||1;
 let changed=false;
 for(const q of QUEST_DEFS){
  if(META.questDone[q.id]||q.type!==type) continue;
  if(q.map&&q.map!==CAMPAIGN.id) continue;
  if(q.key){ if(q.key!==key) continue; }
  else if(q.cat){ if(questCatOf(key)!==q.cat) continue; }
  const tgt=questTarget(q);
  META.questProg[q.id]=(META.questProg[q.id]||0)+n;
  changed=true;
  if(META.questProg[q.id]>=tgt){
   META.questProg[q.id]=tgt;
   META.questDone[q.id]=true;
   META.wallet+=q.money;
   if(typeof showScorePop==='function') showScorePop(`任务完成「${q.name}」 +${q.xp}经验 +¥${formatMoney(q.money)}`);
   gainXP(q.xp);
   if(questsAllDone()) setTimeout(()=>{ if(typeof showScorePop==='function') showScorePop('全部任务完成！市集已解锁「撤离通行证」'); },3200);
  }
 }
 if(changed){ saveMeta(); updateQuestHud(); }
}

// ---------- 购买门控 (37_meta buyItem 调用) ----------
function buyGateMsg(key){
 if(key===PASS_KEY&&!questsAllDone()) return `撤离通行证未解锁 · 需完成全部 ${QUEST_DEFS.length} 个任务 (${questsDoneCount()}/${QUEST_DEFS.length})`;
 const lv=tradeLockLevel(key);
 if(lv>(META.level||1)) return `需要等级 Lv.${lv} 解锁 · 当前 Lv.${META.level||1}`;
 return '';
}

// ---------- 通行证 / 撤离门控 (35_extraction 调用) ----------
// 「撤离通行证」本质是一张**船票**: 只有从瓦尔登港登船出海才算离开隔离禁区。
// 所以在其他地图上持证没有任何作用 —— 不消耗、不解锁结局、也不给重生机会。
const PASS_MAP='port';
function hasPass(){ return ownedCount(PASS_KEY)>0; }
// 通行证在当前地图是否真的有效
function passUsable(){ return CAMPAIGN.id===PASS_MAP && hasPass(); }
function consumeExtractionPass(){
 if(META.owned[PASS_KEY]>0){ META.owned[PASS_KEY]--; if(META.owned[PASS_KEY]<=0) delete META.owned[PASS_KEY]; saveMeta(); }
}
// 撤离本身不被阻断 —— 保留空串返回, 仅为兼容旧调用点。
function extractionBlockedMsg(){ return ''; }
// HUD 上读条时附在后面的短提示
function extractionPassNotice(){
 if(CAMPAIGN.id!==PASS_MAP)
  return hasPass()?'本图不适用通行证 · 请到「港口」登船':'普通撤离 · 通行证只在「港口」可用';
 if(hasPass()) return '持证 · 登船离开禁区';
 return `普通撤离 · 持证登船离开禁区 (任务 ${questsDoneCount()}/${QUEST_DEFS.length})`;
}

// ---------- 重生 (结算画面按钮) ----------
function doRebirth(){
 const P=(META.prestige||0)+1;
 const fresh=metaDefault();
 for(const k of Object.keys(META)) delete META[k];
 Object.assign(META,fresh);
 META.prestige=P;
 saveMeta();
 location.reload();
}
function addRebirthButton(){
 const end=document.getElementById('end'); if(!end) return;
 const ctr=end.querySelector('.center'); if(!ctr) return;
 const oldB=document.getElementById('rebirthBtn'); if(oldB) oldB.remove();
 const oldI=document.getElementById('rebirthInfo'); if(oldI) oldI.remove();
 const P=META.prestige||0;
 const info=document.createElement('div');
 info.id='rebirthInfo';
 info.style.cssText='margin:14px 0 2px;color:#9fb8d0;font-size:13px;text-align:center;line-height:1.6';
 info.innerHTML=`已持「撤离通行证」从港口登船离开禁区 · 当前重生次数 <b style="color:#c9a6ff">NG+${P}</b><br>重生将从零开始：任务重置且目标提高、敌方 NPC 更强、己方 NPC 更弱`;
 const btn=document.createElement('button');
 btn.id='rebirthBtn';
 btn.className='bigBtn';
 btn.textContent=`重 生（NG+${P+1}）`;
 btn.style.cssText='background:#4a3470;border-color:#8a6adf;margin-left:8px';
 btn.onclick=()=>{ if(confirm('确定重生？货币、仓库、等级、任务将全部清零！')) doRebirth(); };
 ctr.parentNode.insertBefore(info,ctr);
 ctr.appendChild(btn);
}

// ---------- 包装: 撤离 (35_extraction) ----------
// 不阻断撤离, 只在玩家站进撤离区时提示一次"这次算不算离开禁区"。
const _qUpdExt=updateExtraction;
let _passWarnT=-99;
updateExtraction=function(dt){
 const ex=(typeof EXTRACT_POINTS!=='undefined')?EXTRACT_POINTS.find(p=>player&&player.alive&&Math.hypot(player.pos.x-p.x,player.pos.z-p.z)<p.r):null;
 const inZone=!!ex;
 if(inZone&&!passUsable()){
  if(nowT-_passWarnT>12){
   _passWarnT=nowT;
   const msg=(CAMPAIGN.id===PASS_MAP)
    ? '未持「撤离通行证」· 本次为普通撤离，不解锁结局'
    : '本地图不适用「撤离通行证」· 它是瓦尔登港的船票，请到「港口」登船';
   if(typeof showScorePop==='function') showScorePop(msg);
  }
 }
 _qUpdExt(dt);
};

// ---------- 军械库「任务」标签页 ----------
function renderQuestRows(){
 const P=META.prestige||0, done=questsDoneCount();
 const xp=Math.floor(META.xp||0);
 let h=`<div class="arRow"><div class="arBody"><div class="arName">等级 Lv.${META.level||1} · 经验 ${xp} / ${XP_PER_LEVEL}${P?` · <span style="color:#c9a6ff">重生 NG+${P}</span>`:''}</div>`
  +`<div class="arDesc">任务提供经验与货币 · 每 ${XP_PER_LEVEL} 经验升 1 级（经验归零）· 等级解锁市集商品 · 击杀 +${KILL_XP} 经验</div>`
  +`<div class="qXpBar"><i style="width:${Math.min(100,xp/XP_PER_LEVEL*100)}%"></i></div>`
  +`<div class="arOwned">任务进度 ${done} / ${QUEST_DEFS.length} · ${questsAllDone()?'✅ 撤离通行证已解锁（市集购买）· 到「港口」登船离开禁区':'全部完成后解锁「撤离通行证」'}</div></div></div>`;
 for(const q of QUEST_DEFS){
  const tgt=questTarget(q), cur=Math.min(tgt,META.questProg[q.id]||0), ok=!!META.questDone[q.id];
  const icon=(q.type==='kill'||q.type==='killhead')?'☠':(q.type==='buy'?'¥':'✚');
  h+=`<div class="arRow qRow${ok?' qDone':''}"><div class="arIcon">${icon}</div><div class="arBody"><div class="arName">${q.name}${ok?' <span style="color:#9fe6b4">✓</span>':''}</div><div class="arDesc">${questDescOf(q)}</div><div class="qProg"><i style="width:${Math.round(cur/tgt*100)}%"></i></div></div><span class="arPrice">${cur}/${tgt}</span><span class="arPrice" style="color:#9fe6b4;font-size:12px">+${q.xp} 经验<br>+¥${formatMoney(q.money)}</span></div>`;
 }
 return h;
}

// ---------- 局内任务追踪 HUD (右上方小面板) ----------
let _questHud=null,_qSig='';
function questHudEl(){
 if(!_questHud){ _questHud=document.createElement('div'); _questHud.id='questHud'; document.body.appendChild(_questHud); }
 return _questHud;
}
function updateQuestHud(){
 const hud=questHudEl();
 const inRaid=typeof player!=='undefined'&&player.deployed&&player.alive&&!matchOver&&GAMEMODE==='extract';
 if(!inRaid){ if(_qSig!=='x'){ hud.style.display='none'; _qSig='x'; } return; }
 const act=QUEST_DEFS.filter(q=>!META.questDone[q.id])
  .map(q=>({q,cur:Math.min(questTarget(q),META.questProg[q.id]||0),tgt:questTarget(q)}))
  .sort((a,b)=>(b.cur/b.tgt)-(a.cur/a.tgt)).slice(0,4);
 const sig=(META.level||1)+'|'+(META.xp|0)+'|'+questsDoneCount()+'|'+hasPass()+'|'+act.map(a=>a.q.id+a.cur).join(',');
 if(sig===_qSig) return;
 _qSig=sig;
 hud.style.display='block';
 const xp=Math.floor(META.xp||0);
 hud.innerHTML=`<div class="qhHead">Lv.${META.level||1}<span class="qhXp"><i style="width:${Math.min(100,xp/XP_PER_LEVEL*100)}%"></i></span>${questsDoneCount()}/${QUEST_DEFS.length}</div>`
  +(act.length?act.map(a=>`<div class="qhRow">${a.q.name}<b>${a.cur}/${a.tgt}</b></div>`).join(''):'<div class="qhRow qhDoneAll">任务全部完成</div>')
  +(hasPass()?(CAMPAIGN.id===PASS_MAP
     ?'<div class="qhRow" style="color:#ffe08a">已持通行证 · 在「港口」撤离点登船离开禁区</div>'
     :'<div class="qhRow" style="color:#ffd9a0">已持通行证 · 本地图无效，请到「港口」使用</div>'):'');
}

// ---------- 包装: 击杀 (28_hud) ----------
const _qOnPlayerKill=onPlayerKill;
onPlayerKill=function(victim,isHead){
 _qOnPlayerKill(victim,isHead);
 // 击杀经验: 基础 + 爆头加成 + 远距离加成 (>50m 后按距离递增, 上限 +60)
 let xp=KILL_XP;
 if(isHead) xp+=XP_HEAD_BONUS;
 if(victim&&victim.pos&&player&&player.pos){
  const dist=Math.hypot(victim.pos.x-player.pos.x,victim.pos.z-player.pos.z);
  if(dist>50) xp+=Math.min(XP_LONG_RANGE_CAP,Math.round((dist-50)*XP_LONG_RANGE_BONUS));
 }
 const lvBefore=META.level||1;
 gainXP(xp);
 questEvent('kill',null,1);
 if(isHead) questEvent('killhead',null,1);
 // 经验飘字 (覆盖击杀提示, 把经验一并显示; 升级提示由 gainXP 稍后接管)
 if(typeof showScorePop==='function'){
  const lvNow=META.level||1;
  const up=lvNow>lvBefore?` · ★ 升级 Lv.${lvNow}`:'';
  showScorePop((isHead?'爆头击杀':'击杀')+` +${xp} 经验${up} · 尸体可搜刮[F]`);
 }
};

// ---------- 包装: 使用医疗/食物 (38_tarkov) ----------
const _qFinishMedUse=finishMedUse;
finishMedUse=function(){
 const it=(player&&player.medItems&&player._medIdx!==undefined)?player.medItems[player._medIdx]:null;
 const key=it&&it.key;
 _qFinishMedUse();
 if(key) questEvent('use',key,1);
};
const _qFinishFoodUse=finishFoodUse;
finishFoodUse=function(){
 const fd=player&&(player.foodItems||[])[player.foodSel||0];
 const key=fd&&fd.key;
 _qFinishFoodUse();
 if(key) questEvent('use',key,1);
};

// ---------- 包装: HUD 刷新时同步任务面板 (38_tarkov) ----------
if(typeof updateRaidHUDBars==='function'){
 const _qUpdHUD=updateRaidHUDBars;
 updateRaidHUDBars=function(idle){ _qUpdHUD(idle); updateQuestHud(); };
}

// ---------- 重生难度: 敌方更强 / 己方更弱 (19_bot 乘数) ----------
function applyPrestigeBot(bot){
 const P=(META&&META.prestige)||0;
 let hm=1,rm=1,sm=1;
 if(P>0){
  if(bot.team===player.team){
   // 己方 NPC 减弱: 血量 -12%/次, 反应更慢, 散布更大
   hm=Math.max(0.5,1-0.12*P); rm=1+0.2*P; sm=1+0.2*P;
  }else{
   // 敌方 NPC 增强: 血量 +30%/次, 反应更快, 散布更小
   hm=1+0.3*P; rm=Math.max(0.55,1-0.12*P); sm=Math.max(0.6,1-0.12*P);
  }
 }
 bot.hpMul=hm; bot.reactMul=rm; bot.sprMul=sm;
}
(function wrapBotSpawn(){
 if(typeof Bot==='undefined'||!Bot.prototype) return;
 const os=Bot.prototype.spawn, ov=Bot.prototype.spawnInVehicle;
 if(os) Bot.prototype.spawn=function(){ applyPrestigeBot(this); return os.apply(this,arguments); };
 if(ov) Bot.prototype.spawnInVehicle=function(){ applyPrestigeBot(this); return ov.apply(this,arguments); };
})();
