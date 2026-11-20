// 触控按钮布局重叠检查: 解析 css/style.css 里的 #tXxx 规则, 按视口算矩形, 报出重叠对。
// 为什么需要: 按钮一多就很容易互相压住 —— 被压住的那个在 elementFromPoint 里拿不到,
// 表现就是"点了没反应"。改布局后先跑这个, 比开浏览器快得多。
// 用法: node _tools/_check_tbtn_layout.js [宽] [高]
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const W = parseInt(process.argv[2] || '844', 10);
const H = parseInt(process.argv[3] || '390', 10);

const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
// 只取触控按钮规则: #tXxx { ... } (排除 tLook/tStick/tStickZone/tKnob/touchUI/layoutBar)
const SKIP = new Set(['tLook', 'tStick', 'tStickZone', 'tKnob', 'touchUI', 'layoutBar']);
const re = /#(t[A-Za-z]+)\s*\{([^}]*)\}/g;
const rects = [];
let m;
while ((m = re.exec(css))) {
  const id = m[1], body = m[2];
  if (SKIP.has(id)) continue;
  const px = (k) => { const r = body.match(new RegExp(k + ':\\s*calc\\((-?\\d+)px')); return r ? +r[1] : null; };
  const right = px('right'), bottom = px('bottom'), left = px('left'), top = px('top');
  const wm = body.match(/width:\s*(\d+)px/), hm = body.match(/height:\s*(\d+)px/);
  const mm = body.match(/min-width:\s*(\d+)px/);
  const tp = body.match(/top:\s*(\d+)%/);
  // top:calc(38% + 58px) 这种写法也要能解析 (左手工具簇在用)
  const tc = body.match(/top:\s*calc\((-?\d+)%\s*([+-])\s*(\d+)px\)/);
  const w = wm ? +wm[1] : (mm ? +mm[1] : null);
  const h = hm ? +hm[1] : null;
  if (!w || !h) continue;
  let x0, x1, y0, y1;
  if (right != null) { x1 = W - right; x0 = x1 - w; } else if (left != null) { x0 = left; x1 = x0 + w; }
  if (bottom != null) { y1 = H - bottom; y0 = y1 - h; }
  else if (top != null) { y0 = top; y1 = y0 + h; }
  else if (tp) { y0 = H * (+tp[1]) / 100; y1 = y0 + h; }
  else if (tc) { y0 = H * (+tc[1]) / 100 + (tc[2] === '+' ? 1 : -1) * (+tc[3]); y1 = y0 + h; }
  if (x0 == null || y0 == null) continue;
  rects.push({ id, x0: Math.round(x0), x1: Math.round(x1), y0: Math.round(y0), y1: Math.round(y1), w, h, dom: css.indexOf('#' + id + ' ') });
}
// DOM 顺序: 以 index.html 里出现顺序为准 (后出现的盖在上面)
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
for (const r of rects) r.dom = html.indexOf('id="' + r.id + '"');
rects.sort((a, b) => a.dom - b.dom);

console.log(`视口 ${W}x${H} · 触控按钮 ${rects.length} 个`);
for (const r of rects) {
  const off = (r.x0 < 0 || r.y0 < 0 || r.x1 > W || r.y1 > H) ? '  ⚠ 超出视口' : '';
  console.log('  ' + r.id.padEnd(11) + 'x ' + String(r.x0).padStart(4) + '..' + String(r.x1).padStart(4) +
    '  y ' + String(r.y0).padStart(4) + '..' + String(r.y1).padStart(4) + off);
}
let bad = 0;
console.log('--- 重叠对 (后者盖住前者) ---');
for (let i = 0; i < rects.length; i++) {
  for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    if (ox > 0 && oy > 0) {
      // 中心点是否落在对方矩形内 → 决定"能不能按到中心"
      const cx = (a.x0 + a.x1) / 2, cy = (a.y0 + a.y1) / 2;
      const blocked = cx > b.x0 && cx < b.x1 && cy > b.y0 && cy < b.y1;
      console.log(`  ${a.id} <-> ${b.id}  重叠 ${ox}x${oy}${blocked ? '   ⚠ ' + a.id + ' 中心被挡, 按不动' : ''}`);
      if (blocked) bad++;
    }
  }
}
if (!bad) console.log('  无');
console.log(bad ? `\n❌ ${bad} 个按钮的中心被完全挡住` : '\n✅ 所有按钮中心都可点');
process.exit(bad ? 1 : 0);
