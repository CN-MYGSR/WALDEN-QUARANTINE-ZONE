// 爆闪手电 (2026-09-19)
// 需求: 装备后 G 键不再是开关手电, 而是触发爆闪 —— 快速闪 10 次;
//       范围内 NPC 暂时无法移动/行动; 玩家屏幕纯白。
const fs = require('fs');
const path = require('path');
const R = f => path.resolve(__dirname, '..', f);
let ok = true;

function rep(rel, jobs, label) {
  const raw = fs.readFileSync(R(rel), 'utf8');
  const eol = raw.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  const L = (...a) => a.join(eol) + eol;
  let bad = 0;
  for (const [from] of jobs) {
    const t = typeof from === 'function' ? from(L) : from;
    if (raw.split(t).length - 1 !== 1) { console.log('  ❌ ' + rel + '  ' + t.slice(0, 56).replace(/\r?\n/g, '⏎')); bad++; }
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

// ================= 14b_weapon_mods.js =================
rep('js/14b_weapon_mods.js', [
  [(L) => L("  light_laser:      { slot:'light', name:'激光指示器', desc:'局内按 G 开关·红色光柱与落点·不照亮环境也不暴露自己', icon:'●', affects:{}, cost:300 },"),
    (L) => L("  light_laser:      { slot:'light', name:'激光指示器', desc:'局内按 G 开关·红色光柱与落点·不照亮环境也不暴露自己', icon:'●', affects:{}, cost:300 },",
      "  light_strobe:     { slot:'light', name:'爆闪手电',   desc:'局内按 G 触发爆闪·连闪 10 次·范围内敌人短暂失能·自己也晃眼', icon:'✹', affects:{}, cost:780 },")],
  ["  a.light=['light_none','light_flash','light_laser'];",
   "  a.light=['light_none','light_flash','light_laser','light_strobe'];"],
  ["function getModSlots(key) { return MOD_AVAIL[key] || { optic:['optic_iron'], muzzle:['muzzle_standard'], mag:['mag_standard'], gear:['gear_none'], light:['light_none','light_flash','light_laser'] }; }",
   "function getModSlots(key) { return MOD_AVAIL[key] || { optic:['optic_iron'], muzzle:['muzzle_standard'], mag:['mag_standard'], gear:['gear_none'], light:['light_none','light_flash','light_laser','light_strobe'] }; }"],
  // 爆闪手电外观: 比手电更粗的头 + 一圈散热槽, 镜片更大 (镜片颜色由 15c 控制闪灭)
  [(L) => L("  // 激光指示器: 与手电同槽位(互斥)。筒身更短更细, 前端红色镜片 + 侧面拨杆开关",
    "  if(getModChoice(key, 'light') === 'light_laser') {"),
    (L) => L('  // 爆闪手电: 与手电同槽位(互斥)。灯头明显更粗(大反光碗), 镜片更大更亮',
      "  if(getModChoice(key, 'light') === 'light_strobe') {",
      "    const tl = clamp(Math.abs(muzz.z) * 0.15, 0.042, 0.070);",
      "    const rr = 0.0135 * (0.55 + 0.45 * tl / 0.070);",
      "    const bx = -0.030, by = muzz.y + 0.012, bz = muzz.z + tl * 1.35 + 0.012;",
      '    const tube = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr * 1.06, tl, 8), gm);',
      '    tube.position.set(bx, by, bz); tube.rotation.x = HPI; G.add(tube);',
      '    // 粗灯头 + 前端喇叭口 (爆闪灯的典型外形)',
      '    const head = new THREE.Mesh(new THREE.CylinderGeometry(rr * 1.75, rr * 1.1, tl * 0.42, 10), gl);',
      '    head.position.set(bx, by, bz - tl * 0.72); head.rotation.x = HPI; G.add(head);',
      '    const rim = new THREE.Mesh(new THREE.TorusGeometry(rr * 1.72, rr * 0.16, 6, 12), gl);',
      '    rim.position.set(bx, by, bz - tl * 0.93); G.add(rim);',
      '    // 散热槽',
      '    for (let i = 0; i < 3; i++) {',
      '      const fin = new THREE.Mesh(new THREE.TorusGeometry(rr * 1.14, rr * 0.09, 5, 10), gl);',
      '      fin.position.set(bx, by, bz - tl * (0.28 + i * 0.13)); G.add(fin);',
      '    }',
      '    const lens = new THREE.Mesh(new THREE.CylinderGeometry(rr * 1.6, rr * 1.6, 0.005, 12),',
      '      new THREE.MeshBasicMaterial({color:0x4a4740}));',
      '    lens.position.set(bx, by, bz - tl * 0.95); lens.rotation.x = HPI; G.add(lens);',
      '    parts.flashLens = lens;',
      '  }',
      '',
      '  // 激光指示器: 与手电同槽位(互斥)。筒身更短更细, 前端红色镜片 + 侧面拨杆开关',
      "  if(getModChoice(key, 'light') === 'light_laser') {")],
], '14b_weapon_mods.js 爆闪手电改件');

// ================= 15c_flashlight.js =================
rep('js/15c_flashlight.js', [
  // ① STROBE 状态
  [(L) => L('const FLASH_SPOT_LEN=42, FLASH_SPOT_ANG=0.38, FLASH_SPOT_DECAY=2.0;'),
    (L) => L('const FLASH_SPOT_LEN=42, FLASH_SPOT_ANG=0.38, FLASH_SPOT_DECAY=2.0;',
      '',
      '// ---- 爆闪手电 (改件 light_strobe) ----',
      '// 与普通手电的区别: **不能常亮** —— 按 G 只触发一次爆闪。',
      '// 闪 10 次; 范围内 + 视线内的敌人短暂失能; 自己也晃眼 (白屏)。',
      'const STROBE={',
      '  t:0,            // 本次爆闪剩余时间',
      '  cd:0,           // 冷却',
      '  flashes:10,     // 闪几次',
      '  dur:1.6,        // 整段时长(秒)',
      '  cdMax:12,       // 冷却(秒)',
      '  range:15,       // 影响距离',
      '  cos:Math.cos(0.62),  // 影响半角 (~35.5°)',
      '  stun:2.6,       // 敌人失能时长(秒)',
      '  blindT:0,       // 玩家白屏剩余时间',
      '  lastN:0,        // 上一帧已经闪了几次 (用来数 10 次)',
      '};')],
  // ② flashToggle: 爆闪手电走另一条路
  [(L) => L('function flashToggle(){',
    '  const mod=lightModOf();',
    "  if(mod!=='light_flash'&&mod!=='light_laser'){",
    "    if(typeof showScorePop==='function') showScorePop('当前武器未安装『战术手电』或『激光指示器』');",
    '    return false;',
    '  }'),
    (L) => L('function flashToggle(){',
      '  const mod=lightModOf();',
      '  // 爆闪手电: 不常亮, G = 触发爆闪',
      "  if(mod==='light_strobe'){ strobeFire(); return true; }",
      "  if(mod!=='light_flash'&&mod!=='light_laser'){",
      "    if(typeof showScorePop==='function') showScorePop('当前武器未安装照明改件');",
      '    return false;',
      '  }')],
  // ③ 爆闪实现 + 每帧更新
  [(L) => L('const _flV=new THREE.Vector3(), _flFrom=new THREE.Vector3(0,0,-1), _flBeam=new THREE.Vector3(0,0,-1);'),
    (L) => L('// ---- 爆闪: 触发 ----',
      'function strobeFire(){',
      '  if(!flashHandheld()){ if(typeof showScorePop===\'function\') showScorePop(\'手持武器时才能用爆闪\'); return false; }',
      '  if(STROBE.t>0) return false;',
      '  if(STROBE.cd>0){ if(typeof showScorePop===\'function\') showScorePop(\'爆闪冷却中 · \'+STROBE.cd.toFixed(1)+\'s\'); return false; }',
      '  STROBE.t=STROBE.dur; STROBE.cd=STROBE.cdMax; STROBE.lastN=0;',
      '  STROBE.blindT=0.42;                       // 自己也晃一下眼',
      '  if(typeof AudioSys!==\'undefined\'&&AudioSys.click) AudioSys.click(2400,0.5,0.06);',
      '  if(typeof showScorePop===\'function\') showScorePop(\'爆闪!\');',
      '  strobeApply();',
      '  // 联机: 让同房间的其他真人也被晃 (见 55_net)',
      '  try{',
      '    if(typeof NET!==\'undefined\'&&NET.room) NET.room.send({t:\'strobe\',x:camera.position.x,y:camera.position.y,z:camera.position.z});',
      '  }catch(e){}',
      '  return true;',
      '}',
      '// ---- 爆闪: 判定范围内 + 视线内的敌人, 使其短暂失能 ----',
      'function strobeApply(){',
      '  const o=camera.position, f=camForward();',
      '  let hit=0;',
      '  for(const s of soldiers){',
      '    if(!s.alive||s.team===player.team||s.netRemote) continue;',
      '    const dx=s.pos.x-o.x, dy=(s.pos.y+1.4)-o.y, dz=s.pos.z-o.z;',
      '    const d=Math.hypot(dx,dy,dz);',
      '    if(d>STROBE.range) continue;',
      '    if((dx*f.x+dy*f.y+dz*f.z)/Math.max(d,0.001)<STROBE.cos) continue;   // 不在光锥内',
      '    // 视线: 被墙挡住就闪不到',
      '    try{ const w=raycastWorld(o, V3(dx/d,dy/d,dz/d), d); if(w&&w.dist<d-0.6) continue; }catch(e){}',
      '    s.stunT=STROBE.stun;',
      '    s.target=null; s.path=null; s.suppression=1.6;',
      '    hit++;',
      '  }',
      '  if(hit>0&&typeof showScorePop===\'function\') showScorePop(\'爆闪命中 \'+hit+\' 名敌人\');',
      '}',
      'function updateStrobe(dt){',
      '  if(STROBE.cd>0) STROBE.cd=Math.max(0,STROBE.cd-dt);',
      '  if(STROBE.blindT>0) STROBE.blindT=Math.max(0,STROBE.blindT-dt);',
      '  const ov=(typeof document!==\'undefined\')?document.getElementById(\'strobeOv\'):null;',
      '  if(STROBE.t>0){',
      '    STROBE.t-=dt;',
      '    const k=1-STROBE.t/STROBE.dur;                 // 0 → 1',
      '    const n=Math.min(STROBE.flashes,Math.floor(k*STROBE.flashes)+1);',
      '    STROBE.lastN=n;',
      '    // 点亮时给主场景一盏爆闪灯 (与手电共用同一盏, 但强度更高)',
      '    if(FLASH.spot){',
      '      const on=(Math.floor(k*STROBE.flashes*2)%2===0);',
      '      FLASH.spot.visible=on&&flashHandheld();',
      '      FLASH.spot.intensity=on?6.5:0;',
      '      const f=camForward();',
      '      FLASH.spot.position.set(camera.position.x,camera.position.y,camera.position.z);',
      '      FLASH.target.position.set(camera.position.x+f.x*20,camera.position.y+f.y*20,camera.position.z+f.z*20);',
      '    }',
      '    if(STROBE.t<=0){ if(FLASH.spot){ FLASH.spot.visible=false; FLASH.spot.intensity=0; } }',
      '  }',
      '  if(ov){',
      '    const a=STROBE.blindT>0?clamp(STROBE.blindT/0.42,0,1):0;',
      '    ov.style.opacity=a.toFixed(3);',
      '  }',
      '}',
      '',
      'const _flV=new THREE.Vector3(), _flFrom=new THREE.Vector3(0,0,-1), _flBeam=new THREE.Vector3(0,0,-1);')],
], '15c_flashlight.js 爆闪');

// ================= 19_bot.js: 眩晕 =================
rep('js/19_bot.js', [
  [(L) => L('this.empT=0;'), (L) => L('this.empT=0;\nthis.stunT=0;   // 被爆闪晃到后的失能计时 (见 15c_flashlight)')],
  [(L) => L('update(dt){', 'if(!this.alive){'),
    (L) => L('update(dt){',
      '// 爆闪失能: 站着不动, 不感知也不行动 (但仍会随物理/重力贴地)',
      'if(this.stunT>0&&this.alive){',
      ' this.stunT=Math.max(0,this.stunT-dt);',
      ' this.vel.set(0,0,0);',
      ' this.target=null; this.path=null; this.fireT=Math.max(this.fireT,0.2);',
      ' this.settleAir(dt);',
      ' this.pos.y=standHeight(this.pos.x,this.pos.z,this.pos.y+1);',
      ' this.updateMesh(dt,0);',
      ' return;',
      '}',
      'if(!this.alive){')],
], '19_bot.js 爆闪失能');

console.log(ok ? '\n完成' : '\n有失败');
process.exit(ok ? 0 : 1);
