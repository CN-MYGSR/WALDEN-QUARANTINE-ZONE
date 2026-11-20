// MEMORY.md 章节重排: 按「改动频率」排序, 让最常用的规则落在注入预算(≈10k)内
// 旧顺序 0..9 → 新顺序: 铁律 / 硬约束 / 状态经济 / 阵营 / 武器改件 / 键位触控 / 物品地图清单 / 环境测试 / 夜视仪 / 配色
const fs = require('fs');
const P = '.workbuddy-ai/memory/MEMORY.md';
const s = fs.readFileSync(P, 'utf8');

// 切出前言 + 各章
const re = /^## (\d+)\. (.*)$/gm;
const marks = [];
let m;
while ((m = re.exec(s))) marks.push({ no: +m[1], title: m[2], start: m.index });
if (marks.length !== 10) { console.log('❌ 章节数 ' + marks.length + ' (期望 10)'); process.exit(1); }

const head = s.slice(0, marks[0].start);
const sec = {};
for (let i = 0; i < marks.length; i++) {
  const end = i + 1 < marks.length ? marks[i + 1].start : s.length;
  sec[marks[i].no] = s.slice(marks[i].start, end).replace(/\s+$/, '');
}

const order = [0, 1, 2, 3, 4, 7, 8, 9, 5, 6];
const parts = [head.replace(/\s+$/, '')];
order.forEach((oldNo, newNo) => {
  const body = sec[oldNo];
  if (!body) { console.log('❌ 缺章节 ' + oldNo); process.exit(1); }
  const firstLineEnd = body.indexOf('\n');
  const title = body.slice(0, firstLineEnd).replace(/^## \d+\. /, '');   // 去掉 "## N. "
  const rest = body.slice(firstLineEnd);
  parts.push('## ' + newNo + '. ' + title + rest);
});
let out = parts.join('\n\n') + '\n';

// 「版本号见 §9」跟着 §9(环境/测试) 变成 §7
const before = out;
out = out.split('版本号见 §9').join('版本号见 §7');
if (out === before) console.log('⚠️ 没找到「版本号见 §9」');

fs.writeFileSync(P, out, 'utf8');

const re2 = /^## .*$/gm; let q; const lines = [];
while ((q = re2.exec(out))) lines.push(String(q.index).padStart(6) + '  ' + q[0].slice(0, 34));
console.log('总长 ' + out.length + ' 字符\n' + lines.join('\n'));
