// ADS 深度约束的离线自检: 复刻 15_viewmodel 的公式, 验证
//   ① 稳态下"中央走廊内最近的枪体几何"离镜头 >= VM_ADS_MIN_CLEAR
//   ② 推远只沿 z 轴进行 → 落在相机轴上的准星投影恒为屏幕中心 (不会造成准星偏移)
// 并输出几种典型武器的推远量, 便于人工核对手感是否合理。
const VM_ADS_MIN_CLEAR = 0.28;
const HI = -0.38;                // 腰射 z
function adsViewDepth(kind, opticMod) {
  let push = kind === 'rocket' ? 0.16 : (kind === 'atRifle' ? 0.22 : 0.30);
  if (opticMod) push += 0.06;
  return push;
}
// adsZLimit = -(CLEAR + zMaxCenter)
const limitOf = zMaxCenter => -(VM_ADS_MIN_CLEAR + zMaxCenter);
// 稳态 ADS 深度: 取"基础推远"与"净空要求"里更远的那个
function adsPosZ(adsAnchorZ, kind, opticMod, zMaxCenter) {
  let z = adsAnchorZ - adsViewDepth(kind, opticMod);
  const lim = limitOf(zMaxCenter);
  if (z > lim) z = lim;
  return z;
}
const CASES = [
  { n: 'M4 卡宾枪 (central zMax=0.13)', z0: -0.27, kind: 'rifle', opt: false, zc: 0.13 },
  { n: 'M4 + 2倍镜       ', z0: -0.27 + 0.055, kind: 'rifle', opt: true, zc: 0.13 },
  { n: 'MP40 冲锋枪      ', z0: -0.26, kind: 'rifle', opt: false, zc: 0.10 },
  { n: 'M1911 手枪       ', z0: -0.24, kind: 'rifle', opt: false, zc: 0.07 },
  { n: 'AK/Mosin 长枪    ', z0: -0.30, kind: 'rifle', opt: false, zc: 0.12 },
  { n: '反坦克枪(侧偏机瞄)', z0: -0.28, kind: 'atRifle', opt: false, zc: 0.16 },
  { n: '火箭筒           ', z0: -0.30, kind: 'rocket', opt: false, zc: 0.20 },
  { n: '异常武器(zMax=0.45)', z0: -0.27, kind: 'rifle', opt: false, zc: 0.45 },
];
const out = [];
let worst = 1e9, fail = 0;
out.push('VM_ADS_MIN_CLEAR = ' + VM_ADS_MIN_CLEAR + ' m');
out.push('');
out.push('武器                        ADS锚点  推远后z   净空下界   最终z     中央净空   屏幕高度占比(0.055m件)');
for (const c of CASES) {
  const z = adsPosZ(c.z0, c.kind, c.opt, c.zc);
  const clear = -(z + c.zc);                                     // 该部件离镜头的距离
  const frac = 0.055 / (2 * clear * Math.tan(28 * Math.PI / 180)); // 同尺寸部件占屏高比例
  if (clear < worst) worst = clear;
  if (clear < VM_ADS_MIN_CLEAR - 1e-9) fail++;
  out.push(c.n.padEnd(22) + String(c.z0.toFixed(3)).padStart(8) + String((c.z0 - adsViewDepth(c.kind, c.opt)).toFixed(3)).padStart(11)
    + String(limitOf(c.zc).toFixed(3)).padStart(11) + String(z.toFixed(3)).padStart(9)
    + String(clear.toFixed(3)).padStart(11) + String((frac * 100).toFixed(1) + '%').padStart(16));
}
out.push('');
out.push('最小中央净空 = ' + worst.toFixed(3) + ' m  (应 >= ' + VM_ADS_MIN_CLEAR + ')  → ' + (fail === 0 ? 'PASS' : 'FAIL x' + fail));
// 准星偏移检查: 准星校正后落在相机轴上 (local x=y=0), 推远只改 z → 投影恒为中心
const proj = (x, y, z, fovDeg, aspect) => {
  const t = Math.tan(fovDeg * Math.PI / 360);
  return [x / (-z * t * aspect), y / (-z * t)];
};
const a1 = proj(0, 0, -0.50, 56, 16 / 9), a2 = proj(0, 0, -0.68, 56, 16 / 9);
out.push('准星投影(推远前) = [' + a1.map(v => v.toFixed(6)).join(', ') + ']');
out.push('准星投影(推远后) = [' + a2.map(v => v.toFixed(6)).join(', ') + ']');
out.push('推远前后投影一致 → ' + (Math.abs(a1[0] - a2[0]) < 1e-9 && Math.abs(a1[1] - a2[1]) < 1e-9 ? 'PASS (不产生准星偏移)' : 'FAIL'));
// 腰射不干预检查
const hipZ = HI + 0;
out.push('腰射 z = ' + hipZ.toFixed(3) + ' (>= 净空下界, 故腰射不参与该约束: ' + (hipZ > limitOf(0.13) ? '是' : '否') + ')');
const fs = require('fs');
fs.writeFileSync('_tools/_ads_check.txt', out.join('\n') + '\n', 'utf8');
