// ===== 屏幕边缘反馈 =====
// ① 附近有队友开火 / 敌人的子弹擦身而过 → 屏幕四周压暗（压抑感）
// ② 受伤 → 屏幕四周出现红色血块，随时间缓慢消退；血量越低底噪越重（持续渗血）
//
// 实现方式尽量「包装」：
//   · fireBullet  —— 队友在附近开枪时给一点压抑值（敌人那颗子弹的擦身判定在 18_ballistics 里已经调 player.suppress）
//   · player.damage —— 用「血量差」算受伤量（不依赖内部实现；57_downed 拦住 hp 变化时按倒地处理）
//   · player.suppress —— 被擦身(0.35)时给一个更强的短促压暗脉冲
//   · updateHUD —— 每帧把两个遮罩的透明度写出去
'use strict';

const SCREENFX={
  press:0,     // 队友在附近开火的累积压抑 (0~0.5)
  whizz:0,     // 子弹擦身/受伤的短促脉冲 (0~1)
  blood:0,     // 血色浓度 (0~1)
  nearR:22     // 队友开火的影响半径（米）
};

const _sfxDom={};
function sfxEl(id){
  if(!(id in _sfxDom)) _sfxDom[id]=document.getElementById(id);
  return _sfxDom[id];
}

// 队友在附近开枪 → 压抑累积（越近越强；自己的枪不算）
function screenFxOnShot(shooter,origin){
  const p=player;
  if(!p||!p.alive||!shooter||shooter.isPlayer) return;
  if(shooter.team!==p.team) return;                 // 敌人开火走「子弹擦身」那条，不重复计
  const sx=(shooter.pos?shooter.pos.x:(origin?origin.x:p.pos.x));
  const sz=(shooter.pos?shooter.pos.z:(origin?origin.z:p.pos.z));
  const d=Math.hypot(sx-p.pos.x,sz-p.pos.z);
  if(d>SCREENFX.nearR) return;
  const k=1-d/SCREENFX.nearR;                       // 0(远) ~ 1(贴脸)
  SCREENFX.press=Math.min(0.5,SCREENFX.press+0.012+0.05*k);
}

// 受伤 → 血块浓度
function screenFxHurt(lost,isHead){
  const maxHp=(player&&player.maxHp)||100;
  let add=0.16+Math.min(0.42,lost/Math.max(90,maxHp*0.22));
  if(isHead) add*=1.35;
  SCREENFX.blood=Math.min(1,SCREENFX.blood+add);
  SCREENFX.whizz=Math.min(1,SCREENFX.whizz+0.35);   // 挨枪同时压暗一下
}

// 每帧: 衰减 + 写透明度
function screenFxUpdate(dt){
  const f=SCREENFX;
  f.press=Math.max(0,f.press-dt*1.6);
  f.whizz=Math.max(0,f.whizz-dt*2.2);
  f.blood=Math.max(0,f.blood-dt*0.14);

  // 低血量/倒地 → 持续渗血的底噪
  let floor=0;
  if(player&&player.alive){
    const hpPct=(typeof tkLowHpRatio==='function')?tkLowHpRatio(player):(player.hp/(player.maxHp||100));
    if(hpPct<0.35) floor=(1-hpPct/0.35)*0.45;
    if(player.downed) floor=Math.max(floor,0.55);
  }

  const sup=sfxEl('supOv');
  if(sup){
    const a=(player?(player.suppressV||0):0)*0.7+f.press+f.whizz*0.35;
    sup.style.opacity=Math.min(0.92,a).toFixed(3);
  }
  const bl=sfxEl('bloodOv');
  if(bl) bl.style.opacity=Math.min(1,Math.max(f.blood,floor)).toFixed(3);
}

// ---------- 接线 ----------
// ① 队友开火
if(typeof fireBullet==='function'){
  const _origFire=fireBullet;
  fireBullet=function(shooter,origin,dir,def,visMuzzle){
    try{ screenFxOnShot(shooter,origin); }catch(e){}
    return _origFire.apply(this,arguments);
  };
}

// ② 玩家受伤（用血量差，兼容 57_downed 对 hp 的拦截）
if(player&&typeof player.damage==='function'){
  const _origDmg=player.damage;
  player.damage=function(amt,attacker,isHead,part){
    const before=this.hp, wasDown=!!this.downed;
    const r=_origDmg.apply(this,arguments);
    try{
      const lost=Math.max(0,before-this.hp);
      if(lost>0.5) screenFxHurt(lost,isHead);
      else if(wasDown||this.downed) screenFxHurt(4,isHead);   // 倒地后中弹: 57 拦住了 hp 变化
    }catch(e){}
    return r;
  };
}

// ③ 子弹擦身 → 短促强压暗
if(player&&typeof player.suppress==='function'){
  const _origSup=player.suppress;
  player.suppress=function(a){
    const r=_origSup.apply(this,arguments);
    try{ if(a>=0.3) SCREENFX.whizz=Math.min(1,SCREENFX.whizz+0.6); }catch(e){}
    return r;
  };
}

// ④ 每帧写入
if(typeof updateHUD==='function'){
  const _origHUD=updateHUD;
  updateHUD=function(dt){
    const r=_origHUD.apply(this,arguments);
    try{ screenFxUpdate(dt); }catch(e){}
    return r;
  };
}

// 控制台调试
window.SCREENFX=SCREENFX;
window.SCREENFX_DEBUG={
  shot(){ screenFxOnShot({team:player.team,pos:{x:player.pos.x+4,z:player.pos.z}},{x:0,z:0}); },
  hurt(n){ screenFxHurt(n||40,false); },
  info(){ return {press:+SCREENFX.press.toFixed(2),whizz:+SCREENFX.whizz.toFixed(2),blood:+SCREENFX.blood.toFixed(2),
    supOv:sfxEl('supOv')?sfxEl('supOv').style.opacity:'-', bloodOv:sfxEl('bloodOv')?sfxEl('bloodOv').style.opacity:'-'}; }
};
