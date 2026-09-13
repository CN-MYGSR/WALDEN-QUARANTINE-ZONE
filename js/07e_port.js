'use strict';
// =====================================================================
// 港口 (WALDEN PORT) —— 地图构建（重构版）
// 战役: CAMPAIGNS[2] { id:'port', layout:'port', terr:'harbor', mapSize:220 }
// 加载位置: 07d_lab 之后 / 08_world 之前 —— buildWorld() 会调用 layoutPort()
// ---------------------------------------------------------------------
// 设计: "瓦尔登港 · 集装箱码头"
//   · 东侧是海 (由 01_data 的 RIVER.port 沿 x≈86 下切出水面), 岸线在 x≈58
//   · 一条 8m 宽主干道从西侧出生点直通码头前沿撤离点 (z=0)
//   · 主干道以北是集装箱堆场 (不规则摆放, 通道纵横), 以南是仓储/油罐区
//   · 码头前沿有大型仓库、办公楼、待运箱、系船柱与龙门吊
//   · 「撤离通行证」= 船票 —— 只在本地图有效 (见 39_quests 的 PASS_MAP)
// 结构:
//   海(x>60) | 岸线胸墙 x=58 | 码头前沿 | 集装箱堆场(x∈[-96,20]) | 后方仓储区
//   龙门吊 z=-56 / 52 / 88 | 船 (76,0) | 撤离点 (44,0) | 双方出生点 (-70,±64)
// =====================================================================

// ---------- 尺寸常量 ----------
const PORT_QUAY=58;        // 岸线 (胸墙) x; 与 RIVER.port 的 w=26 对齐 → 水面从 x≈60 开始
const PORT_EDGE=102;       // 陆地可用边界 (MAP_EDGE)
const PORT_EXT_X=44;       // 撤离点 (与 01_data 的 CAMPAIGN.extract 保持一致)
const PORT_CRANE_Z=[-56,52,88];   // 龙门吊的 z (刻意避开 z=0 的撤离主通道)

// ---------- 材质 ----------
MAT.portConcrete=new THREE.MeshLambertMaterial({map:makeTex(256,256,(g,w,h)=>{
g.fillStyle='#8b8f92'; g.fillRect(0,0,w,h);
// 码头面是整浇混凝土板: 分格缝 + 板面污渍
g.strokeStyle='#767a7d'; g.lineWidth=3;
for(let i=0;i<=4;i++){ g.beginPath(); g.moveTo(i*64,0); g.lineTo(i*64,h); g.stroke();
g.beginPath(); g.moveTo(0,i*64); g.lineTo(w,i*64); g.stroke(); }
speckle(g,w,h,220,'#7d8184','#9aa0a3',1,4);
for(let i=0;i<18;i++){
g.fillStyle=`rgba(60,62,64,${rand(0.05,0.18).toFixed(2)})`;
g.beginPath(); g.arc(rand(0,w),rand(0,h),rand(5,26),0,TAU); g.fill();
}
},4,4)});
MAT.portCurb=new THREE.MeshLambertMaterial({color:0x9a9e9c});
MAT.portSteel=new THREE.MeshLambertMaterial({color:0x6e7378});
MAT.portSteelDark=new THREE.MeshLambertMaterial({color:0x4b5054});
MAT.portRail=new THREE.MeshLambertMaterial({color:0x7a7f83});
MAT.portWarn=new THREE.MeshLambertMaterial({color:0xd9a12a});
MAT.portLamp=new THREE.MeshLambertMaterial({color:0xffe8b8,emissive:0x8a6a20});
MAT.portGreen=new THREE.MeshLambertMaterial({color:0x9dffb4,emissive:0x1d7a38});
MAT.portHull=new THREE.MeshLambertMaterial({color:0x4c545a});
MAT.portGlass=new THREE.MeshLambertMaterial({color:0x9fb4bc,transparent:true,opacity:0.3,side:THREE.DoubleSide,depthWrite:false});
MAT.portOffice=new THREE.MeshLambertMaterial({color:0xb8b0a0});
MAT.portTank=new THREE.MeshLambertMaterial({color:0x7a8288});

// =====================================================================
// 1) 基础工具
// =====================================================================
function portWallRun(cx,cz,len,ry,h,t,mat,g0){
if(len<=0.05) return;
solidBox(mat||MAT.portConcrete,len,h,t,cx,g0+h/2,cz,ry);
}
// 沿线段铺"保通车道" (NAV_CLEARS)。堆场通道里只要落进一件掩体, 2m 寻路网格上
// 整条通道就会被切断 (占用盒还有 0.6m 外扩) —— 沿主通道预先登记清除区, 保证 Bot 走得通。
function portLane(x1,z1,x2,z2,r,step){
const len=Math.hypot(x2-x1,z2-z1);
const n=Math.max(1,Math.round(len/(step||8)));
for(let i=0;i<=n;i++){
const t=i/n;
NAV_CLEARS.push({x:lerp(x1,x2,t),z:lerp(z1,z2,t),r:r||1.5});
}
}
// 建筑占地保护: 散落箱堆/杂物不得落进建筑内部 —— 否则会堵死门洞与梯井,
// 并让室内出现"外部连通不到"的封闭房间。CQ_BUILDINGS 由建筑原语自行登记。
function portInBuilding(x,z,pad){
for(const b of CQ_BUILDINGS){
const dx=x-b.x, dz=z-b.z, c=Math.cos(b.ry), s=Math.sin(b.ry);
const lx=dx*c-dz*s, lz=dx*s+dz*c;
if(Math.abs(lx)<b.w/2+(pad||1.0)&&Math.abs(lz)<b.d/2+(pad||1.0)) return true;
}
return false;
}
// 集装箱: 每层一个独立 solidBox → 侧面是硬掩体, 顶面可站
function portContainer(x,z,ry,levels,tint){
const g0=heightAt(x,z), w=2.44, h=2.6, d=6.06;
for(let i=0;i<levels;i++){
const y=g0+h*i+h/2;
solidBox(i>0?MAT.containerRust:(tint===1?MAT.containerDoor:MAT.containerRust),w,h,d,x,y,z,ry);
mesh(new THREE.BoxGeometry(w+0.08,0.1,d+0.08),MAT.containerTop,x,y+h/2+0.05,z,ry,false,false);
}
return g0+levels*h;
}
// 系船柱 / 照明塔
function portBollard(x,z){
const g0=heightAt(x,z);
mesh(new THREE.CylinderGeometry(0.28,0.34,0.72,10),MAT.portSteelDark,x,g0+0.36,z);
mesh(new THREE.CylinderGeometry(0.4,0.4,0.12,10),MAT.portSteel,x,g0+0.72,z);
CYLS.push({x,z,r:0.42,y0:g0,y1:g0+0.8});
}
function portLightTower(x,z){
const g0=heightAt(x,z);
mesh(new THREE.CylinderGeometry(0.16,0.22,17,8),MAT.portSteel,x,g0+8.5,z);
for(let i=0;i<3;i++){
const a=i/3*TAU;
mesh(new THREE.BoxGeometry(1.5,0.18,0.36),MAT.portLamp,x+Math.sin(a)*0.8,g0+16.4,z+Math.cos(a)*0.8,a,false,false);
}
mesh(new THREE.BoxGeometry(1.2,0.3,1.2),MAT.portSteelDark,x,g0+17,z);
CYLS.push({x,z,r:0.3,y0:g0,y1:g0+17});
}
// 龙门吊 (北港吊塔): 两条门腿沿 x 跨越装卸线, 顶部主梁 + 小车, 吊臂伸向海面。
// 注意跨度方向固定在 x 上 —— 腿必须一陆一水地跨在岸线附近, 不能沿 z 排。
function portCrane(x,z){
const g0=heightAt(x,z);
const span=13, hgt=17;
for(const o of [-span/2,span/2]){
const lx=x+o;
const g1=heightAt(lx,z);
solidBox(MAT.portSteel,1.0,hgt,1.0,lx,g1+hgt/2,z,0);
solidBox(MAT.portSteel,1.0,hgt,1.0,lx,g1+hgt/2,z+5,0);          // A 字架的第二根柱
mesh(new THREE.BoxGeometry(0.34,0.34,5.2),MAT.portSteelDark,lx,g1+hgt-1.6,z+2.5,0);
mesh(new THREE.BoxGeometry(1.6,0.7,2.2),MAT.portSteelDark,lx,g1+0.35,z,0);   // 行走轮箱
}
// 主梁 (横跨两条腿) + 向海面挑出的吊臂
mesh(new THREE.BoxGeometry(span+5,1.5,1.6),MAT.portSteel,x,g0+hgt+1.8,z+2.5,0);
mesh(new THREE.BoxGeometry(24,1.2,2.2),MAT.portSteel,x+span/2+9,g0+hgt+1.4,z,0,false,false);
// 小车 + 吊索 + 吊具
mesh(new THREE.BoxGeometry(2.0,1.4,2.4),MAT.portSteelDark,x+span/2+7,g0+hgt+0.4,z,0);
mesh(new THREE.CylinderGeometry(0.06,0.06,hgt-5,6),MAT.portRail,x+span/2+7,g0+(hgt-5)/2+2.4,z);
mesh(new THREE.BoxGeometry(2.6,0.5,6.4),MAT.portSteelDark,x+span/2+7,g0+2.2,z,0);
// 顶部航空障碍灯 (呼应老设定里"还亮着的那盏绿灯")
mesh(new THREE.BoxGeometry(0.5,0.5,0.5),MAT.portGreen,x+span/2+1,g0+hgt+2.8,z,0,false,false);
}
// 开敞式装卸棚: 立柱 + 屋面 + 三面半高挡墙(带开口), 一角设夹层办公室。
// 战术作用: 半高墙提供可依托的射击位, 夹层提供制高点, 前后通透保留穿行捷径。
function portShed(x,z,w,d){
const g0=heightAt(x,z);
const h=6.2, t=0.32, mz=3.05;
const L=_cqbL(x,z,0);
const wallGs=[], upperMeshes=[];
for(const sx of [-1,1]) for(let k=-1;k<=1;k++){
solidBox(MAT.portSteel,0.7,h,0.7,x+sx*(w/2-1),g0+h/2,z+k*(d/2-2),0);
}
mesh(new THREE.BoxGeometry(w+2,0.35,d+2),MAT.roof,x,g0+h+0.2,z,0);
for(let k=-1;k<=1;k++){
mesh(new THREE.BoxGeometry(w+2,0.2,0.5),MAT.portSteelDark,x,g0+h-0.1,z+k*(d/3),0,false,false);
}
const IX=w/2-t, IZ=d/2-t;
// 三面半高挡墙: 后墙留 4m 通道口, 两翼各留 3.6m 通道口(不注册保通区, 免得清掉堆场占用)
_cqbWallOpen(MAT.portConcrete,L,0,'x',-IZ,-w/2,w/2,g0,2.15,0.45,[{c:0,w:4.0,nav:false}],null,null,null,wallGs);
_cqbWallOpen(MAT.portConcrete,L,0,'z',-IX,-IZ,IZ,g0,2.15,0.45,[{c:0,w:3.6,nav:false}],null,null,null,wallGs);
_cqbWallOpen(MAT.portConcrete,L,0,'z', IX,-IZ,IZ,g0,2.15,0.45,[{c:-IZ*0.4,w:3.6,nav:false}],null,null,null,wallGs);
// ---- 夹层平台(西北角): 楼板 + 内嵌楼梯井 + 四面围栏 ----
// 井道必须落在楼板范围内并让出落梯余量: 旧版把井道摆在夹层板东侧之外,
// 楼梯顶部落点悬空(3m 落差), 玩家上不去也下不来 —— 探针 stairTopGap=-1e9。
const mw=w*0.36, md=d*0.5;
const mx0=-IX, mx1=-IX+mw, mz0=-IZ, mz1=-IZ+md;
const shW=1.75;
const shDepth=Math.min(4.6, md-2.3);
const shaft={x0:mx1-shW, x1:mx1, z0:mz0+0.75, z1:mz0+0.75+shDepth};
const hole={x0:shaft.x0,x1:shaft.x1,z0:shaft.z0,z1:shaft.z1};
_cqbSlab(L,0,{x0:mx0,x1:mx1,z0:mz0,z1:mz1},[hole],g0+mz,MAT.portSteelDark,0.22,upperMeshes);
// 夹层围栏(四面): 夹层是"只能走楼梯上的制高点", 可越过围栏向棚内射击
// 注意: mx0/mz1 等是建筑局部坐标, 必须经 L() 转世界坐标再交给 solidBox,
// 否则围栏会飘到地图中央的马路上 (旧版就是这样, 夹层实际四面无护栏)。
const railY=g0+mz+0.52;
for(const [lx,lz,rw,rd] of [[(mx0+mx1)/2,mz1,mw,0.12],[(mx0+mx1)/2,mz0,mw,0.12],[mx0,(mz0+mz1)/2,0.12,md],[mx1,(mz0+mz1)/2,0.12,md]]){
const q=L(lx,lz);
solidBox(MAT.portSteel, rw, 1.05, rd, q[0], railY, q[1], 0);
}
// 井道西侧护栏(两端各留 0.5m 登/落梯口)
{
const rl=shDepth-0.55;
if(rl>0.6){ const q=L(shaft.x0,(shaft.z0+shaft.z1)/2); solidBox(MAT.portSteel,0.12,1.05,rl,q[0],railY,q[1],0); }
}
// 上夹层的楼梯
_cqbStairShaft(L,0,shaft,g0,g0+mz,MAT.portSteelDark);
// 夹层办公桌 / 货箱
_cqbFurniture(L,0,w,d,g0+mz,[[mx0+1.2,mz0+1.0,0,'metal'],[mx0+2.6,mz0+2.5,0,'wood'],[mx0+1.0,mz1-0.9,0,'sand']]);
// 棚内货位
_cqbFurniture(L,0,w,d,g0,[[-IX+1.4,IZ*0.55,0,'wood'],[IX-1.4,-IZ*0.2,0,'metal'],[IX-1.6,IZ*0.5,0,'sand']]);
addCoverAround(x,z,w,d,0);
_cqbCollapseHook(x,z,g0,wallGs,upperMeshes,0.55);
CQ_BUILDINGS.push({x,z,ry:0,w,d,floors:2,g0,topY:g0+mz,fh:mz,kind:'shed',exits:3,shaft});
}
// 大型仓库: 实心砖墙(低位窗台=真掩体) + 两端装卸大门 + 侧向人员门 + 二层夹层货台。
// 结构: 山墙 5m 装卸口 ×2 / 侧墙高窗 / 内部办公隔间 / 沿墙直跑楼梯上夹层。
function portWarehouse(x,z,w,d,ry){
const g0=heightAt(x,z);
const H=7.2, t=0.42, mz=3.6;
const L=_cqbL(x,z,ry);
const wallGs=[], upperMeshes=[];
mesh(new THREE.BoxGeometry(w+0.7,1.6,d+0.7),MAT.stone,x,g0-0.8,z,ry,false,true);
const IX=w/2-t, IZ=d/2-t;
// 两端山墙: 5m 装卸大门 + 人员门
_cqbWallOpen(MAT.brick,L,ry,'x', d/2,-w/2,w/2,g0,H,t,[{c:0,w:5.0},{c:-w*0.33,w:1.35}],null,null,null,wallGs);
_cqbWallOpen(MAT.brick,L,ry,'x',-d/2,-w/2,w/2,g0,H,t,[{c:0,w:5.0},{c: w*0.33,w:1.35}],null,null,null,wallGs);
// 侧墙: 高窗(窗台 0.95m) + 一侧人员门
_cqbWallOpen(MAT.brick,L,ry,'z',-w/2,-d/2,d/2,g0,H,t,[{c:d*0.36,w:1.4}],null,[-d*0.3,0,d*0.3],1.9,wallGs);
_cqbWallOpen(MAT.brick,L,ry,'z', w/2,-d/2,d/2,g0,H,t,null,null,[-d*0.3,0,d*0.3],1.9,wallGs);
// 双坡顶(视觉)
{
const cs=Math.cos(ry),sn=Math.sin(ry);
const q=(lx,lz)=>[x+lx*cs+lz*sn, z-lx*sn+lz*cs];
let p=q(-w/4-0.1,0);
const r1=mesh(new THREE.BoxGeometry(w*0.62,0.16,d+0.6),MAT.roof,p[0],g0+H+0.9,p[1],ry); r1.rotation.z=0.52;
p=q(w/4+0.1,0);
const r2=mesh(new THREE.BoxGeometry(w*0.62,0.16,d+0.6),MAT.roof,p[0],g0+H+0.9,p[1],ry); r2.rotation.z=-0.52;
}
// ---- 内部办公隔间(西北角, 带门) ----
const ow=w*0.28, od=d*0.3;
_cqbPartition(L,ry,'z',-IX+ow,-IZ,-IZ+od,g0,mz,[-IZ+od*0.55],wallGs);
_cqbPartition(L,ry,'x',-IZ+od,-IX,-IX+ow,g0,mz,[-IX+ow*0.5],wallGs);
// ---- 夹层货台(北侧一条) + 沿墙直跑楼梯 ----
// 楼梯沿局部 +x 上行, 顶端必须落在货台板内并留出落梯平台 —— 旧版井道越过 mezZ1,
// 顶端落在板外, 玩家从楼梯顶直接掉 2.65m (探针 stairTopGap=-2.65)。
const mezZ1=-IZ+d*0.34;
const shLen=Math.min(5.0, mz/0.72);
const shaft={x0:IX-1.5-shLen, x1:IX-1.5, z0:mezZ1-2.6, z1:mezZ1-0.6};
const hole={x0:shaft.x0,x1:shaft.x1,z0:shaft.z0,z1:shaft.z1};
_cqbSlab(L,ry,{x0:-IX,x1:IX,z0:-IZ,z1:mezZ1},[hole],g0+mz,MAT.wood,0.26,upperMeshes);
_cqbStairShaft(L,ry,shaft,g0,g0+mz,MAT.portSteelDark,'x');
// 夹层临空护栏(沿 mezZ1 边, 楼梯口留缺)
{
const q=L(0,mezZ1);
const rail=solidBox(MAT.portSteel, w-2*t, 1.05, 0.12, q[0], g0+mz+0.52, q[1], ry);
upperMeshes.push(rail);
}
// 货架/货箱: 一层沿墙 + 夹层上
_cqbFurniture(L,ry,w,d,g0,[
[IX-1.6,-IZ+od+2.0,0,'metal'],[IX-1.6,0,0,'wood'],[IX-1.6,IZ-2.2,0,'metal'],
[-IX+1.6,od+3.0,0,'wood'],[-IX+1.6,IZ-3.0,0,'sand'],[0,-IZ+od+1.6,0,'wood']
]);
_cqbFurniture(L,ry,w,d,g0+mz,[
[-IX+2.2,-IZ+1.2,0,'wood'],[IX-6.0,-IZ+1.2,0,'metal']
]);
addCoverAround(x,z,w,d,ry);
_cqbCollapseHook(x,z,g0,wallGs,upperMeshes,0.6);
CQ_BUILDINGS.push({x,z,ry,w,d,floors:2,g0,topY:g0+H,fh:mz,kind:'warehouse',exits:5,shaft});
}
// 港区办公楼: 三层, 底层门厅(正面玻璃幕 + 侧门 + 背门), 独立直跑楼梯井贯通至天台。
function portOffice(x,z,ry){
const g0=heightAt(x,z);
const w=14, d=10, fh=3.2, t=0.36;
const L=_cqbL(x,z,ry);
const wallGs=[], upperMeshes=[];
mesh(new THREE.BoxGeometry(w+0.8,1.4,d+0.8),MAT.stone,x,g0-0.6,z,ry,false,true);
const IX=w/2-t, IZ=d/2-t;
const shW=2.0, shDepth=Math.min(4.8,2*IZ-1.8);
const shX1=IX, shX0=IX-shW, shZ0=-IZ+0.9, shZ1=shZ0+shDepth;
const shaft={x0:shX0,x1:shX1,z0:shZ0,z1:shZ1};
const hole={x0:shX0,x1:shX1,z0:shZ0,z1:shZ1};
// 一层外墙: 正面大玻璃幕(带中门) + 侧门 + 背门
_cqbWallOpen(MAT.portOffice,L,ry,'x', d/2,-w/2,w/2,g0,fh,t,[{c:0,w:2.2}],null,[-w*0.3,w*0.3],2.6,wallGs);
_cqbWallOpen(MAT.portOffice,L,ry,'x',-d/2,-w/2,w/2,g0,fh,t,[{c:-w*0.3,w:1.35}],null,[w*0.28],1.6,wallGs);
_cqbWallOpen(MAT.brick,L,ry,'z',-w/2,-d/2,d/2,g0,fh,t,[{c:d*0.32,w:1.5}],null,[-d*0.3],1.6,wallGs);
_cqbWallOpen(MAT.brick,L,ry,'z', w/2,-d/2,d/2,g0,fh,t,null,null,[-d*0.3,d*0.3],1.6,wallGs);
// 一层门厅 + 前台隔断 + 井道封边
_cqbPartition(L,ry,'x',-IZ*0.35,-IX,shX0,g0,fh,[-w*0.24],wallGs);
_cqbPartition(L,ry,'z',shX0,shZ0,shZ1,g0,fh,null,wallGs);
_cqbFurniture(L,ry,w,d,g0,[
[-IX+1.0,-IZ*0.72,0,'wood'],[-IX+1.0,IZ*0.5,0,'metal'],[-w*0.12,-IZ*0.7,0,'sand']
]);
_cqbStairShaft(L,ry,shaft,g0,g0+fh,MAT.woodDark);
for(let f=2;f<=3;f++){
const by=g0+fh*(f-1);
_cqbSlab(L,ry,{x0:-w/2,x1:w/2,z0:-d/2,z1:d/2},[hole],by,MAT.wood,0.22,upperMeshes);
_cqbWallWins(MAT.portOffice,L,ry,'x', w, d/2,by,fh,t,wallGs,{n:3,winW:2.4});
_cqbWallWins(MAT.portOffice,L,ry,'x', w,-d/2,by,fh,t,wallGs,{n:3,winW:2.0});
_cqbWallWins(MAT.brick,L,ry,'z', d,-w/2,by,fh,t,wallGs,{n:2,winW:1.6});
_cqbWallWins(MAT.brick,L,ry,'z', d, w/2,by,fh,t,wallGs,{n:2,winW:1.6});
_cqbPartition(L,ry,'x',-IZ*0.2,-IX,shX0,by,fh,[-w*0.24],wallGs);
_cqbPartition(L,ry,'z',shX0,shZ0,shZ1,by,fh,null,wallGs);
_cqbShaftRail(L,ry,shaft,by,MAT.metalDark);
_cqbFurniture(L,ry,w,d,by,[
[-IX+1.1,-IZ*0.7,0,'wood'],[-IX+1.1,IZ*0.45,0,'metal'],[-w*0.12,-IZ*0.7,0,'sand']
]);
_cqbStairShaft(L,ry,shaft,g0+fh*(f-1),g0+fh*f,MAT.woodDark);
}
// 天台: 女儿墙 + 井道出口 + 设备
const topY=_cqbRoof(L,ry,w,d,3,fh,g0,[hole],MAT.rubble,upperMeshes);
for(let i=0;i<3;i++){
const [mx,mz]=L(rand(-w/2+1.8,w/2-1.8),rand(-d/2+1.8,d/2-1.8));
mesh(new THREE.CylinderGeometry(0.36,0.36,1.15,9),MAT.metalDark,mx,topY+0.75,mz);
CYLS.push({x:mx,z:mz,r:0.42,y0:topY,y1:topY+1.35});
}
_cqbFurniture(L,ry,w,d,topY,[[-w*0.26,-d*0.28,0,'sand'],[w*0.26,d*0.28,0,'sand']]);
addCoverAround(x,z,w,d,ry);
_cqbCollapseHook(x,z,g0,wallGs,upperMeshes,0.6);
CQ_BUILDINGS.push({x,z,ry,w,d,floors:3,g0,topY,fh,kind:'office',exits:4,shaft});
}

// 油罐区: 圆柱形储罐 + 管道 + 围堰
function portTankFarm(x,z){
const g0=heightAt(x,z);
// 围堰(矮墙)
portWallRun(x-8,z,16,0,1.2,0.4,MAT.portConcrete,g0);
portWallRun(x+8,z,16,0,1.2,0.4,MAT.portConcrete,g0);
portWallRun(x,z-8,16,HPI,1.2,0.4,MAT.portConcrete,g0);
portWallRun(x,z+8,16,HPI,1.2,0.4,MAT.portConcrete,g0);
// 储罐×3
for(const [ox,oz,r] of [[-4,-4,3.2],[4,-4,3.2],[0,4,3.6]]){
const tx=x+ox, tz=z+oz;
const tg0=heightAt(tx,tz);
mesh(new THREE.CylinderGeometry(r,r+0.3,8.5,16),MAT.portTank,tx,tg0+4.25,tz);
CYLS.push({x:tx,z:tz,r:r+0.3,y0:tg0,y1:tg0+8.5});
// 顶部走道
mesh(new THREE.CylinderGeometry(r+0.5,r+0.5,0.15,16),MAT.portSteelDark,tx,tg0+8.6,tz);
}
// 连接管道
for(const [x1,z1,x2,z2] of [[x-4,z-4,x+4,z-4],[x,z+4,x-4,z-4],[x,z+4,x+4,z-4]]){
const mx=(x1+x2)/2, mz=(z1+z2)/2;
const len=Math.hypot(x2-x1,z2-z1);
const ry=Math.atan2(x2-x1,z2-z1);
mesh(new THREE.CylinderGeometry(0.12,0.12,len,8),MAT.portSteel,mx,g0+1.2,mz,ry);
}
// 泵房
solidBox(MAT.portSteelDark,3.0,2.5,2.5,x+10,g0+1.25,z,0);
addCoverAround(x,z,16,16,0);
}
// 集装箱船 (视觉地标, 停在泊位外的水面上)
function portShip(x,z,len){
const g0=heightAt(x,z);
const hullY=g0+3.2;
solidBox(MAT.portHull,20,7.5,len,x,hullY,z,0);
// 艏艉用横向圆柱收窄
mesh(new THREE.CylinderGeometry(6.2,11,7.0,12),MAT.portHull,x,hullY,z+len/2-3,0,false,false).rotation.x=HPI;
mesh(new THREE.CylinderGeometry(7.0,11,7.0,12),MAT.portHull,x,hullY,z-len/2+3,0,false,false).rotation.x=HPI;
// 甲板
mesh(new THREE.BoxGeometry(20.6,0.4,len+0.4),MAT.portSteelDark,x,hullY+3.9,z,0,false,false);
// 甲板集装箱
for(let c=-2;c<=2;c++) for(let r=-2;r<=2;r++){
const ox=r*3.3, oz=c*14;
const lv=1+(Math.abs(r)%2);
for(let i=0;i<lv;i++)
mesh(new THREE.BoxGeometry(2.44,2.6,6.06),(i===0?MAT.containerRust:MAT.containerDoor),x+ox,hullY+4.1+2.6*i+1.3,z+oz,0,false,false);
}
// 舰桥 + 烟囱 + 桅杆
mesh(new THREE.BoxGeometry(17,9,12),MAT.plaster,x,hullY+8.6,z-len/2+16,0,false,false);
mesh(new THREE.BoxGeometry(17.4,1.6,12.4),MAT.portSteelDark,x,hullY+13.4,z-len/2+16,0,false,false);
mesh(new THREE.BoxGeometry(1.4,2.0,12.2),MAT.portGlass,x+8.6,hullY+11.2,z-len/2+16,0,false,false);
mesh(new THREE.CylinderGeometry(2.2,2.6,7,10),MAT.portSteelDark,x,hullY+8,z-len/2+30,0,false,false);
mesh(new THREE.CylinderGeometry(0.14,0.2,12,6),MAT.portSteel,x,hullY+19,z-len/2+16,0,false,false);
mesh(new THREE.BoxGeometry(0.5,0.5,0.5),MAT.portGreen,x,hullY+25.2,z-len/2+16,0,false,false);
}

// =====================================================================
// 2) 主布局
// =====================================================================
function layoutPort(){
// ---- 0) 码头面: 整浇混凝土板 (盖住草地) ----
{
const s=MAP_SIZE-8;
const g=new THREE.PlaneGeometry(s,s); g.rotateX(-HPI);
const floor=new THREE.Mesh(g,MAT.portConcrete);
floor.position.set(0,0.05,0);
floor.receiveShadow=true;
floor.renderOrder=0;
world.add(floor);
}
// ---- 1) 岸线胸墙: 隔开陆地与海 (高出地面 0.9m, 玩家跨不过去) ----
{
const L=PORT_EDGE*2+8;
solidBox(MAT.portCurb,1.5,3.2,L,PORT_QUAY+0.7,-0.7,0,0);
for(let z=-PORT_EDGE+4;z<=PORT_EDGE-4;z+=9){
portBollard(PORT_QUAY-0.1,z);
mesh(new THREE.BoxGeometry(1.6,0.1,0.42),MAT.portWarn,PORT_QUAY+0.5,0.95,z,0,false,false);
}
for(let z=-PORT_EDGE+6;z<=PORT_EDGE-6;z+=14){
mesh(new THREE.BoxGeometry(0.5,0.16,0.5),MAT.portLamp,PORT_QUAY-0.2,1.0,z,0,false,false);
}
}
// ---- 2) 主干道: 8m 宽, 从出生点直通撤离点 ----
// 这是全图最重要的战术轴线, 必须保证完全畅通
{
const roadZ=0;
// 路面铺装
paveStreet(-96,roadZ,PORT_QUAY-2,roadZ,8);
// 主干道 NAV_CLEARS: 每 6m 一个, r=1.8, 确保 Bot 沿主路推进
for(let x=-96;x<=PORT_QUAY-2;x+=6){
NAV_CLEARS.push({x,z:roadZ,r:1.8});
}
// 路缘石
for(let x=-96;x<=PORT_QUAY-2;x+=8){
mesh(new THREE.BoxGeometry(1.2,0.1,0.3),MAT.portCurb,x,heightAt(x,roadZ+4.2)+0.08,roadZ+4.2,0,false,true);
mesh(new THREE.BoxGeometry(1.2,0.1,0.3),MAT.portCurb,x,heightAt(x,roadZ-4.2)+0.08,roadZ-4.2,0,false,true);
}
// 主干道两侧路灯
for(let x=-88;x<=40;x+=24){
portLightTower(x,roadZ+5.5);
portLightTower(x,roadZ-5.5);
}
}
// ---- 3) 集装箱堆场 (主干道以北, x∈[-92,20], z∈[10,90]) ----
// 不规则摆放: 沿斜向通道组织, 形成多条穿插路径
{
const YARD_X=[-92,-70,-48,-26,-4,18];
const YARD_Z=[14,32,50,68,86];
// 堆场通道 (斜向 + 直线)
const yardLanes=[
  // 主斜通道: 从主干道进入堆场深处
  [[-92,14],[18,86]],
  [[-92,50],[18,50]],
  [[-92,86],[18,14]],
  // 横向连接
  [[-70,14],[-70,86]],
  [[-26,14],[-26,86]],
];
// 先铺通道 NAV_CLEARS (保证连通)
for(const [p1,p2] of yardLanes){
portLane(p1[0],p1[1],p2[0],p2[1],1.6,7);
}
// 在通道之间填充集装箱
for(let x=-92;x<=18;x+=2.6){
for(let z=14;z<=86;z+=2.6){
// 检查是否在通道上 (通道附近 3.5m 内不放)
let onLane=false;
for(const [p1,p2] of yardLanes){
const d=distToSeg(x,z,p1[0],p1[1],p2[0],p2[1]);
if(d<3.5){ onLane=true; break; }
}
if(onLane) continue;
// 主干道保护
if(Math.abs(z-0)<10&&x>-96&&x<50) continue;
// 出生点保护
if(Math.hypot(x-CAMPAIGN.bases[0].x,z-CAMPAIGN.bases[0].z)<22) continue;
if(Math.hypot(x-CAMPAIGN.bases[1].x,z-CAMPAIGN.bases[1].z)<22) continue;
// 随机缺口
if(Math.random()<0.22) continue;
// 随机 1~3 层
const lv=Math.random()<0.55?1:(Math.random()<0.8?2:3);
portContainer(x+rand(-0.15,0.15),z+rand(-0.15,0.15),rand(-0.04,0.04),lv,Math.random()<0.5?0:1);
}
}
}
// ---- 4) 仓储区 (主干道以南, x∈[-80,-20], z∈[-80,-15]) ----
{
// 大型仓库×2
portWarehouse(-62,-48,24,18,0.1);
portWarehouse(-38,-32,22,16,-0.15);
// 开敞仓库棚×2
portShed(-46,-72,20,14);
portShed(-30,-58,18,12);
// 仓库区通道
portLane(-80,-40,-20,-40,1.5,8);
portLane(-50,-80,-50,-15,1.5,8);
portLane(-70,-60,-30,-60,1.5,8);
}
// ---- 5) 油罐区 (西南角, x∈[-88,-58], z∈[-88,-58]) ----
{
portTankFarm(-73,-73);
// 油罐区通道
portLane(-88,-73,-58,-73,1.4,6);
portLane(-73,-88,-73,-58,1.4,6);
}
// ---- 6) 办公区 (东南角, x∈[20,50], z∈[-70,-20]) ----
{
portOffice(35,-45,0);
// 办公楼前停车场: 废弃车辆 + 低矮掩体
for(let i=0;i<6;i++){
const x=rand(24,46), z=rand(-65,-25);
if(Math.hypot(x-35,z+45)<18) continue;
if(Math.random()<0.4) wreckCar(x,z,rand(0,TAU));
else if(Math.random()<0.6) crate(x,z,rand(0.9,1.3),rand(0,TAU));
else barrierConcrete(x,z,rand(0,TAU));
}
// 办公区通道
portLane(20,-45,50,-45,1.5,7);
portLane(35,-70,35,-20,1.5,7);
}
// ---- 7) 码头前沿装卸区 (x∈[20,PORT_QUAY], z∈[-90,90]) ----
{
// 待运箱: 沿码头前沿随机摆放
for(let k=0;k<18;k++){
const z=rand(-88,88);
if(Math.abs(z)<14) continue;             // 给撤离区留空
if(Math.random()<0.6) portContainer(PORT_QUAY-8,z,rand(-0.05,0.05),Math.random()<0.7?1:2,Math.random()<0.5?0:1);
else portBollard(PORT_QUAY-6,z);
}
// 前沿 NAV_CLEARS: 保证从堆场到撤离点的通路
portLane(20,-90,20,90,1.6,8);
portLane(20,0,PORT_QUAY-2,0,1.8,6);
}
// ---- 8) 龙门吊 ----
for(const cz of PORT_CRANE_Z) portCrane(46,cz);
// ---- 9) 集装箱船 + 登船舷梯 ----
portShip(76,0,96);
{
const g0=heightAt(PORT_EXT_X,0);
const ramp=mesh(new THREE.BoxGeometry(15,0.3,2.8),MAT.portSteel,PORT_QUAY+4,g0+1.9,0,0,false,false);
ramp.rotation.z=0.15;
mesh(new THREE.BoxGeometry(0.22,1.4,2.8),MAT.portSteelDark,PORT_QUAY+11,g0+2.9,0,0,false,false);
}
// ---- 10) 撤离区 (码头前沿空地) ----
{
const g0=heightAt(PORT_EXT_X,0);
for(let x=PORT_EXT_X-14;x<=PORT_EXT_X+10;x+=3.4)
mesh(new THREE.BoxGeometry(1.6,0.04,9),MAT.portWarn,x,g0+0.09,0,0,false,false);
mesh(new THREE.BoxGeometry(24,0.04,6),MAT.portGreen,PORT_EXT_X-2,g0+0.1,0,0,false,false);
for(const z of [-9,9]) solidBox(MAT.portSteel,26,1.1,0.25,PORT_EXT_X-2,g0+0.55,z,0);
portLightTower(PORT_EXT_X+12,14);
portLightTower(PORT_EXT_X+12,-14);
sandbagWall(PORT_EXT_X-21,7,5,0); sandbagWall(PORT_EXT_X-21,-7,5,0);
barrierConcrete(PORT_EXT_X-27,0,0.2);
}
// ---- 11) 双方出生点: 双层箱堆围成半圈掩体 + 沙袋 (港区不摆野战帐篷) ----
CAMPAIGN.bases.forEach(b=>{
for(let i=0;i<9;i++){
const a=i/9*TAU+0.35;
const r=15+rand(-1.5,1.5);
const x=b.x+Math.sin(a)*r, z=b.z+Math.cos(a)*r;
if(Math.abs(x)>PORT_EDGE-4||Math.abs(z)>PORT_EDGE-4) continue;
// 别堵主干道
if(Math.abs(z)<10&&x>-96&&x<50) continue;
// 别落进建筑里 (仓库/棚/办公楼)
if(portInBuilding(x,z,1.8)) continue;
portContainer(x,z,a,Math.random()<0.5?2:1,Math.random()<0.5?0:1);
}
sandbagWall(b.x+7,b.z+6,5,HPI); sandbagWall(b.x-7,b.z-6,5,HPI);
barrierConcrete(b.x,b.z+11,0); barrierConcrete(b.x,b.z-11,0);
crate(b.x+3,b.z-3,1.2,0.4); barrel(b.x-3,b.z+3);
portLightTower(b.x,b.z-13);
portLightTower(b.x,b.z+13);
// 出生点 NAV_CLEARS: 保证能走出出生区
portLane(b.x,b.z,b.x+20,b.z,1.5,5);
});
// ---- 12) 场地杂物: 废弃卡车 / 货箱 / 碎石堆 (填充通道, 补充掩体) ----
for(let k=0;k<18;k++){
const x=rand(-92,46), z=rand(-96,96);
// 主干道保护
if(Math.abs(z)<10&&x>-96&&x<50) continue;
// 出生点 / 撤离区保护
if(Math.hypot(x-CAMPAIGN.bases[0].x,z-CAMPAIGN.bases[0].z)<24) continue;
if(Math.hypot(x-CAMPAIGN.bases[1].x,z-CAMPAIGN.bases[1].z)<24) continue;
if(Math.hypot(x-PORT_EXT_X,z)<20) continue;
// 堆场通道保护
let onLane=false;
const yardLanes=[
  [[-92,14],[18,86]],[[-92,50],[18,50]],[[-92,86],[18,14]],
  [[-70,14],[-70,86]],[[-26,14],[-26,86]],
];
for(const [p1,p2] of yardLanes){
if(distToSeg(x,z,p1[0],p1[1],p2[0],p2[1])<3.0){ onLane=true; break; }
}
if(onLane) continue;
// 别落进建筑里
if(portInBuilding(x,z,1.8)) continue;
if(Math.random()<0.45) wreckTruck(x,z,rand(0,TAU));
else if(Math.random()<0.6) crate(x,z,rand(0.9,1.4),rand(0,TAU));
else clutterPile(x,z,rand(0,TAU),rand(0.8,1.3));
}
// ---- 13) 物资箱点位 (08_world 的 lootCrate 读取) ----
if(!CAMPAIGN.lootSpots) CAMPAIGN.lootSpots=[];
const spots=CAMPAIGN.lootSpots;
// 大型仓库内 (保税货物 → 高价值)
spots.push({x:-62,z:-48,rich:true});
spots.push({x:-38,z:-32,rich:true});
// 办公楼内 (文件/贵重物品)
spots.push({x:35,z:-45,rich:true});
// 仓库棚内
spots.push({x:-46,z:-72,rich:false});
spots.push({x:-30,z:-58,rich:false});
// 堆场通道旁 (散落货)
for(let k=0;k<7;k++){
const lz=[14,32,50,68,86][randi(0,4)];
const x=rand(-88,16);
if(Math.abs(x-PORT_EXT_X)<16&&Math.abs(lz)<16) continue;
spots.push({x,z:lz+rand(-2.5,2.5),rich:Math.random()<0.35});
}
// 前沿待运箱: 紧挨撤离点 → 高风险高回报
spots.push({x:PORT_EXT_X-10,z:6,rich:true});
spots.push({x:PORT_EXT_X-10,z:-6,rich:true});
spots.push({x:PORT_QUAY-12,z:26,rich:false});
spots.push({x:PORT_QUAY-12,z:-26,rich:false});
}
// 辅助: 点到线段距离 (用于堆场通道检测)
function distToSeg(px,pz,x1,z1,x2,z2){
const dx=x2-x1, dz=z2-z1;
const len2=dx*dx+dz*dz;
if(len2===0) return Math.hypot(px-x1,pz-z1);
let t=((px-x1)*dx+(pz-z1)*dz)/len2;
t=clamp(t,0,1);
return Math.hypot(px-(x1+t*dx),pz-(z1+t*dz));
}
