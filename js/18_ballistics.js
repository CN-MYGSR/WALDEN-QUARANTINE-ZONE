'use strict';
function fireBullet(shooter,origin,dir,def,visMuzzle){
const maxD=400;
const wr=raycastWorld(origin,dir,maxD);
let wallD=wr?wr.dist:maxD;
const sr=raySoldiers(origin,dir,wallD,shooter);
let endD;
if(sr){
endD=sr.t;
const hitP=V3(origin.x+dir.x*sr.t,origin.y+dir.y*sr.t,origin.z+dir.z*sr.t);
bloodFX(hitP);
let dmg=def.dmg*(sr.head?def.headMul:1);
if(!shooter.isPlayer) dmg*=EFF_DIFF.dmgMul*(shooter.dmgMul||1);
// 开发者控制台的伤害倍率 (window.DEV 由 52_devconsole 挂上, 正常游玩时不存在)
else if(window.DEV&&window.DEV.dmgMul!==1) dmg*=window.DEV.dmgMul;
dmg*=clamp(1-Math.max(0,sr.t-40)/220,0.45,1);
sr.sol.damage(dmg,shooter,sr.head,sr.part);
if(shooter.isPlayer) onPlayerHit(sr.sol,sr.head);
} else if(wr){
endD=wr.dist;
impactFX(wr.point,wr.normal,wr.kind);
} else endD=maxD;
if(Math.random()<1/(def.tracer||3)) spawnTracer(origin.clone().addScaledVector(dir,1.2),dir,Math.max(1,endD-1.5));
if(visMuzzle) muzzleFXWorld(visMuzzle,dir);
const dCam=origin.distanceTo(camera.position);
const rv=camRight();
const pan=clamp(rv.dot(V3(origin.x-camera.position.x,0,origin.z-camera.position.z).normalize()),-1,1);
if(!shooter.isPlayer) AudioSys.gunshot(def.snd,dCam,pan*0.7);
if(!shooter.isPlayer&&shooter.team!==player.team&&player.alive){
const relX=player.pos.x-origin.x, relY=player.pos.y+1.5-origin.y, relZ=player.pos.z-origin.z;
const tp=relX*dir.x+relY*dir.y+relZ*dir.z;
if(tp>2&&tp<endD){
const cx=origin.x+dir.x*tp-player.pos.x, cy=origin.y+dir.y*tp-(player.pos.y+1.5), cz=origin.z+dir.z*tp-player.pos.z;
const d2=cx*cx+cy*cy+cz*cz;
if(d2<4){ AudioSys.whizz(); player.suppress(0.35); }
}
}
for(const s of soldiers){
if(!s.alive||s.team===shooter.team) continue;
const relX=s.pos.x-origin.x, relY=s.pos.y+1.4-origin.y, relZ=s.pos.z-origin.z;
const tp=relX*dir.x+relY*dir.y+relZ*dir.z;
if(tp>2&&tp<endD+1){
const cx=origin.x+dir.x*tp-s.pos.x, cy=origin.y+dir.y*tp-(s.pos.y+1.4), cz=origin.z+dir.z*tp-s.pos.z;
if(cx*cx+cy*cy+cz*cz<6){ s.suppression=Math.min(1.6,s.suppression+0.35); s.noticeThreat(shooter); }
}
}
gunEvents.push({x:origin.x,z:origin.z,team:shooter.team,t:nowT,shooter});
shooter.lastFiredT=nowT;
}
const nades=[];
const nadeGeoUS=new THREE.SphereGeometry(0.06,8,6);
const nadeGeoGER=new THREE.CylinderGeometry(0.035,0.035,0.24,8);
const nadeGeoAT=new THREE.CylinderGeometry(0.06,0.075,0.3,8);
const nadeGeoSmoke=new THREE.CylinderGeometry(0.048,0.048,0.13,8);
const smokeCanMat=new THREE.MeshLambertMaterial({color:0x8a9088});
const flashCanMat=new THREE.MeshLambertMaterial({color:0xd9d6c4});
// 弹种: 三选一 (互斥) —— at=AT雷(已移除, 仅留兼容位) / smoke=烟雾弹 / flash=闪光弹 / 三者皆假=破片手雷
function throwNade(thrower,origin,vel,fuse,at,smoke,flash){
const can=(smoke||flash);
const m=new THREE.Mesh(can?nadeGeoSmoke:(at?nadeGeoAT:(TEAM_FACTION[thrower.team].nade==='egg'?nadeGeoUS:nadeGeoGER)),can?(flash?flashCanMat:smokeCanMat):(at?vmMats.gunL:vmMats.nade));
m.castShadow=true;
m.position.copy(origin);
scene.add(m);
nades.push({m,pos:origin.clone(),vel:vel.clone(),fuse:fuse!==undefined?fuse:3.4,thrower,team:thrower.team,spin:V3(rand(-6,6),rand(-6,6),rand(-6,6)),bounces:0,at:!!at,smokeN:!!smoke,flashN:!!flash});
}
function updateNades(dt){
for(let i=nades.length-1;i>=0;i--){
const n=nades[i];
n.fuse-=dt;
if(n.fuse<=0){
scene.remove(n.m);
nades.splice(i,1);
nadeExplode(n);
continue;
}
n.vel.y-=9.8*dt;
const nx=n.pos.x+n.vel.x*dt, ny=n.pos.y+n.vel.y*dt, nz=n.pos.z+n.vel.z*dt;
let bounced=false;
for(const b of BOXES){
if(nx>b.minX-0.06&&nx<b.maxX+0.06&&ny>b.minY-0.06&&ny<b.maxY+0.06&&nz>b.minZ-0.06&&nz<b.maxZ+0.06){
const dl=Math.min(nx-b.minX,b.maxX-nx), dv=Math.min(ny-b.minY,b.maxY-ny), dd=Math.min(nz-b.minZ,b.maxZ-nz);
if(dv<=dl&&dv<=dd){ n.vel.y*=-0.4; n.vel.x*=0.7; n.vel.z*=0.7; }
else if(dl<=dd){ n.vel.x*=-0.5; } else { n.vel.z*=-0.5; }
bounced=true;
break;
}
}
const gh=heightAt(nx,nz);
if(ny<=gh+0.05){
n.pos.y=gh+0.05;
if(n.vel.y<-0.5) bounced=true;
n.vel.y*=-0.38;
n.vel.x*=0.68; n.vel.z*=0.68;
n.spin.multiplyScalar(0.6);
}
n.pos.set(nx,Math.max(ny,gh+0.05),nz);
if(bounced&&n.mortar){ n.fuse=Math.min(n.fuse,0.02); }
else if(bounced&&n.bounces++<4) AudioSys.nadeBounce(n.pos.distanceTo(camera.position));
n.m.position.copy(n.pos);
n.m.rotation.x+=n.spin.x*dt; n.m.rotation.y+=n.spin.y*dt; n.m.rotation.z+=n.spin.z*dt;
if(n.team!==player.team&&player.alive&&n.pos.distanceTo(player.pos)<7) nadeWarnT=0.2;
}
}
function nadeExplode(n){
if(n.smokeN){
spawnSmokeCloud(n.pos);
return;
}
// 闪光弹: 不造成伤害, 大范围致盲 (含友军)
if(n.flashN){
spawnP(PT.flash,n.pos.x,n.pos.y+0.3,n.pos.z,0,1.5,0,3.6,26,0.16,1,0,true);
for(let i=0;i<10;i++) spawnP(PT.flash,n.pos.x,n.pos.y+0.3,n.pos.z,rand(-3,3),rand(0,3),rand(-3,3),1.2,9,rand(0.3,0.6),0.9,0,true);
AudioSys.explosion(n.pos.distanceTo(camera.position)*0.8);
if(typeof flashBangBlind==='function') flashBangBlind(n.pos,n.thrower);
return;
}
if(n.mortar){
explosionFXSmall(n.pos);
AudioSys.explosion(n.pos.distanceTo(camera.position)*0.85);
splashDamage(n.pos,n.thrower,n.team,7.5,135,150);
damageStructures(n.pos,7,210);
crater(n.pos.x,n.pos.z,1.3,true);
return;
}
explodeAt(n.pos,n.thrower);
}
function explodeAt(p,attacker){
explosionFX(p);
AudioSys.explosion(p.distanceTo(camera.position));
damageStructures(p,4.5,45);
for(const s of combatants){
if(!s.alive||s.onVehicle) continue;
const d=Math.hypot(s.pos.x-p.x,(s.pos.y+0.9)-p.y,s.pos.z-p.z);
if(d<9){
const dir=V3(s.pos.x-p.x,s.pos.y+0.9-p.y,s.pos.z-p.z).normalize();
const block=raycastWorld(V3(p.x,p.y+0.25,p.z),dir,d);
let dmg=(1-d/9)*135;
if(block&&block.dist<d-0.5) dmg*=0.25;
// 同队/同单位不炸伤(自己除外 —— 自伤是设计里保留的); 单位见 47_units
if(s!==attacker&&(s.team===attacker.team||(typeof unitBlocks==='function'&&unitBlocks(attacker,s)))) dmg*=0.0;
if(attacker&&!attacker.isPlayer&&attacker.dmgMul) dmg*=attacker.dmgMul;
if(dmg>2){
s.damage(dmg,attacker,false);
if(s.isPlayer){ const _scl=typeof shakeHit==='function'?shakeHit:null; (_scl||((x)=>addTrauma(x)))(clamp(dmg/60,0.3,1), false); }
}
}
if(s.isPlayer){
const d2=p.distanceTo(camera.position);
if(typeof shakeExplosion==='function') shakeExplosion(clamp(1.2-d2/22,0.1,0.9), d2);
else if(d2<20) addTrauma(clamp(1.2-d2/22,0.1,0.9));
}
}
for(const s of soldiers){
if(!s.alive) continue;
if(Math.hypot(s.pos.x-p.x,s.pos.z-p.z)<40&&attacker.team!==s.team) s.noticeThreat(attacker);
}
}
