// 审计: 新增第 17 组「准星 / 移动扩散」
const fs = require('fs');
const P = '_tools/_static_audit.js';
let s = fs.readFileSync(P, 'utf8');
const E = '\n';   // ⚠️ 这个文件里混了 3 处 CRLF, 不能靠 includes 判断, 主体是 LF

const anchor = [
  "log('');",
  "log(issues ? ('⚠️ 发现 ' + issues + ' 处需要关注') : '✅ 静态审计全部通过');"
].join(E);

const add = [
  "// ---------- 17. 准星 / 移动扩散 ----------",
  "log('');",
  "log('=== 17. 准星 / 移动扩散 ===');",
  "{",
  "  const strip = (x) => x.split('\\n').map(l => l.replace(/\\/\\/.*$/, '')).join('\\n');",
  "  const htm = read('index.html');",
  "  const css = read('css/style.css');",
  "  const hud = strip(read('js/28_hud.js'));",
  "  const upd = strip(read('js/25_player_update.js'));",
  "",
  "  // ① 准星必须删干净 (DOM / CSS / HUD 更新三处都清掉, 漏一处就会每帧 TypeError)",
  "  if (/id=\"crosshair\"/.test(htm)) bad('index.html 还有 #crosshair');",
  "  else ok('准星 DOM 已删除');",
  "  if (/#crosshair/.test(css)) bad('CSS 里还有 #crosshair 规则');",
  "  else ok('准星样式已删除');",
  "  if (/el\\('crosshair'\\)/.test(hud)) bad('28_hud 还在更新准星 —— 元素没了会每帧抛 TypeError');",
  "  else ok('HUD 不再更新准星');",
  "",
  "  // ② 移动扩散: 必须是「按实际速度连续加成」, 不能退回台阶式",
  "  if (/Math\\.hypot\\(p\\.vel\\.x,p\\.vel\\.z\\)>1\\?1\\.4:1/.test(upd)) bad('移动扩散还是台阶式 (动起来就 ×1.4)');",
  "  else ok('移动扩散不是台阶式');",
  "  if (!/const vSpd=Math\\.hypot\\(p\\.vel\\.x,p\\.vel\\.z\\)/.test(upd)) bad('移动扩散没读实际速度');",
  "  else ok('移动扩散按实际速度计算');",
  "  if (!/moveMul=1\\+Math\\.min\\(1\\.6/.test(upd)) bad('缺少 moveMul 系数');",
  "  else ok('moveMul 系数存在 (站定 1.0 / 冲刺 ≈2.6)');",
  "  if (!/1-adsB\\*0\\.45/.test(upd)) bad('开镜时移动惩罚没有打折');",
  "  else ok('开镜时移动惩罚打折');",
  "}",
  "",
  "log('');",
  "log(issues ? ('⚠️ 发现 ' + issues + ' 处需要关注') : '✅ 静态审计全部通过');"
].join(E);

const n = s.split(anchor).length - 1;
if (n !== 1) { console.log('❌ 锚点命中 ' + n + ' 次'); process.exit(1); }
fs.writeFileSync(P, s.split(anchor).join(add), 'utf8');
console.log('✅ 审计第 17 组已追加');
