'use strict';
// =====================================================================
// 56_story.js — 剧情模式 (STORY MODE)
// 加载位置: index.html 最末 —— 需要 wrap updateMedCrates 拿每帧钩子。
// ---------------------------------------------------------------------
// 设计要点 (都为了避开本项目已知的坑):
//   · 进度存**独立** localStorage `bf_story_v1`, 不塞进 META → 不用改存档迁移规则。
//   · 局内状态放模块级 SRAID, 不占 RUN → 不用改「RUN 重置点有 3 处」那条铁律。
//   · 章节的地图/天气/编制全部走 CAMPAIGN (01_data), 这里只负责「目标 + 事件 + UI」。
//   · 切图沿用既有机制: 写 sf_campaign + sf_autodeploy 后 location.reload()。
// 挂载点 (在别的文件里):
//   · 29_menus.showPanel 白名单加 'mStory' → 本文件提供 renderStoryPanel()
//   · startMatch() 调用 storyApplyChapter()
//   · 35_extraction.finishRaid() 调用 storyOnRaidEnd(extracted)
//   · 每帧: wrap updateMedCrates
// =====================================================================

const STORY_KEY='bf_story_v1';
const STORY=(()=>{
  try{ const o=JSON.parse(localStorage.getItem(STORY_KEY)||'null'); if(o&&typeof o==='object'){ if(!o.done) o.done={}; if(typeof o.cur!=='number') o.cur=0; return o; } }catch(e){}
  return {done:{},cur:0};
})();
function storySave(){ try{ localStorage.setItem(STORY_KEY,JSON.stringify(STORY)); }catch(e){} }
function storyDone(i){ return !!(STORY_CHAPTERS[i]&&STORY.done[STORY_CHAPTERS[i].id]); }
function storyUnlocked(i){ return i<=0||(i>0&&storyDone(i-1)); }
function storyCleared(){ return STORY_CHAPTERS.every((c,i)=>storyDone(i)); }
function storyReset(){ STORY.done={}; STORY.cur=0; storySave(); }

// =====================================================================
// 章节表
//   map      : CAMPAIGNS 的 id
//   obj      : 目标数组 —— 全部达成且成功撤离才算通关 (extract 由 finishRaid 判定)
//   lines    : 无线电台词 (按时间顺序, 由 events 的 say 触发)
//   events   : {at:秒} 定时 | {zone:[x,z,r]} 进入区域 | {on:'<objId>'} 目标达成
//              动作: say / spawn:N / alarm
//   reward   : {money, xp}
// =====================================================================
const STORY_CHAPTERS=[
{ id:'s1', no:1, name:'封锁线', map:'anvil_yard',
  tag:'地表 · 铁砧外围',
  brief:'渡鸦小队，这里是「渡鸦一号」。\n空投已确认，你现在站在瓦尔登老城北侧。NBK 在城里打穿了一个封存层，就在那片工业堆场底下——找到井架，确认竖井口还在，然后撤到南侧接应点。\n别恋战。这一趟只是确认门还开着。',
  obj:[
    {id:'shaft', type:'reach', x:0, z:0, r:9, label:'抵达钻井塔下的竖井口'},
    {id:'out',   type:'extract', label:'撤到南侧接应点'},
  ],
  events:[
    {at:20, say:'渡鸦一号：井架还亮着红灯，说明下面的电还在。小心，那也说明有人维护它。'},
    {zone:[0,0,30], once:true, say:'看到井口了。别靠太近——NBK 在井口周围留了人。', spawn:3},
    {on:'shaft', once:true, say:'确认：竖井口完好，可以下。现在撤。'},
  ],
  reward:{money:2500, xp:300} },

{ id:'s2', no:2, name:'封存层', map:'anvil_b2',
  tag:'地下 · 铁砧 B2',
  brief:'你下来了。\n这里是铁砧第三层——1980 年代华约挖的，1991 年封的，2021 年被 NBK 重新打开。\n北端是封存冷库，那一排低温罐就是当年泄漏的源头。带 3 份制剂样本上来，这是唯一能证明 NBK 在做什么的东西。\n注意：取样本会触发他们的警报。',
  obj:[
    {id:'sample', type:'fetch', key:'ledx', n:3, label:'取得制剂样本 ×3（撤离时必须带在身上）'},
    {id:'out',    type:'extract', label:'从北端升降机撤离'},
  ],
  events:[
    {at:15, say:'渡鸦一号：冷库在北端。应急灯还亮着，说明主电源没断——别碰配电箱。'},
    {on:'sample', once:true, say:'警报响了。他们知道你在这儿了，往北端升降机跑。', spawn:4, alarm:true},
    {zone:[0,0,26], once:true, say:'小心，中央大厅是开阔地，两侧都有房间。'},
  ],
  reward:{money:4200, xp:520} },

{ id:'s3', no:3, name:'证词', map:'lab',
  tag:'地下 · 实验室',
  brief:'样本只能证明「有什么」，证明不了「谁干的」。\nUSEC 在铁砧地下封了一个自己的设施，里面有 NBK 的作业记录。拿 2 份文件出来。\n那里的守备是 PMC 合同精锐——比井口那批硬得多。',
  obj:[
    {id:'doc', type:'fetch', key:'docs', n:2, label:'取得 NBK 作业记录 ×2'},
    {id:'out', type:'extract', label:'从北端净化闸门撤离'},
  ],
  events:[
    {at:25, say:'渡鸦一号：这层的照明几乎全废了。靠应急灯板认路，别开强光——你会变成靶子。'},
    {on:'doc', once:true, say:'记录到手。撤，别贪箱子。'},
  ],
  reward:{money:5000, xp:600} },

{ id:'s4', no:4, name:'押运', map:'port',
  tag:'港区 · 集装箱码头',
  brief:'记录里提到一个名字——封锁当天在港区值班的调度员。\n他还在城里，而且愿意说话。找到他，把他带到码头前沿的登船点。\n**他必须活着到。** 你的队友会跟着你，别让他掉队。',
  obj:[
    {id:'escort', type:'escort', x:44, z:0, r:20, n:1, label:'护送线人抵达码头前沿（至少 1 名队友存活并到位）'},
    {id:'out',    type:'extract', label:'登船离开'},
  ],
  events:[
    {at:20, say:'渡鸦一号：港区是海雾，能见度一般，但堆场里全是死角。走通道，别钻箱子缝。'},
    {at:70, say:'渡鸦一号：线人说他听见龙门吊那边有动静。'},
  ],
  reward:{money:5600, xp:700} },

{ id:'s5', no:5, name:'航线', map:'airport',
  tag:'机场 · 跑道与航站楼',
  brief:'线人交代了一件事：封锁当天有一架货机没起飞，货舱里是 NBK 要运走的最后一批东西。\n航单在航站楼里，但维和部队已经进场了——他们不想让任何人拿到它。\n你有 90 秒。跑道是开阔地，别在那儿停。',
  obj:[
    {id:'manifest', type:'fetch', key:'keycard', n:1, label:'取得货机航单 ×1'},
    {id:'wait', type:'survive', n:90, label:'在航站楼内撑住 90 秒（等接应窗口）'},
    {id:'out',  type:'extract', label:'撤到跑道东端'},
  ],
  events:[
    {at:10, say:'渡鸦一号：接应窗口 90 秒后打开。撑住。'},
    {at:60, spawn:3, say:'他们加人了。往东端跑，接应车在跑道尽头。'},
    {on:'manifest', once:true, say:'航单到手。别在跑道上停留。'},
  ],
  reward:{money:6400, xp:820} },

{ id:'s6', no:6, name:'灯亮着，就走', map:'port',
  tag:'港区 · 出海',
  brief:'你手里有三样东西：样本、记录、航单。\n现在只剩最后一件事——离开瓦尔登。\n港口有一张撤离通行证在流通。拿到它，带上船，**从港口登船离开禁区**。\n封锁线不会为你打开第二次。',
  obj:[
    {id:'out', type:'extract', label:'持「撤离通行证」从港口登船离开禁区'},
  ],
  events:[
    {at:25, say:'渡鸦一号：证在仓库里，出击前要在「撤离通行证」槽带上。别忘。'},
    {at:80, say:'渡鸦一号：船在等你。' },
  ],
  reward:{money:9000, xp:1200} },
];

// =====================================================================
// 局内状态
// =====================================================================
const SRAID={ ch:null, idx:-1, obj:[], t:0, fired:{}, live:false, ended:false, alarm:0, say:'', sayT:0 };

function storyPendingIdx(){
  try{ const v=localStorage.getItem('sf_story'); if(v==null) return -1; const n=parseInt(v,10); return isNaN(n)?-1:n; }catch(e){ return -1; }
}
function storyClearPending(){ try{ localStorage.removeItem('sf_story'); }catch(e){} }

// 34_nvg.owned() 会调它: 剧情配装**直接发放**夜视仪, 不走「工坊装支架」那道门控。
// ⚠️ 必须要求 SRAID.live —— 否则沙盒局也会白拿夜视仪 (沙盒的 RUN.nvgBrought/nvgKey 由 applyDeployLoadout 写)。
function storyNvgGranted(){
  return !!(SRAID.live&&typeof RUN!=='undefined'&&RUN&&RUN.nvgBrought&&RUN.nvgKey);
}

// startMatch() 调用: 把待打的章节装进 SRAID
// ⚠️ 外层 try/catch: 本函数由 startMatch() 调用, 抛错会中断建局 —— 剧情逻辑绝不能拖垮主流程。
function storyApplyChapter(){
  try{
    const i=storyPendingIdx();
    // ⚠️⚠️ **无论是否采纳都必须清掉待打标记**。曾写成 `if(SRAID.ch) storyClearPending();`,
    //    于是地图不匹配(玩家切了图)时标记会一直留着 → 之后**每次页面加载**都被 storyAutoDeploy
    //    强制进场, 玩家再也回不到正常菜单流程 (用户报「loop」)。
    storyClearPending();
    SRAID.ch=(i>=0&&STORY_CHAPTERS[i])?STORY_CHAPTERS[i]:null;
    // 一致性守卫: 章节地图必须与当前战役一致 —— 否则玩家切了图, 剧情会误挂上去
    if(SRAID.ch&&typeof CAMPAIGN!=='undefined'&&CAMPAIGN.id!==SRAID.ch.map) SRAID.ch=null;
    SRAID.idx=SRAID.ch?i:-1;
    SRAID.obj=SRAID.ch?SRAID.ch.obj.map(o=>Object.assign({},o,{met:false})):[];
    SRAID.t=0; SRAID.fired={}; SRAID.live=!!SRAID.ch; SRAID.ended=false; SRAID.alarm=0; SRAID.say=''; SRAID.sayT=0;
    storyRenderHud();
  }catch(e){ console.error('[story] applyChapter failed:',e); SRAID.ch=null; SRAID.live=false; storyClearPending(); }
}

// =====================================================================
// 目标判定
// =====================================================================
function storyObjMet(o){
  try{
    switch(o.type){
      case 'reach':   return Math.hypot(player.pos.x-o.x,player.pos.z-o.z) <= (o.r||8);
      case 'kill':    return (RUN.kills||0) >= (o.n||1);
      case 'survive': return SRAID.t >= (o.n||30);
      case 'fetch':   return (RUN.loot&&(RUN.loot[o.key]|0)||0) >= (o.n||1);
      case 'escort': {
        let c=0;
        for(const m of SQUAD.members){ if(m&&m.alive&&Math.hypot(m.pos.x-o.x,m.pos.z-o.z)<=(o.r||18)) c++; }
        return c >= (o.n||1);
      }
      case 'extract': return false;      // 由 finishRaid 判定
      default: return false;
    }
  }catch(e){ return false; }
}
// ⚠️ 结算判定必须用**局内锁存的 o.met**, 不能在这里重新求值:
//    reach 这类目标是「瞬时」的 —— 玩家抵达竖井口后继续走到撤离点, 结算时再算 hypot()
//    必然不在原地 → 目标判为未达成 → **章节永远无法通关** (线上实测: 章节完成后无法继续下一章)。
//    只有 escort 例外: 它要求「撤离那一刻队友仍在位」, 所以结算时必须重新求值。
function storyObjectivesMet(){
  for(const o of SRAID.obj){
    if(o.type==='extract') continue;
    if(o.type==='escort'){ if(!storyObjMet(o)) return false; continue; }
    if(o.met) continue;              // 局内已锁存
    if(storyObjMet(o)) continue;     // 兜底: kill / survive / fetch 这类单调目标
    return false;
  }
  return true;
}

// =====================================================================
// 脚本事件
// =====================================================================
// 在坐标附近召唤 n 名敌方增援 (复用 Bot, 构造函数自己会入列 soldiers/combatants)
function storySpawnAt(x,z,n,team){
  if(typeof Bot!=='function'||typeof soldiers==='undefined') return 0;
  let made=0;
  for(let i=0;i<(n||1);i++){
    try{
      const t=(team==null)?1:team;
      const b=new Bot(t, randi(0,4), 'NBK-'+(10+Math.floor(Math.random()*89)));
      b.spawn(true);
      const a=Math.random()*TAU, r=6+Math.random()*10;
      const px=x+Math.cos(a)*r, pz=z+Math.sin(a)*r;
      b.pos.set(px,0,pz);
      b.pos.y=standHeight(px,pz,10);
      b.path=null; b.decisionT=0;
      if(typeof b.aggroOn==='function'&&typeof player!=='undefined'&&player.alive) b.aggroOn(player);
      made++;
    }catch(e){}
  }
  return made;
}
function storyFireEvent(ev){
  if(ev.say){ SRAID.say=ev.say; SRAID.sayT=9; if(typeof showScorePop==='function') showScorePop(ev.say); }
  if(ev.spawn){
    const z=(ev.zone&&ev.zone.length>=2)?[ev.zone[0],ev.zone[1]]:[player.pos.x,player.pos.z];
    const n=storySpawnAt(z[0],z[1],ev.spawn,1);
    if(n&&typeof showScorePop==='function') showScorePop('⚠ 敌方增援 ×'+n);
  }
  if(ev.alarm) SRAID.alarm=1;
}
function storyUpdateEvents(){
  if(!SRAID.ch) return;
  const evs=SRAID.ch.events||[];
  for(let i=0;i<evs.length;i++){
    const ev=evs[i], key='e'+i;
    if(SRAID.fired[key]) continue;
    let hit=false;
    if(typeof ev.at==='number') hit=SRAID.t>=ev.at;
    else if(ev.on) hit=!!(SRAID.obj.find(o=>o.id===ev.on)&&SRAID.obj.find(o=>o.id===ev.on).met);
    else if(ev.zone) hit=Math.hypot(player.pos.x-ev.zone[0],player.pos.z-ev.zone[1])<=(ev.zone[2]||20);
    if(hit){ SRAID.fired[key]=1; storyFireEvent(ev); }
  }
}

// =====================================================================
// 每帧
// =====================================================================
function storyUpdate(dt){
  if(!SRAID.live||!player||!player.alive) return;
  SRAID.t+=dt;
  if(SRAID.alarm>0) SRAID.alarm-=dt;
  if(SRAID.sayT>0) SRAID.sayT-=dt;
  let changed=false;
  for(const o of SRAID.obj){
    if(o.met) continue;
    // escort 不锁存: 它要按「撤离那一刻队友是否在位」判, 锁存会让 HUD 一直显示已完成
    if(o.type==='extract'||o.type==='escort') continue;
    if(storyObjMet(o)){ o.met=true; changed=true; }
  }
  storyUpdateEvents();
  if(changed||SRAID.sayT>0) storyRenderHud();
}
// wrap 一个每帧都会被调用的函数 (与 39_quests 包 updateExtraction 同一手法)
// ⚠️⚠️ storyUpdate 在**每帧**路径上, 必须包 try/catch:
//   一旦它抛错 ① 主循环后半段 (updateFlashlight/updateHUD/updateStrobe…) 全都不执行,
//   ② 控制台每帧刷同一条错误。**一个剧情 bug 不能拖垮整个游戏。**
//   出错只报一次, 然后停用剧情逻辑 (其余功能照常)。
let _storyBroken=false;
const _storyOrigMedCrates=updateMedCrates;
updateMedCrates=function(dt){
  _storyOrigMedCrates(dt);
  if(_storyBroken) return;
  try{ storyUpdate(dt); }
  catch(e){ _storyBroken=true; console.error('[story] storyUpdate 抛错, 已停用剧情逻辑 (游戏其余部分不受影响):', e); }
};

// =====================================================================
// 剧情物品保底掉落
// ⚠️ 为什么需要: 章节要"取回 N 份样本/文件", 若只靠通用稀有掉落, 会变成运气游戏 ——
//    玩家可能连开 20 个箱子也凑不齐, 目标无法完成。这里在箱子掉落上再加一层:
//    只要玩家**还没凑够**, 该物品就有概率直接出现在箱子里 (self-limiting, 凑够就停)。
// ⚠️ 掉落链是三层包装 (38_tarkov → 41_raidloot → 43_maps), 本文件最后加载 → 再包一层最外层。
// =====================================================================
function storyCrateBonus(out){
  if(!SRAID.live||!SRAID.ch||!out) return;
  for(const o of SRAID.obj){
    if(o.type!=='fetch') continue;
    const have=(out[o.key]|0)+((RUN.loot&&RUN.loot[o.key])|0);
    if(have<(o.n||1)&&Math.random()<0.35) out[o.key]=(out[o.key]||0)+1;
  }
}
// =====================================================================
// 剧情模式: 固定配装 (无需选择装备)
//   M4 + M1911 · 手雷 ×2 · 医疗包 ×2 · 手术包 ×1
// ⚠️ 只在剧情局生效, 且**不写进 META** —— 玩家的沙盒配装与仓库不受影响。
// ⚠️ 必须 wrap 在 46_throwables 的 deployPlayer 包装之外 (本文件加载最晚 ✓):
//    它的包装会在 deployPlayer 里调 applyThrowablesToPlayer() 按 RUN.throwables 覆盖手雷数。
// =====================================================================
function storyApplyKit(){
  if(!SRAID.live||typeof player==='undefined'||!player) return;
  const p=player;
  const mk=k=>{ const md=(typeof moddedDef==='function'&&moddedDef(k))||WPN_DEFS[k]; return {key:k,def:md,mag:md.mag,reserve:md.reserve}; };
  try{
    if(WPN_DEFS.m4&&WPN_DEFS.m1911){
      p.slots=[mk('m4'),mk('m1911')];
      p.curSlot=0; p.curW=p.slots[0];
      if(typeof vmEquip==='function') vmEquip(p.curW.key,p.team);
    }
    p.nadeCount=2; p.flashCount=0; p.smokeCount=0;
    const mu=(typeof MED_DEFS!=='undefined'&&MED_DEFS.medkit&&MED_DEFS.medkit.uses)||1;
    const cu=(typeof MED_DEFS!=='undefined'&&MED_DEFS.cms&&MED_DEFS.cms.uses)||1;
    p.medItems=[{key:'medkit',uses:mu},{key:'medkit',uses:mu},{key:'cms',uses:cu}];
    p._medIdx=undefined;
    p.foodItems=[];
    // 夜视仪: 剧情配装直接给**全景夜视仪**(GPNVG-18 · 118°) —— 地下章节(铁砧 B2 / 实验室)太黑。
    // ⚠️ 只写 RUN + 内存判断, 不碰 META.loadout / PLAYER_MODS → 玩家存档与沙盒配装完全不受影响。
    RUN.nvgBrought=true; RUN.nvgKey='nvg_pano';
    if(typeof showScorePop==='function') showScorePop('剧情配装：M4 + M1911 · 手雷×2 · 医疗包×2 · 手术包×1 · 全景夜视仪(按 N 开关)');
  }catch(e){ console.warn('[story] kit failed',e); }
}
const _storyOrigDeployPlayer=deployPlayer;
deployPlayer=function(){ const r=_storyOrigDeployPlayer.apply(this,arguments); storyApplyKit(); return r; };

// ---- 剧情局: 跳过装备选择, 自动进场 ----
// 等部署界面出现后替玩家点「部署」(与手点完全同一条链路: consumeRaidStart + deployPlayer)。
(function storyAutoDeploy(){
  const _pi=storyPendingIdx();
  if(_pi<0||!STORY_CHAPTERS[_pi]) return;
  // ⚠️ 地图不匹配就别进场 (玩家可能切了图): 清掉标记并放弃 —— 否则会被反复强制进场
  if(typeof CAMPAIGN!=='undefined'&&CAMPAIGN.id!==STORY_CHAPTERS[_pi].map){ storyClearPending(); return; }
  let n=0;
  const t=setInterval(()=>{
    if(++n>150){ clearInterval(t); return; }   // 最多等 ~12s 就放弃
    const dep=document.getElementById('deploy');
    const db=document.getElementById('deployBtn');
    if(!dep||!db) return;
    if(dep.classList.contains('hidden')) return;   // 部署界面还没打开
    clearInterval(t);
    try{ if(typeof db.onclick==='function') db.onclick(); }catch(e){ console.warn('[story] auto deploy failed',e); }
  },80);
})();
const _storyOrigCrateLoot=rollCrateLootList;
rollCrateLootList=function(crate){
  const out=_storyOrigCrateLoot(crate);
  try{ storyCrateBonus(out); }catch(e){}
  return out;
};

// =====================================================================
// 结算: 由 finishRaid(extracted) 调用
// =====================================================================
function storyOnRaidEnd(extracted){
  if(!SRAID.live||SRAID.ended) return null;
  SRAID.ended=true;
  const ch=SRAID.ch, i=SRAID.idx;
  const all=storyObjectivesMet();
  const ok=!!(extracted&&all);
  let msg='';
  if(ok){
    if(!STORY.done[ch.id]) STORY.done[ch.id]=true;
    if(STORY.cur<=i) STORY.cur=Math.min(i+1,STORY_CHAPTERS.length-1);
    storySave();
    const rw=ch.reward||{};
    if(rw.money&&typeof META!=='undefined'){ META.wallet=(META.wallet||0)+rw.money; }
    if(rw.xp&&typeof gainXP==='function') gainXP(rw.xp);
    if(typeof saveMeta==='function') saveMeta();
    msg='剧情 · 第'+ch.no+'章「'+ch.name+'」完成'+(rw.money?(' · +¥'+formatMoney(rw.money)):'')+(rw.xp?(' · +'+rw.xp+' XP'):'');
    if(typeof showScorePop==='function') showScorePop(msg);
    const nx=STORY_CHAPTERS[i+1];
    if(nx) setTimeout(()=>{ if(typeof showScorePop==='function') showScorePop('已解锁：第'+nx.no+'章「'+nx.name+'」'); },2200);
    else setTimeout(()=>{ if(typeof showScorePop==='function') showScorePop('全部章节完成 · 你离开瓦尔登了'); },2200);
  } else {
    const miss=SRAID.obj.filter(o=>o.type!=='extract'&&!o.met).map(o=>o.label);
    msg=extracted?('剧情未达成 · 还差：'+miss.join('、')):'剧情失败 · 任务中断';
    if(typeof showScorePop==='function') showScorePop(msg);
  }
  storyRenderHud();
  return {ok:ok,msg:msg};
}

// =====================================================================
// UI
// =====================================================================
function storyRenderHud(){
  const box=document.getElementById('storyHud');
  if(!box) return;
  if(!SRAID.live||!SRAID.ch){ box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  const ch=SRAID.ch;
  let h='<div class="shTitle">剧情 · 第'+ch.no+'章 「'+ch.name+'」</div>';
  for(const o of SRAID.obj){
    const met=o.type==='extract'?false:o.met;
    let prog='';
    if(o.type==='fetch') prog=' '+Math.min(RUN.loot[o.key]|0,o.n)+'/'+o.n;
    else if(o.type==='survive') prog=' '+Math.min(Math.floor(SRAID.t),o.n)+'/'+o.n+'s';
    else if(o.type==='kill') prog=' '+Math.min(RUN.kills|0,o.n)+'/'+o.n;
    h+='<div class="shObj'+(met?' ok':'')+'">'+(met?'✔':'▸')+' '+o.label+prog+'</div>';
  }
  if(SRAID.sayT>0&&SRAID.say) h+='<div class="shSay">'+SRAID.say+'</div>';
  box.innerHTML=h;
}
function storyRenderPanel(){
  const box=document.getElementById('storyList');
  if(!box) return;
  let h='<div class="storyHead">瓦尔登隔离禁区 · 行动档案</div>';
  h+='<div class="storySub">共 '+STORY_CHAPTERS.length+' 章 · 已完成 '+STORY_CHAPTERS.filter((c,i)=>storyDone(i)).length+' 章'+(storyCleared()?' · <b style="color:#ffd77a">全部完成</b>':'')+'</div>';
  STORY_CHAPTERS.forEach((c,i)=>{
    const done=storyDone(i), un=storyUnlocked(i);
    h+='<div class="storyCard'+(done?' done':'')+(un?'':' lock')+'">';
    h+='<div class="scNo">第 '+c.no+' 章</div>';
    h+='<div class="scName">'+c.name+(done?' ✔':'')+'</div>';
    h+='<div class="scTag">'+c.tag+'</div>';
    h+='<div class="scBrief">'+String(c.brief||'').replace(/\n/g,'<br>')+'</div>';
    h+='<div class="scObj">目标：'+c.obj.map(o=>o.label).join(' ／ ')+'</div>';
    h+='<div class="scKit">配装：M4 + M1911 · 手雷×2 · 医疗包×2 · 手术包×1 · 全景夜视仪（自动配备，无需选择 · 按 N 开关夜视）</div>';
    const rw=c.reward||{};
    h+='<div class="scRw">奖励：'+(rw.money?('¥'+formatMoney(rw.money)):'—')+(rw.xp?(' · '+rw.xp+' XP'):'')+'</div>';
    h+= un
      ? '<button class="bigBtn scBtn" data-story="'+i+'">'+(done?'再 打 一 次':'开 始 行 动')+'</button>'
      : '<button class="bigBtn scBtn" disabled style="opacity:.45">需先完成第 '+(c.no-1)+' 章</button>';
    h+='</div>';
  });
  if(storyCleared()) h+='<div class="storyFoot">你离开了瓦尔登。<br><button class="optBtn" id="storyResetBtn" style="margin-top:8px">重置剧情进度</button></div>';
  box.innerHTML=h;
  box.querySelectorAll('[data-story]').forEach(b=>{
    b.onclick=()=>{ if(typeof AudioSys!=='undefined'&&AudioSys.click) AudioSys.click(1400,0.18,0.03); storyStart(parseInt(b.dataset.story,10)); };
  });
  const rb=document.getElementById('storyResetBtn');
  if(rb) rb.onclick=()=>{ if(confirm('重置剧情进度？只清剧情章节，仓库与货币不动。')){ storyReset(); storyRenderPanel(); } };
}
function storyStart(i){
  if(!storyUnlocked(i)) return;
  const ch=STORY_CHAPTERS[i];
  const idx=CAMPAIGNS.findIndex(c=>c.id===ch.map);
  if(idx<0){ if(typeof showScorePop==='function') showScorePop('剧情地图缺失：'+ch.map); return; }
  STORY.cur=i; storySave();
  try{
    localStorage.setItem('sf_campaign',String(idx));
    localStorage.setItem('sf_story',String(i));
    localStorage.setItem('sf_autodeploy','1');
  }catch(e){}
  location.reload();
}
// 局内快捷键/控制台入口
window.STORY={ chapters:STORY_CHAPTERS, state:STORY, raid:SRAID, start:storyStart, reset:storyReset, render:storyRenderPanel };
