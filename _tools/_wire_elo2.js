// 补充: 敌方爆炸物/近战伤害也吃 ELO 的 dmgMul
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
function patch(file, pairs) {
  const p = path.join(root, file);
  let s = fs.readFileSync(p, 'utf8');
  const rep = [];
  for (const [from, to, expect] of pairs) {
    const n = s.split(from).length - 1;
    if (n !== expect) { rep.push(`  !! ${file}: expect ${expect} got ${n}`); continue; }
    s = s.split(from).join(to);
    rep.push(`  ok ${file}: x${n}`);
  }
  fs.writeFileSync(p, s);
  return rep;
}
const out = [];
out.push(...patch('js/18_ballistics.js', [[
  "if(s.team===attacker.team&&s!==attacker) dmg*=0.0;",
  "if(s.team===attacker.team&&s!==attacker) dmg*=0.0;\nif(attacker&&!attacker.isPlayer&&attacker.dmgMul) dmg*=attacker.dmgMul;",
  1]]));
out.push(...patch('js/20_tank.js', [[
  "if(d<radius) s.damage(lerp(dmgMax,10,d/radius),attacker,false);",
  "if(d<radius){ let dm=lerp(dmgMax,10,d/radius); if(attacker&&!attacker.isPlayer&&attacker.dmgMul) dm*=attacker.dmgMul; s.damage(dm,attacker,false); }",
  1]]));
out.push(...patch('js/19_bot.js', [[
  "if(dd<2.6){ this.target.damage(70,this,false); AudioSys.click(500,0.4,0.08); }",
  "if(dd<2.6){ this.target.damage(70*(this.dmgMul||1),this,false); AudioSys.click(500,0.4,0.08); }",
  1]]));
console.log(out.join('\n'));
