// MEMORY.md 最后 60 字符
const fs = require('fs');
const P = '.workbuddy-ai/memory/MEMORY.md';
let L = fs.readFileSync(P, 'utf8').split('\n');

const subs = [
  ['，倒地后没人复位 → 卡住）。玩家倒地', '，倒地后没人复位）。玩家倒地'],
  ['包装 `fireBullet`/`player.damage`/`player.suppress`/`updateHUD`）：队友 22m 内开火 → `#supOv` 压暗（用独立 `press`',
   '包装 `fireBullet`/`player.damage`/`suppress`/`updateHUD`）：队友 22m 内开火 → `#supOv` 压暗（独立 `press`'],
  ['先 grep 谁在按「紧邻」匹配它的第一行', '先 grep 谁按「紧邻」匹配它的第一行'],
  ['写 `localStorage.sf_faction` 后', '写 `sf_faction` 后'],
  ['（对的）：阵亡/撤离两条路径都会 `META.loot[k]++` 后清空。', '（对的）：阵亡/撤离都会 `META.loot[k]++` 后清空。'],
  ['→ 判断建筑上层可站立性要遍历', '→ 判断上层可站立性要遍历'],
  ['`raidLoadout()` 优先返回 → 不带仓库武器/无保险/阵亡不掉装备。', '`raidLoadout()` 优先返回。']
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
while ((m = re.exec(out))) pos.push(String(m.index).padStart(6) + '  ' + m[0].slice(0, 20));
console.log('\n总长 ' + out.length + ' 字符\n' + pos.slice(3, 7).join('\n'));
