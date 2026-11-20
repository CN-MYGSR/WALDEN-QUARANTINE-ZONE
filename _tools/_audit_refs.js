// 静态一致性体检: 找出「引用了不存在的元素 id」和「引用了已删除的符号」这两类隐患。
// 为什么重要:
//   · 31_touch 的 show()/setLbl()/setOn() 直接 `$(id).classList`, 元素不存在就**每帧抛 TypeError**
//     (之前删按钮时就踩过)。所以这三个函数引用的 id 必须全部存在于 index.html。
//   · el('xxx') 若没做 null 守卫, 元素缺失同样会抛。
// 用法: node _tools/_audit_refs.js
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'));
const jsSrc = jsFiles.map(f => ({ f, s: fs.readFileSync(path.join(ROOT, 'js', f), 'utf8') }));

// 动态创建的元素 id (运行时 appendChild 出来的), 白名单
const dynamicIds = new Set(['devCon', 'devConLog', 'devConRow', 'devConPrompt', 'devConInput', 'devConHint',
  'layoutBar', 'questHud', 'bagPanel', 'bagList', 'bagPanelStat', 'bagPanelHint', 'lootPanel', 'lootList',
  'lootHint', 'rebirthBtn', 'rebirthInfo', 'squadMarker', 'wbWeapon',
  // 37_meta.js 的战利品页签里运行时拼出来的按钮（调用处已有 if(el(...)) 守卫）
  'sellAllLoot']);

let bad = 0;

// ---- 1) 31_touch 的 show/setLbl/setOn 引用的 id ----
console.log('=== 1) 31_touch.js 里 show/setLbl/setOn 引用的 id ===');
const touch = (jsSrc.find(x => x.f === '31_touch.js') || {}).s || '';
const touchIds = new Set([...touch.matchAll(/(?:show|setLbl|setOn)\('([^']+)'/g)].map(m => m[1]));
const missTouch = [...touchIds].filter(id => !htmlIds.has(id));
console.log('  引用 ' + touchIds.size + ' 个: ' + [...touchIds].sort().join(' '));
if (missTouch.length) { console.log('  ❌ 不存在于 index.html: ' + missTouch.join(' ')); bad += missTouch.length; }
else console.log('  ✅ 全部存在');

// ---- 2) .tbtn 的 data-act 是否都有 case ----
console.log('');
console.log('=== 2) index.html 里 .tbtn 的 data-act 是否有对应 case ===');
const acts = [...html.matchAll(/id="(t[A-Za-z]+)"[^>]*data-act="([a-z]+)"/g)].map(m => [m[1], m[2]]);
const missAct = acts.filter(([id, a]) => !new RegExp("case '" + a + "'").test(touch));
console.log('  .tbtn 共 ' + acts.length + ' 个');
if (missAct.length) { console.log('  ❌ 缺 case: ' + JSON.stringify(missAct)); bad += missAct.length; }
else console.log('  ✅ 全部有 case');

// ---- 3) el('xxx') 引用但 index.html 没有的 id ----
console.log('');
console.log('=== 3) el(\'xxx\') 引用了但 index.html 里没有的 id ===');
const elIds = new Map(); // id -> [files]
for (const { f, s } of jsSrc) {
  for (const m of s.matchAll(/(?<![\w.])el\('([^']+)'\)/g)) {
    if (!elIds.has(m[1])) elIds.set(m[1], new Set());
    elIds.get(m[1]).add(f);
  }
}
const missEl = [...elIds.keys()].filter(id => !htmlIds.has(id) && !dynamicIds.has(id));
console.log('  el() 共引用 ' + elIds.size + ' 个 id');
if (missEl.length) {
  // 已知的"有意空缺": 元素已从 index.html 移除, JS 侧留着带 if(x) 守卫的空转。
  // 单独列出, 不算警告 —— 免得每次体检都刷一堆需要人工确认的噪音。
  const knownGaps = new Map([['deployMapName', '43_maps.js · 与地图简介重复, 槽位已移除; 保留是因为没有用户可见效果']]);
  const gaps = missEl.filter(id => knownGaps.has(id));
  const real = missEl.filter(id => !knownGaps.has(id));
  for (const id of gaps) console.log('  ℹ 已知空缺(有意): ' + id.padEnd(18) + knownGaps.get(id));
  if (real.length) {
    console.log('  ⚠ 以下 id 不在 index.html 也不在动态白名单 (需确认是否有 null 守卫):');
    for (const id of real.sort()) console.log('    ' + id.padEnd(22) + [...elIds.get(id)].join(', '));
  } else console.log('  ✅ 除已知空缺外全部存在');
} else console.log('  ✅ 全部存在');

// ---- 4) 已删除/改名的符号是否还有残留引用 ----
console.log('');
console.log('=== 4) 已删除符号的残留引用 ===');
// ⚠️ bestBagMedKey 已经从这份名单里拿掉 —— 它活在 40_raidshop.js:81，不是死符号。
const dead = ['nbk', 'tFireL', 'tSquad', 'tEat2', 'tHeal2', 'isUsecEnemy'];
for (const d of dead) {
  const hits = [];
  for (const { f, s } of jsSrc) {
    const re = new RegExp('(?<![\\w$])' + d + '(?![\\w$])', 'g');
    const n = (s.match(re) || []).length;
    if (n) hits.push(f + '×' + n);
  }
  console.log('  ' + d.padEnd(16) + (hits.length ? hits.join(' ') : '无引用 ✓'));
}
// nbk 单独再查 (作为字符串)
const nbkHits = jsSrc.filter(x => /'nbk'|"nbk"|nbk:/.test(x.s)).map(x => x.f);
console.log('  ' + "'nbk' 字面量".padEnd(14) + (nbkHits.length ? nbkHints = nbkHits.join(' ') : '无 ✓'));

console.log('');
console.log(bad ? '❌ 有 ' + bad + ' 处会导致运行时报错' : '✅ 没有会导致运行时报错的引用问题');
process.exit(bad ? 1 : 0);
