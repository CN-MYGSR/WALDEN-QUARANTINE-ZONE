// UI 换配色: 深灰 + 白为主
// 规则(按 HSV 判):
//   保留 —— ① S<0.05(真中性) ② 红/危险 hue∈[340,360]∪[0,25] 且 V>=0.30
//           ③ 饱和绿 S>=0.30 且 hue∈[90,170] 且 V>=0.30 (友军/成功)
//           ④ 亮蓝 S>=0.25 且 V>=0.45 且 hue∈[195,250] (友军/信息)
//   其余(琥珀金 / 橄榄 / 绿灰 / 暗蓝灰 chrome / 米色) → 同明度的**中性灰** hsl(h,0%,V)
// 用法: node _tools/_retint_ui.js           (只打印映射, 不改文件)
//       node _tools/_retint_ui.js --apply   (真正写入)
//       node _tools/_retint_ui.js --audit   (只报告各文件里还剩哪些非中性色)
//
// ⚠️ JS 里的 3D 材质色是 0xRRGGBB 数字字面量, 本脚本正则只认 '#' 开头 → 天然不碰。
// ⚠️ 故意排除: 01_data(天气主题) / 03_renderer(天空雾) / 04_textures(贴图) /
//    12_weather_fx / 34_nvg(NVG 荧光模式) / 15c_flashlight(激光色) / 07d_lab / 07e_port / 08_world。
// ⚠️ 30c_cutscene.js 也**不能整文件跑** —— 它同时含 3D 海面贴图色(#3a5a66)和 UI 标题色。
//    其中的胜负标题色已手工改（胜利 #ffd77a → #ffffff）。
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.indexOf('--apply') >= 0;
const AUDIT = process.argv.indexOf('--audit') >= 0;

const FILES = [
  'css/style.css',
  'index.html',
  // ---- JS 生成的 UI 颜色 ----
  'js/24_input.js',      // 小队指令标记(攻/守/突击)
  'js/25_player_update.js', // 载具主炮热量条
  'js/27x_xray.js',      // X光击杀回放(canvas)
  'js/28_hud.js',        // HUD + 小地图 + 罗盘 + 大地图 canvas
  'js/29_menus.js',      // 主菜单 / 部署 / ELO 文案
  'js/35_extraction.js', // 撤离结算
  'js/37_meta.js',       // 仓库 / 军械库
  'js/38_tarkov.js',     // 装备 / 状态 / 改件面板
  'js/39_quests.js',     // 任务 / 重生
  'js/40_raidshop.js',   // 局内商店
  'js/43_maps.js',       // 地图卡片
  'js/46_throwables.js', // 投掷物面板
  'js/51_settings.js',   // 设置 / 键位 / 布局编辑
];

function hex2rgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgb2hex(r, g, b) {
  const f = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + f(r) + f(g) + f(b);
}
function hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 1e-6) {
    if (mx === r) h = 60 * (((g - b) / d) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  const s = mx < 1e-6 ? 0 : d / mx;
  return [h, s, mx];
}
// 中性灰: 保持 V(=max), 三通道都设成 V → 视觉亮度基本不变
function neutralize(r, g, b) {
  const v = hsv(r, g, b)[2];
  const n = v * 255;
  return [n, n, n];
}
function keep(h, s, v) {
  if (s < 0.05) return 'S<0.05 真中性';
  if ((h >= 340 || h <= 25) && v >= 0.30) return '红/危险';
  if (s >= 0.30 && h >= 90 && h <= 170 && v >= 0.30) return '饱和绿=友军/成功';
  if (s >= 0.25 && v >= 0.45 && h >= 195 && h <= 250) return '亮蓝=友军/信息';
  return null;
}

const RE = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([0-9.,\s]+\)/g;
const mapping = new Map();   // 原样字符串 -> 新字符串
const kept = new Map();      // 原样字符串 -> 保留原因

function scan(s) {
  s.replace(RE, (tok) => {
    if (mapping.has(tok) || kept.has(tok)) return tok;
    const m = tok.match(/^rgba?\(([0-9.,\s]+)\)$/);
    let r, g, b, alpha = null, isHex = false;
    if (m) {
      const parts = m[1].split(',').map(x => x.trim());
      r = parseFloat(parts[0]); g = parseFloat(parts[1]); b = parseFloat(parts[2]);
      if (parts.length > 3) alpha = parts[3];
    } else {
      isHex = true;
      [r, g, b] = hex2rgb(tok);
    }
    if (!isFinite(r) || !isFinite(g) || !isFinite(b)) return tok;
    const [h, sat, v] = hsv(r, g, b);
    const why = keep(h, sat, v);
    if (why) { kept.set(tok, why); return tok; }
    const [nr, ng, nb] = neutralize(r, g, b);
    let out;
    if (isHex) {
      out = rgb2hex(nr, ng, nb);
      if (tok.length === 4 && out[1] === out[2] && out[3] === out[4] && out[5] === out[6]) out = '#' + out[1] + out[3] + out[5];
    } else {
      out = 'rgba(' + [nr, ng, nb].map(x => Math.round(x)).join(',') + (alpha !== null ? ',' + alpha : '') + ')';
    }
    mapping.set(tok, out);
    return tok;
  });
}

for (const rel of FILES) scan(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

if (AUDIT) {
  console.log('=== 各文件残留的非中性色 (应只剩 语义色) ===');
  let bad = 0;
  for (const rel of FILES) {
    const s = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const seen = new Map();
    s.replace(RE, (tok) => {
      if (seen.has(tok)) return tok;
      const m = tok.match(/^rgba?\(([0-9.,\s]+)\)$/);
      let r, g, b;
      if (m) { const p = m[1].split(',').map(x => x.trim()); r = +p[0]; g = +p[1]; b = +p[2]; }
      else [r, g, b] = hex2rgb(tok);
      if (!isFinite(r) || !isFinite(g) || !isFinite(b)) return tok;
      const [h, sat, v] = hsv(r, g, b);
      if (sat >= 0.05) seen.set(tok, keep(h, sat, v) || '❌ 未处理');
      return tok;
    });
    const rows = [...seen.entries()];
    const unhandled = rows.filter(x => x[1] === '❌ 未处理');
    bad += unhandled.length;
    console.log('\n' + rel + (rows.length ? '' : '  ✅ 全中性'));
    for (const [tok, why] of rows) console.log('   ' + tok.padEnd(22) + ' ' + why);
  }
  console.log('\n未处理(非语义)色: ' + bad);
  process.exit(0);
}

console.log('=== 会被改成中性灰的颜色 (' + mapping.size + ' 个) ===');
for (const [from, to] of [...mapping.entries()].sort((a, b) => a[0].localeCompare(b[0])))
  console.log('  ' + from.padEnd(26) + ' → ' + to);
console.log('\n=== 保留的颜色 (' + kept.size + ' 个) ===');
const byWhy = {};
for (const [tok, why] of kept) (byWhy[why] = byWhy[why] || []).push(tok);
for (const why in byWhy) console.log('  [' + why + '] ' + byWhy[why].join(' '));

if (APPLY) {
  console.log('');
  let total = 0;
  for (const rel of FILES) {
    const p = path.join(ROOT, rel);
    let s = fs.readFileSync(p, 'utf8');
    let n = 0;
    for (const [from, to] of mapping) {
      const parts = s.split(from);
      n += parts.length - 1;
      s = parts.join(to);
    }
    if (n) fs.writeFileSync(p, s, 'utf8');
    total += n;
    console.log('  ' + rel.padEnd(26) + ' 替换 ' + n + ' 处');
  }
  console.log('合计 ' + total + ' 处');
} else {
  console.log('\n(预览模式, 未写入。加 --apply 才生效)');
}
