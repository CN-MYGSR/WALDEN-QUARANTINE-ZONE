// MEMORY.md: 版本号 / 审计组数 / 翻越条目补坠落伤害 + 压缩
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

// ① 审计组数 + 版本号
sub('（14 组）', '（15 组）', '审计组数');
{
  const k = L.findIndex(l => l.startsWith('- **版本号 = `'));
  if (k < 0) { console.log('❌ 版本号'); process.exit(1); }
  L[k] = '- **版本号 = `20261030d`**（d=二楼窗台可翻出+坠落伤害；c=屏幕边缘反馈；b=翻越；a=剧情地图 `storyOnly`。';
  L[k + 1] = '  上一批：`20260929b`=倒地/救援 / `20260929a`=枪托握把改装；更早见 REF）。';
  console.log('✅ 版本号 → 20261030d');
}

// ② 压缩
sub('一并清 `RAG.list`/`DEBRIS.list`/`CORPSES`。材质只 dispose 标了 `userData.perSoldier` 的（`uniformMats[team]` 共享）。⚠️ **清不掉**：`BUILDS`/`MORTARS`/`MED_CRATES` 的 mesh 挂 `world`、无句柄。',
    '一并清 `RAG.list`/`DEBRIS.list`/`CORPSES`；材质只 dispose 标了 `perSoldier` 的（`uniformMats[team]` 共享）。⚠️ `BUILDS`/`MORTARS`/`MED_CRATES` 的 mesh 挂 `world`、清不掉。',
    '压缩 清场');
sub('→ **整条脚本链中断**（报一大串 `nowT before initialization`）。', '→ **整条脚本链中断**。', '压缩 item9');
sub("链：`PLAYABLE_FACTIONS=['usec','pmc']` → `FACTION_PICK` → `_foeKey` → `TEAM_FACTION`。**敌方按地图**：街区 `['usec','ger']`（德军，全武器随机）；其余 `['usec','pmc']`（PMC 精锐）。`isUniformEnemy` 要同时覆盖 `PMC`/`USEC`。",
    "链：`PLAYABLE_FACTIONS` → `FACTION_PICK` → `_foeKey` → `TEAM_FACTION`。**敌方按地图**：街区 `['usec','ger']`（德军）；其余 `['usec','pmc']`（PMC 精锐）。`isUniformEnemy` 要覆盖 `PMC`/`USEC`。",
    '压缩 阵营链');
sub('非玩家回血仍在：医疗箱交互、bot 拾药、无人坦克自检修。验证：`_tools/_noheal_probe.js`（读 `hydration`/`satiety`，与回血块同函数）。',
    '非玩家回血仍在：医疗箱、bot 拾药、坦克自检。验证：`_tools/_noheal_probe.js`。', '压缩 无回血');

// ③ 翻越条目补坠落伤害（插在「落脚点 standHeight」那行之后）
{
  const k = L.findIndex(l => l.includes('`vaultT>0` 时 `updatePlayer` 直接 return'));
  if (k < 0) { console.log('❌ 翻越尾行'); process.exit(1); }
  L[k] = L[k].replace('  ⚠️ 落脚点 `standHeight` 落差须 ≤0.8；', '  ⚠️ 落点只禁往上 0.8m、往下 ≤`maxDrop:4.6`（二层 3.05 可翻出）；');
  L.splice(k + 1, 0,
    '  **坠落伤害**（`60_falldmg.js`，包装 `updatePlayer`）：>3m 按 `0.85*(over/7)^1.2*maxHp` 扣血、最多 85%，走 `player.damage(...,\'legs\')`；' +
    '⚠️ **翻越落地用 `vaultFrom.y` 而非弧线顶点**（否则翻二楼多算 0.95m）；爬梯/倒地/跳伞不判。验证：`_tools/_falldmg_probe.js`。');
  console.log('✅ 翻越条目补坠落伤害');
}

const out = L.join('\n');
fs.writeFileSync(P, out, 'utf8');
const re = /^## .*$/gm; let m; const pos = [];
while ((m = re.exec(out))) pos.push(String(m.index).padStart(6) + '  ' + m[0].slice(0, 22));
console.log('\n总长 ' + out.length + ' 字符\n' + pos.slice(3, 7).join('\n'));
