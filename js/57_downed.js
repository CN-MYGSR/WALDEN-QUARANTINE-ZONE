'use strict';
// =====================================================================
// 57_downed.js — 倒地 / 救援机制 (2026-09-29)
// ---------------------------------------------------------------------
// 规则 (按需求):
//   · **非爆头**的致死伤害 → 进入「倒地」而不是死亡; **60 秒**内没人救才真死
//   · 最近的**同队**单位 (NPC 或玩家) 会来救; 玩家按 **F** 救
//   · NPC 决策优先级: **战斗 > 救援 > 搜索**
//       有威胁 → 先打; 没威胁且有倒地队友 → 去救; 都没有 → 翻箱子
// 实现方式: 尽量用**包装**挂上去, 少动 19_bot / 25_player_update 的内部结构。
//   只在三处各插一行 (都带注释标明由本文件提供):
//     ① 19_bot 决策点  : `if(this.tryStartRescue(engaged,distT)) return;`
//     ② 19_bot 状态体  : `if(this.state==='rescue'){ … }`
//     ③ 25_player_update: `if(player.downed) return updatePlayerDowned(dt);`
// =====================================================================

const DOWN_MAX_T=60;      // 倒地最长 60 秒
const DOWN_RESCUE_T=4.0;  // 救援耗时 (秒)
const DOWN_RESCUE_R=2.2;  // 救援距离 (米)
const DOWN_REVIVE_HP=35;  // 救起后给多少血
const DOWN_INVUL_T=2.0;   // 救起后的短暂无敌 (秒)
const DOWN_BLEED=0.22;    // 倒地后每点伤害折算成多少秒的额外流血

function isDowned(s){ return !!(s&&s.downed); }
function canBeRescued(s){ return !!(s&&s.alive&&s.downed&&s.downT>0); }
// ⚠️ 爆头不给倒地机会 —— 否则「永远打不死」会毁掉交火节奏
function canGoDown(s,isHead){ return !s.downed&&!isHead&&!matchOver; }
function downName(s){ return s.isPlayer?'你':(s.name||'队友'); }

function goDown(s,attacker){
  s.downed=true; s.downT=DOWN_MAX_T; s.rescueProg=0; s.hp=0;
  s.downAttacker=attacker||null;
  s.crouch=false; s.prone=true; s.ads=false; s.braced=false;
  // ⚠️ 必须把「架着的家伙」卸下来 —— 否则倒地点会卡在机枪/迫击炮/载具上出不来
  //    (updatePlayerMG/Mortar 是在 updatePlayer 内部调用的, 倒地后不再执行, 没人帮他复位)
  if(s.onMG){ s.onMG.user=null; s.onMG=null; }
  if(s.onMortar){ s.onMortar.user=null; s.onMortar=null; }
  if(s.onAT){ s.onAT.user=null; s.onAT=null; }
  if(s.onAA){ s.onAA.user=null; s.onAA=null; }
  s.onVehicle=null; s.chuting=false;
  if(typeof VM!=='undefined'&&VM){ VM.adsBlend=0; VM.root.visible=true; }
  try{ document.getElementById('scopeOv').style.display='none'; }catch(e){}
  try{ document.getElementById('heatWrap').style.display='none'; }catch(e){}
  if(s.isPlayer){
    if(typeof showScorePop==='function') showScorePop('你被击倒 · '+DOWN_MAX_T+' 秒内等队友来救');
  } else {
    s.state='downed'; s.path=null; s.target=null; s.rescueMate=null; s.rescueProg=0;
  }
  downedHudRefresh();
}

function reviveUnit(s,byWhom){
  if(!canBeRescued(s)) return false;
  s.downed=false; s.downT=0; s.rescueProg=0; s.downAttacker=null;
  s.hp=Math.max(1,DOWN_REVIVE_HP);
  s.invulT=DOWN_INVUL_T;
  s.prone=false;
  if(!s.isPlayer){ s.state='idle'; s.path=null; s.rescueMate=null; }
  if(s.isPlayer){
    if(typeof showScorePop==='function') showScorePop('你被救起');
  } else if(byWhom&&byWhom.isPlayer){
    if(typeof showScorePop==='function') showScorePop('救起 '+(s.name||'队友'));
  }
  downedHudRefresh();
  return true;
}

// 最近的**同队**可救单位 (自己队救自己队)
function nearestDownedMate(s,maxD){
  let best=null,bd=maxD||60;
  if(typeof combatants==='undefined') return null;
  for(const o of combatants){
    if(o===s||o.team!==s.team||!canBeRescued(o)) continue;
    const d=Math.hypot(o.pos.x-s.pos.x,o.pos.z-s.pos.z);
    if(d<bd){ bd=d; best=o; }
  }
  return best;
}
function nearestDownedMateNear(x,z,r){
  let best=null,bd=r||(DOWN_RESCUE_R+0.8);
  if(typeof combatants==='undefined'||typeof player==='undefined') return null;
  for(const o of combatants){
    if(o.team!==player.team||!canBeRescued(o)) continue;
    const d=Math.hypot(o.pos.x-x,o.pos.z-z);
    if(d<bd){ bd=d; best=o; }
  }
  return best;
}

// =====================================================================
// 包装: 死亡 → 倒地 / 已倒地时再中弹
// =====================================================================
function _wrapDie(obj){
  const orig=obj.die;
  obj._dieRaw=orig;   // ⚠️ 真死时必须调它 —— 否则会被自己的包装再判一次「可倒地」→ 无限倒地循环
  obj.die=function(attacker,isHead){
    if(canGoDown(this,isHead)){ goDown(this,attacker); return; }
    return orig.apply(this,arguments);
  };
}
function _wrapDamage(obj){
  const orig=obj.damage;
  obj.damage=function(amt,attacker,isHead,part){
    if(this.invulT>0) return;                       // 刚被救起: 短暂无敌
    if(this.downed){
      // 已倒地: 再中弹只是**加速流血**; 爆头 = 直接处决
      if(isHead) this.downT=0;
      else this.downT=Math.max(0,this.downT-Math.max(0,amt)*DOWN_BLEED);
      if(this.isPlayer&&typeof dmgFlash!=='undefined') dmgFlash=Math.min(1,dmgFlash+0.25);
      return;
    }
    return orig.apply(this,arguments);
  };
}
_wrapDie(player); _wrapDamage(player);
if(typeof Bot==='function'){ _wrapDie(Bot.prototype); _wrapDamage(Bot.prototype); }

// =====================================================================
// Bot: 救援决策 (优先级里的第 2 档) + 倒地期间不行动
// =====================================================================
if(typeof Bot==='function'){
  // ⚠️ 由 19_bot 的决策处在 tryStartLoot **之前**调用 —— 顺序就是优先级
  Bot.prototype.tryStartRescue=function(engaged,distT){
    if(!this.alive||this.downed||this.onVehicle||this.prone) return false;
    if(engaged&&distT<18) return false;            // 有威胁 → 先打 (战斗优先级最高)
    const t=nearestDownedMate(this,55);
    if(!t){ this.rescueMate=null; return false; }
    this.rescueMate=t;
    this.state='rescue';
    return true;
  };
  const _botUpdate=Bot.prototype.update;
  Bot.prototype.update=function(dt){
    // 倒地: 不行动 (但仍贴地/受重力), 倒计时归零则真死
    if(this.downed){
      this.downT-=dt;
      // ⚠️ 同样走 _dieRaw (见 _wrapDie 注释)
      if(this.downT<=0){ this.downed=false; (this._dieRaw||this.die).call(this,this.downAttacker,false); return; }
      this.vel.set(0,0,0); this.path=null; this.target=null;
      this.settleAir(dt);
      this.pos.y=standHeight(this.pos.x,this.pos.z,this.pos.y+1);
      this.updateMesh(dt,0);
      return;
    }
    if(this.invulT>0) this.invulT=Math.max(0,this.invulT-dt);
    return _botUpdate.apply(this,arguments);
  };
}

// =====================================================================
// 玩家: 倒地时不移动/不开火 (视角仍可转 —— 鼠标监听在 24_input, 只要求 player.alive)
// =====================================================================
function updatePlayerDowned(dt){
  const p=player;
  p.prone=true; p.crouch=false; p.ads=false; p.braced=false;
  p.downT-=dt;
  downedHudRefresh();
  // ⚠️ 走 _dieRaw: 直接 p.die() 会被包装再判一次「可倒地」→ 无限倒地
  if(p.downT<=0){ p.downed=false; (p._dieRaw||p.die).call(p,p.downAttacker,false); }
}
// 玩家救人: F 启动后**持续读条**, 走开就中断
function playerRescueTick(dt){
  const p=player, t=p.rescueTarget;
  if(!t) return;
  if(!canBeRescued(t)){ p.rescueTarget=null; p.rescueProg=0; return; }
  const d=Math.hypot(t.pos.x-p.pos.x,t.pos.z-p.pos.z);
  if(d>DOWN_RESCUE_R+0.6){ p.rescueTarget=null; p.rescueProg=0; return; }
  p.rescueProg=(p.rescueProg||0)+dt;
  if(p.rescueProg>=DOWN_RESCUE_T){ p.rescueProg=0; p.rescueTarget=null; reviveUnit(t,p); }
}
// 由 tryInteract (25_player_update) 调用
function playerTryRescue(){
  const p=player;
  if(!p.alive||p.downed) return false;
  const t=nearestDownedMateNear(p.pos.x,p.pos.z,DOWN_RESCUE_R+0.8);
  if(!t) return false;
  if(p.rescueTarget===t) return true;              // 已经在救他
  p.rescueTarget=t; p.rescueProg=0;
  if(typeof showScorePop==='function') showScorePop('救援中 · 保持靠近 '+(t.name||'队友'));
  return true;
}
const _downedOrigUpdatePlayer=updatePlayer;
updatePlayer=function(dt){
  if(player.downed) return updatePlayerDowned(dt);
  if(player.invulT>0) player.invulT=Math.max(0,player.invulT-dt);
  const r=_downedOrigUpdatePlayer.apply(this,arguments);
  playerRescueTick(dt);
  downedHudRefresh();
  return r;
};

// =====================================================================
// HUD
// =====================================================================
let _downHudLast='';
function downedHudRefresh(){
  const el=document.getElementById('downHud');
  if(!el) return;
  let html='';
  if(player&&player.downed){
    const sec=Math.max(0,Math.ceil(player.downT));
    html='<div class="dhTitle">已 倒 地</div><div class="dhRow">等待救援 · 剩余 <b>'+sec+'</b> 秒</div>';
  } else if(player&&player.rescueTarget){
    const pct=Math.round(Math.min(1,(player.rescueProg||0)/DOWN_RESCUE_T)*100);
    html='<div class="dhTitle">救 援 中</div><div class="dhBar"><i style="width:'+pct+'%"></i></div>';
  }
  if(html===_downHudLast) return;                  // 避免每帧写 DOM
  _downHudLast=html;
  if(html){ el.innerHTML=html; el.style.display='block'; }
  else el.style.display='none';
}
window.DOWNED={ maxT:DOWN_MAX_T, rescueT:DOWN_RESCUE_T, revive:reviveUnit, goDown:goDown, nearest:nearestDownedMate };
