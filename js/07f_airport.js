'use strict';
// =====================================================================
// 瓦尔登机场 (WALDEN AIRFIELD) —— 地图构建
// 战役: CAMPAIGNS[3] { id:'airport', layout:'airport', terr:'flat', mapSize:260 }
// 加载位置: 07e_port 之后 / 08_world 之前 —— buildWorld() 会调用 layoutAirport()
// ---------------------------------------------------------------------
// 设计: "封锁当天被放弃的国际机场"
//   · 跑道是全场主轴 (x∈[-104,104], z∈[-22,22]) —— 出生点在西, 撤离点在东,
//     必须横穿跑道, 所以开阔地本身既是捷径也是死亡区 (没有掩体)。
//   · 跑道以北: 滑行道 → 停机坪 → 航站楼(3层) + 独立塔台; 以南: 货站 + 油库。
//   · 高价值物资集中在航站楼(值机/安检/行李/办公)与货站 —— 见 43_maps 的机场掉落表。
// 结构:
//   跑道 z∈[-22,22] | 滑行道 z∈[28,38] | 停机坪 z∈[44,70] | 航站楼 (0,88)
//   机库 (-100,86) / (100,86) | 塔台 (70,74) | 货站 (0,-88) | 油库 (-84,-80)
//   出生点 (-112,±46) | 撤离点 (116,0)
// ⚠️ 所有建筑局部坐标必须过 _cqbL(), 否则会飘到地图中央 (历史事故见 07e_port 的夹层围栏)。
// =====================================================================

// ---------- 尺寸常量 ----------
const AP_RW_X=104;        // 跑道东西端 (x)
const AP_RW_Z=22;         // 跑道半宽 (z)
const AP_EDGE=MAP_HALF-10;
const AP_EXT_X=116;       // 撤离点 (与 01_data 的 CAMPAIGN.extract 一致)

// ---------- 材质 ----------
MAT.apConcrete=new THREE.MeshLambertMaterial({map:makeTex(256,256,(g,w,h)=>{
g.fillStyle='#a8aba9'; g.fillRect(0,0,w,h);
g.strokeStyle='#949896'; g.lineWidth=3;
for(let i=0;i<=4;i++){ g.beginPath(); g.moveTo(i*64,0); g.lineTo(i*64,h); g.stroke();
g.beginPath(); g.moveTo(0,i*64); g.lineTo(w,i*64); g.stroke(); }
speckle(g,w,h,240,'#9ca09e','#b6bab8',1,4);
for(let i=0;i<22;i++){
g.fillStyle=`rgba(70,72,74,${rand(0.04,0.14).toFixed(2)})`;
g.beginPath(); g.arc(rand(0,w),rand(0,h),rand(4,24),0,TAU); g.fill();
}
},4,4)});
MAT.apAsphalt=new THREE.MeshLambertMaterial({map:makeTex(256,256,(g,w,h)=>{
g.fillStyle='#3f4246'; g.fillRect(0,0,w,h);
speckle(g,w,h,420,'#484c50','#35383c',1,3);
// 沥青补丁: 跑道常年修补留下的深色条块
for(let i=0;i<26;i++){
g.fillStyle=`rgba(24,26,29,${rand(0.10,0.30).toFixed(2)})`;
g.fillRect(rand(0,w),rand(0,h),rand(10,60),rand(4,18));
}
},6,6)});
MAT.apMark=new THREE.MeshLambertMaterial({color:0xd8d8d2,emissive:0x2a2a26});
MAT.apTaxi=new THREE.MeshLambertMaterial({color:0xc9a22a,emissive:0x2e2408});
MAT.apSteel=new THREE.MeshLambertMaterial({color:0x767b80});
MAT.apSteelDark=new THREE.MeshLambertMaterial({color:0x4e5357});
MAT.apWall=new THREE.MeshLambertMaterial({color:0xc2bcae});
MAT.apWallDark=new THREE.MeshLambertMaterial({color:0x8e8b82});
// 玻璃幕墙: 透明度提高一点 + 自发光调亮 —— 否则正面整面幕墙会糊成一块黑板,
// 建筑轮廓完全看不出来 (2026-09-17 实景截图发现)。
MAT.apGlass=new THREE.MeshLambertMaterial({color:0xc4d6de,emissive:0x2a363c,transparent:true,opacity:0.42,side:THREE.DoubleSide,depthWrite:false});
MAT.apGlassLit=new THREE.MeshLambertMaterial({color:0xd0e0e6,emissive:0x4a5c66,transparent:true,opacity:0.52,side:THREE.DoubleSide,depthWrite:false});
MAT.apLamp=new THREE.MeshLambertMaterial({color:0xffe8b8,emissive:0x8a6a20});
MAT.apWarn=new THREE.MeshLambertMaterial({color:0xd9a12a});
MAT.apRed=new THREE.MeshLambertMaterial({color:0xd85a44,emissive:0x4a1408});
MAT.apGreen=new THREE.MeshLambertMaterial({color:0x9dffb4,emissive:0x1d7a38});
MAT.apTank=new THREE.MeshLambertMaterial({color:0x8a9088});
MAT.apHull=new THREE.MeshLambertMaterial({color:0xb8bcbe});
MAT.apRoof=new THREE.MeshLambertMaterial({color:0x7e8388});

// =====================================================================
// 1) 基础工具
// =====================================================================
// 沿线段登记"保通车道"(NAV_CLEARS): 2m 寻路网格上, 只要有一件掩体落进通道,
// 整条通道就会被切断 (占用盒还有 0.6m 外扩)。主通道必须预先登记。
function apLane(x1,z1,x2,z2,r,step){
const len=Math.hypot(x2-x1,z2-z1);
const n=Math.max(1,Math.round(len/(step||8)));
for(let i=0;i<=n;i++){
const t=i/n;
NAV_CLEARS.push({x:lerp(x1,x2,t),z:lerp(z1,z2,t),r:r||1.6});
}
}
// 建筑占地保护: 散落箱堆/杂物不得落进建筑内部 —— 否则会堵死门洞与梯井
function apInBuilding(x,z,pad){
for(const b of CQ_BUILDINGS){
const dx=x-b.x, dz=z-b.z, c=Math.cos(b.ry), s=Math.sin(b.ry);
const lx=dx*c-dz*s, lz=dx*s+dz*c;
if(Math.abs(lx)<b.w/2+(pad||1.0)&&Math.abs(lz)<b.d/2+(pad||1.0)) return true;
}
return false;
}
// 铺装地面(单块): 机场的跑道/滑行道/停机坪都是整浇板, 直接铺 plane
function apPave(x,z,w,d,y,mat){
const g=new THREE.PlaneGeometry(w,d); g.rotateX(-HPI);
const m=new THREE.Mesh(g,mat);
m.position.set(x,y,z);
m.receiveShadow=true;
world.add(m);
return m;
}
// 跑道标线: 中线虚线段 + 两端"钢琴键"
function apRunwayMarks(){
for(let x=-AP_RW_X+12;x<=AP_RW_X-12;x+=18){
mesh(new THREE.BoxGeometry(9,0.02,0.9),MAT.apMark,x,0.09,0,0,false,true);
}
for(const ex of [-1,1]){
for(let i=-4;i<=4;i++){
mesh(new THREE.BoxGeometry(16,0.02,1.1),MAT.apMark,ex*(AP_RW_X-14),0.09,i*4.0,0,false,true);
}
}
// 跑道边灯
for(let x=-AP_RW_X+6;x<=AP_RW_X-6;x+=22){
for(const sz of [-1,1]){
mesh(new THREE.BoxGeometry(0.5,0.14,0.5),MAT.apMark,x,0.11,sz*(AP_RW_Z+1.2),0,false,true);
}
}
}
// 滑行道引导线(黄)
function apTaxiLine(x1,z1,x2,z2){
const len=Math.hypot(x2-x1,z2-z1);
const m=mesh(new THREE.BoxGeometry(len,0.02,0.5),MAT.apTaxi,(x1+x2)/2,0.09,(z1+z2)/2,Math.atan2(-(z2-z1),x2-x1),false,true);
return m;
}
// 围栏: 立柱 + 铁丝网(半透明), 用来切分区域而不是封死地图
function apFence(x1,z1,x2,z2,mat){
const len=Math.hypot(x2-x1,z2-z1);
const n=Math.max(1,Math.round(len/6));
const ry=Math.atan2(-(z2-z1),x2-x1);
for(let i=0;i<=n;i++){
const t=i/n, x=lerp(x1,x2,t), z=lerp(z1,z2,t);
const g0=heightAt(x,z);
mesh(new THREE.CylinderGeometry(0.07,0.07,2.4,6),MAT.apSteelDark,x,g0+1.2,z);
}
const cx=(x1+x2)/2, cz=(z1+z2)/2, g0=heightAt(cx,cz);
mesh(new THREE.BoxGeometry(len,2.0,0.05),mat||MAT.apGlass,cx,g0+1.3,cz,ry,false,true);
solidBox(MAT.apSteelDark,len,0.16,0.12,cx,g0+2.36,cz,ry);
}
// 高杆灯: 机场的照明塔, 也是开阔地唯一的制高点参照
function apLightMast(x,z,h){
const g0=heightAt(x,z);
mesh(new THREE.CylinderGeometry(0.22,0.3,h,8),MAT.apSteel,x,g0+h/2,z);
const bar=mesh(new THREE.BoxGeometry(3.4,0.2,0.5),MAT.apSteelDark,x,g0+h,z);
mesh(new THREE.BoxGeometry(3.6,0.5,0.7),MAT.apLamp,x,g0+h-0.4,z,0,false,false);
CYLS.push({x,z,r:0.34,y0:g0,y1:g0+h});
}
// 机场座椅排(候机厅/值机厅): 一排金属连排椅
function apSeatRow(L,ry,lx,lz,n){
for(let i=0;i<n;i++){
const [x,z]=L(lx+i*1.15,lz);
const g0=heightAt(x,z);
mesh(new THREE.BoxGeometry(1.0,0.12,0.9),MAT.apSteelDark,x,g0+0.45,z,ry);
mesh(new THREE.BoxGeometry(1.0,0.6,0.12),MAT.apSteel,x,g0+0.75,z-0.4*Math.cos(ry),ry);
CYLS.push({x,z,r:0.5,y0:g0,y1:g0+0.95});
}
}

// =====================================================================
// 2) 建筑原语
// =====================================================================
// 航站楼: 3 层。1F 值机大厅(正面整面玻璃幕 + 三处入口), 2F 安检与候机, 3F 办公。
// 独立直跑楼梯井贯通到天台 —— 天台是俯瞰停机坪的制高点, 但四面无遮, 上去容易挨打。
function apTerminal(x,z,ry){
const g0=heightAt(x,z);
const w=72, d=28, fh=4.0, t=0.42;
const L=_cqbL(x,z,ry);
const wallGs=[], upperMeshes=[];
mesh(new THREE.BoxGeometry(w+0.9,1.6,d+0.9),MAT.stone,x,g0-0.8,z,ry,false,true);
const IX=w/2-t, IZ=d/2-t;
// 楼梯井: 贴东侧端墙, 贯通三层
const shW=2.2, shDepth=Math.min(5.2,2*IZ-2.0);
const shX1=IX, shX0=IX-shW, shZ0=-IZ+1.0, shZ1=shZ0+shDepth;
const shaft={x0:shX0,x1:shX1,z0:shZ0,z1:shZ1};
const hole={x0:shX0,x1:shX1,z0:shZ0,z1:shZ1};
// ---- 1F: 正面(局部 +z, 朝停机坪)整面玻璃幕 + 三处入口 ----
_cqbWallOpen(MAT.apWall,L,ry,'x', d/2,-w/2,w/2,g0,fh,t,
  [{c:-w*0.30,w:2.6},{c:0,w:3.2},{c:w*0.30,w:2.6}],null,
  [-w*0.44,-w*0.16,w*0.16,w*0.44],5.0,wallGs);
// 背面: 行李提取口(大卷帘门) + 两处人员门
_cqbWallOpen(MAT.apWallDark,L,ry,'x',-d/2,-w/2,w/2,g0,fh,t,
  [{c:-w*0.28,w:4.6},{c:w*0.22,w:1.4},{c:w*0.36,w:1.4}],null,
  [-w*0.44,0,w*0.44],4.2,wallGs);
// 两端山墙: 各一处侧门
_cqbWallOpen(MAT.apWall,L,ry,'z',-w/2,-d/2,d/2,g0,fh,t,[{c:d*0.30,w:1.5}],null,[-d*0.28],3.0,wallGs);
_cqbWallOpen(MAT.apWall,L,ry,'z', w/2,-d/2,d/2,g0,fh,t,[{c:-d*0.20,w:1.5}],null,[-d*0.28],3.0,wallGs);
// 1F 内部: 值机岛(两排柜台) + 井道封边
_cqbPartition(L,ry,'z',shX0,shZ0,shZ1,g0,fh,null,wallGs);
_cqbPartition(L,ry,'x',-IZ*0.30,-IX,shX0,g0,fh,[-w*0.22,w*0.10],wallGs);
_cqbFurniture(L,ry,w,d,g0,[
  [-w*0.26,-IZ*0.55,0,'metal'],[-w*0.26,IZ*0.35,0,'metal'],
  [0,-IZ*0.55,0,'metal'],[0,IZ*0.35,0,'metal'],
  [w*0.26,-IZ*0.55,0,'metal'],[w*0.26,IZ*0.35,0,'metal'],
  [-IX+1.2,IZ*0.6,0,'sand'],[IX-2.4,-IZ*0.5,0,'wood']
]);
_cqbStairShaft(L,ry,shaft,g0,g0+fh,MAT.apSteelDark,'x');
// 2F / 3F: 四周留窗, 井道贯通
for(let f=2;f<=3;f++){
const by=g0+fh*(f-1);
_cqbSlab(L,ry,{x0:-w/2,x1:w/2,z0:-d/2,z1:d/2},[hole],by,MAT.apWall,0.24,upperMeshes);
_cqbWallWins(MAT.apGlassLit,L,ry,'x', w, d/2,by,fh,t,wallGs,{n:7,winW:3.4});
_cqbWallWins(MAT.apWallDark,L,ry,'x', w,-d/2,by,fh,t,wallGs,{n:6,winW:2.4});
_cqbWallWins(MAT.apWall,L,ry,'z', d,-w/2,by,fh,t,wallGs,{n:3,winW:2.2});
_cqbWallWins(MAT.apWall,L,ry,'z', d, w/2,by,fh,t,wallGs,{n:3,winW:2.2});
// 内隔断: 候机厅 / 办公区分隔 (留 1.15m 门洞并自动登记 NAV_CLEARS)
_cqbPartition(L,ry,'z',shX0,shZ0,shZ1,by,fh,null,wallGs);
_cqbPartition(L,ry,'x',-IZ*0.15,-IX,shX0,by,fh,[-w*0.30,-w*0.05,w*0.20],wallGs);
_cqbShaftRail(L,ry,shaft,by,MAT.apSteelDark);
_cqbFurniture(L,ry,w,d,by,[
  [-IX+1.1,-IZ*0.62,0,'wood'],[-IX+1.1,IZ*0.42,0,'metal'],
  [-w*0.10,-IZ*0.62,0,'wood'],[w*0.16,IZ*0.42,0,'metal'],
  [w*0.30,-IZ*0.55,0,'sand']
]);
_cqbStairShaft(L,ry,shaft,g0+fh*(f-1),g0+fh*f,MAT.apSteelDark,'x');
}
// 天台: 女儿墙 + 井道出口 + 航障灯
const topY=_cqbRoof(L,ry,w,d,3,fh,g0,[hole],MAT.apRoof,upperMeshes);
for(const [mx,mz] of [[-w*0.4,-d*0.3],[w*0.4,-d*0.3],[-w*0.4,d*0.3],[w*0.4,d*0.3]]){
const [wx,wz]=L(mx,mz);
mesh(new THREE.CylinderGeometry(0.4,0.4,1.2,9),MAT.apSteelDark,wx,topY+0.8,wz);
CYLS.push({x:wx,z:wz,r:0.46,y0:topY,y1:topY+1.4});
}
{
const [wx,wz]=L(0,0);
mesh(new THREE.BoxGeometry(0.5,0.5,0.5),MAT.apRed,wx,topY+1.0,wz,0,false,false);
}
_cqbFurniture(L,ry,w,d,topY,[[-w*0.24,-d*0.26,0,'sand'],[w*0.24,d*0.26,0,'sand']]);
addCoverAround(x,z,w,d,ry);
_cqbCollapseHook(x,z,g0,wallGs,upperMeshes,0.6);
CQ_BUILDINGS.push({x,z,ry,w,d,floors:3,g0,topY,fh,kind:'terminal',exits:7,shaft});
}
// 塔台: 细高柱体 + 顶部玻璃指挥舱。柱体内部是直跑楼梯, 舱内四面环窗(制高点, 但极度暴露)
function apControlTower(x,z){
const g0=heightAt(x,z);
const w=8, d=8, fh=4.2, t=0.4;
const L=_cqbL(x,z,0);
const wallGs=[], upperMeshes=[];
mesh(new THREE.BoxGeometry(w+0.7,1.2,d+0.7),MAT.stone,x,g0-0.6,z,0,false,true);
const IX=w/2-t, IZ=d/2-t;
const shW=1.9, shDepth=Math.min(4.4,2*IZ-1.6);
const shX1=IX-0.3, shX0=shX1-shW, shZ0=-IZ+0.8, shZ1=shZ0+shDepth;
const shaft={x0:shX0,x1:shX1,z0:shZ0,z1:shZ1};
const hole={x0:shX0,x1:shX1,z0:shZ0,z1:shZ1};
// 1F 门厅
_cqbWallOpen(MAT.apWallDark,L,0,'x', d/2,-w/2,w/2,g0,fh,t,[{c:0,w:1.6}],null,[-w*0.28,w*0.28],2.4,wallGs);
_cqbWallOpen(MAT.apWallDark,L,0,'x',-d/2,-w/2,w/2,g0,fh,t,null,null,[0],2.4,wallGs);
_cqbWallOpen(MAT.apWallDark,L,0,'z',-w/2,-d/2,d/2,g0,fh,t,null,null,[0],2.4,wallGs);
_cqbWallOpen(MAT.apWallDark,L,0,'z', w/2,-d/2,d/2,g0,fh,t,null,null,[0],2.4,wallGs);
_cqbStairShaft(L,0,shaft,g0,g0+fh,MAT.apSteelDark,'x');
// 2F 与 3F 是实心柱体(只有楼梯穿过去) —— 用四面实墙 + 楼板
for(let f=2;f<=3;f++){
const by=g0+fh*(f-1);
_cqbSlab(L,0,{x0:-w/2,x1:w/2,z0:-d/2,z1:d/2},[hole],by,MAT.apWallDark,0.26,upperMeshes);
_cqbWallOpen(MAT.apWallDark,L,0,'x', d/2,-w/2,w/2,by,fh,t,null,null,null,null,wallGs);
_cqbWallOpen(MAT.apWallDark,L,0,'x',-d/2,-w/2,w/2,by,fh,t,null,null,null,null,wallGs);
_cqbWallOpen(MAT.apWallDark,L,0,'z',-w/2,-d/2,d/2,by,fh,t,null,null,null,null,wallGs);
_cqbWallOpen(MAT.apWallDark,L,0,'z', w/2,-d/2,d/2,by,fh,t,null,null,null,null,wallGs);
_cqbStairShaft(L,0,shaft,g0+fh*(f-1),g0+fh*f,MAT.apSteelDark,'x');
}
// 顶层指挥舱: 比柱体宽一圈的玻璃环廊
const cabY=g0+fh*3;
{
const cw=w+5.4, cd=d+5.4, ct=0.3;
_cqbSlab(L,0,{x0:-cw/2,x1:cw/2,z0:-cd/2,z1:cd/2},[],cabY,MAT.apRoof,0.3,upperMeshes);
_cqbWallOpen(MAT.apGlassLit,L,0,'x', cd/2,-cw/2,cw/2,cabY,2.9,ct,[{c:0,w:1.4}],null,[-cw*0.30,cw*0.30],2.0,wallGs);
_cqbWallOpen(MAT.apGlassLit,L,0,'x',-cd/2,-cw/2,cw/2,cabY,2.9,ct,null,null,[-cw*0.30,0,cw*0.30],2.0,wallGs);
_cqbWallOpen(MAT.apGlassLit,L,0,'z',-cw/2,-cd/2,cd/2,cabY,2.9,ct,null,null,[-cd*0.28,cd*0.28],2.0,wallGs);
_cqbWallOpen(MAT.apGlassLit,L,0,'z', cw/2,-cd/2,cd/2,cabY,2.9,ct,null,null,[-cd*0.28,cd*0.28],2.0,wallGs);
_cqbRoof(L,0,cw,cd,0,2.9,cabY,[],MAT.apRoof,upperMeshes);
// 顶部旋转雷达 + 航障灯
mesh(new THREE.CylinderGeometry(0.12,0.12,2.2,6),MAT.apSteel,x,cabY+4.3,z);
mesh(new THREE.BoxGeometry(2.6,0.16,0.3),MAT.apSteelDark,x,cabY+5.2,z);
mesh(new THREE.BoxGeometry(0.45,0.45,0.45),MAT.apRed,x,cabY+5.6,z,0,false,false);
}
addCoverAround(x,z,w,d,0);
_cqbCollapseHook(x,z,g0,wallGs,upperMeshes,0.45);
CQ_BUILDINGS.push({x,z,ry:0,w,d,floors:4,g0,topY:cabY+2.9,fh,kind:'tower',exits:1,shaft});
}
// 机库: 大跨度拱顶, 正面是整面推拉大门(留 14m 开口), 侧墙高窗。
// 战术作用: 内部空旷但有两道检修地沟(矮墙)可依托, 是机场唯一能藏载具的室内空间。
function apHangar(x,z,ry){
const g0=heightAt(x,z);
const w=34, d=26, H=11.5, t=0.45;
const L=_cqbL(x,z,ry);
const wallGs=[], upperMeshes=[];
mesh(new THREE.BoxGeometry(w+1.0,1.8,d+1.0),MAT.stone,x,g0-0.9,z,ry,false,true);
const IX=w/2-t, IZ=d/2-t;
// 正面(局部 +z): 14m 大门 + 两侧人员门
_cqbWallOpen(MAT.apSteel,L,ry,'x', d/2,-w/2,w/2,g0,H,t,
  [{c:0,w:14.0},{c:-w*0.40,w:1.5},{c:w*0.40,w:1.5}],null,null,null,wallGs);
// 背面: 三处人员门
_cqbWallOpen(MAT.apSteel,L,ry,'x',-d/2,-w/2,w/2,g0,H,t,
  [{c:-w*0.30,w:1.5},{c:0,w:1.5},{c:w*0.30,w:1.5}],null,null,null,wallGs);
// 侧墙: 高窗(窗台 3.4m, 够不着)
_cqbWallOpen(MAT.apSteel,L,ry,'z',-w/2,-d/2,d/2,g0,H,t,null,null,[-d*0.26,0,d*0.26],3.0,wallGs);
_cqbWallOpen(MAT.apSteel,L,ry,'z', w/2,-d/2,d/2,g0,H,t,null,null,[-d*0.26,0,d*0.26],3.0,wallGs);
// 拱顶(视觉): 两片斜板拼出人字顶
{
const cs=Math.cos(ry), sn=Math.sin(ry);
const q=(lx,lz)=>[x+lx*cs+lz*sn, z-lx*sn+lz*cs];
let p=q(-w/4-0.1,0);
const r1=mesh(new THREE.BoxGeometry(w*0.62,0.2,d+0.8),MAT.apRoof,p[0],g0+H+1.5,p[1],ry); r1.rotation.z=0.34;
p=q(w/4+0.1,0);
const r2=mesh(new THREE.BoxGeometry(w*0.62,0.2,d+0.8),MAT.apRoof,p[0],g0+H+1.5,p[1],ry); r2.rotation.z=-0.34;
}
// 内部: 两道检修地沟(矮墙) + 工作台 + 一架待修机身
for(const lz of [-d*0.20,d*0.20]){
const q=L(0,lz);
solidBox(MAT.apSteelDark,w*0.5,0.9,1.4,q[0],g0+0.45,q[1],ry);
}
_cqbFurniture(L,ry,w,d,g0,[
  [-IX+2.0,-IZ+3.0,0,'metal'],[IX-2.0,-IZ+3.0,0,'metal'],
  [-IX+2.0,IZ-4.0,0,'wood'],[IX-2.0,IZ-4.0,0,'sand']
]);
addCoverAround(x,z,w,d,ry);
_cqbCollapseHook(x,z,g0,wallGs,upperMeshes,0.55);
CQ_BUILDINGS.push({x,z,ry,w,d,floors:1,g0,topY:g0+H,fh:H,kind:'hangar',exits:5,shaft:null});
}
// 货站: 单层大跨度仓储, 两端卷帘门, 内部货架密布 —— 机场电子产品的集散地
function apCargo(x,z,ry){
const g0=heightAt(x,z);
const w=56, d=26, H=7.6, t=0.42;
const L=_cqbL(x,z,ry);
const wallGs=[], upperMeshes=[];
mesh(new THREE.BoxGeometry(w+0.8,1.6,d+0.8),MAT.stone,x,g0-0.8,z,ry,false,true);
const IX=w/2-t, IZ=d/2-t;
// 两端: 5.6m 卷帘门 + 人员门
_cqbWallOpen(MAT.apWallDark,L,ry,'x', d/2,-w/2,w/2,g0,H,t,
  [{c:-w*0.24,w:5.6},{c:w*0.20,w:1.5}],null,[-w*0.42,0,w*0.42],2.6,wallGs);
_cqbWallOpen(MAT.apWallDark,L,ry,'x',-d/2,-w/2,w/2,g0,H,t,
  [{c:w*0.24,w:5.6},{c:-w*0.20,w:1.5}],null,[-w*0.42,0,w*0.42],2.6,wallGs);
// 侧墙: 高窗 + 一处侧门
_cqbWallOpen(MAT.apWall,L,ry,'z',-w/2,-d/2,d/2,g0,H,t,[{c:d*0.30,w:1.5}],null,[-d*0.24,0,d*0.24],2.4,wallGs);
_cqbWallOpen(MAT.apWall,L,ry,'z', w/2,-d/2,d/2,g0,H,t,null,null,[-d*0.24,0,d*0.24],2.4,wallGs);
// 内部分区: 一道纵向隔断把货站切成"收发货"与"存储"两半
_cqbPartition(L,ry,'z',-w*0.10,-IZ,IZ,g0,H,[-d*0.22,d*0.26],wallGs);
_cqbFurniture(L,ry,w,d,g0,[
  [-IX+2.2,-IZ+3.4,0,'metal'],[-IX+2.2,0,0,'metal'],[-IX+2.2,IZ-3.4,0,'metal'],
  [-w*0.30,IZ-3.0,0,'wood'],[-w*0.30,-IZ+3.0,0,'wood'],
  [w*0.16,-IZ+3.0,0,'metal'],[w*0.16,0,0,'metal'],[w*0.16,IZ-3.0,0,'metal'],
  [IX-2.0,-IZ+3.4,0,'sand'],[IX-2.0,IZ-3.4,0,'sand']
]);
// 双坡顶(视觉)
{
const cs=Math.cos(ry), sn=Math.sin(ry);
const q=(lx,lz)=>[x+lx*cs+lz*sn, z-lx*sn+lz*cs];
let p=q(-w/4-0.1,0);
const r1=mesh(new THREE.BoxGeometry(w*0.62,0.18,d+0.6),MAT.apRoof,p[0],g0+H+0.9,p[1],ry); r1.rotation.z=0.46;
p=q(w/4+0.1,0);
const r2=mesh(new THREE.BoxGeometry(w*0.62,0.18,d+0.6),MAT.apRoof,p[0],g0+H+0.9,p[1],ry); r2.rotation.z=-0.46;
}
addCoverAround(x,z,w,d,ry);
_cqbCollapseHook(x,z,g0,wallGs,upperMeshes,0.6);
CQ_BUILDINGS.push({x,z,ry,w,d,floors:1,g0,topY:g0+H,fh:H,kind:'cargo',exits:6,shaft:null});
}
// 油库: 三个卧式储罐 + 围堰 + 泵房
function apFuelFarm(x,z){
const g0=heightAt(x,z);
// 围堰(矮墙, 可当掩体)
for(const [cx,cz,len,ry] of [[x,z-11,26,0],[x,z+11,26,0],[x-13,z,22,HPI],[x+13,z,22,HPI]]){
solidBox(MAT.apConcrete,ry===0?len:0.5,1.15,ry===0?0.5:len,cx,g0+0.58,cz,0);
}
for(let i=-1;i<=1;i++){
const tx=x+i*8.5, tz=z;
const g1=heightAt(tx,tz);
const m=mesh(new THREE.CylinderGeometry(2.5,2.5,11,14),MAT.apTank,tx,g1+2.7,tz,0);
m.rotation.z=HPI;
mesh(new THREE.CylinderGeometry(2.62,2.62,0.4,14),MAT.apWarn,tx,g1+2.7,tz+2.2,0).rotation.z=HPI;
CYLS.push({x:tx,z:tz,r:2.6,y0:g1,y1:g1+5.2});
solidBox(MAT.apSteelDark,1.0,1.0,11.4,tx,g1+0.5,tz,0);
}
// 泵房(小单间, 有门)
{
const px=x+2, pz=z-17, pw=8, pd=6, ph=3.4;
const L=_cqbL(px,pz,0), gs=[], um=[];
mesh(new THREE.BoxGeometry(pw+0.5,0.8,pd+0.5),MAT.stone,px,g0-0.4,pz,0,false,true);
_cqbWallOpen(MAT.apWall,L,0,'x', pd/2,-pw/2,pw/2,g0,ph,0.34,[{c:0,w:1.4}],null,[-pw*0.3,pw*0.3],2.0,gs);
_cqbWallOpen(MAT.apWall,L,0,'x',-pd/2,-pw/2,pw/2,g0,ph,0.34,null,null,[0],2.0,gs);
_cqbWallOpen(MAT.apWall,L,0,'z',-pw/2,-pd/2,pd/2,g0,ph,0.34,null,null,null,null,gs);
_cqbWallOpen(MAT.apWall,L,0,'z', pw/2,-pd/2,pd/2,g0,ph,0.34,null,null,null,null,gs);
_cqbRoof(L,0,pw,pd,1,ph,g0,[],MAT.apRoof,um);
_cqbCollapseHook(px,pz,g0,gs,um,0.4);
CQ_BUILDINGS.push({x:px,z:pz,ry:0,w:pw,d:pd,floors:1,g0,topY:g0+ph,fh:ph,kind:'pump',exits:1,shaft:null});
}
}
// 坠毁的货机: 半截机身横在跑道边, 是开阔地上唯一的大型硬掩体
function apWreckPlane(x,z,ry){
const g0=heightAt(x,z);
const cs=Math.cos(ry), sn=Math.sin(ry);
const q=(lx,lz)=>[x+lx*cs+lz*sn, z-lx*sn+lz*cs];
// 机身: 圆柱 + 断口
const body=mesh(new THREE.CylinderGeometry(2.6,2.6,26,14),MAT.apHull,x,g0+2.4,z,0);
body.rotation.z=HPI; body.rotation.y=ry;
CYLS.push({x,z,r:2.7,y0:g0,y1:g0+5.0});
solidBox(MAT.apHull,26,4.6,5.2,x,g0+2.4,z,ry);
// 机翼: 从机身斜插进地面
for(const s of [-1,1]){
const [wx,wz]=q(0,s*5.5);
const w=mesh(new THREE.BoxGeometry(4.2,0.5,15),MAT.apHull,wx,g0+3.4,wz,ry);
w.rotation.x=s*0.62;
}
// 尾翼残段
const [tx,tz]=q(-15,0);
const tail=mesh(new THREE.BoxGeometry(5.2,4.6,0.5),MAT.apHull,tx,g0+4.4,tz,ry);
tail.rotation.z=0.5;
solidBox(MAT.apSteelDark,3.4,3.0,1.0,tx,g0+3.2,tz,ry);
// 发动机短舱
for(const s of [-1,1]){
const [ex,ez]=q(2.5,s*8.5);
mesh(new THREE.CylinderGeometry(1.5,1.5,4.6,12),MAT.apSteelDark,ex,g0+2.2,ez,0).rotation.z=HPI;
CYLS.push({x:ex,z:ez,r:1.6,y0:g0,y1:g0+4.0});
}
// 残骸周围的散落碎片(视觉)
for(let i=0;i<10;i++){
const [fx,fz]=q(rand(-16,16),rand(-11,11));
const g1=heightAt(fx,fz);
mesh(new THREE.BoxGeometry(rand(0.5,1.6),rand(0.15,0.5),rand(0.4,1.2)),MAT.apSteelDark,fx,g1+0.2,fz,rand(0,TAU),false,true);
}
}

// =====================================================================
// 3) 布局
// =====================================================================
function layoutAirport(){
// ---- 0) 场坪: 整浇混凝土板盖住草地 ----
apPave(0,0,MAP_SIZE-6,MAP_SIZE-6,0.05,MAT.apConcrete);
// ---- 1) 跑道 (主轴) ----
apPave(0,0,AP_RW_X*2,AP_RW_Z*2,0.07,MAT.apAsphalt);
apRunwayMarks();
// 跑道保通: 沿中线登记, 保证 Bot 能横穿
apLane(-AP_RW_X,0,AP_RW_X,0,2.4,10);
// ---- 2) 滑行道 (跑道以北) + 停机坪 ----
apPave(0,33,AP_RW_X*2,10,0.06,MAT.apAsphalt);
apTaxiLine(-AP_RW_X+6,33,AP_RW_X-6,33);
apPave(0,57,132,26,0.06,MAT.apConcrete);
// 停机坪上的引导线(黄, 通往航站楼)
for(const z of [48,66]) apTaxiLine(-58,z,58,z);
// 主通道保通: 出生点 → 停机坪 → 航站楼; 以及横穿跑道 → 撤离点
apLane(-112,-46,-78,-26,1.8,8);
apLane(-112,46,-78,26,1.8,8);
apLane(-78,-26,-78,26,1.8,8);
apLane(-78,0,116,0,2.2,10);
apLane(-60,57,60,57,2.0,10);
apLane(0,57,0,86,2.0,8);
apLane(0,-40,0,-86,2.0,8);
apLane(0,-86,96,-86,2.0,10);
// ---- 3) 高杆灯 (停机坪与跑道两端) ----
for(const [lx,lz] of [[-70,42],[70,42],[-70,72],[70,72],[-96,0],[96,0],[0,-40],[0,40]]){
apLightMast(lx,lz,15);
}
// ---- 4) 航站楼 + 塔台 ----
// 航站楼正面朝南(朝停机坪): ry=PI 时局部 +lz 映射到世界 -z
apTerminal(0,88,Math.PI);
apControlTower(70,74);
// ---- 5) 机库 (东西两侧) ----
apHangar(-100,86,0);
apHangar(100,86,Math.PI);
// ---- 6) 货站 + 油库 (跑道以南) ----
apCargo(0,-88,0);
apFuelFarm(-84,-80);
// ---- 7) 坠毁货机: 横在跑道中段偏东, 提供穿越跑道时的唯一硬掩体 ----
apWreckPlane(34,6,0.42);
// ---- 8) 围栏: 切分停机坪与货站, 但不封死 (留出多个缺口) ----
apFence(-112,-70,-40,-70);
apFence(40,-70,112,-70);
apFence(-112,20,-112,-20);
// ---- 9) 航站楼前广场: 行李推车/隔离栏(散落掩体) ----
for(let i=0;i<14;i++){
const x=rand(-58,58), z=rand(44,70);
if(apInBuilding(x,z,1.6)) continue;
const g0=heightAt(x,z);
if(Math.random()<0.5){
mesh(new THREE.BoxGeometry(0.9,0.9,0.5),MAT.apSteelDark,x,g0+0.45,z,rand(0,TAU));
CYLS.push({x,z,r:0.5,y0:g0,y1:g0+0.9});
}else{
crate(x,z,rand(0.9,1.3),rand(0,TAU));
}
}
// ---- 10) 货运集装箱堆 (货站周边) ----
for(let i=0;i<12;i++){
const x=rand(-96,-30), z=rand(-112,-58);
if(apInBuilding(x,z,1.8)) continue;
portContainer(x,z,rand(0,TAU),Math.random()<0.35?2:1,Math.random()<0.5?1:0);
}
for(let i=0;i<10;i++){
const x=rand(30,96), z=rand(-112,-58);
if(apInBuilding(x,z,1.8)) continue;
portContainer(x,z,rand(0,TAU),1,Math.random()<0.5?1:0);
}
// ---- 11) 物资箱点位 (08_world 的 lootCrate 读取) ----
// 机场的价值集中在"资料与电子产品", 所以高价值箱主要落在航站楼(值机/安检/行李/办公)与货站
if(!CAMPAIGN.lootSpots) CAMPAIGN.lootSpots=[];
const spots=CAMPAIGN.lootSpots;
// 航站楼 1F 值机大厅(柜台后) —— 登机牌/证件/旅客行李
spots.push({x:-20,z:82,rich:true});
spots.push({x:4,z:82,rich:true});
spots.push({x:26,z:82,rich:false});
// 航站楼 1F 行李提取口
spots.push({x:-16,z:96,rich:true});
spots.push({x:14,z:96,rich:false});
// 航站楼 2F 安检与候机(电脑/手机/充电宝)
spots.push({x:-22,z:84,rich:true});
spots.push({x:8,z:84,rich:true});
spots.push({x:30,z:84,rich:false});
// 航站楼 3F 办公层(文件/显卡/服务器)
spots.push({x:-24,z:86,rich:true});
spots.push({x:6,z:86,rich:true});
// 塔台指挥舱
spots.push({x:70,z:74,rich:true});
// 货站(电子产品集散地)
spots.push({x:-20,z:-88,rich:true});
spots.push({x:0,z:-88,rich:true});
spots.push({x:20,z:-88,rich:true});
spots.push({x:-30,z:-80,rich:false});
spots.push({x:30,z:-80,rich:false});
// 机库(维修记录/航材)
spots.push({x:-100,z:86,rich:true});
spots.push({x:100,z:86,rich:false});
// 坠机现场(黑匣子/航电)
spots.push({x:26,z:14,rich:true});
spots.push({x:42,z:-4,rich:false});
// 油库泵房
spots.push({x:-82,z:-97,rich:false});
// 跑道两端的滑行道口(地勤遗落)
spots.push({x:-96,z:33,rich:false});
spots.push({x:96,z:33,rich:true});
// ---- 12) 出生点掩体 (机场不摆野战帐篷, 改用航材箱堆与地勤设备) ----
// 出生点 (-112,±46) 在跑道西端外侧, 是全图最空旷的角落 —— 没有掩体的话
// 开局就会被对面基地架住, 所以两边各堆一组航材箱 + 一段沙袋墙。
for(const b of CAMPAIGN.bases){
const sgn=b.x<0?1:-1;
for(let i=0;i<4;i++){
const x=b.x+sgn*rand(5,14), z=b.z+rand(-9,9);
if(apInBuilding(x,z,1.5)) continue;
if(Math.random()<0.5) portContainer(x,z,rand(0,TAU),1,Math.random()<0.5?1:0);
else crate(x,z,rand(0.9,1.4),rand(0,TAU));
}
sandbagWall(b.x+sgn*11,b.z+7,5,HPI);
sandbagWall(b.x+sgn*11,b.z-7,5,HPI);
barrel(b.x+sgn*6,b.z+10);
barrel(b.x+sgn*6,b.z-10);
apLightMast(b.x+sgn*13,b.z,11);
}
// 撤离点 (116,0) 在跑道东端外侧: 给一点散落掩体, 避免"站在纯空地上读条"
for(let i=0;i<5;i++){
const x=AP_EXT_X+rand(-7,7), z=rand(-9,9);
crate(x,z,rand(0.9,1.3),rand(0,TAU));
}
}

// =====================================================================
// 4) 辅助
// =====================================================================
function apDistToSeg(px,pz,x1,z1,x2,z2){
const dx=x2-x1, dz=z2-z1;
const len2=dx*dx+dz*dz;
if(len2===0) return Math.hypot(px-x1,pz-z1);
let t=((px-x1)*dx+(pz-z1)*dz)/len2;
t=clamp(t,0,1);
return Math.hypot(px-(x1+t*dx),pz-(z1+t*dz));
}
