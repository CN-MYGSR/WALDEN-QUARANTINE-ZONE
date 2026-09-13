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
  want:false,        // 玩家意图
  on:false,          // 实际点亮
  hasMod:false,      // 当前手持武器是否装了 light_flash
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

// 玩家是否在"手持轻武器"的状态 (与 30_main.js 里 updateViewModel 的判据保持一致)
function flashHandheld(){
  return typeof player!=='undefined' && player.alive && !player.onVehicle
      && !player.onMG && !player.onAT && !player.onAA && !player.onMortar;
}

function flashToggle(){
  const key=(typeof player!=='undefined'&&player.curW&&player.curW.key)||VM.key;
  const has=!!key&&typeof getModChoice==='function'&&getModChoice(key,'light')==='light_flash';
  if(!has){
    if(typeof showScorePop==='function') showScorePop('当前武器未安装『战术手电』');
    return false;
  }
  FLASH.want=!FLASH.want;
  if(typeof AudioSys!=='undefined'&&AudioSys.click) AudioSys.click(FLASH.want?1500:900,0.28,0.045);
  if(typeof showScorePop==='function') showScorePop(FLASH.want?'战术手电 · 开':'战术手电 · 关');
  return true;
}

const _flV=new THREE.Vector3(), _flFrom=new THREE.Vector3(0,0,-1), _flBeam=new THREE.Vector3(0,0,-1);
function updateFlashlight(dt){
  // 1) 解析状态
  const key=(typeof player!=='undefined'&&player.curW&&player.curW.key)||VM.key;
  FLASH.hasMod=!!key&&typeof getModChoice==='function'&&getModChoice(key,'light')==='light_flash';
  const on=!!(FLASH.want&&FLASH.hasMod&&flashHandheld());
  if(on!==FLASH.on){
    FLASH.on=on;
    FLASH.flick=on?0.35:0;
    if(FLASH.cone) FLASH.cone.visible=on&&SETTINGS.quality>=1;
  }
  // 2) 视模型镜片: 亮/灭
  const lens=VM.gunParts&&VM.gunParts.flashLens;
  if(lens&&lens.material){
    const want=FLASH.on?0xfff6dc:0x4a4740;
    if(lens.material.color.getHex()!==want) lens.material.color.setHex(want);
  }
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
