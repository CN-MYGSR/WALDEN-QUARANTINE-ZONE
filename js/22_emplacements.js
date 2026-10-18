'use strict';
NAV.refresh();
function findFreeSpawn(x,z){
for(let r=0;r<7;r++){
for(let i=0;i<8;i++){
const px=x+rand(-2,2)+Math.cos(i*0.785)*r*1.6, pz=z+rand(-2,2)+Math.sin(i*0.785)*r*1.6;
if(!occBlocked(px,pz)) return [px,pz];
}
}
return [x,z];
}
const MED_CRATES=[];
const medkitTex=(()=>{
const c=document.createElement('canvas'); c.width=64; c.height=64;
const g=c.getContext('2d');
g.fillStyle='#d8d4c4'; g.fillRect(0,0,64,64);
g.fillStyle='#b8b4a4'; g.fillRect(0,0,64,6); g.fillRect(0,58,64,6);
g.fillStyle='#c03a2a';
g.fillRect(26,14,12,36); g.fillRect(14,26,36,12);
const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace;
return t;
})();
const medkitMat=new THREE.MeshLambertMaterial({map:medkitTex});
function placeMedkit(owner,x,z){
for(let i=MED_CRATES.length-1;i>=0;i--){
if(MED_CRATES[i].owner===owner){ scene.remove(MED_CRATES[i].mesh); MED_CRATES.splice(i,1); }
}
if(occBlocked(x,z)){ x=owner.pos.x; z=owner.pos.z; }
const gh=standHeight(x,z,owner.pos.y+1);
const m=new THREE.Mesh(new THREE.BoxGeometry(0.6,0.42,0.6),medkitMat);
m.position.set(x,gh+0.21,z);
m.rotation.y=rand(0,TAU);
m.castShadow=true;
scene.add(m);
MED_CRATES.push({x,z,y:gh,team:owner.team,owner,uses:8,life:120,mesh:m});
AudioSys.click(700,0.3,0.06);
if(owner.isPlayer) showScorePop('医疗箱已放置');
}
function updateMedCrates(dt){
for(let i=MED_CRATES.length-1;i>=0;i--){
const c=MED_CRATES[i];
c.life-=dt;
if(c.life<=0||c.uses<=0){ scene.remove(c.mesh); MED_CRATES.splice(i,1); continue; }
c.mesh.position.y=c.y+0.21+Math.sin(nowT*2.2+i)*0.02;
for(const s of soldiers){
if(c.uses<=0) break;
if(!s.alive||s.team!==c.team||s.onVehicle) continue;
if(s.bandages>=s.maxBandages) continue;
if((s.bandRefillT||0)>nowT) continue;
if(Math.hypot(s.pos.x-c.x,s.pos.z-c.z)<2.6&&Math.abs(s.pos.y-c.y)<3){
s.bandages=s.maxBandages;
s.bandRefillT=nowT+8;
c.uses--;
if(c.owner&&c.owner!==s){ c.owner.score=(c.owner.score||0)+10; if(c.owner.isPlayer) showScorePop('+10 补给绷带'); }
}
}
}
}
// 死亡热度记录: AI选出生点时规避高危区
const DEATH_HEAT=[];
function noteDeath(x,z){
DEATH_HEAT.push({x,z,t:nowT});
if(DEATH_HEAT.length>50) DEATH_HEAT.shift();
}
// 当前"前线"参考点: 攻防=当前目标, 破袭=最近补给库, 征服=最近的敌方/争夺旗
function frontlinePoint(team){
if(GAMEMODE==='extract') return BASES[team];
if(GAMEMODE==='assault') return FLAGS[Math.min(assaultIdx,FLAGS.length-1)];
if(GAMEMODE==='demolition'){
const d=nearestDepot(BASES[team].x,BASES[team].z);
if(d) return d;
}
let best=null,bd=1e9;
for(const f of FLAGS){
if(f.owner===team&&f.capTeam===-1) continue;
const dd=Math.hypot(f.x-BASES[team].x,f.z-BASES[team].z);
if(dd<bd){ bd=dd; best=f; }
}
return best||FLAGS[0];
}
function pickSpawnFor(team){
const opts=[{x:BASES[team].x,z:BASES[team].z,base:true}];
for(const f of FLAGS) if(f.owner===team) opts.push(f);
const fl=frontlinePoint(team);
let best=opts[0],bs=-1e9;
for(const o of opts){
let sc=rand(0,25);
// 前线偏好: 距离当前战斗焦点越近越好
sc-=Math.hypot(fl.x-o.x,fl.z-o.z)*0.85;
// 危险评估: 附近敌人
let nearestEnemy=1e9,eCnt=0;
for(const c of combatants){
if(c.alive&&c.team!==team){
const d=Math.hypot(c.pos.x-o.x,c.pos.z-o.z);
if(d<nearestEnemy) nearestEnemy=d;
if(d<45) eCnt++;
}
}
if(nearestEnemy<16) sc-=280;
else if(nearestEnemy<30) sc-=100;
sc-=eCnt*16;
// 死亡热度: 该点附近近期阵亡越多越危险 → 绕开绞肉机
let heat=0;
for(const h of DEATH_HEAT){
if(nowT-h.t<25&&Math.hypot(h.x-o.x,h.z-o.z)<24) heat++;
}
sc-=heat*32;
// 正被己方争夺的旗点加分 (支援占领)
for(const f of FLAGS){ if(f.capTeam===team) sc+=40-Math.hypot(f.x-o.x,f.z-o.z)*0.3; }
// 基地保底安全分
if(o.base) sc+=14;
if(sc>bs){ bs=sc; best=o; }
}
return best;
}
function pickScatterSpawnFor(team){
// 撤离模式: 全图随机布点, 并与所有已出生人员保持最大间距 → 敌人更分散
if(GAMEMODE==='extract'){
const inner=MAP_HALF-25;
let best=null,bs=-1;
for(let i=0;i<14;i++){
const x=rand(-inner,inner),z=rand(-inner,inner);
const fp=findFreeSpawn(x,z);
if(Math.abs(fp[0])>=MAP_EDGE||Math.abs(fp[1])>=MAP_EDGE) continue;
let dmin=1e9;
for(const s of soldiers){
if(!s||!s.alive) continue;
dmin=Math.min(dmin,Math.hypot(s.pos.x-fp[0],s.pos.z-fp[1]));
}
if(dmin>bs){ bs=dmin; best={x:fp[0],z:fp[1]}; }
}
return best||pickSpawnFor(team);
}
const candidates=[];
for(const f of FLAGS) candidates.push({x:f.x+rand(-13,13),z:f.z+rand(-13,13)});
const inner=MAP_HALF-30;
for(let i=0;i<4;i++) candidates.push({x:rand(-inner,inner),z:rand(-inner,inner)});
for(let i=0;i<48;i++){
const c=candidates[randi(0,candidates.length-1)];
const fp=findFreeSpawn(c.x,c.z);
if(Math.abs(fp[0])<MAP_EDGE&&Math.abs(fp[1])<MAP_EDGE) return {x:fp[0],z:fp[1]};
}
return pickSpawnFor(team);
}
let nowT=0, matchOver=false, matchTime=5*60;   // 5 分钟一局 (2026-09-18)
const tickets=[START_TICKETS,START_TICKETS];
let nadeWarnT=0;
