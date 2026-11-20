'use strict';
/* ===== 66_boss.js — 每张地图一名 BOSS (2026-11-19) =====
   需求:
     ① 每张可交战地图刷一名 BOSS —— 更高血量/更准/更痛, 外观略大 + 红色肩带
     ② 玩家 HUD 不显示 BOSS 血量 (本文件不注册任何血条/DOM)
     ③ 街区(bfruins)的守备不攻击 BOSS; 其他地图守备会主动围剿 BOSS
   实现要点:
     · BOSS 走 Bot 本体 (队伍 = 敌方), 获得知觉/寻路/射击/掩体全部能力
     · 同队敌袭: 仅 BOSS 与同队守备之间放行 (isHostileUnit), 街区除外
     · BOSS 不编入 47_units 的小队 (unitId='BOSS'), 否则同单位免伤会挡住围剿
     · BOSS 不倒地 (57_downed 的 canGoDown 排除 isBoss), 死亡直接留尸体可搜刮
     · 视野/反应/散布/伤害倍率复用 Bot 现成字段: hpMul/reactMul/sprMul/visMul/dmgMul
*/
const BOSS_DEFS={
  // 街区: 德军守备里的头目, 守在主街十字
  bfruins:{name:'“铁十字”',weapon:'stg44',hp:6.0,react:0.55,spread:0.58,vis:1.30,dmg:1.30,
    npcTaken:0.08,x:0,z:0,scale:1.16,stash:{watch:1,chip:1,docs:1}},
  // 秘密实验室: PMC 清场队头目
  lab:{name:'“清道夫”',weapon:'mp5',hp:6.5,react:0.50,spread:0.55,vis:1.35,dmg:1.30,
    npcTaken:0.08,x:0,z:0,scale:1.16,stash:{ledx:1,keycard:1,morphine:1}},
  // 港口: 集装箱堆场的工头
  port:{name:'“锚王”',weapon:'g36c',hp:7.0,react:0.50,spread:0.52,vis:1.35,dmg:1.35,
    npcTaken:0.09,x:0,z:0,scale:1.18,stash:{gpu:1,keycard:1,radio:1}},
  // 机场: 塔台指挥官
  airport:{name:'“塔台”',weapon:'g28',hp:7.0,react:0.52,spread:0.50,vis:1.40,dmg:1.40,
    npcTaken:0.09,x:0,z:0,scale:1.18,stash:{satphone:1,docs:1,chip:1}},
  // 铁砧外围: 钻井平台工头
  anvil_yard:{name:'“铸工”',weapon:'ak12',hp:6.0,react:0.55,spread:0.56,vis:1.30,dmg:1.30,
    npcTaken:0.08,x:0,z:0,scale:1.16,stash:{tools:1,chip:1,creditcard:1}},
  // 铁砧 B2: 封存层守夜人, 最强
  anvil_b2:{name:'“守夜人”',weapon:'m4',hp:8.0,react:0.48,spread:0.50,vis:1.40,dmg:1.40,
    npcTaken:0.10,x:0,z:0,scale:1.20,stash:{ledx:1,gpu:1,keycard:1,satphone:1}},
};
let BOSS=null;

// 街区守备与 BOSS 互不交火; 其他地图允许"同阵营的 BOSS vs 守备"互相攻击
function bossPairHostile(a,b){
  if(!a||!b||a===b) return false;
  if(a.team!==b.team) return false;
  if(!a.isBoss&&!b.isBoss) return false;
  try{ if(typeof CAMPAIGN!=='undefined'&&CAMPAIGN&&CAMPAIGN.id==='bfruins') return false; }catch(e){}
  return true;
}
// 统一的敌我判定: 先看队伍, 再看 BOSS 特例 (所有 AI/弹道/爆炸过滤点都走这里)
function isHostileUnit(a,b){
  if(!a||!b||a===b) return false;
  if(a.team!==b.team) return true;
  return bossPairHostile(a,b);
}
function bossSpawnPoint(def){
  let x=def.x||0, z=def.z||0, fp=[x,z];
  try{ fp=findFreeSpawn(x,z)||fp; }catch(e){}
  let y=0;
  try{ y=standHeight(fp[0],fp[1],12); }catch(e){}
  return {x:fp[0],z:fp[1],y:y};
}
function addBossSash(b){
  try{
    const pelvis=b.mesh&&b.mesh.pelvis;
    if(!pelvis) return;
    const mat=new THREE.MeshLambertMaterial({color:0x8a1f1f});
    mat.userData.perSoldier=true;                 // 清场时随模型一起释放
    bx(mat,0.47,0.09,0.29, 0,0.47,0, pelvis);    // 胸前红色肩带
  }catch(e){}
}
// 在一局开始时刷新本图 BOSS
function spawnBoss(){
  BOSS=null;
  try{
    if(typeof Bot!=='function'||typeof soldiers==='undefined') return null;
    const id=(typeof CAMPAIGN!=='undefined'&&CAMPAIGN)?CAMPAIGN.id:'';
    const def=BOSS_DEFS[id];
    if(!def) return null;                       // 靶场没有 BOSS
    if(typeof player==='undefined'||!player) return null;
    const team=1-(player.team|0);               // 永远站在玩家的对面
    const home=bossSpawnPoint(def);
    const b=new Bot(team,def.weapon,def.name);
    b.isBoss=true;
    b.npcDamageTaken=(def.npcTaken!=null)?def.npcTaken:0.08;
    b.bandages=0;                               // 不打绷带: 绷带会把他血量钳回 100
    // 固定守在自己的点位, 不搜刮/不救援/不受"中立区"限制
    b.pickObjective=function(){ this.objective={x:home.x,z:home.z,r:9}; };
    b.tryStartLoot=function(){ return false; };
    b.tryStartRescue=function(){ return false; };
    b.aggroOk=function(){ return true; };
    b.spawn(false);
    // ⚠️ 39_quests 的 applyPrestigeBot 在 spawn 开头会**赋值** hpMul/reactMul/sprMul,
    //    所以 BOSS 倍率必须在 spawn 之后再乘上去, 否则会被重置成 1 (血量只有 100)。
    b.hpMul=(b.hpMul||1)*(def.hp||6);
    b.reactMul=(b.reactMul||1)*(def.react||0.55);
    b.sprMul=(b.sprMul||1)*(def.spread||0.58);
    b.visMul=(b.visMul||1)*(def.vis||1.3);
    b.dmgMul=(b.dmgMul||1)*(def.dmg||1.3);
    b.hp=Math.max(1,Math.round(100*b.hpMul));
    b.limbs={head:100,arms:100,torso:100,legs:100};
    // spawn 会把位置随机到出生点, 这里钉回 BOSS 点位
    b.pos.set(home.x,0,home.z);
    b.pos.y=home.y;
    b.path=null; b.decisionT=0; b.perceptT=0;
    b.state='defend';
    b.objective={x:home.x,z:home.z,r:9};
    b.defendPt={x:home.x,z:home.z};
    // 不编入 47_units 的小队: 否则"同单位免伤"会挡住守备围剿
    b.unitId='BOSS'; b.squadGroup=0; b.inSquad=false; b.squadAnchor=null;
    b.stash=Object.assign({},def.stash||{});
    if(b.mesh&&b.mesh.root) b.mesh.root.scale.setScalar(def.scale||1.16);
    addBossSash(b);
    BOSS=b;
    try{ if(typeof showScorePop==='function') showScorePop('⚠ BOSS 出现：'+def.name); }catch(e){}
    return b;
  }catch(e){
    try{ console.warn('[boss] spawn failed',e); }catch(e2){}
    return null;
  }
}
// ===== 挂接: 伤害减免 / 击杀提示 / 开局刷新 =====
if(typeof Bot==='function'&&Bot.prototype){
  // NPC 互射对 BOSS 只造成 8%~10% 伤害 —— 保证守备"会围攻"但打不死 BOSS,
  // BOSS 的击杀权留给玩家; 玩家伤害保持 100%。
  const _bossDamage=Bot.prototype.damage;
  Bot.prototype.damage=function(amt,attacker,isHead,part){
    if(this.isBoss&&attacker&&attacker!==this&&!attacker.isPlayer&&this.npcDamageTaken!=null){
      amt*=(this.npcDamageTaken||0.08);
    }
    return _bossDamage.call(this,amt,attacker,isHead,part);
  };
  const _bossDie=Bot.prototype.die;
  Bot.prototype.die=function(attacker,isHead){
    const wasBoss=!!(this.isBoss&&this.alive);
    const r=_bossDie.apply(this,arguments);
    if(wasBoss){
      try{
        if(typeof showScorePop==='function') showScorePop('BOSS 已清除：'+(this.name||''));
        if(attacker&&attacker.isPlayer) player.score=(player.score||0)+500;
        if(BOSS===this) BOSS=null;
      }catch(e){}
    }
    return r;
  };
}
const _bossStartMatch=startMatch;
startMatch=function(){
  const r=_bossStartMatch.apply(this,arguments);
  try{
    const id=(typeof CAMPAIGN!=='undefined'&&CAMPAIGN)?CAMPAIGN.id:'';
    BOSS=null;
    if(id&&id!=='range') spawnBoss();
  }catch(e){ try{ console.warn('[boss] startMatch',e); }catch(e2){} }
  return r;
};


