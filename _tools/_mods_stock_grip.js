// 改装系统扩充: 新增「枪托 stock」「握把 grip」两个槽位 + 弹鼓 mag_drum
//
// 现状: 5 槽 optic / muzzle / mag / gear / light (弹匣已有)。
// ⚠️ 槽位定义散落在 **7 个地方**, 漏一处那一处就静默失效 (本项目的老毛病):
//    14b: ALL_MODS / MOD_AVAIL / getModSlots 兜底字面量 / moddedDef 的槽位循环 /
//         modDisplayName / modTotalCost / addModVisuals
//    38_tarkov: MOD_SLOT_NAMES / renderWorkbenchRows 的槽位循环
// 分配策略: 与 gear/light 同一手法 —— **按武器类别自动分配**, 不逐把写 (免得漏):
//    · 手枪(pistol) / 火箭筒·迫击炮(snd==='cannon') → 没有枪托也没有前握把 → 空数组 (工坊不显示这两行)
//    · 其余 (rifle/smg/sniper/mg) → 枪托 4 选 1 · 握把 4 选 1
//    · 弹鼓只给全自动且非机枪 (机枪本身弹容就大)
const fs = require('fs');
const path = require('path');
const R = f => path.join(path.resolve(__dirname, '..'), f);

const NEW_MODS = [
  '  // ---- 枪托 ----',
  '  // 只给有托的武器 (手枪/火箭筒没有枪托, 见下方按类别自动分配)',
  "  stock_standard:   { slot:'stock', name:'标准枪托',     desc:'出厂标配',            icon:'▭', affects:{} },",
  "  stock_heavy:      { slot:'stock', name:'重型枪托',     desc:'后座显著降低·腰射略差', icon:'▬', affects:{ recoil:0.80, recSide:0.86, spreadHip:1.06, kick:0.88 }, cost:420 },",
  "  stock_light:      { slot:'stock', name:'轻量枪托',     desc:'腰射更灵活·后座增大',  icon:'▱', affects:{ spreadHip:0.90, recoil:1.10, kick:1.08 }, cost:380 },",
  "  stock_precision:  { slot:'stock', name:'精确射手枪托', desc:'架枪极稳·腰射最差',    icon:'▮', affects:{ recoil:0.86, recSide:0.80, spreadAds:0.88, spreadHip:1.18 }, cost:620 },",
  '',
  '  // ---- 握把 (前握把, 装在护木下方) ----',
  "  grip_none:        { slot:'grip', name:'无前握把', desc:'不安装前握把',        icon:'○', affects:{} },",
  "  grip_vertical:    { slot:'grip', name:'垂直握把', desc:'压住水平后座·腰射略差', icon:'▯', affects:{ recSide:0.76, recoil:0.95, spreadHip:1.05 }, cost:340 },",
  "  grip_angled:      { slot:'grip', name:'斜角握把', desc:'腰射更稳·换弹略快',    icon:'◣', affects:{ spreadHip:0.85, reload:0.94, recSide:1.05 }, cost:360 },",
  "  grip_tactical:    { slot:'grip', name:'战术握把', desc:'开镜更准·换弹更快',    icon:'▰', affects:{ spreadAds:0.86, reload:0.90, recoil:1.05 }, cost:520 },",
].join('\n');

const VISUALS = [
  '  // ---- 枪托: 以右手锚点为参考 (托在持握手之后), 只在机匣后方加装附件 ----',
  "  const stk = getModChoice(key, 'stock');",
  '  const rhA = parts.anchors && parts.anchors.rHand;',
  "  if(rhA && stk && stk !== 'stock_standard') {",
  '    const sz = rhA.pos.z + 0.18, sy = rhA.pos.y + 0.030;',
  "    if(stk === 'stock_heavy') {",
  '      // 厚重颊托 + 橡胶托底',
  '      bx(gl, 0.036, 0.030, 0.13, 0, sy, sz, G);',
  '      bx(pk, 0.044, 0.075, 0.030, 0, sy - 0.020, sz + 0.075, G);',
  "    } else if(stk === 'stock_light') {",
  '      // 镂空骨架: 两根细杆 + 细托底',
  '      bx(gl, 0.010, 0.012, 0.16, -0.013, sy - 0.004, sz, G);',
  '      bx(gl, 0.010, 0.012, 0.16,  0.013, sy - 0.004, sz, G);',
  '      bx(pk, 0.034, 0.052, 0.020, 0, sy - 0.014, sz + 0.085, G);',
  "    } else if(stk === 'stock_precision') {",
  '      // 可调颊托 + 后支撑脚',
  '      bx(gl, 0.038, 0.026, 0.15, 0, sy + 0.008, sz, G);',
  '      bx(pk, 0.046, 0.085, 0.034, 0, sy - 0.020, sz + 0.082, G);',
  '      cyl(gl, 0.006, 0.006, 0.09, 0, sy - 0.075, sz + 0.070, G, 0);   // rx=0 → 竖直',
  '    }',
  '  }',
  '',
  '  // ---- 握把 (前握把): 以左手锚点为参考 (支撑手本来就握在护木这里) ----',
  "  const gp = getModChoice(key, 'grip');",
  '  const lhA = parts.anchors && parts.anchors.lHand;',
  "  if(lhA && gp && gp !== 'grip_none') {",
  '    const gx = lhA.pos.x, gy = lhA.pos.y - 0.012, gz = lhA.pos.z;',
  "    if(gp === 'grip_vertical') {",
  '      cyl(gl, 0.011, 0.011, 0.075, gx, gy - 0.045, gz, G, 0);          // rx=0 → 竖直',
  '      bx(pk, 0.020, 0.014, 0.034, gx, gy - 0.008, gz, G);',
  "    } else if(gp === 'grip_angled') {",
  '      const ag = bx(gl, 0.018, 0.062, 0.030, gx, gy - 0.040, gz, G);',
  '      ag.rotation.x = 0.42;',
  '      bx(pk, 0.020, 0.012, 0.032, gx, gy - 0.006, gz, G);',
  "    } else if(gp === 'grip_tactical') {",
  '      cyl(gl, 0.013, 0.011, 0.045, gx, gy - 0.030, gz, G, 0);',
  '      bx(pk, 0.024, 0.020, 0.046, gx, gy - 0.056, gz, G);',
  '      bx(gl, 0.008, 0.010, 0.050, gx + 0.016, gy - 0.020, gz + 0.028, G);',
  '    }',
  '  }',
  '',
].join('\n');

const JOBS = [
  // ---- ① 头部注释 ----
  ['js/14b_weapon_mods.js',
    '// 四个槽位: optic(瞄具) · muzzle(枪口) · magazine(弹匣) · gear(战术配件/夜视仪)',
    '// 七个槽位: optic(瞄具) · muzzle(枪口) · mag(弹匣) · stock(枪托) · grip(握把) · gear(战术配件/夜视仪) · light(照明)'],
  // ---- ② ALL_MODS 新增条目 (插在弹匣段之后 / 战术配件之前) ----
  ['js/14b_weapon_mods.js',
    '  // ---- 战术配件 ----',
    '  // ---- 弹匣 · 大容量 ----\n' +
    "  mag_drum:         { slot:'mag', name:'弹鼓',     desc:'弹容量 ×2·换弹最慢·腰射变差', icon:'◍', affects:{ magMul:2.0, reload:1.5, spreadHip:1.10 }, cost:900 },\n" +
    '\n' + NEW_MODS + '\n\n  // ---- 战术配件 ----'],
  // ---- ③ 按类别自动分配 stock/grip + 弹鼓 ----
  ['js/14b_weapon_mods.js',
    "  if(a.optic&&a.optic.length>1) a.optic.push('optic_nvg');\n});",
    "  if(a.optic&&a.optic.length>1) a.optic.push('optic_nvg');\n});\n" +
    '// 枪托 / 握把: 按武器类别自动分配 (与 gear/light 同一手法 —— 不逐把写, 免得漏)\n' +
    '//   · 手枪(pistol) 没有枪托, 前握把也无处可装 → 空数组 = 工坊里不显示这两行\n' +
    '//   · 火箭筒/迫击炮(snd===\'cannon\') 同理\n' +
    '//   · 弹鼓只给全自动且非机枪 (机枪本身弹容就大, 再翻倍太离谱)\n' +
    'Object.entries(MOD_AVAIL).forEach(([k,a])=>{\n' +
    '  const d=WPN_DEFS[k]||{};\n' +
    "  const bare=!!d.pistol||d.snd==='cannon';\n" +
    "  a.stock = bare ? [] : ['stock_standard','stock_heavy','stock_light','stock_precision'];\n" +
    "  a.grip  = bare ? [] : ['grip_none','grip_vertical','grip_angled','grip_tactical'];\n" +
    "  if(d.type==='auto'&&d.snd!=='mg'&&a.mag&&a.mag.indexOf('mag_drum')<0) a.mag.push('mag_drum');\n" +
    '});'],
  // ---- ④ getModSlots 兜底字面量 (两处同步铁律!) ----
  ['js/14b_weapon_mods.js',
    "function getModSlots(key) { return MOD_AVAIL[key] || { optic:['optic_iron'], muzzle:['muzzle_standard'], mag:['mag_standard'], gear:['gear_none','gear_nvg'], light:['light_none','light_flash','light_laser','light_strobe'] }; }",
    "function getModSlots(key) { return MOD_AVAIL[key] || { optic:['optic_iron'], muzzle:['muzzle_standard'], mag:['mag_standard'], stock:['stock_standard','stock_heavy','stock_light','stock_precision'], grip:['grip_none','grip_vertical','grip_angled','grip_tactical'], gear:['gear_none','gear_nvg'], light:['light_none','light_flash','light_laser','light_strobe'] }; }"],
  // ---- ⑤ moddedDef 的槽位循环 ----
  ['js/14b_weapon_mods.js',
    "  ['optic','muzzle','mag'].forEach(slot => {",
    "  ['optic','muzzle','mag','stock','grip'].forEach(slot => {"],
  // ---- ⑥ modDisplayName ----
  ['js/14b_weapon_mods.js',
    "  ['optic','muzzle','mag','gear','light'].forEach(s => {\n" +
    '    const mid = getModChoice(key, s);\n' +
    "    if(mid && mid !== 'optic_iron' && mid !== 'muzzle_standard' && mid !== 'mag_standard' && mid !== 'gear_none' && mid !== 'light_none') {",
    "  ['optic','muzzle','mag','stock','grip','gear','light'].forEach(s => {\n" +
    '    const mid = getModChoice(key, s);\n' +
    "    if(mid && mid !== 'optic_iron' && mid !== 'muzzle_standard' && mid !== 'mag_standard' && mid !== 'stock_standard' && mid !== 'grip_none' && mid !== 'gear_none' && mid !== 'light_none') {"],
  // ---- ⑦ modTotalCost ----
  ['js/14b_weapon_mods.js',
    "  let total = 0;\n  ['optic','muzzle','mag','gear','light'].forEach(s => {",
    "  let total = 0;\n  ['optic','muzzle','mag','stock','grip','gear','light'].forEach(s => {"],
  // ---- ⑧ addModVisuals 末尾追加枪托/握把外观 ----
  ['js/14b_weapon_mods.js',
    "  } else if(mag === 'mag_quick' && mw) {\n" +
    '    // 快拔弹匣: 底部加装快拔环\n' +
    '    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.018,0.003,6,8), gl);\n' +
    '    ring.position.set(mw.x, mw.y - 0.08, mw.z); G.add(ring);\n' +
    '  }\n}',
    "  } else if(mag === 'mag_quick' && mw) {\n" +
    '    // 快拔弹匣: 底部加装快拔环\n' +
    '    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.018,0.003,6,8), gl);\n' +
    '    ring.position.set(mw.x, mw.y - 0.08, mw.z); G.add(ring);\n' +
    '  } else if(mag === \'mag_drum\' && mw) {\n' +
    '    // 弹鼓: 弹匣井下方一个扁圆柱\n' +
    '    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.052,0.052,0.042,14), pk);\n' +
    '    drum.position.set(mw.x, mw.y - 0.085, mw.z); drum.rotation.z = HPI; G.add(drum);\n' +
    '    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.016,0.016,0.05,10), gl);\n' +
    '    hub.position.set(mw.x, mw.y - 0.085, mw.z); hub.rotation.z = HPI; G.add(hub);\n' +
    '  }\n\n' + VISUALS + '}'],
  // ---- ⑨ 38_tarkov: 槽位中文名 ----
  ['js/38_tarkov.js',
    "const MOD_SLOT_NAMES={optic:'瞄具',muzzle:'枪口',mag:'弹匣',gear:'战术配件',light:'照明'};",
    "const MOD_SLOT_NAMES={optic:'瞄具',muzzle:'枪口',mag:'弹匣',stock:'枪托',grip:'握把',gear:'战术配件',light:'照明'};"],
  // ---- ⑩ 38_tarkov: 工坊渲染的槽位循环 ----
  ['js/38_tarkov.js',
    "['optic','muzzle','mag','gear','light'].forEach(slot=>{",
    "['optic','muzzle','mag','stock','grip','gear','light'].forEach(slot=>{"],
];

let fatal = 0;
const cache = {};
for (const [f] of JOBS) if (!cache[f]) cache[f] = fs.readFileSync(R(f), 'utf8');
for (const [file, from] of JOBS) {
  const eol = cache[file].includes('\r\n') ? '\r\n' : '\n';
  const n = cache[file].split(from.split('\n').join(eol)).length - 1;
  console.log((n === 1 ? '✅' : '❌') + ` ${file}  命中 ${n}/1  «${from.slice(0, 42).replace(/\n/g, '⏎')}»`);
  if (n !== 1) fatal++;
}
if (fatal) { console.log('\n❌ 有 ' + fatal + ' 处未命中, 未写盘'); process.exit(1); }
for (const [file, from, to] of JOBS) {
  let s = fs.readFileSync(R(file), 'utf8');
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  s = s.split(from.split('\n').join(eol)).join(to.split('\n').join(eol));
  fs.writeFileSync(R(file), s, 'utf8');
}
console.log('\n💾 已写盘: ' + [...new Set(JOBS.map(j => j[0]))].join(', '));
