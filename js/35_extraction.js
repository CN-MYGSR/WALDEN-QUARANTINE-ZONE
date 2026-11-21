'use strict';
// ===================== 撤离突袭结算 =====================
function startExtraction(){
 if(!player.alive||GAMEMODE!=='extract'||matchOver||RUN.extracting) return;
 RUN.extracting=true;
 showScorePop('到达撤离点 · 保持区域内');
}
function updateExtraction(dt){
 if(GAMEMODE!=='extract'||matchOver||RUN.deathTimer||CAMPAIGN.rangeOnly){
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
 // 超时 = 撤离窗口关闭: 提示「无线电信号丢失」, 并**按阵亡处理**(装备丢失/保险/失败补偿)
 if(matchTime<=0){
  RUN.timeout=true;
  if(typeof showScorePop==='function') showScorePop('无线电信号丢失');
  if(typeof onPlayerRaidDeath==='function') onPlayerRaidDeath();
  else finishRaid(false);
  return;
 }
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
 const hold=ex.holdTime||3;   // 3 秒 (2026-09-18: 5 分钟局里 6 秒太长)
 // 通行证不再是"撤离点的准入卡": 任何人都可以在撤离点撤离(普通结算)。
 // 持有「撤离通行证」时, 这次撤离才算"离开瓦尔登禁区", 解锁结局并可重生 (见 39_quests)。
 if(!RUN.extracting) startExtraction();
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
// 各模式共用同一份结算布局。物品名和玩家名可能来自工坊或联机房间。
// 同一个字幕节点跟随战报显隐，直接重开或切换面板时也会回到 HUD。
new MutationObserver(()=>{
 const end=el('end'), sub=el('voSub');
 if(end.classList.contains('hidden')) el('ui').append(sub);
 else end.querySelector('.reportActions').before(sub);
}).observe(el('end'),{attributes:true,attributeFilter:['class']});
function reportElement(tag,text){
 const node=document.createElement(tag);
 if(text!=null) node.textContent=String(text);
 return node;
}
function reportMetrics(entries){
 const dl=reportElement('dl'); dl.className='reportMetrics';
 for(const [label,value] of entries){
  const pair=reportElement('div');
  pair.append(reportElement('dt',label),reportElement('dd',value)); dl.append(pair);
 }
 el('endStats').append(dl);
}
function reportGroup(title,lines=[],items={}){
 const group=reportElement('section'); group.className='reportGroup';
 group.append(reportElement('h2',title));
 for(const line of lines) if(line) group.append(reportElement('p',line));
 const entries=Object.entries(items).filter(([,n])=>n>0);
 if(entries.length){
  const list=reportElement('ul'); list.className='reportItems';
  for(const [key,n] of entries){
   const li=reportElement('li'); li.append(reportElement('span',itemName(key)),reportElement('b','×'+n)); list.append(li);
  }
  group.append(list);
 }
 el('endStats').append(group);
 return group;
}
function prepareReport(result,win,storyResult=null){
 const end=el('end'), box=el('endStats'), title=el('endTitle'), again=el('againBtn'), back=el('armoryBtn');
 if(document.pointerLockElement) document.exitPointerLock();
 document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('hidden',s!==end));
 box.replaceChildren(); box.scrollTop=0;
 el('rebirthBtn')?.remove();
 title.textContent=result; title.className=win?'win':'lose';
 const chapter=storyResult&&SRAID.ch;
 el('reportMap').textContent=(CAMPAIGN.mapName||CAMPAIGN.title)+(chapter?'　/　第'+chapter.no+'章 '+chapter.name:'');
 const choose=id=>{ end.classList.add('hidden'); el('menu').classList.remove('hidden'); showMenuPanel(id); };
 if(CAMPAIGN.rangeOnly){ again.textContent='再练一次'; again.onclick=rangeOpen; }
 else if(chapter&&!storyResult.ok){ again.textContent='重试本章'; again.onclick=()=>storyStart(SRAID.idx); }
 else if(chapter){ again.textContent='选择剧情章节'; again.onclick=()=>choose('mStory'); }
 else{ again.textContent='准备下一局'; again.onclick=()=>choose('mPlay'); }
 back.textContent=CAMPAIGN.rangeOnly?'返回主菜单':'回到仓库';
 back.onclick=CAMPAIGN.rangeOnly?rangeLeave:openArmoryFromEnd;
 title.focus({preventScroll:true});
}
function finishRangeTraining(){
 matchOver=true;
 if(typeof VO!=='undefined') VO.stop();
 prepareReport('训练结束',true);
 reportMetrics([['射击',RANGE.shots],['命中',RANGE.hits],['命中率',(RANGE.shots?Math.round(RANGE.hits/RANGE.shots*100):0)+'%']]);
 reportGroup('靶场训练',['靶场的装备与物资不计入仓库。']);
}
function finishRaid(extracted){
 if(matchOver) return;
 matchOver=true;
 lootPanelClose(false);
 bagPanelClose();
 closeMedWheel();
 clearTimeout(RUN.deathTimer); RUN.deathTimer=0;
 if(CAMPAIGN.rangeOnly){ finishRangeTraining(); return; }
 // 剧情模式: 判定本章成败并推进 (必须在 mergeRunLoot 之前 —— 目标要读 RUN.loot 里的样本/文件)
 let storyResult=null;
 if(typeof storyOnRaidEnd==='function'){ try{ storyResult=storyOnRaidEnd(extracted); }catch(e){ console.error('[story] onRaidEnd failed:',e); } }
 const lootSnapshot=extracted?extractedLoot():{...RUN.loot};
 const lootValue=Object.entries(lootSnapshot).reduce((v,[k,n])=>v+itemSellPrice(k)*n,0);
 if(extracted){
  META.stats.kills+=RUN.kills||0;
  META.stats.deaths+=player.deaths||0;
  mergeRunLoot(lootSnapshot);
 }else settleRaidLoss();
 // ELO 动态难度: 结算本局评分。撤离成功/阵亡/超时都收口到这里, 是唯一的评分入口。
 // lootValue 必须在 mergeRunLoot() 之前取 (成功后 RUN.loot 会被清空)。
 const eloRes=typeof eloApplyRaid==='function'?eloApplyRaid(extracted,lootValue):null;
 // 必须在消耗前记录: 持证人在「港口」登船 = 离开瓦尔登隔离禁区, 解锁结局并可重生。
 // 通行证是一张"船票", 只在港口有效; 别的地图持证撤离同样只是普通结算。
 const hadPass=extracted&&typeof passUsable==='function'?passUsable():false;
 // 只有真正用上了那张船票才消耗 (见 39_quests 的 PASS_MAP)
 if(extracted&&hadPass&&typeof consumeExtractionPass==='function') consumeExtractionPass();
 RUN.hadPass=hadPass;
 const hud=document.getElementById('extractHud');
 if(hud) hud.classList.add('hidden');
 let result='撤离成功';
 if(!extracted) result=RUN.timeout?'无线电信号丢失':'撤离失败';
 else if(storyResult&&!storyResult.ok) result='已撤离，章节未完成';
 else if(hadPass) result='离开瓦尔登';
 else if(storyResult) result='章节完成';
 prepareReport(result,extracted,storyResult);
 const loss=extracted?null:RUN.lossReport;
 const kept=extracted?lootSnapshot:(loss?.secure||{});
 const keptCount=Object.values(kept).reduce((total,n)=>total+n,0);
 reportMetrics([['击杀',RUN.kills||0],['搜索',RUN.searches||0],[extracted?'带出物资':'安全箱保留',keptCount+' 件']]);
 if(storyResult) reportGroup('剧情进度',[storyResult.msg]);
 if(extracted){
  reportGroup('撤离物资',[keptCount?'战利品已存入仓库 · 预计出售价值 ¥'+formatMoney(lootValue):'本局没有携出物资。'],kept);
 }else{
  if(keptCount) reportGroup('安全箱已保留',['以下物品已存入仓库。'],kept);
  const lost=loss?.bag||{};
  reportGroup('背包损失',Object.keys(lost).length?[]:['背包里没有丢失的物资。'],lost);
  if(RUN.lostGear?.length) reportGroup('丢失装备',[RUN.lostGear.map(itemName).join('、')]);
  if(RUN.returnedGear?.length) reportGroup('保险返还',['已返还至装备库存：'+RUN.returnedGear.map(itemName).join('、')]);
  if(RUN.failComp>0||RUN.autoKit?.length){
   reportGroup('补偿与补给',[
    RUN.failComp>0?'失败补偿 +¥'+formatMoney(RUN.failComp)+' · 当前余额 ¥'+formatMoney(META.wallet):'',
    RUN.autoKit?.length?'保底补给已发放至仓库 · '+RUN.autoKit.map(itemName).join('、'):''
   ]);
  }
 }
 if(extracted){
  const passage=hadPass?'已持撤离通行证从港口登船，解锁结局。':CAMPAIGN.id==='port'
   ?'普通撤离。本次未持通行证，尚未解锁结局。完成全部任务后可在市集购买船票。'
   :'普通撤离。持撤离通行证从瓦尔登港登船可以解锁结局。';
  reportGroup('撤离记录',[passage]);
 }
 if(eloRes) reportGroup('ELO 动态难度',[
  eloRes.from+' → '+eloRes.to+'（'+(eloRes.delta>0?'+':'')+eloRes.delta+'） · '+eloRes.tier,
  '本局表现 '+Math.round(eloRes.perf*100)+'% · 下一局 '+eloSummary()
 ]);
 if(extracted&&hadPass&&typeof addRebirthButton==='function') addRebirthButton();
}
