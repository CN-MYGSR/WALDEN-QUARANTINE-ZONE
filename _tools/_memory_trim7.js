// MEMORY.md 收尾压缩: 让 §0–§5 完整落进 10k
const fs = require('fs');
const P = '.workbuddy-ai/memory/MEMORY.md';
let L = fs.readFileSync(P, 'utf8').split('\n');

const pairs = [
  ['① 锚定行首（`^...`+`m`，否则 `//case \'x\':` 也算通过）② **先剥掉行注释**再断言 ③ 别用 `keysOfBlock` 读「单行多键」的表（它每行只取第一个键）。',
   '① 锚定行首（`^`+`m`，否则 `//case \'x\':` 也算通过）② **先剥行注释** ③ 别用 `keysOfBlock` 读「单行多键」表（只取第一个键）。'],
  ['→ **`initMenuUI` 中断 → 主菜单导航/地图卡片/部署按钮全失效**。一行显示文案也能拖垮整个 UI。',
   '→ **`initMenuUI` 中断 → 主菜单全失效**。一行显示文案也能拖垮整个 UI。'],
  ['/`moddedDef`(漏=没效果)/`modDisplayName`/`modTotalCost`/`addModVisuals`(漏=看不出来)/`MOD_SLOT_NAMES`/`renderWorkbenchRows`(漏=不显示)。审计第 11 组管这条。',
   '/`moddedDef`/`modDisplayName`/`modTotalCost`/`addModVisuals`/`MOD_SLOT_NAMES`/`renderWorkbenchRows`。审计第 11 组管这条。'],
  ['救起 `hp=35`+2s 无敌。**NPC 优先级 = 战斗 > 救援 > 搜索**（`tryStartRescue` 必须在 `tryStartLoot` 之前）。',
   '救起 `hp=35`。**NPC 优先级 = 战斗 > 救援 > 搜索**（`tryStartRescue` 在 `tryStartLoot` 之前）。'],
  ['- 价格：`ITEM_CATALOG` 由 `Object.keys(WPN_DEFS)` 派生。', null],
  ['- 结算唯一入口 `35_extraction.finishRaid()`；`lootValue` 必须在 `mergeRunLoot()` **之前**取。',
   '- 结算唯一入口 `finishRaid()`；`lootValue` 必须在 `mergeRunLoot()` **之前**取。'],
  ['内隔断留 1.15m 门洞并注册 `NAV_CLEARS`。整面 `solidBox` 会封成进不去的盒子。',
   '内隔断留 1.15m 门洞并注册 `NAV_CLEARS`，否则封成进不去的盒子。']
];

for (const [a, b] of pairs) {
  const k = L.findIndex(l => l.includes(a));
  if (k < 0) { console.log('⚠️ 跳过(未命中): ' + a.slice(0, 18)); continue; }
  if (b === null) { L.splice(k, 1); console.log('✅ 删除: ' + a.slice(0, 16)); }
  else { L[k] = L[k].split(a).join(b); console.log('✅ 压缩: ' + a.slice(0, 16)); }
}

const out = L.join('\n');
fs.writeFileSync(P, out, 'utf8');
const re = /^## .*$/gm; let m; const pos = [];
while ((m = re.exec(out))) pos.push(String(m.index).padStart(6) + '  ' + m[0].slice(0, 22));
console.log('\n总长 ' + out.length + ' 字符\n' + pos.join('\n'));
