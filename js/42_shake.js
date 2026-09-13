'use strict';
// ===================== 视角抖动增强 (受击/开枪/爆炸三套独立强度) =====================
// 在既有 camTrauma 衰减/叠加逻辑外面套一层权重与总开关,
// 不改任何原 trauma 数值, 只乘倍率 + 提供菜单/快捷键开关。

// ---------- 配置 ----------
const SHAKE_CFG = (function(){
let saved = null;
try { saved = JSON.parse(localStorage.getItem('bf_shake_v1')||'null'); } catch(e) {}
const base = {
enabled: true,            // 总开关 (菜单按钮 + F8 切换)
masterMul: 1.0,            // 全局乘子 (0=全关, 1=默认, 2=超强)
hitMul: 1.10,              // 受击创伤 (胸部/四肢/头部被打, 乘 hitMul)
shotMul: 0.85,             // 开枪后坐 (武器 def.kick * 0.9, 乘 shotMul)
explosionMul: 1.20,        // 爆炸/手雷/破片 (乘 explosionMul, 距离衰减由调用点处理)
vehicleMul: 0.7,           // 载具内减振 (驾驶坦克/飞机时减弱)
};
if(saved && typeof saved==='object'){
Object.keys(saved).forEach(k=>{ if(k in base) base[k] = saved[k]; });
}
return base;
})();
function saveShakeCfg(){
try { localStorage.setItem('bf_shake_v1', JSON.stringify({
enabled:SHAKE_CFG.enabled,
masterMul:SHAKE_CFG.masterMul,
hitMul:SHAKE_CFG.hitMul,
shotMul:SHAKE_CFG.shotMul,
explosionMul:SHAKE_CFG.explosionMul,
vehicleMul:SHAKE_CFG.vehicleMul,
})); } catch(e){}
}

// ---------- UI 同步 ----------
function syncShakeMenuUI(){
const btn = document.getElementById('shakeBtn');
if(btn) btn.textContent = '视角抖动: ' + (SHAKE_CFG.enabled ? (SHAKE_CFG.masterMul>=0.99 ? '开' : (SHAKE_CFG.masterMul>0 ? Math.round(SHAKE_CFG.masterMul*100)+'%' : '关')) : '关');
const rng = document.getElementById('shakeRange');
if(rng){ rng.value = Math.round(SHAKE_CFG.masterMul*100); const v = document.getElementById('shakeVal'); if(v) v.textContent = Math.round(SHAKE_CFG.masterMul*100)+'%'; }
}
function shakeSetEnabled(on){
SHAKE_CFG.enabled = !!on;
saveShakeCfg();
if(typeof showScorePop==='function') showScorePop('视角抖动: ' + (SHAKE_CFG.enabled ? '开' : '关'));
syncShakeMenuUI();
}
function shakeSetMaster(mul){
SHAKE_CFG.masterMul = clamp(+mul, 0, 2);
saveShakeCfg();
syncShakeMenuUI();
}

// ---------- 类型化入口 ----------
// 调用方按场景选一个, 权重自动乘上去, 总开关/全局乘子集中控制
function shakeHit(amt, isHead){
if(!SHAKE_CFG.enabled || SHAKE_CFG.masterMul<=0) return;
const m = SHAKE_CFG.hitMul * SHAKE_CFG.masterMul * (isHead ? 1.25 : 1);
if(typeof addTrauma==='function') addTrauma(amt * m);
}
function shakeShot(amt){
if(!SHAKE_CFG.enabled || SHAKE_CFG.masterMul<=0) return;
if(typeof addTrauma==='function') addTrauma(amt * SHAKE_CFG.shotMul * SHAKE_CFG.masterMul);
}
function shakeExplosion(amt, dist){
if(!SHAKE_CFG.enabled || SHAKE_CFG.masterMul<=0) return;
const m = SHAKE_CFG.explosionMul * SHAKE_CFG.masterMul;
let v = amt * m;
if(typeof dist==='number') v *= clamp(1 - dist/40, 0.25, 1);
if(typeof addTrauma==='function') addTrauma(v);
}
// 玩家在载具里时整体衰减 (驾驶坦克/飞机/APC 时减小创伤, 避免视觉过载)
function shakeVehicle(amt){
if(!SHAKE_CFG.enabled || SHAKE_CFG.masterMul<=0) return;
if(typeof addTrauma==='function') addTrauma(amt * SHAKE_CFG.vehicleMul * SHAKE_CFG.masterMul);
}

// ---------- 快捷键 F8 ----------
(function bindShakeKey(){
if(typeof addEventListener==='undefined') return;
addEventListener('keydown', e=>{
if(e.code!=='F8' || e.repeat) return;
// 仅在游戏内 (菜单隐藏 + 已部署) 生效, 部署/菜单界面下不响应避免误触
const menu = document.getElementById('menu');
if(menu && !menu.classList.contains('hidden')) return;
if(typeof player==='undefined' || !player || !player.deployed) return;
e.preventDefault();
shakeSetEnabled(!SHAKE_CFG.enabled);
});
})();

// ---------- 菜单按钮 / 滑条 ----------
if(typeof document!=='undefined'){
if(document.getElementById('shakeBtn')){
document.getElementById('shakeBtn').onclick = ()=> shakeSetEnabled(!SHAKE_CFG.enabled);
}
if(document.getElementById('shakeRange')){
document.getElementById('shakeRange').oninput = e=> shakeSetMaster(e.target.value/100);
}
syncShakeMenuUI();
}