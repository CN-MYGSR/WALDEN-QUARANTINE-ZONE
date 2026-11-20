// 清除反坦克残留 (2026-09-18): 炮位 / 火箭弹系统 / 爆炸里的坦克与AT分支
const fs = require('fs');
const path = require('path');
const R = f => path.resolve(__dirname, '..', f);
let ok = true;

function cutLines(rel, ops, label) {
  const raw = fs.readFileSync(R(rel), 'utf8');
  const eol = raw.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/);
  let bad = 0;
  for (const [a, b, mark] of ops) {
    const head = lines[a - 1] || '';
    if (head.indexOf(mark) < 0) { console.log('  ❌ ' + rel + ' 行' + a + ' 期望[' + mark + '] 实际[' + head.slice(0, 40) + ']'); bad++; }
  }
  if (bad) { console.log('❌ ' + label + ' 未命中'); ok = false; return; }
  for (const [a, b] of [...ops].sort((p, q) => q[0] - p[0])) lines.splice(a - 1, b - a + 1);
  fs.writeFileSync(R(rel), lines.join(eol), 'utf8');
  console.log('✅ ' + label);
}

function rep(rel, jobs, label) {
  const raw = fs.readFileSync(R(rel), 'utf8');
  const eol = raw.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  const L = (...a) => a.join(eol) + eol;
  let bad = 0;
  for (const [from] of jobs) {
    const t = typeof from === 'function' ? from(L) : from;
    if (raw.split(t).length - 1 !== 1) { console.log('  ❌ ' + rel + '  ' + t.slice(0, 48).replace(/\r?\n/g, '⏎')); bad++; }
  }
  if (bad) { console.log('❌ ' + label + ' 未命中'); ok = false; return; }
  let out = raw;
  for (const [from, to] of jobs) {
    const f = typeof from === 'function' ? from(L) : from;
    const t = typeof to === 'function' ? to(L) : to;
    out = out.split(f).join(t);
  }
  fs.writeFileSync(R(rel), out, 'utf8');
  console.log('✅ ' + label);
}

// ---------- ① 反坦克炮位: 22_emplacements.js ----------
cutLines('js/22_emplacements.js', [[2, 27, 'const ATGUNS=[];']], '22_emplacements.js 反坦克炮位');

// ---------- ② 玩家侧: 25_player_update.js ----------
cutLines('js/25_player_update.js', [
  [338, 363, 'function updatePlayerAT(dt){'],
], '25_player_update.js updatePlayerAT 函数');
rep('js/25_player_update.js', [
  ['if(p.onAT){ updatePlayerAT(dt); return; }' + '\n', ''],
  [(L) => L("if(player.onAT){ setInter('<b>F</b> 离开反坦克炮','离开火炮'); return; }",
    ''), ''],
  [(L) => L('for(const g of ATGUNS){',
    "if(!g.user&&Math.hypot(g.x-player.pos.x,g.z-player.pos.z)<3){",
    "setInter('<b>F</b> 使用反坦克炮','上反坦克炮'); return;",
    '}',
    '}'), ''],
  [(L) => L('if(w.def.rocket){',
    ' const sp=w.def.spreadAds*(Math.PI/180)*0.5;',
    ' const rv=camRight(), uv=rv.clone().cross(dir).negate();',
    ' dir.addScaledVector(rv,rand(-sp,sp)).addScaledVector(uv,rand(-sp,sp)).normalize();',
    ' vmFireKick(); (typeof shakeShot===\'function\' ? shakeShot(0.4) : addTrauma(0.4));',
    ' fireRocket(p,camera.position.clone(),dir,w.def,V3());',
    ' return;',
    '}'), ''],
], '25_player_update.js 反坦克炮交互与火箭筒分支');

// ---------- ③ 火箭弹发射器: 17_ragdoll.js ----------
cutLines('js/17_ragdoll.js', [[337, 345, 'const rockets=[];']], '17_ragdoll.js fireRocket');

// ---------- ④ bot 侧: 19_bot.js ----------
cutLines('js/19_bot.js', [
  [1295, 1331, 'updateEmplacement(dt){'],
], '19_bot.js updateEmplacement 函数');
rep('js/19_bot.js', [
  ['if(this.empUse){ this.updateEmplacement(dt); return; }' + '\n', ''],
], '19_bot.js 炮位调用');

// ---------- ⑤ 爆炸分支: 18_ballistics.js ----------
rep('js/18_ballistics.js', [
  // 手雷掉进坦克战斗舱
  [(L) => L('// 掉进敞篷战斗舱: 舱内爆炸 → 重创车辆并杀伤全部乘员',
    'if(n.insideTank&&n.insideTank.alive){',
    'const t=n.insideTank;',
    'explosionFXSmall(n.pos);',
    'AudioSys.explosion(n.pos.distanceTo(camera.position));',
    'if(t.crewMen) for(const cm of t.crewMen){ if(cm.alive) t.crewKilled(cm,n.thrower,false); }',
    't.takeDmg(n.at?520:420,n.thrower);',
    "if(n.thrower&&n.thrower.isPlayer) showScorePop('手雷入舱!');",
    'return;',
    '}',
    '// 停在车体顶面起爆: 按顶部装甲判定',
    'if(n.restTank&&n.restTank.alive&&n.restTank.team!==n.team){',
    'const t=n.restTank;',
    'const pen=n.at?90:24;',
    'const top=(t.def.armor&&t.def.armor.top)||14;',
    'explosionFXSmall(n.pos);',
    'AudioSys.explosion(n.pos.distanceTo(camera.position));',
    'if(pen>top){',
    't.takeDmg(n.at?400:170,n.thrower);',
    "if(n.thrower&&n.thrower.isPlayer) showScorePop('顶部击穿!');",
    '} else {',
    't.takeDmg(30,n.thrower);',
    '}',
    'splashDamage(n.pos,n.thrower,n.team,4,80,0);',
    'return;',
    '}'), ''],
  // AT 手雷分支 → 并入普通手雷
  [(L) => L('if(n.at){',
    'spawnP(PT.flash,n.pos.x,n.pos.y+0.4,n.pos.z,0,2,0,2.4,15,0.14,1,0,true);',
    'for(let i=0;i<7;i++) spawnP(PT.dark,n.pos.x,n.pos.y+0.4,n.pos.z,rand(-2,2),rand(1,4),rand(-2,2),1.0,2.4,rand(0.8,1.4),0.85,0.6);',
    'AudioSys.explosion(n.pos.distanceTo(camera.position));',
    'splashDamage(n.pos,n.thrower,n.team,5,95,340);',
    'damageStructures(n.pos,5,130);',
    'crater(n.pos.x,n.pos.z,1.1,true);',
    '} else if(n.bomb){',
    'explosionFX(n.pos);',
    'AudioSys.explosion(n.pos.distanceTo(camera.position)*0.7);',
    'splashDamage(n.pos,n.thrower,n.team,9.5,170,260);',
    'damageStructures(n.pos,9,340);',
    'explodeAt(n.pos,n.thrower);',
    '} else {'),
    (L) => L('{')],
], '18_ballistics.js 坦克/AT/航弹爆炸分支');

console.log(ok ? '\n完成' : '\n有失败');
process.exit(ok ? 0 : 1);
