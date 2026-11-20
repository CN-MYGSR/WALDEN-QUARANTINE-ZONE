// MEMORY.md: 版本 + 靶场补「基地营区排除」教训 + 压缩
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

// ① 版本号
{
  const k = L.findIndex(l => l.startsWith('- **版本号 = `'));
  if (k < 0) { console.log('❌ 版本号'); process.exit(1); }
  L[k] = '- **版本号 = `20261030f`**（f=修靶场（帐篷搭进靶道/太黑/标牌/出生点/HUD）；e=室内靶场；d=二楼翻出+坠落伤害；c=屏幕边缘反馈。';
  L[k + 1] = '  上一批：`20260929b`=倒地/救援 / `20260929a`=枪托握把改装；更早见 REF）。';
  console.log('✅ 版本号 → 20261030f');
}

// ② 靶场条目补教训
sub('；天花板用 `mesh`（`solidBox` 污染 OCC → `findFreeSpawn` 扔到场外）。验证 `_tools/_range_probe.js`。',
    '；天花板用 `mesh`（`solidBox` 污染 OCC → 扔到场外）。' +
    '⚠️⚠️ **室内图必须加进 `buildWorld` 的「基地营区」排除列表**（`layout!==\'range\'`）—— 否则 `tent()` 的绿色篷布会搭进厅里。验证 `_tools/_range_probe.js`。',
    '靶场补教训');

// ③ 压缩
const subs = [
  ['⚠️ 血块层别加 `filter:blur()`（全屏滤镜手机上掉帧）。', '⚠️ 血块层别加 `filter:blur()`（手机上掉帧）。'],
  ['⚠️ `BUILDS`/`MORTARS`/`MED_CRATES` 的 mesh 挂 `world`、清不掉。', '⚠️ `BUILDS`/`MORTARS`/`MED_CRATES` 挂 `world`、清不掉。'],
  ['（事故：`portShed` 围栏飘到地图中央）', '（事故：`portShed` 围栏飘到中央）'],
  ['**必须在 `showDeploy()` 前调用**。', '**必须在 `showDeploy()` 前**。'],
  ['否则再调 `die()` 又被判「可倒地」→ **无限倒地**（探针抓到的真 bug）。', '否则再调 `die()` 又被判「可倒地」→ **无限倒地**。'],
  ['结算重算必然 false → 章节永不解锁（`escort` 例外）。', '结算重算必然 false → 章节永不解锁。']
];
for (const [a, b] of subs) sub(a, b, '压缩 ' + a.slice(0, 14));

const out = L.join('\n');
fs.writeFileSync(P, out, 'utf8');
const re = /^## .*$/gm; let m; const pos = [];
while ((m = re.exec(out))) pos.push(String(m.index).padStart(6) + '  ' + m[0].slice(0, 20));
console.log('\n总长 ' + out.length + ' 字符\n' + pos.slice(3, 7).join('\n'));
