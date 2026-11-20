// 一次性清理脚本: 删掉 18_ballistics.js 里的载具分支
const fs = require('fs');
const path = require('path');
const P = path.resolve(__dirname, '..', 'js', '18_ballistics.js');
let s = fs.readFileSync(P, 'utf8');
const e = s.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
const L = (...a) => a.join(e) + e;

const J = [
  // ① 坦克/APC 射线检测 + 暴露乘员判定
  [L('// 子弹命中坦克: OBB 精细碰撞(车体/炮塔分体)',
    'let hitTank=null, tankInfo=null;',
    'for(const t of tanks){',
    'if(!t.alive) continue;',
    'if(Math.hypot(t.pos.x-origin.x,t.pos.z-origin.z)>wallD+8) continue;',
    'const r=rayTankParts(origin,dir,wallD,t);',
    'if(r){ wallD=r.t; hitTank=t; tankInfo=r; }',
    '}',
    '// 暴露乘员(敞篷车全员/封闭车探头车长)按步兵判定直接击杀',
    'const cw=rayTankCrew(origin,dir,wallD+0.35,shooter);',
    '// 运兵车车体(软皮): 挡弹并受伤; 车帮以上的乘员由 raySoldiers 判定',
    'let hitApc=null;',
    'for(const a of apcs){',
    'if(!a.alive) continue;',
    'const r=rayCyl(origin,dir,{x:a.pos.x,z:a.pos.z,r:1.6,y0:a.pos.y+0.25,y1:a.pos.y+1.72},wallD);',
    'if(r){ wallD=r.t; hitApc=a; hitTank=null; tankInfo=null; }',
    '}'), ''],

  // ② 乘员分支 → 直接走士兵分支
  [L('if(cw&&(!sr||cw.t<sr.t)){',
    'endD=cw.t;',
    'const hitP=V3(origin.x+dir.x*cw.t,origin.y+dir.y*cw.t,origin.z+dir.z*cw.t);',
    'bloodFX(hitP);',
    'let dmg=def.dmg*(cw.head?def.headMul:1);',
    'if(!shooter.isPlayer) dmg*=EFF_DIFF.dmgMul*(shooter.dmgMul||1);',
    'cw.cm.hp-=dmg;',
    'if(cw.cm.hp<=0) cw.tank.crewKilled(cw.cm,shooter,cw.head);',
    'else if(shooter.isPlayer) onPlayerHit({isPlayer:false},cw.head);',
    '} else if(sr){'), L('if(sr){')],

  // ③ APC 命中分支
  [L('} else if(hitApc){',
    'endD=wallD;',
    'const hp2=V3(origin.x+dir.x*endD,origin.y+dir.y*endD,origin.z+dir.z*endD);',
    'spawnP(PT.spark,hp2.x,hp2.y,hp2.z,rand(-2,2),rand(1,3),rand(-2,2),0.14,0,rand(0.1,0.16),1,6,true);',
    'if(hitApc.team!==shooter.team){',
    'hitApc.takeDmg(def.vehDmg?def.vehDmg*1.6:def.dmg*0.3,shooter);',
    'if(shooter.isPlayer&&Math.random()<0.15) AudioSys.hitmarkSnd(false);',
    '}'), ''],

  // ④ 坦克命中分支
  [L('} else if(hitTank){',
    'endD=wallD;',
    'const hp2=V3(origin.x+dir.x*endD,origin.y+dir.y*endD,origin.z+dir.z*endD);',
    'spawnP(PT.spark,hp2.x,hp2.y,hp2.z,rand(-2,2),rand(1,3),rand(-2,2),0.15,0,rand(0.1,0.18),1,6,true);',
    'if(Math.random()<0.3) AudioSys.ricochet(hp2.distanceTo(camera.position));',
    'if(def.vehDmg&&hitTank.team!==shooter.team){',
    '// 反坦克枪: 真实穿深判定(打薄弱面才有效)',
    'const pen=def.atrPen||(def.vehDmg*0.38);',
    'const res=armorSolve(hitTank,tankInfo,pen);',
    'if(res.pen){',
    'hitTank.takeDmg(def.vehDmg,shooter);',
    '// 小口径击穿也有概率击伤乘员',
    'if(Math.random()<0.3&&hitTank.crewMen){',
    'const alive=hitTank.crewMen.filter(c=>c.alive);',
    'if(alive.length) hitTank.crewKilled(alive[randi(0,alive.length-1)],shooter,false);',
    '}',
    "if(shooter.isPlayer){ showScorePop('穿透! '+res.zone); AudioSys.hitmarkSnd(false); }",
    "} else if(shooter.isPlayer&&Math.random()<0.4) showScorePop('未穿透 ('+res.eff+'mm)');",
    '}'), ''],

  // ⑤ 手雷与坦克互动
  [L('// 手雷与坦克互动: 可以落在车体上随车滑动, 敞篷车可掉进战斗舱内',
    'let onTank=null;',
    'for(const t of tanks){',
    'if(!t.alive) continue;',
    'const dx2=nx-t.pos.x, dz2=nz-t.pos.z;',
    'if(dx2*dx2+dz2*dz2>16) continue;',
    'const snt=Math.sin(-t.yaw), cst=Math.cos(-t.yaw);',
    'const lx=dx2*cst+dz2*snt, lz=-dx2*snt+dz2*cst;',
    'const hz2=t.def.hullL/2+0.2;',
    'if(Math.abs(lx)<2.1&&Math.abs(lz)<hz2){',
    'const deckY=t.pos.y+(t.def.openTop?1.6:1.75);',
    '// 敞篷: 落入战斗室 → 直接在舱内起爆',
    'if(t.def.openTop&&t.team!==n.team&&Math.abs(lx)<1.1&&ny<t.pos.y+2.4&&Math.abs(lz-(t.def.casemate?-0.3:0))<1.5){',
    'n.fuse=Math.min(n.fuse,0.02);',
    'n.insideTank=t;',
    'onTank=t;',
    'break;',
    '}',
    'if(ny<=deckY+0.1&&n.vel.y<0){',
    '// 停在车体顶面, 跟随坦克移动',
    'n.pos.y=deckY+0.06;',
    'n.vel.y*=-0.25;',
    'n.vel.x=t.vel*Math.sin(t.yaw)*0.9; n.vel.z=t.vel*Math.cos(t.yaw)*0.9;',
    'n.restTank=t;',
    'bounced=true;',
    'onTank=t;',
    '}',
    '}',
    'break;',
    '}'), ''],

  // ⑥ 手雷/迫击炮贴坦克引爆
  [L('if(n.at||n.bomb||n.mortar){',
    'for(const t of tanks){',
    'if(!t.alive||t.team===n.team) continue;',
    'if(Math.hypot(nx-t.pos.x,nz-t.pos.z)<2.6&&ny<t.pos.y+2.6){ n.fuse=0; bounced=false; break; }',
    '}',
    '}'), ''],
];

let bad = 0;
for (const [f] of J) {
  const n = s.split(f).length - 1;
  console.log((n === 1 ? '✅' : '❌') + ' ' + n + '  ' + f.slice(0, 46).replace(/\r?\n/g, '⏎'));
  if (n !== 1) bad++;
}
if (bad) { console.log('有 ' + bad + ' 处未命中，未写入。'); process.exit(1); }
for (const [f, t] of J) s = s.split(f).join(t);
fs.writeFileSync(P, s, 'utf8');
console.log('18_ballistics.js 已更新');
