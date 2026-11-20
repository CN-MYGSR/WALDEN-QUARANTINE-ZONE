// MEMORY.md: 加「屏幕边缘反馈」条目 + 版本号/审计组数 + 压缩以守住 10k
const fs = require('fs');
const P = '.workbuddy-ai/memory/MEMORY.md';
let s = fs.readFileSync(P, 'utf8');

const pairs = [
// ① 审计组数
['（13 组）', '（14 组）'],
// ② 版本号
['- **版本号 = `20261030b`**（b=新增翻越（窗户/低矮掩体）；a=两张剧情地图标 `storyOnly`、不再进沙盒列表。\n  上一批：`20260929b`=倒地/救援 / `20260929a`=枪托握把改装 / `20260928b`=PC 触控屏虚拟按键；更早见 REF）。',
 '- **版本号 = `20261030c`**（c=屏幕边缘反馈（压抑变暗/受伤血块）；b=翻越；a=剧情地图 `storyOnly`。\n  上一批：`20260929b`=倒地/救援 / `20260929a`=枪托握把改装；更早见 REF）。'],
// ③ 翻越条目收紧
['- **翻越**（`58_vault.js`，挂在跳跃分支）：面朝障碍按**跳跃键** → 能翻就翻，否则照常跳（**不新增键位**，触控跳跃按钮同用）。\n' +
 '  判定**只用 `BOXES`**（与 `collideMove` 同一套）—— ⚠️ **绝不能用 OCC**（2D 不含高度）；`maxTop:1.42`（窗台 0.95/沙袋 1.0 可翻，整墙不行）。\n' +
 '  ⚠️ 窗户能翻是因为 `_cqbWallOpen` 把它拆成「0.95 窗台盒 + 2.35 以上窗楣盒」，`maxTop:1.42`（整墙 2.8 不行）。\n' +
 '  ⚠️ 落脚点 `standHeight` 落差须 ≤0.8（否则从二楼跳下去）；`vaultT>0` 时 `updatePlayer` 直接 return。验证：`_tools/_vault_probe.js`。',
 '- **翻越**（`58_vault.js`，挂跳跃分支）：面朝障碍按**跳跃键** → 能翻就翻，否则照常跳（**不新增键位**，触控同用）。\n' +
 '  判定**只用 `BOXES`**（与 `collideMove` 同一套）—— ⚠️ **绝不能用 OCC**（2D 不含高度）；`maxTop:1.42`（窗台 0.95/沙袋 1.0 可翻，整墙不行）。\n' +
 '  ⚠️ 落脚点 `standHeight` 落差须 ≤0.8；`vaultT>0` 时 `updatePlayer` 直接 return。验证：`_tools/_vault_probe.js`。'],
// ④ §2 清场
['一并清 `RAG.list`/`DEBRIS.list`/`CORPSES`（否则搜到上局幽灵尸体）。材质只 dispose 标了 `userData.perSoldier` 的（`uniformMats[team]` 是共享材质）。',
 '一并清 `RAG.list`/`DEBRIS.list`/`CORPSES`。材质只 dispose 标了 `userData.perSoldier` 的（`uniformMats[team]` 共享）。'],
// ⑤ §3 街区中立
['闸门全在 `19_bot.js`：`aggroOk()` + `noticeThreat()`；`damage()` → `aggroOn(attacker,30)` 同队连坐。**新增任何"锁定敌人"路径必须加 `aggroOk` 闸**。⚠️ 街区永远打不起来 —— 测 AI 战斗路径要用机场/港口/实验室。',
 '闸门全在 `19_bot.js`：`aggroOk()`+`noticeThreat()`；`damage()`→`aggroOn(attacker,30)` 连坐。**新增"锁定敌人"路径必须加 `aggroOk` 闸**。⚠️ 街区永远打不起来 —— 测 AI 要用机场/港口/实验室。'],
// ⑥ §0 剧情地图
['  ⚠️ 2 张剧情地图 **必须追加在 CAMPAIGNS 末尾**（`sf_campaign` 存索引，插中间会串图）；带 `storyOnly:true` → **沙盒地图列表不显示、部署被拦**（守卫要放 `deployBtn`，在 `consumeRaidStart` 之前 —— 否则 `deployPlayer` 照样把玩家扔进空图）。',
 '  ⚠️ 2 张剧情地图 **必须追加在 CAMPAIGNS 末尾**（`sf_campaign` 存索引）；带 `storyOnly:true` → **沙盒列表不显示、部署被拦**（守卫放 `deployBtn`，在 `consumeRaidStart` 之前 —— 否则 `deployPlayer` 照样扔进空图）。'],
// ⑦ light 槽
['`light_flash`（照亮但 `FLASH.expose=true` → bot 更早发现）', '`light_flash`（照亮但会暴露）']
];

let miss = [];
for (const [a, b] of pairs) {
  const n = s.split(a).length - 1;
  if (n !== 1) { miss.push(n + ' 次: ' + a.slice(0, 24).replace(/\n/g, '⏎')); continue; }
  s = s.split(a).join(b);
}
if (miss.length) { console.log('❌ 未命中(未写盘):\n  ' + miss.join('\n  ')); process.exit(1); }

// ⑧ 新增「屏幕边缘反馈」条目 (放在翻越后面)
const anchor = '  ⚠️ 落脚点 `standHeight` 落差须 ≤0.8；`vaultT>0` 时 `updatePlayer` 直接 return。验证：`_tools/_vault_probe.js`。';
if (s.split(anchor).length - 1 !== 1) { console.log('❌ 新增条目锚点未命中'); process.exit(1); }
s = s.split(anchor).join(anchor + '\n' +
'- **屏幕边缘反馈**（`59_screenfx.js`，包装 `fireBullet`/`player.damage`/`player.suppress`/`updateHUD`）：队友 22m 内开火 → `#supOv` 压暗（用独立 `press`，**不污染 `suppressV`**）；受伤按**血量差**加 `#bloodOv` 血块。\n' +
'  ⚠️ **`player.damage` 必须用血量差**：`57_downed` 在倒地时 early-return（不改 hp）→ 要单独补一条倒地渗血。⚠️ 血块层别加 `filter:blur()`（全屏滤镜在手机上掉帧）。验证：`_tools/_screenfx_probe.js`（30 项）。');

fs.writeFileSync(P, s, 'utf8');
const re = /^## .*$/gm; let m; const out = [];
while ((m = re.exec(s))) out.push(String(m.index).padStart(6) + '  ' + m[0].slice(0, 22));
console.log('总长 ' + s.length + ' 字符\n' + out.join('\n'));
