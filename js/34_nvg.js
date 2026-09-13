'use strict';
/* ===== 34_nvg.js — 全景夜视仪 (仅战地8) =====
   N 键开关 · 圆形遮罩 + 动态噪点 + 三色滤镜(绿/蓝/白, 设置中切换)
   后处理: 战斗画面渲染进半分辨率 RenderTarget, 全屏着色器叠加夜视效果
   夜间自动增强场景光照与曝光, 徒步时加宽 FOV 呈现"全景"目镜视野 */
const NVG=(()=>{
  const st={ active:false, filter:'green', boost:0 };
  const FIDX={ green:0, blue:1, white:2 };
  const FILTER_LBL={
    green:['夜视 · 绿','#9fe8a8'],
    blue:['夜视 · 蓝','#9fd0ff'],
    white:['夜视 · 白','#e8ecf0']
  };
  let rt=null, quad=null, qcam=null, qscene=null, mat=null;
  let daySun=2, dayHemi=0.75, dayExposure=1.05;

  const shV=`varying vec2 vUv;
void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
  const shF=`uniform sampler2D tDiffuse;
uniform float uTime; uniform float uGain; uniform float uAspect; uniform int uFilter;
varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7))+uTime*9.1)*43758.5453); }
void main(){
  vec3 c=texture2D(tDiffuse,vUv).rgb;
  c=c*uGain+0.1;
  float lum=dot(c,vec3(0.299,0.587,0.114));
  if(uFilter==0){
    c=vec3(c.g*0.55+lum*0.28, c.g*1.02, c.g*0.5+lum*0.14);
  } else if(uFilter==2){
    c=vec3(lum);
  } else {
    c=vec3(c.b*0.45+lum*0.22, c.b*0.7+lum*0.2, c.b*1.1);
  }
  c=1.0-exp(-c*1.5);
  c+=(hash(vUv*vec2(911.0,613.0))-0.5)*0.035;
  vec2 p=(vUv-0.5)*vec2(uAspect,1.0);
  float d=length(p);
  float m1=1.0-smoothstep(0.38,0.60,d);
  c*=mix(0.015,1.0,m1);
  c*=0.88+0.12*smoothstep(0.42,0.58,d);
  gl_FragColor=vec4(c,1.0);
}`;

  function init(){
    if(rt) return;
    const w=Math.max(2,Math.floor(innerWidth*0.85));
    const h=Math.max(2,Math.floor(innerHeight*0.85));
    rt=new THREE.WebGLRenderTarget(w,h,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});
    mat=new THREE.ShaderMaterial({
      uniforms:{
        tDiffuse:{value:rt.texture},
        uTime:{value:0},
        uGain:{value:1},
        uAspect:{value:innerWidth/innerHeight},
        uFilter:{value:FIDX[st.filter]||0}
      },
      vertexShader:shV, fragmentShader:shF,
      depthTest:false, depthWrite:false
    });
    quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),mat);
    quad.frustumCulled=false;
    qscene=new THREE.Scene();
    qscene.add(quad);
    qcam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    addEventListener('resize',()=>{
      if(!rt) return;
      rt.setSize(Math.max(2,Math.floor(innerWidth*0.85)),Math.max(2,Math.floor(innerHeight*0.85)));
      mat.uniforms.uAspect.value=innerWidth/innerHeight;
    });
  }

  /* 是否已装备夜视仪: 玩家当前主武器的 战术配件(gear) 槽 + 本次出击携带了夜视仪物品 */
  function owned(){
    try{
      if(!player||!player.alive) return false;
      if(RUN&&!RUN.nvgBrought) return false;
      const key=(player.curW&&player.curW.key)||(META&&META.loadout&&META.loadout.primary);
      if(!key||!WPN_DEFS[key]) return false;
      return getModChoice(key,'gear')==='gear_nvg';
    }catch(e){ return false; }
  }

  function toggle(){
    if(!owned()){ showScorePop('未携带夜视仪 (工坊装入战术配件槽 + 仓库持有夜视仪)'); return; }
    init();
    st.active=!st.active;
    updateInd();
    if(st.active){
      if(!NIGHT) showScorePop('白天开夜视 · 画面过曝');
      if(AudioSys.click) AudioSys.click(2100,0.18,0.03);
    } else if(AudioSys.click) AudioSys.click(900,0.18,0.03);
  }

  function setFilter(f){
    if(FIDX[f]===undefined) f='green';
    st.filter=f;
    if(mat) mat.uniforms.uFilter.value=FIDX[f];
    updateInd();
  }

  function updateInd(){
    const ind=document.getElementById('nvgInd');
    if(!ind) return;
    ind.classList.toggle('hidden',!st.active);
    if(st.active){
      const lbl=FILTER_LBL[st.filter];
      ind.textContent=lbl[0];
      ind.style.color=lbl[1];
      ind.style.borderColor=lbl[1];
    }
  }

  /* 每帧: 光照/曝光平滑过渡 + 全景 FOV + 指示器 */
  function update(dt){
    if(st.active&&!owned()){ st.active=false; updateInd(); }
    const target=st.active?1:0;
    const was=st.boost;
    st.boost+=(target-st.boost)*Math.min(1,dt*10);
    if(st.boost>0.001){
      if(NIGHT){
        // 夜间: 增强环境光 + 曝光, 把黑暗场景提亮到可辨
        sun.intensity=daySun*(1+st.boost*3.5);
        hemi.intensity=dayHemi*(1+st.boost*3.2);
        renderer.toneMappingExposure=dayExposure*(1+st.boost*1.2);
      } else {
        // 白天: 不补环境光, 只靠曝光+增益把画面压到过曝发白(能看到轮廓但刺眼)
        renderer.toneMappingExposure=dayExposure*(1+st.boost*1.7);
      }
      if(mat){
        mat.uniforms.uTime.value=performance.now()/1000;
        mat.uniforms.uGain.value=NIGHT?(1+st.boost*7):(1+st.boost*3.4);
      }
      if(st.active&&player&&player.alive&&!player.ads&&!player.onMG&&!player.onAT&&!player.onAA&&!player.onMortar&&!player.onVehicle){
        camera.fov=dampF(camera.fov,94,8,dt);
        camera.updateProjectionMatrix();
      }
    } else if(was>0.001){
      // 完全关闭: 复位光照/曝光/增益(同时修掉此前"关闭后不彻底复位"的小瑕疵)
      sun.intensity=daySun;
      hemi.intensity=dayHemi;
      renderer.toneMappingExposure=dayExposure;
      if(mat) mat.uniforms.uGain.value=1;
    }
    if(st.active) updateInd();
  }

  /* 后处理渲染: 激活时把战斗画面进 RT 再叠夜视; 未激活直接走原渲染 */
  function render(fn){
    if(!st.active||!rt){ fn(); return; }
    renderer.setRenderTarget(rt);
    renderer.clear(true,true,true);
    renderer.render(scene,camera);
    if(player&&player.alive&&!player.onMG&&VM.root.visible){
      renderer.clearDepth();
      renderer.render(vmScene,vmCamera);
    }
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(qscene,qcam);
  }

  try{
    const saved=localStorage.getItem('sf_nvg');
    if(FIDX[saved]!==undefined) st.filter=saved;
  }catch(e){}
  daySun=sun.intensity;
  dayHemi=hemi.intensity;
  dayExposure=renderer.toneMappingExposure;

  return { toggle, setFilter, update, render, active:()=>st.active, filter:()=>st.filter };
})();