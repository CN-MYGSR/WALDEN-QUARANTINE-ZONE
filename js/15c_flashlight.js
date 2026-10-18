'use strict';
// ===================== 战术手电 (改件 light_flash) =====================
// 为什么需要单独一个文件:
//   手电必须"照亮主场景", 但第一人称枪模型渲染在独立的 vmScene 里
//   (见 03_renderer.js 的 vmScene/vmCamera)。挂在 vmScene 的灯只照得亮枪,
//   挂在主 scene 的灯又不会跟着枪走。所以这里做两件事:
//     1) 主 scene 里一个 SpotLight, 每帧同步到玩家眼位/枪口方向, 照亮世界;
//     2) 视模型里一块镜片网格, 只在点亮时发亮 (纯视觉反馈)。
//   开关状态分两层: FLASH.want = 玩家意图 (按 G), FLASH.on = 实际点亮,
//   后者还需要 hasMod && 手持武器, 所以收枪/上车/阵亡会自动熄灭而不会丢意图。
//
// 设计代价 (刻意保留): 亮着灯的玩家在敌人眼里更醒目 —— 见 FLASH.botExpose()
// 与 19_bot.js 的 perceive()。手电让你看得见, 也让别人看得见你。

const FLASH = {
  want:false,        // 玩家意图 (手电/激光共用)
  on:false,          // 实际点亮
  hasMod:false,      // 当前手持武器是否装了 light_flash 或 light_laser
  isLaser:false,     // 装的是激光指示器 (而不是手电)
  spot:null, target:null, cone:null,
  origin:new THREE.Vector3(),        // 光锥顶点 (世界坐标)
  dir:new THREE.Vector3(0,0,-1),     // 光锥轴向 (单位向量, 只取水平分量做暴露判定)
  expose:false,                      // 本帧是否构成"暴露源"
  exposeD:44,                        // 暴露判定距离
  exposeCos:Math.cos(0.62),          // 暴露判定半角 (~35.5°)
  exposeMul:1.35,                    // 被照到的敌人视野倍率
  beamLen:20,                        // 可视光柱长度 (纯视觉, 与 SpotLight 无关)
  flick:0,
};
// 距离/角度/衰减: three 的衰减是 (1 - d/distance)^decay, decay 太小时近距离几乎不衰减,
// 会让墙面直接过曝(实测 decay=1.1 时 5m 处仍有 0.89 的强度)。这里取 2.0 + 更短的距离。
const FLASH_SPOT_LEN=42, FLASH_SPOT_ANG=0.38, FLASH_SPOT_DECAY=2.0;

// ---- 爆闪手电 (改件 light_strobe) ----
// 与普通手电的区别: **不能常亮** —— 按 G 只触发一次爆闪。
// 闪 10 次; 范围内 + 视线内的敌人短暂失能; 自己也晃眼 (白屏)。
const STROBE={
  t:0,            // 本次爆闪剩余时间
  cd:0,           // 冷却
  flashes:10,     // 闪几次
  dur:1.6,        // 整段时长(秒)
  cdMax:12,       // 冷却(秒)
  range:15,       // 影响距离
  cos:Math.cos(0.62),  // 影响半角 (~35.5°)
  stun:2.6,       // 敌人失能时长(秒)
  blindT:0,       // 玩家白屏剩余时间
  lastN:0,        // 上一帧已经闪了几次 (用来数 10 次)
};

(function flashInit(){
  const sp=new THREE.SpotLight(0xfff0d2, 0, FLASH_SPOT_LEN, FLASH_SPOT_ANG, 0.45, FLASH_SPOT_DECAY);
  sp.castShadow=false; sp.visible=false;
  scene.add(sp);
  const tg=new THREE.Object3D(); scene.add(tg);
  sp.target=tg;
  FLASH.spot=sp; FLASH.target=tg;

  // 可视光柱: 锥尖在原点、沿 -Z 张开的空心锥 (alphaMap 沿长度渐隐)
  const cg=new THREE.ConeGeometry(1,1,20,1,true);
  cg.rotateX(-Math.PI/2);   // 锥尖 +Y → -Z
  cg.translate(0,0,-0.5);   // 锥尖移到原点
  const cv=document.createElement('canvas'); cv.width=4; cv.height=64;
  const cx=cv.getContext('2d');
  const gr=cx.createLinearGradient(0,0,0,64);
  gr.addColorStop(0,'#000000');   // v=0 = 远端 (锥底) → 完全透明
  gr.addColorStop(0.55,'#3a3a3a');
  gr.addColorStop(1,'#b4b4b4');   // v=1 = 近端 (锥尖) → 最亮
  cx.fillStyle=gr; cx.fillRect(0,0,4,64);
  const tex=new THREE.CanvasTexture(cv);
  const cm=new THREE.MeshBasicMaterial({
    color:0xfff0d2, transparent:true, opacity:0.10, alphaMap:tex,
    blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide, fog:false,
  });
  const cone=new THREE.Mesh(cg, cm);
  cone.visible=false; cone.frustumCulled=false; cone.renderOrder=4;
  scene.add(cone);
  FLASH.cone=cone;
})();

// 该 bot 是否正处在玩家手电的光锥里 (供 19_bot.perceive 调用)
FLASH.botExpose=function(bot){
  if(!FLASH.expose||!bot||!bot.pos) return false;
  const dx=bot.pos.x-FLASH.origin.x, dz=bot.pos.z-FLASH.origin.z;
  const d=Math.hypot(dx,dz);
  if(d>FLASH.exposeD) return false;
  if(d<0.6) return true;
  return (dx*FLASH.dir.x+dz*FLASH.dir.z)/d>=FLASH.exposeCos;
};

// ---- 当前 light 槽装的是什么 (手电 / 激光 / 无) ----
function lightModOf(){
  const key=(typeof player!=='undefined'&&player.curW&&player.curW.key)||VM.key;
  return (!!key&&typeof getModChoice==='function')?getModChoice(key,'light'):'light_none';
}

// ---- 激光指示器: 红色光柱 + 落点 ----
// 光束从枪口下方右侧射出, 在 LASER.zero 米处与准星重合(归零), 打到世界就停在表面。
// 用场景里的独立 mesh 画 (第一人称枪在 vmScene, 拿不到它的世界坐标, 所以和手电一样按相机位姿推算)。
const LASER={ beam:null, dot:null, zero:30, maxLen:70 };
(function laserInit(){
  const cg=new THREE.CylinderGeometry(1,1,1,6,1,true);
  cg.rotateX(-Math.PI/2); cg.translate(0,0,-0.5);      // 沿 -Z 展开, 起点在原点
  const cm=new THREE.MeshBasicMaterial({
    color:0xff2a2a, transparent:true, opacity:0.40, alphaMap:null,
    blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide, fog:false,
  });
  const beam=new THREE.Mesh(cg,cm);
  beam.visible=false; beam.frustumCulled=false; beam.renderOrder=5;
  scene.add(beam); LASER.beam=beam;

  const dg=new THREE.SphereGeometry(1,8,6);
  const dm=new THREE.MeshBasicMaterial({
    color:0xff3a3a, transparent:true, opacity:0.85,
    blending:THREE.AdditiveBlending, depthWrite:false, fog:false,
  });
  const dot=new THREE.Mesh(dg,dm);
  dot.visible=false; dot.frustumCulled=false; dot.renderOrder=5;
  scene.add(dot); LASER.dot=dot;
})();
const _lzFrom=new THREE.Vector3(), _lzTo=new THREE.Vector3(), _lzDir=new THREE.Vector3();
const _lzAxis=new THREE.Vector3(0,0,-1);
function laserHide(){ if(LASER.beam) LASER.beam.visible=false; if(LASER.dot) LASER.dot.visible=false; }
function updateLaserBeam(){
  const f=camForward(), r=camRight();
  const k=1-VM.adsBlend*0.7;   // 开镜时枪口向中间收拢
  _lzFrom.set(camera.position.x+r.x*0.13*k, camera.position.y-0.085*k, camera.position.z+r.z*0.13*k);
  _lzTo.set(camera.position.x+f.x*LASER.zero, camera.position.y+f.y*LASER.zero, camera.position.z+f.z*LASER.zero);
  _lzDir.copy(_lzTo).sub(_lzFrom).normalize();
  // 落点: 打到世界就停在表面, 没打到就拉到最大射程
  let dist=LASER.maxLen;
  try{
    const h=raycastWorld(_lzFrom,_lzDir.clone(),LASER.maxLen);
    if(h&&h.dist>0.4) dist=h.dist;
  }catch(e){}
  const beam=LASER.beam;
  if(beam){
    beam.visible=true;
    beam.position.copy(_lzFrom);
    beam.quaternion.setFromUnitVectors(_lzAxis,_lzDir);
    beam.scale.set(0.007,0.007,dist);
  }
  const dot=LASER.dot;
  if(dot){
    dot.visible=true;
    dot.position.copy(_lzFrom).addScaledVector(_lzDir,dist);
    dot.scale.setScalar(0.012+dist*0.0009);
  }
}

// 玩家是否在"手持轻武器"的状态 (与 30_main.js 里 updateViewModel 的判据保持一致)
function flashHandheld(){
  return typeof player!=='undefined' && player.alive && !player.onVehicle
      && !player.onMG && !player.onAT && !player.onAA && !player.onMortar;
}

// 手电 / 激光共用同一个开关意图 (FLASH.want) —— light 槽只可能装其中一个
function flashToggle(){
  const mod=lightModOf();
  // 爆闪手电: 不常亮, G = 触发爆闪
  if(mod==='light_strobe'){ return strobeFire(); }   // ⚠️ 必须 return strobeFire() —— 冷却中它返回 false
  if(mod!=='light_flash'&&mod!=='light_laser'){
    if(typeof showScorePop==='function') showScorePop('当前武器未安装照明改件');
    return false;
  }
  FLASH.want=!FLASH.want;
  if(typeof AudioSys!=='undefined'&&AudioSys.click) AudioSys.click(FLASH.want?1500:900,0.28,0.045);
  const nm=(mod==='light_laser')?'激光指示器':'战术手电';
  if(typeof showScorePop==='function') showScorePop(nm+(FLASH.want?' · 开':' · 关'));
  return true;
}

// ---- 爆闪: 触发 ----
function strobeFire(){
  if(!flashHandheld()){ if(typeof showScorePop==='function') showScorePop('手持武器时才能用爆闪'); return false; }
  if(STROBE.t>0) return false;
  if(STROBE.cd>0){ if(typeof showScorePop==='function') showScorePop('爆闪冷却中 · '+STROBE.cd.toFixed(1)+'s'); return false; }
  STROBE.t=STROBE.dur; STROBE.cd=STROBE.cdMax; STROBE.lastN=0;
  STROBE.blindT=0.42;                       // 自己也晃一下眼
  if(typeof AudioSys!=='undefined'&&AudioSys.click) AudioSys.click(2400,0.5,0.06);
  if(typeof showScorePop==='function') showScorePop('爆闪!');
  strobeApply();
  // 联机: 让同房间的其他真人也被晃 (见 55_net)
  try{
    if(typeof NET!=='undefined'&&NET.room) NET.room.send({t:'strobe',x:camera.position.x,y:camera.position.y,z:camera.position.z});
  }catch(e){}
  return true;
}
// ---- 爆闪: 判定范围内 + 视线内的敌人, 使其短暂失能 ----
function strobeApply(){
  const o=camera.position, f=camForward();
  let hit=0;
  for(const s of soldiers){
    if(!s.alive||s.team===player.team||s.netRemote) continue;
    const dx=s.pos.x-o.x, dy=(s.pos.y+1.4)-o.y, dz=s.pos.z-o.z;
    const d=Math.hypot(dx,dy,dz);
    if(d>STROBE.range) continue;
    if((dx*f.x+dy*f.y+dz*f.z)/Math.max(d,0.001)<STROBE.cos) continue;   // 不在光锥内
    // 视线: 被墙挡住就闪不到
    try{ const w=raycastWorld(o, V3(dx/d,dy/d,dz/d), d); if(w&&w.dist<d-0.6) continue; }catch(e){}
    s.stunT=STROBE.stun;
    s.target=null; s.path=null; s.suppression=1.6;
    hit++;
  }
  if(hit>0&&typeof showScorePop==='function') showScorePop('爆闪命中 '+hit+' 名敌人');
}
function updateStrobe(dt){
  if(STROBE.cd>0) STROBE.cd=Math.max(0,STROBE.cd-dt);
  if(STROBE.blindT>0) STROBE.blindT=Math.max(0,STROBE.blindT-dt);
  const ov=(typeof document!=='undefined')?document.getElementById('strobeOv'):null;
  if(STROBE.t>0){
    STROBE.t-=dt;
    const k=1-STROBE.t/STROBE.dur;                 // 0 → 1
    const n=Math.min(STROBE.flashes,Math.floor(k*STROBE.flashes)+1);
    STROBE.lastN=n;
    // 点亮时给主场景一盏爆闪灯 (与手电共用同一盏, 但强度更高)
    if(FLASH.spot){
      const on=(Math.floor(k*STROBE.flashes*2)%2===0);
      FLASH.spot.visible=on&&flashHandheld();
      FLASH.spot.intensity=on?6.5:0;
      const f=camForward();
      FLASH.spot.position.set(camera.position.x,camera.position.y,camera.position.z);
      FLASH.target.position.set(camera.position.x+f.x*20,camera.position.y+f.y*20,camera.position.z+f.z*20);
    }
    if(STROBE.t<=0){ if(FLASH.spot){ FLASH.spot.visible=false; FLASH.spot.intensity=0; } }
  }
  if(ov){
    const a=STROBE.blindT>0?clamp(STROBE.blindT/0.42,0,1):0;
    ov.style.opacity=a.toFixed(3);
  }
}

const _flV=new THREE.Vector3(), _flFrom=new THREE.Vector3(0,0,-1), _flBeam=new THREE.Vector3(0,0,-1);
function updateFlashlight(dt){
  // 1) 解析状态
  const _lm=lightModOf();
  FLASH.isLaser=(_lm==='light_laser');
  FLASH.hasMod=(_lm==='light_flash'||_lm==='light_laser');
  const on=!!(FLASH.want&&FLASH.hasMod&&flashHandheld());
  if(on!==FLASH.on){
    FLASH.on=on;
    FLASH.flick=on?0.35:0;
    if(FLASH.cone) FLASH.cone.visible=on&&!FLASH.isLaser&&SETTINGS.quality>=1;
  }
  // 2) 视模型镜片: 亮/灭 (手电 / 激光各自的镜片)
  const lens=VM.gunParts&&(FLASH.isLaser?VM.gunParts.laserLens:VM.gunParts.flashLens);
  if(lens&&lens.material){
    const want=FLASH.isLaser?(FLASH.on?0xff3030:0x5a2020):(FLASH.on?0xfff6dc:0x4a4740);
    if(lens.material.color.getHex()!==want) lens.material.color.setHex(want);
  }
  // 2b) 激光指示器: 只画光柱与落点 —— 不照亮环境, 也不构成暴露源 (与手电正好相反)
  if(FLASH.isLaser){
    if(on) updateLaserBeam(); else laserHide();
    FLASH.expose=false;
    FLASH.spot.visible=false; FLASH.spot.intensity=0;
    if(FLASH.cone) FLASH.cone.visible=false;
    return;
  }
  laserHide();
  FLASH.expose=false;
  if(!FLASH.on){ FLASH.spot.visible=false; FLASH.spot.intensity=0; if(FLASH.cone) FLASH.cone.visible=false; return; }

  // 3) 位置/朝向: 眼位向右下偏移(近似枪口), 开镜时向中心收拢
  const f=camForward(), r=camRight();
  const k=1-VM.adsBlend*0.85;
  _flV.set(camera.position.x+r.x*0.15*k, camera.position.y-0.12*k, camera.position.z+r.z*0.15*k);
  FLASH.spot.position.copy(_flV);
  FLASH.target.position.set(_flV.x+f.x*30,_flV.y+f.y*30,_flV.z+f.z*30);
  FLASH.origin.copy(_flV);
  // 暴露判定只用水平分量 (忽略俯仰, 免得低头时脚下敌人反而看不见)
  FLASH.dir.set(f.x,0,f.z);
  if(FLASH.dir.lengthSq()<1e-6) FLASH.dir.set(0,0,-1); else FLASH.dir.normalize();

  // 4) 强度: 开关瞬间的短促"点亮"脉冲 + 极轻微灯丝抖动
  FLASH.flick=Math.max(0,FLASH.flick-dt);
  const pulse=FLASH.flick>0?1+FLASH.flick*1.6:1;
  const jitter=1+Math.sin(nowT*37.0)*0.012+Math.sin(nowT*11.3)*0.008;
  FLASH.spot.intensity=40*pulse*jitter;
  FLASH.spot.visible=true;
  FLASH.expose=true;

  // 5) 可视光柱跟随
  const cone=FLASH.cone;
  if(cone&&cone.visible){
    const rad=FLASH.beamLen*Math.tan(FLASH_SPOT_ANG);
    cone.position.copy(_flV);
    _flBeam.set(f.x,f.y,f.z).normalize();
    cone.quaternion.setFromUnitVectors(_flFrom,_flBeam);
    cone.scale.set(rad,rad,FLASH.beamLen);
    cone.material.opacity=0.10*pulse;
  }
}
