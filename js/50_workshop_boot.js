// =====================================================================
// VibeHub Workshop · 启动包装
// ---------------------------------------------------------------------
// 这是项目真正启动游戏的入口:
//   1. 等待 window.VibeHubWorkshop 就绪 (Loader 同步脚本已挂上)
//   2. await VibeHubWorkshop.beforeStart (Loader 加载所有 before-start mod)
//   3. window._wfBoot() 同步启动游戏 (applyQuality / 菜单 / 军械库 / 主循环)
//   4. VibeHubWorkshop.markGameReady()
//   5. await VibeHubWorkshop.afterStart (Loader 跑 after-start mod)
//
// 因为 32_boot.js 已经把启动代码改成 window._wfBoot(), 这个文件只负责
// 按 Loader 协议安排时序即可, 不直接调用游戏内部 API。
// =====================================================================

async function __wfBoot(){
  // 已收到脚本下载错误时直接启动离线模式，仍允许已下载的 Loader 异步注册。
  const loader=document.getElementById('workshopLoader');
  for(let i = 0; i < 200; i++){
    if(window.VibeHubWorkshop||!loader||loader.dataset.failed) break;
    await new Promise(r => setTimeout(r, 10));
  }
  if(!window.VibeHubWorkshop){
    console.error('[workshop] Loader 未就绪, 直接启动游戏');
    if(typeof window._wfBoot === 'function') window._wfBoot();
    return;
  }
  const WH = window.VibeHubWorkshop;

  // 2. 等 beforeStart 阶段 (Loader 会拉取所有 before-start mod 并执行它们的注册)
  try {
    if(WH.beforeStart && typeof WH.beforeStart.then === 'function'){
      await WH.beforeStart;
    } else if(WH.beforeStart) {
      await WH.beforeStart;
    }
  } catch(err){
    console.error('[workshop] beforeStart 阶段出错, 继续启动', err);
  }

  // 3. 同步启动游戏
  if(typeof window._wfBoot === 'function'){
    try { window._wfBoot(); }
    catch(err){ console.error('[workshop] _wfBoot 启动异常', err); }
  } else {
    console.error('[workshop] window._wfBoot 未定义 (32_boot.js 未加载?)');
  }

  // 4. 通知 Loader 游戏已就绪
  if(typeof WH.markGameReady === 'function'){
    try { WH.markGameReady(); }
    catch(err){ console.error('[workshop] markGameReady 失败', err); }
  }

  // 5. 等 afterStart 阶段 (after-start mod 拿到 running event 总线)
  try {
    if(WH.afterStart && typeof WH.afterStart.then === 'function'){
      await WH.afterStart;
    } else if(WH.afterStart) {
      await WH.afterStart;
    }
  } catch(err){
    console.error('[workshop] afterStart 阶段出错', err);
  }
}

// DOMContentLoaded 之前同步脚本都已执行完 (32_boot + 49_mod_api + Loader)
__wfBoot();
