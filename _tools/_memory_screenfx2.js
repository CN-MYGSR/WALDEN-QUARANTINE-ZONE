// MEMORY.md: 加「屏幕边缘反馈」+ 版本号 + 压缩（按行定位，避免长串锚点）
const fs = require('fs');
const P = '.workbuddy-ai/memory/MEMORY.md';
let L = fs.readFileSync(P, 'utf8').split('\n');

function findIdx(pred, tag){
  const i = L.findIndex(pred);
  if (i < 0) { console.log('❌ 找不到: ' + tag); process.exit(1); }
  return i;
}

// ① 审计组数
let i = findIdx(l => l.startsWith('- 静态审计 `node _tools/_static_audit.js`'), '审计行');
L[i] = L[i].replace('（13 组）', '（14 组）');
console.log('✅ 审计组数 → 14');

// ② 版本号（两行）
i = findIdx(l => l.startsWith('- **版本号 = `'), '版本号');
L[i] = '- **版本号 = `20261030c`**（c=屏幕边缘反馈（压抑变暗/受伤血块）；b=翻越；a=剧情地图 `storyOnly`。';
L[i + 1] = '  上一批：`20260929b`=倒地/救援 / `20260929a`=枪托握把改装；更早见 REF）。';
console.log('✅ 版本号 → 20261030c');

// ③ 翻越块（4 行 → 3 行）
i = findIdx(l => l.startsWith('- **翻越**（`58_vault.js`'), '翻越块');
L.splice(i, 4,
  '- **翻越**（`58_vault.js`，挂在跳跃分支）：面朝障碍按**跳跃键** → 能翻就翻，否则照常跳（**不新增键位**，触控同用）。',
  '  判定**只用 `BOXES`**（与 `collideMove` 同一套）—— ⚠️ **绝不能用 OCC**（2D 不含高度）；`maxTop:1.42`（窗台 0.95/沙袋 1.0 可翻，整墙不行）。',
  '  ⚠️ 落脚点 `standHeight` 落差须 ≤0.8；`vaultT>0` 时 `updatePlayer` 直接 return。验证：`_tools/_vault_probe.js`。'
);
console.log('✅ 翻越块 4 行 → 3 行');

// ④ 单行压缩
const oneLiners = [
  ['一并清 `RAG.list`/`DEBRIS.list`/`CORPSES`（否则搜到上局幽灵尸体）。材质只 dispose 标了 `userData.perSoldier` 的（`uniformMats[team]` 是共享材质）。',
   '一并清 `RAG.list`/`DEBRIS.list`/`CORPSES`。材质只 dispose 标了 `userData.perSoldier` 的（`uniformMats[team]` 共享）。'],
  ['闸门全在 `19_bot.js`：`aggroOk()` + `noticeThreat()`；`damage()` → `aggroOn(attacker,30)` 同队连坐。**新增任何"锁定敌人"路径必须加 `aggroOk` 闸**。⚠️ 街区永远打不起来 —— 测 AI 战斗路径要用机场/港口/实验室。',
   '闸门全在 `19_bot.js`：`aggroOk()`+`noticeThreat()`；`damage()`→`aggroOn(attacker,30)` 连坐。**新增"锁定敌人"路径必须加 `aggroOk` 闸**。⚠️ 街区永远打不起来 —— 测 AI 要用机场/港口/实验室。'],
  ['  ⚠️ 2 张剧情地图 **必须追加在 CAMPAIGNS 末尾**（`sf_campaign` 存索引，插中间会串图）；带 `storyOnly:true` → **沙盒地图列表不显示、部署被拦**（守卫要放 `deployBtn`，在 `consumeRaidStart` 之前 —— 否则 `deployPlayer` 照样把玩家扔进空图）。',
   '  ⚠️ 2 张剧情地图 **必须追加在 CAMPAIGNS 末尾**（`sf_campaign` 存索引）；带 `storyOnly:true` → **沙盒列表不显示、部署被拦**（守卫放 `deployBtn`，在 `consumeRaidStart` 之前 —— 否则 `deployPlayer` 照样扔进空图）。'],
  ['`light_flash`（照亮但 `FLASH.expose=true` → bot 更早发现）', '`light_flash`（照亮但会暴露）']
];
for (const [a, b] of oneLiners) {
  const k = L.findIndex(l => l.includes(a));
  if (k < 0) { console.log('⚠️ 跳过(未命中): ' + a.slice(0, 20)); continue; }
  L[k] = L[k].split(a).join(b);
  console.log('✅ 压缩: ' + a.slice(0, 16));
}

// ⑤ 新增「屏幕边缘反馈」条目（插在翻越块之后）
i = findIdx(l => l.includes('`vaultT>0` 时 `updatePlayer` 直接 return'), '翻越尾行');
L.splice(i + 1, 0,
  '- **屏幕边缘反馈**（`59_screenfx.js`，包装 `fireBullet`/`player.damage`/`player.suppress`/`updateHUD`）：队友 22m 内开火 → `#supOv` 压暗（用独立 `press`，**不污染 `suppressV`**）；受伤按**血量差**加 `#bloodOv` 血块。',
  '  ⚠️ **`player.damage` 必须用血量差**：`57_downed` 倒地时 early-return（不改 hp）→ 要单独补一条倒地渗血。⚠️ 血块层别加 `filter:blur()`（全屏滤镜手机上掉帧）。验证：`_tools/_screenfx_probe.js`（30 项）。'
);
console.log('✅ 新增屏幕边缘反馈条目');

const out = L.join('\n');
fs.writeFileSync(P, out, 'utf8');
const re = /^## .*$/gm; let m; const pos = [];
while ((m = re.exec(out))) pos.push(String(m.index).padStart(6) + '  ' + m[0].slice(0, 22));
console.log('\n总长 ' + out.length + ' 字符\n' + pos.join('\n'));
