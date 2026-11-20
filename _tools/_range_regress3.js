// 修断言: 只认调用语句 `try{ rangeBindMenuBtn(); }`, 不能被 `function rangeBindMenuBtn(){` 满足
const fs = require('fs');

const BAD = /initMenuUI=function\(\)\{[\s\S]{0,400}?try\{ rangeBindMenuBtn\(\); \}/;

// ① 探针
let p = fs.readFileSync('_tools/_range_probe.js', 'utf8');
const oldP = "  t('靶场按钮在 initMenuUI 之后绑定', /initMenuUI=function\\(\\)\\{[\\s\\S]{0,240}?rangeBindMenuBtn\\(\\)/.test(fs.readFileSync('js/61_range.js', 'utf8')));";
const newP = "  t('靶场按钮在 initMenuUI 之后绑定', /initMenuUI=function\\(\\)\\{[\\s\\S]{0,400}?try\\{ rangeBindMenuBtn\\(\\); \\}/.test(fs.readFileSync('js/61_range.js', 'utf8')));";
if (p.split(oldP).length - 1 !== 1) { console.log('❌ 探针锚点'); process.exit(1); }
fs.writeFileSync('_tools/_range_probe.js', p.split(oldP).join(newP), 'utf8');
console.log('✅ 探针断言已收紧');

// ② 审计
let a = fs.readFileSync('_tools/_static_audit.js', 'utf8');
const oldA = [
  "  if (!htm.includes('id=\"rangeBtn\"')) bad('主菜单没有靶场按钮');",
  "  else if (!/initMenuUI=function\\(\\)\\{[\\s\\S]{0,240}?rangeBindMenuBtn\\(\\)/.test(rg))",
  "    bad('靶场按钮没在 initMenuUI 之后绑定 —— 会被 .navBtn 通用绑定覆盖, 点了没反应');"
].join('\r\n');
const oldA2 = oldA.split('\r\n').join('\n');
const newA = [
  "  if (!htm.includes('id=\"rangeBtn\"')) bad('主菜单没有靶场按钮');",
  "  else if (!/initMenuUI=function\\(\\)\\{[\\s\\S]{0,400}?try\\{ rangeBindMenuBtn\\(\\); \\}/.test(rg))",
  "    bad('靶场按钮没在 initMenuUI 之后绑定 —— 会被 .navBtn 通用绑定覆盖, 点了没反应');",
  "  else ok('靶场按钮在 initMenuUI 之后绑定 (不会被 .navBtn 覆盖)');"
].join('\r\n');

let hit = 0;
for (const src of [oldA, oldA2]) {
  if (a.split(src).length - 1 === 1) { a = a.split(src).join(newA); hit = 1; break; }
}
if (!hit) { console.log('❌ 审计锚点'); process.exit(1); }
fs.writeFileSync('_tools/_static_audit.js', a, 'utf8');
console.log('✅ 审计断言已收紧');
