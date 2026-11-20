// 修复: 瞄具模型沉进机匣里看不见
// 根因: addModVisuals 的瞄具分支拿 adsA.pos.y 当枪身局部高度用, 但 adsFromSight 返回的是
//       {pos:V3(-sx,-sy,zoff)} —— 这个 Y 是**负的**, 表示"把枪往下压 sy, 让准星对上镜头中心",
//       属于相机相对的 ADS 偏移, 不是枪身局部坐标。直接当局部 Y 用 → 镜体落到 y=-0.06,
//       而 m4 的机匣 y 范围是 [-0.11, 0.062] → 整块埋进枪身内部, 看不见。
// 修法: 取 -adsA.pos.y (即 +0.060, 与机瞄顶 sightAnchor 的 0.068 同量级)。
//       注意 ADS 锚点的位移 (adsA.pos.y += ...) 保持不动 —— 那是镜头侧的修正, 本来就要留。
const fs = require('fs');
const F = 'js/14b_weapon_mods.js';
let s = fs.readFileSync(F, 'utf8');
const from = `  const optic = effectiveOptic(key);
  const adsA = parts.anchors && parts.anchors.ads;
  if(!alreadyScoped && adsA && optic !== 'optic_iron') {
    const p0y = adsA.pos.y, p0z = adsA.pos.z;`;
const to = `  const optic = effectiveOptic(key);
  const adsA = parts.anchors && parts.anchors.ads;
  if(!alreadyScoped && adsA && optic !== 'optic_iron') {
    // ⚠️ 这里必须取负: adsFromSight 返回的 pos.y 是"把枪往下压多少"的相机相对偏移(负值),
    // 不是枪身局部高度。直接用会让镜体落到机匣内部 (y≈-0.06, 而枪身 y 范围 [-0.11,0.062]) → 看不见。
    // 取负后 ≈ +0.060, 与机瞄顶 parts.sightAnchor.y(≈0.068) 同量级, 正好坐在机匣上。
    const p0y = -adsA.pos.y, p0z = adsA.pos.z;`;
const n = s.split(from).length - 1;
if (n !== 1) throw new Error('命中 ' + n + ' 次');
fs.writeFileSync(F, s.split(from).join(to), 'utf8');
console.log('已修正瞄具模型的 Y 坐标符号');
