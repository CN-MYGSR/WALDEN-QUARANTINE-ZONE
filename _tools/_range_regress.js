// 给靶场探针 + 审计补上本次修复的回归项
const fs = require('fs');

// ===== ① 探针: 追加静态检查 =====
let p = fs.readFileSync('_tools/_range_probe.js', 'utf8');
const PE = p.includes('\r\n') ? '\r\n' : '\n';
const anchorP = "  t('靶场布局用 mesh 做天花板 (不能 solidBox 污染 OCC)', /const ceil=mesh\\(/.test(map));";
const addP = [
  "  t('靶场布局用 mesh 做天花板 (不能 solidBox 污染 OCC)', /const ceil=mesh\\(/.test(map));",
  "  // ⚠️ 通用基地营区会把帐篷/沙袋搭进靶道 (bases 就在厅内) —— 必须排除 range",
  "  t('08_world 的基地营区排除了 range', /layout!=='range'\\)\\{/.test(world));",
  "  t('靶场地面用浅色石材 (深色木地板在室内像黑洞)', /apPave\\(0,cz,W,LEN,0\\.06,MAT\\.stone\\)/.test(map));",
  "  t('距离标牌已缩小 (0.46×0.23)', /sp\\.scale\\.set\\(0\\.46,0\\.23,1\\)/.test(fs.readFileSync('js/61_range.js', 'utf8')));",
  "  t('出生点归位到射击线后方 (z=13.6)', /player\\.pos\\.z=13\\.6/.test(fs.readFileSync('js/61_range.js', 'utf8')));",
  "  t('靶场隐藏了撤离/战利品 HUD', /tkt\\.style\\.display/.test(fs.readFileSync('js/61_range.js', 'utf8')))"
].join(PE);

if (p.split(anchorP).length - 1 !== 1) { console.log('❌ 探针锚点'); process.exit(1); }
p = p.split(anchorP).join(addP);
fs.writeFileSync('_tools/_range_probe.js', p, 'utf8');
console.log('✅ 探针已补 5 项');

// ===== ② 审计第 16 组: 追加同样 5 项 =====
let a = fs.readFileSync('_tools/_static_audit.js', 'utf8');
const AE = a.includes('\r\n') ? '\r\n' : '\n';
const anchorA = "  if (!fs.existsSync(path.join(__dirname, '_range_probe.js'))) log('     ⚠️ 没有 _range_probe.js');";
const addA = [
  "  // ⚠️ 通用基地营区 (帐篷/沙袋/木箱) 必须排除 range —— bases 就在厅内, 不排除会把帐篷搭进靶道",
  "  if (!/layout!=='range'\\)\\{/.test(wld)) bad('08_world 的基地营区没有排除 range —— 帐篷会被搭进靶道');",
  "  else ok('基地营区已排除靶场');",
  "  if (!/apPave\\(0,cz,W,LEN,0\\.06,MAT\\.stone\\)/.test(map)) bad('靶场地面用了深色材质 —— 室内会看着像黑洞');",
  "  else ok('靶场地面是浅色石材');",
  "  if (!/sp\\.scale\\.set\\(0\\.46,0\\.23,1\\)/.test(rg)) bad('距离标牌尺寸不对 (太大会糊住视野)');",
  "  else ok('距离标牌尺寸正常');",
  "  if (!/player\\.pos\\.z=13\\.6/.test(rg)) bad('没有把出生点放回射击线后方 —— findFreeSpawn 会随机挪到线前面');",
  "  else ok('出生点已归位到射击线后方');",
  "  if (!/tkt\\.style\\.display/.test(rg)) bad('靶场没有隐藏「撤离行动 / 战利品」HUD');",
  "  else ok('靶场隐藏了撤离 HUD');",
  "",
  "  if (!fs.existsSync(path.join(__dirname, '_range_probe.js'))) log('     ⚠️ 没有 _range_probe.js');"
].join(AE);

if (a.split(anchorA).length - 1 !== 1) { console.log('❌ 审计锚点'); process.exit(1); }
a = a.split(anchorA).join(addA);
fs.writeFileSync('_tools/_static_audit.js', a, 'utf8');
console.log('✅ 审计第 16 组已补 5 项');
