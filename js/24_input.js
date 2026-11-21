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
SQUAD.marker=new THREE.Sprite(new THREE.SpriteMaterial({map:squadMarkerTex('攻','#ffffff'),transparent:true,depthTest:false}));
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
const m=squadSetMarker('攻','#ffffff',true);
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
// 中立地图: 玩家主动下令攻击 = 单方面宣战, 该 NPC 立刻与玩家及小队结仇
best.aggroOn(player);
for(const sm of SQUAD.members) sm.aggroOn(best);
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
// 打开背包等模态界面时调用: 释放所有按键与鼠标状态, 避免人物继续移动/开火
function releaseAllInputs(){
try{ for(const k in keys) keys[k]=false; }catch(e){}
try{ mouseDown=false; mouse2Down=false; }catch(e){}
try{ if(typeof player!=='undefined'&&player){ player.mouseDX=0; player.mouseDY=0; } }catch(e){}
}
// ===================== 键位自定义 =====================
// 每个「动作」绑定一个 KeyboardEvent.code。改动只影响输入层:
//  · 动作键: keydown 里用 isKey(e,'xxx') 比对
//  · 移动键: 物理键在 keydown 里翻译成固定规范码(见 MOVE_ALIAS), 消费者照旧读 keys.KeyW / keys.Space
// 键位存 localStorage bf_keys_v1; 设置界面在 js/51_settings.js。
const KEY_ACTIONS=[
{a:'forward',    n:'前进',        d:'KeyW'},
{a:'back',       n:'后退',        d:'KeyS'},
{a:'left',       n:'左移',        d:'KeyA'},
{a:'right',      n:'右移',        d:'KeyD'},
{a:'sprint',     n:'疾跑',        d:'ShiftLeft'},
{a:'jump',       n:'跳跃',        d:'Space'},
{a:'leanL',      n:'左探头',      d:'KeyQ'},
{a:'leanR',      n:'右探头',      d:'KeyE'},
{a:'reload',     n:'换弹',        d:'KeyR'},
{a:'crouch',     n:'蹲下',        d:'KeyC'},
{a:'prone',      n:'趴下',        d:'KeyZ'},
{a:'brace',      n:'架枪',        d:'KeyX'},
{a:'zoomOut',    n:'降低瞄具倍率', d:'BracketLeft'},
{a:'zoomIn',     n:'提高瞄具倍率', d:'BracketRight'},
{a:'slot1',      n:'主武器',      d:'Digit1'},
{a:'slot2',      n:'副武器',      d:'Digit2'},
{a:'melee',      n:'近战/垂直起降',d:'KeyV'},
{a:'nade',       n:'手雷就位',    d:'Digit3'},
{a:'flash',      n:'闪光弹',      d:'Digit4'},
{a:'smoke',      n:'烟雾弹',      d:'Digit5'},
{a:'build',      n:'选工事',      d:'Digit6'},
{a:'heal',       n:'用药',        d:'KeyH'},
{a:'eat',        n:'进食/喝水',   d:'KeyK'},
{a:'food',       n:'切换食物',    d:'KeyJ'},
{a:'skill',      n:'兵种技能',    d:'KeyO'},
{a:'ammoShop',   n:'弹药商店',    d:'KeyI'},
{a:'medwheel',   n:'药品轮盘',    d:'KeyB'},
{a:'interact',   n:'互动/搜刮',   d:'KeyF'},
{a:'bag',        n:'背包面板',    d:'Tab'},
{a:'score',      n:'计分板',      d:'KeyP'},
{a:'nvg',        n:'夜视/面罩（轻按）', d:'KeyN'},
{a:'flashLight', n:'手电/激光指示器', d:'KeyG'},
{a:'map',        n:'大地图',      d:'KeyM'},
{a:'squadAttack',n:'小队·攻击',   d:'KeyT'},
{a:'squadFollow',n:'小队·跟随',   d:'KeyY'},
{a:'squadGuard', n:'小队·驻守',   d:'KeyU'},
{a:'lootUp',     n:'战利品上选',  d:'ArrowUp'},
{a:'lootDown',   n:'战利品下选',  d:'ArrowDown'},
];
const DEFAULT_KEYS=(()=>{ const o={}; for(const k of KEY_ACTIONS) o[k.a]=k.d; return o; })();
let KEYMAP=(()=>{
const o={};
for(const k in DEFAULT_KEYS) o[k]=DEFAULT_KEYS[k];
try{
const raw=JSON.parse(localStorage.getItem('bf_keys_v1')||'{}');
for(const k in o) if(typeof raw[k]==='string'&&raw[k]) o[k]=raw[k];
}catch(e){}
return o;
})();
function keyOf(a){ return KEYMAP[a]||DEFAULT_KEYS[a]; }
function isKey(e,a){ return e.code===keyOf(a); }
// 把动作的当前绑定键渲染成给人看的短标签 (KeyO → O, Digit6 → 6)。
// 界面提示一律用它, 不要再硬编码字母 —— 改键或重新分配后硬编码的提示会骗人。
function keyLabelOf(a){
const c=keyOf(a);
if(!c) return '—';
if(c.indexOf('Key')===0) return c.slice(3);
if(c.indexOf('Digit')===0) return c.slice(5);
if(c==='ShiftLeft') return 'Shift';
if(c==='Space') return '空格';
if(c==='Tab') return 'Tab';
if(c==='BracketLeft') return '[';
if(c==='BracketRight') return ']';
if(c.indexOf('Arrow')===0) return {ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→'}[c]||c;
return c;
}
// 界面里的按键提示**不要硬编码字母**: 给元素打 data-k="动作名"
// (需要两个键拼一起时再加 data-k2, 渲染成 "1/2"), 由这里统一填当前绑定键。
// 改键后调一次 refreshKeyLabels() 就会全量刷新。
// 为什么: 2026-09-16 改键后发现「B 兵种技能」「Tab 记分板」「按 5 选工事」全是错的 —— 硬编码迟早骗人。
function refreshKeyLabels(){
for(const n of document.querySelectorAll('[data-k]')){
const a=n.getAttribute('data-k');
let t=keyLabelOf(a);
const b=n.getAttribute('data-k2');
if(b&&t!=='—') t+='/'+keyLabelOf(b);
if(t&&t!=='—'&&n.textContent!==t) n.textContent=t;
}
}
refreshKeyLabels();
function saveKeys(){ try{ localStorage.setItem('bf_keys_v1',JSON.stringify(KEYMAP)); }catch(e){} }
// 改键: 目标键若已被别的动作占用 → 与该动作交换, 保证一键只对应一个动作
function setKey(a,code){
if(!code||DEFAULT_KEYS[a]===undefined) return;
for(const k in KEYMAP){
if(k!==a&&KEYMAP[k]===code){ KEYMAP[k]=keyOf(a); break; }
}
KEYMAP[a]=code; saveKeys(); rebuildMoveAlias();
refreshKeyLabels();   // 界面上的按键提示跟着一起刷, 别留着旧字母骗人
}
function resetKeys(){
for(const k in DEFAULT_KEYS) KEYMAP[k]=DEFAULT_KEYS[k];
saveKeys(); rebuildMoveAlias();
refreshKeyLabels();
}
// 移动类动作: 物理键 → 规范码。没绑到的**默认移动键要作废**, 否则改键后老键仍然生效。
const MOVE_ACTIONS=['forward','back','left','right','sprint','jump','leanL','leanR'];
const DEFAULT_MOVE_CODES=new Set(MOVE_ACTIONS.map(a=>DEFAULT_KEYS[a]));
let MOVE_ALIAS={};
function rebuildMoveAlias(){
MOVE_ALIAS={};
for(const a of MOVE_ACTIONS) MOVE_ALIAS[keyOf(a)]=DEFAULT_KEYS[a];
}
rebuildMoveAlias();
// 返回该物理键应写入 keys[] 的规范码; null = 这个键不参与移动(可能是作废的默认移动键)
function canonKey(code){
if(MOVE_ALIAS[code]) return MOVE_ALIAS[code];
return DEFAULT_MOVE_CODES.has(code)?null:code;
}
// 徒手可用判定: 步行状态 或 运兵车乘客(车斗内可用手中武器)
function handsFreeVeh(){ return !player.onVehicle; }
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
showScorePop('建造选择: '+bn+' (消耗'+BUILD_COST[bt]+'点'+(TOUCHUI?'':' · 按B放置')+')');
},
};
addEventListener('keydown',e=>{
if(typeof medWheelIsOpen==='function'&&medWheelIsOpen()){
  e.preventDefault(); e.stopImmediatePropagation();
  if(e.repeat) return;
  if(e.code==='Escape'||isKey(e,'medwheel')) closeMedWheel();
  else if(e.code==='Tab') (document.activeElement===el('mwClose')?el('mwRing'):el('mwClose')).focus();
  else if(e.code==='Enter'||e.code==='NumpadEnter'||e.code==='Space'){
    if(document.activeElement===el('mwClose')) closeMedWheel();
    else medWheelConfirm();
  }
  else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.code)){
    const n=MEDWHEEL.keys.length, step=e.code==='ArrowLeft'||e.code==='ArrowUp'?-1:1;
    MEDWHEEL.sel=(MEDWHEEL.sel+n+step)%n;
    medWheelRender();
    el('mwRing').focus({preventScroll:true});
  }
  return;
}
if(typeof AMMO_UI!=='undefined'&&AMMO_UI.open){
  e.stopImmediatePropagation();
  if(e.repeat&&['Enter','Space','NumpadEnter'].includes(e.code)){ e.preventDefault(); return; }
  if(e.code==='Tab'){
    const buttons=el('ammoShopPanel').querySelectorAll('button:enabled');
    const first=buttons[0], last=buttons[buttons.length-1];
    if(e.shiftKey&&(document.activeElement===first||document.activeElement===el('ammoShopPanel'))){ e.preventDefault(); last?.focus(); }
    else if(!e.shiftKey&&document.activeElement===last){ e.preventDefault(); first?.focus(); }
    return;
  }
  if(e.code==='Escape'||isKey(e,'ammoShop')){
    e.preventDefault(); if(!e.repeat) ammoShopClose();
  } else if(!(e.target.closest&&e.target.closest('#ammoShopPanel button')&&['Enter','Space','NumpadEnter'].includes(e.code))){
    if(!e.repeat&&ammoPanelKey(e.code,e.shiftKey)) e.preventDefault();
  }
  return;
}
if(!player.deployed||!player.alive||matchOver||document.querySelector('.screen:not(.hidden)')) return;
if(typeof LOOT_UI!=='undefined'&&LOOT_UI.open){
  e.stopImmediatePropagation();
  if(isKey(e,'lootUp')||isKey(e,'lootDown')){
    e.preventDefault();
    lootSelMove(isKey(e,'lootUp')?-1:1);
  } else if(e.code==='Escape'||isKey(e,'bag')||isKey(e,'interact')){
    e.preventDefault();
    if(!e.repeat){
      if(e.code==='Escape') lootPanelClose();
      else if(isKey(e,'bag')) toggleBagPanel();
      else lootTakeSelected();
    }
  }
  return;
}
// ===== 背包面板打开时: 只响应 Tab / Esc / R / ↑ / ↓ =====
// 面板会主动退出指针锁定让鼠标能拖拽, 因此这里必须先于 pointerLocked 判断,
// 否则方向键/R 会因为"未锁定"被直接 return 掉。
if(typeof BAG_UI!=='undefined'&&BAG_UI&&BAG_UI.open){
  const _c=e.code;
  const _tab=(typeof isKey==='function')?isKey(e,'bag'):(_c==='Tab');
  if(_tab){
    e.preventDefault(); e.stopImmediatePropagation();
    if(!e.repeat&&typeof toggleBagPanel==='function') toggleBagPanel();
    return;
  }
  if(_c==='Escape'){
    e.preventDefault(); e.stopImmediatePropagation();
    if(typeof bagPanelClose==='function') bagPanelClose();
    return;
  }
  if(_c==='KeyR'){
    e.preventDefault(); e.stopImmediatePropagation();
    if(typeof bagRotateSelected==='function') bagRotateSelected();
    return;
  }
  if(_c==='ArrowUp'||_c==='ArrowDown'){
    e.preventDefault(); e.stopImmediatePropagation();
    if(typeof bagPanelKey==='function') bagPanelKey(_c,e.shiftKey);
    return;
  }
  if(_c==='ArrowLeft'||_c==='ArrowRight'){
    e.preventDefault(); e.stopImmediatePropagation();
    const actions=Array.from(el('bagPanel').querySelectorAll('button:not(:disabled)')).filter(b=>b.offsetWidth>0);
    const pos=actions.indexOf(document.activeElement), step=_c==='ArrowRight'?1:-1;
    const next=pos<0?(step>0?0:actions.length-1):(pos+step+actions.length)%actions.length;
    actions[next]?.focus();
    return;
  }
  if(['Enter','NumpadEnter','Space'].includes(_c)&&e.target.closest?.('#bagPanel button')){
    e.stopImmediatePropagation();
    if(e.repeat) e.preventDefault();
    return;
  }
  // 其余按键一律吞掉: 不写入 keys、不触发换弹/切枪/使用/建造等游戏动作
  e.preventDefault(); e.stopImmediatePropagation();
  return;
}
if((isKey(e,'zoomIn')||isKey(e,'zoomOut'))&&player.ads&&weaponControlsActive()&&
    zoomAdjust(player.curW.key,isKey(e,'zoomIn')?1:-1)){
  e.preventDefault();
  zoomHudUpdate();
  return;
}
if(isKey(e,'bag')){
  e.preventDefault();
  if(!e.repeat&&typeof toggleBagPanel==='function') toggleBagPanel();
  return;
}
if(isKey(e,'score')){ document.getElementById('scoreboard').style.display='block'; updateScoreboard(); }
if(isKey(e,'medwheel')){ e.preventDefault(); if(!e.repeat) toggleMedWheel(); return; }
if(e.repeat) return;
{ const c=canonKey(e.code); if(c) keys[c]=true; }
if(!player.alive||!pointerLocked) return;
if(isKey(e,'ammoShop')&&ammoShopCanOpen()){ e.preventDefault(); ammoShopOpen(); return; }
// 背包面板打开时优先消费方向键/G/Q/Esc, 避免与游戏操作冲突
if(typeof bagPanelKey==='function'&&bagPanelKey(e.code,e.shiftKey)) return;
// N: 轻按切换本局选定的头部装备 —— 面罩模式切面罩, 夜视模式切夜视仪
if(isKey(e,'nvg')){ if(typeof toggleHeadgear==='function') toggleHeadgear(); }
if(isKey(e,'flashLight')&&typeof flashToggle==='function') flashToggle();
if(isKey(e,'reload')) tryReload();
if(isKey(e,'crouch')) InputActions.toggleCrouch();
if(isKey(e,'prone')) InputActions.toggleProne();
if(isKey(e,'brace')) InputActions.toggleBrace();
if(isKey(e,'slot1')) switchSlot(0);
if(isKey(e,'slot2')) switchSlot(1);
 if(isKey(e,'melee')){
 if(player.onVehicle&&player.onVehicle.kind==='plane'&&player.onVehicle.def.vtol&&player.onVehicle.playerDriven) InputActions.vtolToggle();
 else InputActions.melee();
 }
if(isKey(e,'nade')) InputActions.nadeEquip();
if(isKey(e,'flash')) InputActions.throwFlash();
if(isKey(e,'smoke')) InputActions.throwSmoke();
if(isKey(e,'heal')) InputActions.bandage();
if(isKey(e,'eat')) InputActions.eatFood();
if(isKey(e,'food')) InputActions.cycleFoodSel();
if(isKey(e,'skill')) InputActions.classSkill();
// 选工事: 只有工程兵可用 (AT 雷整体移除)
if(isKey(e,'build')){ if(player.cls===4) InputActions.buildNext(); }
if(isKey(e,'interact')) tryInteract();
if(isKey(e,'lootUp')&&typeof lootSelMove==='function'){ lootSelMove(-1); }
if(isKey(e,'lootDown')&&typeof lootSelMove==='function'){ lootSelMove(1); }
if(isKey(e,'squadAttack')) squadOrderAttack();
if(isKey(e,'squadFollow')) squadOrderFollow();
if(isKey(e,'squadGuard')) squadOrderGuard();
if(isKey(e,'map')) toggleBigMap(true);
});
addEventListener('keyup',e=>{
{ const c=canonKey(e.code); if(c) keys[c]=false; }
if(isKey(e,'score')) document.getElementById('scoreboard').style.display='none';
if(isKey(e,'map')) toggleBigMap(false);
});
let mouseDown=false, mouse2Down=false;
addEventListener('mousedown',e=>{
// 药品轮盘优先于指针锁定判断: 轮盘开着时即使丢了锁定也得能确认/取消, 否则会卡死。
// 手机端点格子走 DOM click, 这里必须让开 —— 否则会用到"当前选中"而不是被点的那一格。
if(typeof medWheelIsOpen==='function'&&medWheelIsOpen()){
const t=e.target;
// 只有"点格子"和"点空白背景"要让给 DOM click(前者选那一格, 后者关闭);
// 其余(桌面端指针锁定下 target 就是 canvas)一律走确认/取消。
const onItem=!!t.closest?.('.mwItem,#mwClose');
const onBackdrop=!!(t&&t.id==='medWheel');
if(!onItem&&!onBackdrop){
e.preventDefault();
if(e.button===0) medWheelConfirm(); else if(e.button===2) closeMedWheel();
}
return;
}
if(!pointerLocked||BAG_UI.open||LOOT_UI.open||AMMO_UI.open){ return; }
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
function weaponControlsActive(){
  return pointerLocked&&player.deployed&&player.alive&&player.curW&&!matchOver&&
    !player.onMG&&!player.onVehicle&&!player.onAT&&!player.onAA&&!player.onMortar&&
    !bigMapOn&&!document.body.classList.contains('uiOpen')&&
    !(typeof LOOT_UI!=='undefined'&&LOOT_UI.open)&&!(typeof AMMO_UI!=='undefined'&&AMMO_UI.open);
}
let _zoomHundredths=null, _zoomTouch=false;
function zoomHudUpdate(){
  const z=player.ads&&weaponControlsActive()?zoomOf(player.curW.key):null;
  const n=z===null?null:Math.round(z*100);
  const touch=n!==null&&document.body.classList.contains('touchui');
  if(n===_zoomHundredths&&touch===_zoomTouch) return;
  _zoomHundredths=n; _zoomTouch=touch;
  const label=document.getElementById('zoomN');
  label.textContent=n===null?'':(n/100).toFixed(2)+'× · '+(touch?'滑动瞄准键':'滚轮调倍');
  label.style.display=n===null?'none':'inline';
}
let _wheelAcc=0, _wheelLockT=0;
addEventListener('wheel',e=>{
if(!weaponControlsActive()||!e.deltaY) return;
const dy=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?innerHeight:1);
if(player.ads){
  if(zoomAdjust(player.curW.key,-dy/100)){
    e.preventDefault();
    zoomHudUpdate();
  }
  _wheelAcc=0;
  return;
}
e.preventDefault();
const now=performance.now();
if(now-_wheelLockT<180) return;                            // 持枪姿态是离散动作，才需要防抖
_wheelAcc+=dy;
if(Math.abs(_wheelAcc)<8) return;
const up=_wheelAcc<0;
_wheelAcc=0; _wheelLockT=now;
const dir=up?'high':'low';                                 // 下滚=低位, 上滚=高位
if(player.carry!==dir&&typeof setCarryStance==='function') setCarryStance(dir);
},{passive:false});
let lockGraceUntil=0; // 修复: 指针锁定切换后浏览器可能给出一次异常巨大的 movementX 导致视角瞬移
addEventListener('mousemove',e=>{
// 药品轮盘优先: 打开时鼠标方向用来选格, 不再转视角
// (桌面端指针锁定没有光标, 只能靠方向选; 这里放在锁定判断之前, 丢锁定时也还能选)
if(typeof medWheelIsOpen==='function'&&medWheelIsOpen()){
medWheelAim(e.movementX,e.movementY);
return;
}
if(!pointerLocked||!player.alive) return;
if(performance.now()<lockGraceUntil) return;
 let mx=e.movementX, my=e.movementY;
 if(!isFinite(mx)||!isFinite(my)) return;
 if(mx>160)mx=160; else if(mx<-160)mx=-160; // 钳制单事件位移, 消除1帧瞬转尖峰
 if(my>160)my=160; else if(my<-160)my=-160;
 if(player.onVehicle&&player.onVehicle.kind==='plane') my=-my; // 飞机拉杆反转: 鼠标上推=推杆(机头下压)
const d=WPN_DEFS[VM.key]||{};
// 灵敏度按真实开镜倍率补偿(含 2×/4× 改件, 见 14b 的 adsFovOf)
const zoomFac=player.ads?(((typeof adsFovOf==='function')?adsFovOf(VM.key):(d.adsFov||60))/BASE_FOV_74):1;
const s=0.0022*SETTINGS.sens*zoomFac;
player.yaw-=mx*s;
player.pitch-=my*s;
player.pitch=clamp(player.pitch,-1.45,1.45);
player.mouseDX=mx; player.mouseDY=my;
});
document.addEventListener('pointerlockchange',()=>{
if(TOUCHUI) return;
pointerLocked=document.pointerLockElement===renderer.domElement;
lockGraceUntil=performance.now()+120;
toggleBigMap(false);
if(!pointerLocked&&player.alive&&player.deployed&&!matchOver){
if(typeof medWheelIsOpen==='function'&&medWheelIsOpen()) closeMedWheel();
// 背包面板主动解锁鼠标用于拖拽: 这不是"暂停/失焦", 不能弹部署界面
const _bagOpen=!!(typeof BAG_UI!=='undefined'&&BAG_UI&&BAG_UI.open);
const lootOpen=typeof LOOT_UI!=='undefined'&&LOOT_UI.open;
const ammoOpen=typeof AMMO_UI!=='undefined'&&AMMO_UI.open;
if(!_bagOpen&&!lootOpen&&!ammoOpen) showDeploy(false);
}
});
function lockPointer(){
if(TOUCHUI){ pointerLocked=true; return; }
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
