// 把「黄色强调」补回到 JS 内联色里（CSS 覆盖不到的 canvas / innerHTML 部分）。
// 规则同 _restore_amber.js: split/join + 命中数断言, 任一不符就不写盘。
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const ACC = '#ffd77a';   // 主强调
const ACC2 = '#f0c070';  // ELO 高分
const ACC3 = '#d8b878';  // 次级提示(偏暗的琥珀)

// [文件, 旧, 新, 期望命中数]
const JOBS = [
  // —— HUD: 弹药数 ——
  ['js/28_hud.js', "el('magN').style.color='#eee';", "el('magN').style.color='" + ACC + "';", 3],
  // —— HUD: 顶部目标行(攻防战 / 破袭战) ——
  ['js/28_hud.js', 'font-size:11px;color:#ffffff">攻防战', 'font-size:11px;color:' + ACC + '">攻防战', 1],
  ['js/28_hud.js', 'font-size:11px;color:#ffffff">破袭战', 'font-size:11px;color:' + ACC + '">破袭战', 1],
  // —— 罗盘上的目标刻度 ——
  ['js/28_hud.js', "cpC.fillStyle='#ffffff'; cpC.fillRect(W/2-1,2,2,6);", "cpC.fillStyle='" + ACC + "'; cpC.fillRect(W/2-1,2,2,6);", 1],
  // —— 大地图上的小队指令行 ——
  ['js/28_hud.js', "bmC.fillStyle='#ffffff'; bmC.fillText('小队 '", "bmC.fillStyle='" + ACC + "'; bmC.fillText('小队 '", 1],
  // —— 小地图 / 大地图上的「移动」指令标记(驻守仍是绿) ——
  ['js/28_hud.js', "SQUAD.mode==='guard'?'#7dd87d':'#ffffff';", "SQUAD.mode==='guard'?'#7dd87d':'" + ACC + "';", 2],
  // —— 部署界面 ELO 高分段的段位色 ——
  ['js/29_menus.js', "ELO.rating>=1330?'#f0f0f0'", "ELO.rating>=1330?'" + ACC2 + "'", 1],
  // —— 部署界面「本局装备估值」 ——
  ['js/29_menus.js', 'color:#d8d8d8;font-size:12px">本局装备估值', 'color:#d8c59a;font-size:12px">本局装备估值', 1],
  // —— 军械库: 拾荒者出击提示 ——
  ['js/37_meta.js', 'color:#d8d8d8;font-size:12px;margin-top:4px">拾荒者出击', 'color:' + ACC3 + ';font-size:12px;margin-top:4px">拾荒者出击', 1],
  // —— 部署界面: 撤离通行证「已携带」 ——
  ['js/38_tarkov.js', 'color:#d8d8d8">撤离通行证：已携带', 'color:' + ACC3 + '">撤离通行证：已携带', 1],
];

const cache = new Map();
const load = rel => { if (!cache.has(rel)) cache.set(rel, fs.readFileSync(path.join(ROOT, rel), 'utf8')); return cache.get(rel); };

let bad = 0;
for (const [rel, from, , want] of JOBS) {
  const n = load(rel).split(from).length - 1;
  if (n !== want) { console.log('❌ ' + rel + '  期望 ' + want + ' 命中 ' + n + '  ' + from.slice(0, 52)); bad++; }
  else console.log('✅ ' + rel + '  ×' + n + '  ' + from.slice(0, 52));
}
if (bad) { console.log('\n有 ' + bad + ' 处不匹配，未写入任何文件。'); process.exit(1); }

const byFile = {};
for (const [rel, from, to] of JOBS) (byFile[rel] = byFile[rel] || []).push([from, to]);
for (const rel in byFile) {
  let s = load(rel);
  for (const [from, to] of byFile[rel]) s = s.split(from).join(to);
  fs.writeFileSync(path.join(ROOT, rel), s, 'utf8');
  console.log('写入 ' + rel);
}
