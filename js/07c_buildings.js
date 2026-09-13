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
// 战术结构设计原则 (2026-09 重构):
//  1) 垂直贯通 —— 楼梯井是"两端开口的独立井道": 直跑楼梯 + 楼板在井道位置精确开洞,
//     下段从井道后口登梯、上段从前口落梯, 绕行楼层后再回后口继续上行。
//     楼梯与洞口全部落在井道矩形内, 绝不穿出外墙; 上层真实可达。
//  2) 无死房间 —— 门洞的"实体缺口"与 NAV_CLEARS 由同一个 helper 产出,
//     杜绝"有标记没门洞"(Bot 撞墙) 与 "有墙没门洞"(房间封死)。
//  3) 多入口 —— 每栋至少 3 个一层出入口(临街门 / 背门 / 侧向破口), 杜绝单口死亡陷阱。
//  4) 射击位 —— 一层低位射孔(窗台 0.95m) + 上层可探出窗洞 + 屋顶女儿墙与楼梯间出口。
//  5) 统一元数据 —— 全部登记 CQ_BUILDINGS(含 kind/入口), 供探针/小地图/任务复用。

const CQB_FH=3.05;      // 标准层高
const CQB_T=0.32;       // 外墙厚
const CQB_DW=1.30;      // 标准门洞净宽
const CQB_PT=0.18;      // 内隔断厚
const CQB_LINTEL=0.75;  // 门楣高
const CQB_SILL=0.95;    // 窗台高
const CQB_WINH=1.40;    // 窗洞净高
// 可进入建筑登记表: {x,z,ry,w,d,floors,g0,topY,kind,exits,shaft}
const CQ_BUILDINGS=[];

// 建筑局部坐标 → 世界坐标 (lx 沿宽 w, lz 沿深 d; +lz 为临街正面)
function _cqbL(x,z,ry){ const cs=Math.cos(ry),sn=Math.sin(ry); return (lx,lz)=>[x+lx*cs+lz*sn, z-lx*sn+lz*cs]; }

// ---- 通用墙体: 门洞(落地) + 窗洞(窗台/窗楣) ----
// axis='x': 墙沿局部 X 铺展, at = 局部 Z; axis='z': 反之。
// doors/wins = 沿轴的中心坐标数组。门洞自动注册 NAV_CLEARS(2m 寻路网格的保通关键)。
function _cqbWallOpen(mat,L,ry,axis,at,from,to,y0,h,t,doors,doorW,wins,winW,gs){
const a0=Math.min(from,to), a1=Math.max(from,to);
if(a1-a0<0.05) return;
const dw=doorW||CQB_DW, ww=winW||1.4;
const ops=[];
const push=(o,def,kind)=>{
const obj=(o&&typeof o==='object');
const c=obj?o.c:o, w=(obj&&o.w)?o.w:def, nav=!(obj&&o.nav===false);
if(c>a0+w*0.5&&c<a1-w*0.5) ops.push({c,w,kind,nav});
};
for(const o of (doors||[])) push(o,dw,'door');
for(const o of (wins||[]))  push(o,ww,'win');
ops.sort((p,q)=>p.c-q.c);
const put=(s,e,cy,hh)=>{
if(e-s<0.04||hh<0.04) return;
const c=(s+e)/2;
const q=(axis==='x')?L(c,at):L(at,c);
const bw=(axis==='x')?(e-s):t, bd=(axis==='x')?t:(e-s);
dBegin(); dBox(mat,bw,hh,bd,q[0],cy,q[1],ry); const g=dEnd(); if(g&&gs) gs.push(g);
};
let cur=a0;
for(const o of ops){
const s=o.c-o.w/2, e=o.c+o.w/2;
if(s>cur+0.04) put(cur,s,y0+h/2,h);
if(o.kind==='win'){
put(s,e,y0+CQB_SILL/2,CQB_SILL);
const head=h-CQB_SILL-CQB_WINH;
if(head>0.04) put(s,e,y0+CQB_SILL+CQB_WINH+head/2,head);
} else {
const lh=Math.min(CQB_LINTEL,Math.max(0,h-2.05));
if(lh>0.05) put(s,e,y0+h-lh/2,lh);
if(o.nav!==false){
const q=(axis==='x')?L(o.c,at):L(at,o.c);
NAV_CLEARS.push({x:q[0],z:q[1],r:Math.min(2.4,Math.max(1.0,o.w*0.5+0.5))});
}
}
cur=Math.max(cur,e);
}
if(a1>cur+0.04) put(cur,a1,y0+h/2,h);
}
// 上层外墙工具(保留原签名, 供 07e_port 复用): 按墙长均分留窗洞
function _cqbWallWins(mat,L,ry,axis,span,off,y0,fh,t,gs,opts){
opts=opts||{};
const n=Math.max(1,opts.n||Math.round(span/3.4));
const seg=span/n, ww=Math.min(opts.winW||1.4,seg*0.62);
const wins=[];
for(let k=0;k<n;k++) wins.push((k+0.5)*seg-span/2);
_cqbWallOpen(mat,L,ry,axis,off,-span/2,span/2,y0,fh,t,null,null,wins,ww,gs);
}
// 内隔断: 落地门洞 + 门楣
function _cqbPartition(L,ry,axis,at,from,to,y0,h,doors,gs){
_cqbWallOpen(MAT.plaster,L,ry,axis,at,from,to,y0,h,CQB_PT,doors,CQB_DW,null,null,gs);
}
function _cqbSeg(mat,L,ry,axis,along,off,segLen,segH,cy,t,gs){
let px,pz,w,d;
if(axis==='x'){ const q=L(along,off); px=q[0]; pz=q[1]; w=segLen; d=t; }
else          { const q=L(off,along); px=q[0]; pz=q[1]; w=t; d=segLen; }
dBegin(); dBox(mat,w,segH,d,px,cy,pz,ry);
const g=dEnd(); if(g&&gs) gs.push(g);
}

// ---- 楼梯井: 直跑楼梯(两端开口井道) ----
// shaft={x0,x1,z0,z1}(局部, x0<x1, z0<z1); 上行方向恒为局部 +z。
// 井道两端不砌墙 —— 下段(z0 口)登梯、上段(z1 口)落梯, 楼层绕行后回到 z0 口继续上行。
// 返回 {hole, shaft}, 其中 hole 是上层楼板必须挖掉的矩形。
function _cqbStairShaft(L,ry,shaft,y0,y1,mat,axis){
const cx=(shaft.x0+shaft.x1)/2, cz=(shaft.z0+shaft.z1)/2;
let runW,runL,ryP;
if(axis==='x'){ runW=shaft.z1-shaft.z0; runL=shaft.x1-shaft.x0; ryP=ry+HPI; }
else          { runW=shaft.x1-shaft.x0; runL=shaft.z1-shaft.z0; ryP=ry; }
stairFlight(mat, L(cx,cz)[0], L(cx,cz)[1], ryP, runW, runL, y0, y1);
return {hole:{x0:shaft.x0,x1:shaft.x1,z0:shaft.z0,z1:shaft.z1}, shaft, axis:axis||'z'};
}
// ---- 楼板: 覆盖局部矩形并挖去若干矩形洞(井道) ----
function _cqbSlab(L,ry,rect,holes,y,mat,thick,out){
const xs=[rect.x0,rect.x1], zs=[rect.z0,rect.z1];
for(const h of holes){ xs.push(h.x0,h.x1); zs.push(h.z0,h.z1); }
const uniq=a=>{ a.sort((p,q)=>p-q); return a.filter((v,i)=>i===0||v-a[i-1]>0.05); };
const X=uniq(xs), Z=uniq(zs);
for(let i=0;i<X.length-1;i++)for(let j=0;j<Z.length-1;j++){
const x0=X[i],x1=X[i+1],z0=Z[j],z1=Z[j+1];
const cx=(x0+x1)/2, cz=(z0+z1)/2;
let inHole=false;
for(const h of holes) if(cx>h.x0-0.02&&cx<h.x1+0.02&&cz>h.z0-0.02&&cz<h.z1+0.02){ inHole=true; break; }
if(inHole) continue;
const q=L(cx,cz);
const m=solidBox(mat,x1-x0,thick,z1-z0,q[0],y,q[1],ry);
if(out) out.push(m);
}
}
// ---- 井道护栏: 沿井道两侧长边立矮墙(端头留空作为登/落梯口) ----
function _cqbShaftRail(L,ry,shaft,y,mat){
const cz=(shaft.z0+shaft.z1)/2, len=shaft.z1-shaft.z0-0.5;
if(len<0.6) return;
for(const sx of [shaft.x0,shaft.x1]){
const q=L(sx,cz);
solidBox(mat,0.1,1.0,len,q[0],y+0.5,q[1],ry);
}
}
// ---- 屋顶: 楼板(挖井道洞) + 女儿墙 ----
function _cqbRoof(L,ry,w,d,floors,fh,g0,holes,mat,out){
const topY=g0+fh*floors;
_cqbSlab(L,ry,{x0:-w/2,x1:w/2,z0:-d/2,z1:d/2},holes,topY,mat,0.22,out);
for(const [lx,lz,sw,sd] of [[0,d/2,w+0.3,0.26],[0,-d/2,w+0.3,0.26],[-w/2,0,0.26,d+0.3],[w/2,0,0.26,d+0.3]]){
const q=L(lx,lz);
const m=solidBox(MAT.brick,sw,0.72,sd,q[0],topY+0.47,q[1],ry);
if(out) out.push(m);
}
return topY;
}
// ---- 坍塌钩子: 一层承重墙全毁 → 上层整体坍塌 ----
function _cqbCollapseHook(x,z,g0,wallGs,upperMeshes,strength){
if(!wallGs.length) return;
const check=()=>{
if(wallGs.every(g=>g.dead)&&!wallGs[0]._collapsed){
wallGs[0]._collapsed=true;
for(const um of upperMeshes){ try{ if(um&&um.geometry){ spawnWallDebris(um,x,z); world.remove(um); } }catch(_){} }
for(let k=0;k<4;k++) spawnP(PT.dirt,x+rand(-3,3),g0+rand(0.5,5),z+rand(-3,3),rand(-3,3),rand(1,5),rand(-3,3),rand(0.7,1.4),2.6,rand(0.8,1.6),0.9,2);
rubblePile(x+rand(-3,3),z+rand(-3,3),3.2);
AudioSys.explosion(Math.hypot(x-camera.position.x,z-camera.position.z)*(strength||0.6));
}
};
wallGs.forEach(g=>g._collapseCheck=check);
check();
}
// ---- 室内掩体: 只在"不堵门/不堵梯口"的安全位放置 ----
function _cqbFurniture(L,ry,w,d,y0,spots,coverOut){
for(const sp of spots){
const [mx,mz]=L(sp[0],sp[1]);
if(sp[3]==='sand') solidBox(MAT.sandbag,rand(1.0,1.4),0.7,0.75,mx,y0+0.35,mz,rand(0,TAU));
else if(sp[3]==='metal') solidBox(MAT.metalDark,rand(0.9,1.3),rand(0.9,1.2),rand(0.6,0.9),mx,y0+0.6,mz,rand(0,TAU));
else solidBox(MAT.woodDark,rand(0.9,1.4),rand(0.75,1.05),rand(0.5,0.8),mx,y0+0.55,mz,rand(0,TAU));
coverPoints.push({x:mx,z:mz});
}
}

// ===================== CQB 三层公寓楼 =====================
// 平面: 中央纵走廊 + 西侧前后两室 + 东侧楼梯井与环井回廊。
// 出入口: 临街正门(0,+d/2) / 背门(-x,-d/2) / 西侧落地破口 —— 三向可进。
function cqbApartment(x,z,ry,opt){
opt=opt||{};
const floors=clamp(opt.floors||randi(2,3),2,3);
const w=opt.w||13, d=opt.d||10, fh=CQB_FH, t=CQB_T;
const g0=heightAt(x,z);
const L=_cqbL(x,z,ry); let p;
mesh(new THREE.BoxGeometry(w+0.7,1.4,d+0.7),MAT.stone,x,g0-0.65,z,ry,false,true);
const wallGs=[], upperMeshes=[];
const IX=w/2-t, IZ=d/2-t;
// ---- 楼梯井: 贴东墙, 前后各留 0.9m 落梯口 ----
const shW=clamp(w*0.2,1.55,2.1);
const shDepth=Math.min(4.8,2*IZ-1.8);
const shX1=IX, shX0=IX-shW;
const shZ0=-IZ+0.9, shZ1=shZ0+shDepth;
const shaft={x0:shX0,x1:shX1,z0:shZ0,z1:shZ1};
const hole={x0:shX0,x1:shX1,z0:shZ0,z1:shZ1};
// 井道西侧封边(贯穿全楼)
const shaftWallZ0=shZ0, shaftWallZ1=shZ1;
// ---- 一层平面 ----
const cwX=-Math.min(1.0,w*0.11);       // 走廊西界
const ceX= Math.min(1.0,w*0.11);       // 走廊东界
// 外墙: 正门 + 两窗 / 背门 + 窗 / 两侧窗 + 西侧落地破口
_cqbWallOpen(MAT.plaster,L,ry,'x', d/2,-w/2,w/2,g0,fh,t,[0],[1.4],[-w*0.32,w*0.32],1.4,wallGs);
_cqbWallOpen(MAT.plaster,L,ry,'x',-d/2,-w/2,w/2,g0,fh,t,[-w*0.3],[1.25],[w*0.28],1.4,wallGs);
_cqbWallOpen(MAT.plaster,L,ry,'z',-w/2,-d/2,d/2,g0,fh,t,[d*0.5],[1.9],[-d*0.3,-d*0.78],1.4,wallGs);   // 西侧落地破口(前室) + 后室两窗
_cqbWallOpen(MAT.plaster,L,ry,'z', w/2,-d/2,d/2,g0,fh,t,null,null,[d*0.3,-d*0.3],1.4,wallGs);
// 内隔断: 走廊两壁 + 西侧横隔断 + 井道封边
_cqbPartition(L,ry,'z',cwX,-IZ,IZ,g0,fh,[IZ*0.5,-IZ*0.5],wallGs);
_cqbPartition(L,ry,'z',ceX,-IZ,-IZ*0.15,g0,fh,[-IZ*0.62],wallGs);
_cqbPartition(L,ry,'x',0,-IX,cwX,g0,fh,[-w*0.28],wallGs);
_cqbPartition(L,ry,'z',shX0,shaftWallZ0,shaftWallZ1,g0,fh,null,wallGs);
// 一层家具(避开门口与梯口)
_cqbFurniture(L,ry,w,d,g0,[
[-IX+0.85,IZ*0.5,0,'wood'],[-IX+0.9,-IZ*0.55,0,'metal'],
[-IX+0.8,0.15,0,'sand'],[-IX+0.85,-IZ*0.85,0,'wood']
]);
// 楼梯: 0 → fh
_cqbStairShaft(L,ry,shaft,g0,g0+fh,MAT.woodDark);
// ---- 二层及以上 ----
for(let f=2;f<=floors;f++){
const by=g0+fh*(f-1);
_cqbSlab(L,ry,{x0:-w/2,x1:w/2,z0:-d/2,z1:d/2},[hole],by,MAT.wood,0.2,upperMeshes);
// 上层外墙: 四面留可探出射击的窗洞
_cqbWallWins(MAT.brick,L,ry,'x', w, d/2,by,fh,t,wallGs,{winW:1.6});
_cqbWallWins(MAT.brick,L,ry,'x', w,-d/2,by,fh,t,wallGs,{winW:1.6});
_cqbWallWins(MAT.brick,L,ry,'z', d,-w/2,by,fh,t,wallGs,{winW:1.5});
_cqbWallWins(MAT.brick,L,ry,'z', d, w/2,by,fh,t,wallGs,{winW:1.5});
// 上层内隔断(与一层同构, 便于玩家建立空间记忆)
_cqbPartition(L,ry,'z',cwX,-IZ,IZ,by,fh,[IZ*0.5,-IZ*0.5],wallGs);
_cqbPartition(L,ry,'x',0,-IX,cwX,by,fh,[-w*0.28],wallGs);
_cqbPartition(L,ry,'z',shX0,shaftWallZ0,shaftWallZ1,by,fh,null,wallGs);
_cqbShaftRail(L,ry,shaft,by,MAT.metalDark);
_cqbFurniture(L,ry,w,d,by,[
[-IX+0.85,IZ*0.45,0,'wood'],[-IX+0.9,-IZ*0.5,0,'metal'],
[-IX+0.8,0.1,0,'sand']
]);
// 楼梯: (f-1)fh → f*fh
_cqbStairShaft(L,ry,shaft,g0+fh*(f-1),g0+fh*f,MAT.woodDark);
}
// ---- 屋顶: 楼板开井道洞 + 女儿墙 + 屋顶掩体 ----
const topY=_cqbRoof(L,ry,w,d,floors,fh,g0,[hole],MAT.rubble,upperMeshes);
for(let i=0;i<3;i++){
const [mx,mz]=L(rand(-w/2+1.6,w/2-1.6),rand(-d/2+1.6,d/2-1.6));
solidBox(MAT.sandbag,rand(1.0,1.6),0.72,0.8,mx,topY+0.47,mz,rand(0,TAU));
}
for(let i=0;i<2;i++){
const [mx,mz]=L(rand(-w/2+1.6,w/2-1.6),rand(-d/2+1.6,d/2-1.6));
mesh(new THREE.CylinderGeometry(0.34,0.34,1.1,9),MAT.metalDark,mx,topY+0.72,mz);
CYLS.push({x:mx,z:mz,r:0.4,y0:topY,y1:topY+1.3});
}
addCoverAround(x,z,w,d,ry);
_cqbCollapseHook(x,z,g0,wallGs,upperMeshes,0.6);
CQ_BUILDINGS.push({x,z,ry,w,d,floors,g0,topY,fh,kind:'apartment',exits:3,shaft:hole});
}

// ===================== CQB 联排窄楼 =====================
// 平面: 前厅(临街) + 后室 + 东侧楼梯井。层高 3.0m。
// 出入口: 临街门 / 背门 / 西侧破口。
function cqbRowhouse(x,z,ry,opt){
opt=opt||{};
const floors=clamp(opt.floors||2,2,3);
const w=opt.w||5.6, d=opt.d||9.0, fh=3.0, t=0.30;
const g0=heightAt(x,z);
const L=_cqbL(x,z,ry); let p;
mesh(new THREE.BoxGeometry(w+0.5,1.2,d+0.5),MAT.stone,x,g0-0.55,z,ry,false,true);
const wallGs=[], upperMeshes=[];
const IX=w/2-t, IZ=d/2-t;
const shW=clamp(w*0.3,1.5,1.9);
const shDepth=Math.min(4.6,2*IZ-1.7);
const shX1=IX, shX0=IX-shW;
const shZ0=-IZ+0.85, shZ1=shZ0+shDepth;
const shaft={x0:shX0,x1:shX1,z0:shZ0,z1:shZ1};
const hole={x0:shX0,x1:shX1,z0:shZ0,z1:shZ1};
const pz=-0.35;                        // 前后分隔的 z
// 外墙
_cqbWallOpen(MAT.plaster,L,ry,'x', d/2,-w/2,w/2,g0,fh,t,[0],[1.25],[w*0.3],1.2,wallGs);
_cqbWallOpen(MAT.plaster,L,ry,'x',-d/2,-w/2,w/2,g0,fh,t,[-w*0.28],[1.1],[w*0.3],1.2,wallGs);
_cqbWallOpen(MAT.brick,L,ry,'z',-w/2,-d/2,d/2,g0,fh,t,[d*0.34],[1.5],[d*0.28],1.2,wallGs);      // 西侧落地破口
_cqbWallOpen(MAT.brick,L,ry,'z', w/2,-d/2,d/2,g0,fh,t,null,null,[d*0.3],1.2,wallGs);
// 前后分隔(留门) + 井道封边
_cqbPartition(L,ry,'x',pz,-IX,shX0,g0,fh,[-w*0.18],wallGs);
_cqbPartition(L,ry,'z',shX0,shZ0,shZ1,g0,fh,null,wallGs);
_cqbFurniture(L,ry,w,d,g0,[
[-IX+0.75,IZ*0.5,0,'wood'],[-IX+0.7,-IZ*0.6,0,'metal'],
[-IX+0.8,IZ*0.78,0,'sand']
]);
_cqbStairShaft(L,ry,shaft,g0,g0+fh,MAT.woodDark);
for(let f=2;f<=floors;f++){
const by=g0+fh*(f-1);
_cqbSlab(L,ry,{x0:-w/2,x1:w/2,z0:-d/2,z1:d/2},[hole],by,MAT.wood,0.2,upperMeshes);
_cqbWallWins(MAT.brick,L,ry,'x', w, d/2,by,fh,t,wallGs,{n:2,winW:1.2});
_cqbWallWins(MAT.brick,L,ry,'x', w,-d/2,by,fh,t,wallGs,{n:2,winW:1.2});
_cqbWallWins(MAT.brick,L,ry,'z', d,-w/2,by,fh,t,wallGs,{n:2,winW:1.2});
_cqbWallWins(MAT.brick,L,ry,'z', d, w/2,by,fh,t,wallGs,{n:2,winW:1.2});
_cqbPartition(L,ry,'x',pz,-IX,shX0,by,fh,[-w*0.18],wallGs);
_cqbPartition(L,ry,'z',shX0,shZ0,shZ1,by,fh,null,wallGs);
_cqbShaftRail(L,ry,shaft,by,MAT.metalDark);
_cqbFurniture(L,ry,w,d,by,[
[-IX+0.75,IZ*0.45,0,'wood'],[-IX+0.7,-IZ*0.55,0,'sand']
]);
_cqbStairShaft(L,ry,shaft,g0+fh*(f-1),g0+fh*f,MAT.woodDark);
}
const topY=_cqbRoof(L,ry,w,d,floors,fh,g0,[hole],MAT.rubble,upperMeshes);
addCoverAround(x,z,w,d,ry);
_cqbCollapseHook(x,z,g0,wallGs,upperMeshes,0.55);
CQ_BUILDINGS.push({x,z,ry,w,d,floors,g0,topY,fh,kind:'rowhouse',exits:3,shaft:hole});
}

// ===================== CQB 街角商铺 =====================
// 平面: 一层临街营业厅(大橱窗) + 后仓; 二层居所。出入口: 侧门 / 背门 / 西侧破口。
function cqbShopfront(x,z,ry){
const g0=heightAt(x,z);
const w=10, d=8, fh=3.2, t=0.30;
const L=_cqbL(x,z,ry); let p;
mesh(new THREE.BoxGeometry(w+0.6,1.3,d+0.6),MAT.stone,x,g0-0.6,z,ry,false,true);
const wallGs=[], upperMeshes=[];
const IX=w/2-t, IZ=d/2-t;
const shW=1.8;
const shDepth=Math.min(4.4,2*IZ-1.7);
const shX1=IX, shX0=IX-shW;
const shZ0=-IZ+0.85, shZ1=shZ0+shDepth;
const shaft={x0:shX0,x1:shX1,z0:shZ0,z1:shZ1};
const hole={x0:shX0,x1:shX1,z0:shZ0,z1:shZ1};
// 临街面: 大橱窗(窗台0.6) + 侧门
_cqbWallOpen(MAT.plaster,L,ry,'x', d/2,-w/2,w/2,g0,fh,t,[w*0.3],[1.3],[0],6.0,wallGs);
// 后墙: 背门 + 窗
_cqbWallOpen(MAT.plaster,L,ry,'x',-d/2,-w/2,w/2,g0,fh,t,[-w*0.3],[1.25],[w*0.22],1.4,wallGs);
// 两侧: 西侧落地破口 + 东侧窗
_cqbWallOpen(MAT.brick,L,ry,'z',-w/2,-d/2,d/2,g0,fh,t,[-d*0.3],[1.6],[d*0.28],1.4,wallGs);
_cqbWallOpen(MAT.brick,L,ry,'z', w/2,-d/2,d/2,g0,fh,t,null,null,[d*0.3],1.4,wallGs);
// 后仓隔断 + 井道封边
_cqbPartition(L,ry,'x',-IZ*0.42,-IX,shX0,g0,fh,[-w*0.22],wallGs);
_cqbPartition(L,ry,'z',shX0,shZ0,shZ1,g0,fh,null,wallGs);
// 营业厅货架迷宫(强掩体) + 后仓
_cqbFurniture(L,ry,w,d,g0,[
[-IX+0.9,IZ*0.35,0,'wood'],[-IX+0.95,IZ*0.62,0,'wood'],
[-IX+0.9,-IZ*0.5,0,'metal'],[-IX+0.85,-IZ*0.78,0,'sand']
]);
_cqbStairShaft(L,ry,shaft,g0,g0+fh,MAT.woodDark);
// 二层
const by=g0+fh;
_cqbSlab(L,ry,{x0:-w/2,x1:w/2,z0:-d/2,z1:d/2},[hole],by,MAT.wood,0.2,upperMeshes);
_cqbWallWins(MAT.brick,L,ry,'x', w, d/2,by,fh,t,wallGs,{n:2,winW:2.0});
_cqbWallWins(MAT.brick,L,ry,'x', w,-d/2,by,fh,t,wallGs,{n:2,winW:1.6});
_cqbWallWins(MAT.brick,L,ry,'z', d,-w/2,by,fh,t,wallGs,{winW:1.4});
_cqbWallWins(MAT.brick,L,ry,'z', d, w/2,by,fh,t,wallGs,{winW:1.4});
_cqbPartition(L,ry,'x',-IZ*0.3,-IX,shX0,by,fh,[-w*0.22],wallGs);
_cqbPartition(L,ry,'z',shX0,shZ0,shZ1,by,fh,null,wallGs);
_cqbShaftRail(L,ry,shaft,by,MAT.metalDark);
_cqbFurniture(L,ry,w,d,by,[
[-IX+0.9,IZ*0.3,0,'wood'],[-IX+0.9,-IZ*0.35,0,'metal']
]);
_cqbStairShaft(L,ry,shaft,by,by+fh,MAT.woodDark);
const topY=_cqbRoof(L,ry,w,d,2,fh,g0,[hole],MAT.rubble,upperMeshes);
addCoverAround(x,z,w,d,ry);
_cqbCollapseHook(x,z,g0,wallGs,upperMeshes,0.55);
CQ_BUILDINGS.push({x,z,ry,w,d,floors:2,g0,topY,fh,kind:'shopfront',exits:3,shaft:hole});
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
