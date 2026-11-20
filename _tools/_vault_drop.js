// 翻越: 允许从二楼窗台翻出去（落点可以比脚下低, 但有限度）
const fs = require('fs');
const P = 'js/58_vault.js';
let s = fs.readFileSync(P, 'utf8');

function rep(from, to, tag){
  const n = s.split(from).length - 1;
  if (n !== 1) { console.log('❌ [' + tag + '] 命中 ' + n + ' 次'); process.exit(1); }
  s = s.split(from).join(to);
  console.log('✅ [' + tag + ']');
}

// ① 参数: 允许的最大落差
rep(
  '  maxRun:2.10,     // 越过障碍后最多再走 2.1m 找落脚点',
  '  maxRun:2.10,     // 越过障碍后最多再走 2.1m 找落脚点\n' +
  '  maxDrop:4.60,    // 落点可以比脚下低多少（二层窗台 3.05m 可翻出；三层 6.1m 不行）',
  '加 maxDrop');

// ② 落点判定: 原来要求 |落差|<=0.8（上下都不许），改成「不许往上，往下最多 maxDrop」
rep(
  '      const gh=standHeight(x,z,feet+0.3);\n' +
  '      if(Math.abs(gh-feet)>0.80) continue;       // 落差太大(屋顶/坑) → 不是翻越',
  '      const gh=standHeight(x,z,feet+0.3);\n' +
  '      if(gh-feet>0.80) continue;                 // 不能翻到更高的地方\n' +
  '      if(feet-gh>VAULT.maxDrop) continue;        // 太深(>4.6m) → 不翻, 免得直接摔死',
  '落点落差判定');

fs.writeFileSync(P, s, 'utf8');
console.log('\n翻越改动完成');
