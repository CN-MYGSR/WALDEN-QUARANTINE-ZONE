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
// ---- 夹层办公室(西北角) ----
const mw=w*0.36, md=d*0.42;
const mx0=-IX, mx1=-IX+mw, mz0=-IZ, mz1=-IZ+md;
const shW=1.7;
const shaft={x0:mx1+0.25, x1:mx1+0.25+shW, z0:mz1-4.3, z1:mz1-4.3+4.3};
_cqbSlab(L,0,{x0:mx0,x1:mx1,z0:mz0,z1:mz1},[],g0+mz,MAT.portSteelDark,0.22,upperMeshes);
// 夹层围栏(面向棚内)
solidBox(MAT.portSteel, mw, 1.05, 0.12, (mx0+mx1)/2, g0+mz+0.52, mz1, 0);
solidBox(MAT.portSteel, 0.12, 1.05, md, mx1, g0+mz+0.52, (mz0+mz1)/2, 0);
// 夹层办公室隔间
_cqbPartition(L,0,'x', mz0+md*0.45, mx0, mx1, g0+mz, 2.6, [ (mx0+mx1)/2 ], wallGs);
// 上夹层的楼梯(独立井道, 落在夹层南侧)
_cqbStairShaft(L,0,shaft,g0,g0+mz,MAT.portSteelDark);
solidBox(MAT.portSteel, 0.12, 1.05, shaft.z1-shaft.z0, shaft.x0, g0+mz+0.52, (shaft.z0+shaft.z1)/2, 0);
// 夹层办公桌
_cqbFurniture(L,0,w,d,g0+mz,[[mx0+1.1,mz0+1.0,0,'metal'],[mx0+2.4,mz1-1.2,0,'wood']]);
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
const mezZ1=-IZ+d*0.34;
const shLen=Math.min(5.4,mz/0.70);
const shaft={x0:IX-shLen, x1:IX, z0:mezZ1+0.5, z1:mezZ1+0.5+2.0};
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
