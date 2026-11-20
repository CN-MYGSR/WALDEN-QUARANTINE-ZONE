// 清理 19_bot.js 的载具 AI —— 按精确行号从下往上操作, 每步都校验首行内容
const fs = require('fs');
const path = require('path');
const P = path.resolve(__dirname, '..', 'js', '19_bot.js');
let lines = fs.readFileSync(P, 'utf8').split(/\r?\n/);
const eol = fs.readFileSync(P, 'utf8').indexOf('\r\n') >= 0 ? '\r\n' : '\n';

// 1-indexed 闭区间 → 0-indexed
const OP = [
  // [起, 止, 替换内容(数组) 或 null=删除, 起始行必须包含的标记]
  [1532, 1557, ['}'], '} else {'],
  [1507, 1507, ['const tk=(this.target&&this.target.alive)?this.target:null;   // 载具已移除: 反坦克炮改打步兵'], 'const tk=enemyTankNear(this,160);'],
  [904, 940, null, 'if(!this.pilotOf&&!this.inSquad){'],
  [756, 834, null, 'const eTank=enemyTankNear(this,120);'],
  [496, 515, null, '// 命中暴露乘员'],
];

let ok = true;
for (const [a, b, repl, mark] of OP) {
  const i = a - 1, j = b - 1;
  const head = lines[i] || '';
  const tail = lines[j] || '';
  const hit = head.indexOf(mark) >= 0;
  console.log((hit ? '✅' : '❌') + ' 行 ' + a + '~' + b + '  [' + head.slice(0, 40) + ']  …  [' + tail.slice(0, 30) + ']');
  if (!hit) { ok = false; continue; }
  if (repl) lines.splice(i, j - i + 1, ...repl);
  else lines.splice(i, j - i + 1);
}
if (!ok) { console.log('\n首行标记不符，未写入。'); process.exit(1); }

// 清掉连续空行(3 行以上压成 1 行)
const out = [];
for (const l of lines) {
  if (l.trim() === '' && out.length && out[out.length - 1].trim() === '') continue;
  out.push(l);
}
fs.writeFileSync(P, out.join(eol), 'utf8');
console.log('\n19_bot.js 已写入');
