// 审计 + 探针: 加「捕获阶段兜底委托」检查
const fs = require('fs');

const CHECK = "  if (!/addEventListener\\('click',function\\(ev\\)\\{[\\s\\S]{0,200}?t\\.closest\\('#rangeBtn'\\)/.test(rg))\r\n" +
              "    bad('靶场按钮没有捕获阶段的兜底委托 —— onclick 一旦被重绑就点不动');\r\n" +
              "  else ok('靶场按钮有捕获阶段兜底委托 (onclick 被清空也能用)');";

// ① 审计
let a = fs.readFileSync('_tools/_static_audit.js', 'utf8');
const aFrom = "  else ok('主菜单有靶场按钮');";
if (a.split(aFrom).length - 1 !== 1) { console.log('❌ 审计锚点'); process.exit(1); }
a = a.split(aFrom).join(aFrom + '\r\n' + CHECK);
fs.writeFileSync('_tools/_static_audit.js', a, 'utf8');
console.log('✅ 审计 +1');

// ② 探针
let p = fs.readFileSync('_tools/_range_probe.js', 'utf8');
const pMark = "t('靶场按钮在 initMenuUI 之后绑定'";
const i = p.indexOf(pMark);
if (i < 0) { console.log('❌ 探针锚点'); process.exit(1); }
const e = p.indexOf('\n', i);
const line = "\n  t('靶场按钮有捕获阶段兜底委托', /addEventListener\\('click',function\\(ev\\)\\{[\\s\\S]{0,200}?t\\.closest\\('#rangeBtn'\\)/.test(fs.readFileSync('js/61_range.js', 'utf8')));";
p = p.slice(0, e) + line + p.slice(e);
fs.writeFileSync('_tools/_range_probe.js', p, 'utf8');
console.log('✅ 探针 +1');
