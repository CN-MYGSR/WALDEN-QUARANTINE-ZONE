'use strict';
// ===================== 移动端触控输入 (专用设计) =====================
// 核心设计:
// 1) 每根手指独立路由: 按钮 / 移动摇杆 / 视角, 互不抢占 —— 按住开火·瞄准时照样转视角
// 2) 开火键滑动 = 边射边转视角 (CODM 式)
// 3) 情境交互键: 只在有互动对象时浮现并显示具体动作(进入坦克/补充弹药/跳伞…)
// 4) 手雷: 点按快投, 按住烹饪; 蹲键长按 = 趴; 摇杆推满 = 疾跑
// 5) 载具内按钮语义自动切换 (主炮/机枪/炮手镜/跳伞)
function applyTouchScale(){
if(!TOUCHUI) return;
const k=(parseInt(localStorage.getItem('sf_tsize')||'100'))/100;
const ui=document.getElementById('touchUI');
if(ui) ui.style.zoom=k;
}
// 全屏视角层会吃掉面板触摸。模态切换时同时收起触控层，终止正在按住的动作。
let clearTouchClaims=null;
(function(){
const screens=[...document.querySelectorAll('.screen')];
const panels=[...document.querySelectorAll('#bagPanel,#lootPanel,#ammoShopPanel,#medWheel')];
const isOpen=panel=>!panel.classList.contains('hidden');
function syncTouchLayerBlock(){
const inMenu=screens.some(isOpen);
const open=inMenu||panels.some(isOpen);
document.body.classList.toggle('fieldMenu',inMenu);
document.body.classList.toggle('uiOpen',open);
if(open&&clearTouchClaims) clearTouchClaims();
}
const mo=new MutationObserver(syncTouchLayerBlock);
for(const s of [...screens,...panels]) mo.observe(s,{attributes:true,attributeFilter:['class']});
syncTouchLayerBlock();
document.getElementById('ammoClose').addEventListener('click',()=>ammoShopClose());
})();
// ===== 虚拟按键: 手动开关 + 键盘探测 (2026-09-28) =====
// 设置面板「虚拟按键」: 自动 / 常开 / 常关 —— 改完重载生效 (TOUCHUI 是加载时算出的 const)
(function touchModeBtn(){
const b=document.getElementById('touchModeBtn');
if(!b) return;
const cur=()=>{ try{ return localStorage.getItem('sf_touch'); }catch(e){ return null; } };
const sync=()=>{ const v=cur(); b.textContent=(v==='1')?'常开':((v==='0')?'常关':'自动'); b.classList.toggle('sel',v!==null); };
sync();
b.onclick=()=>{
const v=cur();
const next=(v===null)?'1':((v==='1')?'0':null);
try{ if(next===null){ localStorage.removeItem('sf_touch'); localStorage.removeItem('sf_kb'); } else localStorage.setItem('sf_touch',next); }catch(e){}
sync();
if(typeof showScorePop==='function') showScorePop('虚拟按键: '+((next==='1')?'常开':((next==='0')?'常关':'自动'))+' · 重载生效');
setTimeout(()=>location.reload(),600);
};
})();
// 键盘探测: 真的按下物理键 → 有键盘 → 收起虚拟按键并记住 (写 sf_kb)
// ⚠️ 只对「触控屏 PC」这条软路径生效: 有触摸屏、主指针不是粗指针、且不是手机/平板。
//    手机/平板即使外接键盘也保留虚拟按键 (少数派, 且拔掉键盘就没法操作了)。
if(TOUCHUI&&HAS_TOUCH&&!COARSE_PTR&&!MOBILE){
const onKey=e=>{
 if(e.key==='Shift'||e.key==='Control'||e.key==='Alt'||e.key==='Meta') return;   // 纯修饰键不算
 window.removeEventListener('keydown',onKey,true);
 try{ localStorage.setItem('sf_kb','1'); }catch(_){}
 document.body.classList.remove('touchui');
 if(typeof showScorePop==='function') showScorePop('检测到键盘 · 已收起虚拟按键 (设置里可改成「常开」)');
};
window.addEventListener('keydown',onKey,true);
}
if(TOUCHUI){
document.body.classList.add('touchui');
const $=id=>document.getElementById(id);
const ui=$('touchUI');
const stickZone=$('tStickZone'), stickEl=$('tStick'), knob=$('tKnob');
const STICK_R=62; // 摇杆半径(px, zoom前)
// ---------- 触摸路由表 ----------
const claims=new Map(); // touchId -> claim
let sprintLatch=false;
let leanHoldL=false, leanHoldR=false; // 触屏侧身: 按住状态, 隐藏按钮或离开步战时强制释放
let nadeSel=0; // 手雷种类: 0=手雷 1=闪光 2=烟雾
// ---------- 视角 ----------
 function applyLook(dx,dy){
 if(!player.alive) return;
 if(player.onVehicle&&player.onVehicle.kind==='plane') dy=-dy; // 飞机拉杆反转
 const d=WPN_DEFS[VM.key]||{};
// 与鼠标同一套倍率补偿(含 2×/4× 改件)
const zoomFac=player.ads?(((typeof adsFovOf==='function')?adsFovOf(VM.key):(d.adsFov||60))/BASE_FOV_74):1;
const s=0.0052*SETTINGS.sens*zoomFac;
player.yaw-=dx*s;
player.pitch-=dy*s;
player.pitch=clamp(player.pitch,-1.45,1.45);
player.mouseDX=dx; player.mouseDY=dy;
}
// ---------- 移动摇杆 ----------
function stickHome(){
stickEl.classList.remove('live','sprint');
stickEl.style.left=''; stickEl.style.top=''; stickEl.style.bottom='';
knob.style.transform='translate(0px,0px)';
}
function setMove(dx,dy){
const r=Math.hypot(dx,dy);
const cl=Math.min(r,STICK_R)*(stickEl.offsetWidth/2)/STICK_R;
const nx=r>1e-3?dx/r:0, ny=r>1e-3?dy/r:0;
knob.style.transform=`translate(${nx*cl}px,${ny*cl}px)`;
const fx=dx/STICK_R, fy=dy/STICK_R;
keys.KeyW=fy<-0.3; keys.KeyS=fy>0.3;
keys.KeyA=fx<-0.34; keys.KeyD=fx>0.34;
// 推满且大体向前 → 疾跑(锁存, 收回到一半以下解除)
if(r>STICK_R*1.02&&fy<-0.5) sprintLatch=true;
if(r<STICK_R*0.5||fy>-0.1) sprintLatch=false;
keys.ShiftLeft=sprintLatch;
stickEl.classList.toggle('sprint',sprintLatch);
}
function resetMove(){
keys.KeyW=keys.KeyS=keys.KeyA=keys.KeyD=false;
keys.ShiftLeft=false;
sprintLatch=false;
stickHome();
}
// ---------- 手雷种类 ----------
function nadeAvail(){
const a=[];
if(player.nadeCount>0) a.push(0);
if((player.flashCount||0)>0) a.push(1);
if(player.smokeCount>0) a.push(2);
return a;
}
function syncNadeUI(){
const names=['手雷','闪光','烟雾'];
const counts=[player.nadeCount,player.flashCount||0,player.smokeCount];
const av=nadeAvail();
if(av.length&&!av.includes(nadeSel)) nadeSel=av[0];
const nb=$('tNade');
if(nb) nb.querySelector('.tLbl').textContent=names[nadeSel]+'×'+(counts[nadeSel]||0);
const nt=$('tNadeType');
if(nt) nt.querySelector('.tLbl').textContent='换'+names[(av[(av.indexOf(nadeSel)+1)%Math.max(av.length,1)]??nadeSel)];
}
// ---------- 按钮动作 ----------
function setTools(open){
ui.classList.toggle('toolsOpen',open);
$('tToolsToggle').setAttribute('aria-expanded',String(open));
$('tToolsToggle').querySelector('.tLbl').textContent=open?'收起':'工具';
const quests=$('questHud');
if(quests) (open?$('tTools'):$('mapObjectives')).appendChild(quests);
}
function pressAct(act,claim){
switch(act){
case 'tools': setTools(!ui.classList.contains('toolsOpen')); break;
case 'shop': if(typeof ammoShopOpen==='function') ammoShopOpen(); break;
case 'fire':
if(player.alive){ mouseDown=true; claim.fireLook=true; }
break;
case 'ads':
if(!player.alive) break;
if(player.onVehicle&&player.onVehicle.kind==='tank'){ mouse2Down=true; claim.holdAds=true; } // 坦克: 按住=同轴机枪
else if(player.onVehicle&&player.onVehicle.kind==='plane'){ keys.KeyB=true; claim.bombKey=true; } // 飞机: 投弹
else if(weaponControlsActive()){
  if(zoomRangeOf(player.curW.key)){
    claim.zoomKey=player.curW.key;
    claim.closeSightOnTap=player.ads;
    player.ads=true;
  }else player.ads=!player.ads;
  if(player.ads&&player.carry==='low') setCarryStance('high');
}
break;
case 'jump': keys.Space=true; claim.jumpKey=true; break;
case 'crouch':
// 点按 = 蹲/起立, 长按(430ms) = 趴/起身
claim.longT=setTimeout(()=>{ claim.longT=null; if(player.alive) InputActions.toggleProne(); },430);
break;
case 'reload':
if(player.alive){
  if(emptyMagAction(player.curW)==='buy') ammoShopOpen();
  else tryReload();
}
break;
case 'swap': if(player.alive) switchSlot(player.curSlot===0?1:0); break;
case 'melee': if(player.alive) InputActions.melee(); break;
case 'nade':
if(!player.alive) break;
if(nadeSel===0){
// 第一次按 = 拿出手雷; 已就位时按住 = 蓄力, 松手投出
if(VM.state==='nade'&&player.nadeHeld){ InputActions.nadeChargeStart(); claim.nadeHold=true; }
else InputActions.nadeEquip();
}
else if(nadeSel===1) InputActions.throwFlash();
else InputActions.throwSmoke();
break;
case 'nadetype': {
const av=nadeAvail();
if(av.length>1){ nadeSel=av[(av.indexOf(nadeSel)+1)%av.length]; AudioSys.click(1400,0.2,0.04); }
syncNadeUI();
break;
}
case 'heal': if(player.alive) InputActions.bandage(); break;
case 'medwheel': if(player.alive&&typeof toggleMedWheel==='function') toggleMedWheel(); break;
case 'eat': if(player.alive) InputActions.eatFood(); break;
case 'skill': if(player.alive) InputActions.classSkill(); break;
case 'buildsel': if(player.alive) InputActions.buildNext(); break;
case 'brace': if(player.alive) InputActions.toggleBrace(); break;
case 'nvg': if(typeof toggleHeadgear==='function') toggleHeadgear(); else if(typeof NVG!=='undefined') NVG.toggle(); break;
case 'carry': if(player.alive&&typeof setCarryStance==='function') setCarryStance(player.carry==='high'?'low':'high'); break;
case 'bag': if(player.alive&&typeof toggleBagPanel==='function') toggleBagPanel(); break;
case 'bagdrop': if(player.alive&&typeof bagDropSelected==='function') bagDropSelected(false); break;
case 'interact': if(player.alive) tryInteract(); break;
case 'flash': if(player.alive&&typeof flashToggle==='function') flashToggle(); break;
case 'leanl': if(player.alive){ keys.KeyQ=true; leanHoldL=true; } break;
case 'leanr': if(player.alive){ keys.KeyE=true; leanHoldR=true; } break;
case 'squadguard': if(player.alive) squadOrderGuard(); break;
case 'squadattack': if(player.alive) squadOrderAttack(); break;
case 'squadfollow': if(player.alive) squadOrderFollow(); break;
case 'bigmap': if(typeof toggleBigMap==='function') toggleBigMap(); break;
case 'score': {
const sb=$('scoreboard');
const on=sb.style.display==='block';
sb.style.display=on?'none':'block';
if(!on) updateScoreboard();
break;
}
case 'menu': if(player.deployed&&!matchOver) showDeploy(false); break;
}
}
function releaseAct(act,claim,canceled){
switch(act){
case 'fire': mouseDown=false; break;
case 'ads':
if(claim.holdAds) mouse2Down=false;
if(claim.bombKey) keys.KeyB=false;
if(claim.closeSightOnTap&&!claim.zoomDragged&&!canceled&&weaponControlsActive()&&player.curW.key===claim.zoomKey) player.ads=false;
break;
case 'jump': keys.Space=false; break;
case 'crouch':
if(claim.longT){ clearTimeout(claim.longT); claim.longT=null; if(player.alive) InputActions.toggleCrouch(); }
break;
case 'nade':
if(claim.nadeHold) InputActions.nadeChargeRelease();
break;
case 'leanl': keys.KeyQ=false; leanHoldL=false; break;
case 'leanr': keys.KeyE=false; leanHoldR=false; break;
}
}
// ---------- 触摸事件 ----------
ui.addEventListener('touchstart',e=>{
// 按钮布局编辑中: 交给 51_settings 的捕获阶段处理拖动, 这里一律不响应
if(window.LAYOUT_EDIT) return;
AudioSys.resume&&AudioSys.resume();
// 抽屉里的短按在抬指后执行，纵向滑动留给浏览器滚动。
if(!e.target.closest('#tTools')) e.preventDefault();
for(const t of e.changedTouches){
const x=t.clientX,y=t.clientY;
const target=document.elementFromPoint(x,y);
const btn=target&&target.closest?target.closest('.tbtn'):null;
if(ui.classList.contains('toolsOpen')&&btn?.id!=='tToolsToggle'&&!target?.closest('#tTools')){
setTools(false);
if(!btn) continue;
}
if(btn&&!btn.classList.contains('hiddenT')){
const claim={t:'btn',el:btn,act:btn.dataset.act,lx:x,ly:y};
claims.set(t.identifier,claim);
btn.classList.add('press');
claim.waitTap=ui.classList.contains('toolsOpen')&&!!btn.closest('#tTools')&&!btn.classList.contains('placed')&&!['leanl','leanr','nade'].includes(claim.act);
if(!claim.waitTap) pressAct(claim.act,claim);
continue;
}
if(target?.closest('#tTools')) continue;
if(bigMapVisible()) continue;
const zr=stickZone.getBoundingClientRect();
let hasMove=false; for(const c of claims.values()) if(c.t==='move') hasMove=true;
if(!hasMove&&x>=zr.left&&x<=zr.right&&y>=zr.top&&y<=zr.bottom){
const claim={t:'move',ox:x,oy:y};
claims.set(t.identifier,claim);
// 浮动摇杆: 落指处为原点
const ur=stickZone.getBoundingClientRect();
const k=ui.style.zoom?parseFloat(ui.style.zoom):1;
stickEl.classList.add('live');
stickEl.style.left=((x-ur.left)/k-stickEl.offsetWidth/2)+'px';
stickEl.style.bottom='';
stickEl.style.top=((y-ur.top)/k-stickEl.offsetHeight/2)+'px';
setMove(0,0);
continue;
}
claims.set(t.identifier,{t:'look',lx:x,ly:y});
}
},{passive:false});
ui.addEventListener('touchmove',e=>{
if(!e.target.closest('#tTools')) e.preventDefault();
for(const t of e.changedTouches){
const c=claims.get(t.identifier);
if(!c) continue;
const x=t.clientX,y=t.clientY;
if(c.waitTap&&Math.hypot(x-c.lx,y-c.ly)>8) c.scrolled=true;
if(c.t==='move'){ setMove(x-c.ox,y-c.oy); }
else if(c.t==='look'){ applyLook(x-c.lx,y-c.ly); c.lx=x; c.ly=y; }
else if(c.t==='btn'&&c.fireLook){ applyLook(x-c.lx,y-c.ly); c.lx=x; c.ly=y; }
else if(c.zoomKey){
  const dy=c.ly-y;
  if(!c.zoomDragged&&Math.abs(dy)<5) continue;
  c.zoomDragged=true; c.ly=y;
  if(player.ads&&weaponControlsActive()&&player.curW.key===c.zoomKey){
    zoomAdjust(c.zoomKey,dy/20);
    zoomHudUpdate();
  }
}
else if(c.t==='btn'&&c.longT&&Math.hypot(x-c.lx,y-c.ly)>18){ clearTimeout(c.longT); c.longT=null; } // 移出取消长按
}
},{passive:false});
function endTouch(e){
if(e.cancelable) e.preventDefault();
for(const t of e.changedTouches){
const c=claims.get(t.identifier);
if(!c) continue;
claims.delete(t.identifier);
if(c.t==='move') resetMove();
else if(c.t==='btn'){
c.el.classList.remove('press');
const canceled=e.type==='touchcancel';
if(canceled){
  if(c.longT) clearTimeout(c.longT);
  c.longT=null;
  if(c.nadeHold){ c.nadeHold=false; player.nadeCharging=false; player.nadeCharge=0; }
}
if(c.waitTap){ if(!c.scrolled&&!canceled) pressAct(c.act,c); }
else releaseAct(c.act,c,canceled);
}
}
}
ui.addEventListener('touchend',endTouch,{passive:false});
ui.addEventListener('touchcancel',endTouch,{passive:false});
clearTouchClaims=function(){
for(const claim of claims.values()){
if(claim.longT) clearTimeout(claim.longT);
if(claim.nadeHold){ player.nadeCharging=false; player.nadeCharge=0; }
if(claim.el) claim.el.classList.remove('press');
}
if(claims.size){ claims.clear(); resetMove(); releaseAllInputs(); leanHoldL=leanHoldR=false; }
if(ui.classList.contains('toolsOpen')) setTools(false);
};
addEventListener('blur',clearTouchClaims);
// ---------- 按钮可见性 / 语义随状态切换 ----------
const show=(id,on)=>{ const b=$(id); if(b._v!==on){ b._v=on; b.classList.toggle('hiddenT',!on); } };
const setLbl=(id,txt)=>{ const b=$(id); const l=b.querySelector('.tLbl'); if(l._t!==txt){ l._t=txt; l.textContent=txt; } };
const setOn=(id,on)=>{ const b=$(id); if(b._on!==on){ b._on=on; b.classList.toggle('on',!!on); } };
window.updateTouchVis=function(){
const p=player;
const inGame=p.deployed&&p.alive&&!matchOver;
const onFoot=inGame&&!p.onVehicle&&!p.onMG&&!p.onAT&&!p.onAA&&!p.onMortar;
const inTank=inGame&&p.onVehicle&&p.onVehicle.kind==='tank';
const inPlane=inGame&&p.onVehicle&&p.onVehicle.kind==='plane';
const onGun=inGame&&(p.onMG||p.onAT||p.onAA||p.onMortar);
show('tStickZone',inGame&&!inPlane||inPlane); // 飞机也用摇杆(油门/滚转)
show('tFire',inGame);
setLbl('tFire',inTank?'主炮':inPlane?'机枪':onGun?'开火':'开火');
show('tAds',inGame&&!onGun||inTank||inPlane);
setLbl('tAds',inTank?'机枪':inPlane?'炸弹':onFoot&&p.ads&&p.curW&&zoomRangeOf(p.curW.key)?'上下调倍':'瞄准');
setOn('tAds',onFoot&&p.ads);
show('tJump',onFoot);
// 右手战斗簇
show('tCrouch',onFoot||inTank);
setLbl('tCrouch',inTank?'炮镜':(p.prone?'起身':p.crouch?'起立':'蹲/趴'));
setOn('tCrouch',p.crouch||p.prone||(inTank&&p.tankView));
show('tReload',onFoot);
show('tSwap',onFoot&&p.slots.length>1);
show('tMelee',onFoot);
show('tNade',onFoot&&nadeAvail().length>0);
show('tNadeType',onFoot&&nadeAvail().length>1);
if(onFoot) syncNadeUI();
// 左手工具簇
show('tHeal',onFoot&&p.bandages>0&&p.hp<(p.maxHp||100));
setLbl('tHeal','绷带×'+p.bandages);
show('tEat',onFoot&&!!(p.foodItems&&p.foodItems.length));
// 药品轮盘: 身上有可用药品时才显示 (medWheelKeys 在 53_medwheel.js, 加载在本文件之后, 所以运行时判存在)
const mwAvail=onFoot&&typeof medWheelKeys==='function'&&medWheelKeys().length>0;
show('tMedWheel',mwAvail);
const skillOn=onFoot&&(p.cls===2||p.cls===4);
show('tSkill',skillOn);
if(skillOn) setLbl('tSkill',p.cls===2?'医疗箱':'建造');
show('tBuildSel',onFoot&&p.cls===4);
if(onFoot&&p.cls===4){ const bt=BUILD_MENU[p.buildSel||0]; setLbl('tBuildSel',bt==='mg'?'机枪':BUILD_NAMES[bt]); }
show('tBrace',onFoot&&(p.canBrace||p.braced));
setOn('tBrace',p.braced);
// 夜视仪: 手上这把枪的战术配件槽装了 gear_nvg 才显示
// 头部装备: 本局选面罩就显示"面罩", 选夜视就显示"夜视"
const faceMode=!!(typeof RUN!=='undefined'&&RUN&&RUN.headGear==='face');
const nvgOn=onFoot&&!!p.curW&&typeof getModChoice==='function'&&getModChoice(p.curW.key,'gear')==='gear_nvg';
show('tNvg',faceMode||nvgOn);
if(faceMode) setLbl('tNvg','面罩'); else setLbl('tNvg','夜视');
const _tNvg=document.getElementById('tNvg');
if(_tNvg){ const _ico=_tNvg.querySelector('.tIco'); if(_ico) _ico.textContent=faceMode?'▣':'◐'; _tNvg.title=faceMode?'展开/收起面罩':'开关夜视仪'; }
if(faceMode) setOn('tNvg',!!RUN.faceDown);
else if(nvgOn&&typeof NVG!=='undefined') setOn('tNvg',!!NVG.active());
if(typeof syncHeadgearUI==='function') syncHeadgearUI();
show('tLeanL',onFoot);
show('tLeanR',onFoot);
setOn('tLeanL',!!keys.KeyQ);
setOn('tLeanR',!!keys.KeyE);
if(!onFoot){ if(leanHoldL){ keys.KeyQ=false; leanHoldL=false; } if(leanHoldR){ keys.KeyE=false; leanHoldR=false; } }
show('tBag',inGame);
setOn('tBag',typeof BAG_UI!=='undefined'&&BAG_UI.open);
show('tFlash',onFoot&&!!FLASH.hasMod);
setOn('tFlash',!!FLASH.want);
if(onFoot) setLbl('tFlash',FLASH.isLaser?'激光':'手电');
// 情境交互键
const it=(inGame||p.onVehicle)&&INTERACT_INFO?INTERACT_INFO.label:null;
show('tInteract',!!it);
if(it) setLbl('tInteract',it);
show('tAttack',inGame&&SQUAD.members.length>0);
show('tGuard',inGame&&SQUAD.members.length>0);
show('tFollow',inGame&&SQUAD.members.length>0);
show('tMap',inGame);
setLbl('tMap',bigMapVisible()?'收起地图':'地图');
show('tScore',p.deployed);
show('tMenu',p.deployed);
show('tToolsToggle',p.deployed);
show('tShop',inGame&&typeof ammoShopCanOpen==='function'&&ammoShopCanOpen());
};
// 初始化
for(const b of ui.querySelectorAll('.tbtn')) b.classList.add('hiddenT');
stickHome();
applyTouchScale();
addEventListener('resize',stickHome);
}
