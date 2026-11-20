// 给静态审计追加第 14 组: 屏幕边缘反馈（压抑变暗 / 受伤血块）
const fs = require('fs');
const P = '_tools/_static_audit.js';
let s = fs.readFileSync(P, 'utf8');
const E = s.includes('\r\n') ? '\r\n' : '\n';

const anchor = [
  "  // ⑥ 行为探针",
  "  if (!fs.existsSync(path.join(__dirname, '_vault_probe.js'))) log('     ⚠️ 没有 _vault_probe.js');",
  "  else ok('有行为探针 _vault_probe.js (node _tools/_vault_probe.js)');",
  "}",
  "",
  "log('');",
  "log(issues ? ('⚠️ 发现 ' + issues + ' 处需要关注') : '✅ 静态审计全部通过');"
].join(E);

const add = [
  "  // ⑥ 行为探针",
  "  if (!fs.existsSync(path.join(__dirname, '_vault_probe.js'))) log('     ⚠️ 没有 _vault_probe.js');",
  "  else ok('有行为探针 _vault_probe.js (node _tools/_vault_probe.js)');",
  "}",
  "",
  "// ---------- 14. 屏幕边缘反馈 (压抑变暗 / 受伤血块) ----------",
  "log('');",
  "log('=== 14. 屏幕边缘反馈 (压抑变暗 / 受伤血块) ===');",
  "{",
  "  const strip = (x) => x.split('\\n').map(l => l.replace(/\\/\\/.*$/, '')).join('\\n');",
  "  const fx = strip(read('js/59_screenfx.js'));",
  "  const htm = read('index.html');",
  "  const css = read('css/style.css');",
  "",
  "  if (!htm.includes('js/59_screenfx.js?v=')) bad('index.html 没有加载 59_screenfx.js');",
  "  else ok('59_screenfx.js 已加载');",
  "  const i59 = htm.indexOf('59_screenfx.js');",
  "  const early = ['18_ballistics.js', '28_hud.js', '23_player.js'].filter(f => htm.indexOf(f) > i59);",
  "  if (early.length) bad('59_screenfx.js 加载太早 (应在这些之后): ' + early.join(', '));",
  "  else ok('59_screenfx.js 加载顺序正确');",
  "",
  "  if (!htm.includes('id=\"bloodOv\"')) bad('index.html 没有 #bloodOv');",
  "  else if (!/#bloodOv\\{[\\s\\S]{0,400}radial-gradient/.test(css)) bad('CSS 的 #bloodOv 没有血块渐变');",
  "  else ok('血块遮罩已就位 (#bloodOv + 多团 radial-gradient)');",
  "  if (htm.indexOf('id=\"bloodOv\"') < htm.indexOf('id=\"vig\"')) bad('#bloodOv 在 #vig 之前 —— 会被暗角盖住');",
  "  else ok('血块在暗角之上 (不会被盖住)');",
  "",
  "  if (!/fireBullet=function\\(shooter,origin/.test(fx)) bad('没有包装 fireBullet —— 队友在附近开火不会压暗');",
  "  else ok('fireBullet 已包装 (队友开火 → 压抑)');",
  "  if (!/player\\.damage=function\\(amt,attacker,isHead,part\\)/.test(fx)) bad('没有包装 player.damage —— 受伤不会出红块');",
  "  else ok('player.damage 已包装 (用血量差算受伤量)');",
  "  if (!/before=this\\.hp/.test(fx)) bad('player.damage 包装没有记录血量差');",
  "  else ok('受伤量按血量差计算 (不依赖内部实现)');",
  "  if (!/wasDown\\|\\|this\\.downed/.test(fx)) bad('倒地后中弹不会渗血 (57_downed 拦住了 hp 变化)');",
  "  else ok('倒地后中弹仍会渗血');",
  "  if (!/updateHUD=function\\(dt\\)/.test(fx)) bad('没有包装 updateHUD —— 遮罩透明度不会被更新');",
  "  else ok('updateHUD 已包装 (每帧写遮罩透明度)');",
  "  if (!/nearR:22/.test(fx)) bad('队友开火的影响半径不是 22m');",
  "  else ok('队友开火影响半径 = 22m');",
  "  if (!/f\\.blood=Math\\.max\\(0,f\\.blood-dt\\*0\\.14\\)/.test(fx)) bad('血块没有缓慢消退 —— 会一直红着');",
  "  else ok('血块会缓慢消退');",
  "",
  "  if (!fs.existsSync(path.join(__dirname, '_screenfx_probe.js'))) log('     ⚠️ 没有 _screenfx_probe.js');",
  "  else ok('有行为探针 _screenfx_probe.js (node _tools/_screenfx_probe.js)');",
  "}",
  "",
  "log('');",
  "log(issues ? ('⚠️ 发现 ' + issues + ' 处需要关注') : '✅ 静态审计全部通过');"
].join(E);

const n = s.split(anchor).length - 1;
if (n !== 1) { console.log('❌ 锚点命中 ' + n + ' 次'); process.exit(1); }
fs.writeFileSync(P, s.split(anchor).join(add), 'utf8');
console.log('✅ 审计第 14 组已追加');
