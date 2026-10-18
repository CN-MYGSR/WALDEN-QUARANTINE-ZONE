'use strict';
// 启动入口 (VibeHub Workshop 接出版)
// ---------------------------------------------------------------------
// 原本直接调用 applyQuality()/initMenuUI()/initArmoryUI()/loop()。
// 接入工坊后, 把启动函数挂到 window._wfBoot, 由 js/50_workshop_boot.js
// 在 "Loader 完成 beforeStart 阶段" 之后才调用它, 让 Mod 能在游戏启动前
// 注册武器/地图/玩家模型修改/伤害钩子, 启动后再注册事件钩子。
// ---------------------------------------------------------------------
window._wfBoot = function(){
  try { applyQuality(); }   catch(e){ console.error('[boot] applyQuality', e); }
  try { initMenuUI(); }     catch(e){ console.error('[boot] initMenuUI', e); }
  try { initArmoryUI(); }   catch(e){ console.error('[boot] initArmoryUI', e); }
  try { loop(); }           catch(e){ console.error('[boot] loop', e); }
};
