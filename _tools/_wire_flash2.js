// 补丁续跑: 处理 CRLF 文件里未命中的多行补丁
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
function patch(file, pairs) {
  const p = path.join(root, file);
  let s = fs.readFileSync(p, 'utf8');
  const eol = s.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  const rep = [];
  for (const [from, to, expect] of pairs) {
    const F = eol === '\n' ? from : from.split('\n').join(eol);
    const T = eol === '\n' ? to : to.split('\n').join(eol);
    const n = s.split(F).length - 1;
    if (n !== expect) { rep.push(`  !! ${file}: expect ${expect} got ${n} :: ${JSON.stringify(from.slice(0, 70))}`); continue; }
    s = s.split(F).join(T);
    rep.push(`  ok ${file} x${n} (eol=${eol === '\n' ? 'LF' : 'CRLF'})`);
  }
  fs.writeFileSync(p, s);
  return rep;
}
const out = [];

out.push(...patch('js/14b_weapon_mods.js', [
  ["  gear_nvg:         { slot:'gear', name:'夜视仪',   desc:'需仓库持有夜视仪·局内按 N 开关·阵亡丢失', icon:'◐', affects:{}, cost:0 },\n};",
   "  gear_nvg:         { slot:'gear', name:'夜视仪',   desc:'需仓库持有夜视仪·局内按 N 开关·阵亡丢失', icon:'◐', affects:{}, cost:0 },\n"
   + "\n"
   + "  // ---- 照明 ----\n"
   + "  // 手电不改变武器数值, 但会显著暴露自己 (19_bot.perceive 会放宽敌人的视野与侧向角度判定),\n"
   + "  // 属于「用隐蔽性换信息」的改件 —— 楼道/地下/夜战收益最大。\n"
   + "  light_none:       { slot:'light', name:'无照明',   desc:'不安装照明',        icon:'○', affects:{} },\n"
   + "  light_flash:      { slot:'light', name:'战术手电', desc:'局内按 L 开关·照亮前方·同时暴露自身位置', icon:'✦', affects:{}, cost:260 },\n};", 1],
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
   + "  }\n"
   + "\n"
   + "  // 弹匣\n  const mag = getModChoice(key, 'mag');", 1],
]));

out.push(...patch('js/01_data.js', [
  ["cqb:{ sky:['#3f4144','#5c5d5e','#7a7873','#8e8a83','#7e7a72'], fog:0x6f6e69,\nhemi:[0x9aa0a6,0x3a3733,0.42], sun:0xc8c4b8, sunI:1.05,\nground:0x8f8a82, grassC:0x7d7a5e, leaf:0x5a5c46, roof:0x6e6a63, dead:0.62, ruinAdd:0.72,\nrubbleN:34, snow:false, birds:false, treeN:16, grassMul:0.32, cqb:true },",
   "cqb:{ sky:['#5a5f66','#7c8084','#9c9a94','#b0aca4','#a09b92'], fog:0x8b8a84,\nhemi:[0xbcc4cc,0x55504a,0.62], sun:0xd8d4c6, sunI:1.45,\nground:0xb2ada4, grassC:0x97937b, leaf:0x6e7058, roof:0x8a857c, dead:0.62, ruinAdd:0.72,\nrubbleN:34, snow:false, birds:false, treeN:16, grassMul:0.32, cqb:true, vigA:0.24 },", 1],
  ["ground:0xc6c8c4, grassC:0x8f9484, leaf:0x5e6350, roof:0x767b80, dead:0.85, ruinAdd:0.4,\nrubbleN:18, snow:false, birds:true, treeN:10, grassMul:0.16, cqb:true },",
   "ground:0xc6c8c4, grassC:0x8f9484, leaf:0x5e6350, roof:0x767b80, dead:0.85, ruinAdd:0.4,\nrubbleN:18, snow:false, birds:true, treeN:10, grassMul:0.16, cqb:true, vigA:0.32 },", 1],
]));

console.log(out.join('\n'));
