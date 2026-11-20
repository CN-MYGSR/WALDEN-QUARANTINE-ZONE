'use strict';
// ===================== SVG 矢量纹理管线 =====================
// svgTex(): 将手工设计的 SVG 矢量图光栅化为 CanvasTexture。
// 同步返回纹理(先填充底色占位), SVG 光栅化完成后自动刷新, 不阻塞加载流程。
function makeTex(w,h,fn,repX=1,repY=1){
const c=document.createElement('canvas'); c.width=w; c.height=h;
fn(c.getContext('2d'),w,h);
const t=new THREE.CanvasTexture(c);
t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(repX,repY);
t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=4;
return t;
}
function speckle(g,w,h,n,c0,c1,smin,smax){
for(let i=0;i<n;i++){
g.fillStyle=Math.random()<.5?c0:c1;
g.globalAlpha=rand(.08,.4);
const s=rand(smin,smax);
g.fillRect(rand(0,w),rand(0,h),s,s);
}
g.globalAlpha=1;
}
function svgTex(w,h,body,repX=1,repY=1,base='#888'){
const c=document.createElement('canvas'); c.width=w; c.height=h;
const g=c.getContext('2d');
if(base){ g.fillStyle=base; g.fillRect(0,0,w,h); }
const t=new THREE.CanvasTexture(c);
t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(repX,repY);
t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=4;
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'">'+body+'</svg>';
const img=new Image();
img.onload=()=>{ g.clearRect(0,0,w,h); g.drawImage(img,0,0,w,h); t.needsUpdate=true; };
img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
return t;
}
// 确定性伪随机(纹理每次加载一致)
function texRng(seed){ let s=seed>>>0; return ()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; }; }
// 噪声滤镜片段: 叠加在底色上的颗粒/污渍层
function svgGrain(id,freq,oct,seed){
return `<filter id="${id}" x="-5%" y="-5%" width="110%" height="110%">`+
`<feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="${oct}" seed="${seed}" stitchTiles="stitch" result="t"/>`+
`<feColorMatrix in="t" type="matrix" values="0 0 0 0 0.5, 0 0 0 0 0.5, 0 0 0 0 0.5, 0.8 0.8 0.8 0 0" result="g"/>`+
`</filter>`;
}
// A one-pixel albedo keeps each surface its own colour while its local scan decodes.
function surfaceMap(file, tileMeters, base, colorSpace = THREE.SRGBColorSpace) {
  const texture = makeTex(1, 1, ctx => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 1, 1);
  });
  texture.userData.tileMeters = tileMeters;
  texture.colorSpace = colorSpace;
  const image = new Image();
  image.onload = () => {
    texture.image = image;
    texture.needsUpdate = true;
  };
  image.src = 'assets/materials/' + file + '.webp';
  return texture;
}
const TEX = {};
// ---------- 草地: 斑块底噪 + 草叶簇 ----------
TEX.grass=(function(){
const R=texRng(11); let blades='';
for(let i=0;i<240;i++){
const x=R()*384, y=R()*384, l=3+R()*7, dx=(R()-0.5)*5;
const c=['#7d8c52','#71824c','#657a44','#87965c'][(R()*4)|0];
blades+=`<path d="M${x.toFixed(1)} ${y.toFixed(1)} q ${(dx*0.4).toFixed(1)} ${(-l*0.6).toFixed(1)} ${dx.toFixed(1)} ${(-l).toFixed(1)}" stroke="${c}" stroke-width="${(0.7+R()*0.9).toFixed(1)}" fill="none" opacity="${(0.35+R()*0.4).toFixed(2)}"/>`;
}
let patches='';
for(let i=0;i<26;i++){
const x=R()*384, y=R()*384, r=10+R()*34;
patches+=`<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${r.toFixed(0)}" ry="${(r*(0.5+R()*0.5)).toFixed(0)}" fill="${R()<0.5?'#5e6e40':'#77874e'}" opacity="${(0.12+R()*0.2).toFixed(2)}"/>`;
}
const body=
`<defs>${svgGrain('gn','0.13','4',7)}${svgGrain('gn2','0.5','2',13)}</defs>`+
`<rect width="384" height="384" fill="#6b7a48"/>`+
`<rect width="384" height="384" filter="url(#gn)" opacity="0.22" style="mix-blend-mode:multiply"/>`+
patches+
`<rect width="384" height="384" filter="url(#gn2)" opacity="0.10" style="mix-blend-mode:overlay"/>`+
blades;
return svgTex(384,384,body,40,40,'#6b7a48');
})();
// ---------- 雪地: 微蓝阴影起伏 + 冰晶闪点 ----------
TEX.snowGround=(function(){
const R=texRng(21); let dots='', drifts='';
for(let i=0;i<60;i++){ dots+=`<circle cx="${(R()*384).toFixed(0)}" cy="${(R()*384).toFixed(0)}" r="${(0.6+R()*1.2).toFixed(1)}" fill="#ffffff" opacity="${(0.5+R()*0.5).toFixed(2)}"/>`; }
for(let i=0;i<20;i++){
const x=R()*384,y=R()*384,r=16+R()*46;
drifts+=`<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${r.toFixed(0)}" ry="${(r*0.45).toFixed(0)}" fill="${R()<0.5?'#dfe6ee':'#f7fafd'}" opacity="${(0.2+R()*0.25).toFixed(2)}" transform="rotate(${(R()*180).toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})"/>`;
}
const body=
`<defs>${svgGrain('sn','0.06','4',3)}</defs>`+
`<rect width="384" height="384" fill="#eef1f5"/>`+
`<rect width="384" height="384" filter="url(#sn)" opacity="0.16" style="mix-blend-mode:multiply"/>`+
drifts+dots;
return svgTex(384,384,body,40,40,'#eef1f5');
})();
// ---------- 泥土: 大地色斑块 + 碎石 ----------
TEX.dirt=(function(){
const R=texRng(31); let pebbles='', patches='';
for(let i=0;i<90;i++){
const x=R()*384,y=R()*384,r=1+R()*3;
pebbles+=`<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${r.toFixed(1)}" ry="${(r*0.7).toFixed(1)}" fill="${R()<0.5?'#8d7d5d':'#5f5138'}" opacity="${(0.4+R()*0.4).toFixed(2)}"/>`;
}
for(let i=0;i<18;i++){
const x=R()*384,y=R()*384,r=14+R()*44;
patches+=`<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${r.toFixed(0)}" ry="${(r*0.6).toFixed(0)}" fill="${R()<0.5?'#6d5d42':'#87765a'}" opacity="${(0.18+R()*0.2).toFixed(2)}"/>`;
}
const body=
`<defs>${svgGrain('dn','0.09','4',5)}</defs>`+
`<rect width="384" height="384" fill="#7a6a4e"/>`+
patches+
`<rect width="384" height="384" filter="url(#dn)" opacity="0.28" style="mix-blend-mode:multiply"/>`+
pebbles;
return svgTex(384,384,body,8,8,'#7a6a4e');
})();
// Scale is the measured width of the photographed patch, in metres.
TEX.brick = surfaceMap('red_brick_03', 1, '#77564b');
TEX.plaster = surfaceMap('damaged_plaster', 3.7, '#aea297');
TEX.stone = surfaceMap('japanese_stone_wall', 1.9, '#827e72');
TEX.wood = surfaceMap('weathered_brown_planks', 1.8, '#705b4b');
TEX.woodDark = TEX.wood;
// ---------- 沙袋: 错缝袋体 + 缝线 + 织物噪声 ----------
TEX.sandbag=(function(){
const R=texRng(91); const W=256,H=256; let bags='';
for(let y=0,ri=0;y<H;y+=44,ri++){
const off=ri%2?44:0;
for(let x=-88;x<W;x+=88){
const rr=140+R()*26, gg=125+R()*20, bb=88+R()*16;
const cx2=x+off+44, cy2=y+22;
bags+=`<g><ellipse cx="${cx2}" cy="${cy2+3}" rx="41" ry="18" fill="#4c422c" opacity="0.5"/>`+
`<ellipse cx="${cx2}" cy="${cy2}" rx="40" ry="18" fill="rgb(${rr|0},${gg|0},${bb|0})"/>`+
`<ellipse cx="${cx2}" cy="${cy2-5}" rx="34" ry="10" fill="rgb(${Math.min(255,rr*1.13)|0},${Math.min(255,gg*1.12)|0},${Math.min(255,bb*1.1)|0})" opacity="0.5"/>`+
`<path d="M${cx2-38} ${cy2} a 38 16 0 0 0 76 0" stroke="rgba(80,70,45,0.75)" stroke-width="1.4" fill="none" stroke-dasharray="3 2.4"/>`+
`<line x1="${cx2-40}" y1="${cy2-2}" x2="${cx2-32}" y2="${cy2-8}" stroke="rgba(90,78,50,0.8)" stroke-width="2"/>`+
`</g>`;
}
}
const body=
`<defs>${svgGrain('sbn','0.5','2',18)}</defs>`+
`<rect width="256" height="256" fill="#9a8a62"/>`+bags+
`<rect width="256" height="256" filter="url(#sbn)" opacity="0.10" style="mix-blend-mode:multiply"/>`;
return svgTex(256,256,body,2,2,'#9a8a62');
})();
// ---------- 金属: 拉丝 + 划痕 + 锈斑 ----------
TEX.metal=(function(){
const R=texRng(101); let scr='', rust='';
for(let i=0;i<14;i++){
const y=R()*256;
scr+=`<line x1="${(R()*256).toFixed(0)}" y1="${y.toFixed(0)}" x2="${(R()*256).toFixed(0)}" y2="${(y+(R()-0.5)*30).toFixed(0)}" stroke="${R()<0.5?'#71776a':'#3f443c'}" stroke-width="${(0.6+R()*0.9).toFixed(1)}" opacity="${(0.3+R()*0.4).toFixed(2)}"/>`;
}
for(let i=0;i<8;i++){
const x=R()*256,y=R()*256,r=3+R()*10;
rust+=`<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${r.toFixed(0)}" ry="${(r*0.7).toFixed(0)}" fill="#6e4a2c" opacity="${(0.2+R()*0.3).toFixed(2)}"/>`+
`<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${(r*0.5).toFixed(0)}" ry="${(r*0.35).toFixed(0)}" fill="#7d5836" opacity="${(0.3+R()*0.3).toFixed(2)}"/>`;
}
const body=
`<defs>${svgGrain('mn','0.02 0.3','3',6)}${svgGrain('mn2','0.6','2',19)}</defs>`+
`<rect width="256" height="256" fill="#5a5f56"/>`+
`<rect width="256" height="256" filter="url(#mn)" opacity="0.14" style="mix-blend-mode:overlay"/>`+
scr+rust+
`<rect width="256" height="256" filter="url(#mn2)" opacity="0.08" style="mix-blend-mode:multiply"/>`;
return svgTex(256,256,body,1,1,'#5a5f56');
})();
// ---------- 树皮: 纵向沟壑 ----------
TEX.bark=(function(){
const R=texRng(111); let ridges='';
for(let x=0;x<256;x+=10){
const w2=4+R()*6, c=60+R()*30;
ridges+=`<rect x="${x}" y="0" width="${w2.toFixed(0)}" height="256" fill="rgb(${c|0},${(c*0.8)|0},${(c*0.55)|0})" opacity="0.85"/>`;
if(R()<0.5){ ridges+=`<path d="M${x+2} ${(R()*256).toFixed(0)} q ${(R()-0.5)*8} 30 ${(R()-0.5)*6} ${(50+R()*80).toFixed(0)}" stroke="#33261675" stroke-width="2" fill="none"/>`; }
}
const body=
`<defs>${svgGrain('bkn','0.08 0.4','4',25)}</defs>`+
`<rect width="256" height="256" fill="#5d4c36"/>`+ridges+
`<rect width="256" height="256" filter="url(#bkn)" opacity="0.25" style="mix-blend-mode:multiply"/>`;
return svgTex(256,256,body,1,2,'#5d4c36');
})();
// ---------- 树叶: 多层叶簇(带透明) ----------
TEX.leaves=(function(){
const R=texRng(121); let leaves='';
for(let i=0;i<380;i++){
const x=R()*256,y=R()*256;
const d=Math.hypot(x-128,y-128); if(d>118) continue;
const gg=85+R()*38;
leaves+=`<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${(5+R()*9).toFixed(0)}" ry="${(3+R()*7).toFixed(0)}" fill="rgb(${(gg*0.72)|0},${gg|0},${(gg*0.5)|0})" opacity="${(0.5+R()*0.5).toFixed(2)}" transform="rotate(${(R()*180).toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})"/>`;
}
for(let i=0;i<70;i++){
const x=R()*256,y=R()*256;
const d=Math.hypot(x-128,y-128); if(d>110) continue;
const gg=110+R()*30;
leaves+=`<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${(3+R()*5).toFixed(0)}" ry="${(2+R()*4).toFixed(0)}" fill="rgb(${(gg*0.75)|0},${gg|0},${(gg*0.48)|0})" opacity="${(0.55+R()*0.45).toFixed(2)}" transform="rotate(${(R()*180).toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})"/>`;
}
return svgTex(256,256,leaves,1,1,null);
})();
// ---------- 瓦顶: 弧形瓦排 + 行间阴影 + 破损瓦 ----------
TEX.roof=(function(){
const R=texRng(131); const W=512,H=512; let tiles='';
for(let y=0,ri=0;y<H;y+=48,ri++){
tiles+=`<rect x="0" y="${y+40}" width="${W}" height="10" fill="#3a2420" opacity="0.55"/>`;
const off=ri%2?30:0;
for(let x=-60;x<W;x+=60){
const rr=100+R()*30, gg=58+R()*16, bb=46+R()*14;
if(R()<0.05){ tiles+=`<rect x="${x+off+1}" y="${y+1}" width="58" height="44" fill="#241814"/>`; continue; }
const slip=R()<0.12? 4:0;
tiles+=`<g><path d="M${x+off} ${y+slip} h 60 v 40 a 30 9 0 0 1 -60 0 z" fill="rgb(${rr|0},${gg|0},${bb|0})"/>`+
`<path d="M${x+off} ${y+slip} h 60 v 5 h -60 z" fill="rgb(${Math.min(255,rr*1.2)|0},${Math.min(255,gg*1.2)|0},${Math.min(255,bb*1.2)|0})" opacity="0.5"/>`+
`<path d="M${x+off} ${y+slip+36} a 30 9 0 0 0 60 0 v 4 a 30 9 0 0 1 -60 0 z" fill="#241511" opacity="0.5"/>`+
`<line x1="${x+off}" y1="${y+slip}" x2="${x+off}" y2="${y+slip+42}" stroke="#2e1b16" stroke-width="1.6" opacity="0.6"/></g>`;
if(R()<0.18){ tiles+=`<ellipse cx="${(x+off+16+R()*30).toFixed(0)}" cy="${(y+10+R()*24).toFixed(0)}" rx="${(4+R()*8).toFixed(0)}" ry="${(3+R()*5).toFixed(0)}" fill="#5d7350" opacity="${(0.2+R()*0.25).toFixed(2)}"/>`; }
}
}
const body=
`<defs>${svgGrain('rn','0.2','3',17)}</defs>`+
`<rect width="512" height="512" fill="#50302a"/>`+tiles+
`<rect width="512" height="512" filter="url(#rn)" opacity="0.13" style="mix-blend-mode:multiply"/>`;
return svgTex(512,512,body,2,2,'#6e4438');
})();
// ---------- 干草: 定向草秆 ----------
TEX.hay=(function(){
const R=texRng(141); let strands='';
for(let i=0;i<330;i++){
const x=R()*256,y=R()*256,l=8+R()*18,a=(R()-0.5)*0.9;
const rr=150+R()*40, gg=130+R()*30, bb=70+R()*25;
strands+=`<line x1="${x.toFixed(0)}" y1="${y.toFixed(0)}" x2="${(x+Math.cos(a)*l).toFixed(0)}" y2="${(y+Math.sin(a)*l*0.4).toFixed(0)}" stroke="rgb(${rr|0},${gg|0},${bb|0})" stroke-width="${(0.8+R()*1).toFixed(1)}" opacity="${(0.5+R()*0.4).toFixed(2)}"/>`;
}
const body=
`<defs>${svgGrain('hn','0.3','2',28)}</defs>`+
`<rect width="256" height="256" fill="#a8915a"/>`+strands+
`<rect width="256" height="256" filter="url(#hn)" opacity="0.12" style="mix-blend-mode:multiply"/>`;
return svgTex(256,256,body,2,2,'#b09a58');
})();
// ---------- 履带: 橡胶垫块 + 导齿 ----------
TEX.track=(function(){
let t='';
for(let y=0;y<128;y+=16){
t+=`<rect x="4" y="${y+2}" width="120" height="10" rx="2" fill="#3d3e36"/>`+
`<rect x="4" y="${y+2}" width="120" height="3" rx="1.5" fill="#4c4e44" opacity="0.8"/>`+
`<rect x="12" y="${y+4}" width="104" height="4" fill="#23241f"/>`+
`<rect x="58" y="${y+11}" width="12" height="5" fill="#1c1d18"/>`;
}
const body=`<rect width="128" height="128" fill="#2e2f2a"/>`+t;
return svgTex(128,128,body,1,4,'#2e2f2a');
})();
// ---------- CQB: 铁锈 (集装箱/废弃车体) ----------
TEX.rust = surfaceMap('rusty_metal_04', 2, '#806d60');
// ---------- CQB: 混凝土 (隔离墩/路障) ----------
TEX.concrete = surfaceMap('concrete_wall_006', 2, '#89867d');
TEX.corrugated = surfaceMap('worn_corrugated_iron', 1.8, '#737777');
TEX.corrugatedNormal = surfaceMap('worn_corrugated_iron_normal', 1.8, '#8080ff', THREE.NoColorSpace);
// ---------- CQB: 碎玻璃 (地面贴片/窗面) ----------
TEX.glassCrack=(function(){
const R=texRng(97); let shards='';
// 放射状裂痕
const cx=128,cy=128;
for(let i=0;i<22;i++){
const a=i/22*Math.PI*2+ (R()-0.5)*0.3;
const len=30+R()*110;
shards+=`<line x1="${cx}" y1="${cy}" x2="${(cx+Math.cos(a)*len).toFixed(0)}" y2="${(cy+Math.sin(a)*len).toFixed(0)}" stroke="#e8f2f4" stroke-width="${(0.6+R()*1.4).toFixed(1)}" opacity="${(0.4+R()*0.5).toFixed(2)}"/>`;
}
// 同心裂环
for(let i=1;i<4;i++){
const r=i*30+R()*10;
shards+=`<circle cx="${cx}" cy="${cy}" r="${r.toFixed(0)}" fill="none" stroke="#dceef2" stroke-width="0.9" opacity="${(0.3+R()*0.3).toFixed(2)}"/>`;
}
// 碎片高光
for(let i=0;i<40;i++){
const x=R()*256,y=R()*256;
shards+=`<polygon points="${x.toFixed(0)},${y.toFixed(0)} ${(x+R()*10).toFixed(0)},${(y+R()*8).toFixed(0)} ${(x+R()*6).toFixed(0)},${(y+R()*12).toFixed(0)}" fill="#ffffff" opacity="${(0.1+R()*0.35).toFixed(2)}"/>`;
}
const body=`<rect width="256" height="256" fill="rgba(190,215,220,0.10)"/>`+shards;
return svgTex(256,256,body,1,1,null);
})();
const MAT = {
grass: new THREE.MeshLambertMaterial({map:TEX.grass, vertexColors:true}),
brick: new THREE.MeshLambertMaterial({map:TEX.brick}),
plaster: new THREE.MeshLambertMaterial({map:TEX.plaster}),
stone: new THREE.MeshLambertMaterial({map:TEX.stone}),
wood: new THREE.MeshLambertMaterial({map:TEX.wood}),
woodDark: new THREE.MeshLambertMaterial({map:TEX.woodDark,color:0x92877e}),
sandbag: new THREE.MeshLambertMaterial({map:TEX.sandbag}),
metal: new THREE.MeshLambertMaterial({map:TEX.metal}),
metalDark: new THREE.MeshLambertMaterial({color:0x3a3d38}),
bark: new THREE.MeshLambertMaterial({map:TEX.bark}),
leaves: new THREE.MeshLambertMaterial({map:TEX.leaves, transparent:true, alphaTest:0.5, side:THREE.DoubleSide}),
roof: new THREE.MeshLambertMaterial({map:TEX.roof}),
hay: new THREE.MeshLambertMaterial({map:TEX.hay}),
rubble: new THREE.MeshLambertMaterial({color:0x8a8378}),
hedge: new THREE.MeshLambertMaterial({map:TEX.leaves,transparent:true,alphaTest:0.4}),
tentA: new THREE.MeshLambertMaterial({color:0x5e6244}),
tentB: new THREE.MeshLambertMaterial({color:0x565a3e}),
craterRim: new THREE.MeshLambertMaterial({color:0x5d5344}),
// ---- CQB 破旧街道材质 (阴暗街区) ----
containerRust: new THREE.MeshPhongMaterial({
  map:TEX.corrugated, normalMap:TEX.corrugatedNormal, normalScale:new THREE.Vector2(0.6,0.6),
  color:0xc6a48b, specular:0x394249, shininess:16
}),
containerTop: new THREE.MeshLambertMaterial({color:0x5a5248}),         // 箱顶加强框
carRust: new THREE.MeshLambertMaterial({map:TEX.rust,color:0xe3ddd3}), // 废弃车体
concreteBarrier: new THREE.MeshLambertMaterial({map:TEX.concrete}),    // 混凝土隔离墩
cardboard: new THREE.MeshLambertMaterial({color:0x8a7a62}),            // 纸箱
woodPallet: new THREE.MeshLambertMaterial({color:0x6b5f4a}),           // 托盘
glass: new THREE.MeshLambertMaterial({color:0x9fb4bc,transparent:true,opacity:0.28,side:THREE.DoubleSide,depthWrite:false}), // 玻璃
glassCrack: new THREE.MeshLambertMaterial({map:TEX.glassCrack,transparent:true,opacity:0.42,side:THREE.DoubleSide,depthWrite:false}), // 裂玻璃
glassGround: new THREE.MeshLambertMaterial({map:TEX.glassCrack,transparent:true,opacity:0.34,depthWrite:false}), // 地面碎玻璃
puddle: new THREE.MeshLambertMaterial({color:0x2e3a3e,transparent:true,opacity:0.82}), // 积水
};
MAT.containerDoor = MAT.containerRust.clone();
MAT.containerDoor.color.set(0xaabbb3);
// 战役环境主题着色: 地面/树叶/屋顶随战场变化 (雪地/废墟/江南/黄土)
MAT.grass.color.set(THEME.ground);
MAT.leaves.color.set(THEME.leaf);
MAT.roof.color.set(THEME.roof);
if(THEME.snow){ MAT.grass.map=TEX.snowGround; MAT.sandbag.color.set(0xd8dade); MAT.hay.color.set(0xcfd2d6); MAT.stone.color.set(0xc8ccd2); }
if(CAMPAIGN.theme==='loess'){ MAT.stone.color.set(0xd8c8a0); MAT.plaster.color.set(0xe0d0a8); }
// CQB 阴暗街区: 全面低饱和压暗, 砖石呈脏灰, 木料发黑, 沙袋褪色
if(THEME.cqb){
MAT.brick.color.set(0x8e8a84);
MAT.plaster.color.set(0x918d86);
MAT.stone.color.set(0x827e78);
MAT.wood.color.set(0x7a6e5c);
MAT.woodDark.color.set(0x5e564a);
MAT.sandbag.color.set(0x8a8674);
MAT.rubble.color.set(0x6e6a63);
MAT.roof.color.set(0x6e6a63);
MAT.metalDark.color.set(0x34362f);
MAT.hedge.color.set(0x5a5c46);
}
if (CAMPAIGN.layout === 'cqb') {
  MAT.pave = new THREE.MeshLambertMaterial({map:surfaceMap('asphalt_04', 4, '#696a69'), color:0xa1a6a9});
  MAT.roadPaint = new THREE.MeshLambertMaterial({map:surfaceMap('worn_road_paint', 1, '#c6c0af'), color:0xd6b06a});
}
if (CAMPAIGN.id === 'bfruins') {
  MAT.grass.map = surfaceMap('leaf_scattered_gravel', 1.8, '#72665a');
  const yardRepeat = (MAP_SIZE + 40) / MAT.grass.map.userData.tileMeters;
  MAT.grass.map.repeat.set(yardRepeat, yardRepeat);
  MAT.grass.color.set(0xe3e0d7);
  MAT.plaster.color.set(0xe7e6dc);
  MAT.brick.color.set(0xe0d4c8);
  MAT.stone.color.set(0xc1c5c4);
  MAT.wood.color.set(0xd0c7b7);
  MAT.woodDark.color.set(0x9f978d);
  MAT.rubble.map = TEX.concrete;
  MAT.rubble.color.set(0xb5b4ad);
}
// 雪檐房顶覆盖: 雪地战役给屋顶叠加一层带出檐的积雪盖板 (作为屋顶子节点, 随屋顶坍塌一并消失)
MAT.snowCap=new THREE.MeshLambertMaterial({color:0xedf2f8});
function addSnowCap(rm){
if(!THEME.snow||!rm||!rm.geometry||!rm.geometry.parameters) return rm;
const gp=rm.geometry.parameters;
if(gp.width===undefined||gp.depth===undefined) return rm;
const cap=new THREE.Mesh(new THREE.BoxGeometry(gp.width+0.16,0.13,gp.depth+0.16),MAT.snowCap);
cap.position.y=(gp.height||0.2)/2+0.065;
cap.castShadow=false; cap.receiveShadow=true;
rm.add(cap);
return rm;
}
// 平整区: 基地+旗点自动生成 (高度自适应当地地形, 避免高原/悬崖)
