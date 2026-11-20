// ===== 翻越 (vault) =====
// 玩家可以翻越: 街区的窗户（窗台 0.95m）与低矮掩体（沙袋 1.0m / 矮墙 / 栅栏，上限 1.42m）
//
// 触发方式: 面朝障碍按【跳跃键】—— 能翻就翻, 否则照常跳。
//   · 不新增键位 → 触控端现有的跳跃按钮自动也能翻越, 不用改 31_touch
//
// ⚠️ 判定用的是 BOXES（和 collideMove 完全同一套碰撞数据）,
//    所以「看起来能翻」和「真的能翻」永远一致 —— 不去猜 OCC 那套 2D 栅格。
// ⚠️ 窗户在 BOXES 里是两块: 窗台(0~0.95) + 窗楣(2.35 以上)。窗台是可翻越面, 窗楣因为
//    minY 在头顶之上会被忽略 —— 这正是「翻窗」能成立的原因。
'use strict';

const VAULT={
  stepTop:0.56,    // 低于这个高度 collideMove 本来就让你直接迈过去, 不算翻越
  maxTop:1.42,     // 再高就翻不过去（窗台 0.95 / 沙袋 1.0 / 常见矮墙 1.2）
  reach:1.15,      // 从脚前 0.30m 开始探测, 最远 1.15m 内有可翻越面
  maxRun:2.10,     // 越过障碍后最多再走 2.1m 找落脚点
  maxDrop:4.60,    // 落点可以比脚下低多少（二层窗台 3.05m 可翻出；三层 6.1m 不行）
  nearR:4.5,       // 每次尝试只扫玩家周围 4.5m 内的碰撞体（BOXES 可能上万条, 只扫一次）
  radius:0.42,     // 与 collideMove 的玩家半径一致
  cooldown:0.35
};

// 收集玩家附近的碰撞体（一次线性扫描, 之后所有采样都用这个小表）
function vaultNearBoxes(px,pz,feet){
  const out=[], R=VAULT.nearR;
  for(let i=0;i<BOXES.length;i++){
    const b=BOXES[i];
    if(b.maxX<px-R||b.minX>px+R||b.maxZ<pz-R||b.minZ>pz+R) continue;
    if(b.minY>feet+3.0||b.maxY<feet-1.0) continue;
    out.push(b);
  }
  return out;
}

// 单个采样点: 有没有可翻越面 / 有没有翻不过去的墙
// pad = 玩家半径: 让「点」等价于「玩家站在这里会不会碰到」
function vaultScanAt(near,x,z,feet,pad){
  let low=null, wall=false;
  for(let i=0;i<near.length;i++){
    const b=near[i];
    if(x<b.minX-pad||x>b.maxX+pad||z<b.minZ-pad||z>b.maxZ+pad) continue;
    const bot=b.minY-feet, top=b.maxY-feet;
    if(bot>1.72) continue;                       // 纯头顶之上(窗楣/天花板) → 不挡翻越
    if(top<=VAULT.stepTop) continue;             // 迈得上去, 不用翻
    if(top<=VAULT.maxTop&&bot<=0.40){            // 可翻越面(落地型)
      if(low===null||b.maxY>low) low=b.maxY;
      continue;
    }
    if(top>VAULT.maxTop) wall=true;              // 太高 → 这条路不通
  }
  return {low,wall};
}

// 找一个可行的翻越: 返回 {from,to,top,dist} 或 null
function vaultFind(){
  const p=player;
  if(!p||!p.alive||p.downed||p.vaultT>0||p.vaulting) return null;
  if(!p.onGround||p.prone||p.bandaging>0) return null;
  if(p.onVehicle||p.onMG||p.onAT||p.onAA||p.onMortar||p._onLadder) return null;
  if(p.stamina<=0.08) return null;
  if(nowT<(p.vaultNext||0)) return null;

  const feet=p.pos.y;
  const near=vaultNearBoxes(p.pos.x,p.pos.z,feet);
  if(!near.length) return null;

  // 正前方优先; 窗口常常只能斜着对准, 所以左右各试两个角度
  for(const off of [0,-0.14,0.14,-0.28,0.28]){
    const yaw=p.yaw+off;
    const fx=-Math.sin(yaw), fz=-Math.cos(yaw);

    // ① 沿视线找第一块可翻越的障碍
    let hit=null;
    for(let d=0.30;d<=VAULT.reach;d+=0.12){
      const s=vaultScanAt(near,p.pos.x+fx*d,p.pos.z+fz*d,feet,VAULT.radius);
      if(s.wall) break;                          // 正面是整面墙 → 这个角度没戏
      if(s.low!==null){ hit={d,top:s.low}; break; }
    }
    if(!hit) continue;

    // ② 越过障碍, 找第一个站得住的落脚点
    for(let d=hit.d+0.12;d<=hit.d+VAULT.maxRun;d+=0.10){
      const x=p.pos.x+fx*d, z=p.pos.z+fz*d;
      const s=vaultScanAt(near,x,z,feet,VAULT.radius);
      if(s.low!==null||s.wall) continue;         // 还在障碍上 / 撞到墙
      const gh=standHeight(x,z,feet+0.3);
      if(gh-feet>0.80) continue;                 // 不能翻到更高的地方
      if(feet-gh>VAULT.maxDrop) continue;        // 太深(>4.6m) → 不翻, 免得直接摔死
      // 落脚点要真的站得下: 半径内没有「高过腰」的碰撞体
      let blocked=false;
      for(let i=0;i<near.length;i++){
        const b=near[i];
        if(x<b.minX-VAULT.radius||x>b.maxX+VAULT.radius||z<b.minZ-VAULT.radius||z>b.maxZ+VAULT.radius) continue;
        if(b.maxY-feet>1.0&&b.minY-feet<1.7){ blocked=true; break; }
      }
      if(blocked) continue;
      return {fx,fz,top:hit.top,from:{x:p.pos.x,y:p.pos.y,z:p.pos.z},to:{x,z,y:gh},dist:d};
    }
  }
  return null;
}

// 由 updatePlayer 的跳跃分支调用: 翻得过去就翻(返回 true), 否则返回 false 让原来的跳跃执行
function vaultTry(){
  const f=vaultFind();
  if(!f) return false;
  const p=player;
  p.vaulting=true;
  p.vaultT=0.0001;
  p.vaultDur=Math.min(0.62,0.30+f.dist*0.13);
  p.vaultFrom=f.from;
  p.vaultTo=f.to;
  p.vaultPeak=Math.max(0.10,(f.top-f.from.y)+0.12);
  p.vel.set(0,0,0);
  p.onGround=false; p.crouch=false; p.prone=false; p.braced=false;
  p.stamina=Math.max(0,p.stamina-0.06); p.stamUseT=nowT;
  p.vaultNext=nowT+VAULT.cooldown;
  if(typeof AudioSys!=='undefined'&&AudioSys.footstep) AudioSys.footstep(false,0.5);
  return true;
}

// 翻越过程: 位置完全由这里驱动（updatePlayer 在 vaultT>0 时直接 return）
function updateVault(dt){
  const p=player;
  p.vaultT+=dt;
  const t=Math.min(1,p.vaultT/p.vaultDur);
  const e=t*t*(3-2*t);                                  // smoothstep
  p.pos.x=p.vaultFrom.x+(p.vaultTo.x-p.vaultFrom.x)*e;
  p.pos.z=p.vaultFrom.z+(p.vaultTo.z-p.vaultFrom.z)*e;
  p.pos.y=p.vaultFrom.y+(p.vaultTo.y-p.vaultFrom.y)*e+Math.sin(Math.PI*t)*p.vaultPeak;
  p.vel.set(0,0,0);
  // 视角轻微下沉, 掩盖镜头擦过窗楣/门框
  p.landDip=Math.max(p.landDip||0,Math.sin(Math.PI*t)*0.55);
  if(t>=1){
    p.pos.x=p.vaultTo.x; p.pos.y=p.vaultTo.y; p.pos.z=p.vaultTo.z;
    p.vaultT=0; p.vaulting=false; p.onGround=true;
    p.vaultNext=nowT+0.20;
    if(typeof AudioSys!=='undefined'&&AudioSys.footstep) AudioSys.footstep(true,0.35);
  }
}

// 控制台调试: VAULT_DEBUG.info() 看当前面朝方向能不能翻
window.VAULT_DEBUG={
  info(){
    const f=vaultFind();
    return f?{ok:true,dist:+f.dist.toFixed(2),top:+f.top.toFixed(2),to:{x:+f.to.x.toFixed(2),y:+f.to.y.toFixed(2),z:+f.to.z.toFixed(2)}}
            :{ok:false};
  },
  try(){ return vaultTry(); }
};
