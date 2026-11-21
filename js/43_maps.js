'use strict';
// =====================================================================
// 43_maps.js —— 地图系统扩展 (秘密实验室)
// 加载位置: 42_shake 之后 / 32_boot 之前 (32_boot 会调用被本文件包裹过的 initMenuUI)
// 依赖: 01_data(战役+主题) · 07d_lab(布局) · 37~41(经济/任务/掉落/局内商店)
// ---------------------------------------------------------------------
// 本文件承担四件事:
//   1) 撤离部署界面: 选择地图与阵营，确认后进入配装
//   2) 掉落: 实验室物资箱更密、更值钱 (rich 箱走独立高价值表), 尸体多掉稀有杂物
//   3) NPC: 实验室守备为 PMC 合同精锐 —— 血更厚 / 反应更快 / 更准 (与 NG+ 叠加)
//   4) 任务: 新增 4 个实验室专属任务 (地图门控), 并接入新的进度事件
// 设计约束: 沿用 40/41 的"包裹式扩展", 不替换既有函数体, 保证存档链路不受影响
// =====================================================================

// ============================ 1) 地图规则表 ============================
// 每张地图的掉落/守备差异集中在这里, 改数值不必翻实现
const MAP_RULES={
  // 靶场: 不刷战利品、不刷敌人
  range:{ crateExtra:0, richChance:0, corpseExtra:0, botMul:null },
  // 街区: 基准
  bfruins:{
    crateExtra:0,          // 普通箱追加件数
    richChance:0,          // 普通箱升格为高价值箱的概率
    corpseExtra:0,         // 尸体追加稀有件数概率
    botMul:null
  },
  // 秘密实验室: 高风险高回报
  lab:{
    crateExtra:[1,2],      // 普通箱追加 1~2 件
    richChance:0.45,       // 45% 的普通箱直接按高价值箱结算
    corpseExtra:0.75,      // 75% 的概率额外掉 1 件稀有贵重品
    botMul:(typeof CAMPAIGN!=='undefined'&&CAMPAIGN.botMul)?CAMPAIGN.botMul:{enemyHp:1.28,enemyReact:0.74,enemySpread:0.72}
  },
  // 港口: 报关货物多, 介于街区与实验室之间
  port:{
    crateExtra:1,
    richChance:0.22,
    corpseExtra:0.35,
    botMul:(typeof CAMPAIGN!=='undefined'&&CAMPAIGN.botMul)?CAMPAIGN.botMul:{enemyHp:1.15,enemyReact:0.82,enemySpread:0.82}
  },
  // 机场: 高价值密集, 但整体略低于实验室(实验室仍是最高档)。
  // ⚠️ 这里的 crateExtra/richChance 对机场其实**不生效** —— 机场的箱子在
  //    rollCrateLootList 包装里直接走专属表(资料/电子产品), 不经过通用分支。
  //    保留这两个字段是为了让"规则表结构一致", 以及万一以后要退回通用表。
  airport:{
    crateExtra:[1,2],
    richChance:0.50,
    corpseExtra:0.55,
    botMul:(typeof CAMPAIGN!=='undefined'&&CAMPAIGN.botMul)?CAMPAIGN.botMul:{enemyHp:1.22,enemyReact:0.78,enemySpread:0.76}
  },
  // ===== 剧情模式地图 =====
  // 铁砧外围: 地表, 物资一般, 但守备位置好 → 中等风险
  anvil_yard:{
    crateExtra:0,
    richChance:0.10,
    corpseExtra:0.30,
    botMul:(typeof CAMPAIGN!=='undefined'&&CAMPAIGN.botMul)?CAMPAIGN.botMul:{enemyHp:1.10,enemyReact:0.86,enemySpread:0.86}
  },
  // 铁砧 B2: 地下封存层, 与实验室同档的高价值密度
  anvil_b2:{
    crateExtra:[1,2],
    richChance:0.42,
    corpseExtra:0.70,
    botMul:(typeof CAMPAIGN!=='undefined'&&CAMPAIGN.botMul)?CAMPAIGN.botMul:{enemyHp:1.24,enemyReact:0.78,enemySpread:0.76}
  }
};
function mapRules(){ return (typeof CAMPAIGN!=='undefined'&&MAP_RULES[CAMPAIGN.id])?MAP_RULES[CAMPAIGN.id]:MAP_RULES.bfruins; }

// ============================ 2) 掉落 ============================
// 高价值权重表: 把稀有度堆到 3~5 档 (芯片/名表/卫星电话/文件/显卡/通行卡/医疗记录仪)
const RICH_MISC_WEIGHT={chip:10,watch:8,phone:9,satphone:5,docs:5,gpu:4,keycard:3,ledx:3,
  creditcard:6,radio:5,detonator:5,battery:4,tools:4,coffee:4,cig:4,disinfectant:3,dogtag:3,screwdriver:2,wrench:2,gasoline:2};
const RICH_MED_WEIGHT={morphine:5,cms:4,medkit:6,adrenaline:5,antibiotic:5,painkiller:4,tourniquet:3};
// 高价值收集品 (结算用的"稀有物资"清单, 见任务 rare)
const RARE_LOOT={chip:1,watch:1,satphone:1,docs:1,gpu:1,keycard:1,ledx:1,nvg:1};

// 高价值物资箱: 4~6 件, 稀有杂物与枪支概率显著提高
function rollRichCrateLoot(){
  const out={};
  const n=randi(4,6);
  for(let i=0;i<n;i++){
    const r=Math.random();
    if(r<0.16){
      const k=weightedPick(LOOT_MED,RICH_MED_WEIGHT);
      out[k]=(out[k]||0)+1;
    } else if(r<0.30){
      const w=Object.keys(WPN_DEFS);
      out[w[randi(0,w.length-1)]]=1;
    } else if(r<0.40){
      const k=weightedPick(LOOT_FOOD,FOOD_WEIGHT);
      out[k]=(out[k]||0)+1;
    } else {
      const k=weightedPick(LOOT_MISC,RICH_MISC_WEIGHT);
      out[k]=(out[k]||0)+1;
    }
  }
  return out;
}
// 普通箱的实验室加权: 把部分中档杂物换成高价值杂物
function rollLabExtra(out,n){
  for(let i=0;i<n;i++){
    const k=weightedPick(LOOT_MISC,RICH_MISC_WEIGHT);
    out[k]=(out[k]||0)+1;
  }
  return out;
}
// ===== 机场专属掉落: 资料 + 电子产品 =====
// 机场的价值全在"轻、值钱、不占地方"的东西上 —— 封锁前最紧俏的硬通货。
//   资料    = docs(机密文件 ¥2000) / keycard(通行卡 ¥2800)
//   电子产品 = chip(电子芯片 ¥900) / phone(手机 ¥850) / gpu(图形处理器 ¥2400)
//              satphone(卫星电话 ¥2100) / radio(对讲机 ¥380)
// 两类权重合计 93, 其余杂物合计 30 → 杂物产出里约 76% 是资料/电子产品;
// 再叠加"80% 的产出走杂物分支", 综合约 60% 的箱子物品落在这两类上 —— 符合"大部分"。
// 军械与食物刻意压低(机场不是军营, 补给早被搬空了), 但保留一点保证能续命。
const AP_MISC=["docs","keycard","chip","phone","gpu","satphone","radio","watch","ledx",
  "creditcard","battery","detonator","tools","coffee","cig","disinfectant","dogtag","screwdriver","wrench","gasoline"];
const AP_MISC_WEIGHT={docs:18,keycard:10,chip:16,phone:15,gpu:14,satphone:11,radio:9,
  watch:5,ledx:3,creditcard:3,battery:3,detonator:3,tools:2,coffee:2,cig:2,disinfectant:2,dogtag:2,screwdriver:1,wrench:1,gasoline:1};
// 普通箱: 4~6 件, 80% 走杂物分支
function rollAirportCrateLoot(){
  const out={};
  const n=randi(4,6);
  for(let i=0;i<n;i++){
    const r=Math.random();
    if(r<0.80){ const k=weightedPick(AP_MISC,AP_MISC_WEIGHT); out[k]=(out[k]||0)+1; }
    else if(r<0.88){ const k=weightedPick(LOOT_MED,MED_WEIGHT); out[k]=(out[k]||0)+1; }
    else if(r<0.94){ const k=weightedPick(LOOT_FOOD,FOOD_WEIGHT); out[k]=(out[k]||0)+1; }
    else { const w=Object.keys(WPN_DEFS); out[w[randi(0,w.length-1)]]=1; }
  }
  return out;
}
// 高价值箱(值机柜台/安检/办公层/货站): 5~7 件, 86% 走杂物分支, 且几乎不给食物
function rollAirportRichLoot(){
  const out={};
  const n=randi(5,7);
  for(let i=0;i<n;i++){
    const r=Math.random();
    if(r<0.86){ const k=weightedPick(AP_MISC,AP_MISC_WEIGHT); out[k]=(out[k]||0)+1; }
    else if(r<0.93){ const k=weightedPick(LOOT_MED,RICH_MED_WEIGHT); out[k]=(out[k]||0)+1; }
    else { const w=Object.keys(WPN_DEFS); out[w[randi(0,w.length-1)]]=1; }
  }
  return out;
}
// ---- 包裹 rollCrateLootList: 只认"高价值箱"标记与地图规则 ----
// 38_tarkov 的 lootTargetNear 会把箱子对象一并传进来 (改动已同步过去),
// 因此这里能拿到 lc.rich —— 这是"同一张图内不同房间价值不同"的实现方式。
const _mapOrigRollCrateLootList=rollCrateLootList;
rollCrateLootList=function(crate){
  const rules=mapRules();
  const rich=!!(crate&&crate.rich)||(rules.richChance>0&&Math.random()<rules.richChance);
  // 机场: 普通箱与高价值箱都走"资料/电子产品"专属表 (见上面的 rollAirport*)
  if(typeof CAMPAIGN!=='undefined'&&CAMPAIGN.id==='airport'){
    return rich ? rollAirportRichLoot() : rollAirportCrateLoot();
  }
  if(rich) return rollRichCrateLoot();
  const out=_mapOrigRollCrateLootList(crate);
  if(rules.crateExtra){
    const ex=Array.isArray(rules.crateExtra)?randi(rules.crateExtra[0],rules.crateExtra[1]):rules.crateExtra;
    if(ex>0) rollLabExtra(out,ex);
  }
  return out;
};
// ---- 包裹 rollCorpseLoot: 实验室守备装备更精良, 遗体也更肥 ----
const _mapOrigRollCorpseLoot=rollCorpseLoot;
rollCorpseLoot=function(bot){
  const out=_mapOrigRollCorpseLoot(bot);
  const rules=mapRules();
  if(rules.corpseExtra>0&&Math.random()<rules.corpseExtra) rollLabExtra(out,1);
  return out;
};

// ============================ 3) NPC 强化 ============================
// 39_quests 已把 applyPrestigeBot 挂到 Bot.spawn; 41_raidloot 又在它之上削弱己方;
// 45_elo_bots 在最外层乘 ELO。本文件在 41 与 45 之间再乘"地图系数"。
// ⚠️ 2026-09-17: 地图系数原先只作用于敌方 → 高分地图上队友明显跟不上, 用户要求
//    「我方 NPC 和敌方一样强, 套用同一套强度代码」。现在敌我双方同吃。
//    地图的"守备强度"因此变成"战场烈度"而非单边难度 —— 想恢复单边只需把下面
//    的注释还原成 `if(bot.team!==player.team){ ... }`。
const _mapOrigApplyPrestigeBot=applyPrestigeBot;
applyPrestigeBot=function(bot){
  _mapOrigApplyPrestigeBot(bot);
  if(!bot||typeof player==='undefined') return;
  const m=mapRules().botMul;
  if(!m) return;
  bot.hpMul    =(bot.hpMul   ||1)*(m.enemyHp||1);
  bot.reactMul =(bot.reactMul||1)*(m.enemyReact||1);
  bot.sprMul   =(bot.sprMul  ||1)*(m.enemySpread||1);
  bot.mapElite=true;
};

// ============================ 4) 任务 ============================
// 地图专属任务: 只有在该地图内发生的事件才计入 (39_quests 的 questEvent 支持 q.map)
QUEST_DEFS.push(
 {id:'lab_search', type:'search', map:'lab', n:10, xp:180, money:1600, name:'设施侦察',
  desc:'在秘密实验室搜索并拿走 10 件物资'},
 {id:'lab_kill',   type:'kill',   map:'lab', n:14, xp:340, money:2600, name:'净化协议',
  desc:'在秘密实验室击杀 14 名守备人员'},
 {id:'lab_rare',   type:'rare',   map:'lab', n:6,  xp:260, money:2200, name:'样本回收',
  desc:'从秘密实验室带出 6 件稀有物资（芯片/名表/卫星电话/文件/显卡/通行卡/医疗记录仪/夜视仪）'},
 {id:'lab_extract',type:'extract',map:'lab', n:1,  xp:240, money:2000, name:'活着出来',
  desc:'从秘密实验室成功撤离 1 次'}
);
// 机场专属任务: 与"资料 / 电子产品"的地图定位对齐 (rare 计数见 RARE_LOOT)
QUEST_DEFS.push(
 {id:'ap_search', type:'search', map:'airport', n:10, xp:190, money:1700, name:'行李清查',
  desc:'在瓦尔登机场搜索并拿走 10 件物资'},
 {id:'ap_kill',   type:'kill',   map:'airport', n:13, xp:330, money:2500, name:'清空跑道',
  desc:'在瓦尔登机场击杀 13 名守备人员'},
 {id:'ap_rare',   type:'rare',   map:'airport', n:6,  xp:280, money:2400, name:'资料回收',
  desc:'从瓦尔登机场带出 6 件稀有物资（文件/通行卡/芯片/显卡/手机/卫星电话/名表/夜视仪）'},
 {id:'ap_extract',type:'extract',map:'airport', n:1,  xp:260, money:2100, name:'搭上那班机',
  desc:'从瓦尔登机场成功撤离 1 次'}
);
// 任务文案修正: 地图专属任务在"全图通用"的任务列表里要有区分度
const _mapOrigQuestDescOf=questDescOf;
questDescOf=function(q){
  if(q&&q.map&&q.type==='kill') return `在${(CAMPAIGNS.filter(c=>c.id===q.map)[0]||{}).mapName||q.map} 击杀 ${questTarget(q)} 名敌人`;
  if(q&&q.type==='extract') return q.desc;
  return _mapOrigQuestDescOf(q);
};

// ---- 事件: 撤离 + 带出稀有物资 (结算前取背包快照, 因为完工时 RUN.loot 已被清空) ----
const _mapOrigFinishRaid=finishRaid;
finishRaid=function(extracted){
  if(matchOver) return;
  const snap=extracted?extractedLoot():{};
  const r=_mapOrigFinishRaid(extracted);
  if(extracted){
    questEvent('extract',null,1);
    let n=0;
    for(const k in snap) if(RARE_LOOT[k]||(CAMPAIGN.id==='airport'&&k==='phone')) n+=snap[k];
    if(n>0) questEvent('rare',null,n);
  }
  return r;
};

// ============================ 5) 撤离部署: 地图选择 ============================
// 世界在页面加载时构建, 所以换地图必须重载页面;
// 用 sf_autodeploy 标记"这次重载是为了直接开打", 回来后自动进部署界面。
// 剧情专用地图 (storyOnly) 只能从主菜单「剧情模式」进入, 沙盒不给选
function storyPendingChapter(){
  try{ return !!localStorage.getItem('sf_story'); }catch(e){ return false; }
}
function storyMapBlocked(){
  const c=CAMPAIGNS[CAMPAIGN_IDX];
  if(!c||(!c.storyOnly&&!c.rangeOnly)) return false;
  if(storyPendingChapter()) return false;
  try{ if(localStorage.getItem('sf_range')==='1') return false; }catch(e){}                                  // 剧情模式待打 → 放行
  if(typeof player!=='undefined'&&player.deployed&&!matchOver) return false;  // 局内重新部署 → 放行
  return true;
}
let selectedRaidMap=CAMPAIGN_IDX;
function renderMapCards(){
  const row=el('mapRow');
  if(!row){ console.warn('[map] #mapRow 不存在, 地图卡片无法渲染 (index.html 版本过旧?)'); return; }
  row.innerHTML='';
  const current=CAMPAIGNS[selectedRaidMap];
  if(!current||current.storyOnly||current.rangeOnly) selectedRaidMap=CAMPAIGNS.findIndex(c=>!c.storyOnly&&!c.rangeOnly);
  CAMPAIGNS.forEach((c,i)=>{
    if(c.storyOnly||c.rangeOnly) return;   // 剧情 / 靶场专用地图不进沙盒列表
    const b=document.createElement('button');
    b.className='optBtn mapCard';
    b.dataset.mapIndex=i;
    b.innerHTML='<strong></strong><span></span>';
    b.firstElementChild.textContent=c.mapName||c.title;
    b.lastElementChild.textContent=c.mapTag||'';
    b.onclick=()=>showMapBrief(i);
    row.appendChild(b);
  });
  showMapBrief(selectedRaidMap);
}
function showMapBrief(i){
  const box=el('mapBrief');
  const c=CAMPAIGNS[i];
  if(!box||!c) return;
  selectedRaidMap=i;
  for(const b of el('mapRow').children){
    const chosen=Number(b.dataset.mapIndex)===i;
    b.classList.toggle('sel',chosen);
    b.setAttribute('aria-pressed',String(chosen));
  }
  box.innerHTML='<b></b><p></p>';
  box.firstElementChild.textContent=[c.mapThreat,c.mapLoot].filter(Boolean).join('　·　');
  box.lastElementChild.textContent=c.mapDesc||c.sub||'';
  el('startBtn').textContent='准备配装 · '+(c.mapName||c.title);
}
function selectMapAndDeploy(idx){
  if(idx!==CAMPAIGN_IDX||menuFaction!==FACTION_PICK){
    try{
      localStorage.setItem('sf_campaign',String(idx));
      localStorage.setItem('sf_faction',menuFaction);
      localStorage.setItem('sf_autodeploy','1');
    }catch(e){}
    if(typeof netRememberRoomForMap==='function') netRememberRoomForMap(idx);
    location.reload();
    return;
  }
  beginRaid();
}
// 开始一局 (与主菜单「进入当前地图」按钮等价)
function beginRaid(){
  if(typeof matchOver!=='undefined'&&matchOver) matchOver=false;
  if(typeof AudioSys!=='undefined'&&AudioSys.init){ try{ AudioSys.init(); }catch(e){} }
  player.team=SETTINGS.team;
  matchOver=false;
  player.deployed=false; player.alive=false; player.kills=0; player.deaths=0; player.score=0;
  RUN.kills=0; RUN.searches=0; RUN.loot={}; RUN.extracting=false; RUN.scav=false; RUN.scavLoadout=null; RUN.passBrought=false; RUN.nvgBrought=false; RUN.nvgKey=''; RUN.timeout=false;
  RUN.failComp=0; RUN.autoKit=null; RUN.lostGear=null; RUN.returnedGear=null;
  // ELO: 兵力规模随评分浮动
  if(typeof eloRecalc==='function') eloRecalc();
  if(typeof eloApplyForceSize==='function') eloApplyForceSize();
  // 建局推迟到「点部署」时 (见 29_menus 顶部的 armRaidStart/consumeRaidStart)
  if(typeof armRaidStart==='function') armRaidStart();
  if(typeof ensureScavLoadout==='function') ensureScavLoadout();
  const menu=el('menu');
  if(menu) menu.classList.add('hidden');
  if(GAMEMODE==='extract') showDeploy(false);
  else startIntroCut(()=>showDeploy(false));
}
// 初始化 (由被包裹的 initMenuUI 调用)
function mapSelectInit(){
  renderMapCards();
  const sb=el('startBtn');
  if(sb) sb.onclick=()=>selectMapAndDeploy(selectedRaidMap);
  const dn=el('deployMapName');
  if(dn) dn.textContent=(CAMPAIGN.mapName||CAMPAIGN.title)+' · '+FACTIONS[FACTION_PICK].short;
  // 从地图卡片切图重载回来后: 自动进入部署界面
  let auto=false;
  try{
    auto=localStorage.getItem('sf_autodeploy')==='1';
    if(auto) localStorage.removeItem('sf_autodeploy');
  }catch(e){}
  if(auto) setTimeout(()=>{ try{ beginRaid(); }catch(e){ console.warn('[map] auto deploy failed',e); } },160);
}
// 包裹 initMenuUI: 主菜单初始化完成后接上地图卡片
(function wrapInitMenuUI(){
  if(typeof initMenuUI==='function'){
    const orig=initMenuUI;
    initMenuUI=function(){
      const r=orig.apply(this,arguments);
      try{ mapSelectInit(); }catch(e){ console.warn('[map] mapSelectInit failed',e); }
      return r;
    };
  } else {
    setTimeout(()=>{ try{ mapSelectInit(); }catch(e){} },80);
  }
})();
