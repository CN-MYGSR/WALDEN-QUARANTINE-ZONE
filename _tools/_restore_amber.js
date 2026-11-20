// 把上一轮误删的琥珀色恢复回来（只恢复黄色，中性灰的底色保持不动）。
// 用 split/join + 命中数断言，避免多行字符串静默 0 命中。
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

// [文件, 新(当前), 旧(要恢复成的), 期望命中数]
const JOBS = [
  ['js/25_player_update.js', "linear-gradient(90deg,#e8e8e8,#e83a1a)", "linear-gradient(90deg,#e8c56a,#e83a1a)", 1],
  ['js/27x_xray.js', "ctx.strokeStyle='rgba(255,255,255,.35)'; ctx.lineWidth=1.2;", "ctx.strokeStyle='rgba(255,225,130,.35)'; ctx.lineWidth=1.2;", 1],
  ['js/27x_xray.js', "pen?'rgba(255,255,255,.8)':'rgba(255,255,255,.35)');", "pen?'rgba(255,170,70,.8)':'rgba(255,255,255,.35)');", 1],
  ['js/27x_xray.js', "ctx.arc(hx,hy,5.5,0,7); ctx.fillStyle='rgba(255,255,255,.35)';", "ctx.arc(hx,hy,5.5,0,7); ctx.fillStyle='rgba(255,224,102,.35)';", 1],
  ['js/27x_xray.js', "ctx.arc(hx,hy,2.8,0,7); ctx.fillStyle='#ffffff';", "ctx.arc(hx,hy,2.8,0,7); ctx.fillStyle='#ffe066';", 1],
  ['js/27x_xray.js', "ctx.fillStyle=pen?'#ffffff':'#ff8f6b';", "ctx.fillStyle=pen?'#ffb347':'#ff8f6b';", 1],
  ['js/30c_cutscene.js', "winner===player.team?'#ffffff':'#e87060'", "winner===player.team?'#ffd77a':'#e87060'", 1],
];

const cache = new Map();
function load(rel) {
  if (!cache.has(rel)) cache.set(rel, fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  return cache.get(rel);
}
let bad = 0;
for (const [rel, from, to, want] of JOBS) {
  const s = load(rel);
  const n = s.split(from).length - 1;
  if (n !== want) { console.log('❌ ' + rel + '  期望 ' + want + ' 命中 ' + n + ' : ' + from.slice(0, 50)); bad++; }
  else console.log('✅ ' + rel + '  ' + n + ' 处  ' + from.slice(0, 46) + ' → ' + to.slice(0, 46));
}
if (bad) { console.log('\n有 ' + bad + ' 处不匹配，未写入任何文件。'); process.exit(1); }
for (const [rel] of JOBS) { /* 已全部校验通过 */ }
const byFile = {};
for (const [rel, from, to] of JOBS) byFile[rel] = (byFile[rel] || []).concat([[from, to]]);
for (const rel in byFile) {
  let s = load(rel);
  for (const [from, to] of byFile[rel]) s = s.split(from).join(to);
  fs.writeFileSync(path.join(ROOT, rel), s, 'utf8');
  console.log('写入 ' + rel);
}
