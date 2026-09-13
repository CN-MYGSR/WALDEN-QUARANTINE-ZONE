'use strict';
// ===================== 撤离突袭结算 =====================
function startExtraction(){
 if(!player.alive||GAMEMODE!=='extract'||matchOver) return;
 RUN.extracting=true;
 showScorePop('正在撤离...');
}
function updateExtraction(dt){
 if(GAMEMODE!=='extract'||matchOver){
  const hud=document.getElementById('extractHud');
  if(hud) hud.classList.add('hidden');
  return;
 }
 if(!player.deployed){
  const hud=document.getElementById('extractHud');
  if(hud) hud.classList.add('hidden');
  return;
 }
 matchTime=Math.max(0,matchTime-dt);
 if(matchTime<=0){ finishRaid(false); return; }
 const hud=document.getElementById('extractHud');
 // 支持多个撤离点: 取玩家当前所在(且最近)的那一个; 不在任何撤离区内则重置进度
 let ex=null, bd=1e9;
 for(const p of EXTRACT_POINTS){
  const dd=Math.hypot(player.pos.x-p.x,player.pos.z-p.z);
  if(dd<p.r && dd<bd){ bd=dd; ex=p; }
 }
 if(!ex||!player.alive){
  RUN.extracting=false;
  for(const p of EXTRACT_POINTS) p.progress=0;
  if(hud) hud.classList.add('hidden');
  return;
 }
 const hold=ex.holdTime||6;
 // 通行证不再是"撤离点的准入卡": 任何人都可以在撤离点撤离(普通结算)。
 // 持有「撤离通行证」时, 这次撤离才算"离开瓦尔登禁区", 解锁结局并可重生 (见 39_quests)。
 if(!RUN.extracting){ RUN.extracting=true; showScorePop('到达撤离点 · 保持区域内'); }
 ex.progress=Math.min(hold,ex.progress+dt);
 if(hud){
  hud.classList.remove('hidden');
  const bar=document.getElementById('extractBar');
  if(bar){
   bar.style.width=`${Math.round(ex.progress/hold*100)}%`;
   const t=document.getElementById('extractTxt');
   const notice=(typeof extractionPassNotice==='function')?extractionPassNotice():'';
   if(t) t.textContent=`撤离 ${Math.ceil(hold-ex.progress)} 秒`+(notice?` · ${notice}`:'');
  }
 }
 if(ex.progress>=hold) finishRaid(true);
}
function finishRaid(extracted){
 if(matchOver) return;
 matchOver=true;
 const lootSnapshot={...RUN.loot};
 const lootValue=runLootValue();
 const lootTotal=runLootTotal();
 if(extracted) mergeRunLoot();
 // ELO 动态难度: 结算本局评分。撤离成功/阵亡/超时都收口到这里, 是唯一的评分入口。
 // lootValue 必须在 mergeRunLoot() 之前取 (成功后 RUN.loot 会被清空)。
 const eloRes=(typeof eloApplyRaid==='function')?eloApplyRaid(extracted,lootValue):null;
 // 必须在消耗前记录: 持证人在「港口」登船 = 离开瓦尔登隔离禁区, 解锁结局并可重生。
 // 通行证是一张"船票", 只在港口有效; 别的地图持证撤离同样只是普通结算。
 const hadPass=extracted&&typeof passUsable==='function'?passUsable():false;
 // 只有真正用上了那张船票才消耗 (见 39_quests 的 PASS_MAP)
 if(extracted&&hadPass&&typeof consumeExtractionPass==='function') consumeExtractionPass();
 RUN.hadPass=hadPass;
 // ===== 失败补偿 =====
 // 兜底: 若未经 onPlayerRaidDeath 路径(如超时未撤离), 在此补发一次。
 // 用 RUN.failComp 作为"本局是否已发放"的标记, 避免与阵亡路径重复发放。
 if(!extracted&&!RUN.failComp){
  const bonus=Math.min(200,(RUN.kills||0)*40);
  RUN.failComp=grantFailCompensation(bonus);
 }
 if(!extracted&&typeof ensureSafetyKit==='function') ensureSafetyKit('fail');
 if(document.exitPointerLock) document.exitPointerLock();
 document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden'));
 const end=document.getElementById('end');
 const endTitle=document.getElementById('endTitle');
 const endStats=document.getElementById('endStats');
 const hud=document.getElementById('extractHud');
 if(hud) hud.classList.add('hidden');
 if(end) end.classList.remove('hidden');
 const armoryBtn=document.getElementById('armoryBtn');
 if(armoryBtn) armoryBtn.onclick=openArmoryFromEnd;
 if(endTitle){
  endTitle.textContent=!extracted?'任 务 失 败':(hadPass?'离 开 瓦 尔 登 · 结 局':'撤 离 成 功');
  endTitle.className=extracted?'win':'lose';
 }
 const lootRows=Object.entries(lootSnapshot).length
  ?Object.entries(lootSnapshot).map(([k,n])=>`${itemName(k)} ×${n}`).join(' · ')
  :'无';
 let gearLine='';
 if(RUN.lostGear&&RUN.lostGear.length) gearLine+=`<div style="margin-top:6px;color:#e09080;font-size:13px">丢失装备: ${RUN.lostGear.map(k=>itemName(k)).join(' · ')}</div>`;
 if(RUN.returnedGear&&RUN.returnedGear.length) gearLine+=`<div style="margin-top:4px;color:#b8d0e8;font-size:13px">保险赔付(主菜单领取): ${RUN.returnedGear.map(k=>itemName(k)).join(' · ')}</div>`;
 // 失败补偿 + 保底补给提示
 if(!extracted&&RUN.failComp>0){
  gearLine+=`<div style="margin-top:8px;padding:7px 10px;background:rgba(120,200,140,.12);border:1px solid rgba(120,200,140,.35);border-radius:4px;color:#9fe6b4;font-size:13px">`
   +`失败补偿 <b>+${formatMoney(RUN.failComp)}</b> 作战货币 · 当前余额 <b>${formatMoney(META.wallet)}</b>`
   +(RUN.autoKit&&RUN.autoKit.length?`<br><span style="color:#cfe0c8">保底补给: <b>${RUN.autoKit.map(k=>itemName(k)).join(' · ')}</b> 已发放至仓库</span>`:'')
   +`</div>`;
 }
 // ELO 结算行: 让玩家看得见"为什么下一局会更难/更简单"
let eloLine='';
if(eloRes){
  const up=eloRes.delta>0, c=up?'#9fe6b4':(eloRes.delta===0?'#c8d2b8':'#e09080');
  eloLine=`<div style="margin-top:8px;padding:7px 10px;background:rgba(120,160,220,.10);border:1px solid rgba(120,160,220,.30);border-radius:4px;color:#c8d8e8;font-size:13px">`
   +`ELO 动态难度 · <b>${eloRes.from}</b> → <b style="color:${c};font-size:15px">${eloRes.to}</b> `
   +`<b style="color:${c}">(${up?'+':''}${eloRes.delta})</b> · ${eloRes.tier}`
   +`<div style="margin-top:3px;color:#9fb8d0;font-size:12px">本局表现 ${Math.round(eloRes.perf*100)}% · 下一局 ${eloSummary()}</div>`
   +`</div>`;
}
if(endStats){
  endStats.innerHTML=
   `<div style="font-size:14px;color:#c8d8e8">击杀 <b>${RUN.kills}</b> · 搜索 <b>${RUN.searches}</b> · 带出 <b>${lootTotal}</b> 件</div>`+
   `<div style="margin-top:8px;color:#d8c59a;font-size:13px">${lootRows}</div>`+
   `<div style="margin-top:8px;color:#b8e0b8">${extracted?`战利品已存入仓库 · 预计出售价值 ${formatMoney(lootValue)} 作战货币`:'未撤离，战利品与携带装备已丢失'}</div>`+
   (extracted?(hadPass
     ?`<div style="margin-top:8px;color:#c9a6ff;font-size:13px">持「撤离通行证」从港口登船 · 已离开瓦尔登隔离禁区，解锁结局</div>`
     :(CAMPAIGN.id==='port'
      ?`<div style="margin-top:8px;color:#9fb8d0;font-size:13px">普通撤离 · 未持通行证，不解锁结局（完成全部任务后可在市集买一张船票）</div>`
      :`<div style="margin-top:8px;color:#9fb8d0;font-size:13px">普通撤离 · 「撤离通行证」是瓦尔登港的船票，只在「港口」有效，本地图不解锁结局</div>`)):'')+
   gearLine+eloLine;
 }
 // 持证撤离成功 → 结算画面追加「重生」按钮 (见 39_quests)
 if(extracted&&hadPass&&typeof addRebirthButton==='function') addRebirthButton();
}
