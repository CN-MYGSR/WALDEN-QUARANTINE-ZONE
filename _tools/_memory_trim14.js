// MEMORY.md 最后 21 字符（用脚本文件, 避免 bash 把反引号当命令替换）
const fs = require('fs');
const P = '.workbuddy-ai/memory/MEMORY.md';
let L = fs.readFileSync(P, 'utf8').split('\n');

const subs = [
  ['⚠️ 改 `01_data.js` 多行块前先打印原文 `indexOf`（后面可能接下一阵营 `rus:` 而非 `};`）。',
   '⚠️ 改 `01_data.js` 多行块前先打印 `indexOf`（后面可能接 `rus:` 而非 `};`）。'],
  ['`MOD_SLOT_NAMES`/`renderWorkbenchRows`）。', '`MOD_SLOT_NAMES`/`renderWorkbenchRows`。'],
  ['里面会把 `querySelectorAll(\'.navBtn\')` 的 onclick 全部重绑成 `showPanel(b.dataset.p)` → 脚本加载时自己绑的会被覆盖（症状：**点按钮没反应**）。要包一层 `initMenuUI` 再绑。',
   '里面把 `querySelectorAll(\'.navBtn\')` 的 onclick 重绑成 `showPanel(b.dataset.p)` → 脚本里自己绑的会被覆盖（**点按钮没反应**）。要包一层 `initMenuUI` 再绑。']
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
