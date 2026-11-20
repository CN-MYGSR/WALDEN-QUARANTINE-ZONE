// 给静态审计追加第 13 组: 翻越 (vault)
const fs = require('fs');
const P = '_tools/_static_audit.js';
let s = fs.readFileSync(P, 'utf8');
const E = s.includes('\r\n') ? '\r\n' : '\n';

const anchor = [
  "  // ⑩ 行为探针",
  "  if (!fs.existsSync(path.join(__dirname, '_downed_probe.js'))) log('     ⚠️ 没有 _downed_probe.js');",
  "  else ok('有行为探针 _downed_probe.js (node _tools/_downed_probe.js)');",
  "}",
  "",
  "log('');",
  "log(issues ? ('⚠️ 发现 ' + issues + ' 处需要关注') : '✅ 静态审计全部通过');"
].join(E);

const add = [
  "  // ⑩ 行为探针",
  "  if (!fs.existsSync(path.join(__dirname, '_downed_probe.js'))) log('     ⚠️ 没有 _downed_probe.js');",
  "  else ok('有行为探针 _downed_probe.js (node _tools/_downed_probe.js)');",
  "}",
  "",
  "// ---------- 13. 翻越 (窗户 / 低矮掩体) ----------",
  "log('');",
  "log('=== 13. 翻越 (窗户 / 低矮掩体) ===');",
  "{",
  "  const strip = (x) => x.split('\\n').map(l => l.replace(/\\/\\/.*$/, '')).join('\\n');   // ⚠️ 断言前剥注释",
  "  const vp = strip(read('js/58_vault.js'));",
  "  const upd = strip(read('js/25_player_update.js'));",
  "  const htm = read('index.html');",
  "",
  "  // ① 加载",
  "  if (!htm.includes('js/58_vault.js?v=')) bad('index.html 没有加载 58_vault.js');",
  "  else ok('58_vault.js 已加载');",
  "  const i25 = htm.indexOf('25_player_update.js'), i58 = htm.indexOf('58_vault.js');",
  "  if (!(i25 >= 0 && i58 > i25)) bad('58_vault.js 必须在 25_player_update.js 之后加载 (updatePlayer 要调 updateVault)');",
  "  else ok('58_vault.js 加载顺序正确');",
  "",
  "  // ② 两个钩子",
  "  if (!/if\\(player\\.vaultT>0\\) return updateVault\\(dt\\);/.test(upd)) bad('updatePlayer 没有翻越钩子 —— 翻越过程会被常规移动/碰撞覆盖');",
  "  else ok('updatePlayer 有翻越钩子 (vaultT>0 时交给 updateVault)');",
  "  if (!/typeof vaultTry==='function'&&vaultTry\\(\\)/.test(upd)) bad('跳跃分支没有先试翻越 —— 按跳跃键只会跳');",
  "  else ok('跳跃键优先触发翻越 (翻不过去才跳)');",
  "",
  "  // ③ 判定依据必须是 BOXES (与 collideMove 同一套), 不能用 OCC 2D 栅格",
  "  if (/occBlocked|OCC\\./.test(vp)) bad('58_vault 用了 OCC —— 2D 栅格不含高度, 会把整面墙和窗台当同一回事');",
  "  else ok('翻越判定用 BOXES (与 collideMove 同一套数据)');",
  "  if (!/standHeight\\(x,z,feet\\+0\\.3\\)/.test(vp)) bad('落脚点没有用 standHeight 校验 —— 可能落到半空/屋顶');",
  "  else ok('落脚点用 standHeight 校验');",
  "",
  "  // ④ 上限: 不能翻过整面墙",
  "  const mt = (vp.match(/maxTop:([0-9.]+)/) || [])[1];",
  "  if (!mt) bad('读不到 VAULT.maxTop');",
  "  else if (parseFloat(mt) > 1.5) bad('VAULT.maxTop=' + mt + ' 太大 —— 能翻过整面墙');",
  "  else ok('翻越高度上限 = ' + mt + 'm (窗台 0.95 / 沙袋 1.0 可翻, 整墙不可)');",
  "",
  "  // ⑤ 必须确认「翻不过去时返回 false」, 否则跳跃会被吃掉",
  "  if (!/if\\(!f\\) return false;/.test(vp)) bad('vaultTry 没有在找不到目标时返回 false —— 按跳跃键会没反应');",
  "  else ok('无翻越目标时 vaultTry 返回 false (跳跃照常)');",
  "  if (!/p\\.vaultNext=nowT\\+VAULT\\.cooldown/.test(vp)) bad('翻越没有冷却 —— 按住跳跃键会连翻');",
  "  else ok('翻越有冷却');",
  "",
  "  // ⑥ 行为探针",
  "  if (!fs.existsSync(path.join(__dirname, '_vault_probe.js'))) log('     ⚠️ 没有 _vault_probe.js');",
  "  else ok('有行为探针 _vault_probe.js (node _tools/_vault_probe.js)');",
  "}",
  "",
  "log('');",
  "log(issues ? ('⚠️ 发现 ' + issues + ' 处需要关注') : '✅ 静态审计全部通过');"
].join(E);

const n = s.split(anchor).length - 1;
if (n !== 1) { console.log('❌ 锚点命中 ' + n + ' 次'); process.exit(1); }
fs.writeFileSync(P, s.split(anchor).join(add), 'utf8');
console.log('✅ 审计第 13 组已追加');
