// 一次性接线脚本: 把 ELO 注入端 (45_elo_bots.js) 的字段接到消费点
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

function patch(file, pairs) {
  const p = path.join(root, file);
  let s = fs.readFileSync(p, 'utf8');
  const report = [];
  for (const [from, to, expect] of pairs) {
    const n = s.split(from).length - 1;
    if (n !== expect) {
      report.push(`  !! ${file}: expect ${expect} got ${n} :: ${JSON.stringify(from.slice(0, 60))}`);
      continue;
    }
    s = s.split(from).join(to);
    report.push(`  ok ${file}: x${n} :: ${JSON.stringify(from.slice(0, 60))}`);
  }
  fs.writeFileSync(p, s);
  return report;
}

const out = [];
out.push(...patch('index.html', [
  [
    '<script src="js/43_maps.js?v=20260913i"></script>',
    '<script src="js/43_maps.js?v=20260913i"></script>\n<script src="js/45_elo_bots.js?v=20260913i"></script>',
    1,
  ],
]));

out.push(...patch('js/19_bot.js', [
  ['const viewD=70*diff.visMul;', 'const viewD=70*diff.visMul*(this.visMul||1);', 1],
  ['const er2=0.012*EFF_DIFF.spreadMul;', 'const er2=0.012*EFF_DIFF.spreadMul*(this.sprMul||1);', 1],
  ['const er=0.02*EFF_DIFF.spreadMul;', 'const er=0.02*EFF_DIFF.spreadMul*(this.sprMul||1);', 1],
  ['const er=0.05*EFF_DIFF.spreadMul;', 'const er=0.05*EFF_DIFF.spreadMul*(this.sprMul||1);', 1],
]));

out.push(...patch('js/18_ballistics.js', [
  ['if(!shooter.isPlayer) dmg*=EFF_DIFF.dmgMul;',
   'if(!shooter.isPlayer) dmg*=EFF_DIFF.dmgMul*(shooter.dmgMul||1);', 2],
]));

console.log(out.join('\n'));
