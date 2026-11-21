'use strict';
// ===================== 枪械模型库 (全部独立建模) =====================
// 每把枪独立设计: 独特机匣/枪托/护木/弹匣/机瞄样式, 并输出锚点系统:
// parts.anchors = {
//   ads:{pos,rot}   开镜姿态(照门-准星线精确对准屏幕中心)
//   rHand/lHand     双手常态握持位(握把/护木)
//   magWell         弹匣井(换弹时左手目标)
//   boltHand        拉机柄(拉栓时右手目标)
//   clipSlot        漏夹/桥夹装填口
// }
function bx(mat,w,h,d,x,y,z,g){
const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
m.position.set(x,y,z); if(g) g.add(m); return m;
}
function cyl(mat,r1,r2,h,x,y,z,g,rx=HPI){
const m=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,10),mat);
m.position.set(x,y,z); m.rotation.x=rx; if(g) g.add(m); return m;
}
function ringM(mat,r,t,x,y,z,g){
const m=new THREE.Mesh(new THREE.TorusGeometry(r,t,6,12),mat);
m.position.set(x,y,z); if(g) g.add(m); return m;
}
// 从枪口到枪托的截面依次记录长度位置、相对宽度、下沿和上沿。
// 宽度也随截面变化，木托的收腰与套筒的斜面从射手背后仍然可见。
const GUN_SECTIONS={
  bed:   [[0,.56,.40,.76],[.06,.83,.23,.98],[.32,.93,.10,1],[.69,1,0,.96],[.86,.86,.11,.84],[1,.68,.30,.75]],
  stock: [[0,.55,.44,.78],[.18,.63,.34,.82],[.37,.78,.18,.96],[.56,.98,.06,1],[.94,1,0,.94],[1,.88,.08,.88]],
  grip:  [[0,.46,.19,.77],[.12,.82,.05,.91],[.36,1,0,1],[.74,.95,.06,.96],[.94,.70,.18,.97],[1,.48,.38,.92]],
  upper: [[0,.77,.13,.79],[.07,.94,.06,.96],[.28,1,0,1],[.82,1,0,1],[.96,.93,.07,.96],[1,.72,.16,.79]]
};
const SLIDE_SECTIONS=[[0,.72,.18,.76],[.035,.92,.06,.92],[.12,1,0,1],[.31,1,0,1],
  [.34,.98,0,.94],[.51,.98,0,.94],[.54,1,0,1],[.61,1,0,1]];
for(let i=0;i<6;i++){
  const z=.64+i*.052;
  SLIDE_SECTIONS.push([z,1,0,1],[z+.013,.91,0,.98],[z+.029,1,0,1]);
}
SLIDE_SECTIONS.push([.96,1,0,1],[1,.79,.12,.78]);

function gunLoftVertices(rows,w,h,d,x=0,y=0,z=0){
  const rings=rows.map(([at,width,bottom,top])=>{
    const r=width*w/2, b=(bottom-.5)*h, t=(top-.5)*h, bevel=(t-b)*.19, axis=(at-.5)*d;
    return [[-.64*r,b],[.64*r,b],[r,b+bevel],[r,t-bevel],[.62*r,t],[-.62*r,t],[-r,t-bevel],[-r,b+bevel]]
      .map(([sx,sy])=>[x+sx,y+sy,z+axis]);
  });
  const positions=[];
  for(let i=1;i<rings.length;i++){
    const a=rings[i-1],b=rings[i];
    for(let j=0;j<a.length;j++){
      const next=(j+1)%a.length;
      positions.push(...a[j],...a[next],...b[next], ...a[j],...b[next],...b[j]);
    }
  }
  const front=rings[0],rear=rings[rings.length-1];
  for(let j=1;j<front.length-1;j++){
    positions.push(...front[0],...front[j+1],...front[j], ...rear[0],...rear[j],...rear[j+1]);
  }
  return positions;
}
function gunLoft(rows,mat,w,h,d,x,y,z,parent){
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(gunLoftVertices(rows,w,h,d),3));
  geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,mat);
  mesh.position.set(x,y,z); parent.add(mesh); return mesh;
}
// 侧面轮廓与镂空共享局部坐标，活动部件保留原有动画枢轴。
const GUN_OUTLINES={
  guard:[[0,.35],[.08,.06],[.80,0],[.97,.18],[1,.85],[.93,1],[.08,.96],[0,.77]],
  stock:[[0,.66],[.11,.44],[.36,.40],[.77,.06],[.94,0],[1,.14],[.99,.95],[.86,1],[.38,.93],[0,.89]],
  stockWindow:[[.41,.54],[.68,.58],[.82,.71],[.84,.36],[.76,.27]],
  magazine:[[.36,1],[.98,1],[1,.72],[.89,.44],[.64,.13],[.50,.01],[0,.13],[.11,.31],[.32,.66]],
  frame:[[0,.65],[.04,.35],[.46,.35],[.55,.12],[.76,.11],[.79,.33],[.94,.34],[1,.64],[.96,1],[.04,1]],
  bow:[[0,.8],[.09,.20],[.27,0],[.83,.05],[1,.72],[.92,1],[.04,1]],
  bowWindow:[[.13,.76],[.23,.32],[.33,.22],[.73,.24],[.85,.75]]
};
function gunPanel(outline,mat,w,h,d,x,y,z,parent,holes=[]){
  const points=loop=>loop.map(([sz,sy])=>new THREE.Vector2((sz-.5)*d,(sy-.5)*h));
  const shape=new THREE.Shape(points(outline));
  shape.holes=holes.map(loop=>new THREE.Path(points(loop)));
  const edge=Math.min(.0025,w*.11,h*.08);
  const depth=w-2*edge;
  const geometry=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelThickness:edge,
    bevelSize:edge,bevelOffset:-edge,bevelSegments:1,curveSegments:1});
  geometry.translate(0,0,-depth/2).rotateY(-HPI);
  const mesh=new THREE.Mesh(geometry,mat);
  mesh.position.set(x,y,z); parent.add(mesh); return mesh;
}
function gunVents(count){
  return Array.from({length:count},(_,i)=>{
    const start=.08+.84*i/count,end=start+.62/count;
    return [[start,.48],[start+.018,.35],[end-.018,.35],[end,.48],[end-.018,.63],[start+.018,.63]];
  });
}
function gunRail(group,material,length,center,height){
  const outline=[[0,0],[1,0],[1,.45]];
  const teeth=Math.ceil(length/.025);
  for(let i=teeth-1;i>=0;i--){
    outline.push([(i+.88)/teeth,.45],[(i+.81)/teeth,1],[(i+.20)/teeth,1],[(i+.13)/teeth,.45]);
  }
  outline.push([0,.45]);
  return gunPanel(outline,material,.020,.007,length,0,height,center,group);
}
function pistolFrame(mat,w,h,d,x,y,z,group){
  gunPanel(GUN_OUTLINES.frame,mat,w,h,d,x,y,z,group);
  gunPanel(GUN_OUTLINES.bow,mat,w*.46,h*.88,d*.47,x,y-h*.66,z,group,[GUN_OUTLINES.bowWindow]);
}
function pistolGrip(mat,w,h,d,x,y,z,group){
  const grip=gunLoft(GUN_SECTIONS.grip,vmMats.polymer,w,h,d,x,y,z,group);
  const panel=[[.04,.81],[.14,.18],[.29,.03],[.85,.08],[1,.88],[.80,.98],[.18,1]];
  const grooves=[.24,.43,.62].map(a=>[[.18,a],[.75,a+.10],[.79,a+.16],[.21,a+.06]]);
  gunPanel(panel,mat,w*1.08,h*.81,d*.82,0,-.003,0,grip,grooves);
  return grip;
}
// ---------- 机瞄部件族 ----------
// 每个函数末尾把"准星顶高度"记录进 SIGHT_REC, 供开镜自动校准使用。
// 片状准星 (手枪/冲锋枪)
function sFront_blade(G,m,x,y,z){
gunPanel([[0,0],[1,0],[.78,.24],[.54,.95],[.30,1],[.18,.62]],m,.005,.020,.014,x,y+.010,z,G);
const t=y+.020; SIGHT_REC.front.push(t); SIGHT_REC.frontPos.push({x,y:t,z}); return t;
}
// 麦粒+斜护翼 (毛瑟/中正/三八)
function sFront_wings(G,m,x,y,z){
bx(m,0.005,0.02,0.006, x,y+0.010,z,G);
const l=bx(m,0.004,0.02,0.008, x-0.014,y+0.008,z,G); l.rotation.z=0.42;
const r=bx(m,0.004,0.02,0.008, x+0.014,y+0.008,z,G); r.rotation.z=-0.42;
const t=y+0.018; SIGHT_REC.front.push(t); SIGHT_REC.frontPos.push({x:x,y:t,z:z}); return t;
}
// 带全护罩准星 (M1/91-30/PPSh)
function sFront_hood(G,m,x,y,z){
bx(m,0.005,0.02,0.006, x,y+0.010,z,G);
ringM(m,0.013,0.0022, x,y+0.013,z,G);
const t=y+0.018; SIGHT_REC.front.push(t); SIGHT_REC.frontPos.push({x:x,y:t,z:z}); return t;
}
// 觇孔照门+护耳 (M1系/汤普森)
function sRear_peep(G,m,x,y,z){
const rear=new THREE.Group(); rear.name='rearIron'; G.add(rear);
ringM(m,0.0075,0.0028, x,y+0.014,z,rear);
bx(m,0.0055,0.026,0.014, x-0.0135,y+0.010,z,rear);
bx(m,0.0055,0.026,0.014, x+0.0135,y+0.010,z,rear);
const t=y+0.014; SIGHT_REC.rear.push(t); SIGHT_REC.rearPos.push({x:x,y:t,z:z}); return t;
}
// V型缺口照门片 (毛瑟/莫辛表尺后座)
function sRear_notch(G,m,x,y,z){
const rear=new THREE.Group(); rear.name='rearIron'; G.add(rear);
const notch=[[0,.12],[.12,0],[.88,0],[1,.12],[.96,.69],[.79,1],[.65,1],[.61,.31],
  [.39,.31],[.35,1],[.21,1],[.04,.69]];
gunPanel(notch,m,.008,.014,.035,x,y+.007,z,rear).rotation.y=HPI;
const t=y+0.012; SIGHT_REC.rear.push(t); SIGHT_REC.rearPos.push({x:x,y:t,z:z}); return t;
}
// 弧形表尺底座 (栓动步枪中段)
function sTangent(G,m,x,y,z){
bx(m,0.030,0.006,0.05, x,y,z,G);
const leaf=bx(m,0.026,0.003,0.044, x,y+0.006,z,G); leaf.rotation.x=-0.12;
bx(m,0.028,0.005,0.008, x,y+0.004,z+0.018,G);
}
// 镜片和目镜环共用后缘平面。环壁向枪口收进，不在镜片背后加实心端盖。
function gunEyepiece(group,x,y,z,r){
  const section=[[1.06,-.62],[1.16,-.51],[1.16,-.28],[1.12,-.22],[1.12,-.11],
    [1.09,-.045],[1.04,0],[.975,0],[.96,-.11]];
  const rim=new THREE.Mesh(new THREE.LatheGeometry(section.map(([radius,depth])=>
    new THREE.Vector2(radius*r,depth*r)),64),vmMats.rubber);
  rim.rotation.x=HPI; rim.position.set(x,y,z); group.add(rim);
  const lip=new THREE.Mesh(new THREE.TorusGeometry(r*1.064,r*.015,5,64),vmMats.park);
  lip.position.set(x,y,z-r*.017); group.add(lip);
  group.userData.scopeLens={pos:V3(x,y,z+.0001),r};
}
// 瞄准镜: 返回镜心高度
function scopeTube(G,x,y,z,len=0.13,r=0.019){
const gl=vmMats.gunL, gm=vmMats.gun;
cyl(gl,r,r,len, x,y,z,G);
cyl(gl,r+0.005,r,0.028, x,y,z-len/2-0.008,G);
cyl(gm,0.006,0.006,0.014, x,y+r+0.005,z,G,0);
cyl(gm,0.006,0.006,0.014, x+r+0.005,y,z,G,Math.PI/2).rotation.z=HPI;
bx(gm,0.010,0.024,0.024, x,y-r-0.008,z-len*0.28,G);
bx(gm,0.010,0.024,0.024, x,y-r-0.008,z+len*0.28,G);
// 目镜挂点: 63_scope 在这里贴一块采样镜内 RT 的平面 (枪口朝 -z, 目镜在 +z 侧)
gunEyepiece(G,x,y,z+len/2+.012,r*.86);
return y;
}
// 栓动拉栓组: 返回 {bolt, handle, knobPos}
function boltAssembly(G,x,y,z,bent){
const gl=vmMats.gunL;
const boltG=new THREE.Group(); boltG.position.set(x,y,z); G.add(boltG);
cyl(gl,0.011,0.011,0.1, 0,0,0,boltG);
const handle=new THREE.Group(); boltG.add(handle);
const hh=cyl(gl,0.007,0.007,0.05, 0.024,bent?-0.012:0,0.02,handle,0);
hh.rotation.z=bent?1.15:HPI;
const knob=new THREE.Mesh(new THREE.SphereGeometry(0.0125,8,6),gl);
knob.position.set(bent?0.044:0.048,bent?-0.024:0,0.02); handle.add(knob);
return {bolt:boltG,handle,knob:V3(x+(bent?0.044:0.048),y+(bent?-0.024:0),z+0.02)};
}
function mkAnchors(parts,o){
parts.anchors=Object.assign({
ads:{pos:V3(0,-0.07,-0.3),rot:V3(0,0,0)},
rHand:{pos:V3(0.02,-0.07,0.2),rot:V3(0.32,0,0)},
lHand:{pos:V3(-0.015,-0.075,-0.2),rot:V3(0.28,-0.1,0)},
magWell:null, boltHand:null, clipSlot:null,
},o);
return parts;
}
const ADSROT0=V3(0,0,0);
const CARBINE_SHELLS={
  m4:     {finish:'park',    tip:-.60,nose:-.47,vents:5,butt:.353,window:true, sight:.048},
  hk416:  {finish:'polymer', tip:-.58,nose:-.46,vents:4,butt:.353,window:false,sight:.050},
  qbz191: {finish:'fieldTan',tip:-.62,nose:-.49,vents:3,butt:.314,window:true, sight:.052}
};
function adsFromSight(sx,sy,zoff){ return {pos:V3(-sx,-sy,zoff),rot:ADSROT0}; }
// 机瞄记录器: 各 sFront_*/sRear_* 辅助函数把准星顶高度记到这里,
// 由 buildGunModel 汇总为 parts.sightAnchor, 供 vmEquip 校准 ADS 锚点高度。
// 若不这样做, 手填的 ads 锚点高度与模型实绘准星会差 0.005~0.015,
// 开镜后瞄具偏离屏幕中心(玩家感受为"准星偏低")。
let SIGHT_REC={front:[],rear:[],frontPos:[],rearPos:[]};
function buildGunModel(key){
const modKey=key;
SIGHT_REC={front:[],rear:[],frontPos:[],rearPos:[]};
const dm=WPN_DEFS[key]&&WPN_DEFS[key].model;
if(dm) key=dm;
const G=new THREE.Group();
const parts={gun:G, muzzle:V3(0,0.032,-0.62)};
const wd=vmMats.wood, wdD=vmMats.woodD, gm=vmMats.gun, gl=vmMats.gunL, pk=vmMats.park, bs=vmMats.brass;
// ============ 美军 ============
if(key==='garand'){
// M1 加兰德: 整体木托+上护木, 导气管, 觇孔照门, 漏夹
gunLoft(GUN_SECTIONS.bed,wd,0.052,0.075,0.60, 0,-0.012,-0.10,G);
gunLoft(GUN_SECTIONS.bed,wd,0.048,0.035,0.34, 0,0.043,-0.26,G);
gunLoft(GUN_SECTIONS.stock,wd,0.05,0.1,0.24, 0,-0.06,0.20,G).rotation.x=-0.22;
cyl(pk,0.011,0.011,0.30, 0,0.032,-0.55,G);
cyl(pk,0.009,0.009,0.34, 0,-0.002,-0.52,G);
bx(pk,0.05,0.048,0.24, 0,0.035,0.02,G);
gunLoft(GUN_SECTIONS.upper,pk,0.024,0.02,0.05, 0,0.03,0.15,G);
const fy=sFront_hood(G,pk,0,0.052,-0.685);
const ry2=sRear_peep(G,pk,0,0.048,0.10);
parts.bolt=bx(gl,0.022,0.02,0.09, 0.03,0.045,0.0,G);
parts.clip=bx(bs,0.022,0.05,0.055, 0,0.05,0.0);
parts.clip.visible=false; G.add(parts.clip);
parts.muzzle.set(0,0.032,-0.71);
mkAnchors(parts,{
ads:adsFromSight(0,0.0605,-0.27),
rHand:{pos:V3(0.02,-0.065,0.19),rot:V3(0.32,0,0)},
lHand:{pos:V3(-0.012,-0.07,-0.30),rot:V3(0.28,-0.1,0)},
magWell:V3(0,0.05,0.0), clipSlot:V3(0,0.05,0.0), boltHand:V3(0.045,0.045,0.0),
});
} else if(key==='m1carb'){
// M1 卡宾枪: 短小轻便, 15发直弹匣, 觇孔
gunLoft(GUN_SECTIONS.bed,wd,0.046,0.065,0.46, 0,-0.012,-0.02,G);
gunLoft(GUN_SECTIONS.bed,wd,0.044,0.03,0.24, 0,0.036,-0.15,G);
gunLoft(GUN_SECTIONS.stock,wd,0.046,0.09,0.2, 0,-0.055,0.18,G).rotation.x=-0.2;
cyl(pk,0.009,0.009,0.26, 0,0.03,-0.38,G);
gunLoft(GUN_SECTIONS.upper,pk,0.044,0.04,0.16, 0,0.032,0.05,G);
bx(pk,0.02,0.014,0.05, 0,0.028,0.13,G);
parts.mag=bx(pk,0.022,0.11,0.045, 0,-0.075,-0.05,G);
const fy=sFront_wings(G,pk,0,0.048,-0.49);
sRear_peep(G,pk,0,0.045,0.08);
parts.bolt=bx(gl,0.018,0.016,0.06, 0.028,0.04,0.02,G);
parts.muzzle.set(0,0.03,-0.52);
mkAnchors(parts,{
ads:adsFromSight(0,0.058,-0.26),
rHand:{pos:V3(0.02,-0.06,0.17),rot:V3(0.3,0,0)},
lHand:{pos:V3(-0.012,-0.062,-0.2),rot:V3(0.26,-0.08,0)},
magWell:V3(0,-0.075,-0.05), boltHand:V3(0.04,0.04,0.02),
});
} else if(key==='thompson'){
// 汤普森 M1A1: 方正机匣, 平置护木, 库茨制退器, 觇孔护耳
bx(pk,0.05,0.062,0.32, 0,0.012,-0.06,G);
bx(pk,0.046,0.03,0.06, 0,-0.028,-0.2,G);
cyl(pk,0.0125,0.0125,0.30, 0,0.026,-0.36,G);
cyl(gl,0.019,0.019,0.07, 0,0.026,-0.50,G);
for(let i=0;i<3;i++) bx(gl,0.042,0.004,0.008, 0,0.038,-0.48-i*0.016,G);
gunLoft(GUN_SECTIONS.stock,wd,0.045,0.09,0.2, 0,-0.058,0.20,G).rotation.x=-0.2;
gunLoft(GUN_SECTIONS.grip,wd,0.038,0.075,0.055, 0,-0.062,0.045,G);
gunLoft(GUN_SECTIONS.bed,wd,0.042,0.05,0.14, 0,-0.055,-0.30,G);
parts.mag=bx(pk,0.025,0.15,0.055, 0,-0.10,-0.10,G);
sFront_blade(G,pk,0,0.05,-0.52);
sRear_peep(G,pk,0,0.046,0.06);
parts.bolt=bx(gl,0.016,0.016,0.05, 0.033,0.045,-0.04,G);
parts.muzzle.set(0,0.026,-0.55);
mkAnchors(parts,{
ads:adsFromSight(0,0.058,-0.25),
rHand:{pos:V3(0.02,-0.075,0.12),rot:V3(0.34,0,0)},
lHand:{pos:V3(-0.01,-0.085,-0.28),rot:V3(0.3,-0.08,0)},
magWell:V3(0,-0.10,-0.10), boltHand:V3(0.045,0.045,-0.04),
});
} else if(key==='bar'){
// BAR M1918A2: 厚重机匣, 长枪管+消焰器, 两脚架, 表尺照门
gunLoft(GUN_SECTIONS.bed,wd,0.055,0.075,0.28, 0,-0.008,0.10,G);
bx(pk,0.055,0.062,0.36, 0,0.014,-0.20,G);
bx(pk,0.05,0.03,0.08, 0,-0.03,-0.10,G);
cyl(pk,0.013,0.013,0.42, 0,0.03,-0.56,G);
cyl(gl,0.017,0.014,0.06, 0,0.03,-0.78,G);
gunLoft(GUN_SECTIONS.stock,wd,0.05,0.1,0.2, 0,-0.055,0.26,G).rotation.x=-0.2;
gunLoft(GUN_SECTIONS.bed,wd,0.048,0.045,0.12, 0,-0.02,-0.36,G);
parts.mag=bx(pk,0.028,0.13,0.065, 0,-0.095,-0.14,G);
sFront_wings(G,pk,0,0.052,-0.79);
sRear_notch(G,pk,0,0.052,-0.02);
sTangent(G,pk,0,0.048,-0.05);
cyl(gl,0.007,0.007,0.24, 0.032,-0.05,-0.70,G,0.32);
cyl(gl,0.007,0.007,0.24, -0.032,-0.05,-0.70,G,0.32);
cyl(gl,0.006,0.006,0.03, 0.032,-0.145,-0.795,G,0);
cyl(gl,0.006,0.006,0.03, -0.032,-0.145,-0.795,G,0);
parts.bolt=bx(gl,0.02,0.02,0.06, 0.038,0.028,-0.14,G);
parts.muzzle.set(0,0.03,-0.82);
mkAnchors(parts,{
ads:adsFromSight(0,0.064,-0.26),
rHand:{pos:V3(0.02,-0.06,0.22),rot:V3(0.32,0,0)},
lHand:{pos:V3(-0.012,-0.06,-0.34),rot:V3(0.26,-0.08,0)},
magWell:V3(0,-0.095,-0.14), boltHand:V3(0.05,0.028,-0.14),
});
} else if(key==='springfield'||key==='m1903'){
// 春田 M1903(A4): 细长毛瑟系, A4型装 M73B1 瞄准镜
gunLoft(GUN_SECTIONS.bed,wd,0.048,0.068,0.68, 0,-0.012,-0.12,G);
gunLoft(GUN_SECTIONS.bed,wd,0.046,0.028,0.3, 0,0.036,-0.30,G);
gunLoft(GUN_SECTIONS.stock,wd,0.05,0.098,0.24, 0,-0.056,0.24,G).rotation.x=-0.2;
cyl(gm,0.010,0.010,0.36, 0,0.03,-0.60,G);
gunLoft(GUN_SECTIONS.upper,gm,0.045,0.04,0.2, 0,0.032,0.02,G);
bx(gm,0.05,0.018,0.04, 0,0.006,-0.44,G);
const ba=boltAssembly(G,0.024,0.038,0.06,false);
parts.bolt=ba.bolt; parts.boltHandle=ba.handle;
parts.clip=bx(bs,0.02,0.055,0.05, 0,0.05,0.0);
parts.clip.visible=false; G.add(parts.clip);
let adsA;
if(key==='springfield'){
const sy=scopeTube(G,0,0.088,0.0,0.15,0.017);
adsA=adsFromSight(0,sy,-0.22);
} else {
sFront_blade(G,gm,0,0.052,-0.765);
sRear_peep(G,gm,0,0.05,0.10);
sTangent(G,gm,0,0.044,-0.12);
adsA=adsFromSight(0,0.062,-0.29);
}
parts.muzzle.set(0,0.03,-0.79);
mkAnchors(parts,{
ads:adsA,
rHand:{pos:V3(0.02,-0.06,0.20),rot:V3(0.32,0,0)},
lHand:{pos:V3(-0.012,-0.068,-0.3),rot:V3(0.26,-0.08,0)},
boltHand:ba.knob, clipSlot:V3(0,0.05,0.0), magWell:V3(0,0.05,0.0),
});
} else if(key==='m1911'){
// 柯尔特 M1911: 平直套筒+外露击锤+斜握把
pistolFrame(gm,.034,.045,.176,0,.014,-.002,G);
parts.slide=gunLoft(SLIDE_SECTIONS,gl,0.032,0.03,0.185, 0,0.048,-0.015,G);
bx(gm,0.008,0.016,0.012, 0,0.052,0.085,G).rotation.x=0.5;
pistolGrip(wd,.035,.088,.053,0,-.035,.055,G).rotation.x=-.28;
parts.mag=bx(gm,0.022,0.07,0.034, 0,-0.05,0.045,G);
parts.mag.rotation.x=-0.28;
cyl(gm,.009,.009,.029,0,.046,-.110,G);
sFront_blade(G,gl,0,0.063,-0.095);
sRear_notch(G,gl,0,0.062,0.07);
parts.muzzle.set(0,0.045,-0.13);
mkAnchors(parts,{
ads:adsFromSight(0,0.072,-0.24),
rHand:{pos:V3(0.012,-0.055,0.115),rot:V3(0.25,0,0)},
lHand:{pos:V3(-0.028,-0.075,0.09),rot:V3(0.3,0.25,0)},
magWell:V3(0,-0.05,0.045),
});
} else if(key==='bazooka'||key==='schreck'){
// 反坦克火箭筒 (巴祖卡M9 / 坦克杀手RPzB54)
const isBz=key==='bazooka';
const tubeMat=new THREE.MeshLambertMaterial({color:isBz?0x4a5238:0x52524a});
const tubeR=isBz?0.046:0.056;
cyl(tubeMat,tubeR,tubeR,1.35, 0,0.06,-0.22,G);
cyl(gm,tubeR+0.008,tubeR+0.004,0.07, 0,0.06,-0.86,G);
cyl(gm,tubeR+0.008,tubeR+0.004,0.07, 0,0.06,0.4,G);
if(isBz){
cyl(gm,tubeR+0.014,tubeR+0.002,0.05, 0,0.06,-0.885,G);
bx(gm,0.02,0.012,0.5, 0,-0.0,-0.2,G);
} else {
cyl(gm,tubeR+0.024,tubeR+0.004,0.09, 0,0.06,-0.89,G);
const shield=bx(gl,0.26,0.2,0.012, 0.06,0.01,-0.4,G);
shield.rotation.y=0.06;
}
const sx=-0.052;
bx(gm,0.008,0.034,0.01, sx,0.093,-0.6,G);
bx(gm,0.005,0.028,0.005, sx,0.134,-0.6,G);
bx(gm,0.004,0.04,0.005, sx-0.02,0.135,-0.605,G);
bx(gm,0.004,0.04,0.005, sx+0.02,0.135,-0.605,G);
bx(gm,0.044,0.004,0.005, sx,0.157,-0.605,G);
bx(gm,0.01,0.045,0.012, sx,0.098,0.08,G);
bx(gm,0.004,0.034,0.006, sx-0.017,0.148,0.08,G);
bx(gm,0.004,0.034,0.006, sx+0.017,0.148,0.08,G);
bx(gm,0.038,0.004,0.006, sx,0.167,0.08,G);
bx(gm,0.038,0.004,0.006, sx,0.129,0.08,G);
bx(wd,0.036,0.09,0.05, 0,-0.035,0.1,G).rotation.x=-0.18;
bx(wd,0.036,0.08,0.05, 0,-0.03,-0.18,G).rotation.x=-0.1;
bx(gm,0.028,0.04,0.1, 0,0.005,0.1,G);
bx(gm,0.01,0.03,0.014, 0,-0.015,0.16,G);
const rkt=cyl(vmMats.gunL,0.03,0.014,0.16, 0,0.06,-0.92,G);
parts.rocketTip=rkt;
const rr=new THREE.Group();
const rktMat=new THREE.MeshLambertMaterial({color:0x55603e});
cyl(rktMat,0.026,0.026,0.2, 0,0,0.02,rr);
cyl(vmMats.gunL,0.026,0.003,0.09, 0,0,-0.12,rr);
bx(gm,0.003,0.055,0.05, 0,0,0.13,rr);
bx(gm,0.055,0.003,0.05, 0,0,0.13,rr);
rr.visible=false;
G.add(rr);
parts.reloadRocket=rr;
parts.muzzle.set(0,0.06,-0.95);
mkAnchors(parts,{
ads:{pos:V3(0.052,-0.148,-0.3),rot:ADSROT0},
rHand:{pos:V3(0.01,-0.09,0.16),rot:V3(0.35,0,0)},
lHand:{pos:V3(-0.02,-0.1,-0.12),rot:V3(0.3,-0.05,0)},
});
}
// ============ 原德军枪族 (现归 PMC) ============
else if(key==='kar98'||key==='kar98zf'){
// 毛瑟 Kar98k: 短步枪, 下弯拉机柄, 麦粒护翼准星, 表尺; ZF41 低倍镜
gunLoft(GUN_SECTIONS.bed,wd,0.05,0.07,0.66, 0,-0.012,-0.10,G);
gunLoft(GUN_SECTIONS.bed,wd,0.048,0.028,0.26, 0,0.036,-0.24,G);
gunLoft(GUN_SECTIONS.stock,wd,0.05,0.1,0.24, 0,-0.056,0.24,G).rotation.x=-0.2;
cyl(gm,0.010,0.010,0.34, 0,0.03,-0.57,G);
gunLoft(GUN_SECTIONS.upper,gm,0.046,0.042,0.2, 0,0.03,0.0,G);
bx(gm,0.05,0.02,0.035, 0,0.004,-0.42,G);
cyl(gm,0.005,0.005,0.16, 0,-0.014,-0.63,G);
bx(gm,0.03,0.03,0.02, 0,-0.02,0.36,G);
const ba=boltAssembly(G,0.024,0.038,0.05,true);
parts.bolt=ba.bolt; parts.boltHandle=ba.handle;
parts.clip=bx(bs,0.02,0.055,0.05, 0,0.05,0.0);
parts.clip.visible=false; G.add(parts.clip);
sFront_wings(G,gm,0,0.05,-0.72);
let adsA;
if(key==='kar98zf'){
const sy=scopeTube(G,0,0.086,0.02,0.11,0.015);
adsA=adsFromSight(0,sy,-0.22);
} else {
sRear_notch(G,gm,0,0.048,-0.14);
sTangent(G,gm,0,0.043,-0.17);
adsA=adsFromSight(0,0.059,-0.30);
}
parts.muzzle.set(0,0.03,-0.75);
mkAnchors(parts,{
ads:adsA,
rHand:{pos:V3(0.02,-0.06,0.20),rot:V3(0.32,0,0)},
lHand:{pos:V3(-0.012,-0.068,-0.28),rot:V3(0.26,-0.08,0)},
boltHand:ba.knob, clipSlot:V3(0,0.05,0.0), magWell:V3(0,0.05,0.0),
});
} else if(key==='g33'){
// G33/40 山地骑枪: 更短的毛瑟, 大孔背带槽
gunLoft(GUN_SECTIONS.bed,wd,0.05,0.07,0.54, 0,-0.012,-0.05,G);
gunLoft(GUN_SECTIONS.bed,wd,0.048,0.026,0.2, 0,0.035,-0.17,G);
gunLoft(GUN_SECTIONS.stock,wd,0.05,0.098,0.22, 0,-0.055,0.22,G).rotation.x=-0.2;
cyl(gm,0.010,0.010,0.28, 0,0.03,-0.44,G);
gunLoft(GUN_SECTIONS.upper,gm,0.046,0.042,0.18, 0,0.03,0.02,G);
bx(gm,0.05,0.018,0.03, 0,0.004,-0.32,G);
const ba=boltAssembly(G,0.024,0.038,0.06,true);
parts.bolt=ba.bolt; parts.boltHandle=ba.handle;
parts.clip=bx(bs,0.02,0.055,0.05, 0,0.05,0.01);
parts.clip.visible=false; G.add(parts.clip);
sFront_wings(G,gm,0,0.048,-0.56);
sRear_notch(G,gm,0,0.047,-0.10);
sTangent(G,gm,0,0.042,-0.13);
parts.muzzle.set(0,0.03,-0.59);
mkAnchors(parts,{
ads:adsFromSight(0,0.057,-0.29),
rHand:{pos:V3(0.02,-0.06,0.19),rot:V3(0.32,0,0)},
lHand:{pos:V3(-0.012,-0.066,-0.24),rot:V3(0.26,-0.08,0)},
boltHand:ba.knob, clipSlot:V3(0,0.05,0.01), magWell:V3(0,0.05,0.01),
});
} else if(key==='mp40'){
// MP40: 冲压机匣, 胶木护木, 折叠托, 树脂托座, 前伸弹匣井
bx(gm,0.042,0.052,0.26, 0,0.012,-0.05,G);
cyl(gm,0.011,0.011,0.26, 0,0.024,-0.32,G);
cyl(gm,0.0145,0.013,0.03, 0,0.024,-0.455,G);
gunLoft(GUN_SECTIONS.bed,vmMats.bakelite,0.044,0.055,0.1, 0,-0.008,0.075,G);
gunLoft(GUN_SECTIONS.grip,vmMats.bakelite,0.036,0.07,0.05, 0,-0.058,0.10,G).rotation.x=-0.15;
// 折叠托(展开): 两根杆+肩板
cyl(gl,0.006,0.006,0.22, 0.018,0.006,0.24,G);
cyl(gl,0.006,0.006,0.22, -0.018,0.006,0.24,G);
bx(gl,0.05,0.06,0.014, 0,-0.01,0.355,G);
// 弹匣井+长弹匣
bx(gm,0.028,0.05,0.06, 0,-0.045,-0.13,G);
parts.mag=bx(gm,0.021,0.15,0.05, 0,-0.125,-0.13,G);
bx(gm,0.02,0.014,0.03, 0,-0.006,-0.44,G); // 枪管下挂钩
sFront_hood(G,gm,0,0.043,-0.45);
sRear_notch(G,gm,0,0.042,-0.02);
parts.bolt=bx(gl,0.014,0.014,0.045, -0.028,0.026,-0.10,G);
parts.muzzle.set(0,0.024,-0.48);
mkAnchors(parts,{
ads:adsFromSight(0,0.052,-0.25),
rHand:{pos:V3(0.018,-0.075,0.13),rot:V3(0.34,0,0)},
lHand:{pos:V3(-0.012,-0.10,-0.125),rot:V3(0.4,0,0)},
magWell:V3(0,-0.125,-0.13), boltHand:V3(-0.04,0.026,-0.10),
});
} else if(key==='stg44'){
// STG44: 冲压长机匣, 高耸准星座, 弯弹匣, 木托
bx(gm,0.048,0.06,0.34, 0,0.008,-0.10,G);
bx(gm,0.05,0.028,0.12, 0,-0.032,-0.02,G);
cyl(gm,0.012,0.012,0.24, 0,0.028,-0.39,G);
cyl(gm,0.010,0.008,0.03, 0,0.028,-0.525,G);
gunLoft(GUN_SECTIONS.stock,wd,0.045,0.085,0.2, 0,-0.045,0.24,G).rotation.x=-0.12;
gunLoft(GUN_SECTIONS.grip,vmMats.bakelite,0.038,0.075,0.055, 0,-0.068,0.06,G).rotation.x=-0.1;
bx(gm,0.03,0.032,0.09, 0,-0.03,-0.155,G);
parts.mag=bx(gm,0.024,0.17,0.06, 0,-0.115,-0.17,G);
parts.mag.rotation.x=0.3;
// 高耸三角准星座 + 护罩
bx(gm,0.014,0.03,0.02, 0,0.048,-0.50,G);
sFront_hood(G,gm,0,0.066,-0.50);
sTangent(G,gm,0,0.052,-0.10);
sRear_notch(G,gm,0,0.058,-0.06);
parts.bolt=bx(gl,0.016,0.016,0.05, 0.032,0.02,-0.18,G);
parts.muzzle.set(0,0.028,-0.545);
mkAnchors(parts,{
ads:adsFromSight(0,0.070,-0.26),
rHand:{pos:V3(0.018,-0.08,0.10),rot:V3(0.35,0,0)},
lHand:{pos:V3(-0.012,-0.075,-0.24),rot:V3(0.3,-0.05,0)},
magWell:V3(0,-0.115,-0.17), boltHand:V3(0.04,0.02,-0.18),
});
} else if(key==='p38'){
// 瓦尔特 P38: 外露枪管+短套筒+击锤
cyl(gm,0.0105,0.0105,0.10, 0,0.042,-0.115,G);
pistolFrame(gm,.031,.042,.14,0,.016,0,G);
parts.slide=gunLoft(SLIDE_SECTIONS,gl,0.033,0.028,0.13, 0,0.048,0.01,G);
bx(gm,0.008,0.014,0.01, 0,0.05,0.078,G).rotation.x=0.4;
pistolGrip(wdD,.032,.08,.046,0,-.036,.05,G).rotation.x=-.25;
parts.mag=bx(gm,0.02,0.065,0.032, 0,-0.048,0.045,G);
parts.mag.rotation.x=-0.25;
sFront_blade(G,gl,0,0.055,-0.155);
sRear_notch(G,gl,0,0.060,0.062);
parts.muzzle.set(0,0.042,-0.17);
mkAnchors(parts,{
ads:adsFromSight(0,0.068,-0.24),
rHand:{pos:V3(0.012,-0.052,0.11),rot:V3(0.25,0,0)},
lHand:{pos:V3(-0.028,-0.072,0.085),rot:V3(0.3,0.25,0)},
magWell:V3(0,-0.048,0.045),
});
}
// ============ 苏军 ============
else if(key==='mosin'||key==='mosinpu'){
// 莫辛-纳甘 91/30: 极长枪身, 直拉机柄, 通条, 护罩准星; PU 短镜+下弯柄
const pu=key==='mosinpu';
gunLoft(GUN_SECTIONS.bed,wd,0.046,0.065,0.78, 0,-0.012,-0.15,G);
gunLoft(GUN_SECTIONS.bed,wd,0.044,0.026,0.42, 0,0.034,-0.33,G);
gunLoft(GUN_SECTIONS.stock,wd,0.048,0.095,0.24, 0,-0.055,0.26,G).rotation.x=-0.18;
cyl(gm,0.0095,0.0095,0.30, 0,0.028,-0.66,G);
cyl(gl,0.005,0.005,0.5, 0,-0.018,-0.52,G);
gunLoft(GUN_SECTIONS.upper,gl,0.05,0.018,0.04, 0,0.004,-0.54,G);
bx(gl,0.05,0.018,0.04, 0,0.004,-0.26,G);
bx(gm,0.044,0.04,0.18, 0,0.028,0.0,G);
bx(gm,0.028,0.05,0.1, 0,-0.045,0.02,G); // 突出弹仓
const ba=boltAssembly(G,0.022,0.036,0.06,pu);
parts.bolt=ba.bolt; parts.boltHandle=ba.handle;
parts.clip=bx(bs,0.02,0.055,0.05, 0,0.05,0.02);
parts.clip.visible=false; G.add(parts.clip);
sFront_hood(G,gm,0,0.048,-0.795);
let adsA;
if(pu){
const sy=scopeTube(G,0,0.085,0.03,0.115,0.016);
adsA=adsFromSight(0,sy,-0.22);
} else {
sRear_notch(G,gm,0,0.046,-0.20);
sTangent(G,gm,0,0.041,-0.23);
adsA=adsFromSight(0,0.056,-0.30);
}
parts.muzzle.set(0,0.028,-0.83);
mkAnchors(parts,{
ads:adsA,
rHand:{pos:V3(0.02,-0.06,0.22),rot:V3(0.32,0,0)},
lHand:{pos:V3(-0.012,-0.066,-0.32),rot:V3(0.26,-0.08,0)},
boltHand:ba.knob, clipSlot:V3(0,0.05,0.02), magWell:V3(0,0.05,0.02),
});
} else if(key==='m38carb'){
// 莫辛 M38 骑枪: 短款, 无刺刀
gunLoft(GUN_SECTIONS.bed,wd,0.046,0.065,0.56, 0,-0.012,-0.06,G);
gunLoft(GUN_SECTIONS.bed,wd,0.044,0.024,0.3, 0,0.033,-0.2,G);
gunLoft(GUN_SECTIONS.stock,wd,0.048,0.093,0.22, 0,-0.054,0.24,G).rotation.x=-0.18;
cyl(gm,0.0095,0.0095,0.24, 0,0.028,-0.44,G);
gunLoft(GUN_SECTIONS.upper,gm,0.044,0.04,0.16, 0,0.028,0.02,G);
bx(gm,0.028,0.05,0.09, 0,-0.043,0.04,G);
const ba=boltAssembly(G,0.022,0.036,0.07,false);
parts.bolt=ba.bolt; parts.boltHandle=ba.handle;
parts.clip=bx(bs,0.02,0.055,0.05, 0,0.05,0.03);
parts.clip.visible=false; G.add(parts.clip);
sFront_hood(G,gm,0,0.046,-0.55);
sRear_notch(G,gm,0,0.044,-0.12);
parts.muzzle.set(0,0.028,-0.58);
mkAnchors(parts,{
ads:adsFromSight(0,0.054,-0.29),
rHand:{pos:V3(0.02,-0.058,0.21),rot:V3(0.32,0,0)},
lHand:{pos:V3(-0.012,-0.064,-0.24),rot:V3(0.26,-0.08,0)},
boltHand:ba.knob, clipSlot:V3(0,0.05,0.03), magWell:V3(0,0.05,0.03),
});
} else if(key==='ppsh'){
// 波波沙 PPSh-41: 斜切散热护筒, 71发弹鼓, 木托
gunLoft(GUN_SECTIONS.stock,wd,0.05,0.075,0.3, 0,-0.02,0.16,G);
bx(gm,0.046,0.06,0.24, 0,0.015,-0.05,G);
// 护筒(斜切口制退)
cyl(gm,0.019,0.019,0.36, 0,0.028,-0.30,G);
for(let i=0;i<6;i++){ bx(gm,0.042,0.008,0.02, 0,0.028,-0.16-i*0.055,G); }
const cut=bx(gm,0.04,0.026,0.03, 0,0.036,-0.475,G); cut.rotation.x=0.6;
parts.mag=cyl(gm,0.062,0.062,0.05, 0,-0.068,-0.06,G,0); // 弹鼓(圆面朝左右)
parts.mag.rotation.z=HPI;
bx(gm,0.02,0.02,0.05, 0,-0.02,-0.06,G);
sFront_hood(G,gm,0,0.049,-0.455);
sRear_notch(G,gm,0,0.048,0.03);
parts.bolt=bx(gl,0.015,0.015,0.05, 0.028,0.032,-0.02,G);
parts.muzzle.set(0,0.028,-0.49);
mkAnchors(parts,{
ads:adsFromSight(0,0.058,-0.25),
rHand:{pos:V3(0.02,-0.075,0.14),rot:V3(0.34,0,0)},
lHand:{pos:V3(-0.03,-0.09,-0.06),rot:V3(0.35,0.15,0)},
magWell:V3(0,-0.068,-0.06), boltHand:V3(0.04,0.032,-0.02),
});
} else if(key==='dp28'){
// DP-28: 平放弹盘, 长导气管, 锥形消焰器, 两脚架
gunLoft(GUN_SECTIONS.stock,wd,0.045,0.07,0.24, 0,-0.015,0.24,G);
bx(gm,0.05,0.06,0.3, 0,0.008,0.0,G);
cyl(gm,0.013,0.013,0.4, 0,0.024,-0.40,G);
cyl(gm,0.008,0.008,0.36, 0,-0.006,-0.38,G);
cyl(gm,0.024,0.015,0.07, 0,0.024,-0.625,G);
parts.mag=cyl(gm,0.075,0.075,0.02, 0,0.049,-0.02,G,0); // 弹盘平放
cyl(gm,0.012,0.012,0.008, 0,0.061,-0.02,G,0); // 弹盘中心盖
cyl(gl,0.007,0.007,0.22, 0.03,-0.06,-0.56,G,0.35);
cyl(gl,0.007,0.007,0.22, -0.03,-0.06,-0.56,G,0.35);
gunLoft(GUN_SECTIONS.grip,wdD,0.036,0.07,0.05, 0,-0.062,0.10,G);
sFront_hood(G,gm,0,0.055,-0.60);
sRear_notch(G,gm,0,0.062,0.10);
parts.muzzle.set(0,0.024,-0.66);
mkAnchors(parts,{
ads:adsFromSight(0,0.070,-0.27),
rHand:{pos:V3(0.018,-0.075,0.13),rot:V3(0.34,0,0)},
lHand:{pos:V3(-0.012,-0.055,-0.30),rot:V3(0.28,-0.08,0)},
magWell:V3(0,0.049,-0.02), boltHand:V3(0.04,0.0,0.04),
});
} else if(key==='tt33'){
// 托卡列夫 TT-33: 细长圆滑套筒, 后座槽纹
pistolFrame(gm,.028,.04,.15,0,.016,0,G);
parts.slide=gunLoft(SLIDE_SECTIONS,gl,0.03,0.028,0.165, 0,0.046,-0.005,G);
cyl(gm,0.009,0.009,0.03, 0,0.042,-0.095,G);
gunLoft(GUN_SECTIONS.grip,wdD,0.03,0.075,0.042, 0,-0.035,0.048,G).rotation.x=-0.22;
parts.mag=bx(gm,0.019,0.062,0.03, 0,-0.046,0.042,G);
parts.mag.rotation.x=-0.22;
sFront_blade(G,gl,0,0.06,-0.09);
sRear_notch(G,gl,0,0.058,0.058);
parts.muzzle.set(0,0.042,-0.12);
mkAnchors(parts,{
ads:adsFromSight(0,0.068,-0.24),
rHand:{pos:V3(0.012,-0.05,0.105),rot:V3(0.25,0,0)},
lHand:{pos:V3(-0.028,-0.07,0.08),rot:V3(0.3,0.25,0)},
magWell:V3(0,-0.046,0.042),
});
} else if(key==='ptrd'){
// PTRD-41: 单发超长, 方形制退器, 管状托+缓冲垫, 提把
bx(gm,0.05,0.065,0.3, 0,0.005,0.08,G);
cyl(gm,0.015,0.015,0.72, 0,0.03,-0.60,G);
bx(gm,0.065,0.048,0.075, 0,0.03,-0.985,G);
bx(gm,0.02,0.058,0.06, 0,0.03,-1.01,G);
cyl(gl,0.012,0.012,0.3, 0,0.012,0.24,G);
bx(gl,0.05,0.09,0.03, 0,0.0,0.40,G); // 肩垫
gunLoft(GUN_SECTIONS.grip,wdD,0.034,0.07,0.05, 0,-0.06,0.10,G);
bx(gl,0.012,0.05,0.012, 0.0,0.075,-0.32,G); // 提把立柱
bx(gl,0.012,0.014,0.1, 0,0.105,-0.32,G);
cyl(gl,0.008,0.008,0.3, 0.04,-0.075,-0.62,G,0.3);
cyl(gl,0.008,0.008,0.3, -0.04,-0.075,-0.62,G,0.3);
const ba=boltAssembly(G,0.026,0.048,0.0,false);
parts.bolt=ba.bolt; parts.boltHandle=ba.handle;
// 机瞄偏左置
sFront_blade(G,gm,-0.035,0.055,-0.86);
sRear_notch(G,gm,-0.035,0.052,-0.14);
parts.muzzle.set(0,0.03,-1.05);
mkAnchors(parts,{
ads:adsFromSight(-0.035,0.063,-0.28),
rHand:{pos:V3(0.02,-0.055,0.14),rot:V3(0.32,0,0)},
lHand:{pos:V3(-0.012,-0.05,-0.30),rot:V3(0.26,-0.08,0)},
boltHand:ba.knob,
});
}
// ============ 日军 ============
else if(key==='arisaka'||key==='type97s'||key==='type38c'){
// 三八式: 防尘盖拉栓, 菊纹机匣, 翼形准星; 九七式狙击型镜偏左; 骑枪短款
const snip=key==='type97s', carb=key==='type38c';
const L=carb?0.60:0.78;
gunLoft(GUN_SECTIONS.bed,wd,0.046,0.066,L, 0,-0.01,-(L*0.5-0.26),G);
gunLoft(GUN_SECTIONS.bed,wd,0.044,0.026,L*0.42, 0,0.034,-(L*0.42),G);
gunLoft(GUN_SECTIONS.stock,wd,0.048,0.095,0.24, 0,-0.055,0.26,G).rotation.x=-0.18;
cyl(gm,0.0095,0.0095,carb?0.2:0.3, 0,0.028,carb?-0.5:-0.62,G);
bx(gl,0.036,0.032,0.14, 0,0.04,0.03,G); // 防尘盖
cyl(gl,0.012,0.012,0.02, 0,0.048,-0.03,G,0); // 菊纹圆盘
bx(gm,0.044,0.038,0.16, 0,0.026,0.02,G);
const ba=boltAssembly(G,0.02,0.042,0.06,false);
parts.bolt=ba.bolt; parts.boltHandle=ba.handle;
parts.clip=bx(bs,0.02,0.05,0.05, 0,0.05,0.03);
parts.clip.visible=false; G.add(parts.clip);
const fz=carb?-0.61:-0.77;
sFront_wings(G,gm,0,0.048,fz);
let adsA;
if(snip){
const sy=scopeTube(G,-0.036,0.075,0.02,0.12,0.016);
adsA=adsFromSight(-0.036,sy,-0.22);
} else {
sRear_notch(G,gm,0,0.047,-0.13);
sTangent(G,gm,0,0.042,-0.16);
adsA=adsFromSight(0,0.056,-0.30);
}
parts.muzzle.set(0,0.028,fz-0.03);
mkAnchors(parts,{
ads:adsA,
rHand:{pos:V3(0.02,-0.058,0.22),rot:V3(0.32,0,0)},
lHand:{pos:V3(-0.012,-0.064,carb?-0.22:-0.30),rot:V3(0.26,-0.08,0)},
boltHand:ba.knob, clipSlot:V3(0,0.05,0.03), magWell:V3(0,0.05,0.03),
});
} else if(key==='type100'){
// 一〇〇式: 左侧横插弯弹匣, 穿孔护筒, 直木托
gunLoft(GUN_SECTIONS.stock,wd,0.046,0.07,0.4, 0,-0.016,0.14,G);
bx(gm,0.042,0.052,0.26, 0,0.014,-0.10,G);
cyl(gm,0.017,0.017,0.32, 0,0.026,-0.34,G);
for(let i=0;i<10;i++){ cyl(gl,0.004,0.004,0.006, 0.017*Math.cos(i*0.63),0.026+0.017*Math.sin(i*0.63),-0.26-((i%5)*0.05),G,0); }
// 左侧横插弯匣
const mg2=new THREE.Group(); mg2.position.set(-0.055,0.016,-0.10); mg2.rotation.z=-0.12; G.add(mg2);
bx(gm,0.11,0.024,0.045, -0.05,0,0,mg2);
bx(gm,0.06,0.024,0.045, -0.125,-0.015,0,mg2).rotation.z=0.5;
parts.mag=mg2;
bx(gm,0.024,0.036,0.05, -0.033,0.014,-0.10,G);
sFront_wings(G,gm,0,0.046,-0.47);
sRear_peep(G,gm,0,0.044,0.0);
parts.bolt=bx(gl,0.014,0.014,0.045, 0.028,0.026,-0.08,G);
parts.muzzle.set(0,0.026,-0.51);
mkAnchors(parts,{
ads:adsFromSight(0,0.056,-0.25),
rHand:{pos:V3(0.018,-0.07,0.15),rot:V3(0.34,0,0)},
lHand:{pos:V3(-0.012,-0.06,-0.24),rot:V3(0.3,-0.06,0)},
magWell:V3(-0.11,0.01,-0.10), boltHand:V3(0.04,0.026,-0.08),
});
} else if(key==='type96'){
// 九六式轻机枪: 顶置弯弹匣, 提把, 机瞄偏右
gunLoft(GUN_SECTIONS.stock,wd,0.045,0.07,0.26, 0,-0.012,0.24,G);
bx(gm,0.05,0.062,0.34, 0,0.008,-0.02,G);
cyl(gm,0.014,0.014,0.4, 0,0.026,-0.38,G);
for(let i=0;i<8;i++) cyl(gl,0.0165,0.0165,0.012, 0,0.026,-0.24-i*0.04,G);
cyl(gm,0.02,0.013,0.05, 0,0.026,-0.60,G);
// 顶置弯匣
const mg2=new THREE.Group(); mg2.position.set(0,0.115,-0.08); G.add(mg2);
bx(gm,0.023,0.15,0.05, 0,0.0,0,mg2); mg2.rotation.x=-0.3; mg2.rotation.z=0.05;
parts.mag=mg2;
// 提把(可倒)
bx(wdD,0.012,0.016,0.09, -0.045,0.075,0.06,G);
bx(gl,0.01,0.05,0.012, -0.045,0.045,0.02,G).rotation.x=0.4;
cyl(gl,0.007,0.007,0.2, 0.03,-0.055,-0.52,G,0.35);
cyl(gl,0.007,0.007,0.2, -0.03,-0.055,-0.52,G,0.35);
gunLoft(GUN_SECTIONS.grip,wdD,0.036,0.07,0.05, 0,-0.06,0.12,G);
// 机瞄偏右(避开顶匣)
sFront_wings(G,gm,0.032,0.044,-0.60);
sRear_peep(G,gm,0.032,0.042,0.04);
parts.bolt=bx(gl,0.015,0.015,0.05, 0.034,0.018,-0.12,G);
parts.muzzle.set(0,0.026,-0.63);
mkAnchors(parts,{
ads:adsFromSight(0.032,0.054,-0.26),
rHand:{pos:V3(0.02,-0.062,0.20),rot:V3(0.32,0,0)},
lHand:{pos:V3(-0.02,-0.075,-0.02),rot:V3(0.34,0.1,0)},
magWell:V3(0,0.115,-0.08), boltHand:V3(0.045,0.018,-0.12),
});
} else if(key==='nambu'){
// 南部十四年式: 细长枪管, 圆形后拉机钮, 大扳机护圈
bx(gm,0.026,0.042,0.13, 0,0.018,0.01,G);
cyl(gm,0.009,0.009,0.13, 0,0.04,-0.115,G);
cyl(gl,0.015,0.015,0.02, 0,0.036,0.075,G,0);
cyl(gl,0.017,0.017,0.012, 0,0.036,0.088,G,0); // 圆拉机钮
ringM(gm,0.017,0.004, 0,-0.005,-0.015,G); // 大护圈(冬手套用)
gunLoft(GUN_SECTIONS.grip,wdD,0.026,0.08,0.046, 0,-0.042,0.045,G).rotation.x=-0.38;
parts.mag=bx(gm,0.018,0.058,0.03, 0,-0.048,0.038,G);
parts.mag.rotation.x=-0.38;
sFront_blade(G,gl,0,0.052,-0.17);
sRear_notch(G,gl,0,0.052,0.055);
parts.muzzle.set(0,0.04,-0.185);
mkAnchors(parts,{
ads:adsFromSight(0,0.062,-0.24),
rHand:{pos:V3(0.012,-0.052,0.10),rot:V3(0.28,0,0)},
lHand:{pos:V3(-0.026,-0.07,0.075),rot:V3(0.3,0.25,0)},
magWell:V3(0,-0.048,0.038),
});
} else if(key==='type97at'){
// 九七式自动炮: 20mm半自动, 顶匣, 双脚架+肩托架
bx(gm,0.055,0.075,0.42, 0,0.0,0.06,G);
cyl(gm,0.017,0.017,0.7, 0,0.03,-0.58,G);
cyl(gm,0.028,0.045,0.09, 0,0.03,-0.95,G);
bx(gm,0.05,0.06,0.14, 0,0.0,0.3,G);
bx(gl,0.06,0.09,0.02, 0,-0.01,0.38,G);
const mg2=bx(gm,0.026,0.12,0.06, 0,0.115,-0.04,G); mg2.rotation.x=-0.1;
parts.mag=mg2;
gunLoft(GUN_SECTIONS.grip,wdD,0.034,0.07,0.05, 0.02,-0.062,0.12,G);
gunLoft(GUN_SECTIONS.grip,wdD,0.034,0.07,0.05, -0.05,-0.05,0.3,G); // 副握把
cyl(gl,0.009,0.009,0.32, 0.05,-0.08,-0.55,G,0.3);
cyl(gl,0.009,0.009,0.32, -0.05,-0.08,-0.55,G,0.3);
sFront_blade(G,gm,-0.04,0.055,-0.80);
sRear_peep(G,gm,-0.04,0.05,-0.10);
parts.bolt=bx(gl,0.02,0.02,0.06, 0.04,0.03,-0.02,G);
parts.muzzle.set(0,0.03,-1.0);
mkAnchors(parts,{
ads:adsFromSight(-0.04,0.062,-0.28),
rHand:{pos:V3(0.025,-0.06,0.14),rot:V3(0.32,0,0)},
lHand:{pos:V3(-0.05,-0.048,0.28),rot:V3(0.3,0.1,0)},
magWell:V3(0,0.115,-0.04), boltHand:V3(0.05,0.03,-0.02),
});
}
// ============ 国军 ============
else if(key==='zhongzheng'||key==='zhongzhengs'){
// 中正式: 标准毛瑟短步枪, 直托, 表尺
const snip=key==='zhongzhengs';
gunLoft(GUN_SECTIONS.bed,wd,0.05,0.068,0.62, 0,-0.012,-0.08,G);
gunLoft(GUN_SECTIONS.bed,wd,0.048,0.026,0.24, 0,0.035,-0.22,G);
gunLoft(GUN_SECTIONS.stock,wd,0.05,0.098,0.24, 0,-0.056,0.24,G).rotation.x=-0.2;
cyl(gm,0.010,0.010,0.32, 0,0.03,-0.52,G);
bx(gm,0.046,0.042,0.18, 0,0.03,0.0,G);
bx(gm,0.052,0.022,0.04, 0,0.002,-0.38,G);
const ba=boltAssembly(G,0.024,0.038,0.05,false);
parts.bolt=ba.bolt; parts.boltHandle=ba.handle;
parts.clip=bx(bs,0.02,0.055,0.05, 0,0.05,0.0);
parts.clip.visible=false; G.add(parts.clip);
sFront_wings(G,gm,0,0.05,-0.665);
let adsA;
if(snip){
const sy=scopeTube(G,0,0.086,0.01,0.12,0.016);
adsA=adsFromSight(0,sy,-0.22);
} else {
sRear_notch(G,gm,0,0.048,-0.10);
sTangent(G,gm,0,0.043,-0.13);
adsA=adsFromSight(0,0.059,-0.30);
}
parts.muzzle.set(0,0.03,-0.70);
mkAnchors(parts,{
ads:adsA,
rHand:{pos:V3(0.02,-0.06,0.20),rot:V3(0.32,0,0)},
lHand:{pos:V3(-0.012,-0.068,-0.26),rot:V3(0.26,-0.08,0)},
boltHand:ba.knob, clipSlot:V3(0,0.05,0.0), magWell:V3(0,0.05,0.0),
});
} else if(key==='mp18'){
// MP18 花机关: 大直径穿孔护筒, 左置弹匣
gunLoft(GUN_SECTIONS.stock,wd,0.05,0.078,0.38, 0,-0.02,0.15,G);
cyl(gm,0.021,0.021,0.4, 0,0.03,-0.24,G);
for(let i=0;i<12;i++){ cyl(gl,0.005,0.005,0.006, 0.021*Math.cos(i*0.52),0.03+0.021*Math.sin(i*0.52),-0.1-((i%6)*0.055),G,0); }
bx(gm,0.044,0.055,0.16, 0,0.004,0.02,G);
parts.mag=bx(gm,0.12,0.026,0.05, -0.095,0.028,-0.05,G);
cyl(gm,0.014,0.014,0.05, -0.03,0.028,-0.05,G,0).rotation.z=HPI;
sFront_blade(G,gm,0,0.055,-0.42);
sRear_notch(G,gm,0,0.055,0.05);
parts.bolt=bx(gl,0.014,0.014,0.05, 0.032,0.03,-0.04,G);
parts.muzzle.set(0,0.03,-0.46);
mkAnchors(parts,{
ads:adsFromSight(0,0.065,-0.25),
rHand:{pos:V3(0.02,-0.08,0.16),rot:V3(0.34,0,0)},
lHand:{pos:V3(-0.02,-0.075,-0.12),rot:V3(0.32,0.05,0)},
magWell:V3(-0.12,0.028,-0.05), boltHand:V3(0.045,0.03,-0.04),
});
} else if(key==='zb26'){
// 捷克式 ZB-26: 顶置直弹匣, 长导气管, 快拆枪管环
gunLoft(GUN_SECTIONS.stock,wd,0.045,0.07,0.26, 0,-0.012,0.24,G);
bx(gm,0.05,0.065,0.32, 0,0.006,-0.02,G);
cyl(gm,0.0145,0.0145,0.42, 0,0.028,-0.38,G);
cyl(gm,0.010,0.010,0.34, 0,-0.004,-0.36,G);
ringM(gl,0.02,0.005, 0,0.028,-0.19,G);
cyl(gm,0.019,0.014,0.04, 0,0.028,-0.585,G);
const mg2=bx(gm,0.023,0.14,0.05, 0,0.115,-0.06,G); mg2.rotation.x=-0.06;
parts.mag=mg2;
bx(wdD,0.012,0.016,0.08, -0.04,0.07,0.04,G);
cyl(gl,0.007,0.007,0.2, 0.03,-0.055,-0.5,G,0.35);
cyl(gl,0.007,0.007,0.2, -0.03,-0.055,-0.5,G,0.35);
gunLoft(GUN_SECTIONS.grip,wdD,0.036,0.07,0.05, 0,-0.06,0.12,G);
sFront_wings(G,gm,0.03,0.046,-0.59);
sRear_notch(G,gm,0.03,0.046,0.02);
parts.bolt=bx(gl,0.015,0.015,0.05, 0.034,0.016,-0.10,G);
parts.muzzle.set(0,0.028,-0.61);
mkAnchors(parts,{
ads:adsFromSight(0.03,0.056,-0.26),
rHand:{pos:V3(0.02,-0.062,0.20),rot:V3(0.32,0,0)},
lHand:{pos:V3(-0.02,-0.072,-0.02),rot:V3(0.34,0.1,0)},
magWell:V3(0,0.115,-0.06), boltHand:V3(0.045,0.016,-0.10),
});
} else if(key==='c96'||key==='c96auto'){
// 驳壳枪 C96 / 快慢机: 前置弹仓, 扫帚柄, 木盒枪托(快慢机)
const au=key==='c96auto';
gunLoft(GUN_SECTIONS.upper,gm,0.03,0.052,0.15, 0,0.022,-0.01,G);
bx(gm,0.032,0.034,0.09, 0,0.062,0.015,G); // 机匣上部
cyl(gm,0.011,0.011,0.13, 0,0.052,-0.155,G);
parts.mag=bx(gm,0.026,au?0.115:0.062,0.05, 0,au?-0.055:-0.028,-0.045,G);
cyl(wdD,0.016,0.02,0.075, 0,-0.052,0.055,G,0.25);
bx(gm,0.01,0.02,0.02, 0,0.078,0.05,G).rotation.x=0.35; // 击锤
if(au) gunLoft(GUN_SECTIONS.stock,wd,0.028,0.055,0.15, 0,-0.015,0.16,G).rotation.x=-0.3; // 木盒托
sFront_blade(G,gm,0,0.062,-0.205);
sTangent(G,gm,0,0.076,0.01);
sRear_notch(G,gm,0,0.078,0.028);
parts.slide=gunLoft(SLIDE_SECTIONS,gl,0.026,0.02,0.09, 0,0.083,-0.02,G);
parts.muzzle.set(0,0.052,-0.23);
mkAnchors(parts,{
ads:adsFromSight(0,0.088,-0.25),
rHand:{pos:V3(0.012,-0.05,0.105),rot:V3(0.3,0,0)},
lHand:{pos:V3(-0.028,-0.068,0.08),rot:V3(0.3,0.25,0)},
magWell:V3(0,-0.06,-0.045), boltHand:V3(0.03,0.083,-0.02),
});
} else if(key==='boys'){
// 博伊斯反坦克枪: 顶匣, 大圆制退器, 单脚架, 机瞄偏左
bx(gm,0.05,0.07,0.4, 0,0.0,0.08,G);
cyl(gm,0.016,0.016,0.68, 0,0.03,-0.56,G);
cyl(gm,0.038,0.038,0.06, 0,0.03,-0.92,G);
for(let i=0;i<3;i++) bx(gl,0.082,0.01,0.012, 0,0.03,-0.90-i*0.02,G);
const mg2=bx(gm,0.026,0.12,0.06, 0,0.11,-0.06,G); mg2.rotation.x=-0.1;
parts.mag=mg2;
bx(gl,0.012,0.012,0.3, 0,0.012,0.26,G);
bx(gl,0.05,0.08,0.025, 0,0.0,0.40,G);
gunLoft(GUN_SECTIONS.grip,wdD,0.034,0.07,0.05, 0,-0.062,0.10,G);
cyl(gl,0.01,0.01,0.3, 0,-0.09,-0.46,G,0.15); // 单脚架
const ba=boltAssembly(G,0.028,0.045,0.02,true);
parts.bolt=ba.bolt; parts.boltHandle=ba.handle;
sFront_blade(G,gm,-0.04,0.052,-0.78);
sRear_peep(G,gm,-0.04,0.048,-0.12);
parts.muzzle.set(0,0.03,-0.96);
mkAnchors(parts,{
ads:adsFromSight(-0.04,0.062,-0.28),
rHand:{pos:V3(0.02,-0.058,0.14),rot:V3(0.32,0,0)},
lHand:{pos:V3(-0.012,-0.05,-0.26),rot:V3(0.26,-0.08,0)},
boltHand:ba.knob, magWell:V3(0,0.11,-0.06),
});
}
// ============ 八路军 ============
else if(key==='hanyang'||key==='laotao'){
// 汉阳造八八式: 枪管外露套筒; 老套筒: 更旧, 木色更深, 套筒锈蚀
const old2=key==='laotao';
const wm=old2?wdD:wd;
gunLoft(GUN_SECTIONS.bed,wm,.05,.066,.64,0,-.014,-.08,G);
gunLoft(GUN_SECTIONS.stock,wm,.05,.096,.24,0,-.058,.24,G).rotation.x=-.20;
cyl(old2?gl:gm,0.0165,0.0165,0.36, 0,0.03,-0.48,G); // 套筒
cyl(gm,0.009,0.009,0.12, 0,0.03,-0.71,G);
gunLoft(GUN_SECTIONS.upper,gm,0.044,0.04,0.16, 0,0.028,0.02,G);
if(old2){ ringM(gl,0.017,0.003, 0,0.03,-0.31,G); ringM(gl,0.017,0.003, 0,0.03,-0.62,G); }
const ba=boltAssembly(G,0.022,0.036,0.06,false);
parts.bolt=ba.bolt; parts.boltHandle=ba.handle;
parts.clip=bx(bs,0.02,0.05,0.05, 0,0.05,0.02);
parts.clip.visible=false; G.add(parts.clip);
sFront_blade(G,gm,0,0.045,-0.755);
sRear_notch(G,gm,0,0.046,-0.14);
parts.muzzle.set(0,0.03,-0.78);
mkAnchors(parts,{
ads:adsFromSight(0,0.055,-0.30),
rHand:{pos:V3(0.02,-0.06,0.20),rot:V3(0.32,0,0)},
lHand:{pos:V3(-0.012,-0.066,-0.26),rot:V3(0.26,-0.08,0)},
boltHand:ba.knob, clipSlot:V3(0,0.05,0.02), magWell:V3(0,0.05,0.02),
});
} else if(key==='type11'){
// 歪把子: 右弯枪托, 左侧漏斗供弹, 细长导气管
const st=gunLoft(GUN_SECTIONS.stock,wd,0.042,0.062,0.3, 0.035,-0.024,0.2,G);
st.rotation.y=-0.14;
bx(gm,0.046,0.055,0.3, 0,0.006,-0.06,G);
cyl(gm,0.0125,0.0125,0.36, 0,0.024,-0.38,G);
cyl(gm,0.008,0.008,0.3, 0,-0.004,-0.36,G);
for(let i=0;i<6;i++) cyl(gl,0.0145,0.0145,0.012, 0,0.024,-0.24-i*0.045,G);
// 左侧漏斗弹仓(装桥夹)
const hop=new THREE.Group(); hop.position.set(-0.052,0.045,0.0); G.add(hop);
bx(gm,0.05,0.075,0.065, 0,0,0,hop);
bx(gl,0.044,0.012,0.055, 0,0.043,0,hop);
parts.mag=hop;
cyl(gl,0.007,0.007,0.2, 0.028,-0.055,-0.46,G,0.35);
cyl(gl,0.007,0.007,0.2, -0.028,-0.055,-0.46,G,0.35);
sFront_wings(G,gm,0.024,0.042,-0.54);
sRear_notch(G,gm,0.024,0.042,0.02);
parts.muzzle.set(0,0.024,-0.57);
mkAnchors(parts,{
ads:adsFromSight(0.024,0.052,-0.26),
rHand:{pos:V3(0.035,-0.065,0.18),rot:V3(0.32,0,0)},
lHand:{pos:V3(-0.014,-0.07,-0.12),rot:V3(0.32,0,0)},
magWell:V3(-0.052,0.045,0.0), boltHand:V3(0.04,0.01,-0.06),
});
} else if(key==='mortar'){
// 轻型迫击炮
const tube=cyl(gm,0.045,0.05,0.62, 0,0.02,-0.18,G);
tube.rotation.x=HPI-0.62;
cyl(gl,0.052,0.048,0.05, 0,0.24,-0.4,G).rotation.x=HPI-0.62;
bx(gm,0.16,0.02,0.2, 0,-0.16,-0.02,G);
cyl(gl,0.008,0.008,0.3, 0.09,-0.02,-0.3,G,0.9);
cyl(gl,0.008,0.008,0.3, -0.09,-0.02,-0.3,G,0.9);
bx(gm,0.05,0.014,0.02, 0,0.05,-0.12,G);
bx(gl,0.014,0.05,0.014, -0.07,0.1,-0.2,G);
parts.muzzle.set(0,0.3,-0.45);
mkAnchors(parts,{
ads:{pos:V3(0.15,-0.14,-0.5),rot:ADSROT0},
rHand:{pos:V3(0.01,-0.09,0.16),rot:V3(0.35,0,0)},
lHand:{pos:V3(-0.06,0.02,-0.3),rot:V3(0.3,0,0)},
});
}
// ============ 现代 2000-2020 ============
else if(CARBINE_SHELLS[key]){
const design=CARBINE_SHELLS[key];
const {tip,nose,butt,sight}=design;
const furniture=vmMats[design.finish];
const guardStart=-.15,guardLength=guardStart-nose;
gunLoft(GUN_SECTIONS.upper,gm,.054,.056,.30,0,.010,-.011,G);
gunPanel(GUN_OUTLINES.frame,furniture,.049,.061,.253,0,-.012,-.014,G);
gunPanel(GUN_OUTLINES.bow,vmMats.polymer,.018,.043,.100,0,-.050,.030,G,[GUN_OUTLINES.bowWindow]);
gunLoft(GUN_SECTIONS.grip,vmMats.polymer,.044,.112,.064,0,-.066,.106,G).rotation.x=-.30;
cyl(gl,.009,.012,guardStart-tip,0,.028,(guardStart+tip)/2,G);
cyl(gm,.016,.013,.047,0,.028,tip+.024,G);
gunPanel(GUN_OUTLINES.guard,furniture,.061,.060,guardLength,0,.013,(nose+guardStart)/2,G,gunVents(design.vents));
gunRail(G,gm,.096-nose,(nose+.096)/2,.047);
gunPanel([[0,.20],[.10,0],[.85,0],[1,.54],[.87,.92],[.24,1]],pk,.003,.019,.119,
  -.027,.017,-.029,G,gunVents(2));
gunPanel(GUN_OUTLINES.stock,furniture,.050,.095,butt-.132,0,-.037,(butt+.132)/2,G,
  design.window?[GUN_OUTLINES.stockWindow]:[]);
gunLoft(GUN_SECTIONS.upper,vmMats.rubber,.056,.090,.019,0,-.041,butt,G);
parts.mag=gunPanel(GUN_OUTLINES.magazine,vmMats.polymer,.034,.16,.085,0,-.100,-.105,G);
gunLoft(GUN_SECTIONS.upper,gl,.036,.011,.051,0,-.077,-.016,parts.mag);
sRear_peep(G,gl,0,sight,.021);
sFront_blade(G,gl,0,sight,nose+.004);
parts.bolt=gunLoft(GUN_SECTIONS.upper,gl,.012,.012,.052,.028,.019,-.051,G);
parts.muzzle.set(0,.028,tip);
mkAnchors(parts,{
ads:adsFromSight(0,.062,-.27),
rHand:{pos:V3(.018,-.065,.14),rot:V3(.34,0,0)},
lHand:{pos:V3(-.014,-.080,(nose+guardStart)/2),rot:V3(.30,-.06,0)},
magWell:parts.mag.position.clone(),boltHand:V3(.036,.019,-.051),
});
} else if(key==='g36c'){
// G36C: 提把内藏光学瞄具, 侧折叠托
gunLoft(GUN_SECTIONS.upper,vmMats.polymer,.058,.063,.30,0,-.004,-.034,G);
gunPanel(GUN_OUTLINES.guard,pk,.060,.052,.235,0,.004,-.282,G,gunVents(3));
gunPanel(GUN_OUTLINES.bow,gm,.024,.036,.22,0,.030,-.068,G,[GUN_OUTLINES.bowWindow]);
gunPanel(GUN_OUTLINES.stock,vmMats.polymer,.046,.099,.206,0,-.035,.211,G,[GUN_OUTLINES.stockWindow]);
cyl(pk,0.011,0.011,0.28, 0,0.028,-0.40,G);
cyl(gm,0.014,0.011,0.06, 0,0.028,-0.535,G);
gunLoft(GUN_SECTIONS.grip,vmMats.polymer,.040,.100,.056,0,-.055,.092,G).rotation.x=-.22;
parts.mag=gunPanel(GUN_OUTLINES.magazine,pk,.031,.15,.075,0,-.10,-.10,G);
parts.mag.rotation.x=-0.08;
sRear_peep(G,pk,0,0.046,0.05);
sFront_blade(G,pk,0,0.046,-0.49);
parts.bolt=bx(gl,0.02,0.016,0.06, -0.03,0.024,-0.06,G);
parts.muzzle.set(0,0.028,-0.57);
mkAnchors(parts,{
ads:adsFromSight(0,0.062,-0.27),
rHand:{pos:V3(0.018,-0.065,0.14),rot:V3(0.34,0,0)},
lHand:{pos:V3(-0.014,-0.09,-0.32),rot:V3(0.3,-0.06,0)},
magWell:V3(0,-0.10,-0.10), boltHand:V3(-0.04,0.024,-0.06),
});
} else if(key==='m24'){
// M24: 现代栓动狙击, 4x瞄准镜, 合成枪托
gunLoft(GUN_SECTIONS.bed,pk,0.048,0.062,0.62, 0,-0.014,-0.08,G);
gunLoft(GUN_SECTIONS.bed,pk,0.046,0.026,0.28, 0,0.032,-0.26,G);
cyl(gl,0.009,0.009,0.5, 0,0.028,-0.62,G);
cyl(gm,0.011,0.008,0.08, 0,0.028,-0.88,G);
bx(gl,0.046,0.036,0.16, 0,0.03,0.02,G);
gunLoft(GUN_SECTIONS.stock,pk,0.048,0.09,0.2, 0,-0.052,0.24,G).rotation.x=-0.16;
const ba=boltAssembly(G,0.022,0.036,0.03,false);
parts.bolt=ba.bolt; parts.boltHandle=ba.handle;
parts.mag=bx(gl,0.02,0.05,0.09, 0,-0.035,0.02,G);
const sy=scopeTube(G,0,0.082,0.0,0.16,0.018);
sFront_blade(G,gl,0,0.05,-0.75);
sRear_peep(G,gl,0,0.05,0.12);
parts.muzzle.set(0,0.028,-0.93);
mkAnchors(parts,{
ads:adsFromSight(0,sy,-0.22),
rHand:{pos:V3(0.02,-0.06,0.20),rot:V3(0.32,0,0)},
lHand:{pos:V3(-0.012,-0.068,-0.30),rot:V3(0.26,-0.08,0)},
boltHand:ba.knob, magWell:V3(0,-0.035,0.02),
});
} else if(key==='g28'){
// G28: 半自动精确步枪(基于G36), 长管+两脚架+瞄准镜
gunLoft(GUN_SECTIONS.upper,vmMats.fieldTan,.055,.064,.34,0,.002,-.025,G);
gunPanel(GUN_OUTLINES.guard,vmMats.fieldTan,.063,.068,.28,0,-.001,-.329,G,gunVents(5));
gunPanel(GUN_OUTLINES.stock,vmMats.fieldTan,.052,.105,.219,0,-.040,.243,G,[GUN_OUTLINES.stockWindow]);
cyl(pk,0.012,0.012,0.34, 0,0.028,-0.44,G);
cyl(gm,0.014,0.011,0.07, 0,0.028,-0.595,G);
gunRail(G,gm,.33,-.123,.037);
gunLoft(GUN_SECTIONS.grip,vmMats.polymer,.039,.094,.059,0,-.057,.103,G).rotation.x=-.24;
parts.mag=bx(pk,0.024,0.14,0.05, 0,-0.095,-0.08,G);
parts.mag.rotation.x=-0.1;
cyl(gl,0.006,0.006,0.2, 0.032,-0.06,-0.62,G,0.3);
cyl(gl,0.006,0.006,0.2, -0.032,-0.06,-0.62,G,0.3);
const sy2=scopeTube(G,0,0.074,0.0,0.15,0.018);
sFront_blade(G,pk,0,0.046,-0.60);
sRear_peep(G,pk,0,0.046,0.06);
parts.bolt=bx(gl,0.02,0.016,0.06, -0.03,0.024,-0.08,G);
parts.muzzle.set(0,0.028,-0.64);
mkAnchors(parts,{
ads:adsFromSight(0,sy2,-0.22),
rHand:{pos:V3(0.018,-0.065,0.15),rot:V3(0.34,0,0)},
lHand:{pos:V3(-0.014,-0.08,-0.32),rot:V3(0.3,-0.06,0)},
magWell:V3(0,-0.095,-0.08), boltHand:V3(-0.04,0.024,-0.08),
});
} else if(key==='mp5'){
// MP5: 经典冲锋枪, 环形护木, 伸缩托
gunLoft(GUN_SECTIONS.upper,gm,.048,.045,.27,0,.013,-.047,G);
gunPanel(GUN_OUTLINES.frame,vmMats.polymer,.042,.057,.19,0,-.013,-.019,G);
gunLoft(GUN_SECTIONS.grip,vmMats.polymer,.037,.091,.049,0,-.060,.064,G).rotation.x=-.18;
cyl(gm,0.012,0.012,0.26, 0,0.024,-0.30,G);
cyl(gm,0.016,0.016,0.06, 0,0.024,-0.425,G);
gunLoft(GUN_SECTIONS.bed,vmMats.rubber,.060,.065,.19,0,-.002,-.282,G);
cyl(gl,0.005,0.005,0.18, 0.016,0.002,0.22,G);
cyl(gl,0.005,0.005,0.18, -0.016,0.002,0.22,G);
bx(gl,0.042,0.05,0.015, 0,-0.01,0.32,G);
parts.mag=gunPanel(GUN_OUTLINES.magazine,gm,.026,.154,.067,0,-.092,-.113,G);
sFront_hood(G,gm,0,0.048,-0.40);
sRear_peep(G,gm,0,0.044,0.0);
parts.bolt=bx(gl,0.014,0.014,0.045, 0.03,0.024,-0.08,G);
parts.muzzle.set(0,0.024,-0.46);
mkAnchors(parts,{
ads:adsFromSight(0,0.055,-0.25),
rHand:{pos:V3(0.018,-0.07,0.13),rot:V3(0.34,0,0)},
lHand:{pos:V3(-0.014,-0.09,-0.28),rot:V3(0.32,-0.05,0)},
magWell:V3(0,-0.105,-0.14), boltHand:V3(0.04,0.024,-0.08),
});
} else if(key==='at4'||key==='pf3'){
// AT4 / 铁拳3: 一次性火箭筒
const isAt4=key==='at4';
const tubeMat=new THREE.MeshLambertMaterial({color:isAt4?0x4a5240:0x4f4a42});
const tubeR=0.05;
cyl(tubeMat,tubeR,tubeR,1.2, 0,0.05,-0.20,G);
cyl(gm,tubeR+0.01,tubeR+0.004,0.08, 0,0.05,-0.80,G);
cyl(gm,tubeR+0.01,tubeR+0.004,0.06, 0,0.05,0.38,G);
sFront_blade(G,gm,-0.04,0.085,-0.75);
sRear_notch(G,gm,-0.04,0.085,0.16);
bx(gl,0.04,0.055,0.05, 0,-0.03,0.14,G).rotation.x=-0.14;
bx(gl,0.012,0.03,0.02, 0,-0.028,0.2,G);
const rkt2=cyl(vmMats.gunL,0.028,0.013,0.14, 0,0.05,-0.86,G);
parts.rocketTip=rkt2;
const rr2=new THREE.Group();
const rk2=new THREE.MeshLambertMaterial({color:isAt4?0x5a6040:0x60443a});
cyl(rk2,0.024,0.024,0.2, 0,0,0.02,rr2);
cyl(vmMats.gunL,0.024,0.003,0.08, 0,0,-0.11,rr2);
rr2.visible=false; G.add(rr2);
parts.reloadRocket=rr2;
parts.muzzle.set(0,0.05,-0.86);
mkAnchors(parts,{
ads:{pos:V3(0.05,-0.145,-0.3),rot:ADSROT0},
rHand:{pos:V3(0.01,-0.09,0.16),rot:V3(0.35,0,0)},
lHand:{pos:V3(-0.02,-0.1,-0.12),rot:V3(0.3,-0.05,0)},
});
} else if(key==='p320'||key==='g17'||key==='glock18'){
// P320 / G17 / G18: 现代聚合物底把手枪 (G18 只多一个快慢机拨片)
const isP320=key==='p320';
const isG18=key==='glock18';
const finish=isP320?vmMats.fieldTan:vmMats.polymer;
pistolFrame(finish,.034,.045,.185,0,.014,-.010,G);
parts.slide=gunLoft(SLIDE_SECTIONS,isP320?gl:gm,.035,.03,.207,0,.046,-.016,G);
if(isG18) bx(gl,0.009,0.009,0.024, 0.017,0.028,0.028,G);   // G18 快慢机拨片
pistolGrip(finish,.033,.089,.054,0,-.036,.050,G).rotation.x=-.28;
parts.mag=bx(gm,0.019,0.085,0.03, 0,-0.075,0.045,G);
parts.mag.rotation.x=-0.28;
sFront_blade(G,gl,0,0.06,-0.11);
sRear_notch(G,gl,0,0.06,0.06);
parts.muzzle.set(0,0.045,-0.12);
mkAnchors(parts,{
ads:adsFromSight(0,0.07,-0.24),
rHand:{pos:V3(0.012,-0.052,0.105),rot:V3(0.25,0,0)},
lHand:{pos:V3(-0.028,-0.072,0.08),rot:V3(0.3,0.25,0)},
magWell:V3(0,-0.075,0.045),
   });
 } else if(key==='ak74m'){
 // AK-74M: 冲压机匣, 聚合物枪托, 导气管, 弧形弹匣, 准星护圈
 const compact=modKey==='aks74u', modern=modKey==='ak12';
 const tip=compact?-.435:-.53, front=compact?-.33:-.39;
 gunPanel(GUN_OUTLINES.frame,gm,.055,.066,.30,0,-.001,-.012,G);
 gunLoft(GUN_SECTIONS.upper,gm,.047,.038,.255,0,.028,-.009,G);
 gunPanel(GUN_OUTLINES.guard,compact?wd:vmMats.polymer,.057,.057,-.14-front,0,.003,
   (front-.14)/2,G,gunVents(modern?4:2));
 if(modern) gunRail(G,gl,.30,-.06,.050);
 gunPanel(GUN_OUTLINES.stock,compact?gm:vmMats.polymer,.046,.094,.214,0,-.037,.237,G,
   compact||modern?[GUN_OUTLINES.stockWindow]:[]);
 gunLoft(GUN_SECTIONS.grip,vmMats.polymer,.037,.096,.054,0,-.061,.087,G).rotation.x=-.24;
 cyl(gl,.010,.012,-.12-tip,0,.026,(tip-.12)/2,G);
 cyl(gm,.014,.012,.054,0,.026,tip+.027,G);
 parts.mag=gunPanel(GUN_OUTLINES.magazine,compact?vmMats.bakelite:pk,.034,.165,.095,0,-.094,-.066,G);
 sFront_hood(G,gm,0,.052,tip+.041);
 sRear_peep(G,gm,0,0.048,0.03);
 parts.bolt=bx(gl,0.02,0.016,0.06, 0.03,0.028,-0.08,G);
 parts.muzzle.set(0,.026,tip);
 mkAnchors(parts,{
 ads:adsFromSight(0,0.058,-0.27),
 rHand:{pos:V3(0.018,-0.065,0.14),rot:V3(0.34,0,0)},
 lHand:{pos:V3(-.014,-.078,(front-.14)/2),rot:V3(.3,-.06,0)},
 magWell:parts.mag.position.clone(), boltHand:V3(0.04,0.028,-0.08),
 });
 } else if(key==='svd'){
 // SVD 德拉贡诺夫: 木托+镂空护木, 长导气管, PSO 4x瞄准镜
 gunLoft(GUN_SECTIONS.bed,wdD,.052,.064,.31,0,-.013,-.02,G);
 gunPanel(GUN_OUTLINES.guard,wd,.056,.071,.26,0,.001,-.288,G,gunVents(4));
 cyl(gm,0.009,0.009,0.44, 0,0.028,-0.58,G);
 cyl(gm,0.012,0.009,0.07, 0,0.028,-0.82,G);
 bx(gm,0.045,0.042,0.18, 0,0.032,0.02,G);
 gunPanel(GUN_OUTLINES.stock,wd,.050,.110,.261,0,-.043,.233,G,[GUN_OUTLINES.stockWindow]);
 gunLoft(GUN_SECTIONS.stock,vmMats.rubber,.050,.021,.130,0,.006,.275,G);
 parts.mag=bx(gm,0.024,0.11,0.06, 0,-0.052,0.0,G);
 parts.mag.rotation.x=-0.08;
 const sy=scopeTube(G,0,0.08,0.0,0.15,0.017);
 sFront_blade(G,gl,0,0.05,-0.72);
 sRear_peep(G,gl,0,0.05,0.12);
 parts.bolt=bx(gl,0.018,0.016,0.06, 0.028,0.028,0.02,G);
 parts.muzzle.set(0,0.028,-0.87);
 mkAnchors(parts,{
 ads:adsFromSight(0,sy,-0.22),
 rHand:{pos:V3(0.02,-0.06,0.20),rot:V3(0.32,0,0)},
 lHand:{pos:V3(-0.012,-0.068,-0.30),rot:V3(0.26,-0.08,0)},
 magWell:V3(0,-0.052,0.0), boltHand:V3(0.04,0.028,0.02),
 });
 } else if(key==='pp19'){
 // PP-19 勇士: 紧凑冲锋枪, 机匣护木一体, 折叠托, 直弹匣
 gunLoft(GUN_SECTIONS.upper,gm,.048,.055,.25,0,.012,-.043,G);
 gunPanel(GUN_OUTLINES.guard,vmMats.polymer,.055,.055,.18,0,.001,-.246,G,gunVents(2));
 cyl(gm,0.011,0.011,0.24, 0,0.024,-0.32,G);
 cyl(gm,0.016,0.016,0.05, 0,0.024,-0.44,G);
 gunPanel(GUN_OUTLINES.stock,gm,.029,.087,.208,0,-.032,.182,G,[GUN_OUTLINES.stockWindow]);
 gunLoft(GUN_SECTIONS.grip,vmMats.polymer,.036,.087,.053,0,-.052,.079,G).rotation.x=-.20;
 parts.mag=bx(gm,0.023,0.14,0.045, 0,-0.10,-0.10,G);
 sFront_blade(G,gm,0,0.046,-0.38);
 sRear_peep(G,gm,0,0.044,-0.02);
 parts.bolt=bx(gl,0.014,0.014,0.045, 0.03,0.024,-0.08,G);
 parts.muzzle.set(0,0.024,-0.47);
 mkAnchors(parts,{
 ads:adsFromSight(0,0.055,-0.25),
 rHand:{pos:V3(0.018,-0.07,0.13),rot:V3(0.34,0,0)},
 lHand:{pos:V3(-0.014,-0.09,-0.28),rot:V3(0.32,-0.05,0)},
 magWell:V3(0,-0.10,-0.10), boltHand:V3(0.04,0.024,-0.08),
 });
 } else if(key==='rpg7'){
 // RPG-7: 火箭筒, 木质握把+护木, 前喇叭口, 尾喷管
 const tubeMat=new THREE.MeshLambertMaterial({color:0x52544c});
 cyl(tubeMat,0.05,0.05,1.15, 0,0.05,-0.18,G);
 cyl(gm,0.058,0.05,0.1, 0,0.05,-0.76,G);
 cyl(gm,0.042,0.042,0.14, 0,0.05,0.38,G);
 bx(wdD,0.036,0.07,0.09, 0,-0.035,0.1,G).rotation.x=-0.15;
 bx(wdD,0.02,0.05,0.06, 0,-0.06,0.16,G);
 sFront_blade(G,gm,-0.04,0.085,-0.72);
 sRear_notch(G,gm,-0.04,0.085,0.16);
 const rkt2=cyl(vmMats.gunL,0.028,0.013,0.14, 0,0.05,-0.82,G);
 parts.rocketTip=rkt2;
 const rr2=new THREE.Group();
 const rk2=new THREE.MeshLambertMaterial({color:0x5a6040});
 cyl(rk2,0.024,0.024,0.2, 0,0,0.02,rr2);
 cyl(vmMats.gunL,0.024,0.003,0.08, 0,0,-0.11,rr2);
 rr2.visible=false; G.add(rr2);
 parts.reloadRocket=rr2;
 parts.muzzle.set(0,0.05,-0.82);
 mkAnchors(parts,{
 ads:{pos:V3(0.05,-0.145,-0.3),rot:ADSROT0},
 rHand:{pos:V3(0.01,-0.09,0.16),rot:V3(0.35,0,0)},
 lHand:{pos:V3(-0.02,-0.1,-0.12),rot:V3(0.3,-0.05,0)},
 });
 } else if(key==='pyat'){
 // MP-443 乌鸦: 大型聚合物手枪
 pistolFrame(pk,.035,.044,.186,0,.016,-.010,G);
 parts.slide=gunLoft(SLIDE_SECTIONS,gl,.035,.032,.251,0,.048,-.040,G);
 bx(gl,0.008,0.014,0.012, 0,0.046,0.085,G).rotation.x=0.5;
 pistolGrip(vmMats.polymer,.031,.087,.056,0,-.038,.050,G).rotation.x=-.28;
 cyl(gm,.009,.009,.025,0,.048,-.169,G);
 parts.mag=bx(gm,0.019,0.09,0.03, 0,-0.08,0.045,G);
 sFront_blade(G,gm,0,0.058,-0.16);
 sRear_notch(G,gm,0,.061,.069);
 parts.muzzle.set(0,0.048,-0.185);
 mkAnchors(parts,{
 ads:adsFromSight(0,0.068,-0.19),
 rHand:{pos:V3(0.012,-0.052,0.105),rot:V3(0.25,0,0)},
 lHand:{pos:V3(-0.028,-0.072,0.08),rot:V3(0.3,0.25,0)},
 magWell:V3(0,-0.08,0.045),
 });
 }
else if(key==='deagle'){
// 沙漠之鹰: 大号半自动手枪, 长滑套 + 粗枪口 + 橡胶握把
pistolFrame(gl,.040,.052,.215,0,.018,-.010,G);
parts.slide=gunLoft(SLIDE_SECTIONS,gl,.042,.038,.254,0,.050,-.028,G);
gunLoft(GUN_SECTIONS.upper,gl,.034,.028,.100,0,.051,-.175,G);
bx(gl,0.01,0.018,0.014, 0,0.048,0.105,G).rotation.x=0.5;
pistolGrip(vmMats.rubber,.035,.092,.058,0,-.042,.060,G).rotation.x=-.30;
parts.mag=bx(gm,0.023,0.09,0.034, 0,-0.085,0.055,G);
parts.mag.rotation.x=-0.30;
sFront_blade(G,gl,0,0.068,-0.145);
sRear_notch(G,gl,0,0.068,0.09);
cyl(gm,.011,.013,.032,0,.052,-.218,G);
parts.muzzle.set(0,0.052,-0.235);
mkAnchors(parts,{
ads:adsFromSight(0,0.078,-0.26),
rHand:{pos:V3(0.014,-0.055,0.135),rot:V3(0.26,0,0)},
lHand:{pos:V3(-0.032,-0.075,0.10),rot:V3(0.3,0.24,0)},
magWell:V3(0,-0.085,0.055),
});
} else if(key==='awm'){
// AWM: 长管栓动狙击, 拇指孔枪托, 高倍镜
gunPanel(GUN_OUTLINES.guard,vmMats.fieldTan,.059,.077,.56,0,-.008,-.164,G,gunVents(3));
cyl(gl,0.0095,0.0095,0.62, 0,0.028,-0.72,G);
cyl(gm,0.012,0.0085,0.09, 0,0.028,-1.02,G);
bx(gl,0.046,0.036,0.18, 0,0.03,0.04,G);
const thumbhole=[[.14,.70],[.21,.36],[.34,.26],[.46,.42],[.48,.68],[.32,.77]];
gunPanel([[0,.18],[.23,0],[.48,.15],[.79,.03],[.97,.07],[1,.88],[.94,.98],[.56,.99],[.35,.83],[0,.90]],
  vmMats.fieldTan,.057,.112,.291,0,-.046,.250,G,[thumbhole]);
gunLoft(GUN_SECTIONS.stock,vmMats.rubber,.053,.027,.145,0,.009,.305,G);
gunLoft(GUN_SECTIONS.upper,vmMats.rubber,.058,.091,.021,0,-.049,.389,G);
parts.mag=bx(gl,0.022,0.06,0.1, 0,-0.036,0.03,G);
const baA=boltAssembly(G,0.024,0.038,0.05,false);
parts.bolt=baA.bolt; parts.boltHandle=baA.handle;
const syA=scopeTube(G,0,0.09,0.0,0.19,0.021);
sFront_blade(G,gl,0,0.05,-0.86);
sRear_peep(G,gl,0,0.05,0.14);
parts.muzzle.set(0,0.028,-1.07);
mkAnchors(parts,{
ads:adsFromSight(0,syA,-0.22),
rHand:{pos:V3(0.02,-0.06,0.22),rot:V3(0.32,0,0)},
lHand:{pos:V3(-0.012,-0.068,-0.32),rot:V3(0.26,-0.08,0)},
boltHand:baA.knob, magWell:V3(0,-0.036,0.03),
});
} else if(key==='qbz95'){
// QBZ-95: 无托结构, 弹匣在握把后方, 提把内藏准星
gunLoft(GUN_SECTIONS.upper,vmMats.polymer,.066,.090,.398,0,-.009,.061,G);
gunPanel(GUN_OUTLINES.guard,vmMats.polymer,.063,.076,.316,0,-.001,-.275,G,gunVents(3));
gunPanel(GUN_OUTLINES.guard,gm,.032,.065,.356,0,.044,-.131,G,
  [[[.12,.27],[.81,.28],[.87,.68],[.22,.73]]]);
cyl(gm,0.01,0.01,0.3, 0,0.03,-0.52,G);
cyl(gm,0.014,0.011,0.07, 0,0.03,-0.67,G);
gunLoft(GUN_SECTIONS.grip,vmMats.polymer,.041,.091,.062,0,-.065,-.040,G).rotation.x=-.12;
parts.mag=gunPanel(GUN_OUTLINES.magazine,gm,.032,.14,.076,0,-.10,.10,G);
parts.mag.rotation.x=-0.06;
gunLoft(GUN_SECTIONS.upper,vmMats.rubber,.064,.081,.022,0,-.012,.256,G);
sFront_blade(G,gl,0,0.076,-0.52);
sRear_peep(G,gl,0,0.076,0.06);
parts.bolt=bx(gl,0.02,0.016,0.06, 0.03,0.03,-0.20,G);
parts.muzzle.set(0,0.03,-0.70);
mkAnchors(parts,{
ads:adsFromSight(0,0.086,-0.26),
rHand:{pos:V3(0.018,-0.07,0.02),rot:V3(0.34,0,0)},
lHand:{pos:V3(-0.014,-0.09,-0.34),rot:V3(0.3,-0.06,0)},
magWell:V3(0,-0.10,0.10), boltHand:V3(0.04,0.03,-0.20),
});
}
// ============ 兜底: 通用手枪 ============
else {
bx(gm,0.032,0.05,0.19, 0,0.02,-0.02,G);
parts.slide=gunLoft(SLIDE_SECTIONS,gl,0.034,0.032,0.2, 0,0.045,-0.02,G);
gunLoft(GUN_SECTIONS.grip,wdD,0.03,0.09,0.05, 0,-0.04,0.05,G).rotation.x=-0.25;
parts.mag=bx(gm,0.024,0.07,0.036, 0,-0.055,0.048,G);
parts.mag.rotation.x=-0.25;
sFront_blade(G,gl,0,0.061,-0.115);
sRear_notch(G,gl,0,0.06,0.07);
cyl(gm,0.006,0.01,0.03, 0,-0.005,-0.065,G,0.5);
parts.muzzle.set(0,0.045,-0.14);
mkAnchors(parts,{
ads:adsFromSight(0,0.07,-0.24),
rHand:{pos:V3(0.015,-0.06,0.13),rot:V3(0.25,0,0)},
lHand:{pos:V3(-0.03,-0.08,0.1),rot:V3(0.3,0.25,0)},
magWell:V3(0,-0.055,0.048),
});
}
if(parts.slide) parts.slide.userData.z0=parts.slide.position.z;
G.traverse(o=>{ if(o.isMesh){ o.castShadow=false; o.receiveShadow=false; } });
// 机瞄坐标: 后照门优先(瞄具就装在照门所在的机匣导轨上), 没有后照门时用前准星
if(SIGHT_REC.rearPos.length) parts.ironSight=SIGHT_REC.rearPos[0];
else if(SIGHT_REC.frontPos.length) parts.ironSight=SIGHT_REC.frontPos[0];
addModVisuals(parts, modKey);
const rearIron=G.getObjectByName('rearIron');
if(rearIron&&G.userData.scopeLens) rearIron.visible=false;
// ===== 机瞄锚点汇总 =====
// 前准星顶高度优先; 无前准星记录时退回照门高度。供 vmEquip 校准 ADS 锚点,
// 使开镜时准星精确落在屏幕中心(相机射线方向)。
// 装了瞄具就以**瞄具的光学中心**为准 —— 否则开镜会对齐机瞄顶, 而镜体通常比机瞄略低/略高, 看起来是偏的
if(parts.opticSightY!=null){
parts.sightAnchor=V3(0,parts.opticSightY,0);
} else if(SIGHT_REC.front.length||SIGHT_REC.rear.length){
const fy=SIGHT_REC.front.length?Math.max.apply(null,SIGHT_REC.front):null;
const ry=SIGHT_REC.rear.length?Math.max.apply(null,SIGHT_REC.rear):null;
parts.sightAnchor=V3(0, fy!=null?fy:(ry!=null?ry:0), 0);
}
return parts;
}
function buildArms(team){
const sleeve=team===0?vmMats.sleeve0:vmMats.sleeve1;
const mk=side=>{
const g=new THREE.Group();
gunLoft(GUN_SECTIONS.stock,sleeve,.078,.076,.30,0,0,.100,g);
gunLoft(GUN_SECTIONS.upper,vmMats.rubber,.054,.051,.035,0,-.004,-.044,g);
gunLoft(GUN_SECTIONS.grip,vmMats.polymer,.055,.049,.091,0,-.003,-.091,g);
gunLoft(GUN_SECTIONS.grip,vmMats.rubber,.022,.022,.050,side*.022,.008,-.098,g).rotation.y=-side*.40;
return g;
};
return { L:mk(1), R:mk(-1) };
}
function buildNadeModel(team){
const g=new THREE.Group();
if(TEAM_FACTION[team].nade==='egg'){
const b=new THREE.Mesh(new THREE.SphereGeometry(0.032,10,8),vmMats.nade);
b.scale.y=1.25; g.add(b);
bx(vmMats.gunL,0.012,0.03,0.012, 0.012,0.04,0,g);
} else {
cyl(vmMats.nade,0.02,0.02,0.07, 0,0.01,0,g,0);
cyl(vmMats.woodD,0.011,0.011,0.11, 0,-0.07,0,g,0);
}
return g;
}
function buildKnife(){
const g=new THREE.Group();
bx(vmMats.woodD,0.02,0.025,0.09, 0,0,0.045,g);
const blade=bx(new THREE.MeshLambertMaterial({color:0x9aa2a8}),0.006,0.028,0.15, 0,0.004,-0.075,g);
return g;
}
