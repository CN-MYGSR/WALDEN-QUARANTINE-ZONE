'use strict';
const soldiers=[];
const combatants=[];
let gunEvents=[];
function angleLerpTo(cur,tgt,maxStep){
let d=tgt-cur;
while(d>Math.PI)d-=TAU; while(d<-Math.PI)d+=TAU;
return cur+clamp(d,-maxStep,maxStep);
}
function angDiff(a,b){ let d=b-a; while(d>Math.PI)d-=TAU; while(d<-Math.PI)d+=TAU; return d; }
// Eight fabric/equipment swatches in one atlas per active faction. Every soldier
// of the same faction samples the same texture, including its distance mipmaps.
function soldierAtlas(F){
 const modern=F.helmet==='mod', camo=F===FACTIONS.ger||F===FACTIONS.rus;
 const mark=F===FACTIONS.usec?'USEC':F===FACTIONS.pmc?'PMC':F===FACTIONS.ger?'BW':F===FACTIONS.rus?'RG':F.scav?'SCAV':'';
 const random=texRng(8217);
 return makeTex(512,256,ctx=>{
  ctx.scale(2,2);
  const rect=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(x,y,w,h);};
  const seam=(x,y,w,h)=>{ctx.strokeStyle='#c9c6b6';ctx.lineWidth=.7;ctx.setLineDash([1.8,1.4]);ctx.strokeRect(x,y,w,h);ctx.setLineDash([]);};
  for(let tile=0;tile<8;tile++){
   ctx.save();ctx.translate((tile%4)*64,(tile>>2)*64);ctx.beginPath();ctx.rect(0,0,64,64);ctx.clip();
   rect(0,0,64,64,'#dfdfd4');
   if((tile===0||tile===7)&&camo){
    const dyes=['#bbc4ab','#a4ac91','#90917c','#a39a87'];
    for(let i=0;i<78;i++){
     const x=random()*64,y=random()*64,r=.8+random()*2.4;
     ctx.fillStyle=dyes[i%4];
     for(const dx of [-64,0,64])for(const dy of [-64,0,64]){
      ctx.beginPath();ctx.ellipse(x+dx,y+dy,r*1.7,r,-.35,0,TAU);ctx.fill();
     }
    }
   }
   // Twill stays subtle at arm's length and filters out in the distance.
   for(let i=-64;i<64;i+=2){ctx.strokeStyle='rgba(82,75,65,.11)';ctx.lineWidth=.65;ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i+64,64);ctx.stroke();}
   if(tile===2){ // plate carrier: chest ID, bartacked webbing
    seam(4,3,56,57);rect(9,9,32,8,'#777e70');
    if(mark){ctx.font='bold 7px monospace';ctx.textAlign='center';ctx.fillStyle='#deded0';ctx.fillText(mark,25,15);}
    for(const y of [24,34,44,54]){
     rect(4,y,56,4,'#b2b2a5');rect(4,y,56,.8,'#e8e7d9');
     for(const x of [12,25,38,51])rect(x,y,.9,4,'#7a8075');
    }
   }else if(tile===3){ // folded pouch flap and fastening
    rect(2,2,60,25,'#babbb0');rect(3,27,58,3,'#73766b');seam(4,4,56,20);
    rect(27,15,10,28,'#96998a');rect(29,27,6,6,'#666d60');rect(29,27,6,1,'#cccfbf');
    seam(5,34,54,27);
   }else if(tile===4){ // backpack lid, vertical straps, bottom pocket
    rect(2,3,60,17,'#acafa0');seam(4,5,56,13);rect(5,36,54,23,'#b9bbab');seam(8,39,48,16);
    for(const x of [12,46]){rect(x,3,5,55,'#747a70');rect(x-1,25,7,7,'#515852');rect(x,27,5,2,'#cccec1');}
   }else if(tile===5){ // reinforced boot and knee panels
    for(let y=8;y<48;y+=7){rect(10,y,44,2,'#90958d');rect(12,y+2,40,1,'#e1e2d6');}
    rect(0,53,64,11,'#676e67');rect(0,53,64,2,'#abad9f');
   }else if(tile===6){ // field radio
    rect(6,6,50,15,'#666e67');for(let y=28;y<=52;y+=5)rect(11,y,42,2,'#777e76');
   }else if(tile===7&&modern){ // subdued unit flash on upper sleeve
    rect(16,17,32,25,'#727970');seam(18,19,28,21);
    const stripes=F===FACTIONS.ger?['#3f4241','#aa7462','#ccbc86']:['#c0c6bd','#979f94','#c0c6bd'];
    stripes.forEach((c,i)=>rect(22,22+i*5,20,4,c));
   }
   ctx.restore();
  }
 });
}
const uniformMats=TEAM_FACTION.map(F=>{
 const map=soldierAtlas(F), cloth=color=>new THREE.MeshLambertMaterial({color,map});
 const black=F===FACTIONS.usec, sand=F===FACTIONS.pmc;
 return {
  coat:cloth(F.coat),pants:cloth(F.pants),helm:new THREE.MeshLambertMaterial({color:F.helm}),
  cover:cloth(black?0x343c40:sand?0x797158:0x606756),wrap:cloth(black?0x343b3c:sand?0x6c6657:0x596152),
  skin:new THREE.MeshLambertMaterial({color:F.skin}), boot:cloth(black?0x33383a:0x49453a),
  equipment:new THREE.MeshLambertMaterial({map,vertexColors:true}),
  carrier:black?0x455057:sand?0xa18b64:0x717b61, web:black?0x323a3e:sand?0x756445:0x4b5544
 };
});
// All dimensions are in metres. Each ring contains height, half-width,
// half-depth, and optional forward offset. Rig pivots stay in their original places.
function soldierDetail(parent,near,far,distance=24){
 const lod=new THREE.LOD();lod.addLevel(near,0);lod.addLevel(far,distance,.12);
 parent.add(lod);return lod;
}
function soldierProfile(parent,material,rings,tile=0,sides=8){
 const g=new THREE.CylinderGeometry(1,1,1,sides,rings.length-1,false,Math.PI/sides);
 const p=g.attributes.position,uv=g.attributes.uv,corner=Math.cos(Math.PI/sides)**.7;
 const curve=v=>Math.sign(v)*Math.abs(v)**.7/corner;
 for(let i=0;i<p.count;i++){
  const r=rings[Math.round((p.getY(i)+.5)*(rings.length-1))];
  p.setXYZ(i,curve(p.getX(i))*r[1],r[0],curve(p.getZ(i))*r[2]+(r[3]||0));
  const swatch=tile===7&&Math.abs(g.attributes.normal.getY(i))>.9?0:tile;
  uv.setXY(i,(swatch%4+.02+.96*uv.getX(i))/4,(1-(swatch>>2)+.02+.96*uv.getY(i))/2);
 }
 g.computeVertexNormals();
 const mesh=new THREE.Mesh(g,material);
 // The helmet has its own detachable shell and fittings. Distant articulated
 // limbs need only a tapered box; the silhouette still follows every joint.
 if(sides===12){parent.add(mesh);return mesh;}
 const low=new THREE.BoxGeometry(),fp=low.attributes.position,fu=low.attributes.uv;
 const widest=Math.max(...rings.map(r=>r[1])),deepest=Math.max(...rings.map(r=>r[2]));
 for(let i=0;i<fp.count;i++){
  const r=fp.getY(i)>0?rings[rings.length-1]:rings[0];
  fp.setXYZ(i,2*fp.getX(i)*Math.max(r[1],widest*.82),r[0],2*fp.getZ(i)*Math.max(r[2],deepest*.82)+(r[3]||0));
  fu.setXY(i,(tile%4+.02+.96*fu.getX(i))/4,(1-(tile>>2)+.02+.96*fu.getY(i))/2);
 }
 low.computeVertexNormals();
 soldierDetail(parent,mesh,new THREE.Mesh(low,material));
 return mesh;
}
const soldierBoxData=new THREE.BoxGeometry().toNonIndexed().attributes;
// Static pieces that move with the same joint share one draw call. Each entry
// is [width,height,depth, x,y,z, colour, face swatch, optional roll and pitch].
function soldierPanels(material,parts){
 const positions=[],normals=[],colors=[],uvs=[],tint=new THREE.Color();
 const {position:p,normal:n,uv}=soldierBoxData;
 for(const [w,h,d,x,y,z,color,tile=1,tilt=0,pitch=0] of parts){
  const s=Math.sin(tilt),c=Math.cos(tilt),sp=Math.sin(pitch),cp=Math.cos(pitch);tint.set(color);
  for(let i=0;i<p.count;i++){
   const py=p.getY(i)*h,pz=p.getZ(i)*d,nx=n.getX(i),ny=n.getY(i),nz=n.getZ(i);
   const tapered=(tile===2||tile===4)&&py>0||tile===5&&py<0;
   const px=p.getX(i)*w*(tapered?.81:1),yy=cp*py-sp*pz,nny=cp*ny-sp*nz;
   positions.push(x+c*px-s*yy,y+s*px+c*yy,z+sp*py+cp*pz);
   normals.push(c*nx-s*nny,s*nx+c*nny,sp*ny+cp*nz);colors.push(tint.r,tint.g,tint.b);
   const swatch=Math.abs(nz)>.5||tile===3&&w<d&&Math.abs(nx)>.5?tile:1;
   uvs.push((swatch%4+.02+.96*uv.getX(i))/4,(1-(swatch>>2)+.02+.96*uv.getY(i))/2);
  }
 }
 const g=new THREE.BufferGeometry();
 for(const [name,values,size] of [['position',positions,3],['normal',normals,3],['color',colors,3],['uv',uvs,2]]){
  g.setAttribute(name,new THREE.Float32BufferAttribute(values,size));
 }
 return new THREE.Mesh(g,material);
}
const soldierGunFinish=new THREE.MeshLambertMaterial({vertexColors:true});
// 人物手中的枪只保留大的色块和轮廓。每个部件只取三个截面，整枪一次绘制。
function soldierGunShell(pieces){
  const positions=[],colors=[];
  for(const [form,mat,w,h,d,y,z] of pieces){
    const middle=form[Math.floor(form.length/2)];
    const vertices=gunLoftVertices([form[0],middle,form[form.length-1]],w,h,d,0,y,z);
    positions.push(...vertices);
    const c=mat.color;
    for(let i=0;i<vertices.length;i+=3) colors.push(c.r,c.g,c.b);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry,soldierGunFinish);
}
function worldGunModel(kind,team,key){
const g=new THREE.Group();
const gm=vmMats.gun, wd=vmMats.wood;
const def=WPN_DEFS[key],wg=def&&def.wg;
const {upper,grip,bed,stock}=GUN_SECTIONS;
const modern=ARSENAL_ERA[key]==='modern';
const poly=vmMats.polymer,steel=vmMats.gunL;
if(def&&def.pistol){
 const finish=key==='p320'?vmMats.fieldTan:modern?poly:wd;
 const length=(key==='deagle'||key==='c96') ? .225 : .175;
 g.add(soldierGunShell([[upper,gm,.037,.045,length,.013,-.044],
   [upper,steel,.035,.029,length,.043,-.048],[grip,finish,.035,.092,.056,-.044,.013]]));
} else if(def&&(kind==='rifle'||(modern&&kind!=='launcher'))){
 const compact=key==='mp5'||key==='pp19'||key==='aks74u';
 const bullpup=key==='qbz95';
 const fore=compact ? .135 : .218;
 const barrel=def.scoped ? .33 : (compact ? .077 : .158);
 const finish=({svd:wd,aks74u:wd,g28:vmMats.fieldTan,qbz191:vmMats.fieldTan,awm:vmMats.fieldTan})[key]
   ||(modern?poly:wd);
 const pieces=[
   [upper,gm,.054,.059,.22,.009,.005],
   [bed,finish,.055,.062,fore,.001,-.100-fore/2],
   [upper,steel,.022,.023,barrel,.015,-.100-fore-barrel/2],
   [stock,finish,.053,.094,.207,-.025,.199]
 ];
 if(modern){
   pieces.push([grip,poly,.036,.094,.054,-.062,bullpup?-.030:.057],
     [grip,gm,.033,.127,.069,-.082,bullpup ? .108 : -.063]);
 }
 if(def.scoped) pieces.push([upper,gm,.043,.043,.182,.072,.013],[upper,steel,.023,.035,.048,.045,.024]);
 else if(key==='g36c'||bullpup) pieces.push([bed,gm,.034,.033,.203,.054,-.042]);
 g.add(soldierGunShell(pieces));
} else if(kind==='smg'){
bx(gm,0.05,0.06,0.5,0,0,-0.1,g);
if(wg==='drum') { const d2=cyl(gm,0.075,0.075,0.05, 0,-0.1,-0.1,g,0); d2.rotation.z=HPI; }
else if(wg==='sidemag') bx(gm,0.16,0.028,0.05, -0.11,0.01,-0.12,g);
else if(wg==='c96a') bx(gm,0.026,0.1,0.05, 0,-0.08,-0.05,g);
else bx(gm,0.024,0.14,0.05,0,-0.09,-0.12,g);
} else if(kind==='mg'){
bx(gm,0.06,0.07,0.8,0,0,-0.15,g);
bx(wd,0.05,0.09,0.18,0,-0.04,0.28,g);
if(wg==='pan'){ cyl(gm,0.085,0.085,0.026, 0,0.075,-0.12,g,0); } // DP弹盘平放
else if(wg==='topmag') bx(gm,0.026,0.15,0.06, 0,0.13,-0.12,g);
else if(wg==='hopper') bx(gm,0.055,0.09,0.08, -0.06,0.06,-0.05,g);
cyl(gm,0.008,0.008,0.22, 0.035,-0.1,-0.42,g,0.3);
cyl(gm,0.008,0.008,0.22, -0.035,-0.1,-0.42,g,0.3);
} else if(kind==='atr'){
// 反坦克枪: 超长枪身
bx(gm,0.055,0.07,0.5, 0,0,0.08,g);
cyl(gm,0.017,0.017,0.85, 0,0.02,-0.6,g);
bx(gm,0.06,0.05,0.07, 0,0.02,-1.0,g);
bx(wd,0.045,0.08,0.18, 0,-0.04,0.32,g);
cyl(gm,0.008,0.008,0.26, 0.04,-0.1,-0.66,g,0.3);
cyl(gm,0.008,0.008,0.26, -0.04,-0.1,-0.66,g,0.3);
} else if(kind==='mortar'){
// 迫击炮: 背负式短管+座钣
const tube=cyl(gm,0.05,0.055,0.7, 0,0.08,-0.1,g);
tube.rotation.x=HPI-0.5;
bx(gm,0.24,0.03,0.28, 0,-0.1,0.1,g);
cyl(gm,0.01,0.01,0.34, 0.1,-0.02,-0.25,g,0.9);
cyl(gm,0.01,0.01,0.34, -0.1,-0.02,-0.25,g,0.9);
} else if(kind==='launcher'){
const tubeMat=new THREE.MeshLambertMaterial({color:team===0?0x4a5238:0x52524a});
tubeMat.userData.perSoldier=true;
const tube=cyl(tubeMat,0.075,0.075,1.5, 0,0.12,-0.15,g);
cyl(gm,0.085,0.078,0.09, 0,0.12,-0.86,g);
cyl(gm,0.085,0.078,0.08, 0,0.12,0.52,g);
bx(wd,0.04,0.08,0.06, 0,-0.02,0.02,g);
if(team===1) bx(vmMats.gunL,0.34,0.3,0.015, 0.02,0.1,-0.4,g);
} else {
bx(wd,0.05,0.07,0.75,0,0,-0.05,g);
cyl(gm,0.012,0.012,0.3,0,0.02,-0.55,g);
bx(wd,0.05,0.09,0.2,0,-0.05,0.32,g);
}
g.traverse(o=>{ if(o.isMesh) o.castShadow=true; });
return g;
}
function gunKindOf(key){
let d=WPN_DEFS[key];
if(d.model){ key=d.model; d=WPN_DEFS[key]; }
if(d.rocket) return 'launcher';
if(d.mortar) return 'mortar';
if(d.atRifle) return 'atr';
if(d.pistol) return 'smg';
if(key==='bar'||key==='stg44'||d.wg==='pan'||d.wg==='topmag'||d.wg==='hopper') return 'mg';
if(d.type==='auto') return 'smg';
return 'rifle';
}
// 表情共享一张图集，各面部平面独立选择 UV 格，换表情不重传贴图。
// 8 状态: normal blink aim(瞄准眯眼) pain(痛苦) fear(恐惧) sideL/sideR(侧瞟) dead
const FACE_STATES={normal:[0,0],blink:[1,0],aim:[2,0],pain:[3,0],fear:[0,1],sideL:[1,1],sideR:[2,1],dead:[3,1]};
const FACE_TEX=(function(){
const eyeL=17, eyeR=47, eyeY=26, mouthY=49;
const planes='<path fill="#513a31" opacity=".12" d="M3 13l21 2 5 11-9 5-13-3z M61 13l-21 2-5 11 9 5 13-3z M5 35l13 4 4 10-8-5z M59 35l-13 4-4 10 8-5z"/><path fill="#44392e" opacity=".12" d="M8 46l9 6 14 2 15-2 10-8-4 12-13 6H25L12 56z"/>';
const cell=(cx,cy,body)=>`<g transform="translate(${cx*64},${cy*64})">${planes}${body}</g>`;
const brow=(x,y,tilt,len=13)=>`<path d="M${x-len/2} ${y+3+tilt} q5 -3 ${len} ${-2*tilt}" stroke="#4c3a2f" stroke-width="2.4" fill="none"/>`;
const eyeOpen=(x,px,height=2.2)=>`<path d="M${x-6.5} ${eyeY}q6 -${height*1.8} 13 0q-6 ${height*1.5} -13 0" fill="#bcafa0"/><ellipse cx="${x+px}" cy="${eyeY}" rx="2" ry="${height}" fill="#443b34"/><path d="M${x-6.5} ${eyeY}q6 -${height*1.8} 13 0" fill="none" stroke="#4a3b32" stroke-width="1.6"/>`;
const eyeWide=(x,px)=>eyeOpen(x,px,3.1);
const eyeShut=x=>`<path d="M${x-6} ${eyeY}q5 2 12 0" stroke="#584437" stroke-width="1.8" fill="none"/>`;
const eyeSquint=x=>eyeOpen(x,0,1);
const mouthFlat=`<path d="M25 ${mouthY} h14" stroke="#5a3a2c" stroke-width="2.2" stroke-linecap="round"/>`;
const mouthTight=`<path d="M27 ${mouthY} h10" stroke="#5a3a2c" stroke-width="2.6" stroke-linecap="round"/>`;
const mouthGrit=`<path d="M24 ${mouthY+2}q6 -5 15 -1l-2 2-10 1z" fill="#62483d"/>`;
const mouthO=`<ellipse cx="32" cy="${mouthY}" rx="4" ry="2.7" fill="#64483c"/>`;
const mouthSlack=`<path d="M26 ${mouthY} Q 32 ${mouthY+5} 38 ${mouthY}" stroke="#4a3226" stroke-width="2.2" fill="none"/>`;
const nose='<path d="M31 22l-3 15 5 3 5-2-3-1-2-11z" fill="#735746" opacity=".36"/><path d="M26 39l3 1m5 0 3-1" stroke="#674c3c" stroke-width="1.4"/>';
let svg='';
svg+=cell(0,0, brow(eyeL,15,1)+brow(eyeR,15,-1)+eyeOpen(eyeL,0)+eyeOpen(eyeR,0)+nose+mouthFlat);
svg+=cell(1,0, brow(eyeL,15,1)+brow(eyeR,15,-1)+eyeShut(eyeL)+eyeShut(eyeR)+nose+mouthFlat);
svg+=cell(2,0, brow(eyeL,13,3)+brow(eyeR,13,-3)+eyeSquint(eyeL)+eyeOpen(eyeR,0)+nose+mouthTight);
svg+=cell(3,0, brow(eyeL,12,5)+brow(eyeR,12,-5)+eyeShut(eyeL)+eyeShut(eyeR)+nose+mouthGrit);
svg+=cell(0,1, brow(eyeL,11,-3)+brow(eyeR,11,3)+eyeWide(eyeL,0)+eyeWide(eyeR,0)+nose+mouthO);
svg+=cell(1,1, brow(eyeL,14,0)+brow(eyeR,14,0)+eyeOpen(eyeL,-2.6)+eyeOpen(eyeR,-2.6)+nose+mouthFlat);
svg+=cell(2,1, brow(eyeL,14,0)+brow(eyeR,14,0)+eyeOpen(eyeL,2.6)+eyeOpen(eyeR,2.6)+nose+mouthFlat);
svg+=cell(3,1, brow(eyeL,17,2)+brow(eyeR,17,-2)+eyeShut(eyeL)+eyeShut(eyeR)+nose+mouthSlack);
const t=svgTex(256,128,svg,1,1,null);
t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;
return t;
})();
const soldierFaceMat=new THREE.MeshLambertMaterial({map:FACE_TEX,transparent:true,depthWrite:false});
function addFace(headG){
const m=new THREE.Mesh(new THREE.PlaneGeometry(0.158,0.165),soldierFaceMat);
m.position.set(0,0.102,0.104);
m.castShadow=false; m.receiveShadow=false;
m.renderOrder=1;
soldierDetail(headG,m,new THREE.Group(),28);
const face={mesh:m,tex:FACE_TEX,state:''};
const uv=m.geometry.attributes.uv;
uv.setUsage(THREE.DynamicDrawUsage);
face.set=(st)=>{
if(face.state===st||!FACE_STATES[st]) return;
face.state=st;
const [col,row]=FACE_STATES[st];
for(let i=0;i<4;i++)uv.setXY(i,(col+(i%2))/4,(1-row+(i<2?1:0))/2);
uv.needsUpdate=true;
};
face.set('normal');
return face;
}
// armorKey / chestKey: 可选, 只有玩家侧调用才传 (见下方「护具配色」的三种情况说明)。
function buildSoldierMesh(team,name,armorKey,chestKey){
const U=uniformMats[team];
const root=new THREE.Group();
const helmParts=[];
const hAdd=(mesh)=>{ helmParts.push(mesh); return mesh; };
const pelvis=new THREE.Group(); pelvis.position.y=0.94; root.add(pelvis);
const torsoG=new THREE.Group(); pelvis.add(torsoG);
// ---- 护具配色 ----
// ⚠️ 必须区分三种情况, 否则 NPC 会全变成游骑兵黄:
//   armorKey === undefined → **没传参**(所有 Bot) → 用阵营制服色, 保持原样
//   armorKey === ''        → **明确没穿护具**(玩家) → 游骑兵黄
//   armorKey 有效          → 用那件护甲的颜色
// 躯干颜色优先级: **胸挂 > 护甲 > 游骑兵黄**
//   (胸挂穿在护甲外面, 观感上是最外层 —— 穿黑胸挂时躯干就该是黑的)
const _AD=(typeof ARMOR_DEFS!=='undefined')?ARMOR_DEFS:{};
const _CD=(typeof CHEST_DEFS!=='undefined')?CHEST_DEFS:{};
const _RY=(typeof RANGER_YELLOW!=='undefined')?RANGER_YELLOW:0xc8a03c;
const _ar=(armorKey&&_AD[armorKey])?_AD[armorKey]:null;
const _cr=(chestKey&&_CD[chestKey])?_CD[chestKey]:null;
const _bodyCol=(armorKey===undefined)?U.coat.color
  :(_cr?(_cr.hex!=null?_cr.hex:_RY):(_ar?(_ar.color!=null?_ar.color:_RY):_RY));
const _bodyMat=armorKey===undefined?U.coat:new THREE.MeshLambertMaterial({color:_bodyCol});
if(_bodyMat!==U.coat)_bodyMat.userData.perSoldier=true;
soldierProfile(torsoG,_bodyMat,[
 [-.025,.165,.104],[.08,.188,.115],[.27,.18,.125],[.47,.222,.139],
 [.535,.213,.117],[.593,.092,.086]
]);
const hs=TEAM_FACTION[team].helmet, modern=hs==='mod';
const shell=armorKey===undefined?U.carrier:_bodyCol;
const plate=(_ar&&_ar.color!=null)?_ar.color:shell, web=U.web;
const kit=[
 [.37,.067,.24,0,.035,0,web],                    // waist belt
 [.29,.31,.13,0,.317,-.171,shell,4],             // field pack
 [.257,.087,.14,0,.477,-.169,shell,4]            // pack lid
];
const trim=[
 [.075,.046,.018,0,.038,.125,0x7c8177],
 [.093,.14,.11,-.171,.097,-.052,web,3],
 [.047,.13,.028,-.12,.505,.123,web,1,-.19,-.45],
 [.047,.13,.028,.12,.505,.123,web,1,.19,-.45],
 [.207,.118,.051,0,.243,-.241,web,3],
 [.061,.164,.104,.147,.323,-.174,web,3]
];
if((modern&&armorKey===undefined)||_ar||_cr){
 kit.push([.32,.32,.06,0,.334,.125,plate,2]);
 for(const x of [-.105,0,.105])trim.push([.091,.132,.064,x,.208,.163,shell,3]);
 if(modern){
  trim.push([.052,.1,.047,-.153,.386,.133,0x4c5149,6],
   [.009,.09,.012,-.169,.467,.124,0x444940]);
 }
}
if(_ar){
 const lv=_ar.level||1;
 if(lv>=3)kit.push([.28,.28,.05,0,.34,-.15,plate],[.07,.05,.28,-.13,.54,0,plate],[.07,.05,.28,.13,.54,0,plate]);
 if(lv>=5)kit.push([.13,.10,.25,-.20,.5,0,plate],[.13,.10,.25,.20,.5,0,plate],[.19,.13,.045,0,.065,.13,plate]);
 if(lv>=6)kit.push([.05,.26,.22,-.22,.32,0,plate],[.05,.26,.22,.22,.32,0,plate]);
}
// Under a few screen pixels the pouch and strap relief is cheaper as baked cloth.
soldierDetail(torsoG,soldierPanels(U.equipment,kit.concat(trim)),soldierPanels(U.equipment,kit));
const headG=new THREE.Group(); headG.position.set(0,0.62,0); torsoG.add(headG);
soldierProfile(headG,U.skin,[[-.065,.059,.061],[-.006,.061,.065],[.021,.07,.083,.006],
 [.077,.095,.102],[.149,.104,.102],[.218,.09,.092]]);
const face=addFace(headG);
if(modern){
 const high=TEAM_FACTION[team]===FACTIONS.usec;
 soldierProfile(headG,U.wrap,[[-.077,.077,.079],[-.051,.091,.095],[-.01,.08,.094],
  [.025,.084,.103],[high?.093:.048,high?.098:.083,high?.113:.106]],1);
}
// 阵营特色头盔/军帽 (全部纳入 helmParts, 死亡时整体物理脱落)
let helm;
if(hs==='pot'){
helm=new THREE.Mesh(new THREE.SphereGeometry(0.15,10,8,0,TAU,0,HPI*1.2),U.helm);
helm.position.set(0,0.16,0);
headG.add(hAdd(helm));
} else if(hs==='stahl'){
helm=new THREE.Mesh(new THREE.SphereGeometry(0.155,10,8,0,TAU,0,HPI*1.35),U.helm);
helm.position.set(0,0.15,0); helm.scale.z=1.15;
headG.add(hAdd(helm));
// 国军M35: 正面青天白日徽
if(TEAM_FACTION[team].sym==='✷'){
headG.add(hAdd(bx(new THREE.MeshLambertMaterial({color:0x2050b0}),0.032,0.032,0.008, 0,0.17,0.148)));
headG.add(hAdd(bx(new THREE.MeshLambertMaterial({color:0xe8e8e8}),0.016,0.016,0.01, 0,0.17,0.15)));
}
} else if(hs==='ssh'){
helm=new THREE.Mesh(new THREE.SphereGeometry(0.152,10,8,0,TAU,0,HPI*1.28),U.helm);
helm.position.set(0,0.155,0); helm.scale.y=1.1;
headG.add(hAdd(helm));
} else if(hs==='jp'){
helm=new THREE.Mesh(new THREE.SphereGeometry(0.142,10,8,0,TAU,0,HPI*1.22),U.helm);
helm.position.set(0,0.165,0);
headG.add(hAdd(helm));
const brim=new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.17,0.025,10),U.helm);
brim.position.set(0,0.1,0); headG.add(hAdd(brim));
headG.add(hAdd(bx(new THREE.MeshLambertMaterial({color:0xd8b840}),0.02,0.024,0.008, 0,0.16,0.135)));
} else if(hs==='mod'){
// Keep the brow above the eyes while dropping the rear edge over the nape.
helm=soldierProfile(headG,U.cover,[[.132,.133,.142],[.154,.146,.153],
 [.216,.139,.145],[.265,.108,.118],[.289,.062,.067]],0,12);
const helmetPos=helm.geometry.attributes.position;
for(let i=0;i<helmetPos.count;i++){
 const y=helmetPos.getY(i);
 if(y<.17)helmetPos.setY(i,y+helmetPos.getZ(i)*.30);
}
helm.geometry.computeVertexNormals();
const distantShell=new THREE.Mesh(new THREE.SphereGeometry(1,8,3,0,TAU,0,HPI*1.12),U.helm);
distantShell.scale.set(.146,.15,.154);distantShell.position.y=.14;
hAdd(soldierDetail(headG,helm,distantShell));
const trimColor=TEAM_FACTION[team]===FACTIONS.usec?0x353d40:0x51594c;
const fittings=soldierPanels(U.equipment,[
 [.066,.049,.019,0,.204,.146,trimColor,6],
 [.029,.07,.081,-.114,.119,-.015,trimColor,6],[.029,.07,.081,.114,.119,-.015,trimColor,6],
 [.014,.115,.024,-.082,.074,.049,web,1,-.40],[.014,.115,.024,.082,.074,.049,web,1,.40]
]);
hAdd(soldierDetail(headG,fittings,new THREE.Group()));
} else {
// 八路军帽: 布帽+短帽檐(朝前)+红星
headG.add(hAdd(bx(U.helm,0.21,0.09,0.21, 0,0.19,0)));
headG.add(hAdd(bx(U.helm,0.18,0.028,0.07, 0,0.155,0.12)));
headG.add(hAdd(bx(new THREE.MeshLambertMaterial({color:0xc03028}),0.024,0.024,0.008, 0,0.19,0.106)));
}
const mkArm=(side)=>{
const sh=new THREE.Group(); sh.position.set(side*0.28,0.5,0); torsoG.add(sh);
soldierProfile(sh,U.coat,[[-.32,.061,.063],[-.22,.074,.079],[-.063,.089,.09],[.025,.063,.072]],modern?7:0);
const el=new THREE.Group(); el.position.y=-0.32; sh.add(el);
soldierProfile(el,U.coat,[[-.276,.052,.049],[-.21,.055,.061],[-.071,.067,.075],[.008,.06,.065]]);
const hand=new THREE.Group(); hand.position.y=-0.3; el.add(hand);
soldierProfile(hand,modern?U.boot:U.skin,[[-.055,.038,.042],[-.022,.049,.057],[.044,.04,.04]],1);
sh.userData.swing=0;
return {sh,el,hand};
};
const armL=mkArm(-1), armR=mkArm(1);
const mkLeg=(side)=>{
const hip=new THREE.Group(); hip.position.set(side*0.12,0,0); pelvis.add(hip);
soldierProfile(hip,U.pants,[[-.46,.066,.081,.004],[-.34,.08,.094],[-.13,.101,.111],[.026,.092,.10]]);
if(modern){
 const pads=soldierPanels(U.equipment,[
  [.042,.126,.117,side*.087,-.191,0,web,3],
  [.112,.093,.031,0,-.407,.078,web,5]
 ]);
 soldierDetail(hip,pads,new THREE.Group(),20);
}
const knee=new THREE.Group(); knee.position.y=-0.46; hip.add(knee);
soldierProfile(knee,U.pants,[[-.37,.059,.062,-.01],[-.21,.075,.09,-.018],[-.072,.078,.086],[.005,.066,.078]]);
soldierProfile(knee,U.boot,[[-.487,.078,.132,.047],[-.451,.081,.135,.046],[-.413,.074,.117,.039],[-.369,.062,.077],[-.264,.064,.071]],5);
return {hip,knee};
};
const legL=mkLeg(-1), legR=mkLeg(1);
const gunG=new THREE.Group(); gunG.position.set(0.14,0.4,0.1); gunG.rotation.order='YXZ'; torsoG.add(gunG);
root.traverse(o=>{ if(o.isMesh) o.castShadow=o!==face.mesh; });
const c=document.createElement('canvas'); c.width=128; c.height=32;
const g2=c.getContext('2d');
g2.font='bold 20px sans-serif'; g2.textAlign='center';
g2.fillStyle=team===0?'#a8ccff':'#ffb3a6';
g2.strokeStyle='rgba(0,0,0,.8)'; g2.lineWidth=4;
g2.strokeText(name,64,22); g2.fillText(name,64,22);
const tag=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthTest:false}));
tag.scale.set(0.9,0.22,1); tag.position.y=2.05; tag.renderOrder=5;
root.add(tag);
scene.add(root);
return {root,pelvis,torsoG,headG,armL,armR,legL,legR,gunG,tag,helmParts,face,bodyMat:_bodyMat,armorKey:armorKey||''};
}
