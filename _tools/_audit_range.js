// 审计: 新增第 16 组「靶场」
const fs = require('fs');
const P = '_tools/_static_audit.js';
let s = fs.readFileSync(P, 'utf8');
const E = s.includes('\r\n') ? '\r\n' : '\n';

const anchor = [
  "  if (!fs.existsSync(path.join(__dirname, '_falldmg_probe.js'))) log('     ⚠️ 没有 _falldmg_probe.js');",
  "  else ok('有行为探针 _falldmg_probe.js (node _tools/_falldmg_probe.js)');",
  "}",
  "",
  "log('');",
  "log(issues ? ('⚠️ 发现 ' + issues + ' 处需要关注') : '✅ 静态审计全部通过');"
].join(E);

const add = [
  "  if (!fs.existsSync(path.join(__dirname, '_falldmg_probe.js'))) log('     ⚠️ 没有 _falldmg_probe.js');",
  "  else ok('有行为探针 _falldmg_probe.js (node _tools/_falldmg_probe.js)');",
  "}",
  "",
  "// ---------- 16. 室内靶场 ----------",
  "log('');",
  "log('=== 16. 室内靶场 (免费武器 / 无限弹药 / 2~30m 靶) ===');",
  "{",
  "  const strip = (x) => x.split('\\n').map(l => l.replace(/\\/\\/.*$/, '')).join('\\n');",
  "  const rg = strip(read('js/61_range.js'));",
  "  const map = read('js/07h_range.js');",
  "  const htm = read('index.html');",
  "  const dat = read('js/01_data.js');",
  "  const wld = read('js/08_world.js');",
  "  const mps = strip(read('js/43_maps.js'));",
  "",
  "  if (!/function layoutRange\\(\\)/.test(map)) bad('07h_range.js 没有 layoutRange()');",
  "  else ok('layoutRange() 已定义');",
  "  if (!/case 'range': layoutRange\\(\\);/.test(wld)) bad('08_world 没有 range 布局分支');",
  "  else ok('08_world 有 range 分支');",
  "  // ⚠️ 天花板必须用 mesh: solidBox 会把整片区域写进 OCC(2D) → findFreeSpawn 认为靶道全被堵住",
  "  if (!/const ceil=mesh\\(/.test(map)) bad('靶场天花板不是 mesh —— solidBox 会污染 OCC, 玩家可能生成在场外');",
  "  else ok('天花板用 mesh (不污染 OCC)');",
  "",
  "  if (!/id:'range'[\\s\\S]{0,700}?rangeOnly:true/.test(dat)) bad('CAMPAIGNS 没有 range 或没标 rangeOnly');",
  "  else ok('CAMPAIGNS 有 range (rangeOnly)');",
  "  if (!/id:'range'[\\s\\S]{0,700}?extract:\\[\\]/.test(dat)) bad('靶场没有清空 extract —— 会被撤离点立刻结算');",
  "  else ok('靶场没有撤离点');",
  "  if (!/indoor:\\{name:'室内'\\}/.test(dat) || !/indoor:\\{fogFar:1/.test(dat)) bad('室内天气没登记进 WEATHER_MODES/FX');",
  "  else ok('室内天气已登记 (不会让主菜单天气显示抛错)');",
  "",
  "  if (!htm.includes('id=\"rangeBtn\"')) bad('主菜单没有靶场按钮');",
  "  else ok('主菜单有靶场按钮');",
  "  if (!htm.includes('id=\"rangeHud\"')) bad('index.html 没有 #rangeHud');",
  "  else ok('靶场 HUD 已就位');",
  "  if (!/js\\/61_range\\.js\\?v=/.test(htm) || !/js\\/07h_range\\.js\\?v=/.test(htm)) bad('靶场脚本没加载');",
  "  else ok('靶场脚本已加载');",
  "  if (!(htm.indexOf('07h_range.js') < htm.indexOf('08_world.js'))) bad('07h_range.js 必须在 08_world.js 之前');",
  "  else ok('07h_range.js 加载顺序正确');",
  "",
  "  if (!/if\\(c\\.storyOnly\\|\\|c\\.rangeOnly\\) return;/.test(mps)) bad('地图卡片没过滤 rangeOnly');",
  "  else ok('靶场不进沙盒地图列表');",
  "  if (!/localStorage\\.getItem\\('sf_range'\\)==='1'\\) return false;/.test(mps)) bad('守卫没放行 sf_range —— 靶场部署会被拦');",
  "  else ok('守卫对靶场放行');",
  "",
  "  if (!/raySoldiers=function/.test(rg)) bad('没有包装 raySoldiers —— 打不中靶');",
  "  else ok('raySoldiers 已包装 (靶子可命中)');",
  "  if (!/META\\.loadout\\.primary=savedPrimary;/.test(rg)) bad('免费武器没有还原 META.loadout.primary —— 会污染存档');",
  "  else ok('免费武器不写存档 (部署后还原)');",
  "  if (!/s\\.reserve=RANGE\\.AMMO/.test(rg)) bad('没有补满 reserve —— 不是无限弹药');",
  "  else ok('无限弹药已实现');",
  "  if (!/DISTS:\\[2,4,6,8,10,12,15,18,22,26,30\\]/.test(rg)) bad('靶位距离不是 2~30m');",
  "  else ok('靶位 2~30m (11 个)');",
  "  if (!/MOVING:\\{8:1,18:1,26:1\\}/.test(rg)) bad('没有移动靶');",
  "  else ok('3 个移动靶 (8/18/26m)');",
  "",
  "  if (!fs.existsSync(path.join(__dirname, '_range_probe.js'))) log('     ⚠️ 没有 _range_probe.js');",
  "  else ok('有行为探针 _range_probe.js (node _tools/_range_probe.js)');",
  "}",
  "",
  "log('');",
  "log(issues ? ('⚠️ 发现 ' + issues + ' 处需要关注') : '✅ 静态审计全部通过');"
].join(E);

const n = s.split(anchor).length - 1;
if (n !== 1) { console.log('❌ 锚点命中 ' + n + ' 次'); process.exit(1); }
fs.writeFileSync(P, s.split(anchor).join(add), 'utf8');
console.log('✅ 审计第 16 组已追加');
