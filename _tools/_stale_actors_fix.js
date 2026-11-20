// 修: 重开对局后上一局 NPC 留在场景里变成「无指令输入输出」的雕像
//
// 根因: `buildSoldierMesh()` 结尾会 `scene.add(root)` (16_soldier.js:253),
//   而 `startMatch()` 只做了 `soldiers.length=0; combatants.length=0;`
//   —— **数组清了, 模型还在场景里**。它们不再被 AI 更新 → 站着不动。
//   重开路径 `43_maps.beginRaid()` → armRaidStart() → 部署 → startMatch(), **不重载页面**, 所以会残留。
//
// 顺带同类残留(同一函数里一起清):
//   · RAG.list   布娃娃尸体       · DEBRIS.list 建筑碎屑
//   · CORPSES     尸体搜刮记录 —— 不清的话重开一局能在同样坐标搜到"上局的幽灵尸体"
// 顺带: `43_maps.beginRaid()` 的 RUN 重置缺了 scav/scavLoadout/passBrought/nvgBrought/nvgKey/timeout,
//   与 `29_menus` 的 startBtn 重置点不一致 → 补齐。
// 顺带: 给 _bodyMat/_plateMat 标 userData.perSoldier, 清场时才会被 dispose (共享材质不标)。
const fs = require('fs');
const path = require('path');
const R = f => path.join(path.resolve(__dirname, '..'), f);

const JOBS = [
  // ---------- 29_menus.js: 新增 clearRaidActors + 在 startMatch 里调用 ----------
  ['js/29_menus.js',
    'function startMatch(){\n' +
    'if(soldiers.length||combatants.length){ soldiers.length=0; combatants.length=0; combatants.push(player); }',
    '// 清掉上一局残留的场上对象。\n' +
    '// ⚠️ 只清 soldiers/combatants 数组是**不够的** —— buildSoldierMesh() 内部会 `scene.add(root)`,\n' +
    '//    数组清空后模型仍留在场景里, 变成「站着不动、收不到任何 AI 指令」的雕像。\n' +
    '//    (2026-09-19 用户反馈: 重开对局后部分 NPC 无指令输入输出)\n' +
    '// 注: 玩家工事(BUILDS)/迫击炮/物资箱的 mesh 直接挂在 world 上、没有单独句柄, 这里清不掉。\n' +
    'function clearRaidActors(){\n' +
    ' for(const s of soldiers){\n' +
    '  if(!s||!s.mesh||!s.mesh.root) continue;\n' +
    '  try{\n' +
    '   const root=s.mesh.root;\n' +
    '   // 名牌: 每人一张独立 canvas 贴图 → 必须释放\n' +
    '   if(s.mesh.tag){\n' +
    '    if(s.mesh.tag.material&&s.mesh.tag.material.map) s.mesh.tag.material.map.dispose();\n' +
    '    if(s.mesh.tag.material) s.mesh.tag.material.dispose();\n' +
    '   }\n' +
    '   // 几何都是 bx() 现建的(每人一套) → 释放; 材质只释放标了 perSoldier 的\n' +
    '   // ⚠️ uniformMats[team] 是共享材质, 绝不能 dispose\n' +
    '   root.traverse(o=>{\n' +
    '    if(!o.isMesh) return;\n' +
    '    if(o.geometry) o.geometry.dispose();\n' +
    '    const mt=o.material;\n' +
    '    if(mt&&mt.userData&&mt.userData.perSoldier){ if(mt.map) mt.map.dispose(); mt.dispose(); }\n' +
    '   });\n' +
    '   scene.remove(root);\n' +
    '  }catch(e){}\n' +
    '  s.mesh=null;\n' +
    ' }\n' +
    ' soldiers.length=0;\n' +
    ' if(typeof RAG!==\'undefined\'&&RAG.list) while(RAG.list.length) removeRagdoll(RAG.list[0]);\n' +
    ' if(typeof DEBRIS!==\'undefined\'&&DEBRIS.list) while(DEBRIS.list.length) removeDebrisEntry(DEBRIS.list.shift());\n' +
    ' if(typeof CORPSES!==\'undefined\'&&CORPSES.length) CORPSES.length=0;\n' +
    '}\n' +
    'function startMatch(){\n' +
    'clearRaidActors();\n' +
    'combatants.length=0; combatants.push(player);'],
  // ---------- 43_maps.js: 补齐 RUN 重置字段 ----------
  ['js/43_maps.js',
    '  RUN.kills=0; RUN.searches=0; RUN.loot={}; RUN.extracting=false;',
    '  // ⚠️ 必须和 29_menus 的 startBtn 重置点**保持一致** —— 少字段会让上一局的状态漏进下一局\n' +
    "  RUN.kills=0; RUN.searches=0; RUN.loot={}; RUN.extracting=false; RUN.scav=false; RUN.scavLoadout=null; RUN.passBrought=false; RUN.nvgBrought=false; RUN.nvgKey=''; RUN.timeout=false;"],
  // ---------- 16_soldier.js: 标记每士兵独有材质 ----------
  ['js/16_soldier.js',
    'const _bodyMat=new THREE.MeshLambertMaterial({color:_bodyCol});\n' +
    '// 护甲板颜色跟**护甲**走, 不跟躯干色 —— 穿胸挂时躯干是胸挂色, 甲板仍要能看出是护甲\n' +
    'const _plateCol=(_ar&&_ar.color!=null)?_ar.color:_bodyCol;\n' +
    'const _plateMat=new THREE.MeshLambertMaterial({color:new THREE.Color(_plateCol).multiplyScalar(0.78)});',
    '// 这两个材质是**每个士兵独有**的 → 标 userData.perSoldier, 清场/布娃娃回收时才会被 dispose\n' +
    '// ⚠️ uniformMats[team] 是共享材质, 绝不能标\n' +
    'const _bodyMat=new THREE.MeshLambertMaterial({color:_bodyCol}); _bodyMat.userData.perSoldier=true;\n' +
    '// 护甲板颜色跟**护甲**走, 不跟躯干色 —— 穿胸挂时躯干是胸挂色, 甲板仍要能看出是护甲\n' +
    'const _plateCol=(_ar&&_ar.color!=null)?_ar.color:_bodyCol;\n' +
    'const _plateMat=new THREE.MeshLambertMaterial({color:new THREE.Color(_plateCol).multiplyScalar(0.78)}); _plateMat.userData.perSoldier=true;'],
];

let fatal = 0;
const cache = {};
for (const [f] of JOBS) if (!cache[f]) cache[f] = fs.readFileSync(R(f), 'utf8');
for (const [file, from] of JOBS) {
  const eol = cache[file].includes('\r\n') ? '\r\n' : '\n';
  const n = cache[file].split(from.split('\n').join(eol)).length - 1;
  console.log((n === 1 ? '✅' : '❌') + ` ${file}  命中 ${n}/1  «${from.slice(0, 44).replace(/\n/g, '⏎')}»`);
  if (n !== 1) fatal++;
}
if (fatal) { console.log('\n❌ 有 ' + fatal + ' 处未命中, 未写盘'); process.exit(1); }
for (const [file, from, to] of JOBS) {
  let s = fs.readFileSync(R(file), 'utf8');
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  s = s.split(from.split('\n').join(eol)).join(to.split('\n').join(eol));
  fs.writeFileSync(R(file), s, 'utf8');
}
console.log('\n💾 已写盘: ' + [...new Set(JOBS.map(j => j[0]))].join(', '));
console.log('✅ 共 ' + JOBS.length + ' 处已应用');
