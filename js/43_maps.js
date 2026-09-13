'use strict';
// =====================================================================
// 43_maps.js —— 地图系统扩展 (秘密实验室)
// 加载位置: 42_shake 之后 / 32_boot 之前 (32_boot 会调用被本文件包裹过的 initMenuUI)
// 依赖: 01_data(战役+主题) · 07d_lab(布局) · 37~41(经济/任务/掉落/局内商店)
// ---------------------------------------------------------------------
// 本文件承担四件事:
//   1) 撤离部署界面: 地图选择卡片 —— 点击卡片 → 切图重载 → 自动进入部署界面
//   2) 掉落: 实验室物资箱更密、更值钱 (rich 箱走独立高价值表), 尸体多掉稀有杂物
//   3) NPC: 实验室守备为 NBK 合同精锐 —— 血更厚 / 反应更快 / 更准 (与 NG+ 叠加)
//   4) 任务: 新增 4 个实验室专属任务 (地图门控), 并接入新的进度事件
// 设计约束: 沿用 40/41 的"包裹式扩展", 不替换既有函数体, 保证存档链路不受影响
// =====================================================================

// ============================ 1) 地图规则表 ============================
// 每张地图的掉落/守备差异集中在这里, 改数值不必翻实现
const MAP_RULES={
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
// ---- 包裹 rollCrateLootList: 只认"高价值箱"标记与地图规则 ----
// 38_tarkov 的 lootTargetNear 会把箱子对象一并传进来 (改动已同步过去),
// 因此这里能拿到 lc.rich —— 这是"同一张图内不同房间价值不同"的实现方式。
const _mapOrigRollCrateLootList=rollCrateLootList;
rollCrateLootList=function(crate){
  const rules=mapRules();
  const rich=!!(crate&&crate.rich)||(rules.richChance>0&&Math.random()<rules.richChance);
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
// 39_quests 已把 applyPrestigeBot 挂到 Bot.spawn; 41_raidloot 又在它之上削弱己方。
// 本文件在最外层再乘"地图系数", 因此三层自然叠加, 无需改动任何既有函数体。
const _mapOrigApplyPrestigeBot=applyPrestigeBot;
applyPrestigeBot=function(bot){
  _mapOrigApplyPrestigeBot(bot);
  if(!bot||typeof player==='undefined') return;
  const m=mapRules().botMul;
  if(!m) return;
  if(bot.team!==player.team){
    bot.hpMul    =(bot.hpMul   ||1)*(m.enemyHp||1);
    bot.reactMul =(bot.reactMul||1)*(m.enemyReact||1);
    bot.sprMul   =(bot.sprMul  ||1)*(m.enemySpread||1);
    bot.mapElite=true;
  }
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
// 任务文案修正: 地图专属任务在"全图通用"的任务列表里要有区分度
const _mapOrigQuestDescOf=questDescOf;
questDescOf=function(q){
  if(q&&q.map&&q.type==='kill') return `在${(CAMPAIGNS.filter(c=>c.id===q.map)[0]||{}).mapName||q.map} 击杀 ${questTarget(q)} 名敌人`;
  if(q&&q.type==='extract') return q.desc;
  return _mapOrigQuestDescOf(q);
};

// ---- 事件: 搜索容器 (每拿走 1 件物资计 1 次) ----
const _mapOrigLootTakeSelected=lootTakeSelected;
lootTakeSelected=function(){
  const b=RUN.searches||0;
  const r=_mapOrigLootTakeSelected.apply(this,arguments);
  const a=RUN.searches||0;
  if(a>b) questEvent('search',null,a-b);
  return r;
};
// ---- 事件: 撤离 + 带出稀有物资 (结算前取背包快照, 因为完工时 RUN.loot 已被清空) ----
const _mapOrigFinishRaid=finishRaid;
finishRaid=function(extracted){
  const snap=Object.assign({},RUN.loot||{});
  const r=_mapOrigFinishRaid(extracted);
  if(extracted&&CAMPAIGN.id==='lab'){
    questEvent('extract',null,1);
    let n=0;
    for(const k in snap) if(RARE_LOOT[k]) n+=snap[k];
    if(n>0) questEvent('rare',null,n);
  }
  return r;
};

// ============================ 5) 撤离部署: 地图选择 ============================
// 世界在页面加载时构建, 所以换地图必须重载页面;
// 用 sf_autodeploy 标记"这次重载是为了直接开打", 回来后自动进部署界面。
function renderMapCards(){
  const row=el('mapRow');
  if(!row){ console.warn('[map] #mapRow 不存在, 地图卡片无法渲染 (index.html 版本过旧?)'); return; }
  row.innerHTML='';
  CAMPAIGNS.forEach((c,i)=>{
    const b=document.createElement('button');
    b.className='optBtn mapCard'+(i===CAMPAIGN_IDX?' sel':'');
    b.style.minWidth='176px';
    b.style.textAlign='left';
    b.style.lineHeight='1.5';
    b.innerHTML=`<b style="font-size:14px">${c.mapName||c.title}</b>`
      +`<br><span style="font-size:10px;opacity:.85;color:#c0d8e0">${c.mapTag||''}</span>`
      +`<br><span style="font-size:11px;opacity:.85;color:#e0b0a0">${c.mapThreat||''}</span>`
      +`<br><span style="font-size:11px;opacity:.72">${c.mapLoot||''}</span>`
      +(i===CAMPAIGN_IDX?`<br><span style="font-size:11px;color:#9fe6b4">◈ 当前地图</span>`:'');
    b.onmouseenter=()=>showMapBrief(i);
    b.onfocus=()=>showMapBrief(i);
    b.onclick=()=>selectMapAndDeploy(i);
    row.appendChild(b);
  });
  showMapBrief(CAMPAIGN_IDX);
}
function showMapBrief(i){
  const box=el('mapBrief');
  const c=CAMPAIGNS[i];
  if(!box||!c) return;
  box.innerHTML=`<b style="color:#e8d9a8">${c.mapName||c.title}</b> · <span style="opacity:.8">${c.sub}</span><br>`
    +`${c.mapDesc||''}<br>`
    +`<span style="color:#e0b0a0">${c.mapThreat||''}</span> · <span style="opacity:.8">${c.mapLoot||''}</span>`;
}
// 点击地图卡片: 同图 → 直接开打; 换图 → 存档 + 重载 + 自动部署
function selectMapAndDeploy(idx){
  if(idx!==CAMPAIGN_IDX){
    try{
      localStorage.setItem('sf_campaign',String(idx));
      localStorage.setItem('sf_autodeploy','1');
    }catch(e){}
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
  RUN.kills=0; RUN.searches=0; RUN.loot={}; RUN.extracting=false;
  RUN.failComp=0; RUN.autoKit=null; RUN.lostGear=null; RUN.returnedGear=null;
  // ELO: 兵力规模随评分浮动
  if(typeof eloRecalc==='function') eloRecalc();
  if(typeof eloApplyForceSize==='function') eloApplyForceSize();
  startMatch();
  const menu=el('menu');
  if(menu) menu.classList.add('hidden');
  if(GAMEMODE==='extract') showDeploy(false);
  else startIntroCut(()=>showDeploy(false));
}
// 初始化 (由被包裹的 initMenuUI 调用)
function mapSelectInit(){
  renderMapCards();
  // 每次点开「撤离部署」面板都重绘一次地图卡片: 避免任何时序/缓存问题导致卡片区空白
  try{
    document.querySelectorAll('.navBtn').forEach(b=>{
      if(b&&b.dataset&&b.dataset.p==='mPlay')
        b.addEventListener('click',()=>setTimeout(()=>{ try{ renderMapCards(); }catch(e){} },0));
    });
  }catch(e){}
  // 自愈兜底: 面板可见但卡片区是空的 → 重绘 (正常情况下永远不会触发)
  if(!mapSelectInit._watch){
    mapSelectInit._watch=setInterval(()=>{
      try{
        const row=el('mapRow'), panel=el('mPlay');
        if(row&&panel&&!panel.classList.contains('hidden')&&row.children.length===0) renderMapCards();
      }catch(e){}
    },1000);
  }
  const sb=el('startBtn');
  if(sb){
    sb.textContent='进 入 '+((CAMPAIGN.mapName||CAMPAIGN.title));
    sb.onclick=beginRaid;
  }
  const dn=el('deployMapName');
  if(dn) dn.innerHTML=`当前地图 · <b style="color:#e8d9a8">${CAMPAIGN.mapName||CAMPAIGN.title}</b>`
    +` · <span style="opacity:.8">${CAMPAIGN.mapTag||''}</span>`
    +` · <span style="color:#e0b0a0">${CAMPAIGN.mapThreat||''}</span>`;
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
