// MEMORY.md 压缩: 让 §0–§5(键位/触控) 完整落进 ≈10k 注入预算
const fs = require('fs');
const P = '.workbuddy-ai/memory/MEMORY.md';
let s = fs.readFileSync(P, 'utf8');

const pairs = [
// ① 翻越条目收紧
['- **翻越**（`58_vault.js`，挂在跳跃分支上）：面朝障碍按**跳跃键** → 能翻就翻，否则照常跳（**不新增键位**，触控跳跃按钮同用）。\n' +
'  判定**只用 `BOXES`**（与 `collideMove` 同一套）—— ⚠️ **绝不能用 OCC**（2D 栅格不含高度，会把整面墙和窗台当同一回事）。\n' +
'  ⚠️ 窗户能翻是因为 `_cqbWallOpen` 把窗洞拆成「0.95 的窗台盒子 + 2.35 以上的窗楣盒子」，窗台本身就是矮墙；`maxTop:1.42`（窗台 0.95 / 沙袋 1.0 可翻，整墙 2.8 不行）。\n' +
'  ⚠️ 落脚点必须 `standHeight` 落差 ≤0.8（否则会从二楼跳下去）；`vaultT>0` 时 `updatePlayer` 直接 return，位置全由 `updateVault` 驱动。验证：`_tools/_vault_probe.js`（26 项）。',
 '- **翻越**（`58_vault.js`，挂在跳跃分支）：面朝障碍按**跳跃键** → 能翻就翻，否则照常跳（**不新增键位**，触控跳跃按钮同用）。\n' +
'  判定**只用 `BOXES`**（与 `collideMove` 同一套）—— ⚠️ **绝不能用 OCC**（2D 不含高度）。\n' +
'  ⚠️ 窗户能翻是因为 `_cqbWallOpen` 把它拆成「0.95 窗台盒 + 2.35 以上窗楣盒」，窗台本身就是矮墙；`maxTop:1.42`（整墙 2.8 不行）。\n' +
'  ⚠️ 落脚点 `standHeight` 落差须 ≤0.8（否则从二楼跳下去）；`vaultT>0` 时 `updatePlayer` 直接 return。验证：`_tools/_vault_probe.js`。'],

// ② 槽位 9 处
['  ⚠️⚠️ **槽位定义散落在 9 处，漏一处就静默失效**：`ALL_MODS` / `MOD_AVAIL` / **`getModSlots` 兜底字面量** / `moddedDef` 循环（漏=有按钮没效果）/ `modDisplayName` / `modTotalCost` / `addModVisuals`（漏=改了看不出来）/ `MOD_SLOT_NAMES` / `renderWorkbenchRows`（漏=工坊不显示）。审计第 11 组管这条。',
 '  ⚠️⚠️ **槽位定义散落 9 处，漏一处就静默失效**：`ALL_MODS`/`MOD_AVAIL`/**`getModSlots` 兜底**/`moddedDef`(漏=没效果)/`modDisplayName`/`modTotalCost`/`addModVisuals`(漏=看不出来)/`MOD_SLOT_NAMES`/`renderWorkbenchRows`(漏=不显示)。审计第 11 组管这条。'],

// ③ 倒地
['- **倒地 / 救援**（`57_downed.js`，尽量包装）：非爆头致死 → `downed=true`+`downT=60`；**爆头直接死**；再中弹=加速流血；救起 `hp=35`+2s 无敌。**NPC 优先级 = 战斗 > 救援 > 搜索**（`tryStartRescue` 必须插在 `tryStartLoot` **之前**）。',
 '- **倒地 / 救援**（`57_downed.js`，尽量包装）：非爆头致死 → `downed=true`+`downT=60`；**爆头直接死**；救起 `hp=35`+2s 无敌。**NPC 优先级 = 战斗 > 救援 > 搜索**（`tryStartRescue` 必须在 `tryStartLoot` 之前）。'],

// ④ SCAV
['- **SCAV 出击**：`SCAV_WPN_POOL`（二战池）+ `rollScavWeapon()`；`ensureScavLoadout()` 每局掷一次 → `RUN.scav`/`RUN.scavLoadout`，`raidLoadout()` 优先返回 → 不带仓库主武器/无保险/阵亡不掉仓库装备/XP 减半。**必须在 `showDeploy()` 前调用**。',
 '- **SCAV 出击**：`ensureScavLoadout()` 每局掷一次 → `RUN.scav/scavLoadout`，`raidLoadout()` 优先返回 → 不带仓库武器/无保险/阵亡不掉仓库装备/XP 减半。**必须在 `showDeploy()` 前调用**。'],

// ⑤ 建局时机
['- **建局时机推迟到「点部署」**：`armRaidStart()` 只挂标记 → 按「部署」时 `consumeRaidStart()` 才 `startMatch()`。`startMatch()` 全项目**只有一处直接调用**。⚠️ 必须用标记去重（暂停菜单 ≡ 会再次 `showDeploy()`，无标记会**重建整局**）。',
 '- **建局时机推迟到「点部署」**：`armRaidStart()` 只挂标记 → 按「部署」时 `consumeRaidStart()` 才 `startMatch()`（全项目唯一直接调用）。⚠️ 必须用标记去重（暂停菜单 ≡ 会再进 `showDeploy()`，无标记会**重建整局**）。'],

// ⑥ 剧情钩子
['  ⚠️ 钩子：`startMatch`→`storyApplyChapter`、`finishRaid`→`storyOnRaidEnd`（**在 mergeRunLoot 之前**，要读 `RUN.loot`）、每帧 wrap `updateMedCrates`、箱子 wrap `rollCrateLootList`（剧情物品保底）。',
 '  ⚠️ 钩子：`startMatch`→`storyApplyChapter`、`finishRaid`→`storyOnRaidEnd`（**在 mergeRunLoot 之前**）、每帧 wrap `updateMedCrates`、箱子 wrap `rollCrateLootList`。'],

// ⑦ 静态审计首行
['- 静态审计 `node _tools/_static_audit.js`（纯文本，13 组）。⚠️ **写检查器前先确认「被检查对象的真实形态」**，否则假警报淹掉真信号（曾报 8 处、**7 处是检查器自己的解析 bug**）。',
 '- 静态审计 `node _tools/_static_audit.js`（13 组）。⚠️ **写检查器前先确认「被检查对象的真实形态」**，否则假警报淹真信号（曾报 8 处、**7 处是检查器自己的 bug**）。']
];

let miss = [];
for (const [a, b] of pairs) {
  const n = s.split(a).length - 1;
  if (n !== 1) { miss.push(n + ' 次: ' + a.slice(0, 26).replace(/\n/g, '⏎')); continue; }
  s = s.split(a).join(b);
}
if (miss.length) { console.log('❌ 未命中(未写盘):\n  ' + miss.join('\n  ')); process.exit(1); }

fs.writeFileSync(P, s, 'utf8');
const re = /^## .*$/gm; let m; const out = [];
while ((m = re.exec(s))) out.push(String(m.index).padStart(6) + '  ' + m[0].slice(0, 24));
console.log('总长 ' + s.length + ' 字符\n' + out.join('\n'));
