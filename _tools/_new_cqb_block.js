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
for(const c of (doors||[])) if(c>a0+dw*0.5&&c<a1-dw*0.5) ops.push({c,w:dw,kind:'door'});
for(const c of (wins||[]))  if(c>a0+ww*0.5&&c<a1-ww*0.5) ops.push({c,w:ww,kind:'win'});
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
const q=(axis==='x')?L(o.c,at):L(at,o.c);
NAV_CLEARS.push({x:q[0],z:q[1],r:Math.max(1.0,dw*0.5+0.5)});
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
function _cqbStairShaft(L,ry,shaft,y0,y1,mat){
const cx=(shaft.x0+shaft.x1)/2, cz=(shaft.z0+shaft.z1)/2;
const runW=shaft.x1-shaft.x0, runL=shaft.z1-shaft.z0;
stairFlight(mat, L(cx,cz)[0], L(cx,cz)[1], ry, runW, runL, y0, y1);
return {hole:{x0:shaft.x0,x1:shaft.x1,z0:shaft.z0,z1:shaft.z1}, shaft};
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
_cqbWallOpen(MAT.plaster,L,ry,'z',-w/2,-d/2,d/2,g0,fh,t,[0],[1.9],[d*0.32,-d*0.32],1.4,wallGs);   // 西侧落地破口(中间大开口)
_cqbWallOpen(MAT.plaster,L,ry,'z', w/2,-d/2,d/2,g0,fh,t,null,null,[d*0.3,-d*0.3],1.4,wallGs);
// 内隔断: 走廊两壁 + 西侧横隔断 + 井道封边
_cqbPartition(L,ry,'z',cwX,-IZ,IZ,g0,fh,[IZ*0.5,-IZ*0.5],wallGs);
_cqbPartition(L,ry,'z',ceX,-IZ,-IZ*0.15,g0,fh,[-IZ*0.62],wallGs);
_cqbPartition(L,ry,'x',0,-IX,cwX,g0,fh,[-w*0.28],wallGs);
_cqbPartition(L,ry,'z',shX0,shaftWallZ0,shaftWallZ1,g0,fh,null,wallGs);
// 一层家具(避开门口与梯口)
_cqbFurniture(L,ry,w,d,g0,[
[-w*0.3,IZ*0.55,0,'wood'],[w*0.22,IZ*0.62,0,'sand'],
[-w*0.32,-IZ*0.6,0,'metal'],[(cwX+ceX)/2,-IZ*0.35,0,'sand'],
[shX0-0.75,shZ1+0.55,0,'wood']
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
[-w*0.3,IZ*0.5,0,'wood'],[w*0.3,-IZ*0.55,0,'metal'],
[cwX-0.9,-IZ*0.3,0,'sand']
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
CQ_BUILDINGS.push({x,z,ry,w,d,floors,g0,topY,kind:'apartment',exits:3,shaft:hole});
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
[-w*0.22,pz+1.5,0,'wood'],[w*0.22,pz+1.2,0,'sand'],
[-w*0.2,pz-1.6,0,'metal']
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
[-w*0.2,pz+1.4,0,'wood'],[w*0.24,pz-1.5,0,'sand']
]);
_cqbStairShaft(L,ry,shaft,g0+fh*(f-1),g0+fh*f,MAT.woodDark);
}
const topY=_cqbRoof(L,ry,w,d,floors,fh,g0,[hole],MAT.rubble,upperMeshes);
addCoverAround(x,z,w,d,ry);
_cqbCollapseHook(x,z,g0,wallGs,upperMeshes,0.55);
CQ_BUILDINGS.push({x,z,ry,w,d,floors,g0,topY,kind:'rowhouse',exits:3,shaft:hole});
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
[-w*0.3,IZ*0.35,0,'wood'],[w*0.05,IZ*0.2,0,'wood'],[-w*0.1,-IZ*0.2,0,'metal'],
[-w*0.3,-IZ*0.68,0,'sand'],[shX0-0.8,shZ1+0.5,0,'wood']
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
[-w*0.28,IZ*0.3,0,'wood'],[w*0.1,-IZ*0.3,0,'metal']
]);
_cqbStairShaft(L,ry,shaft,by,by+fh,MAT.woodDark);
const topY=_cqbRoof(L,ry,w,d,2,fh,g0,[hole],MAT.rubble,upperMeshes);
addCoverAround(x,z,w,d,ry);
_cqbCollapseHook(x,z,g0,wallGs,upperMeshes,0.55);
CQ_BUILDINGS.push({x,z,ry,w,d,floors:2,g0,topY,kind:'shopfront',exits:3,shaft:hole});
}
