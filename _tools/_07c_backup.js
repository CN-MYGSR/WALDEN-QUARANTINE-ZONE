'use strict';
// ===================== 二战建筑库 (阶段6新增) =====================
// 城市: 联排楼/公寓/厂房/仓库/火车站/铁轨/车皮/机车/路灯
// 乡野: 农田/栅栏/果园/风车/水井  水乡: 石拱桥  黄土: 窑洞/梯田
// 全部带碰撞/门口导航通行区/掩体点, 一层可进入, 楼梯可上二层
function lampPost(x,z){
const g0=heightAt(x,z);
mesh(new THREE.CylinderGeometry(0.05,0.07,4.6,6),MAT.metalDark,x,g0+2.3,z);
const arm=mesh(new THREE.BoxGeometry(0.06,0.06,0.8),MAT.metalDark,x,g0+4.5,z+0.35);
mesh(new THREE.BoxGeometry(0.22,0.12,0.3),MAT.metal,x,g0+4.42,z+0.72);
CYLS.push({x,z,r:0.14,y0:g0,y1:g0+4.6});
}
function fenceLine(x1,z1,x2,z2){
const dx=x2-x1,dz=z2-z1;
const len=Math.hypot(dx,dz), ry=Math.atan2(dx,dz)+HPI;
const steps=Math.max(1,Math.round(len/2.4));
for(let i=0;i<=steps;i++){
const t=i/steps, x=x1+dx*t, z=z1+dz*t;
const g0=heightAt(x,z);
mesh(new THREE.BoxGeometry(0.09,1.0,0.09),MAT.woodDark,x,g0+0.5,z);
}
for(let i=0;i<steps;i++){
const t0=(i+0.5)/steps, x=x1+dx*t0, z=z1+dz*t0;
const g0=heightAt(x,z);
mesh(new THREE.BoxGeometry(0.05,0.07,len/steps+0.1),MAT.woodDark,x,g0+0.78,z,Math.atan2(dx,dz));
mesh(new THREE.BoxGeometry(0.05,0.07,len/steps+0.1),MAT.woodDark,x,g0+0.42,z,Math.atan2(dx,dz));
}
}
// 农田: 田垄条播(可穿行, 提供低掩护视觉)
function farmField(x,z,w,d,ry,kind){
const g0=heightAt(x,z);
const rows=Math.floor(d/1.6);
const mat=kind==='paddy'?new THREE.MeshLambertMaterial({color:0x4e6a3c}):MAT.dirtRow||(MAT.dirtRow=new THREE.MeshLambertMaterial({map:TEX.dirt}));
const cropMat=MAT.cropRow||(MAT.cropRow=new THREE.MeshLambertMaterial({color:0x74854a}));
const cs=Math.cos(ry),sn=Math.sin(ry);
for(let i=0;i<rows;i++){
const lz=-d/2+1.6*i+0.8;
const px=x+lz*sn, pz=z+lz*cs;
const gy=heightAt(px,pz);
mesh(new THREE.BoxGeometry(w,0.16,0.7),mat,px,gy+0.08,pz,ry,false,true);
if(kind!=='paddy'&&i%2===0) mesh(new THREE.BoxGeometry(w,0.24,0.34),cropMat,px,gy+0.28,pz,ry,false,true);
}
if(kind==='paddy'){
const wm=new THREE.MeshLambertMaterial({color:0x53707c,transparent:true,opacity:0.55});
mesh(new THREE.BoxGeometry(w+0.6,0.05,d+0.6),wm,x,g0+0.03,z,ry,false,true);
}
}
function orchard(x,z,r,n){
for(let i=0;i<n;i++){
const a=rand(0,TAU), rr=rand(2,r);
tree(x+Math.sin(a)*rr,z+Math.cos(a)*rr,rand(0.55,0.8));
}
}
function windmill(x,z,ry){
const g0=heightAt(x,z);
const tower=mesh(new THREE.CylinderGeometry(1.6,2.4,7.5,10),MAT.stone,x,g0+3.75,z);
CYLS.push({x,z,r:2.4,y0:g0,y1:g0+7.5});
mesh(new THREE.CylinderGeometry(1.7,1.7,1.4,10),MAT.roof,x,g0+8.1,z);
const hub=V3(x+Math.sin(ry)*1.9,g0+6.8,z+Math.cos(ry)*1.9);
for(let i=0;i<4;i++){
const b=mesh(new THREE.BoxGeometry(0.5,4.6,0.08),MAT.woodDark,hub.x,hub.y,hub.z,ry);
b.rotation.z=i*HPI+0.4;
b.translateY(2.0);
}
NAV_CLEARS.push({x:x+Math.sin(ry+Math.PI)*2.4,z:z+Math.cos(ry+Math.PI)*2.4,r:1.0});
addCoverAround(x,z,4,4,ry);
}
function wellSmall(x,z){
const g0=heightAt(x,z);
mesh(new THREE.CylinderGeometry(0.75,0.8,0.9,10),MAT.stone,x,g0+0.45,z);
CYLS.push({x,z,r:0.85,y0:g0,y1:g0+0.9});
mesh(new THREE.BoxGeometry(0.08,1.6,0.08),MAT.woodDark,x-0.6,g0+1.2,z);
mesh(new THREE.BoxGeometry(0.08,1.6,0.08),MAT.woodDark,x+0.6,g0+1.2,z);
mesh(new THREE.BoxGeometry(1.5,0.1,0.9),MAT.roof,x,g0+2.05,z);
coverPoints.push({x:x+1.2,z},{x:x-1.2,z});
}
// 联排砖楼: 1层可进+楼梯上二层, 顶层可预损毁; 一层承重墙全毁触发整楼倒塌
function rowHouse(x,z,ry,floors,w,d,mat,broken){
floors=floors||2; w=w||7; d=d||6; mat=mat||MAT.brick; broken=broken??0.25;
const g0=heightAt(x,z); const fh=3.0, t=0.32;
const cs=Math.cos(ry),sn=Math.sin(ry);
const L=(lx,lz)=>[x+lx*cs+lz*sn, z-lx*sn+lz*cs];
mesh(new THREE.BoxGeometry(w+0.5,1.2,d+0.5),MAT.stone,x,g0-0.5,z,ry,false,true);
let p;
const wallGs=[], roofCollapse=null;
// 前墙: 门+窗
const dw=1.25, seg=(w-dw)/2;
p=L(0,d/2); NAV_CLEARS.push({x:p[0],z:p[1],r:1.1});
dBegin(); p=L(-(dw+seg)/2,d/2); dBox(mat,seg,fh,t,p[0],g0+fh/2,p[1],ry); wallGs.push(_dG);
dBegin(); p=L((dw+seg)/2,d/2); dBox(mat,seg,fh,t,p[0],g0+fh/2,p[1],ry); wallGs.push(_dG);
dBegin(); p=L(0,d/2); dBox(mat,dw,0.8,t,p[0],g0+fh-0.4,p[1],ry); wallGs.push(_dG);
dEnd();
// 后墙
dBegin(); p=L(-w/4-0.2,-d/2); dBox(mat,w/2-0.5,fh,t,p[0],g0+fh/2,p[1],ry); wallGs.push(_dG);
dBegin(); p=L(w/4+0.2,-d/2); dBox(mat,w/2-0.5,fh,t,p[0],g0+fh/2,p[1],ry); wallGs.push(_dG);
dBegin(); p=L(0,-d/2); dBox(mat,1.4,1.0,t,p[0],g0+0.5,p[1],ry); wallGs.push(_dG);
dEnd();
// 侧墙
dBegin(); p=L(-w/2,0); dBox(mat,t,fh,d,p[0],g0+fh/2,p[1],ry); wallGs.push(_dG); dEnd();
dBegin(); p=L(w/2,0); dBox(mat,t,fh,d,p[0],g0+fh/2,p[1],ry); wallGs.push(_dG); dEnd();
// 楼层: 楼板+楼梯
const upperMeshes=[];
for(let f=1;f<=floors;f++){
const by=g0+fh*(f-1);
if(f>1){
const pad2=f===floors?0:1.5;
p=L(-w/4+0.3+pad2*0,0); solidBox(MAT.wood,w/2+0.6-fh*0.1*(f-2),0.18,d-0.7,p[0],by,p[1],ry);
p=L(w/4+0.6+(f===floors?0:0.4),-d/4); solidBox(MAT.wood,w/2-1.4-fh*0.1*(f-2),0.18,d/2-0.4,p[0],by,p[1],ry);
// 楼梯(平滑坡道+视觉台阶)
if(f<floors) stairFlight(MAT.woodDark,x+sn*(w/2-0.9)+cs*(d/2-2),z-cs*(w/2-0.9)-sn*(d/2-2),ry,1.0,d-2.5,by-by*(f>2?1:0),by+fh);
else stairFlight(MAT.woodDark,x+sn*(w/2-0.9)+cs*(d/2-2),z-cs*(w/2-0.9)-sn*(d/2-2),ry,1.0,d-2.5,g0+fh*(floors-1),g0+fh*floors);
}
// 内隔墙
p=L(0,0); solidBox(MAT.plaster,0.18,1.8,d-0.8,p[0],by+d/4,p[1],ry);
// 二层+外墙(非底层的: 不可摧毁, 随坍塌移除)
if(f>=2){
const wh=3.7; // 各户通顶
p=L(0,d/2); solidBox(mat,w,wh,t,p[0],by+wh/2,p[1],ry);
p=L(0,-d/2); solidBox(mat,w,wh,t,p[0],by+wh/2,p[1],ry);
p=L(-w/2,0); solidBox(mat,t,wh,d,p[0],by+wh/2,p[1],ry);
p=L(w/2,0); solidBox(mat,t,wh,d,p[0],by+wh/2,p[1],ry);
// 标记这些为上层部件, 随一层墙全毁而崩塌
for(let k2=world.children.length-12;k2<world.children.length;k2++){ if(k2>=0) upperMeshes.push(world.children[k2]); }
}
}
// 顶 + 女儿墙/坍塌
const topY=g0+fh*floors;
p=L(0,0);
const roofM=solidBox(MAT.rubble,w+0.2,0.2,d+0.2,p[0],topY,p[1],ry);
addSnowCap(roofM);
upperMeshes.push(roofM);
p=L(0,d/2); const pLeft=solidBox(mat,w+0.2,0.55,0.2,p[0],topY+0.35,p[1],ry); upperMeshes.push(pLeft);
p=L(0,-d/2); const pRight=solidBox(mat,w+0.2,0.55,0.2,p[0],topY+0.35,p[1],ry); upperMeshes.push(pRight);
p=L(-w/2,0); const pTop=solidBox(mat,0.2,0.55,d+0.2,p[0],topY+0.35,p[1],ry); upperMeshes.push(pTop);
p=L(w/2,0); const pBot=solidBox(mat,0.2,0.55,d+0.2,p[0],topY+0.35,p[1],ry); upperMeshes.push(pBot);
addCoverAround(x,z,w,d,ry);
// 坍塌钩子: 所有一层承重墙都死后, 上层/顶/女儿墙全体崩塌
if(wallGs.length){
const check=()=>{
const allDead=wallGs.every(g=>g.dead);
if(allDead){
if(wallGs[0]._collapsed) return; wallGs[0]._collapsed=true;
for(const um of upperMeshes){
if(!um||!um.geometry) continue;
try{ spawnWallDebris(um,x,z); }catch(_){}
world.remove(um);
}
for(let k2=0;k2<3;k2++) spawnP(PT.dirt,x+rand(-2,2),g0+rand(0.2,3),z+rand(-2,2),rand(-3,3),rand(1,4),rand(-3,3),rand(0.6,1.2),2,rand(0.8,1.4),0.9,2);
rubblePile(x+rand(-2,2),z+rand(-2,2),2.8);
AudioSys.explosion(Math.hypot(x-camera.position.x,z-camera.position.z)*0.5);
}
};
wallGs.forEach(g=>g._collapseCheck=check);
check(); // 预损毁判定
}
}
// 公寓角楼: 3层大体块 + 底商 + 坍塌角瓦砾坡; 每层楼梯贯穿
function apartment(x,z,ry){
const g0=heightAt(x,z);
const w=12,d=9,fh=3.0,t=0.36;
mesh(new THREE.BoxGeometry(w+0.6,1.4,d+0.6),MAT.stone,x,g0-0.6,z,ry,false,true);
const cs=Math.cos(ry),sn=Math.sin(ry);
const L=(lx,lz)=>[x+lx*cs+lz*sn, z-lx*sn+lz*cs];
let p;
const wallGs=[], upperMeshes=[];
p=L(-w/2+2.2,d/2); NAV_CLEARS.push({x:p[0],z:p[1],r:1.2});
dBegin();
p=L(-w/2+0.5,d/2); dBox(MAT.plaster,1.0,fh,t,p[0],g0+fh/2,p[1],ry); wallGs.push(_dG);
for(let i=0;i<3;i++){
p=L(-w/2+4.2+i*2.6,d/2);
dBegin(); dBox(MAT.plaster,0.7,fh,t,p[0],g0+fh/2,p[1],ry); wallGs.push(_dG); dEnd();
}
dBegin();
p=L(w/2-0.5,d/2); dBox(MAT.plaster,1.0,fh,t,p[0],g0+fh/2,p[1],ry); wallGs.push(_dG);
p=L(0,d/2); dBox(MAT.plaster,w,0.7,t,p[0],g0+fh-0.35,p[1],ry); wallGs.push(_dG);
dEnd();
// 其余外墙不可摧
p=L(0,-d/2); solidBox(MAT.brick,w,fh,t,p[0],g0+fh/2,p[1],ry);
p=L(-w/2,0); solidBox(MAT.brick,t,fh,d,p[0],g0+fh/2,p[1],ry);
p=L(w/2,0); solidBox(MAT.brick,t,fh,d,p[0],g0+fh/2,p[1],ry);
// 各层
for(let f=1;f<=3;f++){
const by=g0+fh*(f-1);
if(f<=1){
p=L(-1.2,0); solidBox(MAT.wood,w-3.4,0.2,d-0.6,p[0],by,p[1],ry);
p=L(w/2-1.1,d/2-3.2); solidBox(MAT.wood,2.2,0.2,d-3.6,p[0],by,p[1],ry);
stairFlight(MAT.woodDark,x+sn*(w/2-1.1)+cs*(d/2-3),z-cs*(w/2-1.1)-sn*(d/2-3),ry,1.6,d-4,g0,g0+fh);
}
if(f>1){
// 楼板(留楼梯井)
p=L(1.2,0); solidBox(MAT.wood,w-3.2,0.2,d-0.6,p[0],by,p[1],ry);
p=L(-1.2,0); solidBox(MAT.wood,w-3.4,0.2,d-0.6,p[0],by,p[1],ry);
p=L(w/2-1.1,d/2-3.2); solidBox(MAT.wood,2.2,0.2,d-3.6,p[0],by,p[1],ry);
stairFlight(MAT.woodDark,x+sn*(w/2-1.1)+cs*(d/2-3),z-cs*(w/2-1.1)-sn*(d/2-3),ry,1.6,d-4,g0+fh*(f-1),g0+fh*f);
}
if(f>=2){
p=L(0,d/2); solidBox(MAT.brick,w,1.0,t,p[0],by+0.5,p[1],ry);
solidBox(MAT.brick,w,1.05,t,p[0],by+fh-0.5,p[1],ry);
for(let i=0;i<4;i++){ p=L(-w/2+1.4+i*3.1,d/2); solidBox(MAT.brick,0.9,fh-2.0,t,p[0],by+fh/2,p[1],ry); }
p=L(0,-d/2); solidBox(MAT.brick,w,fh,t,p[0],by+fh/2,p[1],ry);
p=L(-w/2,0); solidBox(MAT.brick,t,fh,d,p[0],by+fh/2,p[1],ry);
p=L(w/2,0); solidBox(MAT.brick,t,fh,d,p[0],by+fh/2,p[1],ry);
for(let k2=world.children.length-10;k2<world.children.length;k2++){ if(k2>=0) upperMeshes.push(world.children[k2]); }
}
}
// 阳台×2
for(const bx2 of [-w/4,w/4]){
p=L(bx2,d/2+0.55);
solidBox(MAT.stone,2.2,0.14,1.1,p[0],g0+fh*2,p[1],ry);
const q=L(bx2,d/2+1.05);
solidBox(MAT.metalDark,2.2,0.5,0.06,q[0],g0+fh*2+0.36,q[1],ry);
}
// 平顶 + 女儿墙
const topY=g0+fh*3;
p=L(0,0);
addSnowCap(solidBox(MAT.rubble,w+0.3,0.22,d+0.3,p[0],topY,p[1],ry)); upperMeshes.push(world.children[world.children.length-1]);
p=L(0,d/2); solidBox(MAT.brick,w+0.3,0.6,0.22,p[0],topY+0.4,p[1],ry); upperMeshes.push(world.children[world.children.length-1]);
p=L(0,-d/2); solidBox(MAT.brick,w+0.3,0.6,0.22,p[0],topY+0.4,p[1],ry); upperMeshes.push(world.children[world.children.length-1]);
p=L(-w/2,0); solidBox(MAT.brick,0.22,0.6,d+0.3,p[0],topY+0.4,p[1],ry); upperMeshes.push(world.children[world.children.length-1]);
p=L(w/2,0); solidBox(MAT.brick,0.22,0.6,d+0.3,p[0],topY+0.4,p[1],ry); upperMeshes.push(world.children[world.children.length-1]);
// 坍塌角: 瓦砾坡
p=L(w/2-1.5,-d/2+1.2); rubblePile(p[0],p[1],2.2);
addCoverAround(x,z,w,d,ry);
// 坍塌钩子
if(wallGs.length){
const check=()=>{
if(wallGs.every(g=>g.dead)&&!wallGs[0]._collapsed){
wallGs[0]._collapsed=true;
for(const um of upperMeshes){ try{ if(um&&um.geometry){ spawnWallDebris(um,x,z); world.remove(um); } }catch(_){} }
for(let k2=0;k2<4;k2++) spawnP(PT.dirt,x+rand(-2,2),g0+rand(0.5,4),z+rand(-2,2),rand(-3,3),rand(1,5),rand(-3,3),rand(0.7,1.3),2.5,rand(0.8,1.6),0.9,2);
rubblePile(x+rand(-3,3),z+rand(-3,3),3.2);
AudioSys.explosion(Math.hypot(x-camera.position.x,z-camera.position.z)*0.55);
}
};
wallGs.forEach(g=>g._collapseCheck=check);
check();
}
}
// 厂房: 大跨度锯齿顶车间, 两端大门, 内部机床/行车梁, 高烟囱
function factoryHall(x,z,ry){
const g0=heightAt(x,z);
const w=15,d=24,H=5.2,t=0.4;
const cs=Math.cos(ry),sn=Math.sin(ry);
const L=(lx,lz)=>[x+lx*cs+lz*sn, z-lx*sn+lz*cs];
let p;
mesh(new THREE.BoxGeometry(w+0.8,0.3,d+0.8),MAT.stone,x,g0+0.02,z,ry,false,true);
// 两端山墙(大门开口)
for(const end of [-1,1]){
p=L(0,end*d/2); NAV_CLEARS.push({x:p[0],z:p[1],r:1.6});
dBegin();
p=L(-w/2+2.2,end*d/2); dBox(MAT.brick,w/2-2.2,H,t,p[0],g0+H/2,p[1],ry);
p=L(w/2-2.2,end*d/2); dBox(MAT.brick,w/2-2.2,H,t,p[0],g0+H/2,p[1],ry);
p=L(0,end*d/2); dBox(MAT.brick,4.4,H-3.4,t,p[0],g0+H-(H-3.4)/2,p[1],ry);
dEnd();
}
// 侧墙: 砖柱+裙墙+高窗
for(const side of [-1,1]){
for(let i=0;i<5;i++){
p=L(side*w/2,-d/2+2+i*(d-4)/4);
solidBox(MAT.brick,t+0.24,H,0.9,p[0],g0+H/2,p[1],ry);
}
p=L(side*w/2,0);
solidBox(MAT.brick,t,1.4,d,p[0],g0+0.7,p[1],ry);
solidBox(MAT.brick,t,1.0,d,p[0],g0+H-0.5,p[1],ry);
}
// 锯齿顶(3列)
for(let i=0;i<3;i++){
p=L(-w/2+w/6+i*w/3,0);
const r1=mesh(new THREE.BoxGeometry(w/3+0.3,0.16,d+0.4),MAT.metal,p[0],g0+H+0.7,p[1],ry);
r1.rotation.z=0.34;
addBoxCollider(p[0],g0+H+0.7,p[1],Math.abs(sn)>0.5?d+0.4:w/3,0.4,Math.abs(sn)>0.5?w/3:d+0.4);
}
// 内部: 机床×4 + 行车梁
for(let i=0;i<4;i++){
p=L(rand(-w/2+2.5,w/2-2.5),-d/2+4+i*(d-8)/3);
solidBox(MAT.metalDark,1.6,1.2,2.4,p[0],g0+0.6,p[1],ry+rand(-0.2,0.2));
coverPoints.push({x:p[0]+1.4,z:p[1]},{x:p[0]-1.4,z:p[1]});
}
p=L(0,0);
solidBox(MAT.metalDark,w-1.5,0.3,0.5,p[0],g0+H-0.6,p[1],ry);
// 烟囱
p=L(w/2+2.5,-d/2+3);
mesh(new THREE.CylinderGeometry(0.9,1.3,13,10),MAT.brick,p[0],g0+6.5,p[1]);
CYLS.push({x:p[0],z:p[1],r:1.3,y0:g0,y1:g0+13});
addCoverAround(x,z,w,d,ry);
}
// 仓库: 双坡大顶 + 滑门 + 货箱堆
function warehouse(x,z,ry){
const g0=heightAt(x,z);
const w=10,d=16,H=3.6,t=0.3;
const cs=Math.cos(ry),sn=Math.sin(ry);
const L=(lx,lz)=>[x+lx*cs+lz*sn, z-lx*sn+lz*cs];
let p;
p=L(0,d/2); NAV_CLEARS.push({x:p[0],z:p[1],r:1.5});
dBegin();
p=L(-w/2+1.6,d/2); dBox(MAT.wood,w/2-1.6,H,t,p[0],g0+H/2,p[1],ry);
p=L(w/2-1.6,d/2); dBox(MAT.wood,w/2-1.6,H,t,p[0],g0+H/2,p[1],ry);
p=L(0,d/2); dBox(MAT.wood,3.2,H-2.6,t,p[0],g0+H-(H-2.6)/2,p[1],ry);
dEnd();
dBegin(); p=L(0,-d/2); dBox(MAT.wood,w,H,t,p[0],g0+H/2,p[1],ry); dEnd();
dBegin(); p=L(-w/2,0); dBox(MAT.wood,t,H,d,p[0],g0+H/2,p[1],ry); dEnd();
dBegin(); p=L(w/2,0); dBox(MAT.wood,t,H,d,p[0],g0+H/2,p[1],ry); dEnd();
// 双坡顶
p=L(-w/4-0.1,0);
const r1=mesh(new THREE.BoxGeometry(w*0.62,0.14,d+0.6),MAT.roof,p[0],g0+H+0.75,p[1],ry); r1.rotation.z=0.5; addSnowCap(r1);
p=L(w/4+0.1,0);
const r2=mesh(new THREE.BoxGeometry(w*0.62,0.14,d+0.6),MAT.roof,p[0],g0+H+0.75,p[1],ry); r2.rotation.z=-0.5; addSnowCap(r2);
// 内部货箱堆(可站上)
for(let i=0;i<3;i++){
p=L(rand(-w/2+1.8,w/2-1.8),-d/2+3+i*(d-6)/2);
solidBox(MAT.woodDark,1.8,1.1,1.8,p[0],g0+0.55,p[1],ry+rand(-0.3,0.3));
if(Math.random()<0.6) solidBox(MAT.wood,1.2,0.9,1.2,p[0],g0+1.55,p[1],ry+rand(-0.3,0.3));
}
addCoverAround(x,z,w,d,ry);
}
// 铁轨: 枕木 + 双钢轨
function railTrack(x1,z1,x2,z2){
const dx=x2-x1,dz=z2-z1;
const len=Math.hypot(dx,dz), ry=Math.atan2(dx,dz);
const ties=Math.floor(len/0.9);
const tieMat=MAT.woodDark, railMat=MAT.metalDark;
for(let i=0;i<ties;i++){
const t0=i/ties, x=x1+dx*t0, z=z1+dz*t0;
mesh(new THREE.BoxGeometry(1.7,0.1,0.28),tieMat,x,heightAt(x,z)+0.06,z,ry,false,true);
}
const segs=Math.ceil(len/12);
for(let i=0;i<segs;i++){
const t0=(i+0.5)/segs, x=x1+dx*t0, z=z1+dz*t0;
const gy=heightAt(x,z);
for(const s of [-0.72,0.72]){
mesh(new THREE.BoxGeometry(0.09,0.14,len/segs+0.2),railMat,x+Math.cos(ry)*s,gy+0.18,z-Math.sin(ry)*s,ry,false,true);
}
}
}
// 货车皮: 车厢可作掩体, 顶可站
function trainWagon(x,z,ry,open){
const g0=heightAt(x,z);
solidBox(MAT.metalDark,2.6,0.5,7.6,x,g0+0.75,z,ry);
if(open){
// 敞车: 低帮
solidBox(MAT.rubble,2.6,0.9,7.4,x,g0+1.35,z,ry);
} else {
const wag=solidBox(new THREE.MeshLambertMaterial({map:TEX.wood}),2.6,2.2,7.6,x,g0+2.1,z,ry);
addSnowCap(wag);
}
const cs=Math.cos(ry),sn=Math.sin(ry);
for(const o of [-2.6,2.6]){
const wx=x+sn*o, wz=z+cs*o;
const wh1=mesh(new THREE.CylinderGeometry(0.42,0.42,0.25,10),MAT.metalDark,wx+cs*0.9,g0+0.42,wz-sn*0.9);
wh1.rotation.z=HPI; wh1.rotation.y=ry;
const wh2=mesh(new THREE.CylinderGeometry(0.42,0.42,0.25,10),MAT.metalDark,wx-cs*0.9,g0+0.42,wz+sn*0.9);
wh2.rotation.z=HPI; wh2.rotation.y=ry;
}
addCoverAround(x,z,2.8,7.8,ry);
}
// 蒸汽机车
function locomotive(x,z,ry){
const g0=heightAt(x,z);
solidBox(MAT.metalDark,2.6,0.6,8.6,x,g0+0.8,z,ry);
const cs=Math.cos(ry),sn=Math.sin(ry);
// 锅炉
const boiler=mesh(new THREE.CylinderGeometry(1.05,1.05,5.4,12),MAT.metalDark,x+sn*(-1.2),g0+2.15,z+cs*(-1.2));
boiler.rotation.order='YXZ';
boiler.rotation.set(HPI,ry,0);
addBoxCollider(x+sn*(-1.2),g0+2.1,z+cs*(-1.2),Math.abs(sn)>0.5?5.4:2.1,2.1,Math.abs(sn)>0.5?2.1:5.4);
// 驾驶室
solidBox(MAT.metal,2.5,2.5,2.2,x+sn*2.6,g0+2.35,z+cs*2.6,ry);
// 烟囱与汽包
mesh(new THREE.CylinderGeometry(0.28,0.36,1.1,8),MAT.metalDark,x+sn*(-3.3),g0+3.75,z+cs*(-3.3));
mesh(new THREE.SphereGeometry(0.5,8,6),MAT.metalDark,x+sn*(-1.2),g0+3.3,z+cs*(-1.2));
for(const o of [-3.0,-1.0,1.0]){
const wx=x+sn*o, wz=z+cs*o;
const wh1=mesh(new THREE.CylinderGeometry(0.62,0.62,0.28,10),MAT.metalDark,wx+cs*1.0,g0+0.62,wz-sn*1.0);
wh1.rotation.z=HPI; wh1.rotation.y=ry;
const wh2=mesh(new THREE.CylinderGeometry(0.62,0.62,0.28,10),MAT.metalDark,wx-cs*1.0,g0+0.62,wz+sn*1.0);
wh2.rotation.z=HPI; wh2.rotation.y=ry;
}
addCoverAround(x,z,3,9,ry);
}
// 火车站: 站房 + 低站台(可跨上) + 雨棚
function trainStation(x,z,ry){
const g0=heightAt(x,z);
rowHouse(x,z,ry,2,9,7,MAT.plaster,0.15);
const cs=Math.cos(ry),sn=Math.sin(ry);
// 站台(0.45高, 可直接走上)
const px=x+sn*6.5, pz=z+cs*6.5;
solidBox(MAT.stone,22,0.45,3.4,px,heightAt(px,pz)+0.22,pz,ry+HPI);
// 雨棚
for(let i=-2;i<=2;i++){
const cx2=px+cs*i*4.5, cz2=pz-sn*i*4.5;
mesh(new THREE.CylinderGeometry(0.08,0.08,2.6,6),MAT.metalDark,cx2,heightAt(cx2,cz2)+1.75,cz2);
}
const cnp=mesh(new THREE.BoxGeometry(20,0.12,3.0),MAT.metal,px,heightAt(px,pz)+3.15,pz,ry+HPI);
addSnowCap(cnp);
// 长椅×2
for(const o of [-4,4]){
const bx2=px+cs*o, bz2=pz-sn*o;
solidBox(MAT.woodDark,1.8,0.45,0.5,bx2,heightAt(bx2,bz2)+0.65,bz2,ry+HPI);
}
}
// 石拱桥: 三段桥面跨河(两端可直接走上)
function archBridge(x,z,ry,len){
len=len||14;
const g0=Math.max(heightAt(x+Math.sin(ry)*len*0.7,z+Math.cos(ry)*len*0.7),heightAt(x-Math.sin(ry)*len*0.7,z-Math.cos(ry)*len*0.7));
const cs=Math.cos(ry),sn=Math.sin(ry);
const segs=[[-len/3,g0+0.26,0.14],[0,g0+0.56,0],[len/3,g0+0.26,-0.14]];
for(const [o,y,tilt] of segs){
const m=solidBox(MAT.stone,3.4,0.3,len/3+0.5,x+sn*o,y,z+cs*o,ry);
m.rotation.x=tilt;
}
// 护栏
for(const side of [-1.6,1.6]){
for(const [o,y] of segs){
solidBox(MAT.stone,0.24,0.5,len/3+0.3,x+sn*o+cs*side,y+0.4,z+cs*o-sn*side,ry);
}
}
// 桥墩
for(const o of [-len/4,len/4]){
mesh(new THREE.BoxGeometry(2.8,2.6,1.2),MAT.stone,x+sn*o,g0-0.9,z+cs*o,ry);
}
}
// 窑洞: 嵌坡拱面窑居
function caveDwelling(x,z,face){
const g0=heightAt(x,z);
const cs=Math.cos(face),sn=Math.sin(face);
const L=(lx,lz)=>[x+lx*cs+lz*sn, z-lx*sn+lz*cs];
let p;
// 前脸(拱门洞)
p=L(0,1.6); NAV_CLEARS.push({x:p[0],z:p[1],r:1.0});
dBegin();
p=L(-1.7,1.6); dBox(MAT.plaster,1.6,2.9,0.4,p[0],g0+1.45,p[1],face);
p=L(1.7,1.6); dBox(MAT.plaster,1.6,2.9,0.4,p[0],g0+1.45,p[1],face);
p=L(0,1.6); dBox(MAT.plaster,1.8,0.9,0.4,p[0],g0+2.45,p[1],face);
dEnd();
// 内室三面墙+顶
p=L(0,-1.6); solidBox(MAT.plaster,5,2.9,0.4,p[0],g0+1.45,p[1],face);
p=L(-2.5,0); solidBox(MAT.plaster,0.4,2.9,3.6,p[0],g0+1.45,p[1],face);
p=L(2.5,0); solidBox(MAT.plaster,0.4,2.9,3.6,p[0],g0+1.45,p[1],face);
p=L(0,0); solidBox(MAT.rubble,5.4,0.5,4.0,p[0],g0+3.1,p[1],face);
// 覆土
p=L(0,-0.8);
const mound=mesh(new THREE.SphereGeometry(3.6,10,7),MAT.grassMound||(MAT.grassMound=new THREE.MeshLambertMaterial({color:0xb99e6c})),p[0],g0+2.2,p[1]);
mound.scale.y=0.55;
// 窗与内饰
p=L(0,0.3); solidBox(MAT.woodDark,1.4,0.6,0.8,p[0],g0+0.3,p[1],face);
addCoverAround(x,z,5,4,face);
}
// 梯田坎: 沿等高线的石坎
function terraceEdge(x,z,len,ry){
const steps=Math.ceil(len/5);
const cs=Math.cos(ry),sn=Math.sin(ry);
for(let i=0;i<steps;i++){
const o=-len/2+(i+0.5)*len/steps;
const px=x+sn*o, pz=z+cs*o;
const gy=heightAt(px,pz);
mesh(new THREE.BoxGeometry(len/steps+0.3,0.7,0.4),MAT.stone,px,gy+0.2,pz,ry,true,true);
}
}
// ===================== CQB 多层可清剿建筑库 (阴暗街区) =====================
// 设计目标(对应需求2): 可进入多层结构 + 可攀爬楼梯 + 走廊分隔 + 多类型房间
//                      + 可破坏门窗 + 室内掩体, 支持垂直作战与逐屋清剿。
// 关键做法:
//  1) 外轮廓预置"门洞/窗洞"——每层外墙由若干段拼合, 留出真实可通行的开口;
//  2) 内部按网格切分房间, 每间留 1 个 1.1~1.3m 门洞(注册 NAV_CLEARS 保证 A* 通行);
//  3) 每层楼梯贯穿(与 rowHouse 相同的 stairFlight 坡道), 保证 Bot 与玩家都能上楼;
//  4) 窗框/门板用 dBegin/dBox 注册为可破坏结构, 可被火力与爆炸打穿。

// 通用局部→世界坐标变换辅助(与 rowHouse 保持一致)
function _cqbL(x,z,ry){ const cs=Math.cos(ry),sn=Math.sin(ry); return (lx,lz)=>[x+lx*cs+lz*sn, z-lx*sn+lz*cs]; }

// ---- 主体: CQB 三层公寓楼 ----
// 内部结构: 每层被内墙切成 3~4 个房间 + 1 条纵向走廊; 楼梯位于走廊端头。
// 可破坏件: 外墙窗洞门板、内部门板、室内隔断(部分) → 逐屋清剿时会被打穿。
function cqbApartment(x,z,ry,opt){
opt=opt||{};
const floors=opt.floors||randi(2,3);
const w=opt.w||13, d=opt.d||10, fh=3.05, t=0.32;
const g0=heightAt(x,z);
const L=_cqbL(x,z,ry);
let p;
// 基座(略高于地面, 防积水穿模)
mesh(new THREE.BoxGeometry(w+0.7,1.4,d+0.7),MAT.stone,x,g0-0.65,z,ry,false,true);
const wallGs=[], upperMeshes=[];

// ===== 一层: 主入口 + 多房间 =====
const dw=1.35;
// 前墙(入口门 + 两侧窗)
dBegin();
{
const L1=(w-dw)/2;
p=L(-(dw+L1)/2,d/2); dBox(MAT.plaster,L1,fh,t,p[0],g0+fh/2,p[1],ry); wallGs.push(_dG);
p=L((dw+L1)/2,d/2);  dBox(MAT.plaster,L1,fh,t,p[0],g0+fh/2,p[1],ry); wallGs.push(_dG);
// 门楣
p=L(0,d/2); dBox(MAT.plaster,dw,0.85,t,p[0],g0+fh-0.42,p[1],ry); wallGs.push(_dG);
// 两侧窗洞的过梁与窗台
for(const wx of [-w/4-0.1,w/4+0.1]){
p=L(wx,d/2); dBox(MAT.plaster,1.5,fh-2.0,t,p[0],g0+fh-1.0,p[1],ry); wallGs.push(_dG);
p=L(wx,d/2); dBox(MAT.plaster,1.5,0.95,t,p[0],g0+0.47,p[1],ry); wallGs.push(_dG);
}
}
dEnd();
NAV_CLEARS.push({x:L(0,d/2)[0], z:L(0,d/2)[1], r:1.15});
// 后墙: 后门 + 窗(后门通向巷/后院, 提供第二出口)
dBegin();
{
const bw=1.25, L2=(w-bw)/2;
p=L(-(bw+L2)/2,-d/2); dBox(MAT.plaster,L2,fh,t,p[0],g0+fh/2,p[1],ry); wallGs.push(_dG);
p=L((bw+L2)/2,-d/2);  dBox(MAT.plaster,L2,fh,t,p[0],g0+fh/2,p[1],ry); wallGs.push(_dG);
p=L(0,-d/2); dBox(MAT.plaster,bw,0.85,t,p[0],g0+fh-0.42,p[1],ry); wallGs.push(_dG);
}
dEnd();
NAV_CLEARS.push({x:L(0,-d/2)[0], z:L(0,-d/2)[1], r:1.1});
// 侧墙: 每侧两窗(一层可跳窗入内)
for(const side of [-1,1]){
dBegin();
for(const wz of [-d/4,d/4]){
p=L(side*w/2,wz);
dBox(MAT.plaster,t,fh-2.05,1.5,p[0],g0+fh-1.02,p[1],ry); wallGs.push(_dG);
}
p=L(side*w/2,-d/4); dBox(MAT.plaster,t,0.95,1.5,p[0],g0+0.47,p[1],ry); wallGs.push(_dG);
p=L(side*w/2,d/4);  dBox(MAT.plaster,t,0.95,1.5,p[0],g0+0.47,p[1],ry); wallGs.push(_dG);
dEnd();
}
// 一层室内隔断: 纵走廊(沿 d 方向)居中, 两侧各切出房间
// 每条隔断都是"两段墙 + 中间 1.15m 门洞", 门洞注册 NAV_CLEARS 保证 Bot 逐屋通行
for(const side of [-1,1]){
const lx=side*(w/4+0.25);          // 隔断所在局部 X
const wz=0;                         // 隔断延展方向
const segLen=(d-1.6)/2, doorw=1.15;
dBegin();
p=L(lx, -d/2+0.8+segLen/2); dBox(MAT.plaster,0.18,2.9,segLen,p[0],g0+1.45,p[1],ry); wallGs.push(_dG);
p=L(lx,  d/2-0.8-segLen/2); dBox(MAT.plaster,0.18,2.9,segLen,p[0],g0+1.45,p[1],ry); wallGs.push(_dG);
dEnd();
// 门洞通行区(两段墙之间的缺口)
const [clx,clz]=L(lx,wz);
NAV_CLEARS.push({x:clx,z:clz,r:0.95});
}
// 横墙: 把走廊端头封住, 隔出门厅(挡枪线, 制造拐角)
for(const gz2 of [-d/2+1.2, d/2-1.2]){
const Lw=(w-2.8)/2, doorw=1.15;
for(const side of [-1,1]){
const lx=side*(1.4+doorw/2+Lw/2);
dBegin();
p=L(lx,gz2); dBox(MAT.plaster,Lw,2.75,0.18,p[0],g0+1.38,p[1],ry); wallGs.push(_dG);
dEnd();
}
const [clx,clz]=L(0,gz2);
NAV_CLEARS.push({x:clx,z:clz,r:0.95});
}
// 楼梯(走廊端头, 贯通全楼)
const stX=w/2-1.1;
stairFlight(MAT.woodDark, L(stX, d/2-2.0)[0], L(stX, d/2-2.0)[1], ry+HPI, 1.25, d-4.2, g0, g0+fh);
// 一层室内掩体: 倒置柜/货架/沙袋
const indoor=[];
for(let i=0;i<4;i++){
const lx=rand(-w/2+1.4,w/2-1.4), lz=rand(-d/2+1.4,d/2-1.4);
const [mx,mz]=L(lx,lz);
indoor.push([mx,mz,lx,lz]);
}
for(const [mx,mz,lx,lz] of indoor){
if(Math.random()<0.5) solidBox(MAT.woodDark,rand(0.9,1.5),rand(0.75,1.15),rand(0.5,0.8),mx,g0+0.55,mz,rand(0,TAU));
else solidBox(MAT.sandbag,rand(1.0,1.5),0.7,0.75,mx,g0+0.35,mz,rand(0,TAU));
coverPoints.push({x:mx+0.9,z:mz},{x:mx-0.9,z:mz});
}

// ===== 二层及以上 + 屋顶 =====
_cqbApartmentUpper(floors,fh,t,w,d,stX,g0,g0,L,ry,wallGs,upperMeshes);
const topY=_cqbApartmentRoof(x,z,ry,w,d,floors,fh,g0,L,wallGs,upperMeshes);
CQ_BUILDINGS.push({x,z,ry,w,d,floors,g0,topY});
}

// ---- 上层外墙工具: 自动按墙长均分留窗洞(窗台0.95m / 窗楣净高1.4m) ----
// axis='x' → 墙沿局部X铺展, 厚度落在Z(前/后墙); axis='z' → 沿局部Z铺展, 厚度落在X(侧墙)
// along=沿轴中心偏移; off=垂直于墙轴的位置(如 d/2 表示前墙)
function _cqbSeg(mat,L,ry,axis,along,off,segLen,segH,cy,t,gs){
let px,pz,w,d;
if(axis==='x'){ const q=L(along,off); px=q[0]; pz=q[1]; w=segLen; d=t; }
else          { const q=L(off,along); px=q[0]; pz=q[1]; w=t; d=segLen; }
// dBox 依赖 dBegin/dEnd 上下文(_dG), 因此每段墙自成一个可破坏分组
dBegin();
dBox(mat,w,segH,d, px,cy,pz,ry);
const g=dEnd();
if(g&&gs) gs.push(g);
}
function _cqbWallWins(mat,L,ry,axis,span,off,y0,fh,t,gs,opts){
opts=opts||{};
const sill=0.95, clear=1.4;                 // 窗台高 / 窗洞净高
const n=Math.max(1, opts.n||Math.round(span/3.4));
const seg=span/n, gapW=Math.min(opts.winW||1.4, seg*0.6);
const solidLen=seg-gapW;
const headH=fh-sill-clear;
for(let k=0;k<n;k++){
const c=(k+0.5)*seg-span/2;
if(sill>0.02)      _cqbSeg(mat,L,ry,axis,c,off,solidLen,sill,y0+sill/2,t,gs);
if(headH>0.02)     _cqbSeg(mat,L,ry,axis,c,off,solidLen,headH,y0+sill+clear+headH/2,t,gs);
}
for(let k=1;k<n;k++){                        // 窗间墙垛
const c=k*seg-span/2;
_cqbSeg(mat,L,ry,axis,c,off,gapW,fh-sill,y0+sill+(fh-sill)/2,t,gs);
}
}

// ---- cqbApartment 续: 二层及以上结构 ----
function _cqbApartmentUpper(floors,fh,t,w,d,stX,g0,by0,L,ry,wallGs,upperMeshes){
let p;
for(let f=2;f<=floors;f++){
const by=by0+fh*(f-1);
// 楼板: 分块拼合, 留出楼梯井与走廊
p=L(-w/2+2.4,0);
solidBox(MAT.wood,w-4.0,0.2,d-0.4,p[0],by,p[1],ry);
// 外周楼板(补边)
p=L(0,d/2-1.0); solidBox(MAT.wood,w-0.6,0.2,1.6,p[0],by,p[1],ry);
p=L(0,-d/2+1.0); solidBox(MAT.wood,w-0.6,0.2,1.6,p[0],by,p[1],ry);
// 楼梯继续
stairFlight(MAT.woodDark, L(stX, d/2-2.0)[0], L(stX, d/2-2.0)[1], ry+HPI, 1.25, d-4.2, by, by+fh);
// 二层外墙: 逐段留窗洞(可探出射击/跳窗) —— 严禁整面实墙, 否则二层成密封盒
_cqbWallWins(MAT.brick, L, ry, 'x', w,  d/2, by, fh, t, wallGs, {winW:1.5});
_cqbWallWins(MAT.brick, L, ry, 'x', w, -d/2, by, fh, t, wallGs, {winW:1.5});
_cqbWallWins(MAT.brick, L, ry, 'z', d, -w/2, by, fh, t, wallGs, {winW:1.4});
_cqbWallWins(MAT.brick, L, ry, 'z', d,  w/2, by, fh, t, wallGs, {winW:1.4});
// 二层内隔断: 4 间房, 每道隔断留 1.15m 门洞(否则房间互不连通, 无法逐屋清剿)
for(const gz2 of [-d/5, d/5]){
const doorw=1.15, segLen=(w-1.2-doorw)/2;
for(const side of [-1,1]){
const c=side*(doorw/2+segLen/2);
_cqbSeg(MAT.plaster,L,ry,'x',c,gz2,segLen,2.6,by+1.3,0.18,wallGs);
}
const q=L(0,gz2); NAV_CLEARS.push({x:q[0],z:q[1],r:0.9});
}
{ // 纵向隔断(带门洞)
const doorw=1.15, segLen=(d-1.4-doorw)/2;
for(const side of [-1,1]){
const c=side*(doorw/2+segLen/2);
_cqbSeg(MAT.plaster,L,ry,'z',c,0.6,segLen,2.6,by+1.3,0.18,wallGs);
}
const q=L(0.6,0); NAV_CLEARS.push({x:q[0],z:q[1],r:0.9});
}
// 二层室内掩体
for(let i=0;i<3;i++){
const [mx,mz]=L(rand(-w/2+1.5,w/2-1.5), rand(-d/2+1.5,d/2-1.5));
solidBox(Math.random()<0.5?MAT.woodDark:MAT.metalDark, rand(0.8,1.3),rand(0.6,1.0),rand(0.5,0.9), mx,by+0.5,mz, rand(0,TAU));
coverPoints.push({x:mx,z:mz+0.9});
}
// 记录上层部件供坍塌
for(let k2=world.children.length-14;k2<world.children.length;k2++){ if(k2>=0) upperMeshes.push(world.children[k2]); }
}
}

// ---- cqbApartment 续: 屋顶 / 掩体 / 坍塌钩子 ----
function _cqbApartmentRoof(x,z,ry,w,d,floors,fh,g0,L,wallGs,upperMeshes){
let p;
// 屋顶 + 女儿墙 + 屋顶战术掩体(制高点)
const topY=g0+fh*floors;
p=L(0,0);
const roofM=solidBox(MAT.rubble,w+0.3,0.22,d+0.3,p[0],topY,p[1],ry);
addSnowCap(roofM); upperMeshes.push(roofM);
for(const [lx,lz,sw,sd] of [[0,d/2,w+0.3,0.24],[0,-d/2,w+0.3,0.24],[-w/2,0,0.24,d+0.3],[w/2,0,0.24,d+0.3]]){
p=L(lx,lz); upperMeshes.push(solidBox(MAT.brick,sw,0.7,sd,p[0],topY+0.46,p[1],ry));
}
// 屋顶沙袋与通风管(垂直作战掩体)
for(let i=0;i<3;i++){
const [mx,mz]=L(rand(-w/2+1.6,w/2-1.6), rand(-d/2+1.6,d/2-1.6));
solidBox(MAT.sandbag,rand(1.0,1.6),0.72,0.8, mx,topY+0.47,mz, rand(0,TAU));
}
for(let i=0;i<2;i++){
const [mx,mz]=L(rand(-w/2+1.6,w/2-1.6), rand(-d/2+1.6,d/2-1.6));
mesh(new THREE.CylinderGeometry(0.34,0.34,1.1,9),MAT.metalDark, mx,topY+0.72,mz);
CYLS.push({x:mx,z:mz,r:0.4,y0:topY,y1:topY+1.3});
}
addCoverAround(x,z,w,d,ry);
// 楼梯井护栏(防止意外坠落)
p=L(-w/2+1.2,0); solidBox(MAT.metalDark,0.12,1.0,d-4.0,p[0],g0+fh*(floors-1)+fh-0.5,p[1],ry);

// 坍塌钩子: 一层承重墙全毁 → 上层整体坍塌
if(wallGs.length){
const check=()=>{
if(wallGs.every(g=>g.dead)&&!wallGs[0]._collapsed){
wallGs[0]._collapsed=true;
for(const um of upperMeshes){ try{ if(um&&um.geometry){ spawnWallDebris(um,x,z); world.remove(um); } }catch(_){} }
for(let k2=0;k2<4;k2++) spawnP(PT.dirt,x+rand(-3,3),g0+rand(0.5,5),z+rand(-3,3),rand(-3,3),rand(1,5),rand(-3,3),rand(0.7,1.4),2.6,rand(0.8,1.6),0.9,2);
rubblePile(x+rand(-3,3),z+rand(-3,3),3.2);
AudioSys.explosion(Math.hypot(x-camera.position.x,z-camera.position.z)*0.6);
}
};
wallGs.forEach(g=>g._collapseCheck=check);
check();
}
return topY;
}
const CQ_BUILDINGS=[];

// ---- CQB 联排窄楼: 单开间、可穿行两层的"街屋"(巷道两侧主力) ----
function cqbRowhouse(x,z,ry,opt){
opt=opt||{};
const floors=opt.floors||2, w=opt.w||5.6, d=opt.d||9.0, fh=3.0, t=0.3;
const g0=heightAt(x,z);
const L=_cqbL(x,z,ry); let p;
mesh(new THREE.BoxGeometry(w+0.5,1.2,d+0.5),MAT.stone,x,g0-0.55,z,ry,false,true);
const wallGs=[], upperMeshes=[];
// 前门(朝街)——直通巷道
const dw=1.2, L1=(w-dw)/2;
dBegin();
p=L(-(dw+L1)/2,d/2); dBox(MAT.plaster,L1,fh,t,p[0],g0+fh/2,p[1],ry); wallGs.push(_dG);
p=L((dw+L1)/2,d/2);  dBox(MAT.plaster,L1,fh,t,p[0],g0+fh/2,p[1],ry); wallGs.push(_dG);
p=L(0,d/2); dBox(MAT.plaster,dw,0.8,t,p[0],g0+fh-0.4,p[1],ry); wallGs.push(_dG);
dEnd();
NAV_CLEARS.push({x:L(0,d/2)[0], z:L(0,d/2)[1], r:1.05});
// 后门(朝后院/另一条巷)——形成"穿屋捷径"
const bw=1.1, L2=(w-bw)/2;
dBegin();
p=L(-(bw+L2)/2,-d/2); dBox(MAT.plaster,L2,fh,t,p[0],g0+fh/2,p[1],ry); wallGs.push(_dG);
p=L((bw+L2)/2,-d/2);  dBox(MAT.plaster,L2,fh,t,p[0],g0+fh/2,p[1],ry); wallGs.push(_dG);
p=L(0,-d/2); dBox(MAT.plaster,bw,0.8,t,p[0],g0+fh-0.4,p[1],ry); wallGs.push(_dG);
dEnd();
NAV_CLEARS.push({x:L(0,-d/2)[0], z:L(0,-d/2)[1], r:1.0});
// 侧墙(窄, 带跳窗)
for(const side of [-1,1]){
dBegin();
p=L(side*w/2,0);
dBox(MAT.brick,t,1.0,1.4,p[0],g0+0.5,p[1],ry); wallGs.push(_dG);
p=L(side*w/2,0);
dBox(MAT.brick,t,0.95,1.4,p[0],g0+fh-0.48,p[1],ry); wallGs.push(_dG);
dEnd();
}
// 一层: 前后两小间 + 中间楼梯
p=L(0,d/6); solidBox(MAT.plaster,w-0.9,2.7,0.18,p[0],g0+1.35,p[1],ry);
p=L(0,-d/6); solidBox(MAT.plaster,w-0.9,2.7,0.18,p[0],g0+1.35,p[1],ry);
stairFlight(MAT.woodDark, L(w/2-1.0, d/2-1.8)[0], L(w/2-1.0,d/2-1.8)[1], ry+HPI, 1.05, d-3.4, g0, g0+fh);
// 室内掩体
for(let i=0;i<3;i++){
const [mx,mz]=L(rand(-w/2+1.0,w/2-1.0), rand(-d/2+1.2,d/2-1.2));
solidBox(Math.random()<0.5?MAT.woodDark:MAT.sandbag, rand(0.8,1.2),rand(0.6,0.95),rand(0.5,0.8), mx,g0+0.45,mz, rand(0,TAU));
coverPoints.push({x:mx,z:mz});
}
// 二层
for(let f=2;f<=floors;f++){
const by=g0+fh*(f-1);
p=L(-w/2+1.6,0); solidBox(MAT.wood,w-2.8,0.2,d-0.5,p[0],by,p[1],ry);
p=L(0,d/2-0.9); solidBox(MAT.wood,w-0.5,0.2,1.5,p[0],by,p[1],ry);
p=L(0,-d/2+0.9); solidBox(MAT.wood,w-0.5,0.2,1.5,p[0],by,p[1],ry);
stairFlight(MAT.woodDark, L(w/2-1.0,d/2-1.8)[0], L(w/2-1.0,d/2-1.8)[1], ry+HPI, 1.05, d-3.4, by, by+fh);
// 二层外墙: 留窗洞(联排窄楼, 每面 1~2 窗) —— 严禁整面实墙
_cqbWallWins(MAT.brick, L, ry, 'x', w,  d/2, by, fh, t, wallGs, {n:2, winW:1.2});
_cqbWallWins(MAT.brick, L, ry, 'x', w, -d/2, by, fh, t, wallGs, {n:2, winW:1.2});
_cqbWallWins(MAT.brick, L, ry, 'z', d, -w/2, by, fh, t, wallGs, {n:2, winW:1.2});
_cqbWallWins(MAT.brick, L, ry, 'z', d,  w/2, by, fh, t, wallGs, {n:2, winW:1.2});
// 二层内隔断: 前后两室, 中间留 1.1m 门洞保证连通
{
const doorw=1.1, segLen=(w-0.8-doorw)/2;
for(const side of [-1,1]){
const c=side*(doorw/2+segLen/2);
_cqbSeg(MAT.plaster,L,ry,'x',c,0,segLen,2.5,by+1.25,0.18,wallGs);
}
const q=L(0,0); NAV_CLEARS.push({x:q[0],z:q[1],r:0.85});
}
for(let i=0;i<2;i++){
const [mx,mz]=L(rand(-w/2+1.1,w/2-1.1), rand(-d/2+1.2,d/2-1.2));
solidBox(MAT.woodDark, rand(0.7,1.1),rand(0.55,0.9),rand(0.5,0.8), mx,by+0.42,mz, rand(0,TAU));
coverPoints.push({x:mx,z:mz});
}
for(let k2=world.children.length-12;k2<world.children.length;k2++){ if(k2>=0) upperMeshes.push(world.children[k2]); }
}
const topY=g0+fh*floors;
p=L(0,0);
upperMeshes.push(addSnowCap(solidBox(MAT.rubble,w+0.2,0.2,d+0.2,p[0],topY,p[1],ry)));
for(const [lx,lz,sw,sd] of [[0,d/2,w+0.2,0.22],[0,-d/2,w+0.2,0.22]]){
p=L(lx,lz); upperMeshes.push(solidBox(MAT.brick,sw,0.6,sd,p[0],topY+0.4,p[1],ry));
}
addCoverAround(x,z,w,d,ry);
if(wallGs.length){
const check=()=>{
if(wallGs.every(g=>g.dead)&&!wallGs[0]._collapsed){
wallGs[0]._collapsed=true;
for(const um of upperMeshes){ try{ if(um&&um.geometry){ spawnWallDebris(um,x,z); world.remove(um); } }catch(_){} }
for(let k2=0;k2<3;k2++) spawnP(PT.dirt,x+rand(-2,2),g0+rand(0.5,4),z+rand(-2,2),rand(-3,3),rand(1,4),rand(-3,3),rand(0.7,1.3),2.2,rand(0.8,1.4),0.9,2);
rubblePile(x+rand(-2,2),z+rand(-2,2),2.8);
AudioSys.explosion(Math.hypot(x-camera.position.x,z-camera.position.z)*0.55);
}
};
wallGs.forEach(g=>g._collapseCheck=check);
check();
}
CQ_BUILDINGS.push({x,z,ry,w,d,floors,g0,topY});
}

// ---- CQB 街角商铺(带大橱窗的临街一层 + 二层居所) ----
function cqbShopfront(x,z,ry){
const g0=heightAt(x,z);
const w=10, d=8, fh=3.2, t=0.3;
const L=_cqbL(x,z,ry); let p;
mesh(new THREE.BoxGeometry(w+0.6,1.3,d+0.6),MAT.stone,x,g0-0.6,z,ry,false,true);
const wallGs=[], upperMeshes=[];
// 临街面: 大面积橱窗(可打碎) + 侧门
const gw=5.4, sw2=1.5;
dBegin();
p=L(-(gw/2+sw2/2+0.2),d/2); dBox(MAT.plaster,sw2,fh,t,p[0],g0+fh/2,p[1],ry); wallGs.push(_dG);
p=L((gw/2+sw2/2+0.2),d/2);  dBox(MAT.plaster,sw2,fh,t,p[0],g0+fh/2,p[1],ry); wallGs.push(_dG);
// 橱窗: 只留窗台与上楣, 中间为可破坏玻璃
p=L(0,d/2); dBox(MAT.plaster,gw,0.75,t,p[0],g0+0.37,p[1],ry); wallGs.push(_dG);
p=L(0,d/2); dBox(MAT.plaster,gw,0.7,t,p[0],g0+fh-0.35,p[1],ry); wallGs.push(_dG);
dEnd();
// 玻璃(视觉, 单独放置不参与碰撞, 便于"破碎"表现)
p=L(0,d/2);
const gl=mesh(new THREE.PlaneGeometry(gw-0.2,fh-1.5),MAT.glassCrack||MAT.glass,p[0],g0+1.75,p[1],ry);
gl.rotation.y=ry;
// 其余三面墙
dBegin();
p=L(0,-d/2); dBox(MAT.plaster,w,fh,t,p[0],g0+fh/2,p[1],ry); wallGs.push(_dG);
p=L(-w/2,0); dBox(MAT.brick,t,fh,d,p[0],g0+fh/2,p[1],ry); wallGs.push(_dG);
p=L(w/2,0);  dBox(MAT.brick,t,fh,d,p[0],g0+fh/2,p[1],ry); wallGs.push(_dG);
dEnd();
NAV_CLEARS.push({x:L(-(gw/2+0.5),d/2)[0], z:L(-(gw/2+0.5),d/2)[1], r:1.2});
p=L(0,d/2);
// 一层: 货架迷宫(强掩体) + 后仓
for(let i=0;i<5;i++){
const [mx,mz]=L(rand(-w/2+1.2,w/2-1.2), rand(-d/2+1.2,d/2-1.4));
solidBox(MAT.woodDark, rand(1.2,2.0),1.3,rand(0.5,0.9), mx,g0+0.65,mz, rand(0,HPI));
coverPoints.push({x:mx,z:mz+1.0});
}
p=L(0,-d/4); solidBox(MAT.plaster,w-1.0,3.0,0.2,p[0],g0+1.5,p[1],ry);
stairFlight(MAT.woodDark, L(w/2-1.1,d/2-2.0)[0], L(w/2-1.1,d/2-2.0)[1], ry+HPI, 1.15, d-3.6, g0, g0+fh);
// 二层
const by=g0+fh;
p=L(-w/2+1.8,0); solidBox(MAT.wood,w-3.2,0.2,d-0.5,p[0],by,p[1],ry);
p=L(0,d/2-1.0); solidBox(MAT.wood,w-0.5,0.2,1.7,p[0],by,p[1],ry);
stairFlight(MAT.woodDark, L(w/2-1.1,d/2-2.0)[0], L(w/2-1.1,d/2-2.0)[1], ry+HPI, 1.15, d-3.6, by, by+fh);
// 二层外墙: 留窗洞(临街面开大窗, 可俯射街道)
_cqbWallWins(MAT.brick, L, ry, 'x', w,  d/2, by, fh, t, wallGs, {n:2, winW:2.0});
_cqbWallWins(MAT.brick, L, ry, 'x', w, -d/2, by, fh, t, wallGs, {n:2, winW:1.6});
_cqbWallWins(MAT.brick, L, ry, 'z', d, -w/2, by, fh, t, wallGs, {winW:1.4});
_cqbWallWins(MAT.brick, L, ry, 'z', d,  w/2, by, fh, t, wallGs, {winW:1.4});
// 二层内隔断: 两道, 各留门洞连通
for(const gz2 of [0, d/6]){
const doorw=1.1, segLen=(w-1.0-doorw)/2;
for(const side of [-1,1]){
const c=side*(doorw/2+segLen/2);
_cqbSeg(MAT.plaster,L,ry,'x',c,gz2,segLen,2.7,by+1.35,0.18,wallGs);
}
const q=L(0,gz2); NAV_CLEARS.push({x:q[0],z:q[1],r:0.85});
}
for(let i=0;i<3;i++){
const [mx,mz]=L(rand(-w/2+1.3,w/2-1.3), rand(-d/2+1.3,d/2-1.3));
solidBox(MAT.woodDark, rand(0.8,1.4),rand(0.6,1.0),rand(0.5,0.9), mx,by+0.5,mz, rand(0,TAU));
coverPoints.push({x:mx,z:mz});
}
for(let k2=world.children.length-12;k2<world.children.length;k2++){ if(k2>=0) upperMeshes.push(world.children[k2]); }
const topY=g0+fh*2;
p=L(0,0);
upperMeshes.push(addSnowCap(solidBox(MAT.rubble,w+0.2,0.2,d+0.2,p[0],topY,p[1],ry)));
p=L(0,d/2); upperMeshes.push(solidBox(MAT.brick,w+0.2,0.65,0.22,p[0],topY+0.42,p[1],ry));
addCoverAround(x,z,w,d,ry);
if(wallGs.length){
const check=()=>{
if(wallGs.every(g=>g.dead)&&!wallGs[0]._collapsed){
wallGs[0]._collapsed=true;
for(const um of upperMeshes){ try{ if(um&&um.geometry){ spawnWallDebris(um,x,z); world.remove(um); } }catch(_){} }
rubblePile(x+rand(-2,2),z+rand(-2,2),3.0);
AudioSys.explosion(Math.hypot(x-camera.position.x,z-camera.position.z)*0.55);
}
};
wallGs.forEach(g=>g._collapseCheck=check); check();
}
CQ_BUILDINGS.push({x,z,ry,w,d,floors:2,g0,topY});
}

// 竹丛(丛林)
function bambooClump(x,z){
const g0=heightAt(x,z);
const n=randi(4,7);
const bm=MAT.bamboo||(MAT.bamboo=new THREE.MeshLambertMaterial({color:0x7a9a4e}));
for(let i=0;i<n;i++){
const a=rand(0,TAU), rr=rand(0.2,1.1);
const bx2=x+Math.sin(a)*rr, bz2=z+Math.cos(a)*rr;
const h=rand(5,8);
const b=mesh(new THREE.CylinderGeometry(0.05,0.08,h,5),bm,bx2,g0+h/2,bz2);
b.rotation.x=rand(-0.06,0.06); b.rotation.z=rand(-0.06,0.06);
const lf=mesh(treeLeafGeo,MAT.leaves,bx2,g0+h-0.8,bz2,rand(0,Math.PI),false,false);
lf.scale.setScalar(0.55);
}
CYLS.push({x,z,r:0.9,y0:g0,y1:g0+5});
}
