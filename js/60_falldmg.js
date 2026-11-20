// ===== 坠落伤害 =====
// 从 >3m 的地方落到地面/下层 → 按高度扣血（高度越高越重，10m 左右接近致命）
//
// 实现：包装 updatePlayer，**用 onGround 的翻转**判断起跳/落地，记录腾空期间的最高点。
//   · 普通跳跃的顶点也会计入（物理上就是落体高度），所以 2.5m 的台子跳下去 ≈ 3.3m
//   · **翻越**例外：用 vaultFrom.y（楼层差）而不是弧线顶点，否则翻二楼窗台会被多算 0.95m
'use strict';

const FALL={
  safe:3.0,       // 低于这个高度不扣血
  refDrop:7.0,    // 超过 safe 多少米算「满倍率」参考点
  exp:1.2,        // 高度倍率曲线指数
  maxRatio:0.85,  // 单次最多扣 85% 最大生命（留一口气）
  minDmg:1        // 低于 1 点就不弹提示
};

const _fall={peak:null, lastDrop:0, lastDmg:0};

// 纯函数: 高度 → 伤害（方便探针直接测）
function fallDamageFor(drop){
  const over=drop-FALL.safe;
  if(over<=0) return 0;
  const ratio=Math.min(FALL.maxRatio,0.85*Math.pow(Math.min(over,FALL.refDrop)/FALL.refDrop,FALL.exp));
  const maxHp=(player&&player.maxHp)||100;
  return Math.max(0,Math.round(maxHp*ratio));
}

function applyFallDamage(drop,dmg){
  const p=player;
  _fall.lastDrop=drop; _fall.lastDmg=dmg;
  if(typeof showScorePop==='function') showScorePop('坠落 '+drop.toFixed(1)+'m  -'+dmg);
  if(typeof AudioSys!=='undefined'&&AudioSys.hurt) AudioSys.hurt();
  // 走 damage() → 倒地/死亡/流血/屏幕红块 全部沿用既有链路
  // ⚠️ 落地伤害记在腿上（limb='legs'），护甲与腿部 0.7 系数仍会生效
  p.damage(dmg,null,false,'legs');
}

function fallTrack(){
  const p=player;
  if(!p||!p.alive||p.downed||matchOver||p.chute||p._onLadder||
     p.onVehicle||p.onMG||p.onAT||p.onAA||p.onMortar){ _fall.peak=null; return; }

  if(!p.onGround){
    if(p.vaulting&&p.vaultFrom){
      // 翻越: 只记「起点楼层高度」, 不记弧线顶点
      if(_fall.peak===null) _fall.peak=p.vaultFrom.y;
    } else {
      _fall.peak=(_fall.peak===null)?p.pos.y:Math.max(_fall.peak,p.pos.y);
    }
    return;
  }

  if(_fall.peak===null) return;
  const drop=_fall.peak-p.pos.y;
  _fall.peak=null;
  if(drop<=FALL.safe) return;
  const dmg=fallDamageFor(drop);
  if(dmg>=FALL.minDmg) applyFallDamage(drop,dmg);
}

// ---------- 接线 ----------
if(typeof updatePlayer==='function'){
  const _origUpdatePlayer=updatePlayer;
  updatePlayer=function(dt){
    const r=_origUpdatePlayer.apply(this,arguments);
    try{ fallTrack(); }catch(e){}
    return r;
  };
}

window.FALL_DEBUG={
  dmg(drop){ return fallDamageFor(drop); },
  info(){ return {peak:_fall.peak, lastDrop:+_fall.lastDrop.toFixed(2), lastDmg:_fall.lastDmg}; }
};
