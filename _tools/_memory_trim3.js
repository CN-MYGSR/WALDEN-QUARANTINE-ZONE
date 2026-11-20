// MEMORY.md 第二轮压缩: 把 §0/§2/§4/§5/§6 里偏"解释性"的文字收掉, 规则本身全保留
// 目标: 让 §0–§7 全部落进 ≈10k 的注入预算
const fs = require('fs');
const P = '.workbuddy-ai/memory/MEMORY.md';
let s = fs.readFileSync(P, 'utf8');
const E = '\n';

const pairs = [];

// ① 发版流程 4 行 → 2 行
pairs.push([
'- **发版流程**：改代码 → bump `?v=` → `cp index.html dist/ && cp js/*.js dist/js/ && cp css/*.css dist/css/` → `cmp` 校验一致 → `vibehub update`。\n' +
'  slug **`escape-from-walden`**；⚠️ **只能 `update` 不能 `deploy`**；CLI = `%LOCALAPPDATA%\\VibeHub\\bin\\vibehub-windows-x64.exe`（**用 Bash 工具调**），目录 `dist/`。\n' +
'  ⚠️ `update` **无论有没有文件变化都会新建 release**（不能"顺手跑一下"）；`--note-file`/`--description-file` **都 2000 字符上限**，超了拒发。\n' +
'  ⚠️ **`rm -rf dist` 被安全删除策略拦**（`&&` 链断但 `echo` 照打 → 假"重建成功"）→ 用原地覆盖 `cp`。当前线上版本号见 §9。',
'- **发版**：bump `?v=` → `cp index.html dist/ && cp js/*.js dist/js/ && cp css/*.css dist/css/` → **node 逐字节比对**（`cmp` 会假警报）→ `vibehub update`。\n' +
'  slug **`escape-from-walden`**；⚠️ **只能 `update` 不能 `deploy`**；CLI `%LOCALAPPDATA%\\VibeHub\\bin\\vibehub-windows-x64.exe`（用 Bash 调）；`--note-file` **2000 字符上限**；`update` 无变化也会新建 release。⚠️ `rm -rf dist` 被拦（`&&` 链断但 echo 照打 → 假成功）→ 原地覆盖。版本号见 §9。'
]);

// ② §2 重开清场 3 行 → 2 行
pairs.push([
'- ⚠️ **重开对局必须清场**（`startMatch()` 开头的 `clearRaidActors()`）：`buildSoldierMesh()` 内部会 `scene.add(root)`，所以**只清 `soldiers` 数组 = 模型留在场景里变成「站着不动、无 AI 指令」的雕像**（用户实测）。一并清 `RAG.list`（布娃娃）/`DEBRIS.list`（碎屑）/`CORPSES`（不清会在同坐标搜到「上局幽灵尸体」）。\n' +
'  ⚠️ 材质只 dispose 标了 `userData.perSoldier` 的 —— `uniformMats[team]` 是**共享材质**。⚠️ **清不掉**：`BUILDS`/`MORTARS`/`MED_CRATES` 的 mesh 直接挂 `world` 组、无句柄。',
'- ⚠️ **重开对局必须清场**（`startMatch()` 开头的 `clearRaidActors()`）：`buildSoldierMesh()` 内部会 `scene.add(root)`，**只清 `soldiers` 数组 = 模型留在场景里变成「站着不动、无 AI」的雕像**。一并清 `RAG.list`/`DEBRIS.list`/`CORPSES`（不清会搜到「上局幽灵尸体」）。材质只 dispose 标了 `userData.perSoldier` 的（`uniformMats[team]` 是共享材质）。⚠️ **清不掉**：`BUILDS`/`MORTARS`/`MED_CRATES` 的 mesh 直接挂 `world` 组、无句柄。'
]);

// ③ §4 槽位 9 处 3 行 → 1 行
pairs.push([
'  ⚠️⚠️ **槽位定义散落在 9 个地方，漏一处那一处就静默失效**：`ALL_MODS` / `MOD_AVAIL` / **`getModSlots` 的兜底字面量** /\n' +
'  `moddedDef` 的槽位循环（漏 = 有按钮但数值不生效）/ `modDisplayName` / `modTotalCost` / `addModVisuals`（漏 = 改了看不出来）/\n' +
'  `38_tarkov` 的 `MOD_SLOT_NAMES` / `renderWorkbenchRows` 的槽位循环（漏 = 工坊里根本不显示）。审计第 11 组管这条。',
'  ⚠️⚠️ **槽位定义散落在 9 处，漏一处就静默失效**：`ALL_MODS` / `MOD_AVAIL` / **`getModSlots` 兜底字面量** / `moddedDef` 循环（漏=有按钮没效果）/ `modDisplayName` / `modTotalCost` / `addModVisuals`（漏=改了看不出来）/ `MOD_SLOT_NAMES` / `renderWorkbenchRows`（漏=工坊不显示）。审计第 11 组管这条。'
]);

// ④ §4 倒地 7 行 → 4 行
pairs.push([
'- **倒地 / 救援**（`js/57_downed.js`，**尽量包装**少动内部）：非爆头致死 → 倒地 `downed=true`+`downT=60`；**爆头直接死**；\n' +
'  倒地再中弹 = 加速流血；60s 无人救 → 真死；救起 `hp=35`+2s 无敌。**NPC 优先级 = 战斗 > 救援 > 搜索**\n' +
'  （`tryStartRescue` 必须插在 `tryStartLoot` **之前**；`engaged&&distT<18` 不救）。\n' +
'  ⚠️ **倒地单位必须退出战斗**（敌人候选循环加 `||e.downed||`），否则倒地瞬间被补枪、救援没意义。\n' +
'  ⚠️ 倒地时要**卸下架着的武器**（`onMG/onMortar/onAT/onAA/onVehicle`）—— `updatePlayerMG/Mortar` 在 `updatePlayer` 内部调用，倒地后不再执行，没人复位 → 卡住。\n' +
'  ⚠️ 玩家倒地**视角仍可转**（鼠标监听只要求 `player.alive`）→ `alive` 保持 true，用 `downed` 单独标记。\n' +
'  ⚠️⚠️ **包装 `die()` 后，超时真死必须走原始函数 `obj._dieRaw`** —— 否则 `downed=false` 后再调 `die()` 会被自己的包装\n' +
'  再判一次「可倒地」→ **无限倒地、永远死不了**（探针抓到的真 bug，看代码看不出来）。行为验证：`_tools/_downed_probe.js`（21 项）。',
'- **倒地 / 救援**（`57_downed.js`，尽量包装）：非爆头致死 → `downed=true`+`downT=60`；**爆头直接死**；再中弹=加速流血；救起 `hp=35`+2s 无敌。**NPC 优先级 = 战斗 > 救援 > 搜索**（`tryStartRescue` 必须插在 `tryStartLoot` **之前**）。\n' +
'  ⚠️ 倒地单位**必须退出战斗**（敌人候选加 `||e.downed||`），否则倒地瞬间被补枪；倒地要**卸下架着的武器**（`onMG/…`）—— `updatePlayerMG/Mortar` 在 `updatePlayer` 内部调用，倒地后没人复位 → 卡住。玩家倒地 `alive` 仍为 true（视角可转），用 `downed` 标记。\n' +
'  ⚠️⚠️ **包装 `die()` 后超时真死必须走 `obj._dieRaw`** —— 否则 `downed=false` 再调 `die()` 又被判「可倒地」→ **无限倒地、永远死不了**（探针抓到的真 bug）。验证：`_tools/_downed_probe.js`。'
]);

// ⑤ §5 热成像一行收紧
pairs.push([
'- 热成像：`initThermal()` 惰性建 `position:fixed` canvas，把非友方 NPC 投影成红框。⚠️ 画布 **`z-index:9`**（低于 `#ui` 的 10，否则红框盖 HUD）；⚠️ 只建在「热成像 + 已开启」时；⚠️ 画框前先判 **`dot(敌人方向, 相机前向) > 0.5`**，否则 `project()` 对身后的点会**镜像出假框**。',
'- 热成像：`initThermal()` 惰性建 `position:fixed` canvas，把非友方 NPC 投影成红框。⚠️ **`z-index:9`**（低于 `#ui` 的 10）；只建在「热成像+已开启」时；画框前先判 **`dot(敌人方向,相机前向)>0.5`**，否则 `project()` 对身后的点会**镜像出假框**。'
]);

// ⑥ §6 三态表前后收紧
pairs.push([
'`buildSoldierMesh(team, name, armorKey, chestKey)` 后两参可选，**必须区分三态**：\n' +
'| 传入 | 含义 | 躯干颜色 |\n' +
'|---|---|---|\n' +
'| `armorKey === undefined`（没传参） | 所有 Bot（`19_bot` 的 2 处调用） | **阵营制服色**，保持原样 |\n' +
'| `\'\'` | 玩家没穿护具 | **游骑兵黄** `RANGER_YELLOW=0xc8a03c` |\n' +
'| 有效 key | 玩家穿了护具 | 见下方优先级 |\n' +
'⚠️ **不区分就会让所有 NPC 变成游骑兵黄**（差点踩到）。',
'`buildSoldierMesh(team,name,armorKey,chestKey)` 后两参可选，**必须区分三态**：`undefined`（没传参 = 所有 Bot）→ **阵营制服色**；`\'\'`（玩家没穿护具）→ **游骑兵黄** `0xc8a03c`；有效 key → 见下方优先级。⚠️ **不区分会让所有 NPC 变游骑兵黄**。'
]);

// ⑦ §6 色相那条收紧
pairs.push([
'- ⚠️⚠️ **配色不能用「看起来像」来猜，必须算色相**：`armor5` 原配 `0x7a6f52` 看着像军绿，实际色相 **43.5°** 是**黄橙** → 玩家穿它时躯干发黄，被投诉「全身黑装备模型却发黄」。判断式：**`hue 30~75° 且 max(r,g,b) >= 100` → 人眼读成「黄」**。审计第 6 组有这条色相回归。',
'- ⚠️⚠️ **配色不能靠「看起来像」猜，必须算色相**：`armor5` 的 `0x7a6f52` 看着像军绿，实际色相 **43.5°** 是黄橙 → 穿它躯干发黄（用户投诉过）。判断式：**`hue 30~75° 且 max(r,g,b)>=100` → 人眼读成「黄」**。审计第 6 组有色相回归。'
]);

let hit = 0, miss = [];
for (const [a, b] of pairs) {
  const n = s.split(a).length - 1;
  if (n !== 1) { miss.push(n + ' 次: ' + a.slice(0, 40).replace(/\n/g, '⏎')); continue; }
  s = s.split(a).join(b); hit++;
}
if (miss.length) { console.log('❌ 以下锚点未命中 (未写盘):\n  ' + miss.join('\n  ')); process.exit(1); }

fs.writeFileSync(P, s, 'utf8');
const re = /^## .*$/gm; let m; const out = [];
while ((m = re.exec(s))) out.push(String(m.index).padStart(6) + '  ' + m[0].slice(0, 30));
console.log('替换 ' + hit + '/' + pairs.length + ' 处\n总长 ' + s.length + ' 字符\n' + out.join('\n'));
