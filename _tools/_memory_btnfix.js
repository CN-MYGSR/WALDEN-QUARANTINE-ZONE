// MEMORY.md: 版本 → g, §0 加「主菜单按钮绑定」教训 + 压缩
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

// ① 版本号
{
  const k = L.findIndex(l => l.startsWith('- **版本号 = `'));
  if (k < 0) { console.log('❌ 版本号'); process.exit(1); }
  L[k] = '- **版本号 = `20261030g`**（g=修靶场按钮绑定（点了没反应）；f=修靶场观感；e=室内靶场；d=二楼翻出+坠落伤害。';
  L[k + 1] = '  上一批：`20261030c`=屏幕边缘反馈 / `20261030b`=翻越；更早见 REF）。';
  console.log('✅ 版本号 → 20261030g');
}

// ② §0 加主菜单按钮教训（插在静态审计那条之前）
{
  const k = L.findIndex(l => l.startsWith('- 静态审计 `_tools/_static_audit.js`'));
  if (k < 0) { console.log('❌ 静态审计行'); process.exit(1); }
  L.splice(k, 0,
    '- ⚠️ **主菜单加按钮**：`initMenuUI`（29_menus）在**所有脚本加载完之后**才跑，里面会把 `querySelectorAll(\'.navBtn\')` 的 onclick 全部重绑成 `showPanel(b.dataset.p)` → 脚本加载时自己绑的会被覆盖（症状：**点按钮没反应**）。要包一层 `initMenuUI` 再绑。');
  console.log('✅ §0 加主菜单按钮教训');
}

// ③ 压缩
const subs = [
  ['→ 要单独补一条倒地渗血。⚠️ 血块层别加 `filter:blur()`（手机上掉帧）。验证：`_tools/_screenfx_probe.js`（30 项）。',
   '→ 要补一条倒地渗血。⚠️ 血块层别加 `filter:blur()`。验证：`_tools/_screenfx_probe.js`。'],
  ['；爬梯/倒地/跳伞不判。验证：`_tools/_falldmg_probe.js`。', '；爬梯/倒地/跳伞不判。'],
  ['；`vaultT>0` 时 `updatePlayer` 直接 return。验证：`_tools/_vault_probe.js`。', '；`vaultT>0` 时 `updatePlayer` 直接 return。'],
  ['⚠️ `BUILDS`/`MORTARS`/`MED_CRATES` 挂 `world`、清不掉。', '⚠️ `BUILDS`/`MORTARS`/`MED_CRATES` 清不掉。'],
  ['四外观：USEC `0x181818`（裤 `0x101010`）/ PMC `0x6b6247` / 德军 `0x545c50` / SCAV `0x4c5a4a`（裤 `0x8a7f5e`）。',
   '四外观：USEC `0x181818`/裤 `0x101010` · PMC `0x6b6247` · 德军 `0x545c50` · SCAV `0x4c5a4a`/裤 `0x8a7f5e`。'],
  ['⚠️ **给函数开头插代码前，先 grep 谁按「紧邻」匹配它的第一行**。', '⚠️ **给函数开头插代码前，先 grep 谁按「紧邻」匹配它**。']
];
for (const [a, b] of subs) sub(a, b, '压缩 ' + a.slice(0, 12));

const out = L.join('\n');
fs.writeFileSync(P, out, 'utf8');
const re = /^## .*$/gm; let m; const pos = [];
while ((m = re.exec(out))) pos.push(String(m.index).padStart(6) + '  ' + m[0].slice(0, 20));
console.log('\n总长 ' + out.length + ' 字符\n' + pos.slice(3, 7).join('\n'));
