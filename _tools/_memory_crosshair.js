// MEMORY.md: 修正行尾事实(CRLF→LF) + 版本 h + 准星/扩散 + 压缩
const fs = require('fs');
const P = '.workbuddy-ai/memory/MEMORY.md';
let L = fs.readFileSync(P, 'utf8').split('\n');

function sub(a, b, tag){
  const k = L.findIndex(l => l.includes(a));
  if (k < 0) { console.log('⚠️ 未命中: ' + tag); return false; }
  L[k] = L[k].split(a).join(b);
  console.log('✅ ' + tag);
  return true;
}

// ① 行尾事实纠正
sub('- **行尾：全项目 CRLF**（实测全是）。多行 split/join 必须按目标文件**实际行尾**转换，否则**静默 0 命中**。核实 `grep -c $\'\\r$\' F` vs `wc -l F`。',
    '- **行尾：全项目 LF**（70/70 js 实测，别信旧记忆的 CRLF）。多行 split/join 按**实际行尾**，否则静默 0 命中。核实用 node 数 CRLF/LF（`includes(\'\\r\\n\')` 会被个别杂音骗到）。',
    '行尾纠正');

// ② 版本
{
  const k = L.findIndex(l => l.startsWith('- **版本号 = `'));
  if (k < 0) { console.log('❌ 版本号'); process.exit(1); }
  L[k] = '- **版本号 = `20261030h`**（h=删准星+移动扩散；g=修靶场按钮绑定；f=修靶场观感；e=室内靶场；d=二楼翻出+坠落。';
  L[k + 1] = '  上一批：`20261030c`=屏幕边缘反馈 / `20261030b`=翻越；更早见 REF）。';
  console.log('✅ 版本号 → 20261030h');
}

// ③ 准星 / 扩散
{
  const k = L.findIndex(l => l.includes('**坠落伤害**（`60_falldmg.js`'));
  if (k < 0) { console.log('❌ 坠落行'); process.exit(1); }
  L.splice(k + 1, 0,
    '- **准星已删**（`#crosshair` 的 DOM/CSS/`28_hud` 更新块三处同清；漏一处每帧 TypeError）。' +
    '**移动扩散** `moveMul=1+min(1.6,(vSpd/6.4)*1.6)*(1-adsB*0.45)`（站定 1.0 / 冲刺 2.6，开镜打 55 折）。');
  console.log('✅ 插入准星/扩散');
}

// ④ 压缩
const subs = [
  ['；天花板用 `mesh`（`solidBox` 污染 OCC → 扔到场外）。', '；天花板用 `mesh`（`solidBox` 污染 OCC）。'],
  ['（`layout!==\'range\'`）—— 否则 `tent()` 的绿色篷布会搭进厅里。验证 `_tools/_range_probe.js`。',
   '（`layout!==\'range\'`），否则 `tent()` 篷布会搭进厅里。验证 `_tools/_range_probe.js`。'],
  ['→ 要补一条倒地渗血。⚠️ 血块层别加 `filter:blur()`。验证：`_tools/_screenfx_probe.js`。',
   '→ 要补倒地渗血。⚠️ 血块层别加 `filter:blur()`。'],
  ['；材质只 dispose 标了 `perSoldier` 的。⚠️ `BUILDS`/`MORTARS`/`MED_CRATES` 清不掉。', '；材质只 dispose 标了 `perSoldier` 的。'],
  ['**别逐把写 61 行**；**空数组 = 工坊不显示**。', '**别逐把写 61 行**；空数组 = 不显示。'],
  ['写死绝对值只对基地在 z=0 轴的地图成立，港口/机场会全错。', '写死绝对值只对基地在 z=0 轴的地图成立，港口/机场全错。']
];
for (const [a, b] of subs) sub(a, b, '压缩 ' + a.slice(0, 12));

const out = L.join('\n');
fs.writeFileSync(P, out, 'utf8');
const re = /^## .*$/gm; let m; const pos = [];
while ((m = re.exec(out))) pos.push(String(m.index).padStart(6) + '  ' + m[0].slice(0, 20));
console.log('\n总长 ' + out.length + ' 字符\n' + pos.slice(3, 7).join('\n'));
