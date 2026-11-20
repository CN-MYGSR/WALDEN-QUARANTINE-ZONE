// 真加载 01_data.js 的 FACTIONS 块, 验证 FACTIONS.usec 完整可用
const fs = require('fs');
const t = fs.readFileSync('js/01_data.js', 'utf8');

// 抽 FACTIONS 块 (从 const FACTIONS 到 }; 之间的纯字面量)
const start = t.indexOf('const FACTIONS={');
const end = t.indexOf('};', start) + 2;
const factStr = t.slice(start, end);

// 把它放 IIFE 里跑
const code = `
${factStr}
global.__FACTIONS = FACTIONS;
`;
try {
  eval(code);
  const F = global.__FACTIONS;
  console.log('FACTIONS keys:', Object.keys(F).join(', '));
  console.log('FACTIONS.usec:', F.usec ? '✓ present' : '✗ missing');
  if (F.usec) {
    const n = F.usec;
    const fields = ['name','short','sym','flagBg','coat','pants','helm','skin','sleeve','helmet','nade','atn5','names','cls','tanks','trucks','planes'];
    for (const f of fields) {
      console.log('  ', f, ':', n[f] === undefined ? '✗' : '✓ (' + (Array.isArray(n[f]) ? n[f].length + ' items' : typeof n[f]) + ')');
    }
    // 抽 1 个武器组合看是否合法
    const firstWpn = n.cls[0][0];
    console.log('  first weapon:', firstWpn);
  }
} catch (e) {
  console.log('FAIL:', e.message);
}