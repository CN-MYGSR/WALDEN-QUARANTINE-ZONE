// 收尾: 再省 ~30 字符, 让 §0–§5 恰好落在 10k 内
const fs = require('fs');
const P = '.workbuddy-ai/memory/MEMORY.md';
let L = fs.readFileSync(P, 'utf8').split('\n');

const pairs = [
  ['（不占 RUN → 省掉重置点规则）。逐章/地图细节见 REF。', '（不占 RUN）。逐章细节见 REF。'],
  ['否则 `_dG` 为 null 抛 TypeError。', '否则 `_dG` 为 null 抛错。'],
  ['`maxTop:1.42`（窗台 0.95/沙袋 1.0 可翻，整墙不行）。', '`maxTop:1.42`（窗台/沙袋可翻，整墙不行）。'],
  ['（全项目唯一直接调用）', '（唯一直接调用）']
];

for (const [a, b] of pairs) {
  const k = L.findIndex(l => l.includes(a));
  if (k < 0) { console.log('⚠️ 未命中: ' + a.slice(0, 18)); continue; }
  L[k] = L[k].split(a).join(b);
  console.log('✅ ' + a.slice(0, 16));
}

const out = L.join('\n');
fs.writeFileSync(P, out, 'utf8');
const re = /^## .*$/gm; let m; const pos = [];
while ((m = re.exec(out))) pos.push(String(m.index).padStart(6) + '  ' + m[0].slice(0, 20));
console.log('总长 ' + out.length + '\n' + pos.slice(4, 7).join('\n'));
