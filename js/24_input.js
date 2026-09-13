'use strict';
// 小队指令标记: 多种纹理(进攻/驻守), 按模式切换
function squadMarkerTex(label,color){
const c=document.createElement('canvas'); c.width=64; c.height=64;
const g=c.getContext('2d');
g.fillStyle=color;
g.beginPath(); g.moveTo(32,58); g.lineTo(14,28); g.lineTo(50,28); g.closePath(); g.fill();
g.strokeStyle='rgba(0,0,0,.7)'; g.lineWidth=3; g.stroke();
g.fillStyle=color; g.font='bold 24px sans-serif'; g.textAlign='center';
g.fillText(label,32,30);
g.strokeStyle='rgba(0,0,0,.65)'; g.lineWidth=2; g.strokeText(label,32,30);
return new THREE.CanvasTexture(c);
}
function squadMarkerInit(){
if(!SQUAD.marker){
SQUAD.marker=new THREE.Sprite(new THREE.SpriteMaterial({map:squadMarkerTex('攻','#ffd75a'),transparent:true,depthTest:false}));
SQUAD.marker.scale.set(2.2,2.2,1);
SQUAD.marker.renderOrder=6;
SQUAD.marker.visible=false;
scene.add(SQUAD.marker);
}
return SQUAD.marker;
}
function squadSetMarker(label,color,on){
const m=squadMarkerInit();
if(m.material.map) m.material.map.dispose();
m.material.map=squadMarkerTex(label,color);
m.material.needsUpdate=true;
m.visible=!!on;
return m;
}
function squadWake(){
for(const s of SQUAD.members){ if(s.alive&&!s.onVehicle){ s.decisionT=0; s.repathT=0; s.path=null; } }
}
function squadOrderMove(){
if(!player.alive||!SQUAD.members.length) return;
const o=camera.position.clone(), d=camForward();
const hit=raycastWorld(o,d,150);
const pt=hit?o.clone().addScaledVector(d,hit.dist):o.clone().addScaledVector(d,90);
pt.y=heightAt(pt.x,pt.z);
SQUAD.mode='move';
SQUAD.target=null;
SQUAD.pos.copy(pt);
SQUAD.guardYaw=null;
const m=squadSetMarker('攻','#ffd75a',true);
m.position.set(pt.x,pt.y+2.1,pt.z);
squadWake();
showScorePop('小队: 进攻标记位置!');
AudioSys.click(1500,0.3,0.05); AudioSys.click(1100,0.25,0.06);
}
function squadOrderGuard(){
if(!player.alive||!SQUAD.members.length) return;
const o=camera.position.clone(), d=camForward();
const hit=raycastWorld(o,d,150);
const pt=hit?o.clone().addScaledVector(d,hit.dist):o.clone().addScaledVector(d,90);
pt.y=heightAt(pt.x,pt.z);
SQUAD.mode='guard';
SQUAD.target=null;
SQUAD.pos.copy(pt);
SQUAD.guardYaw=Math.atan2(d.x,d.z);
const m=squadSetMarker('守','#7dd87d',true);
m.position.set(pt.x,pt.y+2.1,pt.z);
squadWake();
showScorePop('小队: 驻守此位置!');
AudioSys.click(900,0.3,0.05); AudioSys.click(1400,0.25,0.06);
}
function squadOrderAttack(){
if(!player.alive||!SQUAD.members.length) return;
// 优先锁定准星所指敌军
let best=null,bestAng=0.16;
const o=camera.position.clone(), d=camForward();
for(const s of soldiers){
if(!s.alive||s.team===player.team||s.onVehicle) continue;
const tp=V3(s.pos.x,s.pos.y+(s.crouch?1.0:1.4),s.pos.z);
const to=tp.clone().sub(o); const dist=to.length();
if(dist>120) continue;
to.normalize();
const ang=Math.acos(clamp(to.dot(d),-1,1));
if(ang<bestAng){
const chk=raycastWorld(o,to.clone(),dist);
if(chk&&chk.dist<dist-0.5) continue;
best=s; bestAng=ang;
}
}
if(best){
SQUAD.mode='attack';
SQUAD.target=best;
SQUAD.pos.copy(best.pos);
SQUAD.guardYaw=null;
const m=squadSetMarker('攻','#ff5040',true);
m.position.set(best.pos.x,best.pos.y+2.3,best.pos.z);
squadWake();
showScorePop('小队: 攻击 '+best.name+'!');
AudioSys.click(1700,0.3,0.05); AudioSys.click(1200,0.25,0.06);
} else squadOrderMove();
}
function squadOrderFollow(){
if(!SQUAD.members.length) return;
SQUAD.mode='follow';
SQUAD.target=null;
SQUAD.guardYaw=null;
if(SQUAD.marker) SQUAD.marker.visible=false;
squadWake();
showScorePop('小队: 跟我走!');
AudioSys.click(1300,0.3,0.05);
}
// ===== 大地图 (M键) =====
let bigMapOn=false;
function toggleBigMap(on){
if(!player.deployed||matchOver) return;
bigMapOn=on===undefined?!bigMapOn:on;
const w=el('bigmapWrap');
if(bigMapOn){
w.classList.remove('hidden');
drawBigMap();
} else w.classList.add('hidden');
}
function bigMapVisible(){ return bigMapOn; }
const keys={};
let pointerLocked=false;
// 徒手可用判定: 步行状态 或 运兵车乘客(车斗内可用手中武器)
function handsFreeVeh(){ return !player.onVehicle||(typeof isApcPassenger==='function'&&isApcPassenger()); }
// 高低姿态持枪: 绝对设置 'high' | 'low'。
// 注意: 必须是文件级独立函数(而非 InputActions 的方法), 因为滚轮处理器与触屏按钮
//       都直接调用裸名 setCarryStance(...); 之前它被误写成对象方法, 导致 typeof 守卫
//       静默失败, 滚轮/触屏切姿态全部无效。
function setCarryStance(to){ // 绝对设置: 'high' | 'low'
if(player.onMG||player.onVehicle||player.onAT||player.onAA||player.onMortar) return;
if(player.carry===to) return;
player.carry=to; player.carryT=nowT;
if(to==='low'){
player.ads=false; player.braced=false;
AudioSys.metalSlide(0.13,0.06,700,1400);
showScorePop('低位持枪 · 移动加速 / 抬枪变慢');
}else{
AudioSys.click(560,0.35,0.05); AudioSys.metalSlide(0.1,0.05,900,1600);
showScorePop('高位持枪 · 抬枪迅速 / 移动略慢');
}
}
// ===== 输入动作抽象层: 键鼠与触控共用同一套动作逻辑 =====
const InputActions={
 toggleCrouch(){ // C: 蹲 / 坦克内切换炮手镜 / 飞机内切换机炮瞄准镜
 if(player.onVehicle&&player.onVehicle.kind==='tank'){ player.tankView=!player.tankView; }
 else if(player.onVehicle&&player.onVehicle.kind==='plane'){
 player.planeView=!player.planeView;
 showScorePop(player.planeView?'驾驶舱视角 ON · 再按 C 退出':'驾驶舱视角 OFF');
 }
 else { player.crouch=!player.crouch; player.prone=false; }
 },
toggleProne(){ // Z: 趴
if(player.onMG||player.onVehicle||player.onAT||player.onAA||player.onMortar) return;
player.prone=!player.prone;
if(player.prone){ player.crouch=false; player.braced=false; }
},
toggleBrace(){ // X: 架枪
if(player.prone) return;
if(player.braced){ player.braced=false; AudioSys.metalSlide(0.18,0.08,500,900); }
else if(player.canBrace){
player.braced=true; player.braceYaw=player.yaw;
AudioSys.metalSlide(0.3,0.13,320,170); AudioSys.click(700,0.3,0.05);
}
},
toggleCarry(){ // (鼠标滚轮 / 触屏) 高低姿态持枪切换
  setCarryStance(player.carry==='high'?'low':'high');
},
 melee(){ // V: 近战
 if(VM.state==='idle'&&!player.onMG&&handsFreeVeh()&&!player.onAT&&!player.onAA&&!player.onMortar&&player.meleeCd<=0){
 VM.state='melee'; VM.stateT=0; VM.stateDur=0.5; player.meleeCd=0.7; vmSndFlags={}; AudioSys.metalSlide(0.15,0.06,1200,2000);
 }
 },
 vtolToggle(){ // V(驾驶VTOL战机): 垂直起降切换
 const t=player.onVehicle;
 if(!t||t.kind!=='plane'||!t.def.vtol||!t.playerDriven) return;
 if(t.vtolOn&&t.pos.y<heightAt(t.pos.x,t.pos.z)+14){
 showScorePop('悬停高度过低, 请先爬升再取消 VTOL');
 return;
 }
 t.vtolOn=!t.vtolOn;
 if(t.vtolOn){
 if(!t.hs) t.hs={vy:0,spd:0};
 showScorePop('VTOL 悬停 ON · W/S 升降 · 再按 V 退出');
 } else {
 // 重建速度矢量转入常规飞行
 t.velV=V3(Math.sin(t.yaw)*Math.cos(t.pitch),Math.sin(t.pitch),Math.cos(t.yaw)*Math.cos(t.pitch)).multiplyScalar(Math.max(t.speed,10));
 t.throttle=0.85;
 showScorePop('常规飞行 · W/S 油门');
 }
 AudioSys.metalSlide(0.2,0.1,700,500);
 },
nadeEquip(){ // 3: 拿出手雷 / 再按一次收起
if(player.nadeHeld){ InputActions.nadeHolster(); return; }
if(player.nadeCount>0&&VM.state==='idle'&&!player.onMG&&handsFreeVeh()&&!player.onAT&&!player.onAA&&!player.onMortar){
VM.state='nade'; VM.stateT=0; VM.stateDur=999;
player.nadeHeld=true; player.nadeFuse=3.8; player.nadeIsAT=false; player.nadeIsSmoke=false; player.nadeIsFlash=false;
player.nadeCharge=0; player.nadeCharging=false; player.ads=false;
vmSndFlags={};
AudioSys.click(1600,0.25,0.04);
showScorePop('手雷就位 · 按住右键蓄力, 松开投出 · 再按 3 收起');
} else if(player.nadeCount<=0){
showScorePop('没有手雷了 · 投掷物需自费在市集购买并带入');
}
},
nadeHolster(){ // 收起手雷, 回到武器
if(VM.state!=='nade') return;
player.nadeHeld=false; player.nadeCharging=false; player.nadeCharge=0;
VM.state='idle'; VM.stateT=0; vmSndFlags={};
if(VM.gunParts&&VM.gunParts.gun) VM.gunParts.gun.visible=true;
if(VM.nadeM) VM.nadeM.visible=false;
},
nadeChargeStart(){ // 右键按下: 开始蓄力
if(VM.state==='nade'&&player.nadeHeld&&!player.nadeCharging){
player.nadeCharging=true; player.nadeCharge=0;
AudioSys.click(900,0.2,0.03);
}
},
nadeChargeRelease(){ // 右键松开: 按当前蓄力投出
if(!player.nadeCharging) return;
player.nadeCharging=false;
player.nadeHeld=false;
VM.stateT=0; VM.stateDur=0.55;
vmSndFlags={};
},
// 投掷物键位 (2026-09-13): 3=手雷 4=闪光弹 5=烟雾弹, 全部自费带入
quickThrow(field,flag){
if((player[field]|0)<=0){ showScorePop('没有该投掷物了 · 需在市集购买并带入'); return; }
if(VM.state!=='idle'||player.onMG||!handsFreeVeh()||player.onAT||player.onAA||player.onMortar) return;
VM.state='nade'; VM.stateT=0; VM.stateDur=0.6;
player.nadeHeld=false; player.nadeIsAT=false;
player.nadeIsSmoke=(flag==='nadeIsSmoke'); player.nadeIsFlash=(flag==='nadeIsFlash');
vmSndFlags={};
AudioSys.click(1000,0.28,0.05);
},
throwFlash(){ InputActions.quickThrow('flashCount','nadeIsFlash'); },
throwSmoke(){ InputActions.quickThrow('smokeCount','nadeIsSmoke'); },
bandage(){ // H: 使用医疗品 (按伤势自动选择)
if(typeof useMedQuick==='function') useMedQuick();
else InputActions.legacyBandage();
},
legacyBandage(){ // 兜底: 未挂载塔科夫系统时走旧绷带
const needBandage=player.hp<(player.maxHp||100)||(player.limbs&&(player.limbs.head<95||player.limbs.arms<95||player.limbs.torso<95||player.limbs.legs<95));
if(VM.state==='idle'&&player.bandages>0&&needBandage&&player.bandaging<=0&&handsFreeVeh()&&!player.onMG&&!player.onAT&&!player.onAA){
player.bandaging=2.6;
VM.state='bandage'; VM.stateT=0; VM.stateDur=2.6;
vmSndFlags={};
showScorePop('包扎中…');
AudioSys.metalSlide(0.14,0.25,400,700);
}
},
eatFood(){ // K: 食用选中食物
if(typeof useFoodQuick==='function') useFoodQuick();
},
cycleFoodSel(){ // J: 切换食物
if(typeof cycleFood==='function') cycleFood();
},
classSkill(){ // B: 兵种技能
if(player.cls===4&&!player.onVehicle&&!player.onMG&&!player.onAT&&!player.onAA&&!player.onMortar){
engBuild(player);
} else if(player.cls===2&&!player.onVehicle&&!player.onMG&&!player.onAT&&!player.onAA&&!player.onMortar){
if((player.medkitT||0)<=nowT){
const fd=camForward();fd.y=0;
const ok=fd.lengthSq()>0.1;
if(ok) fd.normalize();
placeMedkit(player,player.pos.x+(ok?fd.x*1.2:0),player.pos.z+(ok?fd.z*1.2:0));
player.medkitT=nowT+30;
} else showScorePop('医疗箱冷却中 ('+Math.ceil(player.medkitT-nowT)+'s)');
}
},
buildNext(){ // 5: 工程兵切换工事
if(player.cls!==4) return;
player.buildSel=((player.buildSel||0)+1)%BUILD_MENU.length;
const bt=BUILD_MENU[player.buildSel];
const bn=bt==='mg'?mgDefOfTeam(player.team).name:BUILD_NAMES[bt];
showScorePop('建造选择: '+bn+' (消耗'+BUILD_COST[bt]+'点'+(MOBILE?'':' · 按B放置')+')');
},
};
addEventListener('keydown',e=>{
if(e.code==='Tab'){ e.preventDefault(); if(typeof toggleBagPanel==='function') toggleBagPanel(); }
if(e.code==='KeyP'){ document.getElementById('scoreboard').style.display='block'; updateScoreboard(); }
if(e.repeat) return;
keys[e.code]=true;
if(!player.alive||!pointerLocked) return;
// 背包面板打开时优先消费方向键/G/Q/Esc, 避免与游戏操作冲突
if(typeof bagPanelKey==='function'&&bagPanelKey(e.code,e.shiftKey)) return;
if(e.code==='KeyN'&&typeof NVG!=='undefined') NVG.toggle();
if(e.code==='KeyG'&&typeof flashToggle==='function') flashToggle();
if(e.code==='KeyR') tryReload();
if(e.code==='KeyC') InputActions.toggleCrouch();
if(e.code==='KeyZ') InputActions.toggleProne();
if(e.code==='KeyX') InputActions.toggleBrace();
if(e.code==='Digit1') switchSlot(0);
if(e.code==='Digit2') switchSlot(1);
 if(e.code==='KeyV'){
 if(player.onVehicle&&player.onVehicle.kind==='plane'&&player.onVehicle.def.vtol&&player.onVehicle.playerDriven) InputActions.vtolToggle();
 else InputActions.melee();
 }
if(e.code==='Digit3') InputActions.nadeEquip();
if(e.code==='Digit4') InputActions.throwFlash();
if(e.code==='Digit5') InputActions.throwSmoke();
if(e.code==='KeyH') InputActions.bandage();
if(e.code==='KeyK') InputActions.eatFood();
if(e.code==='KeyJ') InputActions.cycleFoodSel();
if(e.code==='KeyB') InputActions.classSkill();
// 6: 工程兵选工事 (5 已让给烟雾弹; AT 雷整体移除)
if(e.code==='Digit6'){ if(player.cls===4) InputActions.buildNext(); }
if(e.code==='KeyF') tryInteract();
if(e.code==='ArrowUp'&&typeof lootSelMove==='function'){ lootSelMove(-1); }
if(e.code==='ArrowDown'&&typeof lootSelMove==='function'){ lootSelMove(1); }
if(e.code==='KeyT') squadOrderAttack();
if(e.code==='KeyY') squadOrderFollow();
if(e.code==='KeyU') squadOrderGuard();
if(e.code==='KeyM') toggleBigMap(true);
});
addEventListener('keyup',e=>{
keys[e.code]=false;
if(e.code==='KeyP') document.getElementById('scoreboard').style.display='none';
if(e.code==='KeyM') toggleBigMap(false);
});
let mouseDown=false, mouse2Down=false;
addEventListener('mousedown',e=>{
if(!pointerLocked){ return; }
if(e.button===0) mouseDown=true;
if(e.button===2){
mouse2Down=true;
// 手雷状态下右键专用于投掷(就位=开始蓄力, 投掷动画中=忽略), 一律不触发开镜
if(VM.state==='nade'){ if(player.nadeHeld) InputActions.nadeChargeStart(); return; }
if(player.alive&&!player.onMG&&handsFreeVeh()&&!player.onAT&&!player.onAA&&!player.onMortar){
if(SETTINGS.adsToggle) player.ads=!player.ads;
else player.ads=true;
// 开镜立即回到高位持枪(低位是行进姿态, 与抵肩瞄准互斥)
if(player.ads&&player.carry==='low'){ player.carry='high'; player.carryT=nowT; }
}
}
});
addEventListener('mouseup',e=>{
if(e.button===0) mouseDown=false;
if(e.button===2){
mouse2Down=false;
// 手雷: 松开右键 = 投出 (距离由蓄力时长决定)
if(VM.state==='nade'){ InputActions.nadeChargeRelease(); return; }
if(!SETTINGS.adsToggle) player.ads=false;
}
});
addEventListener('contextmenu',e=>e.preventDefault());
// ===== 鼠标滚轮: 切换高低姿态持枪 =====
// 上滚 → 高位持枪(抵肩待发), 下滚 → 低位持枪(枪口下压, 移动加速)
// 仅在步兵状态下生效; 背包面板打开时滚轮用于滚动列表, 不切姿态。
let _wheelAcc=0, _wheelLockT=0;
addEventListener('wheel',e=>{
if(!pointerLocked||!player.alive) return;
if(typeof BAG_UI!=='undefined'&&BAG_UI.open) return;      // 背包打开时不抢滚轮
if(player.onMG||player.onVehicle||player.onAT||player.onAA||player.onMortar) return;
e.preventDefault();
const now=performance.now();
if(now-_wheelLockT<180) return;                            // 防抖: 触控板惯性滚动会连发
const dy=e.deltaY;
_wheelAcc+=dy;
if(Math.abs(_wheelAcc)<8) return;
const dir=_wheelAcc>0?'low':'high';                        // 下滚=低位, 上滚=高位
_wheelAcc=0; _wheelLockT=now;
if(player.carry!==dir&&typeof setCarryStance==='function') setCarryStance(dir);
},{passive:false});
let lockGraceUntil=0; // 修复: 指针锁定切换后浏览器可能给出一次异常巨大的 movementX 导致视角瞬移
addEventListener('mousemove',e=>{
if(!pointerLocked||!player.alive) return;
if(performance.now()<lockGraceUntil) return;
 let mx=e.movementX, my=e.movementY;
 if(!isFinite(mx)||!isFinite(my)) return;
 if(mx>160)mx=160; else if(mx<-160)mx=-160; // 钳制单事件位移, 消除1帧瞬转尖峰
 if(my>160)my=160; else if(my<-160)my=-160;
 if(player.onVehicle&&player.onVehicle.kind==='plane') my=-my; // 飞机拉杆反转: 鼠标上推=推杆(机头下压)
const d=WPN_DEFS[VM.key]||{};
const zoomFac=player.ads?(d.adsFov||60)/74:1;
const s=0.0022*SETTINGS.sens*zoomFac;
player.yaw-=mx*s;
player.pitch-=my*s;
player.pitch=clamp(player.pitch,-1.45,1.45);
player.mouseDX=mx; player.mouseDY=my;
});
document.addEventListener('pointerlockchange',()=>{
if(MOBILE) return;
pointerLocked=document.pointerLockElement===renderer.domElement;
lockGraceUntil=performance.now()+120;
toggleBigMap(false);
if(!pointerLocked&&player.alive&&player.deployed&&!matchOver){
showDeploy(false);
}
});
function lockPointer(){
if(MOBILE){ pointerLocked=true; return; }
try{ const r=renderer.domElement.requestPointerLock(); if(r&&r.catch) r.catch(()=>{}); }catch(e){}
}
function tryReload(){
const w=player.curW;
if(!w||player.onMG||!handsFreeVeh()||player.onAT||player.onAA) return;
if(VM.state!=='idle') return;
if(w.mag>=w.def.mag||w.reserve<=0) return;
VM.state='reload'; VM.stateT=0; VM.stateDur=w.def.reload;
vmSndFlags={};
}
function switchSlot(i){
if(i===player.curSlot||!player.slots[i]||player.onMG||!handsFreeVeh()||player.onAT||player.onAA) return;
if(VM.state!=='idle'&&VM.state!=='fire') return;
player.curSlot=i;
player.curW=player.slots[i];
vmEquip(player.curW.key,player.team);
}
// ===== 降落伞模型 (玩家跳伞 / Bot 空降) =====
let playerChuteMesh=null;
function chuteLine(g,from,to,mat){
const d=V3(to.x-from.x,to.y-from.y,to.z-from.z);
const len=d.length();
if(len<0.01) return;
const m=new THREE.Mesh(new THREE.CylinderGeometry(0.013,0.013,len,3),mat);
m.position.set(from.x+d.x*0.5,from.y+d.y*0.5,from.z+d.z*0.5);
m.quaternion.setFromUnitVectors(V3(0,1,0),d.normalize());
g.add(m);
}
function mkChute(scale=1){
const g=new THREE.Group();
const mat=new THREE.MeshLambertMaterial({color:0x9aa08c,side:THREE.DoubleSide});
const canopy=new THREE.Mesh(new THREE.SphereGeometry(2.3,12,7,0,TAU,0,1.05),mat);
canopy.scale.set(1,0.75,1);
canopy.castShadow=true;
g.add(canopy);
const lm=new THREE.MeshBasicMaterial({color:0x33352c});
const rim=2.3*Math.sin(1.05), rimY=2.3*Math.cos(1.05)*0.75;
for(const a of [0.4,1.97,3.54,5.11]){
chuteLine(g,V3(Math.sin(a)*rim,rimY-0.1,Math.cos(a)*rim),V3(0,-3.3,0),lm);
}
g.scale.setScalar(scale);
return g;
}
function mkChuteForBot(){ return mkChute(0.78); }
