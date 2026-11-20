// 玩家模型配色修复: 「全身黑装备, 模型却发黄」
// 诊断: 玩家是 USEC → 制服/腿本来就是纯黑 (coat 0x181818 / pants 0x101010);
//   唯一发黄的是**躯干**, 用的是护甲色 —— 而 armor5(Hexatac) 的 0x7a6f52 色相 43.5°, 是黄橙色。
// 修法:
//   ① 躯干颜色优先级改成 **胸挂 > 护甲 > 游骑兵黄** (胸挂穿在护甲外面, 观感上是最外层)
//      → 玩家穿 WARTECH MK3「黑」胸挂时躯干直接变黑
//   ② 六件护甲配色整体压暗成战术色, Hexatac HPC 改**黑**
// 三种情况铁律不变: armorKey===undefined → Bot → 阵营制服色。
const fs = require('fs');
const path = require('path');
const R = f => path.join(path.resolve(__dirname, '..'), f);

// 整行替换: [file, 该行包含的锚点, 新行内容(不含换行)]
const LINE_JOBS = [
  // ① 护甲配色整体压暗; Hexatac 改黑
  ['js/37_meta.js', 'armor1:{name:',
    " armor1:{name:'PACA 软质护甲',level:1,hp:12,resist:0.05,weight:1.0,price:320,color:0x33362c},"],
  ['js/37_meta.js', 'armor2:{name:',
    " armor2:{name:'6B23-1 防弹背心',level:2,hp:22,resist:0.10,weight:1.8,price:720,color:0x3a382c},"],
  ['js/37_meta.js', 'armor3:{name:',
    " armor3:{name:'MF-UNTAR 防弹背心',level:3,hp:34,resist:0.14,weight:2.7,price:1250,color:0x333c47},"],
  ['js/37_meta.js', 'armor4:{name:',
    " armor4:{name:'6B13 突击护甲',level:4,hp:46,resist:0.18,weight:3.6,price:2100,color:0x3c4232},"],
  ['js/37_meta.js', 'armor5:{name:',
    " armor5:{name:'Hexatac HPC 插板背心',level:5,hp:60,resist:0.22,weight:5.0,price:3200,color:0x1f1f1f},"],
  ['js/37_meta.js', 'armor6:{name:',
    " armor6:{name:'6B43 屏障-Sh 防弹衣',level:6,hp:76,resist:0.26,weight:6.5,price:4800,color:0x2a2f28}"],
  // ② 胸挂补 hex (模型配色用; color 那个字段是中文色名, 只用于物品名)
  ['js/38_tarkov.js', 'chest56:{name:',
    'chest56:{name:"56式胸挂",color:"",hex:0x6b6a4a,size:3,weight:0.8,price:900,tier:1,slots:10,desc:"容量 10 格 · 仅收 ≤2 格物品"},'],
  ['js/38_tarkov.js', 'chestBH:{name:',
    'chestBH:{name:"Blackhawk! Commando 胸挂",color:"游骑兵黄",hex:0xc8a03c,size:3,weight:1.1,price:2200,tier:2,slots:16,desc:"容量 16 格 · 仅收 ≤2 格物品"},'],
  ['js/38_tarkov.js', 'chestMK3:{name:',
    'chestMK3:{name:"WARTECH MK3 TV-104 胸挂",color:"黑",hex:0x1c1c1c,size:4,weight:1.6,price:4200,tier:4,slots:25,desc:"容量 25 格 · 仅收 ≤2 格物品"}'],
];

// 子串替换: [file, from, to]
const SUBS = [
  // ③ buildSoldierMesh 加第 4 参 chestKey
  ['js/16_soldier.js',
    '// armorKey: 可选, 见下方「护甲配色」的三种情况说明。\nfunction buildSoldierMesh(team,name,armorKey){',
    '// armorKey / chestKey: 可选, 只有玩家侧调用才传 (见下方「护具配色」的三种情况说明)。\n' +
    'function buildSoldierMesh(team,name,armorKey,chestKey){'],
  ['js/16_soldier.js',
    '// ---- 护甲配色 ----\n' +
    '// ⚠️ 必须区分三种情况, 否则 NPC 会全变成游骑兵黄:\n' +
    '//   armorKey === undefined → **没传参**(所有 Bot) → 用阵营制服色, 保持原样\n' +
    "//   armorKey === ''        → **明确没穿护甲**(玩家) → 游骑兵黄\n" +
    '//   armorKey 有效          → 用那件护甲的颜色\n' +
    "const _AD=(typeof ARMOR_DEFS!=='undefined')?ARMOR_DEFS:{};\n" +
    "const _RY=(typeof RANGER_YELLOW!=='undefined')?RANGER_YELLOW:0xc8a03c;\n" +
    'const _ar=(armorKey&&_AD[armorKey])?_AD[armorKey]:null;\n' +
    'const _bodyCol=(armorKey===undefined)?U.coat.color:(_ar?(_ar.color!=null?_ar.color:_RY):_RY);',
    '// ---- 护具配色 ----\n' +
    '// ⚠️ 必须区分三种情况, 否则 NPC 会全变成游骑兵黄:\n' +
    '//   armorKey === undefined → **没传参**(所有 Bot) → 用阵营制服色, 保持原样\n' +
    "//   armorKey === ''        → **明确没穿护具**(玩家) → 游骑兵黄\n" +
    '//   armorKey 有效          → 用那件护甲的颜色\n' +
    '// 躯干颜色优先级: **胸挂 > 护甲 > 游骑兵黄**\n' +
    '//   (胸挂穿在护甲外面, 观感上是最外层 —— 穿黑胸挂时躯干就该是黑的)\n' +
    "const _AD=(typeof ARMOR_DEFS!=='undefined')?ARMOR_DEFS:{};\n" +
    "const _CD=(typeof CHEST_DEFS!=='undefined')?CHEST_DEFS:{};\n" +
    "const _RY=(typeof RANGER_YELLOW!=='undefined')?RANGER_YELLOW:0xc8a03c;\n" +
    'const _ar=(armorKey&&_AD[armorKey])?_AD[armorKey]:null;\n' +
    'const _cr=(chestKey&&_CD[chestKey])?_CD[chestKey]:null;\n' +
    'const _bodyCol=(armorKey===undefined)?U.coat.color\n' +
    '  :(_cr?(_cr.hex!=null?_cr.hex:_RY):(_ar?(_ar.color!=null?_ar.color:_RY):_RY));'],
  // ④ ensurePlayerBody 传胸挂并纳入重建判据
  ['js/25_player_update.js',
    'function ensurePlayerBody(){\n' +
    '// ⚠️ 还要比对 armorKey —— 只在换阵营时重建的话, 换了护甲模型不会更新\n' +
    "if(player.mesh&&player.meshTeam===player.team&&player.meshArmor===(player.armorKey||'')) return;",
    'function ensurePlayerBody(){\n' +
    "// 本局实际穿着的胸挂 (穿在护甲外面, 决定躯干颜色) —— raidLoadout() 会处理 SCAV 的随机配装\n" +
    "let _chestK='';\n" +
    'try{\n' +
    "const _L=(typeof raidLoadout==='function')?raidLoadout():null;\n" +
    "const _ck=(_L&&_L.chest)||'';\n" +
    "if(_ck&&typeof CHEST_DEFS!=='undefined'&&CHEST_DEFS[_ck]) _chestK=_ck;\n" +
    '}catch(e){}\n' +
    '// ⚠️ 还要比对 armorKey 与胸挂 —— 只在换阵营时重建的话, 换了护甲/胸挂模型不会更新\n' +
    "if(player.mesh&&player.meshTeam===player.team&&player.meshArmor===(player.armorKey||'')&&player.meshChest===_chestK) return;"],
  ['js/25_player_update.js',
    "player.mesh=buildSoldierMesh(player.team,'',player.armorKey);\n" +
    'player.meshTeam=player.team;\n' +
    "player.meshArmor=player.armorKey||'';",
    "player.mesh=buildSoldierMesh(player.team,'',player.armorKey,_chestK);\n" +
    'player.meshTeam=player.team;\n' +
    "player.meshArmor=player.armorKey||'';\n" +
    'player.meshChest=_chestK;'],
];

let fatal = 0;
const cache = {};
const files = new Set(LINE_JOBS.map(j => j[0]).concat(SUBS.map(j => j[0])));
for (const f of files) cache[f] = fs.readFileSync(R(f), 'utf8');

for (const [file, anchor] of LINE_JOBS) {
  const n = cache[file].split(/\r?\n/).filter(l => l.includes(anchor)).length;
  console.log((n === 1 ? '✅' : '❌') + ` 整行 ${file}  命中 ${n}/1  «${anchor}»`);
  if (n !== 1) fatal++;
}
for (const [file, from] of SUBS) {
  const eol = cache[file].includes('\r\n') ? '\r\n' : '\n';
  const n = cache[file].split(from.split('\n').join(eol)).length - 1;
  console.log((n === 1 ? '✅' : '❌') + ` 子串 ${file}  命中 ${n}/1  «${from.slice(0, 44).replace(/\n/g, '⏎')}»`);
  if (n !== 1) fatal++;
}
if (fatal) { console.log('\n❌ 有 ' + fatal + ' 处未命中, 未写盘'); process.exit(1); }

for (const [file, anchor, rep] of LINE_JOBS) {
  let s = fs.readFileSync(R(file), 'utf8');
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  s = s.split(/\r?\n/).map(l => l.includes(anchor) ? rep : l).join(eol);
  fs.writeFileSync(R(file), s, 'utf8');
}
for (const [file, from, to] of SUBS) {
  let s = fs.readFileSync(R(file), 'utf8');
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  s = s.split(from.split('\n').join(eol)).join(to.split('\n').join(eol));
  fs.writeFileSync(R(file), s, 'utf8');
}
console.log('\n💾 已写盘: ' + [...files].join(', '));
console.log('✅ 共 ' + (LINE_JOBS.length + SUBS.length) + ' 处已应用');
