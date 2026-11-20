'use strict';
/* ===== 63_scope.js — 双摄像机镜内渲染（镜片常驻） =====
   需求 (2026-11-15 / 2026-11-18):
     ① 主相机渲染整帧(腰射视野), 第二台 scopeCam 把放大画面渲进 RT
     ② RT 贴在枪模的目镜镜片上, 跟着枪走 —— 关镜(放下枪)后镜片里仍然有画面
     ③ 不叠 VHS / 鱼眼; 镜片是干净的光学通道
     ④ 遮罩 = 目镜本体: 开镜时整把枪按 sightScale() 等比放大, 目镜正好占
        frac*屏高; 枪身与遮罩同倍率, 不再单独放大镜片 (2026-11-18)

   渲染顺序 (30_main 的 NVG.render 回调):
     renderer.clear()
     SCOPE.preRender()                 // 先渲镜内 RT
     renderer.render(scene,camera)     // 主画面
     renderer.render(vmScene,vmCamera) // 枪模 + 目镜 quad(采样 RT)

   ⚠️ 色彩空间: 画进 RT 时 three 输出线性色, 而镜片 quad 的目标是 canvas,
   所以片元着色器必须自己 toSRGB(), 否则镜片会发灰。
   ⚠️ 本文件不再接管 NVG.render, 也不再画全屏圆盘。 */
const SCOPE=(()=>{
  const st={
    dust:0.5,
    fov:60,
    mode:0,
    show:false,
    adsScale:2.4,          // 开镜时目镜 quad 的放大倍数(让镜片像贴到眼前)
    rt:null, cam:null, mat:null,
    lens:null, baseR:0.017, lensPos:null
  };

  const shV=`varying vec2 vUv;
void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;

  const shF=`uniform sampler2D tScope;
uniform float uMode;     // 1 = 放大镜片, 0 = 只叠玻璃灰尘
uniform float uDust;
varying vec2 vUv;

float h21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float dustCell(vec2 g,float seed,float thr,float rMin,float rMax){
  vec2 id=floor(g); vec2 f=fract(g)-0.5;
  if(h21(id+seed)<thr) return 0.0;
  vec2 off=(vec2(h21(id+seed+1.7),h21(id+seed+9.3))-0.5)*0.62;
  float r=mix(rMin,rMax,h21(id+seed+4.1));
  return smoothstep(r,r*0.28,length(f-off));
}
float dustAt(vec2 q){
  float a=dustCell(q*2.8,11.0,0.58,0.12,0.26)*0.42;
  a+=dustCell(q*6.5,37.0,0.64,0.09,0.20)*0.34;
  a+=dustCell(q*15.0,71.0,0.70,0.08,0.16)*0.26;
  a+=smoothstep(0.72,0.99,sin(q.x*2.3+q.y*7.0+1.1)*0.5+0.5)*0.05;
  return clamp(a,0.0,1.0);
}
vec3 toSRGB(vec3 c){
  c=max(c,vec3(0.0));
  return mix(c*12.92, 1.055*pow(c,vec3(1.0/2.4))-0.055, step(vec3(0.0031308),c));
}
void main(){
  vec2 q=(vUv-0.5)*2.0;
  float r=length(q);
  if(r>1.0) discard;                  // 目镜外: 让枪模/环境透出来
  float dust=dustAt(q)*uDust;
  vec3 dustCol=vec3(0.60,0.58,0.53);

  if(uMode<0.5){
    float k=1.0-smoothstep(0.86,1.0,r);
    gl_FragColor=vec4(dustCol,dust*0.38*k);
    return;
  }

  // ---- 放大镜片: 直接采样 RT, 不做桶形/鱼眼/色散 ----
  vec2 uv=q*0.5+0.5;
  vec3 c=texture2D(tScope,uv).rgb;
  // 镜筒暗角 + 出瞳遮挡
  c*=1.0-smoothstep(0.62,1.0,r)*0.62;
  // 分划: 细十字 + 中心点
  float cross=1.0-smoothstep(0.0,0.009,min(abs(q.x),abs(q.y)));
  cross*=1.0-smoothstep(0.86,0.96,r);
  c=mix(c,vec3(0.015),cross*0.85);
  c=mix(c,vec3(0.015),1.0-smoothstep(0.0,0.012,r));
  // 玻璃灰尘
  c=mix(c,dustCol,dust*0.38);
  // 镜片外沿黑边
  c=mix(c,vec3(0.0),smoothstep(0.985,1.0,r));
  gl_FragColor=vec4(toSRGB(clamp(c,0.0,1.0)),1.0);
}`;

  // ---- 瞄具分类 ----
  const tmpV=new THREE.Vector3(), tmpQ=new THREE.Quaternion();
  // 开镜时镜片占屏幕高度的比例 / 目镜面离镜头多远
  const ADS_FRAC=0.82;        // 狙击枪(内建镜): 大镜片, 视野被镜筒占满
  const ADS_FRAC_SMALL=0.55;  // 其他枪装放大瞄具: 镜片小一些, 保留外围腰射视野
  const ADS_DIST=0.30;

  function fracOf(key){
    const wd=(typeof WPN_DEFS!=='undefined')&&WPN_DEFS[key];
    return (wd&&wd.scoped)?ADS_FRAC:ADS_FRAC_SMALL;
  }
  // 2026-11-18 「枪身和瞄具遮罩同时放大同倍率」:
  // 遮罩不再是"贴在镜头前的全屏圆盘", 它就是目镜本体 —— 目镜多大, 遮罩就多大。
  // 开镜时 15_viewmodel 把整个视模型(枪身+手臂)按 m 倍放大, 并把目镜推到 ADS_DIST,
  // 于是目镜在屏幕上的直径 = frac*屏高, 镜筒口正好被遮罩盖住, 枪身与遮罩同倍率。
  // m 由目镜实际半径反算: frac = 2*r*m / (2*d*tan(vfov/2))。
  function sightScale(key,r){
    if(!isLensOptic(key)) return 1;
    const rr=Math.max(1e-4, r||0.016);
    const vf=(typeof vmCamera!=='undefined'&&vmCamera&&vmCamera.fov)?vmCamera.fov:56;
    return fracOf(key)*ADS_DIST*Math.tan(vf*Math.PI/360)/rr;
  }

  function opticOf(key){
    try{
      return (typeof effectiveOptic==='function')?effectiveOptic(key)
        :((typeof getModChoice==='function')?getModChoice(key,'optic'):null);
    }catch(e){ return null; }
  }
  function modeOf(key){
    const d=(typeof WPN_DEFS!=='undefined')&&WPN_DEFS[key];
    if(!d) return 0;
    if(d.scoped) return 1;                 // 春田 PU / Kar98 ZF41 这类内建镜
    const o=opticOf(key);
    if(o==='optic_2x'||o==='optic_4x') return 1;
    if(o==='optic_reflex'||o==='optic_nvg') return 2;
    return 0;
  }
  function isLensOptic(key){ return modeOf(key)===1; }
  // 15_viewmodel 用: 这个武器此刻是否应该「主相机保持腰射视野」
  function keepWide(key,blend){
    if(!(blend>0.55)) return false;
    return isLensOptic(key);
  }
  function camKey(){
    if(typeof player==='undefined'||!player||!player.alive||!player.deployed) return null;
    if(player.onMG||player.onAT||player.onAA||player.onMortar||player.onVehicle) return null;
    if(!player.curW||!player.curW.key) return null;
    return player.curW.key;
  }

  // ---- 目镜 quad ----
  function ensureMat(){
    if(st.mat) return;
    st.mat=new THREE.ShaderMaterial({
      uniforms:{ tScope:{value:null}, uMode:{value:1}, uDust:{value:st.dust} },
      vertexShader:shV, fragmentShader:shF,
      // 目镜在镜筒里, 深度测试会被后端镜筒盖挡住; 直接盖在枪模上, 黑边负责收口
      transparent:true, depthTest:false, depthWrite:false, side:THREE.DoubleSide
    });
  }
  function ensureRT(size){
    if(!st.rt){
      // 半浮点 RT: 线性色在暗部只有 8bit 时, 片元里 toSRGB 会把量化误差放大成雪花噪点
      const opt={ minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter,
                  depthBuffer:true, stencilBuffer:false };
      if(THREE.HalfFloatType){
        try{
          const gl=renderer.getContext();
          if(gl.getExtension('EXT_color_buffer_float')||gl.getExtension('EXT_color_buffer_half_float')) opt.type=THREE.HalfFloatType;
        }catch(e){}
      }
      st.rt=new THREE.WebGLRenderTarget(size,size,opt);
      st.cam=new THREE.PerspectiveCamera(st.fov,1,0.08,900);
    } else if(st.rt.width!==size){
      st.rt.setSize(size,size);
    }
  }
  // vmEquip 建好枪模后调用: 在目镜位置挂一块采样 RT 的平面
  function attachLens(parts,key){
    ensureMat();
    if(st.lens) st.lens.removeFromParent();
    st.lens=null;
    st.gun=null;
    const L=parts&&parts.gun&&parts.gun.userData&&parts.gun.userData.scopeLens;
    if(!L||modeOf(key||VM.key)!==1) return false;
    const mesh=st.quad||(st.quad=new THREE.Mesh(new THREE.PlaneGeometry(1,1),st.mat));
    mesh.position.copy(L.pos);
    mesh.scale.setScalar(L.r*2);
    mesh.renderOrder=30;
    mesh.frustumCulled=false;
    parts.gun.add(mesh);
    st.lens=mesh; st.gun=parts.gun; st.baseR=L.r; st.lensPos=L.pos.clone(); st.mode=1;
    return true;
  }

  // 每帧渲染前调用: 把放大画面渲进 RT, 并让目镜 quad 跟着开镜混合放大
  function preRender(){
    st.show=false;
    const key=camKey(); if(!key) return false;
    if(modeOf(key)!==1||!st.lens) return false;
    // 枪完全出画(冲刺/切枪)时不必再为镜片渲染一遍场景
    const wp=V3(); st.lens.getWorldPosition(wp);
    const nd=wp.clone().project(vmCamera);
    if(nd.z<-1||nd.z>1||Math.abs(nd.x)>1.5||Math.abs(nd.y)>1.5) return false;
    const base=(typeof SETTINGS!=='undefined'&&SETTINGS&&SETTINGS.fov)||74;
    st.fov=Math.min(adsFovOf(key),base-1);
    const b=clamp((typeof VM!=='undefined'&&VM.adsBlend)||0,0,1);
    // 腰射时镜片只占几十像素, 384 足够; 开镜放大到接近全屏, 用 768 保清晰度
    ensureRT(b>0.5?768:384);
    const gun=st.gun;
    if(gun&&st.lensPos){
      gun.updateWorldMatrix(true,false);
      // 目镜/遮罩永远贴在镜筒后端, 直径 = 目镜口径。
      // 开镜时的"变大"由 15_viewmodel 的整枪等比缩放完成, 这里不再单独放大镜片,
      // 否则就会出现"遮罩巨大、枪身很小"的割裂感。
      st.lens.position.copy(st.lensPos);
      st.lens.scale.setScalar(st.baseR*2);
      // 始终正对镜头 (抵消 gun 的旋转)
      gun.getWorldQuaternion(tmpQ).invert();
      st.lens.quaternion.copy(tmpQ).multiply(vmCamera.quaternion);
    }
    const c=st.cam;
    c.position.copy(camera.position);
    c.quaternion.copy(camera.quaternion);
    c.near=camera.near; c.far=camera.far;
    c.aspect=1; c.fov=st.fov; c.updateProjectionMatrix();
    const prev=renderer.getRenderTarget();
    const sm=renderer.shadowMap, was=sm.autoUpdate;
    sm.autoUpdate=false;
    renderer.setRenderTarget(st.rt);
    renderer.clear();
    try{ renderer.render(scene,c); }
    finally{ sm.autoUpdate=was; renderer.setRenderTarget(prev); }
    st.mat.uniforms.tScope.value=st.rt.texture;
    st.mat.uniforms.uMode.value=1;
    st.mat.uniforms.uDust.value=st.dust;
    st.show=true;
    return true;
  }

  function tune(o){
    for(const k in o){ if(k in st) st[k]=o[k]; }
    if(st.mat) st.mat.uniforms.uDust.value=st.dust;
  }

  return { preRender, attachLens, keepWide, isLensOptic, modeOf, sightScale, fracOf,
           adsDist:()=>ADS_DIST, tune, state:()=>st };
})();
