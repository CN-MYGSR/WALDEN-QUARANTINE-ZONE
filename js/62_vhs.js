'use strict';
/* ===== 62_vhs.js — VHS 摄像机滤镜 (鱼眼桶形畸变 + 色散 + 扫描线 + 磁带噪点) =====
   需求 (2026-10-31): 删掉命中反馈, 换成 VHS 视角。

   做法: 把整帧(含夜视仪的最终全屏 quad)先画进半分辨率 RenderTarget, 再用全屏着色器
   做屏幕空间变形后画到 canvas。之所以能"连 NVG 一起包住", 是因为 34_nvg 的 render()
   在最后会 setRenderTarget(null) 把 quad 画到屏幕 —— 我们临时把这个 null 重定向到自己的
   RT (见 render 里的 capture 标志), 于是夜视画面也进了 VHS 管道。

   ⚠️ 色彩空间: 03_renderer 设的是 outputColorSpace=SRGB, 但 three 只在"直接画到 canvas"
   时才做 sRGB 编码; 画进 RenderTarget 时输出是 **线性**(见 WebGLPrograms 的
   outputColorSpace = currentRenderTarget===null ? renderer.outputColorSpace : LinearSRGB)。
   所以本着色器末尾必须自己 toSRGB(), 否则画面会明显发灰发暗。 */
const VHS=(()=>{
  let rt=null, mat=null, quad=null, qscene=null, qcam=null;
  let capture=false, _srt=null;
  const st={
    on:true,
    scale:0.9,      // RT 相对绘制缓冲的比例 (低画质/手机再降)
    fish:0.22,      // 鱼眼强度 (桶形畸变)
    ca:0.0015,      // 径向色散
    noise:0.030,    // 磁带噪点
    scan:0.075,     // 扫描线
    vig:0.62        // 暗角
  };
  const shV=`varying vec2 vUv;
void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;

  const shF=`uniform sampler2D tDiffuse;
uniform vec2 uRes;
uniform float uTime, uFish, uCA, uNoise, uScan, uVig;
varying vec2 vUv;
float h21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
vec3 toSRGB(vec3 c){
  c=max(c,vec3(0.0));
  return mix(c*12.92, 1.055*pow(c,vec3(1.0/2.4))-0.055, step(vec3(0.0031308),c));
}
void main(){
  float asp=uRes.x/max(uRes.y,1.0);
  vec2 p=(vUv-0.5)*vec2(asp,1.0);
  float r2=dot(p,p);
  // 鱼眼: 越靠边采样半径越小 -> 桶形畸变(中心放大、直线外弓)
  float f=1.0-uFish*r2-uFish*0.30*r2*r2;
  vec2 pw=p*f;
  vec2 uv=pw/vec2(asp,1.0)+0.5;
  // 磁带走带抖动 + 跟踪带撕裂(只出现在画面下方, 幅度小 —— 撕太狠会把靶环糊成彩虹)
  uv.x+=sin(uv.y*46.0+uTime*1.9)*0.00075+sin(uTime*0.63)*0.00045;
  float band=fract(uv.y-uTime*0.09);
  float bm=smoothstep(0.975,1.0,band)*smoothstep(0.34,0.06,uv.y);
  uv.x+=(h21(vec2(floor(uv.y*140.0),uTime*11.0))-0.5)*bm*0.006;
  // 径向色散
  vec2 dir=normalize(pw+vec2(1e-6));
  float ca=uCA*(0.30+r2*1.15);
  vec3 c;
  c.r=texture2D(tDiffuse,uv+dir*ca).r;
  c.g=texture2D(tDiffuse,uv).g;
  c.b=texture2D(tDiffuse,uv-dir*ca).b;
  // VHS 色度带宽窄: 横向拖影 + 降饱和
  vec2 px=vec2(1.0/uRes.x,0.0);
  vec3 nb=texture2D(tDiffuse,uv-px*2.5).rgb*0.6+texture2D(tDiffuse,uv+px*2.5).rgb*0.4;
  float lum=dot(c,vec3(0.299,0.587,0.114));
  vec3 chroma=nb-dot(nb,vec3(0.299,0.587,0.114));
  c=mix(vec3(lum),c,0.80)+chroma*0.45;
  // 提黑位(磁带发灰) + 轻微 S 曲线
  c=c*0.95+0.018;
  c=mix(c,c*c*(3.0-2.0*c),0.25);
  // 扫描线 + 缓慢下移的亮带
  float sl=0.5+0.5*sin(vUv.y*uRes.y*1.5708);
  c*=1.0-uScan*sl;
  float roll=1.0-smoothstep(0.0,0.045,abs(fract(vUv.y-uTime*0.06)-0.5));
  c*=1.0+0.05*roll;
  // 噪点(暗部更明显, 亮部收敛) + 偶发白点(磁带掉磁)
  float n=h21(floor(vUv*uRes)+vec2(uTime*61.0,uTime*37.0));
  c+=(n-0.5)*uNoise*(0.28+0.30*(1.0-lum));
  float sp=h21(floor(vUv*uRes*0.7)+vec2(uTime*131.0,7.0));
  c+=step(0.99935,sp)*0.40;
  // 暗角(CRT 管): 最外圈压到 38% —— 鱼眼在最外圈会把内容压扁, 顺带把彩虹边吃掉
  float d=length(p);
  float edge=smoothstep(1.02,0.50,d);
  c*=mix(1.0-uVig,1.0,edge);
  gl_FragColor=vec4(toSRGB(clamp(c,0.0,1.0)),1.0);
}`;

  function targetSize(){
    const dpr=Math.min(renderer.getPixelRatio?renderer.getPixelRatio():1,1.5);
    const vr=(typeof viewRect==='function')?viewRect():{w:innerWidth,h:innerHeight};
    const s=st.scale*(typeof MOBILE!=='undefined'&&MOBILE?0.78:1);
    return { w:Math.max(2,Math.floor(vr.w*dpr*s)), h:Math.max(2,Math.floor(vr.h*dpr*s)) };
  }

  function init(){
    if(rt) return;
    const sz=targetSize();
    rt=new THREE.WebGLRenderTarget(sz.w,sz.h,{
      minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter,
      depthBuffer:true, stencilBuffer:false
    });
    mat=new THREE.ShaderMaterial({
      uniforms:{
        tDiffuse:{value:rt.texture},
        uRes:{value:new THREE.Vector2(sz.w,sz.h)},
        uTime:{value:0},
        uFish:{value:st.fish},
        uCA:{value:st.ca},
        uNoise:{value:st.noise},
        uScan:{value:st.scan},
        uVig:{value:st.vig}
      },
      vertexShader:shV, fragmentShader:shF,
      depthTest:false, depthWrite:false
    });
    quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),mat);
    quad.frustumCulled=false;
    qscene=new THREE.Scene();
    qscene.add(quad);
    qcam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    // 只装一次: 把 34_nvg 末尾的 setRenderTarget(null) 重定向到本 RT (capture 期间)
    _srt=renderer.setRenderTarget.bind(renderer);
    renderer.setRenderTarget=function(t){
      if(t===null&&capture&&rt) return _srt(rt);
      return _srt(t);
    };
    addEventListener('resize',()=>{
      if(!rt) return;
      const s2=targetSize();
      rt.setSize(s2.w,s2.h);
      mat.uniforms.uRes.value.set(s2.w,s2.h);
    });
  }

  /* 每帧: 整帧先落进 RT, 再跑 VHS 着色器到 canvas */
  function render(fn,orig){
    if(!st.on){ return orig(fn); }
    init();
    // 分辨率跟随(画质档位/设备像素比变化时重建, 每帧只比两个数)
    const s2=targetSize();
    if(rt.width!==s2.w||rt.height!==s2.h){
      rt.setSize(s2.w,s2.h);
      mat.uniforms.uRes.value.set(s2.w,s2.h);
    }
    mat.uniforms.uTime.value=performance.now()/1000;
    _srt(rt);
    capture=true;
    try{ orig(fn); }
    finally{ capture=false; }
    _srt(null);
    renderer.clear();
    renderer.render(qscene,qcam);
  }

  function setEnabled(v){
    st.on=!!v;
    try{ localStorage.setItem('sf_vhs',st.on?'1':'0'); }catch(e){}
    if(!st.on){ capture=false; }
  }
  function tune(o){ for(const k in o){ if(k in st) st[k]=o[k]; }
    if(mat){ mat.uniforms.uFish.value=st.fish; mat.uniforms.uCA.value=st.ca;
      mat.uniforms.uNoise.value=st.noise; mat.uniforms.uScan.value=st.scan;
      mat.uniforms.uVig.value=st.vig; } }

  try{ if(localStorage.getItem('sf_vhs')==='0') st.on=false; }catch(e){}

  return { render, setEnabled, tune, state:()=>st };
})();

/* 接管 NVG.render —— 主循环里唯一的"整帧绘制"入口(见 30_main.js:111) */
if(typeof NVG!=='undefined'&&NVG&&typeof NVG.render==='function'){
  const _nvgRender=NVG.render;
  NVG.render=function(fn){
    try{ return VHS.render(fn,_nvgRender); }
    catch(e){ console.warn('[vhs] pass failed, fallback',e); return _nvgRender(fn); }
  };
}

/* 开发者控制台: vhs [on|off] —— 滤镜开关, 选择会记进 localStorage('sf_vhs') */
if(typeof devCmd==='function'){
  devCmd('vhs','[on|off]','VHS 摄像机滤镜开关 (鱼眼畸变+色散+扫描线)',(a)=>{
    const say=(typeof devPrint==='function')?devPrint:(m)=>console.log(m);
    if(!a[0]) return say('VHS: '+(VHS.state().on?'开':'关'),'ok');
    const v=a[0]!=='off'&&a[0]!=='0';
    VHS.setEnabled(v);
    say('VHS: '+(v?'开':'关'),'ok');
  });
}
