'use strict';
// =====================================================================
// 爆炸伤害 / 破袭补给库查询
// ---------------------------------------------------------------------
// 历史: 本文件的前身是 `20_tank.js`(坦克/飞机/APC) → 2026-09-18 载具整套删除时,
// 只把里面**还在被调用**的两块抽了出来。
// 2026-09-18 二次清理: 火箭弹系统(`shells` / `updateShells`)也一并删除 ——
// 它的三个发射点(火箭筒武器 / 玩家反坦克炮位 / bot 反坦克炮位)在载具与反坦克武器
// 都删掉之后**全部不可达**, 属于纯死代码。
// 保留: explosionFXSmall / splashDamage / nearestDepot
//   · explosionFXSmall / splashDamage —— 手雷 / 迫击炮 / 航弹等爆炸在用 (18_ballistics)
//   · nearestDepot —— 破袭模式的补给库查询 (19_bot / 22_emplacements)
// =====================================================================

function explosionFXSmall(p){
spawnP(PT.flash,p.x,p.y+0.3,p.z,0,1,0, 1.6,10,0.12,1,0,true);
for(let i=0;i<6;i++) spawnP(PT.dark,p.x+rand(-0.5,0.5),p.y+rand(0.2,1),p.z+rand(-0.5,0.5), rand(-1.5,1.5),rand(1,3),rand(-1.5,1.5), rand(0.6,1),1.8,rand(0.7,1.3),0.8,0.6);
for(let i=0;i<6;i++) spawnP(PT.dirt,p.x,p.y+0.2,p.z, rand(-4,4),rand(2,6),rand(-4,4), rand(0.25,0.5),0.5,rand(0.5,0.9),0.9,8);
}
// dmgVeh 参数保留但已无消费点(原先用于对载具的额外伤害), 保留签名避免改动调用方
function splashDamage(p,attacker,team,radius,dmgMax,dmgVeh){
for(const s of combatants){
if(!s.alive||s.onVehicle) continue;
// 不误伤队友/同单位, 但炸自己会受伤 (单位判定见 47_units)
if(s!==attacker&&(s.team===team||(attacker&&typeof unitBlocks==='function'&&unitBlocks(attacker,s)))) continue;
const d=Math.hypot(s.pos.x-p.x,(s.pos.y+0.9)-p.y,s.pos.z-p.z);
if(d<radius){ let dm=lerp(dmgMax,10,d/radius); if(attacker&&!attacker.isPlayer&&attacker.dmgMul) dm*=attacker.dmgMul; s.damage(dm,attacker,false); }
}
if(player.alive&&p.distanceTo(camera.position)<18) (typeof shakeExplosion==='function' ? shakeExplosion(0.5, p.distanceTo(camera.position)) : addTrauma(0.5));
}
// 最近的未摧毁补给库 (破袭模式的 DEPOTS, 与载具无关)
function nearestDepot(x,z){
let best=null,bd=1e9;
for(const d of DEPOTS){
if(d.destroyed) continue;
const dd=Math.hypot(d.x-x,d.z-z);
if(dd<bd){ bd=dd; best=d; }
}
return best;
}
