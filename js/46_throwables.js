'use strict';
// ===================== 投掷物自费化 (手雷 / 闪光弹 / 烟雾弹) =====================
// 2026-09-13 改版, 规则如下:
//  1. 三种投掷物改为"自费": 在市集用作战货币买进仓库 → 部署界面选携带数量 → 出击时从仓库扣除。
//     用掉或阵亡即永久损失, 不再每局按兵种免费发放 (补给箱也不再补发投掷物)。
//  2. 快捷键: 3 = 手雷(按住右键蓄力, 松开投出) · 4 = 闪光弹 · 5 = 烟雾弹 · 6 = 工事(工程兵)。
//  3. AT 雷(超模)已从玩家与 NPC 双方移除。
// 本文件在 38_tarkov / 39_quests / 43_maps / 44_deathcam 之后加载, 全部用包裹式扩展,
// 不改动既有函数体。依赖的全局: META / RUN / player / soldiers / Bot / el / saveMeta / ownedCount。

const THROW_DEFS={
 nade_frag :{name:'手雷',  key:'3',size:1,weight:0.6,price:620,tier:2,field:'nadeCount', flag:null,
             desc:'3.8 秒引信 · 破片杀伤半径 6.5m · [3] 拿出后按住右键蓄力, 松开投出'},
 nade_flash:{name:'闪光弹',key:'4',size:1,weight:0.4,price:540,tier:3,field:'flashCount',flag:'nadeIsFlash',
             desc:'1.6 秒引信 · 半径 14m 内致盲 6 秒(含友军) · 不造成伤害 · [4] 直接投出'},
 nade_smoke:{name:'烟雾弹',key:'5',size:1,weight:0.5,price:380,tier:1,field:'smokeCount',flag:'nadeIsSmoke',
             desc:'1.8 秒引信 · 20 秒烟幕 · [5] 直接投出'}
};
const THROW_KEYS=Object.keys(THROW_DEFS);
// 闪光弹参数
const FLASH_RADIUS=14;      // 致盲半径(m)
const FLASH_TIME=6.0;       // 满曝致盲时长(s)

// ---------- 物品 API 扩展 (包裹 38_tarkov 的统一版本) ----------
const _tItemSizeOf=itemSizeOf;
itemSizeOf=function(k){ return THROW_DEFS[k]?THROW_DEFS[k].size:_tItemSizeOf(k); };
const _tItemWeightOf=itemWeightOf;
itemWeightOf=function(k){ return THROW_DEFS[k]?THROW_DEFS[k].weight:_tItemWeightOf(k); };
const _tItemPriceOf=itemPriceOf;
itemPriceOf=function(k){ return THROW_DEFS[k]?THROW_DEFS[k].price:_tItemPriceOf(k); };
const _tItemLabel=itemLabel;
itemLabel=function(k){ return THROW_DEFS[k]?THROW_DEFS[k].name:_tItemLabel(k); };
const _tItemName=itemName;
itemName=function(k){ return THROW_DEFS[k]?THROW_DEFS[k].name:_tItemName(k); };
const _tItemDescOf=itemDescOf;
itemDescOf=function(k){ return THROW_DEFS[k]?THROW_DEFS[k].desc:_tItemDescOf(k); };
const _tItemKind=itemKind;
itemKind=function(k){ return THROW_DEFS[k]?'throw':_tItemKind(k); };
const _tItemIconOf=itemIconOf;
itemIconOf=function(k){ return THROW_DEFS[k]?'✷':_tItemIconOf(k); };
const _tItemSell=itemSellPrice;
itemSellPrice=function(k){ return THROW_DEFS[k]?Math.max(15,Math.floor(THROW_DEFS[k].price*0.45)):_tItemSell(k); };
// 市集上架 + 等级锁 (默认取 tier)。插在"食物/药品"之后而不是列表末尾 ——
// 投掷物是立即要用的战斗消耗品, 沉在杂物/背包下面基本没人会翻到。
const TRADE_INSERT=(typeof FOOD_DEFS!=='undefined'?Object.keys(FOOD_DEFS).length:0)
                  +(typeof MED_DEFS!=='undefined'?Object.keys(MED_DEFS).length:0);
const TRADE_MISSING=THROW_KEYS.filter(k=>TRADE_KEYS.indexOf(k)<0);
if(TRADE_MISSING.length) TRADE_KEYS.splice(TRADE_INSERT,0,...TRADE_MISSING);
if(typeof TRADE_LEVEL!=='undefined') for(const k of THROW_KEYS) if(!TRADE_LEVEL[k]) TRADE_LEVEL[k]=THROW_DEFS[k].tier||1;

// ---------- 存档字段 ----------
// 老存档没有 throwables 字段, 这里惰性补齐(37_meta 的 normalizeMeta 在本文件之前已跑完)
function throwLoadout(){
 const L=(typeof META!=='undefined'&&META.loadout)?META.loadout:{};
 if(!L.throwables||typeof L.throwables!=='object'||Array.isArray(L.throwables)) L.throwables={};
 for(const k of THROW_KEYS){
  const n=L.throwables[k];
  L.throwables[k]=(typeof n==='number'&&isFinite(n)&&n>0)?Math.floor(n):0;
 }
 return L.throwables;
}
function throwOwned(k){ return (typeof ownedCount==='function')?ownedCount(k):(META.owned[k]||0); }
// 首次进入自费制时发一份起步投掷物, 避免"改完就没有手雷可用"的断层 (只发一次)
if(typeof META!=='undefined'&&META&&!META.seed3){
 META.owned= META.owned||{};
 META.owned.nade_frag=(META.owned.nade_frag||0)+2;
 META.owned.nade_smoke=(META.owned.nade_smoke||0)+1;
 META.seed3=true;
 if(typeof saveMeta==='function') saveMeta();
}
// 携带数不能超过仓库存量; 玩家从未手动调过时, 默认把仓库里已有的全带上
function clampThrowLoadout(){
 const want=throwLoadout();
 let changed=false;
 for(const k of THROW_KEYS){
  const own=throwOwned(k);
  if(want[k]>own){ want[k]=own; changed=true; }
 }
 if(!META.throwTouched){
  let any=0, all=0;
  for(const k of THROW_KEYS){ any+=want[k]; all+=throwOwned(k); }
  if(any===0&&all>0){
   for(const k of THROW_KEYS) want[k]=throwOwned(k);
   changed=true;
  }
 }
 if(changed&&typeof saveMeta==='function') saveMeta();
 return want;
}
// 玩家手动改过数量后就不再自动预填
function markThrowTouched(){ if(typeof META!=='undefined'&&META){ META.throwTouched=true; if(typeof saveMeta==='function') saveMeta(); } }
// 把 RUN.throwables 写到玩家身上 (自费: 带多少用多少, 没有就是 0)
function applyThrowablesToPlayer(p){
 if(!p) return;
 for(const k of THROW_KEYS) p[THROW_DEFS[k].field]=(RUN.throwables&&RUN.throwables[k])||0;
 p.atNades=0; p.nadeIsAT=false; p.nadeIsFlash=false; p.nadeIsSmoke=false;
 p.flashT=0;
}
// 投出后回写剩余量, 保证重生/再次部署时不会因为重新读取 loadout 而"凭空补满"
function syncThrowablesFromPlayer(p){
 if(!p||typeof RUN==='undefined') return;
 RUN.throwables=RUN.throwables||{};
 for(const k of THROW_KEYS) RUN.throwables[k]=Math.max(0,p[THROW_DEFS[k].field]|0);
}

// ---------- 部署界面: 投掷物携带数量 ----------
function buildThrowRow(){
 const row=document.getElementById('throwRow');
 if(!row) return;
 const want=clampThrowLoadout();
 row.innerHTML='';
 for(const k of THROW_KEYS){
  const d=THROW_DEFS[k], own=throwOwned(k);
  const cell=document.createElement('div');
  cell.style.cssText='flex:1 1 30%;min-width:104px;border:1px solid #475466;border-radius:6px;padding:6px 8px;background:rgba(0,0,0,.35)';
  const title=document.createElement('div');
  title.style.cssText='font-size:12px;color:#d8d2b8;white-space:nowrap';
  title.innerHTML=`✷ ${d.name} <span style="opacity:.55">[${d.key}]</span>`;
  const line=document.createElement('div');
  line.style.cssText='display:flex;align-items:center;gap:5px;margin-top:5px';
  const mk=(txt,fn)=>{
   const b=document.createElement('button');
   b.type='button'; b.textContent=txt;
   b.style.cssText='width:22px;height:22px;line-height:1;border-radius:4px;border:1px solid #475466;background:#17202b;color:#dce6ea;cursor:pointer;font-size:13px;padding:0';
   b.onclick=fn;
   return b;
  };
  const lab=document.createElement('span');
  lab.style.cssText='font-size:12px;color:#e8e0c0;min-width:44px;text-align:center';
  const refresh=()=>{ lab.textContent=`${want[k]} / ${throwOwned(k)}`; };
  line.appendChild(mk('−',()=>{ if(want[k]>0){ want[k]--; markThrowTouched(); if(typeof saveMeta==='function') saveMeta(); refresh(); if(typeof updateConsumSummary==='function') updateConsumSummary(); } }));
  line.appendChild(lab);
  line.appendChild(mk('＋',()=>{ if(want[k]<throwOwned(k)){ want[k]++; markThrowTouched(); if(typeof saveMeta==='function') saveMeta(); refresh(); if(typeof updateConsumSummary==='function') updateConsumSummary(); } }));
  refresh();
  cell.appendChild(title); cell.appendChild(line);
  row.appendChild(cell);
 }
 if(!THROW_KEYS.some(k=>throwOwned(k)>0)){
  const tip=document.createElement('div');
  tip.style.cssText='flex:1 1 100%;font-size:11px;color:#9aa;line-height:1.5';
  tip.textContent='仓库里没有投掷物 · 到「军械库 → 市集」购买手雷 / 闪光弹 / 烟雾弹';
  row.appendChild(tip);
 }
}
// 包裹: 市集页脚提示补上投掷物
const _tRenderArmory=renderArmory;
renderArmory=function(tab){
 const r=_tRenderArmory.apply(this,arguments);
 try{
  if((tab||ARMORY_TAB||'store')==='market'){
   const h=document.getElementById('arHint');
   if(h) h.textContent='市集交易食物 / 药品 / 投掷物(手雷 · 闪光弹 · 烟雾弹) / 杂物 / 背包 / 夜视仪 — 局内也能在物资箱与尸体上搜到同款。投掷物买入后到部署界面选携带数量，出击即从仓库扣除。';
  }
 }catch(e){}
 return r;
};

// 包裹: 部署消耗品面板重建时一并重建投掷物行
const _tBuildDeployConsumables=buildDeployConsumables;
buildDeployConsumables=function(){
 const r=_tBuildDeployConsumables.apply(this,arguments);
 try{ buildThrowRow(); }catch(e){ console.warn('[throw] buildThrowRow',e); }
 return r;
};
// 包裹: 摘要里加一行投掷物
const _tUpdateConsumSummary=updateConsumSummary;
updateConsumSummary=function(){
 const r=_tUpdateConsumSummary.apply(this,arguments);
 const sum=document.getElementById('consumSummary');
 if(sum&&typeof RUN!=='undefined'){
  const want=clampThrowLoadout();
  const parts=THROW_KEYS.map(k=>{
   const n=(RUN.throwables&&RUN.throwables[k]!==undefined)?RUN.throwables[k]:want[k];
   return `${THROW_DEFS[k].name} ×${n}`;
  });
  const extra=document.createElement('div');
  extra.style.marginTop='4px';
  extra.textContent='投掷物: '+parts.join(' · ');
  sum.appendChild(extra);
 }
 return r;
};
// 包裹: 出击结算 —— 从仓库扣除携带的投掷物
const _tApplyDeployLoadout=applyDeployLoadout;
applyDeployLoadout=function(){
 const want=clampThrowLoadout();
 RUN.throwables={};
 for(const k of THROW_KEYS){
  const n=Math.max(0,Math.min(want[k]|0,throwOwned(k)));
  if(n>0){
   META.owned[k]=throwOwned(k)-n;
   if(META.owned[k]<=0) delete META.owned[k];
  }
  RUN.throwables[k]=n;
 }
 const r=_tApplyDeployLoadout.apply(this,arguments);
 if(typeof player!=='undefined'&&player) applyThrowablesToPlayer(player);
 if(typeof saveMeta==='function') saveMeta();
 return r;
};
// 包裹: 每次部署/重生都按剩余量刷新玩家携带数 (不再按兵种免费发放)
const _tDeployPlayer=deployPlayer;
deployPlayer=function(){
 const r=_tDeployPlayer.apply(this,arguments);
 if(typeof player!=='undefined'&&player) applyThrowablesToPlayer(player);
 return r;
};
// 包裹: 投出后同步剩余量, 防止重生补满
if(typeof player!=='undefined'&&player&&typeof player.releaseNade==='function'){
 const _tReleaseNade=player.releaseNade;
 player.releaseNade=function(){
  const r=_tReleaseNade.apply(this,arguments);
  syncThrowablesFromPlayer(this);
  return r;
 };
}
// 包裹: 成功撤离时, 没用掉的投掷物退回仓库 (阵亡则全损)
const _tFinishRaid=finishRaid;
finishRaid=function(extracted){
 const r=_tFinishRaid.apply(this,arguments);
 try{
  if(extracted===true&&typeof RUN!=='undefined'&&RUN.throwables&&typeof player!=='undefined'&&player){
   syncThrowablesFromPlayer(player);
   let back=0;
   for(const k of THROW_KEYS){
    const n=RUN.throwables[k]|0;
    if(n>0){ META.owned[k]=throwOwned(k)+n; back+=n; }
   }
   if(back>0&&typeof saveMeta==='function') saveMeta();
   RUN.throwables=null;
  }
 }catch(e){ console.warn('[throw] return leftovers',e); }
 return r;
};

// ---------- 战利品掉落: 少量投放投掷物 ----------
const THROW_WEIGHT={nade_frag:6,nade_smoke:5,nade_flash:3};
function maybeAddThrowLoot(out,chance){
 if(Math.random()>chance) return;
 const keys=THROW_KEYS;
 let tot=0; for(const k of keys) tot+=THROW_WEIGHT[k];
 let r=Math.random()*tot, pick=keys[0];
 for(const k of keys){ r-=THROW_WEIGHT[k]; if(r<=0){ pick=k; break; } }
 out[pick]=(out[pick]||0)+1;
}
const _tRollCrateLootList=rollCrateLootList;
rollCrateLootList=function(){
 const out=_tRollCrateLootList.apply(this,arguments)||{};
 try{ maybeAddThrowLoot(out,0.30); }catch(e){}
 return out;
};
const _tRollCorpseLoot=rollCorpseLoot;
rollCorpseLoot=function(bot){
 const out=_tRollCorpseLoot.apply(this,arguments)||{};
 try{ maybeAddThrowLoot(out,0.16); }catch(e){}
 return out;
};

// ---------- 闪光弹: 致盲 ----------
// 简易朝向判定: 背对爆点或隔着墙时衰减, 不做完整 LOS 射线 (性能与实现成本考量)
function flashExposure(ent,pos){
 const dx=pos.x-ent.pos.x, dz=pos.z-ent.pos.z;
 const d=Math.hypot(dx,dz);
 if(d>FLASH_RADIUS) return 0;
 let k=1-d/FLASH_RADIUS;                 // 距离衰减
 k=0.35+k*0.65;                          // 最远处仍有 35% 效果
 // 朝向: 正对 1.0 / 背对 0.45。近距离(≤4m)方向已无意义, 权重线性淡入,
 // 否则"闪在脚下却因为背对而几乎无效"会很反直觉。
 const fw=Math.min(1,d/4);
 const facing=Math.max(0,Math.cos(angDiff(ent.yaw,Math.atan2(dx,dz))||0));
 k*=1-0.55*fw*(1-facing);
 // 掩体遮挡: 隔墙只剩 25%。贴身引爆时不做射线(起点终点几乎重合, 射线会误判打到地面)
 if(d>1.5&&typeof raycastWorld==='function'){
  const eye=V3(ent.pos.x,ent.pos.y+1.5,ent.pos.z);
  const dir=V3(pos.x-eye.x,(pos.y+0.2)-eye.y,pos.z-eye.z);
  const dist=dir.length(); dir.normalize();
  const hit=raycastWorld(eye,dir,dist);
  if(hit&&hit.dist<dist-0.5) k*=0.25;
 }
 return Math.max(0,Math.min(1,k));
}
function flashBangBlind(pos,thrower){
 const hit=[];
 if(typeof player!=='undefined'&&player&&player.alive){
  const k=flashExposure(player,pos);
  if(k>0.05){
   player.flashT=Math.max(player.flashT||0,FLASH_TIME*k);
   player.ads=false;
   if(typeof addTrauma==='function') addTrauma(0.35*k);
   if(typeof showScorePop==='function') showScorePop('被闪光弹致盲！');
  }
 }
 if(typeof soldiers!=='undefined'){
  for(const s of soldiers){
   if(!s||!s.alive||s.isPlayer) continue;
   const k=flashExposure(s,pos);
   if(k>0.05){ s.flashT=Math.max(s.flashT||0,FLASH_TIME*k); hit.push(s); }
  }
 }
 return hit.length;
}
// Bot: 致盲期间完全无法感知目标 (perceive 直接返回), 并在每帧倒计时
if(typeof Bot!=='undefined'&&Bot.prototype){
 const _tBotPerceive=Bot.prototype.perceive;
 Bot.prototype.perceive=function(){
  if(this.flashT>0){ this.target=null; if(typeof nowT!=='undefined') this.lastSeenT=nowT-9; return; }
  return _tBotPerceive.call(this);
 };
 const _tBotUpdate=Bot.prototype.update;
 Bot.prototype.update=function(dt){
  if(this.flashT>0) this.flashT=Math.max(0,this.flashT-dt);
  return _tBotUpdate.call(this,dt);
 };
}
// 玩家: 白屏 overlay + 散布惩罚, 由 updateHUD 每帧驱动
const _tUpdateHUD=updateHUD;
updateHUD=function(dt){
 if(typeof player!=='undefined'&&player){
  if(player.flashT>0){
   player.flashT=Math.max(0,player.flashT-(dt||0));
   player.ads=false;
   player.bloom=1;                       // 致盲期间散布拉满(约 2.4 倍), 准星同步张开
  }
  const ov=document.getElementById('flashOv');
  if(ov){
   const f=player.flashT||0;
   // 前 0.35s 近乎全白, 之后按剩余时间线性消退
   const op=f>0?Math.min(1,0.35+f/FLASH_TIME*0.95):0;
   if(ov.style.opacity!==String(op)) ov.style.opacity=op;
  }
 }
 return _tUpdateHUD.apply(this,arguments);
};
