'use strict';
// =====================================================================
// 51_settings.js —— 游戏设置扩展: 键位自定义 + 手机端按钮布局
// ---------------------------------------------------------------------
// 加载位置: 所有游戏脚本之后 (index.html 里放在 50_workshop_boot 之后)。
//   只做界面, 不动输入逻辑 —— 键位映射本体在 24_input.js
//   (KEY_ACTIONS / KEYMAP / keyOf / setKey / resetKeys / canonKey)。
//
// 键位:
//   · 点击某一项右侧的按键 → 进入「按新键…」捕获态, 按任意键完成绑定, Esc 取消。
//   · 捕获用捕获阶段 + stopImmediatePropagation, 保证不会被游戏输入层吃掉。
//   · 目标键若已被别的动作占用 → 与那个动作交换 (见 24_input.setKey)。
//   · 移动键(WASD/空格/Shift/Q/E)在输入层被翻译成固定规范码, 所以改键不影响任何消费者。
//
// 手机端按钮布局:
//   · 进入编辑模式后强制显示触控层, 直接拖动按钮(鼠标或手指)。
//   · 位置按**屏幕百分比**保存到 localStorage bf_tbtn_v1, 换分辨率/换设备也能对上。
//   · 编辑时由 #touchUI 的指针捕获拖动，31_touch 暂停战斗操作。
// =====================================================================

// ---------------- 键位设置 ----------------
// KeyboardEvent.code → 好读的显示名
const KEY_CODE_CN={
KeyW:'W',KeyA:'A',KeyS:'S',KeyD:'D',KeyQ:'Q',KeyE:'E',KeyR:'R',KeyC:'C',KeyZ:'Z',KeyX:'X',
KeyV:'V',KeyH:'H',KeyK:'K',KeyJ:'J',KeyB:'B',KeyF:'F',KeyG:'G',KeyN:'N',KeyM:'M',KeyP:'P',
KeyT:'T',KeyY:'Y',KeyU:'U',KeyI:'I',KeyO:'O',KeyL:'L',
Digit0:'0',Digit1:'1',Digit2:'2',Digit3:'3',Digit4:'4',Digit5:'5',Digit6:'6',Digit7:'7',Digit8:'8',Digit9:'9',
Space:'空格',Tab:'Tab',Escape:'Esc',Enter:'回车',Backspace:'退格',CapsLock:'CapsLock',
ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',
ShiftLeft:'左Shift',ShiftRight:'右Shift',ControlLeft:'左Ctrl',ControlRight:'右Ctrl',AltLeft:'左Alt',AltRight:'右Alt',
Minus:'-',Equal:'=',BracketLeft:'[',BracketRight:']',Semicolon:';',Quote:"'",Backquote:'`',
Comma:',',Period:'.',Slash:'/',Backslash:'\\',
Numpad0:'小键盘0',Numpad1:'小键盘1',Numpad2:'小键盘2',Numpad3:'小键盘3',Numpad4:'小键盘4',
Numpad5:'小键盘5',Numpad6:'小键盘6',Numpad7:'小键盘7',Numpad8:'小键盘8',Numpad9:'小键盘9',
};
function keyCodeName(c){ return KEY_CODE_CN[c]||String(c||'?').replace(/^Key/,'').replace(/^Digit/,''); }

let _keyCapturing=null;   // 正在等待新键的 action
function renderKeyGrid(focusAction){
const g=el('keyGrid'); if(!g) return;
const search=el('keySearch'), q=search.value.trim().toLowerCase();
g.replaceChildren();
let nextFocus=null;
for(const it of KEY_ACTIONS){
const code=keyOf(it.a), label=keyCodeName(code);
if(q&&!it.n.toLowerCase().includes(q)&&!label.toLowerCase().includes(q)&&code.toLowerCase()!==q) continue;
const row=document.createElement('div');
const nm=document.createElement('span');
nm.textContent=it.n;
const btn=document.createElement('button');
btn.className='optBtn';
btn.textContent=(_keyCapturing===it.a)?'按新键…':label;
btn.setAttribute('aria-label',it.n+' · '+btn.textContent);
btn.setAttribute('aria-pressed',String(_keyCapturing===it.a));
if(_keyCapturing===it.a) btn.classList.add('sel');
btn.onclick=()=>{ _keyCapturing=(_keyCapturing===it.a)?null:it.a; renderKeyGrid(it.a); };
if(it.a===focusAction) nextFocus=btn;
row.appendChild(nm); row.appendChild(btn);
g.appendChild(row);
}
if(!g.children.length){
  const p=document.createElement('p'); p.className='settingHint'; p.textContent='没有匹配的键位。';
  g.appendChild(p);
}
if(focusAction) (nextFocus||search).focus({preventScroll:true});
}
// 捕获阶段拦按键: 不被 24_input 的 keydown 吃掉
addEventListener('keydown',e=>{
if(!_keyCapturing) return;
if(el('mSet').classList.contains('hidden')||el('setKeys').hidden){ _keyCapturing=null; return; }
e.preventDefault();
e.stopImmediatePropagation();
const a=_keyCapturing;
if(e.code==='Escape'){ _keyCapturing=null; renderKeyGrid(a); return; }
// 单独按修饰键不算一个绑定, 继续等
if(e.code==='ShiftLeft'||e.code==='ShiftRight'||e.code==='ControlLeft'||e.code==='ControlRight'||e.code==='AltLeft'||e.code==='AltRight'||e.code==='MetaLeft'||e.code==='MetaRight') return;
setKey(a,e.code);
_keyCapturing=null;
renderKeyGrid(a);
},true);

// ---------------- 显示比例 (强制拉伸) ----------------
// 选定比例后, 把**相机的宽高比**设成该比例, 但渲染区仍是整个窗口 ——
// 投影按该比例算、再铺满窗口, 于是画面被**强制拉伸**铺满, 不出现黑边 (代价是变形)。
// auto = 相机比例跟随窗口, 也就是不拉伸。
function aspectValue(){
const mode=(typeof SETTINGS!=='undefined'&&SETTINGS.aspect)||'auto';
if(mode==='auto') return innerWidth/innerHeight;
const p=mode.split(':');
const v=(+p[0])/(+p[1]);
return (isFinite(v)&&v>0)?v:(innerWidth/innerHeight);
}
// 渲染区: 拉伸模式下永远是整窗 (34_nvg 等仍按这个尺寸建渲染目标)
function viewRect(){ return { x:0, y:0, w:innerWidth, h:innerHeight }; }
function applyAspect(){
if(typeof renderer==='undefined'||!renderer) return;
const r=viewRect();
const a=aspectValue();
// 关键: 相机用**选定比例**, 渲染区用**整窗** → 画面被拉伸铺满 (不出现黑边)
if(typeof camera!=='undefined'&&camera){ camera.aspect=a; camera.updateProjectionMatrix(); }
if(typeof vmCamera!=='undefined'&&vmCamera){ vmCamera.aspect=a; vmCamera.updateProjectionMatrix(); }
renderer.setSize(r.w,r.h);
const cv=renderer.domElement;
if(cv){ cv.style.position='fixed'; cv.style.left='0px'; cv.style.top='0px'; }
// HUD / 触控层复位成铺满整窗 —— 拉伸模式不需要缩进, 顺便清掉以前留的 inline 尺寸与 transform
const box=(e)=>{ if(!e) return; e.style.left='0px'; e.style.top='0px';
e.style.width='100%'; e.style.height='100%'; e.style.right='auto'; e.style.bottom='auto'; };
box(document.getElementById('ui'));
const tu=document.getElementById('touchUI');
box(tu);
if(tu) tu.style.transform='';
}
(function initAspectUI(){
const row=el('aspectRow');
if(!row) return;
const sync=()=>{
// ⚠ 属性名不能用 data-ar: 军械库页签已经占用了它 (37_meta 里统一绑 renderArmory(b.dataset.ar)),
// 会把这里的按钮劫持过去。用 data-aspect。
row.querySelectorAll('[data-aspect]').forEach(b=>b.classList.toggle('sel',b.dataset.aspect===SETTINGS.aspect));
const h=el('aspectHint');
if(h){
const r=viewRect();
h.textContent=(SETTINGS.aspect==='auto')
?('跟随窗口 · 不拉伸 · 窗口 '+innerWidth+'×'+innerHeight)
:('按 '+SETTINGS.aspect+' 投影并强制拉伸铺满窗口 · 画面会变形 · 窗口 '+innerWidth+'×'+innerHeight);
}
};
row.querySelectorAll('[data-aspect]').forEach(b=>{
b.onclick=()=>{
if(b.dataset.aspect===SETTINGS.aspect) return;
SETTINGS.aspect=b.dataset.aspect;
try{ localStorage.setItem('sf_aspect',SETTINGS.aspect); }catch(e){}
applyAspect(); sync();
};
});
addEventListener('resize',()=>{ applyAspect(); sync(); });
applyAspect();
sync();
})();

// ---------------- 手机端按钮布局 ----------------
const TBTN_KEY='bf_tbtn_v1';
let TBTN_LAYOUT=(()=>{ try{ const o=JSON.parse(localStorage.getItem(TBTN_KEY)||'{}'); return (o&&typeof o==='object')?o:{}; }catch(e){ return {}; } })();
function saveTouchLayout(){ try{ localStorage.setItem(TBTN_KEY,JSON.stringify(TBTN_LAYOUT)); }catch(e){} }
function applyTouchLayout(){
const ui=el('touchUI'); if(!ui) return;
for(const b of ui.querySelectorAll('.tbtn')){
const p=TBTN_LAYOUT[b.id];
const placed=!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
b.classList.toggle('placed',placed);
if(placed){
b.style.left=p.x+'%'; b.style.top=p.y+'%';
b.style.right='auto'; b.style.bottom='auto';
}else{
b.style.left=''; b.style.top=''; b.style.right=''; b.style.bottom='';
}
}
}

function enterLayoutEdit(){
if(window.LAYOUT_EDIT) return;
window.LAYOUT_EDIT=true;
document.body.classList.add('layoutEdit');
const bar=document.createElement('div');
bar.id='layoutBar';
bar.setAttribute('role','group');
bar.setAttribute('aria-label','触屏布局编辑');
const tip=document.createElement('span');
tip.textContent='拖动按键调整位置，工具盘里的按键可以拖到屏幕上。';
bar.appendChild(tip);
const reset=document.createElement('button'),done=document.createElement('button');
reset.className=done.className='optBtn';
reset.textContent='恢复默认'; reset.onclick=resetTouchLayout;
done.textContent='完成'; done.onclick=exitLayoutEdit;
bar.append(reset,done);
document.body.appendChild(bar);
done.focus({preventScroll:true});
}
function exitLayoutEdit(){
if(!window.LAYOUT_EDIT) return;
window.LAYOUT_EDIT=false;
document.body.classList.remove('layoutEdit');
el('layoutBar').remove();
el('tLayoutBtn').focus({preventScroll:true});
if(typeof window.updateTouchVis==='function') window.updateTouchVis();
}
function resetTouchLayout(){ TBTN_LAYOUT={}; saveTouchLayout(); applyTouchLayout(); }
addEventListener('keydown',e=>{
if(window.LAYOUT_EDIT&&e.key==='Escape'){ e.preventDefault(); e.stopImmediatePropagation(); exitLayoutEdit(); }
},true);

// 编辑器和对局共享按钮；从工具盘拖出时保留手指在按钮上的相对位置。
(function(){
const ui=el('touchUI'); if(!ui) return;
let drag=null;
ui.addEventListener('pointerdown',e=>{
const b=e.target.closest('.tbtn');
if(!window.LAYOUT_EDIT||!b||drag||e.button!==0) return;
const r=b.getBoundingClientRect();
drag={b,id:e.pointerId,startX:e.clientX,startY:e.clientY,fx:(e.clientX-r.left)/r.width,fy:(e.clientY-r.top)/r.height,moved:false};
b.setPointerCapture(e.pointerId);
b.classList.add('press');
e.preventDefault();
});
ui.addEventListener('pointermove',e=>{
if(!window.LAYOUT_EDIT||drag?.id!==e.pointerId) return;
if(!drag.moved&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<3) return;
drag.moved=true;
const b=drag.b, area=ui.getBoundingClientRect();
b.classList.add('placed');
const r=b.getBoundingClientRect();
const x=clamp(e.clientX-area.left-drag.fx*r.width,0,area.width-r.width);
const y=clamp(e.clientY-area.top-drag.fy*r.height,0,area.height-r.height);
b.style.left=(x/area.width*100)+'%'; b.style.top=(y/area.height*100)+'%';
b.style.right='auto'; b.style.bottom='auto';
});
ui.addEventListener('pointerup',e=>{
if(drag?.id!==e.pointerId) return;
if(window.LAYOUT_EDIT&&drag.moved){
  const b=drag.b;
  TBTN_LAYOUT[b.id]={x:+parseFloat(b.style.left).toFixed(3),y:+parseFloat(b.style.top).toFixed(3)};
  saveTouchLayout();
}
});
ui.addEventListener('lostpointercapture',e=>{
if(drag?.id!==e.pointerId) return;
drag.b.classList.remove('press'); drag=null;
applyTouchLayout();
});
})();

// ---------------- 初始化 ----------------
(function initSettingsExtra(){
const settings=el('mSet');
const tabs=[...settings.querySelectorAll('[role=tab]')];
function selectTab(active){
  _keyCapturing=null;
  for(const t of tabs){
    const chosen=t===active;
    t.tabIndex=chosen?0:-1; t.setAttribute('aria-selected',String(chosen));
    el(t.getAttribute('aria-controls')).hidden=!chosen;
  }
  settings.querySelector('.menuBody').scrollTop=0;
  if(active.id==='tabKeys') renderKeyGrid();
}
for(const [i,tab] of tabs.entries()){
  tab.onclick=()=>selectTab(tab);
  tab.onkeydown=e=>{
    const target={ArrowLeft:(i+tabs.length-1)%tabs.length,ArrowRight:(i+1)%tabs.length,Home:0,End:tabs.length-1}[e.key];
    if(target===undefined) return;
    e.preventDefault(); selectTab(tabs[target]); tabs[target].focus();
  };
}
const search=el('keySearch');
search.oninput=()=>renderKeyGrid();
document.addEventListener('pointerdown',e=>{
  if(_keyCapturing&&!e.target.closest('#keyGrid')){ _keyCapturing=null; renderKeyGrid(); }
});
// 这些选项的原输入处理负责立即生效，重新载入地图时还要恢复玩家的选择。
const prefKey='sf_presentation_settings';
let prefs={};
try{ prefs=JSON.parse(localStorage.getItem(prefKey))||{}; }catch(e){}
if([0,1,2].includes(prefs.quality)) SETTINGS.quality=prefs.quality;
if(Number.isFinite(prefs.sens)) SETTINGS.sens=clamp(prefs.sens,.2,2);
if(Number.isFinite(prefs.vol)) SETTINGS.vol=clamp(prefs.vol,0,1);
const savePrefs=()=>{ try{ localStorage.setItem(prefKey,JSON.stringify({quality:SETTINGS.quality,sens:SETTINGS.sens,vol:SETTINGS.vol})); }catch(e){} };
el('sensRange').value=Math.round(SETTINGS.sens*100); el('sensVal').textContent=SETTINGS.sens.toFixed(1);
el('volRange').value=Math.round(SETTINGS.vol*100); el('volVal').textContent=el('volRange').value;
for(const btn of settings.querySelectorAll('.qualBtn')) btn.classList.toggle('sel',Number(btn.dataset.q)===SETTINGS.quality);
const syncChoices=()=>settings.querySelectorAll('.settingChoices button:not(#tLayoutBtn,#tLayoutReset)').forEach(
  b=>b.setAttribute('aria-pressed',String(b.classList.contains('sel'))));
settings.addEventListener('click',e=>{ syncChoices(); if(e.target.closest('.qualBtn')) savePrefs(); });
settings.addEventListener('input',e=>{ if(e.target.id==='volRange'||e.target.id==='sensRange') savePrefs(); });
syncChoices();
const grid=el('keyGrid');
if(grid) renderKeyGrid();
const rb=el('keyResetBtn');
if(rb) rb.onclick=()=>{ resetKeys(); _keyCapturing=null; renderKeyGrid(); };
const lb=el('tLayoutBtn');
if(lb) lb.onclick=()=>enterLayoutEdit();
const lr=el('tLayoutReset');
if(lr) lr.onclick=resetTouchLayout;
applyTouchLayout();
})();
