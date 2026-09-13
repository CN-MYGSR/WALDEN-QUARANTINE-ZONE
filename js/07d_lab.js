'use strict';
// =====================================================================
// 秘密实验室 (SECRET LABORATORY) —— 地图构建
// 战役: CAMPAIGNS[1] { id:'lab', layout:'lab', terr:'flat', mapSize:190 }
// 加载位置: 07c_buildings 之后 / 08_world 之前 —— buildWorld() 会调用 layoutLab()
// ---------------------------------------------------------------------
// 设计目标: "较黑实验室, 压抑"
//   · 全封闭室内设施: 外周高墙 + 房间天花板 → 顶光(太阳)进不来, 房间内只剩环境光
//   · 中央十字大厅是唯一贯通轴线, 顶板刻意留检修口 → 少量光柱, 整体仍是昏的
//   · 冷白应急灯板 / 红色警示灯是场景里唯一的高饱和色 (自发光, 不参与光照计算)
//   · 走廊净宽仅 4.5m, 房间 22.6m 见方却塞满隔断与设备 → 视线被反复截断
//   · 战术后果: 交火距离被压到 10~20m, 走廊转角与门洞是唯一稳定的交火面
// 结构:
//   外周墙(±86) → 十字中央大厅(|x|≤9 或 |z|≤9) → 四象限 × 3×3 = 36 个房间
//     房间类型: 实验区 / 隔离舱 / 机房 / 仓储 / 办公 / 安保 / 动力间 / 医疗
//   北端: 净化闸门撤离舱 (x∈[-8.5,8.5], z∈[60,86]), 撤离灯塔 (0,74)
//   西/东: 双方入口区 (±72,0)
// =====================================================================

// ---------- 尺寸常量 ----------
const LAB_H=4.6;        // 室内净高
const LAB_T=0.45;       // 隔断墙厚
const LAB_DOOR=3.6;     // 门洞净宽 (occupancy 外扩 0.6m/侧后仍有 ~2.4m 净空 → 2m 网格上稳定开 2 格)
const LAB_EDGE=86;      // 外周墙中心线
const LAB_HALL=9;       // 中央大厅半宽 (大厅净宽 18m)
const LAB_COLS=3;       // 每象限 3×3 个房间
const LAB_GAP=4.5;      // 房间之间走廊的净宽
const LAB_EXT_Z=74;     // 撤离灯塔坐标 (与 01_data 的 CAMPAIGN.extract 保持一致)

// =====================================================================
// 1) 材质 / 纹理
// =====================================================================
// 地面: 深色 PVC 地胶 + 分格缝 + 陈年污渍
MAT.labFloor=new THREE.MeshLambertMaterial({map:makeTex(256,256,(g,w,h)=>{
g.fillStyle='#3b4046'; g.fillRect(0,0,w,h);
const n=8,s=w/n;
g.strokeStyle='#2b2f34'; g.lineWidth=2;
for(let i=0;i<=n;i++){
g.beginPath(); g.moveTo(i*s,0); g.lineTo(i*s,h); g.stroke();
g.beginPath(); g.moveTo(0,i*s); g.lineTo(w,i*s); g.stroke();
}
speckle(g,w,h,180,'#24282c','#4a5058',1,4);
for(let i=0;i<26;i++){
g.fillStyle=`rgba(${randi(14,34)},${randi(18,38)},${randi(20,42)},${rand(0.06,0.26).toFixed(2)})`;
g.beginPath(); g.arc(rand(0,w),rand(0,h),rand(4,30),0,TAU); g.fill();
}
for(let i=0;i<22;i++){
g.fillStyle=`rgba(160,170,172,${rand(0.02,0.07).toFixed(2)})`;
g.fillRect(rand(0,w),rand(0,h),rand(6,34),rand(1,3));
}
},30,30)});

// 外周墙 / 隔断: 预制混凝土墙板 (水平板缝 + 水渍垂痕)
MAT.labWall=new THREE.MeshLambertMaterial({map:makeTex(256,256,(g,w,h)=>{
g.fillStyle='#585d63'; g.fillRect(0,0,w,h);
g.fillStyle='#454a50';
for(let i=1;i<4;i++) g.fillRect(0,i*64-1,w,3);
g.fillStyle='#4e5359';
for(let i=1;i<4;i++) g.fillRect(i*64-1,0,2,h);
speckle(g,w,h,150,'#3c4147','#6b7178',1,4);
for(let i=0;i<20;i++){
g.fillStyle=`rgba(36,40,44,${rand(0.05,0.2).toFixed(2)})`;
g.fillRect(rand(0,w),rand(0,h*0.55),rand(2,7),rand(12,66));
}
},2,1)});

// 内墙: 深灰金属墙板 (机房 / 动力间)
MAT.labPanel=new THREE.MeshLambertMaterial({map:makeTex(256,256,(g,w,h)=>{
g.fillStyle='#43484e'; g.fillRect(0,0,w,h);
g.strokeStyle='#383d42'; g.lineWidth=3;
for(let i=0;i<=4;i++){ g.beginPath(); g.moveTo(i*64,0); g.lineTo(i*64,h); g.stroke(); }
g.strokeStyle='#4c5258';
for(let i=0;i<=2;i++){ g.beginPath(); g.moveTo(0,i*128); g.lineTo(w,i*128); g.stroke(); }
speckle(g,w,h,120,'#33383d','#565c62',1,3);
for(let i=0;i<10;i++){
g.fillStyle=`rgba(120,110,80,${rand(0.03,0.1).toFixed(2)})`;
g.fillRect(rand(0,w),rand(0,h),rand(4,20),rand(2,6));
}
},2,2)});

// 天花板: 更暗的吸音板
MAT.labCeil=new THREE.MeshLambertMaterial({map:makeTex(128,128,(g,w,h)=>{
g.fillStyle='#31363b'; g.fillRect(0,0,w,h);
speckle(g,w,h,90,'#252a2e','#3b4045',1,3);
g.strokeStyle='#272c30'; g.lineWidth=2;
for(let i=0;i<=4;i++){
g.beginPath(); g.moveTo(i*32,0); g.lineTo(i*32,h); g.stroke();
g.beginPath(); g.moveTo(0,i*32); g.lineTo(w,i*32); g.stroke();
}
},16,16)});

MAT.labTrim=new THREE.MeshLambertMaterial({color:0x2e3337});                       // 门框 / 踢脚
MAT.labGlass=new THREE.MeshLambertMaterial({color:0x8fc4c0,transparent:true,opacity:0.14,side:THREE.DoubleSide,depthWrite:false});
MAT.labBio=new THREE.MeshLambertMaterial({color:0x7fe8b0,emissive:0x1d6b42,transparent:true,opacity:0.72});
MAT.labLamp=new THREE.MeshLambertMaterial({color:0xe6f4ff,emissive:0x6f9fbf});      // 应急灯板
MAT.labLampCold=new THREE.MeshLambertMaterial({color:0xdff0ff,emissive:0x8fc4e8});  // 冷白工作灯
MAT.labWarn=new THREE.MeshLambertMaterial({color:0xff6a55,emissive:0x8f1c10});      // 警示灯
MAT.labGreen=new THREE.MeshLambertMaterial({color:0x9dffb4,emissive:0x1d7a38});     // 状态/导视灯
MAT.labAmber=new THREE.MeshLambertMaterial({color:0xffd27a,emissive:0x7a5410});
MAT.labHazard=new THREE.MeshLambertMaterial({map:makeTex(64,64,(g,w,h)=>{
g.fillStyle='#b89a1c'; g.fillRect(0,0,w,h);
g.fillStyle='#1b1b1b';
for(let i=-2;i<8;i++){
g.save(); g.translate(i*16,0); g.rotate(-0.7); g.fillRect(0,-48,9,160); g.restore();
}
})});
MAT.labTank=new THREE.MeshLambertMaterial({color:0x9aa4ab});
MAT.labRack=new THREE.MeshLambertMaterial({color:0x24282c});
MAT.labPipe=new THREE.MeshLambertMaterial({color:0x6f767c});
MAT.labCrate=new THREE.MeshLambertMaterial({map:TEX.woodDark,color:0x8e949a});
// 中央大厅地面色块 (共享材质, 避免每个色块各建一份材质导致合批失效)
MAT.labSlabA=new THREE.MeshLambertMaterial({color:0x4e555b});
MAT.labSlabB=new THREE.MeshLambertMaterial({color:0x565d64});
MAT.labSlabG=new THREE.MeshLambertMaterial({color:0x2f6a4e});
MAT.labSlabD=new THREE.MeshLambertMaterial({color:0x33383d});

// CQB 主题已统一压暗过一次; 实验室再叠一层 —— 更冷、更暗、更去饱和
if(THEME.lab){
MAT.brick.color.set(0x6a6f74);
MAT.plaster.color.set(0x71767c);
MAT.stone.color.set(0x5f6469);
MAT.wood.color.set(0x5f574a);
MAT.woodDark.color.set(0x4a443a);
MAT.sandbag.color.set(0x5d5b50);
MAT.rubble.color.set(0x4e5257);
MAT.roof.color.set(0x474d53);
MAT.metalDark.color.set(0x272b2e);
MAT.hedge.color.set(0x30362f);
MAT.concreteBarrier.color.set(0x767c82);
}

// =====================================================================
// 2) 基础建造工具
// =====================================================================
// 沿轴实心墙段: ry=0 → 沿 X 轴; ry=HPI → 沿 Z 轴
function labWallRun(cx,cz,len,ry,h,t,g0,mat){
if(len<=0.05) return;
solidBox(mat||MAT.labWall,len,h,t,cx,g0+h/2,cz,ry);
}
// 带门洞的墙 (门洞居中): 两段墙 + 过梁(高于头顶, 不参与通行) + 金属门框 + 门顶绿灯
function labWallDoor(cx,cz,len,ry,h,t,g0,mat,doorW){
const dw=Math.min(doorW||LAB_DOOR,len-0.5);
const seg=(len-dw)/2;
if(seg<0.45) return labWallRun(cx,cz,len,ry,h,t,g0,mat);
const m=mat||MAT.labWall;
const ax=ry===0?1:0, az=ry===0?0:1;
const o1=len/2-seg/2;
solidBox(m,seg,h,t,cx-ax*o1,g0+h/2,cz-az*o1,ry);
solidBox(m,seg,h,t,cx+ax*o1,g0+h/2,cz+az*o1,ry);
const lh=0.7;   // 过梁底沿距地 h-0.7 ≈ 3.9m, 远高于站立高度
solidBox(m,dw,lh,t,cx,g0+h-lh/2,cz,ry);
solidBox(MAT.labTrim,0.2,h,t+0.16,cx-ax*(dw/2+0.1),g0+h/2,cz-az*(dw/2+0.1),ry);
solidBox(MAT.labTrim,0.2,h,t+0.16,cx+ax*(dw/2+0.1),g0+h/2,cz+az*(dw/2+0.1),ry);
mesh(new THREE.BoxGeometry(ry===0?0.5:0.1,0.1,ry===0?0.1:0.5),MAT.labGreen,cx,g0+h-lh-0.06,cz,0,false,false);
NAV_CLEARS.push({x:cx,z:cz,r:dw*0.44});
return {x:cx,z:cz};
}
function labCeilSlab(cx,cz,w,d,y){
mesh(new THREE.BoxGeometry(w,0.32,d),MAT.labCeil,cx,y,cz,0,false,false);
}
// 灯板 (自发光; 只在局部位置出现 → 全图唯一的亮源)
function labLamp(x,z,y,ry,mat,w){
mesh(new THREE.BoxGeometry(w||1.6,0.1,0.44),mat||MAT.labLamp,x,y,z,ry||0,false,false);
}
// 局部坐标 → 世界坐标
function labAt(x,z,ry,lx,lz){
return [x+lx*Math.cos(ry)+lz*Math.sin(ry), z-lx*Math.sin(ry)+lz*Math.cos(ry)];
}
// 地面警示色块
function labFloorMark(x,z,w,d,mat){
mesh(new THREE.BoxGeometry(w,0.03,d),mat||MAT.labHazard,x,heightAt(x,z)+0.07,z,0,false,false);
}

// ---------- 室内道具 ----------
// 实验台: 柜体 + 不锈钢台面 + 台面杂物
function labBench(x,z,ry){
const g0=heightAt(x,z);
solidBox(MAT.labPanel,2.7,0.86,0.9,x,g0+0.43,z,ry);
mesh(new THREE.BoxGeometry(2.8,0.07,1.0),MAT.labTank,x,g0+0.9,z,ry,false,true);
const a=labAt(x,z,ry,rand(-0.9,0.9),0);
mesh(new THREE.BoxGeometry(0.3,0.32,0.24),MAT.labTrim,a[0],g0+1.09,a[1],rand(0,3),false,false);
const b=labAt(x,z,ry,rand(-0.9,0.9),rand(-0.2,0.2));
mesh(new THREE.CylinderGeometry(0.09,0.11,0.3,8),MAT.labGlass,b[0],g0+1.08,b[1],0,false,false);
}
// 培养舱: 底座 + 玻璃柱 + 自发光培养液
function labTube(x,z){
const g0=heightAt(x,z);
mesh(new THREE.CylinderGeometry(0.72,0.82,0.34,14),MAT.metalDark,x,g0+0.17,z);
mesh(new THREE.CylinderGeometry(0.52,0.52,2.1,14),MAT.labBio,x,g0+1.4,z,0,false,false);
mesh(new THREE.CylinderGeometry(0.58,0.58,2.2,14),MAT.labGlass,x,g0+1.4,z,0,false,false);
mesh(new THREE.CylinderGeometry(0.7,0.7,0.24,14),MAT.metalDark,x,g0+2.56,z);
mesh(new THREE.BoxGeometry(0.16,0.06,0.16),MAT.labGreen,x,g0+2.72,z,0,false,false);
CYLS.push({x,z,r:0.78,y0:g0,y1:g0+2.7});
}
// 玻璃隔离舱 (三面玻璃 + 底台, 正面开口; 舱内有标本台与警示灯)
function labCell(x,z,ry){
const g0=heightAt(x,z);
const w=3.0,d=3.0,h=2.6;
solidBox(MAT.metalDark,w,0.2,d,x,g0+0.1,z,ry);
const back=labAt(x,z,ry,0,d/2);
mesh(new THREE.BoxGeometry(w,h,0.08),MAT.labGlass,back[0],g0+0.2+h/2,back[1],ry,false,false);
const lf=labAt(x,z,ry,-w/2,0);
mesh(new THREE.BoxGeometry(0.08,h,d),MAT.labGlass,lf[0],g0+0.2+h/2,lf[1],ry,false,false);
const rt=labAt(x,z,ry,w/2,0);
mesh(new THREE.BoxGeometry(0.08,h,d),MAT.labGlass,rt[0],g0+0.2+h/2,rt[1],ry,false,false);
const p1=labAt(x,z,ry,-w/2,d/2), p2=labAt(x,z,ry,w/2,d/2);
solidBox(MAT.labTrim,0.18,h,0.18,p1[0],g0+0.2+h/2,p1[1],ry);
solidBox(MAT.labTrim,0.18,h,0.18,p2[0],g0+0.2+h/2,p2[1],ry);
solidBox(MAT.labTrim,w,0.14,0.18,back[0],g0+0.2+h,back[1],ry);
const in1=labAt(x,z,ry,0,-0.3);
mesh(new THREE.BoxGeometry(1.0,0.62,1.9),MAT.labTank,in1[0],g0+0.51,in1[1],ry,false,true);
mesh(new THREE.BoxGeometry(1.05,0.1,1.95),MAT.labBio,in1[0],g0+0.86,in1[1],ry,false,false);
labLamp(back[0],back[1],g0+2.5,ry,MAT.labWarn,0.5);
}
// 服务器机柜 (正面指示灯带)
function labRack(x,z,ry){
const g0=heightAt(x,z);
solidBox(MAT.labRack,0.95,2.05,1.15,x,g0+1.02,z,ry);
for(let i=0;i<4;i++){
const p=labAt(x,z,ry,0,-0.58);
mesh(new THREE.BoxGeometry(0.9,0.09,0.04),i===0?MAT.labGreen:(i===2?MAT.labAmber:MAT.labLampCold),p[0],g0+0.5+i*0.42,p[1],ry,false,false);
}
}
// 铁皮储物柜 (成排)
function labLocker(x,z,ry,count){
const g0=heightAt(x,z);
const n=count||2;
for(let i=0;i<n;i++){
const p=labAt(x,z,ry,(i-(n-1)/2)*1.0,0);
solidBox(MAT.labPanel,0.95,2.0,0.55,p[0],g0+1.0,p[1],ry);
mesh(new THREE.BoxGeometry(0.9,0.06,0.05),MAT.labTrim,p[0],g0+1.62,p[1],ry,false,false);
}
}
// 器材箱堆
function labCrate(x,z,ry,scale){
const s=scale||1, g0=heightAt(x,z);
solidBox(MAT.labCrate,1.15*s,0.72*s,0.85*s,x,g0+0.36*s,z,ry);
if(Math.random()<0.55){
const p=labAt(x,z,ry,rand(-0.35,0.35),rand(-0.25,0.25));
solidBox(MAT.labCrate,0.9*s,0.56*s,0.68*s,p[0],g0+0.72*s+0.28*s,p[1],rand(0,3));
}
}
// 生物废料桶 (黄黑警示 + 红色桶盖)
function labBarrel(x,z){
const g0=heightAt(x,z);
mesh(new THREE.CylinderGeometry(0.36,0.36,0.95,12),MAT.labHazard,x,g0+0.48,z);
mesh(new THREE.CylinderGeometry(0.38,0.38,0.08,12),MAT.labWarn,x,g0+0.94,z,0,false,false);
CYLS.push({x,z,r:0.42,y0:g0,y1:g0+1.0});
}
// 储罐
function labTank(x,z,r,h){
const g0=heightAt(x,z);
const rr=r||1.1, hh=h||2.6;
mesh(new THREE.CylinderGeometry(rr,rr,hh,16),MAT.labTank,x,g0+hh/2,z);
mesh(new THREE.CylinderGeometry(rr*0.35,rr*0.35,0.5,12),MAT.labPipe,x,g0+hh+0.22,z);
mesh(new THREE.CylinderGeometry(rr+0.1,rr+0.1,0.16,16),MAT.metalDark,x,g0+0.08,z);
CYLS.push({x,z,r:rr+0.12,y0:g0,y1:g0+hh+0.4});
}
// 手术床 / 担架
function labGurney(x,z,ry){
const g0=heightAt(x,z);
mesh(new THREE.BoxGeometry(0.95,0.12,2.0),MAT.labTank,x,g0+0.72,z,ry,true,true);
for(const o of [[-0.38,-0.85],[0.38,-0.85],[-0.38,0.85],[0.38,0.85]]){
const p=labAt(x,z,ry,o[0],o[1]);
mesh(new THREE.CylinderGeometry(0.035,0.035,0.72,6),MAT.labTrim,p[0],g0+0.36,p[1]);
}
CYLS.push({x,z,r:0.9,y0:g0,y1:g0+0.8});
}
// 办公桌 + 终端屏
function labDesk(x,z,ry){
const g0=heightAt(x,z);
solidBox(MAT.labPanel,1.9,0.74,0.85,x,g0+0.37,z,ry);
const p=labAt(x,z,ry,0,-0.18);
mesh(new THREE.BoxGeometry(0.62,0.44,0.07),MAT.metalDark,p[0],g0+1.02,p[1],ry,false,false);
mesh(new THREE.BoxGeometry(0.56,0.36,0.02),MAT.labLampCold,p[0],g0+1.04,p[1],ry,false,false);
}
// 档案柜
function labCabinet(x,z,ry){
const g0=heightAt(x,z);
solidBox(MAT.labPanel,1.5,1.5,0.6,x,g0+0.75,z,ry);
mesh(new THREE.BoxGeometry(1.4,0.05,0.05),MAT.labTrim,x,g0+1.1,z,ry,false,false);
}
// 货架 (底层有碰撞, 上层为视觉层板)
function labShelf(x,z,ry){
const g0=heightAt(x,z);
for(let i=0;i<3;i++) mesh(new THREE.BoxGeometry(2.2,0.1,0.7),MAT.labPanel,x,g0+0.6+i*0.72,z,ry,true,true);
for(const lx of [-1.05,1.05]){
const p=labAt(x,z,ry,lx,0);
mesh(new THREE.BoxGeometry(0.1,2.2,0.62),MAT.labTrim,p[0],g0+1.1,p[1],ry);
}
solidBox(MAT.labTrim,2.2,0.9,0.66,x,g0+0.45,z,ry);
CYLS.push({x,z,r:1.3,y0:g0,y1:g0+2.3});
for(let i=0;i<4;i++){
const p=labAt(x,z,ry,rand(-0.9,0.9),rand(-0.2,0.2));
mesh(new THREE.BoxGeometry(rand(0.24,0.45),rand(0.2,0.34),rand(0.2,0.4)),MAT.labCrate,p[0],g0+0.75+randi(0,2)*0.72,p[1],rand(0,3),true,true);
}
}
// 承重柱 (带黄黑警示环)
function labColumn(x,z){
const g0=heightAt(x,z);
solidBox(MAT.labWall,1.0,LAB_H+0.4,1.0,x,g0+(LAB_H+0.4)/2,z,0);
mesh(new THREE.BoxGeometry(1.2,0.16,1.2),MAT.labTrim,x,g0+(LAB_H+0.4)+0.08,z,0,false,false);
mesh(new THREE.BoxGeometry(0.34,0.08,0.34),MAT.labWarn,x,g0+3.0,z,0,false,false);
mesh(new THREE.BoxGeometry(1.06,0.36,1.06),MAT.labHazard,x,g0+0.5,z,0,false,false);
}
// 顶部管道 (沿轴, 含抱箍)
function labPipeRun(x1,z1,x2,z2,y){
const len=Math.hypot(x2-x1,z2-z1);
if(len<0.5) return;
const ry=Math.atan2(-(z2-z1),x2-x1);
const cx=(x1+x2)/2, cz=(z1+z2)/2;
const g=heightAt(cx,cz);
const yy=(y===undefined)?g+LAB_H-0.5:y;
const geo=new THREE.CylinderGeometry(0.16,0.16,len,8);
geo.rotateZ(HPI);
mesh(geo,MAT.labPipe,cx,yy,cz,ry,false,false);
const n=Math.max(2,Math.round(len/6));
for(let i=0;i<n;i++){
const t=(i+0.5)/n;
mesh(new THREE.BoxGeometry(0.34,0.1,0.34),MAT.labTrim,x1+(x2-x1)*t,yy+0.2,z1+(z2-z1)*t,ry,false,false);
}
}
// 通风口 / 导视牌 / 应急喷淋
function labVent(x,z,ry){
const g0=heightAt(x,z);
mesh(new THREE.BoxGeometry(1.1,0.7,0.12),MAT.labTrim,x,g0+3.2,z,ry,false,false);
mesh(new THREE.BoxGeometry(0.95,0.55,0.06),MAT.metalDark,x,g0+3.2,z,ry,false,false);
}
function labSign(x,z,ry,mat){
const g0=heightAt(x,z);
mesh(new THREE.BoxGeometry(1.5,0.34,0.08),mat||MAT.labGreen,x,g0+2.9,z,ry,false,false);
}
function labSprinkler(x,z){
const g0=heightAt(x,z);
mesh(new THREE.CylinderGeometry(0.05,0.05,0.3,6),MAT.labPipe,x,g0+LAB_H-0.2,z);
mesh(new THREE.CylinderGeometry(0.12,0.06,0.1,8),MAT.labTrim,x,g0+LAB_H-0.36,z);
}

// =====================================================================
// 3) 房间生成
// =====================================================================
// 在内缩矩形里随机撒道具; 避开所有门洞 (门口 4.2m 内不放) 与已放道具
function labScatter(cx,cz,halfW,halfD,doors,fn,count,minR){
const placed=[];
for(let k=0;k<count*5&&placed.length<count;k++){
const x=cx+rand(-halfW,halfW), z=cz+rand(-halfD,halfD);
let ok=true;
for(const d of doors){ if(Math.hypot(x-d.x,z-d.z)<(minR||4.2)){ ok=false; break; } }
if(ok) for(const p of placed){ if(Math.hypot(x-p[0],z-p[1])<3.2){ ok=false; break; } }
if(!ok) continue;
placed.push([x,z]);
fn(x,z,rand(0,TAU));
}
return placed;
}
// 单个房间: 地板由整浇底板提供, 这里只造 墙 / 天花板 / 灯 / 内容
function labRoom(cx,cz,w,d,g0,doors,kind){
const h=LAB_H, t=LAB_T;
const x0=cx-w/2, x1=cx+w/2, z0=cz-d/2, z1=cz+d/2;
const mat=(kind==='server'||kind==='machine')?MAT.labPanel:MAT.labWall;
const dpos=[];
if(doors.n){ const p=labWallDoor(cx,z0,w,0,h,t,g0,mat); if(p) dpos.push(p); } else labWallRun(cx,z0,w,0,h,t,g0,mat);
if(doors.s){ const p=labWallDoor(cx,z1,w,0,h,t,g0,mat); if(p) dpos.push(p); } else labWallRun(cx,z1,w,0,h,t,g0,mat);
if(doors.w){ const p=labWallDoor(x0,cz,d,HPI,h,t,g0,mat); if(p) dpos.push(p); } else labWallRun(x0,cz,d,HPI,h,t,g0,mat);
if(doors.e){ const p=labWallDoor(x1,cz,d,HPI,h,t,g0,mat); if(p) dpos.push(p); } else labWallRun(x1,cz,d,HPI,h,t,g0,mat);
// 天花板: 由 layoutLab 的「全设施顶板」统一提供, 这里不再逐间封顶。
// (以前是 Math.random()<0.9 —— 剩下 10% 的房间抬头能直接看到天空, 与「地下三层全封闭设施」的设定冲突)
const roofed=true;
// 灯板: 38% 损坏不亮 —— 制造"有的屋子全黑"的不均匀照明, 这是压抑感的主要来源
const lampN=roofed?randi(2,4):randi(1,3);
for(let i=0;i<lampN;i++){
if(Math.random()<0.38) continue;
const lx=cx+rand(-w*0.3,w*0.3), lz=cz+rand(-d*0.3,d*0.3);
labLamp(lx,lz,g0+(roofed?h-0.06:2.9),rand(0,3),Math.random()<0.12?MAT.labWarn:MAT.labLamp,rand(1.2,2.0));
}
if(roofed) for(let i=0;i<2;i++) labSprinkler(cx+rand(-w*0.3,w*0.3),cz+rand(-d*0.3,d*0.3));
// ---- 房间内容 ----
const hw=w/2-3.4, hd=d/2-3.4;
switch(kind){
case 'lab':
labScatter(cx,cz,hw,hd,dpos,(x,z,r)=>labBench(x,z,r),randi(2,4));
labScatter(cx,cz,hw,hd,dpos,(x,z)=>labTube(x,z),randi(1,3),3.6);
labScatter(cx,cz,hw,hd,dpos,(x,z)=>labGurney(x,z,rand(0,3)),randi(0,2),3.6);
labScatter(cx,cz,hw,hd,dpos,(x,z)=>labBarrel(x,z),randi(0,3),3.2);
break;
case 'contain':
for(let i=-1;i<=1;i++) labCell(cx+i*(w*0.28),cz+rand(-d*0.16,d*0.16),Math.random()<0.5?0:HPI);
labScatter(cx,cz,hw*0.55,hd*0.55,dpos,(x,z)=>labBarrel(x,z),randi(1,3),3.2);
break;
case 'server':
labScatter(cx,cz,hw,hd,dpos,(x,z,r)=>labRack(x,z,r),randi(4,7),3.4);
labPipeRun(cx-w/2+2,cz-d/2+2,cx+w/2-2,cz-d/2+2,g0+3.9);
labPipeRun(cx-w/2+2,cz+d/2-2,cx+w/2-2,cz+d/2-2,g0+3.7);
break;
case 'store':
labScatter(cx,cz,hw,hd,dpos,(x,z,r)=>labShelf(x,z,r),randi(3,5),3.6);
labScatter(cx,cz,hw,hd,dpos,(x,z,r)=>labCrate(x,z,r,rand(0.9,1.3)),randi(2,5),3.2);
labScatter(cx,cz,hw,hd,dpos,(x,z)=>labBarrel(x,z),randi(0,3),3.0);
break;
case 'office':
labScatter(cx,cz,hw,hd,dpos,(x,z,r)=>labDesk(x,z,r),randi(3,5),3.4);
labScatter(cx,cz,hw,hd,dpos,(x,z,r)=>labCabinet(x,z,r),randi(2,4),3.2);
labScatter(cx,cz,hw,hd,dpos,(x,z,r)=>labLocker(x,z,r,randi(2,3)),randi(1,2),3.6);
break;
case 'security':
labScatter(cx,cz,hw,hd,dpos,(x,z,r)=>labLocker(x,z,r,randi(3,4)),randi(2,3),3.6);
labScatter(cx,cz,hw,hd,dpos,(x,z,r)=>labCrate(x,z,r,1.2),randi(2,4),3.2);
labScatter(cx,cz,hw,hd,dpos,(x,z,r)=>sandbagWall(x,z,randi(3,5),r),randi(1,3),3.4);
break;
case 'machine':
labScatter(cx,cz,hw,hd,dpos,(x,z)=>labTank(x,z,rand(0.9,1.5),rand(2.2,3.2)),randi(3,6),3.8);
labScatter(cx,cz,hw,hd,dpos,(x,z)=>labBarrel(x,z),randi(1,3),3.0);
labPipeRun(cx-w/2+2,cz-d/2+2,cx+w/2-2,cz-d/2+2,g0+3.8);
labPipeRun(cx-w/2+2,cz+d/2-2,cx+w/2-2,cz+d/2-2,g0+3.6);
break;
default: // 'med'
labScatter(cx,cz,hw,hd,dpos,(x,z)=>labGurney(x,z,rand(0,3)),randi(3,5),3.4);
labScatter(cx,cz,hw,hd,dpos,(x,z,r)=>labCabinet(x,z,r),randi(2,4),3.2);
labScatter(cx,cz,hw,hd,dpos,(x,z)=>labTube(x,z),randi(0,2),3.6);
break;
}
labVent(cx,z0+0.12,0); labVent(cx,z1-0.12,0);
labVent(x0+0.12,cz,HPI); labVent(x1-0.12,cz,HPI);
return {cx,cz,w,d,kind,doors:dpos,x0,x1,z0,z1};
}
// 撤离舱地面的环形警示灯 (纯装饰; 灯塔本体由 08_world 的 extractionBeacon 建立)
function labWarnRing(x,z){
const g=heightAt(x,z);
for(let i=0;i<16;i++){
const a=i/16*TAU;
mesh(new THREE.BoxGeometry(0.7,0.08,0.28),i%2?MAT.labWarn:MAT.labTrim,x+Math.sin(a)*6.4,g+0.09,z+Math.cos(a)*6.4,a,false,false);
}
}

// =====================================================================
// 4) 主布局
// =====================================================================
function layoutLab(){
// ---- 0) 整浇底板 (覆盖整个设施, 同时遮住草皮地形) ----
{
const s=MAP_SIZE-6;
const g=new THREE.PlaneGeometry(s,s); g.rotateX(-HPI);
const floor=new THREE.Mesh(g,MAT.labFloor);
floor.position.set(0,0.05,0);
floor.receiveShadow=true;
floor.renderOrder=0;
world.add(floor);
}
// ---- 1) 外周墙: 设施与外界彻底隔绝 (四边不留门) ----
{
const L=LAB_EDGE*2+2;
labWallRun(0,-LAB_EDGE,L,0,7.0,1.6,0,MAT.labWall);
labWallRun(0, LAB_EDGE,L,0,7.0,1.6,0,MAT.labWall);
labWallRun(-LAB_EDGE,0,L,HPI,7.0,1.6,0,MAT.labWall);
labWallRun( LAB_EDGE,0,L,HPI,7.0,1.6,0,MAT.labWall);
// 内墙灯带: 远程唯一的方向参照
for(let t=-LAB_EDGE+8;t<LAB_EDGE-8;t+=12){
mesh(new THREE.BoxGeometry(1.4,0.12,0.12),MAT.labGreen,t,3.6,-LAB_EDGE+0.9,0,false,false);
mesh(new THREE.BoxGeometry(1.4,0.12,0.12),MAT.labGreen,t,3.6, LAB_EDGE-0.9,0,false,false);
mesh(new THREE.BoxGeometry(0.12,0.12,1.4),MAT.labGreen,-LAB_EDGE+0.9,3.6,t,0,false,false);
mesh(new THREE.BoxGeometry(0.12,0.12,1.4),MAT.labGreen, LAB_EDGE-0.9,3.6,t,0,false,false);
}
}
// ---- 1.5) 全设施顶板 ----
// 一块同色大板盖住整个设施内部, 保证任何位置抬头都是天花板。
// 背景: 以前是「房间 90% 概率封顶 + 大厅 78% 概率铺板 + 走廊完全露天」三套独立逻辑,
//       地图上因此散布着若干露天缺口, 抬头能看到天空, 与地下设施的设定直接冲突。
// 注意: labCeilSlab 用 castShadow=false —— 顶板不投阴影, 所以不挡主方向光,
//       只负责「看得见天花板」; 室内亮度仍由灯板/环境光决定。
{
const span=(LAB_EDGE+2)*2;
labCeilSlab(0,0,span,span,LAB_H+0.16);
}

// ---- 2) 中央十字大厅 ----
{
const HW=MAP_HALF-8;
// 环氧地坪色块: 与房间的地胶区分, 让玩家在黑暗里仍能认出"我在主通道上"
labFloorMark(0,0,17,HW*2-2,MAT.labSlabA);
labFloorMark(0,0,15,HW*2-4,MAT.labSlabB);
labFloorMark(0,0,HW*2-2,17,MAT.labSlabA);
labFloorMark(0,0,HW*2-4,15,MAT.labSlabB);
for(let t=-HW+6;t<HW-6;t+=8){
labFloorMark(0,t,0.5,3.2);
labFloorMark(t,0,3.2,0.5);
}
// 承重柱
for(let t=-80;t<=80;t+=20){
if(Math.abs(t)<LAB_HALL-3) continue;
labColumn(-4.2,t); labColumn(4.2,t);
labColumn(t,-4.2); labColumn(t,4.2);
}
// 顶部主管道
labPipeRun(0,-84,0,84,3.9);
labPipeRun(-6.4,-84,-6.4,84,4.1);
labPipeRun(6.4,-84,6.4,84,4.1);
labPipeRun(-84,0,84,0,4.0);
// 大厅顶板: 以前是每 12m 一块、22% 概率留检修口 (露出天空)。现在由「全设施顶板」统一覆盖。
// 导视牌
for(let t=-70;t<=70;t+=28){
labSign(0,t+6,HPI,Math.random()<0.3?MAT.labAmber:MAT.labGreen);
labSign(t+6,0,0,Math.random()<0.3?MAT.labAmber:MAT.labGreen);
}
// 地面污渍(纯视觉)
for(let i=0;i<28;i++){
const t=rand(-82,82);
if(Math.random()<0.5) puddle(rand(-7,7),t,rand(0.6,1.6));
else puddle(t,rand(-7,7),rand(0.6,1.6));
}
// 大厅保通 (关键): 十字主轴登记 NAV_CLEARS, 让整个大厅在 2m 寻路网格上必然贯通。
// 大厅净宽虽有 18m, 但承重柱 / 掩体 / 物资箱的占用外扩会在网格上留下"看似能过、实际断点"的缝,
// 长距离 A* 一旦遇到断点就会退化成部分路径 (表现: Bot 只在出生点附近打转)。
// 主轴清除只影响寻路, 不动物理碰撞, 所以画面完全不变。
for(let t=-HW+2;t<=HW-2;t+=4){
NAV_CLEARS.push({x:t,z:0,r:1.4});
NAV_CLEARS.push({x:0,z:t,r:1.4});
}
}
// ---- 3) 四象限房间网格 ----
const WING0=LAB_HALL, WING1=LAB_EDGE;
const SPAN=WING1-WING0;
const CW=(SPAN-(LAB_COLS-1)*LAB_GAP)/LAB_COLS;
const KINDS=['lab','contain','server','store','office','security','machine','med'];
const rooms=[];
for(const sx of [-1,1])for(const sz of [-1,1]){
for(let i=0;i<LAB_COLS;i++)for(let j=0;j<LAB_COLS;j++){
const u0=WING0+i*(CW+LAB_GAP), u1=u0+CW;
const v0=WING0+j*(CW+LAB_GAP), v1=v0+CW;
const cx=sx*(u0+u1)/2, cz=sz*(v0+v1)/2;
const g0=heightAt(cx,cz);
// 门: 朝向大厅的一侧(i/j=0 的内侧)与相邻房间之间的走廊都要开门;
//      贴着外周墙的一侧(i/j=LAB_COLS-1 的外侧)不开门。
const minDoor=true, maxDoor=(i<LAB_COLS-1), maxDoorZ=(j<LAB_COLS-1);
const doors=sx>0
? { w:minDoor, e:maxDoor, n:(sz>0?minDoor:maxDoorZ), s:(sz>0?maxDoorZ:minDoor) }
: { e:minDoor, w:maxDoor, n:(sz>0?minDoor:maxDoorZ), s:(sz>0?maxDoorZ:minDoor) };
const kind=KINDS[randi(0,KINDS.length-1)];
rooms.push(labRoom(cx,cz,CW,CW,g0,doors,kind));
}
}
// ---- 4) 房间之间的走廊: 补充照明 + 掩体 ----
const LANES=[WING0+CW+LAB_GAP/2, WING0+2*CW+LAB_GAP*1.5];
// 走廊保通 (关键): 沿走廊中心线登记 NAV_CLEARS, 保证 2m 寻路网格上始终有一条贯通车道。
// 原因: 走廊净宽只有 4.5m, 一件"居中"道具的碰撞体(再加 0.6m 占用外扩)就足以把整条走廊在网格上切断;
//       而走廊是该象限唯一的纵深通道, 一旦切断, 该象限后两排房间(2/3)全部不可达 ——
//       表现就是 Bot 只在中央大厅与第一排房间活动, 长距离寻路退化成"部分路径"。
for(const g of LANES){
for(let t=WING0;t<=WING1;t+=4){
NAV_CLEARS.push({x:g,z:t,r:0.9});
NAV_CLEARS.push({x:-g,z:t,r:0.9});
NAV_CLEARS.push({x:t,z:g,r:0.9});
NAV_CLEARS.push({x:t,z:-g,r:0.9});
}
}
for(let t=-82;t<=82;t+=14){
if(Math.abs(t)<WING0||Math.abs(t)>WING1) continue;
for(const g of LANES){
labLamp( g,t,LAB_H-0.06,0,MAT.labLamp,1.4);
labLamp(-g,t,LAB_H-0.06,0,MAT.labLamp,1.4);
labLamp(t, g,LAB_H-0.06,HPI,MAT.labLamp,1.4);
labLamp(t,-g,LAB_H-0.06,HPI,MAT.labLamp,1.4);
}
}
// 走廊掩体: 只放小件, 且必须"贴墙"摆放(偏离中心线 ±1.5m)。
// 注意: NAV_CLEARS 只对 solidBox 生效(CYLS 在其之后标记), 所以担架/储罐这类圆柱道具
//       永远不能进走廊 —— 它们会把保通车道重新堵死。
for(let k=0;k<24;k++){
const along=rand(WING0+4,WING1-4);
const acrossLab=LANES[randi(0,1)];
const horiz=Math.random()<0.5;
const sgn=Math.random()<0.5?1:-1;
const off=Math.random()<0.5?-1.5:1.5;
const x=horiz?(acrossLab+off)*sgn:along*(Math.random()<0.5?1:-1);
const z=horiz?along:(acrossLab+off)*sgn;
if(Math.hypot(x,z)>LAB_EDGE-5) continue;
// 只用 solidBox 类道具: NAV_CLEARS 车道清除发生在 solidBox 之后、CYLS 之前,
// 所以 solidBox 掩体一定会被车道清掉, 而 labBarrel/labGurney (CYLS) 会反过来堵死车道。
const rr=Math.random();
if(rr<0.52) labCrate(x,z,rand(0,3),rand(0.85,1.0));
else if(rr<0.8) labCabinet(x,z,rand(0,3));
else labLocker(x,z,rand(0,3),2);
}
// ---- 5) 入口区 (双方出生点): 18m 内保持空旷, 外圈放设备掩体 ----
// 注意: 入口掩体必须避开大厅十字主轴 (z=0 / x=0), 而且只能用 solidBox 类道具 ——
// 圆柱障碍(CYLS)在 buildOccupancy 里标记顺序晚于 NAV_CLEARS, 会把主轴重新堵死。
CAMPAIGN.bases.forEach(b=>{
for(const o of [[0,-8],[0,8],[-9,-6],[9,-6],[-9,6],[9,6],[-7,-7],[7,7],[-7,7],[7,-7]]){
const x=b.x+o[0], z=b.z+o[1];
if(Math.hypot(x,z)<0.5) continue;
const r=Math.random();
if(r<0.34) labCrate(x,z,rand(0,3),1.1);
else if(r<0.62) sandbagWall(x,z,4,rand(0,3));
else labLocker(x,z,rand(0,3),2);
}
labLamp(b.x,b.z-7,LAB_H-0.06,0,MAT.labLampCold,2.2);
labLamp(b.x,b.z+7,LAB_H-0.06,0,MAT.labLampCold,2.2);
labSign(b.x-5,b.z-4,0,MAT.labGreen);
labSign(b.x+5,b.z+4,0,MAT.labGreen);
});
// ---- 6) 北端净化闸门 + 撤离舱 ----
{
const X=8.5;
labWallRun(-X,73,26,HPI,LAB_H+0.6,0.6,0,MAT.labWall);
labWallRun( X,73,26,HPI,LAB_H+0.6,0.6,0,MAT.labWall);
labWallDoor(0,60,X*2,0,LAB_H+0.6,0.6,0,MAT.labWall,6.4);
mesh(new THREE.BoxGeometry(X*2,0.4,26),MAT.labCeil,0,LAB_H+0.6+0.2,73,0,false,false);
// 撤离舱保通: 闸门 → 灯塔的主轴 (闸门净宽只有 0.6m 墙厚, 但两侧消毒储罐会把网格缝掉)
for(let z=58;z<=84;z+=4) NAV_CLEARS.push({x:0,z:z,r:1.7});
// 闸门地面: 黄黑警示 + 净化导引线
for(let z=62;z<=84;z+=4) labFloorMark(0,z,X*2-2,2.0);
labFloorMark(0,73,3.0,22,MAT.labSlabG);
// 两侧消毒设备
for(let z=64;z<=84;z+=6){
labTank(-6.0,z,0.75,2.2);
labTank( 6.0,z,0.75,2.2);
labLamp(-X+0.6,z,3.4,HPI,MAT.labLamp,1.6);
labLamp( X-0.6,z,3.4,HPI,MAT.labLamp,1.6);
}
labWarnRing(0,LAB_EXT_Z);
labFloorMark(0,LAB_EXT_Z,13,13,MAT.labSlabG);
}
// ---- 7) 物资箱点位 (供 08_world 的 lootCrate 使用) ----
// 约 58% 的房间各 1 个; 实验区/机房/安保/动力间为高价值箱 (rich)
if(!CAMPAIGN.lootSpots) CAMPAIGN.lootSpots=[];
const spots=CAMPAIGN.lootSpots;
for(const r of rooms){
if(Math.random()>0.58) continue;
const rich=(r.kind==='lab'||r.kind==='server'||r.kind==='security'||r.kind==='machine');
const half=r.w/2-3.6;
let bx=r.cx+rand(-half,half), bz=r.cz+rand(-half,half);
for(const d of r.doors){ if(Math.hypot(bx-d.x,bz-d.z)<4.6){ bx=r.cx+rand(-2,2); bz=r.cz+rand(-2,2); break; } }
if(Math.hypot(bx,bz)>LAB_EDGE-6) continue;
spots.push({x:bx,z:bz,rich});
}
// 大厅与闸门区的补充箱 (越靠近撤离点越高价值, 也越危险)
for(const o of [[0,44],[0,-44],[44,0],[-44,0],[0,56],[0,-56],[56,0],[-56,0]]) spots.push({x:o[0],z:o[1],rich:true});
spots.push({x:-64,z:6,rich:false});
spots.push({x:64,z:-6,rich:false});
}
