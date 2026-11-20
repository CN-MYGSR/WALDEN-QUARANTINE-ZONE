'use strict';
function tryInteract(){
if(!player.alive) return;
if(player.onMG){
player.onMG.user=null; player.onMG=null;
VM.root.visible=true;
document.getElementById('heatWrap').style.display='none';
return;
}

// 迫击炮: 上炮/下炮 (架设后所有人可用, 回收=迫击炮手按B)
if(player.onMortar){
const m3=player.onMortar;
m3.user=null; player.onMortar=null; VM.root.visible=true;
document.getElementById('heatWrap').style.display='none';
return;
}
// 救援倒地队友 (优先级高于其它交互) —— 由 57_downed 提供
if(typeof playerTryRescue==='function'&&playerTryRescue()) return;
{
const m2=MORTARS.find(m=>m.alive&&!m.user&&Math.hypot(m.x-player.pos.x,m.z-player.pos.z)<2.8);
if(m2){
player.onMortar=m2; m2.user=player;
VM.root.visible=false;
document.getElementById('heatWrap').style.display='block';
showScorePop('迫击炮瞄准中');
return;
}
}
for(const mg of MG42S){
if(mg.user) continue;
if(Math.hypot(mg.x-player.pos.x,mg.z-player.pos.z)<2.6){
player.onMG=mg; mg.user=player;
player.pos.x=mg.x-Math.sin(mg.face)*0.85;
player.pos.z=mg.z-Math.cos(mg.face)*0.85;
player.yaw=mg.face+Math.PI; player.pitch=0; player.ads=false;
VM.root.visible=false;
document.getElementById('heatWrap').style.display='block';
return;
}
}
if(typeof EXTRACT_POINTS!=='undefined'&&GAMEMODE==='extract'){
for(const ex of EXTRACT_POINTS){
if(Math.hypot(ex.x-player.pos.x,ex.z-player.pos.z)<ex.r){
startExtraction();
return;
}
}
}
// 撤离模式: F = 打开搜尸/物资箱面板 (↑/↓ 选择, 再按F拿取选中)
if(GAMEMODE==='extract'&&typeof tryLootInteract==='function'&&tryLootInteract()) return;
if(player.resupplyCd<=0){
for(const ac of AMMO_CRATES){
if(Math.hypot(ac.x-player.pos.x,ac.z-player.pos.z)<2.6){
player.grabAction={kind:'ammo',crate:ac};
VM.state='grab'; VM.stateT=0; VM.stateDur=0.85; vmSndFlags={};
document.getElementById('interact').style.display='none';
return;
}
}
}
if(player.bandResupCd<=0&&player.bandages<player.maxBandages){
for(const c of MED_CRATES){
if(c.team!==player.team||c.uses<=0) continue;
if(Math.hypot(c.x-player.pos.x,c.z-player.pos.z)<2.6){
player.grabAction={kind:'medcrate',crate:c};
VM.state='grab'; VM.stateT=0; VM.stateDur=0.85; vmSndFlags={};
document.getElementById('interact').style.display='none';
return;
}
}
}
}
let camTrauma=0, dmgFlash=0;
function addTrauma(x){ camTrauma=Math.min(1.2,camTrauma+x); }
function updatePlayer(dt){
if(!player.alive){ return; }
// 倒地: 不能移动/开火/交互 (视角仍可转 —— 鼠标监听在 24_input, 只要求 player.alive)
// 倒计时与 HUD 由 57_downed 的 updatePlayerDowned 负责
if(player.downed) return updatePlayerDowned(dt);
// 翻越: 0.4s 的脚本化跨越, 位置由 58_vault 的 updateVault 直接驱动 (不参与常规碰撞)
if(player.vaultT>0) return updateVault(dt);
const p=player;
p.meleeCd-=dt; p.resupplyCd-=dt;
p.bandResupCd=Math.max(0,(p.bandResupCd||0)-dt);
p.suppressV=Math.max(0,p.suppressV-dt*0.8);
// 自然回血已移除 (2026-09-15): 这里原本有两条被动回血 ——
//   ① 脱战 6s 后胸部缓慢回到 70 (4/s)
//   ② 胸部 <50 时四肢自动愈合 (0.8/s)
// 玩家反映不该有自动回血。现在唯一的回血途径是绷带 / 医疗品 / 医疗箱, 全都要消耗物品。
// 绷带包扎
if(p.bandaging>0){
p.bandaging-=dt;
if(p.bandaging<=0){
p.bandages--;
if(p.body&&p.body.thorax){
const _th=p.body.thorax;
_th.hp=Math.min(_th.max,_th.hp+45); // 包扎胸部 +45 (旧语义里 p.maxHp 就是胸部上限)
if(typeof tkSyncHp==='function') tkSyncHp(p); else p.hp=_th.hp;
} else p.hp=Math.min(p.maxHp||100,p.hp+45);
for(const k in p.limbs) p.limbs[k]=Math.min(100,p.limbs[k]+35);
showScorePop('包扎完成 +45');
AudioSys.click(1200,0.3,0.06);
}
}
p.recoilPitch*=Math.pow(0.005,dt*0.55);
p.recoilYaw*=Math.pow(0.005,dt*0.55);
p.recoilPitch=clamp(p.recoilPitch,-0.35,0.35);
// 架枪检测: 胸前有齐腰遮挡且头顶上方无遮挡 (架枪时沿架设方向检测, 避免转头就脱离)
p.canBrace=false;
if(p.onGround&&!p.prone&&!p.onVehicle&&!p.onMG&&!p.onAT&&!p.onAA&&Math.hypot(p.vel.x,p.vel.z)<0.8){
const bd=p.braced?V3(-Math.sin(p.braceYaw),0,-Math.cos(p.braceYaw)):camForward(); bd.y=0;
if(bd.lengthSq()>0.1){
bd.normalize();
const chestY=p.pos.y+(p.crouch?0.72:1.05);
const hit=raycastWorld(V3(p.pos.x,chestY,p.pos.z),bd,1.15);
if(hit&&hit.kind!=='ground'){
const over=raycastWorld(V3(p.pos.x,chestY+0.55,p.pos.z),bd,1.3);
if(!over) p.canBrace=true;
}
}
}
if(p.braced&&(!p.canBrace||!p.onGround||p.prone)) p.braced=false;
// 架枪状态: 以支点为轴, 视角限制在架设方向左右一定范围内
if(p.braced){
const rel=clamp(angDiff(p.braceYaw,p.yaw),-0.72,0.72);
p.yaw=p.braceYaw+rel;
p.pitch=clamp(p.pitch,-0.5,0.42);
}
if(p.onAA){ updatePlayerAA(dt); return; }
if(p.onMG){ updatePlayerMG(dt); return; }
if(p.onMortar){ updatePlayerMortar(dt); return; }
const fwd=(keys.KeyW?1:0)-(keys.KeyS?1:0);
const str=(keys.KeyD?1:0)-(keys.KeyA?1:0);
if(p.pendingBuild&&VM.state==='build'&&(fwd!==0||str!==0||keys.Space)){ cancelBuild(p); showScorePop('建造已取消'); }
const wantSprint=keys.ShiftLeft&&fwd>0&&!p.ads&&p.stamina>0.05&&!p.crouch&&p.bandaging<=0&&!(p.limbs&&p.limbs.legs<25);
if(wantSprint&&p.prone) p.prone=false;
if(wantSprint) p.braced=false;
p.sprinting=wantSprint;
p.holdBreath=keys.ShiftLeft&&p.ads;
let leanTgt=0;
if(!p.sprinting&&!p.prone&&p.onGround&&!p.braced&&!(typeof BAG_UI!=='undefined'&&BAG_UI.open)){ leanTgt=(keys.KeyQ?-1:0)+(keys.KeyE?1:0); }
p.leanT=dampF(p.leanT,leanTgt,10,dt);
if(p.sprinting){ p.stamina=Math.max(0,p.stamina-dt*0.11*(p.stimT>0?0:1)); p.stamUseT=nowT; }
else if(p.holdBreath){ const aimLoad=(typeof weaponAimStaminaMul==="function")?weaponAimStaminaMul(p.curW):1; p.stamina=Math.max(0,p.stamina-dt*0.16*aimLoad*(p.stimT>0?0:1)); p.stamUseT=nowT; }
else if(p.ads){ const aimLoad=(typeof weaponAimStaminaMul==="function")?weaponAimStaminaMul(p.curW):1; p.stamina=Math.max(0,p.stamina-dt*0.025*aimLoad*(p.stimT>0?0:1)); p.stamUseT=nowT; }
else if(nowT-(p.stamUseT||0)>1) p.stamina=Math.min(1,p.stamina+dt*0.16*(typeof tarkovStaminaMul==='function'?1/Math.max(0.5,tarkovStaminaMul(p)):1));
if(p.holdBreath&&p.stamina<=0.02) p.holdBreath=false;
let speed=p.prone?1.15:p.crouch?2.2:(p.sprinting?6.4:4.3);
// ===== 高低姿态持枪对移动速度的影响 =====
// 低位持枪: 枪口下压, 重心前倾, 移动显著加速(非冲刺状态 +18%, 冲刺 +6%)
// 高位持枪: 抵肩待发, 基准速度
// ADS / 架枪时强制回到高位姿态(无法压低枪口)
const lowReady=(p.carry==='low')&&!p.ads&&!p.braced&&!p.prone;
p.carryLow=lowReady;
if(lowReady) speed*=(p.sprinting?1.06:1.18);
if(p.ads) speed*=0.55;
if(p.bandaging>0) speed*=0.45;
if(VM.state==='reload') speed*=0.8;
if(nowT-(p.wireT||-9)<0.3) speed*=0.42;
if(p.limbs&&p.limbs.legs<35) speed*=0.55; // 腿部受伤: 一瘸一拐
if(p.limbs&&p.limbs.legs<15) speed*=0.55;
if(typeof tarkovSpeedMul==='function') speed*=tarkovSpeedMul(p); // 背包超重/骨折/失血减速
const sy=Math.sin(p.yaw), cy=Math.cos(p.yaw);
let mx=(-sy*fwd + cy*str), mz=(-cy*fwd - sy*str);
const ml=Math.hypot(mx,mz);
if(ml>0.01){ mx/=ml; mz/=ml; }
if(p.braced&&(fwd!==0||str!==0)){ p.braced=false; AudioSys.metalSlide(0.16,0.07,500,900); }
if(p.braced){ mx=0; mz=0; }
const accel=p.onGround?38:6;
p.vel.x=dampF(p.vel.x,mx*speed,accel*dt>1?12:accel,dt);
p.vel.z=dampF(p.vel.z,mz*speed,accel*dt>1?12:accel,dt);
if(keys.Space&&p.onGround&&p.stamina>0.05){
// 面朝窗户/低矮掩体时, 跳跃键优先触发翻越 (58_vault); 翻不过去才照常跳
if(!(typeof vaultTry==='function'&&vaultTry())){
p.vel.y=4.6; p.onGround=false; p.stamina-=0.05; p.stamUseT=nowT; p.crouch=false; p.prone=false; p.braced=false;
}
}
// ===== 梯子攀爬 =====
if(p._onLadder){
const L2=p._onLadder;
const dy=(keys.KeyW?1:0)-(keys.KeyS?1:0);
p.vel.y=dy*3.4;
if(keys.Space){ p.vel.y=3.6; p.vel.x=Math.cos(L2.face)*2.2; p.vel.z=Math.sin(L2.face)*2.2; p._onLadder=0; }
const cy=p.pos.y+p.eyeH;
if(cy>=L2.y1&&dy>0){ p._onLadder=0; } // 爬到顶
if(cy<=L2.y0+0.4&&dy<0){ p._onLadder=0; } // 滑到底
p.pos.x=L2.x; p.pos.z=L2.z;
p.vel.x=0; p.vel.z=0; p.onGround=false;
}
if(!p._onLadder&&p.alive&&!p.onVehicle&&!p.onMG&&!p.onAT&&!p.onAA&&!p.onMortar){
const fwd=(keys.KeyW?1:0)-(keys.KeyS?1:0);
if(fwd>0&&LADDERS.length){
const cy2=p.pos.y+p.eyeH;
for(const L3 of LADDERS){
const dx2=p.pos.x-L3.x, dz2=p.pos.z-L3.z;
if(dx2*dx2+dz2*dz2<0.9*0.9&&cy2>L3.y0+0.15&&cy2<L3.y1-0.4){
p._onLadder=L3; p.pos.x=L3.x; p.pos.z=L3.z; p.vel.set(0,0,0); p.onGround=false;
break;
}
}
}
}
p.vel.y-=13*dt;
p.pos.x+=p.vel.x*dt; p.pos.y+=p.vel.y*dt; p.pos.z+=p.vel.z*dt;
collideMove(p.pos,0.42);
const gh=standHeight(p.pos.x,p.pos.z,p.pos.y+0.6);
if(p.pos.y<=gh){
if(!p.onGround&&p.vel.y<-4){ p.landDip=Math.min(1,-p.vel.y*0.1); AudioSys.footstep(true,0); }
p.pos.y=gh; p.vel.y=0; p.onGround=true;
} else if(p.pos.y>gh+0.05) p.onGround=false;
p.landDip=Math.max(0,p.landDip-dt*3);
const sp2=Math.hypot(p.vel.x,p.vel.z);
p.stepT=(p.stepT||0)-dt*sp2*(p.sprinting?1.25:1);
if(p.stepT<=0&&sp2>0.8&&p.onGround){ p.stepT=1.55; AudioSys.footstep(p.sprinting,0); }
const w=p.curW;
p.fireT-=dt;
p.bloom=Math.max(0,p.bloom-dt*4);
if(mouseDown&&w&&VM.state==='idle'&&p.fireT<=0&&!matchOver&&!p.sprinting&&p.bandaging<=0&&!(typeof BAG_UI!=='undefined'&&BAG_UI.open)){
if(w.mag>0){
if(w.def.type==='auto'||!p.fireHeld){
playerShoot(w);
}
} else {
if(!p.fireHeld){ AudioSys.click(2600,0.2,0.03); tryReload(); }
}
p.fireHeld=true;
}
if(!mouseDown) p.fireHeld=false;
// 手雷就位: 长按右键蓄力(越久投得越远)。引信只在出手后才开始计时 ——
// 「拿在手里会自爆」的烹饪机制已被蓄力机制取代, 所以握着不再有自爆风险。
if(p.nadeHeld){
if(p.nadeCharging) p.nadeCharge=Math.min(1,p.nadeCharge+dt/NADE_CHARGE_TIME);
} else if(p.nadeCharging){ p.nadeCharging=false; }
updateInteractHint();
}
function playerShoot(w){
const p=player;
w.mag--;
p.fireT=60/w.def.rpm;
const dir=camForward();
if(w.def.mortar){
// 迫击炮: 高抛曲射
vmFireKick(); (typeof shakeShot==='function' ? shakeShot(0.3) : addTrauma(0.3));
AudioSys.mortarThunk(0);
const v=dir.clone().multiplyScalar(27);
v.y=Math.max(v.y+9,13);
v.addScaledVector(p.vel,0.3);
const m=new THREE.Mesh(nadeGeoAT,vmMats.gun);
m.castShadow=true; m.position.copy(camera.position); scene.add(m);
nades.push({m,pos:camera.position.clone().addScaledVector(dir,0.7),vel:v,fuse:9,thrower:p,team:p.team,spin:V3(4,0,1),bounces:0,mortar:true});
spawnP(PT.dark,camera.position.x+dir.x,camera.position.y+dir.y,camera.position.z+dir.z,dir.x,1.5,dir.z,0.6,2,0.7,0.6,0.3);
return;
}
const adsB=VM.adsBlend;
let spread=lerp(w.def.spreadHip,w.def.spreadAds,adsB)*(Math.PI/180)*0.5;
// 移动扩散: 按「实际速度」连续加成 —— 站定 1.0 / 步行 ≈2.1 / 冲刺 ≈2.6
// (原来是「动起来就 ×1.4」的台阶式, 没有准星后必须让"站着打"和"边跑边打"拉开差距)
const vSpd=Math.hypot(p.vel.x,p.vel.z);
const moveMul=1+Math.min(1.6,(vSpd/6.4)*1.6)*(1-adsB*0.45);   // 开镜时移动惩罚打 55 折
spread*=(1+p.bloom*1.4)*(p.prone?0.5:p.crouch?0.8:1)*(p.onGround?1:2.2)*moveMul;
// 低位持枪: 枪未抵肩, 首发精度明显下降(抬枪惩罚) —— 与移动加速形成取舍
if(p.carryLow&&adsB<0.6) spread*=1.55;
if(p.limbs&&p.limbs.arms<35) spread*=1.5; // 手臂受伤: 持枪不稳
if(typeof painSpreadMul==='function') spread*=painSpreadMul(p); // 止痛药/吗啡: 准度提升 (疼痛时手抖)
if(p.holdBreath) spread*=0.4;
if(p.braced) spread*=0.35;
const rv=camRight(), uv=rv.clone().cross(dir).negate();
dir.addScaledVector(rv,rand(-spread,spread)).addScaledVector(uv,rand(-spread,spread)).normalize();
p.bloom=Math.min(1,p.bloom+0.16);
const rec=w.def.recoil*0.020*(p.prone?0.65:p.crouch?0.80:1)*(adsB>0.5?0.80:1)*(p.braced?0.40:1)*((p.carryLow&&adsB<0.6)?1.30:1);
p.recoilPitch+=rec;
p.recoilYaw+=rand(-1,1)*w.def.recSide*0.012;
p.pitch+=rec*0.95;
p.yaw+=rand(-1,1)*w.def.recSide*0.007;
vmFireKick();
(typeof shakeShot==='function' ? shakeShot(w.def.kick*0.9) : addTrauma(w.def.kick*0.9));
AudioSys.gunshot(w.def.snd,0,0);
const o=camera.position.clone();
fireBullet(p,o,dir,w.def,null);
if(!w.def.enbloc||w.mag>0){
const cp=camera.position.clone().add(camForward().multiplyScalar(0.35)).add(camRight().multiplyScalar(0.14)).add(V3(0,-0.05,0));
if(w.def.type!=='bolt') spawnCasing(cp,camRight(),V3(0,1,0));
}
if(w.def.enbloc&&w.mag===0){
setTimeout(()=>AudioSys.ping(),80);
const clipP=camera.position.clone().add(camForward().multiplyScalar(0.4));
spawnCasing(clipP,camRight(),V3(0,1.5,0));
}
if(w.def.type==='bolt'&&w.mag>0){
VM.state='bolt'; VM.stateT=0; VM.stateDur=w.def.boltT||1.0;
vmSndFlags={};
}
if(w.mag===0&&w.def.type!=='bolt'){ setTimeout(tryReload,350); }
else if(w.mag===0){ setTimeout(tryReload,1000); }
}
function updatePlayerMortar(dt){
const p=player, m=p.onMortar;
// 允许左右回旋 ±0.6rad, 炮身视觉随动
const rel=clamp(angDiff(m.face+Math.PI,p.yaw),-0.6,0.6);
p.yaw=m.face+Math.PI+rel;
p.pitch=clamp(p.pitch,0.55,1.35);
p.pos.x=m.x-Math.sin(m.face+rel)*0.85;
p.pos.z=m.z-Math.cos(m.face+rel)*0.85;
p.pos.y=standHeight(p.pos.x,p.pos.z,p.pos.y+1); p.vel.set(0,0,0);
m.grp.rotation.y=m.face+rel;
m.cd-=dt;
const dir=camForward();
const vo=V3(m.x+dir.x*60,m.y+dir.y*60,m.z+dir.z*60);
// 落点指示圈: 实时显示炮弹落点
mortarMarker.visible=true;
mortarMarker.position.set(vo.x,heightAt(vo.x,vo.z)+0.07,vo.z);
mortarMarker.rotation.y+=dt*1.2;
const mscale=0.85+Math.sin(nowT*3.2)*0.08;
mortarMarker.scale.setScalar(mscale);
if(mouseDown&&m.cd<=0&&!matchOver){
m.cd=3.2;
const dH=Math.hypot(vo.x-m.x,vo.z-m.z);
const tof=clamp(dH/42,1.8,4.2);
const v=V3((vo.x-m.x)/tof,0.5*9.8*tof,(vo.z-m.z)/tof);
AudioSys.metalSlide(0.35,0.18,140,50);
const nPos=V3(m.x,m.y+0.25,m.z);
const shell=new THREE.Mesh(nadeGeoAT,vmMats.gun); shell.position.copy(nPos); scene.add(shell);
nades.push({m:shell,pos:nPos.clone(),vel:v,fuse:9,thrower:p,team:p.team,spin:V3(3,0,0.5),bounces:0,mortar:true});
spawnP(PT.dark,m.x,m.y+0.4,m.z,0,1.4,0,0.5,1.6,0.6,0.5,0.2);
(typeof shakeExplosion==='function' ? shakeExplosion(0.12) : addTrauma(0.12));
}
// 炮管俯仰随视角(高抛→炮管更竖直), 开火后阻尼回位
m.tube.rotation.x=dampF(m.tube.rotation.x,0.62-(p.pitch-0.95)*0.3,5,dt);
document.getElementById('heatFill').style.width=(clamp(1-m.cd/3.2,0,1)*100)+'%';
updateInteractHint();
}
function updatePlayerMG(dt){
const p=player, mg=p.onMG;
const relYaw=angDiff(mg.face+Math.PI,p.yaw);
if(Math.abs(relYaw)>1.05) p.yaw=mg.face+Math.PI+clamp(relYaw,-1.05,1.05);
p.pitch=clamp(p.pitch,-0.5,0.32);
p.pos.y=standHeight(p.pos.x,p.pos.z,p.pos.y+1);
p.vel.set(0,0,0);
mg.yaw.rotation.y=angDiff(mg.face+Math.PI,p.yaw);
mg.pitch.rotation.x=-p.pitch*0.9;
p.fireT-=dt;
const mdef=mg.def||{rpm:1100,dmg:28,heatPS:0.014};
mg.heat=Math.max(0,mg.heat-dt*(mouseDown?0:0.22));
if(mouseDown&&p.fireT<=0&&mg.heat<1&&!matchOver){
p.fireT=60/mdef.rpm;
mg.heat+=mdef.heatPS;
if(mg.heat>=1){ AudioSys.metalSlide(0.4,0.3,400,200); }
const dir=camForward();
const spread=0.011+mg.heat*0.015;
const rv=camRight(), uv=rv.clone().cross(dir).negate();
dir.addScaledVector(rv,rand(-spread,spread)).addScaledVector(uv,rand(-spread,spread)).normalize();
p.recoilPitch+=0.0022;
p.pitch=clamp(p.pitch+0.0012,-0.5,0.32);
p.yaw+=rand(-1,1)*0.0018;
addTrauma(0.06);
AudioSys.gunshot('mg',0,0);
const o=V3(mg.x,mg.y+0.12,mg.z);
const muzz=o.clone().addScaledVector(dir,1.35);
fireBullet(p,o,dir,{dmg:mdef.dmg,headMul:1.9,snd:'mg',tracer:2,vehDmg:2.5},muzz);
muzzleFXWorld(muzz,dir);
}
document.getElementById('heatFill').style.width=(mg.heat*100)+'%';
updateInteractHint();
}
let INTERACT_INFO=null; // {label} 当前可用的互动动作(供移动端情境按钮/桌面提示共用)
function updateInteractHint(){
// 兵种技能常驻小提示 (右下角)
const tip=document.getElementById('clsTip');
let tt='';
if(player.alive&&player.deployed&&!player.onVehicle&&!player.onMG&&!player.onAT&&!player.onAA){
if(player.onMortar) tt='<b>左键</b> 发射 · <b>鼠标</b> 调弹道 · <b>F</b> 离开';
else if(player.cls===2) tt='<b>'+keyLabelOf('skill')+'</b> 放置医疗箱';
else if(player.cls===4){
const bt2=BUILD_MENU[player.buildSel||0];
const bn2=bt2==='mg'?mgDefOfTeam(player.team).name:BUILD_NAMES[bt2];
tt='<b>'+keyLabelOf('build')+'</b> 工事: '+bn2+' ('+BUILD_COST[bt2]+'点) · <b>'+keyLabelOf('skill')+'</b> 建造 · 剩 '+(player.buildCount||0)+' 点';
}
}
if(tip._last!==tt){ tip._last=tt; tip.innerHTML=tt; tip.style.display=tt?'block':'none'; }
const el=document.getElementById('interact');
const setInter=(html,short)=>{
INTERACT_INFO=short?{label:short}:null;
if(html){ el.style.display='block'; el.innerHTML=html; }
else el.style.display='none';
};
if(player.onMG){ setInter('<b>F</b> 离开机枪','离开机枪'); return; }
if(player.onMortar){ setInter('<b>F</b> 离开迫击炮 · <b>左键</b> 发射 · <b>鼠标</b> 调整弹道','离开迫击炮'); return; }

if(!player.alive){ setInter(null,null); return; }
for(const mg of MG42S){
if(!mg.user&&Math.hypot(mg.x-player.pos.x,mg.z-player.pos.z)<2.6){
setInter('<b>F</b> 使用 '+((mg.def&&mg.def.name)||'重机枪'),'上机枪'); return;
}
}
for(const m of MORTARS){
if(!m.alive||m.user) continue;
if(Math.hypot(m.x-player.pos.x,m.z-player.pos.z)<2.8){
setInter((m.owner===player)?'<b>F</b> 使用迫击炮 · <b>B</b> 回收':'<b>F</b> 使用迫击炮','上迫击炮');
return;
}
}
// 倒地队友优先 (救命最要紧) —— 由 57_downed 提供
if(typeof nearestDownedMateNear==='function'){
const _dm=nearestDownedMateNear(player.pos.x,player.pos.z,DOWN_RESCUE_R+0.8);
if(_dm){ setInter('<b>F</b> 救援 '+((_dm.name)||'队友'),'救援'); return; }
}
if(GAMEMODE==='extract'&&typeof INTERACT_LOOT!=='undefined'&&INTERACT_LOOT){
const isCorpse=INTERACT_LOOT.kind==='corpse';
const open=typeof LOOT_UI!=='undefined'&&LOOT_UI.open;
setInter(open?`<b>F</b> 拿取选中 · <b>↑/↓</b> 换选中`:`<b>F</b> ${isCorpse?'搜尸':'打开物资箱'} · <b>↑/↓</b> 选择物品`, isCorpse?'搜尸':'搜刮');
return;
}
if(player.resupplyCd<=0){
for(const ac of AMMO_CRATES){
if(Math.hypot(ac.x-player.pos.x,ac.z-player.pos.z)<2.6){
const _as=(typeof ammoShopActive==='function')&&ammoShopActive();
setInter(_as?'<b>F</b> 弹药商店 (付费补给)':'<b>F</b> 补充弹药',_as?'弹药商店':'补充弹药'); return;
}
}
}
if(player.bandResupCd<=0&&player.bandages<player.maxBandages){
for(const c of MED_CRATES){
if(c.team!==player.team||c.uses<=0) continue;
if(Math.hypot(c.x-player.pos.x,c.z-player.pos.z)<2.6){
setInter('<b>F</b> 拿取绷带','拿取绷带'); return;
}
}
}
setInter(null,null);
}
let camBobT=0;
// ===== 玩家可见身体: 低头可见自己的胸/腿, 与移动同步; 死亡时被布娃娃直接接管 =====
function ensurePlayerBody(){
// 本局实际穿着的胸挂 (穿在护甲外面, 决定躯干颜色) —— raidLoadout() 会处理 SCAV 的随机配装
let _chestK='';
try{
const _L=(typeof raidLoadout==='function')?raidLoadout():null;
const _ck=(_L&&_L.chest)||'';
if(_ck&&typeof CHEST_DEFS!=='undefined'&&CHEST_DEFS[_ck]) _chestK=_ck;
}catch(e){}
// ⚠️ 还要比对 armorKey 与胸挂 —— 只在换阵营时重建的话, 换了护甲/胸挂模型不会更新
if(player.mesh&&player.meshTeam===player.team&&player.meshArmor===(player.armorKey||'')&&player.meshChest===_chestK) return;
if(player.mesh){
if(player.mesh.tag&&player.mesh.tag.material.map) player.mesh.tag.material.map.dispose();
if(player.mesh.tag) player.mesh.tag.material.dispose();
scene.remove(player.mesh.root);
}
player.mesh=buildSoldierMesh(player.team,'',player.armorKey,_chestK);
player.meshTeam=player.team;
player.meshArmor=player.armorKey||'';
player.meshChest=_chestK;
player.mesh.tag.visible=false;
}
function updatePlayerBody(dt){
const m=player.mesh;
if(!m) return;
const hide=!player.alive||!player.deployed||player.onVehicle||player.chute
||player.onMG||player.onAT||player.onAA||player.onMortar;
if(m.root.visible===hide) m.root.visible=!hide;
if(hide) return;
// 第一人称: 头/手臂/背枪隐藏(视模已有手), 只显示躯干与腿
m.headG.visible=false;
m.armL.sh.visible=false; m.armR.sh.visible=false;
m.gunG.visible=false;
m.tag.visible=false;
m.root.position.copy(player.pos);
// 玩家朝向 = (-sin(yaw), -cos(yaw)); 士兵模型面朝局部+Z → 需要 yaw+π
m.root.rotation.set(0,player.yaw+Math.PI,0);
// 身体后置于摄像机之后, 不遮挡前方视野 (趴下时几乎对齐, 胸在镜头正下前方属正常)
const prone=player.prone, crouch=player.crouch&&!prone;
const back=prone?0.05:(crouch?0.14:0.16)+(player.ads?0.05:0);
m.root.position.x+=Math.sin(player.yaw)*back;
m.root.position.z+=Math.cos(player.yaw)*back;
// 侧身探头: 身体同步倾斜(与第三人称一致)
m.torsoG.rotation.z=dampF(m.torsoG.rotation.z||0,-player.leanT*0.55,12,dt);
m.torsoG.rotation.y=0;
const speed=Math.hypot(player.vel.x,player.vel.z);
player._animT=(player._animT||0)+dt*(3+speed*1.9);
const t=player._animT;
const sw=prone?clamp(speed/1.2,0,1)*0.35:clamp(speed/4,0,1.3)*0.62;
const moving=speed>0.4&&player.onGround;
const runB=(!prone&&!crouch&&moving)?sw:0;
m.pelvis.position.y=dampF(m.pelvis.position.y,(prone?0.22:crouch?0.6:0.94)+runB*(Math.abs(Math.cos(t))*0.06-0.036),12,dt);
m.pelvis.rotation.x=dampF(m.pelvis.rotation.x,prone?1.5:crouch?0.14:0.05,8,dt);
const torsoX=m.pelvis.rotation.x;
if(prone){
m.legL.hip.rotation.x=dampF(m.legL.hip.rotation.x,0.04+Math.sin(t)*sw*0.5,10,dt);
m.legR.hip.rotation.x=dampF(m.legR.hip.rotation.x,0.04-Math.sin(t)*sw*0.5,10,dt);
m.legL.knee.rotation.x=dampF(m.legL.knee.rotation.x,0.08,10,dt);
m.legR.knee.rotation.x=dampF(m.legR.knee.rotation.x,0.08,10,dt);
} else if(crouch){
m.legL.hip.rotation.x=dampF(m.legL.hip.rotation.x,-1.05,10,dt);
m.legR.hip.rotation.x=dampF(m.legR.hip.rotation.x,-0.5,10,dt);
m.legL.knee.rotation.x=dampF(m.legL.knee.rotation.x,1.3,10,dt);
m.legR.knee.rotation.x=dampF(m.legR.knee.rotation.x,0.95,10,dt);
} else {
const gait=(ph)=>{
const s2=Math.sin(ph);
const hip=(s2>0?s2*1.0:s2*0.72)*sw*0.85;
const knee=Math.pow(Math.max(0,Math.sin(ph-2.85)),1.15)*1.45*sw+0.07;
return [hip,knee];
};
const [hL,kL]=gait(t),[hR,kR]=gait(t+Math.PI);
m.legL.hip.rotation.x=hL; m.legR.hip.rotation.x=hR;
m.legL.knee.rotation.x=kL; m.legR.knee.rotation.x=kR;
}
}
