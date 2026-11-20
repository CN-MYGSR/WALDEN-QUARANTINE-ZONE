// MEMORY.md: 版本 / 审计组数 / 靶场条目 + 压缩
const fs = require('fs');
const P = '.workbuddy-ai/memory/MEMORY.md';
let L = fs.readFileSync(P, 'utf8').split('\n');

function sub(a, b, tag){
  const k = L.findIndex(l => l.includes(a));
  if (k < 0) { console.log('⚠️ 未命中: ' + tag); return false; }
  L[k] = L[k].split(a).join(b);
  console.log('✅ ' + tag);
  return true;
}

// ① 审计组数 / 版本
sub('（15 组）', '（16 组）', '审计组数');
{
  const k = L.findIndex(l => l.startsWith('- **版本号 = `'));
  if (k < 0) { console.log('❌ 版本号'); process.exit(1); }
  L[k] = '- **版本号 = `20261030e`**（e=室内靶场（免费武器/无限弹药/2~30m 靶）；d=二楼翻出+坠落伤害；c=屏幕边缘反馈；b=翻越。';
  L[k + 1] = '  上一批：`20260929b`=倒地/救援 / `20260929a`=枪托握把改装；更早见 REF）。';
  console.log('✅ 版本号 → 20261030e');
}

// ② 压缩
const subs = [
  ['每帧 wrap `updateMedCrates`、箱子 wrap `rollCrateLootList`。', '每帧 `updateMedCrates`、箱子 `rollCrateLootList`。'],
  ['；`storyOnly:true` → **沙盒列表不显示、部署被拦**（守卫放 `deployBtn`，在 `consumeRaidStart` 之前 —— 否则 `deployPlayer` 照样扔进空图）。',
   '；`storyOnly`/`rangeOnly` → **沙盒列表不显示、部署被拦**（守卫放 `deployBtn`，在 `consumeRaidStart` 之前）。'],
  ['**虚拟按键看 `TOUCHUI`**（`MOBILE || (有触摸屏 && 无键盘)`，`sf_touch`/`sf_kb` 可覆盖）。',
   '**虚拟按键看 `TOUCHUI`**（`MOBILE || (有触摸屏 && 无键盘)`）。'],
  ['一并清 `RAG.list`/`DEBRIS.list`/`CORPSES`；材质只 dispose 标了 `perSoldier` 的（`uniformMats[team]` 共享）。',
   '一并清 `RAG.list`/`DEBRIS.list`/`CORPSES`；材质只 dispose 标了 `perSoldier` 的。'],
  ['非玩家回血仍在：医疗箱、bot 拾药、坦克自检。验证：`_tools/_noheal_probe.js`。',
   '非玩家回血仍在：医疗箱、bot 拾药、坦克自检。'],
  ['闸门全在 `19_bot.js`：`aggroOk()`+`noticeThreat()`；`damage()`→`aggroOn(attacker,30)` 连坐。',
   '闸门全在 `19_bot.js`：`aggroOk()`+`noticeThreat()`。'],
  ['`MOD_SLOT_NAMES`/`renderWorkbenchRows`）。审计第 11 组管这条。', '`MOD_SLOT_NAMES`/`renderWorkbenchRows`）。'],
  ['救起 `hp=35`。**NPC 优先级 = 战斗 > 救援 > 搜索**（`tryStartRescue` 在 `tryStartLoot` 之前）。',
   '救起 `hp=35`。**NPC 优先级 = 战斗 > 救援 > 搜索**。'],
  ['判定**只用 `BOXES`**（与 `collideMove` 同一套）—— ⚠️ **绝不能用 OCC**（2D 不含高度）；`maxTop:1.42`（窗台/沙袋可翻，整墙不行）。',
   '判定**只用 `BOXES`**（与 `collideMove` 同一套）—— ⚠️ **绝不能用 OCC**（2D 不含高度）。'],
  ['⚠️ **`player.damage` 必须用血量差**：`57_downed` 倒地时 early-return（不改 hp）→ 要单独补一条倒地渗血。',
   '⚠️ **`player.damage` 必须用血量差**：`57_downed` 倒地时 early-return → 要单独补一条倒地渗血。'],
  ['⚠️ **翻越落地用 `vaultFrom.y` 而非弧线顶点**（否则翻二楼多算 0.95m）；爬梯/倒地/跳伞不判。',
   '⚠️ **翻越落地用 `vaultFrom.y` 而非弧线顶点**；爬梯/倒地/跳伞不判。']
];
for (const [a, b] of subs) sub(a, b, '压缩 ' + a.slice(0, 14));

// ③ 插入靶场条目（放在坠落伤害那段之后）
{
  const k = L.findIndex(l => l.includes('**坠落伤害**（`60_falldmg.js`'));
  if (k < 0) { console.log('❌ 坠落行'); process.exit(1); }
  L.splice(k + 1, 0,
    '- **靶场**（`07h_range.js`+`61_range.js`，`CAMPAIGN.rangeOnly`）：`#rangeBtn` 写 `sf_range/sf_campaign/sf_autodeploy` 后 reload。免费武器=部署时临时把选中枪视为已拥有（`ownedCount` 桩 + **还原** `META.loadout.primary`，不写存档）；无限弹药=每帧补 `reserve`。',
    '  ⚠️ 靶子**不进 `combatants`**（AI/HUD 会当人），只包 `raySoldiers`；靶纸屏蔽 `bloodFX`。⚠️ 没有撤离点 → 超时会被判**阵亡掉装备**，必须每帧续 `matchTime`；天花板用 `mesh`（`solidBox` 污染 OCC → `findFreeSpawn` 扔到场外）。验证 `_tools/_range_probe.js`。');
  console.log('✅ 插入靶场条目');
}

const out = L.join('\n');
fs.writeFileSync(P, out, 'utf8');
const re = /^## .*$/gm; let m; const pos = [];
while ((m = re.exec(out))) pos.push(String(m.index).padStart(6) + '  ' + m[0].slice(0, 22));
console.log('\n总长 ' + out.length + ' 字符\n' + pos.slice(3, 7).join('\n'));
