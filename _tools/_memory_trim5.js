// 第三轮压缩: 再省 ~350 字符, 让 §5(键位/触控) 完整落在 ≈10k 注入预算内
const fs = require('fs');
const P = '.workbuddy-ai/memory/MEMORY.md';
let s = fs.readFileSync(P, 'utf8');

const pairs = [];

// ① §1 的 MOBILE/TOUCHUI 块 5 行 → 3 行
pairs.push([
'8. **`MOBILE`（01_data）是 const**，加载时算出 → 运行时改不了，测试必须用 CDP 设备仿真。\n' +
'   ⚠️ **`MOBILE` 只管「手机/平板」**（判定要求 `pointer:coarse`）—— **带触控屏的 PC 主指针常被报成 fine → MOBILE=false**。\n' +
'   **虚拟按键是否显示看 `TOUCHUI`**（`= MOBILE || (有触摸屏 && 检测不到键盘)`，可用 `sf_touch` 手动强制、`sf_kb` 记键盘）。\n' +
'   加「触控 UI」判定一律用 `TOUCHUI`；**指针锁定等键鼠特性也用 `TOUCHUI`**（触屏独用设备不该锁指针）。\n' +
'   ⚠️ **替换一个标志前必须 grep 全部消费点并逐个分类**（触控 UI / 键鼠特性 / 移动端布局），漏一处那一处就失效。',
'8. **`MOBILE`/`TOUCHUI`（01_data）是 const**，加载时算出 → 运行时改不了，测试用 CDP 仿真。**`MOBILE`=手机/平板**（要 `pointer:coarse`；**触控屏 PC 常被报成 fine → false**）；**虚拟按键看 `TOUCHUI`**（`MOBILE || (有触摸屏 && 检测不到键盘)`，`sf_touch` 强制 / `sf_kb` 记键盘）。\n' +
'   触控 UI 与**键鼠特性（指针锁定）一律用 `TOUCHUI`**。⚠️ **替换标志前必须 grep 全部消费点并逐个分类**（触控 UI / 键鼠 / 移动端布局），漏一处那一处就失效。'
]);

// ② §4 倒地 3 行 → 3 行(更紧)
pairs.push([
'  ⚠️ 倒地单位**必须退出战斗**（敌人候选加 `||e.downed||`），否则倒地瞬间被补枪；倒地要**卸下架着的武器**（`onMG/…`）—— `updatePlayerMG/Mortar` 在 `updatePlayer` 内部调用，倒地后没人复位 → 卡住。玩家倒地 `alive` 仍为 true（视角可转），用 `downed` 标记。\n' +
'  ⚠️⚠️ **包装 `die()` 后超时真死必须走 `obj._dieRaw`** —— 否则 `downed=false` 再调 `die()` 又被判「可倒地」→ **无限倒地、永远死不了**（探针抓到的真 bug）。验证：`_tools/_downed_probe.js`。',
'  ⚠️ 倒地单位**必须退出战斗**（敌人候选加 `||e.downed||`）；倒地要**卸下架着的武器**（`onMG/…`，`updatePlayerMG/Mortar` 在 `updatePlayer` 内调用，倒地后没人复位 → 卡住）。玩家倒地 `alive` 仍 true（视角可转），用 `downed` 标记。\n' +
'  ⚠️⚠️ **包装 `die()` 后超时真死必须走 `obj._dieRaw`** —— 否则再调 `die()` 又被判「可倒地」→ **无限倒地**（探针抓到的真 bug）。验证：`_tools/_downed_probe.js`。'
]);

// ③ §3 阵营链收紧
pairs.push([
'- 链：`PLAYABLE_FACTIONS=[\'usec\',\'pmc\']` → `FACTION_PICK` → `_foeKey` → `TEAM_FACTION`。**敌方按地图**：街区 `[\'usec\',\'ger\']`（德军，**全武器随机**）；实验室/港口/机场 `[\'usec\',\'pmc\']`（PMC 精锐）。`isUniformEnemy=(t!==player.team)&&(_foeShort===\'PMC\'||_foeShort===\'USEC\')` —— 两种都要覆盖。',
'- 链：`PLAYABLE_FACTIONS=[\'usec\',\'pmc\']` → `FACTION_PICK` → `_foeKey` → `TEAM_FACTION`。**敌方按地图**：街区 `[\'usec\',\'ger\']`（德军，全武器随机）；其余 `[\'usec\',\'pmc\']`（PMC 精锐）。`isUniformEnemy` 要同时覆盖 `PMC`/`USEC`。'
]);

// ④ §2 无回血那条收紧
pairs.push([
'- ⚠️ **没有任何被动回血（用户要求删除，别加回来）**，唯一途径是**消耗物品**。保持不动的"非玩家回血"：医疗箱交互、bot 拾药、无人坦克自检修。\n' +
'  ⚠️ **验证这类"移除"必须证明那个函数仍在跑**：`_tools/_noheal_probe.js` 压血后同时读 `hydration`/`satiety`（与回血块同函数）。',
'- ⚠️ **没有任何被动回血（用户要求删除，别加回来）**，唯一途径是**消耗物品**。非玩家回血仍在：医疗箱交互、bot 拾药、无人坦克自检修。⚠️ 验证这类"移除"要证明函数仍在跑：`_tools/_noheal_probe.js`（读 `hydration`/`satiety`，与回血块同函数）。'
]);

let miss = [];
for (const [a, b] of pairs) {
  const n = s.split(a).length - 1;
  if (n !== 1) { miss.push(n + ' 次: ' + a.slice(0, 30).replace(/\n/g, '⏎')); continue; }
  s = s.split(a).join(b);
}
if (miss.length) { console.log('❌ 未命中(未写盘):\n  ' + miss.join('\n  ')); process.exit(1); }

fs.writeFileSync(P, s, 'utf8');
const re = /^## .*$/gm; let m; const out = [];
while ((m = re.exec(s))) out.push(String(m.index).padStart(6) + '  ' + m[0].slice(0, 30));
console.log('总长 ' + s.length + ' 字符\n' + out.join('\n'));
