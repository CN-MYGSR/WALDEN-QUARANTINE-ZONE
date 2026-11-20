// MEMORY.md 收尾压缩: 再省 ~190 字符
const fs = require('fs');
const P = '.workbuddy-ai/memory/MEMORY.md';
let L = fs.readFileSync(P, 'utf8').split('\n');

const subs = [
  ['9. ⚠️ **`_cqbWallOpen(mat,L,ry,axis,at,from,to,y0,h,t,doors,doorW,wins,winW,gs)`** —— `L` 后**只有 ry 和 axis**。',
   '9. ⚠️ **`_cqbWallOpen(mat,L,ry,axis,…)`** —— `L` 后**只有 ry 和 axis**。'],
  ['按「部署」时 `consumeRaidStart()` 才 `startMatch()`（唯一直接调用）。', '按「部署」时 `consumeRaidStart()` 才 `startMatch()`。'],
  ['不带仓库武器/无保险/阵亡不掉装备/XP 减半。', '不带仓库武器/无保险/阵亡不掉装备。'],
  ['- **剧情模式**（`56_story.js` + `07g_anvil.js`，6 章，与沙盒并存）：进度存独立 `bf_story_v1`；局内态放模块级 `SRAID`（不占 RUN）。逐章细节见 REF。',
   '- **剧情模式**（`56_story.js`+`07g_anvil.js`，6 章）：进度存独立 `bf_story_v1`；局内态放模块级 `SRAID`（不占 RUN）。细节见 REF。'],
  ['港口（±64）/机场（±46）会全错。**已踩三次**。', '港口/机场会全错。**已踩三次**。'],
  ['- **保底：玩家任何时候至少一把武器。**', '- **保底：玩家至少一把武器。**'],
  ['`light_flash`（照亮但会暴露）', '`light_flash`（照亮但暴露）'],
  ['`adsA.pos.y += N` 那几行是镜头侧修正，别动。**开镜对准**：`vmEquip`（15_viewmodel:130）强制 `ads.pos.y=-sightAnchor.y`；',
   '`adsA.pos.y += N` 是镜头侧修正，别动。**开镜对准**：`vmEquip` 强制 `ads.pos.y=-sightAnchor.y`；'],
  ['⚠️ **「待处理标记」无条件清理**（只在采纳时清 → 每次加载重复同一动作 = 用户报的「loop」）；**主循环/建局/结算上的钩子一律 try/catch**（每帧抛错 → 主循环后半段全不执行 + 控制台每帧刷错）。',
   '⚠️ **「待处理标记」无条件清理**（只在采纳时清 → 每次加载重复同一动作 = 「loop」）；**主循环/建局/结算的钩子一律 try/catch**（每帧抛错 → 主循环后半段全不执行）。'],
  ['四外观：USEC 全黑 `0x181818`（裤 `0x101010`）/ PMC 土黄 `0x6b6247` / 德军 灰绿 `0x545c50` / SCAV 橄榄 `0x4c5a4a`（裤 `0x8a7f5e`）。',
   '四外观：USEC `0x181818`（裤 `0x101010`）/ PMC `0x6b6247` / 德军 `0x545c50` / SCAV `0x4c5a4a`（裤 `0x8a7f5e`）。']
];

for (const [a, b] of subs) {
  const k = L.findIndex(l => l.includes(a));
  if (k < 0) { console.log('⚠️ 未命中: ' + a.slice(0, 16)); continue; }
  L[k] = L[k].split(a).join(b);
  console.log('✅ ' + a.slice(0, 14));
}

const out = L.join('\n');
fs.writeFileSync(P, out, 'utf8');
const re = /^## .*$/gm; let m; const pos = [];
while ((m = re.exec(out))) pos.push(String(m.index).padStart(6) + '  ' + m[0].slice(0, 22));
console.log('\n总长 ' + out.length + ' 字符\n' + pos.slice(3, 7).join('\n'));
