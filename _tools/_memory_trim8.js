// 最后 53 字符: 两行收紧
const fs = require('fs');
const P = '.workbuddy-ai/memory/MEMORY.md';
let L = fs.readFileSync(P, 'utf8').split('\n');

const pairs = [
  ['  ⚠️ 纯逻辑改动用 `_tools/_mods_probe.js` 做**行为验证**（打桩跑真代码，21 项），比看代码可靠。',
   '  ⚠️ 纯逻辑改动用 `_tools/_mods_probe.js` 做**行为验证**（打桩跑真代码）。'],
  ['10. ⚠️ **"相对基地/出生点"的落位坐标必须从 `CAMPAIGN.bases` 算** —— 写死绝对值只对基地落在 z=0 轴上的地图成立，港口（z=±64）/机场（z=±46）会全错。**已踩三次**。加新地图后 grep `z:\\s*-?\\d+` 查漏网。',
   '10. ⚠️ **"相对基地"的落位坐标必须从 `CAMPAIGN.bases` 算** —— 写死绝对值只对基地在 z=0 轴的地图成立，港口（±64）/机场（±46）会全错。**已踩三次**。加新图后 grep `z:\\s*-?\\d+` 查漏网。']
];

for (const [a, b] of pairs) {
  const k = L.findIndex(l => l.includes(a));
  if (k < 0) { console.log('⚠️ 未命中: ' + a.slice(0, 20)); continue; }
  L[k] = L[k].split(a).join(b);
  console.log('✅ 压缩: ' + a.slice(0, 18));
}

const out = L.join('\n');
fs.writeFileSync(P, out, 'utf8');
const re = /^## .*$/gm; let m; const pos = [];
while ((m = re.exec(out))) pos.push(String(m.index).padStart(6) + '  ' + m[0].slice(0, 20));
console.log('总长 ' + out.length + '\n' + pos.slice(4, 7).join('\n'));
