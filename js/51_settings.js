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
//   · 拖拽在 #touchUI 的捕获阶段拦截, 不会被 31_touch 的按按钮/摇杆/转视角逻辑抢走。
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
function renderKeyGrid(){
const g=el('keyGrid'); if(!g) return;
g.innerHTML='';
for(const it of KEY_ACTIONS){
const row=document.createElement('div');
row.style.cssText='display:flex;align-items:center;gap:6px;padding:3px 6px;border:1px solid #565656;border-radius:6px;background:rgba(0,0,0,.28)';
const nm=document.createElement('span');
nm.textContent=it.n;
nm.style.cssText='flex:1;font-size:12px;color:#d2d2d2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
const btn=document.createElement('button');
btn.className='optBtn';
btn.style.cssText='min-width:78px;padding:3px 8px;font-size:12px';
btn.textContent=(_keyCapturing===it.a)?'按新键…':keyCodeName(keyOf(it.a));
if(_keyCapturing===it.a) btn.classList.add('sel');
btn.onclick=()=>{ _keyCapturing=(_keyCapturing===it.a)?null:it.a; renderKeyGrid(); };
row.appendChild(nm); row.appendChild(btn);
g.appendChild(row);
}
}
// 捕获阶段拦按键: 不被 24_input 的 keydown 吃掉
addEventListener('keydown',e=>{
if(!_keyCapturing) return;
e.preventDefault();
e.stopImmediatePropagation();
const a=_keyCapturing;
if(e.code==='Escape'){ _keyCapturing=null; renderKeyGrid(); return; }
// 单独按修饰键不算一个绑定, 继续等
if(e.code==='ShiftLeft'||e.code==='ShiftRight'||e.code==='ControlLeft'||e.code==='ControlRight'||e.code==='AltLeft'||e.code==='AltRight'||e.code==='MetaLeft'||e.code==='MetaRight') return;
setKey(a,e.code);
_keyCapturing=null;
renderKeyGrid();
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
if(p&&typeof p.x==='number'&&typeof p.y==='number'){
b.style.left=p.x+'%'; b.style.top=p.y+'%';
b.style.right='auto'; b.style.bottom='auto';
}else{
b.style.left=''; b.style.top=''; b.style.right=''; b.style.bottom='';
}
}
}

let _layoutEditOn=false, _layoutBar=null;
function enterLayoutEdit(){
if(_layoutEditOn) return;
_layoutEditOn=true;
window.LAYOUT_EDIT=true;
document.body.classList.add('layoutEdit');
const ui=el('touchUI');
if(ui) for(const b of ui.querySelectorAll('.tbtn')) b.classList.remove('hiddenT');
const bar=document.createElement('div');
bar.id='layoutBar';
const tip=document.createElement('span');
tip.innerHTML='<b>按钮布局编辑</b> · 拖动按钮调整位置（鼠标或手指）';
bar.appendChild(tip);
const mk=(t,fn,extra)=>{ const b=document.createElement('button'); b.className='optBtn'; b.textContent=t; b.style.cssText='padding:3px 12px;font-size:12px;'+(extra||''); b.onclick=fn; return b; };
bar.appendChild(mk('恢复默认',()=>{ TBTN_LAYOUT={}; saveTouchLayout(); applyTouchLayout(); }));
bar.appendChild(mk('完成',()=>exitLayoutEdit(),'background:#3a5f3a;border-color:#6fbf6f'));
document.body.appendChild(bar);
_layoutBar=bar;
}
function exitLayoutEdit(){
if(!_layoutEditOn) return;
_layoutEditOn=false;
window.LAYOUT_EDIT=false;
document.body.classList.remove('layoutEdit');
if(_layoutBar){ _layoutBar.remove(); _layoutBar=null; }
if(typeof window.updateTouchVis==='function') window.updateTouchVis();
}

// 拖拽: 在 #touchUI 捕获阶段拦下, 不让 31_touch 把它当成按按钮/摇杆/转视角
(function(){
const ui=el('touchUI'); if(!ui) return;
let drag=null;
function pct(b,cx,cy){
const ur=ui.getBoundingClientRect();
const k=ui.style.zoom?parseFloat(ui.style.zoom):1;
const w=ur.width/k, h=ur.height/k;
const bw=b.offsetWidth, bh=b.offsetHeight;
let x=((cx-ur.left)/k-bw/2)/w*100;
let y=((cy-ur.top)/k-bh/2)/h*100;
x=Math.max(0,Math.min(100-bw/w*100,x));
y=Math.max(0,Math.min(100-bh/h*100,y));
return [x,y];
}
function hit(cx,cy){
const t=document.elementFromPoint(cx,cy);
return t&&t.closest?t.closest('.tbtn'):null;
}
function begin(cx,cy){
if(!_layoutEditOn) return false;
const b=hit(cx,cy);
if(!b) return false;
drag={b};
b.classList.add('press');
return true;
}
function move(cx,cy){
if(!drag) return;
const [x,y]=pct(drag.b,cx,cy);
drag.b.style.left=x+'%'; drag.b.style.top=y+'%';
drag.b.style.right='auto'; drag.b.style.bottom='auto';
}
function end(){
if(!drag) return;
const b=drag.b;
const x=parseFloat(b.style.left), y=parseFloat(b.style.top);
if(isFinite(x)&&isFinite(y)) TBTN_LAYOUT[b.id]={x:+x.toFixed(3),y:+y.toFixed(3)};
b.classList.remove('press');
drag=null;
saveTouchLayout();
}
// 触摸
ui.addEventListener('touchstart',e=>{
if(!_layoutEditOn) return;
const t=e.changedTouches[0]; if(!t) return;
if(begin(t.clientX,t.clientY)){ e.preventDefault(); e.stopImmediatePropagation(); }
},{capture:true,passive:false});
ui.addEventListener('touchmove',e=>{
if(!_layoutEditOn||!drag) return;
const t=e.changedTouches[0]; if(!t) return;
move(t.clientX,t.clientY);
e.preventDefault(); e.stopImmediatePropagation();
},{capture:true,passive:false});
ui.addEventListener('touchend',e=>{
if(!_layoutEditOn||!drag) return;
end();
e.preventDefault(); e.stopImmediatePropagation();
},{capture:true,passive:false});
// 鼠标 (桌面预览/调试)
ui.addEventListener('mousedown',e=>{
if(!_layoutEditOn) return;
if(begin(e.clientX,e.clientY)){ e.preventDefault(); e.stopImmediatePropagation(); }
},true);
addEventListener('mousemove',e=>{
if(!_layoutEditOn||!drag) return;
move(e.clientX,e.clientY);
e.stopImmediatePropagation();
},true);
addEventListener('mouseup',e=>{
if(!_layoutEditOn||!drag) return;
end();
e.stopImmediatePropagation();
},true);
})();

// ---------------- 初始化 ----------------
(function initSettingsExtra(){
const grid=el('keyGrid');
if(grid) renderKeyGrid();
const rb=el('keyResetBtn');
if(rb) rb.onclick=()=>{ resetKeys(); _keyCapturing=null; renderKeyGrid(); };
const lb=el('tLayoutBtn');
if(lb) lb.onclick=()=>enterLayoutEdit();
const lr=el('tLayoutReset');
if(lr) lr.onclick=()=>{ TBTN_LAYOUT={}; saveTouchLayout(); applyTouchLayout(); };
applyTouchLayout();
})();
