'use strict';
// 手雷蓄力: 按住右键多久到满蓄力(秒)。越满 → 初速越高、抛得越远。
const NADE_CHARGE_TIME=0.9;
const player = {
isPlayer:true, name:'你', team:0, cls:0,
pos:V3(-118,1,0), vel:V3(), yaw:HPI, pitch:0,
hp:100, alive:false, deployed:false, crouch:false, onGround:true,
limbs:{head:100,arms:100,torso:100,legs:100},
stamina:1, sprinting:false, ads:false, holdBreath:false,
// 持枪姿态: 'high' 高位持枪(抵肩, 抬枪快但移动慢/轮廓高)
//           'low'  低位持枪(枪口下压, 移动快/轮廓低但抬枪慢)
carry:'high', carryT:0, carryBlend:0,
mouseDX:0, mouseDY:0, landDip:0, airT:0,
slots:[], curSlot:0, curW:null, nadeCount:2,
fireT:0, bloom:0, lastDmgT:-99, deathT:0,
recoilPitch:0, recoilYaw:0,
kills:0, deaths:0, score:0,
nadeHeld:false, nadeFuse:0, nadeIsSmoke:false, nadeIsFlash:false, smokeCount:0, flashCount:0, flashT:0, onMG:null, resupplyCd:0,
// 手雷蓄力状态: nadeCharge 0..1, nadeCharging = 右键是否按住中
nadeCharge:0, nadeCharging:false,
// 投掷物自费: 数量来自部署时从仓库带入的量 (见 46_throwables), 补给箱不再补发
onVehicle:null, onAT:null, onAA:null, atNades:0, nadeIsAT:false,
suppressV:0, meleeCd:0,
bandages:2, maxBandages:2, bandaging:0, bandResupCd:0, medkitUsed:false, grabAction:null,
eyeH:1.62,
lastFiredT:-99, killerName:'',
suppress(a){ this.suppressV=Math.min(1,this.suppressV+a); },
leanT:0,
damage(amt,attacker,isHead,part){
if(!this.alive||matchOver) return;
// 同单位免伤(玩家是己方 1 组的编外成员, 见 47_units): 自伤不受影响
if(attacker&&attacker!==this&&typeof unitBlocks==='function'&&unitBlocks(attacker,this)) return;
const L=this.limbs, limb=part||(isHead?'head':'torso');
const reduced=Math.max(1,amt*(1-(this.armorResist||0)));
L[limb]=Math.max(0,L[limb]-reduced);
let final=reduced;
if(limb==='legs') final*=0.7;
else if(limb==='arms') final*=0.75;
this.hp-=final;
this.lastDmgT=nowT;
if(this.bandaging>0){ this.bandaging=0; showScorePop('包扎被打断!'); }
AudioSys.hurt();
dmgFlash=Math.min(1,dmgFlash+0.5);
addTrauma(0.25);
if(attacker){
const a=Math.atan2(attacker.pos.x-this.pos.x,attacker.pos.z-this.pos.z);
addDirHit(a);
}
if(this.hp<=0){
this.hp=0;
this.die(attacker,isHead);
}
},
die(attacker,isHead){
this.alive=false;
this.deaths++;
this.deathT=nowT;
tickets[this.team]=Math.max(0,tickets[this.team]-1);
this.killerName=attacker?(attacker.name||'敌军'):'';
if(attacker&&attacker!==this){ attacker.kills=(attacker.kills||0)+1; attacker.score=(attacker.score||0)+100; addKillfeed(attacker,this,false); }
if(this.onMG){ this.onMG.user=null; this.onMG=null; }
if(this.onAT){ this.onAT.user=null; this.onAT=null; }
if(this.onAA){ this.onAA.user=null; this.onAA=null; }
if(this.onMortar){ this.onMortar.user=null; this.onMortar=null; }
this.onVehicle=null;
this.nadeHeld=false; this.nadeCharge=0; this.nadeCharging=false;
// 修复: 开镜状态阵亡后残留(镜遮罩/ADS/屏息/架枪一并复位)
this.ads=false; this.holdBreath=false; this.braced=false;
if(typeof VM!=='undefined'){ VM.adsBlend=0; }
document.getElementById('scopeOv').style.display='none';
document.exitPointerLock&&document.exitPointerLock();
noteDeath(this.pos.x,this.pos.z);
// 死亡视角: 摄像机绑进布娃娃头部眼位(约4秒), 期间部署冷却并行计时(不额外占用)
this.deathRag=window.CANNON?spawnRagdoll(this,attacker,isHead):null;
if(this.deathRag&&this.mesh){
// 模型部件已被布娃娃接管, 移除空壳, 下次部署重建
if(this.mesh.tag&&this.mesh.tag.material.map) this.mesh.tag.material.map.dispose();
if(this.mesh.tag) this.mesh.tag.material.dispose();
scene.remove(this.mesh.root);
this.mesh=null; this.meshTeam=undefined;
}
this.deathCamDur=this.deathRag?4.0:1.6;
this.deathCamT=this.deathCamDur;
this._deployShown=false;
this.deathCamYaw=this.yaw+Math.PI;
this.deathPos=this.pos.clone();
this.deathPos.y+=0.4;
respawnCd=8;
pickDeathQuote();
// 撤离模式: 单命局, 阵亡即撤离失败 (装备丢失/保险结算)
if(typeof onPlayerRaidDeath==='function') onPlayerRaidDeath();
},
doMeleeHit(){
const dir=camForward();
const o=camera.position.clone();
const sr=raySoldiers(o,dir,2.6,player);
if(sr){
sr.sol.damage(110,player,false,sr.part);
AudioSys.click(500,0.5,0.09);
addTrauma(0.15);
} else {
const wr=raycastWorld(o,dir,2.4);
if(wr){ impactFX(wr.point,wr.normal,wr.kind); AudioSys.click(1800,0.3,0.05); }
}
},
releaseNade(){
const dir=camForward();
const o=camera.position.clone().add(dir.clone().multiplyScalar(0.3));
// 蓄力时长 → 初速与上抛角。只有手雷(3 拿出 + 右键蓄力)走这条路径;
// 闪光弹 / 烟雾弹保持原来的固定手感(快捷键直接投出, 没有蓄力步骤)。
const chg=clamp(this.nadeCharge||0,0,1);
const spd=lerp(8,18,chg);        // 轻抛 8m/s → 全力 18m/s
const lift=lerp(1.7,3.0,chg);    // 全力时抬得更高, 抛物线更远
const self=this.vel.clone().multiplyScalar(0.4);
if(this.nadeIsSmoke){
const v=dir.multiplyScalar(12).add(V3(0,2.4,0)).add(self);
throwNade(this,o,v,1.8,false,true,false);
this.smokeCount--;
this.nadeIsSmoke=false;
} else if(this.nadeIsFlash){
const v=dir.multiplyScalar(14).add(V3(0,2.2,0)).add(self);
throwNade(this,o,v,1.6,false,false,true);
this.flashCount--;
this.nadeIsFlash=false;
} else {
const v=dir.multiplyScalar(spd).add(V3(0,lift,0)).add(self);
throwNade(this,o,v,this.nadeFuse);
this.nadeCount--;
}
this.nadeCharge=0; this.nadeCharging=false;
AudioSys.metalSlide(0.2,0.08,600,300);
},
finishReload(){
const w=this.curW;
if(!w) return;
const need=w.def.mag-w.mag;
const take=Math.min(need,w.reserve);
w.mag+=take; w.reserve-=take;
},
doGrabResolve(){
if(!this.grabAction) return;
const ga=this.grabAction;
if(ga.kind==='ammo'){
const ac=ga.crate;
for(const s of this.slots){ s.reserve=s.def.reserve; }
// 投掷物自费: 补给箱只补弹药, 不再免费补发手雷/闪光/烟雾
this.resupplyCd=6;
AudioSys.metalSlide(0.3,0.15,500,900);
showScorePop('弹药已补充 · 投掷物需自费带入');
} else if(ga.kind==='medcrate'){
const c=ga.crate;
if(typeof healPlayerAll==='function') healPlayerAll(45);
else {
for(const k in this.limbs) this.limbs[k]=100;
this.hp=Math.min(this.maxHp||100,this.hp+60);
}
c.uses--;
this.bandResupCd=4;
AudioSys.click(900,0.3,0.05);
showScorePop('医疗箱 · 各部位 +45');
if(c.owner&&c.owner!==this){ c.owner.score=(c.owner.score||0)+10; }
}
this.grabAction=null;
},
};
combatants.push(player);
// ===== 小队指挥系统 =====
// mode: follow(跟随) / move(进攻标记) / guard(驻守标记) / attack(攻击目标)
const SQUAD={ mode:'follow', pos:V3(), members:[], marker:null, target:null, guardYaw:null };
