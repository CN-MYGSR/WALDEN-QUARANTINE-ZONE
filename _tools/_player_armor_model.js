// 玩家模型按所穿护具改颜色 + 建模 (2026-09-19)
// 需求: 玩家模型按护甲变色/加几何; 没穿护甲则用「游骑兵黄」
const fs = require('fs');
const path = require('path');
const R = f => path.resolve(__dirname, '..', f);
let ok = true;

function rep(rel, jobs, label) {
  const raw = fs.readFileSync(R(rel), 'utf8');
  const eol = raw.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  const L = (...a) => a.join(eol) + eol;
  let bad = 0;
  for (const [from] of jobs) {
    const t = typeof from === 'function' ? from(L) : from;
    if (raw.split(t).length - 1 !== 1) { console.log('  ❌ ' + rel + '  ' + t.slice(0, 56).replace(/\r?\n/g, '⏎')); bad++; }
  }
  if (bad) { console.log('❌ ' + label + ' 未命中'); ok = false; return; }
  let out = raw;
  for (const [from, to] of jobs) {
    const f = typeof from === 'function' ? from(L) : from;
    const t = typeof to === 'function' ? to(L) : to;
    out = out.split(f).join(t);
  }
  fs.writeFileSync(R(rel), out, 'utf8');
  console.log('✅ ' + label);
}

// ================= ① 37_meta.js: 给每件护甲加 color =================
rep('js/37_meta.js', [
  [(L) => L('const ARMOR_DEFS={',
    " armor1:{name:'PACA 软质护甲',level:1,hp:12,resist:0.05,weight:1.0,price:320},",
    " armor2:{name:'6B23-1 防弹背心',level:2,hp:22,resist:0.10,weight:1.8,price:720},",
    " armor3:{name:'MF-UNTAR 防弹背心',level:3,hp:34,resist:0.14,weight:2.7,price:1250},",
    " armor4:{name:'6B13 突击护甲',level:4,hp:46,resist:0.18,weight:3.6,price:2100},",
    " armor5:{name:'Hexatac HPC 插板背心',level:5,hp:60,resist:0.22,weight:5.0,price:3200},",
    " armor6:{name:'6B43 屏障-Sh 防弹衣',level:6,hp:76,resist:0.26,weight:6.5,price:4800}",
    '};'),
    (L) => L('// color 供玩家模型上色 (见 16_soldier 的 buildSoldierMesh): 护甲颜色 = 躯干颜色',
      '// level 决定加多少护甲几何 (1-2 只前板 / 3-4 加背板与肩带 / 5-6 加肩垫与裆片)',
      'const ARMOR_DEFS={',
      " armor1:{name:'PACA 软质护甲',level:1,hp:12,resist:0.05,weight:1.0,price:320,color:0x4a4a3c},",
      " armor2:{name:'6B23-1 防弹背心',level:2,hp:22,resist:0.10,weight:1.8,price:720,color:0x5a5f45},",
      " armor3:{name:'MF-UNTAR 防弹背心',level:3,hp:34,resist:0.14,weight:2.7,price:1250,color:0x46525e},",
      " armor4:{name:'6B13 突击护甲',level:4,hp:46,resist:0.18,weight:3.6,price:2100,color:0x4c4f3e},",
      " armor5:{name:'Hexatac HPC 插板背心',level:5,hp:60,resist:0.22,weight:5.0,price:3200,color:0x7a6f52},",
      " armor6:{name:'6B43 屏障-Sh 防弹衣',level:6,hp:76,resist:0.26,weight:6.5,price:4800,color:0x3e4438}",
      '};',
      '// 没穿护甲时玩家躯干用的颜色 (2026-09-19 需求: 「没有护具则为游骑兵黄」)',
      'const RANGER_YELLOW=0xc8a03c;')],
], '37_meta.js 护甲颜色');

// ================= ② 16_soldier.js: 按护甲上色 + 建模 =================
rep('js/16_soldier.js', [
  // 签名加第三个参数
  [(L) => L('function buildSoldierMesh(team,name){',
    'const U=uniformMats[team];',
    'const root=new THREE.Group();',
    'const helmParts=[];',
    'const hAdd=(mesh)=>{ helmParts.push(mesh); return mesh; };',
    'const pelvis=new THREE.Group(); pelvis.position.y=0.94; root.add(pelvis);',
    'const torsoG=new THREE.Group(); pelvis.add(torsoG);',
    'bx(U.coat,0.44,0.55,0.26, 0,0.28,0, torsoG);'),
    (L) => L('// armorKey: 可选。传了就按那件护甲给躯干上色并加护甲几何;',
      '//           不传(或传了不存在的键)则用「游骑兵黄」—— 见 37_meta 的 RANGER_YELLOW。',
      'function buildSoldierMesh(team,name,armorKey){',
      'const U=uniformMats[team];',
      'const root=new THREE.Group();',
      'const helmParts=[];',
      'const hAdd=(mesh)=>{ helmParts.push(mesh); return mesh; };',
      'const pelvis=new THREE.Group(); pelvis.position.y=0.94; root.add(pelvis);',
      'const torsoG=new THREE.Group(); pelvis.add(torsoG);',
      '// ---- 护甲配色: 躯干用护甲色; 没穿护甲 = 游骑兵黄 ----',
      'const _AD=(typeof ARMOR_DEFS!==\'undefined\')?ARMOR_DEFS:{};',
      'const _RY=(typeof RANGER_YELLOW!==\'undefined\')?RANGER_YELLOW:0xc8a03c;',
      'const _ar=(armorKey&&_AD[armorKey])?_AD[armorKey]:null;',
      'const _bodyCol=_ar?(_ar.color!=null?_ar.color:_RY):_RY;',
      'const _bodyMat=new THREE.MeshLambertMaterial({color:_bodyCol});',
      '// 护甲板比躯干略深一点, 否则同色看不出层次',
      'const _plateMat=new THREE.MeshLambertMaterial({color:new THREE.Color(_bodyCol).multiplyScalar(0.78)});',
      'bx(_bodyMat,0.44,0.55,0.26, 0,0.28,0, torsoG);',
      '// ---- 护甲几何: 按 level 递进 (士兵模型面朝局部 +Z, 所以 +Z 是正面) ----',
      'if(_ar){',
      ' const lv=_ar.level||1;',
      ' bx(_plateMat,0.30,0.30,0.05, 0,0.34,0.15, torsoG);          // 前板: 所有等级都有',
      ' if(lv>=3){',
      '  bx(_plateMat,0.28,0.28,0.05, 0,0.34,-0.15, torsoG);         // 背板',
      '  bx(_plateMat,0.07,0.05,0.30, -0.13,0.55,0, torsoG);         // 左肩带',
      '  bx(_plateMat,0.07,0.05,0.30,  0.13,0.55,0, torsoG);         // 右肩带',
      ' }',
      ' if(lv>=5){',
      '  bx(_plateMat,0.13,0.10,0.26, -0.20,0.50,0, torsoG);        // 左肩垫',
      '  bx(_plateMat,0.13,0.10,0.26,  0.20,0.50,0, torsoG);        // 右肩垫',
      '  bx(_plateMat,0.22,0.14,0.05, 0,0.06,0.14, torsoG);         // 裆片',
      ' }',
      ' if(lv>=6){',
      '  bx(_plateMat,0.05,0.26,0.22, -0.22,0.32,0, torsoG);        // 左侧板',
      '  bx(_plateMat,0.05,0.26,0.22,  0.22,0.32,0, torsoG);        // 右侧板',
      ' }',
      '}')],
  // 返回值带上护甲色, 方便外部读取
  [(L) => L('return {root,pelvis,torsoG,headG,armL,armR,legL,legR,gunG,tag,helmParts,face};'),
    (L) => L('return {root,pelvis,torsoG,headG,armL,armR,legL,legR,gunG,tag,helmParts,face,bodyMat:_bodyMat,armorKey:armorKey||\'\'};')],
], '16_soldier.js 护甲配色与建模');

// ================= ③ 25_player_update.js: 传入 armorKey 并在换甲时重建 =================
rep('js/25_player_update.js', [
  [(L) => L('function ensurePlayerBody(){',
    'if(player.mesh&&player.meshTeam===player.team) return;'),
    (L) => L('function ensurePlayerBody(){',
      '// ⚠️ 还要比对 armorKey —— 只在换阵营时重建的话, 换了护甲模型不会更新',
      "if(player.mesh&&player.meshTeam===player.team&&player.meshArmor===(player.armorKey||'')) return;")],
  ["player.mesh=buildSoldierMesh(player.team,'');",
   "player.mesh=buildSoldierMesh(player.team,'',player.armorKey);"],
  ['player.meshTeam=player.team;', "player.meshTeam=player.team;\nplayer.meshArmor=player.armorKey||'';"],
], '25_player_update.js 传入 armorKey');

console.log(ok ? '\n完成' : '\n有失败');
process.exit(ok ? 0 : 1);
