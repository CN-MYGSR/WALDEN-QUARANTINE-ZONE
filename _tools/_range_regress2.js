// 回归: 靶场按钮必须在 initMenuUI 之后绑定 (否则被 .navBtn 通用绑定覆盖 → 点了没反应)
const fs = require('fs');

// ===== ① 探针 =====
let p = fs.readFileSync('_tools/_range_probe.js', 'utf8');
const PE = p.includes('\r\n') ? '\r\n' : '\n';
const aP = "  t('主菜单有靶场按钮', /id=\"rangeBtn\"/.test(html));";
const bP = [
  "  t('主菜单有靶场按钮', /id=\"rangeBtn\"/.test(html));",
  "  // ⚠️ 29_menus 的 initMenuUI 会在所有脚本加载完之后把每个 .navBtn 的 onclick 重绑成通用导航",
  "  //    → 直接在脚本加载时绑会被覆盖, 表现是「点靶场没反应」",
  "  t('靶场按钮在 initMenuUI 之后绑定', /initMenuUI=function\\(\\)\\{[\\s\\S]{0,240}?rangeBindMenuBtn\\(\\)/.test(fs.readFileSync('js/61_range.js', 'utf8')))"
].join(PE);
if (p.split(aP).length - 1 !== 1) { console.log('❌ 探针锚点'); process.exit(1); }
fs.writeFileSync('_tools/_range_probe.js', p.split(aP).join(bP), 'utf8');
console.log('✅ 探针 +1');

// ===== ② 审计 =====
let a = fs.readFileSync('_tools/_static_audit.js', 'utf8');
const AE = a.includes('\r\n') ? '\r\n' : '\n';
const aA = "  if (!htm.includes('id=\"rangeBtn\"')) bad('主菜单没有靶场按钮');";
const bA = [
  "  if (!htm.includes('id=\"rangeBtn\"')) bad('主菜单没有靶场按钮');",
  "  else if (!/initMenuUI=function\\(\\)\\{[\\s\\S]{0,240}?rangeBindMenuBtn\\(\\)/.test(rg))",
  "    bad('靶场按钮没在 initMenuUI 之后绑定 —— 会被 .navBtn 通用绑定覆盖, 点了没反应');"
].join(AE);
if (a.split(aA).length - 1 !== 1) { console.log('❌ 审计锚点'); process.exit(1); }
fs.writeFileSync('_tools/_static_audit.js', a.split(aA).join(bA), 'utf8');
console.log('✅ 审计 +1');
