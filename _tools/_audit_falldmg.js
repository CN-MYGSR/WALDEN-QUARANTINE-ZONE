// 审计: 第 13 组补「落点落差」两项 + 新增第 15 组「坠落伤害」
const fs = require('fs');
const P = '_tools/_static_audit.js';
let s = fs.readFileSync(P, 'utf8');
const E = s.includes('\r\n') ? '\r\n' : '\n';

// ---------- ① 第 13 组: 翻越落点落差 ----------
const a13 = [
  "  // ④ 上限: 不能翻过整面墙",
  "  const mt = (vp.match(/maxTop:([0-9.]+)/) || [])[1];"
].join(E);
const b13 = [
  "  // ④ 落点落差: 只禁止往上, 往下有上限 (二楼可翻出, 三楼不行)",
  "  if (!/if\\(gh-feet>0\\.80\\) continue;/.test(vp)) bad('翻越落点还在用 |落差|<=0.8 —— 二楼窗台翻不出去');",
  "  else if (!/if\\(feet-gh>VAULT\\.maxDrop\\) continue;/.test(vp)) bad('翻越落点没有向下限幅 —— 能从高层直接翻出去摔死');",
  "  else ok('翻越落点: 只禁往上 0.8m, 往下受 maxDrop 限制');",
  "  const md = (vp.match(/maxDrop:([0-9.]+)/) || [])[1];",
  "  if (!md) bad('读不到 VAULT.maxDrop');",
  "  else if (parseFloat(md) < 3.1) bad('VAULT.maxDrop=' + md + ' 太小 —— 二楼窗台(3.05m)翻不出去');",
  "  else if (parseFloat(md) > 6.0) bad('VAULT.maxDrop=' + md + ' 太大 —— 三层也敢翻');",
  "  else ok('翻越向下上限 = ' + md + 'm (二层可翻, 三层不可)');",
  "",
  "  // ⑤ 上限: 不能翻过整面墙",
  "  const mt = (vp.match(/maxTop:([0-9.]+)/) || [])[1];"
].join(E);

let n = s.split(a13).length - 1;
if (n !== 1) { console.log('❌ 第 13 组锚点命中 ' + n + ' 次'); process.exit(1); }
s = s.split(a13).join(b13);
console.log('✅ 第 13 组已补 2 项 (落点落差)');

// ---------- ② 新增第 15 组 ----------
const tail = [
  "log('');",
  "log(issues ? ('⚠️ 发现 ' + issues + ' 处需要关注') : '✅ 静态审计全部通过');"
].join(E);

const add15 = [
  "// ---------- 15. 坠落伤害 ----------",
  "log('');",
  "log('=== 15. 坠落伤害 (>3m 按高度扣血) ===');",
  "{",
  "  const strip = (x) => x.split('\\n').map(l => l.replace(/\\/\\/.*$/, '')).join('\\n');",
  "  const fd = strip(read('js/60_falldmg.js'));",
  "  const htm = read('index.html');",
  "",
  "  if (!htm.includes('js/60_falldmg.js?v=')) bad('index.html 没有加载 60_falldmg.js');",
  "  else ok('60_falldmg.js 已加载');",
  "  const i25 = htm.indexOf('25_player_update.js'), i60 = htm.indexOf('60_falldmg.js');",
  "  if (!(i25 >= 0 && i60 > i25)) bad('60_falldmg.js 必须在 25_player_update.js 之后 (它要包装 updatePlayer)');",
  "  else ok('60_falldmg.js 加载顺序正确');",
  "",
  "  if (!/safe:3\\.0/.test(fd)) bad('坠落免伤高度不是 3m');",
  "  else ok('坠落免伤高度 = 3m');",
  "  if (!/p\\.damage\\(dmg,null,false,'legs'\\)/.test(fd)) bad('坠落伤害没走 player.damage —— 倒地/死亡/HUD 不会联动');",
  "  else ok('坠落伤害走 player.damage (沿用倒地/死亡链路)');",
  "  if (!/p\\.vaulting&&p\\.vaultFrom/.test(fd)) bad('翻越落地用了弧线顶点 —— 翻二楼会被多算 0.95m');",
  "  else ok('翻越落地用楼层差 (不用弧线顶点)');",
  "  if (!/p\\._onLadder/.test(fd)) bad('爬梯没有排除 —— 下梯子会扣血');",
  "  else ok('爬梯/载具/倒地/对局结束 都不扣血');",
  "  if (!/maxRatio:0\\.85/.test(fd)) bad('坠落伤害没有上限 (会直接摔死)');",
  "  else ok('坠落伤害有上限 (最多 85% 最大生命)');",
  "",
  "  if (!fs.existsSync(path.join(__dirname, '_falldmg_probe.js'))) log('     ⚠️ 没有 _falldmg_probe.js');",
  "  else ok('有行为探针 _falldmg_probe.js (node _tools/_falldmg_probe.js)');",
  "}",
  "",
  "log('');",
  "log(issues ? ('⚠️ 发现 ' + issues + ' 处需要关注') : '✅ 静态审计全部通过');"
].join(E);

n = s.split(tail).length - 1;
if (n !== 1) { console.log('❌ 尾部锚点命中 ' + n + ' 次'); process.exit(1); }
s = s.split(tail).join(add15);
console.log('✅ 第 15 组已追加');

fs.writeFileSync(P, s, 'utf8');
