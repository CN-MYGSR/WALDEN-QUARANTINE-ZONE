// 载具清理收尾: 28_hud / 27_gamemode / 26_camera / 24_input / 29_menus / 47_units /
//              39_quests / 41_raidloot / 22_emplacements / 42_shake / 01_data
const fs = require('fs');
const path = require('path');
const R = f => path.resolve(__dirname, '..', 'js', f);

function read(f) { const s = fs.readFileSync(R(f), 'utf8'); return { s, eol: s.indexOf('\r\n') >= 0 ? '\r\n' : '\n' }; }
function write(f, s) { fs.writeFileSync(R(f), s, 'utf8'); }

// 通用: 精确文本替换(带命中数断言)
function rep(f, jobs, label) {
  const { s, eol } = read(f);
  const L = (...a) => a.join(eol) + eol;
  let bad = 0;
  for (const [from] of jobs) {
    const t = typeof from === 'function' ? from(L) : from;
    const n = s.split(t).length - 1;
    if (n !== 1) { console.log('  ❌ ' + n + '  ' + t.slice(0, 46).replace(/\r?\n/g, '⏎')); bad++; }
  }
  if (bad) { console.log('❌ ' + label + ' 有 ' + bad + ' 处未命中'); return false; }
  let out = s;
  for (const [from, to] of jobs) {
    const f2 = typeof from === 'function' ? from(L) : from;
    const t2 = typeof to === 'function' ? to(L) : to;
    out = out.split(f2).join(t2);
  }
  write(f, out);
  console.log('✅ ' + label);
  return true;
}

let ok = true;

// ---------- 28_hud.js ----------
ok = rep('28_hud.js', [
  [(L) => L('for(const t of tanks){',
    'if(!t.alive) continue;',
    'const [px,py]=toMap(t.pos.x,t.pos.z);',
    'if(px<-8||py<-8||px>S+8||py>S+8) continue;',
    "mmC.fillStyle=t.team===0?'#6da5e8':'#e87a68';",
    'mmC.fillRect(px-4,py-4,8,8);',
    "mmC.strokeStyle='#fff'; mmC.lineWidth=1; mmC.strokeRect(px-4,py-4,8,8);",
    '}'), ''],
  [(L) => L('for(const pl of planes){',
    'if(!pl.alive) continue;',
    'const [px,py]=toMap(pl.pos.x,pl.pos.z);',
    'if(px<-8||py<-8||px>S+8||py>S+8) continue;',
    'mmC.save();',
    'mmC.translate(px,py);',
    'mmC.rotate(-(pl.yaw)+(player.alive?player.yaw:0)+Math.PI);',
    "mmC.fillStyle=pl.team===0?'#9dc5f8':'#f8a898';",
    'mmC.beginPath(); mmC.moveTo(0,-5); mmC.lineTo(4,4); mmC.lineTo(0,2); mmC.lineTo(-4,4); mmC.closePath(); mmC.fill();',
    'mmC.restore();',
    '}'), ''],
  [(L) => L('// 坦克',
    'for(const t of tanks){',
    'if(!t.alive) continue;',
    'const [px,py]=toM(t.pos.x,t.pos.z);',
    "bmC.fillStyle=t.team===0?'#6da5e8':'#e87a68';",
    'bmC.fillRect(px-5,py-5,10,10);',
    "bmC.strokeStyle='#fff'; bmC.lineWidth=1.5; bmC.strokeRect(px-5,py-5,10,10);",
    '}',
    '// 飞机',
    'for(const pl of planes){',
    'if(!pl.alive) continue;',
    'const [px,py]=toM(pl.pos.x,pl.pos.z);',
    'bmC.save();',
    'bmC.translate(px,py);',
    'bmC.rotate(-(pl.yaw)+Math.PI);',
    "bmC.fillStyle=pl.team===0?'#9dc5f8':'#f8a898';",
    'bmC.beginPath(); bmC.moveTo(0,-7); bmC.lineTo(5,5); bmC.lineTo(0,3); bmC.lineTo(-5,5); bmC.closePath(); bmC.fill();',
    'bmC.restore();',
    '}'), ''],
  [(L) => L("if(!player.onAA) el('leadPip').style.display='none';",
    " if(!(player.onVehicle&&player.onVehicle.kind==='tank')){ el('tankPip').style.display='none'; el('mgPip').style.display='none'; el('tankSight').style.display='none'; }",
    " if(!(player.onVehicle&&player.onVehicle.kind==='plane'&&player.planeView)) el('planeSight').style.display='none';"),
    (L) => L("if(!player.onAA) el('leadPip').style.display='none';",
      " el('mgPip').style.display='none';")],
], '28_hud.js') && ok;

// ---------- 27_gamemode.js ----------
ok = rep('27_gamemode.js', [
  [(L) => L('for(const t of tanks){',
    'if(!t.alive) continue;',
    'if(Math.hypot(t.pos.x-f.x,t.pos.z-f.z)<f.r){',
    'if(t.team===0)c0++; else c1++;',
    '}',
    '}'), ''],
], '27_gamemode.js') && ok;

// ---------- 26_camera.js ----------
ok = rep('26_camera.js', [
  [(L) => L('if(p.chute){',
    '// 跳伞第三人称: 镜头后拉并微微下视, 能看到降落伞和周围环境',
    'const trg=V3(p.pos.x,p.pos.y+0.8,p.pos.z);',
    'const behind=V3(-Math.sin(p.yaw)*Math.cos(p.pitch),Math.sin(p.pitch)+0.3,-Math.cos(p.yaw)*Math.cos(p.pitch));',
    'const hit=raycastWorld(trg,behind.clone().negate().normalize(),7.5);',
    'const dd=hit?Math.max(2.8,hit.dist-0.5):6.5;',
    'camera.position.set(trg.x+behind.x*dd, trg.y+behind.y*dd, trg.z+behind.z*dd);',
    'camera.lookAt(trg.x,trg.y,trg.z);',
    'camera.fov=dampF(camera.fov,68,8,dt);',
    'camera.updateProjectionMatrix();',
    'return;',
    '}'), ''],
], '26_camera.js') && ok;

// ---------- 24_input.js ----------
ok = rep('24_input.js', [
  ['function handsFreeVeh(){ return !player.onVehicle||(typeof isApcPassenger===\'function\'&&isApcPassenger()); }',
    'function handsFreeVeh(){ return !player.onVehicle; }'],
  [(L) => L('// ===== 降落伞模型 (玩家跳伞 / Bot 空降) =====',
    'let playerChuteMesh=null;',
    'function chuteLine(g,from,to,mat){',
    'const d=V3(to.x-from.x,to.y-from.y,to.z-from.z);',
    'const len=d.length();',
    'if(len<0.01) return;',
    'const m=new THREE.Mesh(new THREE.CylinderGeometry(0.013,0.013,len,3),mat);',
    'm.position.set(from.x+d.x*0.5,from.y+d.y*0.5,from.z+d.z*0.5);',
    'm.quaternion.setFromUnitVectors(V3(0,1,0),d.normalize());',
    'g.add(m);',
    '}',
    'function mkChute(scale=1){',
    'const g=new THREE.Group();',
    'const mat=new THREE.MeshLambertMaterial({color:0x9aa08c,side:THREE.DoubleSide});',
    'const canopy=new THREE.Mesh(new THREE.SphereGeometry(2.3,12,7,0,TAU,0,1.05),mat);',
    'canopy.scale.set(1,0.75,1);',
    'canopy.castShadow=true;',
    'g.add(canopy);',
    'const lm=new THREE.MeshBasicMaterial({color:0x33352c});',
    'const rim=2.3*Math.sin(1.05), rimY=2.3*Math.cos(1.05)*0.75;',
    'for(const a of [0.4,1.97,3.54,5.11]){',
    'chuteLine(g,V3(Math.sin(a)*rim,rimY-0.1,Math.cos(a)*rim),V3(0,-3.3,0),lm);',
    '}',
    'g.scale.setScalar(scale);',
    'return g;',
    '}',
    'function mkChuteForBot(){ return mkChute(0.78); }'), ''],
], '24_input.js') && ok;

// ---------- 29_menus.js ----------
ok = rep('29_menus.js', [
  [(L) => L('// 载具出生',
    'let vehSpawn=null;',
    "if(typeof selectedSpawn==='string'&&selectedSpawn[0]==='V'){",
    'const vehs=[...tanks,...planes].filter(v=>v.team===p.team);',
    'const v=vehs[+selectedSpawn.slice(1)];',
    'if(v&&v.alive&&!v.playerDriven) vehSpawn=v;',
    '}',
    'let sx,sz;',
    'if(vehSpawn){ sx=vehSpawn.pos.x; sz=vehSpawn.pos.z; }',
    "else if(selectedSpawn===-1||typeof selectedSpawn==='string'){ sx=BASES[p.team].x; sz=BASES[p.team].z; }"),
    (L) => L('let sx,sz;',
      "if(selectedSpawn===-1||typeof selectedSpawn==='string'){ sx=BASES[p.team].x; sz=BASES[p.team].z; }")],
  [(L) => L('if(vehSpawn){',
    'if(vehSpawn.crewBot){',
    'const cb=vehSpawn.crewBot;',
    "if(vehSpawn.kind==='plane'){",
    'vehSpawn.crewBot=null;',
    'cb.onVehicle=null;',
    'cb.chuting=true;',
    'cb.pos.set(vehSpawn.pos.x,Math.max(vehSpawn.pos.y-2,heightAt(vehSpawn.pos.x,vehSpawn.pos.z)+3),vehSpawn.pos.z);',
    'if(cb.mesh) cb.mesh.root.visible=true;',
    "cb.path=null; cb.state='idle'; cb.target=null;",
    '} else cb.dismountVehicle(false);',
    '}',
    'vehSpawn.playerDriven=true;',
    "if(vehSpawn.kind==='tank'){ vehSpawn.isAI=false; vehSpawn.vel=0; p.yaw=vehSpawn.yaw+vehSpawn.turretYaw+Math.PI; }",
    'else { p.yaw=vehSpawn.yaw+Math.PI; p.pitch=vehSpawn.pitch; }',
    'p.onVehicle=vehSpawn;',
    'p.pos.copy(vehSpawn.pos);',
    'VM.root.visible=false;',
    "document.getElementById('heatWrap').style.display='block';",
    '}'), ''],
], '29_menus.js') && ok;

// ---------- 47_units.js ----------
ok = rep('47_units.js', [
  [(L) => L(' if(Bot.prototype.spawnInVehicle){',
    '  const _uSpawnV=Bot.prototype.spawnInVehicle;',
    '  Bot.prototype.spawnInVehicle=function(){',
    '   const r=_uSpawnV.apply(this,arguments);',
    '   try{ assignUnit(this); }catch(e){}',
    '   return r;',
    '  };',
    ' }'), ''],
  ['//     · 目标选择: 19_bot perceive() 的 combatants 循环 + TANK_CREW_PROXIES 循环',
    '//     · 目标选择: 19_bot perceive() 的 combatants 循环'],
], '47_units.js') && ok;

// ---------- 39_quests.js ----------
ok = rep('39_quests.js', [
  [' const os=Bot.prototype.spawn, ov=Bot.prototype.spawnInVehicle;',
    ' const os=Bot.prototype.spawn;'],
  [' if(ov) Bot.prototype.spawnInVehicle=function(){ applyPrestigeBot(this); return ov.apply(this,arguments); };\n',
    ''],
], '39_quests.js') && ok;

// ---------- 41_raidloot.js ----------
ok = rep('41_raidloot.js', [
  ['// 模块: GameMode · 调用入口: Bot.prototype.spawn / spawnInVehicle → applyPrestigeBot',
    '// 模块: GameMode · 调用入口: Bot.prototype.spawn → applyPrestigeBot'],
], '41_raidloot.js') && ok;

// ---------- 42_shake.js ----------
ok = rep('42_shake.js', [
  ['// 玩家在载具里时整体衰减 (驾驶坦克/飞机/APC 时减小创伤, 避免视觉过载)',
    '// 大威力武器(火箭筒/反坦克炮)开火时的震颤衰减'],
], '42_shake.js') && ok;

// ---------- 22_emplacements.js ----------
{
  const { s, eol } = read('22_emplacements.js');
  const L = (...a) => a.join(eol) + eol;
  const lines = s.split(eol);
  let a = -1, b = -1;
  for (let i = 0; i < lines.length; i++) if (lines[i].indexOf('function aaGun(x,z){') >= 0) { a = i; break; }
  if (a < 0) { console.log('❌ 22_emplacements.js 找不到 aaGun'); ok = false; }
  else {
    for (let i = a; i < lines.length; i++) if (lines[i].indexOf('AAGUNS.push(') >= 0) { b = i; break; }
    if (b < 0) { console.log('❌ 22_emplacements.js 找不到 AAGUNS.push'); ok = false; }
    else {
      // 注释头两行 + 函数体 + 放置注释
      let st = a;
      if (lines[a - 1] && lines[a - 1].indexOf('//') === 0) st = a - 1;
      if (lines[st - 1] && lines[st - 1].indexOf('//') === 0) st = st - 1;
      let en = b;
      for (let i = b; i < lines.length && i < b + 8; i++) { if (lines[i].indexOf('//') === 0) en = i; else break; }
      console.log('✅ 22_emplacements.js 删除 aaGun 行 ' + (st + 1) + '~' + (en + 1));
      lines.splice(st, en - st + 1, '// 防空炮与 aaGun 已删除 (2026-09-18): 它只用于打飞机, 载具移除后一并清除');
      // AAGUNS 数组声明也清掉引用
      let s2 = lines.join(eol);
      s2 = s2.split('const ATGUNS=[], AAGUNS=[];').join('const ATGUNS=[];');
      fs.writeFileSync(R('22_emplacements.js'), s2, 'utf8');
    }
  }
}

// ---------- 01_data.js: 删掉 FACTIONS 里的 tanks/trucks/planes 数据表 ----------
{
  const { s, eol } = read('01_data.js');
  let out = s;
  let removed = 0;
  for (const key of ['tanks', 'trucks', 'planes']) {
    let guard = 0;
    while (guard++ < 40) {
      const i = out.indexOf(key + ':[{');
      if (i < 0) break;
      // 往前吃掉行首空白
      let st = i; while (st > 0 && out[st - 1] !== '\n') st--;
      // 括号配对找结尾
      let j = out.indexOf('[', i), depth = 0, end = -1;
      for (let k = j; k < out.length; k++) {
        if (out[k] === '[') depth++;
        else if (out[k] === ']') { depth--; if (depth === 0) { end = k; break; } }
      }
      if (end < 0) break;
      // 吃掉尾随逗号 + 行尾
      let e2 = end + 1;
      if (out[e2] === ',') e2++;
      if (out[e2] === '\r') e2++;
      if (out[e2] === '\n') e2++;
      out = out.slice(0, st) + out.slice(e2);
      removed++;
    }
  }
  if (removed < 20) { console.log('❌ 01_data.js 只删了 ' + removed + ' 个数据表(预期 >=20)'); ok = false; }
  else { fs.writeFileSync(R('01_data.js'), out, 'utf8'); console.log('✅ 01_data.js 删除 ' + removed + ' 个载具数据表'); }
}

console.log(ok ? '\n全部完成' : '\n有失败项');
process.exit(ok ? 0 : 1);
