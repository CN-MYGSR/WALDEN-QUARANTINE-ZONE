'use strict';
const renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.autoClear = false;
renderer.domElement.className='game';
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, innerWidth/innerHeight, 0.08, 900);
const vmScene = new THREE.Scene();
const vmCamera = new THREE.PerspectiveCamera(56, innerWidth/innerHeight, 0.01, 10);
let SHADOW_RANGE=60;
function applyQuality(){
const q = SETTINGS.quality;
renderer.setPixelRatio(q===0?Math.min(devicePixelRatio,1):(q===1?Math.min(devicePixelRatio,1.5):Math.min(devicePixelRatio,2)));
// 紧凑阴影视锥跟随玩家: 大幅减少每帧阴影绘制的物体数
SHADOW_RANGE=q===0?42:(q===1?60:80);
sun.shadow.camera.left=-SHADOW_RANGE; sun.shadow.camera.right=SHADOW_RANGE;
sun.shadow.camera.top=SHADOW_RANGE; sun.shadow.camera.bottom=-SHADOW_RANGE;
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.mapSize.setScalar(q===0?1024:(q===1?1536:2048));
if(sun.shadow.map){ sun.shadow.map.dispose(); sun.shadow.map=null; }
// 高画质: 软阴影 + 电影感滤镜; 低画质硬阴影无滤镜
renderer.shadowMap.type=q===2?THREE.PCFSoftShadowMap:THREE.PCFShadowMap;
renderer.domElement.style.filter=q===2?'saturate(1.1) contrast(1.06) brightness(1.02)':(q===1?'saturate(1.04) contrast(1.02)':'none');
scene.fog.far = (NIGHT?(q===0?150:(q===1?210:260)):(q===0?240:(q===1?340:420)))*WFX.fogFar;
}
addEventListener('resize',()=>{
camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
vmCamera.aspect=camera.aspect; vmCamera.updateProjectionMatrix();
renderer.setSize(innerWidth,innerHeight);
});
scene.fog = new THREE.Fog(NIGHT?NIGHT_FOG:THEME.fog, NIGHT?18:WFX.fogNear, (NIGHT?240:340)*WFX.fogFar);
if(!NIGHT&&WFX.skyDark>0){ scene.fog.color.multiplyScalar(1-WFX.skyDark*0.45); }
let SKY=null;
{
const c=document.createElement('canvas'); c.width=16; c.height=256;
const g=c.getContext('2d');
const gr=g.createLinearGradient(0,0,0,256);
const st=NIGHT?THEME.sky.map(nightSkyStop):THEME.sky.map(c=>weatherSkyStop(c,WFX.skyDark));
gr.addColorStop(0,st[0]); gr.addColorStop(0.42,st[1]);
gr.addColorStop(0.62,st[2]); gr.addColorStop(0.75,st[3]); gr.addColorStop(1,st[4]);
g.fillStyle=gr; g.fillRect(0,0,16,256);
const tex=new THREE.CanvasTexture(c); tex.colorSpace=THREE.SRGBColorSpace;
SKY=new THREE.Mesh(new THREE.SphereGeometry(760,24,16), new THREE.MeshBasicMaterial({map:tex,side:THREE.BackSide,fog:false}));
SKY.frustumCulled=false;
scene.add(SKY);
}
const hemi = new THREE.HemisphereLight(NIGHT?NIGHT_HEMI[0]:THEME.hemi[0], NIGHT?NIGHT_HEMI[1]:THEME.hemi[1], (NIGHT?NIGHT_HEMI[2]:THEME.hemi[2])*WFX.hemi);
scene.add(hemi);
const sun = new THREE.DirectionalLight(NIGHT?NIGHT_SUN:THEME.sun, KEY_BASE*WFX.sun);
sun.position.set(-90, 120, 40);
sun.castShadow = true;
sun.shadow.camera.left=-60; sun.shadow.camera.right=60;
sun.shadow.camera.top=60; sun.shadow.camera.bottom=-60;
sun.shadow.camera.far=400; sun.shadow.bias=-0.0012; sun.shadow.normalBias=0.02;
scene.add(sun); scene.add(sun.target);
function updateSunShadow(){
// 阴影视锥跟随相机, 按纹素网格对齐减少闪烁
const texel=SHADOW_RANGE*2/sun.shadow.mapSize.x;
const cx=Math.round(camera.position.x/texel)*texel;
const cz=Math.round(camera.position.z/texel)*texel;
sun.target.position.set(cx,0,cz);
if(NIGHT) sun.position.set(cx+70,140,cz-44);
else sun.position.set(cx-72,96,cz+32);
}
{
const c=document.createElement('canvas'); c.width=128; c.height=128;
const g=c.getContext('2d');
if(NIGHT){
  // 月亮: 冷白辉光
  const gr=g.createRadialGradient(64,64,2,64,64,64);
  gr.addColorStop(0,'rgba(232,240,255,1)'); gr.addColorStop(0.3,'rgba(190,212,242,.72)'); gr.addColorStop(1,'rgba(190,212,242,0)');
  g.fillStyle=gr; g.fillRect(0,0,128,128);
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),fog:false,depthWrite:false}));
  sp.position.set(340,330,-280); sp.scale.setScalar(58); scene.add(sp);
} else {
  const gr=g.createRadialGradient(64,64,2,64,64,64);
  gr.addColorStop(0,'rgba(255,250,230,1)'); gr.addColorStop(0.25,'rgba(255,240,200,.55)'); gr.addColorStop(1,'rgba(255,240,200,0)');
  g.fillStyle=gr; g.fillRect(0,0,128,128);
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),fog:false,depthWrite:false}));
  sp.position.set(-380,480,170); sp.scale.setScalar(220); scene.add(sp);
}
}
{
const c=document.createElement('canvas'); c.width=256; c.height=128;
const g=c.getContext('2d');
for(let i=0;i<46;i++){
const x=rand(30,226),y=rand(40,90),r=rand(14,34);
const gr=g.createRadialGradient(x,y,1,x,y,r);
gr.addColorStop(0,'rgba(255,255,255,.22)'); gr.addColorStop(1,'rgba(255,255,255,0)');
g.fillStyle=gr; g.fillRect(0,0,256,128);
}
const tex=new THREE.CanvasTexture(c);
for(let i=0;i<9;i++){
const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,opacity:NIGHT?rand(0.16,0.34):rand(.5,.85),color:NIGHT?0x9fb4d8:0xffffff,fog:false,depthWrite:false}));
sp.position.set(rand(-600,600), rand(180,280), rand(-600,600));
sp.scale.set(rand(180,340),rand(60,110),1);
scene.add(sp);
}
}
if(NIGHT){
// 星空
const starN=240;
const sgeo=new THREE.BufferGeometry();
const spos=new Float32Array(starN*3);
for(let i=0;i<starN;i++){
const th=rand(0,TAU), ph=Math.acos(rand(-0.92,0.92));
const r=755;
spos[i*3]=Math.sin(ph)*Math.cos(th)*r;
spos[i*3+1]=Math.cos(ph)*r;
spos[i*3+2]=Math.sin(ph)*Math.sin(th)*r;
}
sgeo.setAttribute('position',new THREE.BufferAttribute(spos,3));
const stars=new THREE.Points(sgeo,new THREE.PointsMaterial({color:0xe8eef8,size:1.5,sizeAttenuation:false,transparent:true,opacity:0.8,fog:false,depthWrite:false}));
stars.frustumCulled=false;
scene.add(stars);
}
// 暗角强度: 街区/港口本就昏暗, 再叠一层重暗角会看不清墙角 —— 按主题调轻 (见 css #vig)
try{ document.documentElement.style.setProperty('--vigA', String(THEME.vigA!=null?THEME.vigA:0.38)); }catch(e){}
vmScene.add(new THREE.HemisphereLight(0xcfd8e8, 0x5a5844, 0.9));
{ const l=new THREE.DirectionalLight(0xffeed0,1.6); l.position.set(-1,1.6,0.6); vmScene.add(l); }
