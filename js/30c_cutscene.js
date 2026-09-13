'use strict';
// ===== 过场动画系统 =====
// 三段动画: 开场(诺曼底美军=登陆艇抢滩, 其他=战场航拍) / 部署(黑场过渡) / 结束(镜头环绕+胜负标题)
const CUT={ active:false, kind:'', t:0, dur:0, done:null, scene:null, cam:null, boat:null,
engine:null, pts:[], center:V3(), skip:false, lb:0 };
function cutPlaying(){ return CUT.active&&CUT.kind!=='deploy'; }
function cutFinish(){
if(CUT.engine){ try{ CUT.engine.stop(); }catch(e){} CUT.engine=null; }
CUT.active=false;
document.body.classList.remove('cutOn');
const ov=el('cutOv');
if(ov) ov.style.display='none';
el('cutTitle').style.opacity=0; el('cutSub').style.opacity=0; el('cutSkip').style.opacity=0;
el('lbTop').style.height='0'; el('lbBot').style.height='0';
el('blackOv').style.opacity=0; el('stormOv').style.opacity=0;
const done=CUT.done; CUT.done=null;
if(done) done();
}
// ===== 开场: 诺曼底美军 登陆艇抢滩 =====
function startBoatCut(){
CUT.kind='boat'; CUT.t=0; CUT.dur=26; CUT.skip=false;
if(!CUT.scene){
CUT.scene=new THREE.Scene();
CUT.scene.fog=new THREE.Fog(NIGHT?NIGHT_FOG:0x9db2c4,30,720);
CUT.scene.add(new THREE.HemisphereLight(NIGHT?NIGHT_HEMI[0]:0xdce8f4,NIGHT?NIGHT_HEMI[1]:0x5a6a72,NIGHT?NIGHT_HEMI[2]:0.9));
const dl=new THREE.DirectionalLight(NIGHT?NIGHT_SUN:0xffeed0,NIGHT?Math.max(KEY_BASE,0.28):1.7); dl.position.set(-250,320,120); CUT.scene.add(dl);
// 天空(复用主场景天空纹理)
const sky2=new THREE.Mesh(SKY.geometry,new THREE.MeshBasicMaterial({map:SKY.material.map,side:THREE.BackSide,fog:false}));
sky2.scale.setScalar(2); CUT.scene.add(sky2);
CUT.cam=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,0.1,2000);
CUT.cam.position.set(0,1.6,0);
// 海洋
const oc=document.createElement('canvas'); oc.width=64; oc.height=64;
const og=oc.getContext('2d');
og.fillStyle='#3a5a66'; og.fillRect(0,0,64,64);
for(let i=0;i<10;i++){
og.strokeStyle='rgba(160,200,215,'+(0.18+Math.random()*0.2)+')';
og.lineWidth=1+Math.random()*2;
og.beginPath();
const yy=i*6.4+Math.random()*3;
og.moveTo(0,yy+Math.sin(i)*3); og.lineTo(64,yy+Math.sin(i*0.7+2)*3); og.stroke();
}
const otex=new THREE.CanvasTexture(oc);
otex.wrapS=otex.wrapT=THREE.RepeatWrapping; otex.repeat.set(30,30);
const oPlane=new THREE.Mesh(new THREE.PlaneGeometry(1600,1600),new THREE.MeshLambertMaterial({map:otex}));
oPlane.rotation.x=-HPI; oPlane.position.y=-0.3; CUT.scene.add(oPlane);
CUT.oceanTex=otex;
// 登陆艇
const b={ t:0, x:-430, y:0.5, yaw:0, roll:0, pitch:0, grp:new THREE.Group(), sols:[], solY0:[] };
const g=b.grp;
const hm=new THREE.MeshLambertMaterial({color:0x5a6b5a});
const wm=new THREE.MeshLambertMaterial({color:0x6a5f4a});
const dm=new THREE.MeshLambertMaterial({color:0x4a554a});
bx(hm,2.6,0.8,6.8, 0,0.4,0, g);       // 船体
bx(hm,2.2,0.5,1.8, 0,0.95,-3.5, g);   // 艏跳板
bx(hm,0.14,0.75,6.8, -1.3,1.0,0, g);  // 左舷
bx(hm,0.14,0.75,6.8, 1.3,1.0,0, g);   // 右舷
bx(hm,2.6,0.55,0.4, 0,1.05,3.45, g);  // 艉板
bx(wm,2.2,0.06,5.2, 0,1.06,-0.8, g);  // 甲板
for(let i=0;i<3;i++) bx(wm,2.05,0.1,0.26, 0,1.24, -2.1+i*1.5, g); // 长凳
bx(dm,0.9,0.75,1.0, 0,1.05,3.2, g);   // 发动机舱
const US_NAMES_LOCAL=['米勒','雷本','杰克逊','霍瓦特','梅利什','厄本'];
const seatPos=[[-0.62,1.06,-2.1],[0.62,1.06,-2.1],[-0.62,1.06,-0.6],[0.62,1.06,-0.6],[-0.62,1.06,0.9],[0.62,1.06,0.9]];
seatPos.forEach((p,i)=>{
const m2=buildSoldierMesh(0,US_NAMES_LOCAL[i%US_NAMES_LOCAL.length]);
scene.remove(m2.root);
m2.root.position.set(p[0],p[1],p[2]);
m2.root.rotation.y=HPI;
CUT.scene.add(m2.root);
b.sols.push(m2.root); b.solY0.push(p[1]);
});
CUT.scene.add(g);
b.grp.position.set(b.x,b.y,b.z);
CUT.boat=b;
CUT.engine=AudioSys.createEngine('tank');
}
document.body.classList.add('cutOn');
el('cutTitle').textContent='诺曼底 · 抢滩登陆';
el('cutTitle').style.color='';
el('cutSub').textContent='D-DAY 1944 · '+CAMPAIGN.sub;
el('cutSkip').textContent='空格 / Esc / 点击 跳过';
el('cutSkip').style.display='';
el('cutOv').style.display='block';
}
function updateBoatCut(dt){
const b=CUT.boat;
b.t+=dt;
b.x+=dt*6.8;
b.y=0.5+Math.sin(b.t*1.15)*0.22+Math.sin(b.t*0.72+1)*0.1;
b.roll=Math.sin(b.t*0.82)*0.03+Math.sin(b.t*1.6+2)*0.02;
b.pitch=Math.sin(b.t*0.9+1)*0.015+0.01;
b.yaw=Math.sin(b.t*0.21)*0.05;
b.grp.position.set(b.x,b.y,b.z);
b.grp.rotation.set(b.pitch,b.yaw,b.roll);
for(let i=0;i<b.sols.length;i++){ b.sols[i].position.y=b.solY0[i]+Math.sin(b.t*1.6+i*1.3)*0.035; }
CUT.cam.position.set(b.x+2.0*Math.sin(b.yaw), b.y+1.55, b.z+2.0*Math.cos(b.yaw));
CUT.cam.lookAt(b.x+Math.sin(b.yaw)*45, b.y+1.5, b.z+Math.cos(b.yaw)*45);
if(CUT.engine) CUT.engine.update(88+Math.sin(b.t*7)*7,0.13);
if(Math.random()<dt*0.5) AudioSys.explosion(rand(40,150));
if(Math.random()<dt*0.7) AudioSys.gunshot(Math.random()<0.5?'rifle':'mg',rand(40,140));
CUT.oceanTex.offset.x+=dt*0.03; CUT.oceanTex.offset.y+=dt*0.008;
const k=clamp((CUT.t-(CUT.dur-1.0))/1.0,0,1);
el('stormOv').style.opacity=k;
}
// ===== 开场: 通用战场航拍 =====
function startFlyCut(){
CUT.kind='fly'; CUT.t=0; CUT.dur=12; CUT.skip=false;
const p0=V3(BASES[ATK].x*0.7,55,BASES[ATK].z*0.7);
CUT.pts=[p0, V3(FLAGS[0].x,32,FLAGS[0].z), V3(FLAGS[Math.min(1,FLAGS.length-1)].x,24,FLAGS[Math.min(1,FLAGS.length-1)].z)];
document.body.classList.add('cutOn');
el('cutTitle').textContent=CAMPAIGN.title;
el('cutTitle').style.color='';
el('cutSub').textContent=CAMPAIGN.sub;
el('cutSkip').textContent='空格 / Esc / 点击 跳过';
el('cutSkip').style.display='';
el('cutOv').style.display='block';
}
function updateFlyCut(dt){
const pts=CUT.pts, n=pts.length-1;
const st=CUT.t/CUT.dur*n;
const i=Math.min(n-1,Math.floor(st)), f=clamp(st-i,0,1);
const s=f*f*(3-2*f);
camera.position.lerpVectors(pts[i],pts[i+1],s);
camera.position.y+=Math.sin(CUT.t*1.3)*0.6;
const ahead=pts[Math.min(n,i+1)];
camera.lookAt((pts[i].x+ahead.x)/2,(pts[i].y+ahead.y)/2+3,(pts[i].z+ahead.z)/2);
}
// ===== 结束: 镜头环绕 + 胜负标题 =====
function startEndCut(winner,done){
CUT.done=done; CUT.kind='end'; CUT.t=0; CUT.dur=8; CUT.skip=false; CUT.active=true;
CUT.center=V3((BASES[0].x+BASES[1].x)/2,0,(BASES[0].z+BASES[1].z)/2);
document.body.classList.add('cutOn');
el('cutTitle').textContent=winner===-1?'平 局':(winner===player.team?'胜 利':'战 败');
el('cutTitle').style.color=winner===-1?'#cfd8d8':(winner===player.team?'#ffd77a':'#e87060');
el('cutSub').textContent=CAMPAIGN.title+' · 战争结束';
el('cutSkip').textContent='空格 / Esc / 点击 跳过';
el('cutSkip').style.display='';
el('cutOv').style.display='block';
}
function updateEndCut(dt){
const ang=CUT.t/CUT.dur*TAU*0.8;
const r=70+Math.sin(CUT.t*0.6)*6;
camera.position.set(CUT.center.x+Math.cos(ang)*r, 24+CUT.t*2.2, CUT.center.z+Math.sin(ang)*r);
camera.lookAt(CUT.center.x,4,CUT.center.z);
const k=clamp((CUT.t-(CUT.dur-1.0))/1.0,0,1);
el('blackOv').style.opacity=k*k;
}
// ===== 部署: 黑场过渡 =====
function startDeployCut(){
CUT.kind='deploy'; CUT.t=0; CUT.dur=0.6; CUT.active=true;
el('blackOv').style.opacity=1;
}
function updateDeployCut(dt){
const k=1-CUT.t/CUT.dur;
el('blackOv').style.opacity=k*k;
}
// ===== 总入口 =====
function startIntroCut(done){
CUT.done=done; CUT.active=true;
if(CAMPAIGN.id==='normandy'&&player.team===0) startBoatCut();
else startFlyCut();
}
function updateCutscene(dt){
if(!CUT.active) return;
CUT.t+=dt;
if(CUT.skip&&CUT.kind!=='deploy') CUT.t=Math.max(CUT.t,CUT.dur-1.0);
if(CUT.kind==='boat') updateBoatCut(dt);
else if(CUT.kind==='fly') updateFlyCut(dt);
else if(CUT.kind==='end') updateEndCut(dt);
else if(CUT.kind==='deploy') updateDeployCut(dt);
const lbT=cutPlaying()?1:0;
CUT.lb=dampF(CUT.lb,lbT,5,dt);
el('lbTop').style.height=(CUT.lb*11)+'vh';
el('lbBot').style.height=(CUT.lb*11)+'vh';
if(CUT.kind==='deploy'){ if(CUT.t>=CUT.dur) cutFinish(); return; }
const a1=clamp(CUT.t/0.9,0,1), a2=clamp((CUT.dur-CUT.t)/0.9,0,1);
const a=Math.min(a1,a2);
el('cutTitle').style.opacity=a;
el('cutSub').style.opacity=a*0.85;
el('cutSkip').style.opacity=a;
if(CUT.t>=CUT.dur) cutFinish();
}
// 跳过: 空格/回车/Esc/点击
addEventListener('keydown',e=>{
if(CUT.active&&CUT.kind!=='deploy'&&(e.code==='Space'||e.code==='Enter'||e.code==='Escape')) CUT.skip=true;
});
addEventListener('pointerdown',()=>{
if(CUT.active&&CUT.kind!=='deploy') CUT.skip=true;
});
