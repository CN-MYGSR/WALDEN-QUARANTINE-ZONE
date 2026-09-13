// 一次性接线: 街区提亮 + 战术手电改件
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
function patch(file, pairs) {
  const p = path.join(root, file);
  let s = fs.readFileSync(p, 'utf8');
  const rep = [];
  for (const [from, to, expect] of pairs) {
    const n = s.split(from).length - 1;
    if (n !== expect) { rep.push(`  !! ${file}: expect ${expect} got ${n} :: ${JSON.stringify(from.slice(0, 70))}`); continue; }
    s = s.split(from).join(to);
    rep.push(`  ok ${file} x${n}`);
  }
  fs.writeFileSync(p, s);
  return rep;
}
const out = [];

// ---------- 1) index.html: 脚本 + HUD 元素 ----------
out.push(...patch('index.html', [
  ['<script src="js/15_viewmodel.js?v=20260913i"></script>',
   '<script src="js/15_viewmodel.js?v=20260913i"></script>\n<script src="js/15c_flashlight.js?v=20260913i"></script>', 1],
  ['<div id="carryInd"></div>', '<div id="carryInd"></div>\n<div id="flashInd"></div>', 1],
]));

// ---------- 2) css: 暗角变量化 + 手电指示器 ----------
out.push(...patch('css/style.css', [
  ['#vig { position:absolute; inset:0; background:radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,.38) 100%); }',
   '#vig { position:absolute; inset:0; background:radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,var(--vigA,.38)) 100%); }', 1],
  ['#carryInd.low { color:#7fe0c0; background:rgba(0,10,8,.45); padding:3px 10px; border-radius:3px; border:1px solid rgba(120,230,190,.4); }',
   '#carryInd.low { color:#7fe0c0; background:rgba(0,10,8,.45); padding:3px 10px; border-radius:3px; border:1px solid rgba(120,230,190,.4); }\n'
   + '#flashInd { position:absolute; left:50%; top:78%; transform:translateX(-50%); font-size:12px; letter-spacing:2px; color:rgba(255,236,180,.85); text-shadow:0 1px 3px #000; display:none; pointer-events:none; white-space:nowrap; }\n'
   + '#flashInd.on { color:#fff2c8; background:rgba(40,30,0,.45); padding:3px 10px; border-radius:3px; border:1px solid rgba(255,225,150,.45); }\n'
   + 'body.mobile #flashInd { display:none !important; }', 1],
]));

// ---------- 3) 03_renderer.js: 按主题调暗角强度 ----------
out.push(...patch('js/03_renderer.js', [
  ["vmScene.add(new THREE.HemisphereLight(0xcfd8e8, 0x5a5844, 0.9));",
   "// 暗角强度: 街区/港口本就昏暗, 再叠一层重暗角会看不清墙角 —— 按主题调轻 (见 css #vig)\n"
   + "try{ document.documentElement.style.setProperty('--vigA', String(THEME.vigA!=null?THEME.vigA:0.38)); }catch(e){}\n"
   + "vmScene.add(new THREE.HemisphereLight(0xcfd8e8, 0x5a5844, 0.9));", 1],
]));

// ---------- 4) 14b_weapon_mods.js: 照明槽位 ----------
out.push(...patch('js/14b_weapon_mods.js', [
  ["  gear_nvg:         { slot:'gear', name:'夜视仪',   desc:'需仓库持有夜视仪·局内按 N 开关·阵亡丢失', icon:'◐', affects:{}, cost:0 },\n};",
   "  gear_nvg:         { slot:'gear', name:'夜视仪',   desc:'需仓库持有夜视仪·局内按 N 开关·阵亡丢失', icon:'◐', affects:{}, cost:0 },\n"
   + "\n"
   + "  // ---- 照明 ----\n"
   + "  // 手电不改变武器数值, 但会显著暴露自己 (19_bot.perceive 会放宽敌人的视野与侧向角度判定),\n"
   + "  // 属于「用隐蔽性换信息」的改件 —— 楼道/地下/夜战收益最大。\n"
   + "  light_none:       { slot:'light', name:'无照明',   desc:'不安装照明',        icon:'○', affects:{} },\n"
   + "  light_flash:      { slot:'light', name:'战术手电', desc:'局内按 L 开关·照亮前方·同时暴露自身位置', icon:'✦', affects:{}, cost:260 },\n};", 1],
  ["  a.gear=['gear_none','gear_nvg'];",
   "  a.gear=['gear_none','gear_nvg'];\n  a.light=['light_none','light_flash'];", 1],
  ["function getModSlots(key) { return MOD_AVAIL[key] || { optic:['optic_iron'], muzzle:['muzzle_standard'], mag:['mag_standard'], gear:['gear_none'] }; }",
   "function getModSlots(key) { return MOD_AVAIL[key] || { optic:['optic_iron'], muzzle:['muzzle_standard'], mag:['mag_standard'], gear:['gear_none'], light:['light_none','light_flash'] }; }", 1],
  ["  ['optic','muzzle','mag','gear'].forEach(s => {\n    const mid = getModChoice(key, s);\n    if(mid && mid !== 'optic_iron' && mid !== 'muzzle_standard' && mid !== 'mag_standard' && mid !== 'gear_none') {",
   "  ['optic','muzzle','mag','gear','light'].forEach(s => {\n    const mid = getModChoice(key, s);\n    if(mid && mid !== 'optic_iron' && mid !== 'muzzle_standard' && mid !== 'mag_standard' && mid !== 'gear_none' && mid !== 'light_none') {", 1],
  ["  ['optic','muzzle','mag','gear'].forEach(s => {\n    const mid = getModChoice(key, s);\n    if(mid && ALL_MODS[mid].cost) total += ALL_MODS[mid].cost;",
   "  ['optic','muzzle','mag','gear','light'].forEach(s => {\n    const mid = getModChoice(key, s);\n    if(mid && ALL_MODS[mid].cost) total += ALL_MODS[mid].cost;", 1],
  ["  // 弹匣\n  const mag = getModChoice(key, 'mag');",
   "  // 战术手电: 枪身左前方筒身 + 镜片 (镜片颜色由 15c_flashlight 每帧控制亮/灭)\n"
   + "  if(getModChoice(key, 'light') === 'light_flash') {\n"
   + "    const tl = clamp(Math.abs(muzz.z) * 0.16, 0.045, 0.075);   // 短枪(手枪)自动缩短\n"
   + "    const rr = 0.0115 * (0.55 + 0.45 * tl / 0.075);\n"
   + "    const bx = -0.030, by = muzz.y + 0.012, bz = muzz.z + tl * 1.35 + 0.012;\n"
   + "    const tube = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr * 1.08, tl, 8), gm);\n"
   + "    tube.position.set(bx, by, bz); tube.rotation.x = HPI; G.add(tube);\n"
   + "    const head = new THREE.Mesh(new THREE.CylinderGeometry(rr * 1.26, rr, tl * 0.28, 8), gl);\n"
   + "    head.position.set(bx, by, bz - tl * 0.64); head.rotation.x = HPI; G.add(head);\n"
   + "    const ring = new THREE.Mesh(new THREE.TorusGeometry(rr * 1.18, rr * 0.19, 6, 10), gl);\n"
   + "    ring.position.set(bx, by, bz - tl * 0.42); G.add(ring);\n"
   + "    const lens = new THREE.Mesh(new THREE.CylinderGeometry(rr * 1.02, rr * 1.02, 0.004, 10),\n"
   + "      new THREE.MeshBasicMaterial({color:0x4a4740}));\n"
   + "    lens.position.set(bx, by, bz - tl * 0.79); lens.rotation.x = HPI; G.add(lens);\n"
   + "    parts.flashLens = lens;\n"
   + "  }\n\n"
   + "  // 弹匣\n  const mag = getModChoice(key, 'mag');", 1],
]));

// ---------- 5) 38_tarkov.js: 工坊 UI 槽位 ----------
out.push(...patch('js/38_tarkov.js', [
  ["const MOD_SLOT_NAMES={optic:'瞄具',muzzle:'枪口',mag:'弹匣',gear:'战术配件'};",
   "const MOD_SLOT_NAMES={optic:'瞄具',muzzle:'枪口',mag:'弹匣',gear:'战术配件',light:'照明'};", 1],
  ["['optic','muzzle','mag','gear'].forEach(slot=>{\nconst list=avail[slot]||[];",
   "['optic','muzzle','mag','gear','light'].forEach(slot=>{\nconst list=avail[slot]||[];", 1],
]));

// ---------- 6) 24_input.js: L 键 ----------
out.push(...patch('js/24_input.js', [
  ["if(e.code==='KeyN'&&typeof NVG!=='undefined') NVG.toggle();",
   "if(e.code==='KeyN'&&typeof NVG!=='undefined') NVG.toggle();\nif(e.code==='KeyL'&&typeof flashToggle==='function') flashToggle();", 1],
]));

// ---------- 7) 30_main.js: 每帧更新 ----------
out.push(...patch('js/30_main.js', [
  ["player.mouseDX*=Math.pow(0.0001,dt*3);",
   "if(typeof updateFlashlight==='function') updateFlashlight(dt);\nplayer.mouseDX*=Math.pow(0.0001,dt*3);", 1],
]));

// ---------- 8) 28_hud.js: 手电指示 ----------
out.push(...patch('js/28_hud.js', [
  ["} else ci.style.display='none';\nconst ch=el('crosshair');",
   "} else ci.style.display='none';\n"
   + "// 战术手电指示 (状态由 15c_flashlight.updateFlashlight 每帧刷新)\n"
   + "const fi=el('flashInd');\n"
   + "if(fi){\n"
   + "if(player.alive&&!player.onVehicle&&typeof FLASH!=='undefined'&&FLASH.hasMod){\n"
   + "fi.style.display='block'; fi.className=FLASH.on?'on':''; fi.textContent=FLASH.on?'✦ 手电 · 开 [L]':'[L] 战术手电';\n"
   + "} else fi.style.display='none';\n"
   + "}\nconst ch=el('crosshair');", 1],
]));

// ---------- 9) 19_bot.js: 手电暴露 ----------
out.push(...patch('js/19_bot.js', [
  ["const d=Math.hypot(dx,dz);\nif(d>viewD) continue;\nconst ang=Math.atan2(dx,dz);\nconst isCur=(e===this.target&&nowT-this.lastSeenT<3);\nif(!isCur&&Math.abs(angDiff(this.yaw,ang))>1.15) continue;\nconst heard=d<9||(e.lastFiredT&&nowT-e.lastFiredT<1.5&&d<70);\nif(!isCur&&!heard&&d>viewD*0.85&&e.crouch) continue;",
   "const d=Math.hypot(dx,dz);\n"
   + "// 战术手电: 开灯的玩家在敌人眼里更醒目 —— 看得更远、更不容易被侧身/蹲伏甩掉\n"
   + "// (FLASH 见 15c_flashlight.js; 只在手电点亮且目标正是玩家时才做锥体判定)\n"
   + "const flLit=(e.isPlayer&&typeof FLASH!=='undefined')?FLASH.botExpose(this):false;\n"
   + "const vD=flLit?viewD*FLASH.exposeMul:viewD;\n"
   + "if(d>vD) continue;\n"
   + "const ang=Math.atan2(dx,dz);\n"
   + "const isCur=(e===this.target&&nowT-this.lastSeenT<3);\n"
   + "if(!isCur&&!flLit&&Math.abs(angDiff(this.yaw,ang))>1.15) continue;\n"
   + "const heard=flLit||d<9||(e.lastFiredT&&nowT-e.lastFiredT<1.5&&d<70);\n"
   + "if(!isCur&&!heard&&d>vD*0.85&&e.crouch) continue;", 1],
]));

// ---------- 10) 01_data.js: 街区提亮 + 暗角 ----------
out.push(...patch('js/01_data.js', [
  ["cqb:{ sky:['#3f4144','#5c5d5e','#7a7873','#8e8a83','#7e7a72'], fog:0x6f6e69,\nhemi:[0x9aa0a6,0x3a3733,0.42], sun:0xc8c4b8, sunI:1.05,\nground:0x8f8a82, grassC:0x7d7a5e, leaf:0x5a5c46, roof:0x6e6a63, dead:0.62, ruinAdd:0.72,\nrubbleN:34, snow:false, birds:false, treeN:16, grassMul:0.32, cqb:true },",
   "cqb:{ sky:['#5a5f66','#7c8084','#9c9a94','#b0aca4','#a09b92'], fog:0x8b8a84,\nhemi:[0xbcc4cc,0x55504a,0.62], sun:0xd8d4c6, sunI:1.45,\nground:0xb2ada4, grassC:0x97937b, leaf:0x6e7058, roof:0x8a857c, dead:0.62, ruinAdd:0.72,\nrubbleN:34, snow:false, birds:false, treeN:16, grassMul:0.32, cqb:true, vigA:0.24 },", 1],
  ["overcast:{fogFar:0.5,fogNear:14,sun:0.42,hemi:0.55,skyDark:0.34,sight:0.55},",
   "// 注: sight 目前没有任何读取点 (视觉/战术参数里唯一未被消费的字段), 保留以备后续接入 bot 视距。\novercast:{fogFar:0.62,fogNear:20,sun:0.62,hemi:0.74,skyDark:0.24,sight:0.55},", 1],
  ["ground:0xc6c8c4, grassC:0x8f9484, leaf:0x5e6350, roof:0x767b80, dead:0.85, ruinAdd:0.4,\nrubbleN:18, snow:false, birds:true, treeN:10, grassMul:0.16, cqb:true },",
   "ground:0xc6c8c4, grassC:0x8f9484, leaf:0x5e6350, roof:0x767b80, dead:0.85, ruinAdd:0.4,\nrubbleN:18, snow:false, birds:true, treeN:10, grassMul:0.16, cqb:true, vigA:0.32 },", 1],
]));

console.log(out.join('\n'));
