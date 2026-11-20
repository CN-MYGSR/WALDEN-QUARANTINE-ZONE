// 夜视仪「接线补齐」补丁
// 背景: 三型夜视仪的数据层与 34_nvg 核心已改完, 但静态核对发现
//   ① #nvgSelect 在 index.html 里根本不存在 → 37_meta 的选择器代码是死代码
//      → META.loadout.nvg 永远是 undefined → RUN.nvgKey 永远 '' → 夜视仪开不了
//   ② #chestSelect 在 index.html 里重复了两次 (重复 id)
//   ③ bagWeight() 读的是 player.nvgBrought (从未赋值) → 夜视仪重量永远不计
//   ④ RUN 初值与两处重置点没有 nvgBrought/nvgKey
//   ⑤ 热成像画布层级/生命周期/身后镜像假框
// 注意: 这些文件都是 CRLF, 所以模式串统一按文件实际行尾转换。
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const R = f => path.join(ROOT, f);

const JOBS = [
  // ---------- index.html ----------
  ['index.html', [
    // ① 去掉重复的胸挂块, 顺带插入夜视仪选择器
    ['<div class="secLabel">胸挂（仓库 · 与背包共存，但只收 2 格以内的物品）</div>\n' +
     '<select id="chestSelect" style="width:100%;padding:8px;border-radius:6px;background:#2b2b2b;color:#eaeaea;border:1px solid #666666"></select>\n' +
     '<div class="secLabel">胸挂（仓库 · 与背包共存，但只收 2 格以内的物品）</div>\n' +
     '<select id="chestSelect" style="width:100%;padding:8px;border-radius:6px;background:#2b2b2b;color:#eaeaea;border:1px solid #666666"></select>',
     '<div class="secLabel">胸挂（仓库 · 与背包共存，但只收 2 格以内的物品）</div>\n' +
     '<select id="chestSelect" style="width:100%;padding:8px;border-radius:6px;background:#2b2b2b;color:#eaeaea;border:1px solid #666666"></select>\n' +
     '<div class="secLabel">夜视仪（仓库 · 部署时选一型 · 主武器须装入「战术配件」槽）</div>\n' +
     '<select id="nvgSelect" style="width:100%;padding:8px;border-radius:6px;background:#2b2b2b;color:#eaeaea;border:1px solid #666666"></select>',
     1],
  ]],

  // ---------- 38_tarkov.js ----------
  ['js/38_tarkov.js', [
    // ③ 夜视仪重量: player.nvgBrought 从未被赋值 → 一直是 0.5 的硬编码且永不生效
    ['if(player.nvgBrought) w+=0.5;',
     "if(RUN.nvgBrought) w+=itemWeightOf(RUN.nvgKey||'nvg');",
     1],
  ]],

  // ---------- 37_meta.js ----------
  ['js/37_meta.js', [
    // ④ RUN 初值补 nvg 字段
    ['const RUN={kills:0,searches:0,loot:{},extracting:false,failComp:0,autoKit:null,lostGear:null,returnedGear:null,passBrought:false};',
     "const RUN={kills:0,searches:0,loot:{},extracting:false,failComp:0,autoKit:null,lostGear:null,returnedGear:null,passBrought:false,nvgBrought:false,nvgKey:''};",
     1],
  ]],

  // ---------- 29_menus.js ----------
  ['js/29_menus.js', [
    // ④ 两处 RUN 重置点
    ["RUN.kills=0; RUN.searches=0; RUN.loot={}; RUN.extracting=false; RUN.scav=false; RUN.scavLoadout=null; RUN.passBrought=false; RUN.timeout=false;",
     "RUN.kills=0; RUN.searches=0; RUN.loot={}; RUN.extracting=false; RUN.scav=false; RUN.scavLoadout=null; RUN.passBrought=false; RUN.nvgBrought=false; RUN.nvgKey=''; RUN.timeout=false;",
     2],
  ]],

  // ---------- 34_nvg.js ----------
  ['js/34_nvg.js', [
    ['/* ===== 34_nvg.js — 全景夜视仪 (仅战地8) =====',
     '/* ===== 34_nvg.js — 夜视仪 三型 (普通 / 全景 / 热成像) =====',
     1],
    // ⑤-1 层级: #ui(z-index:10) 是所有 HUD → 热成像框压在 HUD 下面(9), 但高于 3D 画布
    ["thCv.style.cssText='position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:16';",
     "thCv.style.cssText='position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:9';",
     1],
    // ⑤-2 记录是否画过东西 + 标记距离上限
    ['  let thCv=null, thCtx=null;',
     '  let thCv=null, thCtx=null, thDrawn=false;\n' +
     '  const THERMAL_RANGE=150;   // 超过这个距离不再标记(避免隔着半张地图点名)',
     1],
    // ⑤-3 前向向量临时量
    ['  const _tv=new THREE.Vector3();',
     '  const _tv=new THREE.Vector3();\n  const _fwdTmp=new THREE.Vector3();',
     1],
    // ⑤-4 主循环: 身后不画(否则 project() 会镜像出假框) + 距离上限 + 记录 thDrawn
    ['    for(const s of soldiers){\n' +
     '      if(!s.alive||s.team===player.team) continue;   // 只标 NPC 敌人\n' +
     '      _tv.set(s.pos.x, s.pos.y+1.05, s.pos.z).project(camera);\n' +
     '      if(_tv.z>1) continue;\n' +
     '      const sx=(_tv.x*0.5+0.5)*w, sy=(1-(_tv.y*0.5+0.5))*h;\n' +
     '      if(sx<-80||sy<-80||sx>w+80||sy>h+80) continue;\n' +
     '      const dist=Math.hypot(s.pos.x-camera.position.x,s.pos.y-camera.position.y,s.pos.z-camera.position.z);\n' +
     '      const hh=Math.max(22,Math.min(110, 1400/Math.max(dist,2)));\n' +
     '      const ww=hh*0.42;\n' +
     '      thCtx.fillRect(sx-ww*0.5, sy-hh*0.62, ww, hh);\n' +
     '      thCtx.strokeRect(sx-ww*0.5, sy-hh*0.62, ww, hh);\n' +
     '    }',
     '    const _fwd=camera.getWorldDirection(_fwdTmp);\n' +
     '    for(const s of soldiers){\n' +
     '      if(!s.alive||s.team===player.team) continue;   // 只标 NPC 敌人\n' +
     '      const vx=s.pos.x-camera.position.x, vy=s.pos.y-camera.position.y, vz=s.pos.z-camera.position.z;\n' +
     '      if(vx*_fwd.x+vy*_fwd.y+vz*_fwd.z<=0.5) continue;   // 在相机身后/贴脸 → 不画\n' +
     '      const dist=Math.hypot(vx,vy,vz);\n' +
     '      if(dist>THERMAL_RANGE) continue;\n' +
     '      _tv.set(s.pos.x, s.pos.y+1.05, s.pos.z).project(camera);\n' +
     '      if(_tv.z>1) continue;\n' +
     '      const sx=(_tv.x*0.5+0.5)*w, sy=(1-(_tv.y*0.5+0.5))*h;\n' +
     '      if(sx<-80||sy<-80||sx>w+80||sy>h+80) continue;\n' +
     '      const hh=Math.max(22,Math.min(110, 1400/Math.max(dist,2)));\n' +
     '      const ww=hh*0.42;\n' +
     '      thCtx.fillRect(sx-ww*0.5, sy-hh*0.62, ww, hh);\n' +
     '      thCtx.strokeRect(sx-ww*0.5, sy-hh*0.62, ww, hh);\n' +
     '      thDrawn=true;\n' +
     '    }',
     1],
    // ⑤-5 生命周期: 只有装热成像并开启时才建画布, 关闭时清一次
    ['    if(st.active) updateInd();\n' +
     '    initThermal();\n' +
     '    drawThermal();\n' +
     '  }',
     '    if(st.active) updateInd();\n' +
     '    // 2026-09-19: 只有「热成像 + 已开启」才建这块全屏 canvas, 其余型号不承担合成开销\n' +
     '    const _d=curDef();\n' +
     '    if(st.active&&_d&&_d.thermal){ initThermal(); drawThermal(); }\n' +
     '    else if(thCv&&thDrawn){ thCtx.clearRect(0,0,thCv.width,thCv.height); thDrawn=false; }\n' +
     '  }',
     1],
  ]],
];

let fatal = 0;
// 第一遍: 只校验命中数, 全部对了才写盘
for (const [file, jobs] of JOBS) {
  let s = fs.readFileSync(R(file), 'utf8');
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  for (const [from, , want] of jobs) {
    const F = from.split('\n').join(eol);
    const n = s.split(F).length - 1;
    const good = n === want;
    console.log((good ? '✅' : '❌') + ` ${file}  命中 ${n}/${want}  «${from.slice(0, 44).replace(/\n/g, '⏎')}»`);
    if (!good) fatal++;
  }
}
if (fatal) { console.log('\n❌ 有 ' + fatal + ' 处未命中, 未写盘'); process.exit(1); }

// 第二遍: 写盘
for (const [file, jobs] of JOBS) {
  let s = fs.readFileSync(R(file), 'utf8');
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  for (const [from, to] of jobs) {
    const F = from.split('\n').join(eol), T = to.split('\n').join(eol);
    s = s.split(F).join(T);
  }
  fs.writeFileSync(R(file), s, 'utf8');
  console.log('💾 ' + file + ' 已写盘');
}
console.log('\n✅ 全部 ' + JOBS.reduce((a, [, j]) => a + j.length, 0) + ' 处补丁已应用');
