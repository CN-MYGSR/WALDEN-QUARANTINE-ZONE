// MEMORY.md 收尾: 再省 ~125 字符, 让 §0–§5 落进 10k
const fs = require('fs');
const P = '.workbuddy-ai/memory/MEMORY.md';
let L = fs.readFileSync(P, 'utf8').split('\n');

const subs = [
  ['一并清 `RAG.list`/`DEBRIS.list`/`CORPSES`。材质只 dispose 标了 `userData.perSoldier` 的（`uniformMats[team]` 共享）。⚠️ **清不掉**：`BUILDS`/`MORTARS`/`MED_CRATES` 的 mesh 直接挂 `world` 组、无句柄。',
   '一并清 `RAG.list`/`DEBRIS.list`/`CORPSES`；材质只 dispose 标了 `perSoldier` 的（`uniformMats[team]` 共享）。⚠️ `BUILDS`/`MORTARS`/`MED_CRATES` 的 mesh 挂 `world`、清不掉。'],
  ['玩家倒地 `alive` 仍 true（视角可转），用 `downed` 标记。', '玩家倒地 `alive` 仍 true，用 `downed` 标记。'],
  ['带 `storyOnly:true` → **沙盒列表不显示、部署被拦**', '`storyOnly:true` → **沙盒列表不显示、部署被拦**'],
  ['- 静态审计 `node _tools/_static_audit.js`（15 组）', '- 静态审计 `_tools/_static_audit.js`（15 组）'],
  ['结算重算必然 false → 章节永不解锁（`escort` 例外，必须重算且不锁存）。', '结算重算必然 false → 章节永不解锁（`escort` 例外）。'],
  ['阵亡不掉仓库装备/XP 减半。**必须在 `showDeploy()` 前调用**。', '阵亡不掉装备/XP 减半。**必须在 `showDeploy()` 前调用**。']
];

for (const [a, b] of subs) {
  const k = L.findIndex(l => l.includes(a));
  if (k < 0) { console.log('⚠️ 未命中: ' + a.slice(0, 16)); continue; }
  L[k] = L[k].split(a).join(b);
  console.log('✅ 压缩: ' + a.slice(0, 14));
}

// 删掉一行方法论指针（行为探针已是固定套路, 审计也逐组检查）
{
  const k = L.findIndex(l => l.includes('_tools/_mods_probe.js') && l.includes('行为验证'));
  if (k >= 0) { L.splice(k, 1); console.log('✅ 删除 mods_probe 方法论行'); }
  else console.log('⚠️ 未找到 mods_probe 行');
}

const out = L.join('\n');
fs.writeFileSync(P, out, 'utf8');
const re = /^## .*$/gm; let m; const pos = [];
while ((m = re.exec(out))) pos.push(String(m.index).padStart(6) + '  ' + m[0].slice(0, 22));
console.log('\n总长 ' + out.length + ' 字符\n' + pos.slice(3, 7).join('\n'));
