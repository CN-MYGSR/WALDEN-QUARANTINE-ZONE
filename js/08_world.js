'use strict';
// ===================== 战役布局 (阶段6重写: 真实街区/铁路/农田) =====================
// 街面铺装(视觉): 深色石板路条
function paveStreet(x1,z1,x2,z2,w){
const dx=x2-x1,dz=z2-z1;
const len=Math.hypot(dx,dz), ry=Math.atan2(dx,dz);
const segs=Math.ceil(len/16);
const pm=MAT.pave||(MAT.pave=new THREE.MeshLambertMaterial({map:TEX.stone,color:0x8f8f8f}));
for(let i=0;i<segs;i++){
const t0=(i+0.5)/segs, x=x1+dx*t0, z=z1+dz*t0;
mesh(new THREE.BoxGeometry(w,0.08,len/segs+0.3),pm,x,heightAt(x,z)+0.04,z,ry,false,true);
}
}
// ===================== CQB 阴暗街区 (近距离作战主战场) =====================
// 设计原则(对应需求1/3/4/5):
//  · 狭窄巷道: 巷道净宽 3.0~3.6m, 两侧建筑形成"峡谷", 长枪线被反复截断;
//    主街刻意做窄(5m)且被废墟/车辆切断, 无法形成 40m+ 对枪走廊。
//  · 多层建筑: 全部使用 cqbApartment/cqbRowhouse/cqbShopfront, 2~3 层可逐屋清剿。
//  · 街区网格: 4×4 个街区(每块约 38×38m), 巷道十字交叉 → 多路径接近。
//  · 出生点: 西北 / 东南对角, 三点环线互相牵制, 中路有强掩体控制点。
//  · 开阔区占比 < 15%: 仅保留 2 个小型交叉口广场, 其余全为巷道与室内。
const CQB_BLOCK=38;      // 街区尺寸(含巷道)
// 出生点/撤离点保护区: 这些圆内不生成建筑, 保证双方出生区开阔可用的同时仍是"街头掩体区"
function cqbNearSpawn(x,z,r){
for(const b of CAMPAIGN.bases) if(Math.hypot(x-b.x,z-b.z)<r) return true;
for(const e of CQB_EXTRACT) if(Math.hypot(x-e.x,z-e.z)<r) return true;
return false;
}
const CQB_EXTRACT=(CAMPAIGN.extract&&CAMPAIGN.extract.length)?CAMPAIGN.extract:[{x:0,z:88}];   // 撤离点: 由战役配置决定
// 出生/撤离保护半径: 该半径内不生成任何碰撞体(由 layoutCQB 统一约束)
const CQB_SAFE={
spawn:()=>CAMPAIGN.bases.map(b=>({x:b.x,z:b.z,r:20})),
all:()=>[...CAMPAIGN.bases.map(b=>({x:b.x,z:b.z,r:20})), ...CQB_EXTRACT.map(e=>({x:e.x,z:e.z,r:14}))]
};
function cqbInSafe(x,z,extra){
for(const s of CQB_SAFE.all()) if(Math.hypot(x-s.x,z-s.z) < s.r + (extra||0)) return true;
return false;
}
function layoutCQB(){
const N=2;               // -N..N 共 (2N+1)² 个街区(5×5)
const W=Math.floor(MAP_SIZE/2)-16;   // 街区可用半宽
// ---- 1) 主街: 横竖各 5 条, 净宽 5m, 交叉形成窄路口 ----
const lanes=[];
for(let i=-N;i<=N;i++){
const off=i*CQB_BLOCK;
lanes.push(off);
}
for(const off of lanes){
paveStreet(-W,off, W,off, 5.0);
paveStreet(off,-W, off,W, 5.0);
}
// 街心线(视觉): 破损黄线
for(const off of lanes){
for(let t=-W;t<W;t+=3.2){
if(Math.random()<0.55) continue;
mesh(new THREE.BoxGeometry(1.5,0.02,0.14), MAT.carRust||MAT.metalDark, t+1.6,heightAt(t+1.6,off)+0.075,off,0,false,true);
mesh(new THREE.BoxGeometry(0.14,0.02,1.5), MAT.carRust||MAT.metalDark, off,heightAt(off,t+1.6)+0.075,t+1.6,0,false,true);
}
}
// 主街 NAV_CLEARS: 沿中心线每 8m 一个, 保证 Bot 主路畅通
for(const off of lanes){
for(let t=-W;t<=W;t+=8){
NAV_CLEARS.push({x:t,z:off,r:1.5});
NAV_CLEARS.push({x:off,z:t,r:1.5});
}
}
// ---- 2) 街区填充: 2×2 亚格, 每亚格随机放 1 栋, 形成更密的不规则街区 ----
// 亚格中心到街心的最小距离 = 街道半宽 2.5 + 建筑最大半宽 ~6.5 → 至少 9m
// 取亚格中心 ±9.5m, 亚格间距 19m → 建筑之间留 2~3m 后院通道
const SUB_OFF=9.5;
const BUILD_DENSITY=0.78;
for(let bi=-N;bi<N;bi++)for(let bj=-N;bj<N;bj++){
const cx0=bi*CQB_BLOCK+CQB_BLOCK/2;
const cz0=bj*CQB_BLOCK+CQB_BLOCK/2;
// 内巷十字: 横向 + 纵向各一条, 宽 4m, 交叉穿过街区中心
paveStreet(cx0-14,cz0,cx0+14,cz0,4);
paveStreet(cx0,cz0-14,cx0,cz0+14,4);
// 内巷 NAV_CLEARS
for(let k=-1;k<=1;k++){
NAV_CLEARS.push({x:cx0+k*7,z:cz0,r:1.3});
NAV_CLEARS.push({x:cx0,z:cz0+k*7,r:1.3});
}
// 2×2 亚格放建筑
for(const sx of [-1,1])for(const sz of [-1,1]){
const ax=cx0+sx*SUB_OFF+rand(-1.2,1.2);
const az=cz0+sz*SUB_OFF+rand(-1.2,1.2);
// 出生/撤离保护区
const dSpawn=Math.min(
  ...CAMPAIGN.bases.map(b=>Math.hypot(ax-b.x,az-b.z)),
  ...CQB_EXTRACT.map(e=>Math.hypot(ax-e.x,az-e.z))
);
if(dSpawn<22) continue;
if(dSpawn<30){ if(Math.random()<0.4) coverStack(ax,az,rand(0,TAU)); continue; }
if(Math.random()>BUILD_DENSITY) continue;   // 留空地
const roll=Math.random();
const ry=rand(-0.06,0.06);
if(roll<0.38){
// 公寓: 2~3 层, 主入口朝内巷
cqbApartment(ax,az,ry,{floors:randi(2,3),w:9.2,d:7.2});
} else if(roll<0.68){
// 联排窄楼: 前后门可穿行
cqbRowhouse(ax,az,ry,{floors:2,w:5.4,d:8.4});
} else if(roll<0.86){
// 街角商铺: 大橱窗 + 二层居所
cqbShopfront(ax,az,ry);
} else {
// 仓库/废墟: 单层大空间, 提供不同室内手感
if(Math.random()<0.6) warehouse(ax,az,ry);
else ruinedHouse(ax,az,7,7,ry,Math.random()<0.5?MAT.brick:MAT.plaster,0.75);
}
}
// 内巷口随机拱门(增强街区入口感)
if(Math.random()<0.35&&!cqbNearSpawn(cx0,cz0,26)){
archGate(cx0+rand(-8,8),cz0,HPI,3.4);
}
if(Math.random()<0.35&&!cqbNearSpawn(cx0,cz0,26)){
archGate(cx0,cz0+rand(-8,8),0,3.4);
}
// 死胡同: 15% 概率把内巷一端用废墟/掩体封死
if(Math.random()<0.15&&!cqbNearSpawn(cx0,cz0,26)){
const deadEnd=Math.random()<0.5;
if(deadEnd){
const dx=cx0+14, dz=cz0;
rubblePile(dx,dz,2.2); coverStack(dx-2,dz+rand(-2,2),rand(0,TAU));
NAV_CLEARS.push({x:dx-4,z:dz,r:1.0});
} else {
const dx=cx0, dz=cz0+14;
rubblePile(dx,dz,2.2); coverStack(dx+rand(-2,2),dz-2,rand(0,TAU));
NAV_CLEARS.push({x:dx,z:dz-4,r:1.0});
}
}
}
// ---- 3) 街道设施: 严格贴路缘(±2.0~2.3), 街心 4.5m 全空 ----
for(const off of lanes){
for(let t=-W+6;t<W-6;t+=rand(11,18)){
{
const side=Math.random()<0.5?-1:1;
const x=t, z=off+side*rand(2.0,2.3);
if(!cqbInSafe(x,z)){ const r=Math.random();
if(r<0.26) wreckCar(x,z,rand(0,TAU));
else if(r<0.46) barrierConcrete(x,z,0);
else if(r<0.58) barrierSteel(x,z,0);
else if(r<0.7) puddle(x,z,rand(0.7,1.3));
else if(r<0.86) glassDebris(x,z,rand(0.7,1.3));
else clutterPile(x,z,rand(0,TAU),0.85); }
}
{
const side=Math.random()<0.5?-1:1;
const x=off+side*rand(2.0,2.3), z=t;
if(!cqbInSafe(x,z)){ const r=Math.random();
if(r<0.26) wreckCar(x,z,HPI+rand(-0.2,0.2));
else if(r<0.46) barrierConcrete(x,z,HPI);
else if(r<0.58) barrierSteel(x,z,HPI);
else if(r<0.7) puddle(x,z,rand(0.7,1.3));
else if(r<0.86) glassDebris(x,z,rand(0.7,1.3));
else coverStack(x,z,HPI); }
}
}
// 损坏路灯: 沿街贴边(避开出生区)
for(let t=-W+10;t<W-10;t+=rand(18,28)){
if(!cqbInSafe(t, off-2.7)) brokenLamp(t, off-2.7, rand(0,0.55));
if(!cqbInSafe(off+2.7, t)) brokenLamp(off+2.7, t, rand(0,0.55));
}
}
// ---- 4) 战术控制点: 3 个小型广场(刻意保持狭小) ----
const hotspots=[[-CQB_BLOCK,0],[0,0],[CQB_BLOCK,-CQB_BLOCK]];
hotspots.forEach(([hx,hz],i)=>{
if(cqbInSafe(hx,hz,4)) return;
if(i===1){
rubblePile(hx-3,hz-3,2.6); rubblePile(hx+4,hz+2,3.0);
shipmentWreck(hx+rand(-5,5),hz+rand(-5,5));
barrierConcrete(hx-5,hz+4,rand(0,TAU));
coverStack(hx+5,hz-5,rand(0,TAU));
wreckCar(hx+1,hz+6,rand(0,TAU));
glassDebris(hx,hz,2.4);
} else {
wreckCar(hx+rand(-4,4),hz+rand(-4,4),rand(0,TAU));
barrierConcrete(hx+rand(-4,4),hz+rand(-4,4),rand(0,TAU));
coverStack(hx+rand(-4,4),hz+rand(-4,4),rand(0,TAU));
puddle(hx+rand(-3,3),hz+rand(-3,3),rand(1.2,2.2));
glassDebris(hx+rand(-3,3),hz+rand(-3,3),1.6);
}
});
// ---- 5) 出生区: 中心 18m 完全清空, 掩体只放在 18~26m 环带 ----
CAMPAIGN.bases.forEach((b,ti)=>{
for(let k=0;k<7;k++){
const a=rand(0,TAU), rr=rand(18,26);
const px=b.x+Math.sin(a)*rr, pz=b.z+Math.cos(a)*rr;
if(roadDist(px,pz)<3.0) continue;      // 不堵街心
if(k%3===0) wreckCar(px,pz,rand(0,TAU));
else if(k%3===1) barrierConcrete(px,pz,a);
else coverStack(px,pz,a);
}
});
// ---- 6) 撤离点: 正北, 穿越全图中部 ----
CQB_EXTRACT.forEach(e=>{
// 灯塔周围的开阔小广场 + 两翼掩体(15m 外, 保证撤离区通路畅通)
barrierConcrete(e.x-10,e.z+6,0); barrierConcrete(e.x+10,e.z+6,0);
coverStack(e.x-12,e.z-5,HPI); coverStack(e.x+12,e.z-5,HPI);
wreckCar(e.x-8,e.z-9,rand(0,TAU)); wreckCar(e.x+9,e.z-9,rand(0,TAU));
// 撤离点保护区内不放碰撞体, 灯塔本体由 extractionBeacon 建立
glassDebris(e.x,e.z+7,2.0);
});
// ---- 7) 外围围合: 城市边缘围墙(只贴最外缘) ----
const EDGE=MAP_HALF-9;
for(let i=-3;i<=3;i++){
const t=i*22;
if(Math.abs(t)<MAP_HALF-20){
stoneWall(-EDGE, t, -EDGE+6, t+5, 1.3);
stoneWall(EDGE, t, EDGE-6, t-5, 1.3);
stoneWall(t, -EDGE, t-5, -EDGE+6, 1.3);
stoneWall(t, EDGE, t+5, EDGE-6, 1.3);
}
}
// 边缘废墟楼(封边+提供外围战术位)
for(let i=0;i<12;i++){
const a=i/12*TAU;
const r=MAP_HALF-15;
const bx=Math.cos(a)*r, bz=Math.sin(a)*r;
if(Math.abs(bx)<CQB_BLOCK*1.2&&Math.abs(bz)<CQB_BLOCK*1.2) continue;
if(cqbInSafe(bx,bz,6)) continue;
ruinedHouse(bx,bz, 7,7, a, Math.random()<0.5?MAT.brick:MAT.plaster, 0.86);
}
// 巷内零星掩体补充(远离街心与出生区, 不堵主要通路)
for(let i=0;i<22;i++){
const x=rand(-W,W), z=rand(-W,W);
if(roadDist(x,z)<4.5) continue;       // 街道中心 4.5m 内不放
if(cqbInSafe(x,z)) continue;          // 出生/撤离保护区外
const r=Math.random();
if(r<0.4) clutterPile(x,z,rand(0,TAU),rand(0.7,1.0));
else if(r<0.66) crate(x,z,rand(0.9,1.2),rand(0,3));
else if(r<0.82) barrel(x,z);
else rubblePile(x,z,rand(1.0,1.6));
}
// 碎玻璃/积水整体散布(纯视觉, 不阻挡, 可全图铺)
for(let i=0;i<50;i++){
const x=rand(-W,W), z=rand(-W,W);
if(Math.random()<0.5) glassDebris(x,z,rand(0.6,1.4));
else puddle(x,z,rand(0.7,1.6));
}
}
// 街心废弃车辆残骸(带浓烟点位)
function shipmentWreck(x,z){
wreckTruck(x,z,rand(0,TAU));
wreckCar(x+2.4,z+1.2,rand(0,TAU));
barrel(x+3.4,z+2.2); barrel(x+3.8,z+1.6);
coverPoints.push({x,z});
}
// -- 诺曼底乡野: 村落 + 农田树篱系统 + 磨坊 --
function layoutRural(){
buildChurch(3,-2,0);
ruinedHouse(-11,12, 7,8, 0, MAT.plaster, 0.5);
ruinedHouse(16,14, 8,7, HPI, MAT.brick, 0.7);
ruinedHouse(14,-18, 6,8, 0, MAT.plaster, 0.6);
wellSmall(3,18);
crate(7,22,1.2,0.4); barrel(0,21);
crater(-5,6,2.4); crater(21,4,1.9);
wreckTruck(-19,10,0.5);
twoStoryHouse(-21,-10,0.15,MAT.brick);
// 西侧农庄
buildBarn(-72,26,0.2);
ruinedHouse(-62,12, 7,7, 0.2, MAT.plaster, 0.4);
stoneWall(-84,34,-58,38); stoneWall(-84,10,-84,34);
crate(-66,32,1.2,0.7); barrel(-60,16);
watchtower(-78,8);
twoStoryHouse(-54,34,0.5,MAT.plaster);
for(let i=0;i<3;i++){ const hx=-52+i*4,hz=30+rand(-2,2),g0=heightAt(hx,hz);
const m=mesh(new THREE.CylinderGeometry(1.1,1.1,1.6,12),MAT.hay,hx,g0+1.1,hz); m.rotation.z=HPI;
CYLS.push({x:hx,z:hz,r:1.15,y0:g0,y1:g0+2.2}); coverPoints.push({x:hx,z:hz-2}); }
farmField(-64,48,26,16,0.1);
fenceLine(-78,40,-50,44);
// 南侧农庄
buildBarn(-30,-72,-0.3);
ruinedHouse(-14,-60, 7,7, 0.3, MAT.plaster, 0.5);
hedgerow(-46,-56,-26,-48);
crater(-22,-68,2.0);
wreckTruck(-14,-74,0.8);
hedgehog(-38,-66);
farmField(-40,-88,30,18,-0.1);
orchard(-2,-84,10,7);
wellSmall(-20,-64);
// 北侧村庄
twoStoryHouse(24,72,0.2,MAT.brick);
ruinedHouse(38,62, 7,8, -0.2, MAT.plaster, 0.7);
ruinedHouse(20,58, 6,6, HPI, MAT.brick, 0.6);
rowHouse(32,84,0.1,2,7,6,MAT.plaster,0.3);
stoneWall(12,78,34,82);
watchtower(46,74);
hedgehog(24,52);
windmill(54,88,2.5);
farmField(2,86,24,14,0.2);
// 东侧废墟镇
ruinedHouse(72,-20, 8,9, 0, MAT.brick, 0.9);
ruinedHouse(62,-32, 7,7, HPI, MAT.brick, 0.85);
ruinedHouse(82,-32, 6,7, 0, MAT.plaster, 0.9);
ruinedHouse(76,-8, 7,6, HPI, MAT.plaster, 0.75);
rowHouse(90,-18,HPI,2,7,6,MAT.brick,0.6);
rubblePile(68,-26,2.2); rubblePile(78,-22,1.8);
crater(74,-28,2.6); crater(64,-18,2.2);
wreckTruck(66,-38,1.2);
hedgehog(60,-14); hedgehog(84,-26);
watchtower(84,-8);
twoStoryHouse(58,-44,-0.3,MAT.brick);
// 田野网格(树篱围界, 经典bocage)
stoneWall(-40,-14,-24,-20); stoneWall(30,16,46,10);
hedgerow(-46,-34,-16,-40); hedgerow(20,34,52,28);
hedgerow(-30,44,10,46);
hedgerow(56,44,92,40); hedgerow(56,20,56,44);
farmField(74,32,26,18,0.05);
farmField(-96,-30,22,26,HPI*0.5,null);
fenceLine(30,-52,58,-56);
orchard(-58,-24,11,8);
hedgehog(-44,4); hedgehog(44,2);
crater(-38,-6,2.4); crater(32,6,2.2); crater(-28,26,2.0);
wreckTruck(-45,-24,-0.4); wreckTruck(36,32,2.2);
deadTree(-20,-24); deadTree(26,-10); deadTree(-6,34);
// 外围散点农舍
const E=MAP_HALF-40;
ruinedHouse(-E,60,7,6,0.4,MAT.plaster,0.4);
buildBarn(E-10,-60,1.2);
farmField(E-24,64,24,16,0.3);
farmField(-E+16,-70,26,14,-0.2);
windmill(-E+8,-34,1.0);
}
// -- 巷战城市 (斯大林格勒/柏林): 街区制 + 车站/厂区/广场分区 --
function layoutCity(){
const heavy=THEME.ruinAdd>0.4;
const F=CAMPAIGN.flags;
const nearFlag=(x,z,r)=>F.some(f=>Math.hypot(x-f.x,z-f.z)<r);
// ---- 街道网格 ----
const gx=[-68,-34,0,34,68], gz=[-51,-17,17,51];
for(const zz of gz) paveStreet(-88,zz,88,zz,7);
for(const xx of gx) paveStreet(xx,-66,xx,66,7);
// 路灯沿主街
for(const zz of [gz[1],gz[2]])
for(let x=-84;x<=84;x+=17){ if(!nearFlag(x,zz-4.2,8)) lampPost(x,zz-4.2); }
// ---- 街区填充 ----
for(let bi=0;bi<gx.length-1;bi++)for(let bj=0;bj<gz.length-1;bj++){
const cx2=(gx[bi]+gx[bi+1])/2, cz2=(gz[bj]+gz[bj+1])/2;
if(nearFlag(cx2,cz2,20)) continue;
const r=Math.random();
if(r<0.42){
rowHouse(cx2-8,cz2+rand(-3,3),0,randi(2,3),7,6,Math.random()<0.5?MAT.brick:MAT.plaster,heavy?0.7:0.35);
rowHouse(cx2+8,cz2+rand(-3,3),Math.PI,2,7,6,MAT.brick,heavy?0.8:0.4);
if(Math.random()<0.6) ruinedHouse(cx2+rand(-4,4),cz2+12,7,7,rand(-0.2,0.2),MAT.brick,heavy?0.9:0.6);
crate(cx2+rand(-4,4),cz2+rand(-4,4),1.2,rand(0,3));
} else if(r<0.62){
apartment(cx2,cz2,randi(0,1)*HPI);
} else if(r<0.8){
ruinedHouse(cx2-7,cz2-5,7,8,rand(-0.2,0.2),MAT.brick,0.85);
ruinedHouse(cx2+7,cz2+5,7,7,HPI,MAT.plaster,0.8);
rubblePile(cx2,cz2+rand(-6,6),rand(1.8,2.6));
} else {
// 空地块: 弹坑/瓦砾/残骸
rubblePile(cx2+rand(-8,8),cz2+rand(-6,6),2.4);
crater(cx2+rand(-8,8),cz2+rand(-6,6),rand(2,3));
wreckTruck(cx2+rand(-6,6),cz2+rand(-6,6),rand(0,3));
}
if(Math.random()<0.4) hedgehog(gx[bi]+rand(2,6),cz2+rand(-8,8));
}
// ---- 旗点分区 ----
F.forEach((f,i)=>{
const kind=i%5;
if(kind===0){
// 火车站区
trainStation(f.x-6,f.z-4,0);
const rz=f.z+11;
railTrack(-MAP_HALF+16,rz,MAP_HALF-16,rz);
railTrack(-MAP_HALF+16,rz+4,MAP_HALF-16,rz+4);
locomotive(f.x-18,rz,HPI);
trainWagon(f.x-6,rz,HPI,false);
trainWagon(f.x+5,rz,HPI,true);
trainWagon(f.x+18,rz+4,HPI,false);
warehouse(f.x+22,f.z-8,0.1);
} else if(kind===1){
// 居民街区
apartment(f.x-11,f.z+8,0);
rowHouse(f.x+10,f.z-8,Math.PI,2,7,6,MAT.brick,heavy?0.75:0.4);
rowHouse(f.x+12,f.z+9,HPI,3,7,6,MAT.plaster,heavy?0.7:0.35);
lampPost(f.x-3,f.z-6);
sandbagWall(f.x+rand(-6,6),f.z+rand(-6,6),4,rand(0,3));
} else if(kind===2){
// 中心广场
buildChurch(f.x-13,f.z-9,0.2);
apartment(f.x+13,f.z+9,Math.PI);
wellSmall(f.x+2,f.z-2);
rubblePile(f.x-6,f.z+8,2.2);
hedgehog(f.x+6,f.z-8); hedgehog(f.x-8,f.z+2);
sandbagWall(f.x+3,f.z+6,4,HPI);
} else if(kind===3){
// 厂区
factoryHall(f.x-4,f.z+4,0);
warehouse(f.x+16,f.z-10,HPI*0.5);
for(let k=0;k<4;k++) barrel(f.x+12+rand(-2,2),f.z+8+rand(-2,2));
crate(f.x-14,f.z-10,1.4,0.4);
wreckTruck(f.x+20,f.z+8,rand(0,3));
} else {
// 市政/公园
twoStoryHouse(f.x-10,f.z-8,0.1,MAT.plaster);
rowHouse(f.x+11,f.z+7,HPI,2,8,7,MAT.plaster,0.3);
for(let k=0;k<4;k++) tree(f.x+rand(-12,12),f.z+rand(-12,12),rand(0.7,1.0));
fenceLine(f.x-14,f.z+12,f.x+14,f.z+12);
sandbagWall(f.x+rand(-5,5),f.z+rand(-5,5),4,rand(0,3));
}
rubblePile(f.x+rand(-9,9),f.z+rand(-9,9),rand(1.6,2.4));
crater(f.x+rand(-10,10),f.z+rand(-10,10),rand(1.8,2.6));
wreckTruck(f.x+rand(-14,14),f.z+rand(-14,14),rand(0,3));
});
// ---- 郊外环带: 农田与散屋 ----
const E=MAP_HALF-34;
farmField(-E+10,E-14,28,18,0.15);
farmField(E-14,-E+16,24,16,-0.1);
farmField(0,E-10,30,14,0.05);
fenceLine(-E+30,E-24,-E+58,E-20);
ruinedHouse(-E+18,-E+22,7,7,0.3,MAT.plaster,0.5);
rowHouse(E-20,E-26,0.4,2,7,6,MAT.brick,0.5);
orchard(E-30,10,12,8);
windmill(-E+14,0,1.2);
stoneWall(-40,40,-16,44); stoneWall(20,-42,44,-38);
}
// -- 江南水乡 (淞沪): 密巷民居 + 石拱桥 + 圩田 --
function layoutDelta(){
CAMPAIGN.flags.forEach((f,i)=>{
cnHouse(f.x-7,f.z+6,rand(-0.2,0.3),7,6);
cnHouse(f.x+7,f.z-6,HPI+rand(-0.2,0.2),6,5);
cnHouse(f.x+8,f.z+8,rand(0,0.4),6,5);
cnHouse(f.x-9,f.z-8,rand(0,0.4),6,5);
if(i%2===0) cnHouse(f.x+1,f.z+13,rand(-0.2,0.2),6,5);
stoneWall(f.x-12,f.z+12,f.x+2,f.z+14);
stoneWall(f.x+10,f.z-12,f.x+16,f.z-4);
sandbagWall(f.x+rand(-6,6),f.z+rand(-6,6),4,rand(0,3));
crate(f.x+rand(-5,5),f.z+rand(-5,5),1.2,rand(0,3));
barrel(f.x+rand(-6,6),f.z+rand(-6,6));
crater(f.x+rand(-9,9),f.z+rand(-9,9),2.0);
wellSmall(f.x-3,f.z+3);
});
// 石拱桥横跨河道
if(RIVER){
const P=RIVER.pts;
for(let i=1;i<P.length-1;i+=2){
const ax=P[i][0],az=P[i][1],bx2=P[i+1][0],bz2=P[i+1][1];
const mx=(ax+bx2)/2,mz=(az+bz2)/2;
const ry=Math.atan2(bx2-ax,bz2-az)+HPI;
archBridge(mx,mz,ry,16);
}
}
// 圩田(水田)
farmField(-60,40,26,18,0.1,'paddy');
farmField(50,-40,24,16,-0.15,'paddy');
farmField(-30,-70,28,16,0.05,'paddy');
farmField(70,50,22,14,0.2,'paddy');
fenceLine(-72,28,-48,32);
wreckTruck(50,4,0.6); wreckTruck(-30,-8,2.4);
hedgehog(52,-10); hedgehog(12,10); hedgehog(-28,-4);
deadTree(40,10); deadTree(-2,-32); deadTree(-44,20);
bambooClump(-52,52); bambooClump(34,64); bambooClump(-14,44);
}
// -- 黄土沟壑 (百团): 窑洞村 + 梯田 + 铁路破袭线 --
function layoutLoess(){
CAMPAIGN.flags.forEach((f,i)=>{
cnHouse(f.x-7,f.z+5,rand(-0.3,0.3),6,5);
cnHouse(f.x+7,f.z-5,HPI+rand(-0.2,0.2),6,5);
if(i===1) cnHouse(f.x+9,f.z+7,0.2,6,5);
// 窑洞挖在旗点边坡
caveDwelling(f.x-13,f.z-10,Math.atan2(f.x-(f.x-13),f.z-(f.z-10)));
caveDwelling(f.x+13,f.z+10,Math.atan2(f.x-(f.x+13),f.z-(f.z+10)));
terraceEdge(f.x-6,f.z+16,18,0.15);
terraceEdge(f.x-2,f.z+20,16,0.15);
stoneWall(f.x-11,f.z-9,f.x+3,f.z-12);
stoneWall(f.x+5,f.z+9,f.x+13,f.z+7);
crate(f.x+rand(-5,5),f.z+rand(-5,5),1.1,rand(0,3));
barrel(f.x+rand(-5,5),f.z+rand(-5,5));
wellSmall(f.x+4,f.z-2);
});
// 铁路线(破袭战主题)
{
const rz=(CAMPAIGN.flags[0].z+CAMPAIGN.flags[CAMPAIGN.flags.length-1].z)/2-14;
railTrack(-MAP_HALF+18,rz,MAP_HALF-18,rz);
trainWagon(-24,rz,HPI,true);
trainWagon(14,rz,HPI,false);
locomotive(38,rz,HPI);
}
watchtower(-30,8); watchtower(36,6);
wreckTruck(-8,-6,1.2);
crater(-24,12,2.2); crater(30,18,2.0); crater(4,-24,2.2);
hedgehog(-14,20); hedgehog(24,-14);
farmField(-52,-38,22,14,0.3);
farmField(48,36,20,14,-0.2);
terraceEdge(-44,30,26,0.5);
terraceEdge(-40,36,22,0.5);
}
// -- 丛林前哨 (滇缅): 竹林 + 营地 --
function layoutJungle(){
CAMPAIGN.flags.forEach((f,i)=>{
watchtower(f.x+6,f.z+5);
tent(f.x-5,f.z+4,rand(0,3)); tent(f.x-7,f.z-4,rand(0,3));
sandbagWall(f.x+7,f.z-4,4,rand(0,3)); sandbagWall(f.x-2,f.z+9,4,rand(0,3)); sandbagWall(f.x-9,f.z,4,HPI);
crate(f.x+rand(-3,3),f.z+rand(-3,3),1.2,rand(0,3));
barrel(f.x+3,f.z+3); barrel(f.x+4.2,f.z+2.2);
if(i%2===0) cnHouse(f.x+10,f.z+10,rand(0,0.5),6,5);
bambooClump(f.x-12,f.z+12);
});
for(let i=0;i<8;i++) fallenLog(rand(-110,110),rand(-110,110),rand(0,Math.PI));
for(let i=0;i<10;i++) bambooClump(rand(-(MAP_HALF-30),MAP_HALF-30),rand(-(MAP_HALF-30),MAP_HALF-30));
wreckTruck(-34,6,0.8); wreckTruck(40,-12,2.0);
crater(-12,14,2.0); crater(18,26,1.8);
}
// -- 雪岭松林 (莫斯科): 木屋村 + 碉堡防线 --
function layoutAlpine(){
CAMPAIGN.flags.forEach((f,i)=>{
logCabin(f.x-7,f.z+5,rand(-0.3,0.3));
logCabin(f.x+7,f.z-6,HPI+rand(-0.2,0.2));
if(i%2===0) logCabin(f.x+9,f.z+8,rand(0,0.4));
logCabin(f.x-11,f.z-10,rand(-0.2,0.4));
bunker(f.x-9,f.z-8,Math.atan2(CAMPAIGN.bases[ATK].x-f.x,CAMPAIGN.bases[ATK].z-f.z));
sandbagWall(f.x+rand(-6,6),f.z+rand(-6,6),4,rand(0,3));
crate(f.x+rand(-5,5),f.z+rand(-5,5),1.2,rand(0,3));
barrel(f.x+rand(-6,6),f.z+rand(-6,6));
fenceLine(f.x-13,f.z+13,f.x+5,f.z+15);
// 柴堆
{ const wx=f.x+rand(-8,8), wz=f.z+rand(-8,8), g0=heightAt(wx,wz);
const m=mesh(new THREE.CylinderGeometry(0.9,0.9,1.7,10),MAT.woodDark,wx,g0+0.85,wz); m.rotation.z=HPI;
CYLS.push({x:wx,z:wz,r:0.95,y0:g0,y1:g0+1.7}); coverPoints.push({x:wx,z:wz+1.8}); }
});
hedgehog(-40,8); hedgehog(-2,-14); hedgehog(44,10); hedgehog(8,30);
wreckTruck(-20,18,0.4); wreckTruck(34,-20,1.8);
deadTree(-10,8); deadTree(28,14); deadTree(-36,-18);
crater(-16,-6,2.2); crater(38,4,2.0);
}
// -- 废墟城市撤离区: 无旗点, 街区大面积坍塌/弹坑/瓦砾 --
function layoutRuins(){
const gx=[-68,-34,0,34,68], gz=[-51,-17,17,51];
for(const zz of gz) paveStreet(-88,zz,88,zz,7);
for(const xx of gx) paveStreet(xx,-66,xx,66,7);
for(let bi=0;bi<gx.length-1;bi++)for(let bj=0;bj<gz.length-1;bj++){
const cx=(gx[bi]+gx[bi+1])/2, cz=(gz[bj]+gz[bj+1])/2;
const r=Math.random();
if(r<0.52){
ruinedHouse(cx-6,cz+rand(-3,3),7,8,rand(-0.2,0.2),MAT.brick,0.92);
ruinedHouse(cx+7,cz+rand(-3,3),7,7,HPI+rand(-0.2,0.2),MAT.plaster,0.86);
if(Math.random()<0.4) rowHouse(cx+rand(-4,4),cz+11,rand(0,3),2,7,6,MAT.brick,0.8);
} else if(r<0.78){
apartment(cx,cz,randi(0,1)*HPI);
ruinedHouse(cx-9,cz+7,6,6,rand(0,0.3),MAT.plaster,0.82);
} else {
rubblePile(cx+rand(-7,7),cz+rand(-6,6),rand(2.0,2.9));
crater(cx+rand(-8,8),cz+rand(-7,7),rand(2,3.2));
if(Math.random()<0.55) wreckTruck(cx+rand(-7,7),cz+rand(-7,7),rand(0,3));
}
if(Math.random()<0.28) crate(cx+rand(-6,6),cz+rand(-6,6),1.2,rand(0,3));
if(Math.random()<0.2) sandbagWall(cx+rand(-5,5),cz+rand(-5,5),4,rand(0,3));
}
for(let i=0;i<70;i++){
const x=rand(-(MAP_HALF-22),MAP_HALF-22), z=rand(-(MAP_HALF-18),MAP_HALF-18);
const r=Math.random();
if(r<0.36) rubblePile(x,z,rand(1.4,2.6));
else if(r<0.62) crater(x,z,rand(1.6,2.8));
else if(r<0.78) wreckTruck(x,z,rand(0,3));
else deadTree(x,z);
}
for(let i=0;i<14;i++) crater(rand(-(MAP_HALF-24),MAP_HALF-24),rand(-(MAP_HALF-24),MAP_HALF-24),rand(2.2,3.8));
for(let i=0;i<18;i++) hedgehog(rand(-(MAP_HALF-16),MAP_HALF-16),rand(-(MAP_HALF-16),MAP_HALF-16));
lampPost(-34,17); lampPost(34,17); lampPost(-34,-17); lampPost(34,-17);
}
const TREES=[], fTrees=[];
function buildWorld(){
const areaMul=Math.pow(MAP_SIZE/320,2);
switch(CAMPAIGN.layout){
case 'city': layoutCity(); break;
case 'ruins': layoutRuins(); break;
case 'cqb': layoutCQB(); break;
case 'lab': layoutLab(); break;
case 'port': layoutPort(); break;
case 'delta': layoutDelta(); break;
case 'loess': layoutLoess(); break;
case 'jungle': layoutJungle(); break;
case 'alpine': layoutAlpine(); break;
default: layoutRural(); break;
}
// 破袭模式: 在旗点位置建立补给库目标
if(GAMEMODE==='demolition'){
for(const f of CAMPAIGN.flags){
const g=buildDepot(f.x,f.z,rand(0,3));
if(g) DEPOTS.push({id:f.id,x:f.x,z:f.z,g,destroyed:false});
}
}
// 基地营区 (通用) —— 室内/港区地图不摆野战帐篷, 改用设施内或堆场里的设备掩体
// (见 07d_lab 入口区 / 07e_port 出生点)
if(CAMPAIGN.layout!=='lab'&&CAMPAIGN.layout!=='port'){
CAMPAIGN.bases.forEach((b,t)=>{
const sgn=b.x<0?1:-1;
tent(b.x+sgn*2,6,0.3); tent(b.x,-6,-0.2); tent(b.x-sgn*4,0,0);
sandbagWall(b.x+sgn*10,6,5,HPI); sandbagWall(b.x+sgn*10,-6,5,HPI); sandbagWall(b.x+sgn*8,0,5,HPI);
crate(b.x+sgn*4,10,1.3,0); barrel(b.x+sgn*5,-9);
});
}
decorateTrenches();
// 河流水面/冰面
if(RIVER){
let wy=1e9;
for(const pt of RIVER.pts){
const gy=heightAt(clamp(pt[0],-MAP_EDGE,MAP_EDGE),clamp(pt[1],-MAP_EDGE,MAP_EDGE));
if(gy<wy) wy=gy;
}
wy+=RIVER.ice?0.75:0.55;
const wmat=RIVER.ice
?new THREE.MeshLambertMaterial({color:0xcfe2ee})
:new THREE.MeshLambertMaterial({color:0x3e5a6a,transparent:true,opacity:0.72});
const P=RIVER.pts;
for(let i=0;i<P.length-1;i++){
const ax=P[i][0],az=P[i][1],bx2=P[i+1][0],bz2=P[i+1][1];
const len=Math.hypot(bx2-ax,bz2-az);
const wm=mesh(new THREE.BoxGeometry(len+6,0.08,RIVER.w*1.9),wmat,(ax+bx2)/2,wy,(az+bz2)/2,Math.atan2(-(bz2-az),bx2-ax),false,true);
}
}
// 树木/枯树散布
const treeSpots=[];
const treeN=Math.round(THEME.treeN*areaMul);
for(let i=0;i<treeN;i++){
const x=rand(-(MAP_HALF-8),MAP_HALF-8), z=rand(-(MAP_HALF-8),MAP_HALF-8);
if(roadDist(x,z)<7) continue;
let near=false;
for(const f of FLATS){ if(Math.hypot(x-f.x,z-f.z)<f.r*(CAMPAIGN.layout==='jungle'?0.5:0.85)) near=true; }
if(near) continue;
treeSpots.push([x,z]);
}
treeSpots.forEach(([x,z])=>{ if(Math.random()<THEME.dead) deadTree(x,z); else{ tree(x,z,rand(0.8,1.5)*(CAMPAIGN.layout==='jungle'?1.25:1)); TREES.push({x,z}); } });
// 废墟主题: 额外瓦砾堆与弹坑
const rubN=Math.round(THEME.rubbleN*areaMul);
for(let i=0;i<rubN;i++){
const x=rand(-(MAP_HALF-30),MAP_HALF-30), z=rand(-(MAP_HALF-30),MAP_HALF-30);
if(roadDist(x,z)<6) continue;
if(Math.random()<0.6) rubblePile(x,z,rand(1.4,2.6)); else crater(x,z,rand(1.6,2.6));
}
const grassCount=Math.round((SETTINGS.quality===0?480:(SETTINGS.quality===1?1050:1850))*THEME.grassMul*areaMul);
const gGeo=new THREE.PlaneGeometry(0.9,0.55);
gGeo.translate(0,0.27,0);
const gMat=new THREE.MeshLambertMaterial({map:makeTex(64,64,(g,w,h)=>{
g.clearRect(0,0,w,h);
for(let i=0;i<30;i++){
g.strokeStyle=`rgba(${randi(90,130)},${randi(115,150)},${randi(55,80)},.9)`;
g.lineWidth=2;
g.beginPath(); const x=rand(4,60); g.moveTo(x,h); g.quadraticCurveTo(x+rand(-6,6),h*0.5,x+rand(-10,10),rand(4,20)); g.stroke();
}
}),transparent:true,alphaTest:0.35,side:THREE.DoubleSide});
const inst=new THREE.InstancedMesh(gGeo,gMat,Math.max(grassCount,1));
gMat.color.set(THEME.grassC);
const dummy=new THREE.Object3D();
for(let i=0;i<grassCount;i++){
let x=rand(-(MAP_HALF-10),MAP_HALF-10),z=rand(-(MAP_HALF-10),MAP_HALF-10);
if(roadDist(x,z)<4){ x+=8; }
dummy.position.set(x,heightAt(x,z),z);
dummy.rotation.y=rand(0,Math.PI);
dummy.scale.setScalar(rand(0.7,1.4));
dummy.updateMatrix();
inst.setMatrixAt(i,dummy.matrix);
}
inst.receiveShadow=true;
scene.add(inst);
if(CAMPAIGN.sineRoad){
const pl2=Math.floor((MAP_HALF-36)/28)*28;
for(let x=-pl2;x<=pl2;x+=28){
const z=3*Math.sin(x*0.02)+6.5;
const g0=heightAt(x,z);
mesh(new THREE.CylinderGeometry(0.12,0.16,6.5,6),MAT.woodDark,x,g0+3.25,z);
mesh(new THREE.BoxGeometry(0.1,0.12,1.8),MAT.woodDark,x,g0+5.8,z);
CYLS.push({x,z,r:0.2,y0:g0,y1:g0+6.5});
}
}
}
buildWorld();
const FLAGS=CAMPAIGN.flags.map(f=>({id:f.id,x:f.x,z:f.z,r:f.r,owner:-1,cap:0,capTeam:-1}));
const BASES=CAMPAIGN.bases.map(b=>({x:b.x,z:b.z}));
FLAGS.forEach(f=>{
const g0=heightAt(f.x,f.z);
const pole=mesh(new THREE.CylinderGeometry(0.07,0.09,7,8),MAT.metal,f.x,g0+3.5,f.z);
CYLS.push({x:f.x,z:f.z,r:0.15,y0:g0,y1:g0+7});
const flagC=document.createElement('canvas'); flagC.width=64; flagC.height=40;
f.flagCtx=flagC.getContext('2d');
f.flagTex=new THREE.CanvasTexture(flagC);
const fm=new THREE.Mesh(new THREE.PlaneGeometry(2.4,1.5), new THREE.MeshLambertMaterial({map:f.flagTex,side:THREE.DoubleSide}));
fm.position.set(f.x+1.25,g0+6,f.z);
world.add(fm);
f.flagMesh=fm; f.poleTop=g0+6.6; f.gy=g0;
drawFlagTex(f);
});
function drawFlagTex(f){
const g=f.flagCtx;
if(f.owner===0){ g.fillStyle=TEAM_FACTION[0].flagBg; g.fillRect(0,0,64,40); g.fillStyle='#fff'; g.font='bold 26px sans-serif'; g.fillText(TEAM_FACTION[0].sym,20,31); }
else if(f.owner===1){ g.fillStyle=TEAM_FACTION[1].flagBg; g.fillRect(0,0,64,40); g.fillStyle='#eee'; g.font='bold 26px sans-serif'; g.fillText(TEAM_FACTION[1].sym,20,31); }
else { g.fillStyle='#c9c9bb'; g.fillRect(0,0,64,40); g.fillStyle='#555'; g.font='bold 22px sans-serif'; g.fillText(f.id,24,29); }
f.flagTex.needsUpdate=true;
}
const AMMO_CRATES=[];
function ammoCrate(x,z){
const g0=heightAt(x,z);
const m=solidBox(MAT.woodDark,1.1,0.7,0.8,x,g0+0.35,z,rand(0,3));
const lid=mesh(new THREE.BoxGeometry(1.15,0.08,0.85),MAT.wood,x,g0+0.74,z,m.rotation.y);
AMMO_CRATES.push({x,z,y:g0});
}
// 弹药箱: 每个旗点与基地附近 (通用)
FLAGS.forEach(f=>ammoCrate(f.x+rand(-5,5),f.z+rand(-5,5)));
ammoCrate(BASES[0].x+(BASES[0].x<0?3:-3),3); ammoCrate(BASES[1].x+(BASES[1].x<0?3:-3),-3);
// ---- 撤离突袭物资: 可搜索战利品箱 + 单一撤离灯塔 ----
const LOOT_CRATES=[];
// 共享自发光材质: 逐个 new 会让每个箱子各占一个合批分组
const LOOT_GLOW_MAT=new THREE.MeshLambertMaterial({color:0xd8b04a,emissive:0x5a430f});
function lootCrate(x,z,rich){
const g0=heightAt(x,z);
const bodyMat=(CAMPAIGN.layout==='lab')?MAT.labCrate:MAT.woodDark;
const m=solidBox(bodyMat,1.15,0.72,0.85,x,g0+0.36,z,rand(0,3));
const glow=mesh(new THREE.BoxGeometry(1.25,0.1,0.95),LOOT_GLOW_MAT,x,g0+0.74,z,m.rotation.y);
LOOT_CRATES.push({x,z,y:g0,mesh:m,glow,searched:false,rich:!!rich});
}
// 战利品点: 街区为固定 14 点; 秘密实验室由 layoutLab() 动态写入 CAMPAIGN.lootSpots
// (位置与 rich 标记由地图自己决定 —— 等级越高的房间里的箱子越值钱)
const DEFAULT_LOOT_SPOTS=[[-57,-57],[-19,-57],[19,-57],[57,-57],
[-57,-19],[-19,-19],[19,-19],[57,-19],
[-57,19],[19,19],[57,19],[-19,57],[19,57],[0,0]];
const lootSpots=(CAMPAIGN.lootSpots&&CAMPAIGN.lootSpots.length)?CAMPAIGN.lootSpots:DEFAULT_LOOT_SPOTS;
lootSpots.forEach(sp=>{
if(Array.isArray(sp)) lootCrate(sp[0],sp[1],false);
else lootCrate(sp.x,sp.z,sp.rich);
});
const EXTRACT_POINTS=[];
function extractionBeacon(x,z){
const g0=heightAt(x,z);
const base=mesh(new THREE.CylinderGeometry(2.4,2.8,0.32,18),MAT.metal,x,g0+0.16,z);
const pole=mesh(new THREE.CylinderGeometry(0.08,0.1,4.3,8),MAT.metal,x,g0+2.15,z);
const orb=mesh(new THREE.SphereGeometry(0.58,14,10),new THREE.MeshLambertMaterial({color:0x35e0a0,emissive:0x0f5a3a}),x,g0+4.4,z);
EXTRACT_POINTS.push({x,z,y:g0,r:5,progress:0,orb});
}
// 每个撤离点各建立一座灯塔(街区 3 个, 实验室/港口各 1 个)
for(const e of CQB_EXTRACT) extractionBeacon(e.x, e.z);
const MG42S=[];
// 各阵营架设重机枪 (对应历史型号/射速/威力)
 const FACTION_MG={
 us: { name:'M1919A4 勃朗宁重机枪', rpm:520, dmg:29, heatPS:0.011, style:'air' },
 ger:{ name:'MG42 通用机枪',        rpm:1100,dmg:25, heatPS:0.014, style:'mg42' },
 rus:{ name:'PKM 通用机枪',         rpm:700, dmg:27, heatPS:0.011, style:'air' },
 sov:{ name:'马克沁 M1910 重机枪',  rpm:560, dmg:29, heatPS:0.006, style:'water' },
fin:{ name:'马克沁 M/32 重机枪',    rpm:600, dmg:29, heatPS:0.007, style:'water' },
kmt:{ name:'二四式重机枪',         rpm:480, dmg:30, heatPS:0.006, style:'water' },
cpc:{ name:'二四式重机枪(缴获)',   rpm:460, dmg:30, heatPS:0.006, style:'water' },
jp: { name:'九二式重机枪',         rpm:440, dmg:32, heatPS:0.009, style:'92' },
};
function mgDefOfTeam(team){ return FACTION_MG[CAMPAIGN.f[team]]||FACTION_MG.ger; }
function mg42(x,z,face,team){
if(team===undefined||team===null) team=x<0?0:1;
const def=mgDefOfTeam(team);
const g0=heightAt(x,z);
// 掩护矮墙: 横向挡在机枪正前方 (沙袋墙沿垂直于射向的方向延展)
sandbagWall(x+Math.sin(face)*1.1, z+Math.cos(face)*1.1, 3, face);
const grp=new THREE.Group();
grp.position.set(x,g0+1.0,z);
grp.rotation.y=face;
const yaw=new THREE.Group(); grp.add(yaw);
const pitch=new THREE.Group(); yaw.add(pitch);
const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.06,1.3,8),MAT.metalDark);
barrel.rotation.x=HPI; barrel.position.z=0.65; pitch.add(barrel);
if(def.style==='water'){
// 水冷套筒 (马克沁/二四式)
const jacket=new THREE.Mesh(new THREE.CylinderGeometry(0.085,0.085,0.62,10),MAT.metal);
jacket.rotation.x=HPI; jacket.position.z=0.72; pitch.add(jacket);
} else if(def.style==='air'){
// 风冷散热套筒 (M1919)
const jacket=new THREE.Mesh(new THREE.CylinderGeometry(0.062,0.062,0.7,8),MAT.metalDark);
jacket.rotation.x=HPI; jacket.position.z=0.6; pitch.add(jacket);
} else if(def.style==='92'){
// 九二式: 左侧供弹保弹板匣
const hopper=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.1,0.22),MAT.metalDark);
hopper.position.set(-0.2,0.02,0.05); pitch.add(hopper);
}
const body=new THREE.Mesh(new THREE.BoxGeometry(0.14,0.2,0.75),MAT.metalDark);
body.position.z=0.0; pitch.add(body);
const shield=new THREE.Mesh(new THREE.BoxGeometry(0.9,0.55,0.05),MAT.metal);
shield.position.set(0,0.05,0.35); pitch.add(shield);
const tripod1=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,1.0,6),MAT.metalDark);
tripod1.position.set(0,-0.5,0); grp.add(tripod1);
grp.traverse(o=>{ o.castShadow=true; });
world.add(grp);
MG42S.push({x,z,y:g0+1.0,face,grp,yaw,pitch,user:null,heat:0,muzzle:V3(),def,team});
}
// 世界构建完毕 → 静态合批(必须在首帧渲染前)
mergeStaticWorld();
// ===== 迫击炮架设 + 工程兵工事 =====
