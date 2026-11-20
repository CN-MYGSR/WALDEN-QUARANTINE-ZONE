// MEMORY.md 收尾: 再省 ~95 字符
const fs = require('fs');
const P = '.workbuddy-ai/memory/MEMORY.md';
let L = fs.readFileSync(P, 'utf8').split('\n');

const subs = [
  ['（**在 mergeRunLoot 之前**）', '（**mergeRunLoot 之前**）'],
  ['（暂停菜单 ≡ 会再进 `showDeploy()` → **重建整局**）', '（暂停菜单 ≡ 会再进 `showDeploy()` → 重建整局）'],
  ['`MOD_SLOT_NAMES`/`renderWorkbenchRows`）。审计第 11 组管这条。', '`MOD_SLOT_NAMES`/`renderWorkbenchRows`）。'],
  ['触控 UI 与**键鼠特性（指针锁定）一律用 `TOUCHUI`**。⚠️ **替换标志前必须 grep 全部消费点并逐个分类**（触控 UI / 键鼠 / 移动端布局），漏一处那一处就失效。',
   '触控 UI 与**键鼠特性（指针锁定）都用 `TOUCHUI`**。⚠️ **替换标志前必须 grep 全部消费点并分类**（触控/键鼠/布局），漏一处就失效。'],
  ['`raidLoadout()` 优先返回。**必须在 `showDeploy()` 前**。', '**必须在 `showDeploy()` 前**。'],
  ['包装 `fireBullet`/`player.damage`/`suppress`/`updateHUD`', '包装 `fireBullet`/`damage`/`suppress`/`updateHUD`'],
  ['楼梯井 `shaft` 必须落在该层楼板矩形内，终点外留 ≥1m 落梯平台，否则 `stairTopGap<0` → `stairDead`。`axis===\'x\'` 时内部 `ryP=ry+HPI`。',
   '楼梯井 `shaft` 必须落在该层楼板内，终点外留 ≥1m 落梯平台，否则 `stairTopGap<0` → `stairDead`。`axis===\'x\'` 时 `ryP=ry+HPI`。'],
  ['（`ownedCount` 桩 + **还原** `META.loadout.primary`，不写存档）', '（`ownedCount` 桩 + **还原** `META.loadout.primary`）'],
  ['失败补偿 500：阵亡与 `finishRaid(false)` 两条路径，用 `RUN.failComp` 去重。', '失败补偿 500：阵亡与 `finishRaid(false)` 两条路径用 `RUN.failComp` 去重。']
];

for (const [a, b] of subs) {
  const k = L.findIndex(l => l.includes(a));
  if (k < 0) { console.log('⚠️ 未命中: ' + a.slice(0, 14)); continue; }
  L[k] = L[k].split(a).join(b);
  console.log('✅ ' + a.slice(0, 12));
}

const out = L.join('\n');
fs.writeFileSync(P, out, 'utf8');
const re = /^## .*$/gm; let m; const pos = [];
while ((m = re.exec(out))) pos.push(String(m.index).padStart(6) + '  ' + m[0].slice(0, 20));
console.log('\n总长 ' + out.length + ' 字符\n' + pos.slice(3, 7).join('\n'));
