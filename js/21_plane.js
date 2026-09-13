'use strict';
const planes=[], flakShots=[], planeWrecks=[];
function updatePlaneWrecks(dt){
for(let i=planeWrecks.length-1;i>=0;i--){
const w=planeWrecks[i];
if(w.state==='fall'){
w.vel.y-=8.5*dt;
w.pos.addScaledVector(w.vel,dt);
w.roll+=w.rollV*dt;
w.pitch=dampF(w.pitch,-0.9,0.6,dt);
w.yaw+=w.rollV*0.06*dt;
w.m.position.copy(w.pos);
w.m.rotation.order='YXZ';
w.m.rotation.set(-w.pitch,w.yaw,w.roll);
w.smokeT-=dt;
if(w.smokeT<=0){
w.smokeT=0.05;
spawnP(PT.dark,w.pos.x,w.pos.y,w.pos.z,rand(-0.5,0.5),rand(0.5,1.5),rand(-0.5,0.5),1.0,1.6,rand(0.9,1.4),0.7,0.2);
spawnP(PT.flash,w.pos.x,w.pos.y,w.pos.z,rand(-1,1),rand(-1,1),rand(-1,1),rand(0.4,0.7),0.5,0.22,0.9,0,true);
}
const gh=heightAt(w.pos.x,w.pos.z);
if(w.pos.y<=gh+0.6){
// 坠地爆炸: 无差别杀伤 + 留下焦黑残骸
w.state='rest';
w.pos.y=gh+0.45;
explosionFX(w.pos.clone().add(V3(0,0.8,0)));
AudioSys.explosion(w.pos.distanceTo(camera.position)*0.8);
splashDamage(w.pos,w.attacker,-1,9,165,240);
damageStructures(w.pos,8,280);
crater(w.pos.x,w.pos.z,1.6,true);
w.m.traverse(o=>{ if(o.isMesh) o.material=wreckMat; });
w.m.rotation.set(rand(-0.15,0.15),w.yaw,rand(-0.4,0.4));
w.m.position.copy(w.pos);
w.col=registerDynCollider(w.pos.x,gh+0.7,w.pos.z,3.6,1.4,3.6);
}
} else {
w.restT-=dt;
w.smokeT-=dt;
if(w.smokeT<=0&&w.restT>6){
w.smokeT=0.16;
spawnP(PT.dark,w.pos.x+rand(-1,1),w.pos.y+0.8,w.pos.z+rand(-1,1),rand(-0.2,0.2),rand(0.8,1.6),rand(-0.2,0.2),0.8,1.5,rand(1.2,2),0.55,0.15);
}
if(w.restT<=0){
scene.remove(w.m);
if(w.col) killDynCollider(w.col);
planeWrecks.splice(i,1);
}
}
}
}
 const PLANE_DEFS=[
 [{name:'P-51 野马',hp:100,spd:[16,32],rof:0.075,mgDmg:17,bombs:1,col:0x74806a,size:1},
 {name:'P-47 雷电',hp:160,spd:[14,27],rof:0.09,mgDmg:21,bombs:3,col:0x687a62,size:1.18}],
 [{name:'BF-109',hp:100,spd:[16,32],rof:0.075,mgDmg:17,bombs:1,col:0x70747a,size:1},
 {name:'FW-190',hp:160,spd:[14,27],rof:0.09,mgDmg:21,bombs:3,col:0x62666a,size:1.18}]
 ];
class Plane {
constructor(team,variant){
this.kind='plane';
this.team=team; this.variant=variant||0;
this.def=TEAM_FACTION[team].planes[this.variant];
this.name=this.def.name;
this.hp=this.def.hp; this.maxHp=this.def.hp; this.alive=true;
this.pos=V3(rand(-140,140),65,team===0?-190:190);
 this.yaw=team===0?0:Math.PI; this.pitch=0; this.speed=22; this.roll=0;
 this.playerDriven=false;
 this.vtolOn=false;
 this.crewBot=null; this.pilotBot=null;
this.bombs=this.def.bombs; this.rearmT=0;
this.crew={ name:this.name, team, kills:0, deaths:0, score:0, isPlayer:false, isCrew:true, pos:this.pos, alive:true, lastFiredT:-99, damage(){}, vel:V3() };
this.state='patrol'; this.stateT=rand(6,14);
this.target=null; this.fireT=0; this.bombCd=rand(8,16);
this.evadeT=0; this.evadeDir=1;
this.respawnT=0; this.smokeT=0;
const D=this.def, s=D.size;
const mat=new THREE.MeshLambertMaterial({color:D.col});
this.grp=new THREE.Group();
if(D.chopper){
  // 直升机: 机身+尾梁+滑橇+主旋翼+尾桨
  const body=new THREE.Mesh(new THREE.CylinderGeometry(0.34*s,0.44*s,3.2*s,8),mat);
  body.rotation.x=-HPI; this.grp.add(body);
  const nose=new THREE.Mesh(new THREE.SphereGeometry(0.3*s,8,6),mat);
  nose.scale.z=1.5; nose.position.set(0,0.08,1.7*s); this.grp.add(nose);
  const tail=new THREE.Mesh(new THREE.BoxGeometry(0.16*s,0.2*s,2.2*s),mat);
  tail.position.set(0,0.35,2.6*s); this.grp.add(tail);
  const boom=new THREE.Mesh(new THREE.CylinderGeometry(0.09*s,0.06*s,2.0*s,6),mat);
  boom.rotation.x=HPI*0.92; boom.position.set(0,0.42,3.4*s); this.grp.add(boom);
  const skidM=new THREE.MeshLambertMaterial({color:0x2a2e2a});
  for(const sx of [-0.55,0.55]){
    const skid=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,3.0*s,6),skidM);
    skid.rotation.x=HPI; skid.position.set(sx*s,0.06,0.6*s); this.grp.add(skid);
    for(const zz of [0.2,1.3]){
      const strut=new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.035,0.5,5),skidM);
      strut.position.set(sx*s,0.32,zz*s); this.grp.add(strut);
    }
  }
   const canopy=new THREE.Mesh(new THREE.SphereGeometry(0.3*s,8,6),new THREE.MeshLambertMaterial({color:0x36404a}));
   canopy.position.set(0,0.35,1.1*s); canopy.userData.cockpitBlk=1; this.grp.add(canopy);
   // 主旋翼(绕Y轴旋转)
   const rotorG=new THREE.Group(); rotorG.position.set(0,0.75,0); this.grp.add(rotorG);
   const hub=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,0.08,6),skidM);
   hub.rotation.x=HPI; rotorG.add(hub);
   const rotorBlade=new THREE.Mesh(new THREE.BoxGeometry(4.6*s,0.03,0.24*s),mat);
   rotorG.add(rotorBlade);
   const rotorBlade2=rotorBlade.clone(); rotorBlade2.rotation.y=HPI; rotorG.add(rotorBlade2);
   this.rotor=rotorG;
   if(D.rus){
   // 卡-52: 共轴双旋翼(上下对转), 无尾桨
   const rotorG2=new THREE.Group(); rotorG2.position.set(0,1.02,0); this.grp.add(rotorG2);
   const rotorBlade3=new THREE.Mesh(new THREE.BoxGeometry(4.6*s,0.03,0.24*s),mat);
   rotorG2.add(rotorBlade3);
   const rotorBlade4=rotorBlade3.clone(); rotorBlade4.rotation.y=HPI; rotorG2.add(rotorBlade4);
   this.rotor2=rotorG2;
   } else {
   // 尾桨(绕Z轴旋转)
   const tailRotor=new THREE.Group(); tailRotor.position.set(0,0.5,4.3*s); this.grp.add(tailRotor);
   const trBlade=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.8*s,0.14*s),mat);
   tailRotor.add(trBlade);
   this.tailRotor=tailRotor;
   }
 } else {
// 现代喷气式战机: 细长机身 + 机头进气口 + 后掠翼/垂尾/平尾 + 翼下挂架 + 尾喷口
const darkM=new THREE.MeshLambertMaterial({color:0x24241e});
const glassM=new THREE.MeshLambertMaterial({color:0x36404a});
const fuse=new THREE.Mesh(new THREE.CylinderGeometry(0.26*s,0.36*s,4.6*s,8),mat);
fuse.rotation.x=-HPI; this.grp.add(fuse);
const intake=new THREE.Mesh(new THREE.CylinderGeometry(0.21*s,0.26*s,0.55*s,8),darkM);
intake.rotation.x=-HPI; intake.position.z=2.2*s; this.grp.add(intake);
 const canopy=new THREE.Mesh(new THREE.SphereGeometry(0.26*s,8,6),glassM);
 canopy.scale.set(1,0.75,1.7); canopy.position.set(0,0.27*s,0.35*s); canopy.userData.cockpitBlk=1; this.grp.add(canopy);
 // 后掠主翼
 if(D.rus){
 // 苏系: 三角翼 + 鸭翼 + 双垂尾
 const wing=new THREE.Mesh(new THREE.BoxGeometry(8.2*s,0.09,1.5*s),mat);
 wing.position.set(0,-0.05,0.55*s); wing.rotation.y=-0.62; this.grp.add(wing);
 const tail=new THREE.Mesh(new THREE.BoxGeometry(3.4*s,0.07,0.9*s),mat);
 tail.position.set(0,0.06,-2.1*s); tail.rotation.y=-0.6; this.grp.add(tail);
 const fin=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.95*s,0.85*s),mat);
 fin.position.set(-0.85*s,0.48*s,-2.15*s); fin.rotation.y=0.3; this.grp.add(fin);
 const fin2=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.95*s,0.85*s),mat);
 fin2.position.set(0.85*s,0.48*s,-2.15*s); fin2.rotation.y=-0.3; this.grp.add(fin2);
 const canard=new THREE.Mesh(new THREE.BoxGeometry(1.6*s,0.06,0.5*s),mat);
 canard.position.set(0,0.02,1.55*s); canard.rotation.y=-0.45; this.grp.add(canard);
 } else if(D.vtol){
 // F-35: 大掠翼 + 双倾斜垂尾 + 鼓胖机身
 const wing=new THREE.Mesh(new THREE.BoxGeometry(7.6*s,0.09,1.35*s),mat);
 wing.position.set(0,-0.05,0.45*s); wing.rotation.y=-0.3; this.grp.add(wing);
 const tail=new THREE.Mesh(new THREE.BoxGeometry(2.9*s,0.06,0.75*s),mat);
 tail.position.set(0,0.05,-2.05*s); tail.rotation.y=-0.42; this.grp.add(tail);
 const fin=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.85*s,0.72*s),mat);
 fin.position.set(-0.72*s,0.42*s,-2.05*s); fin.rotation.y=0.42; this.grp.add(fin);
 const fin2=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.85*s,0.72*s),mat);
 fin2.position.set(0.72*s,0.42*s,-2.05*s); fin2.rotation.y=-0.42; this.grp.add(fin2);
 } else {
 const wing=new THREE.Mesh(new THREE.BoxGeometry(8.6*s,0.09,1.4*s),mat);
 wing.position.set(0,-0.05,0.4*s); wing.rotation.y=-0.35; this.grp.add(wing);
 // 后掠平尾
 const tail=new THREE.Mesh(new THREE.BoxGeometry(3.2*s,0.07,0.85*s),mat);
 tail.position.set(0,0.06,-2.1*s); tail.rotation.y=-0.5; this.grp.add(tail);
 // 后掠垂尾
 const fin=new THREE.Mesh(new THREE.BoxGeometry(0.06,1.0*s,0.9*s),mat);
 fin.position.set(0,0.5*s,-2.1*s); fin.rotation.y=-0.28; this.grp.add(fin);
 }
// 翼下挂架: 机炮吊舱(二号机额外双挂载)
for(const sx of [-1.8,1.8]){
const pod=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,1.1*s,6),darkM);
pod.rotation.x=HPI; pod.position.set(sx*s,-0.26,0.5*s); this.grp.add(pod);
}
if(this.variant===1){
for(const sx of [-1.05,1.05]){
const pod2=new THREE.Mesh(new THREE.CylinderGeometry(0.13,0.13,1.4*s,6),darkM);
pod2.rotation.x=HPI; pod2.position.set(sx*s,-0.26,0.5*s); this.grp.add(pod2);
}
}
// 尾喷口
const nozzle=new THREE.Mesh(new THREE.CylinderGeometry(0.13,0.19,0.45*s,8),darkM);
nozzle.rotation.x=-HPI; nozzle.position.set(0,0.03,-2.4*s); this.grp.add(nozzle);
}
this.grp.traverse(o=>{ if(o.isMesh) o.castShadow=true; });
world.add(this.grp);
this.engine=AudioSys.createEngine('plane');
planes.push(this);
}
velVec(){
return V3(Math.sin(this.yaw)*Math.cos(this.pitch),Math.sin(this.pitch),Math.cos(this.yaw)*Math.cos(this.pitch)).multiplyScalar(this.speed);
}
fwdDir(){
return V3(Math.sin(this.yaw)*Math.cos(this.pitch),Math.sin(this.pitch),Math.cos(this.yaw)*Math.cos(this.pitch));
}
fireMGBurst(shooter,spreadMul){
const dir=this.fwdDir();
const sp=0.05*spreadMul;
dir.x+=rand(-sp,sp); dir.y+=rand(-sp,sp)*0.8; dir.z+=rand(-sp,sp); dir.normalize();
const o=this.pos.clone().addScaledVector(dir,2.4);
fireBullet(shooter,o,dir,{dmg:this.def.mgDmg,headMul:1.5,snd:'smg',tracer:1},o);
for(const ep of planes){
if(!ep.alive||ep.team===this.team) continue;
const rel=ep.pos.clone().sub(o); const tp=rel.dot(dir);
if(tp>2&&tp<200){ const d2=rel.lengthSq()-tp*tp; if(d2<3.2*3.2){ ep.takeDmg(this.def.mgDmg*0.7,shooter); if(Math.random()<0.3) spawnP(PT.spark,ep.pos.x,ep.pos.y,ep.pos.z,rand(-2,2),rand(-1,1),rand(-2,2),0.2,0,0.2,1,0,true); } }
}
for(const t of tanks){
if(!t.alive||t.team===this.team) continue;
const r=rayCyl(o,dir,{x:t.pos.x,z:t.pos.z,r:2.3,y0:t.pos.y,y1:t.pos.y+2.6},200);
if(r){ t.takeDmg(3,shooter); break; }
}
}
dropBomb(shooter){
const m=new THREE.Mesh(new THREE.SphereGeometry(0.26,8,6),new THREE.MeshLambertMaterial({color:0x24241e}));
const p=this.pos.clone().add(V3(0,-1,0));
m.position.copy(p); m.scale.z=1.8; m.castShadow=true; scene.add(m);
const fv=this.velVec();
nades.push({m,pos:p,vel:V3(fv.x*0.85,Math.min(fv.y,0)-4,fv.z*0.85),fuse:6,thrower:shooter||this.crew,team:this.team,bounces:0,spin:V3(1.5,0,0),bomb:true});
AudioSys.metalSlide(0.25,0.12,500,300);
}
update(dt){
if(!this.alive){
this.respawnT-=dt;
this.engine.update(0,0);
if(this.respawnT<=0&&!matchOver){
// 只有专属飞行员阵亡待命时才能连人带机一起重生
if(this.pilotBot&&!this.pilotBot.alive){
this.respawn();
this.pilotBot.spawnInVehicle(this);
} else if(!this.pilotBot){
this.respawn();
} else {
this.respawnT=3;
}
}
return;
}
const dCam=this.pos.distanceTo(camera.position);
if(this.cockpitHide&&(player.onVehicle!==this||!player.alive)){
 // 玩家离开/死亡: 恢复驾驶舱玻璃
 this.cockpitHide=false;
 const g=this.grp;
 g.traverse(function(o){ if(o.userData.cockpitBlk) o.visible=true; });
}
this.engine.update(120+this.speed*1.5, this.playerDriven?0.16:clamp(0.22-dCam/280,0,0.22));
 if(this.def.chopper){
 if(this.rotor) this.rotor.rotation.y+=dt*34;
 if(this.rotor2) this.rotor2.rotation.y-=dt*34;
 if(this.tailRotor) this.tailRotor.rotation.x+=dt*60;
}else if(this.prop) this.prop.rotation.z+=dt*(20+this.speed*0.5);
this.fireT-=dt; this.bombCd-=dt;
if(this.bombs<this.def.bombs){ this.rearmT-=dt; if(this.rearmT<=0){ this.bombs++; this.rearmT=28; } }
if(this.playerDriven){ this.playerFly(dt); }
else if(this.crewBot&&this.crewBot.alive){ this.planeAI(dt); }
else {
// 无人驾驶: 失控坠机
this.pitch=dampF(this.pitch,-0.5,1.2,dt);
this.roll+=0.5*dt;
this.speed=dampF(this.speed,this.def.spd[1],0.8,dt);
}
if(!this.playerDriven){
this.pos.x+=Math.sin(this.yaw)*Math.cos(this.pitch)*this.speed*dt;
this.pos.z+=Math.cos(this.yaw)*Math.cos(this.pitch)*this.speed*dt;
this.pos.y+=Math.sin(this.pitch)*this.speed*dt;
}
if(this.pos.y>110) this.pitch=Math.min(this.pitch,-0.05);
const lim2=MAP_SIZE/2+140;
if(Math.abs(this.pos.x)>lim2||Math.abs(this.pos.z)>lim2){
const wantYaw=Math.atan2(-this.pos.x,-this.pos.z);
this.yaw=angleLerpTo(this.yaw,wantYaw,(this.playerDriven?1.2:0.6)*dt);
}
this.grp.position.copy(this.pos);
this.grp.rotation.order='YXZ';
this.grp.rotation.set(-this.pitch,this.yaw,this.roll);
if(this.hp<this.maxHp*0.5){
this.smokeT-=dt;
if(this.smokeT<=0){ this.smokeT=0.06;
spawnP(PT.dark,this.pos.x,this.pos.y,this.pos.z,0,0,0,0.8,1.2,1.2,0.6,0);
}
}
 const gh=heightAt(this.pos.x,this.pos.z);
 if(this.pos.y<gh+2){
 if(this.vtolOn&&this.speed<4){ this.pos.y=gh+2.5; if(this.hs) this.hs.vy=0; }
 else this.die(this.lastHitBy||null);
 }
}
planeAI(dt){
this.stateT-=dt;
if(this.evadeT>0){
this.evadeT-=dt;
this.roll=dampF(this.roll,-this.evadeDir*1.2,3,dt);
this.yaw+=this.evadeDir*0.8*dt;
this.pitch=dampF(this.pitch,0.32,2,dt);
this.speed=dampF(this.speed,this.def.spd[1],1.5,dt);
return;
}
const ep=enemyPlaneAlive(this.team);
if(this.state!=='dive'&&ep&&ep.pos.distanceTo(this.pos)<240&&Math.random()<0.9) this.state='dogfight';
if(this.state==='dogfight'){
if(!ep||!ep.alive){ this.state='patrol'; this.stateT=rand(5,10); this.roll=dampF(this.roll,0,2,dt); return; }
const d=ep.pos.distanceTo(this.pos);
const lead=ep.pos.clone().addScaledVector(ep.velVec(),clamp(d/280,0,0.9));
const wantYaw=Math.atan2(lead.x-this.pos.x,lead.z-this.pos.z);
const dy=angDiff(this.yaw,wantYaw);
this.yaw+=clamp(dy,-1.0*dt,1.0*dt);
this.roll=dampF(this.roll,clamp(-dy*1.6,-1.1,1.1),4,dt);
const dh=Math.hypot(lead.x-this.pos.x,lead.z-this.pos.z);
this.pitch=dampF(this.pitch,clamp(Math.atan2(lead.y-this.pos.y,Math.max(dh,5)),-0.6,0.6),2.5,dt);
this.speed=dampF(this.speed,d>90?this.def.spd[1]:lerp(this.def.spd[0],this.def.spd[1],0.5),1.2,dt);
if(this.fireT<=0&&Math.abs(dy)<0.12&&d<160){
this.fireT=this.def.rof;
this.fireMGBurst(this.crewBot||this.crew,1);
if(Math.random()<0.12) AudioSys.gunshot('smg',this.pos.distanceTo(camera.position),0);
}
if(d>300){ this.state='patrol'; this.stateT=rand(5,10); }
const gh=heightAt(this.pos.x,this.pos.z);
if(this.pos.y<gh+14) this.pitch=Math.max(this.pitch,0.3);
return;
}
if(this.state==='patrol'){
const cx=Math.sin(nowT*0.1+this.team*3)*110, cz=Math.cos(nowT*0.1+this.team*3)*110;
const wantYaw=Math.atan2(cx-this.pos.x,cz-this.pos.z);
const dy=angDiff(this.yaw,wantYaw);
this.yaw+=clamp(dy,-0.5*dt,0.5*dt);
this.roll=dampF(this.roll,clamp(-dy*1.4,-0.8,0.8),3,dt);
this.pitch=dampF(this.pitch,clamp((62-this.pos.y)*0.02,-0.3,0.3),2,dt);
 this.speed=dampF(this.speed,24,1,dt);
if(this.stateT<=0){
let best=null,bs=-1e9;
for(const t of tanks){
if(!t.alive||t.team===this.team) continue;
const d=t.pos.distanceTo(this.pos);
if(d<280){ const sc=(this.bombs>0?150:60)-d*0.3+rand(0,30); if(sc>bs){ bs=sc; best=t; } }
}
for(const s of combatants){
if(!s.alive||s.team===this.team||s.onVehicle) continue;
const d=Math.hypot(s.pos.x-this.pos.x,s.pos.z-this.pos.z);
if(d>220) continue;
let sc=40-d*0.25+rand(0,25);
if(s.empUse||s.mgUse) sc+=70;
let cluster=0;
for(const s2 of combatants){ if(s2.alive&&s2.team===s.team&&Math.hypot(s2.pos.x-s.pos.x,s2.pos.z-s.pos.z)<9) cluster++; }
sc+=cluster*16;
if(sc>bs){ bs=sc; best=s; }
}
if(best){ this.target=best; this.state='dive'; this.stateT=7.5; }
else this.stateT=rand(4,8);
}
} else if(this.state==='dive'){
const tgt=this.target;
if(!tgt||!tgt.alive||this.stateT<=0){ this.state='climb'; this.stateT=4; }
else {
const tp=tgt.pos;
const wantYaw=Math.atan2(tp.x-this.pos.x,tp.z-this.pos.z);
const dy=angDiff(this.yaw,wantYaw);
this.yaw+=clamp(dy,-0.9*dt,0.9*dt);
this.roll=dampF(this.roll,clamp(-dy*1.6,-1,1),4,dt);
const dh=Math.hypot(tp.x-this.pos.x,tp.z-this.pos.z);
this.pitch=dampF(this.pitch,clamp(Math.atan2((tp.y+2)-this.pos.y,Math.max(dh,5)),-0.55,0.1),2.5,dt);
this.speed=dampF(this.speed,this.def.spd[1],1,dt);
if(this.fireT<=0&&dh<110&&Math.abs(dy)<0.22&&this.pos.y>12){
this.fireT=this.def.rof;
this.fireMGBurst(this.crewBot||this.crew,1.2);
}
if(this.bombs>0&&this.bombCd<=0&&Math.abs(dy)<0.3){
const h=this.pos.y-tp.y;
const tof=Math.sqrt(Math.max(2*h/9.8,0.01));
if(dh<this.speed*tof*1.08&&dh>this.speed*tof*0.5){
this.bombCd=rand(12,20); this.bombs--;
this.dropBomb(this.crewBot||this.crew);
}
}
const gh=heightAt(this.pos.x,this.pos.z);
if(this.pos.y<gh+16){ this.state='climb'; this.stateT=4; }
}
} else {
this.pitch=dampF(this.pitch,0.4,2,dt);
this.roll=dampF(this.roll,0,2,dt);
this.speed=dampF(this.speed,this.def.spd[1]*0.85,1,dt);
if(this.stateT<=0||this.pos.y>58){ this.state='patrol'; this.stateT=rand(8,16); this.target=null; }
}
}
 playerFly(dt){
 if(this.def.chopper) this.playerFlyHeli(dt);
 else if(this.vtolOn) this.playerFlyVTOL(dt);
 else this.playerFlyWing(dt);
 }
 playerFlyVTOL(dt){
 // ===== F-35 垂直起降 (VTOL) 悬停 =====
 // W/S 垂直升降 · A/D 偏航 · 鼠标姿态(机头倾角→水平漂移)
 const p=player, D=this.def;
 if(!this.hs) this.hs={vy:0,spd:0};
 const s=this.hs;
 const thr=(keys.KeyW?1:0)-(keys.KeyS?1:0);
 s.vy=dampF(s.vy,thr*8.5,2.2,dt);
 const rud=(keys.KeyD?1:0)-(keys.KeyA?1:0);
 const wantYaw=p.yaw+Math.PI;
 const dy=angDiff(this.yaw,wantYaw);
 this.yaw+=clamp(dy,-1.9*dt,1.9*dt)+rud*2.1*dt;
 this.pitch+=clamp(angDiff(this.pitch,p.pitch),-0.85,0.85)*3.6*dt;
 this.pitch=clamp(this.pitch,-0.95,1.0);
 p.pitch=clamp(p.pitch,this.pitch-0.3,this.pitch+0.3);
 p.yaw=this.yaw+Math.PI;
 this.roll=dampF(this.roll,clamp(-dy*0.6-rud*0.45,-0.6,0.6),3.5,dt);
 // 机头下倾→水平漂移(VTOL 限速)
 const spdMax=D.spd[1]*0.3;
 const fwdAmt=clamp(-this.pitch,0,1.3);
 s.spd=dampF(s.spd,fwdAmt*spdMax,1.7,dt);
 const cosP=Math.cos(this.pitch);
 this.pos.x+=Math.sin(this.yaw)*cosP*s.spd*dt;
 this.pos.z+=Math.cos(this.yaw)*cosP*s.spd*dt;
 this.pos.y+=s.vy*dt;
 this.speed=Math.hypot(s.spd,s.vy);
 this.throttle=clamp(0.5+thr*0.5,0,1);
 this.planeWeapons(dt);
 }
 playerFlyWing(dt){
 // ===== 简化物理飞行模型 (易上手) =====
 // 能量机动弱化: 推力更足/阻力更小/失速更宽容; 舵面跟随鼠标更跟手
 const D=this.def;
 if(!this.velV){
 this.velV=V3(Math.sin(this.yaw)*Math.cos(this.pitch),Math.sin(this.pitch),Math.cos(this.yaw)*Math.cos(this.pitch)).multiplyScalar(this.speed);
 this.throttle=0.85;
 }
 // 油门 (W/S 增减, 保留最低功率防完全失速)
 const thr=(keys.KeyW?1:0)-(keys.KeyS?1:0);
 this.throttle=clamp((this.throttle??0.85)+thr*0.6*dt,0.4,1.15);
 let v=this.velV.length();
 const vmin=D.spd[0], vmax=D.spd[1];
 const q=clamp(v/vmax,0,1.3); // 动压因子
 // 失速系数: 更宽容, 低速仍保留相当舵效
 const stall=clamp((v-vmin*0.4)/(vmin*0.55),0.25,1);
 // --- 操纵 ---
 const turn=(keys.KeyD?1:0)-(keys.KeyA?1:0);
 const rudder=(keys.KeyQ?1:0)-(keys.KeyE?1:0);
 // 滚转更快更稳
 this.rollV=dampF(this.rollV||0,turn*(2.9*q+0.5)*stall,8,dt);
 this.roll+=this.rollV*dt;
 this.roll=clamp(this.roll,-2.2,2.2);
 if(!turn) this.roll=dampF(this.roll,clamp(this.roll,-1.1,1.1),0.9,dt);
 // 拉杆: 鼠标俯仰为杆量(输入层已反转), 压坡时拉杆=转弯
 const stick=clamp(angDiff(this.pitch,clamp(player.pitch,-1.0,0.95)),-0.7,0.7);
 const pullRate=stick*(2.7*q+0.25)*stall;
 this.pitch+=pullRate*Math.cos(this.roll)*dt;
 this.yaw-=pullRate*Math.sin(this.roll)*1.1*dt;
 this.yaw+=rudder*0.5*q*dt;
 this.pitch=clamp(this.pitch,-1.3,1.25);
 // 失速: 机头下沉更缓和
 if(stall<0.8){
 this.pitch=dampF(this.pitch,-0.45,(1-stall)*1.3,dt);
 if(stall<0.45&&!this._stallWarned){ this._stallWarned=true; showScorePop('失速! 推头俯冲恢复速度'); }
 } else this._stallWarned=false;
 player.pitch=clamp(player.pitch,this.pitch-0.42,this.pitch+0.42);
 player.yaw=this.yaw+Math.PI;
 // --- 能量: 推力更足/阻力更小/重力分量更缓 ---
 const climbSin=Math.sin(this.pitch);
 const thrustA=16*this.throttle*(1-q*0.2);              // 推力(高速推力衰减减弱)
 const gravA=-9.5*climbSin;                             // 爬升掉速/俯冲增速
 const dragA=-(1.5+Math.abs(stick)*4.2)*(v*v)/(vmax*vmax); // 型阻+诱导阻(拉杆掉速)
 v=Math.min(Math.max(v+(thrustA+gravA+dragA)*dt, 6), vmax); // 限速: 极速=数据值
 const fwd=V3(Math.sin(this.yaw)*Math.cos(this.pitch),Math.sin(this.pitch),Math.cos(this.yaw)*Math.cos(this.pitch));
 const conv=1-Math.exp(-(3+q*6)*dt);
 this.velV.multiplyScalar(1-conv).addScaledVector(fwd,v*conv);
 this.velV.y-=(1-stall)*7*dt; // 低速额外重力下坠更缓
 this.velV.normalize().multiplyScalar(v);
 this.speed=v;
 this.pos.addScaledVector(this.velV,dt);
 this.planeWeapons(dt);
 }
 playerFlyHeli(dt){
 // ===== 直升机: 易上手悬停式 =====
 // W/S 节流阀(爬升/下降, 松手悬停) · A/D 方向舵(偏航) · 鼠标俯仰(输入层已反转)
 const p=player, D=this.def;
 if(!this.hs) this.hs={vy:0,spd:0};
 const s=this.hs;
 // 节流阀: 垂直速度, 松手自动悬停
 const thr=(keys.KeyW?1:0)-(keys.KeyS?1:0);
 s.vy=dampF(s.vy,thr*8.5,2.2,dt);
 // 方向舵 A/D + 鼠标左右: 偏航(鼠标转向更跟手, 方向舵叠加)
 const rud=(keys.KeyD?1:0)-(keys.KeyA?1:0);
 const wantYaw=p.yaw+Math.PI;
 const dy=angDiff(this.yaw,wantYaw);
 this.yaw+=clamp(dy,-1.9*dt,1.9*dt)+rud*2.1*dt;
 // 俯仰: 机头跟随鼠标(输入层已反转)
 this.pitch+=clamp(angDiff(this.pitch,p.pitch),-0.85,0.85)*3.6*dt;
 this.pitch=clamp(this.pitch,-0.95,1.0);
 p.pitch=clamp(p.pitch,this.pitch-0.3,this.pitch+0.3);
 p.yaw=this.yaw+Math.PI;
 // 横滚: 转向侧倾(视觉)
 this.roll=dampF(this.roll,clamp(-dy*0.6-rud*0.45,-0.6,0.6),3.5,dt);
 // 前进: 低头前进, 机头水平即悬停
 const spdMax=D.spd[1]*0.62;
 const fwdAmt=clamp(-this.pitch,0,1.5);
 s.spd=dampF(s.spd,fwdAmt*spdMax,1.7,dt);
 const cosP=Math.cos(this.pitch);
 const fx=Math.sin(this.yaw)*cosP, fz=Math.cos(this.yaw)*cosP;
 this.pos.x+=fx*s.spd*dt;
 this.pos.z+=fz*s.spd*dt;
 // 垂直: 仅由节流阀控制(水平飞行不掉高, 悬停最稳)
 this.pos.y+=s.vy*dt;
 this.speed=Math.hypot(s.spd,s.vy);
 this.throttle=clamp(0.5+thr*0.5,0,1);
 this.planeWeapons(dt);
 }
 planeWeapons(dt){
 // --- 武器 (固定翼/直升机共用) ---
 if(mouseDown&&this.fireT<=0&&!matchOver){
 this.fireT=this.def.rof;
 this.fireMGBurst(player,0.8);
 AudioSys.gunshot('smg',0,0);
 addTrauma(0.03);
 }
 if((mouse2Down||keys.KeyB)&&this.bombs>0&&this.bombCd<=0&&!matchOver){
 this.bombCd=1.4; this.bombs--;
 this.dropBomb(player);
 }
 const gh=heightAt(this.pos.x,this.pos.z);
 if(!this.def.chopper&&!this.vtolOn&&this.pos.y<gh+9&&this.pitch<0.1) nadeWarnT=0.15;
 player.pos.copy(this.pos);
 player.vel.set(0,0,0);
 }
takeDmg(amt,attacker){
if(!this.alive) return;
this.hp-=amt;
this.lastHitBy=attacker;
if(this.playerDriven){ dmgFlash=Math.min(1,dmgFlash+0.3); (typeof shakeVehicle==='function' ? shakeVehicle(0.2) : addTrauma(0.2)); }
else if(this.crewBot&&this.hp>0&&this.hp<this.maxHp*0.32){
// 飞行员跳伞逃生
const cb=this.crewBot;
this.crewBot=null;
cb.onVehicle=null;
cb.chuting=true;
cb.pos.set(this.pos.x,Math.max(this.pos.y-2,heightAt(this.pos.x,this.pos.z)+3),this.pos.z);
if(cb.mesh) cb.mesh.root.visible=true;
cb.path=null; cb.state='idle'; cb.target=null;
}
else if(amt>8&&this.evadeT<=0&&Math.random()<0.7){ this.evadeT=rand(1.4,2.6); this.evadeDir=Math.random()<0.5?1:-1; this.state='patrol'; }
if(this.hp<=0) this.die(attacker);
}
die(attacker){
this.alive=false; this.respawnT=rand(35,48); this.crew.alive=false;
if(this.playerDriven){
this.playerDriven=false;
player.onVehicle=null;
player.damage(999,attacker,false);
}
if(this.crewBot){
const cb=this.crewBot;
this.crewBot=null;
cb.onVehicle=null;
cb.damage(999,attacker,false);
}
if(attacker&&attacker.team!==this.team){
attacker.kills=(attacker.kills||0)+1;
attacker.score=(attacker.score||0)+250;
addKillfeed(attacker,{name:this.name,team:this.team,isPlayer:false},false);
if(attacker.isPlayer) showScorePop('+250 击落战机');
}
tickets[this.team]=Math.max(0,tickets[this.team]-3);
explosionFX(this.pos.clone());
AudioSys.explosion(this.pos.distanceTo(camera.position));
// 坠机残骸: 拖着火焰继续坠落, 落地爆炸并留下焦黑残骸
const wm=this.grp.clone();
scene.add(wm);
const fv=this.velVec();
planeWrecks.push({
m:wm, pos:this.pos.clone(),
vel:V3(fv.x*0.6,Math.min(fv.y*0.5,2),fv.z*0.6),
yaw:this.yaw, pitch:this.pitch, roll:this.roll,
rollV:rand(-2.5,2.5)+(Math.random()<0.5?1.6:-1.6),
attacker:attacker||null, team:this.team,
state:'fall', smokeT:0, restT:24, col:null
});
this.grp.visible=false;
}
respawn(){
this.pos.set(rand(-140,140),65,this.team===0?-190:190);
this.yaw=this.team===0?0:Math.PI; this.pitch=0; this.roll=0;
 this.hp=this.maxHp; this.alive=true; this.crew.alive=true; this.speed=22;
 this.velV=null; this.throttle=0.8; this.rollV=0; this.hs=null;
this.state='patrol'; this.stateT=rand(5,10); this.target=null;
 this.bombs=this.def.bombs; this.playerDriven=false; this.evadeT=0;
 this.vtolOn=false;
 this.crewBot=null;
this.grp.visible=true;
}
}

function enemyPlaneAlive(team){
for(const p of planes) if(p.alive&&p.team!==team) return p;
return null;
}
function fireFlak(gun,shooter,dir){
const o=V3(gun.x,gun.y+0.4,gun.z).addScaledVector(dir,1.6);
AudioSys.gunshot('mg',o.distanceTo(camera.position),0);
spawnP(PT.flash,o.x,o.y,o.z,dir.x*2,dir.y*2,dir.z*2,0.35,3,0.07,1,0,true);
flakShots.push({pos:o.clone(),vel:dir.clone().multiplyScalar(150),team:shooter.team,owner:shooter,life:2.6});
}
function updateFlak(dt){
for(let i=flakShots.length-1;i>=0;i--){
const f=flakShots[i];
f.life-=dt;
f.pos.addScaledVector(f.vel,dt);
let boom=f.life<=0;
for(const p of planes){
if(!p.alive||p.team===f.team) continue;
if(p.pos.distanceTo(f.pos)<(f.owner&&f.owner.isPlayer?11:8)){
p.takeDmg(f.owner&&f.owner.isPlayer?rand(34,58):rand(20,34),f.owner);
boom=true;
}
}
if(boom){
spawnP(PT.dark,f.pos.x,f.pos.y,f.pos.z,0,0.4,0,1.6,2.4,1.6,0.85,0);
spawnP(PT.flash,f.pos.x,f.pos.y,f.pos.z,0,0,0,0.9,5,0.09,1,0,true);
AudioSys.flakPop(f.pos.distanceTo(camera.position));
flakShots.splice(i,1);
}
}
}
